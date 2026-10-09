// [module] Popup listing the discard pile / endgame deck.
import { $, el } from './util.js';
import { FORK, S } from './state.js';
import { curState } from './pov.js';
import { card } from './cards.js';

export function openPile(which) { S.openedPile = which; renderPile(); }
export function closePile() { S.openedPile = null; renderPile(); }
export function renderPile() {
  let box = $('pile');
  if (!S.openedPile) { if (box) box.hidden = true; return; }
  if (!box) {
    box = el('div', 'pile'); box.id = 'pile';
    box.addEventListener('click', (e) => { if (e.target === box) closePile(); });
    document.body.append(box);
  }
  const st = curState();
  const keys = S.openedPile === 'discard' ? st.main_discard.slice().reverse() : S.openedPile === 'deck' ? st.main_deck.slice() : st.endgame_deck.slice().sort();      // the newest discard first; the draw pile top first; the endgame deck is shown unordered
  const secret = S.pov !== null && S.openedPile !== 'discard';             // the contents of the draw pile and of the endgame deck are hidden in a player's point of view
  const win = el('div', 'pilewin');
  const head = el('div', 'pilehead');
  head.append(el('h2', '', (S.openedPile === 'discard' ? 'Discard pile' : S.openedPile === 'deck' ? 'Draw pile, top first' : 'Endgame cards left (unordered)') + ' - ' + (secret ? (S.openedPile === 'deck' ? st.main_deck_size : st.endgame_deck_size) : keys.length) + ' card' + ((secret ? 1 : keys.length) === 1 ? '' : 's')));
  const x = el('button', 'pileclose', '✕');
  x.type = 'button'; x.title = 'Close (Escape)'; x.setAttribute('aria-label', 'Close');
  x.onclick = closePile;
  head.append(x);
  const grid = el('div', 'cards pilegrid');
  if (secret) {
    const n = S.openedPile === 'deck' ? st.main_deck_size : st.endgame_deck_size;
    grid.append(el('div', 'pilenote', 'Hidden in this point of view: ' + n + ' card' + (n === 1 ? '' : 's') + ' are left. Switch to "All hands" to see what is in this pile.'));
  } else if (!keys.length) grid.append(el('span', 'empty', 'no cards'));
  const known = S.openedPile === 'deck' ? st.main_deck_known || 0 : 0;
  (secret ? [] : keys).forEach((k, i) => {
    if (FORK && S.openedPile === 'deck' && i === 0) grid.append(el('div', 'pilenote', 'The order of this fork, set by seed ' + S.forkInfo.seed + ': the next card to be drawn comes first.'));
    else if (S.openedPile === 'deck' && i === 0 && known > 0) grid.append(el('div', 'pilenote', 'The order of these ' + known + ' cards is real: the log shows them being drawn later'));
    if (!FORK && S.openedPile === 'deck' && i === known) grid.append(el('div', 'pilenote guess', 'The log never shows the order of the other ' + (keys.length - known) + ' cards: this order is a random guess'));
    grid.append(card(k));
  });
  win.append(head, grid);
  box.replaceChildren(win);
  box.hidden = false;
}
