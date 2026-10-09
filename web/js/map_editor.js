// [module] The map editor (map_editor.html): the blank map, rock / water hexes, placement bonuses, upgrade requirements, remove, undo / redo, export as JSON.
// The board is the blank map of web/map_editor (scripts/build_blank_map.py): 58 plain hexes at (96 + 115 x, 88 + 66.5 y). The pieces are drawn like the viewer draws a map
// (board.js `zooBoard`: the yellow pentagon with the icon of the bonus, the red wedge with the purple "II" badge for an upgrade requirement); the JSON is the format of
// data_manual/maps_geometry/<id>.json (`hexes`, `placement_bonuses`, `special_hexes` of the kind `upgrade_flag`).
import { $, el, svg } from './util.js';
import { S } from './state.js';
import { ICON_IDS, SHOW_VALUE, applyIconNames, iconUrl, moneyTile } from './icons.js';

const MAP = { x0: 96, y0: 88, dx: 115, dy: 66.5 };
const R = MAP.dx / 1.5, HH = 133, TILE = [156, 135];
const CELLS = [];
for (let x = 0; x < 9; x++) for (let y = 0; y < 13; y++) if ((x + y) % 2 === 1) CELLS.push([x, y]);
const key = (x, y) => x + ',' + y;
const centre = (x, y) => [MAP.x0 + x * MAP.dx, MAP.y0 + y * MAP.dy];

// the placement bonuses of the maps (data_manual/maps_geometry), with the default number of the ones that have one
const BONUSES = [
  ['money', 'Money', 5], ['reputation', 'Reputation', 1], ['appeal', 'Appeal', 1], ['xtoken', 'X token', 1], ['Scavenging', 'Scavenging', 3], ['Multiplier', 'Multiplier', 2],
  ['take-in-range-or-deck', 'Take a card', 1], ['bonus-sponsor', 'Sponsor', 1], ['Clever', 'Clever', 1], ['Digging', 'Digging', 1], ['Mark', 'Mark', 1], ['Worker', 'Worker', 1],
  ['Partner-Zoo', 'Partner zoo', 1], ['Fac', 'University', 1], ['kiosk', 'Kiosk', 1], ['store', 'Store', 1], ['conceal', 'Conceal', 1], ['shark-attack', 'Shark attack', 1],
  ['adapt', 'Adapt', 1], ['wave', 'Wave', 1],
];
const NUMBERED = new Set(['money', 'reputation', 'appeal', 'Scavenging']);          // the bonuses whose number the user types
const typedValue = Object.fromEntries(BONUSES.map(([t, , v]) => [t, v]));

// ---- state: the cells that are not plain (terrain), the placement bonuses and the upgrade requirements; the history is a list of snapshots ----------------
let model = { terrain: {}, bonus: {}, flag: {} };
let past = [], future = [];
const snap = () => JSON.stringify(model);
let tool = { kind: 'terrain', value: 'rock' };

