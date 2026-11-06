// [module] The bonus pictures of the pentagons (the random bonuses of 5 / 8 conservation and 16 reputation, the pentagons of the reputation track and of 2 conservation)
// in HD: BGA's pictures upscaled 4x (web/icons_hd, made by scripts/build_bonus_hd.py, which also writes where each one sits: bonus_hd_data.js), centred in the pentagon
// of `bonusTile` (shared.js; 80 high centred on (40, 40), viewBox -4 -4 88 94). BGA's own tiles lose their ground and ring: the picture alone lies on the vector
// pentagon (yellow, or beige for the Marine Worlds ones; their Marine Worlds mark is left out). The Multiplier is a vector drawing.
import { el, svg } from './util.js';
import { pentagon } from './handshake.js';
import { BONUS_HD } from './bonus_hd_data.js';
import { FIT_DY, FIT_H, ICON_IDS, iconShadow, iconUrl } from './icons.js';

const INK = '#17262B';
const hd = (name) => '/icons_hd/' + name + '.webp';
let uid = 0;
const add = (root, tag, attrs, text) => { const e = svg(tag, attrs); if (text !== undefined) e.textContent = text; root.append(e); return e; };
const image = (root, name, [x, y, w, h]) => add(root, 'image', { href: hd(name), x, y, width: w, height: h, preserveAspectRatio: 'none', ...(iconShadow(name, h) ? { style: iconShadow(name, h) } : {}) });
// the university and the partner zoo at the same share of the 80 high pentagon as on the board and in the association panel (FIT_H / FIT_DY, icons.js): the picture's aspect and centre x stay
const fitted = (name, [x, y, w, h]) => {
  if (!FIT_H[name]) return [x, y, w, h];
  const nh = 80 * FIT_H[name], nw = w * nh / h, cy = 40 + 80 * FIT_DY;
  return [x + w / 2 - nw / 2, cy - nh / 2, nw, nh];
};

