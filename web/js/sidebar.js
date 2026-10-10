// [module] Sidebar: the Control | Log tabs, the log's scroll-follow, and fitting the info panel (player trackers) into the height left under the control panel.
import { $ } from './util.js';
import { S } from './state.js';

const TAB_KEY = 'sidebarTab';
function setTab(tab) {
  S.sbTab = tab === 'log' ? 'log' : 'control';
  for (const [id, name] of [['tabControl', 'control'], ['tabLog', 'log']]) {
    const b = $(id); if (!b) continue;
    b.classList.toggle('on', S.sbTab === name);
    b.setAttribute('aria-selected', String(S.sbTab === name));
  }
  $('paneControl').hidden = S.sbTab !== 'control';
  $('paneLog').hidden = S.sbTab !== 'log';
  try { localStorage.setItem(TAB_KEY, S.sbTab); } catch (e) { /* private window */ }
  fitSidebar();
  followLog(true);
}
export function setupSidebar() {
  $('tabControl').onclick = () => setTab('control');
  $('tabLog').onclick = () => setTab('log');
  let saved = 'control';
  try { saved = localStorage.getItem(TAB_KEY) || 'control'; } catch (e) { /* private window */ }
  setTab(saved);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSidebar);
}
// Keep the line of the step on show inside the visible part of the log (the list only, never the page). `center`: put it in the middle (after switching to the log).
export function followLog(center) {
  const list = $('moves'), li = list && list.children[S.step];
  if (!li || !list.clientHeight) return;
  if (center) list.scrollTop = li.offsetTop - (list.clientHeight - li.offsetHeight) / 2;
  else if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
  else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
}
// The control pane (control panel + the two info boxes) is shown at its natural size when the window is high enough; in a lower window both are scaled down together
// (CSS zoom through --sbz on #paneControl, down to MIN_ZOOM, below that the pane scrolls) so that the second player's box is never cut off. The content keeps its 320 px
// layout width and is right-aligned, so the dotted rail on its left gets a little wider. Called after every render, resize and tab switch (layout.js, main.js, settings.js).
const MIN_ZOOM = 0.8, PANE_PAD_BOTTOM = 10;
export function fitSidebar() {
  const pane = $('paneControl'), side = $('side');
  if (side) side.style.zoom = '';
  if (!pane || pane.hidden) return;
  pane.style.setProperty('--sbz', '1');
  const natural = pane.scrollHeight - PANE_PAD_BOTTOM, room = pane.clientHeight - PANE_PAD_BOTTOM;
  const z = natural > room && room > 0 ? Math.max(MIN_ZOOM, room / natural) : 1;
  pane.style.setProperty('--sbz', String(Math.floor(z * 1000) / 1000));
}
