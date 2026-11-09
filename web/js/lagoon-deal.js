// [module] Lagoon (map 14) in the engine modes (a fork, the sandbox, a live game). The replay shows the person sponsor of each Lagoon player as steps of their own after the starting
// hands ("A draws Spokesperson (Map 14 effect)", `merge_group` "person<seat>", replay/view.py); the engine deals it with the hands (`deal_cards`: 8 cards, then the sponsor searched out
// of the deck, appended to the hand), so the step of the last draft keep arrives with hands of 9 cards. `expandLagoonDeal` splits that step the way the replay does: the step itself
// with the hands without the sponsors, then one step per Lagoon player in seat order with the sponsor. The last step has everything the original had (the legal actions, the engine
// state, the options): only it can be played, the others are passed through by the chain of playback.js `personChain`.
import { S } from './state.js';
import { cardName } from './cards.js';

const HAND = 8;                                                 // (engine/game.py HAND_DEAL: a hand of 9 cards holds the sponsor of Map 14 as its last card)
export const personStep = (s) => /^person\d+$/.test(String(s.merge_group || ''));

const dealt = (before, state) => !!before && before.players.length === 2 && before.players.every((p) => !(p.hand || []).length)
  && state.players.some((p) => String(p.map_id) === '14' && (p.hand || []).length === HAND + 1);

// the state without the sponsors of `seats`: out of the hand and of the initial offer, back in the deck (its size)
function strip(state, seats) {
  if (!seats.length) return state;
  return {
    ...state,
    main_deck: seats.reduce((deck, seat) => { const k = state.players[seat].hand.at(-1); return k && k !== '?' ? [k, ...deck] : deck; }, state.main_deck || []),
    main_deck_size: (state.main_deck_size || 0) + seats.length,
    players: state.players.map((p, i) => (seats.includes(i)
      ? { ...p, hand: p.hand.slice(0, -1), initial_offer: (p.initial_offer || []).length ? p.initial_offer.slice(0, -1) : p.initial_offer }
      : p)),
  };
}

// `before`: the state the first of `steps` follows. Returns the steps with every dealt Lagoon hand split (the same array when there is nothing to split).
export function expandLagoonDeal(before, steps) {
  const out = [];
  let prev = before;
  for (const step of steps) {
    const state = step.state;
    if (!dealt(prev, state)) { out.push(step); prev = state; continue; }
    const seats = state.players.map((p, i) => i).filter((i) => String(state.players[i].map_id) === '14' && state.players[i].hand.length === HAND + 1);
    const names = (S.replay && S.replay.players) || [];
    const quiet = { actions: [], options: null, engine_state: undefined, fork: false, irreversible: false };          // (what only the last step keeps)
    out.push({ ...step, ...quiet, state: strip(state, seats) });
    seats.forEach((seat, n) => {
      const last = n === seats.length - 1, key = state.players[seat].found_person || state.players[seat].hand.at(-1);      // (found_person: the live projection hides the other player's hand but the found sponsor is public)
      const who = (names[seat] && names[seat].name) || 'A player';
      const label = `${who} draws ${key && key !== '?' ? cardName(key) : 'a person sponsor'} (Map 14 effect)`;
      out.push({ ...step, ...(last ? {} : quiet), label, label_pov: null, log_only: true, merge_group: `person${seat}`, state: last ? state : strip(state, seats.slice(n + 1)) });
    });
    prev = state;
  }
  return out;
}
