// [module] Floating dock at the bottom left with the hands / endgame cards of both players.
import { $, el, seatColor, seatText } from './util.js';
import { FORK, MINIGAME, PLAY, S, SANDBOX } from './state.js';
import { curState, hides as povHides, seatOrder, seesAll } from './pov.js';
const hides = (seat) => povHides(seat) || (PLAY && S.play.seat !== null && seat !== S.play.seat);       // (a live game is between two real players: the dock only has the player's own hand and endgame cards, nothing of the opponent)
import { cardRow, quietly } from './cards.js';
import { pointsBadge } from './egpoints.js';
import { endgameDiscardAt } from './egdiscard.js';
import { iconUrl } from './icons.js';
import { motionOff } from './motion.js';
import { cardPickAct, forkActs, pickCardOf } from './action-bar.js';
import { playedChips, playedMode, withCubes } from './zoo.js';


// A Hunter / Scuba Dive reveal (the step "X draw ... for hunter effect"): the cards are drawn and one of them is kept. Of the drawn cards only those the effect takes stay
// bright (animals for Hunter, sponsors for Scuba Dive); the other drawn cards and every other card of the hand are greyed out. The drawn cards are the ones the hand of the
// drawing player gained in this step. The label is the source (the engine's own prompt is not there when it could not replay the turn).
function revealDim(seat) {
  const i = S.step, st = S.replay.steps[i], me = S.replay.players[seat];
  const label = st ? String(st.label || '') : '';
  const kind = /draw .* for (hunter|scuba dive) effect/i.exec(label);
  if (!kind || !me || !label.startsWith(me.name + ' ') || !st.state.players[seat]) return null;
  const before = i > 0 && S.replay.steps[i - 1].state.players[seat] ? S.replay.steps[i - 1].state.players[seat].hand : [];
  const drawn = st.state.players[seat].hand.filter((k) => !before.includes(k));
  const takes = (k) => (/hunter/i.test(kind[1] || kind[0]) ? k.startsWith('A') : k.startsWith('S'));
  return (k) => !(drawn.includes(k) && takes(k));
}
// while a sponsor is to be played, everything in the hand of that player that is not a playable sponsor is greyed out
function handDim(seat) {
  if (FORK && S.marketMode !== null) {                                    // Marketing: the sponsors that cannot be played are greyed out
    const keys = forkActs((a) => a.kind === 'choose_effect' && a.player === seat && a.args.index === S.marketMode && typeof a.args.card === 'string').map((a) => a.args.card);
    if (keys.length) return (k) => !keys.includes(k);
  }
  if (FORK) {                                                           // a card is to be picked for an effect (digging...): the others are greyed out
    const keys = forkActs((a) => a.player === seat && cardPickAct(a)).map(pickCardOf);
    if (keys.length) return (k) => !keys.includes(k);
  }
  if (FORK && (S.snapMode === 'sun_money' || S.snapMode === 'sun_strength')) {                // Sponsors variant 3: the cards that can be discarded stay lit
    const op = S.snapMode === 'sun_strength' ? 'discard_strength' : 'discard_money';
    const keys = forkActs((a) => a.player === seat && a.kind === 'sponsor_side' && a.args.op === op).map((a) => a.args.card);
    return (k) => !keys.includes(k);
  }
  if (FORK && S.snapMode) {                                             // Sponsors variant 4: first the sponsor to discard (the other cards of the hand are greyed out), then the one of the display (the whole hand is)
    if (S.snapMode === 'snap') return () => true;
    const keys = forkActs((a) => a.player === seat && a.kind === 'sponsor_side' && a.args.op === 'discard_snap').map((a) => a.args.card);
    return (k) => !keys.includes(k);
  }
  if (FORK) {                                                           // a card is to be played: the cards the engine does not let the player play (not an animal / a sponsor, a requirement, the price or an enclosure that cannot be met) are greyed out
    const ok = forkActs((a) => a.player === seat && a.args && a.args.card && !a.args.from_display && ['play_animal', 'play_sponsor', 'sponsor_side'].includes(a.kind) && a.args.op !== 'discard_snap' && a.args.op !== 'discard_money' && a.args.op !== 'discard_strength').map((a) => a.args.card);
    if (ok.length) return (k) => !ok.includes(k);
  }
  const reveal = revealDim(seat);
  if (reveal) return reveal;
  const o = S.replay.steps[S.step].options;
  // (a Sponsors action that has nothing left to play, e.g. while the effects of the sponsor just played resolve: the lists are empty, so the hand is not greyed out)
  return o && o.sponsors && o.seat === seat && !hides(seat) && (o.sponsors.hand.length || (o.sponsors.display || []).length) ? (k) => !o.sponsors.hand.includes(k) : null;
}
try { S.dockSel = JSON.parse(localStorage.getItem('dockSel') || 'null'); } catch (e) { /* no storage */ }
if (!S.dockSel) S.dockSel = { seat: 0, kind: 'hand' };
try { S.dockHidden = localStorage.getItem('dockHidden') === '1'; } catch (e) { /* no storage */ }
const KIND_NAME = { hand: 'hand', endgame: 'endgame cards', stored: 'storage (Caves)', played: 'played cards' };
const KIND_ICON = { hand: 'r4c7', endgame: 'r4c11', stored: 'r5c2', played: 'played' };       // (the store icon of the sheet for the cards under the notepad of map 11)
const saveDock = () => { if (MINIGAME) return; try { localStorage.setItem('dockSel', JSON.stringify(S.dockSel)); localStorage.setItem('dockHidden', S.dockHidden ? '1' : '0'); } catch (e) { /* no storage */ } };
// ---- how the hand appears. Fan: "Deal" when the starting hand is dealt (setup phase, the hand was empty before), "Rise and spread" otherwise (page load, the setting changed). Tray: "Drop" for the starting hand
// (the tray itself slides up, CSS). The cards of a hand that is drawn again while the intro runs go on where they were (negative delay), as every redraw replaces the card elements.
const FAN_RISE_MS = 900, FAN_DEAL_MS = 520, FAN_DEAL_GAP = 110, DROP_MS = 560, DROP_GAP = 100, TRAY_SLIDE_MS = 350;       // (the drop: the starting hand falls into the floating tray once it has slid up)
let introState = null, introDone = false;
const lastCount = {};                                                                                        // (per seat: the cards in the hand at the last drawing and whether the game was still in its setup; only setup with an empty hand -> cards = the starting hand is dealt)
let fanRaised = false;                                                                                      // (the fan stands up like on hover until the settings close: after the switch from an unfolded tray)
// the setting "Hand display" was changed (settings.js): the next fan rises and spreads
document.addEventListener('handmode', () => {
  introDone = false; introState = null;
  if (S.handMode === 'fan') {
    fanRaised = !S.dockHidden;                                                                               // (an unfolded tray -> an unfolded fan that sinks to rest when the settings close; a folded tray -> the fan appears at rest)
    if (S.dockHidden) { S.dockHidden = false; saveDock(); }                                                  // (the fan has no folded state but "not drawn": it would never appear)
  } else fanRaised = false;
  renderDock(curState());
});
document.addEventListener('settingsclosed', () => {
  if (fanRaised) { fanRaised = false; const d = $('dock'); if (d) d.classList.remove('raised'); return; }   // (the CSS transition sinks the fan)
});
function dockIntro(row, handCount, seat, setup, tray) {
  const prev = lastCount[seat]; lastCount[seat] = { count: handCount, setup };
  const cards = [...row.children].filter((c) => c.classList.contains('card') && !c.classList.contains('card-gone'));
  if (!cards.length || !cards[0].animate) return;
  const now = Date.now();
  if (prev && prev.setup && prev.count === 0 && handCount > 0) { introState = null; introDone = true; return; } // card-motion owns all deals, including setup
  else if (!tray && !introState && !introDone) { introState = { kind: 'rise', start: now }; introDone = true; }
  const s = introState; if (!s || (s.kind === 'drop') !== !!tray || motionOff()) return;
  const total = s.kind === 'rise' ? FAN_RISE_MS : s.kind === 'drop' ? TRAY_SLIDE_MS + DROP_MS + (cards.length - 1) * DROP_GAP : FAN_DEAL_MS + (cards.length - 1) * FAN_DEAL_GAP, elapsed = now - s.start;
  if (elapsed >= total) { introState = null; return; }
  const n = cards.length, step = n > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 0, hk = parseFloat(getComputedStyle(document.body).getPropertyValue('--hk')) || 1.5, rise = 240 * hk;
  cards.forEach((c, i) => {
    c.getAnimations().forEach((a) => { if (a.constructor === Animation) a.cancel(); });          // (only our own earlier intro, not CSS transitions)
    if (s.kind === 'drop') {                                         // the tray is empty until each card falls in (hidden while it waits: fill backwards)
      c.animate([{ transform: 'translateY(-260px) rotate(' + (i % 2 ? -9 : 9) + 'deg)', opacity: 0 }, { opacity: 1, offset: .2 }, { transform: 'translateY(6px) rotate(0deg)', opacity: 1, offset: .75 }, { transform: 'none', opacity: 1 }],
        { duration: DROP_MS, delay: TRAY_SLIDE_MS + i * DROP_GAP - elapsed, easing: 'ease-out', fill: 'backwards' });
      return;
    }
    const fin = getComputedStyle(c).transform, sx = ((n - 1) / 2 - i) * step;
    if (s.kind === 'rise') {
      c.animate([{ transform: 'translateY(' + rise + 'px) translateX(' + sx + 'px) rotate(0deg)' }, { transform: 'translateY(0px) translateX(' + sx + 'px) rotate(0deg)', offset: .38 }, { transform: fin }],
        { duration: FAN_RISE_MS, delay: -elapsed, easing: 'cubic-bezier(.25,.9,.3,1.05)', fill: 'backwards' });
    } else {
      c.animate([{ transform: 'translateY(' + (rise * 1.2) + 'px) rotate(0deg)', opacity: 0 }, { opacity: 1, offset: .25 }, { transform: fin, opacity: 1 }],
        { duration: FAN_DEAL_MS, delay: i * FAN_DEAL_GAP - elapsed, easing: 'cubic-bezier(.2,.9,.3,1.08)', fill: 'backwards' });
    }
  });
}
// The endgame discard (replay, followed player only): while it is going on the hand shows the endgame cards; when it is over the cards that were open before come back. Nothing is saved
// (`saveDock` is not called: a reload does not keep the automatic view) and a view the viewer chose by hand during the discard is left alone.
function autoEndgame() {
  if (FORK || SANDBOX || PLAY || MINIGAME || !S.replay || S.pov === null) { S.autoEg = null; return; }
  if (S.autoEg && S.autoEg.replay !== S.replay) S.autoEg = null;
  const inside = endgameDiscardAt(S.step, S.pov), here = S.dockSel && S.dockSel.seat === S.pov && S.dockSel.kind === 'endgame';
  if (inside && !S.autoEg) {
    S.autoEg = { replay: S.replay, prev: here ? null : S.dockSel };
    if (!here) S.dockSel = { seat: S.pov, kind: 'endgame' };
  } else if (!inside && S.autoEg) {
    const a = S.autoEg; S.autoEg = null;
    if (a.prev && here) S.dockSel = a.prev;
  }
}
export function renderDock(st) {
  let dock = $('dock');
  if (!dock) { dock = el('div', 'dock'); dock.id = 'dock'; document.body.append(dock); }
  if (S.handMode !== 'tray') dock.style.left = '';                                       // (the tray sets `left` on the dock: the fan must go back to the stylesheet's)
  dock.className = 'dock' + (S.handMode === 'tray' ? ' traymode' : '') + (S.handMode === 'fan' && fanRaised ? ' raised' : '');                 // (the hand is shown in a fan at the screen edge, or in a floating tray)
  if (SANDBOX && S.replay.setup) { dock.replaceChildren(); return; }                // (nothing to show before the game: the seat and the maps are chosen first)
  if (MINIGAME && S.pov === null) { dock.replaceChildren(); document.body.style.paddingBottom = ''; return; }      // (both hands are under the zoos, zoo.js)
  autoEndgame();
  if (S.dockSel && S.dockSel.kind === 'played' && playedMode() !== 'tray') S.dockSel = { seat: S.dockSel.seat, kind: 'hand' };         // (the setting "Played cards" was changed away from the tray)
  const panel = el('div', 'dockpanel');
  const bar = el('div', 'dockbar');
  const rows = {};
  const shownSel = !seesAll() && S.pov !== null && S.dockSel && S.dockSel.kind !== 'played' && S.dockSel.seat !== S.pov ? { seat: S.pov, kind: S.dockSel.kind } : S.dockSel;      // (a player's point of view has no way to the other player's cards)
  dock.dataset.motionSeat = String(shownSel?.seat ?? '');
  dock.dataset.motionKind = shownSel?.kind || '';
  st.players.forEach((p, seat) => {
    if (hides(seat)) return;
    const cards = { hand: p.hand, endgame: p.endgame_hand || [], stored: p.stored || [], played: [...p.animals, ...p.sponsors] };
    const kinds = kindsOf(p);        // (map 11, Caves: the cards stored under the notepad are a third zone, apart from the hand)
    const group = el('div', 'dockgroup');                               // the two buttons of a player (hand | endgame cards) switch between that player's cards
    group.style.setProperty('--pc', seatColor(seat));
    const pair = el('div', 'dockpair');
    for (const kind of kinds) {
      const row = kind === 'played' ? el('div', 'cards') : cardRow(cards[kind], kind === 'hand' ? '' : 'small', kind === 'hand' || kind === 'stored' ? '' : 'none', seat + ':' + kind, kind === 'hand' ? handDim(seat) : null, !MINIGAME);                  // (a mini game: no highlighting, no dragging; the page's own hook makes the cards the thing to click)
      if (kind === 'endgame') for (const c of row.querySelectorAll('.card[data-key]')) { const pb = pointsBadge((p.endgame_card_pts || {})[c.dataset.key]); if (pb) c.append(pb); }      // (what each endgame card would score now: a strip on the picture of the small card; the enlarged view is another picture and has none)
      rows[seat + ':' + kind] = row;                                   // (built for both players every time, so the arrivals and departures of the cards are tracked)
      const on = !S.dockHidden && shownSel && shownSel.seat === seat && shownSel.kind === kind;
      const b = el('button', 'dockbtn' + (on ? ' on' : ''));
      b.type = 'button';
      const label = S.replay.players[seat].name + ': ' + KIND_NAME[kind] + ' (' + cards[kind].length + ')';
      b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', String(on));
      b.dataset.seat = String(seat); b.dataset.kind = kind;
      b.style.setProperty('--pc', seatColor(seat));
      const img = el('img'); img.src = iconUrl(KIND_ICON[kind]); img.alt = ''; b.append(img, el('span', 'dockn', cards[kind].length));
      b.onclick = () => {
        S.dockSel = { seat, kind };                                      // (the button of the open cards folds them away: the arrow at the end does that too)
        S.dockHidden = on;
        saveDock();
        renderDock(curState());
      };
      pair.append(b);
    }
    group.append(pair);
    bar.append(group);
  });
  if (MINIGAME && S.minigame) for (const k of Object.keys(rows)) S.minigame.decorate(rows[k], k);       // (mini game pages: `S.minigame.decorate(row, 'seat:hand')` makes the cards of a row selectable)
  if (S.handMode === 'tray') { drawTray(dock, rows, shownSel, st); fitDockSpace(dock); return; }
  const fold = el('button', 'dockfold');                               // collapse / expand the cards, at the right end of the buttons
  fold.type = 'button';
  fold.textContent = S.dockHidden ? '▲' : '▼';
  fold.title = S.dockHidden ? 'Show the cards' : 'Hide the cards';
  fold.setAttribute('aria-label', fold.title); fold.setAttribute('aria-expanded', String(!S.dockHidden));
  fold.onclick = () => { S.dockHidden = !S.dockHidden; saveDock(); renderDock(curState()); };
  bar.append(fold);
  if (!S.dockHidden && shownSel && rows[shownSel.seat + ':' + shownSel.kind]) {
    const head = el('div', 'dockhead');
    const who = el('b', '', S.replay.players[shownSel.seat].name);
    who.style.color = seatText(shownSel.seat);
    head.append(who, document.createTextNode(' - ' + KIND_NAME[shownSel.kind]));
    const shown = rows[shownSel.seat + ':' + shownSel.kind];
    shown.querySelectorAll('.card-gone').forEach((g) => g.remove());      // (the fading "departed" cards would take a slot of the fan and vanish later: the fan would stay lopsided)
    const fan = [...shown.children].filter((c) => c.classList.contains('card'));         // the cards lie in a fan: --i = the place of a card counted from the middle, --n = how many (the CSS rotates and overlaps them)
    shown.style.setProperty('--n', String(Math.max(1, fan.length)));
    fan.forEach((c, i) => c.style.setProperty('--i', (i - (fan.length - 1) / 2).toFixed(1)));
    panel.append(head, shown);
    panel.style.setProperty('--pc', seatColor(shownSel.seat));
    dock.replaceChildren(bar, panel);                                // the buttons above the cards
    dockIntro(shown, st && st.players[shownSel.seat] ? st.players[shownSel.seat].hand.length : 1, shownSel.seat, !!(st && st.phase === 'setup'));
  } else dock.replaceChildren(bar);
  fitDockSpace(dock);
}
// The dock floats over the bottom of the page: the page gets enough room under its last row that everything at the bottom (the zoos, the action cards under them, the bar that hangs
// under a box with an open drawer) can be scrolled clear of the hand. Measured, not guessed: how far the visible part of the dock reaches up from the bottom of the window (a folded tray
// is its round buttons, an unfolded one the whole tray, the fan its cards at rest) plus how far anything hangs below the page's last row. Measured again whenever any of that can change:
// a new drawing, the end of an animation or transition (a tray sliding in, a drawer's bar coming down), a size change of the zoos or the dock, a window resize.
const spaceWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => queueDockSpace()) : null, spaceSeen = new WeakSet();
function fitDockSpace(dock) {
  const body = document.body;
  if (spaceWatch) for (const e of [$('zoos'), dock]) if (e && !spaceSeen.has(e)) { spaceWatch.observe(e); spaceSeen.add(e); }      // (the zoos grow with an open drawer or the action cards, the dock with its tray)
  if (!dock.childNodes.length || dock.hidden) { body.style.paddingBottom = ''; return; }
  if (dock.classList.contains('raised') || dock.querySelector('.handtray.enter')) { queueDockSpace(); return; }      // (a raised fan sinks back, a new tray is still sliding up: measured when it has settled)
  const z = S.scale || 1, vh = window.innerHeight;
  if (!dock.classList.contains('traymode')) {                                // (the strip that keeps the fan raised: exactly where its cards lie at rest, in the dock's own pixels)
    const cs = [...dock.querySelectorAll('.dockpanel .cards .card')].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 2);
    if (cs.length) {
      const d0 = dock.getBoundingClientRect().left, l = Math.min(...cs.map((r) => r.left)), rt = Math.max(...cs.map((r) => r.right));
      dock.style.setProperty('--fl', ((l - d0) / z - 6).toFixed(1) + 'px'); dock.style.setProperty('--fw', ((rt - l) / z + 12).toFixed(1) + 'px');
    } else { dock.style.removeProperty('--fl'); dock.style.removeProperty('--fw'); }
  }
  let top = vh;
  for (const e of [dock, ...dock.querySelectorAll(':scope > *, .handtray, .trayframe, .traydisc, .dockbtn, .dockpanel')]) {          // (the frames, not the cards: a card in flight is moved by a transform and would read as reaching to the top of the window)
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= vh) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    top = Math.min(top, r.top);
  }
  const cover = Math.max(0, vh - top) / z;
  const was = (parseFloat(body.style.paddingBottom) || parseFloat(getComputedStyle(body).paddingBottom) || 0) * z;
  const flowEnd = body.getBoundingClientRect().bottom - was;               // (where the page's own content ends, in window pixels)
  let hang = 0;
  for (const e of document.querySelectorAll('#zoos .zoo, #zoos .zoo .assocbar, #zoos .zoo > .actstrip')) hang = Math.max(hang, e.getBoundingClientRect().bottom - flowEnd);
  body.style.paddingBottom = Math.ceil(Math.max(0, hang) / z + cover + 16) + 'px';
}
let spaceQueued = 0;
export function queueDockSpace() {
  if (spaceQueued) return;
  spaceQueued = requestAnimationFrame(() => { spaceQueued = 0; const d = $('dock'); if (d && !MINIGAME) fitDockSpace(d); });
}
window.addEventListener('resize', queueDockSpace);
window.addEventListener('load', queueDockSpace);
document.addEventListener('animationend', queueDockSpace, true);
document.addEventListener('transitionend', queueDockSpace, true);



