/* Deterministic frame renderer: every visual is a pure function of time t.
   The capture script calls window.renderFrame(t) and screenshots the page. */
'use strict';
const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const backOut = (x) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const prog = (t, a, d = .5) => clamp((t - a) / d);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

function pose(el, { o = 1, x = 0, y = 0, s = 1, r = 0 } = {}) {
  el.style.opacity = o;
  el.style.transform = `translate(${x}px,${y}px) scale(${s}) rotate(${r}deg)`;
}
/* element visible between a and b with pop-in / fade-out */
function vis(el, t, a, b = 1e9, { dy = 50, ds = .85, din = .5, dout = .35, dx = 0 } = {}) {
  const pi = prog(t, a, din), po = prog(t, b, dout);
  const o = easeOut(pi) * (1 - ease(po));
  const s = lerp(ds, 1, backOut(pi)) * lerp(1, .94, ease(po));
  pose(el, { o, x: (1 - easeOut(pi)) * dx, y: (1 - easeOut(pi)) * dy - ease(po) * 30, s });
  el.style.visibility = o < .002 ? 'hidden' : 'visible';
  return o;
}
function pulse(t, period, sharp = 6) { const p = ((t % period) + period) % period / period; return Math.exp(-p * sharp); }

/* --- tiny Verilog highlighter --- */
const KW = /\b(module|endmodule|input|output|reg|wire|assign|always|posedge|negedge|begin|end|if|else|case|endcase|parameter)\b/;
function hl(code) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const re = /(\/\/[^\n]*)|(\b(?:module|endmodule|input|output|reg|wire|assign|always|posedge|negedge|begin|end|if|else|case|endcase|parameter)\b)|(\d+'b[01]+|\b\d+\b)|(<=|[&|^~?:=+@])|(\{\{MARK\}\}|\{\{\/MARK\}\})/g;
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    if (m[1]) out += `<span class="cm">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="kw">${m[2]}</span>`;
    else if (m[3]) out += `<span class="num">${esc(m[3])}</span>`;
    else if (m[4]) out += `<span class="op">${esc(m[4])}</span>`;
    else if (m[5]) out += m[5] === '{{MARK}}' ? '<span class="mark">' : '</span>';
    last = re.lastIndex;
  }
  out += esc(code.slice(last));
  return out.split('\n').map((l) => `<span class="ln">${l || ' '}</span>`).join('');
}
const setCode = (el, code) => { if (el._c !== code) { el._c = code; el.innerHTML = hl(code); } };
const setText = (el, s) => { s = String(s); if (el._t !== s) { el._t = s; el.textContent = s; } };
const setCls = (el, c, on) => el.classList.toggle(c, !!on);

/* --- finger: path [[time,x,y,tap]] --- */
const finger = $('finger'), ripple = $('ripple');
let fingerState = null;
function fingerPath(t, path, hold = .9) {
  if (!path.length) return null;
  const first = path[0][0], last = path[path.length - 1][0];
  if (t < first - .6 || t > last + hold + .3) return null;
  let i = 0; while (i < path.length - 1 && t >= path[i + 1][0] - .45) i++;
  let x = path[i][1], y = path[i][2];
  if (i < path.length - 1) {
    // currently travelling from path[i] to path[i+1]?
  }
  // travel phase: during [t_{i+1}-.45, t_{i+1}] move from i to i+1
  const cur = path.findIndex((p) => t < p[0]);
  if (cur > 0) {
    const a = path[cur - 1], b = path[cur];
    const p = ease(prog(t, b[0] - .45, .45));
    x = lerp(a[1], b[1], p); y = lerp(a[2], b[2], p);
  } else if (cur === 0) { x = path[0][1] + 120; y = path[0][2] + 160; const p = ease(prog(t, first - .6, .6)); x = lerp(x, path[0][1], p); y = lerp(y, path[0][2], p); }
  else { x = path[path.length - 1][1]; y = path[path.length - 1][2]; }
  let press = 0, rip = -1;
  for (const p of path) if (p[3]) { const d = t - p[0]; if (d > -.12 && d < .2) press = Math.max(press, 1 - Math.abs(d - .02) / .18); if (d >= 0 && d < .5) rip = d / .5; }
  const o = Math.min(prog(t, first - .6, .3), 1 - prog(t, last + hold, .3));
  return { x, y, o, press, rip };
}
function drawFinger(f) {
  if (!f) { finger.style.opacity = 0; ripple.style.opacity = 0; return; }
  finger.style.opacity = f.o;
  finger.style.transform = `translate(${f.x - 52}px,${f.y - 8}px) scale(${1 - .14 * f.press})`;
  if (f.rip >= 0) { ripple.style.left = f.x + 'px'; ripple.style.top = f.y + 'px'; ripple.style.opacity = (1 - f.rip) * f.o; ripple.style.transform = `scale(${.3 + f.rip})`; }
  else ripple.style.opacity = 0;
}

/* ===================================================================== */
const S = {};

