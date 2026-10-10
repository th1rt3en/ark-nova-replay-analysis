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
// The sidebar's content is a fixed 300 px wide at every window height (CSS: --sbw, the panel and boxes zoomed by --sbz = 300/320); the control pane just scrolls when the window is too low.
// The only thing measured here is the width of the pane's scrollbar (the pane always reserves it, scrollbar-gutter: stable), so that the switch ends where the boxes end (--sbgutter on the aside).
// Called after every render, resize, tab switch and when the fonts are loaded (layout.js, main.js, settings.js).
export function fitSidebar() {
  const aside = document.querySelector('aside.sidebar'), pane = $('paneControl'), side = $('side');
  if (side) side.style.zoom = '';
  if (!aside || !pane || pane.hidden || !pane.offsetWidth) return;
  const gutter = Math.max(0, pane.offsetWidth - pane.clientWidth);
  aside.style.setProperty('--sbgutter', gutter + 'px');
}
