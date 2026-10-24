// [module] The start page (web/index.html): an illustrated park map drawn from scratch in SVG. The aviary's three domes are Replay (left), Custom game (top, the live game)
// and Sandbox (right); the kiosk is the mini games, the construction site the map editor. Hovering an option (dome, pin or label) shows its ticket, a click keeps it open.
// Laid out at 1920 x 1080 and zoomed to the window like the viewer; a portrait window gets a plain list under the map. changelog.md "Start page (park map)".

const INK = '#17262B';
const f = (n) => Math.round(n * 10) / 10;
const P = (pts) => pts.map((p) => f(p[0]) + ' ' + f(p[1])).join(' ');
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function smooth(pts, closed = true) {
  const n = pts.length, at = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}
function blob(cx, cy, rx, ry, seed = 1, n = 10, j = .16, rot = 0) {
  const r = rng(seed), pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + rot, k = 1 + (r() * 2 - 1) * j; pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
  return smooth(pts);
}
function bumpy(cx, cy, R, seed = 1, n = 9, inner = .84) {
  const r = rng(seed), pts = [];
  for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2 + r() * .1, k = (i % 2 ? inner : 1) * (1 + (r() * 2 - 1) * .07); pts.push([cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k]); }
  return smooth(pts);
}
const hexPts = (cx, cy, r, start = 30) => [0, 1, 2, 3, 4, 5].map((i) => { const a = (start + 60 * i) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

/* ================= the five options ================= */
const OPTS = [
  { id: 'replay', name: 'Replay', c: '#1D8AA1', d: '#12667A', short: 'Step through a finished BGA game', desc: 'Step through a finished 2-player BGA game move by move, and fork it at any point to try another line.', cta: 'Open', href: '/replay.html', pin: [650, 530], s: 1.28, lab: [650, 776], card: [150, 512] },
  { id: 'custom', name: 'Custom game', c: '#E9662A', d: '#B44A19', short: 'Play a game with a friend', desc: 'Play a real game against a friend on the engine: a link for each seat, hidden cards stay hidden, and every game is recorded for a replay.', cta: 'Create a game', href: '/play.html', note: '2 players', pin: [960, 264], s: 1.4, lab: [960, 606], card: [1100, 118] },
  { id: 'sandbox', name: 'Sandbox', c: '#E0A02A', d: '#A9740F', short: 'Set up and edit any board', desc: 'Set up any board and edit the game whenever you like: cards, money, partner zoos, workers. The other seat only passes.', cta: 'Start a sandbox', href: '/sandbox.html', pin: [1270, 530], s: 1.28, lab: [1270, 776], card: [1398, 470] },
  { id: 'mini', name: 'Mini games', c: '#8058C4', d: '#5C3B98', short: 'Daily puzzles on real games', desc: 'Short daily puzzles on real finished games: guess what a player kept, or who is ahead.', cta: "Play today's puzzles", href: '/minigames/', note: 'New every day', pin: [318, 786], s: 1.28, lab: [318, 1000], card: [452, 806] },
  { id: 'editor', name: 'Map editor', c: '#3E9A55', d: '#2A6E3C', short: 'Design your own zoo map', desc: 'Design a zoo map: place rock and water hexes, placement bonuses and upgrade spaces on a blank board.', cta: 'Open the map editor', href: '/map_editor.html', pin: [1585, 806], s: 1.28, lab: [1585, 1000], card: [1410, 492] },
];
const O = Object.fromEntries(OPTS.map((o) => [o.id, o]));

/* ================= icons (drawn in a -22..22 box) ================= */
const MEEPLE = 'M0 -14C3.2 -14 5 -11.6 5 -9C5 -7.4 4.3 -6.2 3.4 -5.4C7 -5 13 -4 13 -.8C13 1.6 10 2.4 6.8 2.2L9.6 10.6C10.1 12.2 9.2 13 7.8 13H2.6L0 7.6L-2.6 13H-7.8C-9.2 13 -10.1 12.2 -9.6 10.6L-6.8 2.2C-10 2.4 -13 1.6 -13 -.8C-13 -4 -7 -5 -3.4 -5.4C-4.3 -6.2 -5 -7.4 -5 -9C-5 -11.6 -3.2 -14 0 -14Z';
const ICON = {
  replay(c) {
    const r = 13.5, a0 = -120 * Math.PI / 180, a1 = 168 * Math.PI / 180;
    const p0 = [r * Math.cos(a0), r * Math.sin(a0)], p1 = [r * Math.cos(a1), r * Math.sin(a1)];
    const d = [Math.sin(a0), -Math.cos(a0)], n = [-d[1], d[0]];
    const tip = [p0[0] + d[0] * 7, p0[1] + d[1] * 7], b1 = [p0[0] - d[0] * 1.5 + n[0] * 5.6, p0[1] - d[1] * 1.5 + n[1] * 5.6], b2 = [p0[0] - d[0] * 1.5 - n[0] * 5.6, p0[1] - d[1] * 1.5 - n[1] * 5.6];
    return `<path d="M${P([p0])}A${r} ${r} 0 1 1 ${P([p1])}" fill="none" stroke="${INK}" stroke-width="3.8" stroke-linecap="round"/>
      <path d="M${P([tip])}L${P([b1])}L${P([b2])}Z" fill="${INK}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M-4.2 -7.2L7.6 0L-4.2 7.2Z" fill="${c}" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/>`;
  },
  custom(c) {
    return `<g transform="translate(6.2 -3.6) scale(.8)"><path d="${MEEPLE}" fill="#FFE6BF" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/></g>
      <g transform="translate(-4.6 3.4) scale(.9)"><path d="${MEEPLE}" fill="${c}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M-1.5 -11.5C-.4 -12.2 1.2 -12.3 2.2 -11.6" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/></g>`;
  },
  sandbox(c) {
    return `<path d="M-13.5 -5C-13.5 -15.5 2.5 -15.5 2.5 -5" fill="none" stroke="${INK}" stroke-width="2.2"/>
      <g transform="translate(11 -1) rotate(16)"><path d="M0 -16V4" stroke="${INK}" stroke-width="5.4" stroke-linecap="round"/><path d="M0 -16V4" stroke="#C99560" stroke-width="2.8" stroke-linecap="round"/><path d="M-4 -16H4" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M-4.6 2.5H4.6L4 9.5C3 13.6 -3 13.6 -4 9.5Z" fill="#B9CBD2" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></g>
      <path d="M-15.5 -5L-13 11.5H.6L3.2 -5Z" fill="${c}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M-14.6 2H2.1" stroke="#FFF1D6" stroke-width="3"/>
      <path d="M-16.5 -6.6H4.2" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M-15 14C-11 8 -3 7 2 10C7 7 12.5 8 15.5 14Z" fill="#F4D892" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/>
      <circle cx="-6" cy="11.4" r=".9" fill="#C8A55C"/><circle cx="7" cy="11.6" r=".9" fill="#C8A55C"/><circle cx="1" cy="12.6" r=".9" fill="#C8A55C"/>`;
  },
  mini(c) {
    return `<g transform="translate(-1.6 1.6)"><path d="M-12 -12H-4.5C-5.5 -14 -5.5 -19 0 -19C5.5 -19 5.5 -14 4.5 -12H12V-4.5C14 -5.5 19 -5.5 19 0C19 5.5 14 5.5 12 4.5V12H4.5C5.5 10 5.5 6 0 6C-5.5 6 -5.5 10 -4.5 12H-12Z" fill="${c}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M-8.5 -8.5H-3" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/>
      <path d="M-4 -2.5l1.3 2.7 3 .4 -2.2 2.1 .5 3 -2.6 -1.4 -2.7 1.4 .5 -3 -2.1 -2.1 3 -.4Z" fill="#FFD84D" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/></g>`;
  },
  editor(c) {
    const hx = (cx, cy, fill) => `<polygon points="${P(hexPts(cx, cy, 8.2, 30))}" fill="${fill}" stroke="${INK}" stroke-width="2.1" stroke-linejoin="round"/>`;
    return `<g transform="translate(-3.6 -.9)">${hx(-7.4, -4.5, c)}${hx(7.4, -4.5, '#78C3DB')}${hx(0, 8.3, '#F3E1B5')}
      <path d="M-9.5 -6.5l3 -2.5 3 2.5" stroke="#fff" stroke-width="1.4" fill="none" opacity=".7"/>
      <path d="M4.2 -4.5q1.6 -1.6 3.2 0t3.2 0" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <g transform="translate(6.5 3.5) rotate(38)"><rect x="-3.2" y="-16" width="6.4" height="17" fill="#F6CF3C" stroke="${INK}" stroke-width="1.9"/><path d="M-3.2 1L3.2 1L0 7.6Z" fill="#EFD2A8" stroke="${INK}" stroke-width="1.9" stroke-linejoin="round"/><path d="M-1.1 5.3L1.1 5.3L0 7.6Z" fill="${INK}"/><rect x="-3.2" y="-20.5" width="6.4" height="4.5" rx="1.2" fill="#EE8FA0" stroke="${INK}" stroke-width="1.9"/></g></g>`;
  },
};
const badge = (o, size = 48) => `<svg viewBox="-26 -26 52 52" width="${size}" height="${size}" aria-hidden="true"><circle r="24.5" fill="${o.c}" stroke="${INK}" stroke-width="2.6"/><circle r="19.6" fill="#FFF7E6" stroke="${INK}" stroke-width="2"/><g transform="scale(.86)">${ICON[o.id](o.c)}</g></svg>`;

/* ================= palette ================= */
const C = {
  ground: '#EFC98D', pebble: '#DDA766', dune: '#E5A862', duneL: '#F7DCA6', earth: '#E2915C', spin: '#B9AE52', spinD: '#8F8A3C',
  lawn: '#A8CF6E', lawnD: '#87B957', lawnG: '#93C262', hedge: '#7DB352',
  tree: '#62A050', treeD: '#437F3E', treeL: '#97C96B', water: '#6EC3DC', waterD: '#3F9CC0', waterL: '#A9DFEC',
  path: '#F1DDAF', pathE: '#CBA66C', pave: '#EAD3A6', paveL: '#D2B887', wood: '#9A6236', woodD: '#6B4223', woodL: '#C58C57',
  floor: '#86BE60', glass: '#DFF3EE',
};

/* ================= defs ================= */
function defs() {
  const s = 7, w = Math.sqrt(3) * s, h = 3 * s;
  const meshPath = `M${f(w / 2)} 0V${f(s / 2)}L${f(w)} ${s}V${2 * s}L${f(w / 2)} ${f(2.5 * s)}V${h}M${f(w / 2)} ${f(2.5 * s)}L0 ${2 * s}V${s}L${f(w / 2)} ${f(s / 2)}`;
  const s2 = 15, w2 = Math.sqrt(3) * s2, h2 = 3 * s2;
  const paveP = `M${f(w2 / 2)} 0V${f(s2 / 2)}L${f(w2)} ${s2}V${2 * s2}L${f(w2 / 2)} ${f(2.5 * s2)}V${h2}M${f(w2 / 2)} ${f(2.5 * s2)}L0 ${2 * s2}V${s2}L${f(w2 / 2)} ${f(s2 / 2)}`;
  return `<defs>
  <pattern id="mesh" width="${f(w)}" height="${h}" patternUnits="userSpaceOnUse"><path d="${meshPath}" fill="none" stroke="rgba(23,38,43,.30)" stroke-width="1.1"/></pattern>
  <pattern id="pave" width="${f(w2)}" height="${h2}" patternUnits="userSpaceOnUse"><rect width="${f(w2)}" height="${h2}" fill="${C.pave}"/><path d="${paveP}" fill="none" stroke="${C.paveL}" stroke-width="2"/></pattern>
  <pattern id="grass" width="96" height="96" patternUnits="userSpaceOnUse"><g stroke="${C.lawnD}" stroke-width="2" stroke-linecap="round" fill="none" opacity=".75"><path d="M12 20l3 -7 3 7"/><path d="M58 12l2.5 -6 2.5 6"/><path d="M36 54l3 -7 3 7"/><path d="M80 66l2.5 -6 2.5 6"/><path d="M16 82l3 -7 3 7"/><path d="M64 90l2.5 -5 2.5 5"/></g></pattern>
  <pattern id="pebbles" width="84" height="84" patternUnits="userSpaceOnUse"><g fill="${C.pebble}" opacity=".55"><circle cx="10" cy="14" r="2"/><circle cx="50" cy="8" r="1.4"/><circle cx="34" cy="40" r="2.4"/><circle cx="72" cy="52" r="1.6"/><circle cx="16" cy="66" r="1.5"/><circle cx="58" cy="76" r="2.2"/><circle cx="80" cy="22" r="1.2"/></g></pattern>
  <pattern id="waves" width="70" height="44" patternUnits="userSpaceOnUse"><g stroke="#DDF4FA" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"><path d="M8 12q5 -4 10 0t10 0"/><path d="M42 34q5 -4 10 0t10 0"/></g></pattern>
  <radialGradient id="cloud"><stop offset="0" stop-color="#2E4A2A" stop-opacity=".16"/><stop offset=".6" stop-color="#2E4A2A" stop-opacity=".08"/><stop offset="1" stop-color="#2E4A2A" stop-opacity="0"/></radialGradient>
  </defs>`;
}

/* ================= terrain ================= */
const LAWN_TOP = [[-1300, 380], [-700, 370], [-300, 350], [-60, 330], [200, 300], [470, 252], [700, 205], [960, 174], [1200, 222], [1420, 296], [1700, 352], [2000, 368], [2400, 380], [3200, 390]];
const lawnTopAt = (x) => { for (let i = 1; i < LAWN_TOP.length; i++) { const [x0, y0] = LAWN_TOP[i - 1], [x1, y1] = LAWN_TOP[i]; if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return 390; };
function terrain() {
  let g = `<rect x="-1400" y="-1000" width="4720" height="3100" fill="${C.ground}"/><rect x="-1400" y="-1000" width="4720" height="3100" fill="url(#pebbles)"/>`;
  // dune ridges in the outback
  const r = rng(11);
  for (let k = 0; k < 9; k++) {
    const y0 = -900 + k * 130, pts = [];
    for (let x = -1500; x <= 3400; x += 260) pts.push([x, y0 + Math.sin(x / 300 + k) * 26 + (r() - .5) * 26]);
    const d = smooth(pts, false);
    g += `<path d="${d}" fill="none" stroke="${C.dune}" stroke-width="22" stroke-linecap="round" opacity=".55"/><path d="${d}" transform="translate(0 -11)" fill="none" stroke="${C.duneL}" stroke-width="4" stroke-linecap="round" opacity=".8"/>`;
  }
  // red earth and contour lines around Uluru
  g += `<path d="${blob(1500, 236, 560, 190, 4, 12, .1)}" fill="none" stroke="#C97A4B" stroke-width="2" stroke-dasharray="9 7" opacity=".55"/>
    <path d="${blob(1500, 232, 470, 150, 5, 12, .1)}" fill="none" stroke="#C97A4B" stroke-width="2" stroke-dasharray="9 7" opacity=".6"/>
    <path d="${blob(1500, 226, 380, 112, 6, 12, .12)}" fill="${C.earth}"/>
    <path d="${blob(700, 160, 170, 60, 8, 10, .12)}" fill="${C.earth}" opacity=".75"/>`;
  // spinifex tufts
  const r2 = rng(5);
  for (let i = 0; i < 230; i++) {
    const x = -1300 + r2() * 4500, y = -950 + r2() * 1350;
    if (y > lawnTopAt(x) - 34) continue;
    if (x > 1250 && x < 1760 && y > 40 && y < 250) continue;
    if (x > 600 && x < 790 && y > 80 && y < 190) continue;
    g += spinifex(x, y, .7 + r2() * .6, r2);
  }
  return g;
}
function spinifex(x, y, s, r) {
  let d = '';
  for (let i = 0; i < 11; i++) { const a = -Math.PI + i / 10 * Math.PI + (r() - .5) * .3, L = (8 + r() * 6) * s; d += `M${f(x)} ${f(y)}l${f(Math.cos(a) * L)} ${f(Math.sin(a) * L * .8)}`; }
  return `<ellipse cx="${f(x)}" cy="${f(y + 2)}" rx="${f(12 * s)}" ry="${f(4 * s)}" fill="#C98E52" opacity=".45"/><path d="${d}" stroke="${C.spinD}" stroke-width="3.2" stroke-linecap="round"/><path d="${d}" stroke="${C.spin}" stroke-width="1.8" stroke-linecap="round"/>`;
}
function lawn() {
  const pts = LAWN_TOP.concat([[3200, 2100], [-1300, 2100]]);
  let d = 'M' + P([pts[0]]);
  const top = smooth(LAWN_TOP, false).slice(1);
  d = 'M' + top + `L3200 2100L-1300 2100Z`;
  return `<path d="${d}" fill="${C.lawn}"/><path d="${d}" fill="url(#grass)"/>
    <path d="${smooth(LAWN_TOP, false)}" fill="none" stroke="${INK}" stroke-width="31" stroke-linecap="round" stroke-dasharray="0 23"/>
    <path d="${smooth(LAWN_TOP, false)}" fill="none" stroke="${C.hedge}" stroke-width="26" stroke-linecap="round" stroke-dasharray="0 23"/>
    <path d="${smooth(LAWN_TOP, false)}" transform="translate(-3 -4)" fill="none" stroke="#A3D06E" stroke-width="9" stroke-linecap="round" stroke-dasharray="0 23"/>`;
}

/* ================= water ================= */
const CREEK = 'M600 -900C590 -400 560 -60 548 100C536 250 500 330 440 420C400 480 360 510 330 530';
const OUT = 'M140 610C60 640 -40 660 -200 690C-500 740 -900 760 -1400 790';
function billabong() {
  const creek = CREEK;
  const out = OUT;
  const pond = blob(292, 578, 196, 118, 21, 12, .12);
  const lily = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#79B85A" stroke="#4F8A3C" stroke-width="1.6"/><path d="M${x} ${y}L${x + r} ${y - r * .35}L${x + r} ${y + r * .35}Z" fill="${C.water}"/>`;
  const reeds = (x, y, flip = 1) => `<g transform="translate(${x} ${y}) scale(${flip} 1)"><g class="sway"><path d="M0 0C-2 -10 -1 -22 -4 -30M4 0C4 -12 6 -20 8 -28M8 0C10 -8 14 -14 18 -18M-4 0C-8 -6 -12 -10 -16 -12" stroke="#4F8A3C" stroke-width="2.6" fill="none" stroke-linecap="round"/><ellipse cx="-4" cy="-31" rx="2.6" ry="6" fill="#8A5A35" stroke="${INK}" stroke-width="1.2"/><ellipse cx="8" cy="-29" rx="2.4" ry="5.5" fill="#8A5A35" stroke="${INK}" stroke-width="1.2"/></g></g>`;
  const ripple = (x, y, delay) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="3" fill="none" stroke="#E8F8FC" stroke-width="2"><animate attributeName="rx" values="6;34" dur="3.6s" begin="${delay}s" repeatCount="indefinite"/><animate attributeName="ry" values="3;14" dur="3.6s" begin="${delay}s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="3.6s" begin="${delay}s" repeatCount="indefinite"/></ellipse>`;
  return `<g>
    <path d="${creek}" fill="none" stroke="${INK}" stroke-width="46" stroke-linecap="round"/><path d="${out}" fill="none" stroke="${INK}" stroke-width="46" stroke-linecap="round"/>
    <path d="${pond}" fill="${INK}" transform="translate(0 0)" stroke="${INK}" stroke-width="7"/>
    <path d="${creek}" fill="none" stroke="${C.waterD}" stroke-width="40" stroke-linecap="round"/><path d="${out}" fill="none" stroke="${C.waterD}" stroke-width="40" stroke-linecap="round"/>
    <path d="${pond}" fill="${C.waterD}"/>
    <path d="${creek}" fill="none" stroke="${C.water}" stroke-width="30" stroke-linecap="round"/><path d="${out}" fill="none" stroke="${C.water}" stroke-width="30" stroke-linecap="round"/>
    <path d="${blob(292, 580, 180, 104, 21, 12, .12)}" fill="${C.water}"/>
    <path d="${blob(300, 584, 120, 62, 24, 10, .14)}" fill="#5DB5D3" opacity=".7"/>
    <path d="${pond}" fill="url(#waves)"/><path d="${creek}" fill="none" stroke="url(#waves)" stroke-width="30"/>
    ${lily(170, 540, 9)}${lily(186, 556, 6)}${lily(410, 640, 8)}${lily(392, 650, 5)}${lily(226, 650, 7)}
    ${ripple(250, 560, 0)}${ripple(352, 612, 1.8)}
    ${reeds(110, 520)}${reeds(150, 668, -1)}${reeds(452, 520)}${reeds(470, 642, -1)}${reeds(520, 140)}${reeds(470, 360, -1)}
  </g>`;
}

/* ================= paths ================= */
const PATHS = {
  main: ['M960 1180C960 1060 958 960 960 880C962 790 960 690 960 552', 34],
  left: ['M960 862C880 866 770 842 702 792C682 778 664 760 652 728', 30],
  right: ['M960 862C1040 866 1150 842 1218 792C1238 778 1256 760 1268 728', 30],
  low: ['M300 905C470 966 720 962 960 944C1200 962 1440 966 1520 912', 28],
  west: ['M396 932C432 852 522 782 524 702C526 652 512 622 486 604', 22],
  east: ['M1500 926C1626 870 1706 760 1666 640C1636 560 1566 440 1560 290', 22],
};
function paths() {
  let a = '', b = '', c = '';
  for (const [d, w] of Object.values(PATHS)) {
    a += `<path d="${d}" fill="none" stroke="${C.pathE}" stroke-width="${w + 8}" stroke-linecap="round"/>`;
    b += `<path d="${d}" fill="none" stroke="${C.path}" stroke-width="${w}" stroke-linecap="round"/>`;
    c += `<path d="${d}" fill="none" stroke="#E2C58E" stroke-width="2" stroke-dasharray="1 15" stroke-linecap="round"/>`;
  }
  return `<g>${a}${b}${c}</g>`;
}

/* ================= trees, bushes ================= */
function tree(x, y, s = 1, seed = 1, koala = false) {
  const R = 40 * s;
  const shape = bumpy(0, 0, R, seed, 8 + (seed % 3));
  const r = rng(seed * 7);
  let leaves = '';
  for (let i = 0; i < 6; i++) { const a = r() * 6.28, d = R * (.2 + r() * .55); leaves += `<path d="M${f(Math.cos(a) * d)} ${f(Math.sin(a) * d)}q3 -4 7 -2" stroke="${C.treeD}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".7"/>`; }
  return `<g transform="translate(${x} ${y})" class="bush${koala ? ' koala' : ''}" data-bush="${x} ${y} ${s}">
    <path d="${shape}" transform="translate(${f(11 * s)} ${f(14 * s)})" fill="#3E5A1E" opacity=".22"/>
    <g class="behind"></g>
    <path d="${shape}" fill="${C.tree}" stroke="${INK}" stroke-width="2.4"/>
    <path d="${shape}" transform="translate(${f(5 * s)} ${f(6 * s)}) scale(.74)" fill="${C.treeD}" opacity=".45"/>
    <path d="${shape}" transform="translate(${f(-9 * s)} ${f(-10 * s)}) scale(.5)" fill="${C.treeL}"/>
    <circle cx="${f(-16 * s)}" cy="${f(-14 * s)}" r="${f(4 * s)}" fill="#B8DD8C"/>
    ${leaves}${koala ? `<g class="sitter">${koalaSVG()}</g>` : ''}<g class="front"></g></g>`;
}
function wattle(x, y, s = 1, seed = 3) {
  const r = rng(seed);
  let dots = '';
  for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = 14 * s * r(); dots += `<circle cx="${f(Math.cos(a) * d)}" cy="${f(Math.sin(a) * d)}" r="${f(2.6 * s)}" fill="#F6CF3C" stroke="#C99A1E" stroke-width=".8"/>`; }
  return `<g transform="translate(${x} ${y})"><path d="${bumpy(0, 0, 22 * s, seed, 7, .82)}" transform="translate(5 6)" fill="#3E5A1E" opacity=".2"/><path d="${bumpy(0, 0, 22 * s, seed, 7, .82)}" fill="#76AA52" stroke="${INK}" stroke-width="2"/>${dots}</g>`;
}
function bench(x, y, rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-17" y="-6" width="34" height="12" rx="2" fill="${C.woodL}" stroke="${INK}" stroke-width="2"/><path d="M-17 -1H17" stroke="${C.wood}" stroke-width="1.6"/><rect x="-17" y="-10" width="34" height="4" rx="1.5" fill="${C.wood}" stroke="${INK}" stroke-width="1.6"/></g>`;
}
function flowerBed(x, y, s = 1, seed = 1) {
  const r = rng(seed); let fl = '';
  const cols = ['#E2453B', '#F6CF3C', '#F08BB0', '#FFFFFF', '#E2453B'];
  for (let i = 0; i < 13; i++) { const a = r() * 6.28, d = 15 * s * Math.sqrt(r()), cx = Math.cos(a) * d, cy = Math.sin(a) * d * .8, col = cols[i % cols.length];
    fl += `<g transform="translate(${f(cx)} ${f(cy)})"><circle r="3.6" fill="${col}" stroke="${INK}" stroke-width="1"/><circle r="1.3" fill="#F2B63D"/></g>`; }
  return `<g transform="translate(${x} ${y})"><ellipse cx="4" cy="5" rx="${26 * s}" ry="${21 * s}" fill="#3E5A1E" opacity=".2"/><ellipse rx="${26 * s}" ry="${21 * s}" fill="#8A5A3A" stroke="${INK}" stroke-width="2.4"/><ellipse rx="${21 * s}" ry="${16 * s}" fill="#5E8F45"/>${fl}</g>`;
}
function picnic(x, y) {
  let ch = '';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) ch += `<rect x="${-28 + i * 14}" y="${-22 + j * 11}" width="14" height="11" fill="#E2453B"/>`;
  return `<g transform="translate(${x} ${y}) rotate(-12)"><rect x="-24" y="-18" width="56" height="44" fill="#3E5A1E" opacity=".18"/><rect x="-28" y="-22" width="56" height="44" fill="#FFF3DA"/>${ch}<rect x="-28" y="-22" width="56" height="44" fill="none" stroke="${INK}" stroke-width="2.2"/>
    <g transform="translate(10 -2)"><rect x="-10" y="-7" width="20" height="14" rx="3" fill="${C.woodL}" stroke="${INK}" stroke-width="1.8"/><path d="M-10 -1H10M-3 -7V7M4 -7V7" stroke="${C.wood}" stroke-width="1.2"/><path d="M-7 -7C-7 -14 7 -14 7 -7" fill="none" stroke="${INK}" stroke-width="1.8"/></g>
    <circle cx="-14" cy="8" r="4.5" fill="#F6CF3C" stroke="${INK}" stroke-width="1.4"/><circle cx="-16" cy="-9" r="4" fill="#E9662A" stroke="${INK}" stroke-width="1.4"/></g>`;
}
// termite mounds, four shapes so no two look alike: a tall spire, a twin peak, a lumpy "cathedral" and a low dome
const MOUNDS = {
  spire: ['M-11 0C-10 -12 -7 -28 -3 -42C-1 -50 2 -50 3 -43C5 -32 8 -18 11 0Z', 'M-5 -6C-4 -16 -2 -28 0 -38', '#D4874E'],
  twin: ['M-16 0C-15 -10 -12 -22 -9 -30C-7 -35 -4 -35 -3 -29C-2 -24 -1 -22 1 -26C3 -32 6 -38 8 -33C11 -24 14 -10 16 0Z', 'M-9 -6C-8 -14 -7 -22 -6 -27M6 -6C6 -14 6 -22 6 -29', '#C97B45'],
  cathedral: ['M-15 0C-15 -8 -13 -14 -10 -18C-9 -24 -7 -30 -4 -33C-3 -40 0 -44 2 -40C4 -36 4 -32 6 -30C9 -28 9 -22 11 -18C13 -12 15 -6 15 0Z', 'M-8 -5C-7 -12 -5 -20 -3 -28M5 -5C6 -10 7 -16 7 -22', '#DB915A'],
  dome: ['M-17 0C-16 -9 -11 -17 -3 -19C5 -21 12 -16 15 -8C16 -5 17 -2 17 0Z', 'M-9 -5C-7 -10 -4 -14 0 -15M5 -4C7 -8 9 -10 11 -11', '#CF8350'],
};
function termites(x, y, s = 1, kind = 'spire') {
  const [d, lines, col] = MOUNDS[kind];
  return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="4" cy="1" rx="18" ry="5" fill="#7E2E14" opacity=".22"/><path d="${d}" fill="${col}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="${lines}" stroke="#A85E33" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/></g>`;
}
// rocks, in several kinds: round boulder (default, also used in the domes and the construction site), a flat slab, an angular rock with facets, and a cluster of pebbles
function rock(x, y, s = 1, seed = 2, col = '#B27C5A', kind = 'round') {
  const one = (cx, cy, rx, ry, sd, c) => `<path d="${blob(cx + 4, cy + 5, rx, ry, sd, 7, .2)}" fill="#7A4A2A" opacity=".2"/><path d="${blob(cx, cy, rx, ry, sd, 7, .2)}" fill="${c}" stroke="${INK}" stroke-width="2"/><path d="${blob(cx - rx * .25, cy - ry * .3, rx * .42, ry * .36, sd + 1, 6, .2)}" fill="#fff" opacity=".22"/>`;
  let g;
  if (kind === 'flat') g = one(0, 0, 24 * s, 8 * s, seed, col) + `<path d="M${f(-14 * s)} ${f(1 * s)}H${f(10 * s)}" stroke="${INK}" stroke-width="1.4" opacity=".35" stroke-linecap="round"/>`;
  else if (kind === 'angular') {
    const P2 = [[-15, 4], [-11, -9], [-2, -15], [9, -11], [15, -1], [10, 7], [-6, 8]].map(([a, b]) => [a * s, b * s]);
    g = `<polygon points="${P(P2.map(([a, b]) => [a + 4, b + 5]))}" fill="#7A4A2A" opacity=".2"/><polygon points="${P(P2)}" fill="${col}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="${P([[-11 * s, -9 * s], [-2 * s, -15 * s], [1 * s, -3 * s], [-8 * s, 0]])}" fill="#fff" opacity=".22"/><path d="M${f(1 * s)} ${f(-3 * s)}L${f(9 * s)} ${f(-11 * s)}M${f(1 * s)} ${f(-3 * s)}L${f(-6 * s)} ${f(8 * s)}" stroke="${INK}" stroke-width="1.4" opacity=".35"/>`;
  } else if (kind === 'cluster') g = one(-9 * s, 2 * s, 10 * s, 7 * s, seed, col) + one(8 * s, 3 * s, 7 * s, 5 * s, seed + 3, col) + one(1 * s, -6 * s, 6 * s, 4.5 * s, seed + 5, col);
  else g = one(0, 0, 16 * s, 11 * s, seed, col);
  return `<g transform="translate(${x} ${y})">${g}</g>`;
}

/* ================= landmarks ================= */
function uluru() {
  return `<g>
    <ellipse cx="1500" cy="212" rx="236" ry="16" fill="#7E2E14" opacity=".25"/>
    <path d="M1290 208C1295 172 1306 130 1330 110C1352 92 1400 88 1460 86C1530 84 1600 86 1640 96C1672 104 1690 132 1700 162C1705 180 1708 194 1712 208Z" fill="#C9552E"/>
    <path d="M1590 208C1636 176 1676 144 1688 120C1700 144 1706 178 1712 208Z" fill="#A8401F"/>
    <path d="M1290 208C1400 192 1600 194 1712 208L1708 196C1600 186 1400 184 1293 196Z" fill="#A8401F" opacity=".8"/>
    <path d="M1306 152C1320 114 1360 98 1440 94C1380 104 1342 122 1322 156Z" fill="#E27C4C"/>
    <path d="M1470 90C1540 88 1600 90 1632 100C1600 96 1540 96 1470 98Z" fill="#E68A5A"/>
    <g stroke="#93361A" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M1356 104C1352 134 1360 164 1352 198"/><path d="M1408 92C1404 122 1414 152 1406 200"/><path d="M1462 90C1460 116 1468 140 1462 172"/><path d="M1518 88C1520 110 1514 140 1520 168"/><path d="M1574 90C1578 120 1572 150 1582 196"/><path d="M1630 98C1642 124 1636 162 1648 202"/></g>
    <g fill="#6E2610"><ellipse cx="1384" cy="194" rx="9" ry="5"/><ellipse cx="1536" cy="190" rx="7" ry="4"/><ellipse cx="1664" cy="194" rx="8" ry="4.5"/></g>
    <path d="M1290 208C1295 172 1306 130 1330 110C1352 92 1400 88 1460 86C1530 84 1600 86 1640 96C1672 104 1690 132 1700 162C1705 180 1708 194 1712 208Z" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
  </g>`;
}
function kataTjuta() {
  const hump = (x, w, h, col) => `<path d="M${x - w / 2} 156C${x - w / 2} ${156 - h * 1.15} ${x + w / 2} ${156 - h * 1.15} ${x + w / 2} 156Z" fill="${col}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M${x - w / 2 + 5} 150C${x - w / 2 + 6} ${156 - h * .8} ${x - w * .1} ${156 - h * .95} ${x} ${156 - h * .86}" stroke="#E79466" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return `<g><ellipse cx="694" cy="159" rx="98" ry="8" fill="#7E2E14" opacity=".2"/>${hump(624, 26, 22, '#C9663E')}${hump(650, 40, 38, '#C35A33')}${hump(686, 50, 56, '#C9603A')}${hump(728, 42, 44, '#C35A33')}${hump(760, 30, 28, '#C9663E')}</g>`;
}
function lookout() {
  // the Uluru lookout; a click on it switches the page to full screen and back (an easter egg, see lookoutToggle):
  // with the lens caps on (dark lenses) the page is in a window, with the caps off (light lenses with a glint, gold ring) it is full screen
  const x = 1560, y = 262;
  return `<g transform="translate(${x} ${y})" id="lookout">
    <polygon points="${P(hexPts(6, 8, 38, 0))}" fill="#7A4A2A" opacity=".22"/>
    <polygon points="${P(hexPts(0, 0, 38, 0))}" fill="${C.woodL}" stroke="${INK}" stroke-width="2.6"/>
    <g stroke="${C.wood}" stroke-width="1.6"><path d="M-30 -10H30M-36 0H36M-30 10H30M-22 20H22M-22 -20H22"/></g>
    <polygon class="lookring" points="${P(hexPts(0, 0, 32, 0))}" fill="none" stroke="${C.woodD}" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round"/>
    <g transform="translate(0 -15)"><ellipse rx="7" ry="3" fill="#5D7A86" stroke="${INK}" stroke-width="1.6"/><path d="M0 0V-24" stroke="${INK}" stroke-width="4"/><path d="M0 0V-24" stroke="#5D7A86" stroke-width="2"/><rect x="-12" y="-36" width="24" height="12" rx="5" fill="#5D7A86" stroke="${INK}" stroke-width="2"/>
      ${[-7, 7].map((cx) => `<circle class="lens" cx="${cx}" cy="-30" r="3.4" stroke="${INK}" stroke-width="1.4"/><circle class="glint" cx="${cx - 1.1}" cy="-31.1" r="1"/>`).join('')}</g>
  </g>`;
}

/* ================= aviary ================= */
const SPECIES = {
  budgie: [['#7BC74D', '#3E8A35', '#F2DA4E'], ['#5DA8E8', '#3A78B8', '#F6F2E4']],
  galah: [['#E9879F', '#A3A8AE', '#F7C2CF'], ['#F7F5EE', '#E2DDCF', '#FDFCF6', '#F4CE3A']],
  lorikeet: [['#3FAE49', '#2C8A3A', '#3C5DD8', null, '#F7A03A']],
};
function tbird([body, wing, head, crest, collar], fly = false) {
  return `<g>
    <path d="M-8 0L-16 -3.6L-16 3.6Z" fill="${wing}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    ${fly ? `<g class="flap" style="animation-duration:${(.2 + Math.random() * .12).toFixed(2)}s"><path d="M-3 -2C-8 -17 3 -20 6 -3ZM-3 2C-8 17 3 20 6 3Z" fill="${wing}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/></g>` : ''}
    <ellipse cx="-1" cy="0" rx="8.4" ry="5.2" fill="${body}" stroke="${INK}" stroke-width="1.3"/>
    ${fly ? '' : `<path d="M-6 -2.6C-3 -5.4 3 -5 5 -2.6M-6 2.6C-3 5.4 3 5 5 2.6" stroke="${wing}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`}
    ${collar ? `<ellipse cx="4.6" cy="0" rx="1.6" ry="3.8" fill="${collar}"/>` : ''}
    <circle cx="7" cy="0" r="3.9" fill="${head}" stroke="${INK}" stroke-width="1.2"/>
    ${crest ? `<path d="M5 0C3 -1.5 1 -1 -.5 0C1 1 3 1.5 5 0Z" fill="${crest}" stroke="${INK}" stroke-width=".8"/>` : ''}
    <path d="M10.4 -1.3L13.4 0L10.4 1.3Z" fill="#F2B63D" stroke="${INK}" stroke-width=".6"/>
    <circle cx="8" cy="-1.9" r=".85" fill="${INK}"/><circle cx="8" cy="1.9" r=".85" fill="${INK}"/></g>`;
}
function dome(o, cx, cy, R, species, seed) {
  const r = rng(seed), sp = SPECIES[species], pick = () => sp[Math.floor(r() * sp.length)];
  const id = 'dc' + o.id;
  let perched = '';
  const spots = [[-.4, -.16], [.18, -.5], [.38, -.1], [.48, .34], [-.5, .4]];
  spots.forEach(([a, b], i) => { perched += `<g transform="translate(${f(a * R)} ${f(b * R)}) rotate(${Math.floor(r() * 360)}) scale(${f(1.25 * R / 106)})">${tbird(pick())}</g>`; });
  let flyers = '';
  [[.66, 1, 14], [.46, -1, 10], [.58, 1, 17]].slice(0, R > 120 ? 3 : 2).forEach(([k, dir, dur], i) => {
    const rr = f(R * k), path = dir > 0 ? `M${rr} 0A${rr} ${rr} 0 1 1 ${-rr} 0A${rr} ${rr} 0 1 1 ${rr} 0` : `M${rr} 0A${rr} ${rr} 0 1 0 ${-rr} 0A${rr} ${rr} 0 1 0 ${rr} 0`;
    flyers += `<g><animateMotion dur="${dur}s" begin="${-i * 3}s" repeatCount="indefinite" rotate="auto" path="${path}"/><g transform="scale(${f(1.6 * R / 106)})">${tbird(pick(), true)}</g></g>`;
  });
  const ribs = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = i / 8 * Math.PI * 2 + .2; return `M0 0L${f(Math.cos(a) * R)} ${f(Math.sin(a) * R)}`; }).join('');
  return `<g transform="translate(${cx} ${cy})">
    <circle cx="14" cy="18" r="${R}" fill="#3E5A1E" opacity=".22"/>
    <circle class="halo" data-opt="${o.id}" r="${R + 13}" fill="none" stroke="${o.c}" stroke-width="10"/>
    <clipPath id="${id}"><circle r="${R - 3}"/></clipPath>
    <circle r="${R}" fill="${C.floor}"/>
    <g clip-path="url(#${id})">
      <path d="M0 ${R}C${f(-R * .3)} ${f(R * .6)} ${f(R * .3)} ${f(R * .32)} 0 ${f(R * .02)}" fill="none" stroke="#E8D09D" stroke-width="15" stroke-linecap="round"/>
      <path d="${blob(R * .42, R * .14, R * .22, R * .15, seed + 2, 9, .14)}" fill="${C.waterD}"/><path d="${blob(R * .42, R * .15, R * .19, R * .12, seed + 2, 9, .14)}" fill="${C.water}"/>
      ${tree(f(-R * .44), f(-R * .14), R / 120 * .9, seed + 3)}${tree(f(R * .14), f(-R * .52), R / 120 * .75, seed + 4)}${tree(f(-R * .52), f(R * .46), R / 120 * .55, seed + 5)}
      <path d="M${f(R * .24)} ${f(-R * .02)}L${f(R * .58)} ${f(-R * .26)}" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M${f(R * .24)} ${f(-R * .02)}L${f(R * .58)} ${f(-R * .26)}" stroke="#9A6A3E" stroke-width="5" stroke-linecap="round"/>
      ${rock(f(R * .5), f(R * .58), R / 140, seed + 6, '#A9A39A')}
      <circle r="${f(R * .13)}" cy="${f(R * .02)}" fill="#EADFC7" stroke="${INK}" stroke-width="2"/><circle r="${f(R * .075)}" cy="${f(R * .02)}" fill="${C.water}"/>
      ${perched}${flyers}
      <circle r="${R}" fill="${C.glass}" opacity=".16"/>
      <circle r="${R}" fill="url(#mesh)"/>
      <path d="${ribs}" stroke="rgba(23,38,43,.34)" stroke-width="2.2"/>
      <circle r="${f(R * .58)}" fill="none" stroke="rgba(23,38,43,.22)" stroke-width="2"/>
      <ellipse cx="${f(-R * .36)}" cy="${f(-R * .42)}" rx="${f(R * .48)}" ry="${f(R * .2)}" transform="rotate(-38 ${f(-R * .36)} ${f(-R * .42)})" fill="#fff" opacity=".26"/>
    </g>
    <circle r="${f(R * .07)}" fill="#DCE6E2" stroke="${INK}" stroke-width="2"/>
    <circle r="${R - 4}" fill="none" stroke="#E7EFEC" stroke-width="3.5"/>
    <circle r="${R}" fill="none" stroke="${INK}" stroke-width="4"/>
    <g transform="translate(0 ${R - 3})"><rect x="-26" y="-14" width="52" height="30" rx="8" fill="#F3EAD6" stroke="${INK}" stroke-width="2.6"/><rect x="-26" y="-14" width="52" height="9" rx="4" fill="${o.c}" stroke="${INK}" stroke-width="2.2"/><rect x="-9" y="-2" width="18" height="15" rx="3" fill="#2E3B3A"/></g>
    <circle class="hit" data-opt="${o.id}" r="${R}" fill="transparent"/>
  </g>`;
}
function tunnel(d) {
  return `<g><path d="${d}" transform="translate(12 16)" fill="none" stroke="#3E5A1E" stroke-width="46" opacity=".2"/>
    <path d="${d}" fill="none" stroke="${INK}" stroke-width="46"/><path d="${d}" fill="none" stroke="${C.floor}" stroke-width="40"/>
    <path d="${d}" fill="none" stroke="#E8D09D" stroke-width="13"/><path d="${d}" fill="none" stroke="${C.glass}" stroke-width="40" opacity=".2"/>
    <path d="${d}" fill="none" stroke="url(#mesh)" stroke-width="40"/><path d="${d}" fill="none" stroke="${INK}" stroke-width="40" stroke-dasharray="2.6 14" opacity=".45"/>
    <path d="${d}" fill="none" stroke="#E7EFEC" stroke-width="3" transform="translate(0 -15)" opacity=".0"/></g>`;
}

/* ================= kiosk (mini games) ================= */
function kiosk() {
  const o = O.mini;
  const parasol = (x, y, s = 1) => { let seg = ''; for (let i = 0; i < 8; i++) { const a0 = i / 8 * Math.PI * 2, a1 = (i + 1) / 8 * Math.PI * 2, R = 26 * s; seg += `<path d="M0 0L${f(Math.cos(a0) * R)} ${f(Math.sin(a0) * R)}L${f(Math.cos(a1) * R)} ${f(Math.sin(a1) * R)}Z" fill="${i % 2 ? '#FFF1D6' : o.c}"/>`; } return `<g transform="translate(${x} ${y})"><circle cx="8" cy="10" r="${26 * s}" fill="#3E5A1E" opacity=".2"/>${seg}<polygon points="${P(Array.from({ length: 8 }, (_, i) => [Math.cos(i / 8 * 6.283) * 26 * s, Math.sin(i / 8 * 6.283) * 26 * s]))}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><circle r="3" fill="${INK}"/></g>`; };
  let stripes = '';
  for (let i = 0; i < 6; i++) stripes += `<path d="M${-60 + i * 20} -62H${-40 + i * 20}V-44Q${-50 + i * 20} -36 ${-60 + i * 20} -44Z" fill="${i % 2 ? '#FFF1D6' : o.c}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
  return `<g>
    <ellipse cx="318" cy="900" rx="120" ry="64" fill="url(#pave)" stroke="${C.pathE}" stroke-width="5"/>
    <ellipse class="halo" data-opt="mini" cx="318" cy="900" rx="133" ry="77" fill="none" stroke="${o.c}" stroke-width="10"/>
    <g transform="translate(318 872)">
      <path d="M-56 -4H70L64 6H-50Z" fill="#3E5A1E" opacity=".2"/>
      <rect x="-54" y="-48" width="108" height="50" fill="#FFF3D6" stroke="${INK}" stroke-width="3"/>
      <rect x="-36" y="-40" width="72" height="26" rx="3" fill="#2E3B3A" stroke="${INK}" stroke-width="2"/>
      <rect x="-40" y="-16" width="80" height="8" rx="2" fill="${C.woodL}" stroke="${INK}" stroke-width="2"/>
      <path d="M-56 -84H56L64 -62H-64Z" fill="${o.d}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M-40 -80H40" stroke="#fff" stroke-width="2" opacity=".35"/>
      ${stripes}
      <g transform="translate(-14 -30)"><rect x="-8" y="-9" width="14" height="19" rx="2" fill="#FFF7E6" stroke="${INK}" stroke-width="1.4" transform="rotate(-10)"/><rect x="2" y="-9" width="14" height="19" rx="2" fill="#DDEFD9" stroke="${INK}" stroke-width="1.4" transform="rotate(8)"/></g>
      <text x="18" y="-22" font-size="12" font-weight="800" fill="#FFD84D">?!</text>
    </g>
    <g transform="translate(402 880)"><path d="M-14 22L0 -14L14 22" fill="none" stroke="${INK}" stroke-width="3"/><rect x="-15" y="-16" width="30" height="30" rx="3" fill="#2F4A3E" stroke="${INK}" stroke-width="2.4"/><path d="M-9 -6H9M-9 0H6M-9 6H8" stroke="#F3EAD6" stroke-width="1.8" stroke-linecap="round"/></g>
    ${parasol(214, 950, .85)}${parasol(186, 864, .62)}
    <circle class="hit" data-opt="mini" cx="318" cy="852" r="80" fill="transparent"/>
  </g>`;
}

/* ================= construction site (map editor) ================= */
function site() {
  const o = O.editor, cx = 1585, cy = 878, r = 23;
  const at = (q, s) => [cx + r * Math.sqrt(3) * (q + s / 2), cy + r * 1.5 * s];
  // the map being built: every space starts as a dashed outline and the tiles are laid one by one (siteBuild), in the order of this list
  const cells = [[-1, 0, 'sand'], [0, 0, 'sand'], [0, -1, 'rock'], [1, 0, 'water'], [-1, 1, 'water'], [1, -1, 'sand'], [0, 1, 'sand'], [-1, -1, 'sand'], [2, -1, 'water'], [-2, 1, 'sand'], [1, 1, 'rock'], [2, 0, 'green']];
  const fill = { sand: '#F3E1B5', water: '#78C3DB', rock: '#A39E95', green: o.c };
  let plan = '', g = '';
  for (const [q, s, k] of cells) {
    const [x, y] = at(q, s);
    plan += `<polygon points="${P(hexPts(x, y, r - 2, 30))}" fill="rgba(255,255,255,.35)" stroke="${INK}" stroke-width="2" stroke-dasharray="5 4"/>`;
    let t = `<polygon points="${P(hexPts(x + 3, y + 4, r - 2, 30))}" fill="#5A3A1C" opacity=".3"/><polygon points="${P(hexPts(x, y, r - 2, 30))}" fill="${fill[k]}" stroke="${INK}" stroke-width="2.4"/>`;
    if (k === 'water') t += `<path d="M${x - 9} ${y}q4.5 -4 9 0t9 0" stroke="#E2F6FB" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    if (k === 'rock') t += `<path d="M${x - 10} ${y + 6}l6 -10 4 5 4 -8 6 13Z" fill="#7F7A72" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
    if (k === 'green') t += `<path d="M${x - 7} ${y + 3}l4 -6 4 4 5 -7" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/>`;
    g += `<g class="sitetile">${t}</g>`;
  }
  g = plan + g;
  const stakes = hexPts(cx, cy, 100, 30).map(([x, y]) => `<g transform="translate(${f(x)} ${f(y)})"><path d="M0 0V-20" stroke="${INK}" stroke-width="4"/><path d="M0 0V-20" stroke="${C.woodL}" stroke-width="2.2"/><path d="M0 -20L12 -16L0 -12Z" fill="#F07A2E" stroke="${INK}" stroke-width="1.4"/></g>`).join('');
  const stack = (x, y) => { let s = ''; for (let i = 0; i < 3; i++) { const yy = y - i * 7; s += `<polygon points="${P(hexPts(x, yy + 6, 18, 30).filter((p, j) => j < 3).concat(hexPts(x, yy, 18, 30).filter((p, j) => j < 3).reverse()))}" fill="#C9A26A" stroke="${INK}" stroke-width="1.8"/><polygon points="${P(hexPts(x, yy, 18, 30))}" fill="${['#F3E1B5', '#78C3DB', '#A39E95'][i]}" stroke="${INK}" stroke-width="2"/>`; } return s; };
  const cone = (x, y) => `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="2" rx="11" ry="4" fill="#3E5A1E" opacity=".25"/><path d="M-9 0L-3 -24H3L9 0Z" fill="#F07A2E" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M-6.5 -10H6.5" stroke="#fff" stroke-width="3.2"/><rect x="-12" y="-2" width="24" height="5" rx="2" fill="#F07A2E" stroke="${INK}" stroke-width="1.8"/></g>`;
  return `<g>
    <path d="${blob(cx, cy + 4, 162, 102, 31, 11, .1)}" fill="#D9AC72" stroke="#B98A52" stroke-width="3"/>
    <path d="M${cx - 150} ${cy + 40}C${cx - 60} ${cy + 70} ${cx + 40} ${cy + 74} ${cx + 140} ${cy + 46}" stroke="#C49460" stroke-width="7" fill="none" stroke-dasharray="4 7" opacity=".7"/>
    <path class="halo" data-opt="editor" d="${blob(cx, cy + 4, 162, 102, 31, 11, .1)}" transform="translate(${cx} ${cy + 4}) scale(1.08 1.127) translate(${-cx} ${-cy - 4})" fill="none" stroke="${o.c}" stroke-width="10" vector-effect="non-scaling-stroke"/>
    <polygon points="${P(hexPts(cx, cy, 100, 30))}" fill="none" stroke="#FFF7E6" stroke-width="2" stroke-dasharray="3 5"/>
    ${g}${stakes}
    <g transform="translate(1750 816) rotate(9)"><rect x="-36" y="-24" width="72" height="50" fill="#2E6FA3" stroke="${INK}" stroke-width="2.4"/><g stroke="#CFE6FF" stroke-width="1" opacity=".55"><path d="M-36 -12H36M-36 0H36M-36 12H36M-24 -24V26M-12 -24V26M0 -24V26M12 -24V26M24 -24V26"/></g><g fill="none" stroke="#fff" stroke-width="1.8"><polygon points="${P(hexPts(-5.65, 8.5, 10, 30))}"/><polygon points="${P(hexPts(11.65, 8.5, 10, 30))}"/><polygon points="${P(hexPts(3, -6.5, 10, 30))}"/></g><path d="M36 -24C44 -24 44 26 36 26" fill="#245A86" stroke="${INK}" stroke-width="2"/></g>
    <g>${stack(1452, 840)}</g>${cone(1478, 942)}${cone(1708, 944)}
    <circle class="hit" data-opt="editor" cx="${cx}" cy="${cy}" r="110" fill="transparent"/>
  </g>`;
}

/* ================= entrance ================= */
// "UEFA" carved into the gate's board: the letters are drawn as chisel grooves (no font): a light lower lip, the dark groove, a darker core, following the board's arch
function carved() {
  const G = { U: 'M0 0V11Q0 18 8 18Q16 18 16 11V0', E: 'M15 0H1V18H15M1 9H12', F: 'M15 0H1V18M1 9H12', A: 'M0 18L8 0L16 18M3.6 11.5H12.4' };
  return [...'UEFA'].map((ch, i) => {
    const x = 911 + i * 26, dy = [2.4, 0, 0, 2.4][i], rot = [-5, -1.5, 1.5, 5][i];
    const d = G[ch], at = `translate(${x} ${996 + dy}) rotate(${rot} 8 9)`;
    return `<g transform="${at}" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" transform="translate(.6 1.4)" stroke="#E6B57E" stroke-width="5.4"/><path d="${d}" stroke="#4A2A12" stroke-width="5"/><path d="${d}" transform="translate(-.4 -.5)" stroke="#2E190A" stroke-width="2"/></g>`;
  }).join('');
}
function entrance() {
  // the Australian flag (simplified for its 28 x 14 size): Union Jack in the canton, the Commonwealth Star under it, the Southern Cross on the fly
  const star = (cx, cy, r, n = 7) => 'M' + Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / n, q = i % 2 ? r * .45 : r; return `${f(cx + Math.cos(a) * q)} ${f(cy + Math.sin(a) * q)}`; }).join('L') + 'Z';
  let flagN = 0;
  const flag = (x, y) => { const id = 'auflag' + flagN++; return `<g transform="translate(${x} ${y})"><path d="M0 0V-34" stroke="${INK}" stroke-width="3"/><g class="flagw" style="animation-delay:${(Math.random() * 1.4).toFixed(2)}s"><g transform="translate(1.5 -34)">
    <clipPath id="${id}"><rect width="14" height="7"/></clipPath>
    <rect width="28" height="14" fill="#012169"/>
    <g clip-path="url(#${id})"><path d="M0 0L14 7M14 0L0 7" stroke="#fff" stroke-width="1.8"/><path d="M0 0L14 7M14 0L0 7" stroke="#C8102E" stroke-width=".7"/><path d="M7 0V7M0 3.5H14" stroke="#fff" stroke-width="2.4"/><path d="M7 0V7M0 3.5H14" stroke="#C8102E" stroke-width="1.3"/></g>
    <g fill="#fff"><path d="${star(7, 10.6, 2.1)}"/><path d="${star(21, 2.6, 1.2)}"/><path d="${star(17.6, 6.8, 1.2)}"/><path d="${star(24.6, 6, 1.2)}"/><path d="${star(21, 11.6, 1.3)}"/><path d="${star(22.9, 8.6, .7, 5)}"/></g>
    <rect width="28" height="14" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/></g></g></g>`; };
  return `<g>
    <ellipse cx="960" cy="1086" rx="268" ry="128" fill="url(#pave)" stroke="${C.pathE}" stroke-width="6"/>
    <g transform="translate(0 0)">
      <rect x="850" y="1000" width="30" height="80" rx="4" fill="${C.woodL}" stroke="${INK}" stroke-width="3"/><rect x="1040" y="1000" width="30" height="80" rx="4" fill="${C.woodL}" stroke="${INK}" stroke-width="3"/>
      <rect x="845" y="992" width="40" height="14" rx="3" fill="${C.wood}" stroke="${INK}" stroke-width="2.6"/><rect x="1035" y="992" width="40" height="14" rx="3" fill="${C.wood}" stroke="${INK}" stroke-width="2.6"/>
      <path d="M838 1010C880 982 1040 982 1082 1010L1080 1040C1040 1014 880 1014 840 1040Z" fill="${C.wood}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M852 1014C868 1006 884 1001 898 998M1022 998C1036 1001 1052 1006 1068 1014M858 1027C874 1020 890 1016 904 1014M1016 1014C1030 1016 1046 1020 1062 1027" stroke="#83532C" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      ${carved()}
      ${flag(865, 992)}${flag(1055, 992)}
    </g>
    <g transform="translate(1176 1056)"><path d="M-34 4H40L34 12H-38Z" fill="#3E5A1E" opacity=".2"/><rect x="-30" y="-36" width="60" height="42" fill="#FFF3D6" stroke="${INK}" stroke-width="2.6"/><rect x="-18" y="-28" width="36" height="18" rx="3" fill="#2E3B3A"/><path d="M-38 -34L0 -58L38 -34Z" fill="${O.custom.c}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/></g>
  </g>`;
}

