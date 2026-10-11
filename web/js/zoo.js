// [module] Renders one player's zoo: board, cards row, association strip, bonus panel.
import { el, seatColor, section } from './util.js';
import { FORK, MINIGAME, PLAY, S, SANDBOX } from './state.js';
import { cardRow } from './cards.js';
import { zooStep } from './main.js';
import { zooBoard } from './board.js';
import { associationStrip, bonusPanel } from './association.js';


export function renderZoo(st, seat) {
  const p = st.players[seat], who = S.replay.players[seat], map = S.replay.maps[seat];
  const box = el('div', 'zoo seat' + seat + (st.active_player === seat && st.phase !== 'over' ? ' active' : ''));
  const tabbed = !FORK && !SANDBOX && !PLAY && !MINIGAME && S.zooLayout === 'tabs';
  const h = el('h2', '', tabbed ? '' : who.name);                        // the tab above the zoo: a dot in the player's colour, the name, the map
  h.style.setProperty('--pc', seatColor(seat));
  if (tabbed) {                                                          // tabbed: an arrow on either side of the name goes to the other board (main.js `zooStep`)
    const arrow = (d, label, path) => { const b = el('button', 'zootab-arrow'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="' + path + '"/></svg>'; b.onclick = () => zooStep(d); return b; };
    h.append(arrow(-1, 'Previous board', 'M13 3L5 10l8 7z'), el('span', 'zootab-name', who.name), arrow(1, 'Next board', 'M7 3l8 7-8 7z'));
  }
  h.append(el('span', 'map', 'Map ' + map.id + (map.name ? ': ' + map.name : '')));
  box.append(h);

  const row = el('div', 'zooRow');
  row.append(bonusPanel(map, p, seat), zooBoard(map, p, seat), associationStrip(p, map, seat));
  // one board at a time (tabbed) or one above the other: the played animals and sponsors stand at the right of the board, each a column of cards in which only the last card is whole
  const replayOnly = !FORK && !SANDBOX && !PLAY && !MINIGAME;
  const piles = replayOnly;                                              // (the replay: the played cards are piles, not rows under the board)
  if (piles) {
    const behind = S.zooLayout === 'side';                               // side by side: the piles stand behind the board, at its top right corner, and rise out of its top edge
    const cols = el('div', 'zoopiles' + (behind ? ' behind' : ''));
    cols.append(section('Animals', cardRow(p.animals, 'small', 'none', seat + ':animals'), 'sect zoopile'), section('Sponsors', cardRow(p.sponsors, 'small', 'none', seat + ':sponsors'), 'sect zoopile'));
    row.append(cols);
    if (behind) {                                                        // room at the top of the zoo for the taller pile of the two players (a strip is 23 px: the top 18 % of a card 92 px wide)
      const most = Math.max(...st.players.map((q) => Math.max(q.animals.length, q.sponsors.length)));
      box.style.paddingTop = (8 + 26 + most * 23) + 'px';                  // (the paper of the zoo reaches up round the piles: the names of the columns 26 px, a strip 23 px)
    } else row.classList.add('withpiles');
  }
  box.append(row);

  const played = el('div', 'played');                                    // the played cards under the map: animals and sponsors side by side (no counts)
  if (!piles) {
    played.append(section('Animals', cardRow(p.animals, 'small', 'none', seat + ':animals'), 'sect pg'));
    played.append(section('Sponsors', cardRow(p.sponsors, 'small', 'none', seat + ':sponsors'), 'sect pg'));
  }
  if (played.children.length) box.append(played);
  if (MINIGAME && S.pov === null) {                                      // a mini game that shows both players in full (Who's ahead): the dock holds one hand at a time, so each zoo carries its player's cards
    const own = el('div', 'played handsunder');
    own.append(section('Hand', cardRow(p.hand, 'small', 'empty', seat + ':hand'), 'sect pg'));
    if ((p.endgame_hand || []).length) own.append(section('Endgame cards', cardRow(p.endgame_hand, 'small', 'none', seat + ':endgame'), 'sect pg'));
    if ((p.stored || []).length) own.append(section('Stored', cardRow(p.stored, 'small', 'none', seat + ':stored'), 'sect pg'));
    box.append(own);
  }
  return box;
}
