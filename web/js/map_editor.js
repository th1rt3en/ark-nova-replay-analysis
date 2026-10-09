// [module] The map editor (map_editor.html): the blank map, rock / water hexes, placement bonuses, upgrade requirements, the project bonus spaces on the left of the map and the worker /
// partner zoo / university spaces on the right, remove, undo / redo, export as JSON.
// The board is the blank map of web/map_editor (scripts/build_blank_map.py): 58 plain hexes at (96 + 115 x, 88 + 66.5 y). The pieces are drawn like the viewer draws a map
// (board.js `zooBoard`; association.js `bonusPanel` and `associationStrip` for the two panels next to the map). The JSON follows data_manual/maps_geometry/<id>.json
// (`hexes`, `placement_bonuses`, `special_hexes` of the kind `upgrade_flag`, `bonus_slots`) and adds `association` (the spaces on the right and where the upgrade lies).
import { $, el, svg } from './util.js';
import { S } from './state.js';
import { ICON_IDS, SHOW_VALUE, applyIconNames, iconUrl, moneyTile } from './icons.js';
import { associationStrip, bonusPanel } from './association.js';

const MAP = { x0: 96, y0: 88, dx: 115, dy: 66.5 };
const R = MAP.dx / 1.5, HH = 133, TILE = [156, 135];
const CELLS = [];
for (let x = 0; x < 9; x++) for (let y = 0; y < 13; y++) if ((x + y) % 2 === 1) CELLS.push([x, y]);
const key = (x, y) => x + ',' + y;
const centre = (x, y) => [MAP.x0 + x * MAP.dx, MAP.y0 + y * MAP.dy];

// the placement bonuses (the types of data_manual/maps_geometry, and the ones that the data does not have yet), with the default number of the ones that have one
const BONUSES = [
  ['money', 'Money', 5], ['reputation', 'Reputation', 1], ['appeal', 'Appeal', 1], ['xtoken', 'X token', 1], ['Scavenging', 'Scavenging', 3], ['Multiplier', 'Multiplier', 2],
  ['take-in-range-or-deck', 'Take a card', 1], ['bonus-sponsor', 'Sponsor', 1], ['search-sponsor-person', 'Find a person', 1], ['Clever', 'Clever', 1], ['digging', 'Digging', 1],
  ['rescue', 'Rescue', 1], ['Mark', 'Mark', 1], ['Worker', 'Worker', 1], ['extra-shift', 'Extra shift', 1], ['Pouch', 'Pouching X', 1], ['perception', 'Perception X', 1],
  ['Partner-Zoo', 'Partner zoo', 1], ['Fac', 'University', 1], ['kiosk', 'Kiosk', 1], ['pavilion', 'Pavilion', 1], ['store', 'Store', 1], ['conceal', 'Conceal', 1],
  ['shark-attack', 'Shark attack', 1], ['adapt', 'Adapt', 1], ['wave', 'Wave', 1],
];
// the project bonuses (src/ark_nova/data/project_bonuses.json, the pictures are web/map_editor/project_bonuses): `as` = the bonus type and number they stand for in the rest of the data
const PROJECT = [
  ['upgrade', 'Upgrade', { type: 'upgrade-card', value: 1 }], ['call-worker', 'Call worker', { type: 'Worker', value: 1 }], ['reputation-2', '2 reputation', { type: 'reputation', value: 2 }],
  ['x-3', '3 X tokens', { type: 'xtoken', value: 3 }], ['build-size-3', 'Size 3', { type: 'size-3', value: 1 }], ['draw-3', 'Draw 3', { type: 'take-in-range-or-deck', value: 3 }],
  ['money-5', '5 money', { type: 'money', value: 5 }], ['money-10', '10 money', { type: 'money', value: 10 }], ['double-token', 'Double token', { type: 'Multiplier', value: 2 }],
  ['university', 'University', { type: 'Fac', value: 1 }], ['partner-zoo', 'Partner zoo', { type: 'Partner-Zoo', value: 1 }], ['ignore-3-requirements', 'Ignore 3', { type: 'ignore-3-requirements', value: 1 }],
  ['base-project-icon-plus-1', 'Project icon +1', { type: 'base-project-icon-plus-1', value: 1 }], ['overtime', 'Overtime', { type: 'overtime', value: 1 }],
  ['snap-and-hand-limit-plus-1', 'Snap, hand +1', { type: 'snap-and-hand-limit-plus-1', value: 1 }], ['sponsor-money', 'Sponsor money', { type: 'sponsor-money', value: 1 }],
  ['adaptation-3', 'Adaptation 3', { type: 'adaptation-3', value: 1 }], ['posture-3', 'Posturing 3', { type: 'posture-3', value: 1 }],
];
const NUMBERED = new Set(['money', 'reputation', 'appeal', 'Scavenging', 'Pouch', 'perception']);          // the bonuses whose number the user types
const typedValue = Object.fromEntries(BONUSES.map(([t, , v]) => [t, v]));
const EXTRA_ICONS = { 'extra-shift': 'r5c15', perception: 'r7c10', digging: 'r4c2', rescue: 'r9c13', 'search-sponsor-person': 'r4c13' };      // icons of the new bonuses (names.json: bonus-extra-shift, perception, digging, map10, search-sponsor-person)