/* ================= animals ================= */
function emuAdult(step = .9, phase = 0, crown = true) {
  const leg = (col, off) => `<g transform="translate(-4 -50)"><g><animateTransform attributeName="transform" type="rotate" values="-24;22;-24" keyTimes="0;.5;1" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1" dur="${step}s" begin="${f(phase + off)}s" repeatCount="indefinite"/>
    <path d="M0 0C2 14 4 24 1 32L-1 48" fill="none" stroke="${INK}" stroke-width="8.5" stroke-linecap="round"/><path d="M-1 48l12 1M-1 48l8 5M-1 48l-7 1" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M0 0C2 14 4 24 1 32L-1 48" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round"/><path d="M-1 48l12 1M-1 48l8 5M-1 48l-7 1" stroke="${col}" stroke-width="2.8" stroke-linecap="round"/></g></g>`;
  return `<g>${leg('#5A4D42', -step / 2)}
    <g><animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="${step / 2}s" begin="${phase}s" repeatCount="indefinite"/>
      <path d="M16 -46Q12 -39 7 -45Q2 -38 -3 -45Q-8 -38 -13 -45Q-18 -38 -23 -45Q-28 -39 -33 -46Q-40 -42 -44 -50C-50 -62 -40 -84 -14 -88C8 -91 28 -82 30 -66C31 -56 25 -48 16 -46Z" fill="#4E3A2B" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M-32 -70q9 6 18 1M-18 -79q9 6 18 1M-30 -57q8 5 16 1M-12 -64q9 6 18 1M4 -76q7 5 14 1M-40 -60q4 4 8 4" stroke="#7A5A42" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <g><animateTransform attributeName="transform" type="rotate" values="0 18 -80;-5 18 -80;0 18 -80" dur="${step}s" begin="${phase}s" repeatCount="indefinite"/>
        <path d="M18 -78C26 -94 24 -112 31 -127" fill="none" stroke="${INK}" stroke-width="12.5" stroke-linecap="round"/><path d="M18 -78C26 -94 24 -112 31 -127" fill="none" stroke="#9BB2BE" stroke-width="8" stroke-linecap="round"/>
        <path d="M24 -100C26 -110 27 -118 31 -126" stroke="#5B4636" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>
        <ellipse cx="33" cy="-130" rx="9.6" ry="8.2" fill="#5B4636" stroke="${INK}" stroke-width="2"/>
        <ellipse cx="37.5" cy="-129" rx="5" ry="4.4" fill="#A9C0CC"/>
        <circle cx="37.6" cy="-131" r="3" fill="#fff" stroke="${INK}" stroke-width="1"/><circle class="blink" cx="38.2" cy="-131" r="1.7" fill="${INK}"/><circle cx="38.8" cy="-131.8" r=".6" fill="#fff"/>
        <path d="M41 -129C46 -129 50 -127 52 -125C48 -124 44 -124 41 -125Z" fill="#4A3A2E" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
        ${crown ? `<path d="M25.5 -136.5L26.5 -147L31 -141.5L34 -149L37.5 -141.5L41.5 -146L40.5 -135.5Z" fill="#F2B63D" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/><circle cx="34" cy="-139" r="1.3" fill="#E2453B"/>` : ''}
      </g></g>
    ${leg('#7A6A5A', 0)}</g>`;
}
let chickN = 0;
function emuChick(step = .55, phase = 0) {
  const id = 'chk' + chickN++;
  const leg = (col, off) => `<g transform="translate(-2 -20)"><g><animateTransform attributeName="transform" type="rotate" values="-26;24;-26" dur="${step}s" begin="${f(phase + off)}s" repeatCount="indefinite"/><path d="M0 0V18M0 18l6 1M0 18l-4 1" stroke="${INK}" stroke-width="4.6" stroke-linecap="round" fill="none"/><path d="M0 0V18M0 18l6 1M0 18l-4 1" stroke="${col}" stroke-width="2.4" stroke-linecap="round" fill="none"/></g></g>`;
  return `<g>${leg('#6A5A4C', -step / 2)}<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="${step / 2}s" begin="${phase}s" repeatCount="indefinite"/>
    <clipPath id="${id}"><ellipse cx="-3" cy="-30" rx="15" ry="11.5"/></clipPath>
    <ellipse cx="-3" cy="-30" rx="15" ry="11.5" fill="#E7CF9C"/>
    <g clip-path="url(#${id})" stroke="#6B4E36" stroke-width="3.4" fill="none"><path d="M-22 -36Q-3 -31 16 -36"/><path d="M-22 -28Q-3 -23 16 -28"/><path d="M-22 -20Q-3 -15 16 -20"/></g>
    <ellipse cx="-3" cy="-30" rx="15" ry="11.5" fill="none" stroke="${INK}" stroke-width="1.9"/>
    <path d="M8 -36C11 -41 12 -45 14 -48" stroke="${INK}" stroke-width="6.5" stroke-linecap="round" fill="none"/><path d="M8 -36C11 -41 12 -45 14 -48" stroke="#E7CF9C" stroke-width="3.6" stroke-linecap="round" fill="none"/>
    <circle cx="15" cy="-51" r="7" fill="#E7CF9C" stroke="${INK}" stroke-width="1.9"/><path d="M10 -56Q15 -53 20 -56" stroke="#6B4E36" stroke-width="2.4" fill="none"/>
    <circle cx="17.5" cy="-51.5" r="1.5" fill="${INK}"/><path d="M21.5 -50.5L26 -49.5L21.5 -48Z" fill="#4A3A2E"/></g>${leg('#8A7A6A', 0)}</g>`;
}
// Approved kangaroo model: ~102 map units tall, 80% of the crowned adult emu.
const ROO_SCALE = 0.830894;
const ROO_HOP_MS = 1100;
const ROO_LIFTOFF = .26;
const ROO_TOUCHDOWN = .76;
// phase, hip x/y, torso pitch, knee x/y, hock x/y, foot/tail/arm angles
const ROO_POSES = [
[0,-6,-37,0,15,-21,-11,-4,0,0,0],
[.14,-9,-28,9,17,-19,-11,-4,0,-3,8],
[.25,0,-49,14,6,-27,-7,-13,18,-8,-8],
[.32,0,-43,12,-2,-24,-19,-8,32,-11,-12],
[.51,-3,-37,7,18,-28,1,-15,8,0,-5],
[.67,-4,-38,3,22,-24,11,-7,-8,5,8],
[.76,-6,-37,0,15,-21,-11,-4,0,4,7],
[.85,-9,-28,7,17,-19,-11,-4,0,-2,11],
[1,-6,-37,0,15,-21,-11,-4,0,0,0]];
// phase, mid-tail bend, delayed tip displacement
const ROO_TAIL_POSES = [[0,0,0],[.14,-2,-3],[.28,5,10],[.48,-5,-12],[.64,-2,-5],[.76,-1,-4],[.85,-2,-5],[.94,1,-1],[1,0,0]];

