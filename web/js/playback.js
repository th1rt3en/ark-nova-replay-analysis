// [module] Step navigation: timeline, autoplay, speed, keyboard, move list.
import { $, el, seatColor } from './util.js';
import { S } from './state.js';
import { labelOf, povState } from './pov.js';
import { cardMarks } from './cards.js';
import { draftMarks } from './action-bar.js';
import { engineBadge, labelNode } from './log-labels.js';
import { render } from './main.js';
import { keepSel } from './fork.js';
import { framesOf } from './frames.js';

const PLAY_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2l13 8-13 8z"/></svg>', PAUSE_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3h4v14H4zM12 3h4v14h-4z"/></svg>';
export function setPlaying(on) {
  if (S.timer) { clearInterval(S.timer); S.timer = null; }
  if (on && atEnd()) go(0);                                              // started at the end: play again from the start
  if (on) S.timer = setInterval(() => { if (atEnd()) setPlaying(false); else stepBy(1); }, 1000 / S.speed);
  const b = $('play');
  b.innerHTML = on ? PAUSE_SVG : PLAY_SVG;
  b.title = on ? 'Stop autoplay (Space)' : 'Start autoplay (Space)';
  b.setAttribute('aria-label', on ? 'Stop autoplay' : 'Start autoplay');
  b.classList.toggle('on', on);
}
export function setSpeed(x) {
  S.speed = x;
  for (const b of document.querySelectorAll('.speed button')) b.classList.toggle('on', +b.dataset.speed === x);
  if (S.timer) setPlaying(true);                                       // restart the timer at the new rate
}

// ---- timeline: |----|------|----|, each | is the start of a round (the step after a break ends) ---------------------
function roundStarts() {
  const starts = [0];
  S.replay.steps.forEach((s, i) => { if (/^End of the break/im.test(s.label || '') && i + 1 < S.replay.steps.length) starts.push(i + 1); });
  return starts;
}
export function buildTimeline() {
  const tl = $('timeline'), n = S.replay.steps.length, starts = roundStarts();
  if (!tl) return;                                                       // (no timeline element on the page)
  tl.replaceChildren();
  tl.append(el('div', 'tlfill'));                                        // (the part of the game that is over, left of the head; under the round marks)
  starts.forEach((a, k) => {
    const b = k + 1 < starts.length ? starts[k + 1] : n;
    const seg = el('div', 'tlseg');
    seg.style.flexGrow = b - a;
    seg.title = 'Round ' + (k + 1) + ': steps ' + a + '–' + (b - 1);
    tl.append(seg);
  });
  tl.append(el('div', 'tlhead'));
  // a click goes to the step under the pointer; the head (or the whole bar) can be dragged: the board follows while the pointer moves (at most one redraw per frame)
  const stepAt = (e) => { const r = tl.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (n - 1)); };
  let dragging = false, want = -1, frame = 0;
  const flush = () => { frame = 0; if (want >= 0 && want !== S.step) go(want); want = -1; };
  tl.onpointerdown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragging = true; tl.setPointerCapture(e.pointerId); tl.classList.add('dragging');
    if (S.timer) setPlaying(false);                                       // (autoplay would fight the hand that holds the head)
    want = stepAt(e); flush(); e.preventDefault();
  };
  tl.onpointermove = (e) => { if (!dragging) return; want = stepAt(e); if (!frame) frame = requestAnimationFrame(flush); };
  const end = (e) => { if (!dragging) return; dragging = false; tl.classList.remove('dragging'); if (tl.hasPointerCapture(e.pointerId)) tl.releasePointerCapture(e.pointerId); if (frame) { cancelAnimationFrame(frame); flush(); } };
  tl.onpointerup = end; tl.onpointercancel = end;
}
export function updateTimeline() {
  const head = document.querySelector('#timeline .tlhead'), fill = document.querySelector('#timeline .tlfill');
  const pct = (S.replay.steps.length > 1 ? S.step / (S.replay.steps.length - 1) * 100 : 0) + '%';
  if (head) head.style.left = pct;
  if (fill) fill.style.width = pct;
}

// ---- frames: a step is shown in consecutive frames (frames.js); the keys, buttons and autoplay go frame by frame, the timeline, log and jump box step by step ----
export const atEnd = () => S.step >= S.replay.steps.length - 1 && S.phase >= framesOf(S.step).length - 1;
export const atStart = () => S.step === 0 && S.phase === 0;
// The action card draft, seen from a player's point of view, shows nothing of what the opponent chooses (pov.js hides it): the opponent's steps ("X chooses action cards
// (action card draft)") would be frames that look exactly like the one before, and Next would seem to do nothing. The keys, buttons and autoplay skip them: a draft frame
// whose lightbox (the draft as the point of view sees it) is the same as the step before. They stay in the log, and the log, the timeline and the jump box still go there.
function draftSeen(i) {
  const st = S.replay.steps[i].state;
  return st && st.phase === 'setup' && st.draft ? JSON.stringify(povState(st).draft) : null;
}
function skipFrame(n, ph) {
  if (S.pov === null || ph !== 0 || n < 1 || framesOf(n)[0] !== 'draft') return false;
  const seen = draftSeen(n);
  return seen !== null && seen === draftSeen(n - 1);
}
function frameAfter(n, ph, d) {
  if (d > 0) return ph < framesOf(n).length - 1 ? [n, ph + 1] : n < S.replay.steps.length - 1 ? [n + 1, 0] : null;
  return ph > 0 ? [n, ph - 1] : n > 0 ? [n - 1, framesOf(n - 1).length - 1] : null;
}
export function stepBy(d) {
  let f = frameAfter(S.step, S.phase, d);
  while (f && skipFrame(f[0], f[1])) { const g = frameAfter(f[0], f[1], d); if (!g) break; f = g; }
  if (f) go(f[0], f[1]);
}
export function go(n, phase = 0) {
  const before = S.step;
  S.step = Math.max(0, Math.min(S.replay.steps.length - 1, n));
  S.phase = Math.max(0, Math.min(framesOf(S.step).length - 1, phase));
  if (S.step !== before) { S.thresholdMode = null; S.marketMode = null; S.assocSpecies = null; S.forkBonus = null; S.assocMode = null; S.forkMenu = null; S.forkError = ''; draftMarks.clear(); cardMarks.clear(); keepSel.clear(); S.forkSpend = 0; S.skipMode = false; S.animalEnc = null; S.placement = null; }
  render();
}
export function buildMoveList() {
  const list = $('moves');
  list.replaceChildren();
  S.replay.steps.forEach((s, i) => {
    // the step that finishes an action passes the turn in its state, but it still belongs to the player who acted
    const prev = i > 0 ? S.replay.steps[i - 1].state : null;
    const named = S.replay.players.findIndex((pl) => (s.label || '').startsWith(pl.name + ' '));        // (a label that starts with a player's name is that player's)
    const actor = s.actor !== null && s.actor !== undefined ? s.actor : named >= 0 ? named            // the player the log names for this line (a Boost / Clever effect after the turn passed is still the acting player's)
      : prev && s.state.turn > prev.turn && s.state.active_player !== prev.active_player ? prev.active_player : s.state.active_player;
    const li = el('li', 'seat' + actor);
    li.style.borderLeftColor = seatColor(actor);
    li.append(el('span', 'n', i), labelNode(labelOf(s) || '…'), engineBadge(s.engine));
    li._step = s;
    li.onclick = () => { go(i); };
    list.append(li);
  });
}
