// [module] Animal sounds (setting "Animal sounds", Sound tab; off by default): an animal that enters a player's zoo plays its call. Every mode (replay, fork, sandbox, live game), but only
// when the board moves on by one step (Next, the arrow key, autoplay, a new move of a live game or a fork): a jump over many steps stays silent. The sounds and the card -> sound list are
// taken from the browser extension "Ark Nova Ambience - Animal Sounds" (github.com/Wilvarin/ark-nova-fun, used with the author's permission): 100 files in web/sounds/animals/, 154 of the
// 160 animals (401-560, the Marine Worlds variants `_MW` share the number); 6 animals have no call (Common Wombat, African Spurred Tortoise, Common Agama, Veiled Chameleon, European
// Pond Turtle, Gould's Monitor). With the no-snake mode on (nosnake.js), the snakes and the Slow Worm stay silent.
import { S, MINIGAME, FORK, PLAY, SANDBOX } from './state.js';
import { playStep, playBack, stepKind } from './step-sound.js';
import { motionOff } from './motion.js';
import { SNAKE_KEYS } from './nosnake.js';

const ANIMAL_DELAY = 250;                                                // ms between the step sound and an animal's call
const SOUND = {
  401: 'cheetah', 402: 'lion', 403: 'leopard', 404: 'caracal', 405: 'fox', 406: 'tiger', 407: 'tiger', 408: 'grizzly-bear',
  409: 'sun-bear', 410: 'generic-small', 411: 'grizzly-bear', 412: 'jaguar', 413: 'cougar', 414: 'generic-small', 415: 'raccoon', 416: 'sun-bear',
  417: 'wolf', 418: 'lynx', 419: 'badger', 420: 'stoat', 421: 'seal', 422: 'sea-lion', 423: 'sea-lion', 424: 'dingo',
  425: 'tasmanian-devil', 426: 'elephant', 427: 'white-rhino', 428: 'giraffe', 429: 'zebra', 430: 'hippo', 431: 'elephant', 432: 'white-rhino',
  433: 'giant-pand', 434: 'red-panda', 435: 'tapir', 436: 'american-bison', 437: 'muskox', 438: 'deer', 439: 'llama', 440: 'tapir',
  441: 'american-bison', 442: 'moose', 443: 'deer', 444: 'goat', 445: 'generic-small', 446: 'dugong', 447: 'kangaroo', 448: 'koala',
  449: 'platypus', 451: 'proboscis-monkey', 452: 'senegal-bushbaby', 453: 'collared-mangabey', 454: 'lemur', 455: 'mantled-guereza', 456: 'barbary-macaque', 457: 'monkey',
  458: 'barbary-macaque', 459: 'barbary-macaque', 460: 'dusky-leaf-monkey', 461: 'generic-small', 462: 'northern-plains-gray-langur', 463: 'capuchin-monkey', 464: 'spider-monkey', 465: 'golden-lion-tamarin',
  466: 'boliwian-red-howler', 467: 'ecuadorian-squirrel-monkey', 468: 'golden-lion-tamarin', 469: 'alligator-growl', 470: 'cobra', 472: 'komodo-dragon', 474: 'indian-rock-python', 475: 'king-cobra',
  476: 'komodo', 478: 'gecko', 479: 'american-alligator', 480: 'broad-snouted-caiman', 481: 'galapagos-giant-tortoise', 482: 'snake', 483: 'snake', 485: 'cobra',
  486: 'gecko', 487: 'cobra', 488: 'snake', 489: 'saltwater-crocodile', 491: 'frilled-lizard', 492: 'snake', 493: 'thorny-devil', 494: 'ostrich',
  495: 'secretary-bird', 496: 'marabou', 497: 'flamingo', 498: 'shoebill', 499: 'vulture-2', 500: 'vulture-2', 501: 'indian-peafowl', 502: 'great-hornbill',
  503: 'snowy-owl', 504: 'condor', 505: 'bald-eagle', 506: 'vulture-2', 507: 'greater-rhea', 508: 'macaw', 509: 'bald-eagle', 510: 'white-stork',
  511: 'flamingo', 512: 'owl', 513: 'owl', 514: 'emu', 515: 'pelican', 516: 'cassowary', 517: 'kookaburra', 518: 'bird-tropical',
  519: 'goat', 520: 'sheep', 521: 'horse', 522: 'donkey', 523: 'rabbit', 524: 'pig', 525: 'guinea-pig', 526: 'llama',
  527: 'parrot', 528: 'kangaroo', 529: 'water-bubble', 530: 'water-bubble', 531: 'water-bubble', 532: 'water-bubble', 533: 'water-bubble', 534: 'water-bubble',
  535: 'water-bubble', 536: 'water-bubble', 537: 'water-bubble', 538: 'water-bubble', 539: 'water-bubble', 540: 'water-bubble', 541: 'water-splash', 542: 'water-splash',
  543: 'water-splash', 544: 'shark-2', 545: 'shark-2', 546: 'shark-2', 547: 'water-bubble', 548: 'water-bubble', 549: 'water-splash', 550: 'water-bubble',
  551: 'water-splash', 552: 'water-splash', 553: 'water-splash', 554: 'african-penguin', 555: 'golden-snub-monkey', 556: 'wolverine', 557: 'pig', 558: 'monkey',
  559: 'lemur', 560: 'eagle',
};
const SILENT_SNAKES = new Set([...SNAKE_KEYS.filter((k) => k[0] === 'A').map((k) => Number(k.slice(1))), 488]);          // (the snake animals of the no-snake mode, and the Slow Worm: it hisses)
const recent = new Set();                                                // (one call of the same sound per 2 s: two of the same kind in one step are heard once)
let last = null;                                                          // the step the board showed before: { replay, step }

