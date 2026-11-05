"""Generate Chinese narration with an offline Kokoro model (sherpa-onnx),
build the timeline used by the renderer, synthesize a warm background loop,
and mix everything into build/audio_mix.wav.

Usage: python3 tools/tts.py <kokoro-model-dir> [sense-voice-dir]

Lines are synthesized a few sentences at a time so the model sees context,
then cut back into subtitle lines at the pauses (optionally verified with
SenseVoice ASR), re-spaced with varied pauses, and given EQ, a small room
and room tone so the voice sounds less "studio-dry".
"""
import json, re, sys, os
import numpy as np
import soundfile as sf
import sherpa_onnx

ROOT = os.environ.get("PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
SR = 44100
LEAD_IN, LINE_GAP, SCENE_TAIL = 0.45, 0.28, 0.75
CARD_LEAD = 1.9  # section title card shown before each section's narration

model_dir = sys.argv[1]
os.makedirs(os.path.join(BUILD, "lines"), exist_ok=True)

en_lex = set()
with open(f"{model_dir}/lexicon-us-en.txt", encoding="utf-8") as f:
    for line in f:
        en_lex.add(line.split(" ", 1)[0])

SPECIAL = {"verilog": "very log", "sel": "select", "we": "w e", "dout": "d out", "din": "d in", "addr": "address",
           "posedge": "pos edge", "negedge": "neg edge", "endmodule": "end module", "clk": "clock", "rst": "reset",
           "cnt": "count", "mem": "memory", "assign": "assign"}


def tts_text(s):
    """Make English tokens pronounceable: lexicon words lower-cased,
    unknown acronyms spelled letter by letter."""
    def fix(m):
        w = m.group(0)
        lw = w.lower()
        if lw in SPECIAL:
            return f" {SPECIAL[lw]} "
        if w.isupper() and len(w) <= 5:
            return " " + " ".join(lw) + " "
        if lw in en_lex:
            return f" {lw} "
        return " " + " ".join(lw) + " "
    return re.sub(r"[A-Za-z]+", fix, s)


def strip_markup(s):
    return s.replace("[[", "").replace("]]", "")


def resample(x, sr_from, sr_to):
    n = int(round(len(x) * sr_to / sr_from))
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


script = json.load(open(os.path.join(ROOT, "script.json"), encoding="utf-8"))
cfg = sherpa_onnx.OfflineTtsConfig(
    model=sherpa_onnx.OfflineTtsModelConfig(
        kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=f"{model_dir}/model.onnx", voices=f"{model_dir}/voices.bin",
            tokens=f"{model_dir}/tokens.txt", data_dir=f"{model_dir}/espeak-ng-data",
            dict_dir=f"{model_dir}/dict",
            lexicon=f"{model_dir}/lexicon-us-en.txt,{model_dir}/lexicon-zh.txt"),
        num_threads=os.cpu_count() or 4),
    rule_fsts=f"{model_dir}/phone-zh.fst,{model_dir}/date-zh.fst,{model_dir}/number-zh.fst")
tts = sherpa_onnx.OfflineTts(cfg)
sid, base_speed = script["voice"]["sid"], script["voice"]["speed"]
asr = None
if len(sys.argv) > 2:  # optional SenseVoice dir: verify every split line by speech recognition
    asr = sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=f"{sys.argv[2]}/model.int8.onnx", tokens=f"{sys.argv[2]}/tokens.txt", language="zh", use_itn=False, num_threads=4)

MAX_CHUNK_CHARS, MAX_CHUNK_LINES = 72, 3
FR = 0.01  # analysis frame (s)


def spoken_of(ln):
    return ln.get("s", strip_markup(ln["t"]))


def weight(text):
    """Rough spoken-length weight of a line (CJK chars count 1, latin letters less)."""
    cjk = len(re.findall(r"[一-鿿]", text))
    lat = len(re.findall(r"[A-Za-z]", text))
    return cjk + lat * 0.45 + 0.3


def synth(text, speed):
    a = tts.generate(tts_text(text), sid=sid, speed=speed)
    return np.asarray(a.samples, dtype=np.float32), a.sample_rate


def trim(x, sr):
    nz = np.where(np.abs(x) > 0.01)[0]
    if not len(nz):
        return x
    return x[max(0, nz[0] - int(.015 * sr)): nz[-1] + int(.06 * sr)]


def silences(x, sr):
    """Runs of low energy: list of (start_s, end_s)."""
    hop = int(FR * sr)
    e = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, len(x) - hop, hop)])
    quiet = e < max(0.004, 0.06 * np.percentile(e, 90))
    runs, st = [], None
    for i, q in enumerate(quiet):
        if q and st is None:
            st = i
        if not q and st is not None:
            if i - st >= 5:  # >= 50 ms
                runs.append((st * FR, i * FR))
            st = None
    return runs


