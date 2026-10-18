// [module] The conservation track (first 10 points) drawn as a vector, and the bonus pentagon shared by the track and the other bonus tiles.
import { svg } from './util.js';
import { S } from './state.js';
import { ICON_IDS, iconUrl } from './icons.js';
import { pentagon } from './handshake.js';

export const CT_W = 2000;                                              // the drawing is 2000 units wide; the cubes and bonus tiles are placed in the same units (percent of the width / height)
export const CT_X = (n) => 88 + 182.4 * n;
export const CT_BONUS_DX = 110;                                        // the two random bonus tiles of 5 and 8 lie this far left / right of their shield

const SHARED = { hexFill: '#F2E23D', ink: '#17262B' };
export const CT_H = 188;                                                     // the height of the drawing (the original picture was 207 high at this width)
const ST = {};                                                    // the height of the drawing (the original picture was 207 high at this width)

// a polygon with rounded corners (r) as a path
export function roundPoly(pts, r) {
  const k = pts.length; let d = '';
  pts.forEach((p, i) => {
    const a = pts[(i + k - 1) % k], b = pts[(i + 1) % k];
    const l1 = Math.hypot(a[0] - p[0], a[1] - p[1]), l2 = Math.hypot(b[0] - p[0], b[1] - p[1]), rr = Math.min(r, l1 / 2, l2 / 2);
    const s = [p[0] + (a[0] - p[0]) / l1 * rr, p[1] + (a[1] - p[1]) / l1 * rr], e = [p[0] + (b[0] - p[0]) / l2 * rr, p[1] + (b[1] - p[1]) / l2 * rr];
    d += (i ? 'L' : 'M') + s[0].toFixed(1) + ' ' + s[1].toFixed(1) + 'Q' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' ' + e[0].toFixed(1) + ' ' + e[1].toFixed(1);
  });
  return d + 'Z';
}

// the yellow bonus pentagon with an ink edge and a hard ink shadow (the one of the association strip); H = its height, the edge is drawn inside that height
export function pentagonShape(root, cx, cy, H, { fill = SHARED.hexFill, line = SHARED.ink, edge, shadow } = {}) {
  const w = edge ?? H * 0.052, sh = shadow ?? H * 0.052, d = pentagon(cx, cy, H - w, H * 0.078);
  const g = svg('g', { class: 'pent' });
  if (sh) g.append(svg('path', { d, transform: 'translate(0 ' + sh + ')', fill: line, stroke: line, 'stroke-width': w, 'stroke-linejoin': 'round' }));
  g.append(svg('path', { d, fill, stroke: line, 'stroke-width': w, 'stroke-linejoin': 'round' }));
  root.append(g);
  return g;
}

const pic = (root, id, cx, cy, h) => {
  const [w0, h0] = S.iconSizes[id] || [h, h], w = w0 * h / h0;
  root.append(svg('image', { href: iconUrl(id), x: cx - w / 2, y: cy - h / 2, width: w, height: h }));
};
const numText = (root, x, y, size, txt, fill, stroke, sw = 0.09, squeeze = 1) => {
  const t = svg('text', { x, y, 'text-anchor': 'middle', 'font-size': size, class: 'ctnum', style: "font:400 " + size + "px 'Bowlby One',system-ui,sans-serif", fill, stroke: stroke || 'none', 'stroke-width': stroke ? size * sw : 0, 'stroke-linejoin': 'round', 'paint-order': 'stroke' });
  if (squeeze !== 1) t.setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(' + squeeze + ' 1) translate(' + (-x) + ' ' + (-y) + ')');       // (a narrower numeral, the same height)
  t.textContent = txt; root.append(t); return t;
};

const INK = '#17262B', FELT = '#52935D';

// the shield of the conservation track: the original picture (the one of the player box) with a soft ink outline, our numerals on it
function shield(root, cx, cy, n) {
  const h = 80, w = h * 111 / 118, g = svg('g', { class: 'ctshield' });
  g.append(svg('image', { href: iconUrl(ICON_IDS.conservation), x: cx - w / 2, y: cy - h / 2, width: w, height: h, filter: 'url(#ctink)' }));
  numText(g, cx + 1, cy + 11, 37, String(n), '#0E1A1E', '#E6F0DF', .05, n >= 10 ? 1 : 1);          // (10 is as high as the others, only narrower, to fit the shield)
  root.append(g);
}

