/* Turning a wall map of the library over to its other side (library/maps/, js/library_maps.js): the maps 1-8 have an alternate side (1a-8a) printed on the
   back of the same sheet. A click on the sheet hands the hanging map to this module, which hides the DOM sheet, rods and cord and plays a person turning it
   round in 3D (three.js, js/lib/three.module.min.js), then the caller draws the other side in the DOM again.
   The map is simulated, not animated: a sheet of paper (a grid of particles held by distance constraints: it bends and twists but does not stretch,
   position-based dynamics with Verlet integration) between two heavy rigid rods, hanging on a cord from the hook, with gravity, air drag and the wall
   behind it. Two hands hold the top rod and follow one smooth path (PATH: cubic Hermite through via-points, so lifting it off the hook, pulling it away from
   the wall, turning it and hanging it back blend into one movement); everything else moves only because the paper pulls on it.
   The textures are pictures of the two DOM sheets (web/wall_maps/<id>-sheet.webp, scripts/build_library_sheets.py), so the first and the last frame
   look like the DOM sheet. The lighting is calibrated so a sheet flat on the wall shows its picture unchanged; it gets darker as it turns away. The
   shadow on the wall is drawn on a 2D canvas under the 3D one, from the sheet's outline (the DOM sheet's blurred shadow at rest).
   Sim units: the sheet is PW = 3.8 wide (the scale of the approved mock: decimetres, seconds). */
import * as THREE from './lib/three.module.min.js';

const PW = 3.8, NX = 22, GRAV = -98, DT = 1 / 240, ITER = 12;
const PI = Math.PI;

// one hand path for the top rod: [t, dx, dy, dz, yaw, roll], relative to where the rod hangs; at rest only at the start and the end
function path(keys) {
  const n = keys.length, tan = keys.map((k, i) => k.map((v, c) => (c === 0 || i === 0 || i === n - 1 ? 0 : (keys[i + 1][c] - keys[i - 1][c]) / (keys[i + 1][0] - keys[i - 1][0]))));
  return (t) => {
    if (t <= keys[0][0]) return keys[0].slice(1);
    if (t >= keys[n - 1][0]) return keys[n - 1].slice(1);
    let i = 0; while (t > keys[i + 1][0]) i++;
    const h = keys[i + 1][0] - keys[i][0], u = (t - keys[i][0]) / h, u2 = u * u, u3 = u2 * u;
    return [1, 2, 3, 4, 5].map((c) => (2 * u3 - 3 * u2 + 1) * keys[i][c] + (u3 - 2 * u2 + u) * h * tan[i][c] + (-2 * u3 + 3 * u2) * keys[i + 1][c] + (u3 - u2) * h * tan[i + 1][c]);
  };
}
// up and out in one sweep, the turn starts on the way out and ends on the way back, then down onto the hook (option A of the mock)
const PATH = path([[0, 0, 0, 0, 0, 0], [.38, .02, .26, .4, .03, .03], [.72, .1, .36, 1.45, .45, -.04], [1.05, .16, .34, 2.3, 1.62, .06],
  [1.38, .06, .3, 1.75, 2.72, -.04], [1.72, .01, .26, .55, PI - .02, .01], [2.02, 0, .12, .14, PI, 0], [2.25, 0, 0, 0, PI, 0]]);
const RELEASE = 2.3, UNHOOK = .22, REHOOK = 2.05, LAND_AT = 2.75, LAND = .9;

