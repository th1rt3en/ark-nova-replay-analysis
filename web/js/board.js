// [module] Zoo board geometry (axial hex maths, map cells, building sprites, legal-placement test) and the SVG zoo board.
import { FORK, S, params } from './state.js';
import { cardName, zoneNew } from './cards.js';
import { ICON_IDS, SHOW_VALUE, iconUrl, moneyTile } from './icons.js';
import { mix, seatColor, svg } from './util.js';
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
const SPRITE_SCALE = (MAP.dx / 1.5) / 136;      // the building sprites are drawn with hexes of circumradius 136 px
const cellCentre = (x, y) => [MAP.x0 + x * MAP.dx, MAP.y0 + y * MAP.dy];

// sprite of a building: standard enclosures have an empty (yellow) and an occupied (green) side
export function spriteOf(b) {
  const occupied = b.animal || (b.animals && b.animals.length);
  const id = /^size-\d$/.test(b.type) ? b.type + (occupied ? '_occupied' : '_empty') : (b.type === 'victory' && S.replay.marine_worlds ? 'victory_mw' : b.type);
  return S.sprites[id];
}

export function zooBoard(map, player, seat) {
  const s = svg('svg', { class: 'board', viewBox: '0 0 1122 976', role: 'img', 'aria-label': 'Zoo map ' + map.name });
  if (map.image) s.append(svg('image', { href: map.image, x: 0, y: 0, width: 1122, height: 976 }));
  const covered = new Set();
  for (const b of player.buildings) for (const c of b.cells) covered.add(c[0] + ',' + c[1]);

  // printed bonuses and upgrade flags that no building covers
  const put = (tag, attrs, text) => {
    const e = svg(tag, attrs);
    if (text !== undefined) e.textContent = text;
    s.append(e);
  };
  const iconBox = (id, cx, cy, h) => {
    const [w0, h0] = S.iconSizes[id] || [h, h];
    put('image', { href: iconUrl(id), x: cx - (w0 * h / h0) / 2, y: cy - h / 2, width: w0 * h / h0, height: h });
  };
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
      iconBox(S.iconNames['bonus-extra-shift'] || 'r5c15', cx, cy, 80); s.lastChild.append(tip); continue;
    }
    iconBox(ICON_IDS.pentagon, cx, cy, 80);
    if (bn.type === 'adapt') { iconBox('r10c15', cx - 14, cy + 3, 36); iconBox('r10c16', cx + 15, cy + 3, 36); }      // two endgame card icons side by side
    else if (bn.type === 'money') moneyTile(s, cx, cy + 3, 48);
    else if (bn.type === 'Scavenging' && icon && bn.value > 1) {                 // Scavenging 3: the number to the left of the icon, overlapping it a little
      iconBox(icon, cx + 9, cy + 3, 44);
      put('text', { x: cx - 15, y: cy + 14, class: 'bonus-number', style: 'font-size:34px;stroke-width:7px' }, bn.value);
    }
    else if (icon) iconBox(icon, cx, cy + 3, bn.type === 'wave' ? 21 : 48);       // (the wave is a wide banner)
    if (bn.type === 'appeal' && !icon) put('text', { x: cx, y: cy + 6, class: 'bonus-label' }, '★');      // a bonus nobody has identified yet is just the empty pentagon
    if (SHOW_VALUE.has(bn.type)) put('text', { x: cx, y: cy + (bn.type === 'money' ? 14 : 16), class: 'bonus-number', ...(bn.type === 'money' ? { style: 'font-size:36px;stroke-width:7px' } : {}) }, bn.value);       // (the money number is a little smaller on the map)       // the number sits over the middle of the icon
    s.lastChild.append(tip);
  }
  for (const sh of map.special_hexes) {            // hex that needs the upgraded Build action: red wedge on its upper left, purple "II" shovel badge
    if (sh.kind !== 'upgrade_flag' || covered.has(sh.x + ',' + sh.y)) continue;
    const [cx, cy] = cellCentre(sh.x, sh.y);
    const R = MAP.dx / 1.5, h = R * 0.866;
    put('polygon', { points: [[cx - R * 0.96, cy + 3], [cx - R * 0.5, cy - h * 0.96], [cx + R * 0.38, cy - h * 0.96], [cx - R * 0.1, cy + 3]].map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' '),
      class: 'flag-wedge' });
    const br = 30, bx = cx + 3, by = cy - h + br + 2;   // the badge touches the top edge of the hex
    put('circle', { cx: bx, cy: by, r: br, class: 'flag-badge' });
    iconBox('r3c9', bx, by - 8, 29);               // the shovel (Build action) on white
    put('text', { x: bx, y: by + 20, class: 'flag-label' }, 'II');
  }

  // map 9: a slot with the continent icon on the edge of the map holds the player's cube until the marker is removed (the log line "removes <ASIA> marker")
  if (map.id === '9') {
    const ORDER = ['Europe', 'Americas', 'Africa', 'Australia', 'Asia'], gone = (player.flags && player.flags.m9_removed) || 0;
    const at = Object.fromEntries((map.special_hexes || []).filter((h) => h.kind === 'continent_marker').map((h) => [h.note.split(' ')[0], cellCentre(h.x, h.y)]));
    ORDER.forEach((c, i) => {
      if (gone >> i & 1 || !at[c]) return;
      const cx = Math.max(52, Math.min(1070, at[c][0])), cy = Math.max(30, Math.min(946, at[c][1]));
      const g = svg('g', {});
      g.append(svg('rect', { x: cx - 50, y: cy - 25, width: 100, height: 50, rx: 12, fill: '#f3ecd2', stroke: '#2b1d12', 'stroke-width': 3 }));
      const col = seatColor(seat), edge = mix(col, '#000000', .6);
      const cube = svg('g', { transform: 'translate(' + (cx - 24) + ' ' + (cy - 1) + ') scale(.8)' });
      for (const [pts, fill] of [['0,-19 19,-9 0,2 -19,-9', mix(col, '#ffffff', .45)], ['-19,-9 0,2 0,21 -19,10', col], ['19,-9 0,2 0,21 19,10', mix(col, '#000000', .3)]]) {
        cube.append(svg('polygon', { points: pts, fill, stroke: edge, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
      }
      g.append(cube);
      const id = ICON_IDS[c];
      if (id) { const [w0, h0] = S.iconSizes[id] || [190, 152], h = 38, w = w0 * h / h0; g.append(svg('image', { href: iconUrl(id), x: cx + 26 - w / 2, y: cy - h / 2, width: w, height: h })); }
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
      put('text', { x: cx, y: cy + 16, class: 'bonus-number' }, bn.value);
    } else {
      const icon = ICON_IDS['bonus:' + bn.type];
      if (icon) iconBox(icon, cx, cy + 3, 48);
      put('text', { x: cx, y: cy + 16, class: 'bonus-number' }, bn.value);
    }
    const tip = svg('title');
    tip.textContent = 'Area bonus: ' + bn.type + ' ' + bn.value + ' (when the area is completely covered, and at every break)';
    s.lastChild.append(tip);
  }

  // the buildings; one that arrived (or changed: another rotation, turned over when an animal is placed / turned back when it is released) gets a green frame round its hexes, one that left (cut down, replaced) stays
  // as a ghost with a red frame; both fade like the cards
  const hexPoints = (x, y) => {
    const [hx, hy] = cellCentre(x, y);
    return [0, 1, 2, 3, 4, 5].map((i) => (hx + 76 * Math.cos(i * Math.PI / 3)).toFixed(1) + ',' + (hy + 76 * Math.sin(i * Math.PI / 3)).toFixed(1)).join(' ');
  };
  // the outline of a building: only the edges of its hexes that have no neighbour hex of the same building (flat topped hexes; the neighbour across edge i
  // lies at (+1,+1), (0,+2), (-1,+1), (-1,-1), (0,-2), (+1,-1))
  const NEIGHBOUR = [[1, 1], [0, 2], [-1, 1], [-1, -1], [0, -2], [1, -1]];
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
      g.append(img);
    }
    if (cls) g.append(svg('path', { d: outlinePath(b.cells), class: 'frame' }));
    return g;
  };
  const keyOf = (b) => [b.type, b.x, b.y, b.rotation, b.animal || (b.animals && b.animals.length) ? 'full' : 'empty'].join('|');
  const zone = seat + ':buildings';
  const z = zoneNew(zone, player.buildings.map(keyOf));
  S.curZoneData[zone] = Object.fromEntries(player.buildings.map((b) => [keyOf(b), b]));
  const aSel = animalSelection();
  for (const b of player.buildings) {
    s.append(drawBuilding(b, z.isNew(keyOf(b)) ? 'tok-new' : ''));
    if (aSel && aSel.seat === seat && aSel.acts.some((a) => a.args.x === b.x && a.args.y === b.y)) {          // an enclosure the selected animal can go to: click it, then confirm
      const on = S.animalEnc && S.animalEnc.card === aSel.card && S.animalEnc.x === b.x && S.animalEnc.y === b.y;
      const pick = svg('path', { d: outlinePath(b.cells), class: 'encpick' + (on ? ' on' : '') });
      pick.addEventListener('click', () => { S.animalEnc = { card: aSel.card, x: b.x, y: b.y }; render(); });
      s.append(pick);
    }
    if (params.has('debug')) {                  // ?debug: outline the cells the engine says the building covers
      for (const [x, y] of b.cells) s.append(svg('polygon', { points: hexPoints(x, y), fill: 'none', stroke: '#f0f', 'stroke-width': 3 }));
    }
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
  return s;
}
