// [module] Zoo board geometry (axial hex maths, map cells, building sprites, legal-placement test) and the SVG zoo board.
import { FORK, S, params } from './state.js';
import { endPreview, turnPreview } from './bpreview.js';
import { cardName, zoneNew } from './cards.js';
import { adaptIcon, binderSvg, fitImageAttrs, marketingAttrs } from './bonusart.js';
import { hdPentagonSvg } from './ctrack.js';
import { pentagon } from './handshake.js';
import { FIT_DY, FIT_H, ICON_IDS, SHOW_VALUE, iconUrl, moneyTile, moneyTwo, pieceUrl } from './icons.js';
import { seatRawColor, svg } from './util.js';
import { render } from './main.js';
import { playFork } from './fork.js';
import { animalSelection } from './action-bar.js';

const toAxial = (x, y) => [x, (y - x - 1) / 2];
const fromAxial = (q, r) => [q, 2 * r + q + 1];
const rotateAxial = (a, k) => { let [q, r] = a; for (let i = 0; i < ((k % 6) + 6) % 6; i++) [q, r] = [-r, q + r]; return [q, r]; };
const placementCells = (type, x, y, k) => {
  const [q0, r0] = toAxial(x, y);
  return (S.replay.shapes[type] || []).map((o) => { const [dq, dr] = rotateAxial(o, k); return fromAxial(q0 + dq, r0 + dr); });
};
const cellsKey = (cells) => cells.map((c) => c[0] + ',' + c[1]).sort().join(';');
// the legal action that puts the piece on exactly these cells (a symmetric piece has several rotations that cover the same cells), or null
export function legalPlacement(p) {
  if (p.x === null) return null;
  const want = cellsKey(placementCells(p.type, p.x, p.y, p.rot));
  for (const a of S.replay.steps[S.step].actions || []) {
    if (a.kind !== 'place_building' || a.player !== p.seat || a.args.type !== p.type || !!a.args.extra !== !!p.extra) continue;
    if (cellsKey(placementCells(p.type, a.args.x, a.args.y, a.args.rotation)) === want) return a;
  }
  return null;
}

// BGA's zoo map pictures (web/maps, 1122x976): hex (x, y) is centred at (MAP.x0 + x*MAP.dx, MAP.y0 + y*MAP.dy), see scripts/download_bga_maps.py
const MAP = { x0: 96, y0: 88, dx: 115, dy: 66.5 };
// the buildings are drawn with a thin gap between neighbours (ENC_GAP px cut off the outside of each outline); with the setting "Show enclosure borders" (S.encBorders) they also get a BGA-like border (ENC_BORDER px inside the outline)
let maskCount = 0;                                  // (mask / clip ids must be unique in the whole page, not per map)
const ENC_GAP = 3, ENC_BORDER = 8, ENC_BORDER_COLOUR = '#A68731';
const SPRITE_SCALE = (MAP.dx / 1.5) / 136;      // the building sprites are drawn with hexes of circumradius 136 px
const cellCentre = (x, y) => [MAP.x0 + x * MAP.dx, MAP.y0 + y * MAP.dy];

// sprite of a building: standard enclosures have an empty (yellow) and an occupied (green) side
export function spriteOf(b) {
  const occupied = b.animal || (b.animals && b.animals.length);
  const id = /^size-\d$/.test(b.type) ? b.type + (occupied ? '_occupied' : '_empty') : (b.type === 'victory' && S.replay.marine_worlds ? 'victory_mw' : b.type);
  return S.sprites[id];
}

const SPECIAL_ENCLOSURE = /aquarium|aviary|reptile-house|petting-zoo|tunnel/;       // (the building types that hold their animals as cubes)

