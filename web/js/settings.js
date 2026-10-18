// [module] Settings pop-up (the wheel in the control panel): autoplay speed, timeline row, size and style of the hand, where the played cards are shown, the card variants (no-snake, S274), the layout of the two zoos. All are remembered in the browser (`localStorage`, key `settings`); the size of the drawer (`drawerFull`) is saved without a control here: the button on the drawer sets it.
import { $, el } from './util.js';
import { FORK, MINIGAME, PLAY, S, SANDBOX } from './state.js';
import { setSpeed } from './playback.js';
import { fitSidebar } from './sidebar.js';
import { NO_SNAKE_MODES } from './nosnake.js';

let settingsTab = 0;                                                       // the tab of the pop-up that is open: 0 Control, 1 Board, 2 Cards (not stored)
const KEY = 'settings';                                                    // localStorage: { speed: 0.5 | 1 | 2 | 3 | 4, timeline: boolean, hand: 0.5 ... 2, handMode: 'fan' | 'tray', noSnake: 'show' | 'hide' | 'worm', s274: 'victory' | 'mascot', zoos: 'side' | 'tabs' | 'stack', played: 'below' | 'tray' | 'drawer', drawerFull: { 0: boolean, 1: boolean } }
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
export const PLAYED_MODES = [['below', 'Below the map'], ['drawer', 'Slide-out drawer'], ['tray', 'Tray in the hand dock'], ['beside', 'Cards next to the map']];       // where the played cards are shown (zoo.js `playedMode`)
export const SPEEDS = [0.5, 1, 2, 3, 4];                                  // the autoplay speeds, the steps of the slider (1 = the default)
export const HAND_SCALES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];            // the sizes of the cards in the hand (1 = the default size)
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ speed: S.speed, timeline: S.showTimeline, egLive: S.endgameLive, hand: S.handScale, bpreview: S.previewBuilding, handMode: S.handMode, noSnake: S.noSnake, s274: S.s274, zoos: S.zooLayout, played: S.playedMode, drawerFull: S.drawerFull })); } catch (e) { /* no storage */ } };
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
  const showVal = () => { const f = Number(slider.value) / (values.length - 1), v = values[Number(slider.value)]; bubble.textContent = v + 'x'; bubble.style.left = 'calc(var(--knob) / 2 + (100% - var(--knob)) * ' + f + ')'; };
  slider.addEventListener('input', () => { onPick(values[Number(slider.value)]); showVal(); }); showVal();
  track.append(slider, bubble);
  return track;
}
export function setupSettings() {
  const st = read();
  S.previewBuilding = st.bpreview !== false;                              // default: on
  S.endgameLive = st.egLive !== false;                                    // default: on
  S.showTimeline = st.timeline === true;                                   // default: off
  S.speed = SPEEDS.includes(st.speed) ? st.speed : 1;                  // default: 1x
  S.handScale = HAND_SCALES.includes(st.hand) ? st.hand : 1;               // default: 1x
  S.handMode = st.handMode === 'fan' ? 'fan' : 'tray';                   // default: the floating tray
  S.s274 = st.s274 === 'mascot' ? 'mascot' : 'victory';                       // default: Victory Column (the BGA name)
  S.noSnake = NO_SNAKE_MODES.some(([v]) => v === st.noSnake) ? st.noSnake : 'show';        // default: show
  S.zooLayout = ['side', 'tabs', 'stack'].includes(st.zoos) && !FORK && !SANDBOX && !PLAY && !MINIGAME ? st.zoos : 'side';       // default: side by side (only the replay: a fork needs both boards)
  S.playedMode = PLAYED_MODES.some(([v]) => v === st.played) ? st.played : st.played === 'side' ? 'drawer' : 'below';
  S.drawerFull = st.drawerFull === true ? { 0: true, 1: true } : st.drawerFull && typeof st.drawerFull === 'object' ? { 0: st.drawerFull[0] === true, 1: st.drawerFull[1] === true } : {};      // the drawer of each board: narrow beside the map (default) or expanded over it; the last choice is kept (an old setting was one boolean for both boards)
  if (S.playedMode === 'tray' && S.handMode !== 'tray') S.playedMode = 'below';           // the tray needs the floating hand (default of the setting: below the map)
  applyHandScale();
  const modal = el('div', 'modal'); modal.id = 'settingsModal'; modal.hidden = true;
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
  pvRow.append(el('span', 'setlabel', 'Placement preview (right-click)'), pvsw);
  pvRow.title = 'Right-click a sponsor building card in a hand, or a zoo map to pick an enclosure, to try where it fits (nothing is placed). Right-click again to stop.';
  const handRow = el('div', 'setrow setslide');                            // the size of the cards in the hand: a slider with seven steps
  handRow.append(el('span', 'setlabel', 'Hand card size'), knobSlider(HAND_SCALES, S.handScale, 'Size of the cards in the hand', (v) => { S.handScale = v; applyHandScale(); save(); }));
  const modeRow = el('div', 'setrow');                                    // how the hand is shown: a fan at the screen edge, or a floating tray (dock.js)
  const sel = el('select', 'setselect'); sel.setAttribute('aria-label', 'Hand display');
  for (const [v, t] of [['tray', 'Floating container'], ['fan', 'Fan at the screen edge']]) { const o = el('option', '', t); o.value = v; sel.append(o); }
  sel.value = S.handMode;
  sel.onchange = () => {
    S.handMode = sel.value === 'fan' ? 'fan' : 'tray';
    if (S.handMode !== 'tray' && S.playedMode === 'tray') { S.playedMode = 'below'; psel.value = 'below'; document.dispatchEvent(new Event('playedmode')); }   // the played-cards tray lives in the hand dock: back to the default
    syncPlayedOptions(); save(); document.dispatchEvent(new Event('handmode'));
  };
  modeRow.append(el('span', 'setlabel', 'Hand display'), sel);
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
    psel.value = beside ? 'beside' : S.playedMode === 'beside' || (S.playedMode === 'tray' && S.handMode !== 'tray') ? 'below' : S.playedMode;      // (what zoo.js `playedMode` shows)
  };
  syncPlayedOptions();
  psel.onchange = () => { S.playedMode = psel.value; save(); document.dispatchEvent(new Event('playedmode')); };
  playedRow.append(el('span', 'setlabel', 'Played cards'), psel);
  const snakeRow = el('div', 'setrow');                                   // the cards with a snake photo (nosnake.js): shown, suppressed or replaced by the Slow Worm
  const ssel = el('select', 'setselect'); ssel.setAttribute('aria-label', 'No-snake mode');
  for (const [v, t] of NO_SNAKE_MODES) { const o = el('option', '', t); o.value = v; ssel.append(o); }
  ssel.value = S.noSnake;
  ssel.onchange = () => { S.noSnake = ssel.value; save(); document.dispatchEvent(new Event('nosnake')); };
  snakeRow.append(el('span', 'setlabel', 'No-snake mode'), ssel);
  const statueRow = el('div', 'setrow');                                  // the sponsor S274: Victory Column (BGA) or Mascot Statue (card data); cards.js `info` swaps name and pictures
  const tsel = el('select', 'setselect'); tsel.setAttribute('aria-label', 'Statue card');
  for (const [v, t] of [['victory', 'Victory Column'], ['mascot', 'Mascot Statue']]) { const o = el('option', '', t); o.value = v; tsel.append(o); }
  tsel.value = S.s274;
  tsel.onchange = () => { S.s274 = tsel.value; save(); document.dispatchEvent(new Event('nosnake')); };       // (the same refresh as the no-snake mode: every card is drawn again)
  statueRow.append(el('span', 'setlabel', 'Statue card'), tsel);
  const zooRow = el('div', 'setrow');                                     // how the two zoo boards are laid out (main.js `zooBoards`)
  const zsel = el('select', 'setselect'); zsel.setAttribute('aria-label', "Players' boards");
  for (const [v, t] of [['side', 'Side by side'], ['tabs', 'Tabbed (one board, arrows)'], ['stack', 'Top / bottom']]) { const o = el('option', '', t); o.value = v; zsel.append(o); }
  zsel.value = S.zooLayout;
  zsel.onchange = () => { S.zooLayout = zsel.value; syncPlayedOptions(); save(); document.dispatchEvent(new Event('zoolayout')); };
  zooRow.append(el('span', 'setlabel', 'Player boards'), zsel);
  const tabs = el('div', 'settabs'); tabs.setAttribute('role', 'tablist');       // Control | Board | Cards: the rows are grouped on three tabs; the one last used stays open while the page is open
  const panels = [['Control', [speedRow, tlRow, egRow]], ['Board', [zooRow, playedRow, modeRow, pvRow]], ['Cards', [handRow, statueRow, snakeRow]]].map(([name, rows], i) => {
    const pn = el('div', 'setpanel'); pn.setAttribute('role', 'tabpanel'); pn.append(...rows);
    const b = el('button', 'settab', name); b.type = 'button'; b.setAttribute('role', 'tab');
    b.onclick = () => showTab(i);
    b.onkeydown = (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); const n = (i + (e.key === 'ArrowRight' ? 1 : 2)) % 3; showTab(n); tabs.children[n].focus(); } };
    tabs.append(b);
    return pn;
  });
  const showTab = (i) => { settingsTab = i; panels.forEach((pn, k) => { pn.hidden = k !== i; tabs.children[k].classList.toggle('on', k === i); tabs.children[k].setAttribute('aria-selected', String(k === i)); tabs.children[k].tabIndex = k === i ? 0 : -1; }); };
  showTab(settingsTab);
  box.append(head, tabs, ...panels);
  modal.append(box);
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });         // a click on the dimmed background closes it
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && settingsOpen()) { e.stopPropagation(); close(); } }, true);
  document.body.append(modal);
  const wheel = $('settings');
  if (wheel) wheel.onclick = () => { modal.hidden = false; x.focus(); };
  setSpeed(S.speed);
  applyTimeline();
}
