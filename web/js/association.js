// [module] Association board, conservation bonus panel and the association strip of a player.
import { seatRawColor, svg } from './util.js';
import { FORK, S } from './state.js';
import { zoneNew } from './cards.js';
import { ICON_IDS, SLOT_ICON, SLOT_NUMBER, iconUrl, moneyDx, moneyTile, pieceUrl, workerUrl } from './icons.js';
import { bindActs, forkActs } from './action-bar.js';
import { render } from './main.js';
import { HANDSHAKE, UNIVERSITY, pentagon } from './handshake.js';

const ASSOC = {
  donation: [[215, 145], [75, 245], [225, 245], [75, 343], [225, 343], [75, 441], [225, 441], [185, 540]],   // association_0_k
  // task id -> [centre x, y, x offsets of the workers]
  workers: { 2: [427, 455, [-64, 0, 64]], 3: [0, 520, [700, 890, 1080]], 4: [0, 520, [1340, 1520, 1700]], 5: [1897, 455, [-64, 0, 64]] },
  partner: { Americas: [662, 225], Europe: [880, 115], Asia: [1120, 125], Africa: [880, 345], Australia: [1120, 345] },
  university: {
    mw: { 'fac-rep-hand': [1395, 175], 'fac-generic': [1655, 175], 'fac-science-science': [1395, 370], 'fac-science-rep': [1655, 370] },
    base: { 'fac-rep-hand': [1555, 110], 'fac-science-science': [1395, 350], 'fac-science-rep': [1655, 350] },
  },
};

const BLOCKED_COLORS = ['#7f4e30', '#b91b1b', '#d1c81c', '#cb7b19', '#c028d3'];       // (BGA's player colours, the pieces of web/cubes)
export function unusedColor() {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const far = (c) => S.replay.players.every((p) => !p.color || rgb(c).reduce((d, v, i) => d + Math.abs(v - rgb(p.color)[i]), 0) > 200);
  return BLOCKED_COLORS.find(far) || BLOCKED_COLORS[0];
}

export function associationBoard(st) {
  const mw = S.replay.marine_worlds;
  const s = svg('svg', { class: 'assoc', viewBox: '0 0 2000 591', role: 'img', 'aria-label': 'Association board' });
  s.append(svg('image', { href: '/assets/association_board_' + (mw ? 'mw' : 'base') + '.webp', x: 0, y: 0, width: 2000, height: 591 }));
  const put = (tag, attrs, text, title) => {
    const e = svg(tag, attrs);
    if (text !== undefined) e.textContent = text;
    if (title) { const t = svg('title'); t.textContent = title; e.append(t); }
    s.append(e);
  };
  // the fork: a tile of the board that a legal association task takes can be clicked
  const pickable = (x, y, w, h, match, tip) => {
    const acts = forkActs((a) => a.kind === 'association_task' && !a.args.supply && match(a));
    if (!acts.length) return;
    const r = svg('rect', { x, y, width: w, height: h, rx: 14, class: 'assocpick' });
    const t = svg('title');
    t.textContent = tip;
    r.append(t);
    s.append(bindActs(r, acts));
  };
  const at = {};                       // location -> [seat, ...] of the players' tokens there
  st.players.forEach((p, seat) => p.tokens.forEach((t) => (at[t.location] = at[t.location] || []).push(seat)));
  for (const t of st.board_tokens) {
    if (t.location === 'association_3') {
      const continent = t.type.replace('partner-', '');
      const pos = ASSOC.partner[continent];
      if (pos) {
        put('image', { href: iconUrl(ICON_IDS[continent]), x: pos[0] - 109, y: pos[1] - 87, width: 218, height: 174 }, undefined, t.type);
        pickable(pos[0] - 109, pos[1] - 87, 218, 174, (a) => a.args.task === 'partner' && a.args.continent === continent, 'Take this partner zoo');
      }
    } else if (t.location === 'association_4') {
      const pos = ASSOC.university[mw ? 'mw' : 'base'][t.type];
      if (pos && ICON_IDS[t.type]) {
        put('image', { href: iconUrl(ICON_IDS[t.type]), x: pos[0] - 115, y: pos[1] - 87, width: 230, height: 174 }, undefined, t.type);
        pickable(pos[0] - 115, pos[1] - 87, 230, 174, (a) => a.args.task === 'university' && a.args.kind === t.type, 'Take this university');
      }
    }
  }
  const workerAt = (cx, cy, seat, tip) => {          // BGA's worker meeple of the player's colour (282x277), standing on the slot
    const w = 92, h = w * 277 / 282;
    put('image', { href: workerUrl(seat), x: cx - w / 2, y: cy - h / 2, width: w, height: h }, undefined, tip);
  };
  // a cube of the fan site's picture (web/cubes, as on the base projects), centred on (x, y)
  const cubeAt = (x, y, colour, tip) => {
    const g = svg('image', { href: pieceUrl('cubes', colour), x: x - 37, y: y - 39, width: 74, height: 74 });
    if (tip) { const t = svg('title'); t.textContent = tip; g.append(t); }
    s.append(g);
  };
  const blocked = unusedColor();                     // 2 players: the left donation cells of 5 / 7 / 10 money are covered by cubes of a colour nobody plays
  for (const k of [1, 3, 5]) cubeAt(ASSOC.donation[k][0], ASSOC.donation[k][1], blocked, 'Blocked in a 2 player game');
  ASSOC.donation.forEach(([x, y], k) => (at['association_0_' + k] || []).forEach((seat) => cubeAt(x, y, seatRawColor(seat), S.replay.players[seat].name + ': donation')));      // a donation is a cube of the player's colour
  for (const [n, [cx, cy, xs]] of Object.entries(ASSOC.workers)) {
    (at['association_' + n] || []).slice(0, 3).forEach((seat, i) => {
      workerAt(cx + xs[i], cy, seat, S.replay.players[seat].name + ': worker');
    });
  }
  return s;
}

