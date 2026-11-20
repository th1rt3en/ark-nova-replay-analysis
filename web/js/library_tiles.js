import { paintDrawerFloor } from './drawer-floor.js?v=20261117c';
import { paintDrawerCabinet } from './drawer-cabinetry.js?v=20261117d';
import CANNON from './lib/cannon-es.js?v=20261115a';
import { isSoundOn, onSoundChange, getSoundVolume } from './library_sound.js?v=20261120a';
/* The bonus tiles of the library (library/tiles/index.html, css/library_room.css): an open drawer of mahogany lined with green baize, with every tile that can
   be gained at 5 / 8 conservation or at the end of the reputation track (the engine's CONSERVATION_POOL, engine/bonuses.py) lying loose in it as a carved and
   stained wooden pentagon. Everything is drawn on one canvas, with procedural wood and a fine wool baize texture; the pictures on the tiles are the viewer's own
   `bonusTile` drawings without their yellow pentagon (web/tile_art/, made by scripts/build_library_tiles.py).
   Physics: Cannon-es 0.20.0: shallow pentagonal prisms with gravity, contact friction, tipping and stacking. Grab the brass knob to shake the
   constrained drawer; shared acceleration and slight yaw drive tile inertia. Hold a tile for 500 ms to lift it on a physical constraint.
   Both faces carry the same artwork. Cabinet stays fixed; drawer, handle, lining and tile rendering share a single rigid transform.
   Sound (off until the button is pressed; one choice for the whole library, `libraryHallSound`, js/library_sound.js, which also plays the room's ambience): a recorded wooden tap (web/sounds/tile-tap-deep.wav, 8 semitones down; the first version tile-tap.wav is kept) on every hit, louder and brighter for harder ones. */


const TILES = [
  { key: 'Partner-Zoo', name: 'Partner zoo', text: 'Take a partner zoo from the association board.' },
  { key: 'Fac', name: 'University', text: 'Take a university from the association board.' },
  { key: 'Multiplier', name: 'Multiplier', text: 'A Multiplier token on an action card of your choice.' },
  { key: 'xtoken', name: '3 X-tokens', text: 'Gain 3 X-tokens.' },
  { key: 'take-in-range-or-deck', name: '3 cards', text: 'Take 3 cards, from the display within your reputation range or from the deck.' },
  { key: 'size-3', name: 'Size 3 enclosure', text: 'Build a size 3 enclosure for free.' },
  { key: 'bonus-ignore-conditions', name: 'Ignore conditions', text: '3 tokens: each one lets you ignore one condition of an animal card.' },
  { key: 'bonus-increased-hand', name: 'Larger hand', text: 'Your hand limit at breaks is one card higher; Snapping once now.' },
  { key: 'bonus-icon', name: 'Bonus icon', text: 'A token that counts as one icon of your choice when you support a conservation project.' },
  { key: 'bonus-scoring-cards', name: 'Adapt 3', text: 'Draw 3 final scoring cards, then discard 3.' },
  { key: 'bonus-sponsor', name: 'Marketing', text: 'Marketing at once: play a sponsor without paying its cost or meeting its requirements.', k: .66 },          // (the large picture of the Marketing bonus: the tile of the token on the board shows the same artwork small inside its pentagon)
  { key: 'bonus-sponsor-gray', name: 'Sponsor token', text: 'Marketing at any later time: play a sponsor without paying its cost or meeting its requirements.' },          // (the engine's token for later; the yellow tile above is the Marketing at once)
  { key: 'reputation', name: '2 reputation', text: 'Gain 2 reputation.' },
  { key: 'bonus-extra-shift', name: 'Extra Shift', text: 'A token: take a worker back from the association board at any time.' },
  { key: 'bonus-kiosk-pavilion', name: 'Posturing 3', text: 'Up to 3 free kiosks or pavilions.' },
  { key: 'money', name: '10 money', text: 'Gain 10 money.' },
];
const HOLD_MS = 500, HOLD_SLOP = 7;                 // (a press that stays within 7 units for half a second picks the tile up)
const W = 1400, H = 820;
const cv = document.getElementById('drawer'), ctx = cv.getContext('2d');
let DPR = 1;
function fit() { const r = cv.getBoundingClientRect(); DPR = Math.min(2.5, Math.max(1, (window.devicePixelRatio || 1) * r.width / W)); cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); bakeCloth(); }