// ---- drawing the pieces (at the origin of a group, so that they can be moved and scaled) ------------------------------------------------------------------
function put(g, tag, attrs, text) { const e = svg(tag, attrs); if (text !== undefined) e.textContent = text; g.append(e); return e; }
function iconBox(g, id, cx, cy, h) {
  const [w0, h0] = S.iconSizes[id] || [h, h];
  return put(g, 'image', { href: iconUrl(id), x: cx - (w0 * h / h0) / 2, y: cy - h / 2, width: w0 * h / h0, height: h });
}
function drawBonus(g, bn) {                                              // as zooBoard draws a placement bonus
  const icon = ICON_IDS['bonus:' + bn.type];
  if (bn.type === 'Digging') { iconBox(g, icon, 0, 0, 80); return; }          // r9c13 already has its own background
  iconBox(g, ICON_IDS.pentagon, 0, 0, 80);
  if (bn.type === 'adapt') { iconBox(g, 'r10c15', -14, 3, 36); iconBox(g, 'r10c16', 15, 3, 36); }
  else if (bn.type === 'money') moneyTile(g, 0, 3, 48);
  else if (bn.type === 'Scavenging' && icon && bn.value > 1) { iconBox(g, icon, 9, 3, 44); put(g, 'text', { x: -15, y: 14, class: 'bonus-number', style: 'font-size:34px;stroke-width:7px' }, bn.value); }
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

// ---- the board -----------------------------------------------------------------------------------------------------------------------------------------
const board = $('board');
const layers = {};
function buildBoard() {
  board.replaceChildren(svg('image', { href: '/map_editor/blank_map.png', x: 0, y: 0, width: 1122, height: 976 }));
  for (const name of ['terrain', 'flag', 'bonus', 'cells']) { layers[name] = svg('g', { class: 'layer-' + name }); board.append(layers[name]); }
  for (const [x, y] of CELLS) {
    const [cx, cy] = centre(x, y);
    const poly = svg('polygon', { points: [[R, 0], [R / 2, HH / 2], [-R / 2, HH / 2], [-R, 0], [-R / 2, -HH / 2], [R / 2, -HH / 2]].map(([a, b]) => (cx + a).toFixed(1) + ',' + (cy + b).toFixed(1)).join(' '), class: 'cell' });
    poly.dataset.x = x; poly.dataset.y = y;
    layers.cells.append(poly);
  }
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
}

// ---- what a tool may do to a cell ------------------------------------------------------------------------------------------------------------------------
function refusal(k) {
  const plain = !model.terrain[k];
  if (tool.kind === 'terrain') {
    if (!plain) return 'Rock and water go on plain hexes: remove this hex first.';
    if (model.bonus[k]) return 'This hex has a placement bonus: rock and water go on plain hexes without one.';
    if (model.flag[k]) return 'This hex has an upgrade requirement: remove it first.';
  }
  if (tool.kind === 'bonus' && !plain) return 'Placement bonuses go on plain hexes.';
  if (tool.kind === 'flag' && !plain) return 'Upgrade requirements go on plain hexes.';
  return null;
}
function apply(k) {
  const why = refusal(k);
  if (why) { say(why, true); return false; }
  const before = snap();
  if (tool.kind === 'terrain') model.terrain[k] = tool.value;
  else if (tool.kind === 'bonus') model.bonus[k] = { type: tool.type, value: tool.value };
  else if (tool.kind === 'flag') model.flag[k] = true;
  else if (tool.kind === 'remove') { delete model.terrain[k]; delete model.bonus[k]; delete model.flag[k]; }
  if (snap() === before) return false;
  drawPieces();
  return true;
}

// ---- strokes: a click, or a drag over several hexes, is one step of the history ----------------------------------------------------------------
let stroke = null;
board.addEventListener('pointerdown', (e) => {
  const poly = e.target.closest && e.target.closest('.cell');
  if (!poly || e.button > 0) return;
  e.preventDefault();
  stroke = { before: snap(), seen: new Set() };
  hit(poly);
});
board.addEventListener('pointerover', (e) => {
  const poly = e.target.closest && e.target.closest('.cell');
  if (!poly) return;
  poly.classList.toggle('bad', !!refusal(key(+poly.dataset.x, +poly.dataset.y)));
  if (stroke && ['terrain', 'remove', 'flag'].includes(tool.kind)) hit(poly);          // (dragging paints rock, water, requirements or removes)
});
function hit(poly) {
  const k = key(+poly.dataset.x, +poly.dataset.y);
  if (stroke.seen.has(k)) return;
  stroke.seen.add(k);
  if (apply(k)) { say(''); poly.classList.toggle('bad', !!refusal(k)); }
}
window.addEventListener('pointerup', () => {
  if (!stroke) return;
  const changed = snap() !== stroke.before;
  if (changed) { past.push(stroke.before); future = []; refreshButtons(); refreshExport(); }
  stroke = null;
});
function restore(json) { model = JSON.parse(json); drawPieces(); refreshButtons(); refreshExport(); }
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
    }, () => { tool = { kind: 'bonus', type, value: typedValue[type] }; });
  }
  toolButton($('removeTools'), 'Remove', 'Make a hex plain again', (s) => {
    put(s, 'image', { href: '/map_editor/hex_plain.png', x: -78, y: -67.5, width: 156, height: 135 });
    put(s, 'path', { d: 'M-45 -45L45 45M45 -45L-45 45', stroke: '#c0392b', 'stroke-width': 16, 'stroke-linecap': 'round', fill: 'none' });
  }, () => { tool = { kind: 'remove' }; });
  buttons[0].b.click();
}
function updateValueBox() {
  const box = $('valueBox'), input = $('value');
  const numbered = tool.kind === 'bonus' && NUMBERED.has(tool.type);
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
function exportJson() {
  const out = {
    map_id: 'custom', verified: false,
    hexes: CELLS.map(([x, y]) => ({ x, y, terrain: model.terrain[key(x, y)] || 'plain' })),
    placement_bonuses: CELLS.filter(([x, y]) => model.bonus[key(x, y)]).map(([x, y]) => ({ x, y, bonus: { type: model.bonus[key(x, y)].type, value: model.bonus[key(x, y)].value } })),
    special_hexes: CELLS.filter(([x, y]) => model.flag[key(x, y)]).map(([x, y]) => ({ x, y, kind: 'upgrade_flag', off_board: false, note: '' })),
    bonus_slots: [], map_rules: [],
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
Promise.all([fetch('/icons/icons.json').then((r) => r.json()).catch(() => ({})), fetch('/icons/names.json').then((r) => r.json()).catch(() => ({}))]).then(([ic, names]) => {
  applyIconNames(names);
  S.iconNames = names;
  for (const [id, v] of Object.entries(ic)) S.iconSizes[id] = v.size;
  buildBoard();
  buildPalette();
  drawPieces();
  refreshButtons();
});