// ---- state: everything the user can change (the history is a list of snapshots of it) ----------------------------------------------------------
const fresh = () => ({ terrain: {}, bonus: {}, flag: {}, panel: Array(7).fill(null), workers: Array(3).fill(null), partner: Array(4).fill(null), univ: Array(3).fill(null), nIncome: 4,
                       upgrade: { mode: 'second', sets: [1, 2] } });
let model = fresh();
let past = [], future = [];
const snap = () => JSON.stringify(model);
let tool = { kind: 'terrain', value: 'rock' };

// ---- drawing the pieces (at the origin of a group, so that they can be moved and scaled) ------------------------------------------------------------------
function put(g, tag, attrs, text) { const e = svg(tag, attrs); if (text !== undefined) e.textContent = text; g.append(e); return e; }
function iconBox(g, id, cx, cy, h) {
  const [w0, h0] = S.iconSizes[id] || [h, h];
  return put(g, 'image', { href: iconUrl(id), x: cx - (w0 * h / h0) / 2, y: cy - h / 2, width: w0 * h / h0, height: h });
}
function drawBonus(g, bn) {                                              // as zooBoard draws a placement bonus (a project bonus is its picture)
  if (bn.tile) { put(g, 'image', { href: '/map_editor/project_bonuses/' + bn.tile + '.webp', x: -41, y: -40, width: 82, height: 80 }); return; }
  const icon = EXTRA_ICONS[bn.type] || ICON_IDS['bonus:' + bn.type];
  if (bn.type === 'Digging' || bn.type === 'rescue') { iconBox(g, icon, 0, 0, 80); return; }          // r9c13 (map 10) already has its own background
  iconBox(g, ICON_IDS.pentagon, 0, 0, 80);
  if (bn.type === 'adapt') { iconBox(g, 'r10c15', -14, 3, 36); iconBox(g, 'r10c16', 15, 3, 36); }
  else if (bn.type === 'money') moneyTile(g, 0, 3, 48);
  else if ((bn.type === 'Scavenging' || bn.type === 'Pouch' || bn.type === 'perception') && icon) {          // the number to the left of the icon, overlapping it a little
    iconBox(g, icon, bn.value > 1 ? 9 : 0, 3, 44);
    if (bn.value > 1 || bn.type !== 'Scavenging') put(g, 'text', { x: -15, y: 14, class: 'bonus-number', style: 'font-size:34px;stroke-width:7px' }, bn.value);
  }
  else if (bn.type === 'pavilion') put(g, 'image', { href: '/enclosures/pavilion.webp', x: -23, y: -16, width: 46, height: 40 });
  else if (icon) iconBox(g, icon, 0, 3, bn.type === 'wave' ? 21 : 48);
  if (bn.type === 'appeal' && !icon) put(g, 'text', { x: 0, y: 6, class: 'bonus-label' }, '★');
  if (SHOW_VALUE.has(bn.type)) put(g, 'text', { x: 0, y: bn.type === 'money' ? 14 : 16, class: 'bonus-number', ...(bn.type === 'money' ? { style: 'font-size:36px;stroke-width:7px' } : {}) }, bn.value);
}
function drawFlag(g) {                                                    // the red wedge and the purple "II" shovel badge of a hex that needs the upgraded Build action
  const h = R * 0.866;
  put(g, 'polygon', { points: [[-R * 0.96, 3], [-R * 0.5, -h * 0.96], [R * 0.38, -h * 0.96], [-R * 0.1, 3]].map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' '), class: 'flag-wedge' });
  const br = 30, bx = 3, by = -h + br + 2;
  put(g, 'circle', { cx: bx, cy: by, r: br, class: 'flag-badge' });
  iconBox(g, 'r3c9', bx, by - 8, 29);
  put(g, 'text', { x: bx, y: by + 20, class: 'flag-label' }, 'II');
}
const group = (cx, cy, scale = 1) => svg('g', { transform: 'translate(' + cx + ' ' + cy + ')' + (scale === 1 ? '' : ' scale(' + scale + ')') });