// Monotone cubic Hermite interpolation avoids stopping at each intermediate pose.
function rooValues(poses, phase) {
  let i = 0;
  while (i < poses.length - 2 && phase > poses[i + 1][0]) i++;
  const a = poses[i], b = poses[i + 1], duration = b[0] - a[0];
  const t = Math.max(0, Math.min(1, (phase - a[0]) / duration)), t2 = t * t, t3 = t2 * t;
  const slope = (j, k) => {
    if (j === 0 || j === poses.length - 1) return 0;
    const x = poses[j - 1], y = poses[j], z = poses[j + 1];
    const u = (y[k] - x[k]) / (y[0] - x[0]), v = (z[k] - y[k]) / (z[0] - y[0]);
    return u * v <= 0 ? 0 : 2 * u * v / (u + v);
  };
  return a.slice(1).map((value, k) => (2 * t3 - 3 * t2 + 1) * value
    + (t3 - 2 * t2 + t) * duration * slope(i, k + 1)
    + (-2 * t3 + 3 * t2) * b[k + 1]
    + (t3 - t2) * duration * slope(i + 1, k + 1));
}
function rooTravel(phase) {
  return Math.max(0, Math.min(1, (phase - ROO_LIFTOFF) / (ROO_TOUCHDOWN - ROO_LIFTOFF)));
}
function rooLift(phase) {
  const t = rooTravel(phase);
  return phase > ROO_LIFTOFF && phase < ROO_TOUCHDOWN ? -35 * 4 * t * (1 - t) : 0;
}
function rooTailOutline(points) {
  let d = `M${points[0][0]} ${points[0][1]}`;
  const n = points.length, at = (i) => points[(i + n) % n];
  for (let i = 0; i < n; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), e = at(i + 2);
    d += `C${b[0] + (c[0] - a[0]) / 6} ${b[1] + (c[1] - a[1]) / 6}`
      + ` ${c[0] - (e[0] - b[0]) / 6} ${c[1] - (e[1] - b[1]) / 6} ${c[0]} ${c[1]}`;
  }
  return d + 'Z';
}
function rooTailContours(phase) {
  const [bend, tip] = rooValues(ROO_TAIL_POSES, phase);
  const B = [-12, 3], C = [-37, 12 + bend];
  const D = [-63 + tip * .1, 39 + bend * .8 + tip * .25], T = [-84 + tip * .2, 33 + tip];
  const top = [], bottom = [], shadeA = [], shadeB = [];
  // A tapered ribbon around a cubic centreline; the tip lags the mid-tail.
  for (let i = 0; i <= 20; i++) {
    const t = i / 20, u = 1 - t;
    const x = u * u * u * B[0] + 3 * u * u * t * C[0] + 3 * u * t * t * D[0] + t * t * t * T[0];
    const y = u * u * u * B[1] + 3 * u * u * t * C[1] + 3 * u * t * t * D[1] + t * t * t * T[1];
    const dx = 3 * u * u * (C[0] - B[0]) + 6 * u * t * (D[0] - C[0]) + 3 * t * t * (T[0] - D[0]);
    const dy = 3 * u * u * (C[1] - B[1]) + 6 * u * t * (D[1] - C[1]) + 3 * t * t * (T[1] - D[1]);
    const length = Math.hypot(dx, dy), nx = -dy / length, ny = dx / length;
    const width = 10 * Math.pow(u, 1.15) + .75;
    top.push([x + nx * width, y + ny * width]);
    bottom.push([x - nx * width, y - ny * width]);
    if (i > 1) {
      shadeA.push([x - nx * width * .08, y - ny * width * .08]);
      shadeB.push([x - nx * width * .65, y - ny * width * .65]);
    }
  }
  return { skin: rooTailOutline(top.concat(bottom.reverse())), shade: rooTailOutline(shadeA.concat(shadeB.reverse())) };
}
function rooSVG(dark = false) {
  const color = dark ? '#926C50' : '#BF875D', shade = dark ? '#77563F' : '#A46B49';
  const belly = dark ? '#D6BE9C' : '#EBD3AD';
  return `<g data-lift><g data-far fill="${shade}" stroke="#17262b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path data-shin/>
    <path data-foot/>
    <path data-haunch/>
    </g>
    <g data-torso><g data-tail><path data-tail-skin d="M-19 0C-36 7 -45 21 -63 29C-73 34 -79 33 -83 31C-86 29 -88 32 -83 35C-67 44 -44 28 -24 21C-17 20 -12 16 -10 10Z" fill="${color}" stroke="#17262b" stroke-width="1.7" stroke-linejoin="round"/>
    <path data-tail-shade d="M-29 15C-47 25 -65 37 -79 34C-65 35 -45 20 -33 14Z" fill="${shade}" opacity=".5"/>
    </g>
    <g data-far-arm><path d="M10 -40C13 -41 16 -37 18 -33L21 -26L22.4 -22.5Q22.8 -20.9 21.6 -20.6L20.7 -22Q21 -20 19.6 -20.3Q17.9 -20.9 17.8 -23L16 -28.5L12 -34.4Z" fill="${shade}" stroke="#17262b" stroke-width="1.35" stroke-linejoin="round"/></g>
    <path d="M-22 9C-31 4 -31 -9 -25 -22C-20 -35 -11 -43 -2 -49C4 -54 7 -59 13 -58C20 -57 20 -51 16 -45C11 -37 15 -25 12 -14C11 2 2 14 -12 15C-17 16 -20 14 -22 9Z" fill="${color}" stroke="#17262b" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M10 -47C9 -38 14 -28 7 -17C3 -10 -2 -7 -10 -6C-14 -5 -17 -6 -15 -9C-11 -16 -11 -25 -6 -34C0 -42 6 -46 10 -47Z" fill="${belly}"/>
    <g data-head><path d="M10 -62C3 -68 0 -77 3 -82C7 -88 13 -74 16 -64Q14 -61 10 -62Z" fill="${shade}" stroke="#17262b" stroke-width="1.5"/>
    <path d="M17 -64C17 -75 23 -85 27 -83C34 -80 28 -67 23 -61Z" fill="${color}" stroke="#17262b" stroke-width="1.5"/>
    <path d="M20 -66C20 -73 24 -80 26 -80C28 -77 25 -69 23 -66Z" fill="#D8A78D"/>
    <path d="M6 -58C7 -66 19 -69 26 -63C28 -60 30 -58 33.5 -57C37.5 -55 38.5 -51 35.5 -49C32.5 -47 28.5 -49 26 -49C20 -45 12 -46 8 -51Q5 -54 6 -58Z" fill="${color}" stroke="#17262b" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M25 -55C30 -55 33.5 -54 35.5 -52C36.5 -49 32.5 -48 28.5 -50L24 -51Z" fill="${belly}"/>
    <path d="M33.5 -56C36.5 -56 38.5 -54 36.5 -52C34.5 -51 32.5 -53 33.5 -56Z" fill="#45352C"/>
    <circle cx="23" cy="-59" r="2.55" fill="#443127"/>
    <circle cx="23.7" cy="-59.9" r=".85" fill="#fff5df"/>
    <path d="M20 -63Q23 -64.3 25.5 -62.8" stroke="${shade}" stroke-width=".85" fill="none" stroke-linecap="round"/>
    <path d="M30 -51Q32.5 -48.5 34.5 -50" stroke="#684936" stroke-width=".8" fill="none" stroke-linecap="round"/>
    </g>
    <g data-arm><path d="M7 -38C10 -40 13 -38 15 -34L18 -28L20 -22.5L20.4 -19.6Q20.3 -17.8 19 -18.3L18.5 -20Q18.8 -17.3 17.3 -17.8L16.6 -19.4Q16.8 -17.8 15.6 -18.4C14.3 -19.8 14.4 -21.4 14.5 -23.2L12 -28.4L8.3 -32.2Q5.4 -35 7 -38Z" fill="${color}" stroke="#17262b" stroke-width="1.45" stroke-linejoin="round"/><path d="M9 -36.5Q12.2 -33.3 14.3 -29.3L17.1 -23.4" fill="none" stroke="${shade}" stroke-width="1.1" stroke-linecap="round"/><path d="M14.8 -22Q17 -22.7 20 -22.1" fill="none" stroke="${shade}" stroke-width=".7" stroke-linecap="round"/></g>
    </g><g data-near fill="${color}" stroke="#17262b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path data-shin/>
    <path data-foot/>
    <path data-haunch/>
    <path data-fold fill="none" stroke="${shade}" stroke-width="1.1"/>
    </g>
    </g>`;
}
function bindRoo(el) {
  const model = el.querySelector('.roo-model'), find = (name) => model.querySelector(`[data-${name}]`);
  return {
    lift: find('lift'), torso: find('torso'), tail: find('tail'), tailSkin: find('tail-skin'), tailShade: find('tail-shade'),
    head: find('head'), arm: find('arm'), farArm: find('far-arm'),
    legs: ['far', 'near'].map((name) => {
      const leg = find(name), part = (name) => leg.querySelector(`[data-${name}]`);
      return { shin: part('shin'), foot: part('foot'), haunch: part('haunch'), fold: part('fold') };
    }),
  };
}
function drawRoo(r, p) {
  const [hx, hy, pitch, kx, ky, ax, ay, fa, ta, aa] = rooValues(ROO_POSES, p), up = rooLift(p);
  r.lift.setAttribute('transform',`translate(0 ${up})`);
  r.torso.setAttribute('transform',`translate(${hx} ${hy}) rotate(${pitch-1.5})`);
  r.tail.setAttribute('transform',`rotate(${ta*.65} -16 5)`);
  r.head.setAttribute('transform',`rotate(${-pitch*.45} 10 -55)`);
  r.arm.setAttribute('transform',`rotate(${aa} 10 -37)`);
  r.farArm.setAttribute('transform',`rotate(${aa*.7} 10 -40)`);
  const tail = rooTailContours(p);
  r.tailSkin.setAttribute('d',tail.skin);
  r.tailShade.setAttribute('d',tail.shade);
  r.legs.forEach((g, i) => {
    const dx = i ? 0 : -6, dy = i ? 0 : -2;
    const H = [hx + dx, hy + dy], K = [kx + dx, ky + dy], A = [ax + dx, ay + dy];
    g.shin.setAttribute('d',`M${K[0]-4} ${K[1]-2}Q${K[0]+2} ${K[1]+5} ${A[0]+3} ${A[1]+3}L${A[0]-3} ${A[1]+1}Q${K[0]-7} ${K[1]+7} ${K[0]-4} ${K[1]-2}Z`);
    const foot = g.foot;foot.setAttribute('d',`M${A[0]-3} ${A[1]-2}Q${A[0]+1} ${A[1]-4} ${A[0]+7} ${A[1]-1}L${A[0]+26} ${A[1]+1}Q${A[0]+30} ${A[1]+2} ${A[0]+27} ${A[1]+4}L${A[0]-2} ${A[1]+4}Q${A[0]-6} ${A[1]+3} ${A[0]-3} ${A[1]-2}Z`);foot.setAttribute('transform',`rotate(${fa} ${A[0]} ${A[1]})`);
    g.haunch.setAttribute('d',`M${H[0]-16} ${H[1]-7}C${H[0]-24} ${H[1]-1} ${H[0]-19} ${H[1]+11} ${H[0]-7} ${H[1]+15}C${K[0]-5} ${K[1]+9} ${K[0]+5} ${K[1]+7} ${K[0]+5} ${K[1]}C${K[0]+4} ${K[1]-6} ${H[0]+4} ${H[1]-9} ${H[0]-8} ${H[1]-10}Q${H[0]-14} ${H[1]-10} ${H[0]-16} ${H[1]-7}Z`);
    const fold = g.fold;if(fold)fold.setAttribute('d',`M${H[0]-12} ${H[1]-3}Q${H[0]-7} ${H[1]-8} ${H[0]-1} ${H[1]-5}`);
  });
}
function koalaSVG() {
  return `<g transform="translate(-4 -2)">
    <path d="M-20 12C-8 6 8 6 20 12" stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M-20 12C-8 6 8 6 20 12" stroke="#8A5A35" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="-12" cy="-8" r="8" fill="#A7AFB4" stroke="${INK}" stroke-width="1.8"/><circle cx="-12" cy="-8" r="4.4" fill="#EEF0F1"/>
    <circle cx="12" cy="-8" r="8" fill="#A7AFB4" stroke="${INK}" stroke-width="1.8"/><circle cx="12" cy="-8" r="4.4" fill="#EEF0F1"/>
    <ellipse cx="0" cy="0" rx="12.5" ry="11" fill="#A7AFB4" stroke="${INK}" stroke-width="1.8"/>
    <ellipse cx="-8" cy="11" rx="4.6" ry="3.4" fill="#A7AFB4" stroke="${INK}" stroke-width="1.6"/><ellipse cx="8" cy="11" rx="4.6" ry="3.4" fill="#A7AFB4" stroke="${INK}" stroke-width="1.6"/>
    <g class="blink"><circle cx="-5" cy="-2" r="1.7" fill="${INK}"/><circle cx="5" cy="-2" r="1.7" fill="${INK}"/></g>
    <ellipse cx="0" cy="3" rx="3.8" ry="5" fill="#2E2A2A"/><circle cx="-1" cy="1" r="1" fill="#fff" opacity=".6"/>
  </g>`;
}
function pelican() {
  return `<g><path d="M-22 0L-14 -4L-14 4Z" fill="#2E3B3A"/><ellipse rx="16" ry="9" fill="#FBFAF4" stroke="${INK}" stroke-width="1.8"/><path d="M-12 -7C-4 -10 6 -9 10 -5M-12 7C-4 10 6 9 10 5" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="14" cy="0" r="5" fill="#FBFAF4" stroke="${INK}" stroke-width="1.6"/><path d="M17 -2.4L36 -1L36 1L17 2.4Z" fill="#F2A65A" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="15" cy="-2.5" r=".9" fill="${INK}"/><circle cx="15" cy="2.5" r=".9" fill="${INK}"/></g>`;
}
function duck(col = '#8A6A4A') {
  return `<g><ellipse rx="8" ry="5" fill="${col}" stroke="${INK}" stroke-width="1.3"/><path d="M-8 0L-12 -2L-12 2Z" fill="${col}" stroke="${INK}" stroke-width="1"/><circle cx="7" cy="0" r="3.6" fill="#2E7D4F" stroke="${INK}" stroke-width="1.2"/><path d="M10 -1.2L13.5 0L10 1.2Z" fill="#F2B63D"/></g>`;
}
function animals() {
  const low = 'M436 949C560 966 760 960 960 944C1160 960 1330 966 1446 946';
  const walker = (inner, begin, shadow = 12, dur = 64) => `<g class="emu"><animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${low}" keyPoints="0;1;1;0;0" keyTimes="0;.46;.5;.96;1" calcMode="linear"/>
    <ellipse rx="${shadow}" ry="${f(shadow / 4.5)}" fill="#2B3A1C" opacity=".22"/><g><animateTransform attributeName="transform" type="scale" values="1 1;-1 1;1 1" keyTimes="0;.48;.98" calcMode="discrete" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>${inner}</g></g>`;
  return `<g>
    <g><animateMotion dur="26s" repeatCount="indefinite" path="M200 578A100 48 0 1 1 400 578A100 48 0 1 1 200 578" rotate="auto"/><g transform="scale(1.1)">${pelican()}</g></g>
    <g><animateMotion dur="19s" begin="-4s" repeatCount="indefinite" path="M182 548A58 26 0 1 0 298 548A58 26 0 1 0 182 548" rotate="auto"/>${duck()}</g>
    <g><animateMotion dur="19s" begin="-5.2s" repeatCount="indefinite" path="M182 548A58 26 0 1 0 298 548A58 26 0 1 0 182 548" rotate="auto"/>${duck('#9A7A58')}</g>
    ${walker(`<g transform="scale(.82)">${emuAdult(.9, 0)}</g>`, -12, 26)}
    ${walker(`<g transform="scale(.82)">${emuChick(.5, 0)}</g>`, -9.6)}
    ${walker(`<g transform="scale(.76)">${emuChick(.5, -.2)}</g>`, -8)}
    ${[false, true].map((dark) => `<g class="roo" visibility="hidden"><ellipse class="rooshadow" rx="${22 * ROO_SCALE / .55}" ry="${5 * ROO_SCALE / .55}" fill="#2B3A1C" opacity=".2"/><g class="rooflip"><g class="roo-model" transform="scale(${ROO_SCALE})">${rooSVG(dark)}</g></g></g>`).join('')}
  </g>`;
}
function wildlife() {
  // a flock of galahs crossing the park now and then (top view)
  const flock = [[0, 0], [-34, -22], [-30, 26], [-66, 4]].map(([x, y], i) => `<g transform="translate(${x} ${y}) scale(1.35)">${tbird(SPECIES.galah[0], true)}</g>`).join('');
  return `<g><animateMotion dur="42s" begin="2s" repeatCount="indefinite" rotate="auto" path="M-400 860C200 700 700 820 1100 600C1500 380 1900 420 2500 240"/>${flock}</g>`;
}
function clouds() {
  return [[300, 0, 110], [700, -40, 140], [180, -75, 120]].map(([y, b, d]) => `<g class="drift" style="animation-duration:${d}s;animation-delay:${b}s"><ellipse cx="0" cy="${y}" rx="300" ry="160" fill="url(#cloud)"/><ellipse cx="190" cy="${y + 40}" rx="220" ry="130" fill="url(#cloud)"/></g>`).join('');
}

