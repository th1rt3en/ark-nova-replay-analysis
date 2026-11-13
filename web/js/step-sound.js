// [module] The step sound (setting "Animation sounds", Sound tab, off by default), every mode (replay, fork, sandbox, live game), the way BGA plays a short sound for every move. Same rule as the animal
// sounds (animal-sounds.js `stepSounds`): one step forward (Next, the arrow key, autoplay), never a jump. What it plays depends on what the step did to the cards (`stepKind`, from the states
// before and after): a card played (an animal into a zoo, a sponsor into play) = web/sounds/play-card.mp3; a step without played or drawn cards = step.mp3 (a swoosh); every card drawn (a hand
// got bigger: deck, display, snap, the starting hand of 8 + 2 endgame cards) = draw-card.mp3, one hit per card, struck exactly when that card's flight starts: card-motion.js marks the flights
// (`noteCard`) and hands each one to `cardTick` once it runs. Cards that do not fly (animations off, a hidden hand, a search) get their hits on a plain beat. The very first deal of a game (with
// or without an action card draft before it) is introduced by a pause once the step is shown (`PRE_SHUFFLE_MS`), two shuffles (`playShuffle`), then a pause (`DEAL_PAUSE_MS`), and only then do the cards fly (`openingLead`:
// card-motion.js starts the animations of that step that much later). The same goes for the cards dealt onto the display (the first six included: a draw hit each) and for every card that leaves
// a hand for the deck or the display for the discard (a discard, Sunbathing, pouching, Glide: discard-card.mp3, ONE hit per step and player, when the first of that player's cards starts to move). A step whose only cards are such flights
// plays no swoosh; if none of them flies after all, the swoosh plays once the step is drawn.
// With animations off (setting Animations = None, or the system's reduce motion) every step plays only the swoosh: no play, draw or shuffle sounds (and no animal calls, animal-sounds.js).
// The sounds are decoded once into Web Audio buffers (`preloadSounds`) and scheduled on the audio clock, so a hit starts on time; until they are loaded a plain <audio> element plays.
import { S } from './state.js';
import { motionOff } from './motion.js';

const FILE = { step: 'step', draw: 'draw-card', play: 'play-card', shuffle: 'shuffle', discard: 'discard-card', chomp: 'chomp', drip: 'water-drip' };
export const SHUFFLE_MS = 650;                                           // the length of shuffle.mp3 (0.648 s)
const SHUFFLE_GAP_MS = 250;                                              // between the two shuffles (two separate shuffles, not one long one)
export const PRE_SHUFFLE_MS = 500;                                       // the pause between the new screen (the draft's lightbox closed) and the first shuffle
export const DEAL_PAUSE_MS = 500;                                        // the pause between the shuffles and the deal
export const DRAW_GAP_MS = 130;                                          // the beat of hits for cards that do not fly
const rnd = (a, b) => a + Math.random() * (b - a);

let ctx = null, loading = null;
const buffers = {};
function audio() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});           // (the browser allows sound once the page got a click or a key)
  return ctx;
}
export function preloadSounds() {
  const c = audio();
  if (!c || loading) return loading;
  loading = Promise.all(Object.entries(FILE).map(([name, file]) => fetch(new URL('../sounds/' + file + '.mp3', import.meta.url).href)
    .then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).then((buf) => { buffers[name] = buf; }).catch(() => {})));
  return loading;
}
// play a sound in `wait` ms (gain: 0-1 of the volume, rate: playback speed, which also shifts the pitch)
function sound(name, gain = 1, rate = 1, wait = 0) {
  const c = audio(), buf = buffers[name];
  if (c && buf) {
    try {
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = buf; src.playbackRate.value = rate; g.gain.value = S.soundVolume * gain;
      src.connect(g).connect(c.destination);
      src.start(c.currentTime + Math.max(0, wait / 1000 - (c.outputLatency || 0)));          // (the output's own delay is taken off, so the sound is heard at the moment meant)
      return;
    } catch (e) { /* fall through */ }
  }
  preloadSounds();
  setTimeout(() => {                                                     // (not loaded yet: a plain audio element)
    try {
      const a = new Audio(new URL('../sounds/' + FILE[name] + '.mp3', import.meta.url).href);
      a.volume = Math.min(1, S.soundVolume * gain);
      if (rate !== 1) { a.preservesPitch = false; a.playbackRate = rate; }
      a.play().catch(() => {});
    } catch (e) { /* no audio */ }
  }, Math.max(0, wait));
}
const drawHit = (wait) => sound('draw', rnd(0.78, 1), rnd(0.94, 1.07), wait);          // (each hit a touch different in pitch and volume, like a hand flicking cards)
function drawBeat(n, from = 0) { for (let i = 0; i < n; i++) drawHit(from + i * DRAW_GAP_MS + (i ? rnd(-0.25, 0.25) * DRAW_GAP_MS : 0)); }

