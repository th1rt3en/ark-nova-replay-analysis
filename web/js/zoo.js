// [module] Renders one player's zoo: board, cards row, association strip, bonus panel.
import { el, seatColor, section } from './util.js';
import { S } from './state.js';
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
  box.append(row);

  const played = el('div', 'played');                                    // the played cards under the map: animals and sponsors side by side (no counts)
  played.append(section('Animals', cardRow(p.animals, 'small', 'none', seat + ':animals'), 'sect pg'));
  played.append(section('Sponsors', cardRow(p.sponsors, 'small', 'none', seat + ':sponsors'), 'sect pg'));
  if (p.released.length) played.append(section('Released', cardRow(p.released, 'small', undefined, seat + ':released'), 'sect pg'));
  box.append(played);
  return box;
}
