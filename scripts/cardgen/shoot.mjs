// node shoot.mjs  ->  out/raw/<key>.png (750x1044, full card) and out/compact/<key>.png (small card, see compact.css) for every card of site/cards.html; long ability texts are shrunk until they fit the card
import { PHOTO as LAYOUT_PHOTO, STRIPE, STRIPE_SMALL, CARD } from './layout.mjs';
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
// projects and endgame cards: the body under the (taller) photo is only 158 design px high, so what does not fit (score tables, long texts) is zoomed down until it lies between the stripe and the card's bottom
// layout check (layout.mjs): photo = PHOTO / CARD of the card height, stripe = STRIPE design px (large) / STRIPE_SMALL (small), for EVERY card
const geom = (tag) => pg.evaluate(([tag, PH, ST, STS, CD]) => { const bad = []; let n = 0; document.querySelectorAll('.c').forEach(c => { const w = c.querySelector('.ark-card-wrapper'), m = c.querySelector('.ark-card-middle'); if (!w || !m) return; n++;
  const W = w.getBoundingClientRect(), M = m.getBoundingClientRect(), top = (M.top - W.top) / W.height, hh = M.height / W.height * 520;
  if (Math.abs(top - PH / CD) > 0.002 || Math.abs(hh - (document.body.classList.contains('compact') ? STS : ST)) > 0.6) bad.push([c.id.slice(1), +top.toFixed(4), +hh.toFixed(1)]); }); return { checked: n, bad }; }, [tag, LAYOUT_PHOTO, STRIPE, STRIPE_SMALL, CARD]);
// animals with 3 requirements: the left column (cost, strength and the three requirement badges, .ark-card-top-left) is scaled down from its top left corner until the last badge ends above the stripe (0.86 at a 260 px photo); cards with fewer requirements are left alone
const fitReq = (photo) => pg.evaluate((photo) => { const out = []; document.querySelectorAll('.c').forEach(c => {
  if (c.id[1] !== 'A') return; const w = c.querySelector('.ark-card-wrapper'), el = c.querySelector('.ark-card-top-left'); if (!el) return;
  el.style.transform = '';
  if (el.querySelectorAll('.zoo-card-prerequisites > .zoo-card-badge').length < 3) return;
  el.style.transformOrigin = 'top left';
  const W = w.getBoundingClientRect(), lim = W.top + (photo - 8) / 520 * W.height;
  const box = () => { const r = [el, ...el.querySelectorAll('*')].map(e => e.getBoundingClientRect()).filter(x => x.width > 8 && x.height > 8); return { top: Math.min(...r.map(x => x.top)), bottom: Math.max(...r.map(x => x.bottom)) }; };
  const b = box(); if (b.bottom <= lim) return; const s = (lim - b.top) / (b.bottom - b.top); el.style.transform = `scale(${s})`; out.push([c.id.slice(1), +s.toFixed(2)]); }); return out; }, photo);
const fitBody = () => pg.evaluate(() => { const out = []; document.querySelectorAll('.c').forEach(c => {
  const k = c.id[1]; if (k !== 'P' && k !== 'F') return; const bt = c.querySelector('.ark-card-bottom'); if (!bt) return;
  const kids = [...bt.children].filter(e => getComputedStyle(e).position !== 'absolute'); if (!kids.length) return;
  kids.forEach(e => { e.style.zoom = ''; });
  const W_ = c.querySelector('.ark-card-wrapper').getBoundingClientRect(), mid = c.querySelector('.ark-card-middle').getBoundingClientRect();   // (limits: under the stripe, above the card's bottom edge)
  const over = () => { const B = { top: mid.bottom - 2, bottom: W_.bottom - 2 }; const r = kids.map(e => e.getBoundingClientRect()).filter(x => x.height > 0);
    return r.length && (Math.min(...r.map(x => x.top)) < B.top + 4 || Math.max(...r.map(x => x.bottom)) > B.bottom - 6); };
  let z = 1; while (over() && z > 0.5) { z -= 0.02; kids.forEach(e => { e.style.zoom = z; }); }
  if (z < 1) out.push([c.id.slice(1), +z.toFixed(2)]); }); return out; });
// project texts are meant to fit on 2 lines (BGA): a longer one (Herbivore Breeding Program) is shrunk until it does
const fitP = await pg.evaluate(() => { const out = []; document.querySelectorAll('.c').forEach(c => {
  if (c.id[1] !== 'P') return; const d = c.querySelector('.project-card-description'); if (!d) return;
  const lines = () => { const r = document.createRange(); r.selectNodeContents(d); return new Set([...r.getClientRects()].map(x => Math.round(x.top / (x.height * 0.6)))).size; };
  let z = 1; while (lines() > 2 && z > 0.8) { z -= 0.02; d.style.zoom = z; }
  if (z < 1) out.push([c.id.slice(1), +z.toFixed(2), lines()]); }); return out; });
console.log('layout check (large):', JSON.stringify(await geom('L')));
console.log('requirements scaled (large):', JSON.stringify(await fitReq(LAYOUT_PHOTO)));
const body = await fitBody();
console.log('body zoomed (projects, endgame):', JSON.stringify(body));
console.log('text shrunk:', JSON.stringify(fit), 'project texts:', JSON.stringify(fitP));
for (const k of ok) await pg.locator('#c' + k).screenshot({ path: `out/raw/${k}.png`, omitBackground: true });
// the small cards: BGA's own no-description mode (data-card-desc="0" in arknova.css: bigger names and ability names, taller title bar, no Latin name / number) plus compact.css; the shrunk texts of the full cards are not needed any more
fs.mkdirSync('out/compact', { recursive: true });
await pg.evaluate(() => { document.querySelectorAll('.animal-ability,.dijitTooltipContainer').forEach(e => e.style.zoom = ''); document.body.classList.add('compact'); document.body.setAttribute('data-card-desc', '0'); });
console.log('layout check (small):', JSON.stringify(await geom('S')));
console.log('requirements scaled (small):', JSON.stringify(await fitReq(LAYOUT_PHOTO)));
console.log('body zoomed (small):', JSON.stringify(await fitBody()));
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
