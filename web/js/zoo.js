// [module] Renders one player's zoo: board, cards row, association strip, bonus panel.
import { el, seatColor, seatRawColor, section } from './util.js';
import { ACTION_ICON, pic, pieceUrl } from './icons.js';
import { FORK, MINIGAME, PLAY, S, SANDBOX } from './state.js';
import { eyeButton } from './pov.js';
import { cardRow } from './cards.js';
import { render, zooStep } from './main.js';
import { zooBoard } from './board.js';
import { associationStrip, bonusPanel, stripUnits } from './association.js';
import { assocBar } from './assocbar.js';


// The cubes that lie on a sponsor card: Okapi Stable 3, Breeding Program 2, Breeding Cooperation 2 (a cube that was used is an empty ring), and Waza Special Assignment's one cube on the
// kind that was chosen (small / large animals). They are drawn over the top of the card, which stays visible when the cards overlap in a pile.
const CUBE_SLOTS = { S253: 3, S215: 2, S218: 2 };
export function withCubes(row, p, seat) {
  const colour = seatRawColor(seat);
  for (const node of row.querySelectorAll('.card[data-key]')) {
    const key = node.dataset.key, chip = el('span', 'cardcubes');
    if (CUBE_SLOTS[key]) {
      const left = p.tokens.filter((t) => t.type === 'token' && t.location.startsWith(key + '_')).length;
      for (let i = 0; i < CUBE_SLOTS[key]; i++) {
        if (i < left) { const c = el('img', 'cube'); c.src = pieceUrl('cubes', colour); c.alt = ''; chip.append(c); } else chip.append(el('i', 'cube used'));
      }
      chip.title = left + ' of ' + CUBE_SLOTS[key] + ' cubes left on this card';
    } else if (key === 'S227' && p.flags.waza) {                      // Waza: a red X over the bonus of the kind that was not chosen (left: 2 appeal per small animal, right: 4 per large one)
      const small = p.flags.waza === 1, ns = 'http://www.w3.org/2000/svg', x = document.createElementNS(ns, 'svg');
      x.setAttribute('viewBox', '0 0 100 70'); x.setAttribute('class', 'wazax ' + (small ? 'right' : 'left'));
      for (const [w, col] of [[17, '#17262B'], [11, '#D1241F']]) {
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M14 10L86 60M86 10L14 60'); path.setAttribute('stroke', col); path.setAttribute('stroke-width', String(w)); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('fill', 'none');
        x.append(path);
      }
      const t = document.createElementNS(ns, 'title'); t.textContent = 'Chosen: ' + (small ? 'small' : 'large') + ' animals (' + (small ? '2' : '4') + ' appeal for each)'; x.append(t);
      node.classList.add('hascubes'); node.append(x);
      continue;
    } else continue;
    node.classList.add('hascubes');
    node.append(chip);
  }
  return row;
}

/** The badge "Map 2a" in the zoo tab; hovering (or focusing / tapping) it shows the card with the map's name and rule text. */
// The played cards of one kind (animals / sponsors) as two stacks side by side: the cards go to the columns in turn (the 1st, 3rd... to the left, the 2nd, 4th... to the right), so the
// columns differ by one card at most; in a column every card covers 2/3 of the one before (parkposter.css `.pstack`). The heading has the icon of the action card.
function stacks(title, icon, keys, zone, after) {
  const cols = el('div', 'pstacks');
  for (let c = 0; c < 2; c++) {
    const row = cardRow(keys.filter((_, i) => i % 2 === c), 'small', 'none', zone + ':c' + c);
    cols.append(after ? after(row) : row);
  }
  const s = el('div', 'sect pg pkind');
  const h = el('h3', '');
  h.append(pic(ACTION_ICON[icon], 26), el('span', '', title), el('span', 'cnt', String(keys.length)));
  s.append(h, cols);
  return s;
}