/* ---------- noise, wood, cloth ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function noise2(seed) {
  const r = rng(seed), p = new Float32Array(4096); for (let i = 0; i < 4096; i++) p[i] = r();
  const h = (x, y) => p[((x * 73856093) ^ (y * 19349663)) & 4095];
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
}
const mix = (a, b, t) => a + (b - a) * t;
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// a board: the grain runs along x (along y when `vert`); colours dark / mid / light
function wood(w, h, o) {
  const c = canvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data, n = noise2(o.seed || 1), n2 = noise2((o.seed || 1) + 77); const [D, M, L] = o.c, ring = o.ring || .05, warp = o.warp || 26;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = o.vert ? y : x, Y = o.vert ? x : y; const slow = n(X * .0008 + 3, Y * .007 + 9), wv = n(X * .0022, Y * .011) * warp + n(X * .009, Y * .03) * warp * .25; const r = .5 + .5 * Math.sin((Y * (.5 + slow) + wv) * ring * 6.2832);
    const st = n2(X * .006, Y * .55) * .6 + n2(X * .03, Y * 1.7) * .4; let t = r * .34 + st * .44 + slow * .22; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const i = (y * w + x) * 4, a = t < .5 ? D : M, b = t < .5 ? M : L, k = t < .5 ? t * 2 : (t - .5) * 2; d[i] = mix(a[0], b[0], k); d[i + 1] = mix(a[1], b[1], k); d[i + 2] = mix(a[2], b[2], k); d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); const r = rng((o.seed || 1) + 5); g.strokeStyle = 'rgba(20,10,4,' + (o.pore || .10) + ')'; g.lineWidth = 1;
  for (let i = 0; i < w * h / 900; i++) { const x = r() * w, y = r() * h, l = 6 + r() * 26; g.beginPath(); if (o.vert) { g.moveTo(x, y); g.lineTo(x + (r() - .5) * 1.5, y + l); } else { g.moveTo(x, y); g.lineTo(x + l, y + (r() - .5) * 1.5); } g.stroke(); }
  return c;
}
function baize(w, h, base, seed) {
  const c = canvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data, n = noise2(seed), r = rng(seed + 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const m = n(x * .006, y * .006) * .5 + n(x * .03, y * .03) * .2, s = (r() - .5) * .16, i = (y * w + x) * 4, k = .78 + m * .4 + s; d[i] = base[0] * k; d[i + 1] = base[1] * k; d[i + 2] = base[2] * k; d[i + 3] = 255; }
  g.putImageData(im, 0, 0); return c;
}

/* ---------- the drawer: mahogany walls, green baize floor, a brass label holder and knob ---------- */
const DR = { x: 110, y: 46, w: 1180, h: 716, t: 36, tf: 74 };                        // the outer box, the wall thickness, the front wall's thickness
const IN = { x: DR.x + DR.t, y: DR.y + DR.t, w: DR.w - 2 * DR.t, h: DR.h - DR.t - DR.tf };   // the floor
const CLOTH = [38, 84, 58];
const LABEL = { x: W / 2 - 330, y: DR.y + DR.h - DR.tf + 8, w: 660, h: 58 };
let K = 1;                                                            // the density `bg` and `cabinet` (the wood and the wool) are baked at: pixels per unit, like the canvas's own
const bakeK = () => Math.min(2, Math.max(1, Math.ceil(DPR * 4) / 4));
let bg = null, over = null, cabinet = null, dshadow = null, clothSrc = null, cloth = null;          // (clothSrc: the 3x crop of the texture; cloth: the same at the canvas's own resolution, so a frame does not scale it down)
// Approved soft-wool mock B: centered 65%-width crop, preserving its fiber scale.
// Keep a high-resolution floor separate from the logical-size wood background.
function loadCloth() {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      clothSrc = canvas(IN.w * 3, IN.h * 3);
      const sw = image.width * .65, sh = sw * IN.h / IN.w;
      clothSrc.getContext('2d').drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, 0, 0, clothSrc.width, clothSrc.height);
      bakeCloth(); resolve();
    };
    // The procedural floor remains a usable fallback if the texture is unavailable.
    image.onerror = () => resolve();
    image.src = '/assets/library-baize-soft-wool.png?v=20261114b';
  });
}
function bakeCloth() { if (!clothSrc) return; cloth = canvas(Math.round(IN.w * DPR), Math.round(IN.h * DPR)); cloth.getContext('2d').drawImage(clothSrc, 0, 0, cloth.width, cloth.height); }
function buildDrawer() {
  K = bakeK();                                                         // (the floor and the wood are drawn at the screen's density: at 1x they were stretched and soft on a sharp screen)
  const c = canvas(Math.round(W * K), Math.round(H * K)), g = c.getContext('2d'); g.scale(K, K);
  // the cabinet's floor is the plain wool (taken before the drawer's dark footprint is painted into `c`, which only `bg` needs): the area the drawer leaves free must show wool, not a hole
  paintDrawerFloor(g, { canvas, rng, noise2, W, H, DR, K, afterFloor: (src) => { cabinet = canvas(src.width, src.height); const cq = cabinet.getContext('2d'); cq.drawImage(src, 0, 0); cq.scale(K, K); } });
  // the drawer's shadow on the floor as its own picture (drawn under the drawer in every frame, so it travels with it instead of staying where the open drawer lies)
  { const pad = 70; dshadow = canvas(DR.w + 2 * pad, DR.h + 2 * pad); const q = dshadow.getContext('2d'); q.shadowColor = 'rgba(0,0,0,.76)'; q.shadowBlur = 20; q.shadowOffsetX = 10000; q.shadowOffsetY = 8; q.fillStyle = '#000'; q.fillRect(pad + 3 - 10000, pad + 12, DR.w - 6, DR.h - 10); }
  g.save(); g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 70 * K; g.shadowOffsetY = 40 * K; g.fillStyle = '#000'; g.fillRect(DR.x + 10, DR.y + 30, DR.w - 20, DR.h - 20); g.restore();
  if (!clothSrc) g.drawImage(baize(IN.w, IN.h, CLOTH, 31), IN.x, IN.y);          // (only the fallback: the texture did not load)
  paintDrawerCabinet(g, cabinet.getContext('2d'), { canvas, noise2, rng, mix, DR, IN, LABEL, W, H, K });
  // drawn over the tiles: the walls' shadow on the floor, warm light, a vignette
  const o = canvas(W, H), q = o.getContext('2d'); q.save(); q.beginPath(); q.rect(IN.x, IN.y, IN.w, IN.h); q.clip();
  const sd = (x0, y0, x1, y1, a) => { const s = q.createLinearGradient(x0, y0, x1, y1); s.addColorStop(0, 'rgba(0,0,0,' + a + ')'); s.addColorStop(1, 'rgba(0,0,0,0)'); q.fillStyle = s; q.fillRect(IN.x, IN.y, IN.w, IN.h); };
  sd(0, IN.y, 0, IN.y + 120, .62); sd(IN.x, 0, IN.x + 80, 0, .5); sd(IN.x + IN.w, 0, IN.x + IN.w - 34, 0, .3); sd(0, IN.y + IN.h, 0, IN.y + IN.h - 26, .28); q.restore();
  const lt = q.createRadialGradient(W * .34, H * .42, 40, W * .45, H * .5, W * .7); lt.addColorStop(0, 'rgba(255,196,110,.13)'); lt.addColorStop(.5, 'rgba(255,196,110,.03)'); lt.addColorStop(1, 'rgba(0,0,0,.42)'); q.fillStyle = lt; q.fillRect(0, 0, W, H);
  bg = c; over = o;
}