// ---- the board and the two panels ----------------------------------------------------------------------------------------------------------------
const board = $('board');
const layers = {};
function buildBoard() {
  board.replaceChildren(svg('image', { href: '/map_editor/blank_map.png', x: 0, y: 0, width: 1122, height: 976 }));
  for (const name of ['terrain', 'flag', 'bonus', 'cells']) { layers[name] = svg('g', { class: 'layer-' + name }); board.append(layers[name]); }
  for (const [x, y] of CELLS) {
    const [cx, cy] = centre(x, y);
    const poly = svg('polygon', { points: [[R, 0], [R / 2, HH / 2], [-R / 2, HH / 2], [-R, 0], [-R / 2, -HH / 2], [R / 2, -HH / 2]].map(([a, b]) => (cx + a).toFixed(1) + ',' + (cy + b).toFixed(1)).join(' '), class: 'cell' });
    poly.dataset.target = 'hex'; poly.dataset.x = x; poly.dataset.y = y;
    layers.cells.append(poly);
  }
}
const STRIP = { partner: { 1: 855, 2: 619, 3: 383, 4: 147 }, university: { 1: 1612, 2: 1378, 3: 1144 } };      // y of the middle of the spaces on the association board (association.js)
function mapStub() {                                                       // what bonusPanel / associationStrip read of a map
  return { id: 'custom', name: 'Custom map', bonus_slots: model.panel.map((b, i) => ({ index: i, kind: i < model.nIncome ? 'instant_income' : 'instant', bonus: null })), association_bonuses: {},
           upgrade_sets: model.upgrade.mode === 'pairs' ? model.upgrade.sets : undefined, special_hexes: [], placement_bonuses: [] };
}
const playerStub = () => ({ flags: { bonus_used: 127 }, tokens: [], buildings: [] });
function hitRect(parent, target, index, x, y, w, h, rx = 10) {
  const r = svg('rect', { x, y, width: w, height: h, rx, class: 'cell slot' });
  r.dataset.target = target; r.dataset.index = index;
  parent.append(r);
  return r;
}
function overlayBonus(parent, bn, cx, cy, scale) {
  if (!bn) return;
  const g = group(cx, cy, scale);
  drawBonus(g, bn);
  g.setAttribute('pointer-events', 'none');
  parent.append(g);
}
function drawPanels() {
  const map = mapStub();
  const panel = bonusPanel(map, playerStub(), 0);
  panel.querySelectorAll('.slot-label').forEach((n) => { if (n.textContent === '?') n.remove(); });          // (the empty spaces have no icon yet)
  // the rows: the same arithmetic as bonusPanel
  const H = 720, n = 7, rowH = (H - 118 - 12 - 13 - 2 * 20) / n, up = Math.max(model.nIncome, 1);
  const height1 = up * rowH + 20, top2 = 118 + height1 + 13;
  for (let i = 0; i < n; i++) {
    const y = i < up ? 118 + 10 + rowH / 2 + rowH * i : top2 + 10 + rowH / 2 + rowH * (i - up);
    hitRect(panel, 'panel', i, 18, y - rowH / 2 + 1, 140, rowH - 2, 12);
    overlayBonus(panel, model.panel[i], 109, y, 0.72);
  }
  [0, 1, 2].forEach((i) => {
    const cx = 40 + i * 48;
    hitRect(panel, 'workers', i, cx - 22, 26, 44, 70, 8);
    overlayBonus(panel, model.workers[i], cx, 72, 0.5);
  });
  const strip = associationStrip(playerStub(), map, 0);
  for (let i = 1; i <= 4; i++) {
    hitRect(strip, 'partner', i - 1, 175 - 126, STRIP.partner[i] - 99, 253, 198, 24);
    overlayBonus(strip, model.partner[i - 1], 175, STRIP.partner[i] + 22, 1.35);
  }
  for (let i = 1; i <= 3; i++) {
    hitRect(strip, 'univ', i - 1, 175 - 124, STRIP.university[i] - 99, 248, 199, 24);
    overlayBonus(strip, model.univ[i - 1], 175, STRIP.university[i] + 22, 1.35);
  }
  $('panelHolder').replaceChildren(panel);
  $('stripHolder').replaceChildren(strip);
}
function drawPieces() {
  for (const n of ['terrain', 'flag', 'bonus']) layers[n].replaceChildren();
  for (const [x, y] of CELLS) {
    const k = key(x, y), [cx, cy] = centre(x, y);
    const t = model.terrain[k];
    if (t) layers.terrain.append(svg('image', { href: '/map_editor/hex_' + t + '.png', x: cx - TILE[0] / 2, y: cy - TILE[1] / 2, width: TILE[0], height: TILE[1] }));
    if (model.flag[k]) { const g = group(cx, cy); drawFlag(g); layers.flag.append(g); }
    const b = model.bonus[k];
    if (b) {                                                              // beside an upgrade requirement the bonus is smaller and lies towards the lower right corner, so that both show
      const g = model.flag[k] ? group(cx + 24, cy + 20, 0.62) : group(cx, cy);
      drawBonus(g, b);
      layers.bonus.append(g);
    }
  }
  drawPanels();
  refreshCounts();
}

