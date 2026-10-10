// [module] Point of view (seat 0 / seat 1; both at once is no longer possible, a live game has none): what is hidden from the other player, the eyes that switch it.
import { FORK, PLAY, S, params, table } from './state.js';
import { $, el, seatColor } from './util.js';
import { labelNode } from './log-labels.js';
import { render } from './main.js';

// The eyes are remembered per table in localStorage ('pov:<table>': '0' | '1' (an old 'all' counts as unset)), also over F5; the first time only the first player's eye is open (his zoo is the left one).
// A fork (opened in a new tab from a replay) does not use the storage: it takes the eyes of the replay from the URL (`&pov=`, see `povParam`) and changes them only in its own tab.
const POV_KEY = 'pov:' + (table || 'local');
const readPov = (v) => (v === '0' ? 0 : v === '1' ? 1 : undefined);       // (the former 'both eyes open' value 'all' is read as unset -> the first player)
export const povParam = () => (S.pov === null ? 'all' : String(S.pov));
{ let v; try { v = readPov(FORK ? params.get('pov') : localStorage.getItem(POV_KEY)); } catch (e) { /* no storage */ } S.pov = PLAY ? null : v === undefined ? 0 : v; }       // (a live game: the server already left out what this seat may not see, nothing is hidden by the page)
export const hides = (seat) => S.pov !== null && seat !== S.pov;
// The orientation of the boards: the spectated player chosen in the dialog at the start (`chooseSpectated`) has the left map and the upper player box, whichever eye is open later (the eyes
// change only what is shown of the cards). Kept per table ('orient:<table>': '0' | '1'); a fork takes it from the URL (`&orient=`, else the eye's seat); a live game and the sandbox keep seat 0 left.
const ORIENT_KEY = 'orient:' + (table || 'local');
const orientStored = () => { try { const v = localStorage.getItem(ORIENT_KEY); return v === '0' ? 0 : v === '1' ? 1 : undefined; } catch (e) { return undefined; } };
{ const v = FORK ? readPov(params.get('orient')) : PLAY ? 0 : orientStored(); S.orient = v !== undefined ? v : FORK && S.pov !== null ? S.pov : 0; }
export const orientParam = () => String(S.orient);
export const seatOrder = () => (S.orient === 1 ? [1, 0] : [0, 1]);       // (the seats in the order they are drawn: left map / upper box first)
export const needsChoice = () => !FORK && !PLAY && orientStored() === undefined;

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

// The point of view is set by the eye next to each player's name in the info box (side-panel.js): exactly one eye is open, S.pov = 0 / 1 = the game as that player saw it. Opening the closed eye
// closes the other one (there is no way to see both hands at once); the open eye cannot be closed. (S.pov = null only in a live game, where the server decides what a seat sees.)
export const eyeOpen = (seat) => S.pov === seat;
export const eyeLocked = (seat) => S.pov === seat;                    // (the open eye: clicking it does nothing)
export function toggleEye(seat) {
  if (S.pov === seat) return;
  S.pov = seat;
  applyPov();
}
export const povDialogOpen = () => !!$('povChoice');
// The first time a replay is opened: a lightbox asks whom to spectate. The choice opens that player's eye and sets the orientation (left map, upper box); the eyes can be switched later.
export function askSpectated() {
  if ($('povChoice')) return;
  const modal = el('div', 'modal'); modal.id = 'povChoice';
  const box = el('div', 'modalbox povbox'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Choose which player to spectate');
  box.append(el('div', 'modalhead', 'Choose which player to spectate'));
  const row = el('div', 'povchips');
  S.replay.players.forEach((pl, seat) => {
    const b = el('button', 'povchip'); b.type = 'button';
    b.style.setProperty('--pc', seatColor(seat));
    b.append(el('i', 'povdot'), el('span', 'povname', pl.name));
    b.onclick = () => { modal.remove(); chooseSpectated(seat); };
    row.append(b);
  });
  box.append(row); modal.append(box); document.body.append(modal);
}
function chooseSpectated(seat) {
  S.orient = seat; S.pov = seat;
  try { localStorage.setItem(ORIENT_KEY, String(seat)); } catch (e) { /* no storage */ }
  S.lastBoard = null;
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
