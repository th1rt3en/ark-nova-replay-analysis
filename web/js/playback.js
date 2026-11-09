// [module] Step navigation: timeline, autoplay, speed, keyboard, move list.
import { $, el, seatColor } from './util.js';
import { S } from './state.js';
import { labelOf, mergedAway, mergedFrom, povState } from './pov.js';
import { cardMarks } from './cards.js';
import { draftMarks } from './action-bar.js';
import { engineBadge, labelNode, stepLabelNode } from './log-labels.js';
import { render } from './main.js';
import { keepSel } from './fork.js';
import { framesOf } from './frames.js';
import { revealAt } from './reveal.js';
import { FORK, PLAY, SANDBOX, MINIGAME } from './state.js';
import { groupsOf, NEUTRAL_COLOR } from './log-filter.js';
import { closeResults, openResults, resultsAvailable } from './results.js';
import { cardAnimationsBusy } from './card-motion.js';

const PLAY_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2l13 8-13 8z"/></svg>', PAUSE_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3h4v14H4zM12 3h4v14h-4z"/></svg>';
export function setPlaying(on) {
  if (S.timer) { clearInterval(S.timer); S.timer = null; }
  if (on && atEnd()) go(0);                                              // started at the end: play again from the start
  if (on) S.timer = setInterval(() => { if (cardAnimationsBusy()) return; if (atEnd()) setPlaying(false); else stepBy(1); }, 1000 / S.speed);
  const b = $('play');
  b.innerHTML = on ? PAUSE_SVG : PLAY_SVG;
  b.title = on ? 'Stop autoplay (Space)' : 'Start autoplay (Space)';
  b.setAttribute('aria-label', on ? 'Stop autoplay' : 'Start autoplay');
  b.classList.toggle('on', on);
}
export function setSpeed(x) {
  S.speed = x;
  if (S.timer) setPlaying(true);                                       // restart the timer at the new rate
}

// ---- timeline: |----|------|----|, each | is the start of a round (the step after a break ends) ---------------------
function roundStarts() {
  const starts = [0], steps = S.replay.steps;
  if (SANDBOX) {                                                         // (the sandbox's steps are the engine's: a round starts at the first step whose state has a higher round number)
    steps.forEach((s, i) => { if (i && s.state && steps[i - 1].state && s.state.round > steps[i - 1].state.round) starts.push(i); });
    return starts;
  }
  steps.forEach((s, i) => { if (/^End of the break/im.test(s.label || '') && i + 1 < steps.length) starts.push(i + 1); });
  return starts;
}
// Jumping by rounds (replay and sandbox only): right click on the timeline, Ctrl + Left / Right, Ctrl (or Alt) + 1-9.
export const roundJumps = () => !PLAY && !MINIGAME && (!FORK || SANDBOX);
const roundOf = (step) => { const st = roundStarts(); let k = 0; st.forEach((a, i) => { if (a <= step) k = i; }); return k; };      // (0-based round that holds a step)
export function goRound(n) {                                              // the start of round n (1-based); past the last round: nothing
  const st = roundStarts();
  if (n < 1 || n > st.length) return;
  if (S.timer) setPlaying(false);
  go(st[n - 1], 0);
}
export function goRoundBy(d) {                                            // d = -1: the start of this round (the one before when already there); d = 1: the start of the next round (the end of the game from the last round)
  const st = roundStarts(), k = roundOf(S.step), atStartOfK = S.step === st[k] && S.phase === 0;
  if (d < 0) return goRound(atStartOfK ? Math.max(1, k) : k + 1);
  if (k + 1 < st.length) return goRound(k + 2);
  if (S.timer) setPlaying(false);
  go(S.replay.steps.length - 1, 99);
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
  tl.oncontextmenu = (e) => { if (!roundJumps()) return; e.preventDefault(); goRound(roundOf(stepAt(e)) + 1); };          // (right click: the start of the round under the pointer)
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
  if (!(st && st.phase === 'setup' && st.draft)) return null;
  const d = povState(st).draft;
  return JSON.stringify({ ...d, stage: d.stage === 'done' ? 'keep' : d.stage });          // ('done' only says that the opponent's keep, which is hidden, ended the draft: the lightbox looks the same)
}
// The step is the viewed player's own choice (its label starts with that player's name): never skipped, the viewer sees what they chose.
const ownChoice = (n) => { const me = S.replay.players[S.pov]; return !!me && String(S.replay.steps[n].label || '').startsWith(me.name + ' '); };
// The starting hands are dealt in one step: the log has one step per player ("X draws 8 cards and 2 endgame cards", `log_only`), the viewer shows them together whoever the point of view
// is (or none): the first draw of the pair leads to the second, whose state has both hands. The next step is the discard of both and the display's first replenish.
const dealMerged = (n) => { const a = S.replay.steps[n], b = S.replay.steps[n + 1]; return !!a.log_only && !!b?.log_only && a.merge_group === b.merge_group; };       // (the two starting draws, or the three steps of the starting discards)
function skipFrame(n, ph) {
  if (mergedAway(S.replay.steps[n])) return true;                         // (a draw of a run that is one step for this viewer, pov.js `mergedAway`)
  if (dealMerged(n)) return true;                                            // (the starting hands: both draws are one step, see `dealMerged`)
  if (S.pov === null || ph !== 0 || n < 1 || framesOf(n)[0] !== 'draft' || ownChoice(n)) return false;
  const seen = draftSeen(n);
  return seen !== null && seen === draftSeen(n - 1);
}
function frameAfter(n, ph, d) {
  if (d > 0) return ph < framesOf(n).length - 1 ? [n, ph + 1] : n < S.replay.steps.length - 1 ? [n + 1, 0] : null;
  return ph > 0 ? [n, ph - 1] : n > 0 ? [n - 1, framesOf(n - 1).length - 1] : null;
}
export function stepBy(d) {
  if (S.results) { if (d < 0) closeResults(); return; }                  // (the results of a finished replay sit after the last step: ‹ goes back to the final board)
  if (d > 0 && atEnd() && resultsAvailable()) { openResults(); return; }  // (› on the last step opens them, results.js)
  let f = frameAfter(S.step, S.phase, d);
  while (f && skipFrame(f[0], f[1])) { const g = frameAfter(f[0], f[1], d); if (!g) break; f = g; }
  if (f) go(f[0], f[1], d > 0);
}