// ---- the floating tray (setting "Hand display" = Floating container): the cards of the shown row lie flat in a dark glass tray at the bottom left; the card / endgame card buttons are round discs on its top edge.
// A folded tray still shows the top of the cards. The round button at the top right of the tray folds / unfolds it, and so does the H key (also folds the fan away).
const kindsOf = (p) => [...(p.map_id === '11' ? ['hand', 'endgame', 'stored'] : ['hand', 'endgame']), ...(playedMode() === 'tray' ? ['played'] : [])];        // (the tabs of a player's cards, in the order of the buttons; map 11, Caves: the cards stored under the notepad are a third zone; the played cards: the setting "Played cards" = tray)
// Tab / Shift + Tab: the next / previous tab of the cards that are shown (hand, endgame cards, storage of map 11, played cards), the same seat; a folded hand stays folded (the tabs can be switched through while it is folded). False when there is nothing to switch.
export function cycleDockTab(dir) {
  const st = curState();
  if (MINIGAME || !st || !S.dockSel) return false;
  const cur = !seesAll() && S.pov !== null && S.dockSel.kind !== 'played' && S.dockSel.seat !== S.pov ? { seat: S.pov, kind: S.dockSel.kind } : S.dockSel;
  const p = st.players[cur.seat];
  if (!p || hides(cur.seat)) return false;
  const kinds = kindsOf(p), at = kinds.indexOf(cur.kind), next = kinds[at < 0 ? 0 : (at + dir + kinds.length) % kinds.length];
  S.dockSel = { seat: cur.seat, kind: next }; saveDock(); renderDock(st);
  return true;
}
export function toggleDock() { S.dockHidden = !S.dockHidden; saveDock(); renderDock(curState()); }
const TRAY_ROW = 20;                                                    // cards per row: more than that start a second row
function trayBox() {                                                   // left edge = the left edge of the boards (display, map, move bar); right edge = the right edge of the display / association boards, so the tray never reaches the side bar
  const sh = document.querySelector('.shared'), sc = S.scaled ? S.scale : 1, r = sh && sh.getBoundingClientRect();
  const left = r ? Math.round(r.left / sc) : 14;
  return { left, width: Math.max(300, Math.round((r ? r.right / sc : 1200) - left)) };
}
function placeTray(wrap) { const b = trayBox(); wrap.style.setProperty('--maxw', b.width + 'px'); wrap.parentNode.style.left = b.left + 'px'; }
window.addEventListener('resize', () => { const w = document.querySelector('.handtray'); if (w) placeTray(w); });
function drawTray(dock, rows, shownSel, st) {
  const played = !!shownSel && shownSel.kind === 'played';
  const row = played ? el('div', 'cards') : shownSel && rows[shownSel.seat + ':' + shownSel.kind];
  const unseen = st && shownSel && st.phase === 'setup' && (st.draft && st.draft.stage !== 'done' || (!played && !((st.players[shownSel.seat] || {})[shownSel.kind === 'endgame' ? 'endgame_hand' : 'hand'] || []).length));      // (no tray during the action card draft, nor an empty one before the starting hand is dealt: it slides in with the deal)
  if (!row || unseen) {
    const sx = shownSel ? shownSel.seat : S.dockSel.seat; if (st && st.players[sx]) lastCount[sx] = { count: st.players[sx].hand.length, setup: st.phase === 'setup' };       // (so the deal after the draft is recognised)
    dock.replaceChildren(); return;                                      // (no tray at all during the action card draft: nothing to show yet)
  }
  const seat = shownSel.seat, folded = S.dockHidden;
  row.querySelectorAll('.card-gone').forEach((g) => g.remove());
  const n = [...row.children].filter((c) => c.classList.contains('card')).length, cols = Math.max(1, Math.min(n, TRAY_ROW));
  row.style.setProperty('--n', String(Math.max(1, n)));
  row.style.gridTemplateColumns = cols > 1 ? 'repeat(' + (cols - 1) + ', var(--step)) var(--W)' : 'var(--W)';
  row.classList.toggle('multi', n > TRAY_ROW);                          // (more than 20 cards: further rows, the tray scrolls)
  let wrap = dock.querySelector(':scope > .handtray'), frame, btns;      // (the same elements are kept from one draw to the next, so that the CSS can animate the fold and the width)
  if (!wrap) {
    wrap = el('div', 'handtray'); frame = el('div', 'trayframe'); btns = el('div', 'traybtns');
    wrap.append(frame, btns);
    wrap.classList.add('enter'); wrap.addEventListener('animationend', (e) => { if (e.target === wrap) wrap.classList.remove('enter'); });       // (a new tray slides up: after the draft, when the mode is changed)
  } else { frame = wrap.querySelector('.trayframe'); btns = wrap.querySelector('.traybtns') }
  wrap.classList.toggle('fol', folded); wrap.classList.toggle('unf', !folded); wrap.classList.toggle('played', played);
  wrap.style.setProperty('--pc', seatColor(seat));
  wrap.style.setProperty('--cols', String(cols));
  const head = el('div', 'trayhead');
  frame.replaceChildren(head, played ? playedTrayBody(st, seat, trayBox().width) : row);
  if (shownSel.kind === 'hand') dockIntro(row, st.players[seat].hand.length, seat, st.phase === 'setup', true);
  const kids = [];
  for (const s of st.players.keys()) {                                  // (the buttons of every seat that is not hidden: a fork / the sandbox lets you swap between the seats' hands and endgame cards)
  if (hides(s)) continue;
  const pl = st.players[s];
  for (const kind of kindsOf(pl)) {          // (map 11, Caves: the cards stored under the notepad are a third zone; the played cards: the setting "Played cards" = tray)
    const cnt = kind === 'played' ? pl.animals.length + pl.sponsors.length : (kind === 'hand' ? pl.hand : kind === 'stored' ? pl.stored || [] : pl.endgame_hand || []).length;
    const b = el('button', 'traydisc' + (shownSel.kind === kind ? ' on' : '')); b.type = 'button';
    const on = shownSel.seat === s && shownSel.kind === kind;
    const label = S.replay.players[s].name + ': ' + KIND_NAME[kind] + ' (' + cnt + ')';
    b.classList.toggle('on', on); b.style.setProperty('--pc', seatColor(s)); b.dataset.seat = String(s); b.dataset.kind = kind;
    b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', String(on));
    const img = el('img', kind === 'played' ? 'tiles' : ''); img.src = iconUrl(KIND_ICON[kind]); img.alt = '';        // (the played-cards icon is built from the two tiles of the sheet, `scripts/build_played_icon.py`)
    b.append(img, el('span', 'traycount', cnt));
    b.onclick = () => { S.dockSel = { seat: s, kind }; S.dockHidden = false; saveDock(); renderDock(curState()); };
    kids.push(b);
  }
  }
  btns.replaceChildren(...kids);
  wrap.style.setProperty('--nb', String(kids.length));                  // (the number of round buttons: the tray is never narrower than they are, see `.trayframe` min-width)
  let fold = wrap.querySelector('.trayfold');                           // the round button at the top right folds / unfolds the tray (the H key does the same)
  if (!fold) { fold = el('button', 'trayfold'); fold.type = 'button'; fold.onclick = toggleDock; wrap.append(fold); }
  fold.title = folded ? 'Show the cards' : 'Hide the cards'; fold.setAttribute('aria-label', fold.title); fold.setAttribute('aria-expanded', String(!folded));
  if (wrap.parentNode !== dock) dock.replaceChildren(wrap);
  placeTray(wrap);
}

