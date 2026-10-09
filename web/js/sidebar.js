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
// The info panel (#side) is laid out for SIDE_W px (19rem) and always zoomed to the full width of the sidebar; when it is then higher than the space under the control panel, the pane scrolls and shows a thin scrollbar, and the panel is then fitted to the width that is left (no scrollbar, no lost width when nothing scrolls).
// The control panel has the same height and the same top edge as the upper project area (at the top of the page), so the info boxes below it start at the top edge of the
// association board (the gap under the panel is the .5rem of the pane, the gap between project area and board is .5rem too). Page px = zoomed px / S.scale.
function alignControl(pane) {
  const bar = pane.querySelector('.bar'), proj = document.querySelector('.tablecol .projpanel');
  if (!bar || !proj) return;
  const k = S.scale || 1, pr = proj.getBoundingClientRect();
  pane.style.marginTop = '0px';
  const top = (pr.top + window.scrollY) / k, paneTop = pane.getBoundingClientRect().top / k;       // (the sidebar is fixed: its top is the viewport's)
  pane.style.marginTop = Math.max(0, top - paneTop) + 'px';
  const tl = $('timeline');
  bar.style.height = tl && !tl.hidden ? '' : pr.height / k + 'px';                 // (with the timeline row the panel is higher: its own height, only its top stays aligned)
}
window.addEventListener('load', () => fitSidebar());                       // (the project area has its final size once the pictures are loaded)
export function fitSidebar() {
  const pane = $('paneControl'), side = $('side');
  if (!pane || !side || pane.hidden) return;
  if (!S.scaled) { side.style.zoom = ''; side.parentElement.style.marginTop = ''; const b = pane.querySelector('.bar'); if (b) b.style.height = ''; return; }       // phones: not handled yet
  alignControl(pane);
  side.style.zoom = 1;
  side.style.zoom = pane.clientWidth / side.offsetWidth;
  if (pane.scrollHeight > pane.clientHeight) side.style.zoom = pane.clientWidth / side.offsetWidth;       // (a scrollbar appeared and took some width: fit to what is left)
}
