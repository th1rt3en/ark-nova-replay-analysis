// node shoot.mjs  ->  out/raw/<key>.png (750x1044, full card) and out/compact/<key>.png (small card, see compact.css) for every card of site/cards.html; long ability texts are shrunk until they fit the card
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff': 'font/woff' };
const srv = http.createServer((q, r) => { const f = path.join('site', decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const { ok } = JSON.parse(fs.readFileSync('rendered_keys.json', 'utf8'));
fs.mkdirSync('out/raw', { recursive: true });
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const pg = await b.newPage({ viewport: { width: 2000, height: 1200 } });
pg.on('requestfailed', r => console.log('failed', r.url()));
await pg.goto(`http://127.0.0.1:${port}/cards.html`, { waitUntil: 'networkidle' });
await pg.evaluate(() => document.fonts.ready);
const fit = await pg.evaluate(() => { const out = []; document.querySelectorAll('.c').forEach(c => {
  const w = c.querySelector('.ark-card-wrapper'), bt = c.querySelector('.ark-card-bottom'); const kind = c.id[1];
  if (!bt || kind === 'P' || kind === 'F') return;
  const t = [...bt.querySelectorAll('.animal-ability,.dijitTooltipContainer')]; if (!t.length) return;
  const R = w.getBoundingClientRect(), lim = R.top + R.height * (kind === 'S' ? 0.85 : 0.985);   // sponsors: the income/endgame bars start at 85 % of the card height
  const bot = () => Math.max(...t.map(e => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().bottom; }));
  let z = 1; while (bot() > lim && z > 0.6) { z -= 0.03; t.forEach(e => e.style.zoom = z); }
  if (z < 1) out.push([c.id.slice(1), +z.toFixed(2), bot() > lim]); }); return out; });
// project texts are meant to fit on 2 lines (BGA): a longer one (Herbivore Breeding Program) is shrunk until it does
const fitP = await pg.evaluate(() => { const out = []; document.querySelectorAll('.c').forEach(c => {
  if (c.id[1] !== 'P') return; const d = c.querySelector('.project-card-description'); if (!d) return;
  const lines = () => { const r = document.createRange(); r.selectNodeContents(d); return new Set([...r.getClientRects()].map(x => Math.round(x.top / (x.height * 0.6)))).size; };
  let z = 1; while (lines() > 2 && z > 0.8) { z -= 0.02; d.style.zoom = z; }
  if (z < 1) out.push([c.id.slice(1), +z.toFixed(2), lines()]); }); return out; });
console.log('text shrunk:', JSON.stringify(fit), 'project texts:', JSON.stringify(fitP));
for (const k of ok) await pg.locator('#c' + k).screenshot({ path: `out/raw/${k}.png`, omitBackground: true });
// the small cards: BGA's own no-description mode (data-card-desc="0" in arknova.css: bigger names and ability names, taller title bar, no Latin name / number) plus compact.css; the shrunk texts of the full cards are not needed any more
fs.mkdirSync('out/compact', { recursive: true });
await pg.evaluate(() => { document.querySelectorAll('.animal-ability,.dijitTooltipContainer').forEach(e => e.style.zoom = ''); document.body.classList.add('compact'); document.body.setAttribute('data-card-desc', '0'); });
for (const k of ok) await pg.locator('#c' + k).screenshot({ path: `out/compact/${k}.png`, omitBackground: true });

// the strips of the conservation projects (the project area of the page): the icon(s) and the three slots alone on a transparent background (bare.css), with the boxes of the parts for strips.py
fs.mkdirSync('out/bare', { recursive: true });
await pg.evaluate(() => { document.body.classList.remove('compact'); document.body.removeAttribute('data-card-desc'); document.body.classList.add('bare'); });
const geo = {};
for (const k of ok.filter(k => k[0] === 'P')) {
  geo[k] = await pg.evaluate((id) => { const c = document.getElementById('c' + id), C = c.getBoundingClientRect();
    const box = (...els) => { const r = els.filter(Boolean).map(e => e.getBoundingClientRect()); const l = Math.min(...r.map(x => x.left)), t = Math.min(...r.map(x => x.top)), rr = Math.max(...r.map(x => x.right)), b = Math.max(...r.map(x => x.bottom)); return [l - C.left, t - C.top, rr - l, b - t].map(Math.round); };
    const slots = [...c.querySelectorAll('.project-card-slot')].map(s => { const ch = s.querySelector('.project-card-slot-cube-holder'); const R = s.getBoundingClientRect(), H = ch && ch.getBoundingClientRect();
      return { box: box(s, ...s.querySelectorAll('*')), anchor: H ? [H.left + H.width / 2 - C.left, H.top + H.height / 2 - C.top] : [R.left + R.width / 2 - C.left, R.top + R.height / 2 - C.top], anchor_is_holder: !!H }; });
    return { icon: box(c.querySelector('.project-card-top-left-icon')), slots }; }, k);
  await pg.locator('#c' + k).screenshot({ path: `out/bare/${k}.png`, omitBackground: true });
}
fs.writeFileSync('out/bare/geometry.json', JSON.stringify(geo));
await b.close(); srv.close();
