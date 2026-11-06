// [module] The endgame discard of the replay (a player reaches 10 conservation: "X triggers scoring card discard by reaching 10 conservation points", then every player with more than one endgame
// card discards one: "Y discards 1 card (scoring card)" / "Y discards <card> (scoring card)"). For the followed player the window runs from the trigger step to their own discard step,
// both included; `dock.js` shows the endgame cards of the hand inside it and goes back to the cards that were open before when it ends (a player with one endgame card discards nothing: no window).
import { S } from './state.js';

const TRIGGER = /triggers scoring card discard/;
const SCAN = 14;                                              // (how many steps after the trigger the own discard is looked for)
let cache = null;
export function endgameDiscardAt(i, seat) {
  if (!S.replay || seat == null || seat < 0) return false;
  if (!cache || cache.replay !== S.replay || cache.seat !== seat) {
    const steps = S.replay.steps, name = S.replay.players[seat].name, inside = new Uint8Array(steps.length);
    for (let t = 0; t < steps.length; t++) {
      if (!TRIGGER.test(String(steps[t].label || ''))) continue;
      for (let j = t + 1; j < Math.min(steps.length, t + SCAN); j++) {
        const l = String(steps[j].label || '');
        if (l.startsWith(name + ' discards ') && l.includes('(scoring card)')) { for (let k = t; k <= j; k++) inside[k] = 1; break; }
      }
    }
    cache = { replay: S.replay, seat, inside };
  }
  return !!cache.inside[i];
}
