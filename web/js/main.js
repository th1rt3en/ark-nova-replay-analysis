// [module] Entry point of replay.html / fork.html / sandbox.html: `render()` draws one step, `boot()` loads and wires everything.
import { FORK, MINIGAME, PLAY, S, SANDBOX, table } from './state.js';
import { $, el } from './util.js';
import { setupNoTips } from './notips.js';
import { askSpectated, needsChoice, orientParam, povDialogOpen, povParam, povState, seatOrder } from './pov.js';
import { fetchReplay } from './load.js';
import { applyIconNames } from './icons.js';
import { renderShared } from './shared.js';
import { actionBar } from './action-bar.js';
import { closePile, renderPile } from './pile.js';
import { sidePanel } from './side-panel.js';
import { renderDock, toggleDock } from './dock.js';
import { renderZoo } from './zoo.js';
import { engineBadge, labelNode } from './log-labels.js';
import { fitDisplay, fitScale } from './layout.js';
import { fitSidebar, followLog, setupSidebar } from './sidebar.js';
import { atEnd, atStart, buildMoveList, buildTimeline, go, setPlaying, stepBy, updateTimeline } from './playback.js';
import { settingsOpen, setupSettings, toggleSettings } from './settings.js';
import { setupShortcuts, shortcutsOpen } from './shortcuts.js';
import { initSandbox, renderSandboxTools } from './sandbox.js';
import { forkBar, initFork, renderForkMoves } from './fork.js';
import { initPlay } from './play.js';
import { frameKind, frameState, frameText } from './frames.js';