class Sim {
  // d: { PH, NY, rodR: [top, bottom], reach (half length of a rod with its knob), hook: [x, y, z] }
  constructor(d) {
    Object.assign(this, d);
    const NY = d.NY, n = (NX + 1) * (NY + 1); this.n = n;
    this.p = new Float32Array(n * 3); this.q = new Float32Array(n * 3); this.w = new Float32Array(n); this.kin = new Uint8Array(n); this.rod = new Uint8Array(n);
    this.rx = []; for (let i = 0; i <= NX; i++) this.rx.push(-PW / 2 + PW * i / NX);
    this.ry = []; for (let j = 0; j <= NY; j++) this.ry.push(d.PH / 2 - d.PH * j / NY);
    const id = (i, j) => j * (NX + 1) + i;
    this.top = this.rx.map((_, i) => id(i, 0)); this.bot = this.rx.map((_, i) => id(i, NY));
    this.zmin = new Float32Array(n);
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const k = id(i, j), r = j === 0 || j === NY; this.rod[k] = r ? 1 : 0;
      this.zmin[k] = r ? d.rodR[j ? 1 : 0] + .004 : .006;
      this.p[3 * k] = this.rx[i]; this.p[3 * k + 1] = this.ry[j]; this.p[3 * k + 2] = this.zmin[k];
      this.w[k] = r ? 1 / 8 : 1;                                     // the rods are much heavier than the paper
    }
    this.q.set(this.p); this.rest = Float32Array.from(this.p);
    const A = [], B = [], L = [], S = [], add = (a, b, s) => {
      A.push(a); B.push(b); S.push(s); L.push(Math.hypot(this.p[3 * a] - this.p[3 * b], this.p[3 * a + 1] - this.p[3 * b + 1], this.p[3 * a + 2] - this.p[3 * b + 2]));
    };
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      if (i < NX) add(id(i, j), id(i + 1, j), 1);
      if (j < NY) add(id(i, j), id(i, j + 1), 1);
      if (i < NX && j < NY) { add(id(i, j), id(i + 1, j + 1), .9); add(id(i + 1, j), id(i, j + 1), .9); }
      if (i < NX - 1) add(id(i, j), id(i + 2, j), .55);            // paper resists bending
      if (j < NY - 1) add(id(i, j), id(i, j + 2), .55);
    }
    this.ca = Int32Array.from(A); this.cb = Int32Array.from(B); this.cl = Float32Array.from(L); this.cs = Float32Array.from(S);
    // tethers: no point of the sheet gets further from the top rod (its column's top) than it is at rest, so the heavy bottom rod cannot stretch the paper
    const TA = [], TB = [], TL = [];
    for (let j = 1; j <= NY; j++) for (let i = 0; i <= NX; i++) { const a = id(i, 0), b = id(i, j); TA.push(a); TB.push(b); TL.push(Math.hypot(this.p[3 * a] - this.p[3 * b], this.p[3 * a + 1] - this.p[3 * b + 1], this.p[3 * a + 2] - this.p[3 * b + 2])); }
    this.ta = Int32Array.from(TA); this.tb = Int32Array.from(TB); this.tl = Float32Array.from(TL);
    const e = this.top[0]; this.cord = Math.hypot(this.p[3 * e] - d.hook[0], this.p[3 * e + 1] - d.hook[1], this.p[3 * e + 2] - d.hook[2]);
    this.apex = d.hook; this.grip = null; this.t = 0;
  }
  center(row) { const p = this.p, c = [0, 0, 0]; for (const k of row) for (let a = 0; a < 3; a++) c[a] += p[3 * k + a] / row.length; return c; }
  dir(row) {
    const p = this.p, a = row[0], b = row[row.length - 1], d = [p[3 * b] - p[3 * a], p[3 * b + 1] - p[3 * a + 1], p[3 * b + 2] - p[3 * a + 2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l];
  }
  hold() { this.grip = { c0: this.center(this.top), yaw0: Math.atan2(this.dir(this.top)[2], this.dir(this.top)[0]) }; this.top.forEach((k) => (this.kin[k] = 1)); }
  release() { this.top.forEach((k) => (this.kin[k] = 0)); this.grip = null; }
  step() {
    const p = this.p, q = this.q, w = this.w, kin = this.kin;
    this.t += DT; const t = this.t;
    if (t < RELEASE && !this.grip) this.hold();
    if (t >= RELEASE && this.grip) this.release();
    this.apex = t > UNHOOK && t < REHOOK ? null : this.hook;
    if (this.grip) {                                                  // the hands move the top rod
      const g = this.grip, k5 = PATH(t), c = [g.c0[0] + k5[0], g.c0[1] + k5[1], g.c0[2] + k5[2]], yaw = g.yaw0 + k5[3], cr = Math.cos(k5[4]), sr = Math.sin(k5[4]);
      this.top.forEach((k, i) => {
        const x = this.rx[i]; q[3 * k] = p[3 * k]; q[3 * k + 1] = p[3 * k + 1]; q[3 * k + 2] = p[3 * k + 2];
        p[3 * k] = c[0] + Math.cos(yaw) * cr * x; p[3 * k + 1] = c[1] + sr * x; p[3 * k + 2] = c[2] + Math.sin(yaw) * cr * x;
      });
    }
    for (let k = 0; k < this.n; k++) {                                // inertia, gravity, air drag
      if (kin[k]) continue; const drag = this.rod[k] ? .998 : .985;
      for (let a = 0; a < 3; a++) { const i = 3 * k + a, v = (p[i] - q[i]) * drag; q[i] = p[i]; p[i] += v; }
      p[3 * k + 1] += GRAV * DT * DT;
    }
    const { ca, cb, cl, cs } = this;
    for (let it = 0; it < ITER; it++) {
      for (let c = 0; c < ca.length; c++) {
        const a = ca[c], b = cb[c], wa = kin[a] ? 0 : w[a], wb = kin[b] ? 0 : w[b], ws = wa + wb; if (!ws) continue;
        const dx = p[3 * b] - p[3 * a], dy = p[3 * b + 1] - p[3 * a + 1], dz = p[3 * b + 2] - p[3 * a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-9) continue; const f = (d - cl[c]) / d * cs[c] / ws;
        p[3 * a] += dx * f * wa; p[3 * a + 1] += dy * f * wa; p[3 * a + 2] += dz * f * wa;
        p[3 * b] -= dx * f * wb; p[3 * b + 1] -= dy * f * wb; p[3 * b + 2] -= dz * f * wb;
      }
      for (let c = 0; c < this.ta.length; c++) {
        const a = this.ta[c], b = this.tb[c]; if (kin[b]) continue;
        const dx = p[3 * b] - p[3 * a], dy = p[3 * b + 1] - p[3 * a + 1], dz = p[3 * b + 2] - p[3 * a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz), l = this.tl[c];
        if (d > l) { const s = l / d; p[3 * b] = p[3 * a] + dx * s; p[3 * b + 1] = p[3 * a + 1] + dy * s; p[3 * b + 2] = p[3 * a + 2] + dz * s; }
      }
      this.rigid(this.top, 0); this.rigid(this.bot, 1);
      for (let k = 0; k < this.n; k++) if (!kin[k] && !this.rod[k] && p[3 * k + 2] < this.zmin[k]) p[3 * k + 2] = this.zmin[k];   // the wall
    }
    for (let k = 0; k < this.n; k++) if (!kin[k] && !this.rod[k] && p[3 * k + 2] < this.zmin[k] + .004) {      // friction of the paper against the wall (the round rods slide)
      q[3 * k] += (p[3 * k] - q[3 * k]) * .35; q[3 * k + 1] += (p[3 * k + 1] - q[3 * k + 1]) * .35;
    }
  }
  rigid(row, n) {                                                     // a rod stays straight, keeps its length and stays out of the wall
    const p = this.p, kin = this.kin; if (row.every((k) => kin[k])) return;
    let d = this.dir(row), c = this.center(row);
    if (n === 0 && this.apex) {                                       // the cord on the ends of the top rod: it can go slack, it cannot stretch (it holds the rod as a whole)
      const ax = this.apex, H = PW / 2;
      for (let r = 0; r < 6; r++) {                                   // (a rod of fixed length between two cords of fixed length: a few rounds find where it hangs)
        const e = [c.map((v, a) => v - d[a] * H), c.map((v, a) => v + d[a] * H)]; let moved = false;
        for (const q of e) { const dx = q[0] - ax[0], dy = q[1] - ax[1], dz = q[2] - ax[2], l = Math.hypot(dx, dy, dz); if (l > this.cord) { const s = this.cord / l; q[0] = ax[0] + dx * s; q[1] = ax[1] + dy * s; q[2] = ax[2] + dz * s; moved = true; } }
        if (!moved) break;
        c = e[0].map((v, a) => (v + e[1][a]) / 2); const l = Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1], e[1][2] - e[0][2]) || 1; d = [0, 1, 2].map((a) => (e[1][a] - e[0][a]) / l);
      }
    }
    // the wall pushes an end of the rod that touches it (so a rod at a slant is turned flat against the wall, not moved out as a whole)
    const R = this.reach, lim = this.rodR[n] + .004, e0 = c.map((v, a) => v - d[a] * R), e1 = c.map((v, a) => v + d[a] * R);
    if (e0[2] < lim || e1[2] < lim) {
      e0[2] = Math.max(e0[2], lim); e1[2] = Math.max(e1[2], lim);
      c = e0.map((v, a) => (v + e1[a]) / 2); const l = Math.hypot(e1[0] - e0[0], e1[1] - e0[1], e1[2] - e0[2]) || 1; d = [0, 1, 2].map((a) => (e1[a] - e0[a]) / l);
    }
    row.forEach((k, i) => { for (let a = 0; a < 3; a++) p[3 * k + a] = c[a] + d[a] * this.rx[i]; });
  }
  energy() { let m = 0; for (let i = 0; i < this.p.length; i++) m = Math.max(m, Math.abs(this.p[i] - this.q[i])); return m; }
}