// a conservation icon with its number printed over it, like the conservation tracker in the side panel (nothing for a bonus of 0)
function conservationBonus(root, cx, cy, h, value, tip) {
  if (!value) return null;
  const id = ICON_IDS.conservation, [w0, h0] = S.iconSizes[id] || [h, h];
  const g = svg('g', { class: 'consbonus' });
  g.append(svg('image', { href: iconUrl(id), x: cx - (w0 * h / h0) / 2, y: cy - h / 2, width: w0 * h / h0, height: h }));
  const t = svg('text', { x: cx, y: cy + h * 0.18, class: 'cons-number', style: 'font-size:' + (h * 0.62).toFixed(1) + 'px' });
  t.textContent = value;
  g.append(t);
  if (tip) { const tt = svg('title'); tt.textContent = tip; g.append(tt); }
  root.append(g);
  return g;
}

// the picture of one bonus space: the purple income square or the yellow pentagon with its icon, centred on x 109 at height y of `root` (an svg). The bonus panel draws a column of
// them and the bar under the zoo (assocbar.js) a row, so a bonus looks the same in both.
export function slotGlyph(root, sl, y) {
  const bn = sl.bonus || {};
  const add = (tag, attrs, text) => { const e = svg(tag, attrs); if (text !== undefined) e.textContent = text; root.append(e); return e; };
  if (sl.kind === 'instant_income') add('rect', { x: 78, y: y - 31, width: 62, height: 62, rx: 12, fill: '#9a4ba7', stroke: '#5e2a6b', 'stroke-width': 3 });
  else add('image', { href: iconUrl(ICON_IDS.pentagon), x: 74, y: y - 36, width: 72, height: 71 });
  const icon = SLOT_ICON[bn.type] || ICON_IDS['bonus:' + bn.type];
  const size = bn.type === 'money' ? (sl.kind === 'instant_income' ? 46 : 42) : (sl.kind === 'instant_income' ? 44 : 50);
  if (bn.type === 'money') moneyTile(root, 109, y + 1, size);
  else if (bn.type === 'special-enclosure') {            // the choice of a large bird aviary / reptile house (/ large aquarium in a Marine Worlds game)
    const h = 24, row = (ids, cy, trailing) => {
      const ws = ids.map((id) => { const [w0, h0] = S.iconSizes[id] || [h, h]; return w0 * h / h0; });
      let x = 110 - (ws.reduce((a, b) => a + b, 0) + 10 * (ids.length - 1) + (trailing ? 6 : 0)) / 2;
      ids.forEach((id, n) => {
        add('image', { href: iconUrl(id), x, y: cy - h / 2, width: ws[n], height: h });
        x += ws[n];
        if (n < ids.length - 1 || trailing) { add('text', { x: x + 5, y: cy + 7, class: 'slot-label', style: 'font-size:18px' }, '/'); x += 10; }
      });
    };
    if (S.replay.marine_worlds) { row(['r9c9', 'r9c11'], y - 11, true); row(['r8c14'], y + 15, false); }      // the aquarium goes down a row so that all three fit the pentagon
    else row(['r9c9', 'r9c11'], y, false);
  } else if (icon && bn.type === 'Clever' && bn.value > 1) {          // 2 Clever abilities: the amount to the left of the icon (no overlap)
    const [w0, h0] = S.iconSizes[icon] || [size, size];
    add('image', { href: iconUrl(icon), x: 120 - (w0 * size / h0) / 2, y: y - size / 2 + 1, width: w0 * size / h0, height: size });
    add('text', { x: 90, y: y + 12, class: 'slot-number', style: 'font-size:32px' }, bn.value);
  } else if (icon && bn.type === 'Pouch' && bn.value > 1) {          // Pouch 2: the amount to the left of the icon, overlapping it a little
    const [w0, h0] = S.iconSizes[icon] || [size, size];
    add('image', { href: iconUrl(icon), x: 117 - (w0 * size / h0) / 2, y: y - size / 2 + 1, width: w0 * size / h0, height: size });
    add('text', { x: 92, y: y + 12, class: 'slot-number', style: 'font-size:32px' }, bn.value);       // (overlaps the token a little)
  } else if (icon) {
    const [w0, h0] = S.iconSizes[icon] || [size, size];
    add('image', { href: iconUrl(icon), x: 109 - (w0 * size / h0) / 2, y: y - size / 2 + 1, width: w0 * size / h0, height: size });
  } else add('text', { x: 109, y: y + 8, class: 'slot-label' }, '?');
  if (SLOT_NUMBER.has(bn.type) && bn.value) add('text', Object.assign({ x: 109, y: y + 13, class: 'slot-number' + (bn.type === 'conservation' ? ' dk conservation' : '') + (bn.type === 'xtoken' ? ' xnum' : '') + (bn.type === 'money' && String(bn.value).length > 1 ? ' two' : '') }, bn.type === 'money' && String(bn.value).length > 1 ? { dx: moneyDx(bn.value) } : {}), bn.value);
  if (bn.type === 'cut-down' && icon) {                  // the Cut Down ability: a white 1 with a black border near the left edge of the icon
    const [w0, h0] = S.iconSizes[icon] || [size, size];
    add('text', { x: 109 - (w0 * size / h0) / 2 + 8, y: y + 14, class: 'slot-number', style: 'font-size:28px' }, '1');
  }
}