/* ---------- the tiles: a pentagon of boxwood, the picture carved in and stained in its own colours ---------- */
const TH = 120, TR = TH / (1 + Math.cos(Math.PI / 5));                               // the pentagon's height and circumradius
const pent = (R) => Array.from({ length: 5 }, (_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return { x: R * Math.cos(a), y: R * Math.sin(a) }; });
function pentPath(g, R, r) {
  const p = pent(R); g.beginPath();
  p.forEach((v, i) => { const a = p[(i + 4) % 5], b = p[(i + 1) % 5], l = Math.hypot(a.x - v.x, a.y - v.y), k = r / l; const s = { x: v.x + (a.x - v.x) * k, y: v.y + (a.y - v.y) * k }, e = { x: v.x + (b.x - v.x) * k, y: v.y + (b.y - v.y) * k }; if (i) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y); g.quadraticCurveTo(v.x, v.y, e.x, e.y); });
  g.closePath();
}
const imgs = {};
// the picture stained into the wood: its colours, a touch richer, with the grain showing through (multiplied in) and the carving's edge (a dark rim below, a light one above)
// (drawn at the size it will have on the screen, `S` pixels, from the large picture with the browser's best downscaling)
function stained(img, tex, S) {
  const c = canvas(S, S), g = c.getContext('2d'), k = Math.min(S / img.width, S / img.height), w = img.width * k, h = img.height * k; g.imageSmoothingQuality = 'high';
  g.filter = 'saturate(1.3) contrast(1.06) brightness(.98)'; g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h); g.filter = 'none';
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = .26; g.drawImage(tex, 0, 0, S, S); g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-in'; g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h); g.globalCompositeOperation = 'source-over';
  return c;
}
// one colour in the shape of a picture (the carving's rims): a mask, not a canvas `filter`, which Safari does not draw
function silhouette(src, color) {
  const c = canvas(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}
// The sprites are drawn at the canvas's own pixel density: SC pixels per unit (the canvas's DPR, 7 % more for a lifted tile, which is drawn that much larger);
// a change of the window's size or zoom that changes it draws them again (fit)
let SC = 2;
const spriteScale = () => Math.min(3, Math.max(1, Math.ceil(DPR * 1.07 * 4) / 4));
// the four tokens that lie on the grey token ground on the board get a grey wood (taupe beech); the others the yellow boxwood
const GREY_TOKENS = ['bonus-ignore-conditions', 'bonus-icon', 'bonus-sponsor-gray', 'bonus-extra-shift'];
const YELLOW_WOOD = { c: [[164, 118, 40], [198, 152, 64], [220, 182, 92]], ring: .05, vig: '60,30,8', vigA: .42, rim: 'rgba(40,20,6,.7)' };
const GREY_WOOD = { c: [[132, 120, 102], [168, 157, 138], [198, 188, 170]], ring: .05, vig: '40,30,20', vigA: .40, rim: 'rgba(40,28,16,.7)' };
const SIDE_SHADE = [.79, .91, .67, .94, .77];             // (the shades the boxwood sides always had: #9d712f, #b48a40, #85602b, #ba9048, #98702f of the boxwood's middle colour)
function tileSprite(t, seed) {
  const S = Math.ceil((TH + 16) * SC), c = canvas(S, S), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.translate(S / 2, S / 2); g.scale(SC, SC);
  const grey = GREY_TOKENS.includes(t.key), W = grey ? GREY_WOOD : YELLOW_WOOD;
  const r = rng(seed), tone = r() * 14 - 7, tex = wood(TH + 20, TH + 20, { c: W.c.map((q) => [q[0] + tone, q[1] + tone, q[2] + (grey ? tone : 0)]), ring: W.ring + r() * .03, seed: seed * 7 + 1, warp: 16, pore: .06 });
  g.save(); pentPath(g, TR, 9); g.clip(); g.rotate((r() - .5) * .5); g.drawImage(tex, -(TH + 20) / 2, -(TH + 20) / 2); g.setTransform(SC, 0, 0, SC, S / 2, S / 2);
  const pat = g.createRadialGradient(0, 2, TR * .35, 0, 2, TR * 1.02); pat.addColorStop(0, `rgba(${W.vig},0)`); pat.addColorStop(1, `rgba(${W.vig},${W.vigA})`); g.fillStyle = pat; g.fillRect(-TH, -TH, 2 * TH, 2 * TH);
  const img = imgs[t.key], is = TH * .8 * (t.k || 1), ic = stained(img, tex, Math.ceil(is * SC));
  g.globalAlpha = .45; g.drawImage(silhouette(ic, '#000'), -is / 2 + 1, -is / 2 + 3.6, is, is);                 // the carved rim: dark below...
  g.globalAlpha = .35; g.drawImage(silhouette(ic, '#fffff5'), -is / 2 - .6, -is / 2 + 1.2, is, is);              // ...light above
  g.globalAlpha = 1; g.drawImage(ic, -is / 2, -is / 2 + 2.2, is, is);
  g.restore();
  pentPath(g, TR - 1.2, 8); g.strokeStyle = W.rim; g.lineWidth = 2.4; g.stroke();
  pentPath(g, TR - 4, 6.5); const hl = g.createLinearGradient(-TR, -TR, TR, TR); hl.addColorStop(0, 'rgba(255,240,200,.55)'); hl.addColorStop(.5, 'rgba(255,240,200,0)'); hl.addColorStop(1, 'rgba(30,14,4,.45)'); g.strokeStyle = hl; g.lineWidth = 1.6; g.stroke();
  // the five thin sides and their edge line are cut from the same wood as the face (its middle colour and this tile's tone), each side shaded by its own factor
  const mid = [W.c[1][0] + tone, W.c[1][1] + tone, W.c[1][2] + (grey ? tone : 0)], rgb = (k) => 'rgb(' + k.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(',') + ')';
  c.sides = SIDE_SHADE.map((f) => rgb(mid.map((v) => v * f))); c.edge = rgb([mid[0] * .61, mid[1] * .56, mid[2] * .56]);
  return c;
}
/* Initial placement only; every subsequent movement comes from 3D physics. */
let tiles = [];
function scatter() {
 const r=rng(42), placed=[];
 TILES.forEach((t,i)=>{
  let x,y,ok,n=0;
  do { x=IN.x+TR+20+r()*(IN.w-2*TR-40);y=IN.y+TR+20+r()*(IN.h-2*TR-40);ok=placed.every(p=>Math.hypot(p.x-x,p.y-y)>TR*1.9); } while(!ok&&++n<600);
  placed.push({x,y});const seed=i*13+5;
  tiles.push({t,seed,sprite:tileSprite(t,seed),body:{position:{x,y},angle:(r()-.5)*1.2}});
 });
}

/* ---------- sound: a recorded wooden tap ---------- */
let ac = null, sound = isSoundOn(), lastClick = 0;         // one choice for the whole library (js/library_sound.js: the button, the ambience, `libraryHallSound`)
onSoundChange((on) => { sound = on; audio(); });
let tap = null;                                    // the recorded wooden tap (web/sounds/tile-tap.wav, one clean hit, 62 ms)
function loadTap() {
  if (tap || !ac) return; tap = 'loading';
  fetch('/sounds/tile-tap-deep.wav?v=20261114i').then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((d) => { tap = d; }).catch(() => { tap = null; });
}
// the drawer's own sounds (web/sounds/drawer-open.wav, drawer-close.wav, made by scripts/build_drawer_sounds.py): the scrape as it opens, the scrape and the thump of the front as it closes
const sfx = {};
let sfxLoading = null;
function loadSfx() {
  if (!ac) return Promise.resolve();
  return sfxLoading || (sfxLoading = Promise.all(['open', 'close'].map((k) => fetch('/sounds/drawer-' + k + '.wav?v=20261115u').then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((d) => { sfx[k] = d; }).catch(() => {}))));
}
// (`gesture`: the closing starts from a click, so a context that is still suspended may be resumed for it; the opening on arrival has none and stays quiet rather than play late)
function playDrawer(kind, gesture) {
  const d = sfx[kind]; if (!sound || !ac || !d) return;
  const go = () => { const src = ac.createBufferSource(), g = ac.createGain(); src.buffer = d; g.gain.value = getSoundVolume() * .8; src.connect(g).connect(ac.destination); src.start(); };
  if (ac.state === 'running') go(); else if (gesture) ac.resume().then(() => { if (ac.state === 'running') go(); }).catch(() => {});
}
function audio() { if (sound && !ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } } if (ac && ac.state === 'suspended') ac.resume(); loadTap(); loadSfx(); }
// one hit: the recording with a random pitch (+-8%), a lowpass that opens with the impact speed (a light touch sounds duller) and a gain that follows it
function click(v) {
  if (!sound || !ac || !tap || tap === 'loading') return; const now = ac.currentTime; if (now - lastClick < .03) return; lastClick = now;
  const k = Math.max(0, Math.min(1, (v - .9) / 14));                                   // 0 = the lightest counted hit, 1 = a hard one
  const src = ac.createBufferSource(); src.buffer = tap; src.playbackRate.value = .92 + Math.random() * .16;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200 + k * k * 15000; lp.Q.value = .5;
  const g = ac.createGain(); g.gain.value = getSoundVolume() * (.12 + .88 * Math.pow(k, .7) * (.9 + Math.random() * .2));
  src.connect(lp).connect(g).connect(ac.destination); src.start(now);
}
/* ---------- the label: the tile under the pointer (or in the hand) ---------- */
function label() {
  const t = (grab && grab.tile) || hover, { x, y, w, h } = LABEL, cx = x + w / 2;
  ctx.fillStyle = '#3a2410'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!t) { ctx.font = "italic 600 24px 'IM Fell English', Georgia, serif"; ctx.fillText('Bonus tiles', cx, y + h / 2 + 1); return; }
  ctx.font = "italic 700 20px 'IM Fell English', Georgia, serif"; ctx.fillText(t.t.name, cx, y + 19);
  let size = 15; ctx.font = size + "px 'IM Fell English', Georgia, serif";
  while (ctx.measureText(t.t.text).width > w - 40 && size > 9) { size -= .5; ctx.font = size + "px 'IM Fell English', Georgia, serif"; }
  ctx.fillStyle = '#5a3a1e'; ctx.fillText(t.t.text, cx, y + 41);
}

