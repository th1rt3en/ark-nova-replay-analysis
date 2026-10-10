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
// Scale of the sidebar's content (the switch's width, the control panel and the info boxes): 1 = 320 px wide, natural size. When the window is too low for the control pane the
// content is scaled down uniformly (CSS zoom through --sbz, set on the aside) so that at 1920 x 1080 (about 0.91) everything fits without a scrollbar; it is never scaled below
// MIN_ZOOM, so a lower window keeps the proportions and widths of that full-screen look and the pane just scrolls. A higher window shows the natural size (1).
// Called after every render, resize, tab switch and when the fonts are loaded (layout.js, main.js, settings.js).
const MIN_ZOOM = 0.91, PANE_PAD_BOTTOM = 10;
export function fitSidebar() {
  const aside = document.querySelector('aside.sidebar'), pane = $('paneControl'), side = $('side');
  if (side) side.style.zoom = '';
  if (!aside || !pane) return;
  aside.style.setProperty('--sbz', '1');
  if (pane.hidden) return;
  const natural = pane.scrollHeight - PANE_PAD_BOTTOM, room = pane.clientHeight - PANE_PAD_BOTTOM;
  const z = natural > room && room > 0 ? Math.max(MIN_ZOOM, room / natural) : 1;
  aside.style.setProperty('--sbz', String(Math.floor(z * 1000) / 1000));
}