// ---- what a tool may do to a place ------------------------------------------------------------------------------------------------------------------------
const holders = { panel: () => model.panel, workers: () => model.workers, partner: () => model.partner, univ: () => model.univ };
function refusal(target, k) {
  if (target === 'hex') {
    const plain = !model.terrain[k];
    if (tool.kind === 'terrain') {
      if (!plain) return 'Rock and water go on plain hexes: remove this hex first.';
      if (model.bonus[k]) return 'This hex has a placement bonus: rock and water go on plain hexes without one.';
      if (model.flag[k]) return 'This hex has an upgrade requirement: remove it first.';
    }
    if (tool.kind === 'bonus' && tool.family === 'project') return 'Project bonuses go on the spaces next to the map, not on a hex.';
    if (tool.kind === 'bonus' && !plain) return 'Placement bonuses go on plain hexes.';
    if (tool.kind === 'flag' && !plain) return 'Upgrade requirements go on plain hexes.';
    return null;
  }
  if (tool.kind === 'terrain' || tool.kind === 'flag') return 'This space holds a bonus only.';
  return null;
}
function apply(target, k) {
  const why = refusal(target, k);
  if (why) { say(why, true); return false; }
  const before = snap();
  if (target === 'hex') {
    if (tool.kind === 'terrain') model.terrain[k] = tool.value;
    else if (tool.kind === 'bonus') model.bonus[k] = bonusOf();
    else if (tool.kind === 'flag') model.flag[k] = true;
    else if (tool.kind === 'remove') { delete model.terrain[k]; delete model.bonus[k]; delete model.flag[k]; }
  } else {
    const list = holders[target]();
    if (tool.kind === 'bonus') list[+k] = bonusOf();
    else if (tool.kind === 'remove') list[+k] = null;
  }
  if (snap() === before) return false;
  drawPieces();
  return true;
}
const bonusOf = () => ({ type: tool.type, value: tool.value, ...(tool.tile ? { tile: tool.tile } : {}) });

// ---- strokes: a click, or a drag over several hexes, is one step of the history ----------------------------------------------------------------
let stroke = null;
const placeOf = (e) => { const p = e.target.closest && e.target.closest('.cell'); return p ? { poly: p, target: p.dataset.target, k: p.dataset.target === 'hex' ? key(+p.dataset.x, +p.dataset.y) : p.dataset.index } : null; };
document.addEventListener('pointerdown', (e) => {
  const at = placeOf(e);
  if (!at || e.button > 0) return;
  e.preventDefault();
  stroke = { before: snap(), seen: new Set() };
  hit(at);
});
document.addEventListener('pointerover', (e) => {
  const at = placeOf(e);
  if (!at) return;
  at.poly.classList.toggle('bad', !!refusal(at.target, at.k));
  if (stroke && at.target === 'hex' && ['terrain', 'remove', 'flag'].includes(tool.kind)) hit(at);          // (dragging paints rock, water, requirements or removes)
});
function hit(at) {
  const id = at.target + ':' + at.k;
  if (stroke.seen.has(id)) return;
  stroke.seen.add(id);
  if (apply(at.target, at.k)) say('');
}
window.addEventListener('pointerup', () => {
  if (!stroke) return;
  if (snap() !== stroke.before) push(stroke.before);
  stroke = null;
});
function push(before) { past.push(before); future = []; refreshButtons(); refreshExport(); }
function restore(json) { model = JSON.parse(json); drawPieces(); refreshButtons(); refreshExport(); syncControls(); }
function undo() { if (!past.length) return; future.push(snap()); restore(past.pop()); }
function redo() { if (!future.length) return; past.push(snap()); restore(future.pop()); }
document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
});
$('undo').onclick = undo;
$('redo').onclick = redo;
function refreshButtons() { $('undo').disabled = !past.length; $('redo').disabled = !future.length; }
let sayTimer = null;
function say(text, bad) {
  const s = $('status');
  s.textContent = text; s.classList.toggle('bad', !!bad);
  clearTimeout(sayTimer);
  if (text) sayTimer = setTimeout(() => { s.textContent = ''; s.classList.remove('bad'); }, 4000);
}