/* ---------- a frame ---------- */
let prev = performance.now();
function frame(now) {
  const dt = Math.min(50, now - prev); prev = now; updateTravel(now); simulate(dt);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.drawImage(cabinet,0,0,W,H);
  ctx.save();ctx.beginPath();ctx.rect(DR.x-35,DR.y,DR.w+70,H-DR.y);ctx.clip();ctx.translate(motion.x,motion.y+travel.y);ctx.translate(W/2,IN.y+IN.h/2);ctx.rotate(drawer.yaw);ctx.translate(-W/2,-IN.y-IN.h/2);
  ctx.drawImage(dshadow, DR.x - 70, DR.y - 70);
  ctx.drawImage(bg,(DR.x-2)*K,(DR.y-2)*K,(DR.w+4)*K,(DR.h+4)*K,DR.x-2,DR.y-2,DR.w+4,DR.h+4);
  if (cloth) ctx.drawImage(cloth, IN.x, IN.y, IN.w, IN.h);
  ctx.save(); ctx.beginPath(); ctx.rect(IN.x, IN.y, IN.w, IN.h); ctx.clip();
  render3();
  ctx.restore();ctx.save();ctx.beginPath();ctx.rect(DR.x-2,DR.y-2,DR.w+4,DR.h+4);ctx.ellipse(W/2,DR.y+DR.h+14,33,21,0,0,Math.PI*2);ctx.clip();ctx.drawImage(over,0,0);ctx.restore();ctx.restore();ctx.drawImage(cabinet,0,0,W*K,DR.y*K,0,0,W,DR.y);   // (the front, the knob and the label come after the cabinet's lip, below)
 ctx.save();ctx.translate(motion.x,motion.y+travel.y);ctx.translate(W/2,IN.y+IN.h/2);ctx.rotate(drawer.yaw);ctx.translate(-W/2,-IN.y-IN.h/2);
 ctx.drawImage(bg,(DR.x-2)*K,(DR.y+DR.h-DR.tf)*K,(DR.w+4)*K,(DR.tf+2)*K,DR.x-2,DR.y+DR.h-DR.tf,DR.w+4,DR.tf+2);
 ctx.save();ctx.beginPath();ctx.ellipse(W/2,DR.y+DR.h+14,33,21,0,0,Math.PI*2);ctx.clip();ctx.drawImage(bg,0,0,W,H);ctx.restore();
 ctx.save();ctx.beginPath();ctx.rect(DR.x-2,DR.y+DR.h-DR.tf,DR.w+4,DR.tf+2);ctx.ellipse(W/2,DR.y+DR.h+14,33,21,0,0,Math.PI*2);ctx.clip();ctx.drawImage(over,0,0);ctx.restore();label();drawKnobFeedback();ctx.restore();
  requestAnimationFrame(frame);
}

/* ---------- start ---------- */
let refit = 0;
fit(); addEventListener('resize', () => { fit(); clearTimeout(refit); refit = setTimeout(redraw, 150); });
function redraw() {                                                    // (the tiles drawn again at the new pixel density)
  if (drawerReady && bakeK() !== K) buildDrawer();                     // (and the wood and the wool)
  if (!tiles.length || spriteScale() === SC) return;
  SC = spriteScale(); tiles.forEach((x) => { x.sprite = tileSprite(x.t, x.seed); });
}
const load = (t) => new Promise((ok) => { const i = new Image(); i.onload = () => { imgs[t.key] = i; ok(); }; i.onerror = () => { imgs[t.key] = canvas(1, 1); ok(); }; i.src = '/tile_art/' + t.key + '.webp?v=hd20261114f'; });
Promise.all([loadCloth(), ...TILES.map(load), document.fonts ? document.fonts.load("italic 17px 'IM Fell English'").catch(() => {}) : null])
  .then(() => { if (sound) { audio(); return loadSfx(); } })                      // (sound on: its context and the drawer sounds are ready before the drawer opens)
  .then(() => { SC = spriteScale(); buildDrawer(); scatter(); init3(); drawerReady=true; beginTravel(true); requestAnimationFrame(frame); requestAnimationFrame(() => document.body.classList.add('ready')); });
setTimeout(() => document.body.classList.add('ready'), 8000);                       // (the buttons never stay hidden if a file is slow)

