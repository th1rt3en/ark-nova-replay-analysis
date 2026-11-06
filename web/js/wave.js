// [module] The wave of the display (Marine Worlds: cards pushed out of the display by a Wave): a Great-Wave-of-Kanagawa style wave, drawn frame by frame on a canvas so that it keeps moving.
// Nothing here knows about cards. card-motion.js `runWave` asks for the timing (`timeAt`: when the wave's foot reaches a point of the row), places the cards on it and bursts spray where it picks them up.
//   water body:   a profile that grows, leans and curls over (crest, lip, hollow wall), filled Prussian blue, with bands of lighter water streaming up the back and over the lip and beads carried along them
//   foam:         a cap along crest and lip, fingers that grow from the lip and sway, beads thrown off the finger tips (ballistic), white water churning at the toe
//   break:        in the last third the lip drops, the wave collapses and throws a burst of spray
// All lengths are screen px, all times are virtual ms (the animation speed is already applied by the clock that is passed to `run`).
const NAVY = '#0d1f3a', DEEP = '#123a73', MID = '#2c64a0', LIGHT = '#86b6dc', FOAM = '#f4ecd6', TAU = Math.PI * 2;
const clamp = (u, a = 0, b = 1) => Math.max(a, Math.min(b, u)), ease = (u) => 1 - Math.pow(1 - u, 3), sm = (u) => u * u * (3 - 2 * u);
export const WAVE = { T: 2500, curl: 1, fingers: 15, crash: 1, rate: 80 };       // the steep breaking wave
function rnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function cr(pts, seg) {                                                    // Catmull-Rom spline through the points -> polyline
  const out = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      out.push([.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        .5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  out.push(pts[n - 1]); return out;
}
function polyLen(p) { const L = [0]; for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return L; }
function at(p, L, s) {                                                     // the point at the fraction s of the polyline's length, with its unit tangent
  const d = s * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < d) i++;
  const f = (d - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]), tx = p[i][0] - p[i - 1][0], ty = p[i][1] - p[i - 1][1], m = Math.hypot(tx, ty) || 1;
  return { x: p[i - 1][0] + tx * f, y: p[i - 1][1] + ty * f, tx: tx / m, ty: ty / m };
}
function offsetLine(p, d) {                                                // the polyline moved by d to the inside of the water
  return p.map((q, i) => {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    return [q[0] + ty * d, q[1] - tx * d];
  });
}
// the profile in px: the top surface from the back foot over the crest to the tip of the lip, then the hollow wall down to the front foot.
// c: how far it has curled (0-1), a: height (0-1), br: how far it has broken (0-1)
function shape(P, Xw, c, a, br, t) {
  const { Ww, Hw, G } = P, j = (i, k) => .012 * Math.sin(t * .004 + i * 1.7 + k);
  const tipV = Math.max(.06, (.72 * a - .34 * c) * (1 - .8 * br)), tipU = -.02 - .5 * c;
  const K = [[1.06, 0], [.93, .10 * a], [.80, .27 * a], [.65, .50 * a], [.50, .74 * a], [.36 - .12 * c, .95 * a], [.22 - .26 * c, .99 * a - .02 * c], [.08 - .42 * c, Math.max(tipV + .12, (.90 * a - .16 * c) * (1 - .35 * br))], [tipU, tipV]]
    .map((q, i, arr) => (i > 0 && i < arr.length - 1 ? [q[0] + j(i, 0), q[1] + j(i, 5) * a] : q));
  const B = .2 + .08 * c, wall = [[tipU, tipV]];
  [.2, .4, .6, .8].forEach((q) => wall.push([tipU * (1 - q) + B * Math.sin(Math.PI * q), tipV * (1 - q)]));
  wall.push([0, 0]);
  const px = (q) => [Xw + q[0] * Ww, G - q[1] * Hw];
  return { top: cr(K.map(px), 9), wall: cr(wall.map(px), 8) };
}
function bead(ctx, x, y, r, al) {                                          // a cream bead with a dark rim, like the print's spray
  ctx.globalAlpha = al; ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(x, y, r + 1.3, 0, TAU); ctx.fill();
  ctx.fillStyle = FOAM; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
}
function drawWave(ctx, P, Xw, u, t, dt, vW, parts) {
  const { Ww, Hw, G, W, CH, st } = P;
  const g1 = ease(clamp(u / .16)), br = sm(clamp((u - .6) / .3)), c = st.curl * sm(clamp(u / .3)), a = (.38 + .62 * g1) * (1 + .035 * Math.sin(t * .006)) * (1 - .5 * br);
  const S = shape(P, Xw, c, a, br * st.crash, t), top = S.top, wall = S.wall, Lt = polyLen(top);
  ctx.setTransform(P.dpr, 0, 0, P.dpr, 0, 0); ctx.clearRect(0, 0, W, CH); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // the water
  ctx.beginPath(); top.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); wall.forEach((q) => ctx.lineTo(q[0], q[1])); ctx.lineTo(top[0][0], G); ctx.closePath();
  const gr = ctx.createLinearGradient(0, G - Hw, 0, G); gr.addColorStop(0, MID); gr.addColorStop(.35, DEEP); gr.addColorStop(1, '#0c2a57'); ctx.fillStyle = gr; ctx.fill();
  ctx.save(); ctx.clip();
  for (let k = 1; k <= 7; k++) {                                           // bands of water streaming up the back and over the lip
    const off = offsetLine(top, k * Hw * .052), flow = t * (.09 + .012 * k);
    ctx.strokeStyle = k % 3 === 0 ? LIGHT : MID; ctx.lineWidth = Hw * (k % 3 === 0 ? .012 : .024) * (1.05 - k * .06); ctx.globalAlpha = .9;
    ctx.setLineDash([Hw * (.35 + .08 * (k % 3)), Hw * (.17 + .05 * (k % 2))]); ctx.lineDashOffset = -flow;
    ctx.beginPath(); off.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  for (let i = 0; i < 46; i++) {                                           // beads carried along the flow
    const k = 2 + (i % 4) * 1.4, off = offsetLine(top, k * Hw * .052), L = polyLen(off), sp = .00005 + .00004 * rnd(i + 3), s = (rnd(i) + t * sp) % 1, q = at(off, L, s);
    bead(ctx, q.x, q.y, 1 + rnd(i + 9) * 1.6, .9 * Math.min(1, (1 - s) * 5));
  }
  ctx.restore();
  ctx.strokeStyle = NAVY; ctx.lineWidth = 3; ctx.beginPath(); top.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); wall.forEach((q) => ctx.lineTo(q[0], q[1])); ctx.stroke();
  // the foam cap along crest and lip, a pale shade under it
  const s0 = .5, N = 46, fingers = [];
  ctx.strokeStyle = LIGHT; ctx.lineWidth = Hw * .05; ctx.globalAlpha = .8; ctx.beginPath();
  for (let i = 0; i <= N; i++) { const q = at(top, Lt, s0 + (1 - s0) * i / N), x = q.x + q.ty * Hw * .035, y = q.y - q.tx * Hw * .035; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.stroke(); ctx.globalAlpha = 1;
  for (const pass of [0, 1]) for (let i = 0; i <= N * 1.6; i++) {
    const f = i / (N * 1.6), q = at(top, Lt, s0 + (1 - s0) * f), r = Hw * (.022 + .02 * rnd(i) + .008 * Math.sin(t * .011 + i * 1.9)) * (.6 + .6 * Math.sin(f * Math.PI * .9 + .4) + .2);
    ctx.fillStyle = pass ? FOAM : NAVY; ctx.beginPath(); ctx.arc(q.x + q.ty * Hw * .012, q.y - q.tx * Hw * .012, r + (pass ? 0 : 1.4), 0, TAU); ctx.fill();
  }
  // fingers of foam reaching out from the lip
  const nf = st.fingers;
  for (let i = 0; i < nf; i++) {
    const s = .5 + .5 * (i + .5) / nf + (rnd(i + 20) - .5) * .02, q = at(top, Lt, Math.min(.995, s)), nx = q.ty, ny = -q.tx;
    const grow = clamp(.15 + c * .9 + br * .4) * (.75 + .25 * Math.sin(t * .0075 + i * 2.3)), Lf = Hw * (.09 + .14 * rnd(i + 40)) * grow * (.6 + .8 * Math.pow((s - .5) * 2, .7));
    const dx = nx * .55 + q.tx * .7 - .3, dy = ny * .55 + q.ty * .7 + .35, m = Math.hypot(dx, dy) || 1, ux = dx / m, uy = dy / m;
    const wob = Lf * .28 * Math.sin(t * .009 + i * 1.7), pxv = -uy, pyv = ux, pts = [];
    for (let k = 0; k <= 8; k++) { const f = k / 8; pts.push([q.x + ux * Lf * f + pxv * wob * Math.sin(f * Math.PI) + (f > .7 ? -Lf * .12 * (f - .7) / .3 : 0), q.y + uy * Lf * f + pyv * wob * Math.sin(f * Math.PI) + Lf * .35 * f * f]); }
    fingers.push(pts[8]);
    for (const pass of [0, 1]) for (let k = 1; k <= 8; k++) { const f = k / 8; ctx.strokeStyle = pass ? FOAM : NAVY; ctx.lineWidth = Hw * (.034 - .02 * f) + (pass ? 0 : 2.2); ctx.beginPath(); ctx.moveTo(pts[k - 1][0], pts[k - 1][1]); ctx.lineTo(pts[k][0], pts[k][1]); ctx.stroke(); }
    bead(ctx, pts[8][0], pts[8][1], Hw * .02, 1);
  }
  // beads thrown from the finger tips, more of them when it breaks
  let spawn = st.rate * dt / 1000 * (.4 + c); if (br > 0) spawn *= 1 + 3 * br;
  while (spawn > 0 && fingers.length) {
    if (Math.random() < Math.min(1, spawn)) { const f = fingers[Math.floor(Math.random() * fingers.length)]; parts.push({ x: f[0], y: f[1], vx: vW * 1000 * .9 - Hw * (.2 + Math.random() * .9), vy: -Hw * (.1 + Math.random() * .6) - (br > 0 ? Hw * Math.random() * .9 : 0), life: 700 + Math.random() * 700, age: 0, r: 1.6 + Math.random() * 3.2, k: 'd' }); }
    spawn -= 1;
  }
  // white water churning at the toe
  P.toeAcc = (P.toeAcc || 0) + dt;
  while (P.toeAcc > 26) { P.toeAcc -= 26; if (u > .04 && u < .96) parts.push({ x: Xw + Ww * (-.02 + .08 * Math.random()), y: G - Hw * .02 * Math.random(), vx: -Hw * (.15 + .5 * Math.random()) + vW * 1000 * .5, vy: -Hw * (.1 + .25 * Math.random()), life: 500 + Math.random() * 400, age: 0, r: Hw * (.01 + .016 * Math.random()), k: 'f' }); }
  return { c, a };
}
function stepParts(ctx, P, parts, dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.age += dt;
    if (q.age > q.life || q.y > P.CH + 8) { parts.splice(i, 1); continue; }
    const s = dt / 1000; q.x += q.vx * s; q.y += q.vy * s; q.vy += (q.k === 'd' ? P.Hw * 2.6 : P.Hw * .5) * s; if (q.k === 'f') q.vx *= .985;
    const f = q.age / q.life;
    bead(ctx, q.x, q.y, q.k === 'f' ? q.r * (1 + .6 * f) : q.r * (1 - .35 * f), f > .7 ? 1 - (f - .7) / .3 : 1);
  }
}
// box: { left, top, width, height } of the canvas in viewport px (its bottom edge is the sea level: the foot of the wave), Hw: the wave's height.
export function createWave(parent, box, Hw, style = WAVE) {
  const W = box.width, CH = box.height, Ww = Hw * 1.05, T = style.T, X0 = W + Hw * .2, X1 = -Ww * 1.1;
  const f = (u) => .55 * u + .45 * sm(u), X = (u) => X0 + (X1 - X0) * f(u), lead = .07 * Ww;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas'); cv.className = 'cm-wave'; cv.width = Math.round(W * dpr); cv.height = Math.round(CH * dpr);
  Object.assign(cv.style, { position: 'absolute', left: box.left + 'px', top: box.top + 'px', width: W + 'px', height: CH + 'px', zIndex: '2' });
  parent.append(cv);
  const P = { Ww, Hw, G: CH, W, CH, dpr, st: style }, parts = [], bursts = [], ctx = cv.getContext('2d');
  const timeAt = (px, local) => { let a = 0, b = 1; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (X(m) + local > px) a = m; else b = m; } return (a + b) / 2 * T; };
  // spray thrown up and to the left at virtual time `t` from the point (x, y) of the canvas
  const burst = (t, x, y, n, power = 1) => bursts.push({ t, x, y, n, power });
  // clock(): the virtual time in ms, or null when the animation has been cancelled
  const run = (clock) => new Promise((resolve) => {
    let last = null;
    const loop = () => {
      const t = clock();
      if (t === null || !cv.isConnected) { resolve(); return; }
      const dt = last === null ? 16 : Math.min(60, Math.max(0, t - last)); last = t;
      const u = clamp(t / T), vW = (X(clamp(u + .01)) - X(u)) / (.01 * T);
      drawWave(ctx, P, X(u), u, t, dt, vW, parts);
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]; if (b.t > t) continue; bursts.splice(i, 1);
        for (let k = 0; k < b.n; k++) parts.push({ x: b.x + (Math.random() - .5) * 20, y: b.y, vx: vW * 1000 * .5 - Hw * (.1 + Math.random() * .7) * b.power, vy: -Hw * (.2 + Math.random() * .7) * b.power, life: 600 + Math.random() * 600, age: 0, r: 1.8 + Math.random() * 3.4, k: 'd' });
      }
      stepParts(ctx, P, parts, dt);
      if (t < T || parts.length || bursts.length) requestAnimationFrame(loop); else { cv.remove(); resolve(); }
    };
    requestAnimationFrame(loop);
  });
  return { canvas: cv, T, Ww, Hw, lead, vAvg: (X0 - X1) / T, timeAt, burst, run, X };
}
