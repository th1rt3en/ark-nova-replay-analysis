// [module] Card rendering: card faces, previews on hover / click, changed-card flash and 'ghost' cards that left a zone.
import { $, el, title } from './util.js';
import { FORK, MINIGAME, PLAY, S, SANDBOX } from './state.js';
import { pic } from './icons.js';
import { afterMark, forkSingleSelect } from './action-bar.js';
import { snakeSafe } from './nosnake.js';

// S274 is the Mascot Statue of the card data and the Victory Column on BGA (setting "Statue card", S.s274): its name and pictures (made by build_cards.py as S274_VC; the photo is a placeholder for now) are swapped here, so every name and picture in the viewer follows.
const VICTORY = new WeakMap();
const victoryOf = (c) => { if (!VICTORY.has(c)) VICTORY.set(c, { ...c, name: 'VICTORY COLUMN', image: c.image && c.image.replace('S274.webp', 'S274_VC.webp'), large: c.large ? c.large.replace('S274.webp', 'S274_VC.webp') : c.large }); return VICTORY.get(c); };
export const info = (key) => { const c = S.replay.cards[key]; return c ? (key === 'S274' && S.s274 !== 'mascot' ? victoryOf(c) : c) : { name: key, type: 'unknown' }; };
// The image of the hover preview: the full size card (745 x 1040; every card has one since build_cards.py). Taken from `large` of the card catalog, else from the path of the small card
// (/cards/X.webp -> /cards_large/X.webp), so a replay cached by the server before the large cards existed still shows them; else the small card itself.
export const largeOf = (c) => snakeSafe(c.large || (c.image && c.image.startsWith('/cards/') ? c.image.replace('/cards/', '/cards_large/') : c.image));
export const cardName = (key) => title(info(key).name);

// the sponsor buildings: the Mascot Statue / Victory Column, Arcade, Franchise Business, Landscape Gardener, the three Experts, the playgrounds, Underwater Tunnel, Side Entrance, Expansion Area,
// Zoo School, the animal houses, Amazon House, Aquarium, Cable Car, Excavation Site, Waza Large Animal Program (keep in step with replay/preview.py PREVIEW_CARDS)
export const PREVIEW_CARDS = new Set(['S210', 'S211', 'S213', 'S243', 'S244', 'S245', 'S246', 'S247', 'S248', 'S249', 'S250', 'S251', 'S252', 'S253', 'S254', 'S255', 'S256', 'S257',
  'S263', 'S265', 'S271', 'S272', 'S274', 'S276', 'S278', 'S279', 'S281']);
