// [module] Entry point of replay.html / fork.html / sandbox.html: `render()` draws one step, `boot()` loads and wires everything.
import { stageBreaks } from './break-stages.js';
import { FORK, MINIGAME, PLAY, S, SANDBOX, params, table } from './state.js';
import { $, el } from './util.js';
import { setupNoTips } from './notips.js';
import { askSpectated, needsChoice, orientParam, povDialogOpen, povParam, povState, refreshLabels, seatOrder } from './pov.js';
import { fetchFullReplay, fetchReplay } from './load.js';
import { applyIconNames } from './icons.js';
import { renderShared } from './shared.js';
import { actionBar, refreshBar } from './action-bar.js';
import { sidePanel } from './side-panel.js';
import { cycleDockTab, renderDock, toggleDock } from './dock.js';
import { beforeRender, afterRender } from './card-motion.js';
import { fitPlayed, renderCards, renderZoo } from './zoo.js';
import { engineBadge, labelNode, warmLabelIcons } from './log-labels.js';
import { startPresence } from './presence.js';
import { setupLogSearch, refreshLogSearch } from './log-search.js';
import { setupLogFilter, refreshLogFilter } from './log-filter.js';
import { fitDisplay, fitScale } from './layout.js';
import { fitSidebar, followLog, setupSidebar } from './sidebar.js';
import { atEnd, atStart, buildMoveList, buildTimeline, go, goRound, goRoundBy, moveHash, moveNumbers, roundJumps, setPlaying, stepBy, stepOfHash, stepOfMove, updateTimeline } from './playback.js';
import { applyTimeline, settingsOpen, setupSettings, toggleSettings } from './settings.js';
import { setupShortcuts, shortcutsOpen } from './shortcuts.js';
import { initSandbox, renderSandboxTools } from './sandbox.js';
import { forkBar, initFork, renderForkMoves } from './fork.js';
import { initPlay } from './play.js';
import './thin-numbers.js';
import './bpreview.js';
import { frameKind, frameState, frameText, shortDraw } from './frames.js';
import { resultsAvailable, syncResults } from './results.js';
import { initFullscreen } from './fullscreen.js';


// The players' boards by the layout setting (settings.js): side by side, one at a time with arrows (the seats go round in the order of the tracker), or one above the other
// (also the order of the tracker: `seatOrder()`).
function zooBoards(st) {
  const zoos = $('zoos'), order = seatOrder(), layout = FORK || SANDBOX || PLAY || MINIGAME ? 'side' : S.zooLayout;
  zoos.classList.toggle('zoos-tabs', layout === 'tabs');
  zoos.classList.toggle('zoos-stack', layout === 'stack');
  zoos.classList.toggle('zoos-beside', layout === 'tabs' || layout === 'stack');       // (tabbed and top / bottom: the zoo box in the display's column, the played cards in the association element's column)
  if (layout === 'stack') return order.flatMap((seat) => [renderZoo(st, seat), renderCards(st, seat)]);       // (one row per player, no switch)
  if (layout !== 'tabs') return order.map((seat) => renderZoo(st, seat));
  const seat = order.includes(S.zooTab) ? S.zooTab : order[0];
  return [renderZoo(st, seat), renderCards(st, seat)];
}
// the arrows beside the player's name (zoo.js) go round the seats in the order of the tracker
export function zooStep(d) { const o = seatOrder(), at = Math.max(0, o.indexOf(S.zooTab)); S.zooTab = o[(at + d + o.length) % o.length]; S.lastBoard = null; render(); }
document.addEventListener('zoolayout', () => { S.lastBoard = null; render(); });
document.addEventListener('encborders', () => { S.lastBoard = null; render(); });
document.addEventListener('actionstrip', () => { S.lastBoard = null; render(); });
document.addEventListener('eglive', () => { S.lastBoard = null; render(); });                  // (the live count of the endgame points is switched on or off)
document.addEventListener('playedmode', () => { S.lastBoard = null; render(); });          // (where the played cards are shown: the boards and the dock are drawn again)

