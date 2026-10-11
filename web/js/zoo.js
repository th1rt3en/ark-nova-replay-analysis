// [module] Renders one player's zoo: board, cards row, association strip, bonus panel.
import { el, seatColor, section } from './util.js';
import { FORK, MINIGAME, PLAY, S, SANDBOX } from './state.js';
import { cardRow } from './cards.js';
import { zooBoard } from './board.js';
import { associationStrip, bonusPanel } from './association.js';


export function renderZoo(st, seat) {
  const p = st.players[seat], who = S.replay.players[seat], map = S.replay.maps[seat];
  const box = el('div', 'zoo seat' + seat + (st.active_player === seat && st.phase !== 'over' ? ' active' : ''));
  const h = el('h2', '', who.name);                                      // the tab above the zoo: a dot in the player's colour, the name, the map
  h.style.setProperty('--pc', seatColor(seat));
  h.append(el('span', 'map', 'Map ' + map.id + (map.name ? ': ' + map.name : '')));
  box.append(h);

  const row = el('div', 'zooRow');
  row.append(bonusPanel(map, p, seat), zooBoard(map, p, seat), associationStrip(p, map, seat));
  // one board at a time (tabbed) or one above the other: the played animals and sponsors stand at the right of the board, each a column of cards in which only the last card is whole
  const piles = !FORK && !SANDBOX && !PLAY && !MINIGAME && S.zooLayout !== 'side';
  if (piles) {
    const cols = el('div', 'zoopiles');
    cols.append(section('Animals', cardRow(p.animals, 'small', 'none', seat + ':animals'), 'sect zoopile'), section('Sponsors', cardRow(p.sponsors, 'small', 'none', seat + ':sponsors'), 'sect zoopile'));
    row.append(cols);
  }
  box.append(row);

  const played = el('div', 'played');                                    // the played cards under the map: animals and sponsors side by side (no counts)
  if (!piles) {
    played.append(section('Animals', cardRow(p.animals, 'small', 'none', seat + ':animals'), 'sect pg'));
    played.append(section('Sponsors', cardRow(p.sponsors, 'small', 'none', seat + ':sponsors'), 'sect pg'));
  }
  if (p.released.length) played.append(section('Released', cardRow(p.released, 'small', undefined, seat + ':released'), 'sect pg'));
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