// ---- where the played cards are shown (setting "Played cards", settings.js): under the map (the default), in a tray of the hand dock (dock.js), or in a drawer ('drawer'): a sheet with the cards, narrow beside the map by default (the map slides left over the project rewards and uncovers the sheet, the association strip tucks under the map, `.zoo.nrw`) or expanded over the whole map, pulled out from the top edge (S.drawerFull, kept in the settings; the button next to the chip switches).
// (the tray needs the floating hand container: with the fan the cards stay under the map; a mini game always shows them under the map)
export const tabbedLayout = () => !FORK && !SANDBOX && !PLAY && !MINIGAME && S.zooLayout === 'tabs';      // (the replay's "Tabbed" layout of the Players' boards: one board at a time)
export const besideLayout = () => !FORK && !SANDBOX && !PLAY && !MINIGAME && (S.zooLayout === 'tabs' || S.zooLayout === 'stack');      // (the replay's "Tabbed" and "Top / bottom" layouts: every board has its played cards in a box next to the map)
// (the tabbed and the top / bottom layouts have one mode only, 'beside': the cards in a box next to the map; the other three are for the side-by-side boards, and 'beside' is not offered there. S.playedMode keeps the choice for that layout)
export const playedMode = () => (MINIGAME ? 'below' : besideLayout() ? 'beside' : S.playedMode === 'beside' ? 'below' : S.playedMode === 'tray' && S.handMode !== 'tray' ? 'below' : S.playedMode);
const kindCount = (p) => p.animals.length + p.sponsors.length;
function kindChip(icon, label, n) {                                       // the icon of the action card, the name (when asked for) and the count
  const c = el('span', 'gchip');
  c.append(pic(ACTION_ICON[icon], 17));
  if (label) c.append(el('span', '', label));
  c.append(el('b', '', String(n)));
  return c;
}
export const playedChips = (p, labels) => [kindChip('animals', labels ? 'Animals' : '', p.animals.length), kindChip('sponsors', labels ? 'Sponsors' : '', p.sponsors.length)];
function playedBlock(p, seat) {                                          // the two kinds with their two stacks (the layout under the map, also used in the drawer)
  const played = el('div', 'played');
  played.append(stacks('Animals', 'animals', p.animals, seat + ':animals'));
  played.append(stacks('Sponsors', 'sponsors', p.sponsors, seat + ':sponsors', (row) => withCubes(row, p, seat)));
  return played;
}
// The expanded drawer slides like a wooden tray: it is pulled out from the top edge with a small overshoot and a settle (460 ms), and pushed back in with a short grab and a quick run (TRAY_IN_MS, the same 300 ms as `sheet-in`; parkposter.css: sheet-out / sheet-in). The narrow drawer is a door: its sheet stays in place behind the map and the strip, which slide aside (400 ms) and back (300 ms, the same TRAY_IN_MS).
const TRAY_IN_MS = 300;
const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function openDrawer(seat) { S.drawerSeats[seat] = true; S.drawerAnim = { seat, t: performance.now() }; S.lastBoard = null; render(); }
function closeDrawer(seat, box) {                                        // the sheet runs back in first, then the board is drawn without it
  if (box && box.classList.contains('closing')) return;
  const finish = () => { S.drawerSeats[seat] = false; S.drawerAnim = null; S.lastBoard = null; render(); };
  if (!box || !box.isConnected || reducedMotion()) return finish();
  box.classList.add('closing');
  setTimeout(finish, TRAY_IN_MS + 20);
}
function shrinkGhost(seat, ghost) {                                       // expanded -> narrow, the reverse of narrow -> expanded: the new (narrow) board is already drawn, and a copy of the expanded sheet lies over it and wipes to the narrow width while the map slides aside (parkposter.css `sd-wipe-in`); then it is removed
  const row = document.querySelector('.zoo.seat' + seat + ' .zooRow');
  if (!row) return;
  ghost.classList.add('ghost'); ghost.setAttribute('aria-hidden', 'true');
  ghost.querySelector('.sheet')?.classList.remove('enter');                 // (a sheet that was just opened still carries its slide-in)
  row.append(ghost);
  const done = () => ghost.remove();
  ghost.addEventListener('animationend', done); setTimeout(done, 600);
}
function playedDrawer(box, p, seat, narrow) {                                  // a chip on the top edge of the board, as big as the name tab ("Cards 14 ▼"), with the size button next to it: it pulls out a sheet with the cards, narrow beside the map or as big as the map
  const open = !!S.drawerSeats[seat];
  const an = !reducedMotion() && S.drawerAnim && performance.now() - S.drawerAnim.t < 700 ? S.drawerAnim : null;
  const resize = open && !!an && an.kind === 'resize' && an.seat === seat;      // (the size of THIS board was switched: its drawer wipes to the new size instead of sliding out again; the other board's drawer is left alone)
  const fresh = open && !!an && an.kind !== 'resize' && an.seat === seat;      // (just opened: it slides in; a redraw of an open drawer does not replay it)
  const go = el('button', 'drtab' + (open ? ' open' : '')); go.type = 'button';
  go.title = open ? 'Hide the cards (Esc)' : 'Show the played cards';
  go.append(el('span', '', 'Cards'), el('b', '', String(kindCount(p))), el('i', fresh ? 'enter' : '', '▼'));
  const bar = el('div', 'drbar');
  if (open) {                                                              // the size button: expand over the whole map / shrink back beside it
    const ex = el('button', 'drtab drexp'); ex.type = 'button';
    ex.title = narrow ? 'Expand over the map' : 'Shrink beside the map'; ex.setAttribute('aria-label', ex.title);
    ex.innerHTML = narrow
      ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3v5H3M12 3v5h5M8 17v-5H3M12 17v-5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    ex.onclick = () => {
      const old = !narrow && !reducedMotion() ? box.querySelector('.sheetclip') : null;      // (expanded -> narrow: the expanded sheet is gone after the redraw, so a copy of it wipes away over the new board, see `shrinkGhost`)
      const ghost = old ? old.cloneNode(true) : null;
      S.drawerFull = { ...S.drawerFull, [seat]: narrow }; S.drawerAnim = { seat, t: performance.now(), kind: 'resize' }; document.dispatchEvent(new Event('drawerfull')); S.lastBoard = null; render();
      if (ghost) shrinkGhost(seat, ghost);
    };
    bar.append(ex);
  }
  bar.append(go);
  go.style.setProperty('--pc', seatColor(seat));                            // (the count carries the player's colour)
  go.setAttribute('aria-expanded', String(open));
  go.onclick = () => { if (open) closeDrawer(seat, box); else openDrawer(seat); };
  box.append(bar);
  if (open) {
    const clip = el('div', 'sheetclip'), sheet = el('div', (fresh && !narrow ? 'sheet enter' : 'sheet') + (narrow ? ' nrw' : ''));
    const block = playedBlock(p, seat);
    if (narrow) for (const k of block.querySelectorAll('.pkind')) { const cs = [...k.querySelectorAll('.cards')]; for (const c of cs.slice(1)) { cs[0].append(...c.children); c.remove(); } }      // (narrow: one column per kind, the two stacks are joined)
    if (narrow && fresh) box.classList.add('fresh');
    if (resize) box.classList.add('rz');
    sheet.append(block);
    clip.append(sheet);
    box.classList.add('drawer-open');
    box._closeDrawer = () => closeDrawer(seat, box);
    box._sheetclip = clip;                                                  // (renderZoo puts it into the map row)
    box.append(assocBar(S.replay.maps[seat], p, seat));                      // (the bar under the box: bonus spaces, partner zoos, universities; it comes down with a freshly opened drawer)
    if (fresh) box.classList.add('foot-in');
  }
}
// After every drawing: the card size of an open drawer and the shifts of the narrow one are set (the sheet itself is a child of the map row, pinned to its edges and so exactly as tall as the map)
let fitQueued = false;
const watched = new Set();                                                // (the map rows that `rowWatch` observes)
const rowWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (fitQueued) return; fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fitPlayed(); }); }) : null;      // (a map picture that loads late or a window change makes the row taller: the drawer follows)
export function fitPlayed() {
  const zoos = document.getElementById('zoos');
  if (!zoos) return;
  if (rowWatch) {                                                          // (only rows that are not watched yet are observed: a new observation fires once and would call `fitPlayed` again; rows that left the page are let go)
    for (const rw of watched) if (!rw.isConnected) { rowWatch.unobserve(rw); watched.delete(rw); }
    for (const rw of zoos.querySelectorAll('.zoo .zooRow')) if (!watched.has(rw)) { rowWatch.observe(rw); watched.add(rw); }
  }
  for (const bx of zoos.querySelectorAll('.zoo.drawer-open')) {       // narrow: the shifts of the map and the strip and the place of the sheet, from the widths of the three parts of the row
    const row = bx.querySelector('.zooRow'), [bo, bd, st] = row ? row.children : [];
    if (!bo || !bd || !st) continue;
    const sc = bx.getBoundingClientRect().width / bx.offsetWidth || 1, w = (e) => e.getBoundingClientRect().width / sc;      // (the page is zoomed to the window: measure in layout pixels; the parts can be SVG, which has no offsetWidth)
    bx.style.setProperty('--sd-b', (w(bo) + 4) + 'px');
    bx.style.setProperty('--sd-s', (w(bo) + w(st) + 8) + 'px');
    bx.style.setProperty('--sd-left', (w(bd) + 4) + 'px');
  }
  for (const sh of zoos.querySelectorAll('.sheet.nrw')) {                 // narrow: a single column per kind: as big as the longest pile and the width allow
    const pl = sh.querySelector('.played'), n = Math.max(1, ...[...sh.querySelectorAll('.pkind')].map((k) => k.querySelectorAll('.card').length));
    const H = sh.clientHeight - 62, W = sh.clientWidth - 32;                // (62 px: paddings and the title row of a kind; 32 px: paddings and the gap between the columns)
    pl.style.setProperty('--cw', Math.max(48, Math.min(120, Math.floor(H / (1.3972 + (n - 1) * 0.2794)), Math.floor(W / 2))) + 'px');
  }
  for (const sh of zoos.querySelectorAll('.sheet:not(.nrw)')) {                      // the sheet covers the board: the cards are as big as the tallest stack and the width allow
    const pl = sh.querySelector('.played'), cols = [...sh.querySelectorAll('.pkind')].map((k) => Math.ceil(k.querySelectorAll('.card').length / 2));
    const own = !!sh.closest('.cardsbox'), n = Math.max(1, ...cols), H = (own ? (sh.closest('.cardsbox').previousElementSibling || sh).clientHeight : sh.clientHeight) - (own ? 72 : 100), W = sh.clientWidth - (own ? 80 : 100);      // (100 px: the paddings and the title row of a kind; in the tabbed layout's own box, whose trays fill it edge to edge, 72 px and 80 px; its height is not the limit but follows the cards, so the cards are sized to fit the height of the zoo box beside it)
    pl.style.setProperty('--cw', Math.max(60, Math.min(170, Math.floor(H / (1.3972 + (n - 1) * 0.2794)), Math.floor(W / 4))) + 'px');
  }
}
document.addEventListener('keydown', (e) => {                              // Esc closes the open drawers
  if (e.key !== 'Escape' || document.querySelector('.modalback') || playedMode() !== 'drawer' || !Object.values(S.drawerSeats).some(Boolean)) return;      // (a dialog that is open takes the Esc first)
  const boxes = [...document.querySelectorAll('.zoo.drawer-open')].filter((b) => b._closeDrawer);
  if (!boxes.length) { S.drawerSeats = {}; S.lastBoard = null; render(); return; }
  boxes.forEach((b) => b._closeDrawer());
});