export function bonusPanel(map, p, seat) {
  const slots = [...map.bonus_slots].sort((a, b) => a.index - b.index);
  const lead = slots.findIndex((x) => x.kind !== 'instant_income');
  const upper = lead === -1 ? slots.length : Math.max(lead, 1);              // the purple (income) slots come first, in the upper panel
  const groups = [slots.slice(0, upper), slots.slice(upper)];
  const used = p.flags.bonus_used || 0;
  const H = 720;                                                           // as tall as the zoo map next to it (map 1122x976 beside a panel 16% of the row)
  const rowH = (H - 118 - 12 - 13 - 2 * 20) / slots.length;               // the rows share the space under the worker box
  const height1 = groups[0].length * rowH + 20, top2 = 118 + height1 + 13, height2 = groups[1].length * rowH + 20;
  const s = svg('svg', { class: 'bonuspanel', viewBox: '0 0 192 ' + H, role: 'img', 'aria-label': 'Bonus spaces of ' + S.replay.players[seat].name });
  const add = (tag, attrs, text) => { const e = svg(tag, attrs); if (text !== undefined) e.textContent = text; s.append(e); return e; };
  add('rect', { x: 0, y: 0, width: 192, height: H, rx: 0, fill: '#efe6cf' });

  // locked workers
  add('rect', { x: 14, y: 14, width: 148, height: 92, rx: 14, fill: '#f4a3a3', stroke: '#222', 'stroke-width': 3 });
  const locked = new Set(p.tokens.filter((t) => t.type === 'worker' && /^supply_\d$/.test(t.location)).map((t) => +t.location.slice(7)));
  const lockbox = add('g', { class: 'lockbox' });          // hovering the box lifts all the workers to show what unlocks under them (conservation of the 4th worker; T1: reputation of the first two)
  const lbAdd = (tag, attrs) => { const e = svg(tag, attrs); lockbox.append(e); return e; };
  [1, 2, 3].forEach((k, i) => {
    const cx = 40 + i * 48;     // slots 18..62, 66..110, 114..158 stay inside the box (x 14..162)
    lbAdd('image', { href: '/assets/worker_slot.webp', x: cx - 23, y: 37, width: 46, height: 46 });          // (the empty worker slot of the association board, scripts/build_worker_slot.py)
    if (k === 3) conservationBonus(lockbox, cx, 72, 38, (map.association_bonuses || {}).last_worker, '4th worker: ' + (map.association_bonuses || {}).last_worker + ' conservation');
    else if (map.id === '11' && k === 2) {               // map 11 (Caves): the middle locked worker gives an action card upgrade, shown under the worker
      const id = ICON_IDS['bonus:upgrade-card'], [w0, h0] = S.iconSizes[id] || [38, 38], h = 40, w = w0 * h / h0;
      const g = svg('g', { class: 'consbonus' });
      g.append(svg('image', { href: iconUrl(id), x: cx - w / 2, y: 72 - h / 2, width: w, height: h }));
      const tt = svg('title'); tt.textContent = 'Worker 2: an action card upgrade'; g.append(tt);
      lockbox.append(g);
    }
    else if (map.id === 'T1') {                          // T1: the first and the second worker also give 1 reputation, shown under the worker
      const id = ICON_IDS.reputation, [w0, h0] = S.iconSizes[id] || [38, 38], h = 38, w = w0 * h / h0;
      const g = svg('g', { class: 'consbonus' });
      g.append(svg('image', { href: iconUrl(id), x: cx - w / 2, y: 72 - h / 2, width: w, height: h }));
      const t = svg('text', { x: cx, y: 72 + h * 0.2, class: 'cons-number rep-number', style: 'font-size:' + (h * 0.62).toFixed(1) + 'px' });
      t.textContent = '1';
      g.append(t);
      const tt = svg('title'); tt.textContent = 'Worker ' + k + ': 1 reputation'; g.append(tt);
      lockbox.append(g);
    }
    if (!locked.has(k)) return;
    const w = 38, h = w * 277 / 282;                     // BGA's worker meeple of the player's colour
    const img = lbAdd('image', { href: workerUrl(seat), x: cx - w / 2, y: 61 - h / 2, width: w, height: h, class: 'lift' });
    const tip = svg('title');
    tip.textContent = 'Worker ' + k + ' (locked)';
    img.append(tip);
  });
  lockbox.append(svg('rect', { x: 14, y: 14, width: 148, height: 92, rx: 14, fill: 'transparent' }));      // hover area: the whole box

  const drawGroup = (list, top, height, rowY) => {
    add('rect', { x: 14, y: top, width: 148, height, rx: 14, fill: '#fff', stroke: '#222', 'stroke-width': 3 });
    list.forEach((sl, i) => {
      const y = rowY(i);
      slotGlyph(s, sl, y);
      const pick = FORK ? forkActs((a) => a.kind === 'choose_bonus' && a.player === seat && a.args.bonus === sl.index) : [];
      if (pick.length) {                                   // the fork: a bonus to unlock is chosen by clicking its slot
        const hit = add('rect', { x: 16, y: y - rowH / 2 + 1, width: 144, height: rowH - 2, rx: 12, class: 'bonuspick' + (S.forkBonus === sl.index ? ' on' : '') });
        hit.addEventListener('click', () => { S.forkBonus = sl.index; render(); });
      }
      if (!(used & (1 << sl.index))) {                     // the cube is still on the slot: its bonus has not been chosen yet
        const cx = 46, c = add('image', { href: pieceUrl('cubes', seatRawColor(seat)), x: cx - 26, y: y - 27, width: 52, height: 52 });
        const tip = svg('title');
        tip.textContent = S.replay.players[seat].name + ': bonus ' + (sl.index + 1) + ' not chosen yet';
        c.append(tip);
      }
    });
  };
  drawGroup(groups[0], 118, height1, (i) => 118 + 10 + rowH / 2 + rowH * i);
  if (groups[0].length) add('image', { href: iconUrl('r1c1'), x: 144, y: 118 + height1 / 2 - 33, width: 40, height: 66 });
  drawGroup(groups[1], top2, height2, (i) => top2 + 10 + rowH / 2 + rowH * i);
  if (groups[1].length) add('image', { href: iconUrl('r8c9'), x: 148, y: top2 + 10 + rowH * 1.5 - 22, width: 38, height: 44 });
  add('image', { href: iconUrl('r7c4'), x: 134, y: top2 - 6.5 - 28, width: 50, height: 56 });
  return s;
}