def split_chunk(x, sr, texts):
    """Cut chunk audio into len(texts) pieces at the pauses closest to the expected boundaries."""
    if len(texts) == 1:
        return [trim(x, sr)]
    dur = len(x) / sr
    w = [weight(t) for t in texts]
    cum = np.cumsum(w)[:-1] / sum(w)
    runs = [r for r in silences(x, sr) if r[0] > 0.2 and r[1] < dur - 0.2]
    cuts, lo = [], 0.0
    for k, c in enumerate(cum):
        exp = c * dur
        cand = [r for r in runs if (r[0] + r[1]) / 2 > lo]
        if not cand:
            return None
        # prefer long pauses near the expected point
        best = min(cand, key=lambda r: abs((r[0] + r[1]) / 2 - exp) - 1.5 * (r[1] - r[0]))
        m = (best[0] + best[1]) / 2
        cuts.append(m); lo = best[1]
    edges = [0] + [int(c * sr) for c in cuts] + [len(x)]
    return [trim(x[edges[i]:edges[i + 1]], sr) for i in range(len(texts))]


def similar(a, b):
    import difflib
    norm = lambda s: re.sub(r"[^一-鿿A-Za-z0-9]", "", s).lower()
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def check(seg, sr, text):
    if asr is None:
        return 1.0
    st = asr.create_stream(); st.accept_waveform(sr, seg); asr.decode_stream(st)
    return similar(st.result.text, text)


def pause_after(text, k, last_in_scene):
    """Varied, punctuation-aware pause (s) after a line."""
    end = text.rstrip()[-1:]
    j = (hash_det(k) - .5) * 0.12
    if last_in_scene:
        return 0
    if end in "？?":
        return 0.52 + j
    if end in "，,：:；;":
        return 0.20 + j * .5
    return 0.38 + j


def hash_det(n):
    v = np.sin(n * 127.1 + 311.7) * 43758.5453
    return v - np.floor(v)


def chunks_of(lines):
    out, cur, n = [], [], 0
    for i, ln in enumerate(lines):
        L = len(spoken_of(ln))
        if cur and (n + L > MAX_CHUNK_CHARS or len(cur) >= MAX_CHUNK_LINES):
            out.append(cur); cur, n = [], 0
        cur.append(i); n += L
    if cur:
        out.append(cur)
    return out


timeline = {"scenes": [], "size": script.get("size", [1080, 1920]), "output": script.get("output", "digital_system_design_douyin.mp4"), "crf": script.get("crf", 19)}
clips = []  # (start_sec, samples)
t = 0.0
k_glob = 0
for si, sc in enumerate(script["scenes"]):
    last_scene = si == len(script["scenes"]) - 1
    speed = base_speed * (1 + (hash_det(si + 7) - .5) * 0.05)  # slight per-section tempo variation
    lead = LEAD_IN if sc["id"] == "hook" else CARD_LEAD
    scene = {**{k: v for k, v in sc.items() if k != "lines"}, "q": sc.get("q", ""), "lead": lead, "start": t, "lines": []}
    segs = [None] * len(sc["lines"])
    for grp in chunks_of(sc["lines"]):
        texts = [spoken_of(sc["lines"][i]) for i in grp]
        x, sr = synth("".join(texts), speed)
        parts = split_chunk(x, sr, texts)
        ok = parts is not None and all(len(p) > .3 * sr for p in parts)
        if ok and asr is not None:
            scores = [check(p, sr, tx) for p, tx in zip(parts, texts)]
            ok = min(scores) >= 0.6
            print("   asr", [round(v, 2) for v in scores])
        if not ok:  # fall back to line-by-line synthesis for this chunk
            print("   fallback ->", grp)
            parts = []
            for tx in texts:
                y, sr = synth(tx, speed)
                parts.append(trim(y, sr))
        for i, p in zip(grp, parts):
            segs[i] = resample(p, sr, SR)
    cur = t + lead
    for i, (ln, x) in enumerate(zip(sc["lines"], segs)):
        dur = len(x) / SR
        clips.append((cur, x))
        scene["lines"].append({**{k: v for k, v in ln.items() if k not in ("t", "s")}, "text": ln["t"], "start": round(cur, 3), "end": round(cur + dur, 3)})
        print(f"{sc['id']:9s} {i} {dur:5.2f}s  {spoken_of(ln)}")
        cur += dur + pause_after(spoken_of(ln), k_glob, i == len(sc["lines"]) - 1)
        k_glob += 1
    end = cur + (2.6 if last_scene else SCENE_TAIL)
    scene["end"] = round(end, 3)
    scene["start"] = round(scene["start"], 3)
    timeline["scenes"].append(scene)
    t = end

total = t + 0.3
timeline["duration"] = round(total, 3)
json.dump(timeline, open(os.path.join(BUILD, "timeline.json"), "w"), ensure_ascii=False, indent=1)