/* ================= pins and labels ================= */
function pin(o, i) {
  const [x, y] = o.pin;
  return `<g transform="translate(${x} ${y})">
    <ellipse class="pinshadow" rx="${f(12 * o.s)}" ry="${f(4.5 * o.s)}" fill="#2B3A1C" opacity=".3"/>
    <g class="pindrop" style="animation-delay:${.45 + i * .14}s"><g class="pinbob" style="animation-delay:${-i * .7}s"><g class="pinpop hit" data-opt="${o.id}"><g transform="scale(${o.s})">
      <path d="M0 0C-4 -10 -26 -26 -26 -48A26 26 0 1 1 26 -48C26 -26 4 -10 0 0Z" fill="${o.c}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M10 -26C18 -32 22 -40 22 -48A22 22 0 0 0 19 -59" fill="none" stroke="${o.d}" stroke-width="4" stroke-linecap="round" opacity=".55"/>
      <circle cy="-48" r="20.5" fill="#FFF7E6" stroke="${INK}" stroke-width="2.2"/>
      <g transform="translate(0 -48) scale(.9)">${ICON[o.id](o.c)}</g>
    </g></g></g></g></g>`;
}
function label(o, i) {
  // a national park sign on two posts: dark brown board, golden line inside the edge, golden letters; drawn to the text's width by signShape()
  const [x, y] = o.lab;
  return `<g transform="translate(${x} ${y})"><g class="lab hit" data-opt="${o.id}" tabindex="0" role="link" aria-label="${o.name}" style="--c:${o.c};animation-delay:${1 + i * .1}s">
    <g class="sign"></g><text y="9" text-anchor="middle" font-size="25" style="font-family:'Land Sign',sans-serif">${o.name}</text></g></g>`;
}
function signShape(w) {
  const h = 48, grain = [[-.28, .6], [-.05, 1], [.2, .8], [.36, .5]].map(([y, a]) => { const yy = f(y * h); return `<path d="M${f(-w / 2 + 6)} ${yy}C${f(-w / 4)} ${f(yy - 1.6)} ${f(w / 4)} ${f(+yy + 1.6)} ${f(w / 2 - 6)} ${yy}" stroke="#3A2414" stroke-width="1.1" fill="none" opacity="${f(.6 * a)}"/>`; }).join('');
  return `<rect x="${f(-w / 2 + 16)}" y="12" width="9" height="30" fill="#4A2E1A" stroke="${INK}" stroke-width="2.6"/><rect x="${f(w / 2 - 25)}" y="12" width="9" height="30" fill="#4A2E1A" stroke="${INK}" stroke-width="2.6"/>
    <rect class="board" x="${f(-w / 2)}" y="${-h / 2}" width="${f(w)}" height="${h}" rx="9" stroke="${INK}" stroke-width="3"/>${grain}
    <rect class="line" x="${f(-w / 2 + 5)}" y="${-h / 2 + 5}" width="${f(w - 10)}" height="${h - 10}" rx="6" fill="none" stroke-width="2"/>`;
}
// the compass rose with the scale bar under it: an overlay in the bottom left corner of the window (#compass in #wrap, like the name badge), not part of the map
function compass() {
  const L = (x, y, s) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="16" font-weight="800" fill="${INK}" style="font-family:'Land Head',sans-serif">${s}</text>`;
  const seg = [0, 1, 2, 3].map((i) => `<rect x="${12 + i * 29}" y="148" width="29" height="9" fill="${i % 2 ? '#FFF3DA' : INK}" stroke="${INK}" stroke-width="2"/>`).join('');
  const T = (x, s, a) => `<text x="${x}" y="176" text-anchor="${a}" font-size="13" font-weight="600" fill="${INK}" style="font-family:'Land Text',sans-serif">${s}</text>`;
  return `<svg viewBox="0 0 140 182" width="140" height="182" aria-hidden="true"><g transform="translate(70 68)"><g class="rose">
    <circle r="46" fill="#FFF3DA" stroke="${INK}" stroke-width="3"/><circle r="38" fill="none" stroke="#C9B58C" stroke-width="1.6" stroke-dasharray="2 4"/>
    <path d="M0 -40L7 -7L0 0Z" fill="${O.custom.c}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M0 -40L-7 -7L0 0Z" fill="#F7A57D" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M0 40L7 7L0 0Z" fill="${INK}"/><path d="M0 40L-7 7L0 0Z" fill="#53626A"/>
    <path d="M40 0L7 -7L0 0ZM-40 0L-7 7L0 0Z" fill="${INK}"/><path d="M40 0L7 7L0 0ZM-40 0L-7 -7L0 0Z" fill="#53626A"/>
    <circle r="4" fill="#FFF3DA" stroke="${INK}" stroke-width="1.6"/>
    <g paint-order="stroke" stroke="#FFF3DA" stroke-width="4" stroke-linejoin="round">${L(0, -52, 'N')}${L(0, 64, 'S')}${L(60, 6, 'E')}${L(-60, 6, 'W')}</g></g></g>
    ${seg}${T(12, '0 m', 'start')}${T(70, '50 m', 'middle')}${T(128, '100 m', 'end')}</svg>`;
}

/* ================= animals peeking out of the bushes ================= */
// Head (centred on 0 0, about 24 units wide) and a body below it that stays hidden behind the bush.
// paw: colour of the two paws that grip the bush's edge (null for birds);
// lift: how much higher it comes up over the top edge (the platypus's bill, the cassowary's neck);
// feet: 'web' for webbed feet, 'claws' for paws with short curved claws, instead of plain paws.
const eyes = (x = 5, y = -2, r = 1.7, glint = false) => `<g class="blink">${[-x, x].map((cx) => `${glint ? `<circle cx="${cx}" cy="${y}" r="${r + 1}" fill="#F4EFE4"/>` : ''}<circle cx="${cx}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${cx + .5}" cy="${y - .6}" r="${f(r * .35)}" fill="#fff"/>`).join('')}</g>`;
const ear = (x, y, r, col, inner) => [-x, x].map((cx) => `<circle cx="${cx}" cy="${y}" r="${r}" fill="${col}" stroke="${INK}" stroke-width="1.6"/><circle cx="${cx}" cy="${y}" r="${f(r * .5)}" fill="${inner}"/>`).join('');
const body = (col, rx = 14, ry = 13) => `<ellipse cy="18" rx="${rx}" ry="${ry}" fill="${col}" stroke="${INK}" stroke-width="1.6"/>`;
const PEEKERS = {
  // wombat: a broad, domed head with chubby cheeks and small rounded ears, small eyes set wide, a pale muzzle round a big rounded nose, whiskers; clawed paws
  wombat: { paw: '#7A6A5E', feet: 'claws', svg: () => `${body('#6F6055', 16, 14)}<path d="M-7 9L0 14L7 9L5 15L0 18L-5 15Z" fill="#CDBFAF"/>
    ${[-1, 1].map((d) => `<path d="M${d * 5} -10.6C${d * 6.4} -14.8 ${d * 9} -16.6 ${d * 10.4} -15.6C${d * 12} -14.2 ${d * 12.4} -11.2 ${d * 11.8} -8.2Z" fill="#7A6A5E" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M${d * 7} -10.6C${d * 7.8} -13.2 ${d * 9.2} -14.2 ${d * 10} -13.6C${d * 10.8} -12.6 ${d * 10.8} -10.8 ${d * 10.4} -9.2Z" fill="#E3A3A3"/>`).join('')}
    <path d="M0 -12C7.6 -12 12.4 -8 13.4 -2.4C14.4 3.4 11 9.6 0 10.6C-11 9.6 -14.4 3.4 -13.4 -2.4C-12.4 -8 -7.6 -12 0 -12Z" fill="#7F6F62" stroke="${INK}" stroke-width="1.8"/>
    <ellipse cx="0" cy="4" rx="7.4" ry="5.4" fill="#BFAE9C"/>${eyes(6.2, -2.6, 1.6)}
    <path d="M-4.6 1.2C-4.6 -1.2 4.6 -1.2 4.6 1.2C4.6 3.2 2.2 4.6 0 4.6C-2.2 4.6 -4.6 3.2 -4.6 1.2Z" fill="#4A3B35" stroke="${INK}" stroke-width="1"/><ellipse cx="-1.4" cy=".6" rx="1" ry=".6" fill="#fff" opacity=".45"/>
    <path d="M0 4.6V5.6M-2.4 6C-1.2 7.2 1.2 7.2 2.4 6" stroke="${INK}" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <path d="M-5.4 4.6L-10 4M-5.4 5.6L-9.6 6.4M5.4 4.6L10 4M5.4 5.6L9.6 6.4" stroke="#8C7C6E" stroke-width=".5" stroke-linecap="round"/>` },
  // cassowary, in profile facing right: a tall brown casque, blue head, pale pinkish bill, orange eye, blue neck with a red collar and red wattles, shaggy black body
  cassowary: { paw: null, lift: 10, svg: () => `<path d="M-16 34C-16 26 -8 22 0 22C8 22 16 26 16 34L13 33L12 37L8 34L6 38L2 35L0 39L-3 35L-6 38L-8 34L-12 37L-13 33Z" fill="#33383F" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M-5 30C-5.6 22 -4.6 12 -3 3.4H4.6C5 12 5.4 22 5 30Z" fill="#2F6FC4" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M-4.6 14H5.2V22.6H-4.8Z" fill="#C8302B"/><path d="M-4.6 14H5.2M-4.8 22.6H5.2" stroke="${INK}" stroke-width="1"/>
    <path d="M4.6 9C8 10.6 9.4 14.6 8 19.6C6.6 16.4 5 13.6 4.4 11ZM3.4 10.6C5.8 13.4 6.2 18 4.2 22.4C3 19 2.6 15 3 12Z" fill="#D7322B" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M-4.4 -5.6C-5.4 -13.6 -1.6 -19.2 2.6 -18.4C6.2 -17.6 6.6 -11.6 4.4 -5.6Z" fill="#8E7068" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M-1.6 -8C-2 -12.6 -.4 -15.8 2 -16" stroke="#B0938A" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M-6 0C-6 -5.6 -2.4 -7.6 1.6 -7.6C5.6 -7.6 8 -5 8 -1C8 3 5 5 1 5C-3 5 -6 3 -6 0Z" fill="#3F86DA" stroke="${INK}" stroke-width="1.8"/>
    <path d="M2.6 -6C5.6 -5.8 7.6 -3.6 7.8 -.6C7 1.8 5 3.4 2.4 3.6C3.4 1 3.6 -3 2.6 -6Z" fill="#7FC0EE"/>
    <path d="M6.6 -2.4C10 -2.6 13.6 -1.4 16 .6C13 1.6 9.8 2.6 6.6 2.8Z" fill="#CFA9A2" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><path d="M7.4 .6H13.4" stroke="${INK}" stroke-width=".7" stroke-linecap="round"/>
    <g class="blink"><circle cx="2.8" cy="-2.6" r="2.1" fill="#E39A32" stroke="${INK}" stroke-width=".9"/><circle cx="3" cy="-2.6" r="1.1" fill="${INK}"/><circle cx="3.4" cy="-3" r=".4" fill="#fff"/></g>` },
  // Tasmanian devil: big rounded pink-lined ears, a round black head, a grey-brown snout, brown eyes, an open mouth with fangs and a pink tongue, the white chest blaze
  devil: { paw: '#2E2E33', feet: 'claws', svg: () => `${body('#26262B')}<path d="M-9 12.6L0 16.4L9 12.6L6.4 16.4L0 19.6L-6.4 16.4Z" fill="#F4F1EA"/>
    ${[-1, 1].map((d) => `<g transform="translate(${d * 8.4} -10.4) rotate(${d * 16})"><path d="M0 -7.6C3.4 -7.6 4.8 -3 4.6 .6C4.4 3.6 2.6 5.4 0 5.4C-2.6 5.4 -4.4 3.6 -4.6 .6C-4.8 -3 -3.4 -7.6 0 -7.6Z" fill="#2E2E33" stroke="${INK}" stroke-width="1.6"/><path d="M0 -5.2C2 -5.2 2.8 -2.4 2.6 .4C2.4 2.6 1.4 3.6 0 3.6C-1.4 3.6 -2.4 2.6 -2.6 .4C-2.8 -2.4 -2 -5.2 0 -5.2Z" fill="#E79A9A"/></g>`).join('')}
    <path d="M0 -10C6.4 -10 11.4 -7 12.6 -2C13.6 2.6 10.6 9.4 0 10C-10.6 9.4 -13.6 2.6 -12.6 -2C-11.4 -7 -6.4 -10 0 -10Z" fill="#323238" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M-5.6 3.4C-5.6 -.4 5.6 -.4 5.6 3.4C5.6 6.6 3 8.6 0 8.6C-3 8.6 -5.6 6.6 -5.6 3.4Z" fill="#6A5F5C"/>
    <g class="blink">${[-1, 1].map((d) => `<circle cx="${d * 5}" cy="-2.4" r="2.3" fill="#6B4024" stroke="${INK}" stroke-width=".9"/><circle cx="${d * 5}" cy="-2.4" r="1.2" fill="${INK}"/><circle cx="${d * 5 + .6}" cy="-3" r=".6" fill="#fff"/>`).join('')}</g>
    <path d="M-2.6 1.6C-2.6 .2 2.6 .2 2.6 1.6C2.6 3 1.2 3.8 0 3.8C-1.2 3.8 -2.6 3 -2.6 1.6Z" fill="#251E20"/><circle cx="-.9" cy="1.1" r=".5" fill="#fff" opacity=".6"/>
    <path d="M-3.8 5.2C-3 8.8 3 8.8 3.8 5.2C2 5.9 -2 5.9 -3.8 5.2Z" fill="#5A1F24" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/><path d="M-1.6 7.4C-.8 6.6 .8 6.6 1.6 7.4C.8 8 -.8 8 -1.6 7.4Z" fill="#E9707A"/>
    <path d="M-3 5.4L-2.4 6.9L-1.8 5.6ZM3 5.4L2.4 6.9L1.8 5.6Z" fill="#fff"/>` },
  // dingo: orange head, broad at the brow, flaring to pointed cheek fur and narrowing to the chin; a cream lower face that wraps the cheeks, cream brow spots, big ears with cream inside, round dark eyes, a small dark nose and a smile; cream chest
  dingo: { paw: '#F2A03D', svg: () => `${body('#F2A03D', 12, 12)}<path d="M-8 8C-4 12 4 12 8 8C8 14 4.6 19 0 20C-4.6 19 -8 14 -8 8Z" fill="#F8E6C8"/>
    ${[-1, 1].map((d) => `<path d="M${d * 3} -8.4C${d * 5} -12.6 ${d * 7.6} -16.4 ${d * 9.6} -17.6C${d * 11.6} -15 ${d * 12.6} -9 ${d * 12} -3.4Z" fill="#F2A03D" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M${d * 5.4} -8.4C${d * 6.8} -11.4 ${d * 8.2} -13.6 ${d * 9.4} -14.4C${d * 10.6} -12.4 ${d * 11} -8.6 ${d * 10.6} -5.4Z" fill="#F8E6C8"/>`).join('')}
    <path d="M0 -10C6.4 -10 10.6 -8 11.6 -4.4C12.2 -2 12.8 0 14 2.2C11.6 3 10 5 7.6 7.4C5.4 9.4 2.6 10.4 0 10.4C-2.6 10.4 -5.4 9.4 -7.6 7.4C-10 5 -11.6 3 -14 2.2C-12.8 0 -12.2 -2 -11.6 -4.4C-10.6 -8 -6.4 -10 0 -10Z" fill="#F2A03D"/>
    <path d="M-13 .8C-9 -.6 -5 -.4 -2.6 -2.4C-1.2 -3.4 1.2 -3.4 2.6 -2.4C5 -.4 9 -.6 13 .8C13.3 1.3 13.6 1.8 14 2.2C11.6 3 10 5 7.6 7.4C5.4 9.4 2.6 10.4 0 10.4C-2.6 10.4 -5.4 9.4 -7.6 7.4C-10 5 -11.6 3 -14 2.2C-13.6 1.8 -13.3 1.3 -13 .8Z" fill="#F8E6C8"/>
    <path d="M0 -10C6.4 -10 10.6 -8 11.6 -4.4C12.2 -2 12.8 0 14 2.2C11.6 3 10 5 7.6 7.4C5.4 9.4 2.6 10.4 0 10.4C-2.6 10.4 -5.4 9.4 -7.6 7.4C-10 5 -11.6 3 -14 2.2C-12.8 0 -12.2 -2 -11.6 -4.4C-10.6 -8 -6.4 -10 0 -10Z" fill="none" stroke="${INK}" stroke-width="1.8"/>
    <ellipse cx="-4.4" cy="-6.6" rx="1.6" ry="1.1" fill="#F8E6C8"/><ellipse cx="4.4" cy="-6.6" rx="1.6" ry="1.1" fill="#F8E6C8"/>${eyes(4.6, -3.6, 1.8)}
    <path d="M-2.4 1.2C-2.4 -.2 2.4 -.2 2.4 1.2C2.4 2.6 1 3.4 0 3.4C-1 3.4 -2.4 2.6 -2.4 1.2Z" fill="${INK}"/><circle cx="-.8" cy=".7" r=".5" fill="#fff" opacity=".6"/>
    <path d="M0 3.4V4.4M-2.6 4.6C-1.4 6 1.4 6 2.6 4.6" stroke="${INK}" stroke-width="1.1" fill="none" stroke-linecap="round"/>` },
  // the platypus is always seen from the side (from the front its bill does not read); it grips the edge with webbed feet
  platypus: { paw: '#6B4A31', feet: 'web', lift: 4, svg: () => `<ellipse cx="-2" cy="15" rx="12" ry="11" fill="#7B5236" stroke="${INK}" stroke-width="1.6"/>
    <path d="M-11 2C-12 -6 -5 -10 1 -9.5C6 -9 8.5 -5 8 0C7.5 5 2 8 -4 7.5C-9 7 -11 5 -11 2Z" fill="#8A5C3C" stroke="${INK}" stroke-width="1.8"/>
    <path d="M-8 -3C-6 -7 -1 -8.5 3 -7.5" stroke="#A9764E" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M5.6 -.4C9 -1.4 13 -1.2 16.2 -.2C18.8 .6 21.2 .4 22 2.2C22.8 4.2 20.8 5.6 18.2 5.2C14.2 4.6 10 4.4 6 4Z" fill="#454C4F" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M8 .6C11 -.2 14 -.1 16.4 .8C18.4 1.5 20 1.4 21 2.4" stroke="#6E777A" stroke-width="1.1" fill="none" stroke-linecap="round"/><path d="M6.4 -.8C7.4 .8 7.4 2.6 6.4 4.2" stroke="${INK}" stroke-width="1" fill="none" stroke-linecap="round"/>
    <circle cx="19.6" cy="2" r=".6" fill="#1C2022"/>
    <ellipse cx="1.5" cy="-1.2" rx="2.6" ry="2" fill="#C9A07A"/><g class="blink"><circle cx="1.6" cy="-3.4" r="1.4" fill="${INK}"/><circle cx="2" cy="-3.8" r=".45" fill="#fff"/></g>` },
  // quokka: upright oval ears, a round face that is a little wider at the cheeks, eyes close to a big nose, an open smile
  quokka: { paw: '#9A714E', svg: () => `${body('#A8805C', 13, 12)}<ellipse cx="0" cy="17" rx="7" ry="8" fill="#F1E2CB"/>
    ${[-1, 1].map((d) => `<g transform="translate(${d * 6.6} -10.5) rotate(${d * 14})"><ellipse rx="3.8" ry="5.4" fill="#A8805C" stroke="${INK}" stroke-width="1.6"/><ellipse cy=".6" rx="2" ry="3.4" fill="#E9A2A2"/></g>`).join('')}
    <path d="M0 -10.5C5.6 -10.5 9.2 -8.4 11 -5C12.6 -2 13.6 1 13.2 3.8C12.4 8.4 6.8 10.6 0 10.6C-6.8 10.6 -12.4 8.4 -13.2 3.8C-13.6 1 -12.6 -2 -11 -5C-9.2 -8.4 -5.6 -10.5 0 -10.5Z" fill="#B48A64" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <ellipse cx="0" cy="4.4" rx="6.4" ry="4.6" fill="#CDAA84"/>${eyes(4.4, -1.6, 1.7)}
    <path d="M-2.8 1C-2.8 -.6 2.8 -.6 2.8 1C2.8 2.8 1 3.8 0 3.8C-1 3.8 -2.8 2.8 -2.8 1Z" fill="${INK}"/><circle cx="-.9" cy=".4" r=".6" fill="#fff" opacity=".7"/>
    <path d="M0 3.8V4.8M-3.6 5C-2.4 8 2.4 8 3.6 5Z" fill="${INK}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/><path d="M-1.6 6.8C-.8 5.8 .8 5.8 1.6 6.8C.8 7.4 -.8 7.4 -1.6 6.8Z" fill="#E9707A"/>` },
  // kookaburra, three-quarter view facing right: scruffy streaked crown, brown eye stripe, long two-tone bill, brown shoulder with a blue wing patch
  kookaburra: { paw: null, svg: () => `<ellipse cx="-1" cy="17" rx="11" ry="13" fill="#F1ECE1" stroke="${INK}" stroke-width="1.6"/>
    <path d="M-1 9C5 7.6 11 10 12.5 16C13.5 21 12 26 9 29L2 27C2 21 1 15 -1 9Z" fill="#1F4A5E" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M1 13C6 13 10 15.5 11.6 20C9 21 5 20.5 2.6 19Z" fill="#4FB4C4"/><path d="M-1 9C4 7.8 9 9.6 11 13.4C7.6 14.8 3.4 14.4 .4 13Z" fill="#6B4E38"/>
    <path d="M-9.5 3C-11.5 -1 -11 -5.5 -8.5 -8.5L-12.5 -9.5L-8 -11L-10 -14L-5.2 -12.4C-2 -14 3 -14 6 -11.5C9.5 -8.5 10.5 -4 9.8 0C9 5 4.5 8.4 -1.5 8.4C-5.5 8.4 -8.4 6.4 -9.5 3Z" fill="#F4EFE4" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M-8.6 -8.4C-5 -11.4 1 -12.4 5.4 -10.4C7.6 -9.2 8.8 -7.4 9.2 -5.6C5 -7.4 -2 -7.6 -9.4 -5.2C-9.8 -6.4 -9.4 -7.6 -8.6 -8.4Z" fill="#CFC5B2"/>
    <path d="M-6 -9.6L-3.6 -8M-2 -10.8L0 -8.8M2.4 -11L3.6 -9" stroke="#9C9078" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M5.6 -5.8C2 -6.4 -4 -4.6 -9.6 -1.2C-9.4 .6 -8.8 1.6 -8 2.4C-3 -1.4 2 -2.6 5.6 -2.2Z" fill="#9A5A48"/>
    <circle cx="3.2" cy="-4" r="2.4" fill="${INK}"/><circle cx="3.9" cy="-4.8" r=".8" fill="#fff"/>
    <path d="M5.6 -4.2C11 -4.8 18 -3.6 25 -.8L6.6 .6Z" fill="#1E3B4E" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.6 .6L25 -.8C19 1.8 12 3.6 7 3.6Z" fill="#DCD4C2" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` },
};
const paws = (col) => [-8, 8].map((x) => `<g transform="translate(${x} 0)"><ellipse rx="4.4" ry="3.2" fill="${col}" stroke="${INK}" stroke-width="1.5"/><path d="M-1.8 -1.6V.6M0 -2V.4M1.8 -1.6V.6" stroke="${INK}" stroke-width=".9" stroke-linecap="round"/></g>`).join('');