// a white arrow with a big head (BGA's), slightly rough-edged and off-white, with a thin soft outline
function arrow(root, S0, C, tip, w = 9) {
  const ang = Math.atan2(tip[1] - C[1], tip[0] - C[0]), L = 26, W = 17;
  const bx = tip[0] - Math.cos(ang) * L, by = tip[1] - Math.sin(ang) * L, nx = -Math.sin(ang) * W, ny = Math.cos(ang) * W;
  const d = 'M' + S0[0] + ' ' + S0[1] + ' Q' + C[0] + ' ' + C[1] + ' ' + bx.toFixed(1) + ' ' + by.toFixed(1);
  const head = [tip, [bx + nx, by + ny], [bx - nx, by - ny]].map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ');
  const g = svg('g', { class: 'ctarrow', filter: 'url(#ctrough)' });
  const outline = svg('g', { opacity: .42 });                             // (the outline is one group so the overlap of line and head does not double up)
  outline.append(svg('path', { d, fill: 'none', stroke: INK, 'stroke-width': w + 4, 'stroke-linecap': 'round' }), svg('polygon', { points: head, fill: INK, stroke: INK, 'stroke-width': 7, 'stroke-linejoin': 'round' }));
  g.append(outline, svg('path', { d, fill: 'none', stroke: '#F4F8EF', 'stroke-width': w, 'stroke-linecap': 'round' }), svg('polygon', { points: head, fill: '#F4F8EF', stroke: '#F4F8EF', 'stroke-width': 3, 'stroke-linejoin': 'round' }));
  root.append(g);
}

// the fixed 5 money under the shields 5 and 8: BGA's dark pentagon with a yellow rim and a white 5, in our numerals; smaller than the random bonuses
const FIVE_DX = -0.3, FIVE_DY = 3.4;                                          // (nudges of the numeral: its ink is centred on the pentagon's centre of mass, which lies lower than the middle of its bounding box)
function smallFive(root, cx, cy) {
  const H = 64, g = svg('g', { class: 'ctfive' });
  pentagonShape(g, cx, cy, H, { fill: '#3A464C', line: INK, edge: 1.8, shadow: 1.7 });
  g.append(svg('path', { d: pentagon(cx, cy, H - 12, 5), fill: 'none', stroke: '#E9DB45', 'stroke-width': 2.6, 'stroke-linejoin': 'round' }));
  numText(g, cx + FIVE_DX, cy + 12.5 + FIVE_DY, 34, '5', '#FFFFFF', null);
  root.append(g);
}

// 10 conservation: BGA's sign "discard an end of game card" (two cards with an hourglass, the first crossed out), same pictures, redrawn sharp, on a cream plate
function endSign(root, cx, cy0) {
  const cy = cy0 + 2, w = 100, h = 70, cw = 30, ch = 42, top = cy - h / 2, g = svg('g', { class: 'ctend' });   // (endgame cards are portrait, about 5:7)
  g.append(svg('rect', { x: cx - w / 2, y: top + 2, width: w, height: h, rx: 13, fill: INK }));
  g.append(svg('rect', { x: cx - w / 2, y: top, width: w, height: h, rx: 13, fill: '#F8EDCB', stroke: INK, 'stroke-width': 2.2 }));
  for (const [dx, cross] of [[-22, true], [22, false]]) {
    const x = cx + dx - cw / 2, y = cy - ch / 2, mx = cx + dx, my = cy;
    g.append(svg('rect', { x, y, width: cw, height: ch, rx: 5, fill: '#B3402E', stroke: '#6E1F18', 'stroke-width': 2.4 }));
    g.append(svg('rect', { x: x + 3, y: y + 3, width: cw - 6, height: ch - 6, rx: 3.5, fill: 'none', stroke: '#D0624B', 'stroke-width': 1.4 }));
    const hg = svg('g', { transform: 'translate(' + mx + ' ' + my + ') scale(1.2) translate(' + (-mx) + ' ' + (-(y + 13.5)) + ')' });   // the hourglass, centred on the card
    hg.append(svg('path', { d: 'M' + (mx - 7) + ' ' + (y + 5) + 'h14l-6 8.5 6 8.5h-14l6-8.5Z', fill: '#fff' }), svg('path', { d: 'M' + (mx - 3) + ' ' + (y + 19) + 'h6l3 3h-12Z M' + mx + ' ' + (y + 12) + 'l-3 -5h6Z', fill: '#111' }));
    g.append(hg);
    if (cross) {
      const dd = 'M' + (x - 1) + ' ' + (y - 1) + 'L' + (x + cw + 1) + ' ' + (y + ch + 1) + 'M' + (x + cw + 1) + ' ' + (y - 1) + 'L' + (x - 1) + ' ' + (y + ch + 1);
      g.append(svg('path', { d: dd, stroke: '#fff', 'stroke-width': 8, 'stroke-linecap': 'round' }), svg('path', { d: dd, stroke: '#E0402D', 'stroke-width': 4.6, 'stroke-linecap': 'round' }));
    }
  }
  root.append(g);
}

