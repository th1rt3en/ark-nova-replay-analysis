/* The maps of the library (library/maps/index.html, css/library_room.css): a school wall map on walnut panelling, lit by a fire out of the picture at the
   bottom left. The sheet hangs between two wooden rods with black end knobs, on a cord over a brass hook, and shows the full player board of one zoo map in
   clean print: the bonus / project panel (left), the map (middle) and the association strip (right), as the viewer draws them at the start of a game without
   player pieces (web/wall_maps/, made by scripts/build_library_maps.py, with index.json: order, names, abilities, picture sizes); under it the map's ability.
   The cards of the map drawer under the sheet pick a map (the drawer opens with its brass pull or M; the arrow keys step through the maps): the sheet rolls up onto its bottom rod and the next one rolls down. The maps 1-8
   and their alternate sides 1a-8a are the two sides of one sheet: one label, the alternate side first; a click on the sheet (or Enter / Space on it) turns
   it over (js/map_flip.js, a person turning the hanging map round in 3D, from the pictures web/wall_maps/<id>-sheet.webp). The map on the wall is kept in
   the address (#8a). The wall and the paper are drawn from noise on canvases (no photos). The turn has a sound (web/sounds/map-flip.wav) while the
   library's sound is on (js/library_sound.js). */
import { mapTextHtml } from './map_text.js';
import { isSoundOn, onSoundChange, getSoundVolume } from './library_sound.js?v=20261120a';
const stage = document.getElementById('mstage'), room = document.getElementById('room'), rig = document.getElementById('rig'), rack = document.getElementById('rack');
let MAPS = [], MI = 0, busy = false, ENTRIES = [], lastRig = null;

/* ---------- the stage: 1920 x 1080, scaled to the room ---------- */
function fit() { stage.style.transform = 'scale(' + room.clientWidth / 1920 + ')'; }
addEventListener('resize', fit);

/* ---------- noise, wood ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function noise2(seed) {
  const r = rng(seed), p = new Float32Array(4096); for (let i = 0; i < 4096; i++) p[i] = r();
  const h = (x, y) => p[((x * 73856093) ^ (y * 19349663)) & 4095];
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
}
const mix = (a, b, t) => a + (b - a) * t;
function wood(w, h, o) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data, n = noise2(o.seed || 1), n2 = noise2((o.seed || 1) + 77); const [D, M, L] = o.c, ring = o.ring || .05, warp = o.warp || 26;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = o.vert ? y : x, Y = o.vert ? x : y; const slow = n(X * .0008 + 3, Y * .007 + 9), wv = n(X * .0022, Y * .011) * warp + n(X * .009, Y * .03) * warp * .25; const r = .5 + .5 * Math.sin((Y * (.5 + slow) + wv) * ring * 6.2832);
    const st = n2(X * .006, Y * .55) * .6 + n2(X * .03, Y * 1.7) * .4; let t = r * .34 + st * .44 + slow * .22; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const i = (y * w + x) * 4, a = t < .5 ? D : M, b = t < .5 ? M : L, k = t < .5 ? t * 2 : (t - .5) * 2; d[i] = mix(a[0], b[0], k); d[i + 1] = mix(a[1], b[1], k); d[i + 2] = mix(a[2], b[2], k); d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); return c;
}

/* ---------- the wall: walnut, two rows of raised panels and a rail between them ---------- */
const WALNUT = [[34, 18, 10], [64, 34, 20], [96, 58, 34]], RAIL = [[46, 24, 14], [80, 44, 26], [118, 74, 44]];
function buildWall() {
  const g = document.getElementById('wall').getContext('2d');
  g.drawImage(wood(1920, 1080, { c: WALNUT, ring: .03, seed: 7, vert: true, warp: 40 }), 0, 0);
  const panel = (x, y, w, h) => {
    g.drawImage(wood(w, h, { c: RAIL, ring: .035, seed: x + y, vert: true, warp: 24 }), x, y); g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5); g.lineWidth = 2; g.strokeStyle = 'rgba(255,215,160,.13)'; g.strokeRect(x + 9, y + 9, w - 18, h - 18);
    const s = g.createLinearGradient(x, y, x + w, y + h); s.addColorStop(0, 'rgba(255,220,170,.08)'); s.addColorStop(1, 'rgba(0,0,0,.22)'); g.fillStyle = s; g.fillRect(x, y, w, h);
  };
  for (let i = 0; i < 6; i++) { panel(40 + i * 310, 40, 280, 560); panel(40 + i * 310, 640, 280, 380); }
  g.drawImage(wood(1920, 30, { c: WALNUT, ring: .05, seed: 5 }), 0, 606); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 634, 1920, 4);
  const v = g.createRadialGradient(960, 480, 200, 960, 560, 1150); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = v; g.fillRect(0, 0, 1920, 1080);
}