const clawPaws = (col) => [-8, 8].map((x) => `<g transform="translate(${x} 0)"><path d="M-5 .4C-5 -2.4 -2.6 -3.6 0 -3.6C2.6 -3.6 5 -2.4 5 .4C5 2.2 3 3 0 3C-3 3 -5 2.2 -5 .4Z" fill="${col}" stroke="${INK}" stroke-width="1.5"/><path d="M-1.6 -1V1.4M1.6 -1V1.4" stroke="${INK}" stroke-width=".7" stroke-linecap="round" opacity=".55"/>${[-3.2, -1.1, 1.1, 3.2].map((c) => `<path d="M${f(c - 1)} 2.4C${f(c - .8)} 3.8 ${f(c - .2)} 4.8 ${f(c + .4)} 5C${f(c + .7)} 4.2 ${f(c + .9)} 3.2 ${f(c + .9)} 2.4Z" fill="#3A302C" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/>`).join('')}</g>`).join('');
const webFeet = (col) => [-7.5, 7.5].map((x) => `<g transform="translate(${x} 0)"><path d="M-4.6 -1.6C-4.6 2 -2.6 3.4 0 3.4C2.6 3.4 4.6 2 4.6 -1.6C3 -.6 1.6 -1 0 -2.2C-1.6 -1 -3 -.6 -4.6 -1.6Z" fill="${col}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><path d="M-2.2 .4V2.6M2.2 .4V2.6" stroke="#4A3322" stroke-width=".8" stroke-linecap="round"/></g>`).join('');

