"""Generate Chinese narration with an offline Kokoro model (sherpa-onnx),
build the timeline used by the renderer, synthesize a warm background loop,
and mix everything into build/audio_mix.wav.

Usage: python3 tools/tts.py <kokoro-model-dir>
"""
import json, re, sys, os
import numpy as np
import soundfile as sf
import sherpa_onnx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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

SPECIAL = {"verilog": "very log", "sel": "sell", "we": "we"}


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
sid, speed = script["voice"]["sid"], script["voice"]["speed"]

timeline = {"scenes": []}
clips = []  # (start_sec, samples)
t = 0.0
for sc in script["scenes"]:
    lead = LEAD_IN if sc["id"] == "hook" else CARD_LEAD
    scene = {"id": sc["id"], "chip": sc["chip"], "q": sc.get("q", ""), "lead": lead, "start": t, "lines": []}
    cur = t + lead
    for i, ln in enumerate(sc["lines"]):
        spoken = tts_text(ln.get("s", strip_markup(ln["t"])))
        a = tts.generate(spoken, sid=sid, speed=speed)
        x = np.asarray(a.samples, dtype=np.float32)
        # trim leading/trailing near-silence
        nz = np.where(np.abs(x) > 0.01)[0]
        if len(nz):
            x = x[max(0, nz[0] - 400): nz[-1] + 1600]
        x = resample(x, a.sample_rate, SR)
        dur = len(x) / SR
        clips.append((cur, x))
        scene["lines"].append({"text": ln["t"], "start": round(cur, 3), "end": round(cur + dur, 3)})
        print(f"{sc['id']:9s} {i} {dur:5.2f}s  {spoken}")
        cur += dur + LINE_GAP
    end = cur - LINE_GAP + SCENE_TAIL
    scene["end"] = round(end, 3)
    scene["start"] = round(scene["start"], 3)
    timeline["scenes"].append(scene)
    t = end

total = t + 0.6
timeline["duration"] = round(total, 3)
json.dump(timeline, open(os.path.join(BUILD, "timeline.json"), "w"), ensure_ascii=False, indent=1)

# ---- narration track
N = int(total * SR) + SR
voice = np.zeros(N, dtype=np.float32)
for st, x in clips:
    i = int(st * SR)
    voice[i:i + len(x)] += x
peak = np.max(np.abs(voice)) or 1
voice = voice / peak * 0.89

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
env = np.convolve(env, np.ones(win) / win, mode="same")
duck = np.where(env > 0.01, 0.10, 0.18).astype(np.float32)
duck = np.convolve(duck, np.ones(win) / win, mode="same")
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
