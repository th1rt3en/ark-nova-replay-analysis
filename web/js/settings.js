// [module] Settings pop-up (the wheel in the control panel): autoplay speed, timeline row, size and style of the hand, where the played cards are shown, the card variants (no-snake, S274), the layout of the two zoos. All are remembered in the browser (`localStorage`, key `settings`); the size of the drawer (`drawerFull`) is saved without a control here: the button on the drawer sets it.
import { $, el } from './util.js';
import { FORK, MINIGAME, PLAY, S, SANDBOX } from './state.js';
import { setSpeed } from './playback.js';
import { fitSidebar } from './sidebar.js';
import { NO_SNAKE_MODES } from './nosnake.js';

let settingsTab = 0;                                                       // the tab of the pop-up that is open: 0 Control, 1 Board, 2 Cards (not stored)
const KEY = 'settings';                                                    // localStorage: { speed: 0.5 | 1 | 2 | 3 | 4, timeline: boolean, hand: 0.5 ... 2, handMode: 'fan' | 'tray', noSnake: 'show' | 'hide' | 'worm', s274: 'victory' | 'mascot', zoos: 'side' | 'tabs' | 'stack', played: 'below' | 'tray' | 'drawer', drawerFull: { 0: boolean, 1: boolean } }
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
export const PLAYED_MODES = [['drawer', 'Slide-out drawer'], ['below', 'Below the map'], ['tray', 'Tray in the hand dock'], ['beside', 'Cards next to the map']];       // where the played cards are shown (zoo.js `playedMode`)
export const SPEEDS = [0.5, 1, 2, 3, 4];                                  // the autoplay speeds, the steps of the slider (1 = the default)
export const HAND_SCALES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];            // the sizes of the cards in the hand (1 = the default size)
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ speed: S.speed, timeline: S.showTimeline, egLive: S.endgameLive, hand: S.handScale, bpreview: S.previewBuilding, encBorders: S.encBorders, handMode: S.handMode, noSnake: S.noSnake, s274: S.s274, zoos: S.zooLayout, played: S.playedMode, drawerFull: S.drawerFull })); } catch (e) { /* no storage */ } };
document.addEventListener('drawerfull', () => save());                  // (the size button of the drawer, zoo.js: narrow beside the map / expanded over it)
export const settingsOpen = () => { const m = $('settingsModal'); return !!m && !m.hidden; };
export function toggleSettings() {
  const m = $('settingsModal'), g = $('settings');
  if (!m || !g || g.offsetParent === null) return;                 // (no gear on the page, e.g. the fork page: no settings)
  if (m.hidden) { m.hidden = false; m.querySelector('.modalx').focus(); } else close();
}
function close() { const m = $('settingsModal'); if (m) m.hidden = true; document.dispatchEvent(new Event('settingsclosed')); }
// the timeline is a row of its own between the two button rows of the control panel; while it is off, a decorative line (#tldeco) holds its place
export function applyTimeline() {
  const t = $('timeline');
  if (t) t.hidden = !S.showTimeline;
  const d = $('tldeco');                                                   // the decorative line that the timeline replaces
  if (d) d.hidden = S.showTimeline;
  fitSidebar();
}
export function applyHandScale() { document.body.style.setProperty('--hs', String(S.handScale)); }       // (parkposter.css sizes the dock from --hs)
// a slider with a few fixed steps whose knob carries the current value (the knob is drawn by CSS, the number lies over it): the autoplay speed and the size of the cards in the hand
function knobSlider(values, current, label, onPick) {
  const slider = el('input'); slider.type = 'range'; slider.className = 'setrange'; slider.min = '0'; slider.max = String(values.length - 1); slider.step = '1';
  slider.value = String(values.indexOf(current)); slider.setAttribute('aria-label', label);
  const track = el('div', 'settrack'), bubble = el('b', 'setbubble');
  const showVal = () => { const f = Number(slider.value) / (values.length - 1), v = values[Number(slider.value)]; bubble.textContent = v + 'x'; bubble.style.left = 'calc(var(--knob) / 2 + (100% - var(--knob)) * ' + f + ')'; track.style.setProperty('--f', String(f)); };
  slider.addEventListener('input', () => { onPick(values[Number(slider.value)]); showVal(); }); showVal();
  track.append(slider, bubble);
  return track;
}
// the little icon chip in front of every setting (css `.setico`): a drawn glyph on a pastel tile
const ICONS = {
  speed: ['M4 5l8 7-8 7zM12 5l8 7-8 7z', '#F4B63F'], time: ['M3 12h18M6 8v8M12 6v12M18 9v6', '#7fc3dd'], flag: ['M6 3v18M6 4h12l-3 4 3 4H6', '#e58b6b'],
  boards: ['M3 5h8v14H3zM13 5h8v14h-8z', '#8fd09a'], played: ['M5 8h10v12H5zM9 4h10v12', '#e7c15d'], hand: ['M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15', '#9fb7e6'], frame: ['M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z', '#d8b45a'], lens: ['M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l5 5', '#f0a8c8'],
  statue: ['M4 20h16M7 20V10M12 20V10M17 20V10M4 10h16L12 4z', '#cdb8e8'], panda: ['M12 20.5c4.4 0 7.5-2.8 7.5-6.3S16.4 8.5 12 8.5s-7.5 2.2-7.5 5.7 3.1 6.3 7.5 6.3zM5.8 10.2A2.7 2.7 0 1 1 9 7.2M18.2 10.2A2.7 2.7 0 1 0 15 7.2', '#e4e0d4', '<ellipse cx="8.8" cy="13.5" rx="1.7" ry="2.2" transform="rotate(18 8.8 13.5)"/><ellipse cx="15.2" cy="13.5" rx="1.7" ry="2.2" transform="rotate(-18 15.2 13.5)"/><ellipse cx="12" cy="16.8" rx="1.3" ry="0.9"/>'],
};
const chip = (k) => { const [d, c, extra = ''] = ICONS[k], i = el('i', 'setico ico-' + k); i.style.background = c; i.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/>' + (extra ? '<g fill="#17262B" stroke="none">' + extra + '</g>' : '') + '</svg>'; return i; };
export function setupSettings() {
  const st = read();
  S.previewBuilding = st.bpreview !== false;                              // default: on
  S.encBorders = st.encBorders === true;                                  // default: off
  S.endgameLive = st.egLive !== false;                                    // default: on
  S.showTimeline = st.timeline === true;                                   // default: off
  S.speed = SPEEDS.includes(st.speed) ? st.speed : 1;                  // default: 1x
  S.handScale = HAND_SCALES.includes(st.hand) ? st.hand : 1;               // default: 1x
  S.handMode = st.handMode === 'fan' ? 'fan' : 'tray';                   // default: the floating tray
  S.s274 = st.s274 === 'mascot' ? 'mascot' : 'victory';                       // default: Victory Column (the BGA name)
  S.noSnake = NO_SNAKE_MODES.some(([v]) => v === st.noSnake) ? st.noSnake : 'show';        // default: show
  S.zooLayout = ['side', 'tabs', 'stack'].includes(st.zoos) && !FORK && !SANDBOX && !PLAY && !MINIGAME ? st.zoos : 'side';       // default: side by side (only the replay: a fork needs both boards)
  S.playedMode = PLAYED_MODES.some(([v]) => v === st.played) ? st.played : 'drawer';          // (default: the slide-out drawer; the old value 'side' was the drawer too)
  S.drawerFull = st.drawerFull === true ? { 0: true, 1: true } : st.drawerFull && typeof st.drawerFull === 'object' ? { 0: st.drawerFull[0] === true, 1: st.drawerFull[1] === true } : {};      // the drawer of each board: narrow beside the map (default) or expanded over it; the last choice is kept (an old setting was one boolean for both boards)
  if (S.playedMode === 'tray' && S.handMode !== 'tray') S.playedMode = 'drawer';           // the tray needs the floating hand (default of the setting: the drawer)
  applyHandScale();
  const modal = el('div', 'modal'); modal.id = 'settingsModal'; modal.hidden = true;
  let openMenu = null;                                                     // the open dropdown list (only one at a time)
  const closeMenu = () => { if (openMenu) { openMenu.menu.remove(); openMenu.btn.setAttribute('aria-expanded', 'false'); openMenu = null; } };
  const dropdown = (sel) => {                                              // a dropdown in our style instead of the browser's list (that one scrolls and looks like Chrome): the native <select> stays hidden as the model (value, onchange, options), `sync` event = redraw after a programmatic change
    const wrap = el('span', 'setdd'), btn = el('button', 'setselect'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', sel.getAttribute('aria-label') || '');
    sel.hidden = true; sel.tabIndex = -1;
    const label = () => { const o = sel.options[sel.selectedIndex]; btn.textContent = o ? o.textContent : ''; };
    const pick = (o) => { sel.value = o.value; label(); closeMenu(); sel.dispatchEvent(new Event('change')); btn.focus(); };
    const open = () => {
      closeMenu();
      const menu = el('div', 'setmenu'); menu.setAttribute('role', 'listbox'); menu.style.setProperty('--tc', getComputedStyle(box).getPropertyValue('--tc'));      // (the active tab's colour fills the selected / hovered entry)
      const items = [...sel.options].map((o) => { const b = el('button', 'setopt' + (o.value === sel.value ? ' on' : ''), o.textContent); b.type = 'button'; b.setAttribute('role', 'option'); b.disabled = o.disabled; b.onclick = () => pick(o); menu.append(b); return b; });
      const m = modal.getBoundingClientRect(), r = btn.getBoundingClientRect(), z = m.width / modal.offsetWidth || 1;      // (the viewer is zoomed: screen pixels / zoom = layout pixels)
      menu.style.left = ((r.left - m.left) / z) + 'px'; menu.style.width = (r.width / z) + 'px'; menu.style.top = ((r.bottom - m.top) / z + 6) + 'px';
      modal.append(menu);
      if (menu.offsetTop + menu.offsetHeight > modal.offsetHeight - 8) menu.style.top = Math.max(8, (r.top - m.top) / z - 6 - menu.offsetHeight) + 'px';      // (no room below: opens upward)
      openMenu = { menu, btn }; btn.setAttribute('aria-expanded', 'true');
      (items.find((b) => b.classList.contains('on')) || items.find((b) => !b.disabled))?.focus();
    };
    btn.onclick = () => (openMenu && openMenu.btn === btn ? closeMenu() : open());
    btn.onkeydown = (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } };
    sel.addEventListener('sync', label);
    label(); wrap.style.display = 'contents'; wrap.append(btn, sel);
    return wrap;
  };
  document.addEventListener('mousedown', (e) => { if (openMenu && !openMenu.menu.contains(e.target) && e.target !== openMenu.btn) closeMenu(); });
  document.addEventListener('keydown', (e) => {                            // keys inside an open list: arrows move, Esc closes only the list
    if (!openMenu) return;
    const items = [...openMenu.menu.querySelectorAll('.setopt:not(:disabled)')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); const b = openMenu.btn; closeMenu(); b.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
  }, true);
  const box = el('div', 'modalbox'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Settings');
  const head = el('div', 'modalhead');
  const x = el('button', 'modalx'); x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4L20 20M20 4L4 20" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" fill="none"/></svg>'; x.type = 'button'; x.title = 'Close (Esc)'; x.setAttribute('aria-label', 'Close'); x.onclick = close;
  head.append(el('b', '', 'Settings'), x);
  const speedRow = el('div', 'setrow setslide');                         // the autoplay speed: a slider with five steps (0.5x ... 4x)
  speedRow.append(el('span', 'setlabel', 'Autoplay speed'), knobSlider(SPEEDS, S.speed, 'Autoplay speed', (v) => { setSpeed(v); save(); }));
  const tlRow = el('label', 'setrow');
  const sw = el('input'); sw.type = 'checkbox'; sw.className = 'setswitch'; sw.checked = S.showTimeline;
  sw.onchange = () => { S.showTimeline = sw.checked; save(); applyTimeline(); };
  tlRow.append(el('span', 'setlabel', 'Timeline in the control panel'), sw);
  const egRow = el('label', 'setrow');                                    // the live count of the endgame points of the sponsors (and, for a player whose cards are shown, of the endgame cards)
  const egsw = el('input'); egsw.type = 'checkbox'; egsw.className = 'setswitch'; egsw.checked = S.endgameLive;
  egsw.onchange = () => { S.endgameLive = egsw.checked; save(); document.dispatchEvent(new Event('eglive')); };
  egRow.append(el('span', 'setlabel', 'Endgame live count'), egsw);
  egRow.title = 'Shows the points that the sponsors (and your endgame cards) would give at the end of the game right now, as a violet +X under the appeal and conservation points';
  const pvRow = el('label', 'setrow');                                    // the placement preview: a right click on a sponsor building card of a hand, or on a zoo map (an enclosure of the picker), shows where it would fit (bpreview.js)
  const pvsw = el('input'); pvsw.type = 'checkbox'; pvsw.className = 'setswitch'; pvsw.checked = S.previewBuilding;
  pvsw.onchange = () => { S.previewBuilding = pvsw.checked; save(); document.dispatchEvent(new Event('bpreview')); };
  const pvLabel = el('span', 'setlabel', 'Map placement preview');
  const pvHelp = el('span', 'qm', '?'); pvHelp.tabIndex = 0; pvHelp.setAttribute('role', 'note'); pvHelp.setAttribute('aria-label', 'Map placement preview help');   // the ? opens the sticky note under the panel (hover or keyboard focus)
  const pvNote = el('div', 'pvnote'); pvNote.hidden = true; pvNote.setAttribute('role', 'tooltip');
  pvNote.innerHTML = '<h4>Map placement preview</h4><ul><li>Right-click a card with a sponsor building in your hand to preview its placement</li><li>Right-click on the map to preview the placement of standard and special enclosures</li></ul>';
  const showNote = () => {                                                // the note hangs from the ? (its tape touches it): measured in screen pixels, divided by the viewer zoom
    const m = modal.getBoundingClientRect(), q = pvHelp.getBoundingClientRect(), z = m.width / modal.offsetWidth || 1;
    const left = box.offsetLeft + 28, w = box.offsetWidth - 56, qx = (q.left + q.width / 2 - m.left) / z;
    pvNote.style.left = left + 'px'; pvNote.style.width = w + 'px'; pvNote.style.top = ((q.bottom - m.top) / z + 21) + 'px'; pvNote.style.setProperty('--tx', (qx - left) + 'px'); pvNote.hidden = false;
  };
  pvHelp.onmouseenter = pvHelp.onfocus = showNote; pvHelp.onmouseleave = pvHelp.onblur = () => { pvNote.hidden = true; };
  pvHelp.onclick = (e) => e.preventDefault();
  pvLabel.append(pvHelp);
  pvRow.append(pvLabel, pvsw);
  const ebRow = el('label', 'setrow');                                    // a border round every enclosure (board.js ENC_BORDER)
  const ebsw = el('input'); ebsw.type = 'checkbox'; ebsw.className = 'setswitch'; ebsw.checked = S.encBorders;
  ebsw.onchange = () => { S.encBorders = ebsw.checked; save(); document.dispatchEvent(new Event('encborders')); };
  ebRow.append(el('span', 'setlabel', 'Show enclosure borders'), ebsw);
  const handRow = el('div', 'setrow setslide');                            // the size of the cards in the hand: a slider with seven steps
  handRow.append(el('span', 'setlabel', 'Hand card size'), knobSlider(HAND_SCALES, S.handScale, 'Size of the cards in the hand', (v) => { S.handScale = v; applyHandScale(); save(); }));
  const modeRow = el('div', 'setrow');                                    // how the hand is shown: a fan at the screen edge, or a floating tray (dock.js)
  const sel = el('select', 'setselect'); sel.setAttribute('aria-label', 'Hand display');
  for (const [v, t] of [['tray', 'Floating container'], ['fan', 'Fan at the screen edge']]) { const o = el('option', '', t); o.value = v; sel.append(o); }
  sel.value = S.handMode;
  sel.onchange = () => {
    S.handMode = sel.value === 'fan' ? 'fan' : 'tray';
    if (S.handMode !== 'tray' && S.playedMode === 'tray') { S.playedMode = 'drawer'; psel.value = 'drawer'; document.dispatchEvent(new Event('playedmode')); }   // the played-cards tray lives in the hand dock: back to the default
    syncPlayedOptions(); save(); document.dispatchEvent(new Event('handmode'));
  };
  modeRow.append(el('span', 'setlabel', 'Hand display'), dropdown(sel));
  const playedRow = el('div', 'setrow');                                  // where the played cards are shown (zoo.js)
  const psel = el('select', 'setselect'); psel.setAttribute('aria-label', 'Played cards');
  const syncPlayedOptions = () => {                                       // the tabbed and the top / bottom layouts list only "Cards next to the map"; the side-by-side layout lists the first three (the tray is greyed without the floating hand)
    const beside = !FORK && !SANDBOX && !PLAY && !MINIGAME && (S.zooLayout === 'tabs' || S.zooLayout === 'stack');      // (the same test as zoo.js `besideLayout`)
    psel.replaceChildren();
    for (const [v, t] of PLAYED_MODES) {
      if (beside ? v !== 'beside' : v === 'beside') continue;                // (the options that do not belong to the layout are not listed at all)
      const o = el('option', '', t); o.value = v;
      if (!beside && v === 'tray' && S.handMode !== 'tray') { o.disabled = true; o.style.color = 'rgba(23,38,43,.22)'; }
      psel.append(o);
    }
    psel.value = beside ? 'beside' : S.playedMode === 'beside' || (S.playedMode === 'tray' && S.handMode !== 'tray') ? 'drawer' : S.playedMode;      // (what zoo.js `playedMode` shows)
    psel.dispatchEvent(new Event('sync'));                                // (the dropdown redraws its label)
  };
  syncPlayedOptions();
  psel.onchange = () => { S.playedMode = psel.value; save(); document.dispatchEvent(new Event('playedmode')); };
  playedRow.append(el('span', 'setlabel', 'Played cards'), dropdown(psel));
  const snakeRow = el('div', 'setrow');                                   // the cards with a snake photo (nosnake.js): shown, suppressed or replaced by the Slow Worm
  const ssel = el('select', 'setselect'); ssel.setAttribute('aria-label', 'No-snake mode');
  for (const [v, t] of NO_SNAKE_MODES) { const o = el('option', '', t); o.value = v; ssel.append(o); }
  ssel.value = S.noSnake;
  ssel.onchange = () => { S.noSnake = ssel.value; save(); document.dispatchEvent(new Event('nosnake')); };
  snakeRow.append(el('span', 'setlabel', 'No-snake mode'), dropdown(ssel));
  const statueRow = el('div', 'setrow');                                  // the sponsor S274: Victory Column (BGA) or Mascot Statue (card data); cards.js `info` swaps name and pictures
  const tsel = el('select', 'setselect'); tsel.setAttribute('aria-label', 'Statue card');
  for (const [v, t] of [['victory', 'Victory Column'], ['mascot', 'Mascot Statue']]) { const o = el('option', '', t); o.value = v; tsel.append(o); }
  tsel.value = S.s274;
  tsel.onchange = () => { S.s274 = tsel.value; save(); document.dispatchEvent(new Event('nosnake')); };       // (the same refresh as the no-snake mode: every card is drawn again)
  statueRow.append(el('span', 'setlabel', 'Statue card'), dropdown(tsel));
  const zooRow = el('div', 'setrow');                                     // how the two zoo boards are laid out (main.js `zooBoards`)
  const zsel = el('select', 'setselect'); zsel.setAttribute('aria-label', "Players' boards");
  for (const [v, t] of [['side', 'Side by side'], ['tabs', 'Tabbed (one board, arrows)'], ['stack', 'Top / bottom']]) { const o = el('option', '', t); o.value = v; zsel.append(o); }
  zsel.value = S.zooLayout;
  zsel.onchange = () => { S.zooLayout = zsel.value; syncPlayedOptions(); save(); document.dispatchEvent(new Event('zoolayout')); };
  zooRow.append(el('span', 'setlabel', 'Player boards'), dropdown(zsel));
  const tabs = el('div', 'settabs'); tabs.setAttribute('role', 'tablist');       // Control | Board | Cards: the rows are grouped on three tabs; the one last used stays open while the page is open
  const panels = [['Control', [[speedRow, 'speed'], [tlRow, 'time'], [egRow, 'flag']]], ['Board', [[zooRow, 'boards'], [playedRow, 'played'], [modeRow, 'hand'], [pvRow, 'lens'], [ebRow, 'frame']]], ['Cards', [[handRow, 'played'], [statueRow, 'statue'], [snakeRow, 'panda']]]].map(([name, rows], i) => {
    const pn = el('div', 'setpanel'); pn.setAttribute('role', 'tabpanel'); for (const [r, k] of rows) { r.prepend(chip(k)); pn.append(r); }
    const b = el('button', 'settab', name); b.type = 'button'; b.setAttribute('role', 'tab');
    b.onclick = () => showTab(i);
    b.onkeydown = (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); const n = (i + (e.key === 'ArrowRight' ? 1 : 2)) % 3; showTab(n); tabs.children[n].focus(); } };
    tabs.append(b);
    return pn;
  });
  const showTab = (i) => { settingsTab = i; box.dataset.tab = String(i); panels.forEach((pn, k) => { pn.hidden = k !== i; tabs.children[k].classList.toggle('on', k === i); tabs.children[k].setAttribute('aria-selected', String(k === i)); tabs.children[k].tabIndex = k === i ? 0 : -1; }); };
  showTab(settingsTab);
  box.append(head, tabs, ...panels);
  modal.append(box, pvNote);
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });         // a click on the dimmed background closes it
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && settingsOpen()) { e.stopPropagation(); close(); } }, true);
  document.body.append(modal);
  const wheel = $('settings');
  if (wheel) wheel.onclick = () => { modal.hidden = false; x.focus(); };
  setSpeed(S.speed);
  applyTimeline();
}
