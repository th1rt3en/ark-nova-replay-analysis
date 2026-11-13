// [module] Sidebar: the Control | Log tabs, the log's scroll-follow, and the width of the control pane's scrollbar (the sidebar's size itself is CSS, see parkposter.css).
// Setting "Log" (S.logPos, settings.js): 'tab' = the log is a tab of its own (default); 'below' = the log lies in the control pane under the info boxes, newest move first, and the
// Control | Log switch follows the scroll (the half whose part is on show is lit) and a click scrolls to that part (`placeLog`, `spy`, `jumpTo`); in that mode the bar is drawn as two
// section links with a gold underline that slides with the scroll (`slide`).
import { $ } from './util.js';
import { MINIGAME, S } from './state.js';

const TAB_KEY = 'sidebarTab';
let chatSeen = () => {};                                          // set by `chatTab` (the play page): the Chat tab was opened, the unread count goes
/** The Chat tab of the play page: `onUnread(n)` of the chat shows the number on the tab; opening the tab clears it. Returns the function to give the chat as `onUnread`. */
export function chatTab(chat) {
  const badge = $('tabChat') && $('tabChat').querySelector('.badge');
  chatSeen = () => chat() && chat().seen();
  return (n) => { if (badge) { badge.textContent = n > 9 ? '9+' : String(n); badge.hidden = !n || S.sbTab === 'chat'; } };
}
/** The log lies under the info boxes (setting "Log" = Below the player boxes). */
export const logBelow = () => S.logPos === 'below' && !MINIGAME;
/** The log lists the newest move first (setting "Log order", kept for each place of the log: default oldest first as a tab, newest first below the boxes). */
export const logNewest = () => (S.logOrder || {})[logBelow() ? 'below' : 'tab'] === 'newest';
const logEl = () => $('logBox') || $('moves');                    // (the search box wraps the list, log-search.js; before it exists the list itself)
// screen pixels per layout pixel of the pane (the page is zoomed to the window, layout.js): rects are screen pixels, scrollTop is the pane's own
const paneScale = (pane) => (pane.offsetHeight ? pane.getBoundingClientRect().height / pane.offsetHeight : 1) || 1;
/** Where the log starts in the pane's scroll (scrollTop that puts it at the top). */
function logTop(pane) {
  const box = logEl(); if (!box) return 0;
  return pane.scrollTop + (box.getBoundingClientRect().top - pane.getBoundingClientRect().top) / paneScale(pane);
}
function marks() {
  for (const [id, name] of [['tabControl', 'control'], ['tabLog', 'log'], ['tabChat', 'chat']]) {
    const b = $(id); if (!b) continue;
    b.classList.toggle('on', S.sbTab === name);
    b.setAttribute('aria-selected', String(S.sbTab === name));
  }
}
let jumping = 0;                                                  // a click on Control / Log is scrolling the pane (the switch does not follow until it is done)
function jumpTo(tab) {
  const pane = $('paneControl'); if (!pane) return;
  const li = tab === 'log' ? currentLine() : null;
  const top = Math.min(tab === 'log' ? (li && lineScroll(pane, li, true)) ?? logTop(pane) : 0, pane.scrollHeight - pane.clientHeight);      // (Log: the top of the log, or further down when the line of the step on show is further down, e.g. oldest move first)
  const smooth = S.animations !== 'none' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  clearTimeout(jumping);
  const done = () => { clearTimeout(jumping); jumping = 0; spy(); };
  jumping = setTimeout(done, smooth ? 800 : 0);
  if (!smooth) { pane.scrollTop = top; return; }
  // deep in a long log: skip at once to one pane height before the target and glide only that last part (a smooth scroll over the whole log took seconds)
  const d = top - pane.scrollTop;
  if (Math.abs(d) > pane.clientHeight * 1.5) pane.scrollTop = top - Math.sign(d) * pane.clientHeight;
  pane.scrollTo({ top, behavior: 'smooth' });
  if ('onscrollend' in pane) pane.addEventListener('scrollend', done, { once: true });
}
/** Log below: light Log once the log reaches the upper half of the pane, Control above that. */
function spy() {
  if (!logBelow() || S.sbTab === 'chat' || jumping) return;
  const pane = $('paneControl'), box = logEl();
  if (!pane || !box || pane.hidden || !pane.clientHeight) return;
  const pr = pane.getBoundingClientRect();
  const tab = box.getBoundingClientRect().top - pr.top <= pr.height / 2 ? 'log' : 'control';
  if (tab !== S.sbTab) { S.sbTab = tab; marks(); }
}
/** Log below: the bar's gold underline (parkposter.css, `.sbtabs::after`) slides from Control to Log with the scroll: it starts to move when the log comes up from the bottom of the pane
 *  and lies under Log once the log fills the pane (its top at the top of the pane). On the Chat tab (play page) it lies under Chat. Sets --ulx / --ulw (layout px) on the bar. */