// the player's association board, drawn here in the layout of BGA's board (351 x 1776 units, 4 partner zoo slots over 3 university slots, bottom to top; BGA's own picture
// squeezed the universities, so only the handshakes and the worker badge are cut out of it): a box of 4 partner zoo slots, 34 units, a box of 3 university slots, 24 units of margin
const STRIP_H = 1776, STRIP_PITCH = (STRIP_H - 82) / 7, STRIP_BOX2 = 24 + 4 * STRIP_PITCH + 34;
export const STRIP = { partner: {}, university: {} };                    // y of the middle of the slots; x is always 175
for (let n = 1; n <= 4; n++) STRIP.partner[n] = 24 + (4 - n) * STRIP_PITCH + STRIP_PITCH / 2;
for (let n = 1; n <= 3; n++) STRIP.university[n] = STRIP_BOX2 + (3 - n) * STRIP_PITCH + STRIP_PITCH / 2;
export const SLOT_SIZE = { partner: [253, 198], university: [248, 175] };         // the silhouettes of the slots; a university has the proportions of its token (119 x 84)
const BGA_PARTNER_Y = { 1: 855, 2: 619, 3: 383, 4: 147 };                // where the handshakes are on BGA's picture
const UPGRADE_SETS = { '12': [1, 2], T1: [1, 2], '11': [1] };
export const stripUnits = (map) => (map.upgrade_sets || UPGRADE_SETS[map.id] ? 451 : 351);          // the width of the strip's view box: the lines of the upgrade sets use 50 units on each side