/* ---------- constrained handle input and 3D tile dynamics ---------- */
// Logical canvas units and seconds; Cannon forces use mass * units/second squared.
const SHAKE = Object.freeze({step:1/240,mouseSensitivity:.22,travelX:12,travelY:18,gripStiffness:1500,gripDamping:65,returnStiffness:100,returnDamping:22,maxDrawerAcceleration:18000,forceGain:7,heavyStroke:70,heavySpeed:650,heavyDecay:.38,heavyTranslationGain:1.5,heavyYawGain:2.5,yawTravel:.01,yawTransferGain:8,yawStiffness:900,yawDamping:60});
let motion={x:0,y:0},drawer={x:0,y:0,vx:0,vy:0,yaw:0,omega:0,alpha:0},hand=null,accumulator=0,knobHover=false,heavyShake=0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rawPoint=e=>{const r=cv.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};};
function localPoint(p){const x=p.x-motion.x-W/2,y=p.y-motion.y-(IN.y+IN.h/2),c=Math.cos(drawer.yaw),s=Math.sin(drawer.yaw);return {x:W/2+c*x+s*y,y:IN.y+IN.h/2-s*x+c*y};}
function onKnob(p){p=localPoint(p);return ((p.x-W/2)/37)**2+((p.y-(DR.y+DR.h+14))/25)**2<=1;}
function finishHand(e){if(!hand||(e&&e.pointerId!==undefined&&e.pointerId!==hand.id))return;const id=hand.id;hand=null;heavyShake=0;kicks.length=0;if(cv.hasPointerCapture(id))cv.releasePointerCapture(id);}
cv.addEventListener('pointerdown',e=>{if(travel.running||travel.y<-.5||e.button!==0||hand||grab||!onKnob(rawPoint(e)))return;e.preventDefault();e.stopImmediatePropagation();audio();hover=null;hand={id:e.pointerId,origin:rawPoint(e),x:motion.x,y:motion.y,baseX:motion.x,baseY:motion.y,lastPoint:rawPoint(e),lastTime:performance.now(),stroke:0,direction:null};cv.setPointerCapture(e.pointerId);},true);
cv.addEventListener('pointermove',e=>{if(travel.running||travel.y<-.5){knobHover=false;return;}const p=rawPoint(e);if(hand){if(e.pointerId!==hand.id)return;e.preventDefault();e.stopImmediatePropagation();
 const now=performance.now(),dx=p.x-hand.lastPoint.x,dy=p.y-hand.lastPoint.y,dist=Math.hypot(dx,dy),elapsed=Math.max(8,now-hand.lastTime),speed=dist*1000/elapsed;
 if(dist>2){const direction={x:dx/dist,y:dy/dist};const reversal=hand.direction&&(direction.x*hand.direction.x+direction.y*hand.direction.y)<-.35;
  if(reversal){if(hand.stroke>SHAKE.heavyStroke&&speed>SHAKE.heavySpeed){heavyShake=Math.min(1,heavyShake+.7);queueScramble();}hand.stroke=0;}
  hand.stroke+=Math.min(dist,250);hand.direction=direction;
 }
 hand.lastPoint=p;hand.lastTime=now;
 hand.x=SHAKE.travelX*Math.tanh(((p.x-hand.origin.x)*SHAKE.mouseSensitivity+hand.baseX)/SHAKE.travelX);hand.y=SHAKE.travelY*Math.tanh(((p.y-hand.origin.y)*SHAKE.mouseSensitivity+hand.baseY)/SHAKE.travelY);return;}knobHover=onKnob(p);},true);
for(const name of ['pointerup','pointercancel','lostpointercapture'])cv.addEventListener(name,e=>{if(hand&&e.pointerId===hand.id){e.stopImmediatePropagation();finishHand(e);}},true);
window.addEventListener('blur',()=>{finishHand();drop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){finishHand();drop();accumulator=0;}});
cv.addEventListener('dragstart',e=>e.preventDefault());

// Approved game-feel impulses: deliberate strong reversals scatter tiles independently.
let scrambleClock=0,lastScramble=-1;const kicks=[];
function queueScramble(){if(scrambleClock-lastScramble<.2)return;lastScramble=scrambleClock;
 tiles.forEach(t=>{if(grab&&grab.tile===t)return;if(Math.random()<.12)return;kicks.push({t,at:scrambleClock+Math.random()*.17,angle:Math.random()*Math.PI*2,speed:2100+Math.random()*1300,lift:170+Math.random()*270,spin:(Math.random()-.5)*17});});}
function advanceScramble(dt){scrambleClock+=dt;for(let i=kicks.length-1;i>=0;i--){const k=kicks[i];if(k.at>scrambleClock)continue;kicks.splice(i,1);if(!hand||grab&&grab.tile===k.t)continue;const b=k.t.body;if(!supportedTile(b))continue;b.wakeUp();
 // Impulses preserve momentum; collisions and gravity determine the destination.
 const impulse=new CANNON.Vec3(Math.cos(k.angle)*k.speed*b.mass,Math.sin(k.angle)*k.speed*b.mass,(b.position.z<35?k.lift:0)*b.mass);
 b.applyImpulse(impulse,new CANNON.Vec3((Math.random()-.5)*22,(Math.random()-.5)*22,0));b.angularVelocity.z+=k.spin;
}}

function physicsStep(dt){
 heavyShake=Math.max(0,heavyShake-dt/SHAKE.heavyDecay);
 const held=!!hand,tx=hand?hand.x:0,ty=hand?hand.y:0,k=held?SHAKE.gripStiffness:SHAKE.returnStiffness,d=held?SHAKE.gripDamping:SHAKE.returnDamping;
 const ax=clamp(k*(tx-drawer.x)-d*drawer.vx,-SHAKE.maxDrawerAcceleration,SHAKE.maxDrawerAcceleration),ay=clamp(k*(ty-drawer.y)-d*drawer.vy,-SHAKE.maxDrawerAcceleration,SHAKE.maxDrawerAcceleration);
 drawer.vx+=ax*dt;drawer.vy+=ay*dt;drawer.x+=drawer.vx*dt;drawer.y+=drawer.vy*dt;motion.x=drawer.x;motion.y=drawer.y;
 const yawTarget=held?-SHAKE.yawTravel*tx/SHAKE.travelX:0;
 drawer.alpha=SHAKE.yawStiffness*(yawTarget-drawer.yaw)-SHAKE.yawDamping*drawer.omega;
 drawer.omega+=drawer.alpha*dt;drawer.yaw+=drawer.omega*dt;
 // Amplify only deliberate, sharp acceleration; gentle motion and released return use unity gain.
 const magnitude=Math.hypot(ax,ay),effort=held?clamp((magnitude-500)/4500,0,1):0,gain=1+(SHAKE.forceGain-1)*effort*effort*(3-2*effort);
 const heavyGain=1+SHAKE.heavyTranslationGain*heavyShake*heavyShake;
 const ix=-ax*gain*heavyGain,iy=-ay*gain*heavyGain;
 step3(dt,ix,iy);
}
function simulate(ms){accumulator+=Math.min(ms,50)/1000;while(accumulator>=SHAKE.step){physicsStep(SHAKE.step);accumulator-=SHAKE.step;}}
function drawKnobFeedback(){if(!hand&&!knobHover)return;ctx.save();ctx.strokeStyle=hand?'rgba(255,235,170,.65)':'rgba(255,235,170,.38)';ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(W/2,DR.y+DR.h+14,31,19,0,0,Math.PI*2);ctx.stroke();ctx.restore();}

