# 3 分钟看懂数字系统设计（抖音竖屏科普视频）

A vertical (1080×1920, 30 fps) **science-explainer (科普) short video** for Douyin, based on the textbook chapter
**第 8 章 数字系统设计基础**. It has Chinese voice-over, burned-in subtitles, a **blue tech color theme**,
a "PART 0X + guiding question" title card before each section, and interactive-style demos.

**Final video:** [`output/digital_system_design_douyin.mp4`](output/digital_system_design_douyin.mp4)

## Contents (15 sections, about 5 min 10 s)

| # | Section | Demo |
|---|------|----------|
| 开场 | "你知道吗？" Chips are "written" in code | Flickering chip switches, tangled wires get crossed out, code types itself |
| 01 | What is a digital system | 0/1 flip with a light bulb; noisy waveform still decodes correctly |
| 02 | The five main parts | Factory analogy: datapath, control unit, memory, I/O, clock and reset |
| 03 | Combinational vs. sequential | Calculator (no memory) vs. elevator (has memory) |
| 04 | Design flow | 7-step pipeline: test fails, then iterate |
| 05 | Top-down / bottom-up | Digital-clock module tree; building-block stacking |
| 06 | Three description styles | Structural, dataflow, behavioral, switched by tabs |
| 07 | Hands-on: logic gates | Finger taps the a/b switches; AND/OR/XOR with LED and truth table |
| 08 | Hands-on: 2-to-1 MUX | Railway-switch animation; `sel` toggle switches the data stream |
| 09 | RTL and D flip-flop | Simulator waveform: q updates only on the rising clock edge |
| 10 | Counter and shift register | 4-bit count 0000 to 1111 and wrap-around; bits shift left one by one |
| 11 | Parameterization and hierarchy | Drag the WIDTH slider 8 to 16; module instances assembled like blocks |
| 12 | RAM | 16×8 memory write/read and Block RAM mapping |
| 13 | Engineering habits | Synchronous design, synthesizable code, engineering practice |
| 本期回顾 | Summary and call to action | Like, save, follow |

## How it is made

```
script.json ──► tools/tts.py ──► build/timeline.json + build/audio_mix.wav
                                        │
scenes/ (HTML/CSS/JS, every frame is a pure function of t)
                                        ▼
                   tools/render.js (Playwright screenshots → ffmpeg)
                                        ▼
                     output/digital_system_design_douyin.mp4
```

- **Voice-over**: offline TTS with [Kokoro v1.1-zh](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models)
  (sherpa-onnx). Each line of the script is synthesized separately, and its measured length drives the timing of the subtitles and animations, so voice, subtitles and visuals stay in sync.
- **Background music**: a warm lo-fi loop generated procedurally with numpy (no copyright issues). It ducks automatically while the narrator speaks.
- **Visuals**: `scenes/index.html` + `style.css` + `scenes.js`. `window.renderFrame(t)` is deterministic, so rendering is frame-accurate.

## Rebuilding

```bash
cd video
npm install                       # fonts (@fontsource) ; Playwright/Chromium must be available
pip install sherpa-onnx soundfile numpy
# download and unpack the TTS model
curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_1.tar.bz2
tar xjf kokoro-multi-lang-v1_1.tar.bz2
python3 tools/tts.py ./kokoro-multi-lang-v1_1          # narration + timeline + music
node tools/render.js preview 5 30 160                  # optional: preview frames → build/preview/
node tools/render.js video --workers 4                 # full render → output/
```

To change the narration, edit `script.json`: `t` is the subtitle text (`[[...]]` marks highlighted keywords) and `s` is an optional pronunciation override for the TTS.