function bushLife() {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bushes = [...map.querySelectorAll('.bush')].filter((b) => {
    const [x, y, s] = b.dataset.bush.split(' ').map(Number);
    return x > 20 && x < 1900 && y - 40 * s > 10 && y - 40 * s < 1060;
  });
  const busy = new Map();
  let peekId = 0;
  let last = '';
  const pick = () => { const keys = Object.keys(PEEKERS).filter((k) => k !== last); return (last = keys[Math.floor(Math.random() * keys.length)]); };
  const T = (x, y, r = 0) => `translate(${f(x)}px, ${f(y)}px) rotate(${f(r)}deg)`;

  function peek(bush, quick = false) {
    if (bush.classList.contains('koala')) { // the koala is already sitting there: it bobs
      bush.querySelector('.sitter').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-7px)', easing: 'ease-in' }, { transform: 'translateY(0)' }], { duration: 420 });
      return;
    }
    busy.get(bush)?.();
    const [, , s] = bush.dataset.bush.split(' ').map(Number);
    const kind = pick(), P = PEEKERS[kind], R = 40 * s, k = s * 1.35;
    // up over the top edge; the body stays behind the bush
    const lift = P.lift || 0;
    const ux = (Math.random() - .5) * R * .4, uy = -R * .9 - (8 + lift) * k;
    const hide = [0, (kind === 'cassowary' ? 56 : 46) + lift], half = [0, 11];
    const flip = Math.random() < .5 ? -1 : 1; // faces either way (mirrored)
    const ns = 'http://www.w3.org/2000/svg';
    // the wrapper clips everything below the lower part of the canopy, so a hidden body never shows under the bush
    const wrap = document.createElementNS(ns, 'g'), cid = `peek${++peekId}`;
    wrap.innerHTML = `<clipPath id="${cid}"><rect x="${f(-R * 3)}" y="${f(-R * 4)}" width="${f(R * 6)}" height="${f(R * 4.6)}"/></clipPath>`;
    wrap.setAttribute('clip-path', `url(#${cid})`);
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${f(ux)} ${f(uy)}) scale(${f(k * flip)} ${f(k)})`);
    g.innerHTML = `<g class="pk">${P.svg()}</g>`;
    wrap.appendChild(g); bush.querySelector('.behind').appendChild(wrap);
    let pw = null;
    if (P.paw) {
      pw = document.createElementNS(ns, 'g');
      pw.setAttribute('transform', `translate(${f(ux)} ${f(uy + (10 + lift) * k)}) scale(${f(k)})`);
      pw.innerHTML = `<g class="pk">${P.feet === 'web' ? webFeet(P.paw) : P.feet === 'claws' ? clawPaws(P.paw) : paws(P.paw)}</g>`;
      bush.querySelector('.front').appendChild(pw);
    }
    const pk = g.firstChild, look = 7;
    const dur = still ? 3200 : (quick ? 3600 : 4200) + Math.random() * 2600;
    const frames = still ? [{ transform: T(0, 0) }, { transform: T(0, 0) }] : quick ? [
      { offset: 0, transform: T(...hide), easing: 'cubic-bezier(.2,.8,.3,1.25)' },
      { offset: .1, transform: T(0, 0) },
      { offset: .3, transform: T(0, 0, -look), easing: 'ease-in-out' },
      { offset: .55, transform: T(0, 0, look), easing: 'ease-in-out' },
      { offset: .8, transform: T(0, 0) },
      { offset: .86, transform: T(0, -1.5), easing: 'cubic-bezier(.5,0,.8,.4)' },
      { offset: 1, transform: T(...hide) },
    ] : [ // eyes over the edge first, a careful look, then the whole head; looks around; ducks back
      { offset: 0, transform: T(...hide), easing: 'cubic-bezier(.3,.7,.4,1)' },
      { offset: .12, transform: T(...half), easing: 'ease-in-out' },
      { offset: .2, transform: T(...half, -4), easing: 'ease-in-out' },
      { offset: .28, transform: T(...half, 4), easing: 'cubic-bezier(.2,.8,.3,1.3)' },
      { offset: .36, transform: T(0, 0) },
      { offset: .52, transform: T(0, 0, -look), easing: 'ease-in-out' },
      { offset: .7, transform: T(0, 0, look), easing: 'ease-in-out' },
      { offset: .84, transform: T(0, 0) },
      { offset: .88, transform: T(0, -1.5), easing: 'cubic-bezier(.5,0,.8,.4)' },
      { offset: 1, transform: T(...hide) },
    ];
    const a = pk.animate(frames, { duration: dur, fill: 'both' });
    let pa = null;
    if (pw) {
      const on = still ? 0 : (quick ? .09 : .34), off = still ? 1 : .87;
      pa = pw.firstChild.animate([
        { offset: 0, opacity: 0, transform: T(0, 5) }, { offset: Math.max(on - .02, 0), opacity: 0, transform: T(0, 5) },
        { offset: on + .03, opacity: 1, transform: T(0, 0) }, { offset: off - .02, opacity: 1, transform: T(0, 0) },
        { offset: off + .01, opacity: 0, transform: T(0, 6) }, { offset: 1, opacity: 0, transform: T(0, 6) }], { duration: dur, fill: 'both' });
    }
    const done = () => { a.cancel(); pa?.cancel(); wrap.remove(); pw?.remove(); if (busy.get(bush) === done) busy.delete(bush); };
    busy.set(bush, done);
    a.finished.then(done, () => {});
  }

  for (const b of map.querySelectorAll('.bush')) b.addEventListener('click', () => peek(b, true));
  if (still) return;
  const next = () => setTimeout(() => {
    if (!document.hidden && busy.size < 3) {
      const free = bushes.filter((b) => !busy.has(b) && !b.classList.contains('koala'));
      if (free.length) peek(free[Math.floor(Math.random() * free.length)]);
    }
    next();
  }, 1800 + Math.random() * 3200);
  next();
}

/* ================= the construction site builds its map ================= */
// the tiles drop in one by one (1.5 s apart), the finished map stays for 5 s, then all tiles fade and it starts again from the empty outlines
function siteBuild() {
  const tiles = [...map.querySelectorAll('.sitetile')];
  if (!tiles.length || !tiles[0].animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return; // without motion: the finished map
  const gap = 1500, drop = 1300, hold = 5000, fade = 1400, cycle = tiles.length * gap + hold + fade + 1200;
  const round = () => {
    tiles.forEach((t, i) => {
      t.animate([{ transform: 'translateY(-60px)', opacity: 0 }, { opacity: 1, offset: .35 }, { transform: 'none', opacity: 1 }],
        { duration: drop, delay: 1200 + i * gap, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'backwards' });
      t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fade, delay: cycle - fade, fill: 'forwards' });
    });
    setTimeout(() => { tiles.forEach((t) => t.getAnimations().forEach((a) => a.cancel())); round(); }, cycle);
  };
  round();
}

/* ================= the kangaroos ================= */
// Two kangaroos hop continuously along persistent routes through the open lawn.
// Destinations span the reachable lawn, with straight runs between scenery and
// dry landing places. The emus' lane (along the low path, rounded ends) is an obstacle, so they never cross it.
function roos() {
  const els = [...map.querySelectorAll('.roo')];
  if (!els.length) return;
  const disc = [[960, 402, 150], [650, 622, 106], [1270, 622, 106], [1750, 816, 46], [1452, 840, 34], [1478, 942, 18], [1708, 944, 18], [214, 950, 30], [186, 864, 24], [402, 880, 26], [894, 724, 27], [1026, 724, 27]];
  const box = [[256, 780, 384, 886], [836, 984, 1084, 1080], [1140, 1012, 1214, 1066], [1494, 596, 1562, 662], [535, 885, 585, 915], [1335, 885, 1385, 915], [0, 880, 190, 1080], [1700, 1035, 1920, 1080]];
  const ell = [[1585, 884, 150, 90]];                                        // the construction site
  for (const [x, y, sc] of [[862, 700, .9], [1058, 706, .85], [806, 1020, .8], [1106, 760, .7], [520, 820, .7], [1395, 610, .75], [1880, 900, .8], [470, 470, .6]]) disc.push([x, y, 22 * sc + 4]); // wattle
  for (const t of [[850, 462, 780, 500, 730, 582], [1070, 462, 1140, 500, 1190, 582]]) for (let u = 0; u <= 1; u += .1) {      // the tunnels between the domes
    disc.push([(1 - u) * (1 - u) * t[0] + 2 * u * (1 - u) * t[2] + u * u * t[4], (1 - u) * (1 - u) * t[1] + 2 * u * (1 - u) * t[3] + u * u * t[5], 28]);
  }
  for (const o of OPTS) {
    box.push([o.pin[0] - 34, o.pin[1] - 100, o.pin[0] + 34, o.pin[1] + 6]);                              // the pin
    const hw = 40 + 6.5 * o.name.length; box.push([o.lab[0] - hw, o.lab[1] - 28, o.lab[0] + hw, o.lab[1] + 46]); // the sign
  }
  const canopy = []; // bushes: the head of a kangaroo may reach into a canopy (it stands in front of it), the body may not
  map.querySelectorAll('.bush').forEach((b) => { const [x, y, sc] = b.dataset.bush.split(' ').map(Number); canopy.push([x, y, 40 * sc * .95]); });
  const ns = 'http://www.w3.org/2000/svg', tmp = document.createElementNS(ns, 'g'), stream = [];
  tmp.setAttribute('visibility', 'hidden'); map.appendChild(tmp);
  for (const d of [CREEK, OUT]) {
    const el = document.createElementNS(ns, 'path'); el.setAttribute('d', d); tmp.appendChild(el);
    for (let l = 0, n = el.getTotalLength(); l <= n; l += 10) { const q = el.getPointAtLength(l); if (q.x > -60 && q.x < 1980 && q.y > -60 && q.y < 1140) stream.push([q.x, q.y]); }
  }
  const pondEl = document.createElementNS(ns, 'path'); pondEl.setAttribute('d', blob(292, 578, 196, 118, 21, 12, .12)); tmp.appendChild(pondEl); // the billabong's own outline
  const wet = (x, y) => pondEl.isPointInFill(new DOMPoint(x, y)); // (the hidden group stays in the page: the hit test needs the element to be connected)
  const near = (x, y, m) => disc.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < (r + m) ** 2) || box.some(([a, b, c, d]) => x > a - m && x < c + m && y > b - m && y < d + m)
    || ell.some(([cx, cy, rx, ry]) => ((x - cx) / (rx + m)) ** 2 + ((y - cy) / (ry + m)) ** 2 < 1);
  const under = (x, y, m) => canopy.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < (r + m) ** 2);
  const solid = (x, y, pad = 0) => near(x, y, 12 + pad) || near(x, y - 44, 12 + pad) || near(x, y - 92, 12 + pad) || under(x, y, 12 + pad) || under(x, y - 44, 3 + pad);   // feet, middle and head of a kangaroo
  const inPond = (x, y) => wet(x, y) || [0, 1, 2, 3, 4, 5, 6, 7].some((i) => wet(x + Math.cos(i * .785) * 32, y + Math.sin(i * .785) * 32)); // the water, with a margin of 32
  // The emus' lane is an obstacle of its own (painted below): the strip that the adult emus fill along the low path, from their head down, with rounded ends. It follows the path's curve, so the kangaroos neither cross nor land in it.
  const GRID = 16, ROO_R = 114, LANE_END = 90, LANE_GAP = 140;
  const inside = (x, y) => x > 82 && x < 1838 && y > lawnTopAt(x) + 100 && y < 1000;
  // Everything static is rasterised once (8 px cells, a 4 px wider margin than the exact test so that a cell lookup is never less safe): what a kangaroo may not stand on
  // (scenery, bushes, the billabong with its margin) and the creek (may be jumped, never landed in). The graph and every route test below only read these tables.
  const CELL = 8, GW = Math.ceil(1920 / CELL), GH = Math.ceil(1080 / CELL), blocked = new Uint8Array(GW * GH), creek = new Uint8Array(GW * GH);
  // The obstacles are painted into the table (not tested cell by cell): each one, inflated by the margin, at the three heights of a kangaroo (feet, middle, head: a point of the body
  // lies on the obstacle when the cell lies 0 / 44 / 92 below it).
  const PAD = 4, inCell = (x0, y0, x1, y1, fn) => {
    for (let gy = Math.max(0, Math.floor(y0 / CELL)); gy <= Math.min(GH - 1, Math.floor(y1 / CELL)); gy++) for (let gx = Math.max(0, Math.floor(x0 / CELL)); gx <= Math.min(GW - 1, Math.floor(x1 / CELL)); gx++) fn(gx, gy, gx * CELL + CELL / 2, gy * CELL + CELL / 2);
  };
  const paintDisc = (cx, cy, r, h) => inCell(cx - r, cy - r + h, cx + r, cy + r + h, (gx, gy, x, y) => { if ((x - cx) ** 2 + (y - h - cy) ** 2 < r * r) blocked[gy * GW + gx] = 1; });
  for (const h of [0, 44, 92]) {
    const m = 12 + PAD;
    for (const [cx, cy, r] of disc) paintDisc(cx, cy, r + m, h);
    for (const [a, b, c, d] of box) inCell(a - m, b - m + h, c + m, d + m + h, (gx, gy) => { blocked[gy * GW + gx] = 1; });
    for (const [cx, cy, rx, ry] of ell) inCell(cx - rx - m, cy - ry - m + h, cx + rx + m, cy + ry + m + h, (gx, gy, x, y) => { if (((x - cx) / (rx + m)) ** 2 + ((y - h - cy) / (ry + m)) ** 2 < 1) blocked[gy * GW + gx] = 1; });
  }
  for (const [cx, cy, r] of canopy) { paintDisc(cx, cy, r + 12 + PAD, 0); paintDisc(cx, cy, r + 3 + PAD, 44); }
  const pb = pondEl.getBBox();                                           // the billabong: its outline once per cell, then a margin of 32 (+ PAD) around the wet cells
  const wetCells = [];
  inCell(pb.x - 4, pb.y - 4, pb.x + pb.width + 4, pb.y + pb.height + 4, (gx, gy, x, y) => { if (wet(x, y)) wetCells.push([gx, gy]); });
  for (const [wx, wy] of wetCells) inCell(wx * CELL - 36, wy * CELL - 36, wx * CELL + CELL + 36, wy * CELL + CELL + 36, (gx, gy, x, y) => { if ((x - wx * CELL - CELL / 2) ** 2 + (y - wy * CELL - CELL / 2) ** 2 <= (32 + PAD) ** 2) blocked[gy * GW + gx] = 1; });
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) { const x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2; if (x < 60 || x > 1860 || y < 280 || y > 1020) blocked[gy * GW + gx] = 1; }
  // The emus' lane. Feet only (the body is above the feet): a foot cell is blocked from LANE_GAP above the path (the adult's head ~126 + a margin) downwards, between the path's two ends
  // plus LANE_END, with the ends rounded off (a quarter ellipse), so a kangaroo can walk around the lane's ends but never between or through the emus.
  const LANE = [[436, 949], [560, 959], [760, 959], [960, 944], [1160, 957], [1330, 962], [1446, 946]];
  const laneY = (x) => { for (let k = 1; k < LANE.length; k++) if (x <= LANE[k][0]) { const [x0, y0] = LANE[k - 1], [x1, y1] = LANE[k]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return LANE[LANE.length - 1][1]; };
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2, x0 = LANE[0][0], x1 = LANE[LANE.length - 1][0];
    if (x < x0 - LANE_END || x > x1 + LANE_END) continue;
    const u = x < x0 ? (x0 - x) / LANE_END : x > x1 ? (x - x1) / LANE_END : 0;
    if (y > laneY(Math.min(Math.max(x, x0), x1)) - LANE_GAP * Math.sqrt(Math.max(0, 1 - u * u))) blocked[gy * GW + gx] = 1;
  }
  for (const [a, b] of stream) for (let gy = Math.max(0, Math.floor((b - 45) / CELL)); gy <= Math.min(GH - 1, Math.floor((b + 45) / CELL)); gy++) for (let gx = Math.max(0, Math.floor((a - 45) / CELL)); gx <= Math.min(GW - 1, Math.floor((a + 45) / CELL)); gx++) {
    const x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2; if ((x - a) ** 2 + (y - b) ** 2 < 45 * 45) creek[gy * GW + gx] = 1;
  }
  const cellAt = (x, y) => Math.max(0, Math.min(GH - 1, Math.floor(y / CELL))) * GW + Math.max(0, Math.min(GW - 1, Math.floor(x / CELL)));
  const landable = (x, y) => inside(x, y) && !blocked[cellAt(x, y)] && !creek[cellAt(x, y)];
  const clear = (x0, y0, x1, y1) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
      if (!inside(x, y) || blocked[cellAt(x, y)]) return false;
    }
    return true; // A creek can be jumped, but each landing must be dry.
  };
  // A small, cached visibility graph follows open lawn corridors. Longer edges
  // bridge the creek without requiring a landing in the water.
  const nodes = [], NX = Math.floor((1838 - 112) / GRID) + 1, NY = Math.floor((1000 - 328 - 1) / GRID) + 1, grid = new Int32Array(NX * NY).fill(-1);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x = 112 + i * GRID, y = 328 + j * GRID;
    if (landable(x, y)) { grid[j * NX + i] = nodes.length; nodes.push({ x, y, i, j, id: nodes.length, edges: [] }); }
  }
  // nodes near the creek (a jump over it is an edge of up to 160, elsewhere edges reach 100 only: that keeps the graph small)
  const nearCreek = (n) => { for (let gy = Math.floor((n.y - 120) / CELL); gy <= Math.floor((n.y + 120) / CELL); gy += 2) for (let gx = Math.floor((n.x - 120) / CELL); gx <= Math.floor((n.x + 120) / CELL); gx += 2) if (creek[cellAt(gx * CELL, gy * CELL)]) return true; return false; };
  for (const n of nodes) {
    const far = nearCreek(n), reach = far ? 10 : 6, maxd = far ? 160 : 100;
    for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
      const i = n.i + di, j = n.j + dj; if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
      const m = nodes[grid[j * NX + i]]; if (!m || m.id <= n.id) continue;
      const d = Math.hypot(m.x - n.x, m.y - n.y);
      if (d <= maxd && clear(n.x, n.y, m.x, m.y)) { n.edges.push([m.id, d]); m.edges.push([n.id, d]); }
    }
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const R = els.map((el) => ({ el, rig: bindRoo(el), flip: el.querySelector('.rooflip'), shadow: el.querySelector('.rooshadow'), x: NaN, y: NaN, h: 0, face: 1, route: [], history: [], hop: null }));
  const separated = (r, x, y) => R.every(o => o === r || !Number.isFinite(o.x)
    || (Math.hypot(o.x - x, o.y - y) >= ROO_R && (!o.hop || Math.hypot(o.hop.x1 - x, o.hop.y1 - y) >= ROO_R)));
  const place = (r, x, y) => { r.x = x; r.y = y; r.el.setAttribute('transform', `translate(${f(x)} ${f(y)})`); };
  function route(r) {
    if (!nodes.length) return [];
    let start = null, nearest = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - r.x, n.y - r.y);
      if (d < nearest && clear(r.x, r.y, n.x, n.y)) { start = n; nearest = d; }
    }
    if (!start) return [];
    const distance = nodes.map(() => Infinity), parent = nodes.map(() => -1), done = new Uint8Array(nodes.length);
    distance[start.id] = 0;
    for (;;) {
      let id = -1, best = Infinity;
      for (const n of nodes) if (!done[n.id] && distance[n.id] < best) { id = n.id; best = distance[id]; }
      if (id < 0) break;
      done[id] = 1;
      for (const [next, length] of nodes[id].edges) {
        if (best + length < distance[next]) { distance[next] = best + length; parent[next] = id; }
      }
    }
    const reachable = nodes.filter(n => n.id !== start.id && Number.isFinite(distance[n.id]) && separated(r, n.x, n.y));
    const longest = Math.max(0, ...reachable.map(n => distance[n.id]));
    // Prefer a distant, fresh destination in the current direction. Small lawn
    // pockets use their available extent rather than making unreachable goals.
    let goal = null, score = -Infinity;
    for (const n of reachable) {
      if (distance[n.id] < Math.min(450, longest * .7)) continue;
      const dx = n.x - r.x, dy = n.y - r.y, d = Math.hypot(dx, dy);
      const forward = d ? (dx * Math.cos(r.h) + dy * Math.sin(r.h)) / d : 0;
      const recent = r.history.some(p => Math.hypot(n.x - p.x, n.y - p.y) < 180);
      const value = d + forward * 180 + rnd(0, 170) - (recent ? 300 : 0);
      if (value > score) { goal = n; score = value; }
    }
    if (!goal) return [];
    const path = [];
    for (let id = goal.id; id >= 0; id = parent[id]) path.unshift(nodes[id]);
    const result = []; let from = r;
    for (let i = 0; i < path.length;) {
      let next = i;
      for (let j = path.length - 1; j > i; j--) if (clear(from.x, from.y, path[j].x, path[j].y)) { next = j; break; }
      if (Math.hypot(path[next].x - from.x, path[next].y - from.y) > 1) { result.push(path[next]); from = path[next]; }
      i = next + 1;
    }
    r.history.push({ x: goal.x, y: goal.y }); if (r.history.length > 4) r.history.shift();
    return result;
  }
  function safeHop(r, x, y, now) {
    if (!landable(x, y) || !clear(r.x, r.y, x, y)) return false;
    return R.every(o => {
      if (o === r || !Number.isFinite(o.x)) return true;
      // Check simultaneous progress, including the other animal's landing.
      for (let i = 0; i <= 12; i++) {
        const t = i / 12, ours = rooTravel(t), h = o.hop;
        const theirs = h ? rooTravel(Math.max(0, Math.min(1, (now + t * ROO_HOP_MS - h.t0) / h.dur))) : 0;
        const ox = h ? h.x0 + (h.x1 - h.x0) * theirs : o.x, oy = h ? h.y0 + (h.y1 - h.y0) * theirs : o.y;
        if (Math.hypot(r.x + (x - r.x) * ours - ox, r.y + (y - r.y) * ours - oy) < ROO_R) return false;
      }
      return true;
    });
  }
  function plan(r, now) {
    for (let attempt = 0; attempt < 2; attempt++) {
      while (r.route.length && Math.hypot(r.route[0].x - r.x, r.route[0].y - r.y) < 1) r.route.shift();
      if (!r.route.length) r.route = route(r);
      const goal = r.route[0];
      if (!goal) break;
      const dx = goal.x - r.x, dy = goal.y - r.y, distance = Math.hypot(dx, dy);
      let stride = Math.min(distance, rnd(150, 190));
      if (distance > stride && distance - stride < 60) stride = distance / 2;
      for (const d of [stride, stride * .85, stride * .65, distance <= 190 ? distance : 0]) {
        if (d < 1) continue;
        const x1 = r.x + dx / distance * d, y1 = r.y + dy / distance * d;
        if (safeHop(r, x1, y1, now)) {
          r.h = Math.atan2(dy, dx);
          if (Math.abs(Math.cos(r.h)) > .35) r.face = Math.cos(r.h) < 0 ? -1 : 1;
          r.flip.setAttribute('transform', `scale(${r.face} 1)`);
          return { x0: r.x, y0: r.y, x1, y1, t0: now, dur: ROO_HOP_MS };
        }
      }
      r.route = []; // Replan around another kangaroo without random per-hop turns.
    }
    // If the other kangaroo temporarily blocks a corridor, continue the jump
    // cycle on this safe patch instead of introducing a standing rest.
    return { x0: r.x, y0: r.y, x1: r.x, y1: r.y, t0: now, dur: ROO_HOP_MS };
  }
  R.forEach((r, i) => {
    const [sx, sy] = i ? [520, 744] : [1500, 520];
    const candidates = nodes.filter(n => n.edges.length && separated(r, n.x, n.y)).sort((a, b) => Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy));
    const start = candidates[0]; if (!start) return;
    place(r, start.x, start.y); r.h = i ? 0 : Math.PI / 2;
    drawRoo(r.rig, 0); r.el.removeAttribute('visibility');
  });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const active = R.filter(r => Number.isFinite(r.x));
  for (const [i, r] of active.entries()) r.hop = plan(r, -i * ROO_HOP_MS * .4);
  let last = null, clock = 0;
  const frame = (t) => {
    const dt = last === null ? 0 : Math.min(t - last, 100); last = t; clock += dt;
    for (const r of active) {
      if (clock >= r.hop.t0 + r.hop.dur) {
        const next = r.hop.t0 + r.hop.dur;
        place(r, r.hop.x1, r.hop.y1); r.hop = plan(r, next);
      }
      const u = Math.max(0, Math.min((clock - r.hop.t0) / r.hop.dur, 1)), travel = rooTravel(u);
      place(r, r.hop.x0 + (r.hop.x1 - r.hop.x0) * travel, r.hop.y0 + (r.hop.y1 - r.hop.y0) * travel);
      drawRoo(r.rig, u);
      r.shadow.setAttribute('rx', (22 + rooLift(u) * .12) * ROO_SCALE / .55);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}


/* ================= the lookout: full screen ================= */
function lookoutToggle() {
  const el = document.getElementById('lookout'), root = document.documentElement;
  if (!el || !root.requestFullscreen) return;
  // full screen by the page (Fullscreen API) or by the browser itself (F11): the second one only shows in the display mode
  const mode = matchMedia('(display-mode: fullscreen)');
  const browserFull = () => mode.matches && !document.fullscreenElement;
  const mark = () => document.body.classList.toggle('fullview', !!document.fullscreenElement || mode.matches);
  let hint;
  el.addEventListener('click', () => {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (browserFull()) { // a page cannot leave the browser's own full screen: say how
      hint = hint || Object.assign(document.body.appendChild(document.createElement('div')), { className: 'fullhint', textContent: 'Press F11 to leave full screen' });
      hint.classList.add('on'); clearTimeout(hint.t); hint.t = setTimeout(() => hint.classList.remove('on'), 2600);
      return;
    }
    root.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', mark); // also when Esc leaves full screen
  mode.addEventListener('change', mark); addEventListener('resize', mark);
  mark();
}

/* ================= you are here ================= */
// The red dot follows the mouse but only along the places a visitor can stand or float:
// the paths, the gate plaza, the creek, the billabong and the Uluru lookout (the nearest such point to the pointer).
const HERE0 = [1106, 978];
function hereDot() {
  return `<g id="here" transform="translate(${HERE0[0]} ${HERE0[1]})"><circle class="pulse" r="11" fill="none" stroke="#E2453B" stroke-width="3"/><circle r="9" fill="#E2453B" stroke="#fff" stroke-width="3"/><circle r="11" fill="none" stroke="${INK}" stroke-width="1.6"/>
    <text class="here-label" x="18" y="5" font-size="16" font-weight="700" fill="#C2311F" stroke="#FFF7E6" stroke-width="4" stroke-opacity=".8" stroke-linejoin="round" paint-order="stroke" style="font-family:'Land Text',sans-serif">You are here</text></g>`;
}
function herePoints() {
  const pts = [], inView = (x, y) => x >= 14 && x <= 1906 && y >= 14 && y <= 1066;
  const ns = 'http://www.w3.org/2000/svg', g = document.createElementNS(ns, 'g');
  g.setAttribute('visibility', 'hidden'); map.appendChild(g);
  for (const d of [...Object.values(PATHS).map(([d]) => d), CREEK, OUT]) {
    const el = document.createElementNS(ns, 'path'); el.setAttribute('d', d); g.appendChild(el);
    const n = el.getTotalLength();
    for (let l = 0; l <= n; l += 6) { const q = el.getPointAtLength(l); if (inView(q.x, q.y)) pts.push([q.x, q.y]); }
  }
  g.remove();
  const area = (cx, cy, rx, ry, step) => { for (let y = cy - ry; y <= cy + ry; y += step) for (let x = cx - rx; x <= cx + rx; x += step) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && inView(x, y)) pts.push([x, y]); };
  area(292, 580, 160, 88, 10);    // billabong
  area(960, 1086, 250, 112, 10);  // gate plaza
  area(1560, 262, 26, 22, 6);     // lookout platform
  return pts;
}
function followHere() {
  const el = document.getElementById('here'), label = el.querySelector('.here-label');
  const pts = herePoints(), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = HERE0.slice(), goal = HERE0.slice(), raf = 0, left = false;
  const draw = () => {
    el.setAttribute('transform', `translate(${f(cur[0])} ${f(cur[1])})`);
    const flip = cur[0] > 1740;
    if (flip !== left) { left = flip; label.setAttribute('x', flip ? -18 : 18); label.setAttribute('text-anchor', flip ? 'end' : 'start'); }
  };
  const step = () => {
    const dx = goal[0] - cur[0], dy = goal[1] - cur[1];
    if (still || Math.hypot(dx, dy) < .5) { cur = goal.slice(); draw(); raf = 0; return; }
    cur[0] += dx * .22; cur[1] += dy * .22; draw(); raf = requestAnimationFrame(step);
  };
  addEventListener('pointermove', (e) => {
    if (document.body.classList.contains('portrait') && e.target.closest && !e.target.closest('#map')) return;
    const m = map.getScreenCTM(); if (!m) return;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    let best = goal, bd = Infinity;
    for (const p of pts) { const d = (p[0] - q.x) ** 2 + (p[1] - q.y) ** 2; if (d < bd) { bd = d; best = p; } }
    goal = best; if (!raf) raf = requestAnimationFrame(step);
  }, { passive: true });
}

/* ================= assemble ================= */
const AV = { custom: [960, 402, 150, 'galah', 41], replay: [650, 622, 106, 'budgie', 52], sandbox: [1270, 622, 106, 'lorikeet', 63] };
const map = document.getElementById('map');
map.innerHTML = defs() + `<g class="intro">
  ${terrain()}${uluru()}${kataTjuta()}${lawn()}${billabong()}${paths()}
  <path d="M486 604L404 588" stroke="${INK}" stroke-width="20" stroke-linecap="round"/><path d="M486 604L404 588" stroke="${C.woodL}" stroke-width="15" stroke-linecap="round"/><path d="M478 596l-4 15M464 593l-4 15M450 591l-4 15M436 588l-4 15M422 585l-4 15" stroke="${C.wood}" stroke-width="1.6"/>
  ${lookout()}
  ${rock(1240, 166, 1, 3, '#B27C5A', 'angular')}${rock(1760, 180, .9, 4, '#A97D63', 'flat')}${rock(1206, 198, .8, 5, '#BE8A5E', 'cluster')}${rock(840, 120, .75, 6, '#9E8270')}
  ${wattle(862, 700, .9, 7)}${wattle(1058, 706, .85, 8)}${wattle(806, 1020, .8, 9)}${wattle(1106, 760, .7, 10)}${wattle(520, 820, .7, 11)}${wattle(1395, 610, .75, 12)}${wattle(1880, 900, .8, 13)}${wattle(470, 470, .6, 14)}
  ${flowerBed(894, 724, 1, 3)}${flowerBed(1026, 724, 1, 4)}${picnic(1528, 628)}${termites(1158, 152, 1, 'cathedral')}${termites(1196, 166, .75, 'dome')}${termites(878, 134, .85, 'spire')}${termites(640, 190, .75, 'twin')}${bench(560, 900, 8)}${bench(1360, 900, -8)}
  ${entrance()}
  ${kiosk()}${site()}
  ${tunnel('M850 462Q780 500 730 582')}${tunnel('M1070 462Q1140 500 1190 582')}${dome(O.custom, ...AV.custom)}${dome(O.replay, ...AV.replay)}${dome(O.sandbox, ...AV.sandbox)}
  ${tree(56, 470, .95, 3)}${tree(70, 770, 1.15, 4)}${tree(178, 716, .72, 5)}${tree(612, 358, .82, 6)}${tree(760, 268, .7, 7)}${tree(1166, 290, .78, 8)}${tree(1372, 368, .8, 9)}
  ${tree(690, 1036, 1.0, 10)}${tree(1262, 1000, .85, 11)}${tree(560, 1058, .8, 12)}${tree(1434, 712, .72, 13)}${tree(1866, 470, .9, 14)}${tree(1900, 690, .8, 15)}${tree(1772, 604, 1.15, 16, true)}
  ${tree(-60, 600, 1.2, 17)}${tree(2010, 560, 1.1, 18)}${tree(-40, 1000, 1.1, 19)}${tree(1990, 1010, 1.1, 20)}${tree(420, 1080, .9, 21)}${tree(1450, 1080, .9, 22)}
  <g class="deco">${animals()}${clouds()}${wildlife()}</g>
  ${hereDot()}
  </g>
  ${OPTS.map(pin).join('')}${OPTS.map(label).join('')}`;

followHere();
bushLife();
roos();
lookoutToggle();
siteBuild();
document.getElementById('compass').innerHTML = compass();
// an easter egg: a click spins the compass rose a few turns, it wobbles and settles on north again
const rose = document.querySelector('#compass .rose');
rose.addEventListener('click', () => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const turns = (2 + Math.floor(Math.random() * 3)) * 360 * (Math.random() < .5 ? -1 : 1);
  rose.getAnimations().forEach((a) => a.cancel());
  rose.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${turns + Math.sign(turns) * 24}deg)`, offset: .72 }, { transform: `rotate(${turns - Math.sign(turns) * 10}deg)`, offset: .86 }, { transform: `rotate(${turns}deg)` }],
    { duration: 2200, easing: 'cubic-bezier(.2,.7,.3,1)' });
});