// The played cards in the tray (setting "Played cards" = Tray): one row, animals then sponsors, each card showing as much as the width allows; a hovered card rises. Each group starts with a slim vertical rail (icon, name, count: the
// width of a rail is paid, never height, so the tray is as tall as the hand tray); the switch that picks the player sits on the top edge next to the fold button.
const RAIL_W = 32, RAIL_GAP = 22;
const onColour = (c) => {                                         // ink or white text, whichever reads better on the colour `c` (#rrggbb)
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || ''); if (!m) return '#fff';
  const l = [1, 2, 3].map((i) => { const v = parseInt(m[i], 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] > 0.4 ? '#17262B' : '#fff';
};
function playedTrayBody(st, seat, width) {
  const p = st.players[seat], box = el('div', 'pt'), deck = el('div', 'ptdeck');
  const cw = 170 * S.handScale, inner = Math.max(300, width - 16);
  const groups = [['animals', p.animals], ['sponsors', p.sponsors]].filter((g) => g[1].length);
  const total = groups.reduce((a, g) => a + g[1].length, 0), slivers = total - groups.length;
  const fixed = groups.length * RAIL_W + RAIL_GAP * (groups.length - 1) + cw * groups.length;
  const step = slivers > 0 ? Math.max(24, Math.min(100, (inner - fixed) / slivers)) : 0;
  const chips = playedChips(p, true);
  let x = 0;
  for (const [kind, keys] of groups) {
    const chip = chips[kind === 'animals' ? 0 : 1], rail = el('div', 'prail');
    rail.style.left = x + 'px';
    const img = chip.querySelector('img').cloneNode(), name = el('span', '', chip.querySelector('span').textContent), n = el('b', '', chip.querySelector('b').textContent);
    img.alt = ''; rail.append(img, name, n); deck.append(rail);
    x += RAIL_W;
    const row = cardRow(keys, 'small', 'none', seat + ':' + kind);
    if (kind === 'sponsors') withCubes(row, p, seat);
    [...row.children].filter((c) => c.classList.contains('card') && !c.classList.contains('card-gone')).forEach((c, i) => {
      c.style.left = x + 'px'; deck.append(c); x += i < keys.length - 1 ? step : cw;
    });
    x += RAIL_GAP;
  }
  if (!groups.length) deck.append(el('div', 'empty', 'No cards played yet'));
  const seg = el('div', 'ptseg');                                      // (on the top edge, left of the fold button)
  seatOrder().forEach((s) => {                                         // (the same order as the boards: the player of the left map and the upper box is on the left)
    const b = el('button', s === seat ? 'on' : ''); b.type = 'button'; b.textContent = S.replay.players[s].name; b.style.setProperty('--pc', seatColor(s)); b.style.setProperty('--pt', onColour(seatColor(s)));        // (the dot and the fill of a name are in the player's colour, the text on the fill light or dark)
    b.onclick = () => { S.dockSel = { seat: s, kind: 'played' }; S.dockHidden = false; saveDock(); renderDock(curState()); };
    seg.append(b);
  });
  box.append(seg, deck);
  return box;
}

document.addEventListener('cardorder', () => quietly(() => renderDock(curState())));       // a card was dragged to a new place: draw the cards again in the new order
