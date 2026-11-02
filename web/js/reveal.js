// [module] The reveal lightbox of Perception, Scavenging, Hunter and Scuba Dive: the cards of the effect lie large in the middle of the screen on a dimmed window (the layer of the
// action card draft, `#draftbox`), the player takes the ones the effect allows, a seal marks them (the same star as the kept action cards), the rest is faded. What the effect cannot
// take (anything but an animal for Hunter, anything but a sponsor for Scuba Dive) is greyed out and cannot be chosen.
//   replay   two steps of the log make one reveal: "X draws A, B, C for <effect> effect" (the cards are in the hand of the step) and "X keeps A and discard B, C ..." / "X discards A, B, C (no sponsor)".
//            Both are a frame of their own ('reveal', frames.js): the first shows the cards, the second shows what was kept. The cards then go on to the hand (an animation for that comes later).
//   fork / live game   the engine's pending effect (`options.effects`, kind reveal / scavenge, with `cards`): click the cards to take (as many as the effect keeps), then Confirm.
import { $, el, seatColor, seatText } from './util.js';
import { S } from './state.js';
import { hides } from './pov.js';
import { info, largeOf, cardName } from './cards.js';
import { setPending } from './handfly.js';
import { iconUrl } from './icons.js';

const DRAW = /^(.+?) draws .* for (perception|hunter|scuba dive|scavenging) effect$/i;
const NAME = { perception: 'Perception', hunter: 'Hunter', 'scuba dive': 'Scuba Dive', scavenging: 'Scavenging' };
const ONLY = { hunter: 'A', 'scuba dive': 'S' };                     // (the first letter of the keys the effect may take; the others take any card)
export const takes = (effect, key) => !ONLY[effect] || String(key).startsWith(ONLY[effect]);

// ---- the replay: a reveal found in the labels of the steps (it needs no engine state, so every replay has it)
function drawnAt(i) {
  const steps = S.replay.steps, s = steps[i], m = s && DRAW.exec(String(s.label || ''));
  if (!m) return null;
  const seat = S.replay.players.findIndex((p) => p.name === m[1]);
  if (seat < 0 || !s.state.players[seat]) return null;
  const left = i > 0 && steps[i - 1].state.players[seat] ? steps[i - 1].state.players[seat].hand.slice() : [], cards = [];
  for (const k of s.state.players[seat].hand) { const j = left.indexOf(k); if (j >= 0) left.splice(j, 1); else cards.push(k); }      // (the cards the hand gained in this step)
  return cards.length ? { seat, effect: m[2].toLowerCase(), cards } : null;
}
// The reveal on show at step i: { seat, effect, cards, kept } (kept: null while the cards are drawn, else the ones of them that stayed in the hand), or null
export function revealAt(i = S.step) {
  const steps = S.replay.steps, s = steps[i];
  if (!s) return null;
  const draw = drawnAt(i);
  if (draw) return hides(draw.seat) ? null : { ...draw, kept: null };       // (what the other player reveals is not seen in a player's point of view: no lightbox, the step is shown as before)
  const prev = i > 0 ? drawnAt(i - 1) : null;
  if (!prev || hides(prev.seat)) return null;
  const name = S.replay.players[prev.seat].name, label = String(s.label || '');
  if (!label.startsWith(name + ' keeps ') && !label.startsWith(name + ' discards ')) return null;
  const left = s.state.players[prev.seat].hand.slice(), kept = [];
  for (const k of prev.cards) { const j = left.indexOf(k); if (j >= 0) { left.splice(j, 1); kept.push(k); } }
  return { ...prev, kept };
}

// ---- the layer and the cards
function layer() {
  let box = $('draftbox');
  if (!box) { box = el('div', 'draftbox'); box.id = 'draftbox'; box.hidden = true; document.body.append(box); }
  return box;
}
export function clearReveal() { const b = $('draftbox'); if (b && b.classList.contains('revealbox')) { b.classList.remove('revealbox'); b.hidden = true; b.replaceChildren(); } }
function face(key, hidden) {
  const c = el('div', 'draftcard' + (hidden ? ' faceless' : ''));
  c.dataset.key = key;
  if (hidden) { c.append(el('span', 'backmark', '?')); c.title = 'Hidden card'; return c; }
  const img = el('img'); img.src = largeOf(info(key)); img.alt = key; img.loading = 'lazy';
  c.title = cardName(key) + ' (' + key + ')';
  c.append(img);
  return c;
}
const FX_ICON = { perception: 'r7c10', hunter: 'r7c7', scavenging: 'r4c10', 'scuba dive': 'r4c3' };   // (the effect's icon from the icon sheet, `diving` is the Scuba Dive one)
function head(seat, text, effect) {
  const h = el('div', 'drafthead'), who = el('span', 'who', S.replay.players[seat].name);
  who.style.color = seatText(seat);
  h.append(who, el('b', '', ' ' + text));
  const row = el('div', 'headrow'), ic = el('img', 'fxicon');                              // the ribbon with the effect's icon pinned to its left tip (css: .headrow / .fxicon)
  ic.src = iconUrl(FX_ICON[effect]); ic.alt = NAME[effect]; ic.title = NAME[effect]; ic.draggable = false;
  row.append(ic, h);
  return row;
}
// The opening animation (css `lbopen`, the last block of parkposter.css): it plays when the lightbox opens, not when it only changes content (Back / Next between two frames keep it open).
// `noteLightbox()` is called before the layer is cleared for a redraw, `openFx(box)` after the cards are in: a redraw while the animation still runs carries on from where it is (--el).
let wasOpen = false, openedAt = 0, fxTimer = 0;
const FX_MS = 1700;
export function noteLightbox() { const b = $('draftbox'); wasOpen = !!(b && !b.hidden); setPending(); }
export function openFx(box) {
  const now = performance.now();
  if (!wasOpen && !(openedAt && now - openedAt < FX_MS)) openedAt = now;
  const done = now - openedAt;
  clearTimeout(fxTimer);
  if (done >= FX_MS) { box.classList.remove('lbopen'); return; }
  box.style.setProperty('--el', done / 1000 + 's');
  box.querySelectorAll('.draftcard').forEach((c, i) => c.style.setProperty('--d', String(i)));
  box.classList.add('lbopen');
  fxTimer = setTimeout(() => box.classList.remove('lbopen'), FX_MS - done);
}
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
function open(pop, count, wrap) {
  const box = layer();
  box.classList.add('revealbox');
  pop.style.setProperty('--cn', String(Math.max(3, count)));
  box.replaceChildren(wrap || pop);
  box.hidden = false;
  openFx(box);
}

