// [module] The reputation track drawn as a vector (it was a picture): 15 chevron spaces (teal 1-9, rose 10-15) in a cream frame, the graduation cap at 1, and the appeal ticket at the end.
// The drawing is REP_W units wide, in the units of the old picture scaled to 2000: the cubes and rewards are placed in the same units (percent of the width).
import { svg } from './util.js';
import { roundPoly } from './ctrack.js';

const S0 = 2000 / 2752;                                                // (the old picture was 2752 px wide)
export const REP_H = 69;                                               // 95 px of the old picture
export const REP_EXTRA = 0;
export const REP_W = 2000 + REP_EXTRA;
export const REP16_X = 1974;                                           // the centre of the ticket cell at the end (the reward of 16 reputation lies above it)

const TEAL = '#64A399', ROSE = '#AF6973', CREAM = '#F0DAAA', INK = '#17262B';
// top-row left / right edges of the spaces 1..15 in the old picture (measured), the tip of a chevron lies 14 px further right at the middle
const SEG = [[1, 431], [451, 654], [674, 877], [897, 1026], [1045, 1175], [1194, 1323], [1343, 1472], [1491, 1620], [1640, 1769],
             [1788, 1917], [1937, 2066], [2086, 2215], [2234, 2363], [2383, 2512], [2531, 2661]];

const opt = () => Object.assign({ numFont: 'bowlby', numSize: 31, numFill: '#F6EAC8', numDy: 0, segEdge: .4, segShadow: 1, segShadowOpacity: .55, numShadow: 0 }, (typeof window !== 'undefined' && window.REP_V) || {});

export function reputationTrackSvg() {
  const o = opt(), W = REP_W, H = REP_H;
  const s = svg('svg', { class: 'reptrack', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Reputation track' });
  s.append(svg('rect', { x: 0, y: 0, width: W, height: H, rx: 4.5, fill: CREAM }));
  const top = 7.3, bot = 62.6, mid = (top + bot) / 2, tip = 10.2;
  const num = (x, txt, fill) => {
    const family = o.numFont === 'barlow' ? "'Park Label',system-ui,sans-serif" : "'Park Num',system-ui,sans-serif";
    const weight = o.numFont === 'barlow' ? 700 : 400;
    const y = mid + o.numSize * (o.numFont === 'barlow' ? 0.33 : 0.36) + o.numDy;
    if (o.numShadow) s.append(Object.assign(svg('text', { x, y: y + o.numShadow, 'text-anchor': 'middle', style: 'font:' + weight + ' ' + o.numSize + 'px ' + family, fill: o.numShadowColor || 'rgba(23,38,43,.28)' }), { textContent: txt }));
    s.append(Object.assign(svg('text', { x, y, 'text-anchor': 'middle', style: 'font:' + weight + ' ' + o.numSize + 'px ' + family, fill }), { textContent: txt }));
  };
  SEG.forEach(([l0, r0], i) => {
    const n = i + 1, l = l0 * S0 + (i ? 0 : 6), r = r0 * S0, fill = n <= 9 ? TEAL : ROSE;
    const pts = i ? [[l, top], [r, top], [r + tip, mid], [r, bot], [l, bot], [l + tip, mid]] : [[l, top], [r, top], [r + tip, mid], [r, bot], [l, bot]];
    const d = roundPoly(pts, 3.2);
    if (o.segShadow) s.append(svg('path', { d, transform: 'translate(0 ' + o.segShadow + ')', fill: INK, stroke: INK, 'stroke-width': o.segEdge * 2, 'stroke-linejoin': 'round', opacity: o.segShadowOpacity ?? 1 }));
    s.append(svg('path', { d, fill, stroke: o.segEdge ? (o.segEdgeColor || INK) : 'none', 'stroke-width': o.segEdge * 2, 'stroke-linejoin': 'round', 'paint-order': 'stroke' }));
    if (n === 1) return;
    num((l + r) / 2 + tip / 2 + (n >= 10 ? 0 : 0), String(n), o.numFill);
  });
  // the first space: the graduation cap (vector) and its number
  const cap = svg('g', { class: 'repcap', transform: 'translate(6 1)' });
  const grad = svg('linearGradient', { id: 'repcapg', x1: 0, y1: 0, x2: 1, y2: 0 });
  grad.append(svg('stop', { offset: 0, 'stop-color': '#7A7D80' }), svg('stop', { offset: 1, 'stop-color': '#34373A' }));
  const defs = svg('defs', {}); defs.append(grad); s.append(defs);
  cap.append(svg('path', { d: 'M18.5 40.5v10.6c0 3 6.4 5.4 14.4 5.4s14.4-2.4 14.4-5.4V40.5Z', fill: 'url(#repcapg)' }));
  cap.append(svg('path', { d: 'M32.5 13.5 57.5 32l-24.8 19.6L7.5 32Z', fill: '#221F20', stroke: '#221F20', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
  cap.append(svg('path', { d: 'M56.6 32.5v8', stroke: '#221F20', 'stroke-width': 1.6, fill: 'none' }), svg('circle', { cx: 56.6, cy: 42.3, r: 3.3, fill: '#221F20' }));
  s.append(cap);
  num(163, '1', o.numFill);
  // the end cap: the appeal ticket with the 1
  const tx = REP16_X, tw = 41.5, th = 52, ty = (H - th) / 2, nr = 6.6;
  const t = svg('g', { class: 'repticket' });
  t.append(svg('path', { d: 'M' + (tx - tw / 2) + ' ' + ty + 'h' + (tw / 2 - nr) + 'a' + nr + ' ' + nr + ' 0 0 0 ' + (nr * 2) + ' 0h' + (tw / 2 - nr) + 'v' + th + 'h' + (-(tw / 2 - nr)) + 'a' + nr + ' ' + nr + ' 0 0 0 ' + (-nr * 2) + ' 0h' + (-(tw / 2 - nr)) + 'Z', fill: '#EEAF9E', stroke: '#3A2A2A', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
  t.append(svg('path', { d: 'M' + (tx - tw / 2 + 3) + ' ' + (ty + 14) + 'h' + (tw - 6) + 'M' + (tx - tw / 2 + 3) + ' ' + (ty + 38) + 'h' + (tw - 6), stroke: '#E48A70', 'stroke-width': 2, fill: 'none' }));
  t.append(Object.assign(svg('text', { x: tx, y: ty + 36.8, 'text-anchor': 'middle', style: "font:400 30px 'Park Num',system-ui,sans-serif", fill: '#0E0E0F' }), { textContent: '1' }));
  s.append(t);
  return s;
}
