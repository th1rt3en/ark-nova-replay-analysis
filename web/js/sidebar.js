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
}
// Keep the line of the step on show inside the visible part of the log (the list only, never the page). `center`: put it in the middle (after switching to the log).
export function followLog(center) {
  const list = $('moves'), li = list && list.children[S.step];
  if (!li || !list.clientHeight) return;
  if (center) list.scrollTop = li.offsetTop - (list.clientHeight - li.offsetHeight) / 2;
  else if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
  else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
}
// The sidebar needs no fitting: the control panel and the info boxes keep their natural size (320 px wide); a window that is too low for them makes the control pane scroll
// (thin scrollbar). Kept as a function because layout.js, main.js and settings.js call it.
export function fitSidebar() {
  const side = $('side');
  if (side) side.style.zoom = '';
}
