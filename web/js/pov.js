// [module] Point of view (both players / seat 0 / seat 1): what is hidden from the other player, the eyes that switch it.
import { FORK, PLAY, S, params, table } from './state.js';
import { labelNode } from './log-labels.js';
import { render } from './main.js';

// The eyes are remembered per table in localStorage ('pov:<table>': 'all' | '0' | '1'), also over F5; the first time only the first player's eye is open (his zoo is the left one).
// A fork (opened in a new tab from a replay) does not use the storage: it takes the eyes of the replay from the URL (`&pov=`, see `povParam`) and changes them only in its own tab.
const POV_KEY = 'pov:' + (table || 'local');
const readPov = (v) => (v === 'all' ? null : v === '0' ? 0 : v === '1' ? 1 : undefined);
export const povParam = () => (S.pov === null ? 'all' : String(S.pov));
{ let v; try { v = readPov(FORK ? params.get('pov') : localStorage.getItem(POV_KEY)); } catch (e) { /* no storage */ } S.pov = PLAY ? null : v === undefined ? 0 : v; }       // (a live game: the server already left out what this seat may not see, nothing is hidden by the page)
export const hides = (seat) => S.pov !== null && seat !== S.pov;
const povCache = new Map();
export function povState(st) {
  if (S.pov === null) return st;
  const key = S.pov + ':' + (st.__id || (st.__id = Math.random()));
  if (povCache.has(key)) return povCache.get(key);
  const back = (a) => (a || []).map(() => '?');
  const out = {
    ...st, main_deck: [], endgame_deck: [], endgame_discard: [], main_deck_known: 0, hidden_pov: S.pov,
    players: st.players.map((p, i) => (i === S.pov ? p : {
      ...p, hand: back(p.hand), endgame_hand: back(p.endgame_hand), initial_offer: back(p.initial_offer), stored: back(p.stored), pouched: back(p.pouched),
      under: Object.fromEntries(Object.entries(p.under || {}).map(([k, v]) => [k, back(v)])),
    })),
  };
  if (st.draft) {
    const hide = (arr) => (arr || []).map((v, i) => (i === S.pov ? v : []));
    out.draft = { ...st.draft, offers: hide(st.draft.offers), picked: hide(st.draft.picked), kept: hide(st.draft.kept), choice: [null, null] };
  }
  povCache.set(key, out);
  if (povCache.size > 400) povCache.delete(povCache.keys().next().value);
  return out;
}
export const curState = () => povState(S.replay.steps[S.step].state);
export const labelOf = (s) => (S.pov !== null && s.label_pov && s.label_pov[S.pov]) || s.label;

// The point of view is set by the eye next to each player's name in the info box (side-panel.js): an open eye shows that player's cards. S.pov = null: both eyes open (god mode,
// everything visible), S.pov = 0 / 1: only that seat's eye is open (the game as that player saw it). Both eyes cannot be closed: the only open eye cannot be closed.
export const eyeOpen = (seat) => S.pov === null || S.pov === seat;
export const eyeLocked = (seat) => S.pov === seat;                    // (the only open eye)
export function toggleEye(seat) {
  if (eyeLocked(seat)) return;
  S.pov = eyeOpen(seat) ? S.replay.players.findIndex((_, i) => i !== seat) : null;
  applyPov();
}
function applyPov() {
  if (!FORK) { try { localStorage.setItem(POV_KEY, povParam()); } catch (e) { /* no storage */ } }
  document.querySelectorAll('#moves li').forEach((li) => {          // the move list names cards: rewrite every line for the new point of view
    const s = li._step;
    if (!s) return;
    const num = li.firstChild, badge = li.lastChild;
    li.replaceChildren(num, labelNode(labelOf(s) || '…'), badge);
  });
  render();
}