/* ---------- HOOK ---------- */
(() => {
  const grid = $('hk-grid'); for (let i = 0; i < 14 * 14; i++) grid.appendChild(document.createElement('i'));
  const cells = [...grid.children];
  const svg = $('hk-wires'); let d = '';
  for (let i = 0; i < 26; i++) {
    const p = () => [Math.round(hash(i * 7 + d.length % 5) * 900), Math.round(hash(i * 13 + 3) * 560)];
    const x1 = hash(i * 3.1) * 900, y1 = hash(i * 5.7) * 560, x2 = hash(i * 9.3) * 900, y2 = hash(i * 2.9) * 560;
    const c1x = hash(i * 4.4) * 900, c1y = hash(i * 8.8) * 560, c2x = hash(i * 6.6) * 900, c2y = hash(i * 1.7) * 560;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${x1} ${y1} C${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`);
    svg.appendChild(path);
  }
  const wires = [...svg.children];
  const code = 'module chip(\n  input  clk,\n  input  [7:0] a, b,\n  output [7:0] y\n);\n  assign y = a + b;\nendmodule';
  S.hook = { el: $('s-hook'), update(t, L, D) {
    // chip
    const chipOut = prog(t, L[2] - .2, .5);
    pose($('hk-chip'), { o: easeOut(prog(t, 0, .5)) * (1 - .75 * ease(prog(t, L[3], .5))) * (1 - .8 * ease(chipOut) * (1 - prog(t, L[3], .1))), s: lerp(.6, 1, backOut(prog(t, 0, .7))) * lerp(1, .55, ease(prog(t, L[3], .6))), y: lerp(0, 380, ease(prog(t, L[3], .6))) });
    const fr = Math.floor(t * 8);
    cells.forEach((c, i) => setCls(c, 'on', hash(i * 1.37 + fr * 0.71) > .55));
    // count
    const cp = ease(prog(t, L[0] + .3, 2.4));
    const n = Math.floor(cp * 10000000000);
    const cEl = $('hk-count');
    cEl.innerHTML = n.toLocaleString('en-US') + '<small>个晶体管开关</small>';
    vis(cEl, t, L[0] + .2, L[1]);
    // tangled wires
    const wv = (t >= L[1] - .1 && t < L[2] + .2);
    svg.style.visibility = wv ? 'visible' : 'hidden';
    svg.style.opacity = 1 - prog(t, L[2] - .1, .3);
    wires.forEach((w, i) => { const len = 1400; w.style.strokeDasharray = len; w.style.strokeDashoffset = len * (1 - ease(prog(t, L[1] + i * .05, .8))); });
    vis($('hk-x'), t, L[1] + 1.9, L[2], { ds: 2.2, dy: 0 });
    // code typing
    const cc = $('hk-code');
    vis(cc, t, L[2] - .05, L[3] - .05, { dy: 120 });
    const nch = Math.floor(clamp((t - L[2]) / 1.6) * code.length);
    const pre = $('hk-code-pre'); const k = 'n' + nch;
    if (pre._k !== k) { pre._k = k; pre.innerHTML = hl(code.slice(0, nch)).replace(/<\/span>$/, '<span class="caret"></span></span>'); }
    vis($('hk-write'), t, L[2] + .35, L[3] - .05, { ds: 2, dy: 0 });
    $('hk-write').style.transform += ` rotate(-8deg)`;
    // hero title
    const ht = $('hk-title');
    vis(ht, t, L[3] - .05, 1e9, { ds: .4, dy: 0 });
    ht.style.transform += ` rotate(${Math.sin(t * 2.2) * 1.2}deg)`;
  } };
})();

/* ---------- WHAT ---------- */
(() => {
  const dec = $('wh-dec');
  const bits = [1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1];
  for (let i = 0; i < 14; i++) { const b = document.createElement('div'); b.className = 'db'; dec.appendChild(b); }
  const dbs = [...dec.children];
  S.what = { el: $('s-what'), update(t, L, D) {
    const q = $('wh-q');
    vis(q, t, L[0] - .1, L[4] - .1, { ds: .6 });
    q.style.transform += ` translateY(${0}px) scale(${lerp(1, .78, ease(prog(t, L[1] - .3, .5)))})`;
    // bits tiles
    vis($('wh-bits'), t, L[1], L[3], { dy: 80 });
    const on = Math.floor((t - L[1]) / .7) % 2 === 1;
    setCls($('wh-b0'), 'x', on);
    pose($('wh-b0'), { s: on ? .9 : 1.06, o: on ? .45 : 1 });
    pose($('wh-b1'), { s: on ? 1.06 : .9, o: on ? 1 : .45 });
    pose($('wh-bulb'), { o: on ? 1 : .25, s: on ? 1.08 : .92 });
    $('wh-bulb').style.filter = on ? 'drop-shadow(0 0 40px #7fe3ff)' : 'grayscale(1) brightness(.6)';
    // pills
    const pills = [...$('wh-pills').children];
    $('wh-pills').style.visibility = t > L[2] - .2 && t < L[3] + .5 ? 'visible' : 'hidden';
    pills.forEach((p, i) => vis(p, t, L[2] + .2 + i * .45, L[3]));
    // examples
    const ex = [...$('wh-ex').children];
    $('wh-ex').style.visibility = t > L[3] - .2 && t < L[4] + .5 ? 'visible' : 'hidden';
    ex.forEach((e, i) => { vis(e, t, L[3] + .4 + i * .7, L[4] - .1, { dy: 120 }); e.style.transform += ` translateY(${Math.sin(t * 3 + i) * 8}px)`; });
    // signal chart
    const sig = $('wh-sig');
    vis(sig, t, L[4] - .05, 1e9, { dy: 100 });
    if (t > L[4] - .1) {
      const amp = lerp(10, 70, ease(prog(t, L[5], 3)));
      const W = 110, x0 = 40, shift = (t - L[4]) * 90;
      let d = '';
      for (let px = 0; px <= 900; px += 4) {
        const u = (px + shift) / W; const bi = ((Math.floor(u) % bits.length) + bits.length) % bits.length;
        const base = bits[bi] ? 90 : 410;
        const nz = (Math.sin(px * .21 + t * 13) * .5 + Math.sin(px * .057 - t * 7) * .35 + (hash(Math.floor(px / 4) + Math.floor(t * 20) * 977) - .5) * .9) * amp;
        d += (px ? 'L' : 'M') + (x0 + px) + ' ' + (base + nz).toFixed(1);
      }
      $('wh-wave').setAttribute('d', d);
      dbs.forEach((b, k) => {
        const u0 = Math.floor(shift / W) + k; const bi = ((u0 % bits.length) + bits.length) % bits.length;
        const x = u0 * W - shift + 5;
        b.style.left = x + 'px'; setText(b, bits[bi]);
        b.style.opacity = x < -60 || x > 860 ? 0 : 1;
      });
      const lvl = Math.round(lerp(1, 4, prog(t, L[5], 3)));
      setText($('wh-noise'), '噪声强度 ' + '▮'.repeat(lvl) + '▯'.repeat(4 - lvl) + (lvl >= 3 ? '  依然 ✓' : ''));
    }
  } };
})();

/* ---------- PARTS ---------- */
(() => {
  const ids = ['pt-dp', 'pt-ctl', 'pt-mem', 'pt-io', 'pt-clk'];
  const order = ['pt-ctl', 'pt-io', 'pt-dp', 'pt-mem', 'pt-clk'];
  const dots = $('pt-dots'); for (let i = 0; i < 6; i++) dots.appendChild(document.createElement('i'));
  S.parts = { el: $('s-parts'), update(t, L, D) {
    order.forEach((id, i) => vis($(id), t, L[0] + .3 + i * .45, 1e9, { dy: 60 }));
    const act = t >= L[1] ? ids[Math.min(4, [L[1], L[2], L[3], L[4], L[5]].filter((x) => t >= x).length - 1)] : null;
    ids.forEach((id) => {
      const el = $(id), a = id === act;
      setCls(el, 'active', a);
      if (act && !a) el.style.opacity = Math.min(+el.style.opacity, .5);
      if (a) el.style.transform += ' scale(1.06)';
    });
    ['pt-l0', 'pt-l1', 'pt-l2', 'pt-l3'].forEach((id, i) => {
      const el = $(id); el.style.opacity = easeOut(prog(t, L[0] + 2.2 + i * .15, .5)) * .9; el.style.strokeDashoffset = -t * 60;
    });
    // data dots flowing io -> dp -> mem
    [...dots.children].forEach((d, i) => {
      const p = ((t * .35 + i / 6) % 1);
      const x = lerp(190, 900, p), y = 506;
      d.style.left = x + 'px'; d.style.top = y + 'px';
      d.style.opacity = prog(t, L[0] + 2.5, .5) * (act === 'pt-dp' || !act ? 1 : .5) * Math.sin(p * Math.PI);
    });
    const hb = 1 + .25 * pulse(t, .8, 7) * (act === 'pt-clk' ? 1.6 : .6);
    $('pt-heart').style.transform = `scale(${hb})`;
    const rr = t > L[5] + 2.4 ? ease(prog(t, L[5] + 2.4, .8)) * 360 : 0;
    $('pt-reset').style.transform = `rotate(${rr}deg) scale(${1 + .25 * (1 - Math.abs(prog(t, L[5] + 2.4, .8) - .5) * 2)})`;
  } };
})();

/* ---------- KINDS ---------- */
(() => {
  const eqs = [['3 + 4', '7'], ['5 + 1', '6'], ['2 + 6', '8'], ['9 - 2', '7']];
  S.kinds = { el: $('s-kinds'), update(t, L, D) {
    vis($('kd-h'), t, L[0] - .1, 1e9, { ds: .6 });
    vis($('kd-c1'), t, L[1] - .1, 1e9, { dy: 80 });
    vis($('kd-c2'), t, L[2] - .1, 1e9, { dy: 80 });
    const k = Math.floor(Math.max(0, t - L[1]) / 1.1) % eqs.length;
    setText($('kd-in'), eqs[k][0]); setText($('kd-out'), eqs[k][1]);
    const fp = ((t - L[1]) % 1.1) / 1.1;
    $('kd-out').style.transform = `scale(${1 + .3 * Math.exp(-fp * 10)})`;
    // elevator: floors 1..5 then back
    const seq = [1, 2, 3, 4, 5, 4, 3, 2];
    const tt = Math.max(0, t - L[2]) / 1.0; const i = Math.floor(tt) % seq.length; const f = ease(tt - Math.floor(tt));
    const a = seq[i], b = seq[(i + 1) % seq.length];
    const pos = lerp(a, b, Math.min(1, f * 1.4));
    $('kd-car').style.top = (360 - 72 - (pos - 1) * 72) + 'px';
    setText($('kd-floor'), Math.round(pos)); setText($('kd-arrow'), b > a ? '⬆' : '⬇');
    const m = $('kd-mem'); m.style.transform = `scale(${1 + .12 * (t > L[3] ? pulse(t - L[3], .7, 5) : 0)})`;
  } };
})();

/* ---------- FLOW ---------- */
(() => {
  const steps = [['📋', '需求分析', '要做什么'], ['🧩', '系统架构', '划分模块'], ['📝', 'RTL 代码', 'Verilog'], ['🧪', '仿真验证', '功能/时序'],
    ['⚙️', '逻辑综合', 'EDA 自动'], ['⬇️', '下载到 FPGA', '配置芯片'], ['🔬', '硬件测试', '真机实测']];
  const list = $('fl-list');
  const els = steps.map((s, i) => {
    const d = document.createElement('div'); d.className = 'fl-step'; d.style.top = (i * 128 + 10) + 'px';
    d.innerHTML = `<div class="dot">${s[0]}</div><div class="tx">${s[1]}<small>${s[2]}</small></div><div class="res"></div>`;
    list.appendChild(d); return d;
  });
  S.flow = { el: $('s-flow'), update(t, L, D) {
    vis($('fl-q'), t, L[0] + .1, L[1] - .1, { ds: .5 });
    $('fl-list').style.visibility = t > L[1] - .3 ? 'visible' : 'hidden';
    const times = [L[1] + .1, L[1] + 1.6, L[2] + .2, L[2] + 2.6, L[3] + .4, L[3] + 2.8, L[4] - .3];
    els.forEach((e, i) => vis(e, t, L[1] - .2 + i * .12, 1e9, { dy: 30, dx: -60 }));
    let cur = -1; times.forEach((x, i) => { if (t >= x) cur = i; });
    // iteration loop in L4
    const failT = L[4] + .2, loopT = L[4] + 1.0, backT = L[4] + 2.2, passT = L[4] + 4.0;
    let active = cur;
    if (t >= backT && t < passT) active = 2 + Math.min(4, Math.floor((t - backT) / .36));
    if (t >= passT) active = 6;
    els.forEach((e, i) => { setCls(e, 'on', i <= Math.max(cur, active) && !(t >= backT && t < passT && i > active)); setCls(e, 'cur', i === active); });
    const fillH = active < 0 ? 0 : (active * 128 + 40);
    $('fl-fill').style.height = fillH + 'px';
    const res = els[6].querySelector('.res');
    setText(res, t >= passT ? '✅' : t >= failT ? '❌' : '');
    res.style.transform = `scale(${t >= failT ? backOut(prog(t, t >= passT ? passT : failT, .4)) : 0})`;
    const lp = $('fl-loop-p'); const len = 900;
    lp.style.strokeDasharray = `22 16`;
    $('fl-loop').style.opacity = ease(prog(t, loopT, .3)) * (1 - prog(t, passT, .4));
    lp.style.strokeDashoffset = t * 80;
    vis($('fl-iter'), t, loopT + .2, passT + .3, { ds: .5 });
  } };
})();

/* ---------- TOPDOWN ---------- */
(() => {
  const N = [
    { k: 'root', x: 540, y: 140, w: 420, t: '⏰ 数字时钟', lv: 0 },
    { k: 'a', x: 150, y: 420, w: 230, t: '时钟产生', lv: 1, p: 'root' }, { k: 'b', x: 410, y: 420, w: 230, t: '计时', lv: 1, p: 'root' },
    { k: 'c', x: 670, y: 420, w: 230, t: '按键', lv: 1, p: 'root' }, { k: 'd', x: 930, y: 420, w: 230, t: '显示', lv: 1, p: 'root' },
    { k: 's', x: 210, y: 720, w: 200, t: '秒计数', lv: 2, p: 'b' }, { k: 'm', x: 430, y: 720, w: 200, t: '分计数', lv: 2, p: 'b' }, { k: 'h', x: 650, y: 720, w: 200, t: '时计数', lv: 2, p: 'b' },
  ];
  const host = $('td-nodes'), svg = $('td-svg'); const by = {};
  N.forEach((n) => {
    const e = document.createElement('div'); e.className = 'node abs' + (n.lv === 0 ? ' root' : n.lv === 2 ? ' l3' : '');
    e.style.left = (n.x - n.w / 2) + 'px'; e.style.top = (n.y - 60) + 'px'; e.style.width = n.w + 'px'; e.textContent = n.t; host.appendChild(e); n.el = e; by[n.k] = n;
    if (n.p) {
      const p = by[n.p]; const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const my = (p.y + 60 + n.y - 60) / 2;
      path.setAttribute('d', `M${p.x} ${p.y + 60} C${p.x} ${my} ${n.x} ${my} ${n.x} ${n.y - 60}`); svg.appendChild(path); n.path = path;
    }
  });
  const bricks = [['➕ 加法器', '#35c2ff', 120, 760], ['🔢 计数器', '#3d8bff', 560, 760], ['🗃️ 寄存器', '#6a7dff', 120, 590], ['🔣 译码器', '#8ee8ff', 560, 590], ['🏠 大系统', '#cfefff', 120, 420]];
  const bh = $('td-blocks');
  const bEls = bricks.map((b, i) => { const e = document.createElement('div'); e.className = 'brick abs' + (i === 4 ? ' roof' : ''); e.innerHTML = b[0]; e.style.background = b[1]; e.style.left = b[2] + 'px'; e.style.top = b[3] + 'px'; bh.appendChild(e); return e; });
  S.topdown = { el: $('s-topdown'), update(t, L, D) {
    vis($('td-intro'), t, L[0] + .1, L[1] - .1, { ds: .6 });
    [...$('td-intro').children].forEach((c, i) => { c.style.transform = `translateY(${Math.sin(t * 3 + i * 2) * 10}px)`; });
    vis($('td-tag1'), t, L[1], L[3] - .1);
    $('td-svg').style.display = t > L[1] && t < L[3] + .5 ? 'block' : 'none';
    const lvT = [L[1] + .4, L[2] + .2, L[2] + 3.6];
    const treeOut = L[3] - .1;
    let k1 = 0, k2 = 0;
    N.forEach((n) => {
      const st = n.lv === 0 ? lvT[0] : n.lv === 1 ? lvT[1] + (k1++) * .35 : lvT[2] + (k2++) * .35;
      vis(n.el, t, st, treeOut, { dy: -40 });
      if (n.path) { const pl = n.path._len || (n.path._len = n.path.getTotalLength() + 2); n.path.style.strokeDasharray = pl; n.path.style.strokeDashoffset = pl * (1 - ease(prog(t, st - .2, .45))); n.path.style.opacity = 1 - prog(t, treeOut, .3); }
    });
    if (t > L[2] + 3.4 && t < treeOut) { by.b.el.style.boxShadow = `0 0 ${30 + 30 * pulse(t, .6)}px rgba(70,150,255,.8)`; } else by.b.el.style.boxShadow = '';
    // bricks
    vis($('td-tag2'), t, L[3], L[4] - .1);
    bEls.forEach((e, i) => {
      const st = L[3] + .3 + i * .7;
      const p = prog(t, st, .55);
      const y = -700 * (1 - easeOut(p)) + (p >= 1 ? 0 : 0);
      const bounce = p >= 1 ? Math.sin(prog(t, st + .55, .3) * Math.PI) * -18 : 0;
      const o = (p > 0 ? 1 : 0) * (1 - prog(t, L[4] - .1, .35));
      pose(e, { o, y: y + bounce });
      e.style.visibility = o > 0 ? 'visible' : 'hidden';
    });
    const cb = $('td-combo');
    vis(cb, t, L[4] + .1, 1e9, { dy: 80 });
  } };
})();

/* ---------- DESCRIBE ---------- */
(() => {
  const code = 'module and_gate(\n  input  a,\n  input  b,\n  output y\n);\n  assign y = a & b;\nendmodule';
  setCode($('ds-c0'), 'and_gate u1(.a(a), .b(b), .y(w1));\nmux2_1   u2(.a(w1), .b(a), .sel(sel), .y(y));');
  setCode($('ds-c1'), 'assign y = a & b;');
  setCode($('ds-c2'), 'always @(posedge clk)\n  cnt <= cnt + 1;');
  S.describe = { el: $('s-describe'), update(t, L, D) {
    vis($('ds-editor'), t, L[0] - .1, L[1] - .1, { dy: 80 });
    const n = Math.floor(clamp((t - L[0] - .2) / 2.4) * code.length);
    const pre = $('ds-code'); if (pre._n !== n) { pre._n = n; pre.innerHTML = hl(code.slice(0, n)).replace(/<\/span>$/, '<span class="caret"></span></span>'); }
    vis($('ds-hw'), t, L[0] + 2.8, L[1] - .1, { ds: .5 });
    $('ds-hw').querySelector('span').style.transform = `translateX(${Math.sin(t * 6) * 12}px)`;
    vis($('ds-tabs'), t, L[1], 1e9, { dy: -40 });
    const tabs = [...$('ds-tabs').children];
    const act = t >= L[4] ? 2 : t >= L[3] ? 1 : t >= L[2] ? 0 : -1;
    tabs.forEach((e, i) => { setCls(e, 'on', i === act); e.style.transform = `scale(${i === act ? 1.05 : 1})`; });
    if (t < L[2]) tabs.forEach((e, i) => { const p = backOut(prog(t, L[1] + .3 + i * .45, .4)); e.style.transform = `scale(${lerp(.6, 1, p)})`; e.style.opacity = clamp(p); });
    else tabs.forEach((e) => e.style.opacity = 1);
    vis($('ds-p0'), t, L[2], L[3] - .05, { dx: 200, dy: 0 });
    vis($('ds-p1'), t, L[3], L[4] - .05, { dx: 200, dy: 0 });
    vis($('ds-p2'), t, L[4], 1e9, { dx: 200, dy: 0 });
    $('ds-w1').style.strokeDasharray = '20 14'; $('ds-w1').style.strokeDashoffset = -t * 80;
    const k = Math.floor(Math.max(0, t - L[3]) / .9) % 4; const a = [1, 1, 0, 1][k], b = [1, 0, 1, 1][(k)] , y = a & b;
    setText($('ds-a'), 'a=' + a); setText($('ds-b'), 'b=' + b); setText($('ds-y'), 'y=' + y);
    setCls($('ds-a'), 'one', a); setCls($('ds-b'), 'one', b); setCls($('ds-y'), 'one', y);
    const per = .55; const c = Math.max(0, Math.floor((t - L[4] - .4) / per));
    setText($('ds-cnt'), c % 100);
    $('ds-heart').style.transform = `scale(${1 + .35 * pulse(t - L[4] - .4, per, 9)})`;
  } };
})();

/* ---------- GATES ---------- */
(() => {
  const tt = $('gt-tt'); tt.innerHTML = '<div class="tt-h">真值表 a b → y</div>';
  const rows = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<div class="in">${a} ${b}</div><div class="out"></div>`; tt.appendChild(r); return { r, a, b }; });
  const burst = $('gt-burst'); for (let i = 0; i < 12; i++) { const s = document.createElement('i'); s.style.transform = `rotate(${i * 30}deg) translateY(-120px)`; burst.appendChild(s); }
  const F = { and: (a, b) => a & b, or: (a, b) => a | b, xor: (a, b) => a ^ b };
  const NAMES = { and: '与门 AND', or: '或门 OR', xor: '异或门 XOR' }, OPS = { and: '&', or: '|', xor: '^' };
  const A = [240, 370], B = [240, 530];
  S.gates = { el: $('s-gates'), update(t, L, D) {
    const type = t >= L[4] ? 'xor' : t >= L[3] ? 'or' : 'and';
    const taps = [[L[2] + .35, 'a', 1], [L[2] + 1.35, 'b', 1], [L[3] + 1.0, 'a', 0], [L[4] + 1.15, 'a', 1], [L[4] + 2.3, 'b', 0]];
    let a = 0, b = 0, lastOn = -1e9, prevY = 0;
    // replay events to find state and last rising time of y
    const evs = [[L[3], null], [L[4], null], ...taps.map((x) => [x[0], x])].sort((p, q) => p[0] - q[0]);
    let curType = 'and';
    for (const [tm, e] of evs) {
      if (tm > t) break;
      if (!e) curType = tm >= L[4] ? 'xor' : 'or'; else if (e[1] === 'a') a = e[2]; else b = e[2];
      const y = F[curType](a, b); if (y && !prevY) lastOn = tm; prevY = y;
    }
    const y = F[type](a, b);
    vis($('gt-code'), t, L[0], 1e9, { dy: -40 });
    setCode($('gt-codetext'), `assign y = a {{MARK}}${OPS[type]}{{/MARK}} b;`);
    setText($('gt-name'), NAMES[type]);
    const sw = (tm) => backOut(prog(t, tm, .5));
    $('gt-name').style.transform = `scale(${t > L[3] ? lerp(.6, 1, Math.min(sw(L[3]), t >= L[4] ? sw(L[4]) : 1)) : 1})`;
    const andO = 1 - prog(t, L[3], .3), orO = prog(t, L[3], .3);
    $('gt-and').style.opacity = andO; $('gt-or').style.opacity = orO; $('gt-xor').style.opacity = prog(t, L[4], .3);
    setText($('gt-sym'), OPS[type] === '&' ? '&' : OPS[type] === '|' ? '≥1' : '=1');
    $('gt-sym').setAttribute('x', type === 'and' ? 130 : 120);
    const ta = $('gt-ta'), tb = $('gt-tb');
    setCls(ta, 'on', a); setCls(tb, 'on', b);
    ta.querySelector('.knob').style.left = a ? '96px' : '8px'; tb.querySelector('.knob').style.left = b ? '96px' : '8px';
    setText(ta.querySelector('.tv'), a); setText(tb.querySelector('.tv'), b);
    setCls($('gt-wa'), 'on', a); setCls($('gt-wb'), 'on', b); setCls($('gt-wy'), 'on', y);
    const led = $('gt-led'); setCls(led, 'on', y);
    led.style.transform = `scale(${y ? 1 + .18 * Math.exp(-(t - lastOn) * 5) : 1})`;
    const bp = (t - lastOn) / .6;
    burst.style.opacity = y && bp < 1 ? 1 - bp : 0; burst.style.transform = `scale(${.6 + bp})`;
    rows.forEach(({ r, a: ra, b: rb }) => { const ry = F[type](ra, rb); const o = r.querySelector('.out'); setText(o, ry); setCls(o, 'one', ry); setCls(r, 'cur', ra === a && rb === b); });
    vis(tt, t, L[0] + .4, 1e9, { dy: 60 });
    const path = taps.map(([tm, w]) => [tm, (w === 'a' ? A : B)[0], (w === 'a' ? A : B)[1], 1]);
    fingerState = fingerPath(t, path, .6);
  } };
})();