export function card(key, extraClass) {
  if (key === '?') {                                                     // a card the viewer may not see (the other player's hand in a player's point of view)
    const b = el('div', 'card back' + (extraClass ? ' ' + extraClass : ''));
    b.title = 'Hidden card';
    b.append(el('span', 'backmark', '?'));
    return b;
  }
  const c = info(key);
  const d = el('div', 'card' + (extraClass ? ' ' + extraClass : ''));
  d.title = cardName(key) + ' (' + key + ')';
  if (c.image) {
    const img = el('img');
    img.src = snakeSafe(c.image); img.alt = cardName(key);                // (not lazy: a card drawn again with the page's next render would show an empty frame first)
    img.onerror = () => { img.remove(); d.append(textFace(key, c)); };
    d.append(img);
    bindPreview(d, () => largeOf(c), () => !!d.closest('#dock'));                                    // (a card of the hand is shown in the middle of the screen)
    d.addEventListener('pointerdown', (e) => { if (e.button === 0 && d.closest('#dock')) holdPreview(largeOf(c)); });         // (grabbing a card of the hand: no enlarged view while it is held or dragged, same as after a click)
    d.addEventListener('click', () => { if (d.closest('#dock')) holdPreview(largeOf(c)); });         // (a click on a card of the hand: its enlarged view stays away until the pointer has left the card)
  } else {
    d.append(textFace(key, c));
  }
  return d;
}
// The enlarged card appears only after the pointer has rested on a card for PREVIEW_DELAY ms (a tap on a touch screen shows it at once; the device is told apart by the last pointer used, not by the `hover` media query, which
// touch laptops answer with "none")
const PREVIEW_DELAY = 1000;
let previewTimer = 0, lastTouch = false;
document.addEventListener('pointerdown', (e) => { lastTouch = e.pointerType === 'touch'; }, true);
document.addEventListener('pointermove', (e) => { lastTouch = e.pointerType === 'touch'; }, true);
let heldSrc = null;                                                          // the enlarged card that a click on a card of the hand switched off; the card is drawn again after the click (new element under the pointer), so this is not tied to an element
function holdPreview(src) { if (lastTouch) return; heldSrc = src; hidePreview(); }       // (touch: the enlarged card opens by a long press, not by hovering: nothing to hold)
export function showPreview(src, centered, extra) {
  clearTimeout(previewTimer);
  if (document.body.classList.contains('card-dragging')) return;             // (a card is being dragged: no enlarged view of the cards it passes)
  if (heldSrc === src) return;                                               // (still on the clicked card: no enlarged card, not even after the delay)
  heldSrc = null;                                                            // (another card: the usual rule again)
  const dbx = $('draftbox'); if (dbx && !dbx.hidden) return;                      // (the action card draft lightbox is open: no enlarged cards, neither in the lightbox nor in the dimmed background)
  if (lastTouch) return;                                                     // (the mouse events that a tap makes up: on a touch screen only a long press opens it, see bindPreview)
  previewTimer = setTimeout(() => showNow(src, centered, extra), PREVIEW_DELAY);
}
function showNow(src, centered, extra) {
  const dbx = $('draftbox'); if (dbx && !dbx.hidden) return;
  const p = $('preview'); p.classList.toggle('center', !!centered); p.src = src; p.hidden = false;
  showStats(src, p, extra);
  showRoll(src, p);
}
// What a sponsor with passive effects has given its owner so far (the replay only; the totals are in `state.sponsor_stats`, made by view.py from the log): a panel at the right of the enlarged card
const STAT_ORDER = ['appeal', 'money', 'reputation', 'conservation', 'xtoken'];
// what some sponsors are counted by instead of the resources of their instant gain (view.py `OWN_STATS`, `differential.observe_sponsors`)
const STAT_TEXT = { clever: 'Clevers activated', pavilion: 'Pavilions built', pouch: 'Pouches', enlarge: 'Enclosures enlarged', snap_small: 'Small animals snapped', third_small: '3rd small animals played', saved: 'saved',
  expeditions: 'Expeditions', scuba3: 'Scuba Dive 3 triggered', kiosk: 'Kiosks gained', size1: 'Size-1 enclosures gained', birds: 'Bird icons played', sunbathed: 'Cards sunbathed', hunts: 'Hunts triggered', seen: 'Cards seen', donations: 'Donations' };