const len = (x) => (x || []).length;
// what the step from `before` to `after` did: {kind: 'shuffle' (the first hand of the game is dealt) | 'deal' (the other player's starting hand) | 'play' | 'draw' | 'cards' (cards left a
// hand or the display changed: their flights sound) | 'step', n: the number of cards drawn (the largest growth of one player's hand + endgame hand), out: the largest number of cards that left one player's hand}
export function stepKind(before, after) {
  const a = (before && before.players) || [], b = (after && after.players) || [];
  let played = false, dealt = false, first = false, moved = false, n = 0, out = 0;
  b.forEach((p, i) => {
    const q = a[i] || {}, grew = Math.max(0, len(p.hand) - len(q.hand)) + Math.max(0, len(p.endgame_hand) - len(q.endgame_hand));
    if (len(p.animals) > len(q.animals) || len(p.sponsors) > len(q.sponsors)) played = true;
    n = Math.max(n, grew);
    if (len(p.hand) < len(q.hand) || len(p.endgame_hand) < len(q.endgame_hand)) moved = true;
    out = Math.max(out, Math.max(0, len(q.hand) - len(p.hand)) + Math.max(0, len(q.endgame_hand) - len(p.endgame_hand)));
    if (len(q.hand) === 0 && len(p.hand) >= 8) { dealt = true; if (a.every((o) => len(o.hand) === 0)) first = true; }   // (a starting hand; the first one: nobody holds a card yet)
  });
  if (JSON.stringify((before && before.display) || []) !== JSON.stringify((after && after.display) || [])) moved = true;
  return { kind: first ? 'shuffle' : dealt ? 'deal' : played ? 'play' : n ? 'draw' : moved ? 'cards' : 'step', n, out };
}