const world3=new CANNON.World({gravity:new CANNON.Vec3(0,0,-5400)});world3.frictionGravity=new CANNON.Vec3(0,0,-3600);world3.solver.iterations=30;world3.allowSleep=true;
// Cannon estimates each friction constraint's force limit from gravity rather than
// the actual normal load. Several touching edge contacts can therefore grip a
// neighbour even while the held tile moves away. Let a held tile slide freely;
// keep normal collision response and support, plus felt and wall friction.
const createTileFriction=world3.narrowphase.createFrictionEquationsFromContact;
world3.narrowphase.createFrictionEquationsFromContact=function(contact,result){
 const held=grab&&grab.tile.body,tilePair=contact.bi.mass>0&&contact.bj.mass>0;
 const heldPair=held&&(contact.bi===held||contact.bj===held);
 if(tilePair&&heldPair)return false;
 const start=result.length,created=createTileFriction.call(this,contact,result);
 // Smooth lacquered faces slide instead of entraining an entire stack.
 // Leave supporting normal forces intact. The solver bounds impulses directly,
 // so convert the face-friction force budget to a per-step impulse limit.
 if(tilePair&&Math.abs(contact.ni.z)>=.5){
  const factor=.08*world3.dt/.35;
  for(let i=start;i<result.length;i++){result[i].minForce*=factor;result[i].maxForce*=factor;}
 }
 return created;
};
const felt3=new CANNON.Material('felt'),wood3=new CANNON.Material('wood');
world3.addContactMaterial(new CANNON.ContactMaterial(felt3,wood3,{friction:.13,restitution:.025,contactEquationStiffness:1e8,contactEquationRelaxation:4}));
world3.addContactMaterial(new CANNON.ContactMaterial(wood3,wood3,{friction:.38,restitution:.18,contactEquationStiffness:1e8,contactEquationRelaxation:4}));
const tileMaterials=Array.from({length:3},(_,i)=>new CANNON.Material('wood-'+i));
for(let i=0;i<3;i++){world3.addContactMaterial(new CANNON.ContactMaterial(felt3,tileMaterials[i],{friction:.12+i*.025,restitution:.025}));world3.addContactMaterial(new CANNON.ContactMaterial(wood3,tileMaterials[i],{friction:.3,restitution:.22}));for(let j=0;j<=i;j++)world3.addContactMaterial(new CANNON.ContactMaterial(tileMaterials[i],tileMaterials[j],{friction:.35,restitution:.18}));}
function box3(x,y,z,w,h,d,mat){const b=new CANNON.Body({mass:0,material:mat,shape:new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2)),position:new CANNON.Vec3(x,y,z)});world3.addBody(b);}
box3(W/2,IN.y+IN.h/2,-20,IN.w+160,IN.h+160,40,felt3);
box3(IN.x-30,IN.y+IN.h/2,240,60,IN.h+120,520,wood3);box3(IN.x+IN.w+30,IN.y+IN.h/2,240,60,IN.h+120,520,wood3);box3(W/2,IN.y-30,240,IN.w+120,60,520,wood3);box3(W/2,IN.y+IN.h+30,240,IN.w+120,60,520,wood3);
function init3(){const vs=[],faces=[];for(const z of [-6,6])for(const p of pent(TR-2))vs.push(new CANNON.Vec3(p.x,p.y,z));faces.push([4,3,2,1,0],[5,6,7,8,9]);for(let i=0;i<5;i++){let j=(i+1)%5;faces.push([i,j,j+5,i+5]);}
 const shape=new CANNON.ConvexPolyhedron({vertices:vs,faces});
 tiles.forEach((t,i)=>{const old=t.body;const b=new CANNON.Body({mass:.94+(i%5)*.03,material:tileMaterials[i%3],shape,position:new CANNON.Vec3(old.position.x,old.position.y,6.3),linearDamping:.09,angularDamping:.24,sleepSpeedLimit:1,sleepTimeLimit:1});b.quaternion.setFromEuler(0,0,old.angle);world3.addBody(b);t.body=b;b.addEventListener('collide',e=>{const v=Math.abs(e.contact.getImpactVelocityAlongNormal());if(v>54)click(v/60);});});
}
const project3=v=>({x:v.x,y:v.y-(v.z-6)*.45});
function vertex3(b,x,y,z){return b.pointToWorldFrame(new CANNON.Vec3(x,y,z));}
function texture3(img,b,z,back){const half=(TH+16)/2,origin=project3(vertex3(b,back?half:-half,-half,z)),right=project3(vertex3(b,back?-half:half,-half,z)),down=project3(vertex3(b,back?half:-half,half,z));ctx.save();const ps=pent(TR-2).map(p=>project3(vertex3(b,p.x,p.y,z)));ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();ctx.transform((right.x-origin.x)/img.width,(right.y-origin.y)/img.width,(down.x-origin.x)/img.height,(down.y-origin.y)/img.height,origin.x,origin.y);ctx.drawImage(img,0,0);ctx.restore();}
function render3(){const order=tiles.slice().sort((a,b)=>(a.body.position.z+a.body.position.y*.001)-(b.body.position.z+b.body.position.y*.001));
 for(const t of order){const b=t.body,ps=pent(TR-2);
 // Find an actual supporting contact, so an upper tile casts a close shadow onto its support.
 let support=0;
 for(const c of world3.contacts){let other=null;if(c.bi===b&&c.ni.z<-.4)other=c.bj;else if(c.bj===b&&c.ni.z>.4)other=c.bi;
  if(other&&other.mass>0&&other.position.z<b.position.z){const z=other.position.z+6;support=Math.max(support,z);}}
 const footprint=[];for(const z of [-6,6])for(const p of ps)footprint.push(vertex3(b,p.x,p.y,z));
 const gap=Math.max(0,Math.min(...footprint.map(v=>v.z))-support),off=1.8+gap*.13;
 // Convex hull of the projected prism makes the shadow follow its real tilted silhouette.
 const pts=footprint.map(v=>({x:v.x+off,y:v.y-(support-6)*.45+off})).sort((a,b)=>a.x-b.x||a.y-b.y),cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
 const hull=[];for(const p of pts){while(hull.length>=2&&cross(hull[hull.length-2],hull[hull.length-1],p)<=0)hull.pop();hull.push(p);}const n=hull.length;for(let i=pts.length-2;i>=0;i--){const p=pts[i];while(hull.length>n&&cross(hull[hull.length-2],hull[hull.length-1],p)<=0)hull.pop();hull.push(p);}
 ctx.save();ctx.fillStyle='rgba(13,16,8,'+(.36/(1+gap*.009))+')';ctx.beginPath();hull.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.restore();
 for(let i=0;i<5;i++){const a=ps[i],c=ps[(i+1)%5];const normal=b.quaternion.vmult(new CANNON.Vec3(c.y-a.y,a.x-c.x,0));if(normal.z+normal.y*.45<=0)continue;
 const v=[vertex3(b,a.x,a.y,-6),vertex3(b,c.x,c.y,-6),vertex3(b,c.x,c.y,6),vertex3(b,a.x,a.y,6)].map(project3);ctx.beginPath();v.forEach((p,j)=>j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=t.sprite.sides[i];ctx.fill();ctx.strokeStyle=t.sprite.edge;ctx.lineWidth=.7;ctx.stroke();}
 const normal=b.quaternion.vmult(new CANNON.Vec3(0,0,1));const top=normal.z+normal.y*.45>0;texture3(t.sprite,b,top?6:-6,!top);}
}
// Only supported tiles receive scramble kicks/amplified drawer steering.
// Airborne bodies retain ballistic motion until their next physical contact.
function supportedTile(b){return world3.contacts.some(c=>c.enabled&&((c.bi===b&&c.ni.z<-.3)||(c.bj===b&&c.ni.z>.3)));}
function step3(dt,ix,iy){advanceScramble(dt);for(const t of tiles){const b=t.body;if(Math.hypot(ix,iy)>20)b.wakeUp();const rx=b.position.x-W/2,ry=b.position.y-(IN.y+IN.h/2),w=drawer.omega,a=drawer.alpha*SHAKE.yawTransferGain*(1+SHAKE.heavyYawGain*heavyShake);
 // Euler, centrifugal and Coriolis terms in the visibly yawing drawer frame.
 const shared=supportedTile(b)?(hand&&heavyShake>.15?.18:1):0;const fx=(ix+a*ry)*shared+w*w*rx+2*w*b.velocity.y,fy=(iy-a*rx)*shared+w*w*ry-2*w*b.velocity.x;
 // (applyForce wakes a sleeping body: a negligible drawer force must not, or no tile ever comes to rest)
 if(b.sleepState!==CANNON.Body.SLEEPING||Math.hypot(fx,fy)>20)b.applyForce(new CANNON.Vec3(fx*b.mass,fy*b.mass,0));const v=b.velocity.length();if(v>3800)b.applyForce(b.velocity.scale(-b.mass*(v-3800)*25/v));}world3.step(dt);}
function pick3(p){return tiles.slice().sort((a,b)=>b.body.position.z-a.body.position.z).find(t=>{const v=project3(t.body.position);return Math.hypot(v.x-p.x,v.y-p.y)<TR-4;});}
let grab=null,hover=null;
const pt=e=>localPoint(rawPoint(e));
function drop(){if(!grab)return;
 if(grab){
  const b=grab.tile.body,v=b.velocity,points=[];
  for(const z of [-6,6])for(const p of pent(TR-2))points.push(b.quaternion.vmult(new CANNON.Vec3(p.x,p.y,z)));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),times=[];
  if(v.x<-1)times.push((b.position.x+Math.min(...xs)-IN.x)/-v.x);
  if(v.x>1)times.push((IN.x+IN.w-b.position.x-Math.max(...xs))/v.x);
  if(v.y<-1)times.push((b.position.y+Math.min(...ys)-IN.y)/-v.y);
  if(v.y>1)times.push((IN.y+IN.h-b.position.y-Math.max(...ys))/v.y);
  const t=Math.min(...times.filter(t=>t>=0));
  // Preserve existing velocity, without boosting a throw. This only covers a
  // fast release already headed for a nearby wall, not ordinary free dragging.
  if(Math.hypot(v.x,v.y)>120&&t<.65)wallFlights.set(b,{expires:world3.stepnumber+Math.ceil(.75/SHAKE.step),hit:false});
 }
 clearTimeout(grab.timer);world3.removeConstraint(grab.con);world3.removeBody(grab.anchor);hover=grab.tile;grab=null;cv.classList.remove('grab');
}
// one tile in the hand at a time, held and dropped by the pointer that took it (a second finger used to replace the grab and leave the first tile pinned)
cv.addEventListener('pointerdown',e=>{if(travel.running||travel.y<-.5||e.button!==0||hand||grab)return;const p=pt(e),t=pick3(p);if(!t)return;e.preventDefault();cv.setPointerCapture(e.pointerId);t.body.wakeUp();audio();const anchor=new CANNON.Body({mass:0,position:t.body.position.clone()});world3.addBody(anchor);const con=new CANNON.PointToPointConstraint(t.body,new CANNON.Vec3(),anchor,new CANNON.Vec3(),3e4);world3.addConstraint(con);const g={id:e.pointerId,tile:t,anchor,con,lifted:false,start:p,offset:{x:t.body.position.x-p.x,y:t.body.position.y-p.y}};grab=g;g.timer=setTimeout(()=>{if(grab===g){g.lifted=true;g.anchor.position.z=55;}},HOLD_MS);hover=t;cv.classList.add('grab');});
cv.addEventListener('pointermove',e=>{if(hand||travel.running||travel.y<-.5){hover=null;return;}const p=pt(e);if(grab){if(e.pointerId!==grab.id)return;if(!grab.lifted&&Math.hypot(p.x-grab.start.x,p.y-grab.start.y)>HOLD_SLOP)clearTimeout(grab.timer);const target=wallPointerTarget(p.x+grab.offset.x,p.y+grab.offset.y);grab.anchor.position.set(target.x,target.y,grab.lifted?55:8);grab.tile.body.wakeUp();}else hover=pick3(p);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])cv.addEventListener(type,e=>{if(grab&&e.pointerId===grab.id)drop();});