/* ---------- the paper: clean, a fine tooth and fibres ---------- */
const texCache = {};
function paperTex(w, h, seed) {
  const key = w + 'x' + h + ':' + seed; if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data, n = noise2(seed), f = noise2(seed + 9), r = rng(seed), base = [248, 240, 224];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, m = n(x * .004, y * .004) * .6 + n(x * .02, y * .02) * .4, fib = f(x * .25, y * .06) * .5 + f(x * .06, y * .25) * .5, tooth = (r() - .5) * .06;
    const ex = Math.min(x, w - x, y, h - y) / w, edge = Math.max(0, .05 - ex) * 1.2, k = 1 - (m * .06 + fib * .05) + tooth - edge; d[i] = base[0] * k; d[i + 1] = base[1] * k; d[i + 2] = base[2] * k; d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); return texCache[key] = c.toDataURL('image/jpeg', .85);
}

/* ---------- the sheet ---------- */
const el = (cls, st, html) => { const e = document.createElement('div'); if (cls) e.className = cls; if (st) Object.assign(e.style, st); if (html !== undefined) e.innerHTML = html; return e; };
const px = (v) => v + 'px';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rod = 'linear-gradient(180deg,#3a2010,#9a6634 22%,#e0aa6a 38%,#8a5428 70%,#2a1608)';
const KNOB = 'radial-gradient(circle at 35% 30%,#5a5a5a,#141414 60%,#000)';
const TOP = 84, RACK = 40;              // (the rod's place below the hook; the room kept free at the bottom: the closed map drawer and a small gap)
function geometry() {
  const m = MAPS[MI], s = { ...m.sizes, ...(m.board_box ? { board: m.board_box.slice(2) } : {}) }, H = 600, sc = (p) => Math.round(s[p][0] * H / s[p][1]);          // (board_box: the map's own box when something sticks out of the board picture, map 9)
  const pw = sc('proj'), bw = sc('board'), sw = sc('strip'), gap = 18, padX = 56, titleH = 116, legH = 178;
  return { m, H, pw, bw, sw, gap, padX, titleH, legH, w: pw + bw + sw + 2 * gap + 2 * padX, h: titleH + H + legH };
}
const pic = (id, part) => '/wall_maps/' + encodeURIComponent(id) + '-' + part + '.webp?v=20261118g';
function sheetEl(G) {
  const { m, H, pw, bw, sw, gap, padX, titleH, legH, w, h } = G, s = el('sheet', { width: px(w), height: px(h) }), tex = 'url(' + paperTex(Math.round(w / 2), Math.round(h / 2), 7 + MI) + ')';
  s.append(el('paper', { backgroundImage: tex, backgroundSize: '100% 100%' }));
  s.append(el('ttl', { top: '45px' }, '<div class="n">' + esc(m.name) + (/^(0|A)$/.test(String(m.id)) ? '' : ' <i>&middot; No. ' + esc(m.id) + '</i>') + '</div>'));
  const pl = el('plate', { left: px(padX), top: px(titleH), width: px(pw + bw + sw + 2 * gap), height: px(H) });
  [['proj', 0, pw, 'bonus and project panel'], ['board', pw + gap, bw, 'zoo map'], ['strip', pw + bw + 2 * gap, sw, 'association strip']].forEach(([part, x, wd, alt]) => {
    const i = document.createElement('img'); i.src = pic(m.id, part); i.alt = m.name + ': ' + alt; i.decoding = 'async'; Object.assign(i.style, { left: px(x), top: 0, width: px(wd), height: px(H) }); pl.append(i);
    if (part === 'board' && m.board_box) { const [bx, by, , bh] = m.board_box, k = H / bh; Object.assign(i.style, { left: px(x - bx * k), top: px(-by * k), width: px(m.sizes.board[0] * k), height: px(m.sizes.board[1] * k) }); }          // (the picture is larger than the map: map 9's markers stick out into the gaps)
  });
  s.append(pl);
  const ab = m.ability.length ? m.ability : ['No special ability.'], leg = el('leg', { top: px(titleH + H + 2), height: px(legH - 14) }, ab.map((a) => '<p' + (ab.length > 1 && a.replace(/<[^>]*>/g, '##').length < 90 ? ' class="nw"' : '') + '>' + mapTextHtml(a) + '</p>').join(''));
  s.append(leg);
  if (partner(m)) {                                                             // (a map with two sides: a small red stamp to the right of the title, the two sides stacked, the side on show inked solid; a click on the other half turns the map like a click on the sheet)
    const alt = /a$/.test(String(m.id)), st = el('stamp', { right: px(padX), top: px(titleH - 88) }, '<span' + (alt ? '' : ' class="on"') + '>Original</span><span' + (alt ? ' class="on"' : '') + '>Alternate</span>');
    st.setAttribute('aria-hidden', 'true'); st.querySelector('.on').addEventListener('click', (e) => e.stopPropagation()); s.append(st);
  }
  s.append(el('tex', { backgroundImage: tex, backgroundSize: '100% 100%' }));
  const sh = el('shade'); sh.style.background = 'linear-gradient(90deg,rgba(0,0,0,.10),rgba(255,250,235,.10) 18%,rgba(0,0,0,.05) 34%,rgba(255,250,235,.08) 55%,rgba(0,0,0,.08) 74%,rgba(255,250,235,.06) 88%,rgba(0,0,0,.14)),linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,0) 6%,rgba(0,0,0,0) 94%,rgba(0,0,0,.16))'; s.append(sh);
  ['left', 'right'].forEach((k) => s.append(el('tape', { [k]: 0, background: 'linear-gradient(90deg,' + (k === 'left' ? '#cfc2a2,#e8dcc0' : '#e8dcc0,#cfc2a2') + ')' })));
  return { s, leg };
}
// the legend's type starts at 27 px and shrinks until the whole ability fits (a short line of a two-line ability, class nw, must also stay on one line) (maps 9 and 10 have long texts)
function fitLegend(leg) { let f = 27; leg.style.fontSize = f + 'px'; while ((leg.scrollHeight > leg.clientHeight + 1 || [...leg.querySelectorAll('p.nw')].some((p) => p.scrollWidth > p.clientWidth + 1)) && f > 13) { f -= .5; leg.style.fontSize = f + 'px'; } }
function hardware(G) {
  const { w, h } = G, out = [];
  out.push(el('rod', { left: '-34px', top: px(TOP - 14), width: px(w + 68), height: '24px', background: rod, boxShadow: '0 6px 10px rgba(0,0,0,.5)' }));
  [-1, 1].forEach((s) => out.push(el('knob', { left: px(s < 0 ? -62 : w + 30), top: px(TOP - 20), width: '32px', height: '36px', background: KNOB, boxShadow: '0 4px 6px rgba(0,0,0,.6)' })));
  const bottom = [el('rod', { left: '-34px', top: px(TOP + h - 10), width: px(w + 68), height: '26px', background: rod, boxShadow: '0 8px 12px rgba(0,0,0,.55)' })];
  [-1, 1].forEach((s) => bottom.push(el('knob', { left: px(s < 0 ? -62 : w + 30), top: px(TOP + h - 16), width: '32px', height: '38px', background: KNOB, boxShadow: '0 4px 6px rgba(0,0,0,.6)' })));
  bottom.forEach((b) => b.classList.add('bottom'));
  return out.concat(bottom);
}
function render(anim) {
  rig.innerHTML = ''; const G = geometry();
  rig.style.width = px(G.w); rig.style.marginLeft = px(-G.w / 2);
  const cord = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); cord.setAttribute('width', G.w + 200); cord.setAttribute('height', TOP); cord.setAttribute('aria-hidden', 'true'); Object.assign(cord.style, { position: 'absolute', left: '-100px', top: 0, overflow: 'visible' });
  const d = 'M48 ' + (TOP - 4) + ' L' + (G.w / 2 + 100) + ' 22 L' + (G.w + 152) + ' ' + (TOP - 4);
  cord.innerHTML = '<path d="' + d + '" fill="none" stroke="#2a1c10" stroke-width="3.5"/><path d="' + d + '" fill="none" stroke="#a88a5a" stroke-width="1.5" stroke-dasharray="3 3"/><circle cx="' + (G.w / 2 + 100) + '" cy="18" r="11" fill="#b88a2e" stroke="#3a2808" stroke-width="2"/><circle cx="' + (G.w / 2 + 97) + '" cy="15" r="4" fill="#f4dc9a"/>';
  rig.append(cord);
  const wrap = el('', { position: 'absolute', left: 0, top: px(TOP), width: px(G.w), height: px(G.h) }), { s: sh, leg } = sheetEl(G);
  const shadow = el('', { position: 'absolute', left: '14px', top: '22px', width: px(G.w), height: px(G.h), background: 'rgba(0,0,0,.55)', filter: 'blur(18px)' });
  wrap.append(shadow, sh); rig.append(wrap);
  const hw = hardware(G); hw.forEach((h) => rig.append(h));
  fitLegend(leg);
  const need = TOP + G.h + 50, k = Math.min(1, (1080 - RACK) / need, 1760 / (G.w + 140));
  rig.style.transform = 'scale(' + k + ')'; rig.style.top = px((1080 - RACK - need * k) / 2);
  lastRig = { w: G.w, h: G.h, k, top: (1080 - RACK - need * k) / 2 };
  const other = partner(m(MI));
  if (other) {                                                                  // the sheet of a map with two sides: a click turns it over
    Object.assign(sh, { tabIndex: 0 }); sh.setAttribute('role', 'button');
    sh.setAttribute('aria-label', 'Turn the map over to ' + (other.id.endsWith('a') ? 'its alternate side' : 'the base side') + ' (map ' + other.id + ')');
    sh.addEventListener('click', turnOver);
    sh.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); turnOver(); } });
    prepareTurn(m(MI), other);
  }
  if (anim && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const D = 950, bot = hw.filter((h) => h.classList.contains('bottom'));
    // the sheet comes down only once its pictures are decoded (the new <img> elements decode late even when the files are loaded: the roll-down
    // would otherwise show the empty plates for the first moments); at most 500 ms are waited
    const shown = [wrap, ...bot]; shown.forEach((e) => { e.style.visibility = 'hidden'; });
    const imgs = [...rig.querySelectorAll('img')];
    Promise.race([Promise.all(imgs.map((i) => i.decode().catch(() => {}))), new Promise((ok) => setTimeout(ok, 500))]).then(() => requestAnimationFrame(() => {
    shown.forEach((e) => { e.style.visibility = ''; });
    roll([sh, shadow], bot, G.h, D, bezier(.3, .7, .3, 1), true);
    }));
  }
}
async function rollUp() {
  const sh = rig.querySelector('.sheet'); if (!sh || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const G = geometry(), D = 650;
  await roll([sh, sh.previousElementSibling], [...rig.querySelectorAll('.bottom')], G.h, D, bezier(.6, 0, .6, 1), false);
}
// The roll of a sheet: the paper's clip and the bottom rod are set in the same frame (a rAF loop), so they never drift apart (a clip-path animation
// runs on the main thread and a transform one on the compositor: while the next map loads, the paper used to lag behind the rod)
function bezier(x1, y1, x2, y2) {
  const f = (a, b, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  return (x) => { let lo = 0, hi = 1, t = x; for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (f(x1, x2, t) < x) lo = t; else hi = t; } return f(y1, y2, t); };
}
function roll(papers, bots, h, D, ease, down) {
  return new Promise((ok) => {
    const set = (p) => {                                             // p: 0 = rolled up, 1 = down
      papers.forEach((e) => { e.style.clipPath = 'inset(0 0 ' + ((1 - p) * 100) + '% 0)'; });
      bots.forEach((b) => { b.style.transform = 'translateY(' + (-(1 - p) * h) + 'px)'; });
    };
    const t0 = performance.now(); set(down ? 0 : 1);
    const step = (now) => {
      const x = Math.min(1, (now - t0) / D), e = ease(x);
      set(down ? e : 1 - e);
      if (x < 1) requestAnimationFrame(step); else { if (down) { papers.forEach((el) => { el.style.clipPath = ''; }); bots.forEach((b) => { b.style.transform = ''; }); } ok(); }
    };
    requestAnimationFrame(step);
  });
}
/* ---------- the two sides of a sheet: 1 and 1a ... 8 and 8a ---------- */
const m = (i) => MAPS[i];
const partner = (map) => { if (!map) return null; const id = map.id.endsWith('a') ? map.id.slice(0, -1) : map.id + 'a'; return MAPS.find((x) => x.id === id) || null; };
const sheetPic = (id) => '/wall_maps/' + encodeURIComponent(id) + '-sheet.webp?v=20261119e';
const sheetImgs = new Map();
function sheetImg(id) {
  if (!sheetImgs.has(id)) sheetImgs.set(id, new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = sheetPic(id); }));
  return sheetImgs.get(id);
}
let flipMod = null;
const loadFlip = () => flipMod || (flipMod = import('./map_flip.js?v=20261117a'));
// once a sheet with two sides hangs and the page is quiet, the 3D code and the pictures of both sides are fetched (so a click turns it at once)
// the sound of the turn (web/sounds/map-flip.wav, made by scripts/build_map_flip_sound.py: three rustles of paper laid on the turn's own times, the
// lift off the nail, the swing round and the rod going back on the nail), started with the turn's first frame; only while the library's sound is on
let ac = null, flipBuf = null, flipLoading = null, flipBytes = null;
const fetchFlipBytes = () => flipBytes || (flipBytes = fetch('/sounds/map-flip.wav?v=20261117a').then((r) => r.arrayBuffer()).catch(() => { flipBytes = null; return null; }));
fetchFlipBytes();                                                              // (the file is fetched as soon as the page loads, so the first turn has it: only the decoding needs the audio context)
function flipAudio() {
  if (!isSoundOn()) return Promise.resolve(null);
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return Promise.resolve(null); } }
  const resumed = ac.state === 'suspended' ? ac.resume().catch(() => {}) : Promise.resolve();   // (on a click this starts it; before one it stays suspended and is resumed later)
  if (!flipLoading) flipLoading = fetchFlipBytes().then((b) => b && ac.decodeAudioData(b.slice(0))).then((d) => (flipBuf = d), () => { flipLoading = null; return null; });
  return Promise.all([flipLoading, resumed]);                                    // (ready when the sound is decoded and the context is running)
}
onSoundChange((on) => { if (on) flipAudio(); });
function playFlip() {
  if (!isSoundOn() || !ac || !flipBuf || ac.state !== 'running') return;   // (not ready: no sound rather than a late one)
  const src = ac.createBufferSource(), g = ac.createGain(); src.buffer = flipBuf; g.gain.value = getSoundVolume() * .8; src.connect(g).connect(ac.destination); src.start();
}
function prepareTurn(a, b) {
  const go = () => { flipAudio(); loadFlip().catch(() => {}); sheetImg(a.id).catch(() => {}); sheetImg(b.id).catch(() => {}); };
  if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 1200);
}
async function turnOver() {
  const other = partner(m(MI)); if (busy || !other) return; busy = true;
  const j = MAPS.indexOf(other);
  rig.getAnimations().forEach((an) => an.finish());                              // (the sway of a sheet that just came down)
  try {
    const sound = Promise.race([flipAudio(), new Promise((ok) => setTimeout(ok, 1500))]);  // (the click resumes the audio; the sound is waited for a moment at most)
    const [mod, front, back] = await Promise.all([loadFlip(), sheetImg(m(MI).id), sheetImg(other.id), preload(other), sound]);
    const sc = room.clientWidth / 1920, sr = rig.querySelector('.sheet').getBoundingClientRect(), mr = stage.getBoundingClientRect();
    const box = { x: (sr.left - mr.left) / sc, y: (sr.top - mr.top) / sc, w: sr.width / sc, h: sr.height / sc };
    const done = await mod.turnSheet({ mstage: stage, before: document.getElementById('warm'), rig, TOP, scale: sc, front, back, box, w: lastRig.w, h: lastRig.h, onStart: playFlip });
    // the DOM sheet of the other side is built hidden under the 3D one and shown only once its pictures are decoded (else its plate would show empty
    // for a moment and the map seem to load again after the turn)
    rig.style.visibility = 'hidden'; MI = j; render(false); syncRack(); setHash();
    await Promise.all([...rig.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    rig.style.visibility = ''; done();
  } catch (e) {
    console.error(e); rig.style.visibility = ''; MI = j; render(false); syncRack(); setHash();         // (no 3D: the other side at once)
  }
  busy = false;
  const s = rig.querySelector('.sheet'); if (s && document.activeElement === document.body) s.focus({ preventScroll: true });
}
const setHash = () => { try { history.replaceState(null, '', '#' + MAPS[MI].id); } catch { /* no address */ } };

// the three pictures of a map, loaded before its sheet comes down (so it never rolls down empty)
const preload = (m) => Promise.all(['proj', 'board', 'strip'].map((p) => new Promise((ok) => { const i = new Image(); i.onload = i.onerror = ok; i.src = pic(m.id, p); })));
async function pick(i, anim = true) {
  if (busy || i === MI || i < 0 || i >= MAPS.length) return; busy = true;
  const ready = preload(MAPS[i]); await rollUp(); await ready;
  MI = i; render(anim); syncRack(); setHash();
  busy = false;
}

/* ---------- the rack: a brass label per sheet, in groups (a map with an alternate side has one label: the sheet shows the alternate side first) ---------- */
// The groups of the map drawer: Beginner (0, A), Base game (1-8 and their alternate sides), Map Pack 1 (9, 10), Map Pack 2 (11-14, T1)
const rackGroup = (id) => { const n = parseInt(id, 10); return id === '0' || id === 'A' ? 'Beginner' : n >= 1 && n <= 8 ? 'Base game' : n === 9 || n === 10 ? 'Map Pack 1' : 'Map Pack 2'; };
function buildEntries() {
  ENTRIES = [];
  MAPS.forEach((map, i) => {
    const other = partner(map);
    if (other && map.id.endsWith('a')) return;                                     // (its label is the base map's)
    const ids = other ? [MAPS.indexOf(other), i] : [i];
    ENTRIES.push({ label: map.id, name: map.name, group: rackGroup(map.id), ids });
  });
}
const entryOf = (i) => ENTRIES.findIndex((e) => e.ids.includes(i));
function buildRack() {
  buildEntries();
  const groups = []; ENTRIES.forEach((en, n) => { let g = groups.find((x) => x.name === en.group); if (!g) groups.push(g = { name: en.group, items: [] }); g.items.push([en, n]); });
  // the cards: one slot per map across the drawer, groups apart by a gap; each group has a divider card with its name on a taller tab
  const W = 1240, pad = 34, gap = 34, unit = (W - 2 * pad - (groups.length - 1) * gap) / ENTRIES.length; let x = pad, html = '<div class="dbody"></div><div class="drecess"></div>';
  groups.forEach((g) => {
    const w = g.items.length * unit;
    html += '<div class="dgrp" style="left:' + (x - 6) + 'px;width:' + Math.max(130, w * .66) + 'px">' + esc(g.name) + '</div>';
    g.items.forEach(([en, n], i) => { html += '<button type="button" class="dcard" style="left:' + (x + i * unit + 3) + 'px;width:' + (unit - 6) + 'px" data-e="' + n + '" title="' + esc(en.name) + '" aria-label="Map ' + esc(en.label) + ': ' + esc(en.name) + (en.ids.length > 1 ? ' (alternate side and base side)' : '') + '">' + esc(en.label) + '</button>'; });
    x += w + gap;
  });
  rack.innerHTML = html;
  rack.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { pickEntry(+b.dataset.e); setTimeout(() => setDrawer(false), 380); } });
}
function pickEntry(n) { const en = ENTRIES[n]; if (en && !en.ids.includes(MI)) pick(en.ids[0]); }
function syncRack() { const cur = entryOf(MI); rack.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(+b.dataset.e === cur))); }
/* ---------- the map drawer under the sheet: closed, only its front shows; open, the catalogue cards slide up over the ability text ---------- */
const drawer = document.getElementById('mapdrawer'), dfront = document.getElementById('dfront');
function setDrawer(open) {
  stage.classList.toggle('drawer-open', open); dfront.setAttribute('aria-expanded', String(open));
  if (open) rack.removeAttribute('inert'); else rack.setAttribute('inert', '');            // (the cards of a closed drawer cannot be reached with the keyboard)
}
dfront.addEventListener('click', () => setDrawer(!stage.classList.contains('drawer-open')));
stage.addEventListener('pointerdown', (e) => { if (stage.classList.contains('drawer-open') && !drawer.contains(e.target)) setDrawer(false); });
addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
  if (e.key === 'Escape') setDrawer(false); else if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) setDrawer(!stage.classList.contains('drawer-open'));
});
addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;           // (a focused slider or text field keeps its own arrow keys: the library's volume slider)
  if (e.key === 'ArrowRight') pickEntry(entryOf(MI) + 1); else if (e.key === 'ArrowLeft') pickEntry(entryOf(MI) - 1);
});