/* ---------- drawing ---------- */
let R = null;
const texCache = new Map();
function rodTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 2; const g = c.getContext('2d');
  const stops = [[0, [58, 32, 16]], [.22, [154, 102, 52]], [.38, [224, 170, 106]], [.7, [138, 84, 40]], [1, [42, 22, 8]]];   // (the DOM rod's gradient, top to bottom)
  for (let x = 0; x < 256; x++) {
    const f = (1 - Math.sin(2 * PI * (x + .5) / 256)) / 2; let i = 0; while (f > stops[i + 1][0]) i++;
    const [a, ca] = stops[i], [b, cb] = stops[i + 1], k = (f - a) / (b - a); g.fillStyle = 'rgb(' + ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(',') + ')'; g.fillRect(x, 0, 1, 2);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}
// the box-shadow of a DOM rod (0 6px 10px rgba(0,0,0,.5) on the top rod, 0 8px 12px rgba(0,0,0,.55) on the bottom one), as it falls on the 40 px of paper
// next to it: a column of alpha (a box blurred by a Gaussian of sigma = blur / 2); row 0 is the strip's top
const erf = (x) => { const t = 1 / (1 + .3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x); return x < 0 ? -y : y; };
const rodShadowCache = [];
function rodShadow(n) {
  if (rodShadowCache[n]) return rodShadowCache[n];
  // rig px from the rod's middle: the top rod is 24 px high (its middle 2 px above the paper), the bottom rod 26 px (its middle 3 px below the paper's edge)
  const H = 160, c = document.createElement('canvas'); c.width = 1; c.height = H; const g = c.getContext('2d');
  const [half, dy, blur, a] = n ? [13, 8, 12, .55] : [12, 6, 10, .5], sig = blur / 2, y0 = n ? -43 : 2;   // (y0: the strip's top, in px below the rod's middle)
  for (let i = 0; i < H; i++) {
    const y = y0 + (i + .5) / H * 40, lo = (-half + dy - y) / (sig * Math.SQRT2), hi = (half + dy - y) / (sig * Math.SQRT2);
    g.fillStyle = 'rgba(0,0,0,' + (a * .5 * (erf(hi) - erf(lo))).toFixed(4) + ')'; g.fillRect(0, i, 1, 1);
  }
  return (rodShadowCache[n] = new THREE.CanvasTexture(c));
}
function knobTexture(w, h) {                                          // the DOM knob: radial-gradient(circle at 35% 30%, #5a5a5a, #141414 60%, #000) in an ellipse
  const c = document.createElement('canvas'); c.width = w * 4; c.height = h * 4; const g = c.getContext('2d'); g.scale(4, 4);
  const cx = w * .35, cy = h * .3, R = Math.hypot(w - cx, h - cy), gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(.6, '#141414'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, 2 * PI); g.fill();
  return new THREE.CanvasTexture(c);
}
function setup(mstage, before) {
  if (R) return R;
  // three canvases over the rig: the shadows on the wall, the hook and its cord (2D, drawn like the DOM's SVG), the map (3D)
  const mk = (cls) => { const c = document.createElement('canvas'); c.className = cls; Object.assign(c.style, { width: '1920px', height: '1080px', display: 'none' }); mstage.insertBefore(c, before); return c; };
  const shadow = mk('flipshadow'), cord = mk('flipcord'), gl = mk('flipgl');
  shadow.width = 960; shadow.height = 540;
  const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(20, 16 / 9, 1, 10), group = new THREE.Group();
  // a sheet flat on the wall gets ambient + sun . n = 1: its picture unchanged
  const L = new THREE.Vector3(-.35, .45, 1).normalize(), AMB = .55;
  const sun = new THREE.DirectionalLight(0xffffff, (1 - AMB) / L.z); sun.position.copy(L); scene.add(new THREE.AmbientLight(0xffffff, AMB), sun, group);
  const rodMat = new THREE.MeshBasicMaterial({ map: rodTexture(), transparent: true });   // (transparent only to be drawn after the rod shadows, which have no depth test)
  const knobMats = [[32, 36], [32, 38]].map(([w, h]) => new THREE.SpriteMaterial({ map: knobTexture(w, h) }));   // (a ball looks the same from every side: a picture facing the eye)
  R = { mstage, shadow, cord, gl, renderer, scene, cam, group, rodMat, knobMats, ctx: shadow.getContext('2d'), cctx: cord.getContext('2d') };
  return R;
}
// the picture of a side, resampled once to the size it has on the screen (one texel per screen pixel at rest, as sharp as the DOM sheet: a texture
// bigger than that would be mipmapped and come out softer, so the map would seem to come into focus when the DOM takes over)
function texture(img, back, W, H) {
  const key = img.src + (back ? '#b' : '') + '@' + W + 'x' + H; if (texCache.has(key)) return texCache.get(key);
  let src = img, sw = img.naturalWidth, sh = img.naturalHeight;
  while (sw / 2 >= W) {                                                // (halving steps first: one big step down would alias)
    const c = document.createElement('canvas'); c.width = Math.round(sw / 2); c.height = Math.round(sh / 2); const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height); src = c; sw = c.width; sh = c.height;
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, W, H);
  const t = new THREE.CanvasTexture(c); t.anisotropy = R.renderer.capabilities.getMaxAnisotropy(); t.minFilter = THREE.LinearMipmapLinearFilter;
  if (back) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; }
  if (texCache.size > 6) { for (const [k, v] of texCache) { v.dispose(); texCache.delete(k); break; } }
  texCache.set(key, t); return t;
}
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Turns the sheet over. o: { mstage, before (the element the canvases go in front of), rig, w, h (the sheet in rig px), TOP (the sheet's place under
   the hook in the rig), box (the DOM sheet's box on the 1920 x 1080 stage: x, y, w, h), scale (the stage's scale on the page), front, back (loaded
   <img> of the two sides) }.
   Resolves with a function that removes the 3D map; call it once the DOM shows the other side. */