/* Page transition: contents retract behind the fixed cabinet; front face closes flush at y=74.
   Leave through the original link only after closure, so library_sound.js keeps its fade and ambience-position handoff. */
const TRANSITION = Object.freeze({closedY:74-(DR.y+DR.h),openMs:1350,closeMs:1150});
const travel={y:TRANSITION.closedY,from:TRANSITION.closedY,to:0,start:0,duration:0,running:false};
let drawerReady=false,leaving=false,allowNavigation=false;
const libraryLink=document.querySelector('.roombar a');
function bezierEase(t,x1,y1,x2,y2){
 const val=(u,a,b)=>3*(1-u)*(1-u)*u*a+3*(1-u)*u*u*b+u*u*u;
 let lo=0,hi=1,u=t;
 for(let i=0;i<14;i++){u=(lo+hi)/2;if(val(u,x1,x2)<t)lo=u;else hi=u;}
 return val(u,y1,y2);
}
function beginTravel(open){
 if(!drawerReady)return;
 finishHand();drop();hover=null;knobHover=false;
 travel.from=travel.y;travel.to=open?0:TRANSITION.closedY;travel.start=performance.now();
 travel.duration=(open?TRANSITION.openMs:TRANSITION.closeMs)*Math.abs(travel.to-travel.from)/Math.abs(TRANSITION.closedY);
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)travel.duration=0;
 travel.running=travel.duration>1;
 if(travel.running)playDrawer(open?'open':'close',!open);
 else{travel.y=travel.to;finishTravel();}
}
function finishTravel(){
 if(leaving&&travel.to===TRANSITION.closedY){allowNavigation=true;setTimeout(()=>libraryLink.click(),sound?120:0);}   // (a new task, and 120 ms later with sound so the closing sound's tail is heard before the page changes: a click() from inside the link's own click, as with reduced motion, is ignored)
}
function updateTravel(now){
 if(!travel.running)return;
 const t=Math.max(0,Math.min(1,(now-travel.start)/travel.duration)),opening=travel.to===0;
 const ease=opening?bezierEase(t,.30,0,.18,1):bezierEase(t,.45,0,.22,1);
 travel.y=travel.from+(travel.to-travel.from)*ease;
 if(t>=1){travel.y=travel.to;travel.running=false;finishTravel();}
}
libraryLink.addEventListener('click',e=>{
 if(allowNavigation||!drawerReady||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||libraryLink.target)return;
 e.preventDefault();if(leaving)return;leaving=true;beginTravel(false);
});
addEventListener('pageshow',e=>{
 if(!e.persisted||!drawerReady)return;
 leaving=false;allowNavigation=false;travel.y=TRANSITION.closedY;accumulator=0;prev=performance.now();beginTravel(true);
});

// Manual tile collisions: central edge pushes, physical wall impacts, and
// momentum retained for a fast release already travelling toward a nearby wall.
const wallFlights=new Map();

