// [module] The reveal lightbox of Perception, Scavenging, Hunter and Scuba Dive: the cards of the effect lie large in the middle of the screen on a dimmed window (the layer of the
// action card draft, `#draftbox`), the player takes the ones the effect allows, a seal marks them (the same star as the kept action cards), the rest is faded. What the effect cannot
// take (anything but an animal for Hunter, anything but a sponsor for Scuba Dive) is greyed out and cannot be chosen.
//   replay   two steps of the log make one reveal: "X draws A, B, C for <effect> effect" (the cards are in the hand of the step) and "X keeps A and discard B, C ..." / "X discards A, B, C (no sponsor)".
//            Both are a frame of their own ('reveal', frames.js): the first shows the cards, the second shows what was kept. The cards then go on to the hand (an animation for that comes later).
//   fork / live game   the engine's pending effect (`options.effects`, kind reveal / scavenge, with `cards`): click the cards to take (as many as the effect keeps), then Confirm.
import { $, el, seatColor, seatText } from './util.js';
import { S } from './state.js';
import { hides } from './pov.js';
import { info, largeOf, cardName, bindPreview } from './cards.js';
import { setPending } from './handfly.js';
import { iconUrl } from './icons.js';
import { pointsBadge } from './egpoints.js';
import { draftMarks } from './action-bar.js';          // (the cards the viewer highlighted with a click, shared with the action card draft; cleared at every step)

const DRAW = /^(.+?) draws .* for (perception|hunter|scuba dive|scavenging) effect$/i;
const NAME = { perception: 'Perception', hunter: 'Hunter', 'scuba dive': 'Scuba Dive', scavenging: 'Scavenging', resistance: 'Resistance', assertion: 'Assertion', horse: 'Horse Whisperer', adapt: 'Adapt' };
const ONLY = { hunter: 'A', 'scuba dive': 'S', assertion: 'P' };                     // (the first letter of the keys the effect may take; the others take any card)
export const takes = (effect, key) => !ONLY[effect] || String(key).startsWith(ONLY[effect]);

