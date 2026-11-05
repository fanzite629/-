/* Verilog lecture renderer (1920x1080). Every frame is a pure function of t:
   the capture script calls window.renderFrame(t) and takes a screenshot. */
'use strict';
const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const backOut = (x) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const prog = (t, a, d = .5) => clamp((t - a) / d);
const pulse = (t, period, sharp = 6) => { const p = ((t % period) + period) % period / period; return Math.exp(-p * sharp); };
const setText = (el, s) => { s = String(s); if (el._t !== s) { el._t = s; el.textContent = s; } };
const setHTML = (el, s) => { if (el._h !== s) { el._h = s; el.innerHTML = s; } };
const setCls = (el, c, on) => el.classList.toggle(c, !!on);
const NS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs = {}, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function el(tag, cls, parent, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
function pos(e, x, y) { e.style.left = x + 'px'; e.style.top = y + 'px'; return e; }
function pose(e, { o = 1, x = 0, y = 0, s = 1 } = {}) { e.style.opacity = o; e.style.transform = `translate(${x}px,${y}px) scale(${s})`; }
function vis(e, t, a, b = 1e9, { dy = 30, ds = .9, din = .45, dout = .3, dx = 0 } = {}) {
  const pi = prog(t, a, din), po = prog(t, b, dout);
  const o = easeOut(pi) * (1 - ease(po));
  pose(e, { o, x: (1 - easeOut(pi)) * dx, y: (1 - easeOut(pi)) * dy, s: lerp(ds, 1, backOut(pi)) });
  e.style.visibility = o < .002 ? 'hidden' : 'visible';
  return o;
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- Verilog highlighter: returns HTML per line ---------- */
const RE = /(\/\/[^\n]*)|(\b(?:module|endmodule|input|output|reg|wire|assign|always|posedge|negedge|begin|end|if|else|case|endcase|default|parameter|or|and)\b)|(\d+'[bhd][0-9A-Fa-f]+|\b\d+\b)|(<=|==|[&|^~?:=+@!<>#-])/g;
function hlLine(line) {
  let out = '', last = 0, m; RE.lastIndex = 0;
  while ((m = RE.exec(line))) {
    out += esc(line.slice(last, m.index));
    if (m[1]) out += `<span class="cm">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="kw">${m[2]}</span>`;
    else if (m[3]) out += `<span class="num">${esc(m[3])}</span>`;
    else out += `<span class="op">${esc(m[4])}</span>`;
    last = RE.lastIndex;
  }
  return out + esc(line.slice(last));
}

/* ---------- code panel ---------- */
const LH = 42, VIEW_H = 740 - 66 - 16;
const codeLines = $('codeLines'), codeScroll = $('codeScroll'), hlMark = $('hlMark');
function renderCode(code) {
  if (codeLines._c === code) return;
  codeLines._c = code;
  codeLines.innerHTML = code.split('\n').map((l, i) => `<div class="cl"><span class="no">${i + 1}</span>${hlLine(l) || ' '}</div>`).join('');
  const m = code.match(/module\s+(\w+)/);
  setText($('fileName'), m ? m[1] + '.v' : 'example.v');
}
const normHL = (h) => !h ? [] : (Array.isArray(h[0]) ? h : (h.length === 1 ? [[h[0], h[0]]] : [[h[0], h[1]]]));
function scrollFor(code, ranges) {
  const n = code.split('\n').length, total = n * LH + 16;
  if (total <= VIEW_H || !ranges.length) return 0;
  const a = ranges[0][0], b = ranges[ranges.length - 1][1];
  const mid = ((a - 1) + b) / 2 * LH;
  return clamp(mid - VIEW_H / 2, 0, total - VIEW_H);
}
function applyCode(code, ranges, prevRanges, prevScroll, p, codeFade) {
  renderCode(code);
  const rows = codeLines.children;
  const inR = (i) => ranges.some(([a, b]) => i + 1 >= a && i + 1 <= b);
  for (let i = 0; i < rows.length; i++) {
    const on = inR(i);
    setCls(rows[i], 'on', on); setCls(rows[i], 'dim', ranges.length && !on); setCls(rows[i], 'on2', on && ranges.length > 1);
  }
  const sc = scrollFor(code, ranges);
  const s = lerp(prevScroll == null ? sc : prevScroll, sc, ease(p));
  codeScroll.style.transform = `translateY(${-s}px)`;
  codeLines.style.opacity = codeFade;
  if (ranges.length === 1) {
    const [a, b] = ranges[0];
    const pr = prevRanges && prevRanges.length === 1 ? prevRanges[0] : [a, b];
    const top = lerp((pr[0] - 1) * LH, (a - 1) * LH, ease(p * 1.4)), h = lerp((pr[1] - pr[0] + 1) * LH, (b - a + 1) * LH, ease(p * 1.4));
    hlMark.style.top = top + 'px'; hlMark.style.height = h + 'px'; hlMark.style.opacity = 1;
  } else hlMark.style.opacity = 0;
}

/* ---------- finger (coords inside the viz card) ---------- */
const VX = 1120, VY = 160;
function fingerAt(t, path, hold = .8) {
  const f = $('finger'), r = $('ripple');
  if (!path || !path.length) { f.style.opacity = 0; r.style.opacity = 0; return; }
  const first = path[0][0], last = path[path.length - 1][0];
  if (t < first - .6 || t > last + hold + .3) { f.style.opacity = 0; r.style.opacity = 0; return; }
  let x, y; const cur = path.findIndex((p) => t < p[0]);
  if (cur > 0) { const a = path[cur - 1], b = path[cur]; const p = ease(prog(t, b[0] - .45, .45)); x = lerp(a[1], b[1], p); y = lerp(a[2], b[2], p); }
  else if (cur === 0) { const p = ease(prog(t, first - .6, .6)); x = lerp(path[0][1] + 90, path[0][1], p); y = lerp(path[0][2] + 140, path[0][2], p); }
  else { x = path[path.length - 1][1]; y = path[path.length - 1][2]; }
  let press = 0, rip = -1;
  for (const p of path) { const d = t - p[0]; if (d > -.12 && d < .2) press = Math.max(press, 1 - Math.abs(d - .02) / .18); if (d >= 0 && d < .5) rip = d / .5; }
  const o = Math.min(prog(t, first - .6, .3), 1 - prog(t, last + hold, .3));
  f.style.opacity = o; f.style.transform = `translate(${VX + x - 38}px,${VY + y - 6}px) scale(${1 - .14 * press})`;
  if (rip >= 0) { r.style.left = (VX + x) + 'px'; r.style.top = (VY + y) + 'px'; r.style.opacity = (1 - rip) * o; r.style.transform = `scale(${.3 + rip})`; } else r.style.opacity = 0;
}

/* ---------- reusable widgets ---------- */
function toggle(host, x, y) { const t = pos(el('div', 'toggle', host, '<div class="knob"></div><span class="tv">0</span>'), x, y); t.set = (v) => { setCls(t, 'on', v); setText(t.querySelector('.tv'), v); }; return t; }
function led(host, x, y, label) { const l = pos(el('div', 'led', host, label), x, y); l.set = (v) => setCls(l, 'on', v); return l; }
function cells(host, x, y, n, labels) {
  const c = pos(el('div', 'cells', host), x, y); const arr = [];
  for (let i = 0; i < n; i++) arr.push(el('div', 'bc', c, `<span></span><small>${labels ? labels[i] : ''}</small>`));
  c.set = (bits) => arr.forEach((e, i) => { setText(e.firstChild, bits[i]); setCls(e, 'one', bits[i] == 1); });
  c.items = arr; return c;
}
/* waveform: signals [{name, kind:'clk'|'in'|'out', bus, fn(u)}], u in clock cycles; clk rises at k+.5 */
function wave(svg, { x0 = 110, x1 = 710, y0 = 60, row = 90, cycles = 8, signals }) {
  const sx = (u) => x0 + (u / cycles) * (x1 - x0);
  const clip = 'cl' + Math.random().toString(36).slice(2, 8);
  const defs = sv('defs', {}, svg); const cp = sv('clipPath', { id: clip }, defs); const rect = sv('rect', { x: 0, y: 0, width: 0, height: 1000 }, cp);
  const edges = []; for (let e = .5; e < cycles; e += 1) edges.push(sv('line', { x1: sx(e), x2: sx(e), y1: y0 - 20, y2: y0 + row * signals.length - 30, class: 'edge' }, svg));
  signals.forEach((s, r) => {
    const top = y0 + r * row, hi = top, lo = top + 46;
    sv('text', { x: 14, y: top + 34, class: 'sig-t' }, svg).textContent = s.name;
    const g = sv('g', s.kind === 'out' ? { 'clip-path': `url(#${clip})` } : {}, svg);
    if (!s.bus) {
      let d = '', prev = null;
      for (let u = 0; u <= cycles + 1e-6; u += .01) { const v = s.fn(Math.min(u, cycles - 1e-6)) ? 1 : 0; const yy = v ? hi : lo; const x = sx(u); if (prev === null) d += `M${x} ${yy}`; else if (v !== prev) d += `L${x} ${prev ? hi : lo}L${x} ${yy}`; prev = v; }
      d += `L${sx(cycles)} ${prev ? hi : lo}`;
      sv('path', { d, class: 'wf ' + s.kind }, g);
    } else {
      let segStart = 0, prev = s.fn(0);
      const seg = (a, b, v) => { const xa = sx(a), xb = sx(b), m = (hi + lo) / 2; sv('path', { d: `M${xa + 5} ${hi}L${xb - 5} ${hi}L${xb} ${m}L${xb - 5} ${lo}L${xa + 5} ${lo}L${xa} ${m}Z`, class: 'bus' }, g); if (xb - xa > 18) sv('text', { x: (xa + xb) / 2, y: m + 8, class: 'bus-t' }, g).textContent = v; };
      for (let u = .01; u <= cycles + 1e-6; u += .01) { const v = s.fn(Math.min(u, cycles - 1e-6)); if (v !== prev || u >= cycles - 1e-6) { seg(segStart, u, prev); segStart = u; prev = v; } }
    }
  });
  const cur = sv('line', { y1: y0 - 24, y2: y0 + row * signals.length - 26, class: 'cursor' }, svg);
  return { set(u) { const x = sx(u); cur.setAttribute('x1', x); cur.setAttribute('x2', x); rect.setAttribute('width', x); edges.forEach((e, i) => setCls(e, 'hit', u >= i + .5 && u - (i + .5) < .3)); } };
}
/* step-simulate a sequential signal on a fine grid */
function simulate(cycles, stepFn) { const arr = []; let s = stepFn.init; for (let i = 0; i <= cycles * 100; i++) { const u = i / 100; s = stepFn.step(s, u); arr.push(s); } return (u) => arr[clamp(Math.floor(u * 100), 0, arr.length - 1)]; }
const isEdge = (u) => { const f = u - Math.floor(u); return Math.abs(f - .5) < .005; };
const clkF = (u) => ((u % 1) >= .5 ? 1 : 0);
function gateShapes(g) {
  return {
    and: sv('path', { d: 'M10,10 H120 A150,150 0 0 1 120,310 H10 Z', class: 'gate' }, g),
    or: sv('path', { d: 'M10,10 Q90,160 10,310 Q190,310 270,160 Q190,10 10,10 Z', class: 'gate' }, g),
    x: sv('path', { d: 'M-22,10 Q58,160 -22,310', class: 'gate-x' }, g),
    t: Object.assign(sv('text', { x: 130, y: 182, class: 'gate-t' }, g), {}),
  };
}

/* ===================================================================== */
const V = {};
const vizHost = $('vizHost');
function vizBox(name) { const d = el('div', 'viz', vizHost); d.dataset.name = name; return d; }

V.intro = () => {
  const box = vizBox('intro');
  const svg = sv('svg', { width: 740, height: 500 }, box);
  const g1 = sv('g', {}, svg);
  const code = sv('foreignObject', { x: 30, y: 180, width: 300, height: 120 }, g1);
  code.innerHTML = '<div xmlns="http://www.w3.org/1999/xhtml" style="font-family:JetBrains Mono;font-weight:700;font-size:26px;color:#dce9ff;background:#050f22;border:2px solid #24427a;border-radius:16px;padding:22px 18px">assign y =<br/>&#160;&#160;a &amp; b;</div>';
  const arrow = sv('text', { x: 362, y: 262, class: 'lbl c', style: 'font-size:60px;fill:#35c2ff' }, g1); arrow.textContent = '➜';
  const gg = sv('g', { transform: 'translate(440,150) scale(.62)' }, g1); const gs = gateShapes(gg); gs.or.style.opacity = 0; gs.x.style.opacity = 0; gs.t.textContent = '&';
  sv('path', { d: 'M400 200 L446 200 M400 300 L446 300 M613 249 L690 249', class: 'wire on' }, g1);
  const g2 = el('div', '', box); g2.style.cssText = 'position:absolute;inset:0';
  const sw = pos(el('div', 'pill', g2, '💻 软件：按顺序'), 40, 40), hw = pos(el('div', 'pill', g2, '🔌 电路：同时工作'), 390, 40);
  const sbox = [0, 1, 2].map((i) => pos(el('div', 'stepbox', g2, `第 ${i + 1} 步`), 90, 130 + i * 110));
  const hbox = ['与门', '计数器', '寄存器'].map((n, i) => pos(el('div', 'stepbox', g2, n), 460, 130 + i * 110));
  return { el: box, update(t, L) {
    const showPar = t >= L[2] - .1 && t < L[3] - .1;
    vis(g1, t, L[0] + .2, L[2] - .1, { dy: 0 }); if (t >= L[3] - .1) vis(g1, t, L[3] - .1, 1e9, { dy: 0 });
    g2.style.opacity = showPar ? easeOut(prog(t, L[2] - .1, .4)) * (1 - prog(t, L[3] - .3, .3)) : 0;
    const k = Math.floor((t - L[2]) / .7) % 3;
    sbox.forEach((b, i) => setCls(b, 'on', showPar && i === k));
    hbox.forEach((b) => setCls(b, 'on', showPar && pulse(t, .7, 4) > .3));
    sw.style.opacity = hw.style.opacity = 1;
    g1.style.filter = t > L[3] ? `drop-shadow(0 0 ${10 + 10 * pulse(t, 1.2)}px rgba(120,220,255,.6))` : '';
  } };
};

V.ports = () => {
  const box = vizBox('ports');
  const svg = sv('svg', { width: 740, height: 500 }, box);
  const body = sv('rect', { x: 250, y: 120, width: 240, height: 260, rx: 24, class: 'blk' }, svg);
  const name = sv('text', { x: 370, y: 262, class: 'blk-t' }, svg); name.textContent = 'and_gate';
  const ins = ['a', 'b'].map((n, i) => { const y = 190 + i * 120; const w = sv('path', { d: `M90 ${y} L250 ${y}`, class: 'wire' }, svg); const tx = sv('text', { x: 50, y: y + 12, class: 'lbl' }, svg); tx.textContent = n; const tg = sv('text', { x: 170, y: y - 18, class: 'lbl c', style: 'font-size:22px;fill:#7f9cc7' }, svg); tg.textContent = 'input'; return [w, tx, tg]; });
  const ow = sv('path', { d: 'M490 250 L650 250', class: 'wire' }, svg); const ot = sv('text', { x: 666, y: 262, class: 'lbl' }, svg); ot.textContent = 'y';
  const otg = sv('text', { x: 570, y: 232, class: 'lbl c', style: 'font-size:22px;fill:#7f9cc7' }, svg); otg.textContent = 'output';
  const endm = sv('text', { x: 370, y: 430, class: 'lbl c', style: 'font-size:26px;fill:#5aa9ff' }, svg); endm.textContent = 'module … endmodule';
  return { el: box, update(t, L) {
    vis(body, t, L[0] + .2); vis(name, t, L[1]); body.style.transformOrigin = '370px 250px'; name.style.transformOrigin = '370px 250px';
    ins.forEach((arr, i) => arr.forEach((e) => { e.style.opacity = easeOut(prog(t, L[2] + i * .5, .4)); }));
    [ow, ot, otg].forEach((e) => { e.style.opacity = easeOut(prog(t, L[2] + 1.6, .4)); });
    const lit = t > L[3] && t < L[4];
    [...svg.querySelectorAll('.wire')].forEach((w) => setCls(w, 'on', lit && pulse(t, 1, 3) > .2));
    setCls(body, 'on', lit || t > L[4]);
    endm.style.opacity = easeOut(prog(t, L[4], .4));
  } };
};

V.gate = () => {
  const box = vizBox('gate');
  const svg = sv('svg', { width: 740, height: 360, style: 'position:absolute;left:0;top:0' }, box);
  const wa = sv('path', { d: 'M190 150 L262 150', class: 'wire' }, svg), wb = sv('path', { d: 'M190 270 L262 270', class: 'wire' }, svg), wy = sv('path', { d: 'M455 210 L540 210', class: 'wire' }, svg);
  const gg = sv('g', { transform: 'translate(250,90) scale(.75)' }, svg); const gs = gateShapes(gg);
  pos(el('div', 'vlab', box, 'a'), 22, 124); pos(el('div', 'vlab', box, 'b'), 22, 244);
  const ta = toggle(box, 60, 117), tb = toggle(box, 60, 237); const ly = led(box, 540, 155, 'y');
  const tt = pos(el('div', 'tt', box), 52, 382); const rows = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => ({ a, b, r: el('div', 'row', tt, `<span>${a} ${b}</span><b></b>`) }));
  const ops = el('div', '', box); ops.style.cssText = 'position:absolute;inset:0;background:rgba(5,15,34,.94);border-radius:26px';
  const opItems = [['&', '与 AND'], ['|', '或 OR'], ['~', '非 NOT'], ['^', '异或 XOR']].map(([s, n], i) => pos(el('div', 'pill', ops, `<span class="mono" style="font-size:44px">${s}</span>&#160;&#160;${n}`), 60 + (i % 2) * 330, 130 + Math.floor(i / 2) * 150));
  const F = { and: (a, b) => a & b, xor: (a, b) => a ^ b };
  return { el: box, update(t, L) {
    const type = t >= L[4] ? 'xor' : 'and';
    const taps = [[L[3] + .5, 'a', 1], [L[3] + 1.5, 'b', 1], [L[4] + 1.6, 'b', 0]];
    let a = 0, b = 0; for (const [tm, w, v] of taps) if (t >= tm) { if (w === 'a') a = v; else b = v; }
    const y = F[type](a, b);
    gs.or.style.opacity = type === 'xor' ? 1 : 0; gs.x.style.opacity = type === 'xor' ? 1 : 0; gs.and.style.opacity = type === 'xor' ? 0 : 1;
    gs.t.textContent = type === 'xor' ? '=1' : '&'; gs.t.setAttribute('x', type === 'xor' ? 120 : 130);
    ta.set(a); tb.set(b); ly.set(y); setCls(wa, 'on', a); setCls(wb, 'on', b); setCls(wy, 'on', y);
    rows.forEach(({ a: ra, b: rb, r }) => { const o = F[type](ra, rb); const bb = r.querySelector('b'); setText(bb, o); setCls(bb, 'one', o); setCls(r, 'cur', ra === a && rb === b); });
    ops.style.opacity = (t >= L[2] - .1 && t < L[3]) ? easeOut(prog(t, L[2] - .1, .35)) * (1 - prog(t, L[3] - .3, .3)) : 0;
    const k = Math.floor((t - L[2] - .3) / 1.0); opItems.forEach((p, i) => setCls(p, 'hot', k === i || (k >= 4 && i === 0)));
    fingerAt(t, taps.map(([tm, w]) => [tm, 125, w === 'a' ? 150 : 270, 1]), .6);
  } };
};

V.prim = () => {
  const box = vizBox('prim');
  const svg = sv('svg', { width: 740, height: 500 }, box);
  const wires = [sv('path', { d: 'M90 190 L262 190', class: 'wire' }, svg), sv('path', { d: 'M90 310 L262 310', class: 'wire' }, svg), sv('path', { d: 'M455 250 L640 250', class: 'wire' }, svg)];
  const gg = sv('g', { transform: 'translate(250,130) scale(.75)' }, svg); const gs = gateShapes(gg); gs.or.style.opacity = 0; gs.x.style.opacity = 0; gs.t.textContent = 'u1';
  const pins = [['① y', 560, 230], ['② a', 120, 172], ['③ b', 120, 292]].map(([s, x, y]) => { const e = sv('text', { x, y, class: 'lbl', style: 'font-size:30px' }, svg); e.textContent = s; return e; });
  const tag = sv('text', { x: 370, y: 90, class: 'lbl c', style: 'font-size:30px;fill:#8ee8ff' }, svg); tag.textContent = 'and  u1 ( y, a, b );';
  return { el: box, update(t, L) {
    tag.style.opacity = easeOut(prog(t, L[0] + .3, .4));
    const order = [2, 0, 1]; // y, a, b
    pins.forEach((p, i) => { p.style.opacity = easeOut(prog(t, L[1] + .3, .4)); });
    const k = t >= L[2] ? Math.floor((t - L[2] - .3) / .8) : -1;
    order.forEach((wi, i) => setCls(wires[wi], 'on', k >= 0 && k % 4 === i));
    pins.forEach((p, i) => { p.style.fill = k >= 0 && k % 4 === i ? '#8ee8ff' : ''; });
  } };
};

V.bits = () => {
  const box = vizBox('bits');
  const c1 = cells(box, 190, 130, 4, ['d[3]', 'd[2]', 'd[1]', 'd[0]']);
  const msb = pos(el('div', 'pill', box, '最高位 MSB'), 150, 270), lsb = pos(el('div', 'pill', box, '最低位 LSB'), 430, 270);
  const lit1 = pos(el('div', 'lit', box, ['4|位宽', "'|分隔", 'b|进制', '0101|数值'].map((s) => `<div><b>${s.split('|')[0]}</b><span>${s.split('|')[1]}</span></div>`).join('')), 120, 130);
  const lit2 = pos(el('div', 'lit', box, ['8|位宽', "'|分隔", 'h|十六进制', 'A7|数值'].map((s) => `<div><b>${s.split('|')[0]}</b><span>${s.split('|')[1]}</span></div>`).join('')), 140, 60);
  const c2 = cells(box, 30, 300, 8, ['7', '6', '5', '4', '3', '2', '1', '0']); c2.set([1, 0, 1, 0, 0, 1, 1, 1]); c2.items.forEach((e) => { e.style.width = '74px'; });
  const wr = el('div', '', box); wr.style.cssText = 'position:absolute;inset:0';
  pos(el('div', 'pill hot', wr, 'wire'), 90, 150); pos(el('div', 'pill', wr, '← assign 驱动'), 230, 150);
  pos(el('div', 'pill hot', wr, 'reg'), 90, 290); pos(el('div', 'pill', wr, '← always 块里赋值'), 230, 290);
  return { el: box, update(t, L) {
    vis(c1, t, L[1], L[2] - .1); c1.set([0, 1, 0, 1]); vis(msb, t, L[1] + 1.2, L[2] - .1); vis(lsb, t, L[1] + 1.6, L[2] - .1);
    vis(lit1, t, L[2], L[3] - .1);
    [...lit1.children].forEach((d, i) => setCls(d, 'on', t >= L[2] && Math.floor((t - L[2] - .4) / .9) === i));
    vis(lit2, t, L[3], L[4] - .1); vis(c2, t, L[3] + 1.2, L[4] - .1);
    [...lit2.children].forEach((d, i) => setCls(d, 'on', i === 2 && t > L[3] + .4));
    vis(wr, t, L[4], 1e9);
    if (t < L[1]) { c1.style.opacity = 0; }
  } };
};

V.mux2 = () => {
  const box = vizBox('mux2');
  const svg = sv('svg', { width: 740, height: 500 }, box);
  const pa = sv('path', { d: 'M120 130 C 220 130 250 200 330 210', class: 'wire' }, svg), pb = sv('path', { d: 'M120 380 C 220 380 250 310 330 300', class: 'wire' }, svg);
  sv('polygon', { points: '330,140 440,190 440,320 330,370', class: 'gate' }, svg);
  const blade = sv('line', { x1: 440, y1: 255, x2: 330, y2: 210, class: 'wire on', style: 'stroke-width:10' }, svg);
  const py = sv('path', { d: 'M440 255 L590 255', class: 'wire on' }, svg); const ps = sv('path', { d: 'M385 345 L385 410', class: 'wire' }, svg);
  const la = pos(el('div', 'pill', box, 'a = 🅰'), 20, 106), lb = pos(el('div', 'pill', box, 'b = 🅱'), 20, 356);
  const out = pos(el('div', 'led on', box, 'a'), 600, 200);
  const ts = toggle(box, 320, 410); pos(el('div', 'vlab', box, 'sel'), 230, 418);
  return { el: box, update(t, L) {
    const tap = L[3] + .6; const s = t >= tap ? 1 : 0; const p = ease(prog(t, tap, .3));
    blade.setAttribute('y2', lerp(210, 300, s ? p : 0)); ts.set(s); setCls(ps, 'on', s);
    setCls(pa, 'on', !s); setCls(pb, 'on', s); setText(out, s ? 'b' : 'a');
    setCls(la, 'hot', !s); setCls(lb, 'hot', s);
    out.style.transform = `scale(${1 + .2 * Math.exp(-(t - tap) * 6) * (t > tap ? 1 : 0)})`;
    fingerAt(t, [[tap, 385, 443, 1]], .8);
  } };
};

V.mux4 = () => {
  const box = vizBox('mux4');
  const svg = sv('svg', { width: 740, height: 500 }, box);
  const d = [0, 1, 0, 1];
  const ws = [0, 1, 2, 3].map((i) => sv('path', { d: `M170 ${100 + i * 90} L330 ${130 + i * 60}`, class: 'wire' }, svg));
  sv('polygon', { points: '330,80 440,130 440,350 330,400', class: 'gate' }, svg);
  const py = sv('path', { d: 'M440 240 L580 240', class: 'wire on' }, svg); sv('path', { d: 'M385 375 L385 430', class: 'wire on' }, svg);
  const ins = d.map((v, i) => pos(el('div', 'pill', box, `d[${i}] = ${v}`), 16, 78 + i * 90));
  const out = led(box, 590, 185, 'y');
  const sel = pos(el('div', 'pill hot', box, ''), 290, 432);
  return { el: box, update(t, L) {
    const k = t < L[2] ? 0 : Math.floor((t - L[2]) / 1.05) % 4;
    ws.forEach((w, i) => setCls(w, 'on', i === k)); ins.forEach((p, i) => setCls(p, 'hot', i === k));
    out.set(d[k]); setText(out, 'y=' + d[k]); out.style.fontSize = '30px';
    setHTML(sel, `sel = 2'b${k.toString(2).padStart(2, '0')}`);
    if (t >= L[2] && t < L[3]) return { hl: [8 + k] };
  } };
};

V.decoder = () => {
  const box = vizBox('decoder');
  const svg = sv('svg', { width: 740, height: 500 }, box);
  const body = sv('rect', { x: 250, y: 90, width: 220, height: 320, rx: 22, class: 'blk' }, svg);
  const name = sv('text', { x: 360, y: 260, class: 'blk-t', style: 'font-size:28px' }, svg);
  const inP = pos(el('div', 'pill hot', box, ''), 24, 220);
  const outs = [0, 1, 2, 3].map((i) => { const l = led(box, 560, 70 + i * 92, ''); l.style.width = l.style.height = '78px'; l.style.fontSize = '26px'; return l; });
  const outLbl = [0, 1, 2, 3].map((i) => pos(el('div', 'vlab', box, `y[${i}]`), 650, 88 + i * 92));
  const enc = el('div', '', box); enc.style.cssText = 'position:absolute;inset:0;display:none';
  const encIn = cells(enc, 20, 200, 4, ['d[3]', 'd[2]', 'd[1]', 'd[0]']); encIn.items.forEach((e) => { e.style.width = '50px'; e.style.fontSize = '36px'; });
  const encOut = pos(el('div', 'pill hot', enc, ''), 520, 220);
  const dflt = pos(el('div', 'pill', enc, 'default → 2\'b00'), 270, 420);
  return { el: box, update(t, L) {
    const encoder = t >= L[2];
    enc.style.display = encoder ? 'block' : 'none';
    outs.forEach((o) => { o.style.display = encoder ? 'none' : 'flex'; }); outLbl.forEach((o) => { o.style.display = encoder ? 'none' : 'block'; });
    inP.style.display = encoder ? 'none' : 'block';
    name.textContent = encoder ? 'encoder4_2' : 'decoder2_4';
    if (!encoder) {
      const k = t < L[1] ? 2 : Math.floor((t - L[1]) / 1.0) % 4;
      setText(inP, `a = 2'b${k.toString(2).padStart(2, '0')}`);
      outs.forEach((o, i) => { o.set(i === k); setText(o, i === k ? 1 : 0); });
      if (t >= L[1]) return { hl: [7 + k] };
    } else {
      const isDefault = t >= L[3];
      const k = isDefault ? -1 : Math.floor((t - L[2]) / 1.0) % 4;
      const bits = isDefault ? [0, 1, 1, 0] : [0, 1, 2, 3].map((i) => (3 - i === k ? 1 : 0));
      encIn.set(bits);
      setText(encOut, `y = 2'b${(isDefault ? 0 : k).toString(2).padStart(2, '0')}`);
      dflt.style.opacity = isDefault ? 1 : 0; setCls(dflt, 'hot', isDefault);
      if (!isDefault) return { hl: [7 + k] };
    }
  } };
};

V.cmp = () => {
  const box = vizBox('cmp');
  const pairs = [[9, 4], [6, 6], [3, 12]];
  const A = pos(el('div', 'reg', box, '<small>a</small><b></b><small class="mono"></small>'), 90, 80), B = pos(el('div', 'reg', box, '<small>b</small><b></b><small class="mono"></small>'), 500, 80);
  [A, B].forEach((r) => { r.style.width = '170px'; r.style.height = '150px'; });
  const sym = pos(el('div', 'big', box, ''), 300, 100); sym.style.width = '160px'; sym.style.fontSize = '90px';
  const names = ['greater', 'equal', 'less'];
  const leds = names.map((n, i) => { const l = led(box, 80 + i * 220, 290, ''); l.style.width = l.style.height = '96px'; return l; });
  names.forEach((n, i) => pos(el('div', 'vlab', box, n), 58 + i * 220 + (n === 'less' ? 30 : n === 'equal' ? 14 : 0), 400).style.fontSize = '28px');
  return { el: box, update(t, L) {
    const k = t < L[1] ? 0 : Math.floor((t - L[1]) / 1.5) % 3; const [a, b] = pairs[k];
    setText(A.querySelector('b'), a); setText(B.querySelector('b'), b);
    setText(A.querySelectorAll('small')[1], a.toString(2).padStart(4, '0')); setText(B.querySelectorAll('small')[1], b.toString(2).padStart(4, '0'));
    const r = a > b ? 0 : a === b ? 1 : 2; setText(sym, ['>', '=', '<'][r]);
    leds.forEach((l, i) => { l.set(i === r); setText(l, i === r ? 1 : 0); });
    if (t >= L[1] && t < L[3]) return { hl: [[9, 10], [12, 13], [15, 16]][r] };
  } };
};

function waveViz(name, cycles, signals, timing) {
  const box = vizBox(name);
  const svg = sv('svg', { width: 740, height: 500 }, box);
  const w = wave(svg, { cycles, signals, y0: 70, row: Math.min(100, 400 / signals.length) });
  return { box, svg, w, timing };
}

V.dffwave = () => {
  const N = 9;
  const rst = (u) => ((u < 1.2 || (u > 6.15 && u < 6.6)) ? 0 : 1);
  const dT = [[0, 0], [.3, 1], [1.8, 0], [2.3, 1], [3.15, 0], [3.4, 1], [4.7, 0], [5.3, 1], [7.1, 0], [8.2, 1]];
  const dF = (u) => { let v = 0; for (const [x, b] of dT) if (u >= x) v = b; return v; };
  const q = simulate(N, { init: 0, step: (s, u) => (rst(u) === 0 ? 0 : isEdge(u) ? dF(u) : s) });
  const v = waveViz('dffwave', N, [{ name: 'clk', kind: 'clk', fn: clkF }, { name: 'rst_n', kind: 'in', fn: rst }, { name: 'd', kind: 'in', fn: dF }, { name: 'q', kind: 'out', fn: q }]);
  return { el: v.box, update(t, L, D) { v.w.set(clamp((t - L[1]) / (D - .6 - L[1])) * N); } };
};

V.jk = () => {
  const box = vizBox('jk');
  const N = 8;
  const en = (u) => ((u > 2 && u < 5.2) ? 1 : 0);
  const dT = [[0, 1], [1.7, 0], [2.8, 1], [3.6, 0], [4.4, 1], [6.3, 0], [7.2, 1]];
  const dF = (u) => { let v = 0; for (const [x, b] of dT) if (u >= x) v = b; return v; };
  const qe = simulate(N, { init: 0, step: (s, u) => (isEdge(u) && en(u) ? dF(u) : s) });
  const s1 = sv('svg', { width: 740, height: 500, style: 'position:absolute;inset:0' }, box);
  const w1 = wave(s1, { cycles: N, y0: 70, row: 100, signals: [{ name: 'clk', kind: 'clk', fn: clkF }, { name: 'en', kind: 'in', fn: en }, { name: 'd', kind: 'in', fn: dF }, { name: 'q', kind: 'out', fn: qe }] });
  const tbl = el('div', '', box); tbl.style.cssText = 'position:absolute;inset:0';
  const cat = pos(el('div', 'pill', tbl, '{ j , k } = {1, 0} = 2\'b10'), 160, 40);
  const tt = pos(el('div', 'tt', tbl), 52, 150);
  const rows = [['00', '保持'], ['01', '清零'], ['10', '置 1'], ['11', '翻转']].map(([c, n]) => el('div', 'row', tt, `<span>${c}</span><b>${n}</b>`));
  const qr = pos(el('div', 'reg', tbl, '<small>q</small><b>0</b>'), 295, 300);
  const tz = (u) => ((u > 1 && u < 6.4) ? 1 : 0);
  const qt = simulate(N, { init: 0, step: (s, u) => (isEdge(u) && tz(u) ? 1 - s : s) });
  const s3 = sv('svg', { width: 740, height: 500, style: 'position:absolute;inset:0' }, box);
  const w3 = wave(s3, { cycles: N, y0: 90, row: 120, signals: [{ name: 'clk', kind: 'clk', fn: clkF }, { name: 't', kind: 'in', fn: tz }, { name: 'q', kind: 'out', fn: qt }] });
  return { el: box, update(t, L, D) {
    s1.style.opacity = t < L[1] - .1 ? 1 - prog(t, L[1] - .4, .3) : 0;
    w1.set(clamp((t - L[0] - .3) / (L[1] - L[0] - .8)) * N);
    tbl.style.opacity = t >= L[1] - .2 && t < L[3] - .1 ? easeOut(prog(t, L[1] - .2, .4)) * (1 - prog(t, L[3] - .4, .3)) : 0;
    let k = -1, q = 0;
    if (t >= L[2]) { const n = Math.floor((t - L[2]) / 1.0); k = n % 4; for (let i = 0; i <= n; i++) { const c = i % 4; q = c === 0 ? q : c === 1 ? 0 : c === 2 ? 1 : 1 - q; } }
    rows.forEach((r, i) => setCls(r, 'cur', i === k)); setText(qr.querySelector('b'), q);
    setCls(qr, 'flash', k >= 0 && ((t - L[2]) % 1.0) < .3);
    s3.style.opacity = t >= L[3] - .1 ? easeOut(prog(t, L[3] - .1, .4)) : 0;
    w3.set(clamp((t - L[3] - .3) / (D - .6 - L[3] - .3)) * N);
    if (k >= 0 && t < L[3]) return { hl: [13 + k] };
  } };
};

V.counterwave = () => {
  const box = vizBox('counterwave');
  const N = 18;
  const rst = (u) => (u < .9 ? 0 : 1);
  const cnt = simulate(N, { init: 0, step: (s, u) => (rst(u) === 0 ? 0 : isEdge(u) ? (s + 1) % 16 : s) });
  const svg = sv('svg', { width: 740, height: 500 }, box);
  const w = wave(svg, { cycles: N, y0: 190, row: 95, signals: [{ name: 'clk', kind: 'clk', fn: clkF }, { name: 'rst_n', kind: 'in', fn: rst }, { name: 'cnt', kind: 'out', bus: true, fn: (u) => cnt(u).toString(16).toUpperCase() }] });
  const c = cells(box, 150, 26, 4, ['cnt[3]', 'cnt[2]', 'cnt[1]', 'cnt[0]']); c.items.forEach((e) => { e.style.height = '90px'; });
  const dec = pos(el('div', 'big', box, ''), 520, 40); dec.style.fontSize = '60px';
  return { el: box, update(t, L, D) {
    const u = clamp((t - L[1]) / (D - .6 - L[1])) * N; w.set(u);
    const v = cnt(Math.min(u, N - .001)); c.set([3, 2, 1, 0].map((b) => (v >> b) & 1)); setText(dec, '= ' + v);
    dec.style.color = v === 15 || (v === 0 && u > 2) ? '#ff8fb0' : '';
  } };
};

V.shift = () => {
  const box = vizBox('shift');
  const seq = [0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1];
  const frame = pos(el('div', '', box), 40, 160); frame.style.cssText += ';position:absolute;width:520px;height:150px;border-radius:24px;border:3px dashed rgba(120,220,255,.45)';
  ['q[3]', 'q[2]', 'q[1]', 'q[0]'].forEach((n, i) => pos(el('div', 'vlab', box, n), 66 + i * 126, 110).style.fontSize = '26px');
  pos(el('div', 'vlab', box, 'd'), 610, 110).style.color = '#8ee8ff';
  const items = seq.map((b) => { const e = el('div', 'bc', box, `<span>${b}</span><small></small>`); e.style.position = 'absolute'; e.style.top = '186px'; e.style.width = '100px'; setCls(e, 'one', b); return e; });
  const note = pos(el('div', 'pill', box, '⬅ 每个时钟左移一位：q <= {q[2:0], d}'), 70, 390);
  return { el: box, update(t, L, D) {
    const P = .9, s0 = L[1] - .3; const c = 4 + Math.max(0, (t - s0) / P), cn = Math.floor(c), f = ease(clamp((c - cn) / .4)); const cc = cn + f;
    items.forEach((e, i) => {
      const slot = i - cc + 4; const x = slot >= 4 ? 580 + (slot - 4) * 70 : 56 + slot * 126;
      let o = 1; if (slot > 4) o = clamp(1 - (slot - 4)); if (slot < 0) o = clamp(1 + slot * 1.3);
      e.style.left = x + 'px'; e.style.opacity = o; e.style.transform = slot < 0 ? `translateY(${-slot * 90}px)` : '';
    });
    vis(note, t, L[2], 1e9);
  } };
};

V.swap = () => {
  const box = vizBox('swap');
  const L1 = pos(el('div', 'pill', box, '非阻塞 <='), 90, 24), R1 = pos(el('div', 'pill', box, '阻塞 ='), 480, 24);
  const mk = (x, n) => pos(el('div', 'reg', box, `<small>${n}</small><b></b>`), x, 120);
  const na = mk(40, 'a'), nb = mk(200, 'b'), ba = mk(420, 'a'), bb = mk(580, 'b');
  const svg = sv('svg', { width: 740, height: 500, style: 'position:absolute;inset:0' }, box);
  const x1 = sv('path', { d: 'M115 240 C 115 300 275 300 275 240', class: 'wire on' }, svg), x2 = sv('path', { d: 'M275 240 C 275 330 115 330 115 240', class: 'wire on' }, svg);
  const st1 = pos(el('div', 'stepbox', box, '① a = b'), 440, 300), st2 = pos(el('div', 'stepbox', box, '② b = a'), 440, 370);
  const rL = pos(el('div', 'pill', box, ''), 70, 400), rR = pos(el('div', 'pill', box, ''), 610, 400);
  sv('line', { x1: 370, x2: 370, y1: 20, y2: 480, stroke: 'rgba(120,180,255,.25)', 'stroke-width': 3 }, svg);
  return { el: box, update(t, L) {
    const e1 = L[1] + 2.2; const sw = t >= e1;
    setText(na.querySelector('b'), sw ? 2 : 1); setText(nb.querySelector('b'), sw ? 1 : 2);
    [na, nb].forEach((r) => setCls(r, 'flash', t > e1 && t < e1 + .5));
    const xo = t > L[1] + .6 ? easeOut(prog(t, L[1] + .6, .5)) : 0; x1.style.opacity = x2.style.opacity = xo;
    setText(rL, sw ? '✅ 交换成功' : ''); rL.style.opacity = sw ? 1 : 0;
    const s1 = t >= L[2] + 1.6, s2 = t >= L[2] + 3.2;
    setText(ba.querySelector('b'), s1 ? 2 : 1); setText(bb.querySelector('b'), 2);
    setCls(ba, 'flash', s1 && t < L[2] + 2.1); setCls(bb, 'flash', s2 && t < L[2] + 3.7);
    setCls(st1, 'on', t >= L[2] + 1.2 && t < L[2] + 3.0); setCls(st2, 'on', t >= L[2] + 2.8 && t < L[3]);
    [st1, st2].forEach((s) => { s.style.opacity = t >= L[2] ? 1 : .35; });
    setText(rR, s2 ? '两个都是 2' : ''); rR.style.opacity = s2 ? 1 : 0; rR.style.left = '500px';
    const dimR = t < L[2] - .2; [ba, bb, R1].forEach((e) => { e.style.opacity = dimR ? .35 : 1; });
  } };
};

V.hier = () => {
  const box = vizBox('hier');
  const svg = sv('svg', { width: 740, height: 500 }, box);
  const top = sv('rect', { x: 40, y: 50, width: 660, height: 400, rx: 26, fill: 'rgba(70,150,255,.05)', stroke: '#35c2ff', 'stroke-width': 4, 'stroke-dasharray': '14 10' }, svg);
  sv('text', { x: 64, y: 40, class: 'lbl', style: 'font-size:26px;fill:#8ee8ff' }, svg).textContent = 'top_module';
  const u1 = sv('rect', { x: 150, y: 150, width: 170, height: 180, rx: 18, class: 'blk' }, svg), u2 = sv('rect', { x: 430, y: 150, width: 170, height: 180, rx: 18, class: 'blk' }, svg);
  [['and_gate', 235, 232], ['u1', 235, 272], ['mux2_1', 515, 232], ['u2', 515, 272]].forEach(([s, x, y], i) => { sv('text', { x, y, class: i % 2 ? 'blk-s' : 'blk-t', style: 'font-size:26px' }, svg).textContent = s; });
  const W = {
    a: sv('path', { d: 'M10 190 L150 190', class: 'wire' }, svg), b: sv('path', { d: 'M10 290 L150 290', class: 'wire' }, svg),
    w1: sv('path', { d: 'M320 240 L370 240 L370 190 L430 190', class: 'wire' }, svg),
    a2: sv('path', { d: 'M100 190 L100 400 L390 400 L390 290 L430 290', class: 'wire' }, svg),
    sel: sv('path', { d: 'M10 430 L515 430 L515 330', class: 'wire' }, svg), y: sv('path', { d: 'M600 240 L730 240', class: 'wire' }, svg),
  };
  [['a', 14, 178], ['b', 14, 278], ['sel', 14, 420], ['y', 690, 228]].forEach(([s, x, y]) => { sv('text', { x, y, class: 'lbl', style: 'font-size:26px' }, svg).textContent = s; });
  const w1t = sv('text', { x: 345, y: 176, class: 'lbl c', style: 'font-size:26px;fill:#8ee8ff' }, svg); w1t.textContent = 'w1';
  return { el: box, update(t, L) {
    vis(u1, t, L[2] - .2, 1e9, { dy: 0, dx: -60 }); vis(u2, t, L[3] - .3, 1e9, { dy: 0, dx: 60 });
    w1t.style.opacity = easeOut(prog(t, L[1], .4));
    const on = (k) => k;
    setCls(W.w1, 'on', t >= L[1] && t < L[2] || t >= L[3]); setCls(W.a, 'on', t >= L[2] && t < L[3] || t >= L[4]); setCls(W.b, 'on', t >= L[2] && t < L[3] || t >= L[4]);
    setCls(W.a2, 'on', t >= L[4]); setCls(W.sel, 'on', t >= L[4]); setCls(W.y, 'on', t >= L[4]);
    setCls(u1, 'on', t >= L[2] && t < L[3]); setCls(u2, 'on', t >= L[3] && t < L[4]); setCls(top, 'on', t >= L[4]);
    W.w1.style.strokeDasharray = t >= L[3] && t < L[4] ? '16 10' : ''; W.w1.style.strokeDashoffset = -t * 60;
    top.style.filter = t >= L[4] ? `drop-shadow(0 0 ${8 + 12 * pulse(t, 1.2)}px rgba(120,220,255,.7))` : '';
  } };
};

V.param = () => {
  const box = vizBox('param');
  const r1 = el('div', '', box); r1.style.cssText = 'position:absolute;inset:0';
  const t1 = pos(el('div', 'pill hot', r1, 'u1 · WIDTH = 8'), 40, 50);
  const c1 = cells(r1, 40, 110, 8); c1.items.forEach((e) => { e.style.width = '70px'; e.style.height = '80px'; e.style.fontSize = '40px'; });
  const rng = pos(el('div', 'pill', r1, 'cnt[7:0] · 0 ~ 255'), 40, 210);
  const r2 = el('div', '', box); r2.style.cssText = 'position:absolute;inset:0';
  pos(el('div', 'pill hot', r2, 'u2 · WIDTH = 16'), 40, 290);
  const c2 = cells(r2, 40, 350, 16); c2.items.forEach((e) => { e.style.width = '34px'; e.style.height = '64px'; e.style.fontSize = '26px'; e.style.borderRadius = '10px'; }); c2.style.gap = '6px';
  pos(el('div', 'pill', r2, 'cnt[15:0] · 0 ~ 65535'), 380, 290);
  return { el: box, update(t, L) {
    vis(r1, t, L[1] - .2); vis(r2, t, L[3] + .4);
    const n = Math.floor(Math.max(0, t - L[0]) / .08) * 37 + 5;
    c1.set([7, 6, 5, 4, 3, 2, 1, 0].map((b) => (n >> b) & 1)); c2.set([...Array(16).keys()].reverse().map((b) => ((n * 211) >> b) & 1));
    setText(rng, t >= L[2] ? 'cnt[WIDTH-1:0] → cnt[7:0]' : 'cnt[7:0] · 0 ~ 255'); setCls(rng, 'hot', t >= L[2] && t < L[3]);
  } };
};

V.ram = () => {
  const box = vizBox('ram');
  const grid = pos(el('div', '', box), 20, 60); grid.style.cssText += ';position:absolute;display:grid;grid-template-columns:repeat(4,110px);gap:8px';
  const mem = [...Array(16).keys()].map((i) => (i * 73 + 41) % 256); const cellsA = mem.map((v, i) => { const c = el('div', 'rc', grid, `<small>${i}</small><b></b>`); c.style.width = '110px'; c.style.height = '84px'; return c; });
  const sig = pos(el('div', '', box), 500, 60); sig.style.cssText += ';position:absolute;width:220px';
  const S = {}; ['clk', 'we', 'addr', 'din', 'dout'].forEach((n) => { const r = el('div', 'sg', sig, `<span>${n}</span><i></i>`); S[n] = r.querySelector('i'); });
  const fly = pos(el('div', 'pill hot', box, ''), 0, 0);
  const fp = pos(el('div', 'pill', box, '⚙️ 综合 → FPGA 块 RAM（Block RAM）'), 60, 440);
  const hex = (v) => v.toString(16).toUpperCase().padStart(2, '0');
  const cpos = (i) => [20 + (i % 4) * 118 + 30, 60 + Math.floor(i / 4) * 92 + 20];
  return { el: box, update(t, L) {
    const ops = [{ at: L[2] + .2, edge: L[2] + 1.5, we: 1, addr: 5, din: 0xA7 }, { at: L[2] + 2.4, edge: L[2] + 3.6, we: 1, addr: 9, din: 0x3C }, { at: L[3] + .1, edge: L[3] + 1.0, we: 0, addr: 5, din: null }];
    const m = mem.slice(); let cur = null, dout = null, age = 9, lw = null;
    for (const op of ops) { if (t >= op.at) cur = op; if (t >= op.edge) { if (op.we) { m[op.addr] = op.din; lw = op; } dout = m[op.addr]; age = t - op.edge; } }
    cellsA.forEach((c, i) => { setText(c.querySelector('b'), hex(m[i])); setCls(c, 'sel', cur && cur.addr === i); setCls(c, 'hit', lw && lw.addr === i && age < .6 && cur && cur.we); });
    const hl = t >= L[0] && t < L[1] ? 1 : 0; cellsA.forEach((c, i) => { c.style.opacity = t < L[0] + i * .04 ? 0 : 1; c.style.transform = hl ? `scale(${1 + .04 * pulse(t + i * .05, 1.2)})` : ''; });
    setText(S.clk, age < .3 ? '↑' : '·'); setText(S.we, cur ? cur.we : 0); setCls(S.we, 'one', cur && cur.we);
    setText(S.addr, cur ? cur.addr : '-'); setCls(S.addr, 'one', t >= L[1] && t < L[2]); setText(S.din, cur && cur.din != null ? hex(cur.din) : '--'); setText(S.dout, dout == null ? '--' : hex(dout)); setCls(S.dout, 'one', dout != null);
    let fo = 0; for (const op of ops) if (op.we && t >= op.edge - .8 && t < op.edge + .1) { const p = ease(prog(t, op.edge - .8, .8)); const [cx, cy] = cpos(op.addr); pos(fly, lerp(560, cx, p), lerp(190, cy, p)); setText(fly, hex(op.din)); fo = 1 - prog(t, op.edge, .1); }
    fly.style.opacity = fo;
    vis(fp, t, L[4], 1e9);
  } };
};

V.recap = () => {
  const box = vizBox('recap');
  const cards = [['🧮', '组合逻辑', 'assign / always @(*)  ='], ['⏱️', '时序逻辑', 'always @(posedge clk)  <='], ['🧱', '层次化', '例化 + parameter']].map(([e, n, s], i) => pos(el('div', 'rcard', box, `<span class="em">${e}</span><b>${n}</b><span>${s}</span>`), 30, 50 + i * 140));
  return { el: box, update(t, L) {
    cards.forEach((c, i) => { vis(c, t, L[0] + .3 + i * .3, 1e9, { dx: 60, dy: 0 }); setCls(c, 'on', t >= L[i + 1] && (t < L[i + 2] || i === 2 && t < L[4]) || t >= L[4]); });
  } };
};

/* ===================================================================== */
let TL = null; const inst = {};
function setup(tl) {
  TL = tl;
  const bars = $('bars'); bars.innerHTML = '';
  TL.scenes.forEach(() => el('div', 'seg', bars, '<i></i>'));
  TL.scenes.forEach((sc) => { if (!inst[sc.viz] && V[sc.viz]) inst[sc.viz] = V[sc.viz](); });
}
function subHTML(s) { return esc(s).replace(/\[\[(.+?)\]\]/g, '<span class="hl">$1</span>'); }
function noteHTML(s) { let out = '', last = 0; const re = /[A-Za-z_][\w\[\]:'(){},.@*<=~^&|#\-+ ]*/g; let m; while ((m = re.exec(s))) { out += esc(s.slice(last, m.index)) + `<span class="mono">${esc(m[0])}</span>`; last = re.lastIndex; } return out + esc(s.slice(last)); }

window.renderFrame = function (t) {
  document.querySelector('.b1').style.transform = `translate(${Math.sin(t * .2) * 80}px,${Math.cos(t * .17) * 60}px)`;
  document.querySelector('.b2').style.transform = `translate(${Math.cos(t * .19) * 90}px,${Math.sin(t * .23) * 60}px)`;
  let idx = TL.scenes.findIndex((s) => t >= s.start && t < s.end); if (idx < 0) idx = TL.scenes.length - 1;
  const sc = TL.scenes[idx]; const lt = t - sc.start, D = sc.end - sc.start;
  const L = sc.lines.map((l) => l.start - sc.start);
  let step = -1; L.forEach((x, i) => { if (lt >= x - .05) step = i; });
  // viz
  Object.values(inst).forEach((v) => { v.el.style.display = 'none'; });
  $('finger').style.opacity = 0; $('ripple').style.opacity = 0;
  const vz = inst[sc.viz]; let dyn = null;
  if (vz) { vz.el.style.display = 'block'; dyn = vz.update(lt, L, D) || null; }
  // code state for current and previous step
  const codeAt = (i) => { let c = sc.code; for (let k = 0; k <= i && k < sc.lines.length; k++) if (sc.lines[k].code) c = sc.lines[k].code; return c; };
  const hlAt = (i) => (i >= 0 ? normHL(sc.lines[i].hl) : []);
  const code = codeAt(step), ranges = dyn && dyn.hl ? normHL(dyn.hl) : hlAt(step);
  const prevCode = codeAt(step - 1), prevRanges = step > 0 ? hlAt(step - 1) : null;
  const stepT = step >= 0 ? L[step] : 0;
  const changed = step >= 0 && sc.lines[step].code && prevCode !== code;
  applyCode(code, ranges, changed ? null : prevRanges, changed || step <= 0 ? null : scrollFor(prevCode, prevRanges || []), prog(lt, stepT, .45), changed ? easeOut(prog(lt, stepT, .4)) : 1);
  // note card
  let note = null; for (let i = 0; i <= step; i++) if (sc.lines[i].note) note = sc.lines[i].note;
  const nt = $('noteText');
  if (note) { setHTML(nt, noteHTML(note)); nt.classList.remove('q'); } else { setHTML(nt, '❓ ' + esc(sc.q || '')); nt.classList.add('q'); }
  let noteStart = 0; for (let i = 0; i <= step; i++) if (sc.lines[i].note) noteStart = L[i];
  const np = prog(lt, noteStart, .35); nt.style.opacity = easeOut(np); nt.style.transform = `translateY(${(1 - easeOut(np)) * 14}px)`;
  // header
  const ct = $('chipText'); setText(ct, sc.chip); const cp = prog(lt, (sc.lead || 0) - .4, .5); ct.style.opacity = easeOut(cp); ct.style.transform = `translateX(${(1 - easeOut(cp)) * -60}px)`;
  [...$('bars').children].forEach((b, i) => { const s = TL.scenes[i]; b.firstChild.style.width = (clamp((t - s.start) / (s.end - s.start)) * 100) + '%'; });
  // section title card
  const card = $('card'), lead = sc.lead || 0;
  const m = sc.chip.match(/^(\d+)\s*(.*)$/);
  setText($('cd-part'), sc.part || (m ? 'PART ' + m[1] : '')); setText($('cd-title'), m ? m[2] : sc.chip); setText($('cd-qt'), sc.q || '');
  const pin = prog(lt, 0, .4), pout = prog(lt, lead - .55, .45);
  const co = idx === 0 ? (1 - ease(pout)) : easeOut(pin) * (1 - ease(pout));
  card.style.opacity = co; card.style.transform = `scale(${lerp(1, .94, ease(pout))})`;
  card.querySelector('.cd-line').style.width = (420 * easeOut(prog(lt, .1, .6))) + 'px';
  // subtitles
  const st = $('subText'); const line = step >= 0 ? sc.lines[step] : null;
  if (!line) setHTML(st, ''); else {
    setHTML(st, subHTML(line.text));
    const p = prog(lt, L[step] - .05, .22); st.style.opacity = easeOut(p) * (1 - prog(lt, D - .25, .25)); st.style.transform = `translateY(${(1 - easeOut(p)) * 16}px)`;
  }
  $('fadeout').style.opacity = ease(prog(t, TL.duration - 1.6, 1.5));
};
window.setupTimeline = setup;
if (window.__TIMELINE__) setup(window.__TIMELINE__);
