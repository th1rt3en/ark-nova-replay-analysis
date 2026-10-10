// [module] Floating dock at the bottom left with the hands / endgame cards of both players.
import { $, el, seatColor } from './util.js';
import { FORK, S, SANDBOX } from './state.js';
import { curState, hides } from './pov.js';
import { cardRow, quietly } from './cards.js';
import { iconUrl } from './icons.js';
import { cardPickAct, forkActs, pickCardOf } from './action-bar.js';
import { settingsOpen } from './settings.js';


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
  if (FORK) {                                                           // a card is to be played: the cards the engine does not let the player play (not an animal / a sponsor, a requirement, the price or an enclosure that cannot be met) are greyed out
    const ok = forkActs((a) => a.player === seat && a.args && a.args.card && !a.args.from_display && ['play_animal', 'play_sponsor', 'sponsor_side'].includes(a.kind)).map((a) => a.args.card);
    if (ok.length) return (k) => !ok.includes(k);
  }
  const o = S.replay.steps[S.step].options;
  // (a Sponsors action that has nothing left to play, e.g. while the effects of the sponsor just played resolve: the lists are empty, so the hand is not greyed out)
  return o && o.sponsors && o.seat === seat && !hides(seat) && (o.sponsors.hand.length || (o.sponsors.display || []).length) ? (k) => !o.sponsors.hand.includes(k) : null;
}
try { S.dockSel = JSON.parse(localStorage.getItem('dockSel') || 'null'); } catch (e) { /* no storage */ }
if (!S.dockSel) S.dockSel = { seat: 0, kind: 'hand' };
try { S.dockHidden = localStorage.getItem('dockHidden') === '1'; } catch (e) { /* no storage */ }
const saveDock = () => { try { localStorage.setItem('dockSel', JSON.stringify(S.dockSel)); localStorage.setItem('dockHidden', S.dockHidden ? '1' : '0'); } catch (e) { /* no storage */ } };
// ---- the fan appears: "Deal" when the hand is dealt for the first time (the hand was empty before: start of the game), "Rise and spread" otherwise (page load, the setting changed). The cards of a fan
// that is drawn again while the intro runs go on where they were (negative delay), as every redraw replaces the card elements.
const FAN_RISE_MS = 900, FAN_DEAL_MS = 520, FAN_DEAL_GAP = 110;
let fanIntroState = null, fanDone = false;
const lastCount = {};                                                                                        // (per seat: the cards in the hand at the last drawing and whether the game was still in its setup; only setup with an empty hand -> cards = the starting hand is dealt)
document.addEventListener('handmode', () => { fanDone = false; fanIntroState = null; });       // (the setting changed: the next fan rises and spreads)
function fanIntro(row, handCount, seat, setup) {
  const prev = lastCount[seat]; lastCount[seat] = { count: handCount, setup };
  const cards = [...row.children].filter((c) => c.classList.contains('card') && !c.classList.contains('card-gone'));
  if (!cards.length || !cards[0].animate) return;
  const now = Date.now();
  if (prev && prev.setup && prev.count === 0 && handCount > 0 && (!fanIntroState || fanIntroState.kind !== 'deal')) { fanIntroState = { kind: 'deal', start: now }; fanDone = true; }
  else if (!fanIntroState && !fanDone) { fanIntroState = { kind: 'rise', start: now }; fanDone = true; }
  const s = fanIntroState; if (!s) return;
  const total = s.kind === 'rise' ? FAN_RISE_MS : FAN_DEAL_MS + (cards.length - 1) * FAN_DEAL_GAP, elapsed = now - s.start;
  if (elapsed >= total) { fanIntroState = null; return; }
  const n = cards.length, step = n > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 0, hk = parseFloat(getComputedStyle(document.body).getPropertyValue('--hk')) || 1.5, rise = 240 * hk;
  cards.forEach((c, i) => {
    if (s.kind === 'deal') c.classList.remove('card-new');                                          // (the green "new card" flash would play on top of the deal)
    c.getAnimations().forEach((a) => { if (a.constructor === Animation) a.cancel(); });          // (only our own earlier intro, not CSS transitions)
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
export function renderDock(st) {
  let dock = $('dock');
  if (!dock) { dock = el('div', 'dock'); dock.id = 'dock'; document.body.append(dock); }
  dock.className = 'dock' + (S.handMode === 'tray' ? ' traymode' : '');                 // (the hand is shown in a fan at the screen edge, or in a floating tray)
  if (SANDBOX && S.replay.setup) { dock.replaceChildren(); return; }                // (nothing to show before the game: the seat and the maps are chosen first)
  const panel = el('div', 'dockpanel');
  const bar = el('div', 'dockbar');
  const rows = {};
  const shownSel = S.pov !== null && S.dockSel && S.dockSel.seat !== S.pov ? { seat: S.pov, kind: S.dockSel.kind } : S.dockSel;      // (a player's point of view has no way to the other player's cards)
  st.players.forEach((p, seat) => {
    if (hides(seat)) return;
    const cards = { hand: p.hand, endgame: p.endgame_hand || [] };
    const group = el('div', 'dockgroup');                               // the two buttons of a player (hand | endgame cards) switch between that player's cards
    group.style.setProperty('--pc', seatColor(seat));
    const pair = el('div', 'dockpair');
    for (const kind of ['hand', 'endgame']) {
      const row = cardRow(cards[kind], kind === 'hand' ? '' : 'small', kind === 'hand' ? 'empty' : 'none', seat + ':' + kind, kind === 'hand' ? handDim(seat) : null, true);
      rows[seat + ':' + kind] = row;                                   // (built for both players every time, so the arrivals and departures of the cards are tracked)
      const on = !S.dockHidden && shownSel && shownSel.seat === seat && shownSel.kind === kind;
      const b = el('button', 'dockbtn' + (on ? ' on' : ''));
      b.type = 'button';
      const label = S.replay.players[seat].name + ': ' + (kind === 'hand' ? 'hand' : 'endgame cards') + ' (' + cards[kind].length + ')';
      b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', String(on));
      b.style.setProperty('--pc', seatColor(seat));
      const img = el('img'); img.src = iconUrl(kind === 'hand' ? 'r4c7' : 'r4c11'); img.alt = ''; b.append(img, el('span', 'dockn', cards[kind].length));
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
  if (S.handMode === 'tray') { drawTray(dock, rows, shownSel, st); return; }
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
    who.style.color = seatColor(shownSel.seat);
    head.append(who, document.createTextNode(shownSel.kind === 'hand' ? ' - hand' : ' - endgame cards'));
    const shown = rows[shownSel.seat + ':' + shownSel.kind];
    shown.querySelectorAll('.card-gone').forEach((g) => g.remove());      // (the fading "departed" cards would take a slot of the fan and vanish later: the fan would stay lopsided)
    const fan = [...shown.children].filter((c) => c.classList.contains('card'));         // the cards lie in a fan: --i = the place of a card counted from the middle, --n = how many (the CSS rotates and overlaps them)
    shown.style.setProperty('--n', String(Math.max(1, fan.length)));
    fan.forEach((c, i) => c.style.setProperty('--i', (i - (fan.length - 1) / 2).toFixed(1)));
    panel.append(head, shown);
    panel.style.setProperty('--pc', seatColor(shownSel.seat));
    dock.replaceChildren(bar, panel);                                // the buttons above the cards
    fanIntro(shown, st && st.players[shownSel.seat] ? st.players[shownSel.seat].hand.length : 1, shownSel.seat, !!(st && st.phase === 'setup'));
  } else dock.replaceChildren(bar);
}


// ---- the floating tray (setting "Hand display" = Floating container): the cards of the shown row lie flat in a cream tray at the bottom left; the card / endgame card buttons are round discs on its top edge, the
// arrow disc at its right end folds it. A folded tray still shows the top of the cards. A click on the header strip of the tray (the empty band above the cards) or on the arrow folds / unfolds it, and so does the H key.
export function toggleDock() { S.dockHidden = !S.dockHidden; saveDock(); renderDock(curState()); }
const HINT_KEY = 'handTrayHint', HINT_MS = 4600;                      // (the one-time hint: remembered in localStorage; picking the setting shows it again)
let hintPending = false, hintStart = 0;
const hintSeen = () => { try { return localStorage.getItem(HINT_KEY) === '1'; } catch (e) { return true; } };
function startHint() { hintStart = Date.now(); hintPending = false; try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* no storage */ } }
document.addEventListener('handmode', () => { if (S.handMode === 'tray') hintPending = true; renderDock(curState()); });        // (the setting was changed)
document.addEventListener('settingsclosed', () => { if (hintPending && S.handMode === 'tray') renderDock(curState()); });
const TRAY_ROW = 20;                                                    // cards per row: more than that start a second row
function trayBox() {                                                   // left edge = the left edge of the boards (display, map, move bar); right edge = the right edge of the display / association boards, so the tray never reaches the side bar
  const sh = document.querySelector('.shared'), sc = S.scaled ? S.scale : 1, r = sh && sh.getBoundingClientRect();
  const left = r ? Math.round(r.left / sc) : 14;
  return { left, width: Math.max(300, Math.round((r ? r.right / sc : 1200) - left)) };
}
function placeTray(wrap) { const b = trayBox(); wrap.style.setProperty('--maxw', b.width + 'px'); wrap.parentNode.style.left = b.left + 'px'; }
window.addEventListener('resize', () => { const w = document.querySelector('.handtray'); if (w) placeTray(w); });
function drawTray(dock, rows, shownSel, st) {
  const row = shownSel && rows[shownSel.seat + ':' + shownSel.kind];
  if (!row || (st && st.phase === 'setup' && st.draft && st.draft.stage !== 'done')) { dock.replaceChildren(); return; }       // (no tray at all during the action card draft: nothing to show yet)
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
  } else { frame = wrap.querySelector('.trayframe'); btns = wrap.querySelector('.traybtns'); wrap.querySelector('.trayhint')?.remove(); }
  wrap.classList.toggle('fol', folded); wrap.classList.toggle('unf', !folded);
  wrap.style.setProperty('--pc', seatColor(seat));
  wrap.style.setProperty('--cols', String(cols));
  const head = el('div', 'trayhead');
  head.onclick = toggleDock;
  frame.replaceChildren(head, row);
  const kids = [];
  for (const kind of ['hand', 'endgame']) {
    const cnt = (kind === 'hand' ? S.replay.steps[S.step].state.players[seat].hand : S.replay.steps[S.step].state.players[seat].endgame_hand || []).length;
    const b = el('button', 'traydisc' + (shownSel.kind === kind ? ' on' : '')); b.type = 'button';
    const label = S.replay.players[seat].name + ': ' + (kind === 'hand' ? 'hand' : 'endgame cards') + ' (' + cnt + ')';
    b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', String(shownSel.kind === kind));
    const img = el('img'); img.src = iconUrl(kind === 'hand' ? 'r4c7' : 'r4c11'); img.alt = '';
    b.append(img, el('span', 'traycount', cnt));
    b.onclick = () => { S.dockSel = { seat, kind }; S.dockHidden = false; saveDock(); renderDock(curState()); };
    kids.push(b);
  }
  btns.replaceChildren(...kids);
  if (!settingsOpen() && (hintPending || (!hintSeen() && !hintStart))) startHint();
  const age = Date.now() - hintStart;
  if (hintStart && age < HINT_MS) {                                  // (the label goes on where it was after a re-draw)
    const hint = el('div', 'trayhint', 'Click the tray to fold or unfold it'); hint.style.animationDelay = -age + 'ms';
    wrap.append(hint);
  }
  if (wrap.parentNode !== dock) dock.replaceChildren(wrap);
  placeTray(wrap);
}

document.addEventListener('cardorder', () => quietly(() => renderDock(curState())));       // a card was dragged to a new place: draw the cards again in the new order