// ---- the replay: a reveal found in the labels of the steps (it needs no engine state, so every replay has it; Resistance is read from the step's `resistance`)
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
  const rs = s.resistance;                                                   // Resistance: the endgame cards come with the step (the server, `resistance` in view.py): the draw step shows them, the keep step what was kept
  if (rs && rs.cards && rs.cards.length) return hides(rs.seat) ? null : { seat: rs.seat, effect: 'resistance', cards: rs.cards, kept: rs.kept || null, points: rs.points || null };
  const as = s.assertion;                                                    // Assertion: the base projects on offer come with the step (`assertion`, view.py); frame 0 shows the offer, frame 1 the one taken (`held`: the card that is not in the hand yet in both)
  if (as && as.cards && as.cards.length) return { seat: as.seat, effect: 'assertion', cards: as.cards, kept: i === S.step && S.phase >= 1 ? as.kept : null, held: as.kept };
  const ad = s.adapt;                                                        // Adapt: the endgame cards held plus the ones just drawn (`adapt`, view.py); the draw step shows them with the new ones marked, the discard step the same row with the discarded ones struck out
  if (ad && ad.cards && ad.cards.length) return hides(ad.seat) ? null : { seat: ad.seat, effect: 'adapt', cards: ad.cards, fresh: ad.drawn || [], out: ad.discarded || null, points: ad.points || null };
  const hw = s.horse;                                                        // Horse Whisperer: the discard pile with the Petting Zoo animals on top (`horse`, view.py); frame 0 shows the pile, frame 1 the animal taken (`held`: not in the hand yet in both)
  if (hw) return { seat: hw.seat, effect: 'horse', cards: hw.pets.slice().reverse(), pile: hw.pile, kept: hw.kept && i === S.step && S.phase >= 1 ? [hw.kept] : null, held: hw.kept ? [hw.kept] : [] };
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
function face(key, hidden, points) {
  const c = el('div', 'draftcard' + (hidden ? ' faceless' : ''));
  c.dataset.key = key;
  if (hidden) { c.append(el('span', 'backmark', '?')); c.title = 'Hidden card'; return c; }
  const img = el('img'); img.src = largeOf(info(key)); img.alt = key; img.loading = 'lazy';
  c.title = cardName(key) + ' (' + key + ')';
  c.append(img);
  const pb = pointsBadge(points);
  if (pb) c.append(pb);
  return c;
}
const FX_ICON = { assertion: 'r11c6', perception: 'r7c10', hunter: 'r7c7', scavenging: 'r4c10', 'scuba dive': 'r4c3', resistance: 'r7c2' };   // (the effect's icon from the icon sheet, `diving` is the Scuba Dive one; Resistance has no icon of its own: the hourglass of the endgame cards, drawn as `web/icons/hourglass.svg` in its own proportions, `.fxicon.tall`)
function head(seat, text, effect) {
  const h = el('div', 'drafthead'), who = el('span', 'who', S.replay.players[seat].name);
  who.style.color = seatText(seat);
  h.append(who, el('b', '', ' ' + text));
  const row = el('div', 'headrow'), ic = el(effect === 'horse' ? 'div' : 'img', 'fxicon');                              // the ribbon with the effect's icon pinned to its left tip (css: .headrow / .fxicon)
  if (effect === 'horse') ic.classList.add('pet'); else ic.src = effect === 'resistance' || effect === 'adapt' ? '/icons/hourglass.svg' : iconUrl(FX_ICON[effect]); if (effect === 'resistance' || effect === 'assertion' || effect === 'adapt') ic.classList.add('tall');       // (the icon keeps its proportions: the hourglass and the base project badge are taller than wide) ic.alt = NAME[effect]; ic.title = NAME[effect]; ic.draggable = false;
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

// The Back / Next buttons stand beside the panel, whose ribbon (the title) makes it higher than its cards: the buttons are shifted (`--ny` on `.draftnav`) so that their middle is the
// middle of the rows of cards. Measured with the offsets (not the screen positions: the cards fly in with a transform) and again whenever the box changes its size.
export function centerNav(wrap) {
  const rows = [...wrap.querySelectorAll('.draftcards')];
  if (!rows.length) return;
  const top = (e) => { let y = 0; for (let n = e; n && n !== wrap; n = n.offsetParent) y += n.offsetTop; return y; };
  const fit = () => {
    const a = Math.min(...rows.map(top)), z = Math.max(...rows.map((r) => top(r) + r.offsetHeight));
    const dy = (a + z) / 2 - wrap.clientHeight / 2;
    wrap.querySelectorAll('.draftnav').forEach((n) => n.style.setProperty('--ny', dy + 'px'));
  };
  fit();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(wrap);
}
// The replay: the lightbox of the reveal on show (`nav` makes the Back / Next buttons of the draft, action-bar.js)
export function showReveal(r, nav) {
  if (r.effect === 'horse') return showHorse(r, nav);
  if (r.effect === 'adapt') return showAdapt(r, nav);
  const hidden = false, pop = el('div', 'draftpop revealpop replayreveal' + (r.effect === 'assertion' ? ' assertpop' : '')), group = el('div', 'draftgroup'), row = el('div', 'draftcards');
  const say = r.effect === 'assertion' ? (r.kept ? 'keeps ' + cardName(r.kept[0]) + ' with Assertion' : 'reveals ' + plural(r.cards.length, 'base project') + ' for Assertion')
    : 'reveals ' + plural(r.cards.length, r.effect === 'resistance' ? 'endgame card' : 'card') + ' for ' + NAME[r.effect];      // (the same headline on the draw frame and on the keep frame: the seals show what was kept)
  for (const k of r.cards) {
    const c = face(k, hidden, r.points && r.points[k]), ok = takes(r.effect, k);
    if (!hidden && !ok) c.classList.add('unavailable');
    if (r.kept && !hidden) { if (r.kept.includes(k)) c.classList.add('picked'); else c.classList.add('passed'); }
    if (r.kept && !hidden && r.kept.includes(k)) c.append(el('span', 'draftcheck', '✓'));
    if (!hidden && ok) {                                        // a click highlights the card (the green tag, as in the action card draft; the highlight goes away at the next step); a card the effect cannot take stays off limits
      const mark = 'r:' + r.seat + ':' + k;
      if (draftMarks.has(mark)) c.classList.add('marked');
      c.title += '\nClick to highlight this card';
      c.addEventListener('click', () => { if (draftMarks.has(mark)) draftMarks.delete(mark); else draftMarks.add(mark); c.classList.toggle('marked'); });
    }
    row.append(c);
  }
  if (r.effect === 'assertion') pop.style.setProperty('--per', String(Math.ceil(r.cards.length / 2)));          // (two rows: the first has the larger half, 8 = 4 + 4, 9 = 5 + 4, 11 = 6 + 5; the cards get narrower from 7 in a row on, css `.assertpop`)
  group.append(head(r.seat, say, r.effect));
  group.append(row);
  pop.append(group);
  const wrap = el('div', 'draftwrap');
  wrap.append(nav(-1, false), pop, nav(1, false));          // (no words and key caps: the arrow keys are known by now, the draft explains them)
  open(pop, r.cards.length, wrap);
  centerNav(wrap);
  hideButton(r.effect === 'resistance' ? 'endgame selection' : 'Cards');
}
// the same button as the action card draft: the lightbox dims the whole page, this hides it (the board and the player boxes are free) and brings it back
function hideButton(what) {
  const box = layer(), hide = el('button', 'drafthide');
  hide.type = 'button';
  const sync = () => { box.classList.toggle('lbhide', !!S.revealHidden); hide.textContent = (S.revealHidden ? 'Show ' : 'Hide ') + what; hide.setAttribute('aria-pressed', String(!!S.revealHidden)); };
  hide.onclick = () => { S.revealHidden = !S.revealHidden; sync(); };
  sync();
  box.append(hide);
}

// ---- Adapt (a map 12 / animal ability / bonus effect): the endgame cards of the player in one row, the ones held before plain, the ones just drawn lifted with a gold glow and a "NEW" sash. The discard frame shows the same row with the
// discarded cards greyed and struck out by a red cross. `r`: { seat, cards (held, then drawn), fresh (the drawn ones), out (the discarded ones, or null on the draw frame) }.
function adaptCard(k, fresh, out, points) {
  const c = face(k, false, points && points[k]);
  if (fresh) { c.classList.add('fresh'); const sash = el('span', 'sash'); sash.append(el('b', '', 'NEW')); c.append(sash); }
  if (out) { c.classList.add('out'); c.append(el('span', 'xmark', '✕')); }
  return c;
}
function adaptRow(group, cards, fresh, out, cardOf, points) {
  const row = el('div', 'draftcards adaptrow');
  for (const k of cards) row.append(cardOf ? cardOf(k) : adaptCard(k, fresh.includes(k), !!out && out.includes(k), points));
  group.append(row);
  return row;
}
function showAdapt(r, nav) {
  const pop = el('div', 'draftpop revealpop replayreveal adaptpop'), group = el('div', 'draftgroup');
  const n = r.fresh.length;
  group.append(head(r.seat, r.out ? 'discards ' + plural(r.out.length, 'endgame card') + ' for Adapt' : 'draws ' + plural(n, 'endgame card') + ' for Adapt', 'adapt'));
  const out = r.out ? r.out.slice() : null, outs = (k) => { const j = out ? out.indexOf(k) : -1; if (j >= 0) out.splice(j, 1); return j >= 0; };      // (a key can be held twice? no: each card is unique, but keep the count right anyway)
  adaptRow(group, r.cards, r.fresh, null, (k) => adaptCard(k, r.fresh.includes(k), outs(k), r.points));
  pop.append(group);
  const wrap = el('div', 'draftwrap');
  wrap.append(nav(-1, false), pop, nav(1, false));
  open(pop, r.cards.length, wrap);
  centerNav(wrap);
  hideButton('Cards');
}
// fork / live game: the pending adapt effect (choose_effect with `discard`: the combinations of the pool = hand + the cards to draw); the player clicks the `n` cards to discard, Confirm plays
function adaptFork(o, acts, play) {
  const e = (o.effects || []).find((x) => x.kind === 'adapt');
  if (!e) return false;
  const mine = acts.filter((a) => a.kind === 'choose_effect' && a.args.index === e.index && Array.isArray(a.args.discard));
  if (!mine.length) return false;
  const seat = o.seat, n = e.n || 1, pool = [...new Set(mine.flatMap((a) => a.args.discard))];
  const held = (S.replay.steps[S.step].state.players[seat].endgame_hand || []).slice(), cards = held.concat(pool.filter((k) => !held.includes(k))), fresh = cards.filter((k) => !held.includes(k));
  if (!S.revealSel || S.revealSel.index !== e.index || S.revealSel.step !== S.step) S.revealSel = { index: e.index, step: S.step, sel: [] };
  const sel = S.revealSel.sel;
  const pop = el('div', 'draftpop revealpop adaptpop'), group = el('div', 'draftgroup');
  group.append(head(seat, 'must discard ' + plural(n, 'endgame card') + ' (Adapt)', 'adapt'));
  const confirm = el('button', 'forkmove forkconfirm');
  confirm.type = 'button'; confirm.style.setProperty('--pc', seatColor(seat));
  const match = () => mine.find((a) => [...a.args.discard].sort().join() === [...sel].sort().join());
  let row;
  const refresh = () => {
    confirm.textContent = 'Discard (' + sel.length + '/' + n + ')';
    confirm.disabled = S.forkBusy || !match();
    for (const c of row.children) { const k = c.dataset.key, on = sel.includes(k); c.classList.toggle('out', on); const m = c.querySelector('.xmark'); if (on && !m) c.append(el('span', 'xmark', '✕')); else if (!on && m) m.remove(); }
  };
  row = adaptRow(group, cards, fresh, null, (k) => {
    const c = adaptCard(k, fresh.includes(k), false, e.pts);
    c.classList.add('choosable'); c.title += ' - click to discard';
    c.onclick = () => { const i = sel.indexOf(k); if (i >= 0) sel.splice(i, 1); else { if (sel.length >= n) sel.shift(); sel.push(k); } refresh(); };
    return c;
  });
  confirm.onclick = () => { const a = match(); if (a && !S.forkBusy) play(a); };
  const buttons = el('div', 'revealbtns');
  buttons.append(confirm);
  group.append(buttons);
  pop.append(group);
  refresh();
  open(pop, cards.length);
  hideButton('Cards');
  return true;
}

// ---- Horse Whisperer: the whole discard pile in a lightbox. The Petting Zoo animals lie on top, large, the player takes one (it is mandatory when there is one); the rest of the pile lies below in a scrolling tray with
// the bin tile (the number is the count of those cards), greyed out: those cards can only be looked at. No Petting Zoo animal in the pile: the greyed goat badge with "x 0" in place of the animals; the tray is still there
// (a play just to see the pile). `r`: { seat, cards (the animals, newest first), pile (the whole pile, oldest first), kept }.
const BIN = '<svg viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" class="binsvg"><g stroke="#17262B" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"><path d="M22 14 V8 a3 3 0 0 1 3-3 h14 a3 3 0 0 1 3 3 v6" fill="none"/><rect x="6" y="14" width="52" height="9" rx="3" fill="#F4B63F"/><path d="M12 23 L15 63 a4 4 0 0 0 4 3 h26 a4 4 0 0 0 4-3 L52 23 Z" fill="#F8EDCB"/><path d="M24 32 V57 M32 32 V57 M40 32 V57" fill="none" stroke-width="3.5"/></g></svg>';
function horseBody(r, group, cardOf) {
  const pets = new Set(r.cards), rest = r.pile.slice().reverse().filter((k) => !pets.has(k));
  if (r.cards.length) {
    const row = el('div', 'draftcards hwpets');
    for (const k of r.cards) row.append(cardOf(k));
    group.append(row);
  } else {
    const none = el('div', 'hwnone'), b = el('img', 'hwbadge');
    b.src = '/badges/Pet.webp'; b.alt = 'No Petting Zoo animal'; b.draggable = false;
    none.append(b, el('span', 'x', '× 0'));
    none.title = 'No Petting Zoo animal in the discard pile';
    group.append(none);
  }
  const tray = el('div', 'hwtray'), tile = el('div', 'hwtile'), scroll = el('div', 'hwscroll'), grid = el('div', 'hwrest');
  tile.innerHTML = BIN;
  tile.title = 'Discard pile';
  tile.append(el('span', 'bincount', String(rest.length)));
  for (const k of rest) { const c = face(k, false); c.classList.add('hwold'); bindPreview(c, largeOf(info(k))); grid.append(c); }
  scroll.append(grid);
  tray.append(tile, scroll);
  group.append(tray);
  return rest.length;
}
function showHorse(r, nav) {
  const pop = el('div', 'draftpop revealpop replayreveal hwpop'), group = el('div', 'draftgroup');
  group.append(head(r.seat, 'plays Horse Whisperer', 'horse'));
  const kept = r.kept || [];
  horseBody(r, group, (k) => {
    const c = face(k, false);
    if (kept.length) { c.classList.add(kept.includes(k) ? 'picked' : 'passed'); if (kept.includes(k)) c.append(el('span', 'draftcheck', '✓')); }
    return c;
  });
  pop.append(group);
  const wrap = el('div', 'draftwrap');
  wrap.append(nav(-1, false), pop, nav(1, false));
  open(pop, r.cards.length, wrap);
  centerNav(wrap);
  hideButton('Cards');
}
// fork / live game: the pending search_discard effect of the player (choose_effect with `card`: the animals he may take), a click takes, Confirm plays
function horseFork(o, acts, play) {
  const e = (o.effects || []).find((x) => x.kind === 'search_discard');
  if (!e) return false;
  const mine = acts.filter((a) => a.kind === 'choose_effect' && a.args.index === e.index && a.args.card);
  if (!mine.length) return false;
  const seat = o.seat, cards = [...new Set(mine.map((a) => a.args.card))].reverse(), pile = S.replay.steps[S.step].state.main_discard.slice();
  if (!S.revealSel || S.revealSel.index !== e.index || S.revealSel.step !== S.step) S.revealSel = { index: e.index, step: S.step, sel: [] };
  const sel = S.revealSel.sel;
  const pop = el('div', 'draftpop revealpop hwpop'), group = el('div', 'draftgroup');
  group.append(head(seat, 'plays Horse Whisperer', 'horse'));
  const confirm = el('button', 'forkmove forkconfirm');
  confirm.type = 'button'; confirm.style.setProperty('--pc', seatColor(seat));
  const row = () => group.querySelector('.hwpets');
  const refresh = () => {
    confirm.textContent = 'Take the card';
    confirm.disabled = S.forkBusy || sel.length !== 1;
    for (const c of row().children) { const k = c.dataset.key; c.classList.toggle('picked', sel.includes(k)); c.classList.toggle('passed', sel.length >= 1 && !sel.includes(k)); const m = c.querySelector('.draftcheck'); if (sel.includes(k) && !m) c.append(el('span', 'draftcheck', '✓')); else if (!sel.includes(k) && m) m.remove(); }
  };
  horseBody({ cards, pile }, group, (k) => {
    const c = face(k, false);
    c.classList.add('choosable'); c.title += ' - click to take';
    c.onclick = () => { const i = sel.indexOf(k); if (i >= 0) sel.splice(i, 1); else { sel.length = 0; sel.push(k); } refresh(); };
    return c;
  });
  confirm.onclick = () => { const a = mine.find((x) => x.args.card === sel[0]); if (a && !S.forkBusy) play(a); };
  const buttons = el('div', 'revealbtns');
  buttons.append(confirm);
  group.append(buttons);
  pop.append(group);
  refresh();
  open(pop, cards.length);
  hideButton('Cards');
  return true;
}

// The fork and the live game: the pending reveal / scavenge effect of the player (options.effects): `cards` are the cards of the effect, `n` how many are kept
export function forkReveal(o, acts, play) {
  if (horseFork(o, acts, play)) return true;
  if (adaptFork(o, acts, play)) return true;
  let e = (o.effects || []).find((x) => (x.kind === 'reveal' || x.kind === 'scavenge') && Array.isArray(x.cards) && x.cards.length);
  if (!e) {                                                       // Assertion: the pending effect holds no cards, its choices (`choose_effect` with `card`) are the unused base projects
    const as = (o.effects || []).find((x) => x.kind === 'assertion');
    const cards = as ? [...new Set(acts.filter((a) => a.kind === 'choose_effect' && a.args.index === as.index && a.args.card).map((a) => a.args.card))] : [];
    if (cards.length) e = { ...as, cards, n: 1 };
  }
  if (!e) return false;
  const mine = acts.filter((a) => a.kind === 'choose_effect' && a.args.index === e.index);
  if (!mine.length) return false;
  const seat = o.seat, effect = e.kind === 'assertion' ? 'assertion' : e.kind === 'scavenge' ? 'scavenging' : e.filter === 'animal' ? 'hunter' : e.filter === 'sponsor' ? 'scuba dive' : 'perception';
  const n = e.n || 1, keys = (a) => (Array.isArray(a.args.keep) ? a.args.keep : a.args.keep != null ? [a.args.keep] : a.args.card != null ? [a.args.card] : []);
  const offered = new Set(mine.flatMap(keys));
  if (!S.revealSel || S.revealSel.index !== e.index || S.revealSel.step !== S.step) S.revealSel = { index: e.index, step: S.step, sel: [] };
  const sel = S.revealSel.sel;
  const pop = el('div', 'draftpop revealpop' + (effect === 'assertion' ? ' assertpop' : '')), group = el('div', 'draftgroup'), row = el('div', 'draftcards');
  if (effect === 'assertion') pop.style.setProperty('--per', String(Math.ceil(e.cards.length / 2)));
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