/* ---------- MUX ---------- */
(() => {
  const g = $('mx-pk'); const pool = [];
  for (let i = 0; i < 16; i++) { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', 22); g.appendChild(c); pool.push(c); }
  const pa = $('mx-pa'), pb = $('mx-pb'), py = $('mx-py');
  const la = pa.getTotalLength(), lb = pb.getTotalLength(), ly = py.getTotalLength();
  const T_IN = 1.5, T_OUT = 1.3, GAP = .9;
  S.mux = { el: $('s-mux'), update(t, L, D) {
    const tapT = L[2] + .3, tapBack = 1e9;
    const sel = (tm) => (tm >= tapT ? 1 : 0);
    const s = sel(t);
    const bp = ease(prog(t, tapT, .35)); const bl = $('mx-blade');
    bl.setAttribute('y2', lerp(300, 400, s ? bp : 0));
    const tg = $('mx-sel'); setCls(tg, 'on', s); tg.querySelector('.knob').style.left = s ? '96px' : '8px'; setText(tg.querySelector('.tv'), s);
    setCls($('mx-selw'), 'on', s);
    setCls(pa, 'on', !s); setCls(pb, 'on', s);
    let k = 0; let lastOut = null;
    for (const src of ['a', 'b']) {
      const off = src === 'a' ? 0 : GAP / 2; const path = src === 'a' ? pa : pb; const len = src === 'a' ? la : lb;
      const n0 = Math.max(0, Math.floor((t - off - T_IN - T_OUT) / GAP)), n1 = Math.floor((t - off) / GAP);
      for (let n = n0; n <= n1 && k < pool.length; n++) {
        const birth = n * GAP + off, age = t - birth; if (age < 0) continue;
        const c = pool[k++]; c.setAttribute('class', 'pk-' + src); let pt, o = 1;
        if (age < T_IN) pt = path.getPointAtLength(len * age / T_IN);
        else {
          const tc = birth + T_IN; const chosen = (sel(tc) ? 'b' : 'a') === src;
          if (!chosen) { pt = path.getPointAtLength(len); o = 1 - (age - T_IN) / .3; if (o <= 0) { c.style.opacity = 0; continue; } }
          else { const q = (age - T_IN) / T_OUT; if (q > 1) { c.style.opacity = 0; continue; } pt = py.getPointAtLength(ly * q); lastOut = src; }
        }
        c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y); c.style.opacity = o * prog(t, .2, .4);
      }
    }
    for (; k < pool.length; k++) pool[k].style.opacity = 0;
    const ob = $('mx-out'); setText(ob, s ? 'b' : 'a'); ob.style.borderColor = s ? '#ff5c8a' : '#35c2ff'; ob.style.color = s ? '#ff8fb0' : '#8ee8ff';
    vis($('mx-code'), t, L[3] - .3, 1e9, { dy: 80 });
    setCode($('mx-codetext'), s ? 'assign y = sel ? {{MARK}}b{{/MARK}} : a;' : 'assign y = sel ? b : {{MARK}}a{{/MARK}};');
    fingerState = fingerPath(t, [[tapT, 530, 685, 1]], .8);
  } };
})();

