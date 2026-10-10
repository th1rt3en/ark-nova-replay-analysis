// [module] Association board, conservation bonus panel and the association strip of a player.
import { mix, seatColor, svg } from './util.js';
import { FORK, S } from './state.js';
import { zoneNew } from './cards.js';
import { ICON_IDS, SLOT_ICON, SLOT_NUMBER, iconUrl, moneyTile, workerUrl } from './icons.js';
import { bindActs, forkActs } from './action-bar.js';
import { render } from './main.js';

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

const BLOCKED_COLORS = ['#d9372b', '#2fa84f', '#e8c030', '#e07a1f', '#7a4fd0'];
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
  // a cube like the ones on the base projects (isometric, three shades of the colour), centred on (x, y)
  const cubeAt = (x, y, colour, tip) => {
    const g = svg('g', { transform: 'translate(' + x + ' ' + (y - 2) + ') scale(1.55)' });
    const edge = mix(colour, '#000000', .6);
    for (const [pts, fill] of [['0,-19 19,-9 0,2 -19,-9', mix(colour, '#ffffff', .45)], ['-19,-9 0,2 0,21 -19,10', colour], ['19,-9 0,2 0,21 19,10', mix(colour, '#000000', .3)]]) {
      g.append(svg('polygon', { points: pts, fill, stroke: edge, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }));
    }
    if (tip) { const t = svg('title'); t.textContent = tip; g.append(t); }
    s.append(g);
  };
  const blocked = unusedColor();                     // 2 players: the left donation cells of 5 / 7 / 10 money are covered by cubes of a colour nobody plays
  for (const k of [1, 3, 5]) cubeAt(ASSOC.donation[k][0], ASSOC.donation[k][1], blocked, 'Blocked in a 2 player game');
  ASSOC.donation.forEach(([x, y], k) => (at['association_0_' + k] || []).forEach((seat) => cubeAt(x, y, seatColor(seat), S.replay.players[seat].name + ': donation')));      // a donation is a cube of the player's colour
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

