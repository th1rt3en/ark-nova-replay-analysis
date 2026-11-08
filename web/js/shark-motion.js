// [module] Shark Attack (Animations = All): the display cards a Shark Attack removes are eaten where they lie (changelog: "Shark Attack animation").
// One card: jaws come up out of the card's lower edge and bite twice (each bite cuts the shape of the closed teeth out of the card where the jaws close, throws a ripple and a few blue drops), then the card is pulled down
// into its own slot. Two or more cards: one fin runs along the lower edge of the whole display, in front of every card, with a thin blue wake and ripples; each chosen card is pulled under
// as the fin passes its middle. No water surface: the table is the water. Sizes are taken from the card on screen (`u` = card width / 130.25, the size the mock was drawn at).
// `tools` comes from card-motion.js: { animate(e, frames, ms, delay, easing, fill), element(cls, css, parent), finish(animation, fn) }; times are ms at speed 1 from the start of the step.

const MOCK_W = 130.25;
const SVG_NS = 'http://www.w3.org/2000/svg';
const FIN = '<path d="M2 38 C10 30 18 12 30 2 C28 14 30 28 38 38 Z" fill="#6F8A96" stroke="#17262B" stroke-width="3" stroke-linejoin="round"/>';
// The jaws (viewBox 120 x 90; the head and its lower jaw go on below the viewBox, down past the card's edge, which clips them): a tall grey head, rounded with only a soft point, and the mouth cut into it: a tall arch made of two quadratic curves that meet at the apex A at a gentle angle. The teeth stand on the mouth's edge:
// 7 fangs spaced evenly along the edge, the middle one centred on the apex and pointing straight down; their bases touch and are tucked under a thin ink gum line, the sides are gently curved and
// every tooth points between the edge's inward normal and straight down, so the teeth near the apex stand side by side instead of crossing; the middle ones a little longer
// (changelog: "Shark Attack: fangs on the gum", "Shark Attack: higher leap, taller mouth with a soft point", "Shark Attack: even teeth at the apex").
export const JAW_W = 120, JAW_H = 90;
const P0 = [22, 90], CL = [29, 44], AP = [60, 28], CR = [91, 44], P2 = [98, 90];
const quad = (a, c, b, s) => [0, 1].map((k) => (1 - s) ** 2 * a[k] + 2 * (1 - s) * s * c[k] + s * s * b[k]);
const dquad = (a, c, b, s) => [0, 1].map((k) => 2 * (1 - s) * (c[k] - a[k]) + 2 * s * (b[k] - c[k]));
export const qpt = (t) => (t <= .5 ? quad(P0, CL, AP, 2 * t) : quad(AP, CR, P2, 2 * t - 1));
const qnorm = (t) => { if (Math.abs(t - .5) < 1e-9) return [0, 1]; const [dx, dy] = t < .5 ? dquad(P0, CL, AP, 2 * t) : dquad(AP, CR, P2, 2 * t - 1), L = Math.hypot(dx, dy); return [-dy / L, dx / L]; };   // into the mouth
// t at a share of the edge's length (the two halves are the same length, so share .5 is the apex)
const ARC = (() => { const n = 400, acc = [0]; let prev = qpt(0); for (let i = 1; i <= n; i++) { const q = qpt(i / n); acc.push(acc[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1])); prev = q; } return acc; })();
const tAt = (share) => { const want = share * ARC[ARC.length - 1]; let i = ARC.findIndex((v) => v >= want); if (i <= 0) return 0; const f = (want - ARC[i - 1]) / (ARC[i] - ARC[i - 1]); return (i - 1 + f) / (ARC.length - 1); };
const pt = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;
const MOUTH_EDGE = `M${pt(P0)} Q${pt(CL)} ${pt(AP)} Q${pt(CR)} ${pt(P2)}`;
// the teeth as data: { A0, B0 (the base's corners, B0 of one = A0 of the next), tip, c1, c2 (the curved sides), back (the base along the edge) }
export function teeth(n = 7, len = 15, s0 = .08, s1 = .92, sink = 1.2, down = .7, curve = .25) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const sa = s0 + (s1 - s0) * i / n, sb = s0 + (s1 - s0) * (i + 1) / n, sm = (sa + sb) / 2;
    const [a, b, m] = [tAt(sa), tAt(sb), i === (n - 1) / 2 ? .5 : tAt(sm)];
    const [pa, pb, na, nb, nm] = [qpt(a), qpt(b), qnorm(a), qnorm(b), qnorm(m)];
    const L = len * (.72 + .28 * Math.sin(Math.PI * sm)), lean = (sm - .5) * -curve;
    let d = [nm[0] + lean, nm[1] + down]; const dl = Math.hypot(d[0], d[1]); d = [d[0] / dl, d[1] / dl];   // between the inward normal and straight down
    const A0 = [pa[0] - na[0] * sink, pa[1] - na[1] * sink], B0 = [pb[0] - nb[0] * sink, pb[1] - nb[1] * sink];
    const base = [(A0[0] + B0[0]) / 2, (A0[1] + B0[1]) / 2], tip = [base[0] + d[0] * L, base[1] + d[1] * L];
    const c1 = [A0[0] + d[0] * L * .5, A0[1] + d[1] * L * .5], c2 = [B0[0] + d[0] * L * .5, B0[1] + d[1] * L * .5];
    // the base follows the edge back from B0 to A0 (through the apex for the middle tooth), so no gap opens between a tooth and the gum
    const back = []; for (let j = 5; j >= 1; j--) { const t = a + (b - a) * j / 6, q = qpt(t), nq = qnorm(t); back.push([q[0] - nq[0] * sink, q[1] - nq[1] * sink]); }
    if (a < .5 && b > .5) { back.push([AP[0], AP[1] - sink]); back.sort((u, v) => v[0] - u[0]); }
    out.push({ A0, B0, tip, c1, c2, back });
  }
  return out;
}
export const fangs = () => teeth().map(({ A0, B0, tip, c1, c2, back }) => `M${pt(A0)} Q${pt(c1)} ${pt(tip)} Q${pt(c2)} ${pt(B0)} L${back.map(pt).join(' L')} Z`).join('');
// What a bite leaves, in the jaws' own units: the mouth's opening up to the gum line, with a small notch above every tooth where it went through the card
const NOTCH = 4.5;
const BITE_ROW = (() => { const T = teeth(), row = [P0];
  T.forEach((t, i) => { const [m, n] = [[(t.A0[0] + t.B0[0]) / 2, (t.A0[1] + t.B0[1]) / 2], i === (T.length - 1) / 2 ? [0, 1] : (() => { const dx = t.B0[0] - t.A0[0], dy = t.B0[1] - t.A0[1], L = Math.hypot(dx, dy); return [-dy / L, dx / L]; })()];
    row.push(t.A0, [m[0] - n[0] * NOTCH, m[1] - n[1] * NOTCH]); });
  row.push(T[T.length - 1].B0, P2); return row; })();

