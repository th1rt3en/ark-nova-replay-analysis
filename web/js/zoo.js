// [module] Renders one player's zoo: board, cards row, association strip, bonus panel.
import { el, seatColor, seatRawColor, section } from './util.js';
import { pieceUrl } from './icons.js';
import { FORK, MINIGAME, PLAY, S, SANDBOX } from './state.js';
import { cardRow } from './cards.js';
import { zooStep } from './main.js';
import { zooBoard } from './board.js';
import { associationStrip, bonusPanel } from './association.js';


// The outline of a zoo with a bump (side by side): one shape for the paper, the ink border, the hard shadow and the gold ring of the active player, drawn as an svg behind the content (the
// box itself has no background, border or shadow then, `.hasbump` in parkposter.css). The bump rises round the two piles at the top right and joins the top edge with rounded inner corners.
// The cubes that lie on a sponsor card: Okapi Stable 3, Breeding Program 2, Breeding Cooperation 2 (a cube that was used is an empty ring), and Waza Special Assignment's one cube on the
// kind that was chosen (small / large animals). They are drawn over the top of the card, which stays visible when the cards overlap in a pile.
const CUBE_SLOTS = { S253: 3, S215: 2, S218: 2 };
function withCubes(row, p, seat) {
  const colour = seatRawColor(seat);
  for (const node of row.querySelectorAll('.card[data-key]')) {
    const key = node.dataset.key, chip = el('span', 'cardcubes');
    if (CUBE_SLOTS[key]) {
      const left = p.tokens.filter((t) => t.type === 'token' && t.location.startsWith(key + '_')).length;
      for (let i = 0; i < CUBE_SLOTS[key]; i++) {
        if (i < left) { const c = el('img', 'cube'); c.src = pieceUrl('cubes', colour); c.alt = ''; chip.append(c); } else chip.append(el('i', 'cube used'));
      }
      chip.title = left + ' of ' + CUBE_SLOTS[key] + ' cubes left on this card';
    } else if (key === 'S227' && p.flags.waza) {
      const small = p.flags.waza === 1, c = el('img', 'cube'); c.src = pieceUrl('cubes', colour); c.alt = '';
      chip.append(c, el('b', '', small ? 'small' : 'large'));
      chip.title = 'Chosen: ' + (small ? 'small' : 'large') + ' animals';
    } else continue;
    node.classList.add('hascubes');
    node.append(chip);
  }
  return row;
}

const SPLIT = 5;                                                          // a pile of this many cards or more is split into two columns

function outline(box, tall, columns) {
  const ns = 'http://www.w3.org/2000/svg', R = 20, F = 16, C = 18, BW = columns * 120 + (columns - 1) * 8 + 24;       // (the bump is as wide as the columns of the piles: 120 px each, 8 px between)
  const svgEl = document.createElementNS(ns, 'svg');
  svgEl.setAttribute('class', 'zoooutline'); svgEl.setAttribute('aria-hidden', 'true');
  box.prepend(svgEl);
  const draw = () => {
    if (!box.isConnected) { ro.disconnect(); return; }
    const W = box.offsetWidth, Hb = box.offsetHeight, B = tall, x1 = W - R - F - 8, x0 = x1 - BW, top = 0;
    if (!W || x0 < R + F) { svgEl.replaceChildren(); return; }
    const d = ['M', R, B, 'H', x0 - F, 'A', F, F, 0, 0, 0, x0, B - F, 'V', top + C, 'A', C, C, 0, 0, 1, x0 + C, top, 'H', x1 - C, 'A', C, C, 0, 0, 1, x1, top + C,
      'V', B - F, 'A', F, F, 0, 0, 0, x1 + F, B, 'H', W - R, 'A', R, R, 0, 0, 1, W, B + R, 'V', B + Hb - R, 'A', R, R, 0, 0, 1, W - R, B + Hb,
      'H', R, 'A', R, R, 0, 0, 1, 0, B + Hb - R, 'V', B + R, 'A', R, R, 0, 0, 1, R, B, 'Z'].join(' ');
    svgEl.style.cssText = 'top:' + (-(tall + 4)) + 'px;left:-4px;width:' + W + 'px;height:' + (tall + Hb) + 'px';
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + (tall + Hb));
    const mk = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
    const clip = mk('clipPath', { id: 'zo' + Math.random().toString(36).slice(2, 8) });
    clip.append(mk('path', { d }));
    svgEl.replaceChildren(
      mk('path', { d, class: 'zo-shadow', transform: 'translate(0 6)' }),
      mk('path', { d, class: 'zo-ring' }),
      clip,
      mk('path', { d, class: 'zo-paper' }),
      mk('path', { d, class: 'zo-ink', 'clip-path': 'url(#' + clip.id + ')' }));
  };
  const ro = new ResizeObserver(draw);
  ro.observe(box);                                                       // (it reports as soon as the box is in the page and has a size)
}

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
    const split = (keys) => (keys.length >= SPLIT ? [keys.slice(0, Math.ceil(keys.length / 2)), keys.slice(Math.ceil(keys.length / 2))] : [keys]);      // (6 cards or more: a second column, the first one longer by a card if odd)
    let columns = 0;
    const group = (name, keys, zone) => {
      if (!behind) return section(name, (name === 'Sponsors' ? withCubes : (r) => r)(cardRow(keys, 'small', 'none', zone), p, seat), 'sect zoopile');
      const parts = split(keys), wrap = el('div', 'pilecols');
      parts.forEach((part, i) => wrap.append((name === 'Sponsors' ? withCubes : (r) => r)(cardRow(part, 'small', 'none', zone + (i ? ':2' : '')), p, seat)));
      columns += parts.length;
      return section(name, wrap, 'sect zoopile');
    };
    cols.append(group('Animals', p.animals, seat + ':animals'), group('Sponsors', p.sponsors, seat + ':sponsors'));
    row.append(cols);
    if (behind) {                                                        // a bump of the zoo's paper rises round the piles and goes back down (a strip is 30 px: the top 18 % of a card 120 px wide; the names of the columns 26 px)
      const tallest = (n) => (n >= SPLIT ? Math.ceil(n / 2) : n);
      const most = Math.max(...st.players.map((q) => Math.max(tallest(q.animals.length), tallest(q.sponsors.length)))), tall = 26 + most * 30;
      box.classList.add('hasbump'); outline(box, tall, Math.max(2, columns));
      box.style.marginTop = Math.max(0, tall - 30) + 'px';                 // (room above the zoos for the taller pile of the two players)
    } else row.classList.add('withpiles');
  }
  box.append(row);

  const played = el('div', 'played');                                    // the played cards under the map: animals and sponsors side by side (no counts)
  if (!piles) {
    played.append(section('Animals', cardRow(p.animals, 'small', 'none', seat + ':animals'), 'sect pg'));
    played.append(section('Sponsors', withCubes(cardRow(p.sponsors, 'small', 'none', seat + ':sponsors'), p, seat), 'sect pg'));
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