/* ---------- DFF ---------- */
(() => {
  const X0 = 140, X1 = 960, CYC = 8; const sx = (u) => X0 + (u / CYC) * (X1 - X0);
  const dT = [[0, 0], [.2, 1], [.9, 0], [1.2, 1], [1.35, 0], [1.75, 1], [2.1, 0], [2.3, 1], [2.75, 0], [3.1, 1], [3.3, 0], [3.7, 1], [4.25, 0], [4.6, 1], [4.75, 0], [5.2, 1], [5.65, 0], [6.1, 1], [6.3, 0], [6.7, 1], [7.3, 0], [7.6, 1]];
  const dAt = (u) => { let v = 0; for (const [x, b] of dT) if (u >= x) v = b; return v; };
  const edges = []; for (let e = .5; e < CYC; e += 1) edges.push(e);
  const clkAt = (u) => ((u % 1) >= .5 ? 1 : 0);
  const qAt = (u) => { let v = 0; for (const e of edges) if (u >= e) v = dAt(e); return v; };
  const Y = { clk: [70, 130], d: [220, 280], q: [370, 430] };
  const wf = (fn, row) => { let d = '', prev = null; for (let u = 0; u <= CYC + 1e-6; u += .01) { const v = fn(Math.min(u, CYC - 1e-6)); const y = v ? Y[row][0] : Y[row][1]; const x = sx(u); if (prev === null) d += `M${x} ${y}`; else if (v !== prev) d += `L${x} ${prev ? Y[row][0] : Y[row][1]}L${x} ${y}`; prev = v; } return d + `L${sx(CYC)} ${prev ? Y[row][0] : Y[row][1]}`; };
  $('ff-clk').setAttribute('d', wf(clkAt, 'clk')); $('ff-d').setAttribute('d', wf(dAt, 'd')); $('ff-q').setAttribute('d', wf(qAt, 'q'));
  const eg = $('ff-edges');
  const edgeEls = edges.map((e) => { const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.setAttribute('x1', sx(e)); l.setAttribute('x2', sx(e)); l.setAttribute('y1', 50); l.setAttribute('y2', 450); l.setAttribute('class', 'edge'); eg.appendChild(l); return l; });
  setCode($('ff-codetext'), 'always @(posedge clk) q <= d;');
  S.dff = { el: $('s-dff'), update(t, L, D) {
    vis($('ff-def'), t, L[0], L[1] - .1, { ds: .6 });
    vis($('ff-box'), t, L[1] - .05, 1e9, { dy: -60 });
    vis($('ff-code'), t, L[1] + .2, 1e9, { dy: 40 });
    vis($('ff-wave'), t, L[1] + .5, 1e9, { dy: 100 });
    const t0 = L[1] + 1.2, t1 = D - .5;
    const u = clamp((t - t0) / (t1 - t0)) * CYC;
    const x = sx(u);
    $('ff-cur').setAttribute('x1', x); $('ff-cur').setAttribute('x2', x);
    $('ff-cliprect').setAttribute('width', x);
    let lastEdge = -1; edges.forEach((e, i) => { if (u >= e) lastEdge = i; setCls(edgeEls[i], 'hit', u >= e && u - e < .35); });
    const uu = Math.min(u, CYC - 1e-6);
    const dv = dAt(uu), cv = clkAt(uu), qv = qAt(uu);
    [['ff-pd', dv], ['ff-pc', cv], ['ff-pq', qv]].forEach(([id, v]) => { setText($(id), v); setCls($(id), 'one', v); });
    const since = lastEdge >= 0 ? (u - edges[lastEdge]) : 9;
    const fl = $('ff-flash'); fl.style.opacity = since < .4 ? 1 - since / .4 : 0; fl.style.transform = `scale(${1 + since})`;
    $('ff-box').style.boxShadow = since < .3 ? `0 0 ${80 * (1 - since / .3)}px rgba(70,150,255,.8)` : '';
    // emphasise d wiggle during L2..L3
    $('ff-d').style.strokeWidth = t > L[2] && t < L[3] ? 10 : 7;
  } };
})();

