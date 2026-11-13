// [module] Hover info of the Round | Turn chip: the move bar shows, in place of its usual content, who caused which break (Round half) or the actions each player has taken so far (Turn half).
// Every mode: it is read off the steps up to the one shown (`S.replay.steps`, `current_action`, `turn_context`, `round`), so a replay, a fork, the sandbox and a live game give the same picture.
// Opened by a click on a half of the chip (again: closed; another step: closed). Turn half: the two keys switch between the actions in play order (`order`: each action as a chip with its icon, pale = level I, full colour = upgraded: `actionTile`) and as a scoreboard by type (`type`: a count per player and action type, upgraded uses in the full colour, the others paler); the choice is kept until the page is reloaded.
import { S } from './state.js';
import { el, seatColor, seatRawColor } from './util.js';
import { seatOrder } from './pov.js';
import { ACTION_ICON, ACTION_NAMES, iconUrl, pieceUrl } from './icons.js';

const NS = 'http://www.w3.org/2000/svg';
const TILE = 20;                                                        // (the largest action tile: the visible size of a cube with its shadow at 21 px, css .mh-seat)
const TYPES = ['animals', 'association', 'build', 'cards', 'sponsors', 'x'];
export const ACTION_COLOR = { animals: '#E07B2E', association: '#2F6FB3', build: '#8C6A3C', cards: '#2E9C86', sponsors: '#C24E7E', x: '#8E999B' };
// the chosen view (Type / Order) is kept for the browser session (sessionStorage, so it survives a reload and the fork tabs of the same tab group of the session, not a new browser session); Type until a choice is made
function loadMode() { try { return sessionStorage.getItem('mhMode') === 'order' ? 'order' : 'type'; } catch (e) { return 'type'; } }
function saveMode(m) { try { sessionStorage.setItem('mhMode', m); } catch (e) { /* private window: just not kept */ } }
let mode = loadMode(), open = null, openStep = null, lastTurn = null;                        // open: 'round' | 'turn' | null; openStep: the replay step it was opened at

// the turn a step belongs to: who and which number (a neutral phase has none)
function turnOf(st, turnNumber) {
  if (st.phase !== 'turn' && st.phase !== 'final_turns') return null;
  const tc = st.turn_context;
  if (tc && tc.phase !== 'turn' && tc.phase !== 'final_turns') return null;          // (the step after the action card draft is in the turn phase already, but its turn context is still the setup: no turn has begun)
  const seat = tc && tc.seat != null ? tc.seat : st.active_player;
  return seat == null ? null : { seat, number: turnNumber(st) };
}
// everything the two panels need, from the first step to the one shown
export function collect(turnNumber) {
  const steps = (S.replay && S.replay.steps) || [], end = Math.min(S.step, steps.length - 1);
  const keys = [], byKey = new Map(), acts = [[], []], breaks = [];
  let prevCa = null, prevRound = null, prevSeat = null;
  for (let i = 0; i <= end; i++) {
    const st = steps[i] && steps[i].state;
    if (!st) continue;
    const t = turnOf(st, turnNumber);
    if (t) {
      const k = t.seat + ':' + t.number;
      if (!byKey.has(k)) { byKey.set(k, { seat: t.seat, number: t.number, n: 0 }); keys.push(byKey.get(k)); }
    }
    const ca = st.current_action || null;
    if (ca && !prevCa && ca.seat != null && st.players && st.players[ca.seat]) {          // a new action starts: the card is still in its slot, so its type can be read
      const card = (st.players[ca.seat].action_cards || [])[ca.slot - 1] || {}, type = ca.type || card.type;
      const row = t ? byKey.get(t.seat + ':' + t.number) : null;
      if (type) { acts[ca.seat].push({ t: type, turn: row ? row.number : null, extra: !!row && row.n > 0, up: type !== 'x' && (card.level || 1) >= 2, key: row }); if (row) row.n += 1; }
    }
    prevCa = ca;
    if (prevRound !== null && st.round > prevRound) breaks.push({ seat: prevSeat, turn: (t ? t.number : 0) });
    prevRound = st.round; prevSeat = st.active_player;
  }
  // a finished turn without an action is an X-back (the next turn of the game has started)
  const cur = steps[end] && turnOf(steps[end].state, turnNumber), curKey = cur ? cur.seat + ':' + cur.number : null;
  for (const row of keys) if (row.n === 0 && row.seat + ':' + row.number !== curKey) acts[row.seat].push({ t: 'x', turn: row.number, extra: false, key: row, pos: keys.indexOf(row) });
  // play order: by the turn rows (an action belongs to its row)
  for (const s of [0, 1]) acts[s].sort((a, b) => (a.key ? keys.indexOf(a.key) : 0) - (b.key ? keys.indexOf(b.key) : 0));
  const markers = Array.isArray(S.replay.break_markers) ? S.replay.break_markers.map((b) => ({ seat: b.seat, turn: b.turn })) : breaks;
  const round = steps[end] ? steps[end].state.round : 1;
  return { acts, breaks: markers.slice(0, Math.max(0, round - 1)), turn: cur ? cur.number : (keys.length ? keys[keys.length - 1].number : 1), round };
}

