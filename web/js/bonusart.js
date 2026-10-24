// [module] The bonus pictures of the pentagons (the random bonuses of 5 / 8 conservation and 16 reputation, the pentagons of the reputation track and of 2 conservation)
// in HD: BGA's pictures upscaled 4x (web/icons_hd, made by scripts/build_bonus_hd.py, which also writes where each one sits: bonus_hd_data.js), centred in the pentagon
// of `bonusTile` (shared.js; 80 high centred on (40, 40), viewBox -4 -4 88 94). BGA's own tiles lose their ground and ring: the picture alone lies on the vector
// pentagon (yellow, or beige for the Marine Worlds ones; their Marine Worlds mark is left out). The Multiplier is a vector drawing.
import { el, svg } from './util.js';
import { pentagon } from './handshake.js';
import { BONUS_HD } from './bonus_hd_data.js';

const INK = '#17262B';
const hd = (name) => '/icons_hd/' + name + '.webp';
let uid = 0;
const add = (root, tag, attrs, text) => { const e = svg(tag, attrs); if (text !== undefined) e.textContent = text; root.append(e); return e; };
const image = (root, name, [x, y, w, h]) => add(root, 'image', { href: hd(name), x, y, width: w, height: h, preserveAspectRatio: 'none' });

// what the pentagon of `name` needs: null when it is not one of these pictures; else { fill } (undefined = the yellow of every bonus pentagon)
export function hdBonus(name) {
  if (name === 'Multiplier' || BONUS_HD.icons[name]) return {};
  const t = BONUS_HD.tiles[name];
  return t ? { fill: t.ground === 'beige' ? BONUS_HD.beige : undefined } : null;
}
// draws the picture into `t` (an svg or group in pentagon units whose pentagon is drawn already); `edge` = the width of the pentagon's ink line
export function drawHdBonus(t, name, edge = 2.2) {
  if (name === 'Multiplier') return multiplier(t);
  const icon = BONUS_HD.icons[name];
  if (icon) { image(t, name, icon.box); return; }
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
// the blue Multiplier disc with x2 (vector)
function multiplier(t) {
  const id = 'bmg' + uid++;
  const gr = add(t, 'radialGradient', { id, cx: 0.42, cy: 0.38, r: 0.7 });
  add(gr, 'stop', { offset: 0, 'stop-color': '#4E6BD8' }); add(gr, 'stop', { offset: 1, 'stop-color': '#22308F' });
  add(t, 'circle', { cx: 40, cy: 44, r: 25, fill: `url(#${id})`, stroke: '#141D5C', 'stroke-width': 2 });
  add(t, 'text', { x: 40, y: 54, 'text-anchor': 'middle', style: "font:400 29px 'Park Num',system-ui,sans-serif", fill: '#fff' }, 'x2');
}