function showStats(src, p, extra) {
  let box = $('previewstats');
  if (extra) {                                                               // (an action card of the player box: the statistics of its variant, `variantStatsBox`)
    const content = extra();
    p.classList.toggle('withstats', !!content);
    if (!content) { if (box) box.hidden = true; return; }
    if (!box) { box = el('div', 'previewstats'); box.id = 'previewstats'; document.body.append(box); }
    box.replaceChildren(...content); box.hidden = false;
    return;
  }
  const key = (/\/(S\d{3})(?:_\w+)?\.webp/.exec(String(src)) || [])[1];
  const st = S.replay && S.replay.steps[S.step] && S.replay.steps[S.step].state;
  const on = key && st && st.sponsor_stats && !FORK && !PLAY && !SANDBOX && !MINIGAME && (S.replay.tracked_sponsors || []).includes(key) && st.players.some((q) => q.sponsors.includes(key));
  p.classList.toggle('withstats', !!on);
  if (!on) { if (box) box.hidden = true; return; }
  if (!box) { box = el('div', 'previewstats'); box.id = 'previewstats'; document.body.append(box); }
  const got = st.sponsor_stats[key] || {};
  box.replaceChildren(el('b', 'psttitle', 'Given by this card'));
  const rows = [...STAT_ORDER, ...Object.keys(STAT_TEXT)].filter((r) => got[r]);
  for (const r of rows) {
    const row = el('div', 'pstrow');
    if (STAT_TEXT[r]) row.append(el('b', '', r === 'saved' ? '+' + got[r] : got[r] + '×'), ...(r === 'saved' ? [pic('money', 34)] : []), el('span', 'pstlabel', STAT_TEXT[r]));       // (a count: "3x Clevers activated"; the money the experts saved: "+12 [money] saved")
    else row.append(pic(r, 34), el('b', '', '+' + got[r]));
    box.append(row);
  }
  if (!rows.length) box.append(el('div', 'pstnone', 'nothing yet'));
  box.hidden = false;
}
// The roll of honour of the Emu Cup (the Victory Column card, setting "Statue card" = Victory Column): a panel right next to the enlarged card, the newest season (the incumbent champion, gold) first, each with a round portrait
// (web/emu_cup_winners/thumbs/<season>.webp, made by scripts/build_emu_cup_thumbs.py; an initial while a winner has no photo). The list is web/emu_cup_winners/winners.json. When the panel has not room for every winner, the oldest are
// summed up in "+ N earlier seasons" (the panel cannot be scrolled: the preview closes when the pointer leaves the card).
let winnersData = null;
const loadWinners = () => winnersData || (winnersData = fetch('/emu_cup_winners/winners.json').then((r) => (r.ok ? r.json() : { winners: [] })).catch(() => ({ winners: [] })));
async function showRoll(src, p) {
  let box = $('previewroll');
  const on = !MINIGAME && S.s274 !== 'mascot' && /\/S274_VC\.webp/.test(String(src));
  if (!on) { if (box) box.hidden = true; p.classList.remove('withroll'); return; }
  const data = await loadWinners();
  if (p.hidden || !/S274_VC\.webp/.test(p.src) || !data.winners || !data.winners.length) return;               // (the card was left while the list loaded)
  const list = [...data.winners].sort((a, b) => b.season - a.season);
  if (!box) { box = el('div', 'previewroll'); box.id = 'previewroll'; document.body.append(box); }
  const ol = el('ol');
  list.forEach((w, i) => {
    const li = el('li', i === 0 ? 'cur' : '');
    const ph = el('span', 'ph', String(w.name || '?')[0].toUpperCase());
    if (w.thumb) { const img = el('img'); img.alt = ''; img.src = '/emu_cup_winners/thumbs/' + String(w.season).padStart(2, '0') + '.webp'; img.onload = () => { ph.textContent = ''; ph.append(img); }; }       // (`thumb` is set by build_emu_cup_thumbs.py; no photo yet: the initial stays)
    const who = el('span', 'who'); who.append(el('span', 'nm', w.name), el('small', '', 'Season ' + w.season + (i === 0 ? ' · Chanpion' : '')));
    li.append(ph, who);
    ol.append(li);
  });
  box.replaceChildren(el('b', 'psttitle', (data.event || 'Emu Cup') + ' Chanpions'), ol);
  p.classList.add('withroll');
  const place = () => {
    if (p.hidden) return;
    box.hidden = false;
    const sc = (S.scaled && S.scale) || 1;                                           // (the page is zoomed: getBoundingClientRect is in zoomed px, `left` / `top` of a fixed box are not)
    const q = p.getBoundingClientRect(), r = { top: q.top / sc, left: q.left / sc, right: q.right / sc, height: q.height / sc }, stats = $('previewstats');
    let room = r.height;                                                             // (as tall as the card; above the statistics panel when there is one)
    if (stats && !stats.hidden) room = Math.min(room, stats.getBoundingClientRect().top / sc - 12 - r.top);
    box.style.maxHeight = Math.max(140, room) + 'px';
    box.style.top = Math.max(8, r.top) + 'px';
    ol.querySelectorAll('.more').forEach((m) => m.remove());
    const items = [...ol.children]; items.forEach((li) => { li.hidden = false; });
    let hide = 0;
    while (box.scrollHeight > box.clientHeight + 1 && items.length - hide > 2) {                // (oldest first out)
      hide += 1; items[items.length - hide].hidden = true;
      if (!ol.querySelector('.more')) ol.append(el('li', 'more'));
      ol.querySelector('.more').textContent = '+ ' + hide + ' earlier season' + (hide > 1 ? 's' : '');
    }
    let left = r.right + 14;
    if (left + box.offsetWidth > window.innerWidth / sc - 8) left = Math.max(8, r.left - 14 - box.offsetWidth);
    box.style.left = left + 'px';
  };
  requestAnimationFrame(() => (p.complete && p.naturalWidth ? place() : p.addEventListener('load', place, { once: true })));
}
// What the action card variants of Marine Worlds have done (the replay only; `state.variant_stats[seat][action]`, made by replay/variant_stats.py): [statistic, text]; the sides I and II are named in the text
const VARIANT_NAME = { animals_1: 'Ignore Animals', animals_2: 'Hunter Animals', animals_3: 'Discount Animals', animals_4: 'Mark Animals', association_2: 'Hire Association', association_3: 'X Association',
  association_4: 'Self-clever Association', build_1: 'Pavilion Build', build_2: 'Kiosk Build', build_3: '+1 Build', build_4: 'Terrain Build', cards_2: 'Digging Cards', cards_3: 'Snap Cards', cards_4: 'Clever Cards',
  sponsors_1: 'Money Sponsors', sponsors_2: 'Money Sponsors', sponsors_3: 'Sunbathing Sponsors', sponsors_4: 'Snap Sponsors' };
