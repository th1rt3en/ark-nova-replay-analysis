// [module] Floating dock at the bottom left with the hands / endgame cards of both players.
import { $, el, seatColor } from './util.js';
import { FORK, S, SANDBOX } from './state.js';
import { curState, hides } from './pov.js';
import { cardRow, quietly } from './cards.js';
import { iconUrl } from './icons.js';
import { cardPickAct, forkActs, pickCardOf } from './action-bar.js';


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
export function renderDock(st) {
  let dock = $('dock');
  if (!dock) { dock = el('div', 'dock'); dock.id = 'dock'; document.body.append(dock); }
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
    group.append(el('span', 'dockwho', S.replay.players[seat].name));
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
  } else dock.replaceChildren(bar);
}

document.addEventListener('cardorder', () => quietly(() => renderDock(curState())));       // a card was dragged to a new place: draw the cards again in the new order
