// [module] Visible hand transitions, isolated from replay state and renderer-owned DOM.
import { S, FORK, MINIGAME, PLAY, SANDBOX } from './state.js';
import { frameText } from './frames.js';
import { info, cardName } from './cards.js';
import { zooBoard } from './board.js';
import { movementPlan, endgamePlan, otherPlan, parsePilfer, playedCards, playedRemoved, buildingChanges, buildingFlips, buildingGrowths, displayChanges, targetedNames, plainPlan, plainOther } from './card-motion-plan.js';
import { renderDock } from './dock.js';
import { curState, hides } from './pov.js';
import { tabbedLayout, playedMode, fullDrawerCardWidth } from './zoo.js';
import { render } from './main.js';
import { snakeSafe } from './nosnake.js';
import { createWave } from './wave.js';
import { runShark } from './shark-motion.js';
import { motionOff, motionQuery } from './motion.js';
import { captureActionMotion, runActionMotion } from './action-motion.js';
import { captureAssoc, runAssoc } from './assoc-motion.js';

const EASE = 'cubic-bezier(.22,.65,.3,1)';
export const ANIMATION_SPEEDS = [.25, .5, 1, 1.25, 1.5, 1.75, 2];
export const ANIMATION_MODES = ['all', 'standard', 'none'];
// Animations = None behaves like the system setting "reduce motion"; Only standard keeps every move but turns the thematic ones into a plain draw / discard (`plainPlan`, `plainOther`).
export function setAnimations(value) {
  const next = ANIMATION_MODES.includes(value) ? value : 'all', was = S.animations;
  S.animations = next;
  if (was !== next && next === 'none') stop();
}
export function setAnimationSpeed(value) {
  const next = ANIMATION_SPEEDS.includes(value) ? value : value > 2 ? 2 : 1;          // (a saved 3x, removed, becomes 2x)
  const before = S.animationSpeed || 1;
  S.animationSpeed = next;
  for (const a of animations) a.updatePlaybackRate(a.playbackRate * next / before);
}
let previous = null, capture = null, capture2 = null, pending = null, layer = null;
let actionCapture = null, assocCapture = null;
const landings = new Map();          // project key (P###) -> when its card has settled in the strip (ms, absolute): the cube of the supporter glides after that
let tabPrev = null, playedCapture = null, buildingCapture = null, displayCapture = null, tabVisit = null, tabReturnTimer = 0;
const animations = new Set(), hidden = new Map();
const reduced = { get matches() { return motionOff(); }, addEventListener: (type, fn) => motionQuery && motionQuery.addEventListener(type, fn) };
const frameWidth = () => document.querySelector('#dock .trayframe')?.offsetWidth || 0;       // (layout px: the tray's width before / after a step)
const cards = () => [...document.querySelectorAll('#dock .cards .card[data-key]')];
const shownSeat = () => Number(document.getElementById('dock')?.dataset.motionSeat ?? S.dockSel?.seat);
const zoneKind = () => document.getElementById('dock')?.dataset.motionKind || '';
const visibleZone = () => ['hand', 'endgame'].includes(zoneKind()) && (!S.dockHidden || S.handMode === 'tray') && !MINIGAME;          // (the cards of the hand / the endgame cards lie in the dock: open, or in the folded tray, where only their top strip shows above the window's edge and the flights are cut there like the cards)
const visibleHand = () => document.getElementById('dock')?.dataset.motionKind === 'hand' && (!S.dockHidden || S.handMode === 'tray') && !MINIGAME;          // (the same: a folded tray keeps its cards, the flights play exactly as in the open tray)
const dockSettling = () => { const d = document.getElementById('dock'); return !!d && d.getAnimations({ subtree: true }).some((a) => typeof CSSTransition !== 'undefined' && a instanceof CSSTransition && a.playState === 'running'); };          // (the hand is still sliding into its place: a flight measured now would start from the middle of that slide)
export const cardAnimationsBusy = () => animations.size > 0 || !!tabVisit || dockSettling() || !!document.querySelector('#draftbox.lbopen');
const scale = () => S.scaled ? S.scale : 1;
function geometry(node) {
  const r = node.getBoundingClientRect(), m = new DOMMatrix(getComputedStyle(node).transform);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: node.offsetWidth * scale(), h: node.offsetHeight * scale(), angle: Math.atan2(m.b, m.a) * 180 / Math.PI };
}
// (a display card sits in a scaled folder: its size is what is on screen, not offsetWidth)
function shotOnScreen(node, key) { const r = node.getBoundingClientRect(); return { ...shot(node), w: r.width, h: r.height, key, dim: node.classList.contains('dim') }; }          // (dim: a card of the display that cannot be taken is greyed out; its flight is greyed out the same way, so the greying does not arrive card by card as the flights land)
function shot(node) { return { ...geometry(node), key: node.dataset.key, image: node.querySelector('img')?.src, strip: node.querySelector('.egpts')?.cloneNode(true) || null }; }       // (strip: an endgame card's live points, they fly with the card)
// A targeted search is public, but its text names the card: until the search has turned the card over the move bar keeps the text of the step before (replay only).
let barHold = null;
function releaseBar() {
  if (!barHold) return;
  const h = barHold; barHold = null; clearTimeout(h.timer);
  const cur = document.getElementById('current'); if (cur && h.step === S.step) cur.replaceChildren(...h.keep);
}
function holdBar(at) {
  const cur = document.getElementById('current'), old = previous?.bar;
  if (FORK || PLAY || SANDBOX || MINIGAME || !cur || cur.hidden || !old || !old.length || barHold) return;
  barHold = { step: S.step, keep: [...cur.childNodes], timer: 0 };
  cur.replaceChildren(...old.map((n) => n.cloneNode(true)));
  barHold.timer = setTimeout(releaseBar, at / Math.max(.1, Number(S.animationSpeed) || 1));
}
// Debugging a flight that stutters or snaps: open the page with ?cmdebug=1 (or localStorage cmdebug = 1) and send the console: it lists what cancelled running animations (stop(): a new render, a
// resize, a scroll, a dock click) and every main-thread task over 40 ms that overlapped a running animation.
const CM_DEBUG = /[?&]cmdebug=1/.test(location.search) || (() => { try { return localStorage.getItem('cmdebug') === '1'; } catch (e) { return false; } })();
if (CM_DEBUG) {
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (animations.size) console.warn('[card-motion] long task', Math.round(e.duration) + ' ms at ' + Math.round(e.startTime), 'with', animations.size, 'animations running'); }).observe({ entryTypes: ['longtask'] });
  } catch (e) { /* no long task support */ }
  document.addEventListener('keydown', (e) => console.log('[card-motion] key', e.key, 'at', Math.round(performance.now())), true);
}
function stop(redraw = true) {
  if (CM_DEBUG && animations.size) console.warn('[card-motion] stop() cancels', animations.size, 'animations at', Math.round(performance.now()), new Error().stack.split('\n').slice(2, 6).join(' <- '));
  clearTimeout(tabReturnTimer); tabReturnTimer = 0;
  const visit = tabVisit; tabVisit = null;
  const restore = visit && S.zooTab === visit.seat && tabbedLayout();
  if (restore) { S.zooTab = visit.original; S.lastBoard = null; }
  releaseBar();
  for (const a of animations) a.cancel(); animations.clear();
  for (const [node, value] of hidden) node.style.visibility = value; hidden.clear();
  layer?.remove(); layer = null;
  if (restore && redraw) render();
}
function hide(node) { if (!hidden.has(node)) hidden.set(node, node.style.visibility); node.style.visibility = 'hidden'; }
function show(node) { if (hidden.has(node)) { node.style.visibility = hidden.get(node); hidden.delete(node); } }
function root() {
  if (!layer) {
    layer = document.createElement('div'); layer.id = 'card-motion'; layer.setAttribute('aria-hidden', 'true');
    // A sibling of the zoomed body: all measurements and animation coordinates are viewport pixels.
    document.documentElement.append(layer);
  }
  return layer;
}
function element(cls, css = {}, parent = root()) {
  const e = document.createElement('div'); e.className = cls; Object.assign(e.style, css); parent.append(e); return e;
}
// Animations start paused and are released together two frames later: a render of the page can block the main thread for a few hundred ms right after the animations are created,
// and an animation that was already running would then have skipped its first part (the card "blinks" to its place).
const startQueue = []; let startQueued = false;
function releaseStarts() { startQueued = false; for (const a of startQueue.splice(0)) if (a.playState === 'paused') a.play(); }
// Sequencing: while `sequenced(shift, fn)` runs, every animation it creates starts `shift` ms (at speed 1) later, and the result is how long the whole group takes (the starting hands: one player's cards, then the other's).
let shift = 0, spanEnd = 0, flightEnd = 0;
function sequenced(by, fn) { const keep = shift; shift = by; spanEnd = by; try { fn(); } finally { shift = keep; } return spanEnd - by; }
function animate(e, frames, duration, delay = 0, easing = EASE, fill = 'both') {
  const speed = Math.max(.1, Number(S.animationSpeed) || 1), at = delay + shift;
  spanEnd = Math.max(spanEnd, at + duration); flightEnd = Math.max(flightEnd, at + duration);
  const a = e.animate(frames, { duration: duration / speed, delay: at / speed, easing, fill });
  a.pause(); startQueue.push(a);
  if (!startQueued) { startQueued = true; requestAnimationFrame(() => requestAnimationFrame(releaseStarts)); }
  animations.add(a); a.finished.then(() => animations.delete(a), () => animations.delete(a)); return a;
}
function finish(a, fn) { a.finished.then(fn, () => {}); }
// The invisible deck: one fixed point, the centre of the header row (the move bar), for every card dealt and every card discarded in the floating tray.
function deckPoint() {
  const r = document.querySelector('.movebar')?.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: 40 };
}
function ghost(g) {
  const e = element('cm-card', { left: g.x - g.w / 2 + 'px', top: g.y - g.h / 2 + 'px', width: g.w + 'px', height: g.h + 'px' });
  if (g.image) { const im = document.createElement('img'); im.src = g.image; im.alt = ''; if (g.dim) { im.style.filter = 'grayscale(1) brightness(.86)'; e.style.boxShadow = 'none'; } e.append(im); }
  if (g.strip) { const st = g.strip.cloneNode(true); st.style.zoom = String(scale()); e.append(st); }          // (the overlay is not zoomed with the page: the strip's pixel sizes are)
  return e;
}
const tr = (x = 0, y = 0, angle = 0, s = 1) => `translate(${x}px,${y}px) rotate(${angle}deg) scale(${s})`;
function ownText() {
  const name = S.replay.players[shownSeat()]?.name;
  const text = previous && S.step > previous.step ? S.replay.steps.slice(previous.step + 1, S.step + 1).map((s) => s.label).join(' · ') : frameText();
  return String(text || '').split(' · ').filter((line) => !name || line.startsWith(name + ' ')).join(' · ');
}
const fullText = () => String(previous && S.step > previous.step ? S.replay.steps.slice(previous.step + 1, S.step + 1).map((s) => s.label).join(' · ') : frameText() || '');
const names = () => S.replay.players.map((p) => p.name);
const pureFork = FORK && !PLAY && !SANDBOX;                      // a fork plays both seats: nothing is "the other player" there
const pilferMoves = () => (pureFork ? [] : parsePilfer(fullText(), names()));
const displayShots = (state) => [...document.querySelectorAll('.folders .folder')].flatMap((folder, i) => { const e = folder.querySelector('.card'); return e ? [shotOnScreen(e, state.display[i])] : []; });
const BACK = '/card_back.webp', BACK_EG = '/card_back_endgame.webp';        // (endgame cards have a back of their own)
{ for (const u of [BACK, BACK_EG]) { const im = new Image(); im.src = u; } }                         // (loaded before the first flight)
const boxSpots = { key: '', spot: {} };                            // (where each box is: measured while the Control tab is shown, or once with the pane shown for a moment; forgotten when the window or the zoom changes)
function boxPoint(seat) {                                          // the right edge of a player's info box in the sidebar
  const key = innerWidth + 'x' + innerHeight + '|' + scale();
  if (boxSpots.key !== key) { boxSpots.key = key; boxSpots.spot = {}; }
  const find = () => document.querySelector('.pp[data-seat="' + seat + '"]')?.getBoundingClientRect();
  let r = find();
  if (r && r.width) boxSpots.spot[seat] = { x: r.right - 4 * scale(), y: Math.min(innerHeight - 20, Math.max(20, r.top + r.height / 2)) };
  else if (!boxSpots.spot[seat]) {
    // The Log (or Chat) tab is open: the control pane with the info boxes is hidden. The cards still fly to / from the spot where the box would be on the Control tab: the pane is shown
    // for a moment (invisible, no frame is painted in between), the boxes of both seats are measured, and the pane is hidden again. Done once, not for every card (the log is a long list).
    const pane = document.getElementById('paneControl');
    if (pane && pane.hidden) {
      const others = ['paneLog', 'paneChat'].map((id) => document.getElementById(id)).filter((n) => n && !n.hidden);
      others.forEach((n) => { n.hidden = true; }); pane.hidden = false;
      const keep = pane.style.visibility; pane.style.visibility = 'hidden';
      document.querySelectorAll('.pp[data-seat]').forEach((e) => {
        const q = e.getBoundingClientRect();
        if (q.width) boxSpots.spot[e.dataset.seat] = { x: q.right - 4 * scale(), y: Math.min(innerHeight - 20, Math.max(20, q.top + q.height / 2)) };
      });
      pane.style.visibility = keep; pane.hidden = true; others.forEach((n) => { n.hidden = false; });
    }
  }
  return boxSpots.spot[seat] || null;
}
function backWidth() {                                           // the backs are as big as the cards of the display
  const w = document.querySelector('.folders .folder .card')?.getBoundingClientRect().width;
  return w > 20 ? w : 118 * scale();
}
function backGhost(x, y, w, src = BACK) {
  const e = element('cm-card', { left: x - w / 2 + 'px', top: y - w * 503 / 720 + 'px', width: w + 'px', height: w * 503 / 360 + 'px' });
  const im = document.createElement('img'); im.src = src; im.alt = ''; e.append(im); return e;
}
export function beforeRender(st) {
  stop(false); flightEnd = 0;
  // The starting hand is dealt (the followed player's hand goes from nothing to its first cards): the hand stays open afterwards, tray and fan alike; it is the one moment every viewer wants to see, so nobody has to unfold it first.
  const me = shownSeat();
  if (!MINIGAME && !FORK && previous && previous.replay === S.replay && previous.pov === S.pov && S.cardMotionForward && S.step >= previous.step && Number.isInteger(me)
    && (previous.state.players[me]?.hand || []).length === 0 && (st.players[me]?.hand || []).length >= 5 && (S.dockHidden || S.dockSel?.seat !== me || S.dockSel?.kind !== 'hand')) {
    S.dockHidden = false; S.dockSel = { seat: me, kind: 'hand' };
    try { localStorage.setItem('dockHidden', '0'); } catch (e) { /* no storage */ }
  }
  capture = previous && visibleZone() && previous.kind === zoneKind() && previous.replay === S.replay && previous.pov === S.pov && previous.seat === shownSeat() && previous.mode === S.handMode
    && ((S.cardMotionForward && S.step >= previous.step) || (FORK && S.step === previous.step + 1) || (S.step === previous.step && S.phase > previous.phase))
    ? { state: previous.state, hand: cards().map(shot), frameW: frameWidth(), display: [...document.querySelectorAll('.folders .folder')].flatMap((folder, i) => { const e = folder.querySelector('.card'); return e ? [shotOnScreen(e, previous.state.display[i])] : []; }) } : null;
  if (capture) capture.next = st;
  // the other seat's flights (draws, discards, display takes) need no visible hand, only the info boxes
  capture2 = previous && !pureFork && !MINIGAME && previous.replay === S.replay && previous.pov === S.pov
    && ((S.cardMotionForward && S.step >= previous.step) || (FORK && S.step === previous.step + 1) || (S.step === previous.step && S.phase > previous.phase))
    ? { state: previous.state, display: displayShots(previous.state) } : null;
  const forward = previous && previous.replay === S.replay && previous.pov === S.pov && previous.mode === S.handMode
    && ((S.cardMotionForward && S.step >= previous.step) || (FORK && S.step === previous.step + 1) || (S.step === previous.step && S.phase > previous.phase));
  actionCapture = forward && !reduced.matches && !MINIGAME ? captureActionMotion(previous.state, st) : null;
  assocCapture = forward && !reduced.matches ? captureAssoc(previous.state, st) : null;
  tabPrev = forward && !reduced.matches && !MINIGAME ? previous.state : null;
  displayCapture = forward && !reduced.matches && !MINIGAME ? { state: previous.state, display: displayShots(previous.state) } : null;
  buildingCapture = forward && !reduced.matches && !MINIGAME ? previous.state : null;
  const plays = forward && !reduced.matches && !MINIGAME ? playedCards(previous.state, st) : [];
  const gone = forward && !reduced.matches && !MINIGAME ? playedRemoved(previous.state, st) : [];
  playedCapture = plays.length || gone.length ? {
    plays, gone, before: previous.state, hand: visibleHand() ? cards().map(shot) : [], seat: shownSeat(),
    display: displayShots(previous.state), piles: playedShots(),
  } : null;
  if (playedCapture?.plays.length && tabbedLayout()) {
    const seat = playedCapture.plays[0].seat;
    const original = S.zooTab, shown = document.querySelector('#zoos [data-zoo-seat]')?.dataset.zooSeat;
    if (Number(shown) !== seat) {
      tabVisit = { original, seat, replay: S.replay, step: S.step, phase: S.phase };
      S.zooTab = seat;
    }
  }
}
export function setPending() {
  const box = document.getElementById('draftbox');
  if (!box || box.hidden || !box.classList.contains('revealbox')) return;
  const keys = [...box.querySelectorAll('.draftcard.picked[data-key]')].map((c) => c.dataset.key);
  if (keys.length) pending = { keys, step: S.step, seat: shownSeat(), pov: S.pov, replay: S.replay };
}
const standard = (plan, plain) => (S.animations === 'standard' ? plain(plan) : plan);          // (Animations = Only standard)
export function afterRender(st) {
  const old = capture; capture = null;
  const played = playedCapture; playedCapture = null;
  const box = document.getElementById('draftbox'), blocked = box && !box.hidden;
  const targets = cards(), seat = shownSeat();
  let ownPlan = null;
  if (old && !blocked && !reduced.matches && visibleHand()) ownPlan = standard(movementPlan(old.state, st, seat, ownText(), pilferMoves()), plainPlan);
  else if (old && !blocked && !reduced.matches && visibleZone() && zoneKind() === 'endgame') ownPlan = endgamePlan(old.state, st, seat);
  const action = actionCapture; actionCapture = null;
  if (action && !blocked && !reduced.matches) runActionMotion(action, { animate, finish, hide, show, element, deckPoint, scale });
  landings.clear();
  const assoc = assocCapture; assocCapture = null;
  const assocGo = assoc && !blocked && !reduced.matches ? runAssoc(assoc, { animate, finish, hide, show, element, deckPoint, scale, glideEase, projectLanding: (key) => landings.get(key) || 0 }) : null;
  const tabOld = tabPrev; tabPrev = null;
  const tabs = tabOld && !blocked && !reduced.matches && Number.isInteger(seat) && !hides(seat) ? tabPlans(tabOld, st, seat) : null;     // (the zones of the followed player that are not on show: their cards fly to the zone's tab, which blinks)
  const tabShots = displayCapture ? displayCapture.display : [];
  const old2 = capture2; capture2 = null;
  const otherP = old2 && !blocked && !reduced.matches && Number.isInteger(seat) ? standard(otherPlan(old2.state, st, seat, pilferMoves(), fullText(), names()[1 - seat], adaptCounts(old2.state, st, 1 - seat)), plainOther) : null;
  // what a player's part takes (ms at speed 1, counted from the step's start); `by` = when it starts. The followed player's part is its row in the dock (`run`, the same for an open
  // and a folded tray) and then the zones that are not on show (`tabFlights`: the endgame cards dealt with the starting hand come after the cards).
  const doOwn = (by) => {
    let end = by;
    if (ownPlan) end = by + sequenced(by, () => run(ownPlan, old, targets));
    if (tabs) end = Math.max(end, by + sequenced(by, () => tabFlights(tabs, tabShots, end - by)));
    return end;
  };
  const doOther = (by, plan = otherP) => by + sequenced(by, () => runOther(plan, old2, seat, fullText(), names()[1 - seat]));
  // Both players' cards move (the starting hands: the deal, then the discards): one player after the other, the player who plays first (seat 0) first, whoever the move bar follows.
  // Everything of the followed player (the tray's frame included) waits for its turn; the display's first replenish waits for both. When the viewer jumped over steps (a player's
  // point of view skips the other player's deal), the other player's cards are played step by step (`openingSplit`), so a deal and a discard are not netted into one.
  const ownN = (ownPlan ? ownPlan.arrivals.filter((x) => x.kind === 'deck').length + ownPlan.departures.filter((x) => x.kind === 'discard').length : 0) + (tabs ? tabs.count : 0);
  const otherN = otherP ? otherP.deck + otherP.discard + (otherP.egDeck || 0) + (otherP.egDiscard || 0) : 0;
  const split = otherP && old2 ? openingSplit(old2.state, st, seat) : null;
  let handsEnd = 0;
  if (split) {
    const items = split.map((x) => ({ step: x.step, seat: 1 - seat, go: (by) => doOther(by, x.plan) }));
    if (ownN || ownPlan) items.push({ step: ownStep(old2.state, seat), seat, go: doOwn });
    items.sort((a, b) => a.step - b.step || a.seat - b.seat);
    handsEnd = items.reduce((by, it) => it.go(by), 0);
  } else if (!(ownN && otherN) || pilferMoves().length) { if (ownPlan || tabs) doOwn(0); if (otherP) doOther(0); }
  else if (seat === 0) handsEnd = doOther(doOwn(0));
  else handsEnd = doOwn(doOther(0));
  if (played && !blocked && !reduced.matches) runPlayed(played, st);
  else if (tabVisit) stop();
  const dOld = displayCapture; displayCapture = null;
  if (dOld && !blocked && !reduced.matches) sequenced(handsEnd, () => runDisplay(dOld, st));
  const bOld = buildingCapture; buildingCapture = null;
  if (bOld && !blocked && !reduced.matches) runBuildings(bOld, st);
  const shown = (dOld || old2 || old)?.state;
  if (shown && !reduced.matches && (st.display || []).join() !== (shown.display || []).join()) tabCovers();          // (a card left, arrived or slid in the display: whoever moves it, it moves behind the number tabs)
  const p = pending;
  if (p && !blocked) {
    pending = null;
    if (!reduced.matches && visibleHand() && p.replay === S.replay && p.pov === S.pov && p.seat === seat && S.step >= p.step && S.step <= p.step + 1) {
      const keys = new Set(old ? movementPlan(old.state, st, seat, ownText(), pilferMoves()).arrivals.map((x) => x.key) : []);
      p.keys.filter((key) => !keys.has(key)).forEach((key, i) => { const t = targets.find((e) => e.dataset.key === key); if (t) arrive(t, { kind: 'deck' }, i); });
    }
  }
  if (assocGo) assocGo();
  previous = { state: st, step: S.step, phase: S.phase, replay: S.replay, pov: S.pov, seat, kind: zoneKind(), mode: S.handMode, bar: (barHold && barHold.step === S.step ? barHold.keep : [...(document.getElementById('current')?.childNodes || [])]).map((n) => n.cloneNode(true)) };          // (while a search holds the bar on the text before, the step's own text is what the next step holds: two searches in a row, Lagoon's person sponsors)
  S.cardMotionForward = false;
}
// Buildings: a new one glides from the invisible deck to its place on the map, one that is cut down glides back to the deck. The flying piece is a copy of the building's SVG group in
// an overlay svg (placed with the group's screen matrix, so it looks the same under any zoom); the real group is hidden until the copy has landed (a cut-down building's ghost stays hidden).
const SVG_NS = 'http://www.w3.org/2000/svg';
let copies = 0;
// The screen matrix of a building group, in the pixels getBoundingClientRect reports. The page is zoomed with CSS `zoom` on <body> (layout.js), and some browsers (Firefox) leave that zoom out of
// getScreenCTM() for svg content: a copy placed with it would be too small and too near the top left corner. The factor (applied to the scale only: the translation is right) is what the picture's real rectangle says against the one the matrix predicts.
function screenMatrix(g) {
  const ctm = g.getScreenCTM(), img = g.querySelector('image');
  if (!ctm) return null;
  const m = { a: ctm.a, b: ctm.b, c: ctm.c, d: ctm.d, e: ctm.e, f: ctm.f };
  if (!img) return m;
  try {
    const bb = img.getBBox(), own = img.transform.baseVal.numberOfItems ? img.transform.baseVal.consolidate().matrix : null, t = own ? ctm.multiply(own) : ctm;
    const xs = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]].map(([x, y]) => t.a * x + t.c * y + t.e);
    const predicted = Math.max(...xs) - Math.min(...xs), actual = img.getBoundingClientRect().width;
    const k = predicted > 0 && actual > 0 ? actual / predicted : 1;
    if (Math.abs(k - 1) > .03) for (const key of ['a', 'b', 'c', 'd']) m[key] *= k;               // (the translation is already in the real pixels)
  } catch (e) { /* keep the matrix as it is */ }
  return m;
}
// The masks of a building (board.js: the gap between neighbours) span the whole board (3000 x 3000 units), so a copy that moves would be masked and repainted over the area of the board on every frame:
// each mask of the copy is cut down to the box of the building (the mask only matters where the building is).
function fitMasks(k, g) {
  let b;
  try { b = g.getBBox(); } catch (e) { return; }
  if (!b || !b.width) return;
  k.querySelectorAll('mask').forEach((m) => { m.setAttribute('x', b.x - 30); m.setAttribute('y', b.y - 30); m.setAttribute('width', b.width + 60); m.setAttribute('height', b.height + 60); });
}
function runBuildings(old, st) {
  const { added, removed } = buildingChanges(old, st);
  const find = (c, ghost) => document.querySelector('.board g[data-bseat="' + c.seat + '"][data-bid="' + c.id + '"]' + (ghost ? '.cm-leaving' : ':not(.cm-leaving)'));
  // an enclosure that grew (Conference on Australia ...) turns over on the spot into the bigger one instead of flying to the deck while the new one flies out of it; without both groups
  // (a board that is not drawn) it falls back to the flights
  const grown = buildingGrowths(old, st).map((c) => ({ ...c, was: find({ seat: c.seat, id: c.from }, true), now: find({ seat: c.seat, id: c.to }, false) })).filter((c) => c.was && c.now)
    .filter((c, i) => turnOver(c.was, c.now, 1, i, null));
  const paired = (c, k) => grown.some((x) => x.seat === c.seat && x[k] === c.id);
  added.filter((c) => !paired(c, 'to')).forEach((c, i) => { const g = find(c, false); if (g) buildingFlight(g, true, i); });
  removed.filter((c) => !paired(c, 'from')).forEach((c, i) => { const g = find(c, true); if (g) buildingFlight(g, false, i); });
  buildingFlips(old, st).forEach((c, i) => { const g = find(c, false); if (g) buildingTurn(g, c.occupied, i); });
}
// A standard enclosure that fills (an animal moves in) or empties (it is released) turns over on the spot to its other side, with a small lift and a shadow: it turns edge-on on a
// vertical axis through its middle, the sprite is swapped there, and it turns back to flat. A release turns the other way. The real group is hidden for the turn (the sprite it holds is
// already the new side); the copy holds both sides and shows one at a time.
function buildingTurn(g, occupied, index) {
  turnOver(g, g, occupied ? 1 : -1, index, (h) => (occupied ? h.replace('_occupied', '_empty') : h.replace('_empty', '_occupied')));
}
// The turn itself: `wasG` is drawn on the first half (edge-on at 90 degrees), `nowG` on the second. For a fill / release both are the same group, the first side with its sprite swapped
// back (`oldHref`); for an enclosure that grew `wasG` is the invisible ghost of the old enclosure (board.js `cm-leaving`) and `nowG` the new one: the two may differ in size, anchor hex
// and rotation, and each copy keeps its own screen matrix, so only the turn axis is shared: the vertical line through the middle of both pictures together. Returns false when a group has
// no picture or matrix (nothing is animated then).
function turnOver(wasG, nowG, dir, index, oldHref) {
  const parts = [wasG, nowG].map((g) => ({ g, ctm: screenMatrix(g), img: g.querySelector('image') }));
  if (parts.some((p) => !p.ctm || !p.img)) return false;
  const rs = parts.map((p) => p.img.getBoundingClientRect());
  if (rs.some((r) => !r.width)) return false;
  const left = Math.min(rs[0].left, rs[1].left), top = Math.min(rs[0].top, rs[1].top), right = Math.max(rs[0].right, rs[1].right), bottom = Math.max(rs[0].bottom, rs[1].bottom);
  const cx = (left + right) / 2, cy = (top + bottom) / 2, MS = 1000, lift = Math.max(right - left, bottom - top);
  // Four stacked layers (outer svg elements, so transform and opacity can run on the compositor): the shadows of both sides below, then the old and the new side. No filter is animated:
  // the shadow is a flat, dark, blurred copy of the sprite (a static filter) that only moves and fades, and the sides are swapped by the opacity of their own layer, not of a child of one svg.
  const layer = (k, extra) => {
    const o = document.createElementNS(SVG_NS, 'svg');
    o.setAttribute('class', 'cm-building');
    Object.assign(o.style, { position: 'absolute', left: '0', top: '0', width: '1px', height: '1px', overflow: 'visible', transformOrigin: cx + 'px ' + cy + 'px', zIndex: '3', willChange: 'transform, opacity', opacity: '0', ...extra });
    o.append(k); return o;
  };
  const ids = new Map(), copy = ({ g, ctm }, href) => {
    const k = g.cloneNode(true);
    k.removeAttribute('class'); k.removeAttribute('style'); k.removeAttribute('data-bid'); k.removeAttribute('data-bseat'); k.querySelector('.frame')?.remove();
    k.querySelectorAll('[id]').forEach((e) => { const n = e.id + 'k' + (++copies); ids.set(e.id, n); e.id = n; });
    k.querySelectorAll('[mask],[clip-path]').forEach((e) => ['mask', 'clip-path'].forEach((a) => { const m = /url\(#([^)]+)\)/.exec(e.getAttribute(a) || ''); if (m && ids.has(m[1])) e.setAttribute(a, 'url(#' + ids.get(m[1]) + ')'); }));
    fitMasks(k, g);
    k.setAttribute('transform', 'matrix(' + [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f].join(' ') + ')');
    if (href) k.querySelectorAll('image').forEach((im) => im.setAttribute('href', href(im.getAttribute('href') || '')));
    return k;
  };
  const shade = ({ ctm, img }, href) => {               // (the sprite alone: the shadow needs no mask)
    const im = img.cloneNode(true), k = document.createElementNS(SVG_NS, 'g');
    im.querySelector('title')?.remove();
    if (href) im.setAttribute('href', href(im.getAttribute('href') || ''));
    k.setAttribute('transform', 'matrix(' + [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f].join(' ') + ')');
    k.append(im); return k;
  };
  const dark = { filter: 'brightness(0) blur(' + (lift * .04).toFixed(1) + 'px)' };
  const layers = [
    { el: layer(shade(parts[0], oldHref), dark), first: true, shadow: true }, { el: layer(shade(parts[1], null), dark), first: false, shadow: true },
    { el: layer(copy(parts[0], oldHref)), first: true }, { el: layer(copy(parts[1], null)), first: false }];
  layers.forEach((l) => root().append(l.el)); hide(nowG);
  const persp = 'perspective(' + Math.round(lift * 3.5) + 'px) ', ease = (t) => t * t, out = (t) => 1 - (1 - t) * (1 - t);
  const framesOf = ({ first, shadow }) => {
    const frames = [];
    for (let h = 0; h < 2; h++) for (let i = 0; i <= 20; i++) {
      const t = i / 20, u = h ? out(t) : ease(t), tau = (h * 20 + i) / 40, l = Math.sin(Math.PI * tau), a = h ? -90 * dir * (1 - u) : 90 * dir * u;       // (the lift has a curve of its own: no peak at the edge-on moment)
      const shown = (h === 0) === first ? 1 : 0;
      frames.push({ offset: h === 0 && i === 20 ? .4999 : tau, opacity: shadow ? shown * .4 * l : shown,
        transform: persp + 'rotateY(' + a.toFixed(2) + 'deg) scale(' + (1 + .09 * l).toFixed(3) + ')' + (shadow ? ' translateY(' + (lift * .05 * l).toFixed(1) + 'px)' : '') });
    }
    return frames;
  };
  const anims = layers.map((l) => animate(l.el, framesOf(l), MS, index * 130, 'linear'));
  finish(anims[3], () => { layers.forEach((l) => l.el.remove()); show(nowG); });
  return true;
}
function buildingFlight(g, appear, index) {
  const ctm = screenMatrix(g), r = (g.querySelector('image') || g.querySelector('polygon') || g).getBoundingClientRect();     // (not the group: its masks span the whole board)
  if (!ctm || !r.width) return;
  const sc = scale(), d = deckPoint(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = d.x - cx, dy = d.y - cy;
  const o = document.createElementNS(SVG_NS, 'svg');
  o.setAttribute('class', 'cm-building');
  Object.assign(o.style, { position: 'absolute', left: '0', top: '0', width: '1px', height: '1px', overflow: 'visible', transformOrigin: cx + 'px ' + cy + 'px', zIndex: '3', willChange: 'transform, opacity' });
  const k = g.cloneNode(true);
  k.removeAttribute('class'); k.removeAttribute('style'); k.removeAttribute('data-bid'); k.removeAttribute('data-bseat'); k.querySelector('.frame')?.remove();
  const ids = new Map();                                        // (the copy gets ids of its own: the masks of the original are hidden with it and would mask the copy away)
  k.querySelectorAll('[id]').forEach((e) => { const n = e.id + 'k' + (++copies); ids.set(e.id, n); e.id = n; });
  k.querySelectorAll('[mask],[clip-path]').forEach((e) => ['mask', 'clip-path'].forEach((a) => { const m = /url\(#([^)]+)\)/.exec(e.getAttribute(a) || ''); if (m && ids.has(m[1])) e.setAttribute(a, 'url(#' + ids.get(m[1]) + ')'); }));
  fitMasks(k, g);
  k.setAttribute('transform', 'matrix(' + [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f].join(' ') + ')');
  o.append(k); root().append(o); hide(g);
  // A new building first shows itself at the deck (fades in, grows a little) before it sets off; the top of the viewport is where the eye has to catch it, so that part is not rushed.
  const ms = Math.min(1375, Math.max(812, 812 * Math.hypot(dx, dy) / sc / 850)) * (appear ? 1.3 : 1), HOLD = .26;         // (the card flights' 650-1100 ms, 25 % slower: a building is big)
  const frames = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    if (appear && t < HOLD) { const h = t / HOLD; return { offset: t, transform: tr(dx, dy, 0, .45 + .12 * h * h * (3 - 2 * h)), opacity: Math.min(1, h / .6) }; }
    const w = appear ? (t - HOLD) / (1 - HOLD) : t, u = glideEase(w), v = appear ? 1 - u : u;
    return { offset: t, transform: tr(dx * v, dy * v, 0, appear ? 1 - .43 * v : 1 - .55 * v), opacity: appear ? 1 : t > .85 ? 1 - (t - .85) / .15 : 1 };
  });
  finish(animate(o, frames, ms, index * 130, 'linear'), () => { o.remove(); if (appear) show(g); });
}
// The display: a card that leaves it through a wave or a natural discard glides into the invisible deck, a card put in (replenish) glides out of it into its slot.
// The number tabs of the display folders lie on top of the cards. The flights run in the overlay, above the whole page, so a card would cross the tab and then slip behind it when the real card appears.
// For the length of the display's flights each tab is drawn again in the overlay, above the flying cards: the cards are dealt behind the tabs from the start.
function tabCovers() {
  const length = flightEnd;                                   // (every flight of this render: ms at speed 1 from the step's start)
  if (length <= 0) return;
  document.querySelectorAll('.folders .folder .folnum').forEach((t) => {
    const r = t.getBoundingClientRect(), cs = getComputedStyle(t);
    if (!r.width || !t.offsetWidth) return;
    const k = r.width / t.offsetWidth;                          // (the real zoom of this tab: the page zoom and the extra scale of the display together; not `scale()`)
    const e = element('cm-tab', { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', background: cs.backgroundColor, border: parseFloat(cs.borderTopWidth) * k + 'px solid ' + cs.borderTopColor, borderRadius: parseFloat(cs.borderTopLeftRadius) * k + 'px', color: cs.color, fontFamily: cs.fontFamily, fontWeight: cs.fontWeight, fontSize: parseFloat(cs.fontSize) * k + 'px', lineHeight: '1', letterSpacing: '0', boxSizing: 'border-box' });          // (the font shorthand of a computed style can be empty: every property is set by itself)
    e.textContent = t.textContent;
    finish(animate(e, [{ opacity: 1 }, { opacity: 1 }], length, 0, 'linear'), () => e.remove());
  });
}
function runDisplay(old, st) {
  const changes = displayChanges(old.state, st), { added } = changes, d = deckPoint(), sc = scale(), text = fullText();
  const next = waveNext(text);
  if (next && changes.leaving.length && runWave(old, changes, next)) return;
  const given = changes.leaving.map((key) => ({ key, seat: givenTo(key, text) })).filter((x) => x.seat >= 0), taken = [...changes.taken, ...given.map((x) => x.key)];
  let leaving = changes.leaving.filter((key) => !given.some((x) => x.key === key));
  // Shark Attack (Animations = All; Only standard keeps the plain discard below): the cards are eaten where they lie (shark-motion.js), the rest of the display waits for it
  let eatenFor = 0;
  if (S.animations === 'all' && SHARK_ATTACK.test(text) && leaving.length) {
    const folders = [...document.querySelectorAll('.folders .folder')].map((f) => f.getBoundingClientRect()).filter((r) => r.width);
    const eaten = leaving.map((key) => old.display.find((c) => c.key === key)).filter(Boolean);
    if (folders.length && eaten.length === leaving.length) {
      eatenFor = runShark({ animate, element, finish }, eaten, { x0: Math.min(...folders.map((r) => r.left)), x1: Math.max(...folders.map((r) => r.right)) });
      leaving = [];
    }
  }
  // discarded by the display's own rules (wave, natural discard) -> the deck; "given" cards (the state has them in the discard pile, the log gives them to a player) -> the player's info box
  given.forEach((x, i) => { const g = old.display.find((c) => c.key === x.key), to = boxPoint(x.seat); if (g && to) displayTake(g, to, i * 145); });
  leaving.forEach((key, i) => {
    const g = old.display.find((c) => c.key === key); if (!g) return;
    const e = ghost(g), dx = d.x - g.x, dy = d.y - g.y, tilt = i % 2 ? -9 : 9, ms = Math.min(800, Math.max(560, 320 + Math.hypot(dx, dy) / sc * .45));
    finish(animate(e, [{ transform: tr(0, 0, g.angle), opacity: 1 }, { transform: tr(0, 6 * sc, 0), opacity: 1, offset: .2 }, { transform: tr(dx, dy, tilt, .5), opacity: 1, offset: .92 }, { transform: tr(dx, dy, tilt, .5), opacity: 0 }], ms, i * 100, 'ease-in-out'), () => e.remove());
  });
  const nodes = [...document.querySelectorAll('.folders .folder')].map((f) => f.querySelector('.card')), rest = [...added];
  // the cards behind a gap slide left, like dominoes: each starts 70 ms after the one on its left (left to right), after the leaving / taken cards have gone
  const t0 = eatenFor ? eatenFor : leaving.length || taken.length ? 320 : 0;
  let rank = 0;
  (st.display || []).forEach((key, i) => {
    const node = nodes[i], was = old.display.find((c) => c.key === key);
    if (!node || !was || added.includes(key)) return;
    if (old.state.display.indexOf(key) === i) return;          // (the card kept its slot: if it is somewhere else on the screen, the board around it moved (a bar above the display grew or shrank), which is no slide and must not ripple through the cards)
    const to = shotOnScreen(node, key), dx = was.x - to.x, dy = was.y - to.y;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    const e = ghost(to), ms = Math.round(420 + 110 * Math.abs(dx) / Math.max(1, to.w));
    hide(node);
    finish(animate(e, [{ transform: tr(dx, dy, 0, 1) }, { transform: tr() }], ms, t0 + rank++ * 70, 'cubic-bezier(.25,.8,.25,1)'), () => { show(node); e.remove(); });
  });
  const wait = t0 + (rank ? 480 + (rank - 1) * 70 : 0);
  let n = 0;
  (st.display || []).forEach((key, i) => {
    const j = rest.indexOf(key), node = nodes[i];
    if (j < 0 || !node) return;
    rest.splice(j, 1);
    const to = shotOnScreen(node, key), e = ghost(to), dx = d.x - to.x, dy = d.y - to.y, tilt = n % 2 ? -9 : 9, ms = Math.min(800, Math.max(560, 320 + Math.hypot(dx, dy) / sc * .45));
    hide(node);
    finish(animate(e, [{ transform: tr(dx, dy, tilt, .5), opacity: 0 }, { opacity: 1, offset: .1 }, { transform: tr(0, 6 * sc, 0), opacity: 1, offset: .78 }, { transform: tr() }], ms, wait + n++ * 120, EASE), () => { show(node); e.remove(); });
  });
}
// A Wave (Marine Worlds) removes the first cards of the display; the log has the removal and "The display is replenished" as two steps of one move. The wave plays both as one motion on the removal step,
// then the viewer moves on to the replenish step by itself (the board is already drawn the way the wave left it). Returns the state after the replenish step, or null for any other step (a natural discard, a fork, a live game).
const WAVE_ANIMATION = false;                                           // (switched off for now, to be finetuned later: a wave is animated like a normal discard from the display)
function waveNext(text) {
  if (!WAVE_ANIMATION || FORK || PLAY || SANDBOX || MINIGAME || !/ due to Wave\b/i.test(text)) return null;
  const a = S.replay.steps[S.step], b = S.replay.steps[S.step + 1];
  return a && b && a.move_id === b.move_id && /^The display is replenished/i.test(String(b.label || '')) && b.state && Array.isArray(b.state.display) ? b.state : null;
}
// The wave itself (wave.js) rolls right to left through the display, in front of the cards that sit still and under the cards it carries (they ride it, like the boats of the print):
//   cards that leave:    picked up when the foot of the wave reaches them, thrown off over the crest to the left, with spray
//   cards that stay:     picked up the same way, carried to their new place and set down there with a small bounce
//   cards that are new:  wait under the water at their place, rise out of it when the wave has passed
const SURF = { lift: .5, tilt: 18, discLift: .9, discSpin: -110, extra: 420, land: .09 };
const inOut = (u) => (u < .5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2), easeOut = (u) => 1 - (1 - u) ** 3;
function runWave(old, changes, after) {
  const folders = [...document.querySelectorAll('.folders .folder')], sample = folders.map((f) => f.querySelector('.card:not(.card-gone)')).find(Boolean), fin = after.display;
  if (!sample || folders.length !== fin.length) return false;
  const sr = sample.getBoundingClientRect(), fr = folders.map((f) => f.getBoundingClientRect()), home = fr[folders.findIndex((f) => f.contains(sample))];
  const ox = sr.left + sr.width / 2 - (home.left + home.width / 2), oy = sr.top + sr.height / 2 - (home.top + home.height / 2);
  const slots = fr.map((r) => ({ x: r.left + r.width / 2 + ox, y: r.top + r.height / 2 + oy, w: sr.width, h: sr.height }));
  if (slots.some((q) => Math.abs(q.y - slots[0].y) > q.h * .3)) return false;                       // (the display is not one row)
  const was = new Map(old.display.map((g) => [g.key, g]));
  const gone = changes.leaving.map((k) => was.get(k)).filter(Boolean), stay = [], fresh = [];
  fin.forEach((key, i) => { const g = was.get(key); if (g) stay.push({ key, g, to: slots[i] }); else if (key) fresh.push({ key, to: slots[i] }); });
  if (stay.length + gone.length !== old.display.length || !gone.length) return false;                 // (something else happens to the display as well)
  const Hc = slots[0].h, wc = slots[0].w, left = Math.min(...slots.map((q) => q.x - q.w / 2)), right = Math.max(...slots.map((q) => q.x + q.w / 2)), pad = wc * .3;
  const Hw = Hc * 2.2, CH = Hw * 1.2, ground = slots[0].y + Hc / 2 + Hc * .28;
  const wave = createWave(root(), { left: left - pad, width: right - left + 2 * pad, height: CH, top: ground - CH }, Hw), cx0 = left - pad, cy0 = ground - CH, T = wave.T;
  wave.canvas.style.webkitMaskImage = wave.canvas.style.maskImage = 'linear-gradient(to bottom,#000 86%,transparent)';
  folders.forEach((f) => f.querySelectorAll('.card').forEach(hide));                                    // (the real cards stay hidden: the copies carry them; the viewer draws the next step when the wave is done)
  let end = T + 200;
  const run = (e, frames, ms, delay) => { end = Math.max(end, delay + ms); return animate(e, frames, ms, delay, 'linear'); };
  const pick = (g) => Math.max(0, wave.timeAt(g.x - cx0 + wc * .5, wave.lead) - 140);                    // (when the foot of the wave reaches the card's right edge)
  gone.forEach((g) => {
    const e = ghost(g), t0 = pick(g), dist = g.x - cx0 + wc / 2 + 30, D = 720;
    e.style.zIndex = '4';
    run(e, Array.from({ length: 31 }, (_, j) => { const u = j / 30, k = inOut(u) * (.4 + .6 * u); return { offset: u, transform: tr(-dist * Math.min(1, k * 1.05), -Hc * SURF.discLift * Math.sin(Math.min(1, u * 1.1) * Math.PI * .9), SURF.discSpin * u * u), opacity: u > .85 ? 1 - (u - .85) / .15 : 1 }; }), D, t0);
    wave.burst(t0 + 100, g.x - cx0 + wc * .25, g.y - g.h / 2 - cy0, 12, 1); wave.burst(t0 + 200, g.x - cx0, g.y - g.h / 2 - cy0, 14, 1.15);
  });
  stay.forEach(({ g, to }, n) => {
    const e = ghost({ ...g, x: to.x, y: to.y, w: to.w, h: to.h, angle: 0 }), t0 = pick(g), dx = g.x - to.x, dy = g.y - to.y, D = Math.max(700, Math.abs(dx) / wave.vAvg + SURF.extra);
    e.style.zIndex = String(5 + n);
    run(e, Array.from({ length: 41 }, (_, j) => {
      const u = j / 40, k = inOut(u), arc = Math.sin(u * Math.PI), w = u > .82 ? Math.sin((u - .82) / .18 * Math.PI * 2) * (1 - (u - .82) / .18) : 0;
      return { offset: u, transform: tr(dx * (1 - k), dy * (1 - k) - Hc * SURF.lift * arc + w * SURF.land * Hc, -SURF.tilt * Math.sin(u * Math.PI) * (1 - u * .4) + w * 3) };
    }), D, t0);
    wave.burst(t0 + 80, g.x - cx0 + wc * .3, g.y - g.h / 2 - cy0, 6, .9);
  });
  fresh.forEach(({ key, to }, j) => {
    const image = snakeSafe(info(key).image), e = ghost({ ...to, angle: 0, image }), cx = to.x - cx0, sg = j % 2 ? 6 : -6;
    const ts = wave.timeAt(cx - wc * .5 - 6, wave.lead), te = Math.max(ts + 600, wave.timeAt(cx, wave.Ww * .95) + 420), A = tr(0, Hc * .3, sg);
    e.style.zIndex = '1';                                                                              // (under the wave, it is uncovered as the wave moves on)
    const fr = [{ offset: 0, opacity: 0, transform: A }, { offset: ts / te, opacity: 0, transform: A }, { offset: Math.min(.999, (ts + 1) / te), opacity: 1, transform: A }];
    for (let k = 1; k <= 26; k++) { const u = k / 26, v = easeOut(u); fr.push({ offset: Math.min(1, (ts + 1 + (te - ts - 1) * u) / te), opacity: 1, transform: tr(0, Hc * .3 * (1 - v) - Math.sin(u * Math.PI) * 9, sg * (1 - v)) }); }
    run(e, fr, te, 0);
  });
  // the clock of the wave: the same virtual time as the cards' animations (speed settings and pauses are already in it)
  const total = end + 300, clk = animate(wave.canvas, [{ opacity: 1 }, { opacity: 1 }], total, 0, 'linear'), step = S.step;
  wave.run(() => (clk.playState === 'idle' ? null : (clk.currentTime == null ? 0 : clk.currentTime / (clk.effect.getTiming().duration) * total)));
  finish(clk, () => { if (S.step === step && !S.results) import('./playback.js').then((m) => { if (S.step === step && !S.results) m.go(step + 1, 0, false); }); });
  return true;
}
function playedShots() {
  return [...document.querySelectorAll('#zoos .played[data-played-seat]')].flatMap((block) => [...block.querySelectorAll('.card[data-key]')].map((node) => {
    const r = node.getBoundingClientRect();
    return { ...shot(node), w: r.width, h: r.height, seat: Number(block.dataset.playedSeat) };
  }));
}
// The "Cards N" chip of a board whose played-cards drawer is closed (zoo.js `playedDrawer`).
const drawerChip = (seat) => document.querySelector('#zoos [data-zoo-seat="' + seat + '"] .drbar .drtab:not(.drexp)');
// The number in the chip stays at the old count until a card arrives (+1) / leaves (-1), then shows the new count and pops. `step` counts the cards of this seat so far (a second card arriving: 2).
const counted = new WeakMap();
function chipCount(seat, before, step, at, pop) {
  const chip = drawerChip(seat), b = chip && chip.querySelector('b');
  if (!b || !before) return;
  const base = before.animals.length + before.sponsors.length;
  if (!counted.has(b)) { counted.set(b, 0); b.textContent = String(base); }
  const n = counted.get(b) + Math.sign(step);
  counted.set(b, n);
  const text = String(Math.max(0, base + n)), a = animate(b, [{ opacity: 1 }, { opacity: 1 }], 1, at);
  const go = () => { a.cancel(); if (!b.isConnected) return; b.textContent = text; if (pop) popNumber(b); };
  a.finished.then(go, go);
}
function popNumber(b) {
  const lit = (s, f) => ({ transform: 'scale(' + s + ')', filter: 'brightness(' + f + ') drop-shadow(0 0 7px #fff)' });
  animate(b, [{ transform: 'scale(1)', filter: 'brightness(1)' }, { ...lit(1.5, 1.8), offset: .4 }, { transform: 'scale(1)', filter: 'brightness(1)' }], 600, 0, 'ease-in-out');          // (one single pulse)
}
function runPlayed(old, st) {
  const flights = [], sc = scale();
  let longest = 0;
  for (const [i, p] of old.plays.entries()) {
    const board = document.querySelector('#zoos [data-zoo-seat="' + p.seat + '"]');
    const target = document.querySelector('#zoos .played[data-played-seat="' + p.seat + '"] .card[data-key="' + p.key + '"]');
    const closed = playedMode() === 'drawer' && !S.drawerSeats[p.seat];
    if (!target && !closed) {                               // the played cards live in the hand dock and are not on screen: its round button blinks, nothing flies
      const disc = playedMode() === 'tray' && document.querySelector('#dock .traydisc[data-kind="played"][data-seat="' + p.seat + '"]');
      if (disc) blinkTab(disc, i * 140);
      continue;
    }
    let from = p.seat === old.seat ? (p.source === 'display' ? old.display.find((g) => g.key === p.key) : old.hand.find((g) => g.key === p.key)) : null;
    const emerge = !from;
    if (!from) {
      const point = boxPoint(p.seat), image = target?.querySelector('img')?.src || snakeSafe(info(p.key).image);
      if (!point || !image) continue;
      const w = backWidth(); from = { ...point, w, h: w * 503 / 360, angle: 0, image };
    }
    let to;
    if (closed) {                                           // the drawer is closed: the card flies to its "Cards N" chip on the board's top edge (the number counts up when the card has landed)
      const chip = drawerChip(p.seat);
      if (!chip) continue;
      const r = chip.getBoundingClientRect(), w = r.width * .7;
      to = { x: r.left + r.width / 2, y: r.top + r.height / 2, w, h: w * 503 / 360 };
    } else {
      const r = target.getBoundingClientRect();
      to = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
      hide(target);
    }
    const dx = to.x - from.x, dy = to.y - from.y;
    const ms = Math.min(1500, Math.max(650, 650 * Math.hypot(dx, dy) / sc / 850)), delay = i * 140;
    longest = Math.max(longest, delay + ms);
    const e = ghost(from); e.dataset.playedKey = p.key; e.dataset.playedSeat = p.seat;
    const frames = Array.from({ length: 41 }, (_, j) => {
      const t = j / 40, u = glideEase(t), sx = 1 + (to.w / from.w - 1) * u, sy = 1 + (to.h / from.h - 1) * u;
      return { offset: t, transform: `translate(${dx * u}px,${dy * u}px) rotate(${(from.angle || 0) * (1 - u)}deg) scale(${sx},${sy})`, opacity: (emerge ? Math.min(1, t / .16) : 1) * (closed ? Math.max(0, Math.min(1, (1 - t) / .18)) : 1) };
    });
    const a = animate(e, frames, ms, delay, 'linear');
    finish(a, () => { if (target) show(target); e.remove(); });
    flights.push(a.finished);
    if (closed) chipCount(p.seat, old.before.players[p.seat], 1, delay + ms * .9, true);
  }
  const leaving = {};
  for (const [i, p] of (old.gone || []).entries()) {         // a card leaves the played cards (release, expedition) while the drawer is closed: it comes out of the chip and glides to the invisible deck
    if (playedMode() !== 'drawer' || S.drawerSeats[p.seat]) continue;
    const chip = drawerChip(p.seat), image = snakeSafe(info(p.key).image);
    if (!chip || !image) continue;
    const r = chip.getBoundingClientRect(), w = r.width * .7, from = { x: r.left + r.width / 2, y: r.top + r.height / 2, w, h: w * 503 / 360, angle: 0, image };
    const d = deckPoint(), dx = d.x - from.x, dy = d.y - from.y, ms = Math.min(1100, Math.max(800, 380 + Math.hypot(dx, dy) / sc * .5)), delay = i * 140;
    const e = ghost(from);
    const frames = [{ transform: tr(0, 0, 0, .6), opacity: 0 }, { transform: tr(0, 0, 0, 1), opacity: 1, offset: .1 }, { transform: tr(dx * .12, dy * .12 - 8 * sc, 4, 1), opacity: 1, offset: .2 }, { transform: tr(dx * .9, dy * .9, -5, .55), opacity: .85, offset: .85 }, { transform: tr(dx, dy, 0, .45), opacity: 0 }];
    finish(animate(e, frames, ms, delay, 'cubic-bezier(.35,.05,.55,1)'), () => e.remove());
    bubbleTrail(from, d, ms, delay, sc);
    leaving[p.seat] = (leaving[p.seat] || 0) + 1;
    chipCount(p.seat, old.before.players[p.seat], -leaving[p.seat], delay, true);
    longest = Math.max(longest, delay + ms);
  }
  if (longest) {
    // Use the fitted final DOM once. Existing cards move/resize on the SAME clock as the incoming flight;
    // no separate 260 ms adjustment, no intermediate card-size write or second pile rebuild.
    for (const block of document.querySelectorAll('#zoos .played[data-played-seat]')) {
      const seat = Number(block.dataset.playedSeat);
      if (!old.plays.some((p) => p.seat === seat)) continue;
      for (const node of block.querySelectorAll('.card[data-key]')) {
        const from = old.piles.find((g) => g.seat === seat && g.key === node.dataset.key);
        if (!from) continue;
        const r = node.getBoundingClientRect(), dx = from.x - r.left - r.width / 2, dy = from.y - r.top - r.height / 2;
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(from.w - r.width) < .5) continue;
        const a = animate(node, [{ transform: `translate(${dx / sc}px,${dy / sc}px) scale(${from.w / r.width},${from.h / r.height})` }, { transform: 'none' }], longest, 0, 'cubic-bezier(.65,0,.35,1)');
        finish(a, () => a.cancel());
      }
    }
    // A played card leaves the visible hand, which closes its gap smoothly too.
    if (old.plays.some((p) => p.seat === old.seat && p.source === 'hand')) for (const node of cards()) {
      const from = old.hand.find((g) => g.key === node.dataset.key);
      if (!from) continue;
      const to = shot(node);
      if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) + Math.abs(from.angle - to.angle) < .5) continue;
      const e = ghost(to); hide(node);
      finish(animate(e, [{ transform: tr(from.x - to.x, from.y - to.y, from.angle) }, { transform: tr(0, 0, to.angle) }], longest), () => { show(node); e.remove(); });
    }
  }
  const visit = tabVisit;
  if (visit) Promise.all(flights).then(() => {
    if (tabVisit !== visit) return;
    // Deliberately one wall-clock second after every played-card flight has landed.
    tabReturnTimer = setTimeout(() => {
      tabReturnTimer = 0;
      if (tabVisit !== visit) return;
      tabVisit = null;
      if (S.replay !== visit.replay || S.step !== visit.step || S.phase !== visit.phase || !tabbedLayout() || S.zooTab !== visit.seat) return;
      S.zooTab = visit.original; S.lastBoard = null; render();
    }, 1000);
  }, () => {});
}
// The other seat. Display takes: the public card glides to the right edge of the player's info box (same glide as the followed player's display take, at the same speed per distance,
// the card keeps its size until the last part of the flight, where it shrinks and fades). Deck draws and discards: card backs only, between the invisible deck and the info box.
// A public card of the display glides to the right edge of a player's info box and shrinks / fades there.
function displayTake(g, to, delay = 0) {
  const sc = scale(), e = ghost(g), dx = to.x - g.x, dy = to.y - g.y, ms = Math.min(1500, Math.max(650, 650 * Math.hypot(dx, dy) / sc / 850));
  const frames = Array.from({ length: 31 }, (_, k) => { const t = k / 30, u = glideEase(t), v = Math.max(0, (t - .76) / .24); return { offset: t, transform: tr(dx * u, dy * u, 3 * u ** 4, 1 - .6 * v), opacity: t > .86 ? 1 - (t - .86) / .14 : 1 }; });
  finish(animate(e, frames, ms, delay, 'linear'), () => e.remove());
}
// Which seat a card that left the display was given to: the log line "<player> <verb> <card> from the display" (takes, snaps, digs ...); -1 for a card that was really discarded (a wave, the natural discard).
const SHARK_ATTACK = /\bshark ?attack\b/i;                              // (replay: "X discards A for the Shark Attack effect", live: "X removes A from the display (shark attack)", fork: "X shark Attack 2, cards ...")
function givenTo(key, text) {
  const nm = [String(info(key).name).toLowerCase(), cardName(key).toLowerCase()];
  for (const line of String(text || '').split(/ · |\n/)) {
    const l = line.trim(), low = l.toLowerCase();
    if (!/ from the display\b/.test(low) || SHARK_ATTACK.test(low) || !nm.some((n) => low.includes(n))) continue;          // (a Shark Attack removes the card, it goes to nobody)
    const seat = names().findIndex((p) => l.startsWith(p + ' '));
    if (seat >= 0) return seat;
  }
  return -1;
}
// A round button of the dock (the cards / the endgame cards / the played cards tab) blinks briefly: something went into or out of the zone it stands for.
function blinkTab(btn, delay = 0) {
  finish(animate(btn, [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.18)', filter: 'brightness(1.7) drop-shadow(0 0 8px #fff)', offset: .3 }, { transform: 'scale(1)', filter: 'brightness(1)', offset: .55 }, { transform: 'scale(1.12)', filter: 'brightness(1.5) drop-shadow(0 0 6px #fff)', offset: .75 }, { transform: 'scale(1)', filter: 'brightness(1)' }], 800, delay, 'ease-in-out'), () => {});
}
const zoneButton = (seat, kind) => document.querySelector('#dock .traydisc[data-kind="' + kind + '"][data-seat="' + seat + '"], #dock .dockbtn[data-kind="' + kind + '"][data-seat="' + seat + '"]');
// The endgame cards an Adapt of `seat` took and gave in this step, as counts for a hidden seat ({ out, in }; a card drawn and discarded again is neither), or null (the change of the count is used)
function adaptCounts(before, after, seat) {
  const prev = S.replay?.steps[S.step - 1], cur = S.replay?.steps[S.step], ad = cur?.adapt;
  if (!ad || ad.seat !== seat || !ad.discarded || !prev || (previous && previous.step !== S.step - 1)) return null;
  const fresh = ad.drawn || [], held = (ad.cards || []).filter((k) => !fresh.includes(k)), gone = ad.discarded;
  return { out: gone.filter((k) => held.includes(k)).length, in: fresh.filter((k) => !gone.includes(k)).length };
}
// The zone of the followed player that is not on show (the other tab is open, or the tray / fan is folded): the cards that were drawn fly from the invisible deck to that zone's button, the ones that were discarded
// from the button to the deck; the button blinks as each lands. Nothing is added to a row on screen and the tab is not switched.
function tabPlans(old, st, seat) {
  const shows = visibleZone() ? zoneKind() : '', all = { hand: standard(movementPlan(old, st, seat, ownText(), pilferMoves()), plainPlan), endgame: endgamePlan(old, st, seat) }, zones = [];
  for (const kind of ['hand', 'endgame']) {
    if (kind === shows) continue;
    const plan = all[kind];
    if (plan.arrivals.length || plan.departures.length) zones.push({ kind, plan, seat });
  }
  return zones.length ? { zones, count: zones.reduce((n, z) => n + z.plan.arrivals.length + z.plan.departures.length, 0) } : null;
}
// `lead`: when the open row's own flights are over (ms at speed 1): the endgame zone's flights start then (the starting hand: the cards first, then the endgame cards). Returns how long it all takes.
function tabFlights(tabs, shots = [], lead = 0) {
  const sc = scale(), d = deckPoint(), w = backWidth();
  let end = 0;
  for (const { kind, plan, seat } of tabs.zones) {
    const btn = zoneButton(seat, kind), r = btn?.getBoundingClientRect();
    if (!btn || !r.width) continue;
    const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 }, start = kind === 'endgame' ? Math.max(lead, end ? end + 150 : 0) : 0;
    const fly = (key, i, at, out, source) => {
      const g = source === 'display' ? shots.find((c) => c.key === key) : null;          // (a card taken from the display starts where it lay)
      const image = snakeSafe(info(key).image), from = out ? to : g ? { x: g.x, y: g.y } : d, goal = out ? d : to, dx = goal.x - from.x, dy = goal.y - from.y, tilt = i % 2 ? -9 : 9;
      const ms = Math.min(800, Math.max(560, 320 + Math.hypot(dx, dy) / sc * .45)), delay = at + i * 100, gw = g ? g.w : w, k = r.width / gw;
      const e = ghost({ x: from.x, y: from.y, w: gw, h: gw * 503 / 360, angle: 0, image });
      const frames = out
        ? [{ transform: tr(0, 0, 0, k), opacity: 0 }, { transform: tr(dx * .06, dy * .06, 0, 1), opacity: 1, offset: .1 }, { transform: tr(dx, dy, tilt, 1), opacity: 1, offset: .92 }, { transform: tr(dx, dy, tilt, 1), opacity: 0 }]
        : [{ transform: tr(0, 0, tilt, 1), opacity: 0 }, { opacity: 1, offset: .1 }, { transform: tr(dx * .86, dy * .86, 0, 1), opacity: 1, offset: .78 }, { transform: tr(dx, dy, 0, k * .8), opacity: 0 }];          // (the card keeps the size of a card of the display until it is close to the button)
      finish(animate(e, frames, ms, delay, 'ease-in-out'), () => e.remove());
      blinkTab(btn, delay + ms * (out ? .1 : .78));
      end = Math.max(end, delay + ms);
      return delay + ms;
    };
    let gone = start;
    plan.departures.forEach((p, i) => { gone = Math.max(gone, fly(p.key, i, start, true)); });
    plan.arrivals.forEach((p, i) => fly(p.key, i, plan.after && plan.departures.length ? gone : start, false, p.kind));
  }
  return end;
}
// The viewer jumped over steps at the start of the game (a player's point of view skips the other player's deal: the step after one's own deal is the discard of both): the other player's
// hand is played step by step, one part per step that changed it ({ step, plan } for runOther), so the deal of 8 and the discard of 4 are not netted into "4 cards drawn". null = nothing to split.
function openingSplit(before, after, seat) {
  if (!previous || S.step - previous.step < 2 || before.phase !== 'setup' || !S.replay?.steps) return null;
  const o = 1 - seat, n = (st, k) => ((st.players[o] || {})[k] || []).length;
  const states = [before, ...S.replay.steps.slice(previous.step + 1, S.step).map((x) => x.state), after], out = [];
  for (let i = 1; i < states.length; i++) {
    const dh = n(states[i], 'hand') - n(states[i - 1], 'hand'), de = n(states[i], 'endgame_hand') - n(states[i - 1], 'endgame_hand');
    if (dh || de) out.push({ step: previous.step + i, plan: { display: [], deck: Math.max(0, dh), targeted: 0, discard: Math.max(0, -dh), sun: 0, glide: 0, pouch: 0, projects: [], egDeck: Math.max(0, de), egDiscard: Math.max(0, -de) } });
  }
  return out.length > 1 ? out : null;
}
// the step (of the ones jumped over) in which the followed player's own cards changed
function ownStep(before, seat) {
  const key = (st) => { const p = st.players[seat] || {}; return (p.hand || []).join() + '|' + (p.endgame_hand || []).join(); };
  let last = key(before);
  for (let i = previous.step + 1; i <= S.step; i++) { const k = key(S.replay.steps[i].state); if (k !== last) return i; last = k; }
  return S.step;
}

function runOther(plan, old, seat, text = '', name = '') {
  const o = 1 - seat, to = boxPoint(o), deck = deckPoint(), sc = scale();
  if (!to) return;
  let i = 0;
  for (const key of plan.display) {
    const g = old.display.find((c) => c.key === key); if (!g) continue;
    displayTake(g, to, i++ * 145);
  }
  // a project played by the other seat: from the display like ours, from the hand it flies out of the info box (the box is that player's hand)
  const w = backWidth();
  (plan.projects || []).forEach((p, n) => {
    const strip = document.querySelector('.projstrip[data-key="' + p.key + '"]'), src = strip?.querySelector('img')?.src;
    const g = p.source === 'display' ? old.display.find((c) => c.key === p.key) : { x: to.x - w / 2, y: to.y, w, h: w * 503 / 360, angle: 0, key: p.key, image: src && src.replace('/project_strips/', '/cards/') };
    playProject(p, n, g, p.source === 'hand');
  });
  const back = (from, goal, n, fadeIn, src = BACK, late = 0) => {
    for (let k = 0; k < n; k++, i++) {
      const e = backGhost(from.x, from.y, w, src), dx = goal.x - from.x, dy = goal.y - from.y, tilt = k % 2 ? -9 : 9, ms = Math.min(800, Math.max(560, 320 + Math.hypot(dx, dy) / sc * .45));
      const s0 = fadeIn ? .55 : 1, s1 = fadeIn ? 1 : .55;
      finish(animate(e, [{ transform: tr(0, 0, tilt, s0), opacity: 0 }, ...(fadeIn ? [] : [{ transform: tr(0, 0, tilt, s0), opacity: 1, offset: .02 }]), { transform: tr(dx * .5, dy * .5 - 14 * sc, tilt * .3, (s0 + s1) / 2 + .1), opacity: 1, offset: .5 }, { transform: tr(dx, dy, 0, fadeIn ? .55 : s1), opacity: 0 }], ms, late + i * 100, 'ease-in-out'), () => e.remove());
    }
  };
  if (plan.targeted) {                                            // a targeted draw is public: the card is turned face-up and glides to the info box
    const want = targetedNames(text, name).map((n) => n.trim().toLowerCase()), key = Object.keys(S.replay.cards || {}).find((k) => want.includes(String(info(k).name).toLowerCase()) || want.includes(cardName(k).toLowerCase()));
    const image = key && info(key).image;
    searchFlight({ front: image ? snakeSafe(image) : null, goal: { x: to.x, y: to.y, w }, backGoal: true });
  }
  back(deck, to, plan.deck, false);
  back(to, deck, plan.discard, true);
  // endgame cards (other back): the discarded ones go first, the drawn ones follow once those are gone (Adapt)
  back(to, deck, plan.egDiscard || 0, true, BACK_EG);
  back(deck, to, plan.egDeck || 0, false, BACK_EG, plan.egDiscard ? 900 : 0);
  // sunbathing: a ray from the invisible deck to the info box, the backs are beamed up along it
  if (plan.sun) {
    const ray = sunRay(deck, to, 1000 + (plan.sun - 1) * 140);
    for (let k = 0; k < plan.sun; k++, i++) {
      const e = backGhost(to.x, to.y, w), dx = deck.x - to.x, dy = deck.y - to.y;
      finish(animate(e, [{ transform: tr(0, 0, 0, 1), opacity: 1, filter: 'brightness(1)' }, { transform: tr(dx * .08, dy * .08, -4, 1), filter: 'brightness(1.3)', opacity: 1, offset: .2 }, { transform: tr(dx * .95, dy * .95, -10, .35), opacity: 0, filter: 'brightness(1.5)' }], 1000, k * 140, 'ease-in'), () => e.remove());
    }
    void ray;
  }
  // gliding: the backs rise to the invisible deck in a trail of bubbles
  for (let k = 0; k < plan.glide; k++, i++) glideBack(backGhost(to.x, to.y, w), to, deck, k * 145, sc);
  // pouching: the backs fly out of the info box and are tucked under the source (public: the animal / sponsor card, or the model of the map)
  if (plan.pouch) {
    const h = w * 503 / 360, from = { x: to.x, y: to.y, w, h, angle: 0 }, stage = tuckStage(from, plan.pouchSource || null, o, plan.pouch, true);
    for (let k = 0; k < plan.pouch; k++, i++) {
      const e = backGhost(to.x, to.y, w), f = stage.flight(from, k, k * TUCK_GAP);
      e.style.zIndex = '4';
      finish(animate(e, f.frames, f.duration, k * TUCK_GAP, 'linear'), () => e.remove());
    }
  }
}
// the ray of the sun: narrow at the invisible deck, wide at the card, held for the whole animation
function sunRay(deck, card, ms, delay = 0, width = 150) {
  const dx = card.x - deck.x, dy = card.y - deck.y, len = Math.hypot(dx, dy);
  const e = element('cm-ray', { left: deck.x + 'px', top: deck.y - width / 2 + 'px', width: len + 'px', height: width + 'px', transform: 'rotate(' + Math.atan2(dy, dx) + 'rad)' });
  finish(animate(e, [{ opacity: 0 }, { opacity: .95, offset: .12 }, { opacity: .95, offset: .88 }, { opacity: 0 }], ms, delay), () => e.remove());
  return e;
}
// a card (or back) flying from `from` to the invisible deck while it leaves a trail of bubbles
function glideBack(e, from, deck, delay, sc) {
  const dx = deck.x - from.x, dy = deck.y - from.y, ms = Math.min(1100, Math.max(800, 380 + Math.hypot(dx, dy) / sc * .5));
  finish(animate(e, [{ transform: tr(0, 0, 0, 1), opacity: 1 }, { transform: tr(dx * .12, dy * .12 - 8 * sc, 4, 1), opacity: 1, offset: .15 }, { transform: tr(dx * .9, dy * .9, -5, .55), opacity: .85, offset: .85 }, { transform: tr(dx, dy, 0, .45), opacity: 0 }], ms, delay, 'cubic-bezier(.35,.05,.55,1)'), () => e.remove());
  bubbleTrail(from, deck, ms, delay, sc);
}
// The trail of a glide: bubbles along the way (the focus), a thin faint streak under them, two ripple rings where the card leaves and, where it vanishes at the invisible deck, a ring and a burst of bubbles.
function bubbleTrail(from, to, ms, delay, sc) {
  const N = 34, K = 1.45;
  const ang = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI, len = Math.hypot(to.x - from.x, to.y - from.y), h = 8 * sc;
  const wake = element('cm-wake', { left: from.x + 'px', top: from.y - h / 2 + 'px', width: len + 'px', height: h + 'px', transformOrigin: '0 50%', borderRadius: h / 2 + 'px' });
  finish(animate(wake, [{ transform: `rotate(${ang}deg) scaleX(0)`, opacity: 0 }, { transform: `rotate(${ang}deg) scaleX(.55)`, opacity: .55, offset: .45 }, { transform: `rotate(${ang}deg) scaleX(1)`, opacity: .35, offset: .85 }, { transform: `rotate(${ang}deg) scaleX(1)`, opacity: 0 }], ms + 450, delay, 'linear'), () => wake.remove());
  const ring = (at, d, wait, frames) => { const e = element('cm-ring', { left: at.x - d / 2 * sc + 'px', top: at.y - d / 2 * sc + 'px', width: d * sc + 'px', height: d * sc + 'px', borderWidth: 2.5 * sc + 'px' }); finish(animate(e, frames, 700, wait, 'ease-out'), () => e.remove()); };
  for (let k = 0; k < 2; k++) ring(from, 44, delay + k * 140, [{ transform: 'scale(.3)', opacity: .9 }, { transform: 'scale(2.2)', opacity: 0 }]);
  for (let j = 0; j < N; j++) {
    const t = j / (N - 1), x = from.x + (to.x - from.x) * t * .9, y = from.y + (to.y - from.y) * t * .9, r = (11 + j % 3 * 6) * sc * K;
    const b = element('cm-bubble', { left: x - r / 2 + (j % 3 - 1) * 20 * sc + 'px', top: y + 'px', width: r + 'px', height: r + 'px' });
    finish(animate(b, [{ opacity: 0, transform: tr() }, { opacity: .85, offset: .2 }, { opacity: 0, transform: tr((j % 2 ? 22 : -22) * sc, -90 * sc) }], 1000, delay + ms * t * .85), () => b.remove());
  }
  for (let k = 0; k < 2; k++) ring(to, 48, delay + ms * .8 + k * 130, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(.5)', opacity: .9, offset: .2 }, { transform: 'scale(2.2)', opacity: 0 }]);
  for (let j = 0; j < 14; j++) {
    const a = j / 14 * Math.PI * 2, d = (34 + (j % 3) * 12) * sc, r = (10 + j % 3 * 4) * sc * K;
    const b = element('cm-bubble', { left: to.x - r / 2 + 'px', top: to.y - r / 2 + 'px', width: r + 'px', height: r + 'px' });
    finish(animate(b, [{ opacity: 0, transform: tr() }, { opacity: .9, offset: .2 }, { opacity: 0, transform: tr(Math.cos(a) * d, Math.sin(a) * d - 10 * sc) }], 800, delay + ms * .85), () => b.remove());
  }
}
function run(plan, old, targets) {
  if (!plan.arrivals.length && !plan.departures.length && !(plan.projects || []).length) return;
  targets.forEach((e) => e.getAnimations().forEach((a) => { if (a.constructor === Animation) a.cancel(); }));
  const outgoing = plan.departures.map((p) => ({ ...p, g: old.hand.find((c) => c.key === p.key) })).filter((p) => p.g);
  let hold = 0;
  outgoing.forEach((p, i) => { hold = Math.max(hold, depart(p, i, outgoing)); });
  const lead = plan.after && outgoing.length ? hold : 0;          // (endgame cards: what is discarded goes first, what is drawn comes when that is over)
  const flights = plan.arrivals.map((p, i) => { const node = targets.find((e) => e.dataset.key === p.key); return node ? arrive(node, lead ? { ...p, lead } : p, i, old.display.find((c) => c.key === p.key)) : null; });
  // Keep surviving cards in their old slots until the last outgoing card disappears, then they slide to their new places. A lone card drawn into the tray (the others only close up to make room, because the row is
  // full) does not make them slide before it shows up: they close up while it drops in, so everything settles together.
  const lone = flights.length === 1 && flights[0] && !outgoing.length && !(plan.projects || []).length && S.handMode === 'tray';
  const slideAt = lone ? flights[0].delay + flights[0].duration * .4 : hold, slideMs = lone ? flights[0].duration * .6 : outgoing.length ? 230 : 260, slideEase = lone ? 'ease-in-out' : EASE;
  for (const node of targets) {
    const from = old.hand.find((c) => c.key === node.dataset.key);
    if (!from || plan.arrivals.some((p) => p.key === node.dataset.key)) continue;
    const to = shot(node);
    if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) + Math.abs(from.angle - to.angle) < .5) continue;
    const e = ghost(to); hide(node);
    const a = animate(e, [{ transform: tr(from.x - to.x, from.y - to.y, from.angle) }, { transform: tr(0, 0, to.angle) }], slideMs, slideAt, slideEase);
    finish(a, () => { show(node); e.remove(); });
  }
  // One card into the floating tray: the frame's edge opens with the card's flight and reaches the new slot as the card lands (instead of widening at once and leaving a gap)
  if (flights.length === 1 && flights[0] && !outgoing.length && !(plan.projects || []).length) openWith(flights[0], old.frameW);
  else if (shift > 0 && S.handMode === 'tray') {
    // This part of the step waits for another player's cards (the starting hands): the tray keeps its old width and its slide-in until the followed player's own cards start to move.
    const wrap = document.querySelector('.handtray.enter'), speed = Math.max(.1, Number(S.animationSpeed) || 1);
    if (wrap && plan.arrivals.some((p) => p.kind === 'deck')) {
      wrap.style.animationDelay = shift / speed + 'ms'; wrap.style.animationFillMode = 'backwards';
      animate(wrap, [{ opacity: 0 }, { opacity: 0 }], shift, -shift, 'linear', 'none');          // (until then nothing of it shows: the round buttons on its top edge would peek out of the bottom of the window)
    }
    const frame = document.querySelector('#dock .trayframe'), to = frameWidth(), real = flights.filter(Boolean);
    if (frame && old.frameW && to && Math.abs(to - old.frameW) >= 2 && (outgoing.length || real.length)) {
      const start = outgoing.length ? Math.max(0, hold - 250) : Math.min(...real.map((f) => f.delay)), end = outgoing.length ? start + 320 : Math.max(...real.map((f) => f.delay + f.duration)), was = frame.style.overflow;
      frame.style.overflow = 'hidden';
      const w = animate(frame, [{ width: old.frameW + 'px' }, { width: to + 'px' }], Math.max(200, end - start), start, 'ease-in-out');
      pinRow(frame, old.frameW, w);
      finish(w, () => { frame.style.overflow = was; w.cancel(); });
    }
  }
  (plan.projects || []).forEach((p, i) => playProject(p, i, (p.source === 'display' ? old.display : old.hand).find((c) => c.key === p.key)));
}
// A project that is played glides to its open spot on the association board and flips into the strip: the card turns edge-on and the strip (the real one, hidden until then) unfolds in its place.
// g: where the card starts (a shot of the card; for the other seat's hand the info box, `emerge` fades the card in there)
function playProject(p, i, g, emerge = false) {
  const strip = document.querySelector('.projstrip[data-key="' + p.key + '"]');
  if (!g || !strip) return;
  const to = shot(strip), sc = scale(), dx = to.x - g.x, dy = to.y - g.y, k = .75;
  const T = Math.min(1500, Math.max(650, 650 * Math.hypot(dx, dy) / sc / 850)), delay = i * 200;
  const e = ghost(g), N = 40;
  const flight = Array.from({ length: N + 1 }, (_, n) => { const t = n / N, u = t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; return { offset: t, transform: tr(dx * u, dy * u, g.angle * (1 - u), 1 + (k - 1) * u), opacity: emerge && t < .2 ? t / .2 : 1 }; });          // (ease in and out: it leaves the hand softly and settles on the spot)
  finish(animate(e, flight, T, delay, 'linear'), () => {});
  // the flip: the card turns edge-on around its middle (200 ms), then the strip unfolds from its middle (220 ms)
  const t0 = delay + T;
  landings.set(String(p.key).split('_')[0], shift + t0 + 440);
  const edge = tr(dx, dy, 0, k).replace(/scale\([^)]*\)/, 'scale(0.001,' + k + ')');
  finish(animate(e, [{ transform: tr(dx, dy, 0, k), opacity: 1 }, { transform: edge, opacity: 1 }], 200, t0, 'ease-in', 'forwards'), () => e.remove());
  // the slot itself (position, neighbour) is left alone; until the strip unfolds it keeps the look of an empty place (outline, no green base)
  const slot = strip.closest('.projslot');
  if (slot) {
    const probe = slot.cloneNode(false), look = (n) => { const c = getComputedStyle(n); return { backgroundImage: c.backgroundImage, backgroundColor: c.backgroundColor, boxShadow: c.boxShadow }; };
    probe.classList.add('projempty'); probe.style.cssText += ';position:absolute;visibility:hidden;pointer-events:none';
    slot.parentNode.appendChild(probe);
    const empty = look(probe), full = look(slot);
    probe.remove();
    animate(slot, [empty, { ...empty, offset: .47 }, { ...full, offset: .48 }, full], 420, t0, 'linear');
  }
  animate(strip, [{ opacity: 0, scale: '0 1' }, { opacity: 0, scale: '0 1', offset: .47 }, { opacity: 1, scale: '0.001 1', offset: .48 }, { opacity: 1, scale: '1.04 1', offset: .85 }, { opacity: 1, scale: '1 1' }], 420, t0, 'linear');
}
function openWith(f, from) {
  const frame = document.querySelector('#dock .trayframe'), to = frameWidth();
  if (!frame || !from || !to || Math.abs(to - from) < 2 || S.handMode !== 'tray') return;
  const was = frame.style.overflow;
  frame.style.overflow = 'hidden';
  const a = animate(frame, [{ width: from + 'px' }, { width: to + 'px' }], f.duration, f.delay, f.ease);
  pinRow(frame, from, a);
  finish(a, () => { frame.style.overflow = was; a.cancel(); });
}
// While the frame's width is animated, the row of cards inside it already has its new, wider layout. The row is centred in the frame (parkposter.css `.handtray .cards`), so a frame that is
// still narrower than the row let the row overflow on both sides: every card stood half the added width to the left (the first one cut off at the frame's left edge) and drifted back
// right as the frame opened. The row is held to the frame's left edge until the width animation is over (or cancelled); at its end the row fills the frame, so left and centred are the same
// place. Not when the old frame was held at its minimum width (few cards, wider round buttons): there the old cards really were centred, and the slide of the survivors takes them over.
function pinRow(frame, from, anim) {
  const row = frame.querySelector('.cards');
  if (!row || row.classList.contains('multi')) return;
  const min = parseFloat(getComputedStyle(frame).minWidth) || 0;
  if (from <= min + 1) return;
  const was = row.style.justifyContent;
  row.style.justifyContent = 'start';
  anim.finished.then(() => { row.style.justifyContent = was; }, () => { row.style.justifyContent = was; });
}
// returns the card's flight window { delay, duration, ease } (ms at speed 1) for the tray
function arrive(node, plan, index, source) {
  if (plan.kind === 'pilfer') {                                   // a pilfered card comes out of the giver's info box as a back and turns face-up in the hand
    const from = boxPoint(plan.from), to = shot(node);
    if (from) {
      const w = backWidth(), e = backGhost(from.x, from.y, w), dx = to.x - from.x, dy = to.y - from.y, end = to.w / w;
      hide(node);
      finish(animate(e, [{ transform: tr(0, 0, 8, .55), opacity: 0 }, { transform: tr(dx * .5, dy * .45 - 60 * scale(), 4, (.55 + end) / 2), opacity: 1, offset: .45 }, { transform: tr(dx, dy, 0, end) }], 800, index * 120, 'ease-in-out'), () => { show(node); e.remove(); animate(node, [{ transform: 'scaleX(0)' }, { transform: 'none' }], 260); });
      return;
    }
  }
  const fan = S.handMode === 'fan', delay = (plan.lead || 0) + index * (fan ? 110 : plan.kind === 'deck' ? 100 : 95);
  if (plan.kind === 'deck') {
    // Every draw from the deck, one card or the whole starting hand, keeps the application's original deal (dock.js had it for the setup only).
    if (fan) {
      const hk = parseFloat(getComputedStyle(document.body).getPropertyValue('--hk')) || 1.5;
      const a = animate(node, [{ transform: `translateY(${240 * hk * 1.2}px) rotate(0deg)`, opacity: 0 }, { opacity: 1, offset: .25 }, { transform: getComputedStyle(node).transform, opacity: 1 }], 520, delay, 'cubic-bezier(.2,.9,.3,1.08)');
      finish(a, () => a.cancel());
    } else {                                                  // the floating tray: the cards fall in from above, tilted to alternating sides, with a small bounce
      const slide = document.querySelector('.handtray.enter') ? 350 : 0;      // (a tray that has just been drawn slides up first)
      // The card comes from the invisible deck, a fixed point in the centre of the header row, so every card of a draw travels from the same spot; the flight is longer the further the card has to go.
      const d = deckPoint(), tilt = index % 2 ? -9 : 9, sc = scale();
      if (slide) {                                            // a tray that is still sliding up carries its cards with it: the card flies inside the tray (a copy in the overlay would land where the tray stood when the flight began)
        const r = node.getBoundingClientRect(), k = sc;
        const fx = (d.x - (r.left + r.width / 2)) / k, fy = (d.y - (r.top + r.height / 2)) / k, dist = Math.max(260, Math.hypot(fx, fy));
        const ms = Math.min(800, Math.max(560, 320 + dist * .45));
        const a = animate(node, [{ transform: `translate(${fx}px,${fy}px) rotate(${tilt}deg)`, opacity: 0 }, { opacity: 1, offset: .08 }, { transform: 'translateY(6px) rotate(0deg)', opacity: 1, offset: .78 }, { transform: 'none', opacity: 1 }], ms, slide + delay, 'ease-in-out');
        finish(a, () => a.cancel());
        return { delay: slide + delay, duration: ms, ease: 'ease-in-out' };
      }
      // The flight is drawn in the overlay: the tray's frame clips what is inside it (it is held to `overflow: hidden` while it widens for a lone card), and the card would only show once it is inside.
      const g = shot(node), fx = d.x - g.x, fy = d.y - g.y, dist = Math.max(260 * sc, Math.hypot(fx, fy)) / sc;
      const ms = Math.min(800, Math.max(560, 320 + dist * .45)), e = ghost(g);
      hide(node);
      const a = animate(e, [{ transform: tr(fx, fy, tilt), opacity: 0 }, { transform: tr(fx, fy, tilt), opacity: 0, offset: .01 }, { opacity: 1, offset: .08 }, { transform: tr(0, 6 * sc, 0), opacity: 1, offset: .78 }, { transform: tr(), opacity: 1 }], ms, slide + delay, 'ease-in-out');
      finish(a, () => { show(node); e.remove(); });
      return { delay: slide + delay, duration: ms, ease: 'ease-in-out' };
    }
    return;
  }
  if (plan.kind === 'targeted') {                                 // a card picked out of the deck: the magnifying glass finds it
    const goal = shot(node); hide(node);
    const f = searchFlight({ front: goal.image, goal, angle: fan ? goal.angle : 0, fan, delay });
    finish(f.done, () => show(node));
    return f.glide;
  }
  const to = shot(node), e = ghost(to); hide(node);
  let wait = delay, duration = plan.kind === 'deck' ? 560 : 650;
  let from = source || { x: innerWidth * .46, y: -to.h, w: to.w * .94 };
  const dx = from.x - to.x, dy = from.y - to.y, size = from.w / to.w;
  let frames;
  if (plan.kind === 'deck') frames = [{ transform: tr(dx, dy, -6, .94) }, { transform: tr(dx * .38, dy * .42, -2, 1.02), offset: .56 }, { transform: tr() }];
  else if (fan) {
    // One continuously moving path; late rotation is independent of translation easing.
    frames = Array.from({ length: 31 }, (_, i) => {
      const t = i / 30, u = glideEase(t);
      return { offset: t, transform: tr(dx * (1 - u), dy * (1 - u), to.angle * u ** 4, size + (1 - size) * u) };
    });
  } else frames = [{ transform: tr(dx, dy, 0, size) }, { transform: tr(dx * .38, dy * .42, 0, size + (1 - size) * .7), offset: .56 }, { transform: tr() }];
  const a = animate(e, frames, duration, wait, fan && plan.kind !== 'deck' ? 'linear' : EASE);
  finish(a, () => { show(node); e.remove(); });
  if (fan) return;
  return { delay: wait, duration, ease: EASE };
}
// A targeted draw. The screen dims, a row of face-down cards falls in from the invisible deck and a magnifying glass swings over it, left to right and back (one smooth pendulum swing),
// settling on a random card. That card is pulled out to the middle, turned face-up (`front`; without it the card stays a back: the other player's draw) and glides to `goal`
// (a shot of the card in the hand / the info box). Returns { done, glide: { delay, duration, ease } } (the glide is what the tray's opening follows).
function searchFlight({ front, goal, angle = 0, fan = false, delay = 0, backGoal = false }) {
  const sc = scale(), C = { x: innerWidth / 2, y: innerHeight * .43 }, W = 260 * sc, H = W * 503 / 360, N = 7, gap = 150 * sc, rowS = .62;
  const pick = Math.floor(Math.random() * (N - 1)), cx = (i) => C.x + (i - 3) * gap, rowY = C.y + 12 * sc, deck = deckPoint();
  const els = [], at = (x, y, s = 1, r = 0) => tr(x - C.x, y - C.y, r, s), radius = Math.round(W * .055) + 'px';
  const flipper = (img) => {
    const e = element('cm-flip', { left: C.x - W / 2 + 'px', top: C.y - H / 2 + 'px', width: W + 'px', height: H + 'px' });
    e.innerHTML = '<div class="in"><div class="face back"></div><div class="face front"></div></div>';
    for (const f of e.querySelectorAll('.face')) f.style.borderRadius = radius;
    e.querySelector('.back').style.backgroundImage = 'url(' + BACK + ')';
    if (img) e.querySelector('.front').style.backgroundImage = 'url("' + img + '")';
    els.push(e); return e;
  };
  const dim = element('cm-dim'); els.push(dim);
  animate(dim, [{ opacity: 0 }, { opacity: .92 }], 450, delay);
  const row = Array.from({ length: N }, (_, i) => {
    const e = flipper(i === pick ? front : null), base = at(cx(i), rowY, rowS);
    animate(e, [{ transform: at(deck.x, deck.y, .4), opacity: 0 }, { opacity: 1, offset: .2 }, { transform: base }], 520, delay + i * 70, 'cubic-bezier(.2,.8,.25,1)');
    return { e, base, x: cx(i) };
  });
  // the glass: a pendulum, theta 0 -> Theta, x = c - R cos(theta); it ends exactly over the chosen card, every turn is a smooth one
  const lens = element('cm-lens'); lens.style.setProperty('--u', sc + 'px'); lens.innerHTML = '<div class="glass"></div><div class="handle"></div>'; els.push(lens);
  const x0 = cx(0) - 1.2 * gap, x1 = cx(N - 1) + 1.2 * gap, c = (x0 + x1) / 2, R = (x1 - x0) / 2, xe = cx(pick);
  const Theta = 2 * Math.PI - Math.acos((c - xe) / R), Ts = 1300 * (1 + (x1 - xe) / (x1 - x0)), tL = delay + 650, M = 90;
  const ease = (u) => .5 - .5 * Math.cos(Math.PI * u), th = (u) => Theta * ease(u);
  const pos = (u) => { const t = th(u); return { x: c - R * Math.cos(t), y: rowY + 10 * sc * Math.sin(t), r: 8 * Math.sin(t) }; };
  const lensAt = (u, k = 1, o = 1) => { const q = pos(u); return { transform: `translate(${q.x - 105 * sc}px,${q.y - 105 * sc}px) rotate(${q.r}deg) scale(${k})`, opacity: o }; };
  animate(lens, Array.from({ length: M + 1 }, (_, j) => { const u = j / M; return { offset: u, ...lensAt(u, .4 + .6 * Math.min(1, u / .1) + .06 * Math.max(0, (u - .94) / .06), Math.min(1, u / .1)) }; }), Ts, tL, 'linear');
  // each card hops up when the glass passes over it (on the way out and on the way back)
  row.forEach((r, i) => {
    let prev = pos(0).x - r.x;
    for (let j = 1; j <= 200; j++) {
      const u = j / 200, d = pos(u).x - r.x;
      if (prev * d < 0) animate(r.e, [{ transform: r.base }, { transform: at(r.x, rowY - 22 * sc, rowS + .08), offset: .5 }, { transform: r.base }], 340, tL + u * Ts - 170, 'ease-in-out', 'forwards');
      prev = d;
    }
  });
  // settled: the other cards drop away, the glass drifts off, the chosen card is pulled out to the middle (and turned over)
  const tS = tL + Ts;
  holdBar(shift + tS + 700);                                       // (the card is face-up about 700 ms after the glass settles)
  const ring = element('cm-flash', { left: xe - 105 * sc + 'px', top: rowY - 105 * sc + 'px', width: 210 * sc + 'px', height: 210 * sc + 'px', opacity: '0' }); els.push(ring);
  animate(ring, [{ opacity: .9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(2.4)' }], 700, tS, 'ease-out', 'forwards');
  animate(lens, [{ transform: lensAt(1, 1.06).transform, opacity: 1 }, { transform: `translate(${xe - 105 * sc + 60 * sc}px,${rowY - 105 * sc - 70 * sc}px) scale(1.4)`, opacity: 0 }], 600, tS + 350, 'ease-in', 'forwards');
  row.forEach((r, i) => { if (i !== pick) animate(r.e, [{ transform: r.base, opacity: 1 }, { transform: at(r.x, rowY + 200 * sc, .5), opacity: 0 }], 450, tS + Math.abs(i - pick) * 50, 'ease-in', 'forwards'); });
  const chosen = row[pick].e, centre = at(C.x, C.y, 1.04);
  animate(chosen, [{ transform: row[pick].base }, { transform: at(C.x, C.y - 16 * sc, 1.06), offset: .6 }, { transform: centre }], 800, tS + 250, 'cubic-bezier(.2,.8,.25,1)', 'forwards');
  if (front) animate(chosen.firstChild, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(188deg)', offset: .78 }, { transform: 'rotateY(180deg)' }], 650, tS + 550, 'ease-in-out');
  // the usual glide to the goal
  const tG = tS + (front ? 2150 : 1650), T = 650, dx = goal.x - C.x, dy = goal.y - C.y, k = (backGoal ? goal.w * .55 : goal.w) / W;
  animate(dim, [{ opacity: .92 }, { opacity: 0 }], 500, tG, 'ease-in', 'forwards');
  const glide = fan && front
    ? Array.from({ length: 31 }, (_, i) => { const t = i / 30, u = glideEase(t); return { offset: t, transform: tr(dx * u, dy * u, angle * u ** 4, 1.04 + (k - 1.04) * u) }; })
    : [{ transform: centre, opacity: 1 }, ...(backGoal ? [{ transform: tr(dx * .7, dy * .7, 0, 1.04 + (k - 1.04) * .7), opacity: 1, offset: .7 }] : []), { transform: tr(dx, dy, angle, k), opacity: backGoal ? 0 : 1 }];
  const g = animate(chosen, glide, T, tG, fan && front ? 'linear' : EASE, 'forwards');
  finish(g, () => els.forEach((e) => e.remove()));
  return { done: g, glide: { delay: tG, duration: T, ease: fan && front ? 'cubic-bezier(.22,.65,.3,1)' : EASE } };
}
function glideEase(t) {
  let lo = 0, hi = 1;
  const bez = (u, a, b) => 3 * (1 - u) ** 2 * u * a + 3 * (1 - u) * u ** 2 * b + u ** 3;
  for (let i = 0; i < 20; i++) { const u = (lo + hi) / 2; if (bez(u, .22, .3) < t) lo = u; else hi = u; }
  return bez((lo + hi) / 2, .65, 1);
}
function depart(p, i, all) {
  const { g, kind } = p, e = ghost(g), unit = g.w / 106;
  let delay = i * (kind === 'discard' ? 80 : kind === 'pouch' ? 160 : 145);
  let easing = kind === 'discard' ? 'ease-in' : kind === 'pouch' ? 'cubic-bezier(.32,.05,.32,1)' : EASE;
  let duration = 380, frames = [{ transform: tr(0, 0, g.angle), opacity: 1 }, { transform: tr(0, 9 * unit, g.angle, .97), opacity: .8, offset: .32 }, { transform: tr(0, 42 * unit, g.angle, .83), opacity: 0 }];
  if (kind === 'sun') {                                            // a ray from the invisible deck to the card, held for the whole animation; the card is beamed up along it
    duration = 1000;
    const d = deckPoint(), dx = d.x - g.x, dy = d.y - g.y;
    sunRay(d, { x: g.x, y: g.y }, duration, delay, g.w * 1.3);
    frames = [{ transform: tr(0, 0, g.angle), opacity: 1 }, { transform: tr(dx * .06, dy * .06, g.angle, 1), filter: 'brightness(1.3)', opacity: 1, offset: .2 }, { transform: tr(dx * .95, dy * .95, -10, .35), filter: 'brightness(1.5)', opacity: 0 }];
    easing = 'ease-in';
  } else if (kind === 'glide') {                                   // the card flies to the invisible deck in a trail of bubbles
    const d = deckPoint(), dx = d.x - g.x, dy = d.y - g.y, sc = scale();
    duration = Math.min(1100, Math.max(800, 380 + Math.hypot(dx, dy) / sc * .5));
    frames = [{ transform: tr(0, 0, g.angle), opacity: 1 }, { transform: tr(dx * .12, dy * .12 - 8 * sc, 4, 1), opacity: 1, offset: .15 }, { transform: tr(dx * .9, dy * .9, -5, .55), opacity: .85, offset: .85 }, { transform: tr(dx, dy, 0, .45), opacity: 0 }];
    easing = 'cubic-bezier(.35,.05,.55,1)';
    bubbleTrail({ x: g.x, y: g.y }, d, duration, delay, sc);
  } else if (kind === 'pouch') {                                   // tucked under its source (an animal / sponsor card, or a small model of the map), above the hand
    const mine = all.filter((x) => x.kind === 'pouch' && x.source === p.source), first = mine[0];
    if (!first.tuck) first.tuck = tuckStage(g, p.source, shownSeat(), mine.length, false);
    delay = mine.indexOf(p) * TUCK_GAP;
    const t = first.tuck.flight(g, mine.indexOf(p), delay);
    frames = t.frames; duration = t.duration; easing = 'linear'; e.style.zIndex = '4';
  }
  if (kind === 'pilfer') {                                         // the card given away leaves the hand as a back and flies to the receiver's info box
    const to = boxPoint(p.to);
    if (to) {
      e.querySelector('img')?.setAttribute('src', BACK);
      const dx = to.x - g.x, dy = to.y - g.y;
      frames = [{ transform: tr(0, 0, 0, 1) }, { transform: tr(dx * .55, dy * .5 - 60 * scale(), -6, .7), offset: .5 }, { transform: tr(dx, dy, 4, .32), opacity: 0 }];
      duration = 800; delay = i * 120;
    }
  }
  if (kind === 'discard' && S.handMode !== 'fan') {
    // The floating tray: a discard is the deal played backwards. The card dips a little, then rises, tilted to alternating sides, to the invisible deck (the centre of the header row) and fades out there.
    const d = deckPoint(), sc = scale(), fx = d.x - g.x, fy = d.y - g.y, dist = Math.max(260 * sc, Math.hypot(fx, fy)), tilt = i % 2 ? -9 : 9;
    delay = i * 100; duration = Math.min(800, Math.max(560, 320 + dist / sc * .45));
    frames = [{ transform: tr(0, 0, g.angle), opacity: 1 }, { transform: tr(0, 6 * sc, 0), opacity: 1, offset: .22 }, { transform: tr(fx, fy, tilt), opacity: 1, offset: .92 }, { transform: tr(fx, fy, tilt), opacity: 0 }];
    easing = 'ease-in-out';
  }
  finish(animate(e, frames, duration, delay, easing), () => e.remove());
  return duration + delay;
}
// Pouching (as in the board game): the card is tucked under its source and peeks out below it. The source is the animal / sponsor card the cards go under (`under`), or, for a map
// ability (`pouched`: map 7's pouch), a small model of the player's map with its placement bonuses. It appears above the hand (never cut off by the hand, folded or open, or by the
// bottom of the window) or, for the other seat, next to that player's info box; it stands still, the cards fly to it on one smooth curve, then everything fades together.
const easeInOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const TUCK_FLY = 820, TUCK_GAP = 160, TUCK_HOLD = 640, TUCK_OUT = 340;
function tuckStage(g, source, seat, count, other) {
  const sc = scale(), isMap = !source || !info(source).image;
  const aw = (other ? g.w * 1.45 : g.w * 1.3) * (isMap ? 1.25 : 1), ah = isMap ? aw * 976 / 1122 : aw * 503 / 360;
  const ch = g.h * Math.min((aw * .94) / g.w, isMap ? (ah * .9) / g.h : Infinity);          // (the height of a tucked card)
  const peekOf = (n) => ch * ((isMap ? .22 : .14) + n * .06), below = peekOf(count - 1);
  const top0 = (document.querySelector('.movebar')?.getBoundingClientRect().bottom || 0) + 8;
  const dock = document.getElementById('dock')?.getBoundingClientRect();
  let cx = Math.max(aw / 2 + 16, Math.min(innerWidth - aw / 2 - 16, other ? g.x - g.w * 2.9 : g.x));
  const overHand = dock && dock.height && cx + aw / 2 > dock.left && cx - aw / 2 < dock.right;
  const floor = (overHand ? Math.min(dock.top, innerHeight) : innerHeight) - 14 * sc;          // (above the hand, folded or open, wherever the source would cover it, and above the bottom edge)
  let cy = other ? g.y - g.h * .6 : floor - below - ah / 2;
  cy = Math.max(top0 + ah / 2, Math.min(cy, floor - below - ah / 2));
  const left = Math.round(cx - aw / 2), top = Math.round(cy - ah / 2);
  cx = left + aw / 2; cy = top + ah / 2;
  const src = element('cm-card cm-tuck', { left: left + 'px', top: top + 'px', width: aw + 'px', height: ah + 'px' });
  if (isMap) {
    src.classList.add('map');
    const mv = (S.replay.maps || [])[seat];
    if (mv) { const board = zooBoard(mv, { buildings: [], flags: {}, tokens: [], animals: [], sponsors: [] }, seat); board.setAttribute('width', '100%'); board.setAttribute('height', '100%'); src.append(board); }
  } else { const im = document.createElement('img'); im.src = snakeSafe(info(source).image); im.alt = ''; src.append(im); }
  const land = (count - 1) * TUCK_GAP + TUCK_FLY, end = land + TUCK_HOLD + TUCK_OUT;
  finish(animate(src, [{ opacity: 0 }, { opacity: 1, offset: 260 / end }, { opacity: 1, offset: (land + TUCK_HOLD) / end }, { opacity: 0 }], end, 0, 'linear'), () => src.remove());
  return {
    // the keyframes of the n-th card: one curve up out of the hand / box, round below the source and up under it, then it waits and fades with the source
    flight(g, n, delay) {
      const s2 = Math.min((aw * .94) / g.w, isMap ? (ah * .9) / g.h : Infinity);
      const c2 = g.h * s2, tx = Math.round(cx - g.x), ty = Math.round(cy + ah / 2 - c2 / 2 + peekOf(n) - g.y);
      const P = [[0, 0], [0, -40 * sc], [tx - 70 * sc, ty + c2 * .75], [tx, ty]], total = end - delay, fly = TUCK_FLY / total;
      const frames = [];
      for (let j = 0; j <= 30; j++) {
        const u = easeInOut(j / 30), v = 1 - u, bz = (q) => v * v * v * P[0][q] + 3 * v * v * u * P[1][q] + 3 * v * u * u * P[2][q] + u * u * u * P[3][q];
        frames.push({ offset: fly * j / 30, transform: tr(bz(0), bz(1), g.angle * (1 - u), 1 + (s2 - 1) * Math.min(1, u * 1.25)), opacity: 1 });
      }
      const still = tr(tx, ty, 0, s2);
      frames.push({ offset: (land + TUCK_HOLD - delay) / total, transform: still, opacity: 1 }, { offset: 1, transform: still, opacity: 0 });
      return { frames, duration: total };
    }
  };
}
for (const event of ['handmode', 'povapplied', 'cardorder']) document.addEventListener(event, () => {
  stop(); pending = null;
  // These events may redraw only the dock, outside main.render(). Retain the current
  // logical position so the very next draw still animates in the newly chosen layout.
  if (previous && previous.step === S.step && previous.pov === S.pov) {
    previous.mode = S.handMode; previous.seat = shownSeat(); previous.kind = zoneKind();
  } else previous = null;
});
window.addEventListener('resize', stop);
window.addEventListener('scroll', stop, { passive: true });
document.addEventListener('pointerdown', (e) => { if (e.target.closest?.('#dock')) stop(); }, true);
reduced.addEventListener('change', stop);
const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/card-motion.css'; document.head.append(css);