export function turnSheet(o) {
  if (reducedMotion()) return Promise.resolve(() => {});
  const r = setup(o.mstage, o.before), S = PW / o.w, PH = o.h * S, NY = Math.max(8, Math.round(NX * PH / PW));
  const sim = new Sim({ PH, NY, rodR: [12 * S, 13 * S], reach: PW / 2 + 62 * S, hook: [0, (o.TOP + o.h / 2 - 44) * S, .03] });
  // where the DOM sheet really is on the stage (its box as laid out, not as computed: the layout rounds), so the first and the last frame lie on it
  const b = o.box, K = b.w / o.w, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const u = K / S, D = 4.2 * b.w;                                      // (stage px per sim unit; the eye's distance)
  const { renderer, scene, cam, group, ctx } = r;
  cam.fov = 2 * Math.atan(540 / D) * 180 / PI; cam.near = D * .05; cam.far = D * 3; cam.position.set(960, -540, D); cam.lookAt(960, -540, 0); cam.updateProjectionMatrix();
  group.position.set(cx, -cy, 0); group.scale.setScalar(u);
  const pr = Math.min(2.5, (devicePixelRatio || 1) * o.scale);       // (device pixels per stage pixel)
  renderer.setPixelRatio(pr); renderer.setSize(1920, 1080, false);

  const geo = new THREE.BufferGeometry(), idx = [], uv = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) uv.push(i / NX, 1 - j / NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  geo.setIndex(idx); const shown = new Float32Array(sim.p.length); geo.setAttribute('position', new THREE.BufferAttribute(shown, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const wide = (o.back.naturalWidth / o.back.naturalHeight) / (o.front.naturalWidth / o.front.naturalHeight);   // (the other side's sheet can be a pixel or two wider or narrower)
  const TW = Math.min(4096, Math.round(b.w * pr)), TH = Math.min(4096, Math.round(b.h * pr));
  const front = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: texture(o.front, false, TW, TH), side: THREE.FrontSide }));
  const back = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: texture(o.back, true, Math.min(4096, Math.round(b.w * wide * pr)), TH), side: THREE.BackSide }));
  const parts = [front, back];
  const KNOB = [[32, 36], [32, 38]];
  const rods = [12, 13].map((rpx, n) => {
    const g = new THREE.Group(), rg = new THREE.CylinderGeometry(rpx * S, rpx * S, (o.w + 68) * S, 96); rg.rotateZ(PI / 2);
    const rm = new THREE.Mesh(rg, r.rodMat); rm.renderOrder = 10; g.add(rm);
    for (const s of [-1, 1]) { const kn = new THREE.Sprite(r.knobMats[n]); kn.scale.set(KNOB[n][0] * S, KNOB[n][1] * S, 1); kn.position.set(s * (o.w / 2 + 46) * S, 0, rpx * S); kn.renderOrder = 10; g.add(kn); }
    // the rod's shadow on the paper (the DOM rod's box-shadow falls on the sheet): a strip of the paper's width, just off the paper on both sides
    const sh = rodShadow(n), ph = 40, y0 = n ? -43 : 2, stripMid = -(y0 + ph / 2);   // (the strip: the 40 px of paper under the top rod / above the bottom rod; y0 its top in px below the rod's middle)
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w * S, ph * S), new THREE.MeshBasicMaterial({ map: sh, transparent: true, depthWrite: false, depthTest: false }));   // (no depth test: while the paper settles it bulges a few px in front of this thin strip and would hide it)
      m.renderOrder = 5;
      m.position.set(0, stripMid * S, side * .6 * S); if (side < 0) m.rotation.y = PI; g.add(m);
    }
    return g;
  });
  parts.push(...rods); parts.forEach((m) => { m.frustumCulled = false; group.add(m); });

  const eul = new THREE.Euler(0, 0, 0, 'YZX'), pv = new THREE.Vector3();
  // a point of the simulation -> the stage (the eye's perspective)
  const screen = (q) => { pv.set(q[0], q[1], q[2]); group.localToWorld(pv); pv.project(cam); return [(pv.x + 1) * 960, (1 - pv.y) * 540]; };
  r.cord.width = Math.round(1920 * pr); r.cord.height = Math.round(1080 * pr);
  const hookX = cx, hookY = b.y - (o.TOP - 40) * K;                 // (the brass hook of the DOM: its SVG circle at (w / 2, 40) of the rig, the sheet at TOP)
  let apexDrawn = sim.hook.slice();
  const ring = [];                                                     // the sheet's outline, for its shadow
  for (let i = 0; i <= NX; i++) ring.push(sim.top[i]);
  for (let j = 1; j < NY; j++) ring.push(j * (NX + 1) + NX);
  for (let i = NX; i >= 0; i--) ring.push(sim.bot[i]);
  for (let j = NY - 1; j > 0; j--) ring.push(j * (NX + 1));
  function draw(dt) {
    // drawn with each particle's distance from the wall counted from where it rests (paper and rods lie a little off the wall in the simulation; drawn
    // like that, the eye's perspective would make the resting sheet and rods a pixel or two bigger than the DOM's)
    for (let k = 0; k < sim.n; k++) { shown[3 * k] = sim.p[3 * k]; shown[3 * k + 1] = sim.p[3 * k + 1]; shown[3 * k + 2] = sim.p[3 * k + 2] - sim.zmin[k]; }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
    const ends = [];
    [sim.top, sim.bot].forEach((row, n) => {
      const c = sim.center(row), d = sim.dir(row), yaw = Math.atan2(d[2], d[0]), roll = Math.asin(Math.max(-1, Math.min(1, d[1])));
      rods[n].position.set(c[0], c[1] + (n ? -3 : 2) * S, c[2] - sim.rodR[n] - .004); eul.set(0, -yaw, roll); rods[n].quaternion.setFromEuler(eul); ends.push([c, d]);
    });
    const [c, d] = ends[0], tie = o.w / 2 + 52, up = [0, 4 * S, 0], A = c.map((v, a) => v - d[a] * tie * S + up[a]), B = c.map((v, a) => v + d[a] * tie * S + up[a]);   // (the cord is tied 4 px above the sheet's edge)
    const want = sim.apex || [c[0], c[1] + sim.hook[1] - sim.ry[0], c[2] + .03], f = Math.min(1, dt * 12);   // (off the hook the loop of cord stands above the rod)
    apexDrawn = apexDrawn.map((v, a) => v + (want[a] - v) * f);
    renderer.render(scene, cam);
    // the cord and the hook, drawn exactly as the DOM's SVG draws them (a dark line, light dashes over it, the brass hook on top)
    const cc = r.cctx; cc.setTransform(pr, 0, 0, pr, 0, 0); cc.clearRect(0, 0, 1920, 1080);
    const zr = sim.rodR[0] + .004, pA = screen([A[0], A[1], A[2] - zr]), pX = screen([apexDrawn[0], apexDrawn[1], apexDrawn[2] - sim.hook[2]]), pB = screen([B[0], B[1], B[2] - zr]);
    const line = () => { cc.beginPath(); cc.moveTo(pA[0], pA[1]); cc.lineTo(pX[0], pX[1]); cc.lineTo(pB[0], pB[1]); };
    cc.lineJoin = 'miter'; cc.lineCap = 'butt';
    line(); cc.setLineDash([]); cc.lineWidth = 3.5 * K; cc.strokeStyle = '#2a1c10'; cc.stroke();
    line(); cc.setLineDash([3 * K, 3 * K]); cc.lineWidth = 1.5 * K; cc.strokeStyle = '#a88a5a'; cc.stroke(); cc.setLineDash([]);
    cc.beginPath(); cc.arc(hookX, hookY, 11 * K, 0, 2 * PI); cc.fillStyle = '#b88a2e'; cc.fill(); cc.lineWidth = 2 * K; cc.strokeStyle = '#3a2808'; cc.stroke();
    cc.beginPath(); cc.arc(hookX - 3 * K, hookY - 3 * K, 4 * K, 0, 2 * PI); cc.fillStyle = '#f4dc9a'; cc.fill();
    // the shadows on the wall: moved down and right and more blurred the further a thing is from the wall (at rest the DOM's shadows)
    const p = sim.p; let zs = 0; for (const k of ring) zs += p[3 * k + 2] - sim.zmin[k]; const zm = zs / ring.length * u;   // (distances from the wall measured from where each thing rests)
    const wall = (x, y, z, dx, dy) => [cx + x * u + dx * K + z * u * .3, cy - y * u + dy * K + z * u * .5];
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 960, 540);
    const OFF = 4000; ctx.save(); ctx.setTransform(.5, 0, 0, .5, 0, 0); ctx.shadowOffsetX = -OFF * .5;   // (the shapes themselves lie off the canvas: only their shadows fall on it)
    const fade = (a, z) => (a * Math.max(.3, 1 - z / (1400 * K))).toFixed(3);
    ctx.shadowColor = 'rgba(0,0,0,' + fade(.55, zm) + ')'; ctx.shadowBlur = (18 * K + zm * .05);
    ctx.beginPath();
    ring.forEach((k, n) => { const q = wall(p[3 * k], p[3 * k + 1], p[3 * k + 2] - sim.zmin[k], 14, 22); n ? ctx.lineTo(q[0] + OFF, q[1]) : ctx.moveTo(q[0] + OFF, q[1]); });
    ctx.closePath(); ctx.fillStyle = '#000'; ctx.fill();
    ends.forEach(([c2, d2], n) => {                                    // the rods (box-shadow 0 6px 10px / 0 8px 12px) and their knobs (0 4px 6px)
      const half = (o.w / 2 + 34) * S, oy = (n ? -3 : 2) * S, zr = Math.max(0, c2[2] - sim.rodR[n] - .004), zz = zr * u, E0 = wall(c2[0] - d2[0] * half, c2[1] + oy - d2[1] * half, zr, 0, n ? 8 : 6), E1 = wall(c2[0] + d2[0] * half, c2[1] + oy + d2[1] * half, zr, 0, n ? 8 : 6);
      ctx.shadowColor = 'rgba(0,0,0,' + fade(n ? .55 : .5, zz) + ')'; ctx.shadowBlur = (n ? 6 : 5) * K + zz * .05;   // (a CSS box-shadow's blur B is a Gaussian of sigma B / 2; canvas shadowBlur is 2 sigma, on this half-size canvas: B / 2)
      ctx.beginPath(); ctx.moveTo(E0[0] + OFF, E0[1]); ctx.lineTo(E1[0] + OFF, E1[1]); ctx.lineWidth = (n ? 26 : 24) * K; ctx.lineCap = 'round'; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.shadowColor = 'rgba(0,0,0,' + fade(.6, zz) + ')'; ctx.shadowBlur = 3 * K + zz * .05;
      for (const sg of [-1, 1]) { const kx = (o.w / 2 + 46) * S * sg, q = wall(c2[0] + d2[0] * kx, c2[1] + oy + d2[1] * kx, zr, 0, 4);
        ctx.beginPath(); ctx.ellipse(q[0] + OFF, q[1], 16 * K * Math.max(.15, Math.abs(d2[0])) + 1, KNOB[n][1] / 2 * K, 0, 0, 2 * PI); ctx.fill(); }
    });
    ctx.restore();
  }
  // the first frame is drawn before the DOM goes, so nothing blinks; from now on everything of the hanging map is on the canvases (the hook too)
  draw(1);
  // the 3D map fades in over the DOM sheet (which it covers almost to the pixel) in the first tenth of a second, while the hands barely move; then the DOM goes
  r.gl.style.display = 'block'; r.gl.style.opacity = '0';
  r.gl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'linear' }).finished.then(() => {
    r.gl.style.opacity = '1'; r.shadow.style.display = r.cord.style.display = 'block';
    for (const ch of o.rig.children) ch.style.visibility = 'hidden';
  });
  if (o.onStart) o.onStart();                                          // (the turn's clock starts now: the caller starts its sound with it)
  return new Promise((done) => {
    let last = performance.now(), acc = 0, land = null;
    const target = new Float32Array(sim.rest.length);                   // at rest, turned round: every particle mirrored
    for (let k = 0; k < sim.n; k++) { target[3 * k] = -sim.rest[3 * k] * wide; target[3 * k + 1] = sim.rest[3 * k + 1]; target[3 * k + 2] = sim.rest[3 * k + 2]; }
    const frame = (now) => {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (!land) {
        acc += dt; while (acc >= DT) { acc -= DT; sim.step(); }
        // a moment after the hands let go, the sheet comes to rest on the DOM sheet's exact place: every particle follows a cubic from where it is, at the
        // speed it has, to its resting place, where it stops (no jump in place or in speed, so the hand-over to the DOM shows no twitch)
        if (sim.t > LAND_AT) land = { t: 0, p0: Float32Array.from(sim.p), v0: sim.p.map((v, i) => (v - sim.q[i]) / DT * LAND) };
      } else {
        land.t = Math.min(1, land.t + dt / LAND); const x = land.t, x2 = x * x, x3 = x2 * x, h1 = x3 - 2 * x2 + x, h2 = -2 * x3 + 3 * x2;
        for (let i = 0; i < sim.p.length; i++) sim.p[i] = land.p0[i] + h1 * land.v0[i] + h2 * (target[i] - land.p0[i]);
        if (land.t >= 1) { sim.p.set(target); draw(dt); return finish(); }
      }
      draw(dt);
      requestAnimationFrame(frame);
    };
    // the caller shows the DOM again, then calls this: the canvases go (the 3D map fades out over the DOM sheet it now lies on)
    const finish = () => done(() => {
      r.shadow.style.display = r.cord.style.display = 'none';
      r.gl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-in-out' }).finished.then(() => {
        r.gl.style.display = 'none';
        parts.forEach((m) => group.remove(m)); geo.dispose(); front.material.dispose(); back.material.dispose();
        rods.forEach((g) => g.children.forEach((m) => m.geometry && m.geometry.dispose()));
      });
    });
    requestAnimationFrame(frame);
  });
}