/* ---------- COUNTER & SHIFT ---------- */
(() => {
  const cells = $('ct-cells'); for (let i = 0; i < 4; i++) { const c = document.createElement('div'); c.className = 'cell'; cells.appendChild(c); }
  const cs = [...cells.children];
  setCode($('ct-codetext'), "cnt <= cnt + 1'b1;");
  setCode($('sh-codetext'), 'q <= {q[2:0], d};');
  const seq = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0];
  const host = $('sh-items'); const items = seq.map((b) => { const e = document.createElement('div'); e.className = 'shi' + (b ? ' one' : ''); e.textContent = b; host.appendChild(e); return e; });
  S.counter = { el: $('s-counter'), update(t, L, D) {
    const partB = L[2] - .1;
    vis($('ct-code'), t, L[0], partB, { dy: -40 });
    vis($('ct-reg'), t, L[0] + .2, partB, { dy: 80 });
    const P = .45, st = L[0] + .9;
    const n = Math.max(0, Math.floor((t - st) / P) + 1) * (t >= st ? 1 : 0);
    const v = n % 16;
    cs.forEach((c, i) => { const bit = (v >> (3 - i)) & 1; setText(c, bit); setCls(c, 'one', bit); });
    setText($('ct-dec'), v);
    const ph = t >= st ? ((t - st) % P) / P : 1;
    $('ct-heart').style.transform = `scale(${1 + .4 * Math.exp(-ph * 8) * (t >= st ? 1 : 0)})`;
    cs.forEach((c) => c.style.transform = `scale(${1 + .06 * Math.exp(-ph * 10)})`);
    const wrapN = 16; const wrapT = st + (wrapN - 1) * P;
    const w = $('ct-wrap'); const wo = t >= wrapT ? 1 - prog(t, wrapT + 2.6, .4) : 0;
    w.style.opacity = wo; w.style.transform = `scale(${lerp(.5, 1, backOut(prog(t, wrapT, .4)))})`;
    // shift register
    vis($('sh-code'), t, partB + .1, 1e9, { dy: -40 });
    vis($('sh-reg'), t, partB + .2, 1e9, { dy: 80 });
    const SP = .75, s0 = L[2] + .5;
    const c = Math.max(0, (t - s0) / SP); const cn = Math.floor(c); const f = ease(clamp((c - cn) / .4));
    const cc = cn + f;
    items.forEach((e, i) => {
      const slot = i - cc + 4; // 4 = waiting at d input, 0..3 inside
      const x = slot >= 4 ? 845 : 115 + slot * 180;
      const xx = slot > 4 ? 845 + (slot - 4) * 60 : x;
      e.style.left = xx + 'px';
      let o = 1; if (slot > 4) o = clamp(1 - (slot - 4)); if (slot < 0) o = clamp(1 + slot * 1.2);
      e.style.opacity = o; e.style.transform = slot < 0 ? `translateY(${-slot * 120}px) scale(${1 + slot * .3})` : '';
    });
  } };
})();

