// [module] Frames of the replay: every step is shown in up to three consecutive frames, like BGA (what happened, then what has to be decided next), never at the same time:
//   'text'      the step text (what just happened); the board is the one after the step. A step that merges several lines of one BGA move (the draft's last keep with
//               the starting draw, the initial discards with the refill of the display: lines joined with " · ") has one text frame per group of lines ('text', 'text1', ...)
//   'draft'     the steps of the action card draft (Marine Worlds): the draft bar alone - the cards on offer and the choices made so far - instead of the step text
//   'gate'      only on the step that ends a turn: "<player> must confirm or restart your turn" (greyed out buttons)
//   'decision'  what the rules engine says is pending after the step (the next player's choice of an action card, the effect to resolve, the building to place ...)
//   'both'      fork / sandbox only (the bar is the way to play, so it stays with the step text)
// Simultaneous actions (the starting hand): the move bar follows one player, the point of view's, else the one whose zoo is on the left (seat 0): only that player's
// decision frame exists and only that player's lines of a merged text are shown. (The draft shows everything: both players' offers, with a point of view only its own.)
// A decision frame exists only if the bar has something to show, and it is left out when the previous step of the same BGA move (`move_id`) already showed the same decision
// (the engine keeps a pending decision attached to every line of a move: a break, a run of effects).
import { FORK, SANDBOX, S } from './state.js';
import { labelOf, povState } from './pov.js';
import { actionBar, prioritySeat, turnEnds } from './action-bar.js';

let cache = new Map(), cachePov = null;
const virt = new Map();
const frameName = () => framesOf(S.step)[S.phase] || 'text';
export const frameKind = () => (FORK || SANDBOX ? 'both' : frameName().replace(/\d+$/, ''));
// the text of the frame on show (a text frame of a step that merges several lines: its group of lines)
export function frameText() {
  const s = S.replay.steps[S.step], label = labelOf(s) || '(state update)';
  return FORK || SANDBOX ? label : textParts(S.step)[+(frameName().replace(/^\D+/, '') || 0)] ?? label;
}
// the lines of a merged label (joined with " · "), grouped by what they say (second word: draw, discard, keeps ...); where one group holds lines of both players
// (they act simultaneously) only the followed player's are kept
function textParts(i) {
  const label = String(labelOf(S.replay.steps[i]) || '(state update)'), parts = label.split(' · ');
  if (parts.length < 2) return [label];
  const names = S.replay.players.map((p) => p.name), owner = (p) => names.findIndex((n) => p.startsWith(n + ' '));
  const groups = [];
  for (const p of parts) {
    const last = groups[groups.length - 1];
    if (last && (last[0].split(' ')[1] || '') === (p.split(' ')[1] || '')) last.push(p); else groups.push([p]);
  }
  return groups.map((g) => {
    const owners = [...new Set(g.map(owner).filter((o) => o >= 0))];
    if (owners.length > 1) { const seat = prioritySeat(owners); g = g.filter((p) => owner(p) === seat || owner(p) < 0); }
    return g.join(' · ');
  });
}

// what the bar of `kind` would say on step i (a signature of its content), or null when it has nothing to show
function probe(i, kind) {
  const saved = [S.step, S.forkClaimed, S.forkGate], bar = document.createElement('div');
  S.step = i;
  try { actionBar(povState(S.replay.steps[i].state), kind, bar); } finally { [S.step, S.forkClaimed, S.forkGate] = saved; }
  return bar.hidden ? null : bar.textContent + '|' + bar.querySelectorAll('.abtn').length;
}
export function framesOf(i) {
  if (FORK || SANDBOX) return ['both'];
  if (S.pov !== cachePov) { cache = new Map(); cachePov = S.pov; }
  let f = cache.get(i);
  if (f) return f;
  const steps = S.replay.steps;
  f = textParts(i).map((_, k) => 'text' + (k || ''));
  const st = steps[i].state;
  if (st.phase === 'setup' && st.draft && ['pick1', 'pick2', 'keep'].includes(st.draft.stage) && probe(i, 'draft')) f[0] = 'draft';       // (the first group of lines of a merged step is the draft's keep)
  if (turnEnds(i)) f.push('gate');
  const sig = probe(i, 'decision');
  if (sig && !(i > 0 && steps[i - 1].move_id === steps[i].move_id && probe(i - 1, 'decision') === sig)) f.push('decision');
  cache.set(i, f);
  return f;
}

// The state the boards show in the frame on show. Normally the state of the step. The draft frame of a step that also deals the starting hands (the last keep and the draw
// are one step in the data) shows the state before that step with the draft of the step: the three cards are kept first, the 8 starting cards appear in the next frame.
export function frameState() {
  const steps = S.replay.steps, s = steps[S.step];
  let base = s.state;
  if (frameKind() === 'draft' && S.step > 0 && textParts(S.step).length > 1) {
    let v = virt.get(S.step);
    if (!v) { v = { ...steps[S.step - 1].state, draft: s.state.draft }; delete v.__id; virt.set(S.step, v); }       // (no __id: povState gives it its own cache entry)
    base = v;
  }
  // Marine Worlds: the order of the action cards is only drawn at random once the action cards are chosen, together with the starting hand (as on BGA). Until then the players' info boxes
  // show nothing (`actions_hidden`: the boxes keep their size, the cards are invisible); from the frame that deals the starting hand on, the real order (the one of the first turn state) is shown.
  if (base.phase === 'setup' && base.draft && ['pick1', 'pick2', 'keep'].includes(base.draft.stage)) {
    const dealt = textParts(S.step).length > 1 && S.phase >= 1;        // (every frame after the keep: the draw lines, then the discard decision)
    const key = S.step + (dealt ? 'd' : 'h') + (base === s.state ? '' : 'v');
    let v = virt.get(key);
    if (!v) {
      const real = dealt && (steps.slice(S.step + 1).find((x) => x.state.phase !== 'setup') || {}).state;
      v = { ...base, actions_hidden: !real, players: base.players.map((p, i) => (real ? { ...p, action_cards: real.players[i].action_cards } : p)) };
      delete v.__id; virt.set(key, v);
    }
    return v;
  }
  return base;
}