// The replay: the lightbox of the reveal on show (`nav` makes the Back / Next buttons of the draft, action-bar.js)
export function showReveal(r, nav) {
  const hidden = false, pop = el('div', 'draftpop revealpop'), group = el('div', 'draftgroup'), row = el('div', 'draftcards');
  const say = 'reveals ' + plural(r.cards.length, 'card') + ' for ' + NAME[r.effect];      // (the same headline on the draw frame and on the keep frame: the seals show what was kept)
  for (const k of r.cards) {
    const c = face(k, hidden), ok = takes(r.effect, k);
    if (!hidden && !ok) c.classList.add('unavailable');
    if (r.kept && !hidden) { if (r.kept.includes(k)) c.classList.add('picked'); else c.classList.add('passed'); }
    if (r.kept && !hidden && r.kept.includes(k)) c.append(el('span', 'draftcheck', '✓'));
    row.append(c);
  }
  group.append(head(r.seat, say, r.effect));
  group.append(row);
  pop.append(group);
  const wrap = el('div', 'draftwrap');
  wrap.append(nav(-1), pop, nav(1));
  open(pop, r.cards.length, wrap);
}

// The fork and the live game: the pending reveal / scavenge effect of the player (options.effects): `cards` are the cards of the effect, `n` how many are kept
export function forkReveal(o, acts, play) {
  const e = (o.effects || []).find((x) => (x.kind === 'reveal' || x.kind === 'scavenge') && Array.isArray(x.cards) && x.cards.length);
  if (!e) return false;
  const mine = acts.filter((a) => a.kind === 'choose_effect' && a.args.index === e.index);
  if (!mine.length) return false;
  const seat = o.seat, effect = e.kind === 'scavenge' ? 'scavenging' : e.filter === 'animal' ? 'hunter' : e.filter === 'sponsor' ? 'scuba dive' : 'perception';
  const n = e.n || 1, keys = (a) => (Array.isArray(a.args.keep) ? a.args.keep : a.args.keep == null ? [] : [a.args.keep]);
  const offered = new Set(mine.flatMap(keys));
  if (!S.revealSel || S.revealSel.index !== e.index || S.revealSel.step !== S.step) S.revealSel = { index: e.index, step: S.step, sel: [] };
  const sel = S.revealSel.sel;
  const pop = el('div', 'draftpop revealpop'), group = el('div', 'draftgroup'), row = el('div', 'draftcards');
  const none = !offered.size;
  group.append(head(seat, none ? 'reveals ' + plural(e.cards.length, 'card') + ' for ' + NAME[effect]
    : 'must choose ' + plural(n, 'card') + ' to keep (' + NAME[effect] + ')', effect), row);
  const confirm = el('button', 'forkmove forkconfirm');
  confirm.type = 'button'; confirm.style.setProperty('--pc', seatColor(seat));
  const match = () => mine.find((a) => [...keys(a)].sort().join() === [...sel].sort().join());
  const refresh = () => {
    confirm.textContent = none ? 'Keep nothing' : 'Confirm (' + sel.length + '/' + n + ')';
    confirm.disabled = S.forkBusy || !match();
    for (const c of row.children) { const k = c.dataset.key; c.classList.toggle('picked', sel.includes(k)); c.classList.toggle('passed', sel.length >= n && !sel.includes(k)); const m = c.querySelector('.draftcheck'); if (sel.includes(k) && !m) c.append(el('span', 'draftcheck', '✓')); else if (!sel.includes(k) && m) m.remove(); }
  };
  for (const k of e.cards) {
    const c = face(k, false), ok = offered.has(k);
    c.dataset.key = k;
    if (ok) {
      c.classList.add('choosable'); c.title += ' - click to keep';
      c.onclick = () => { const i = sel.indexOf(k); if (i >= 0) sel.splice(i, 1); else { if (sel.length >= n) sel.shift(); sel.push(k); } refresh(); };
    } else c.classList.add('unavailable');
    row.append(c);
  }
  confirm.onclick = () => { const a = match(); if (a && !S.forkBusy) play(a); };
  const buttons = el('div', 'revealbtns');
  buttons.append(confirm);
  const skip = acts.find((a) => a.kind === 'skip_effect' && a.args.index === e.index);          // (an optional effect: Hunter Animals)
  if (skip) {
    const s = el('button', 'forkmove forkskip', 'Skip ' + NAME[effect]);
    s.type = 'button'; s.onclick = () => { if (!S.forkBusy) play(skip); };
    buttons.append(s);
  }
  group.append(buttons);
  pop.append(group);
  refresh();
  open(pop, e.cards.length);
  return true;
}