const ACTION_STATS = {
  animals_1: [['ignored', 'Animals played ignoring a condition']],
  animals_2: [['hunts', 'Hunts'], ['seen', 'Cards hunted']],
  animals_3: [['saved', 'Money saved (side I)'], ['appeal', 'Appeal gained (side II)']],
  animals_4: [['marks', 'Marks placed'], ['reputation', 'Reputation gained (side II)']],
  association_2: [['hired', 'Workers hired (side I)'], ['reduced', 'Workers used to lower the strength (side II)']],
  association_3: [['xtoken', 'X tokens gained (side I)'], ['saved', 'Money saved on donations (side II)']],
  association_4: [['determination', 'Determination used (side I)'], ['draws', 'Cards instead of a donation (side II)']],
  build_1: [['extra3', 'Pavilions built for 3 (side I)'], ['extra2', 'Pavilions built for 2 (side II)']],
  build_2: [['extra3', 'Kiosks built for 3 (side I)'], ['extra2', 'Kiosks built for 2 (side II)']],
  build_3: [['extra_strength', 'Times the extra strength was used']],
  build_4: [['terrain_paid', 'Built on rock / water, paid 2 (side I)'], ['terrain_gained', 'Built on rock / water, gained 2 (side II)']],
  cards_2: [['dig_hand', 'Digging from the hand'], ['dig_display', 'Digging from the display']],
  cards_3: [['snaps', 'Snaps']],
  cards_4: [['clever_paid', 'Clevers for 2 money (side I)'], ['clever_free', 'Clevers for free (side II)']],
  sponsors_1: [['x_money', 'X token for 5 money'], ['money_x', '5 money for an X token'], ['money_rep', '5 money for 1 reputation (side II)'], ['x_rep', 'X token for 1 reputation (side II)']],
  sponsors_2: [['money', 'Money gained by the ability']],
  sponsors_3: [['money', 'Discarded for 4 money'], ['strength', 'Discarded for 2 strength (side II)']],
  sponsors_4: [['snap', 'Sponsors discarded to snap a sponsor (side I)'], ['play', 'Cards discarded to play a sponsor (side II)']],
};
export function variantStatsBox(st, seat, a) {
  const rows = ACTION_STATS[a.type + '_' + a.variant];
  if (!rows || !a.variant || !S.replay.marine_worlds || !st.variant_stats || FORK || PLAY || SANDBOX || MINIGAME) return null;
  const got = ((st.variant_stats[seat] || {})[a.type]) || {};
  const out = [el('b', 'psttitle', VARIANT_NAME[a.type + '_' + a.variant])];
  for (const [stat, text] of rows) { const row = el('div', 'pstrow'); row.append(el('b', '', String(got[stat] || 0)), el('span', 'pstlabel', text)); out.push(row); }
  return out;
}
// Puts the enlarged view on an element. Mouse: after the pointer has rested on it for PREVIEW_DELAY. Touch: a tap keeps its normal job (selecting, ...); the view opens when a finger stays on the element for TOUCH_HOLD ms
// without moving (more than TOUCH_SLOP px cancels it, so dragging a card of the hand still works) and stays while it is down: lifting the finger closes it, and the click that may follow is swallowed.
// `src` and `centered` are values or functions (the card may change between the binding and the hover).
const TOUCH_HOLD = 1000, TOUCH_SLOP = 10;
export function bindPreview(elm, src, centered, extra) {
  const get = (v) => (typeof v === 'function' ? v() : v);
  elm.addEventListener('mouseenter', () => showPreview(get(src), !!get(centered), extra));
  elm.addEventListener('mouseleave', hidePreview);
  let timer = 0, x0 = 0, y0 = 0, held = false;
  const stop = () => { clearTimeout(timer); timer = 0; };
  elm.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    held = false; x0 = e.clientX; y0 = e.clientY; stop();
    timer = setTimeout(() => { held = true; showNow(get(src), !!get(centered), extra); }, TOUCH_HOLD);
  });
  elm.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > TOUCH_SLOP) stop(); });
  const lift = () => { stop(); if (held) { hidePreview(); setTimeout(() => { held = false; }, 400); } };            // (lifting the finger closes the enlarged view; the click that may follow is still swallowed)
  elm.addEventListener('pointerup', lift);
  elm.addEventListener('pointercancel', lift);
  elm.addEventListener('click', (e) => { if (held) { held = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);       // (the end of a long press is not a click)
  elm.addEventListener('contextmenu', (e) => { if (lastTouch) e.preventDefault(); });                                                   // (no browser menu on a long press)
}
export function hidePreview() { clearTimeout(previewTimer); $('preview').hidden = true; const b = $('previewstats'); if (b) b.hidden = true; const r = $('previewroll'); if (r) r.hidden = true; $('preview').classList.remove('withroll'); }
document.addEventListener('mouseout', (e) => { if (heldSrc && e.target.closest && e.target.closest('.card') && !(e.relatedTarget && e.target.closest('.card').contains(e.relatedTarget))) heldSrc = null; }, true);       // (the pointer left the card: the next hover on it counts again)
document.addEventListener('DOMContentLoaded', () => { const pv = $('preview'); if (pv) pv.addEventListener('click', hidePreview); });       // (on touch screens a tap closes the preview)
function textFace(key, c) {
  const t = el('div', 'txt');
  t.append(el('b', '', title(c.name)), el('span', '', key + (c.type && c.type !== 'unknown' ? ' · ' + c.type : '')));
  return t;
}
export function zoneNew(zone, keys) {
  const prev = S.prevZones[zone], cur = {}, seen = {}, left = {};
  for (const k of keys) if (k) { cur[k] = (cur[k] || 0) + 1; left[k] = (left[k] || 0) + 1; }
  S.curZones[zone] = keys.slice();
  const test = (k) => { seen[k] = (seen[k] || 0) + 1; return !!prev && seen[k] > (prev[k] || 0); };
  test.gone = [];
  const count = {};
  for (const k of prev || []) if (k) count[k] = (count[k] || 0) + 1;
  test.isNew = (k) => { seen[k] = (seen[k] || 0) + 1; return !!prev && seen[k] > (count[k] || 0); };
  (prev || []).forEach((k, index) => {
    if (!k) return;
    if (left[k] > 0) left[k]--; /* else: a card that left stays gone (no ghost / fade for now) */
  });
  return test;
}
export function ghost(key) {
  const g = card(key, 'card-gone');
  g.addEventListener('animationend', () => g.remove());
  return g;
}
export const cardMarks = new Set();                                             // the hand / endgame cards the viewer highlighted with a click: cleared at every step
// The order the viewer gave his hand / endgame cards by dragging them (display only, kept for this page session): zone -> card keys.
// The game data stays untouched: every step's own list is merged with it (cards in the stored order first, newly arrived cards at the end).
const userOrder = {};
let orderReplay = null, quiet = false;
const reorderable = (zone, keys) => !!zone && /:(hand|endgame)$/.test(zone) && keys.length > 1 && keys.every((k) => k && k !== '?');
export function orderedKeys(zone, keys) {
  if (orderReplay !== S.replay) { for (const z of Object.keys(userOrder)) delete userOrder[z]; orderReplay = S.replay; }
  const stored = userOrder[zone];
  if (!stored || !reorderable(zone, keys)) return keys;
  const left = keys.slice(), out = [];
  for (const k of stored) { const i = left.indexOf(k); if (i >= 0) { out.push(k); left.splice(i, 1); } }       // (duplicates are matched one by one)
  return out.concat(left);
}
export function quietly(fn) { quiet = true; try { fn(); } finally { quiet = false; } }           // (re-drawing without the arrival / departure flashes)
// Cards of this row can be dragged to another position within the row. The drag is done with pointer events (not the browser's drag and drop, whose drag image is always see-through):
// the card itself follows the pointer at full opacity (--dx / --dy move it, parkposter.css), and the others make room when the pointer passes the middle of a neighbour.
function dragRow(row, zone, shown, nodes) {
  nodes.forEach((node) => {
    if (!node.classList || node.classList.contains('card-gone')) return;
    node.querySelectorAll('img').forEach((im) => { im.draggable = false; });
    node.style.touchAction = 'none';
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const pid = e.pointerId, k = S.scale || 1, startX = e.clientX, startY = e.clientY, home = { left: node.offsetLeft, top: node.offsetTop };
      const order0 = [...row.children], HYST = 6 * k;                  // (order0: for a cancelled drag; HYST: how far past a neighbour's middle the pointer must go to swap, so a pointer resting on the boundary does not make the order flicker)
      let moved = false, row0 = null, cx = startX, cy = startY, frame = 0;
      const fan = !!row.style.getPropertyValue('--n');
      let ang = 0, u = null, ref = null;                               // fan: the card's angle now, the grabbed point from the card's pivot (u, in the card's own frame) and where it lay at pick-up (ref)
      const angleOf = () => { const m = getComputedStyle(node).transform; if (!m || m === 'none') return 0; const v = m.match(/-?[\d.e-]+/g).map(Number); return Math.atan2(v[1], v[0]); };
      const rot = (a, x, y) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
      const place = () => {                                            // the grabbed point stays under the real pointer: the layout shift of the card (reordering) and the shift of the whole row (the raised fan is still rising) are taken out
        const rr = row.getBoundingClientRect();
        let dx = (cx - startX) / k - (node.offsetLeft - home.left) - (rr.left - row0.left) / k, dy = (cy - startY) / k - (node.offsetTop - home.top) - (rr.top - row0.top) / k;
        if (u) { const q = rot(ang, u[0], u[1]); dx += ref[0] - q[0]; dy += ref[1] - q[1]; }       // (the card turned about its pivot: shifted back so that the grabbed point stays under the pointer)
        node.style.setProperty('--dx', dx.toFixed(1) + 'px'); node.style.setProperty('--dy', dy.toFixed(1) + 'px');
      };
      const reorder = () => {                                          // one slot decision per frame, from the positions measured before anything is moved
        const others = [...row.children].filter((o) => o !== node && o.dataset && o.dataset.key);
        const rects = others.map((o) => o.getBoundingClientRect());
        const ref = rects.length ? rects[0] : null;
        if (!ref || cy < Math.min(...rects.map((r) => r.top)) - 40 * k || cy > Math.max(...rects.map((r) => r.bottom)) + 40 * k) return;       // (far above / below the hand: the order is left alone)
        let before = 0, at = others.findIndex((o) => node.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (at < 0) at = others.length;                                // (at: how many of the others lie before the card now)
        for (let i = 0; i < others.length; i++) {
          const mid = rects[i].left + rects[i].width / 2;
          if (i < at ? cx > mid - HYST : cx > mid + HYST) before++; else break;
        }
        if (before === at) return;
        if (before >= others.length) others[others.length - 1].after(node); else others[before].before(node);
        refan(row);
        if (u) ang = angleOf();
      };
      const tick = () => {
        frame = 0;
        if (!node.isConnected) { finish(false); return; }               // (a live update replaced the cards while dragging)
        reorder(); place();
      };
      const move = (ev) => {
        if (ev.pointerId !== pid) return;
        cx = ev.clientX; cy = ev.clientY;
        if (!moved) {
          if (Math.hypot(cx - startX, cy - startY) < 6) return;       // (a click, not a drag)
          moved = true; node.classList.add('dragging'); hidePreview();
          node.getAnimations().forEach((a) => { if (a.constructor === Animation) a.cancel(); });       // (an entrance animation still running would override the drag's transform)
          document.body.classList.add('card-dragging');               // (keeps the raised hand up while the pointer is outside its hit box)
          row0 = row.getBoundingClientRect();
          if (fan) {
            ang = angleOf(); const r = node.getBoundingClientRect(), v = rot(-ang, (startX - r.left - r.width / 2) / k, (startY - r.top - r.height / 2) / k);
            u = [v[0], v[1] - 1.8 * node.offsetHeight]; ref = rot(ang, u[0], u[1]);         // (the pivot of the fan lies 1.8 card heights below the card's middle)
          }
        }
        if (!frame) frame = requestAnimationFrame(tick);
      };
      let done = false;
      const finish = (commit) => {
        if (done) return; done = true;
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel); window.removeEventListener('blur', onCancel);
        if (!moved) return;
        document.body.classList.remove('card-dragging');
        node.classList.remove('dragging'); node.style.removeProperty('--dx'); node.style.removeProperty('--dy');
        node.addEventListener('click', (ev) => ev.stopImmediatePropagation(), { capture: true, once: true });          // (the click that ends a drag does not mark the card)
        if (!node.isConnected) return;
        if (!commit) { row.append(...order0.filter((n) => n.parentNode === row)); refan(row); return; }        // (an interrupted drag puts the cards back)
        refan(row);
        const live = [...row.children].filter((n) => n.dataset && n.dataset.key);
        const keys = live.map((n) => n.dataset.key);
        if (keys.join('|') === shown.join('|')) return;
        const marked = shown.filter((kk, i) => cardMarks.has(zone + '#' + i));                     // the highlighted cards stay highlighted
        for (const m of [...cardMarks]) if (m.startsWith(zone + '#')) cardMarks.delete(m);
        const left = keys.slice();
        for (const kk of marked) { const i = left.indexOf(kk); if (i >= 0) { cardMarks.add(zone + '#' + i); left[i] = null; } }
        userOrder[zone] = keys;
        document.dispatchEvent(new Event('cardorder'));
      };
      const onUp = (ev) => {
        if (ev.pointerId !== pid || done) return;
        if (moved && frame) { cancelAnimationFrame(frame); frame = 0; if (node.isConnected) reorder(); }         // (the last position counts)
        finish(true);
      };
      const onCancel = (ev) => { if (!ev.pointerId || ev.pointerId === pid) finish(false); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onCancel); window.addEventListener('blur', onCancel);       // (on the window, not the card: a fast move leaves the card behind and pointer capture is not reliable)
    });
  });
}
function refan(row) {                                                // the cards of a fan carry their place in --i: set again after the order changed
  const cards = [...row.children].filter((n) => n.classList && n.classList.contains('card') && !n.classList.contains('card-gone'));
  if (!row.style.getPropertyValue('--n')) return;
  cards.forEach((c, i) => c.style.setProperty('--i', (i - (cards.length - 1) / 2).toFixed(1)));       // (the held card turns with its slot; dragRow keeps the grabbed point still)
}
export function cardRow(rawKeys, cls, emptyText, zone, dimmed, markable) {
  const row = el('div', 'cards' + (cls ? ' ' + cls : ''));
  const keys = markable ? orderedKeys(zone, rawKeys) : rawKeys;
  if (!keys.length) row.append(el('span', 'empty', emptyText || 'none'));
  const z = zone ? zoneNew(zone, keys) : null;
  const items = keys.map((k, i) => (k ? card(k, (z && !quiet && z.isNew(k) ? 'card-new' : '') + (dimmed && dimmed(k) ? ' dim' : '')) : el('div', 'card')));
  keys.forEach((k, i) => { if (k) items[i].dataset.key = k; });
  if (z && !quiet) for (const g of z.gone) items.splice(Math.min(g.index, items.length), 0, ghost(g.key));
  if (markable) {
    let n = 0;                                                         // (a card that is fading away does not count)
    items.forEach((node) => {
      if (!node || !node.classList || node.classList.contains('card-gone')) return;
      const mark = zone + '#' + (n++);
      if (cardMarks.has(mark)) node.classList.add('marked');
      node.classList.add('markable');
      const hm = /^(\d+):hand$/.exec(zone), ck = node.dataset.key;
      if (hm && ck) {                                                    // a sponsor building card of a hand: a right click starts / ends / switches the building preview (bpreview.js)
        const seat = +hm[1];
        if (S.preview && S.preview.seat === seat && S.preview.card === ck) node.classList.add('previewing');
        node.addEventListener('contextmenu', (e) => {
          if (!S.previewBuilding || !PREVIEW_CARDS.has(ck)) return;
          e.preventDefault();
          document.dispatchEvent(new CustomEvent('bpreview-toggle', { detail: { seat, key: ck } }));
        });
      }
      node.addEventListener('click', () => {
        if (FORK && node.classList.contains('dim') && forkSingleSelect()) return;                      // (a card that cannot be played cannot be selected)
        if (cardMarks.has(mark)) cardMarks.delete(mark);
        else {
          if (FORK && forkSingleSelect()) for (const x of [...cardMarks]) if (/:hand#|^display#/.test(x)) cardMarks.delete(x);        // a card to play: the new choice replaces the old one
          cardMarks.add(mark);
        }
        if (FORK && forkSingleSelect()) for (const n of document.querySelectorAll('.dockpanel .card.markable')) n.classList.remove('marked');
        node.classList.toggle('marked', cardMarks.has(mark));
        if (FORK) afterMark();
      });
    });
  }
  row.append(...items);
  if (markable && reorderable(zone, keys)) dragRow(row, zone, keys, items);
  return row;
}