export function conservationTrackSvg() {
  const H = CT_H, W = CT_W;
  const s = svg('svg', { class: 'ctrack', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Conservation track' });
  const defs = svg('defs', {}); s.append(defs);
  const filt = (id, extra, ...kids) => { const f = svg('filter', Object.assign({ id, x: '-10%', y: '-10%', width: '120%', height: '120%', 'color-interpolation-filters': 'sRGB' }, extra)); f.append(...kids); defs.append(f); return f; };
  // a soft ink outline for the shield pictures
  const m = filt('ctink', {}, svg('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: 1.1, result: 'd' }), svg('feFlood', { 'flood-color': INK, 'flood-opacity': .26, result: 'c' }), svg('feComposite', { in: 'c', in2: 'd', operator: 'in', result: 'o' }), svg('feMerge', {}));
  m.lastChild.append(svg('feMergeNode', { in: 'o' }), svg('feMergeNode', { in: 'SourceGraphic' }));
  // a rough edge (felt / paint): a very small displacement
  filt('ctrough', {}, svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.09', numOctaves: 2, seed: 5, result: 'n' }), svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: 2.6, xChannelSelector: 'R', yChannelSelector: 'G' }));
  // the felt of the tabs: a fine, soft mottling
  filt('ctfelt', { x: 0, y: 0, width: '100%', height: '100%' }, svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.04', numOctaves: 3, seed: 9, result: 'n' }), svg('feColorMatrix', { in: 'n', values: '0 0 0 0 0.9  0 0 0 0 1  0 0 0 0 0.85  4 0 0 0 -2.05' }));
  s.append(svg('image', { href: '/assets/ct_wood.webp', x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none' }));       // the original wood (its own grain, tiled without seams)
  const tabW = 150, top = 9, tabH = 71, tabs = svg('g', {}); s.append(tabs);
  for (let n = 0; n <= 10; n++) {                                      // the 11 spaces: felt-green tabs with an ink outline and shadow and a soft pale edge, a slightly pointed lower edge
    const cx = CT_X(n), x0 = cx - tabW / 2, x1 = cx + tabW / 2;
    const d = roundPoly([[x0, top], [x1, top], [x1, top + tabH - 9], [cx, top + tabH + 2], [x0, top + tabH - 9]], 10);
    tabs.append(svg('path', { d, transform: 'translate(0 2)', fill: INK, stroke: INK, 'stroke-width': 4, 'stroke-linejoin': 'round' }), svg('path', { d, fill: INK, stroke: INK, 'stroke-width': 4, 'stroke-linejoin': 'round' }));
    const id = 'cttab' + n, cp = svg('clipPath', { id }); cp.append(svg('path', { d })); defs.append(cp);
    tabs.append(svg('path', { d, fill: FELT }), svg('rect', { x: x0, y: top, width: tabW, height: tabH + 4, filter: 'url(#ctfelt)', opacity: .09, 'clip-path': 'url(#' + id + ')' }));
    tabs.append(svg('path', { d, fill: 'none', stroke: '#EAF5E4', 'stroke-opacity': .5, 'stroke-width': 2.4, 'stroke-linejoin': 'round', filter: 'url(#ctrough)' }));
  }
  const HEX = 86, sy = 57, hy = 133;
  for (const n of [0, 2, 5, 8, 10]) {
    const cx = CT_X(n);
    if (n === 2 || n === 5 || n === 8) for (const side of [-1, 1]) arrow(s, [cx + side * 24, sy + 6], [cx + side * 70, sy + 14], [cx + side * (CT_BONUS_DX - 8), hy - HEX / 2 + 2]);
    if (n === 5 || n === 8) arrow(s, [cx, sy + 30], [cx, sy + 40], [cx, hy - 33], 8);
    shield(s, cx, sy + (n === 0 ? 6 : 0), n);
    if (n === 5 || n === 8) smallFive(s, cx, hy + 6);
    if (n === 10) endSign(s, cx, hy);
  }
  for (const [side, id] of [[-1, ICON_IDS['bonus:upgrade-card'] || 'r10c5'], [1, ICON_IDS['bonus:Worker'] || 'r5c13']]) {      // the fixed bonuses of 2: upgrade an action card, hire a worker
    const cx = CT_X(2) + side * CT_BONUS_DX;
    pentagonShape(s, cx, hy, HEX);
    pic(s, id, cx, hy + HEX * 0.0375, HEX * 0.6);
  }
  return s;
}
