// [module] Frames of the replay: every step is shown in up to three consecutive frames, like BGA (what happened, then what has to be decided next), never at the same time:
//   'text'      the step text (what just happened); the board is the one after the step. A step that merges several lines of one BGA move (the draft's last keep with
//               the starting draw, the initial discards with the refill of the display: lines joined with " · ") has one text frame per group of lines ('text', 'text1', ...)
//   'draft'     the steps of the action card draft (Marine Worlds): the draft bar alone - the cards on offer and the choices made so far - instead of the step text
//   'gate'      only on the step that ends a turn: "<player> must confirm or restart your turn" (greyed out buttons)
//   'decision'  what the rules engine says is pending after the step (the next player's choice of an action card, the effect to resolve, the building to place ...)
//   'both'      fork / sandbox only (the bar is the way to play, so it stays with the step text)
// Simultaneous actions (the starting hand): the move bar follows one player, the point of view's, else the one whose zoo is on the left (seat 0): only that player's
// decision frame exists and only that player's lines of a merged text are shown. (The draft shows everything: both players' offers, with a point of view only its own.)
// In a replay (not a live game) the decision frame exists only at the start of a turn ("X must choose an action card"): any other decision has already been taken, the next step shows it.
// A decision frame exists only if the bar has something to show, and it is left out when the previous step of the same BGA move (`move_id`) already showed the same decision
// (the engine keeps a pending decision attached to every line of a move: a break, a run of effects).
import { FORK, PLAY, SANDBOX, S } from './state.js';
import { labelOf, povState } from './pov.js';
import { actionBar, draftOpen, prioritySeat, turnEnds } from './action-bar.js';
import { revealAt } from './reveal.js';