const sv = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.append(n); return n; };
function mug(color, size, hollow) {                                           // the break mug (as `mugIcon` of results.js) in a player's colour
  const s = sv('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'mh-mug' });
  const body = 'M3 9.5h12.5v6.2a4.8 4.8 0 0 1-4.8 4.8H7.8A4.8 4.8 0 0 1 3 15.7z', handle = 'M15.5 11.2h1.4a2.7 2.7 0 0 1 0 5.4h-1.4';
  if (hollow) {
    sv('path', { d: body, fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-dasharray': '2.2 2' }, s);
    sv('path', { d: handle, fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, s);
  } else {
    sv('path', { d: body, fill: color, stroke: 'rgba(23,38,43,.55)', 'stroke-width': .7 }, s);
    sv('path', { d: handle, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round' }, s);
    sv('path', { d: 'M6.2 7.2c-1-1.2 1-2 0-3.4M10.4 7.2c-1-1.2 1-2 0-3.4', fill: 'none', stroke: color, 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: .8 }, s);
  }
  return s;
}
// an action of the play order: a small chip with the action's icon (the glyph of web/action_glyphs, a CSS mask, scripts/build_action_glyphs.py) in the code of the Type view's bars:
// level I = the pale tint of the action colour with the icon in the colour, upgraded (the card was level II when the action began) = the full colour with a white icon; an X (the card was put
// back for an X token) = the X token on the pale grey (css .mh-ic, `--c` = the action colour)
function actionTile(a, size) {
  const d = el('i', 'mh-ic t-' + a.t + (a.t !== 'x' && a.up ? ' up' : ''));
  d.style.width = d.style.height = size + 'px';
  d.style.setProperty('--c', ACTION_COLOR[a.t] || '#999');
  if (a.t !== 'x') { const im = el('img'); im.src = iconUrl(S.iconNames[ACTION_ICON[a.t]]); im.alt = ''; im.draggable = false; d.append(im); }          // (the sheet's own tile, the same picture as the player info box and the Type view; the border around it is css)
  d.title = (a.t === 'x' ? 'X: the action card was put back for an X token' : (ACTION_NAMES[a.t] || a.t) + (a.up ? ' (upgraded)' : '')) + (a.extra ? ' (extra action)' : '') + (a.turn ? ', turn ' + a.turn : '');
  return d;
}
const seatTag = (seat) => { const t = el('img', 'mh-seat'); t.src = pieceUrl('cubes', seatRawColor(seat)); t.alt = ''; t.draggable = false; return t; };          // (the player's own cube)

// the colour of the "now" dot: the candidate that is farthest from both players' colours (orange only when neither player is orange / red)
const NOW_COLORS = ['#EE6C2B', '#7B4FB3', '#2E9C5A', '#F4B63F', '#17A5B8', '#C24E7E', '#17262B'];
const rgb = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : null; };
function nowColor() {
  const seats = [0, 1].map((k) => rgb(seatColor(k))).filter(Boolean);
  if (!seats.length) return NOW_COLORS[0];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const far = (c) => Math.min(...seats.map((q) => dist(rgb(c), q)));
  if (far(NOW_COLORS[0]) >= 60) return NOW_COLORS[0];                      // (orange, unless a player is orange: a red one is far enough)
  const first = NOW_COLORS.slice(1).find((c) => far(c) >= 90);          // (else the first candidate that is clearly different from both players, or the farthest one)
  return first || NOW_COLORS.reduce((a, c) => (far(c) > far(a) ? c : a));
}
const NOW_ROOM = 32.5;                                                    // (the middle of the last mug is at least 25 px from the middle of the now dot (the dot is 15 px wide, its middle 7.5 px from the end))
function roundPanel(D) {                                                       // a turn axis: each mug at the turn its break came, in the colour of the player who caused it; the running round at the end
  const box = el('div', 'mh-axis'), line = el('i', 'mh-line');
  box.append(line);
  const span = Math.max(1, D.turn);
  for (const b of D.breaks) {
    const at = Math.min(100, (b.turn / span) * 100), m = el('span', 'mh-bk');
    m.style.left = 'calc((100% - ' + NOW_ROOM + 'px) * ' + (at / 100) + ')'; m.append(mug(seatColor(b.seat), 30));
    m.title = (S.replay.players[b.seat] ? S.replay.players[b.seat].name : 'Player') + ' caused the break at the end of round ' + (D.breaks.indexOf(b) + 1);
    box.append(m);
  }
  const now = el('i', 'mh-now'); now.style.background = nowColor(); now.title = 'Now: round ' + D.round + ', turn ' + D.turn;
  box.append(now);
  return box;
}
// play order: one column per turn (the same column for both players, so the n-th turn of one player lies exactly above the other's); an extra action of a turn (a chain) is joined to its action by a thin line and makes the column as wide as the longer chain of the two
// the round breaks of the Order view: the index of each column (turn) a break comes after, a 1 px line like the Type view's, faded at both ends, is drawn there (css .mh-brk). A break's turn is x.5 = between turn x and x + 1; there is no line after the last column.
function breakColumns(D, keys) {
  const out = new Set();
  for (const b of D.breaks) {
    let i = -1;
    keys.forEach((k, n) => { if (k <= Math.floor(b.turn)) i = n; });
    if (i >= 0 && i < keys.length - 1) out.add(i);
  }
  return out;
}
const CHAIN = 6;                                                                  // (how far the line of a chain runs under each of its two tiles; the tiles are the normal `gap` apart, css .mh-chain)
const CHEV = '<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M8.5 1.5 3 7l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// the order view: the two seat cubes at the left stay, the turns scroll sideways in `.mh-view` (wheel, drag, or the two grey tabs `.mh-nb` left of the turns / right of them; they exist only while the turns do not fit, `fit`, and fade at the ends)
function orderPanel(D, size) {
  const wrap = el('div', 'mh-rows mh-scr'), seats = seatOrder(), gap = 5;          // (gap: between the tiles of a chain, the same as between the turns, css .mh-order)
  const per = seats.map((seat) => { const m = new Map(); for (const a of D.acts[seat]) { const k = a.turn == null ? 0 : a.turn; if (!m.has(k)) m.set(k, []); m.get(k).push(a); } return m; });
  const keys = [...new Set(per.flatMap((m) => [...m.keys()]))].sort((x, y) => x - y);
  const slots = keys.map((k) => Math.max(1, ...per.map((m) => (m.get(k) || []).length)));
  const brkAfter = breakColumns(D, keys);                                          // (the columns a round ends after: a line follows them)
  wrap.style.setProperty('--rh', size + 'px');
  const cubes = el('div', 'mh-cubes2'); seats.forEach((seat) => cubes.append(seatTag(seat)));
  const strip = el('div', 'mh-strip');
  seats.forEach((seat, k) => {
    const row = el('div', 'mh-row mh-order' + (k ? ' mh-row2' : ''));
    keys.forEach((key, i) => {
      const cell = el('span', 'mh-cell'), list = per[k].get(key) || [];
      cell.dataset.turn = String(key);
      cell.style.width = (slots[i] * size + (slots[i] - 1) * gap) + 'px';
      list.forEach((a, j) => { if (j) { const ln = el('i', 'mh-chain'); ln.style.width = (gap + 2 * CHAIN) + 'px'; cell.append(ln); } cell.append(actionTile(a, size)); });
      row.append(cell);
      if (brkAfter.has(i)) { const b = el('i', 'mh-brk'); if (!k) b.classList.add('mh-brk1'); row.append(b); }          // (the first row holds the line, the second an empty spacer of the same width)
    });
    strip.append(row);
  });
  const view = el('div', 'mh-view'); view.append(strip);
  const nb = (dir) => { const b = el('button', 'mh-nb'); b.type = 'button'; b.innerHTML = CHEV; b.setAttribute('aria-label', dir < 0 ? 'Earlier turns' : 'Later turns'); if (dir > 0) b.firstChild.style.transform = 'scaleX(-1)'; b.addEventListener('click', () => view.scrollBy({ left: dir * view.clientWidth * .7, behavior: 'smooth' })); return b; };
  const bl = nb(-1), br = nb(1);
  wrap.append(cubes, bl, view, br);
  const upd = () => {
    const max = view.scrollWidth - view.clientWidth;
    bl.disabled = view.scrollLeft <= 1; br.disabled = view.scrollLeft >= max - 1;
    view.classList.toggle('can-l', !bl.disabled); view.classList.toggle('can-r', !br.disabled);
  };
  view.addEventListener('scroll', upd, { passive: true });
  view.addEventListener('wheel', (e) => {
    if (!wrap.classList.contains('over')) return;
    e.preventDefault(); view.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  }, { passive: false });
  let sx = null, sl = 0;                                                          // (drag the turns)
  view.addEventListener('pointerdown', (e) => { if (!wrap.classList.contains('over')) return; sx = e.clientX; sl = view.scrollLeft; view.classList.add('drag'); view.setPointerCapture(e.pointerId); });
  view.addEventListener('pointermove', (e) => { if (sx != null) view.scrollLeft = sl - (e.clientX - sx); });
  const end = () => { sx = null; view.classList.remove('drag'); };
  view.addEventListener('pointerup', end); view.addEventListener('pointercancel', end);
  // called when the panel is in the page: the tabs only exist when the turns do not fit without them; it opens at the newest turn
  wrap.fit = () => {
    wrap.classList.remove('over');
    wrap.classList.toggle('over', strip.scrollWidth > view.clientWidth + 1);
    view.scrollLeft = view.scrollWidth; upd();
  };
  return wrap;
}
// by type: a scoreboard, one column per action type (its icon, then each player's count in the player's colour with a short bar); one bar unit for every column, so 40 actions fit the bar and the lengths are comparable; with more actions the unit shrinks
function scorePanel(D, room) {
  const seats = seatOrder();
  const cnt = TYPES.map((t) => seats.map((s) => { const l = D.acts[s].filter((a) => a.t === t), up = l.filter((a) => a.up).length; return [l.length - up, up]; }));          // [unupgraded, upgraded] per player
  const need = cnt.reduce((n, c) => n + Math.max(...c.map(([u, v]) => u + v)), 0);
  const unit = Math.max(1.2, (room - TYPES.length * 81 - 40) / Math.max(40, need));
  const box = el('div', 'mh-score'), cubes = el('div', 'mh-cubes');
  seats.forEach((seat) => cubes.append(seatTag(seat)));
  box.append(cubes);
  TYPES.forEach((t, i) => {
    const col = el('div', 'mh-sc');
    if (t === 'x') { const w = el('span', 'mh-xt'), im = el('img', ''); im.src = iconUrl(S.iconNames.xtoken); im.alt = 'X token'; im.height = 17; w.append(im); w.title = 'X: the action card was put back for an X token'; col.append(w); }
    else { const im = el('img', 'mh-tile'); im.src = iconUrl(S.iconNames[ACTION_ICON[t]]); im.alt = ACTION_NAMES[t] || t; im.title = ACTION_NAMES[t] || t; im.draggable = false; col.append(im); }
    const nums = el('div', 'mh-nums');
    seats.forEach((seat, k) => {
      const [u, v] = cnt[i][k], n = u + v, row = el('div', 'mh-nr'), num = el('b', 'mh-n' + (n ? '' : ' zero'), String(n));
      num.style.color = seatColor(seat);
      const trk = el('span', 'mh-trk');
      if (t === 'x') { if (n) { const g = el('i', 'mh-seg only x'); g.style.cssText = '--c:' + ACTION_COLOR.x + ';width:' + (n * unit) + 'px'; trk.append(g); } }
      else [[u, 'l1'], [v, 'l2']].forEach(([m, c]) => { if (!m) return; const g = el('i', 'mh-seg ' + c + (u && v ? '' : ' only')); g.style.cssText = '--c:' + ACTION_COLOR[t] + ';width:' + (m * unit) + 'px'; trk.append(g); });
      row.append(num, trk); row.title = (ACTION_NAMES[t] || t) + ': ' + n + (v ? ' (' + u + ' not upgraded, ' + v + ' upgraded)' : '');
      nums.append(row);
    });
    col.append(nums); box.append(col);
  });
  return box;
}
function turnPanel(D, room) {
  if (mode === 'type') return scorePanel(D, room);
  return orderPanel(D, TILE);          // (the tiles keep their size, what does not fit scrolls)
}
const CUR_ROOM = 12;                                                            // (the extra room left of the two keys, css .mh-switch margin-left, taken off the room of the panel)
function modeSwitch() {                                                         // two keys above each other (play order / by type): the current view is pressed in, the other one is raised = "click to switch"
  const sw = el('span', 'mh-switch');
  const names = { order: ['Order'], type: ['Type'] };
  for (const m of ['type', 'order']) {
    const k = el('i', 'mh-key' + (mode === m ? ' down' : '')); k.dataset.mode = m;
    const t = el('span', 'mh-kt'); t.textContent = names[m][0];
    k.append(t);
    k.addEventListener('click', () => { if (mode === m) return; mode = m; saveMode(m); if (open === 'turn') show('turn', lastTurn); });
    sw.append(k);
  }
  return sw;
}

function pill() { return document.querySelector('.movepill'); }
export function hide() {
  open = null;
  const p = pill();
  if (!p) return;
  p.classList.remove('mh-on');
  const old = p.querySelector('.mh'); if (old) old.remove();
}
function show(kind, turnNumber) {
  const p = pill();
  if (!p || !S.replay) return;
  const D = collect(turnNumber);
  if (kind === 'round' && !D.breaks.length) { hide(); return; }          // (no break yet: nothing to show)
  open = kind; openStep = S.step; lastTurn = turnNumber;
  const old = p.querySelector('.mh'); if (old) old.remove();
  const box = el('div', 'mh mh-' + kind); let panel = null;
  if (kind === 'round') box.append(roundPanel(D));
  else {
    const sw = modeSwitch();
    panel = turnPanel(D, p.clientWidth - 125 - CUR_ROOM); box.append(sw, panel);          // (the order view needs no legend: every action is drawn as its icon)
  }
  p.append(box); p.classList.add('mh-on');
  if (panel && panel.fit) panel.fit();
}
// the two halves of the chip (called by `headerStats` after it builds them)
// the click hint: while the mouse is on a half of the closed chip the cursor "taps": a ring spreads from the tip of the arrow, again and again (10 cursor pictures, 90 ms each, the last five without a ring = the pause), and a small bar chart badge says what the click shows. The pictures are svg data urls made once; the hotspot is the arrow's tip (9, 8).
const TAP_FRAMES = (() => {
  const arrow = '<path transform="translate(6 6)" d="M3 2 L3 20 L7.6 15.6 L10.6 22.4 L13.6 21.1 L10.7 14.4 L17 14.4 Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>';
  const chart = '<g transform="translate(20 21)"><rect width="15" height="13" rx="3" fill="#f6ecd0" stroke="#17262b" stroke-width="1.8"/><rect x="3" y="5.5" width="2.4" height="5" fill="#2a6ab0"/><rect x="6.3" y="3" width="2.4" height="7.5" fill="#a72070"/><rect x="9.6" y="4.5" width="2.4" height="6" fill="#229dd7"/></g>';
  const ring = (r, o) => '<circle cx="9" cy="8" r="' + r + '" fill="none" stroke="#17262b" stroke-width="2" opacity="' + o + '"/>';
  const url = (body) => 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">' + body + '</svg>') + '") 9 8, auto';
  const rings = [[1.5, 1], [4, 0.8], [6.5, 0.55], [9, 0.3], [11, 0]].map(([r, o]) => url(arrow + ring(r, o) + chart));
  const still = url(arrow + chart);
  return rings.concat([still, still, still, still, still]);
})();
function tapCursor(half) {
  let i = 0;
  half.classList.add('mh-tap');                                                   // (css: the half's children take its cursor instead of their own arrow)
  const set = () => { half.style.cursor = TAP_FRAMES[i % TAP_FRAMES.length]; i += 1; };
  set();
  const t = setInterval(set, 90);
  return () => { clearInterval(t); half.style.cursor = ''; half.classList.remove('mh-tap'); };
}
export function bindChip(rh, th, turnNumber) {
  for (const [half, kind] of [[rh, 'round'], [th, 'turn']]) {
    half.classList.add('mh-btn');
    let hint = null;
    const off = () => { if (hint) { hint(); hint = null; } };
    half.addEventListener('mouseenter', () => { off(); if (open !== kind && (kind !== 'round' || collect(turnNumber).breaks.length)) hint = tapCursor(half); });          // (the Round half only gets the click hint once a click shows something: after the first break)
    half.addEventListener('mouseleave', off);
    half.addEventListener('click', () => { off(); if (open === kind) hide(); else show(kind, turnNumber); });          // (a click opens it for good, the next click closes it)
  }
  if (open && S.step !== openStep) hide();                                          // (another step: the move bar takes over again)
  else if (open) show(open, turnNumber);                                            // (the chip was rebuilt at the same step: keep the panel open)
}