// Redrawing keeps what did not change: the parts of a freshly drawn zone whose markup equals the one on show are put back as they were (the old elements, their pictures already
// loaded), so only the changed zones are replaced (and flash). Used in the replay; a fork / sandbox / live game still replaces everything, because the handlers of its elements
// close over the legal actions of the moment.
const markup = (n) => (n.nodeType === 1 ? n.outerHTML.replace(/mt\d+/g, 'mt') : n.textContent);          // (the ids of the clip paths count up with every drawing)
function reconcile(old, fresh) {
  if (old.nodeType !== fresh.nodeType) return fresh;
  if (markup(old) === markup(fresh)) return old;
  if (fresh.classList && fresh.classList.contains('flip')) return fresh;                // (the score plates are animated by closures over their own elements: never mix old pieces into them, see `plate` in side-panel.js)
  if (old.nodeType === 1 && old.tagName === fresh.tagName && old.childNodes.length && fresh.childNodes.length) {
    const a = [...old.childNodes], b = [...fresh.childNodes];
    b.forEach((n, i) => { if (a[i]) { const keep = reconcile(a[i], n); if (keep !== n) n.replaceWith(keep); } });
  }
  return fresh;
}
function redraw(root, draw) {
  const old = FORK || SANDBOX ? [] : [...root.childNodes];
  draw();
  if (old.length) [...root.childNodes].forEach((n, i) => { if (old[i]) { const keep = reconcile(old[i], n); if (keep !== n) n.replaceWith(keep); } });
}

// A click inside a zoo that only changes what is selected there (the rotation, the anchor of a building, an enclosure for an animal): the zoo boards and the bar are drawn again, nothing
// else. Drawing the shared board (association board, display) and the side panel again for every click made them jitter.
export function renderZoos() {
  if (!FORK && !SANDBOX) { render(); return; }
  const scrollY = window.scrollY, scrollX = window.scrollX;
  const st = povState(frameState());
  const zoos = $('zoos');
  zoos.replaceChildren(...zooBoards(st));
  refreshBar();
  window.scrollTo(scrollX, scrollY);
}

