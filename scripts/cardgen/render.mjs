// node render.mjs keys.json  ->  site/cards.html (every card at 2x design size = 750x1044, one <div id="c<key>"> each)
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
require('./harness/out.cjs');
const keys = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ok = [], missing = [];
let body = '';
for (const k of keys) {
  const kind = k[0], id = k.slice(1);
  const html = (kind === 'P' && +id.slice(0, 3) >= 133) ? globalThis.renderMW(id) : globalThis.renderCard(kind, id);
  if (!html) { missing.push(k); continue; }
  ok.push(k); body += `<div class="c" id="c${k}">${html}</div>`;
}
fs.writeFileSync('site/cards.html', `<!doctype html><meta charset=utf8><link rel=stylesheet href=tw.css><link rel=stylesheet href=arknova.css><link rel=stylesheet href=mw.css><link rel=stylesheet href=compact.css><link rel=stylesheet href=bare.css><style>:root{--arkNovaZooCardScale:2}html,body{background:transparent}body{margin:10px;display:flex;flex-wrap:wrap;gap:10px}.c{display:inline-block}.ark-card-wrapper{box-shadow:none!important}</style>${body}`);
fs.writeFileSync('rendered_keys.json', JSON.stringify({ ok, missing }));
console.log(ok.length, 'cards rendered; missing from the card data:', missing.join(' ') || 'none');