// The card flights of the step being shown (set by playStep, used by card-motion.js while it renders the step).
let draws = null;
export const openingLead = () => (draws ? draws.lead : 0);
export function noteCard(kind) {                                         // a card flight that will strike a hit ('draw' into a hand, 'deal' onto the display, 'discard')
  if (!draws) return false;
  draws.any++;
  if (kind === 'draw') draws.flying++;
  if (kind.startsWith('discard')) { if (draws[kind]) return false; draws[kind] = true; }   // (one discard hit per step and player, for the first card that leaves: 'discard' = the viewer's own hand and the display, 'discardO' = the other player's hand; the starting discard of both players is one step)
  return true;
}
const discardHit = (wait) => sound('discard', rnd(0.8, 1), rnd(0.95, 1.06), wait);
export function cardTick(anim, kind) {                                   // the flight `anim` was just started (card-motion.js): its hit sounds when the card starts to move
  anim.ready.then(() => {
    if (anim.playState === 'idle') return;                               // (cancelled: the viewer moved on)
    const wait = Math.max(0, (anim.effect.getTiming().delay || 0) - (anim.currentTime || 0));
    if (kind.startsWith('discard')) discardHit(wait); else drawHit(wait);
  }, () => {});
}
// A sound struck `ms` after the animation `anim` starts (ms at speed 1, so at the animation's own clock: it follows the animation speed), `lead` ms of it come before its impact (the sound starts that much earlier, so the impact lands on `ms`).
// Only with the step sound on and the animations on. Used by card-motion.js `soundAt`: the Shark Attack's two chomps (chomp.mp3, impact 60 ms into the file).
export function animTick(anim, name, ms, gain = 1, lead = 0) {
  if (!S.stepSound || motionOff()) return;
  anim.ready.then(() => {
    if (anim.playState === 'idle') return;                               // (cancelled: the viewer moved on)
    const speed = Math.max(.1, Number(S.animationSpeed) || 1), wait = (anim.effect.getTiming().delay || 0) - (anim.currentTime || 0) + ms / speed - lead;
    sound(name, gain, 1, Math.max(0, wait));
  }, () => {});
}
export function playStep(k = { kind: 'step', n: 0 }) {
  preloadSounds();
  if (motionOff()) { sound('step'); return; }                           // (animations off: only the step sound)
  if (k.kind === 'play' || k.kind === 'step') sound(k.kind);
  const lead = k.kind === 'shuffle' ? PRE_SHUFFLE_MS + SHUFFLES_MS + DEAL_PAUSE_MS : 0, d = { lead, flying: 0, any: 0 };
  if (k.kind === 'shuffle') requestAnimationFrame(() => requestAnimationFrame(playShuffle));          // (once the step is on screen, the lightbox of the draft closed: the same two frames after which the card animations start)
  draws = d;
  setTimeout(() => {                                                     // (after the step has been drawn: the drawn cards that did not fly get their hits on a plain beat)
    if (draws === d) draws = null;
    if (d.flying < k.n) drawBeat(k.n - d.flying, lead);
    else if (k.kind === 'cards' && !d.any) sound('step');                // (nothing flew after all: the swoosh)
  }, 0);
}
// two separate shuffles, the second a little softer (SHUFFLES_MS long)
const SHUFFLES_MS = 2 * SHUFFLE_MS + SHUFFLE_GAP_MS;
function playShuffle() {
  sound('shuffle', 1, 1, PRE_SHUFFLE_MS);
  sound('shuffle', 0.9, 1, PRE_SHUFFLE_MS + SHUFFLE_MS + SHUFFLE_GAP_MS);
}
export const stepSoundOn = () => !!S.stepSound;

// One step BACK (the arrow key, the Previous button; never a jump): the sound of the step that is taken back, turned around. `k` = stepKind(the older state, the newer one), the kind of the step going forward:
// the cards fly back (card-motion.js `runBack`) and each flight strikes its own hit when it starts (`noteBack`): leaving a hand / the display for the deck = the discard sound, coming into a hand or back onto the display = the draw sound.
// If no card flies (the hand not on show, nothing visible moved), the same idea on a plain beat: cards drawn -> ONE discard hit (several discards strike one discard sound), a card played -> a draw hit, cards discarded -> draw hits (one per card), a step without cards -> the swoosh. The starting deal counts as a draw. With animations off only the swoosh, as forward.
let backFlights = null;
export function noteBack() { if (!backFlights) return false; backFlights.any++; return true; }          // (card-motion.js `runBack`: a flight back that strikes its own hit, `cardTick`)
export function playBack(k = { kind: 'step', n: 0, out: 0 }) {
  preloadSounds();
  if (motionOff()) { sound('step'); return; }
  const d = { any: 0 }; backFlights = d;
  setTimeout(() => {                                                     // (after the step has been drawn: if no card flew back after all, the same sounds on a plain beat, or the swoosh)
    if (backFlights === d) backFlights = null;
    if (d.any) return;
    const beat = (hit, n) => { for (let i = 0; i < n; i++) hit(i * DRAW_GAP_MS + (i ? rnd(-0.25, 0.25) * DRAW_GAP_MS : 0)); };
    if (k.kind === 'draw' || k.kind === 'deal' || k.kind === 'shuffle') discardHit(0);          // (several discards: one discard sound, the global rule)
    else if (k.kind === 'play') drawHit(0);
    else if (k.kind === 'cards') beat(drawHit, Math.max(1, k.out || 1));
    else sound('step');
  }, 0);
}