/* ---------- PARAM ---------- */
(() => {
  const bits = $('pm-bits'); const pbs = [];
  for (let i = 0; i < 16; i++) { const e = document.createElement('div'); e.className = 'pb'; bits.appendChild(e); pbs.push(e); }
  S.param = { el: $('s-param'), update(t, L, D) {
    const partB = L[2] - .1;
    const dragA = L[1] + .6, dragB = dragA + 1.2;
    const wp = ease(prog(t, dragA, dragB - dragA));
    const W = wp >= .5 ? 16 : 8;
    vis($('pm-code'), t, L[0], partB, { dy: -40 });
    setCode($('pm-codetext'), `counter #(parameter WIDTH = {{MARK}}${W}{{/MARK}})`);
    vis($('pm-slider'), t, L[0] + .3, partB);
    $('pm-knob').style.left = (wp * 100) + '%'; $('pm-fill').style.width = (wp * 100) + '%';
    const cnt = Math.floor(Math.max(0, t - L[0]) / .09) * 37 + 5;
    const rowsV = W === 16 ? 2 : 1;
    pbs.forEach((e, i) => {
      const row = Math.floor(i / 8), col = i % 8;
      const bitIdx = W - 1 - i; const bit = (cnt >> bitIdx) & 1;
      e.style.left = (col * 120 + 2) + 'px'; e.style.top = (row * 140 + (rowsV === 1 ? 70 : 0)) + 'px';
      const show = i < W;
      const appear = i >= 8 ? backOut(prog(t, dragA + .6 + (i - 8) * .05, .4)) : 1;
      const o = (show ? 1 : 0) * Math.min(1, appear) * (1 - prog(t, partB, .35)) * easeOut(prog(t, L[0] + .4 + (i < 8 ? i * .05 : 0), .4));
      e.style.opacity = o; e.style.transform = `scale(${i >= 8 ? appear : 1})`;
      setText(e, show ? bit : 0); setCls(e, 'one', show && bit);
    });
    const rg = $('pm-range'); vis(rg, t, L[0] + .6, partB);
    rg.innerHTML = W === 16 ? '<b>16</b> 位计数器：0 ~ <b>65535</b>' : '<b>8</b> 位计数器：0 ~ <b>255</b>';
    fingerState = t < partB ? fingerPath(t, [[dragA, 140, 365, 1], [dragB, 940, 365, 0]], .5) : null;
    if (fingerState && t > dragA && t < dragB) { fingerState.x = lerp(140, 940, wp); fingerState.press = .6; }
    // hierarchy
    vis($('pm-top'), t, L[2], 1e9, { ds: .9 });
    vis($('pm-u1'), t, L[2] + .5, 1e9, { dx: -500, dy: 0, din: .6 });
    vis($('pm-u2'), t, L[2] + 1.2, 1e9, { dx: 500, dy: 0, din: .6 });
    const svg = $('pm-svg'); svg.style.opacity = prog(t, L[2] + 1.8, .4);
    const w1 = $('pm-w1'); w1.style.strokeDasharray = '20 14'; w1.style.strokeDashoffset = -t * 80;
    ['pm-wl', 'pm-pa', 'pm-pb', 'pm-ps', 'pm-py'].forEach((id, i) => vis($(id), t, L[2] + 1.9 + i * .1, 1e9, { dy: 20 }));
    vis($('pm-badge'), t, L[3] - .1, 1e9, { ds: .5 });
    if (t > L[3]) $('pm-top').style.boxShadow = `0 0 ${40 + 30 * pulse(t, 1)}px rgba(70,150,255,.45)`; else $('pm-top').style.boxShadow = '';
  } };
})();

