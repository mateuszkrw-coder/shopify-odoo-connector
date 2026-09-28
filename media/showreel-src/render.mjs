// Renders the showreel frame-by-frame with headless Chromium.
//   node render.mjs --out=frames                 all 900 frames (60 fps)
//   node render.mjs --times=1.2,3.4 --out=stills specific moments
// Options: --samples=24 (motion-blur sub-frames) --shutter=1 --workers=4 --debug
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const argv = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const FPS = 60, DUR = 15;
const out = path.resolve(argv.out || 'frames');
const samples = +(argv.samples ?? 24);
const shutter = +(argv.shutter ?? 1);
const workers = +(argv.workers ?? 4);

let jobs = [];
if (argv.times) {
  jobs = String(argv.times).split(',').map(Number).map(t => ({ t, name: `t_${t.toFixed(3)}.png` }));
} else {
  const from = +(argv.from ?? 0), to = +(argv.to ?? FPS * DUR), step = +(argv.step ?? 1);
  for (let f = from; f < to; f += step) jobs.push({ t: f / FPS, name: `f_${String(f).padStart(4, '0')}.png` });
}
fs.mkdirSync(out, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html${argv.debug ? '?debug' : ''}`;

const browser = await chromium.launch({
  args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text'],
});
const t0 = Date.now();
let next = 0, done = 0;
async function worker() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('[pageerror]', e); process.exitCode = 1; });
  page.on('console', m => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true);
  while (next < jobs.length) {
    const job = jobs[next++];
    await page.evaluate(([t, s, sh]) => window.renderAt(t, s, sh), [job.t, samples, shutter]);
    await page.screenshot({ path: path.join(out, job.name), clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    if (++done % 60 === 0) console.log(`${done}/${jobs.length}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  await page.close();
}
await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, worker));
await browser.close();
server.close();
console.log(`rendered ${jobs.length} frame(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