// ---- the controls that are not tools: the number of purple / yellow spaces and where the upgrade lies -----------------------------------------------
function change(fn) { const before = snap(); fn(); if (snap() === before) return; push(before); drawPieces(); }
function refreshCounts() { $('incN').textContent = model.nIncome; $('insN').textContent = 7 - model.nIncome; $('incDown').disabled = model.nIncome <= 1; $('incUp').disabled = model.nIncome >= 6; $('insDown').disabled = model.nIncome >= 6; $('insUp').disabled = model.nIncome <= 1; }
$('incUp').onclick = () => change(() => { model.nIncome = Math.min(6, model.nIncome + 1); });            // one more purple space: one yellow space less
$('incDown').onclick = () => change(() => { model.nIncome = Math.max(1, model.nIncome - 1); });
$('insUp').onclick = () => change(() => { model.nIncome = Math.max(1, model.nIncome - 1); });
$('insDown').onclick = () => change(() => { model.nIncome = Math.min(6, model.nIncome + 1); });
function syncControls() {
  document.querySelector('input[name=upg][value=' + model.upgrade.mode + ']').checked = true;
  $('pairBox').hidden = model.upgrade.mode !== 'pairs';
  document.querySelectorAll('.pair').forEach((c) => { c.checked = model.upgrade.sets.includes(+c.value); });
}
document.querySelectorAll('input[name=upg]').forEach((r) => r.addEventListener('change', () => change(() => { model.upgrade.mode = r.value; if (!model.upgrade.sets.length) model.upgrade.sets = [1, 2]; syncControls(); })));
document.querySelectorAll('.pair').forEach((c) => c.addEventListener('change', () => {
  const sets = [...document.querySelectorAll('.pair')].filter((x) => x.checked).map((x) => +x.value);
  if (!sets.length) { c.checked = true; say('A pair is needed: choose at least one.', true); return; }
  change(() => { model.upgrade.sets = sets; });
}));

// ---- the palette -------------------------------------------------------------------------------------------------------------------------------------------
const buttons = [];
function toolButton(parent, label, title, drawIcon, pick) {
  const b = el('button', 'metool');
  b.type = 'button'; b.title = title;
  const s = svg('svg', { viewBox: '-80 -70 160 140' });
  drawIcon(s);
  b.append(s, el('span', '', label));
  b.onclick = () => { pick(); for (const o of buttons) o.b.classList.toggle('on', o.b === b); updateValueBox(); };
  buttons.push({ b, pick });
  parent.append(b);
  return b;
}
function buildPalette() {
  for (const [name, label] of [['rock', 'Rock'], ['water', 'Water']]) {
    toolButton($('terrainTools'), label, 'Place a ' + name + ' hex on a plain hex', (s) => put(s, 'image', { href: '/map_editor/hex_' + name + '.png', x: -78, y: -67.5, width: 156, height: 135 }), () => { tool = { kind: 'terrain', value: name }; });
  }
  toolButton($('flagTools'), 'Upgrade II', 'Place an upgrade (Build II) requirement on a plain hex', (s) => { put(s, 'image', { href: '/map_editor/hex_plain.png', x: -78, y: -67.5, width: 156, height: 135 }); drawFlag(s); }, () => { tool = { kind: 'flag' }; });
  for (const [type, label] of BONUSES) {
    toolButton($('bonusTools'), label, 'Place the placement bonus: ' + label, (s) => {
      const g = group(0, 0, 1.35);
      drawBonus(g, { type, value: typedValue[type] });
      s.append(g);
    }, () => { tool = { kind: 'bonus', family: 'placement', type, value: typedValue[type] }; });
  }
  for (const [id, label, as] of PROJECT) {
    toolButton($('projectTools'), label, 'Put the project bonus on a space next to the map: ' + label, (s) => {
      const g = group(0, 0, 1.6);
      drawBonus(g, { tile: id, ...as });
      s.append(g);
    }, () => { tool = { kind: 'bonus', family: 'project', tile: id, ...as }; });
  }
  toolButton($('removeTools'), 'Remove', 'Make a hex plain again, or empty a space', (s) => {
    put(s, 'image', { href: '/map_editor/hex_plain.png', x: -78, y: -67.5, width: 156, height: 135 });
    put(s, 'path', { d: 'M-45 -45L45 45M45 -45L-45 45', stroke: '#c0392b', 'stroke-width': 16, 'stroke-linecap': 'round', fill: 'none' });
  }, () => { tool = { kind: 'remove' }; });
  buttons[0].b.click();
}
function updateValueBox() {
  const box = $('valueBox'), input = $('value');
  const numbered = tool.kind === 'bonus' && tool.family === 'placement' && NUMBERED.has(tool.type);
  box.hidden = !numbered;
  if (numbered) input.value = typedValue[tool.type];
}
$('value').addEventListener('input', () => {
  if (tool.kind !== 'bonus' || !NUMBERED.has(tool.type)) return;
  const v = Math.max(1, Math.min(99, Math.round(+$('value').value) || 1));
  typedValue[tool.type] = v;
  tool = { ...tool, value: v };
});