// Redrawing keeps what did not change: the parts of a freshly drawn zone whose markup equals the one on show are put back as they were (the old elements, their pictures already
// loaded), so only the changed zones are replaced (and flash). Used in the replay; a fork / sandbox / live game still replaces everything, because the handlers of its elements
// close over the legal actions of the moment.
const markup = (n) => (n.nodeType === 1 ? n.outerHTML.replace(/mt\d+/g, 'mt') : n.textContent);          // (the ids of the clip paths count up with every drawing)
function reconcile(old, fresh) {
  if (old.nodeType !== fresh.nodeType) return fresh;
  if (markup(old) === markup(fresh)) return old;
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

export function render() {
  const scrollY = window.scrollY, scrollX = window.scrollX;       // rebuilding the boards must not move the page
  const s = S.replay.steps[S.step], st = povState(frameState());
  const cur = $('current'), kind = frameKind();
  cur.replaceChildren();
  cur.hidden = kind !== 'text' && kind !== 'both' && (FORK || kind !== 'draft');       // (the replay's draft frame shows the step text in the bar: the cards are in a lightbox)                 // replay: the step text and the bar are never shown together (frames.js)
  if (!cur.hidden) {
    let text = frameText();
    if (FORK && typeof text === 'string') text = text.replace(/^Fork of table #\d+ after step \d+: /, '');       // (the first step of a fork: the server prefixes the label; the fork box above says where it comes from)
    cur.append(labelNode(text));
    if (s.engine && s.engine.detail && s.engine.source === 'log') cur.append(el('div', 'engine-detail', 'Engine: ' + s.engine.detail));
  }
  $('enginemark').replaceChildren(engineBadge(s.engine));
  if (PLAY && (!S.replay.maps || S.replay.maps.length < 2)) {                   // the maps are still being chosen: only the bar
    for (const id of ['shared', 'zoos', 'side']) { const n = $(id); if (n) n.replaceChildren(); }
    forkBar();
    return;
  }
  // The boards are drawn again only when the position changed: the next frame of the same step (the step text, then the decision) has the same boards, and drawing ~100 pictures again
  // made the whole page flicker with every frame. A fork / sandbox / live game draws every time (what is selected or clicked changes the boards).
  const same = !FORK && !SANDBOX && S.lastBoard && S.lastBoard.st === st && S.lastBoard.pov === S.pov && S.lastBoard.orient === S.orient;
  if (!same) {
    redraw($('shared'), () => renderShared(st));
    redraw($('side'), () => sidePanel(st));
    const zoos = $('zoos');
    redraw(zoos, () => zoos.replaceChildren(...seatOrder().map((seat) => renderZoo(st, seat))));
    if ($('dock')) redraw($('dock'), () => renderDock(st)); else renderDock(st);
    S.lastBoard = { st, pov: S.pov, orient: S.orient };
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
  $('jump').value = S.step;
  for (const id of ['first', 'prev']) $(id).disabled = atStart();
  const fb = $('fork');
  if (fb) fb.disabled = !s.fork;
  for (const id of ['next', 'last']) $(id).disabled = atEnd();
  const list = $('moves');
  list.querySelector('.on')?.classList.remove('on');
  const li = list.children[S.step];
  li.classList.add('on');
  for (let i = 0; i < list.children.length; i++) list.children[i].hidden = i > S.step;       // (spoiler protection: the log only lists the moves up to the one on show)
  followLog();
  history.replaceState(null, '', '#' + S.step + (S.phase ? '.' + S.phase : ''));       // (#13 = step 13, #13.1 = its second frame)
  fitSidebar();
  fitDisplay();
  updateTimeline();
  if (S.openedPile) renderPile();
  window.scrollTo(scrollX, scrollY);
}

function init() {
  buildMoveList();
  buildTimeline();
  setupSidebar();
  setupNoTips();
  $('first').onclick = () => { go(0); };
  $('prev').onclick = () => { stepBy(-1); };
  $('next').onclick = () => { stepBy(1); };
  $('play').onclick = () => { setPlaying(!S.timer); };
  setupSettings();
  document.addEventListener('nosnake', () => { S.lastBoard = null; render(); });                  // (the cards with a snake photo get their new picture at once, no reload)
  setupShortcuts();
  $('last').onclick = () => { go(S.replay.steps.length - 1, 99); };
  $('jump').onchange = (e) => {                                          // a move number past the end jumps to the end (its last frame)
    const n = parseInt(e.target.value, 10) || 0;
    if (n >= S.replay.steps.length - 1) go(S.replay.steps.length - 1, 99); else go(Math.max(0, n));
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.openedPile) { closePile(); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === 's' || e.key === 'S') && !shortcutsOpen() && !typing && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleSettings(); return; }
    if (settingsOpen() || shortcutsOpen() || povDialogOpen() || typing || e.altKey || e.ctrlKey || e.metaKey) return;
    const keys = { ArrowLeft: () => stepBy(-1), ArrowRight: () => stepBy(1), ' ': () => { document.activeElement?.blur?.(); setPlaying(!S.timer); }, Home: () => go(0), h: () => toggleDock(), H: () => toggleDock(), End: () => go(S.replay.steps.length - 1, 99) };
    if (FORK && e.key === ' ') return;                                  // (no autoplay in a fork / sandbox / live game: Space must keep pressing the focused button)
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
  });
  if (SANDBOX) initSandbox();
  else if (PLAY) initPlay();
  else if (FORK) initFork();
  else if (!MINIGAME) {
    const fb = $('fork');
    if (fb) fb.onclick = () => { if (S.replay.steps[S.step].fork) window.open('/fork.html?table=' + encodeURIComponent(table) + '&step=' + S.step + '&pov=' + povParam() + '&orient=' + orientParam(), '_blank'); };
  }
  const [h1, h2] = PLAY ? [S.replay.steps.length - 1, 0] : FORK || MINIGAME ? [0, 0] : location.hash.slice(1).split('.').map((x) => parseInt(x, 10));
  if (loadProgress) loadProgress.done();
  $('loading').hidden = true;
  $('app').hidden = false;
  go(Number.isFinite(h1) ? h1 : 0, Number.isFinite(h2) ? h2 : 0);
  if (needsChoice()) askSpectated();                                        // (a replay opened for the first time: whom to spectate)
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
    S.replay = data;
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
    });
  }).catch((err) => {
    const m = $('loading');
    if (loadProgress) loadProgress.fail();
    m.className = 'status error';
    m.textContent = 'Could not load this table: ' + err.message;
  });
}
if (!window.MAP_EDITOR) boot();                                          // (the map editor imports the drawing code of the viewer but has no replay to load)
