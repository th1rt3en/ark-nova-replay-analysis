// [module] Renders one player's zoo: board, cards row, association strip, bonus panel.
import { el, seatColor, section } from './util.js';
import { S } from './state.js';
import { cardRow } from './cards.js';
import { zooBoard } from './board.js';
import { associationStrip, bonusPanel } from './association.js';


export function renderZoo(st, seat) {
  const p = st.players[seat], who = S.replay.players[seat], map = S.replay.maps[seat];
  const box = el('div', 'zoo seat' + seat + (st.active_player === seat && st.phase !== 'over' ? ' active' : ''));
  const h = el('h2', '', who.name);
  h.style.borderBottom = '3px solid ' + seatColor(seat);
  h.append(el('span', 'map', 'Map ' + map.id + (map.name ? ': ' + map.name : '')));
  box.append(h);

  const row = el('div', 'zooRow');
  row.append(bonusPanel(map, p, seat), zooBoard(map, p, seat), associationStrip(p, map, seat));
  box.append(row);

  box.append(section('Animals (' + p.animals.length + ')', cardRow(p.animals, 'small', 'none', seat + ':animals')));
  box.append(section('Sponsors (' + p.sponsors.length + ')', cardRow(p.sponsors, 'small', 'none', seat + ':sponsors')));
  if (p.released.length) box.append(section('Released (' + p.released.length + ')', cardRow(p.released, 'small', undefined, seat + ':released')));
  return box;
}