// ---- export ----------------------------------------------------------------------------------------------------------------------------------------------------------
const plainBonus = (b) => (b ? { type: b.type, value: b.value, ...(b.tile ? { project_bonus: b.tile } : {}) } : null);
function exportJson() {
  const out = {
    map_id: 'custom', verified: false,
    hexes: CELLS.map(([x, y]) => ({ x, y, terrain: model.terrain[key(x, y)] || 'plain' })),
    placement_bonuses: CELLS.filter(([x, y]) => model.bonus[key(x, y)]).map(([x, y]) => ({ x, y, bonus: plainBonus(model.bonus[key(x, y)]) })),
    special_hexes: CELLS.filter(([x, y]) => model.flag[key(x, y)]).map(([x, y]) => ({ x, y, kind: 'upgrade_flag', off_board: false, note: '' })),
    bonus_slots: model.panel.map((b, i) => ({ index: i, kind: i < model.nIncome ? 'instant_income' : 'instant', bonus: plainBonus(b), note: '' })),
    association: {
      workers: model.workers.map(plainBonus), partner_zoos: model.partner.map(plainBonus), universities: model.univ.map(plainBonus),
      upgrade: model.upgrade.mode === 'pairs' ? { mode: 'pairs', sets: [...model.upgrade.sets].sort() } : { mode: 'second', note: 'on the 2nd partner zoo and the 2nd university' },
    },
    map_rules: [],
  };
  return JSON.stringify(out, null, 4);
}
function refreshExport() { if (!$('exportBox').hidden) $('exportText').value = exportJson(); }
$('exportBtn').onclick = () => { $('exportBox').hidden = !$('exportBox').hidden; refreshExport(); };
$('closeExport').onclick = () => { $('exportBox').hidden = true; };
$('copyBtn').onclick = async () => {
  const text = exportJson(), b = $('copyBtn');
  try { await navigator.clipboard.writeText(text); } catch (e) { $('exportText').select(); document.execCommand('copy'); }
  b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500);
};
$('downloadBtn').onclick = () => {
  const a = el('a'); a.href = URL.createObjectURL(new Blob([exportJson() + '\n'], { type: 'application/json' })); a.download = 'custom_map.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// ---- start ----------------------------------------------------------------------------------------------------------------------------------------------------------------
S.replay = { players: [{ name: 'You' }], marine_worlds: false };           // (what the panels read for their tooltips)
Promise.all([fetch('/icons/icons.json').then((r) => r.json()).catch(() => ({})), fetch('/icons/names.json').then((r) => r.json()).catch(() => ({}))]).then(([ic, names]) => {
  applyIconNames(names);
  S.iconNames = names;
  for (const [id, v] of Object.entries(ic)) S.iconSizes[id] = v.size;
  Object.assign(EXTRA_ICONS, { 'extra-shift': names['bonus-extra-shift'] || 'r5c15', perception: names.perception || 'r7c10', digging: names.digging || 'r4c2', rescue: names.map10 || 'r9c13', 'search-sponsor-person': names['search-sponsor-person'] || 'r4c13' });
  buildBoard();
  buildPalette();
  syncControls();
  drawPieces();
  refreshButtons();
});