const createDragFriction=world3.narrowphase.createFrictionEquationsFromContact;
world3.narrowphase.createFrictionEquationsFromContact=function(c,result){
 const start=result.length,created=createDragFriction.call(this,c,result);
 const wallBody=c.bi.material===wood3?c.bj:c.bj.material===wood3?c.bi:null;
 if(wallBody&&((grab&&!grab.lifted&&grab.tile.body===wallBody)||wallFlights.has(wallBody))){
  // Keep sliding along a wall during an oblique impact, rather than erasing
  // all tangential momentum with a force-sized friction impulse.
  for(let i=start;i<result.length;i++){result[i].minForce*=world3.dt;result[i].maxForce*=world3.dt;}
 }
 if(grab)return created;
 const b=c.bi.material===felt3?c.bj:c.bj.material===felt3?c.bi:null,flight=wallFlights.get(b);
 if(flight&&world3.stepnumber<=flight.expires){
  // Keep physical felt resistance during the short wall-bound release. The
  // original force-sized solver cap otherwise erases a flick in one substep.
  for(let i=start;i<result.length;i++){result[i].minForce*=world3.dt;result[i].maxForce*=world3.dt;}
 }
 return created;
};
const getDrawerContacts=world3.narrowphase.getContacts;
world3.narrowphase.getContacts=function(...args){
 const result=getDrawerContacts.apply(this,args);
 for(const [b,flight] of wallFlights){
  if(world3.stepnumber>flight.expires){wallFlights.delete(b);continue;}
  if(!flight.hit&&args[3].some(c=>(c.bi===b&&c.bj.material===wood3)||(c.bj===b&&c.bi.material===wood3))){flight.hit=true;flight.expires=world3.stepnumber+Math.ceil((.50)/SHAKE.step);}
 }
 for(const c of args[3]){
  const b=c.bi.material===wood3?c.bj:c.bj.material===wood3?c.bi:null;
  if(wallFlights.has(b)&&Math.abs(c.ni.z)<.35)c.restitution=.65;
 }
 for(const [body,flight] of wallFlights){
  if(grab||world3.stepnumber>flight.expires)continue;
  const fs=args[5].filter(f=>(f.bi===body&&f.bj.material===felt3)||(f.bj===body&&f.bi.material===felt3));
  const count=Math.max(1,fs.length/2);
  for(const f of fs){f.minForce/=count;f.maxForce/=count;}
 }
 if(!grab)return result;
 grab.con.equationX.enabled=true;grab.con.equationY.enabled=true;
 const held=grab.tile.body,edgeTiles=new Set();
 const stops=grab.wallStops||(grab.wallStops={});
 for(const axis of ['x','y']){
  const stop=stops[axis];
  if(stop){
   if(((grab.wallPointer||grab.anchor.position)[axis]-stop.at)*stop.sign>0){
    if(world3.stepnumber<stop.reboundUntil&&(world3.stepnumber<stop.releaseUntil||held.velocity[axis]*stop.sign < -30)){
     // Let the real wall impulse recoil before the hand catches the tile.
     (axis==='x'?grab.con.equationX:grab.con.equationY).enabled=false;
     stop.at=held.position[axis];
    }else{if(stop.reboundUntil){stop.at=held.position[axis];stop.reboundUntil=0;}grab.anchor.position[axis]=stop.at;}
   }else delete stops[axis];
  }
 }
 for(const c of args[3]){
  if(c.bi!==held&&c.bj!==held)continue;
  const a=c.bi,b=c.bj;
  // Change only edge impacts between nearly level, side-by-side tiles. Face
  // support/stack contacts and deliberately lifted or tilted tiles stay in 3D.
  if(grab.lifted||a.mass<=0||b.mass<=0||Math.abs(a.position.z-b.position.z)>5||Math.abs(c.ni.z)>.35)continue;
  const up=new CANNON.Vec3(0,0,1);
  if(Math.abs(a.quaternion.vmult(up).z)<.94||Math.abs(b.quaternion.vmult(up).z)<.94)continue;
  c.ni.z=0;c.ni.normalize();
  // The push acts through the wooden edge's midline, avoiding the lever that
  // tips a neighbour upward merely because the hand's original z target is 8.
  c.ri.z=0;c.rj.z=0;
  edgeTiles.add(a);edgeTiles.add(b);
 }
 if(args[3].some(c=>((c.bi===held&&c.bj.material===wood3)||(c.bj===held&&c.bi.material===wood3))&&Math.abs(c.ni.z)<.35))edgeTiles.add(held);
 for(const c of args[3])if(((edgeTiles.has(c.bi)&&c.bj.material===wood3)||(edgeTiles.has(c.bj)&&c.bi.material===wood3))&&Math.abs(c.ni.z)<.35){
  c.ni.z=0;c.ni.normalize();if(!grab.lifted){c.ri.z=0;c.rj.z=0;}
  if(c.bi===held||c.bj===held){
   const sign=c.bi===held?1:-1,nx=c.ni.x*sign,ny=c.ni.y*sign;
   const outward=(grab.anchor.position.x-held.position.x)*nx+(grab.anchor.position.y-held.position.y)*ny;
   const incoming=Math.max(0,held.velocity.x*nx+held.velocity.y*ny);
   c.restitution=incoming>120?(.65):.22;
   const reboundUntil=incoming>120?world3.stepnumber+Math.ceil(Math.min(.26,.10+incoming*.00007)/SHAKE.step):0;
   // At an actual wall contact, let the wall's normal response win over
   // the hand pulling farther through it. Keep tangential mouse control.
   if(outward>0||incoming>120){
    if(Math.abs(nx)>.5&&!stops.x){grab.con.equationX.enabled=false;stops.x={at:held.position.x-Math.sign(nx)*.8,sign:Math.sign(nx),reboundUntil,releaseUntil:world3.stepnumber+8};}
    if(Math.abs(ny)>.5&&!stops.y){grab.con.equationY.enabled=false;stops.y={at:held.position.y-Math.sign(ny)*.8,sign:Math.sign(ny),reboundUntil,releaseUntil:world3.stepnumber+8};}
   }
  }
 }
 if(Object.values(stops).some(stop=>world3.stepnumber<stop.reboundUntil)){
  for(const f of args[5])if((f.bi===held&&f.bj.material===felt3)||(f.bj===held&&f.bi.material===felt3)){
   f.minForce*=world3.dt;f.maxForce*=world3.dt;
  }
 }
 // Outside the brief recoil window, felt friction retains its original strength. During edge pushes,
 // apply its tangential resistance at the same midline so it cannot form a
 // lever that flips the neighbour instead of letting the wooden edges push.
 for(const f of args[5])if((edgeTiles.has(f.bi)&&(f.bj.material===felt3||f.bj.material===wood3))||(edgeTiles.has(f.bj)&&(f.bi.material===felt3||f.bi.material===wood3))){
  f.ri.z=0;f.rj.z=0;
 }
 return result;
};
function wallPointerTarget(x,y){
 // No stop target at the tile's contact point: that target was braking the
 // hand before impact. Follow the pointer beyond the wall, and let the
 // collision itself stop the body. The broad bounds only limit captured
 // pointers dragged far outside the entire drawer.
 return grab.wallPointer={x:clamp(x,IN.x-TR,IN.x+IN.w+TR),y:clamp(y,IN.y-TR,IN.y+IN.h+TR)};
}