/* ================= the live game switch (as on the old start page) ================= */
// The live game (Custom game) is switched off for now. Whoever knows the word can open it for this browser: type it where a table id goes and click Open.
const LIVE_KEY = 'liveUnlocked', LIVE_WORD = 'ilovejdansp';
let liveOpen = false;
// the options that are coming soon (the production site sets the list before this script: window.ARK_COMING_SOON); the live game stays shut until its word is typed
const off = (id) => (window.ARK_COMING_SOON || []).includes(id) || (id === 'custom' && !liveOpen);
try { liveOpen = localStorage.getItem(LIVE_KEY) === '1'; } catch (e) { /* no storage */ }

/* ================= the ticket of the hovered / chosen option ================= */
const ticket = document.getElementById('ticket');
let active = null, pinned = false, hideT = 0;
function setOn(id, on) { if (id) document.querySelectorAll(`[data-opt="${id}"]`).forEach((e) => e.classList.toggle('on', on)); }
function showTicket(o) {
  ticket.style.setProperty('--c', o.c);
  ticket.style.left = o.card[0] + 'px'; ticket.style.top = o.card[1] + 'px';
  const locked = off(o.id);
  let bottom;
  if (o.id === 'replay') bottom = `<form id="tkf" class="tk-form"><input id="tki" type="text" placeholder="BGA table id or url" aria-label="BGA table id or url" autocomplete="off" required><button class="btn" id="tkgo" type="submit">${o.cta}</button></form><p class="tk-msg" id="tkmsg" role="status" hidden></p>`;
  else if (locked) bottom = `<button class="btn" type="button" disabled>Coming soon</button><span class="tk-note">Not open yet</span>`;
  else bottom = `<a class="btn" href="${o.href}">${o.cta}</a><span class="tk-note">${o.note || ''}</span>`;
  ticket.innerHTML = `<div class="tk-top">${badge(o, 58)}<div><h3>${o.name}</h3><p>${o.desc}</p></div></div><div class="tk-cut"></div><div class="tk-bot${o.id === 'replay' ? ' col' : ''}">${bottom}</div>`;
  ticket.hidden = false;
  ticket.style.animation = 'none'; void ticket.offsetWidth; ticket.style.animation = '';
  const fm = document.getElementById('tkf');
  if (fm) fm.addEventListener('submit', lookup);
}
function say(text, kind) { const m = document.getElementById('tkmsg'); if (!m) return; m.textContent = text; m.className = 'tk-msg ' + (kind || ''); m.hidden = !text; }
async function lookup(e) {
  e.preventDefault();
  const q = document.getElementById('tki'), go = document.getElementById('tkgo');
  if (q.value.trim().toLowerCase() === LIVE_WORD) {
    try { localStorage.setItem(LIVE_KEY, '1'); } catch (err) { /* no storage */ }
    liveOpen = true; q.value = ''; say('');
    return;
  }
  go.disabled = true; say('Checking the table…', 'loading');
  try {
    const res = await fetch('/api/lookup?q=' + encodeURIComponent(q.value));
    const body = await res.json();
    if (body.status === 'ready') { say('Table found, opening the replay…', 'loading'); location.href = body.next; }
    else if (body.status === 'needs_log') {
      say('This table is indexed but its log has not been collected yet. Taking you to the page that shows how to open it with our browser extension…', 'ok');
      setTimeout(() => { location.href = body.next; }, 1200);
    } else say(body.message || 'Something went wrong.', 'error');
  } catch (err) { say('Could not reach the server, try again.', 'error'); }
  finally { go.disabled = false; }
}
function activate(id, pin = false) {
  clearTimeout(hideT);
  if (active !== id) { setOn(active, false); active = id; setOn(id, true); showTicket(O[id]); }
  if (pin) pinned = true;
}
function release(force = false) {
  if (pinned && !force) return;
  clearTimeout(hideT);
  hideT = setTimeout(() => { setOn(active, false); active = null; pinned = false; ticket.hidden = true; }, force ? 0 : 260);
}
document.querySelectorAll('#map [data-opt]').forEach((e) => {
  const id = e.dataset.opt;
  e.addEventListener('pointerenter', () => { if (!pinned || active === id) activate(id); });
  e.addEventListener('pointerleave', () => release());
  e.addEventListener('click', (ev) => { ev.stopPropagation(); pinned = false; activate(id, true); const i = document.getElementById('tki'); if (i) i.focus({ preventScroll: true }); });
  e.addEventListener('focus', () => { pinned = false; activate(id, true); });
  e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); const first = ticket.querySelector('input, a.btn'); if (first) first.focus(); } });
});
ticket.addEventListener('pointerenter', () => clearTimeout(hideT));
ticket.addEventListener('pointerleave', () => release());
ticket.addEventListener('click', (e) => { e.stopPropagation(); pinned = true; });
ticket.addEventListener('focusin', () => { clearTimeout(hideT); pinned = true; });
document.addEventListener('click', (e) => { if (!e.target.closest('#acctdlg, #acctbar')) release(true); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('#acctdlg[open]')) release(true); });