# ---- narration track
N = int(total * SR) + SR
voice = np.zeros(N, dtype=np.float32)
for st, x in clips:
    i = int(st * SR)
    voice[i:i + len(x)] += x

# ---- de-"studio" the voice: EQ, a small room, and a constant room tone
from scipy import signal
from scipy.ndimage import uniform_filter1d
sos_hp = signal.butter(2, 85, "highpass", fs=SR, output="sos")
sos_lp = signal.butter(2, 9500, "lowpass", fs=SR, output="sos")
voice = signal.sosfilt(sos_hp, voice)
voice = 0.82 * voice + 0.18 * signal.sosfilt(sos_lp, voice)  # soften the brittle top end
low = signal.sosfilt(signal.butter(2, [150, 400], "bandpass", fs=SR, output="sos"), voice)
voice = voice + 0.22 * low  # a little chest warmth
rng = np.random.default_rng(3)
ir_len = int(0.32 * SR)
ir = rng.standard_normal(ir_len) * np.exp(-np.arange(ir_len) / SR * 18) * 0.012
ir[0] = 1.0
for d_ms, g in ((11, .10), (17, .07), (23, .05)):  # early reflections of a small room
    ir[int(d_ms / 1000 * SR)] += g
voice = signal.fftconvolve(voice, ir)[:N].astype(np.float32)
peak = np.max(np.abs(voice)) or 1
voice = voice / peak * 0.89
white = rng.standard_normal(N).astype(np.float32)
pink = signal.lfilter([0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400], white)
pink = signal.sosfilt(signal.butter(2, 6000, "lowpass", fs=SR, output="sos"), pink)
pink = pink / (np.sqrt(np.mean(pink ** 2)) or 1) * 10 ** (-56 / 20)  # room tone ~ -56 dBFS rms
voice = (voice + pink).astype(np.float32)

# ---- background music: warm lo-fi loop (I–V–vi–IV in C), generated procedurally
def note(f, dur, kind="pad"):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    if kind == "pad":
        w = sum(np.sin(2 * np.pi * f * k * tt * (1 + 0.0015 * k)) / k ** 1.6 for k in range(1, 5))
        env = np.minimum(1, tt / 0.35) * np.minimum(1, (dur - tt) / 0.5)
    else:  # pluck
        w = np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt)
        env = np.exp(-tt * 6) * np.minimum(1, tt / 0.005)
    return (w * env).astype(np.float32)

def midi(m):
    return 440 * 2 ** ((m - 69) / 12)

bpm = 92
beat = 60 / bpm
bar = 4 * beat
chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]
arp = [0, 1, 2, 1, 2, 1, 0, 2]
music = np.zeros(N, dtype=np.float32)
nbars = int(total / bar) + 2
rng = np.random.default_rng(7)
for b in range(nbars):
    ch = chords[b % 4]
    s0 = int(b * bar * SR)
    if s0 >= N:
        break
    for m in ch:
        p = note(midi(m - 12), bar + 0.4, "pad") * 0.10
        e = min(N, s0 + len(p)); music[s0:e] += p[:e - s0]
    bass = note(midi(ch[0] - 24), bar, "pad") * 0.14
    e = min(N, s0 + len(bass)); music[s0:e] += bass[:e - s0]
    for k in range(8):
        m = ch[arp[k]] + 12
        p = note(midi(m), beat * 0.9, "pluck") * 0.06
        st = s0 + int(k * beat / 2 * SR)
        e = min(N, st + len(p));
        if st < N: music[st:e] += p[:e - st]
    # soft shaker
    for k in range(8):
        st = s0 + int((k * beat / 2 + beat / 4) * SR)
        n = int(0.05 * SR)
        h = rng.standard_normal(n).astype(np.float32) * np.exp(-np.arange(n) / SR * 80) * 0.012
        h = np.diff(h, prepend=0)
        e = min(N, st + n)
        if st < N: music[st:e] += h[:e - st]
music /= (np.max(np.abs(music)) or 1)

# duck music under narration
env = np.abs(voice)
win = int(0.25 * SR)
env = uniform_filter1d(env, win)  # moving average (O(N), unlike np.convolve)
duck = np.where(env > 0.01, 0.10, 0.18).astype(np.float32)
duck = uniform_filter1d(duck, win)
fade = np.ones(N, dtype=np.float32)
fi, fo = int(1.0 * SR), int(2.0 * SR)
fade[:fi] = np.linspace(0, 1, fi)
end_i = int(total * SR)
fade[end_i - fo:end_i] = np.linspace(1, 0, fo)
fade[end_i:] = 0
mix = voice + music * duck * fade
mix = mix[:end_i]
mix /= max(1.0, np.max(np.abs(mix)) / 0.95)
sf.write(os.path.join(BUILD, "audio_mix.wav"), mix, SR)
sf.write(os.path.join(BUILD, "narration.wav"), voice[:end_i], SR)
print("total duration", round(total, 2))