let cache = new Map(), cachePov = null, cacheReplay = null;
const virt = new Map();
// The starting hands are one step for the viewer (playback.js `dealMerged`): the move bar names both draws in one sentence ("A and B draw 8 cards and 2 endgame cards"; with different
// counts "A draws ..., B draws ..."). The move list keeps one line per player.
// the two discards of the starting hand are one line of the step's label ("A discards 4 cards · B discards 4 cards · The display is replenished", simultaneous): the bar says
// "A and B discard 4 cards · The display is replenished", the names in seat order
function discardsOf(label) {
  const names = S.replay.players.map((p) => p.name), parts = String(label || '').split(' · ');
  const own = (p) => names.findIndex((n) => p.startsWith(n + ' discards '));
  const disc = parts.filter((p) => own(p) >= 0);
  if (disc.length !== 2 || own(disc[0]) === own(disc[1])) return label;
  const [x, y] = disc.slice().sort((a, b) => own(a) - own(b)), rest = (p) => p.slice(names[own(p)].length + ' discards '.length);
  const both = rest(x) === rest(y) ? `${names[own(x)]} and ${names[own(y)]} discard ${rest(x)}` : `${x}, ${y}`;
  return [both, ...parts.filter((p) => !disc.includes(p))].join(' · ');
}
function barLabel(i) {
  const steps = S.replay.steps, s = steps[i];
  if (!(s.log_only && steps[i - 1] && steps[i - 1].log_only && steps[i - 1].merge_group === s.merge_group)) return discardsOf(labelOf(s));
  if (s.merge_group === 'discard') { let j = i; while (steps[j - 1] && steps[j - 1].log_only && steps[j - 1].merge_group === 'discard') j--; return discardsOf(steps.slice(j, i + 1).map((x) => labelOf(x)).join(' · ')); }
  const a = String(labelOf(steps[i - 1]) || ''), b = String(labelOf(s) || ''), names = S.replay.players.map((p) => p.name);
  const split = (t) => { const n = names.find((x) => t.startsWith(x + ' ')); return n ? [n, t.slice(n.length + 1)] : null; };
  const x = split(a), y = split(b);
  if (x && y && x[1] === y[1] && /^draws /.test(x[1])) return `${x[0]} and ${y[0]} draw ${x[1].slice(6)}`;
  return `${a}, ${b}`;
}
const frameName = () => framesOf(S.step)[S.phase] || 'text';
export const frameKind = () => (FORK || SANDBOX ? 'both' : frameName().replace(/\d+$/, ''));
// the text of the frame on show (a text frame of a step that merges several lines: its group of lines)
// The bar says only how many cards a Perception / Hunter / Scuba Dive / Scavenging draws ("A draws 8 cards for Hunter effect"), the names are in the lightbox and in the Log (the step's own label keeps them; only the bar of main.js uses this, the card motion still reads the full text).
// Card names have no comma in them, so the count is the number of items of the list; the owner's wording in a live game is "You draw ...", an opponent's already is "X draws 3 cards".
const DRAWN = /^(.+? draws?) (.+?)( for (?:perception|hunter|scuba dive|scavenging) effect)$/i;
const KEPT = /^(.+? keeps? .+?) and discards? (.+?)( for (?:perception|hunter|scuba dive|scavenging) effect)$/i;      // ("X keeps A and discard B, C for Hunter effect": the kept card by name, the discarded ones as a count)
const countOf = (list) => { const n = list.split(', ').length; return `${n} card${n === 1 ? '' : 's'}`; };
export const shortDraw = (text) => {
  if (typeof text !== 'string') return text;
  const k = KEPT.exec(text);
  if (k) return `${k[1]} and discards ${/^\d+ cards?$/.test(k[2]) ? k[2] : countOf(k[2])}${k[3]}`;
  const m = DRAWN.exec(text);
  if (!m || /^\d+ cards?$/.test(m[2])) return text;
  return `${m[1]} ${countOf(m[2])}${m[3]}`;
};
export function frameText() {
  const s = S.replay.steps[S.step], label = barLabel(S.step) || '(state update)';
  return FORK || SANDBOX ? label : textParts(S.step)[+(frameName().replace(/^\D+/, '') || 0)] ?? label;
}
// the lines of a merged label (joined with " · "), grouped by what they say (second word: draw, discard, keeps ...); where one group holds lines of both players
// (they act simultaneously) only the followed player's are kept
function textParts(i) {
  const label = String(barLabel(i) || '(state update)'), parts = label.split(' · ');
  if (parts.length < 2 || S.replay.steps[i].log_only || S.replay.steps[i].state.phase !== 'setup') return [label];       // (outside the setup, " · " joins the steps that `view.py` folded into this one because nothing visible changed: one frame, the whole text)
  const names = S.replay.players.map((p) => p.name), owner = (p) => names.findIndex((n) => p.startsWith(n + ' '));
  // the verb of a line ("draw", "keeps", ...): after the player's name, which may have several words ("Papa Emeritus V draw ...")
  const verb = (p) => { const n = names.find((x) => p.startsWith(x + ' ')); return ((n ? p.slice(n.length + 1) : p).split(' ')[0]) || ''; };
  const groups = [];
  for (const p of parts) {
    const last = groups[groups.length - 1];
    if (last && verb(last[0]) === verb(p)) last.push(p); else groups.push([p]);
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
  if (S.pov !== cachePov || S.replay !== cacheReplay) { cache = new Map(); virt.clear(); cachePov = S.pov; cacheReplay = S.replay; }       // (another replay on show: a mini game after the answer)
  let f = cache.get(i);
  if (f) return f;
  const steps = S.replay.steps;
  f = textParts(i).map((_, k) => 'text' + (k || ''));
  const st = steps[i].state;
  if (draftOpen(st, i) && probe(i, 'draft')) f[0] = 'draft';
  else if (revealAt(i)) f[0] = 'reveal';                   // (Perception / Scavenging / Hunter / Scuba Dive: the cards of the effect in a lightbox, on the step that draws them and on the one that keeps some)       // (the first group of lines of a merged step is the draft's keep)
  if (f[0] === 'reveal' && steps[i].horse) f = steps[i].horse.kept ? ['reveal', 'reveal1', 'text'] : ['reveal', 'text'];                // (Horse Whisperer: the pile with the animals, then the one taken, then the step text; a play with no animal in the pile: the pile, then the text)
  if (f[0] === 'reveal' && steps[i].adapt) f = steps[i].adapt.discarded ? ['reveal', 'text'] : ['reveal'];                                  // (Adapt: the endgame cards with the new ones marked / the discarded ones struck out, then the step text)
  if (f[0] === 'reveal' && steps[i].assertion) f = ['reveal', 'reveal1', 'text'];                 // (Assertion: the base projects on offer, then the one taken, then the step text with the card in the hand)
  if (f[0] === 'reveal' && steps[i].resistance && steps[i].resistance.kept) f.push('text');      // (Resistance: the keep line is two frames, the lightbox with the chosen card, then the same line with the lightbox closed and the card among the endgame cards)
  if (PLAY && turnEnds(i)) f.push('gate');                  // (a live game only: a replay has nothing to confirm, the frame is skipped)
  const sig = probe(i, 'decision');
  const again = i > 0 && probe(i - 1, 'decision') === sig && (steps[i - 1].move_id === steps[i].move_id || JSON.stringify(steps[i - 1].options) === JSON.stringify(steps[i].options));       // (the decision of the step before, still pending in the engine's state while the log resolves it: nothing new to show)
  const chose = !PLAY && /chooses action card/.test(String(labelOf(steps[i]) || ''));         // (the replay: what the player has to do inside the action card just chosen is the next step, not a frame of its own)
  const o = steps[i].options, turnStart = o ? o.prompt === 'choose_action_card' && !o.only : st.phase === 'turn' || st.phase === 'final_turns';       // (the replay: only the start of a turn keeps its decision frame, "X must choose an action card"; every other choice is already made in the next step)
  const lastOfRun = i + 1 >= steps.length || probe(i + 1, 'decision') !== sig || !(steps[i + 1].move_id === steps[i].move_id || JSON.stringify(steps[i + 1].options) === JSON.stringify(steps[i].options));       // (the replay shows the turn start on the last step that still has it: the display refill of BGA's next move comes before "X must choose an action card", as in a live game)
  if (sig && !chose && (PLAY ? !again : turnStart && lastOfRun)) f.push('decision');
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
  if (draftOpen(base, S.step)) {
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
  // Perception / Scavenging / Hunter / Scuba Dive: while the lightbox shows the cards of the effect they are not in the hand yet (the hand, its counter in the player's box and the dock show
  // the hand without them); the data (and the engine, as on BGA) counts them as drawn at once, the next frame has them in the hand
  if (frameKind() === 'reveal') {
    const r = revealAt(S.step);
    if (r) {
      const key = S.step + 'r';
      let v = virt.get(key);
      if (!v) {
        if (r.effect === 'resistance') {                                   // the chosen endgame card is not among the endgame cards yet (the cards drawn never were: nothing to take out on the draw step)
          const out = r.kept || [];
          v = { ...base, players: base.players.map((q, i) => {
            if (i !== r.seat || !out.length) return q;
            const lines = q.endgame_card_lines || [], gone = lines.filter((l) => out.includes(l[0])).reduce((a, l) => a + (+l[1] || 0), 0);
            return { ...q, endgame_hand: (q.endgame_hand || []).filter((k) => !out.includes(k)), endgame_card_lines: lines.filter((l) => !out.includes(l[0])), endgame_cards: Math.max(0, (q.endgame_cards || 0) - gone) };
          }) };
          delete v.__id; virt.set(key, v);
          return v;
        }
        if (r.effect === 'adapt') {                                       // Adapt: endgame cards only. The discard frame shows the endgame cards the player held before the effect (the lightbox closes, then the discarded card goes and the drawn one arrives)
          const was = r.out && S.step > 0 ? steps[S.step - 1].state.players[r.seat] : null;
          if (!was) return base;
          v = { ...base, players: base.players.map((q, i) => (i === r.seat ? { ...q, endgame_hand: (was.endgame_hand || []).slice(), endgame_card_lines: was.endgame_card_lines, endgame_cards: was.endgame_cards, endgame_card_pts: was.endgame_card_pts } : q)) };
          delete v.__id; virt.set(key, v);
          return v;
        }
        if (r.effect === 'horse') {                                      // the animal taken is not in the hand yet and still lies in the pile
          v = { ...base, main_discard: r.pile.slice(), players: base.players.map((q, i) => (i === r.seat ? { ...q, hand: q.hand.filter((k, j) => !(r.held.includes(k) && q.hand.indexOf(k) === j)) } : q)) };
          delete v.__id; virt.set(key, v);
          return v;
        }
        const out = (r.held || (r.kept === null ? r.cards : r.kept)).slice(), hand = base.players[r.seat].hand.filter((k) => { const j = out.indexOf(k); if (j >= 0) { out.splice(j, 1); return false; } return true; });
        v = { ...base, players: base.players.map((q, i) => (i === r.seat ? { ...q, hand } : q)) };
        delete v.__id; virt.set(key, v);
      }
      return v;
    }
  }
  return base;
}