/* ---------- the fire light: a warm glow from the bottom left that flickers, and the shade of the room ---------- */
const warm = document.getElementById('warm').getContext('2d'), fn = noise2(99);
function flicker(t) {
  const a = .5 + fn(t * .0012, 1) * .5, b = fn(t * .004, 5); warm.setTransform(.5, 0, 0, .5, 0, 0); warm.clearRect(0, 0, 1920, 1080); const x = -60 + b * 50, y = 1160;
  const g = warm.createRadialGradient(x, y, 40, x, y, 1500); g.addColorStop(0, 'rgba(255,140,50,' + (.42 + a * .18) + ')'); g.addColorStop(.3, 'rgba(255,120,40,' + (.2 + a * .08) + ')'); g.addColorStop(.6, 'rgba(255,110,40,' + (.06 + a * .03) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); warm.fillStyle = g; warm.fillRect(0, 0, 1920, 1080);
  const v = warm.createRadialGradient(1100, 420, 300, 1000, 520, 1250); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(8,4,2,' + (.5 - a * .06) + ')'); warm.fillStyle = v; warm.fillRect(0, 0, 1920, 1080);
  requestAnimationFrame(flicker);
}

/* ---------- start ---------- */
fit();
buildWall();
// the map named in the address (#8a); a malformed address (#%) names none
const hashId = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; } };
fetch('/wall_maps/index.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))).then(async (d) => {
  MAPS = d.maps; buildRack();
  MI = MAPS.findIndex((m) => m.id === hashId());
  if (MI < 0) MI = Math.max(0, MAPS.findIndex((m) => m.id === '1a'), MAPS.findIndex((m) => m.id === '1'));   // (no map or an unknown one in the address: map 1 (its alternate side), as on a first visit)
  syncRack();
  await Promise.all([preload(MAPS[MI]), document.fonts ? document.fonts.load("46px 'IM Fell English'").catch(() => {}) : null]);
  render(true); fit(); requestAnimationFrame(() => document.body.classList.add('ready'));
}).catch((e) => {
  console.error(e); document.body.classList.add('ready');
  rack.innerHTML = '<div class="dbody"></div><p class="derr">The maps could not be loaded. Reload the page to try again.</p>'; setDrawer(true);
});
requestAnimationFrame(flicker);
