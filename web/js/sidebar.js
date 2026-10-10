// [module] Sidebar: the Control | Log tabs, the log's scroll-follow, and fitting the info panel (player trackers) into the height left under the control panel.
import { $ } from './util.js';
import { S, MINIGAME } from './state.js';

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
  if (!S.scaled) { side.style.zoom = ''; side.parentElement.style.marginTop = ''; const b = pane.querySelector('.bar'); if (b) b.style.height = ''; side.style.removeProperty('--ppx-gap'); side.style.removeProperty('--ppx-badge'); side.style.removeProperty('--ppx-pad'); return; }       // phones: not handled yet
  const fitWidth = () => { side.style.zoom = 1; side.style.zoom = pane.clientWidth / side.offsetWidth; };
  if (MINIGAME) { pane.style.marginTop = '0px'; fitWidth(); return; }                 // (a mini game has no control panel to line up with the project area: the tracker starts at the top of the sidebar)
  alignControl(pane);
  fitWidth();
  spreadInfo(pane, side);
  if (pane.scrollHeight > pane.clientHeight) { fitWidth(); spreadInfo(pane, side); }       // (a scrollbar appeared and took some width: fit to what is left)
}
// The player boxes get a constant extra height, so that in the basic state (full window 16:9, no timeline row, no bonus-token row, no fork box) they fill the pane down to its bottom edge without a scrollbar.
// The extra is worked out for that state and for a window of at least 16:9 height (a lower window keeps the same extra and the pane scrolls); whatever else is visible only makes the pane scroll too (the boxes never shrink to avoid it).
// The extra goes to the icon rows (continents, species, science, rock, water): the badges grow as far as the column allows, with the number beside the badge (like BGA's .icons-summary) or below it,
// whichever lets the badge grow more; what is left moves the rows apart and is empty space at the bottom of each box.
// All measurements are viewport px; the CSS variables are in the layout px of #side (one px of it = k viewport px).
function spreadInfo(pane, side) {
  const bar = pane.querySelector('.bar'), proj = document.querySelector('.tablecol .projpanel');
  const boxes = [...side.querySelectorAll('.pp')];
  const reset = () => { side.classList.remove('ppbelow'); for (const v of ['--ppx-gap', '--ppx-badge', '--ppx-pad']) side.style.setProperty(v, '0px'); };
  reset();
  if (!bar || !proj || !boxes.length) return;
  const k = side.getBoundingClientRect().height / side.offsetHeight || 1;
  const pr = proj.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(pane).rowGap || getComputedStyle(pane).gap) * (pane.getBoundingClientRect().height / pane.offsetHeight || 1);
  const baseTop = pr.bottom + gap;                                                  // the info boxes start here in the basic state (control panel as high as the project area)
  const paneBottom = pane.getBoundingClientRect().bottom + Math.max(0, window.innerWidth * 9 / 16 - window.innerHeight);       // (a window lower than 16:9 counts as 16:9)
  let extras = 0;                                                                   // height of the bonus-token rows (an additional element)
  for (const r of side.querySelectorAll('.bonusrow')) extras += r.getBoundingClientRect().height + parseFloat(getComputedStyle(r).marginTop) * k;
  const cols = S.replay && S.replay.marine_worlds ? 6 : 5;
  const colW = (boxes[0].querySelector('.ppicons') || side).offsetWidth / cols;      // layout px
  const plan = (below) => {
    reset(); side.classList.toggle('ppbelow', below);
    const e = Math.max(0, (paneBottom - baseTop - (side.getBoundingClientRect().height - extras) - 2) / boxes.length / k);       // free height per box
    const cap = below ? colW - 6 - 30 : colW - 20 - 30;                              // the badge may be as wide as the column minus its number
    const g = Math.max(0, Math.min(cap, e / 3 - 3));
    return { below, e, g };
  };
  const best = [plan(false), plan(true)].sort((a, b) => b.g - a.g)[0];
  reset(); side.classList.toggle('ppbelow', best.below);
  if (best.e < 1) return;
  const target = paneBottom - baseTop - 2;                                          // height the boxes (without the bonus rows) may have
  const apply = (g, rest) => {
    side.style.setProperty('--ppx-badge', g + 'px');
    side.style.setProperty('--ppx-gap', rest * 0.7 / 2 + 'px');
    side.style.setProperty('--ppx-pad', rest * 0.3 + 'px');
  };
  let g = best.g, rest = Math.max(0, best.e - 3 * g);
  for (let i = 0; i < 6; i++) {                                                     // (the numbers grow with the badges: correct what the estimate missed, the badge shrinks only if the spacing is used up)
    apply(g, rest);
    const over = (side.getBoundingClientRect().height - extras - target) / boxes.length / k;
    if (Math.abs(over) < 0.5) break;
    if (over > 0) { const cut = Math.min(rest, over); rest -= cut; g = Math.max(0, g - (over - cut) / 4); }
    else rest += -over;
  }
}