/* ================= narrow screens: the options as a list under the map ================= */
document.getElementById('plist').innerHTML = `<div class="brand"><img src="/brand/logo.svg" alt=""><div><h1>Ark Nova Park</h1><p>Maintained by the United Emu Friends Association</p></div></div>`
  + `<form class="tk-form" id="pform"><input id="pq" type="text" placeholder="BGA table id or url" aria-label="BGA table id or url" autocomplete="off" required><button class="btn" type="submit" style="--c:${O.replay.c}">Open replay</button></form>`
  + OPTS.filter((o) => o.id !== 'replay').map((o) => `<a class="row" href="${off(o.id) ? '#' : o.href}" style="--c:${o.c}">${badge(o)}<span><b>${o.name}</b><small>${off(o.id) ? 'Coming soon' : o.short}</small></span></a>`).join('')
  + '<p class="plinks"><a href="/terms.html">Terms and privacy</a></p>';
document.getElementById('pform').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { const body = await (await fetch('/api/lookup?q=' + encodeURIComponent(document.getElementById('pq').value))).json(); if (body.next) location.href = body.next; else alertRow(body.message || 'Something went wrong.'); } catch (err) { alertRow('Could not reach the server, try again.'); }
});
function alertRow(t) { let p = document.getElementById('pmsg'); if (!p) { p = document.createElement('p'); p.id = 'pmsg'; p.className = 'tk-msg error'; document.getElementById('pform').after(p); } p.textContent = t; }

/* ================= the account widget (account.js) goes into the top right corner ================= */
const acctSlot = document.querySelector('.account');
const labelBar = (b) => { const btn = b.querySelector('button:not(.linkbtn)'); if (btn && !btn.title) { btn.title = btn.textContent; btn.setAttribute('aria-label', btn.textContent); } };   // (the ticket shows no text)
const grabBar = () => { const b = document.getElementById('acctbar'); if (!b) return false; if (b.parentNode !== acctSlot) { acctSlot.append(b); new MutationObserver(() => labelBar(b)).observe(b, { childList: true }); } labelBar(b); return true; };
if (!grabBar()) { const mo = new MutationObserver(() => { if (grabBar()) mo.disconnect(); }); mo.observe(document.body, { childList: true }); }

/* label pills fit their text */
function fitLabels() { document.querySelectorAll('.lab').forEach((g) => { g.querySelector('.sign').innerHTML = signShape(g.querySelector('text').getComputedTextLength() + 66); }); }
fitLabels(); if (document.fonts) document.fonts.ready.then(fitLabels);

/* paper grain */
(() => { try { const c = document.createElement('canvas'); c.width = c.height = 220; const x = c.getContext('2d'), im = x.createImageData(220, 220); for (let i = 0; i < im.data.length; i += 4) { const v = 200 + Math.random() * 55; im.data[i] = v; im.data[i + 1] = v * .97; im.data[i + 2] = v * .9; im.data[i + 3] = 255; } x.putImageData(im, 0, 0); document.getElementById('grain').style.backgroundImage = `url(${c.toDataURL()})`; } catch (e) { /* no canvas */ } })();

/* uniform scaling: the page is laid out at 1920 x 1080 and zoomed to the window */
const stage = document.getElementById('stage'), wrap = document.getElementById('wrap');
function fit() {
  const vw = innerWidth, vh = innerHeight, portrait = vw < vh * .9;
  document.body.classList.toggle('portrait', portrait);
  const k = portrait ? vw / 1920 : Math.min(vw / 1920, vh / 1080);
  const ox = portrait ? 0 : (vw - 1920 * k) / 2, oy = portrait ? 0 : (vh - 1080 * k) / 2;
  stage.style.transform = `translate(${ox}px,${oy}px) scale(${k})`;
  wrap.style.setProperty('--k', k);                                    // (the name badge, account widget and Terms link keep to the window's corners, zoomed alike)
  wrap.style.height = portrait ? 1080 * k + 'px' : '';
}
fit(); addEventListener('resize', fit);
if (matchMedia('(prefers-reduced-motion: reduce)').matches) map.pauseAnimations();