// <image> attributes of the HD university / partner zoo (`name` = the bonus type) of height `h`, centred on (cx, cy): the placement bonuses of the zoo map and the bonus spaces of the association
// panel use the HD pictures too, at the shared fit (FIT_H, icons.js); the partner zoo with its shadow
export function fitImageAttrs(name, cx, cy, h) {
  const [, , bw, bh] = BONUS_HD.icons[name].box, w = bw * h / bh;
  return { href: hd(name), x: cx - w / 2, y: cy - h / 2, width: w, height: h, preserveAspectRatio: 'none', ...(iconShadow(name, h) ? { style: iconShadow(name, h) } : {}) };
}
// The Marketing picture (an X token overlapping a sponsor card, HD, 428 x 463) of height `h` for the bonus spaces of the association panel: the picture is lopsided (the small X token upper left,
// the big card lower right), so it is centred on its optical centre (the centroid of its opaque pixels: 0.068 w right of and 0.018 h above the middle of its box), not on its box.
export function marketingAttrs(cx, cy, h) {
  const w = h * 428 / 463;
  return { href: hd('bonus-sponsor'), x: cx - w / 2 - 0.068 * w, y: cy - h / 2 + 0.018 * h, width: w, height: h, preserveAspectRatio: 'none' };
}
// the action card upgrade is heavy on the left (the card, with the arrow only a thin line on its right), so it looked a little too far up and left and its upper left corner grazed the pentagon's
// edge: 6% smaller and moved 1.8 right / 1 down (units of the 80 high pentagon)
const nudged = (name, [x, y, w, h]) => name === 'upgrade-card' ? [x + w / 2 + 1.8 - w * 0.47, y + h / 2 + 1 - h * 0.47, w * 0.94, h * 0.94] : [x, y, w, h];
// what the pentagon of `name` needs: null when it is not one of these pictures; else { fill } (undefined = the yellow of every bonus pentagon)
export function hdBonus(name) {
  if (name === 'Multiplier' || BONUS_HD.icons[name]) return {};
  const t = BONUS_HD.tiles[name];
  return t ? { fill: t.ground === 'beige' ? BONUS_HD.beige : undefined } : null;
}
// draws the picture into `t` (an svg or group in pentagon units whose pentagon is drawn already); `edge` = the width of the pentagon's ink line
export function drawHdBonus(t, name, edge = 2.2) {
  if (name === 'Multiplier') return multiplier(t);
  if (name === 'bonus-scoring-cards') { adaptIcon(t, 40, 41, 3); return; }               // Adapt 3 (5 / 8 conservation, 16 reputation): the vector icon instead of BGA's blurry picture
  const icon = BONUS_HD.icons[name];
  if (icon) { image(t, name, nudged(name, fitted(name, icon.box))); return; }
  const tile = BONUS_HD.tiles[name];
  if (!tile) return;
  if (tile.split !== undefined) {                                             // the hand tile: its lower part light blue, clipped to the pentagon, the ink line drawn again on top
    const id = 'hdclip' + uid++, d = pentagon(40, 40, 80 - edge, 80 * 0.078);
    add(add(t, 'clipPath', { id }), 'path', { d });
    add(t, 'rect', { x: -4, y: tile.split, width: 88, height: 94 - tile.split, fill: tile.lower, 'clip-path': `url(#${id})` });
    add(t, 'path', { d, fill: 'none', stroke: INK, 'stroke-width': edge, 'stroke-linejoin': 'round' });
  }
  const img = image(t, name, tile.box);
  if (tile.clip) {                                                            // (a part that ran into BGA's ring, e.g. the arrow of the extra shift, stops at the ink line)
    const id = 'hdclip' + uid++;
    add(add(t, 'clipPath', { id }), 'path', { d: pentagon(40, 40, 80 - 2 * edge, 80 * 0.078 - edge / 2) });
    img.setAttribute('clip-path', `url(#${id})`);
  }
}
// Marketing has no pentagon on BGA: the picture alone (upscaled), sized like the other tiles
export function marketingTile() {
  const t = el('img', 'ctbonus');
  t.src = hd('bonus-sponsor'); t.alt = 'bonus-sponsor';
  return t;
}
// The black binder of map 12 (the Conceal hexes, the 2nd university, the 3rd worker), as BGA draws it (measured on its board: 82 x 76, dark grey outline, gold ring,
// four white tabs on the left edge), centred on (cx, cy), scaled by k.
export function binderSvg(cx, cy, k = 1) {
  const W = 82, H = 76, x0 = -W / 2, y0 = -H / 2, g = svg('g', { class: 'binder', transform: 'translate(' + cx + ' ' + cy + ') scale(' + k + ')' });
  g.append(svg('rect', { x: x0, y: y0, width: W, height: H, rx: 17, fill: '#353233' }));
  g.append(svg('rect', { x: x0 + 5, y: y0 + 4.5, width: W - 10, height: H - 9, rx: 12, fill: '#eed643' }));
  g.append(svg('rect', { x: x0 + 10, y: y0 + 8, width: W - 19, height: H - 15, rx: 2, fill: '#1c1a1c' }));
  for (const t of [17, 31, 44.4, 58]) g.append(svg('rect', { x: x0 + 10, y: y0 + t - 3.5, width: 6.6, height: 7, fill: '#fff' }));
  return g;
}
// The Adapt icon (draw endgame cards, discard as many), vector: a card back with a green + (draw) next to a crossed card back, the number big on both at the bottom. Drawn in the units of the
// 80 high pentagon, centred on (cx, cy), scaled by k; used by the zoo map (placement bonus Adapt 1), the bonus spaces (map 13's Adapt 3), the tracks' Adapt 3 (drawHdBonus) and the map editor.
// (before: BGA's picture of two cards under "3x 3x", upscaled and blurry)
export function adaptIcon(root, cx, cy, v, k = 1) {
  const g = add(root, 'g', { class: 'adapt', transform: 'translate(' + cx + ' ' + cy + ') scale(' + k + ')' });
  const card = (x, y, w, h) => {
    add(g, 'rect', { x, y, width: w, height: h, rx: 4, fill: '#b3402d', stroke: '#6f2216', 'stroke-width': 2 });
    add(g, 'rect', { x: x + 3, y: y + 3, width: w - 6, height: h - 6, rx: 2.5, fill: 'none', stroke: '#d4735c', 'stroke-width': 1.2 });
  };
  card(-27.5, -15, 25, 34); card(2.5, -15, 25, 34);
  const bx = -15, by = 2;                                                    // the + (draw) on the left card
  add(g, 'circle', { cx: bx, cy: by, r: 9.5, fill: '#2f9a43', stroke: '#241512', 'stroke-width': 2.2 });
  add(g, 'path', { d: 'M' + (bx - 4.7) + ' ' + by + 'H' + (bx + 4.7) + 'M' + bx + ' ' + (by - 4.7) + 'V' + (by + 4.7), stroke: '#fff', 'stroke-width': 3.4, 'stroke-linecap': 'round', fill: 'none' });
  for (const [c, w] of [['#fff', 7], ['#d71f26', 4]]) add(g, 'path', { d: 'M15 -6L28 12M28 -6L15 12'.replace(/15|28/g, (m) => (m === '15' ? 8.5 : 21.5)), stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', fill: 'none' });   // the crossed card
  add(g, 'text', { x: 0, y: 29, class: 'bonus-number', style: 'font-size:30px;stroke-width:6px;text-anchor:middle' }, v);
  return g;
}
// the Multiplier: BGA's own blue disc with x2 (the picture of the placement bonus and of the action card token), no drawing of our own
function multiplier(t) {
  add(t, 'image', { href: iconUrl(ICON_IDS['bonus:Multiplier']), x: 15, y: 19, width: 50, height: 50, preserveAspectRatio: 'xMidYMid meet' });
}