function play(key) {
  if (recent.has(key)) return;
  recent.add(key); setTimeout(() => recent.delete(key), 2000);
  try {
    const a = new Audio(new URL('../sounds/animals/' + key + '.m4a', import.meta.url).href);
    a.volume = Math.min(1, S.soundVolume * S.animalVolume * 2);          // (Volume x Animal volume; both at 50 %, the defaults, are the level the calls always had)
    a.play().catch(() => {});                                          // (the browser refuses sound before the first click on the page: then nothing plays)
  } catch (e) { /* no audio */ }
}
// Ctrl + S (main.js): the Shoebill's call, at any time and whatever the setting says
export const playShoebill = () => play('shoebill');
const numberOf = (key) => { const m = /^A(\d{3})/.exec(String(key || '')); return m ? Number(m[1]) : null; };
// the seat whose animals call with "Calls for: only me": the player of a live game, the followed player (the eye) of a replay; a fork or the sandbox plays both seats (null = every seat)
const mySeat = () => (PLAY ? S.play.seat : !FORK && !SANDBOX && !MINIGAME && S.pov !== null ? S.pov : null);
// the animals that are in a zoo in `after` and were not in `before` (per player, so an animal that changes hands counts too)
function arrivals(before, after, only = null) {
  const out = [];
  (after.players || []).forEach((p, seat) => {
    if (only !== null && seat !== only) return;                          // (setting "Calls for" = only me)
    const had = [...(((before.players || [])[seat] || {}).animals || [])];
    for (const key of p.animals || []) { const i = had.indexOf(key); if (i >= 0) had.splice(i, 1); else out.push(key); }
  });
  return out;
}
// called by playback.js `go` each time (it also plays the step sound of step-sound.js) the board is set to a step; `forward` = the move is a step forward (Next, autoplay, a merged run of steps)
export function stepSounds(forward) {
  const prev = last, n = S.step;
  last = { replay: S.replay, step: n };
  const back = S.backStep;                                                // (set by playback.js `stepBy` around its `go`: one step back, not a jump; card-motion.js reads it too, while the step is drawn)
  if (MINIGAME || !prev || prev.replay !== S.replay) return;
  if (back && n < prev.step) {                                            // (one step back: the sound of that step, turned around, step-sound.js `playBack`; no animal calls)
    const o = S.replay.steps[n], nw = S.replay.steps[prev.step];
    if (S.stepSound) playBack(o && nw && o.state && nw.state ? stepKind(o.state, nw.state) : undefined);
    return;
  }
  if (n <= prev.step) return;
  if (!forward && n !== prev.step + 1) return;                            // (a jump: no sound)
  const a = S.replay.steps[prev.step], b = S.replay.steps[n];
  if (S.stepSound) playStep(a && b && a.state && b.state ? stepKind(a.state, b.state) : undefined);   // (the step sound, step-sound.js: every mode)
  if (!S.animalSounds || motionOff()) return;                             // (animations off: no animal calls, only the step sound)
  const wait = S.stepSound ? ANIMAL_DELAY : 0;                            // the calls come after the step sound
  if (!a || !b || !a.state || !b.state) return;
  for (const key of arrivals(a.state, b.state, S.animalFor === 'me' ? mySeat() : null)) {
    const num = numberOf(key);
    if (num === null || !SOUND[num]) continue;
    if (SILENT_SNAKES.has(num) && ((S.noSnake && S.noSnake !== 'show') || !S.snakeSounds)) continue;          // (the no-snake mode, or the setting "Snake sounds" off)
    wait ? setTimeout(play, wait, SOUND[num]) : play(SOUND[num]);
  }
}
