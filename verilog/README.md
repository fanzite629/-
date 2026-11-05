# Verilog 程序详解（横屏讲解视频）

A 1920×1080 landscape lecture video (8 min 38 s) that walks through the Verilog programs from section 8.4 of
**第 8 章 数字系统设计基础**, explaining them line by line.

**Video:** [`output/verilog_explained.mp4`](output/verilog_explained.mp4)

## Layout

- **Left:** the Verilog source, with the line being explained highlighted and the view auto-scrolled to it.
- **Right:** a live visualization of that code: circuit, waveform, truth table, block diagram or memory grid.
- **Below it:** a key-point card summarizing the current line.
- **Bottom:** Chinese subtitles matching the voice-over.

## Sections

开篇 · 01 module · 02 assign and operators · 03 gate primitives · 04 bit widths and constants, wire/reg ·
05 2-to-1 MUX (`? :`) · 06 `always @(*)` + `case` · 07 decoder/encoder, `default` · 08 comparator, `if-else`, latches ·
09 D flip-flop, `posedge`/`negedge`, async reset · 10 enable, JK, T flip-flops, `{}` concatenation · 11 counter ·
12 shift register · 13 blocking `=` vs non-blocking `<=` · 14 module instantiation · 15 `parameter` · 16 RAM · 总结

## Rebuild

Uses the shared tools in `../video/tools` (see `../video/README.md` for setup):

```bash
cd verilog
PROJECT_DIR=$PWD python3 ../video/tools/tts.py <kokoro-model-dir> <sense-voice-dir>
PROJECT_DIR=$PWD node ../video/tools/render.js video --workers 4
```