/* ---------- RAM ---------- */
(() => {
  const grid = $('rm-grid'); const mem = []; const cells = [];
  for (let i = 0; i < 16; i++) { mem.push(Math.floor(hash(i + 3) * 256)); const c = document.createElement('div'); c.className = 'rc'; c.innerHTML = `<small>${i}</small><b></b>`; grid.appendChild(c); cells.push(c); }
  const hex = (v) => v.toString(16).toUpperCase().padStart(2, '0');
  const cellPos = (i) => [50 + (i % 4) * 164 + 75, 170 + Math.floor(i / 4) * 160 + 73];
  S.ram = { el: $('s-ram'), update(t, L, D) {
    vis($('rm-h'), t, L[0], 1e9, { dy: -30 });
    cells.forEach((c, i) => vis(c, t, L[0] + .3 + i * .05, 1e9, { dy: 30 }));
    vis($('rm-sigs'), t, L[0] + 1, 1e9, { dx: 200, dy: 0 });
    const ops = [
      { at: L[1] + .3, edge: L[1] + 1.4, we: 1, addr: 5, din: 0xA7 },
      { at: L[1] + 2.3, edge: L[1] + 3.4, we: 1, addr: 9, din: 0x3C },
      { at: L[2] + .1, edge: L[2] + .9, we: 0, addr: 5, din: null },
    ];
    const m = mem.slice(); let cur = null, dout = null, edgeAge = 9, lastWrite = null;
    for (const op of ops) {
      if (t >= op.at) cur = op;
      if (t >= op.edge) { if (op.we) { m[op.addr] = op.din; lastWrite = op; } dout = m[op.addr]; edgeAge = t - op.edge; }
    }
    cells.forEach((c, i) => { setText(c.querySelector('b'), hex(m[i])); setCls(c, 'sel', cur && cur.addr === i); });
    cells.forEach((c, i) => setCls(c, 'hit', lastWrite && lastWrite.addr === i && edgeAge < .6 && cur && cur.we));
    setText($('rm-we'), cur ? cur.we : 0); setCls($('rm-we'), 'one', cur && cur.we);
    setText($('rm-addr'), cur ? cur.addr : 0);
    setText($('rm-din'), cur && cur.din != null ? hex(cur.din) : '--');
    setText($('rm-dout'), dout == null ? '--' : hex(dout));
    $('rm-dout').style.transform = `scale(${1 + .3 * Math.exp(-edgeAge * 6)})`;
    $('rm-clk').style.transform = `scale(${1 + .5 * Math.exp(-edgeAge * 7)})`;
    // flying byte: from din (right panel) to cell before edge
    const fly = $('rm-fly'); let fo = 0;
    for (const op of ops) if (op.we && t >= op.edge - .8 && t < op.edge + .1) {
      const p = ease(prog(t, op.edge - .8, .8)); const [cx, cy] = cellPos(op.addr);
      const x = lerp(860, cx - 50, p), y = lerp(170 + 3 * 128 + 10, cy - 40, p);
      fly.style.left = x + 'px'; fly.style.top = y + 'px'; setText(fly, hex(op.din)); fo = 1 - prog(t, op.edge, .1);
    }
    fly.style.opacity = fo;
    vis($('rm-fpga'), t, L[3], 1e9, { dy: 100 });
    [...document.querySelectorAll('.fp-chip i')].forEach((e, i) => e.style.opacity = .35 + .65 * (hash(i + Math.floor(t * 6) * 5) > .4));
  } };
})();