// the look of the strip (the bonus pentagons have an ink edge and a hard shadow like the zoo panels)
const ST = { paper: '#ede5d3', grid: 'rgba(0,0,0,.07)', pink: '#dbadc8', blue: '#93d4e7', blue2: '#92d2e8', frame: '#000', frameW: 8, shadow: 0, plaque: ['#000', .20], dark: ['#000', .17], uni: ['#000', .30], hex: '#F2E23D', hexLine: '#17262B', hexW: 3.1, hexShadow: 3.2, hexSheen: 0 };
const BONUS_H = 129;                                                     // the height of the yellow pentagons of the worker / conservation bonuses
export function associationStrip(p, map, seat) {
  const wide = stripUnits(map) === 451;
  const s = svg('svg', { class: 'strip', viewBox: (wide ? '-50 0 451 ' : '0 0 351 ') + STRIP_H, role: 'img', 'aria-label': 'Partner zoos and universities' });
  const put = (tag, attrs) => { const e = svg(tag, attrs); s.append(e); return e; };
  const BGA = '/assets/association_player_board.webp';
  const grid = put('defs', {});
  const pat = svg('pattern', { id: 'stripgrid', x: 24, y: 24, width: 48, height: 48, patternUnits: 'userSpaceOnUse' });
  pat.append(svg('path', { d: 'M0 0H48M0 0V48', fill: 'none', stroke: ST.grid, 'stroke-width': 2 }));
  grid.append(pat);
  put('rect', { x: wide ? -50 : 0, y: 0, width: wide ? 451 : 351, height: STRIP_H, fill: ST.paper });
  put('rect', { x: wide ? -50 : 0, y: 0, width: wide ? 451 : 351, height: STRIP_H, fill: 'url(#stripgrid)' });
  put('rect', { x: 28, y: 24, width: 295, height: 2 * STRIP_PITCH, fill: ST.pink });            // partner zoos 3 and 4 (pink), 1 and 2 (blue), the universities (blue)
  put('rect', { x: 28, y: 24 + 2 * STRIP_PITCH, width: 295, height: 2 * STRIP_PITCH, fill: ST.blue });
  put('rect', { x: 28, y: STRIP_BOX2, width: 295, height: 3 * STRIP_PITCH, fill: ST.blue2 });
  const hs = svg('g', { id: 'strip-hs' + seat });                           // the handshake (vector) of a partner zoo slot: a plaque and the darker hands
  hs.append(svg('path', { d: HANDSHAKE.plaque, fill: ST.plaque[0], 'fill-opacity': ST.plaque[1], 'fill-rule': 'evenodd' }), svg('path', { d: HANDSHAKE.dark, fill: ST.dark[0], 'fill-opacity': ST.dark[1], 'fill-rule': 'evenodd' }));
  grid.append(hs);
  for (let n = 1; n <= 4; n++) put('use', { href: '#strip-hs' + seat, transform: 'translate(' + (175 - HANDSHAKE.cx) + ' ' + (STRIP.partner[n] - HANDSHAKE.cy) + ')' });
  const uk = SLOT_SIZE.university[0] / 119;                               // the university slots: the silhouette of the token (vector)
  for (let n = 1; n <= 3; n++) put('path', { d: UNIVERSITY, transform: 'translate(' + (175 - (1 + 119 / 2) * uk) + ' ' + (STRIP.university[n] - (1 + 84 / 2) * uk) + ') scale(' + uk + ')', fill: ST.uni[0], 'fill-opacity': ST.uni[1] });
  if (ST.shadow) for (const [y, h] of [[24, 4 * STRIP_PITCH], [STRIP_BOX2, 3 * STRIP_PITCH]]) put('rect', { x: 28, y: y + ST.shadow, width: 295, height: h, rx: 26, fill: 'none', stroke: ST.frame, 'stroke-width': ST.frameW });
  put('rect', { x: 28, y: 24, width: 295, height: 4 * STRIP_PITCH, rx: 26, fill: 'none', stroke: ST.frame, 'stroke-width': ST.frameW });
  put('rect', { x: 28, y: STRIP_BOX2, width: 295, height: 3 * STRIP_PITCH, rx: 26, fill: 'none', stroke: ST.frame, 'stroke-width': ST.frameW });
  // the badge on the border between the pink and the blue slots (a person card of level II), drawn as a vector at x 45 on the line between the two boxes
  const by = 24 + 2 * STRIP_PITCH, bg = svg('g', { class: 'stripbadge' });
  bg.append(svg('circle', { cx: 45, cy: by, r: 41, fill: '#fff' }), svg('circle', { cx: 45, cy: by, r: 36, fill: '#C466AC' }),
    svg('rect', { x: 24, y: by - 31, width: 42, height: 62, rx: 6, fill: '#fff', stroke: '#3B1034', 'stroke-width': 2.4 }),
    svg('path', { d: 'M24 ' + (by + 8) + 'H66V' + (by + 25) + 'a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6Z', fill: '#9B1B83' }),
    svg('circle', { cx: 45, cy: by - 14, r: 8.4, fill: '#2B2427' }),
    svg('path', { d: 'M29 ' + (by + 8) + 'C29 ' + (by - 2) + ' 36 ' + (by - 3) + ' 41 ' + (by - 5) + 'H49C54 ' + (by - 3) + ' 61 ' + (by - 2) + ' 61 ' + (by + 8) + 'Z', fill: '#2B2427' }));
  const ii = svg('text', { x: 45, y: by + 24, 'text-anchor': 'middle', style: "font:400 19px 'Park Num',system-ui,sans-serif;fill:#F8EDCB" }); ii.textContent = 'II';
  bg.append(ii);
  s.append(bg);
  // the bonuses of the slots (worker, conservation points) sit on a yellow pentagon, the same shape as the placement bonuses of the zoo map
  const bonusHex = (cx, cy, tip, cls, fillIn, Hh) => {
    const H = Hh || BONUS_H, g = svg('g', { class: cls }), k = H / 115;
    const d = pentagon(cx, cy, H - ST.hexW * k, 9 * k);
    if (ST.hexShadow) g.append(svg('path', { d, transform: 'translate(0 ' + ST.hexShadow + ')', fill: ST.hexLine, stroke: ST.hexLine, 'stroke-width': ST.hexW * k, 'stroke-linejoin': 'round' }));
    g.append(svg('path', { d, fill: ST.hex, stroke: ST.hexLine, 'stroke-width': ST.hexW * k, 'stroke-linejoin': 'round' }));
    if (ST.hexSheen) g.append(svg('path', { d: pentagon(cx, cy, H * .72, 6 * k), fill: 'none', stroke: '#fff', 'stroke-opacity': ST.hexSheen, 'stroke-width': 2.4 * k, 'stroke-linejoin': 'round' }));
    s.append(g);
    fillIn(g, cx, cy + H * 0.0375, H * (cls === 'hirebonus' ? 0.6 : 0.62));
    const tt = svg('title'); tt.textContent = tip; g.append(tt);
    return g;
  };
  const consInHex = (cx, cy, value, tip) => value && bonusHex(cx, cy, tip, 'consbonus', (g, x, y, h) => conservationBonus(g, x, y, h, value, null));
  const bonuses = map.association_bonuses || {};            // conservation points of the 4th partner zoo and the 3rd university, shown on their (empty) slots
  consInHex(175, STRIP.partner[4], bonuses.partner4, '4th partner zoo: ' + bonuses.partner4 + ' conservation');
  consInHex(175, STRIP.university[3], bonuses.university3, '3rd university: ' + bonuses.university3 + ' conservation');
  const workerBonus = (cx, cy, tip, cls) => bonusHex(cx, cy, tip, cls, (g, x, y, h) => {
    const id = ICON_IDS['bonus:Worker'] || 'r5c13', [w0, h0] = S.iconSizes[id] || [h, h], w = w0 * h / h0;
    g.append(svg('image', { href: iconUrl(id), x: x - w / 2, y: y - h / 2, width: w, height: h }));
  });
  workerBonus(175, STRIP.partner[3], '3rd partner zoo: hire a worker', 'hirebonus');           // the 3rd partner zoo hires a worker on every map
  // where the zoo map awards an action card upgrade: most maps on the 2nd partner zoo and the 2nd university; maps 12 and T1 on the first and the second *set*
  // (a partner zoo and a university), map 11 on the first set: a curved line joins the two slots of a set with the upgrade icon in its middle and an arrow from
  // each end pointing at it
  const upgradeIcon = ICON_IDS['bonus:upgrade-card'] || 'r10c5';
  const putUpgrade = (cx, cy, h, tip) => {                                        // the action card upgrade sits on a yellow pentagon like the other bonuses
    bonusHex(cx, cy, tip, 'upgradebonus', (g, x, y, hh) => {
      const [w0, h0] = S.iconSizes[upgradeIcon] || [hh, hh], w = w0 * hh / h0;
      g.append(svg('image', { href: iconUrl(upgradeIcon), x: x - w / 2, y: y - hh / 2, width: w, height: hh }));
    }, h);
  };
  const sets = map.upgrade_sets || UPGRADE_SETS[map.id];                          // (the map editor gives the sets itself)
  if (!sets) {
    putUpgrade(175, STRIP.partner[2], BONUS_H, 'Upgrade an action card (2nd partner zoo)');
    putUpgrade(175, STRIP.university[2], BONUS_H, 'Upgrade an action card (2nd university)');
  } else {
    const items = sets.map((n, i) => ({ n, kind: 'upgrade', side: i % 2 === 0 ? 1 : -1 }));                      // the first set on the left margin, the second on the right
    // map 11 (Caves): the second set (2 partner zoos + 2 universities) gives an Extra Shift (the Extra Shift tile), the third one 1 conservation. The sets overlap, so the lines cross once: the
    // third one bulges further out on the left
    if (map.id === '11') items.push({ n: 2, kind: 'extra-shift', side: -1 }, { n: 3, kind: 'conservation', side: 1, outer: true });
    items.forEach(({ n, kind, side, outer }) => {
      const ex = side === 1 ? 34 : 351 - 34, cx = side === 1 ? (outer ? -58 : -34) : 351 + 34;
      const y1 = STRIP.partner[n], y2 = STRIP.university[n];
      const pt = (t) => [(1 - t) * (1 - t) * ex + 2 * (1 - t) * t * cx + t * t * ex, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ((y1 + y2) / 2) + t * t * y2];
      s.append(svg('path', { d: 'M' + ex + ' ' + y1 + ' Q' + cx + ' ' + (y1 + y2) / 2 + ' ' + ex + ' ' + y2, fill: 'none', stroke: '#3a2616', 'stroke-width': 7, 'stroke-linecap': 'round' }));
      for (const t of [0.34, 0.66]) {                                                    // arrowheads on the line, pointing towards the middle
        const [x, y] = pt(t), [x2, y2b] = pt(t + (t < 0.5 ? 0.04 : -0.04));
        const ang = Math.atan2(y2b - y, x2 - x), L = 26, W = 14;
        const tip = [x2, y2b], base = [x2 - Math.cos(ang) * L, y2b - Math.sin(ang) * L];
        const nx = -Math.sin(ang) * W, ny = Math.cos(ang) * W;
        s.append(svg('polygon', { points: [tip, [base[0] + nx, base[1] + ny], [base[0] - nx, base[1] - ny]].map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' '), fill: '#3a2616' }));
      }
      const [mx, my] = pt(0.5);
      if (kind === 'conservation') conservationBonus(s, mx, my, 84, 1, '1 conservation for the third set: a 3rd partner zoo and a 3rd university');
      else if (kind === 'extra-shift') {                                                  // the Extra Shift tile of the icon sheet (its own pentagon), the one of the Worker hex of map 11
        const id = S.iconNames['bonus-extra-shift'] || 'r5c15', [w0, h0] = S.iconSizes[id] || [84, 84], w = w0 * 84 / h0;
        const img = svg('image', { href: iconUrl(id), x: mx - w / 2, y: my - 42, width: w, height: 84, class: 'extrashiftbonus' });
        const tt = svg('title'); tt.textContent = 'Extra Shift for the second set: a 2nd partner zoo and a 2nd university'; img.append(tt);
        s.append(img);
      }
      else putUpgrade(mx, my, 92, 'Upgrade an action card (set ' + n + ': a partner zoo and a university)');
    });
  }
  // the partner zoos and universities of the player; one that arrived gets a green frame, one that left stays as a ghost with a red frame
  // (the same fade as the cards)
  const drawToken = (kind, slot, type, cls) => {
    const y = STRIP[kind][slot];
    const id = ICON_IDS[kind === 'partner' ? type.replace('partner-', '') : type];
    if (!y || !id) return null;
    // the token moves from the association board to its slot: scaled so that its visible part (without the transparent edge of the picture) fills the slot
    const [w0, h0] = S.iconSizes[id] || [190, 152];
    const [bx, by, bw, bh] = kind === 'partner' ? [5, 4, 179, 142] : w0 === 121 ? [1, 1, 119, 84] : [7, 6, 119, 84];       // (the category universities and the generic one are 121 px wide pictures, the others 137)       // the drawn part of the picture (no transparent edge / shadow)
    const [slotW, slotH] = SLOT_SIZE[kind];
    const kx = slotW / bw, ky = kx;                                                 // (the slots have the proportions of their tokens: nothing is stretched)
    const w = w0 * kx, h = h0 * ky;
    const g = svg('g', cls ? { class: cls } : {});
    const img = svg('image', { href: iconUrl(id), x: 175 - (bx + bw / 2) * kx, y: y - (by + bh / 2) * ky, width: w, height: h, preserveAspectRatio: 'none' });
    const tip = svg('title');
    tip.textContent = type;
    img.append(tip);
    g.append(img);
    if (cls) g.append(svg('rect', { x: 175 - slotW / 2 - 4, y: y - slotH / 2 - 4, width: slotW + 8, height: slotH + 8, rx: 14, class: 'frame' }));
    return g;
  };
  const toks = p.tokens.filter((t) => /^(partner|university)_\d$/.test(t.location));
  const keyOf = (t) => t.location + '|' + t.type;
  const z = zoneNew(seat + ':association', toks.map(keyOf));
  for (const t of toks) {
    const [kind, slot] = t.location.split('_');
    const g = drawToken(kind, slot, t.type, z.isNew(keyOf(t)) ? 'tok-new' : '');
    if (g) s.append(g);
  }
  for (const gone of z.gone) {
    const [loc, type] = gone.key.split('|');
    const [kind, slot] = loc.split('_');
    const g = drawToken(kind, slot, type, 'tok-gone');
    if (!g) continue;
    g.addEventListener('animationend', () => g.remove());
    s.append(g);
  }
  return s;
}