function slide() {
  const bar = document.querySelector('.sbtabs'), a = $('tabControl'), b = $('tabLog');
  if (!bar || !a || !b || !logBelow()) return;
  let p = 0;
  if (S.sbTab === 'chat') { const c = $('tabChat'); if (c) { bar.style.setProperty('--ulx', c.offsetLeft + 'px'); bar.style.setProperty('--ulw', c.offsetWidth + 'px'); } return; }
  const pane = $('paneControl'), box = logEl();
  if (pane && box && !pane.hidden && pane.clientHeight) {
    const pr = pane.getBoundingClientRect(), t = box.getBoundingClientRect().top - pr.top;
    p = Math.min(1, Math.max(0, (pr.height - t) / pr.height));
  }
  bar.style.setProperty('--ulx', (a.offsetLeft + (b.offsetLeft - a.offsetLeft) * p) + 'px');
  bar.style.setProperty('--ulw', (a.offsetWidth + (b.offsetWidth - a.offsetWidth) * p) + 'px');
}
function setTab(tab, noScroll) {
  S.sbTab = tab === 'log' || (tab === 'chat' && $('tabChat')) ? tab : 'control';                        // (the Chat tab exists on the play page only)
  marks();
  const below = logBelow(), chat = S.sbTab === 'chat';
  $('paneControl').hidden = below ? chat : S.sbTab !== 'control';
  $('paneLog').hidden = below || S.sbTab !== 'log';
  if ($('paneChat')) $('paneChat').hidden = !chat;
  if (chat) chatSeen();
  slide();
  try { localStorage.setItem(TAB_KEY, S.sbTab); } catch (e) { /* private window */ }
  if (below && !chat && !noScroll) { jumpTo(S.sbTab); fitSidebar(); return; }      // (the jump first: while it runs the switch does not follow the scroll, `spy`)
  fitSidebar();
  followLog(true);
}
/** Puts the log where the setting says (its own tab, or the control pane under the info boxes) in the order the setting says. Called at the start and when a setting changes (settings.js). */
export function placeLog() {
  const box = logEl(), pane = $('paneControl'), logPane = $('paneLog'), aside = document.querySelector('aside.sidebar');
  if (!box || !pane || !logPane || !aside) return;
  const below = logBelow();
  aside.classList.toggle('logbelow', below);
  aside.classList.toggle('lognewest', logNewest());                      // (the order: parkposter.css sorts the lines with `order`, --i set by playback.js `buildMoveList`)
  const home = below ? pane : logPane, moved = box.parentNode !== home;
  if (moved) home.append(box);
  if (below) {
    if (!moved) { followLog(true); spy(); return; }      // (only the order changed: the log keeps its place, the line of the step on show comes into view)
    setTab(S.sbTab === 'chat' ? 'chat' : 'control', true); pane.scrollTop = 0; spy();
  }
  else setTab(S.sbTab === 'chat' ? 'chat' : S.sbTab === 'log' ? 'log' : 'control');
}
export function setupSidebar() {
  $('tabControl').onclick = () => setTab('control');
  $('tabLog').onclick = () => setTab('log');
  if ($('tabChat')) $('tabChat').onclick = () => setTab('chat');
  let saved = 'control';
  try { saved = localStorage.getItem(TAB_KEY) || 'control'; } catch (e) { /* private window */ }
  setTab(saved === 'chat' ? 'chat' : 'control');                       // (a loaded game always starts on Control, whatever tab was open last time; the Chat tab of the play page is remembered)
  let raf = 0;
  $('paneControl').addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; spy(); slide(); }); }, { passive: true });      // (log below: the switch follows the scroll)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSidebar);
}
// Keep the line of the step on show inside the visible part of the log (the list only, never the page). `center`: put it in the middle (after switching to the log).
// Log below: the pane scrolls instead of the list, and only while the log is the part on show (Log lit), never above the top of the log.
export function followLog(center) {
  const list = $('moves'), li = currentLine();
  if (!li) return;
  if (logBelow()) { if (S.sbTab === 'log' && !jumping) showLine(li, center); return; }
  if (!list.clientHeight) return;
  if (center) list.scrollTop = li.offsetTop - (list.clientHeight - li.offsetHeight) / 2;
  else if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
  else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
}
/** The log line of the step on show (a step the log filter hides: the last line before it that is shown). */
function currentLine() {
  const list = $('moves'); let li = list && list.children[S.step];
  while (li && li.offsetParent === null) li = li.previousElementSibling;
  return li || null;
}
/** Log below: the scrollTop of the pane that puts `li` on show (`center`: in the middle), never above the top of the log; null when it is on show already. */
function lineScroll(pane, li, center) {
  const k = paneScale(pane), pr = pane.getBoundingClientRect(), r = li.getBoundingClientRect();
  const top = (r.top - pr.top) / k, h = r.height / k, view = pane.clientHeight;
  let to = pane.scrollTop;
  if (center) to += top - (view - h) / 2;
  else if (top < 0) to += top;
  else if (top + h > view) to += top + h - view;
  else return null;
  return Math.max(Math.round(logTop(pane)), Math.round(to));
}
/** Scrolls the log so that the line `li` is on show (`center`: in the middle). Used by the follow and by the log search (log-search.js). */
export function showLine(li, center) {
  if (!li) return;
  if (!logBelow()) {
    const list = $('moves'); if (!list || !list.clientHeight) return;
    if (center) list.scrollTop = li.offsetTop - (list.clientHeight - li.offsetHeight) / 2;
    return;
  }
  const pane = $('paneControl'); if (!pane || pane.hidden || !pane.clientHeight) return;
  const to = lineScroll(pane, li, center);
  if (to !== null) pane.scrollTop = to;
}
// The sidebar's content is a fixed 300 px wide at every window height (CSS: --sbw, the panel and boxes zoomed by --sbz = 300/320); the control pane just scrolls when the window is too low.
// The only thing measured here is the width of the pane's scrollbar (the pane always reserves it, scrollbar-gutter: stable), so that the switch ends where the boxes end (--sbgutter on the aside).
// Called after every render, resize, tab switch and when the fonts are loaded (layout.js, main.js, settings.js).
export function fitSidebar() {
  const aside = document.querySelector('aside.sidebar'), pane = $('paneControl');
  if (!aside || !pane || pane.hidden || !pane.offsetWidth) return;
  const gutter = Math.max(0, pane.offsetWidth - pane.clientWidth);
  aside.style.setProperty('--sbgutter', gutter + 'px');
  aside.style.setProperty('--logmin', Math.max(0, pane.clientHeight - 10) + 'px');      // (log below: the log is at least one pane tall, so a click on Log can always bring it to the top)
  spy(); slide();
}
