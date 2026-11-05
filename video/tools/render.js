// Frame-accurate renderer: drives scenes/index.html with Playwright and pipes
// screenshots into ffmpeg.
//   node tools/render.js preview 3.2 10 25.5   -> build/preview/*.png
//   node tools/render.js video [--workers 4] [--fps 30]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.PROJECT_DIR ? path.resolve(process.env.PROJECT_DIR) : path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const timeline = JSON.parse(fs.readFileSync(path.join(BUILD, 'timeline.json'), 'utf8'));
const pageUrl = 'file://' + path.join(ROOT, 'scenes', 'index.html');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };

async function openPage(browser, scale = 1) {
  const page = await browser.newPage({ viewport: { width: (timeline.size || [1080, 1920])[0], height: (timeline.size || [1080, 1920])[1] }, deviceScaleFactor: scale });
  await page.addInitScript((tl) => { window.__TIMELINE__ = tl; }, timeline);
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(pageUrl);
  // warm up: visit every scene so all font subsets get requested
  for (const sc of timeline.scenes) for (let k = 0; k <= 6; k++) await page.evaluate((t) => window.renderFrame(t), sc.start + (sc.end - sc.start) * k / 6);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return page;
}

function run(cmd, a, input) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, a, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'inherit'] });
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(cmd + ' exit ' + c))));
    if (input) input(p.stdin);
  });
}

(async () => {
  const browser = await chromium.launch();
  if (args[0] === 'preview') {
    const dir = path.join(BUILD, 'preview'); fs.mkdirSync(dir, { recursive: true });
    const page = await openPage(browser, 0.5);
    for (const s of args.slice(1)) {
      const t = Number(s);
      await page.evaluate((t) => window.renderFrame(t), t);
      await page.screenshot({ path: path.join(dir, `t${t.toFixed(2)}.png`) });
    }
    await browser.close();
    return;
  }
  const fps = opt('--fps', 30), workers = opt('--workers', 4);
  const total = Math.ceil(timeline.duration * fps);
  const per = Math.ceil(total / workers);
  const segDir = path.join(BUILD, 'segments'); fs.mkdirSync(segDir, { recursive: true });
  const t0 = Date.now();
  await Promise.all([...Array(workers).keys()].map(async (w) => {
    const page = await openPage(browser, 1);
    const a = w * per, b = Math.min(total, a + per);
    const out = path.join(segDir, `seg${w}.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', String(timeline.crf || 19), '-pix_fmt', 'yuv420p', '-r', String(fps), out], { stdio: ['pipe', 'ignore', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
    for (let f = a; f < b; f++) {
      await page.evaluate((t) => window.renderFrame(t), f / fps);
      const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (w === 0 && (f - a) % 300 === 0) console.log(`worker0 ${f - a}/${b - a}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end(); await done; await page.close();
  }));
  await browser.close();
  const list = path.join(segDir, 'list.txt');
  fs.writeFileSync(list, [...Array(workers).keys()].map((w) => `file 'seg${w}.mp4'`).join('\n'));
  const outDir = path.join(ROOT, 'output'); fs.mkdirSync(outDir, { recursive: true });
  const final = path.join(outDir, timeline.output || 'digital_system_design_douyin.mp4');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', path.join(BUILD, 'audio_mix.wav'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
  console.log('done', final, ((Date.now() - t0) / 1000).toFixed(0) + 's');
})();