// An unsuccessful Hunter / Scuba Dive (nothing of the revealed cards can be taken: the draw step is followed by the "discards ... (no animal)" step with no card kept): the replay
// shows the lightbox for 2 seconds and goes on to the step after the discard by itself, the viewer has no empty frames to click through. Only when the draw frame was reached by
// going forward (back, the timeline, the log and the jump box show every frame); a key press inside the 2 seconds simply goes on, the timer is dropped with the step.
let closeTimer = 0;
const CLOSE_MS = 2000;
function autoClose(forward) {
  clearTimeout(closeTimer); closeTimer = 0;
  if (!forward || FORK || PLAY || SANDBOX || MINIGAME || S.phase !== 0) return;
  const i = S.step, r = revealAt(i);
  if (!r || r.kept || (r.effect !== 'hunter' && r.effect !== 'scuba dive')) return;
  const next = revealAt(i + 1);
  if (!next || next.seat !== r.seat || next.effect !== r.effect || !next.kept || next.kept.length) return;
  if (i + 2 >= S.replay.steps.length) return;
  closeTimer = setTimeout(() => {
    closeTimer = 0;
    if (S.step === i && S.phase === 0 && !S.results) go(i + 2, 0, true);
  }, CLOSE_MS / (Number(S.animationSpeed) || 1));
}
// Lagoon (map 14): after the starting hands each player draws a person sponsor, one step per player (`merge_group` "person<seat>", replay/view.py). They are steps of their own (the
// move bar names each card) but the replay plays them on by itself: reached forward from the deal (or from the first sponsor) with animations on, the next step follows once the
// cards have landed. Not during autoplay (it steps on anyway), not with Animations = None (each is a step to click), dropped with any other move.
let chainTimer = 0;
function personChain(forward) {
  clearTimeout(chainTimer); chainTimer = 0;
  if (!forward || MINIGAME || S.timer || S.animations === 'none') return;
  const i = S.step, next = S.replay.steps[i + 1];
  if (!next || !/^person\d+$/.test(String(next.merge_group || '')) || S.phase !== framesOf(i).length - 1) return;
  const t0 = performance.now(), speed = Number(S.animationSpeed) || 1;
  const tick = () => {
    chainTimer = 0;
    if (S.step !== i || S.results) return;
    if (cardAnimationsBusy() && performance.now() - t0 < 20000) { chainTimer = setTimeout(tick, 80); return; }
    chainTimer = setTimeout(() => { chainTimer = 0; if (S.step === i && !S.results) go(i + 1, 0, true); }, 350 / speed);       // (a short rest on the landed cards, so the text of the step can be read)
  };
  chainTimer = setTimeout(tick, 120);
}
export function go(n, phase = 0, animateCards = false) {
  S.cardMotionForward = animateCards;
  const before = S.step;
  S.results = false;                                                     // (going to any step, the last one included, leaves the results)
  n = Math.max(0, Math.min(S.replay.steps.length - 1, n));
  while (n < S.replay.steps.length - 1 && (mergedAway(S.replay.steps[n]) || dealMerged(n))) n++;          // (a step inside a merged run leads to the end of the run)
  S.step = n;
  S.phase = Math.max(0, Math.min(framesOf(S.step).length - 1, phase));
  autoClose(animateCards);
  personChain(animateCards);
  if (S.step !== before) { S.thresholdMode = null; S.marketMode = null; S.multiplierMode = null; S.assocSpecies = null; S.forkBonus = null; S.assocMode = null; S.forkMenu = null; S.tradeMode = false; S.snapMode = null; S.snapCard = null; S.forkError = ''; draftMarks.clear(); cardMarks.clear(); keepSel.clear(); S.forkSpend = 0; S.skipMode = false; S.animalEnc = null; S.placement = null; }
  render();
}
// BGA's move numbers (the log's `move_id`): a step that joins several BGA moves has `move_from` (its first move) and `move_id` (its last); steps without one (a fork, the sandbox, a live
// game) go on counting from the last number. `show[i]`: the step starts a move that no earlier step has shown (only these have a number in the move list, the others stay blank),
// `cur[i]`: the number of the step for the jump box, `first[i]` / `last[i]`: the BGA moves it holds.
let moveCache = null;                                           // (the numbers depend on the steps and on the merged runs of the point of view only; the page asks for them on every render)
export function moveNumbers() {
  const key = S.replay.steps.length + ':' + S.pov;
  if (moveCache && moveCache.replay === S.replay && moveCache.key === key) return moveCache.value;
  const value = computeMoveNumbers();
  moveCache = { replay: S.replay, key, value };
  return value;
}
function computeMoveNumbers() {
  let top = -1;
  const first = [], last = [], show = [], cur = [];
  for (const s of S.replay.steps) {
    const has = s.move_id !== null && s.move_id !== undefined;
    const hi = has ? Number(s.move_id) : top + 1;
    const mf = mergedFrom(s);
    const lo = mf !== null ? mf : has && s.move_from !== null && s.move_from !== undefined ? Number(s.move_from) : hi;
    first.push(lo); last.push(hi);
    if (mergedAway(s)) { show.push(false); cur.push(hi); continue; }                 // (a step inside a merged run has no number of its own: the run is shown under the number of its first move)
    show.push(lo > top); cur.push(lo > top ? lo : hi);
    top = Math.max(top, hi);
  }
  return { first, last, show, cur };
}
// the step a move number leads to: the first step that holds it, or the next one when BGA has no such move (-1: past the end)
export function stepOfMove(n) {
  const { last } = moveNumbers();
  let i = last.findIndex((x) => x >= n);
  while (i >= 0 && i < last.length - 1 && mergedAway(S.replay.steps[i])) i++;
  return i;
}
// the address of a position: BGA's move number (`#641`), then `.k` for the k-th later step of the same move (`#641.1`), then `.f` for a frame inside the step (`#641.1.2`, a decision frame, playback `frames.js`);
// trailing zeros are left out. Links of the earlier kind (the step index) now mean the move with that number.
export function moveHash(step, phase, results = false) {
  const { cur } = moveNumbers();
  const n = cur[step];
  let sub = 0;
  for (let j = step - 1; j >= 0 && cur[j] === n; j--) sub++;
  if (results) return String(n) + '.' + (sub + 1);                          // (the results sit one step after the last one: #456.12 when the final board is #456.11)
  const f = phase || 0;
  return String(n) + (f ? '.' + sub + '.' + f : sub ? '.' + sub : '');
}
// the [step, frame] an address leads to (a move BGA has no number for leads to the next step, a number past the end to the last step)
export function stepOfHash(h) {
  const [a, b, c] = String(h || '').replace(/^#/, '').split('.').map((x) => parseInt(x, 10));
  if (!Number.isFinite(a)) return [0, 0];
  const { cur } = moveNumbers();
  const same = [];
  cur.forEach((v, i) => { if (v === a) same.push(i); });
  let step;
  if (same.length) step = same[Math.min(Number.isFinite(b) ? b : 0, same.length - 1)];
  else { step = stepOfMove(a); if (step < 0) step = S.replay.steps.length - 1; }
  const results = same.includes(S.replay.steps.length - 1) && b === same.length;          // (one step past the last: the results)
  return [step, Number.isFinite(c) ? c : 0, results];
}
export function buildMoveList() {
  const list = $('moves');
  list.replaceChildren();
  const mv = moveNumbers(), turns = groupsOf(S.replay.steps);
  S.replay.steps.forEach((s, i) => {
    // the step that finishes an action passes the turn in its state, but it still belongs to the player who acted
    const prev = i > 0 ? S.replay.steps[i - 1].state : null;
    const named = S.replay.players.findIndex((pl) => (s.label || '').startsWith(pl.name + ' '));        // (a label that starts with a player's name is that player's)
    const actor = s.actor !== null && s.actor !== undefined ? s.actor : named >= 0 ? named            // the player the log names for this line (a Boost / Clever effect after the turn passed is still the acting player's)
      : prev && s.state.turn > prev.turn && s.state.active_player !== prev.active_player ? prev.active_player : s.state.active_player;
    const li = el('li', 'seat' + actor);
    li.style.borderLeftColor = turns[i] && turns[i].owner === null ? NEUTRAL_COLOR : seatColor(actor);      // (a neutral step, no player's: the draft, the break, the final scoring, log-filter.js `groupsOf`)
    li.append(el('span', 'n', mv.show[i] ? mv.first[i] : ''), stepLabelNode(labelOf(s) || '…', s), engineBadge(s.engine));
    li._step = s;
    if (mergedAway(s)) li.style.display = 'none';                                   // (inside a merged run: the last step of the run is the line)
    li.onclick = () => { go(i); };
    list.append(li);
  });
}