const FULLMAP_Y = 881, FULLMAP_TICKET = 45, FULLMAP_FONT = 31;          // (the full-map plate: top of the plate, height of the ticket picture, size of the number)
export function zooBoard(map, player, seat) {
  const s = svg('svg', { class: 'board', viewBox: '0 0 1122 976', role: 'img', 'aria-label': 'Zoo map ' + map.name });
  if (map.image) s.append(svg('image', { href: map.image, x: 0, y: 0, width: 1122, height: 976 }));
  for (const h of map.custom_terrain || []) {        // a map made in the map editor: the blank board with its rock / water hexes drawn on it, as the editor does (156 x 135 pieces on the cell)
    const [hx, hy] = cellCentre(h.x, h.y);
    s.append(svg('image', { href: '/map_editor/hex_' + h.terrain + '.png', x: hx - 78, y: hy - 67.5, width: 156, height: 135 }));
  }
  const covered = new Set();
  for (const b of player.buildings) for (const c of b.cells) covered.add(c[0] + ',' + c[1]);

  // printed bonuses and upgrade flags that no building covers
  const put = (tag, attrs, text) => {
    const e = svg(tag, attrs);
    if (text !== undefined) e.textContent = text;
    s.append(e);
  };
  const iconBox = (id, cx, cy, h, style) => {
    const [w0, h0] = S.iconSizes[id] || [h, h];
    put('image', { href: iconUrl(id), x: cx - (w0 * h / h0) / 2, y: cy - h / 2, width: w0 * h / h0, height: h, ...(style ? { style } : {}) });
  };
  // hexes that need the upgraded Build action (`upgrade_flag`), as on BGA: a red parallelogram over the upper left of the hex and BGA's own Build II badge (web/badges/BuildII.webp) in a white ring.
  // On a hex without a bonus the badge lies over the right end of the wedge (big); on a hex that also has a placement bonus the wedge is drawn BEHIND the pentagon and a small badge is pinned to
  // the pentagon's upper-left shoulder, so the bonus (a 2 money on map 3 / 3a) stays readable. The wedge is drawn first so every bonus lies on top of it.
  const flags = map.special_hexes.filter((q) => q.kind === 'upgrade_flag' && !covered.has(q.x + ',' + q.y));
  const hasBonus = new Set(map.placement_bonuses.filter((q) => !covered.has(q.x + ',' + q.y)).map((q) => q.x + ',' + q.y));
  const flagBadge = (bx, by, br) => {
    put('image', { href: '/badges/BuildII.webp', x: bx - br, y: by - br, width: 2 * br, height: 2 * br, class: 'flag-badge-img' });
    put('circle', { cx: bx, cy: by, r: br - 1, class: 'flag-ring' });
  };
  for (const sh of flags) {
    const [cx, cy] = cellCentre(sh.x, sh.y), R = MAP.dx / 1.5, h = R * 0.866;
    put('polygon', { points: [[cx - R * 0.95, cy], [cx - R * 0.475, cy - h * 0.95], [cx + R * 0.36, cy - h * 0.95], [cx - R * 0.115, cy]].map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' '), class: 'flag-wedge' });
  }
  for (const pb of map.placement_bonuses) {
    if (covered.has(pb.x + ',' + pb.y)) continue;
    const [cx, cy] = cellCentre(pb.x, pb.y);
    const bn = pb.bonus || {};
    const tip = svg('title');
    tip.textContent = bn.type ? bn.type + (bn.value ? ' ' + bn.value : '') : 'bonus';
    const icon = ICON_IDS['bonus:' + bn.type];
    if (bn.type === 'Digging') { iconBox(icon, cx, cy, 80); s.lastChild.append(tip); continue; }       // r9c13 already has its own background
    if (bn.type === 'Worker' && map.id === '11') {                                                       // map 11 (Caves): the Worker hex takes a worker back (Extra Shift: 13 of 13 in the logs), the whole tile of the icon sheet
      tip.textContent = 'Extra Shift: take a worker back from the association board';
      s.append(hdPentagonSvg('bonus-extra-shift', 80, cx, cy)); s.lastChild.append(tip); continue;          // (the pentagon of the track's Extra Shift bonus, HD, ctrack.js)
    }
    if (bn.type === 'conceal') {                                                                          // BGA draws the binder (conceal) without the pentagon: a black rounded square, a gold ring, four white tabs on the left
      tip.textContent = 'Conceal: hide a card from the display';
      s.append(binderSvg(cx, cy)); s.lastChild.append(tip); continue;
    }
    iconBox(ICON_IDS.pentagon, cx, cy, 80);
    if (bn.type === 'adapt') adaptIcon(s, cx, cy + 1, bn.value || 1);                    // (vector, bonusart.js)
    else if (bn.type === 'money') moneyTile(s, cx, cy + 3, 48);
    else if (bn.type === 'Scavenging' && icon && bn.value > 1) {                 // Scavenging 3: the number to the left of the icon, overlapping it a little
      iconBox(icon, cx + 9, cy + 3, 44);
      put('text', { x: cx - 15, y: cy + 14, class: 'bonus-number', style: 'font-size:34px;stroke-width:7px' }, bn.value);
    }
    else if (bn.type === 'bonus-sponsor') put('image', marketingAttrs(cx, cy + 5, 56));          // (Marketing: the HD picture on its optical centre, see marketingAttrs)
    else if (icon && FIT_H[bn.type]) put('image', fitImageAttrs(bn.type, cx, cy + 80 * FIT_DY, 80 * FIT_H[bn.type]));          // (university, partner zoo: the same share of the pentagon as in the association panel)
    else if (icon) iconBox(icon, cx, cy + 3, bn.type === 'wave' ? 21 : 48);       // (the wave is a wide banner)
    if (bn.type === 'appeal' && !icon) put('text', { x: cx, y: cy + 6, class: 'bonus-label' }, '★');      // a bonus nobody has identified yet is just the empty pentagon
    if (bn.type === 'money' && String(bn.value).length > 1) put('text', { ...moneyTwo(bn.value, cx, cy + 3, 36, 7), class: 'bonus-number two' }, bn.value);       // (two digits: smaller, tighter and centred on the tile, `moneyTwo`)
    else if (SHOW_VALUE.has(bn.type)) put('text', { x: cx, y: cy + (bn.type === 'money' ? 14 : 16), class: 'bonus-number' + (bn.type === 'appeal' ? ' dk appeal' : ''), ...(bn.type === 'money' ? { style: 'font-size:36px;stroke-width:7px' } : {}) }, bn.value);       // (the money number is a little smaller on the map)       // the number sits over the middle of the icon
    s.lastChild.append(tip);
  }
  for (const sh of map.special_hexes) {            // maps 8 / 8a: the H hexes (a special placement bonus without the pentagon; the picture has empty hexes there, Ark360 moves them)
    if (sh.kind !== 'hollywood_h' || covered.has(sh.x + ',' + sh.y)) continue;
    const [cx, cy] = cellCentre(sh.x, sh.y);
    put('image', { href: '/bonus/hollywood_h.webp', x: cx - 34, y: cy - 46, width: 69, height: 82, class: 'hollywood-h' });
    const tip = svg('title');
    tip.textContent = 'H: covering it reveals cards from the deck and adds the first sponsor to your hand';
    s.lastChild.append(tip);
  }
  for (const sh of flags) {            // the Build II badges, over the bonuses
    const [cx, cy] = cellCentre(sh.x, sh.y), R = MAP.dx / 1.5;
    if (hasBonus.has(sh.x + ',' + sh.y)) flagBadge(cx - 27, cy - 29, 17);
    else flagBadge(cx + R * 0.02, cy - R * 0.42, R * 0.42);
  }

  // map 9: a slot with the continent icon on the edge of the map holds the player's cube until the marker is removed (the log line "removes <ASIA> marker")
  if (map.id === '9') {
    const CONT = { Europe: ['#92dafd', [214, 151]], Americas: ['#fba155', [169, 231]], Africa: ['#fcf401', [193, 201]], Australia: ['#ee3a62', [176, 163]], Asia: ['#b1e2b2', [256, 235]] };      // colour, size of web/continents/<name>.png (black silhouettes cut from web/badges)
    const ORDER = ['Europe', 'Americas', 'Africa', 'Australia', 'Asia'], gone = (player.flags && player.flags.m9_removed) || 0;
    const at = Object.fromEntries((map.special_hexes || []).filter((h) => h.kind === 'continent_marker').map((h) => [h.note.split(' ')[0], cellCentre(h.x, h.y)]));
    ORDER.forEach((c, i) => {
      if (gone >> i & 1 || !at[c]) return;
      // BGA's marker: a rounded square in the colour of the continent (the player's cube sits on it) and a flat-sided hexagon with the black continent, overlapping it; side by side on the
      // top / bottom edge, one above the other on the left / right edge. BGA's proportions (measured on its board, pitch 115: square 46, hexagon 57 x 50, outline 4.5 dark grey) at 1.35 times the size (K).
      const [rx, ry] = at[c], vertical = rx < 52 || rx > 1070, [fill, sil] = CONT[c], INK = '#4b4647', SW = 4.5, K = 1.35, PW = 46 * K, HW = 57 * K, HH = 50 * K, OV = 6 * K;
      const tw = vertical ? HW : PW + HW - OV, th = vertical ? PW + HH - OV : HH;
      const cx = Math.max(tw / 2 + 2, Math.min(1122 - tw / 2 - 2, rx)), cy = Math.max(th / 2 + 2, Math.min(976 - th / 2 - 2, ry));
      const px = vertical ? cx - PW / 2 : cx - tw / 2, py = vertical ? cy - th / 2 : cy - PW / 2;                   // the square
      const hx = vertical ? cx - HW / 2 : cx + tw / 2 - HW, hy = vertical ? cy + th / 2 - HH : cy - HH / 2;        // the hexagon
      const g = svg('g', {});
      g.append(svg('rect', { x: px + SW / 2, y: py + SW / 2, width: PW - SW, height: PW - SW, rx: 12 * K, fill, stroke: INK, 'stroke-width': SW }));
      const hp = [[0, .5], [.245, 0], [.755, 0], [1, .5], [.755, 1], [.245, 1]].map(([u, v]) => [hx + SW / 2 + u * (HW - SW), hy + SW / 2 + v * (HH - SW)]);
      g.append(svg('polygon', { points: hp.map((q) => q.join(',')).join(' '), fill, stroke: INK, 'stroke-width': SW, 'stroke-linejoin': 'round' }));
      const bw = 38 * K, bh = 38 * K, k = Math.min(bw / sil[0], bh / sil[1]), w = sil[0] * k, h = sil[1] * k;                  // the continent, centred in the hexagon
      g.append(svg('image', { href: '/continents/' + c + '.png', x: hx + HW / 2 - w / 2, y: hy + HH / 2 - h / 2, width: w, height: h }));
      g.append(svg('image', { href: pieceUrl('cubes', seatRawColor(seat)), x: px + PW / 2 - 17 * K, y: py + PW / 2 - 17 * K, width: 34 * K, height: 34 * K }));
      const tip = svg('title');
      tip.textContent = c + ' marker (' + S.replay.players[seat].name + '): removed when an animal of this continent is played next to its area';
      g.append(tip);
      s.append(g);
    });
  }

  // map 13: the bonus of each quadrant (gained when the area is completely covered and at every break) sits on the edge of the map, on the
  // yellow / purple tag r8c11; the left one (hunter 4) is not in the geometry data
  const AREA_TAG = 'r8c11', AREA_AT = { top: [561, 46], bottom: [561, 932], left: [42, 488], right: [1080, 488] };
  for (const sh of map.special_hexes) {
    if (sh.kind !== 'area_bonus') continue;
    const side = sh.y < 0 ? 'top' : sh.y > 12 ? 'bottom' : sh.x < 0 ? 'left' : 'right';
    const bn = sh.bonus || (side === 'left' ? { type: 'Hunter', value: 4 } : null);
    if (!bn) continue;
    const [cx, cy] = AREA_AT[side];
    iconBox(AREA_TAG, cx, cy, 82);
    if (bn.type === 'Hunter') {
      iconBox('r7c7', cx + 7, cy + 2, 54);
      put('text', { x: cx - 21, y: cy + 16, class: 'bonus-number' }, bn.value);            // white with a black border, near the left edge
    } else if (bn.type === 'money') {
      moneyTile(s, cx, cy + 3, 48);
      if (String(bn.value).length > 1) put('text', { ...moneyTwo(bn.value, cx, cy + 3, 36, 8), class: 'bonus-number two' }, bn.value);
      else put('text', { x: cx, y: cy + 16, class: 'bonus-number' }, bn.value);
    } else {
      const icon = ICON_IDS['bonus:' + bn.type];
      if (icon) iconBox(icon, cx, cy + 3, 48);
      put('text', { x: cx, y: cy + 16, class: 'bonus-number' + (bn.type === 'appeal' ? ' dk appeal' : '') }, bn.value);          // (appeal: the usual black number)
    }
    const tip = svg('title');
    tip.textContent = 'Area bonus: ' + bn.type + ' ' + bn.value + ' (when the area is completely covered, and at every break)';
    s.lastChild.append(tip);
  }

  // the bonus for covering the whole map, in the lower right corner as on BGA: a light grey plate with a black outline (both left corners rounded, its right end under the strip) that holds the appeal
  // pentagon: the yellow bonus pentagon with the appeal ticket and 7 on every map; map 13 (no appeal for it there) a red pentagon with 0
  const FM = { x: 1032, y: FULLMAP_Y, w: 90, h: 84 }, fmx = FM.x + 47, fmy = FM.y + FM.h / 2, none = map.id === '13';
  put('rect', { x: FM.x, y: FM.y, width: FM.w + 30, height: FM.h, rx: 20, fill: '#d0d2cd', stroke: '#000', 'stroke-width': 3.5, class: 'fullmap-plate' });
  if (none) put('path', { d: pentagon(fmx, fmy, 64, 6), fill: '#c9323a', stroke: '#58545a', 'stroke-width': 4, 'stroke-linejoin': 'round', class: 'fullmap-pentagon' });
  else iconBox(ICON_IDS.pentagon, fmx, fmy, 74);                       // (the sprite has a transparent edge: 74 high draws a 64 high pentagon, like the red one)
  if (ICON_IDS['bonus:appeal']) iconBox(ICON_IDS['bonus:appeal'], fmx, fmy + 1, FULLMAP_TICKET);
  put('text', { x: fmx, y: fmy + 12, class: 'bonus-number dk appeal', style: 'font-size:' + FULLMAP_FONT + 'px' }, none ? 0 : 7);
  s.lastChild.append(Object.assign(svg('title'), { textContent: none ? 'No appeal for covering the whole map on this map' : 'Covering the whole map: 7 appeal' }));

  // the buildings; one that arrived (or changed: another rotation, turned over when an animal is placed / turned back when it is released) gets a green frame round its hexes, one that left (cut down, replaced) stays
  // as a ghost with a red frame; both fade like the cards
  const hexPoints = (x, y) => {
    const [hx, hy] = cellCentre(x, y);
    return [0, 1, 2, 3, 4, 5].map((i) => (hx + 76 * Math.cos(i * Math.PI / 3)).toFixed(1) + ',' + (hy + 76 * Math.sin(i * Math.PI / 3)).toFixed(1)).join(' ');
  };
  // the outline of a building: only the edges of its hexes that have no neighbour hex of the same building (flat topped hexes; the neighbour across edge i
  // lies at (+1,+1), (0,+2), (-1,+1), (-1,-1), (0,-2), (+1,-1))
  const NEIGHBOUR = [[1, 1], [0, 2], [-1, 1], [-1, -1], [0, -2], [1, -1]];
  const fillPath = (cells) => cells.map(([x, y]) => 'M' + hexPoints(x, y).split(' ').join('L') + 'Z').join('');       // (the hexes as closed shapes: an outline made of loose edges has no area, so it cannot be clicked inside)
  const outlinePath = (cells) => {
    const mine = new Set(cells.map(([x, y]) => x + ',' + y));
    const parts = [];
    for (const [x, y] of cells) {
      const [hx, hy] = cellCentre(x, y);
      NEIGHBOUR.forEach(([dx, dy], i) => {
        if (mine.has((x + dx) + ',' + (y + dy))) return;
        const pt = (k) => (hx + 76 * Math.cos(k * Math.PI / 3)).toFixed(1) + ' ' + (hy + 76 * Math.sin(k * Math.PI / 3)).toFixed(1);
        parts.push('M' + pt(i) + 'L' + pt(i + 1));
      });
    }
    return parts.join('');
  };
  const drawBuilding = (b, cls) => {
    const g = svg('g', cls ? { class: cls } : {});
    g.setAttribute('data-bseat', seat); g.setAttribute('data-bid', b.type + '|' + b.x + '|' + b.y);          // (card-motion.js flies the building to / from the invisible deck)
    const sp = spriteOf(b);
    const animals = b.animal ? [b.animal] : b.animals;
    const title = svg('title');
    title.textContent = b.type + (animals && animals.length ? ': ' + animals.map(cardName).join(', ') : ' (empty)');
    if (!sp) {                                  // a building whose sprite is missing: outline its hexes
      g.append(title);
      for (const [x, y] of b.cells) g.append(svg('polygon', { points: hexPoints(x, y), class: 'nosprite' }));
    } else {
      const [cx, cy] = cellCentre(b.x, b.y);
      const img = svg('image', {
        href: '/enclosures/' + sp.image, x: cx - sp.anchor[0] * SPRITE_SCALE, y: cy - sp.anchor[1] * SPRITE_SCALE,
        width: sp.size[0] * SPRITE_SCALE, height: sp.size[1] * SPRITE_SCALE,
        transform: 'rotate(' + (b.rotation * 60) + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')',
      });
      img.append(title);
      const gap = ENC_GAP, bw = S.encBorders ? ENC_BORDER : 0;
      if (gap > 0 || bw > 0) {                  // a thin gap between neighbouring buildings (the outer band of the building's outline is cut off) and / or a border inside it
        const id = 'bm' + (++maskCount), od = outlinePath(b.cells);
        const mask = svg('mask', { id, maskUnits: 'userSpaceOnUse', x: -400, y: -400, width: 3000, height: 3000 });
        const cp = svg('clipPath', { id: id + 'c' });
        for (const [x, y] of b.cells) {
          mask.append(svg('polygon', { points: hexPoints(x, y), fill: '#fff', stroke: '#fff', 'stroke-width': 1.5 }));
          cp.append(svg('polygon', { points: hexPoints(x, y) }));
        }
        if (gap > 0) mask.append(svg('path', { d: od, fill: 'none', stroke: '#000', 'stroke-width': 2 * gap, 'stroke-linecap': 'round' }));
        const inner = svg('g', { mask: 'url(#' + id + ')' });
        inner.append(img);
        if (bw > 0) {
          const bg = svg('g', { 'clip-path': 'url(#' + id + 'c)' });
          bg.append(svg('path', { d: od, fill: 'none', stroke: ENC_BORDER_COLOUR, 'stroke-width': 2 * (gap + bw), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
          inner.append(bg);
        }
        g.append(mask, cp, inner);
      } else g.append(img);
    }
    if (animals && animals.length && SPECIAL_ENCLOSURE.test(b.type)) {         // a special enclosure is filled with the player's cubes (the cubes of the projects and the donations): one per animal, on its hexes in turn
      const cells = b.cells.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]), size = 66;
      animals.forEach((k, i) => {
        const [hx, hy] = cellCentre(...cells[i % cells.length]), lap = Math.floor(i / cells.length) * 14;
        const cube = svg('image', { href: pieceUrl('cubes', seatRawColor(seat)), x: hx - size / 2 + lap, y: hy - size / 2 - lap, width: size, height: size });
        const t = svg('title'); t.textContent = cardName(k); cube.append(t);
        g.append(cube);
      });
    }
    if (cls) g.append(svg('path', { d: outlinePath(b.cells), class: 'frame' }));
    return g;
  };
  const keyOf = (b) => [b.type, b.x, b.y, b.rotation, b.animal || (b.animals && b.animals.length) ? 'full' : 'empty'].join('|');
  const zone = seat + ':buildings';
  const z = zoneNew(zone, player.buildings.map(keyOf));
  S.curZoneData[zone] = Object.fromEntries(player.buildings.map((b) => [keyOf(b), b]));
  const aSel = animalSelection(), encPicks = [];                              // (the click targets of the enclosures go on top of every building, else the sprite of a later building covers them)
  for (const b of player.buildings) {
    s.append(drawBuilding(b, z.isNew(keyOf(b)) ? 'tok-new' : ''));
    if (aSel && aSel.seat === seat && aSel.acts.some((a) => a.args.x === b.x && a.args.y === b.y)) {          // an enclosure the selected animal can go to: click it, then confirm
      const on = S.animalEnc && S.animalEnc.card === aSel.card && S.animalEnc.x === b.x && S.animalEnc.y === b.y;
      const pick = svg('path', { d: fillPath(b.cells), class: 'encpick' + (on ? ' on' : ''), style: 'stroke: none' });
      encPicks.push(svg('path', { d: outlinePath(b.cells), class: 'encpick' + (on ? ' on' : ''), style: 'fill: none; pointer-events: none' }));       // (the border, drawn apart from the clickable area)
      pick.addEventListener('click', () => { S.animalEnc = { card: aSel.card, x: b.x, y: b.y }; render(); });
      encPicks.push(pick);
    }
    if (params.has('debug')) {                  // ?debug: outline the cells the engine says the building covers
      for (const [x, y] of b.cells) s.append(svg('polygon', { points: hexPoints(x, y), fill: 'none', stroke: '#f0f', 'stroke-width': 3 }));
    }
  }
  s.append(...encPicks);
  const nowIds = new Set(player.buildings.map((b) => b.type + '|' + b.x + '|' + b.y));        // a building of the last drawing that is gone (cut down, replaced): drawn invisible, only so that card-motion.js can fly a copy of it to the deck
  for (const old of Object.values(S.prevZoneData[zone] || {})) {
    if (nowIds.has(old.type + '|' + old.x + '|' + old.y)) continue;
    const g = drawBuilding(old, 'cm-leaving');
    g.style.opacity = '0'; g.style.pointerEvents = 'none';
    s.append(g);
  }
  for (const gone of z.gone) {
    const b = (S.prevZoneData[zone] || {})[gone.key];
    if (!b) continue;
    const g = drawBuilding(b, 'tok-gone');
    g.addEventListener('animationend', () => g.remove());
    s.append(g);
  }
  if (FORK && S.placement && S.placement.seat === seat) {
    // every hex is a target for the anchor; until one is chosen the building follows the cursor (anchor on the hex under it), green / red like the placed one
    const hover = svg('g', { class: 'hoverplace', 'pointer-events': 'none' });
    for (const h of map.hexes || []) {
      const poly = svg('polygon', { points: hexPoints(h.x, h.y), class: 'pickhex' });
      poly.addEventListener('click', () => { S.placement.x = h.x; S.placement.y = h.y; render(); });
      poly.addEventListener('mouseenter', () => {
        if (S.placement.x !== null) return;
        const cells = placementCells(S.placement.type, h.x, h.y, S.placement.rot);
        const legal = !!legalPlacement({ ...S.placement, x: h.x, y: h.y });
        const ghost = drawBuilding({ type: S.placement.type, x: h.x, y: h.y, rotation: S.placement.rot, cells }, '');
        ghost.setAttribute('class', 'ghost');
        hover.replaceChildren(ghost, svg('path', { d: outlinePath(cells), class: 'placeborder ' + (legal ? 'ok' : 'bad') }));
      });
      poly.addEventListener('mouseleave', () => hover.replaceChildren());
      s.append(poly);
    }
    s.append(hover);
    if (S.placement.x !== null) {
      const cells = placementCells(S.placement.type, S.placement.x, S.placement.y, S.placement.rot);
      const legal = !!legalPlacement(S.placement);
      const ghost = drawBuilding({ type: S.placement.type, x: S.placement.x, y: S.placement.y, rotation: S.placement.rot, cells }, '');
      ghost.setAttribute('class', 'ghost');
      ghost.setAttribute('pointer-events', 'none');
      s.append(ghost);
      s.append(svg('path', { d: outlinePath(cells), class: 'placeborder ' + (legal ? 'ok' : 'bad'), 'pointer-events': 'none' }));
      const [ax, ay] = cellCentre(S.placement.x, S.placement.y);                      // the anchor of the building, drawn on top of it while it is being placed
      const anchor = svg('g', { class: 'anchormark', 'pointer-events': 'none' });
      anchor.append(svg('circle', { cx: ax, cy: ay, r: 17, class: 'anchordot' }), svg('line', { x1: ax - 11, y1: ay, x2: ax + 11, y2: ay, class: 'anchorcross' }),
                    svg('line', { x1: ax, y1: ay - 11, x2: ax, y2: ay + 11, class: 'anchorcross' }));
      s.append(anchor);
      const centres = [0, 1, 2, 3, 4, 5].flatMap((k) => placementCells(S.placement.type, S.placement.x, S.placement.y, k)).map((c) => cellCentre(c[0], c[1]));      // (the cells of every rotation: the buttons stay where they are while the piece turns)
      const xs = centres.map((c) => c[0]), ys = centres.map((c) => c[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), midY = (Math.min(...ys) + Math.max(...ys)) / 2, midX = (minX + maxX) / 2, maxY = Math.max(...ys);
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const button = (cx, cy, glyph, title, onclick, cls) => {
        const g = svg('g', { class: 'placebtn ' + (cls || ''), transform: 'translate(' + clamp(cx, 40, 1082).toFixed(0) + ' ' + clamp(cy, 40, 936).toFixed(0) + ')' });
        const tip = svg('title');
        tip.textContent = title;
        const gl = svg('text', { y: 12, 'text-anchor': 'middle' });
        gl.textContent = glyph;
        g.append(svg('circle', { r: 34 }), gl, tip);
        g.addEventListener('click', (e) => { e.stopPropagation(); onclick(); });
        s.append(g);
      };
      button(minX - 105, midY, '\u21B6', 'Turn counter-clockwise', () => { S.placement.rot = (S.placement.rot + 5) % 6; render(); }, 'rot');
      button(maxX + 105, midY, '\u21B7', 'Turn clockwise', () => { S.placement.rot = (S.placement.rot + 1) % 6; render(); }, 'rot');
      if (legal) button(midX - 48, maxY + 110, '\u2713', 'Place the building here', () => playFork(legalPlacement(S.placement)), 'okbtn');
      button(midX + (legal ? 48 : 0), maxY + 110, '\u2715', 'Cancel', () => { S.placement = null; render(); }, 'cancelbtn');
    }
  }
  if (!(FORK && S.placement) && !(S.preview && S.preview.seats.includes(seat))) {                // a right click on a map without a preview: the picker of the enclosures (bpreview.js); with the setting off the browser's menu stays
    s.addEventListener('contextmenu', (e) => {
      if (!S.previewBuilding || !(map.hexes || []).length) return;
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('bpreview-menu', { detail: { seat, x: e.clientX, y: e.clientY } }));
    });
  }
  if (S.preview && S.preview.seats.includes(seat) && S.preview.error && !(FORK && S.placement)) {          // the answer of the server failed: say why (a right click ends it)
    const label = S.preview.name + ': ' + S.preview.error;
    const w = Math.min(1090, 50 + label.length * 13.5);
    const tag = svg('g', { class: 'pvtag', 'pointer-events': 'none', transform: 'translate(561 46)' });
    const txt = svg('text', { y: 9, 'text-anchor': 'middle', class: 'pvtext small' });
    txt.textContent = label;
    tag.append(svg('rect', { x: -w / 2, y: -34, width: w, height: 68, rx: 34, class: 'pvpill' }), txt);
    s.addEventListener('contextmenu', (e) => { e.preventDefault(); endPreview(); });
    s.append(tag);
  }
  if (S.preview && S.preview.seats.includes(seat) && S.preview.per[seat] && !(FORK && S.placement)) {
    // The placement preview (bpreview.js): every hex is a target for the anchor, the building (half see-through) follows the cursor, also while it is turned (R / Shift + R / wheel). Green = the building fits like this, red = it does not. Nothing is placed: there is no check mark, a right click anywhere on the map ends the preview.
    const P = S.preview, D = P.per[seat];                                                          // (D: the shape and the legal anchors of this zoo)
    const cellsOf = (x, y, k) => { const [q0, r0] = toAxial(x, y); return D.shape.map((o) => { const [dq, dr] = rotateAxial(o, k); return fromAxial(q0 + dq, r0 + dr); }); };
    const fits = (x, y, k) => D.options.has(x + ',' + y + ',' + k);
    const layer = svg('g', { class: 'pvlayer' });
    const hover = svg('g', { class: 'hoverplace', 'pointer-events': 'none' });
    const at = () => (P.hx !== null && P.hs === seat ? [P.hx, P.hy] : null);                                      // (always the hex under the cursor: the building keeps following it while it is turned)
    const ghostAt = (x, y) => {
      const cells = cellsOf(x, y, P.rot);
      const g = drawBuilding({ type: D.type, x, y, rotation: P.rot, cells }, '');
      g.setAttribute('class', 'pghost');
      return [g, svg('path', { d: outlinePath(cells), class: 'placeborder ' + (fits(x, y, P.rot) ? 'ok' : 'bad') })];
    };
    for (const h of map.hexes || []) {
      const poly = svg('polygon', { points: hexPoints(h.x, h.y), class: 'pickhex' });
      poly.addEventListener('mouseenter', () => { P.hx = h.x; P.hy = h.y; P.hs = seat; hover.replaceChildren(...ghostAt(h.x, h.y)); });
      poly.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); endPreview(); });
      layer.append(poly);
    }
    s.addEventListener('contextmenu', (e) => { e.preventDefault(); endPreview(); });                       // (a right click beside the hexes ends it too)
    s.addEventListener('mouseleave', () => { if (P.hs === seat) { P.hx = null; P.hy = null; P.hs = null; } hover.replaceChildren(); });
    s.addEventListener('wheel', (e) => { e.preventDefault(); turnPreview(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    layer.append(hover);
    const here = at();
    if (here) hover.replaceChildren(...ghostAt(here[0], here[1]));
    s.append(layer);
  }
  return s;
}