export function render() {
  if (S.preview && S.preview.step !== S.step) S.preview = null;           // (the building preview belongs to the step it was started on)
  const scrollY = window.scrollY, scrollX = window.scrollX;       // rebuilding the boards must not move the page
  const s = S.replay.steps[S.step], st = povState(frameState());
  const cur = $('current'), kind = frameKind();
  cur.replaceChildren();
  cur.hidden = kind !== 'text' && kind !== 'both' && (FORK || (kind !== 'draft' && kind !== 'reveal'));       // (the replay's draft frame shows the step text in the bar: the cards are in a lightbox)                 // replay: the step text and the bar are never shown together (frames.js)
  if (!cur.hidden) {
    let text = shortDraw(frameText());
    if (FORK && typeof text === 'string') text = text.replace(/^Fork of table #\d+ after step \d+: /, '');       // (the first step of a fork: the server prefixes the label; the fork box above says where it comes from)
    cur.append(labelNode(text, s));
    if (s.engine && s.engine.detail && s.engine.source === 'log' && !/^Normal turn starts/.test(s.engine.detail)) cur.append(el('div', 'engine-detail', 'Engine: ' + s.engine.detail));
  }
  $('enginemark').replaceChildren(engineBadge(s.engine));
  if (PLAY && (!S.replay.maps || S.replay.maps.length < 2)) {                   // the maps are still being chosen: only the bar
    for (const id of ['shared', 'zoos', 'side']) { const n = $(id); if (n) n.replaceChildren(); }
    forkBar();
    return;
  }
  // The boards are drawn again only when the position changed: the next frame of the same step (the step text, then the decision) has the same boards, and drawing ~100 pictures again
  // made the whole page flicker with every frame. A fork / sandbox / live game draws every time (what is selected or clicked changes the boards).
  const same = !FORK && !SANDBOX && S.lastBoard && S.lastBoard.st === st && S.lastBoard.pov === S.pov && S.lastBoard.orient === S.orient && S.lastBoard.zoos === S.zooLayout + S.zooTab;
  if (!same) {
    beforeRender(st);
    redraw($('shared'), () => renderShared(st));
    redraw($('side'), () => sidePanel(st));
    const zoos = $('zoos');
    redraw(zoos, () => zoos.replaceChildren(...zooBoards(st)));
    if ($('dock')) redraw($('dock'), () => renderDock(st)); else renderDock(st);
    S.lastBoard = { st, pov: S.pov, orient: S.orient, zoos: S.zooLayout + S.zooTab };
  } else actionBar(st);                                           // (renderShared draws the bar too: the next frame of the same step shows another bar on the same boards)
  if (FORK) {
    const prev = S.step > 0 ? S.replay.steps[S.step - 1].state : null;          // the hand that just changed (a card found by a search...) is the one the dock shows
    if (prev && S.dockHandStep !== S.step) {
      S.dockHandStep = S.step;
      const seat = st.players.findIndex((p, i) => p.hand.join() !== prev.players[i].hand.join() && p.hand.length > prev.players[i].hand.length);      // (a hand that grew)
      if (seat >= 0 && (S.dockSel.seat !== seat || S.dockSel.kind !== 'hand' || S.dockHidden)) { S.dockSel = { seat, kind: 'hand' }; S.dockHidden = false; renderDock(st); }
    }
    forkBar(); renderForkMoves();
    if (SANDBOX) renderSandboxTools(st);
  }
  if (!same) { S.prevZones = S.curZones; S.curZones = {}; S.prevZoneData = S.curZoneData; S.curZoneData = {}; }
  $('jump').value = moveNumbers().cur[S.step]; fitJump();                              // (BGA's move number, playback.js `moveNumbers`)
  syncResults();                                                          // (the last step of a finished replay: the switch Final board | Results, results.js)
  // (the four playback buttons are never paled out: at the ends a click does nothing, it is clearer than a state that changes between the final board and the results)
  const fb = $('fork');
  if (fb) fb.disabled = !s.fork || S.results;
  const list = $('moves');
  list.querySelector('.on')?.classList.remove('on');
  const li = list.children[S.step];
  li.classList.add('on');
  // spoiler protection: the log lists the moves up to the furthest one shown so far (going back keeps what was already revealed)
  S.seenStep = S.seenFor === S.replay ? Math.max(S.seenStep, S.step) : S.step; S.seenFor = S.replay;
  for (let i = 0; i < list.children.length; i++) list.children[i].hidden = i > S.seenStep;
  refreshLogFilter();                                                     // (the Players / Actions filter hides lines, log-filter.js)
  refreshLogSearch();                                                     // (the search finds only in the lines on show)
  followLog();
  history.replaceState(null, '', '#' + moveHash(S.step, S.phase, S.results));       // (#641 = BGA's move 641, #641.1 = the second step of that move, #641.1.2 = its third frame)
  fitSidebar();
  fitDisplay();
  fitPlayed();
  updateTimeline();
  window.scrollTo(scrollX, scrollY);
  afterRender(st);                                                        // visible card arrivals/departures, after final layout and scrolling
}

const fitJump = () => { const j = $('jump'), n = Math.max(1, String(j.value).length); j.style.width = n + 'ch'; j.parentNode.dataset.len = Math.min(n, 3); };      // (the move box: the input is as wide as its digits; `data-len` lets the CSS nudge the "#" + number pair left)

function init() {
  initFullscreen($('fullscreen'));
  buildMoveList();
  setupLogSearch();
  setupLogFilter();
  buildTimeline();
  setupSidebar();
  setupNoTips();
  $('first').onclick = () => { go(0); };
  $('prev').onclick = () => { stepBy(-1); };
  $('next').onclick = () => { stepBy(1); };
  $('play').onclick = () => { setPlaying(!S.timer); };
  setupSettings();
  document.addEventListener('povapplied', () => { buildMoveList(); go(S.step, S.phase); });                  // (another point of view: the Log is built again, pov.js `mergedAway`)
  document.addEventListener('nosnake', () => { refreshLabels(); S.lastBoard = null; render(); });                  // (the cards with a snake photo get their new picture at once, no reload)
  setupShortcuts();
  $('last').onclick = () => { go(S.replay.steps.length - 1, 99); };
  $('jump').oninput = fitJump;
  $('jump').onchange = (e) => {                                          // a move number past the end jumps to the end (its last frame)
    const n = parseInt(e.target.value, 10) || 0;
    const at = stepOfMove(n);                                            // (the step that holds BGA's move n, or the next one when BGA has no such move)
    if (at < 0 || at >= S.replay.steps.length - 1) go(S.replay.steps.length - 1, 99); else go(Math.max(0, at));
  };
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === 's' || e.key === 'S') && !shortcutsOpen() && !typing && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleSettings(); return; }
    if (!typing && roundJumps() && !settingsOpen() && !shortcutsOpen() && !povDialogOpen() && (e.ctrlKey || e.altKey) && !e.metaKey && !e.shiftKey) {          // round jumps (replay, sandbox)
      const dig = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
      if (e.ctrlKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); goRoundBy(e.key === 'ArrowLeft' ? -1 : 1); return; }
      if (dig) { e.preventDefault(); goRound(+dig[1]); return; }          // (Ctrl + n; Alt + n too: browsers keep Ctrl + 1-9 for their tabs)
    }
    if (settingsOpen() || shortcutsOpen() || povDialogOpen() || typing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Tab' && !MINIGAME) { if (cycleDockTab(e.shiftKey ? -1 : 1)) e.preventDefault(); return; }       // (Tab / Shift + Tab: the tabs of the shown cards, dock.js)
    const keys = { ArrowLeft: () => stepBy(-1), ArrowRight: () => stepBy(1), ' ': () => { document.activeElement?.blur?.(); setPlaying(!S.timer); }, Home: () => go(0), h: () => toggleDock(), H: () => toggleDock(), End: () => go(S.replay.steps.length - 1, 99) };
    if (S.results && !FORK && !PLAY && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) keys[e.key] = () => { if (!!S.gsGraph === (e.key === 'ArrowDown')) return; S.gsGraph = e.key === 'ArrowDown'; syncResults(); };       // (on the game stats: ↑ Table, ↓ Graph; the key of the view that is already open does nothing, no redraw)
    if (FORK && e.key === ' ') return;                                  // (no autoplay in a fork / sandbox / live game: Space must keep pressing the focused button)
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
  });
  // The side wheel of a mouse (a tilt wheel, or Shift + the wheel, which browsers turn into a horizontal scroll) steps like the arrow keys: right = forward, left = back. One step per notch
  // (a trackpad's stream of small deltas is summed up and paced), not while a dialog is open, while typing, or when the element under the pointer can scroll sideways itself (a tray of cards).
  let sideAcc = 0, sideAt = 0;
  document.addEventListener('wheel', (e) => {
    const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);                 // (Shift + the wheel: Chrome on Windows already sends it as deltaX, others keep deltaY)
    if (e.ctrlKey || e.altKey || e.metaKey || !dx || (e.deltaX && Math.abs(e.deltaX) < Math.abs(e.deltaY))) return;
    if (MINIGAME || settingsOpen() || shortcutsOpen() || povDialogOpen() || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    for (let n = e.target instanceof Element ? e.target : null; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(n).overflowX) && n.scrollWidth > n.clientWidth + 1) return;
    }
    e.preventDefault();                                                  // (also keeps a sideways swipe from being the browser's back / forward)
    const now = performance.now();
    if (now - sideAt > 400) sideAcc = 0;
    sideAcc += dx;
    if (Math.abs(sideAcc) < 30 || now - sideAt < 140) return;
    stepBy(sideAcc > 0 ? 1 : -1); sideAcc = 0; sideAt = now;
  }, { passive: false });
  if (SANDBOX) initSandbox();
  else if (PLAY) initPlay();
  else if (FORK) initFork();
  else if (!MINIGAME) {
    const fb = $('fork');
    if (fb) fb.onclick = () => { if (S.replay.steps[S.step].fork) window.open('/fork.html?table=' + encodeURIComponent(table) + '&step=' + S.step + '&at=' + moveHash(S.step, 0) + '&pov=' + povParam() + '&orient=' + orientParam() + (params.get('source') === 'upload' ? '&source=upload' : ''), '_blank'); };
  }
  const [h1, h2, hr] = PLAY ? [S.replay.steps.length - 1, 0] : FORK || MINIGAME ? [0, 0] : stepOfHash(location.hash);
  if (loadProgress) loadProgress.done();
  $('loading').hidden = true;
  $('app').hidden = false;
  go(Number.isFinite(h1) ? h1 : 0, Number.isFinite(h2) ? h2 : 0);
  if (hr) { S.wantResults = true; render(); }                              // (an address one step past the last: open the results as soon as they are available)
  if (needsChoice()) askSpectated();                                        // (a replay opened for the first time: whom to spectate)
}
// The first answer holds the draft and the starting hand only (`partial`): the viewer is already usable; the whole replay (the engine plays the game, some 20 s) replaces it when it
// arrives, at the step and frame on show. The first steps are the same in both, so nothing moves.
function loadRest() {
  const note = document.createElement('div');
  note.id = 'restnote';
  note.textContent = 'Loading the rest of the game…';
  Object.assign(note.style, { position: 'fixed', left: '12px', bottom: '12px', zIndex: 9999, padding: '6px 12px', borderRadius: '14px', background: 'rgba(0,0,0,.75)', color: '#fff', font: '13px sans-serif', pointerEvents: 'none' });
  document.body.append(note);
  fetchFullReplay().then((full) => {
    const step = S.step, phase = S.phase;
    S.replay = stageBreaks(full);
    buildMoveList();
    buildTimeline();
    applyTimeline();                                                        // (the timeline appears with the full replay)
    S.lastBoard = null;
    note.remove();
    go(step, phase);
  }).catch((err) => {
    note.textContent = 'The rest of the game could not be loaded: ' + err.message;
    note.style.background = '#b3261e';
  });
}
// start: the old file ended with these two statements inside its function
let loadProgress = null;                                                 // (the progress circle of the loading box, progress.js)
function boot() {
  fitScale();

  if (!SANDBOX && !PLAY && !MINIGAME && !/^(E\d+|\d+)$/.test(table || '')) { location.replace('/'); return; }
  loadProgress = !SANDBOX && !PLAY && !MINIGAME && window.Progress && $('loading')
    ? Progress.start($('loading'), { key: FORK ? 'fork' : 'replay', title: FORK ? 'Loading the fork' : 'Loading the table and its log', expected: FORK ? 5000 : 9000,
                                     stages: [[0, 'Looking up the table'], [0.08, 'Reading the log'], [0.25, 'Replaying the game with the engine'], [0.8, 'Building the steps']] })
    : null;
  fetchReplay().then((data) => {
    if (!data) return;
    S.replay = stageBreaks(data);
    if (loadProgress) loadProgress.stage('Preparing the board');
    return Promise.all([
      fetch('/enclosures/sprites.json').then((r) => r.json()).catch(() => ({ sprites: {} })),
      fetch('/icons/icons.json').then((r) => r.json()).catch(() => ({})),
      fetch('/icons/names.json').then((r) => r.json()).catch(() => ({})),
    ]).then(([sp, ic, names]) => {
      applyIconNames(names);
      S.iconNames = names;
      S.sprites = sp.sprites;
      for (const [id, v] of Object.entries(ic)) S.iconSizes[id] = v.size;
      init();
      warmLabelIcons();                                                     // (the pictures of the step texts are decoded before a step needs them: no icon arrives after its text)
      startPresence();                                                      // (an anonymous heartbeat while the tab is on show: how many people are on the site)
      if (data.partial) loadRest();
    });
  }).catch((err) => {
    const m = $('loading');
    if (loadProgress) loadProgress.fail();
    m.className = 'status error';
    m.textContent = 'Could not load this table: ' + err.message;
  });
}
if (!window.MAP_EDITOR) boot();                                          // (the map editor imports the drawing code of the viewer but has no replay to load)