/* ---------- HABITS ---------- */
(() => {
  S.habits = { el: $('s-habits'), update(t, L, D) {
    vis($('hb-h'), t, L[0] - .1, 1e9, { ds: .6 });
    vis($('hb-1'), t, L[1], 1e9, { dx: -300, dy: 0 });
    vis($('hb-2'), t, L[2], 1e9, { dx: 300, dy: 0 });
    vis($('hb-3'), t, L[3], 1e9, { dx: -300, dy: 0 });
    const on = pulse(t, .8, 8) > .4;
    document.querySelectorAll('.sync i').forEach((e) => setCls(e, 'on', on));
    [...document.querySelectorAll('#hb-3 .tags span')].forEach((e, i) => vis(e, t, L[3] + .8 + i * .6, 1e9, { ds: .4 }));
    [...document.querySelectorAll('#hb-2 .assign-row')].forEach((e, i) => vis(e, t, L[2] + 1.6 + i * 1.6, 1e9, { dx: 80, dy: 0 }));
  } };
})();

/* ---------- OUTRO ---------- */
(() => {
  const src = ['module counter(', '  input clk, rst_n,', '  output reg [3:0] cnt', ');', 'always @(posedge clk)', '  cnt <= cnt + 1;', 'endmodule', '',
    'assign y = sel ? b : a;', 'assign y = a & b;', 'always @(posedge clk)', '  q <= {q[2:0], d};', ''].join('\n');
  setCode($('ot-code'), src + '\n' + src);
  S.outro = { el: $('s-outro'), update(t, L, D) {
    const ti = $('ot-title'); vis(ti, t, L[0], 1e9, { ds: .4 }); ti.style.transform += ` rotate(${Math.sin(t * 2) * 1.5}deg)`;
    const ch = [...$('ot-chain').children];
    ch.forEach((e, i) => vis(e, t, L[1] + i * .55, 1e9, { ds: .5, dy: 30 }));
    vis($('ot-phone'), t, L[2] + .2, 1e9, { dy: 160, ds: .9, din: .8 });
    $('ot-code').style.transform = `translateY(${-((Math.max(0, t - L[2]) * 30) % (13 * 33))}px)`;
    vis($('ot-end'), t, L[2] + 2.6, 1e9, { dy: 30, din: .8 });
  } };
})();

/* ===================================================================== */
let TL = null, chipLast = null;
function setup(tl) {
  TL = tl;
  const bars = $('bars'); bars.innerHTML = '';
  TL.scenes.forEach(() => { const s = document.createElement('div'); s.className = 'seg'; s.innerHTML = '<i></i>'; bars.appendChild(s); });
}
function subHTML(s) {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\[\[(.+?)\]\]/g, '<span class="hl">$1</span>');
}
window.renderFrame = function (t) {
  // background drift
  document.querySelector('.b1').style.transform = `translate(${Math.sin(t * .3) * 80}px,${Math.cos(t * .23) * 60}px)`;
  document.querySelector('.b2').style.transform = `translate(${Math.cos(t * .27) * 90}px,${Math.sin(t * .31) * 70}px)`;
  document.querySelector('.b3').style.transform = `translate(${Math.sin(t * .21) * 100}px,${Math.cos(t * .19) * 40}px)`;
  $('grid').style.backgroundPosition = `0px ${(t * 12) % 44}px`;
  fingerState = null;
  let idx = TL.scenes.findIndex((s) => t >= s.start && t < s.end); if (idx < 0) idx = TL.scenes.length - 1;
  TL.scenes.forEach((sc, i) => {
    const S0 = S[sc.id]; if (!S0) return;
    const el = S0.el;
    if (i !== idx) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.style.visibility = 'visible';
    const lt = t - sc.start, D = sc.end - sc.start;
    const L = sc.lines.map((l) => l.start - sc.start);
    const lead = sc.lead || 0, hasCard = lead > 1;
    const fin = prog(lt, hasCard ? lead - .45 : 0, .35), fout = i === TL.scenes.length - 1 ? 0 : prog(lt, D - .28, .28);
    el.style.opacity = fin * (1 - fout);
    el.style.transform = `translateY(${(1 - easeOut(fin)) * 30}px) scale(${1 - .04 * fout})`;
    drawCard(sc, lt, hasCard ? lead : 0);
    S0.update(lt, L, D);
  });
  drawFinger(fingerState);
  $('fadeout').style.opacity = ease(prog(t, TL.duration - 1.6, 1.5));
  // progress bars
  [...$('bars').children].forEach((b, i) => { const sc = TL.scenes[i]; b.firstChild.style.width = (clamp((t - sc.start) / (sc.end - sc.start)) * 100) + '%'; });
  // chip title
  const sc = TL.scenes[idx];
  const ct = $('chipText');
  if (chipLast !== sc.chip) { chipLast = sc.chip; ct.textContent = sc.chip; }
  const cp = prog(t - sc.start, 0, .5);
  ct.style.transform = `translateX(${(1 - easeOut(cp)) * -80}px)`; ct.style.opacity = easeOut(cp);
  // subtitles
  let line = null; for (const l of sc.lines) if (t >= l.start - .05) line = l;
  const st = $('subText');
  if (!line) { if (st._l !== '') { st._l = ''; st.innerHTML = ''; } }
  else {
    if (st._l !== line.text) { st._l = line.text; st.innerHTML = subHTML(line.text); }
    const p = prog(t, line.start - .05, .22);
    st.style.transform = `translateY(${(1 - easeOut(p)) * 24}px) scale(${lerp(.94, 1, backOut(p))})`;
    st.style.opacity = easeOut(p) * (1 - prog(t, sc.end - .25, .25));
  }
};
function drawCard(sc, lt, lead) {
  const card = $('card');
  if (!lead) { card.style.opacity = 0; return; }
  const m = sc.chip.match(/^(\d+)\s*(.*)$/);
  setText($('cd-part'), m ? 'PART ' + m[1] : 'RECAP');
  setText($('cd-title'), m ? m[2] : sc.chip); setText($('cd-qt'), sc.q || '');
  const pin = prog(lt, 0, .45), pout = prog(lt, lead - .5, .4);
  card.style.opacity = easeOut(pin) * (1 - ease(pout));
  card.style.transform = `scale(${lerp(1.15, 1, easeOut(pin)) * lerp(1, .9, ease(pout))})`;
  card.querySelector('.cd-line').style.width = (420 * easeOut(prog(lt, .1, .6))) + 'px';
  $('cd-title').style.transform = `translateY(${(1 - easeOut(prog(lt, .1, .5))) * 40}px)`;
  $('cd-q').style.opacity = easeOut(prog(lt, .45, .4));
  $('cd-q').style.transform = `translateY(${(1 - easeOut(prog(lt, .45, .4))) * 30}px)`;
}
window.setupTimeline = setup;
if (window.__TIMELINE__) setup(window.__TIMELINE__);