export function bonusPanel(map, p, seat) {
  const color = seatColor(seat);
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
  add('rect', { x: 0, y: 0, width: 192, height: H, rx: 10, fill: '#efe6cf' });

  // locked workers
  add('rect', { x: 14, y: 14, width: 148, height: 92, rx: 14, fill: '#f4a3a3', stroke: '#222', 'stroke-width': 3 });
  const locked = new Set(p.tokens.filter((t) => t.type === 'worker' && /^supply_\d$/.test(t.location)).map((t) => +t.location.slice(7)));
  const lockbox = add('g', { class: 'lockbox' });          // hovering the box lifts all the workers to show what unlocks under them (conservation of the 4th worker; T1: reputation of the first two)
  const lbAdd = (tag, attrs) => { const e = svg(tag, attrs); lockbox.append(e); return e; };
  [1, 2, 3].forEach((k, i) => {
    const cx = 40 + i * 48;     // slots 18..62, 66..110, 114..158 stay inside the box (x 14..162)
    lbAdd('rect', { x: cx - 22, y: 26, width: 44, height: 70, rx: 8, fill: '#f9c9c9' });
    if (k === 3) conservationBonus(lockbox, cx, 72, 38, (map.association_bonuses || {}).last_worker, '4th worker: ' + (map.association_bonuses || {}).last_worker + ' conservation');
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
      const y = rowY(i), bn = sl.bonus || {};
      if (sl.kind === 'instant_income') add('rect', { x: 78, y: y - 31, width: 62, height: 62, rx: 12, fill: '#9a4ba7', stroke: '#5e2a6b', 'stroke-width': 3 });
      else add('image', { href: iconUrl(ICON_IDS.pentagon), x: 74, y: y - 36, width: 72, height: 71 });
      const icon = SLOT_ICON[bn.type] || ICON_IDS['bonus:' + bn.type];
      const size = bn.type === 'money' ? (sl.kind === 'instant_income' ? 46 : 42) : (sl.kind === 'instant_income' ? 44 : 50);
      if (bn.type === 'money') moneyTile(s, 109, y + 1, size);
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
      } else if (icon && (bn.type === 'xtoken' || bn.type === 'Pouch') && bn.value > 1) {          // several X tokens / Pouch 2: the amount to the left of the icon, overlapping it a little
        const [w0, h0] = S.iconSizes[icon] || [size, size];
        add('image', { href: iconUrl(icon), x: 117 - (w0 * size / h0) / 2, y: y - size / 2 + 1, width: w0 * size / h0, height: size });
        add('text', { x: 92, y: y + 12, class: 'slot-number', style: 'font-size:32px' }, bn.value);       // (overlaps the token a little)
      } else if (icon) {
        const [w0, h0] = S.iconSizes[icon] || [size, size];
        add('image', { href: iconUrl(icon), x: 109 - (w0 * size / h0) / 2, y: y - size / 2 + 1, width: w0 * size / h0, height: size });
      } else add('text', { x: 109, y: y + 8, class: 'slot-label' }, '?');
      if (SLOT_NUMBER.has(bn.type) && bn.value && !(bn.type === 'xtoken' && bn.value > 1)) add('text', { x: 109, y: y + 13, class: 'slot-number' }, bn.value);
      if (bn.type === 'cut-down' && icon) {                  // the Cut Down ability: a white 1 with a black border near the left edge of the icon
        const [w0, h0] = S.iconSizes[icon] || [size, size];
        add('text', { x: 109 - (w0 * size / h0) / 2 + 8, y: y + 14, class: 'slot-number', style: 'font-size:28px' }, '1');
      }
      const pick = FORK ? forkActs((a) => a.kind === 'choose_bonus' && a.player === seat && a.args.bonus === sl.index) : [];
      if (pick.length) {                                   // the fork: a bonus to unlock is chosen by clicking its slot
        const hit = add('rect', { x: 16, y: y - rowH / 2 + 1, width: 144, height: rowH - 2, rx: 12, class: 'bonuspick' + (S.forkBonus === sl.index ? ' on' : '') });
        hit.addEventListener('click', () => { S.forkBonus = sl.index; render(); });
      }
      if (!(used & (1 << sl.index))) {                     // the cube is still on the slot: its bonus has not been chosen yet
        const cx = 46, c = add('g', { transform: 'translate(' + cx + ' ' + (y - 1) + ')' });
        const face = (pts, fill) => c.append(svg('polygon', { points: pts, fill, stroke: mix(color, '#000000', .6), 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
        face('0,-19 19,-9 0,2 -19,-9', mix(color, '#ffffff', .45));
        face('-19,-9 0,2 0,21 -19,10', color);
        face('19,-9 0,2 0,21 19,10', mix(color, '#000000', .3));
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

// the player's association board (web/assets/association_player_board.webp, 351x1776): partner zoo slots 1-4 and university slots 1-3, bottom to top
const STRIP = {
  partner: { 1: 855, 2: 619, 3: 383, 4: 147 },          // y of the middle of the slot picture (measured on the silhouettes); x is always 175
  university: { 1: 1612, 2: 1378, 3: 1144 },
};
const SLOT_SIZE = { partner: [253, 198], university: [248, 199] };         // the silhouettes of the slots on the picture of the player board
export function associationStrip(p, map, seat) {
  const s = svg('svg', { class: 'strip', viewBox: '-50 0 451 1776', role: 'img', 'aria-label': 'Partner zoos and universities' });
  s.append(svg('image', { href: '/assets/association_player_board.webp', x: 0, y: 0, width: 351, height: 1776 }));
  const bonuses = map.association_bonuses || {};            // conservation points of the 4th partner zoo and the 3rd university, shown on their (empty) slots
  conservationBonus(s, 175, STRIP.partner[4] + 22, 92, bonuses.partner4, '4th partner zoo: ' + bonuses.partner4 + ' conservation');
  conservationBonus(s, 175, STRIP.university[3] + 22, 92, bonuses.university3, '3rd university: ' + bonuses.university3 + ' conservation');
  // the 3rd partner zoo hires a worker on every map: the worker bonus on its yellow pentagon, like the bonus of the 8 reputation space, on the (empty) 3rd slot
  {
    const H = 84, cy = STRIP.partner[3] + 22, g = svg('g', { class: 'hirebonus' });
    const picture = (id, y, h) => {
      const [w0, h0] = S.iconSizes[id] || [h, h], w = w0 * h / h0;
      g.append(svg('image', { href: iconUrl(id), x: 175 - w / 2, y: y - h / 2, width: w, height: h }));
    };
    picture(ICON_IDS.pentagon, cy, H);                                                // (the proportions of a placement bonus: pentagon 80, icon 48 three units lower)
    picture(ICON_IDS['bonus:Worker'] || 'r5c13', cy + H * 3 / 80, H * 48 / 80);
    const tt = svg('title'); tt.textContent = '3rd partner zoo: hire a worker'; g.append(tt);
    s.append(g);
  }
  // where the zoo map awards an action card upgrade: most maps on the 2nd partner zoo and the 2nd university; maps 12 and T1 on the first and the second *set*
  // (a partner zoo and a university), map 11 on the first set: a curved line joins the two slots of a set with the upgrade icon in its middle and an arrow from
  // each end pointing at it
  const upgradeIcon = ICON_IDS['bonus:upgrade-card'] || 'r10c5';
  const putUpgrade = (cx, cy, h, tip) => {
    const [w0, h0] = S.iconSizes[upgradeIcon] || [h, h], w = w0 * h / h0;
    const img = svg('image', { href: iconUrl(upgradeIcon), x: cx - w / 2, y: cy - h / 2, width: w, height: h });
    const t = svg('title'); t.textContent = tip; img.append(t);
    s.append(img);
  };
  const SETS = { '12': [1, 2], T1: [1, 2], '11': [1] };
  const sets = map.upgrade_sets || SETS[map.id];                          // (the map editor gives the sets itself)
  if (!sets) {
    putUpgrade(175, STRIP.partner[2] + 22, 84, 'Upgrade an action card (2nd partner zoo)');
    putUpgrade(175, STRIP.university[2] + 22, 84, 'Upgrade an action card (2nd university)');
  } else {
    const items = sets.map((n) => ({ n, kind: 'upgrade' }));
    if (map.id === '11') items.push({ n: 3, kind: 'conservation' });                  // map 11 (Caves): the third set (3 partner zoos + 3 universities) gives 1 conservation
    items.forEach(({ n, kind }, i) => {
      const side = i % 2 === 0 ? 1 : -1, ex = side === 1 ? 34 : 351 - 34, cx = side === 1 ? -34 : 351 + 34;        // the first set on the left margin, the second on the right
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
      else putUpgrade(mx, my, 84, 'Upgrade an action card (set ' + n + ': a partner zoo and a university)');
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
    const kx = slotW / bw, ky = kind === 'partner' ? kx : slotH / bh;               // a university is a little flatter than its slot: stretched to fill it
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