function mapBadge(map) {
  const code = 'Map ' + map.id, title = map.name && !/^(map|tournament)\b/i.test(map.name) ? code + ': ' + map.name : (map.name || code);
  const b = el('span', 'mapbadge'); b.tabIndex = 0; b.textContent = code;
  const tip = el('div', 'maptip'); tip.setAttribute('role', 'tooltip');
  tip.append(el('div', 'mt-title', title));
  const rules = map.description || [];
  if (rules.length) { tip.append(el('p', 'mt-main', rules[0])); for (const t of rules.slice(1)) tip.append(el('p', 'mt-note', t)); }
  else tip.append(el('p', 'mt-main', 'No special ability.'));
  b.append(tip);
  b.onclick = e => { e.stopPropagation(); b.classList.toggle('on'); };
  return b;
}

// Tabbed layout, "cards next to the map": the played cards are a box of their own beside the zoo box (main.js `zooBoards` puts it in the second column of `#zoos`, under the association element: the same width), not a part of the board.
// It holds the same sheet as the expanded drawer (`.sheet`, filling the box), so `fitPlayed()` sizes its cards; the grid makes it as tall as the zoo box.
export function renderCards(st, seat) {
  const box = el('div', 'zoo cardsbox'), sheet = el('div', 'sheet');      // (class `zoo`: the played-cards styles are scoped to it; `.cardsbox` below takes the padding away)
  sheet.append(playedBlock(st.players[seat], seat)); box.append(sheet);
  return box;
}
export function renderZoo(st, seat) {
  const p = st.players[seat], who = S.replay.players[seat], map = S.replay.maps[seat];
  const box = el('div', 'zoo seat' + seat + (st.active_player === seat && st.phase !== 'over' ? ' active' : ''));
  const tabbed = tabbedLayout();
  const h = el('h2', '');                        // the tab above the zoo: a dot in the player's colour, the name, the map
  h.style.setProperty('--pc', seatColor(seat));
  const nameTag = () => { const n = el('span', 'zootab-name', who.name); if (who.elo) { const e = el('span', 'zootab-elo', ' (' + who.elo + ')'); e.title = 'Elo at this table (before the game)'; n.append(e); } return n; };   // (the name, with the Elo in brackets after it in the same font)
  if (!tabbed) h.append(nameTag());                 // (the name in a span, so the thinning of the letters can be set for it alone)
  let sw = null;
  if (tabbed) {                                                          // tabbed: the two arrows of the switch go to the other board (main.js `zooStep`)
    const arrow = (d, label, path) => { const b = el('button', 'zootab-arrow'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="' + path + '"/></svg>'; b.onclick = () => zooStep(d); return b; };
    h.append(nameTag());
    sw = el('div', 'zootab-switch'); sw.append(arrow(-1, 'Previous board', 'M13 3L5 10l8 7z'), arrow(1, 'Next board', 'M7 3l8 7-8 7z'));      // (a small tab of its own at the right edge of the box: it stays put whatever the length of the name)
  }
  h.append(eyeButton(seat));                                             // (the eye that shows this player's cards: in the tab, next to the name)
  h.append(el('span', 'mapsep'), mapBadge(map));                        // (a bar and the map code; the name and the rule are in the tooltip of the badge)
  const mode = playedMode();
  box.append(h);
  if (sw) box.append(sw);
  if (mode !== 'below') box.classList.add('mapends');                      // (nothing lies under the map in the tray and drawer modes: the map runs to the bottom edge of the box, `.zoo.mapends` in the CSS)
  const narrow = mode === 'drawer' && !S.drawerFull[seat];
  if (narrow) box.classList.add('nrw');
  if (mode === 'drawer') playedDrawer(box, p, seat, narrow);                      // (the chip sits on the top edge: the hand floats over the lower edge of the page and used to cover a bar under the map)

  const row = el('div', 'zooRow');
  row.style.setProperty('--strip-fr', (stripUnits(map) / 1776).toFixed(4) + 'fr');          // (the three parts of the row share the width in the proportions of their pictures, so they are all as tall as the map)
  row.append(bonusPanel(map, p, seat), zooBoard(map, p, seat), associationStrip(p, map, seat));
  if (box._sheetclip) row.append(box._sheetclip);
  box.append(row);
  if (mode === 'below') box.append(playedBlock(p, seat));                 // the played cards under the map: animals and sponsors side by side (no counts)
  // ('tray': the cards are in the hand dock, dock.js)
  if (MINIGAME && S.pov === null) {                                      // a mini game that shows both players in full (Who's ahead): the dock holds one hand at a time, so each zoo carries its player's cards
    const own = el('div', 'played handsunder');
    own.append(section('Hand', cardRow(p.hand, 'small', 'empty', seat + ':hand'), 'sect pg'));
    if ((p.endgame_hand || []).length) own.append(section('Endgame cards', cardRow(p.endgame_hand, 'small', 'none', seat + ':endgame'), 'sect pg'));
    if ((p.stored || []).length) own.append(section('Stored', cardRow(p.stored, 'small', 'none', seat + ':stored'), 'sect pg'));
    box.append(own);
  }
  return box;
}
