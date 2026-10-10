// [module] Card rendering: card faces, previews on hover / click, changed-card flash and 'ghost' cards that left a zone.
import { $, el, title } from './util.js';
import { FORK, S } from './state.js';
import { afterMark, forkSingleSelect } from './action-bar.js';

export const info = (key) => S.replay.cards[key] || { name: key, type: 'unknown' };
// The image of the hover preview: the full size card (745 x 1040; every card has one since build_cards.py). Taken from `large` of the card catalog, else from the path of the small card
// (/cards/X.webp -> /cards_large/X.webp), so a replay cached by the server before the large cards existed still shows them; else the small card itself.
export const largeOf = (c) => c.large || (c.image && c.image.startsWith('/cards/') ? c.image.replace('/cards/', '/cards_large/') : c.image);
export const cardName = (key) => title(info(key).name);

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
    img.src = c.image; img.alt = cardName(key);                // (not lazy: a card drawn again with the page's next render would show an empty frame first)
    img.onerror = () => { img.remove(); d.append(textFace(key, c)); };
    d.append(img);
    d.addEventListener('mouseenter', () => showPreview(largeOf(c), !!d.closest('#dock')));           // (a card of the hand is shown in the middle of the screen)
    d.addEventListener('mouseleave', hidePreview);
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
export function showPreview(src, centered) {
  clearTimeout(previewTimer);
  const show = () => { const p = $('preview'); p.classList.toggle('center', !!centered); p.src = src; p.hidden = false; };
  if (lastTouch) show(); else previewTimer = setTimeout(show, PREVIEW_DELAY);
}
export function hidePreview() { clearTimeout(previewTimer); $('preview').hidden = true; }
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
    if (left[k] > 0) left[k]--; else test.gone.push({ key: k, index });
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
      const k = S.scale || 1, startX = e.clientX, startY = e.clientY, home = { left: node.offsetLeft, top: node.offsetTop };
      let moved = false;
      const place = () => {                                            // the card keeps its distance to the pointer, however the row was rearranged meanwhile
        const dx = (cx - startX) / k - (node.offsetLeft - home.left), dy = (cy - startY) / k - (node.offsetTop - home.top);
        node.style.setProperty('--dx', dx.toFixed(1) + 'px'); node.style.setProperty('--dy', dy.toFixed(1) + 'px');
      };
      let cx = startX, cy = startY, area = null, grab = null;
      const move = (ev) => {
        cx = ev.clientX; cy = ev.clientY;
        if (!moved) {
          if (Math.hypot(cx - startX, cy - startY) < 6) return;       // (a click, not a drag)
          moved = true; node.classList.add('dragging'); hidePreview();
          document.body.classList.add('card-dragging');               // (keeps the raised hand up while the pointer is outside its hit box)
          area = row.getBoundingClientRect(); grab = node.getBoundingClientRect();       // (grab: where the card lies, to keep all of it in the window)
        }
        if (area) {                                                   // (the card cannot leave the neighbourhood of the hand: the pointer is held inside it)
          const m = k * (S.handScale || 1);                          // (the margins grow with the size of the cards in the hand; 60 / 90 / 40 px at the default size)
          const gl = startX - grab.left, gr = grab.right - startX, gt = startY - grab.top, gb = grab.bottom - startY;
          cx = Math.min(Math.max(cx, area.left - 60 * m, gl + 4), area.right + 60 * m, innerWidth - gr - 4);
          cy = Math.min(Math.max(cy, area.top - 90 * m, gt + 4), area.bottom + 40 * m, innerHeight - gb + 40);       // (and never leave the window)
        }
        for (const other of [...row.children]) {                      // (the neighbour whose middle the pointer has passed swaps places with the card)
          if (other === node || !other.dataset || !other.dataset.key) continue;
          const r = other.getBoundingClientRect();
          if (cy < r.top - 40 || cy > r.bottom + 40) continue;
          const mid = r.left + r.width / 2, after = other.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING;       // (the dragged card lies after the neighbour)
          if (after && cx < mid) other.before(node);
          else if (!after && cx > mid) other.after(node);
          else continue;
          refan(row);
        }
        place();
      };
      let done = false;
      const up = () => {
        if (done) return; done = true;
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', up);
        if (!moved) return;
        document.body.classList.remove('card-dragging');
        node.classList.remove('dragging'); node.style.removeProperty('--dx'); node.style.removeProperty('--dy');
        node.addEventListener('click', (ev) => ev.stopImmediatePropagation(), { capture: true, once: true });          // (the click that ends a drag does not mark the card)
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
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('blur', up);       // (on the window, not the card: a fast move leaves the card behind and pointer capture is not reliable)
    });
  });
}
function refan(row) {                                                // the cards of a fan carry their place in --i: set again after the order changed
  const cards = [...row.children].filter((n) => n.classList && n.classList.contains('card') && !n.classList.contains('card-gone'));
  if (!row.style.getPropertyValue('--n')) return;
  cards.forEach((c, i) => c.style.setProperty('--i', (i - (cards.length - 1) / 2).toFixed(1)));
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