// The hole the bites leave in the card, as a clip-path polygon in % of the card. `bites`: one entry per bite, the jaws' box in card px when they close:
// { left, top, w, h } of the box before its transform, `tx`, `ty` its translation, `sy` its vertical scale about its centre. Every bite is the area under the closed teeth down to the
// card's lower edge; overlapping bites merge (for every x the higher hole wins), so the outline never crosses itself.
export function biteHole(bites, cw, ch) {
  const rows = bites.map((b) => BITE_ROW.map(([X, Y]) => [(b.left + b.tx + X / JAW_W * b.w) / cw * 100, (b.top + b.h / 2 + b.ty + (Y / JAW_H * b.h - b.h / 2) * b.sy) / ch * 100])
    .sort((p, q) => p[0] - q[0]));
  const topAt = (x) => { let y = Infinity; for (const r of rows) { if (x < r[0][0] || x > r[r.length - 1][0]) continue;
    for (let i = 1; i < r.length; i++) if (x <= r[i][0]) { const [x0, y0] = r[i - 1], [x1, y1] = r[i], f = x1 > x0 ? (x - x0) / (x1 - x0) : 0; y = Math.min(y, y0 + (y1 - y0) * f); break; } } return y; };
  // the spans the holes cover, merged
  const spans = rows.map((r) => [r[0][0], r[r.length - 1][0]]).sort((p, q) => p[0] - q[0]), merged = [];
  for (const sp of spans) { const last = merged[merged.length - 1]; if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]); else merged.push([...sp]); }
  const xs = [...new Set(rows.flat().map((p) => p[0]))], f1 = (v) => `${Math.max(0, Math.min(100, v)).toFixed(2)}%`, pts = ['0% 0%', '100% 0%', '100% 100%'];
  for (const [xa, xb] of merged.reverse()) {
    const inside = [...xs.filter((x) => x > xa && x < xb), ...Array.from({ length: 60 }, (_, i) => xa + (xb - xa) * (i + .5) / 60)].sort((p, q) => q - p);
    pts.push(`${f1(xb)} 100%`, `${f1(xb)} ${f1(topAt(xb))}`, ...inside.map((x) => `${f1(x)} ${f1(topAt(x))}`), `${f1(xa)} ${f1(topAt(xa))}`, `${f1(xa)} 100%`);
  }
  pts.push('0% 100%');
  return `polygon(${pts.join(',')})`;
}
export const JAWS = '<path d="M6 170 L6 90 C9 54 36 20 60 9 C84 20 111 54 114 90 L114 170 Z" fill="#6F8A96" stroke="#17262B" stroke-width="3" stroke-linejoin="round"/>'
  + `<path d="${MOUTH_EDGE} Z" fill="#5a1f22"/>`
  + `<path d="${fangs()}" fill="#FFFFFF" stroke="#17262B" stroke-width="1.6" stroke-linejoin="round"/>`
  + `<path d="${MOUTH_EDGE} Z" fill="none" stroke="#17262B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
  + '<circle cx="24" cy="50" r="3" fill="#17262B"/><circle cx="96" cy="50" r="3" fill="#17262B"/>';
const RING = '<ellipse cx="60" cy="15" rx="56" ry="12" fill="none" stroke="#17262B" stroke-width="4"/><ellipse cx="60" cy="15" rx="56" ry="12" fill="none" stroke="#FFFFFF" stroke-width="2"/>';

// The timeline of one Shark Attack, in ms at speed 1. `cards`: [{ x (centre), w }] of the eaten cards in screen px, `span`: { x0, x1 } of the display; returns { kind, length, grabs: [ms per card] }.
export function sharkTimeline(cards, span) {
  if (cards.length === 1) return { kind: 'bite', length: 2420, grabs: [1800] };
  const u = cards[0].w / MOCK_W, from = span.x0 - 50 * u, to = span.x1 + 12 * u, run = Math.max(1200, (to - from) / u * 3.2);
  const grabs = cards.map((c) => Math.round((c.x - from - 19 * u) / (to - from) * run));
  return { kind: 'pass', length: Math.round(Math.max(run, Math.max(...grabs) + 560)), run: Math.round(run), from, to, grabs };
}

function art(tools, markup, viewBox, css, parent) {
  const box = tools.element('cm-shark', { position: 'absolute', ...css }, parent);
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', viewBox); s.setAttribute('width', '100%'); s.setAttribute('height', '100%'); s.style.display = 'block'; s.style.overflow = 'visible'; s.innerHTML = markup;
  box.append(s);
  return box;
}
const gone = (tools, a, e) => tools.finish(a, () => e.remove());
function ripple(tools, x, y, u, at) {
  [0, 1, 2].forEach((i) => {
    const r = art(tools, RING, '0 0 120 30', { left: x - 60 * u + 'px', top: y - 15 * u + 'px', width: 120 * u + 'px', height: 30 * u + 'px', opacity: '0', zIndex: '8' });
    gone(tools, tools.animate(r, [{ opacity: .95, transform: 'scale(.2)' }, { opacity: 0, transform: 'scale(1.5)' }], 900, at + i * 180, 'ease-out', 'none'), r);
  });
}
function drops(tools, x, y, u, at) {
  [0, 1, 2, 3].forEach((i) => {
    const d = tools.element('cm-shark', { position: 'absolute', left: x - 3 * u + 'px', top: y - 4 * u + 'px', width: 6 * u + 'px', height: 8 * u + 'px', borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%', background: '#6EC3DD', border: 1.5 * u + 'px solid #17262B', opacity: '0', zIndex: '8' });
    const a = -Math.PI * (.25 + .5 * i / 3), r = (26 + 8 * (i % 2)) * u;
    gone(tools, tools.animate(d, [{ opacity: 1, transform: 'translate(0,0)' }, { opacity: 1, transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r}px)`, offset: .5 }, { opacity: 0, transform: `translate(${Math.cos(a) * r * 1.3}px,${Math.sin(a) * r * .2 + 16 * u}px)` }], 650, at, 'ease-out', 'none'), d);
  });
}
function shake(tools, e, u, at) { tools.animate(e, [0, -4, 4, -3, 3, 0].map((x) => ({ transform: `translateX(${x * u}px)` })), 260, at, 'linear', 'none'); }
// a card of the display, cut out at its own rectangle: what sinks below its lower edge is gone (the slot is the water)
function slot(tools, g) {
  const box = tools.element('cm-shark-slot', { position: 'absolute', left: g.x - g.w / 2 + 'px', top: g.y - g.h / 2 + 'px', width: g.w + 'px', height: g.h + 'px', overflow: 'hidden', borderRadius: 7 * g.w / MOCK_W + 'px', zIndex: '3' });
  const card = tools.element('cm-shark-card', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' }, box);
  const im = document.createElement('img'); im.src = g.image || ''; im.alt = ''; Object.assign(im.style, { display: 'block', width: '100%', height: '100%' }); card.append(im);
  return { box, card, im };
}

// Plays the Shark Attack on the cards `eaten` (shots of the old display: { x, y, w, h, image }) and returns how long it takes (ms at speed 1); `span` = { x0, x1 } of the display's folders.
export function runShark(tools, eaten, span) {
  if (!eaten.length) return 0;
  const T = sharkTimeline(eaten, span), u = eaten[0].w / MOCK_W;
  const slots = eaten.map((g) => ({ g, ...slot(tools, g) }));
  const sink = (s, at, tilt) => gone(tools, tools.animate(s.card, [{ transform: 'none', opacity: 1 }, ...(tilt ? [] : [{ transform: `translateY(${-6 * u}px)`, opacity: 1, offset: .15 }]), { transform: `translateY(${s.g.h + 20 * u}px) rotate(${tilt}deg)`, opacity: 0 }], tilt ? 620 : 560, at, tilt ? 'ease-in' : 'cubic-bezier(.5,0,.8,.3)', 'both'), s.box);
  if (T.kind === 'bite') {
    const s = slots[0], { g } = s, bottom = g.y + g.h / 2, jw = g.w * .82, jh = jw * JAW_H / JAW_W, up = -(jh + 6 * u);   // (the mouth's lower edge stays just below the card's edge, even at the bite: only the cone shows)
    const jaws = art(tools, JAWS, `0 0 ${JAW_W} ${JAW_H}`, { left: (g.w - jw) / 2 + 'px', top: g.h + 12 * u + 'px', width: jw + 'px', height: jh + 'px', zIndex: '4', transformOrigin: '50% 50%' }, s.box);
    // one keyframe list for both bites (two animations of one element would hide each other): up, close, hold, down; the second bite a little to the right
    const L = 1800, f = [], at = (ms) => ms / L, x0 = -18 * u, x1 = 22 * u;
    for (const [base, x] of [[0, x0], [900, x1]]) {
      f.push({ offset: at(base), transform: `translate(${x}px,0) scaleY(1)`, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { offset: at(base + 340), transform: `translate(${x}px,${up}px) scaleY(1)`, easing: 'ease-in-out' },
        { offset: at(base + 450), transform: `translate(${x}px,${up + 8 * u}px) scaleY(.74)`, easing: 'linear' },
        { offset: at(base + 570), transform: `translate(${x}px,${up + 8 * u}px) scaleY(.74)`, easing: 'ease-in' },
        { offset: at(base + 900), transform: `translate(${x}px,0) scaleY(1)`, easing: 'linear' });
    }
    gone(tools, tools.animate(jaws, f, L, 0, 'linear', 'both'), jaws);
    // the hole of each bite is cut where the jaws are when they close (`ty` = up + 8u, `sy` = .74 about the box centre), on the same clock as the jaws (duration L)
    const box = { left: (g.w - jw) / 2, top: g.h + 12 * u, w: jw, h: jh, ty: up + 8 * u, sy: .74 };
    const p1 = biteHole([{ ...box, tx: x0 }], g.w, g.h), p2 = biteHole([{ ...box, tx: x0 }, { ...box, tx: x1 }], g.w, g.h), b1 = at(450), b2 = at(1350);
    tools.animate(s.im, [{ offset: 0, clipPath: 'none' }, { offset: b1 - .001, clipPath: 'none' }, { offset: b1, clipPath: p1 }, { offset: b2 - .001, clipPath: p1 }, { offset: b2, clipPath: p2 }, { offset: 1, clipPath: p2 }], L, 0, 'linear', 'both');
    for (const [ms, x] of [[450, x0], [1350, x1]]) { shake(tools, s.box, u, ms); ripple(tools, g.x + x, bottom, u, ms); drops(tools, g.x + x, bottom - 6 * u, u, ms); }
    sink(s, 1800, -14);
    ripple(tools, g.x, bottom, u, 1800); drops(tools, g.x, bottom - 6 * u, u, 1800);
    return T.length;
  }
  // the pass: the fin (in front of every card) and its wake cross the whole display
  const bottom = Math.max(...eaten.map((g) => g.y + g.h / 2)), finY = bottom - 34 * u, fs = 38 * u;
  const wake = tools.element('cm-shark', { position: 'absolute', left: T.from + 4 * u + 'px', top: finY + 34 * u + 'px', width: 70 * u + 'px', height: 4 * u + 'px', borderRadius: 2 * u + 'px', background: 'linear-gradient(90deg, transparent, rgba(110,195,221,.85))', zIndex: '9' });
  const fin = art(tools, FIN, '0 0 40 40', { left: T.from + 'px', top: finY + 'px', width: fs + 'px', height: fs + 'px', zIndex: '10' });
  const dist = T.to - T.from;
  gone(tools, tools.animate(wake, [{ transform: `translateX(${-56 * u}px)` }, { transform: `translateX(${dist - 56 * u}px)` }], T.run, 0, 'linear', 'both'), wake);
  gone(tools, tools.animate(fin, [{ transform: 'translateX(0)' }, { transform: `translateX(${dist}px)` }], T.run, 0, 'linear', 'both'), fin);
  for (let ms = 0; ms < T.run; ms += 260) ripple(tools, T.from + 19 * u + dist * ms / T.run, bottom, u, ms);
  slots.forEach((s, i) => { const at = T.grabs[i]; shake(tools, s.box, u, at); drops(tools, s.g.x, bottom - 6 * u, u, at); sink(s, at, 0); });
  return T.length;
}
