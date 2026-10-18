// [module] Point of view (seat 0 / seat 1; both at once is no longer possible, a live game has none): what is hidden from the other player, the eyes that switch it.
import { FORK, MINIGAME, PLAY, S, params, table } from './state.js';
import { $, el, seatColor, svg } from './util.js';
import { labelNode } from './log-labels.js';
import { render } from './main.js';

// The eyes are remembered per table in localStorage ('pov:<table>': '0' | '1' (an old 'all' counts as unset)), also over F5; the first time only the first player's eye is open (his zoo is the left one).
// A fork (opened in a new tab from a replay) does not use the storage: it takes the eyes of the replay from the URL (`&pov=`, see `povParam`) and changes them only in its own tab.
const POV_KEY = 'pov:' + (table || 'local');
const readPov = (v) => (v === '0' ? 0 : v === '1' ? 1 : undefined);       // (the former 'both eyes open' value 'all' is read as unset -> the first player)
export const povParam = () => (S.pov === null ? 'all' : String(S.pov));
{ let v; try { v = readPov(FORK ? params.get('pov') : localStorage.getItem(POV_KEY)); } catch (e) { /* no storage */ } S.pov = PLAY ? null : MINIGAME ? window.MINIGAME_POV : v === undefined ? 0 : v; }       // (a live game: the server already left out what this seat may not see, nothing is hidden by the page)
export const hides = (seat) => S.pov !== null && seat !== S.pov;
// The orientation of the boards: the spectated player chosen in the dialog at the start (`chooseSpectated`) has the left map and the upper player box, whichever eye is open later (the eyes
// change only what is shown of the cards). Kept per table and per tab ('orient:<table>' in sessionStorage: '0' | '1'), so F5 keeps it but a new visit (window closed, ID entered again) asks again; a fork takes it from the URL (`&orient=`, else the eye's seat); a live game and the sandbox keep seat 0 left.
const ORIENT_KEY = 'orient:' + (table || 'local');
const orientStored = () => { try { const v = sessionStorage.getItem(ORIENT_KEY); return v === '0' ? 0 : v === '1' ? 1 : undefined; } catch (e) { return undefined; } };
{ const v = FORK ? readPov(params.get('orient')) : PLAY ? 0 : MINIGAME ? (window.MINIGAME_POV === 1 ? 1 : 0) : orientStored(); S.orient = v !== undefined ? v : FORK && S.pov !== null ? S.pov : 0; }
export const orientParam = () => String(S.orient);
export const seatOrder = () => (S.orient === 1 ? [1, 0] : [0, 1]);       // (the seats in the order they are drawn: left map / upper box first)
export const needsChoice = () => !FORK && !PLAY && !MINIGAME && orientStored() === undefined;       // (a mini game: the puzzle's point of view is fixed, nobody is asked)

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
  if (st.initial_discard && st.main_discard) {                 // the initial discards of the other player lie face down in the pile
    const secret = (st.initial_discard[1 - S.pov] || []).slice();
    out.main_discard = st.main_discard.map((k) => { const i = secret.indexOf(k); if (i < 0) return k; secret.splice(i, 1); return '?'; });
  }
  if (st.draft) {
    const hide = (arr) => (arr || []).map((v, i) => (i === S.pov ? v : []));
    out.draft = { ...st.draft, offers: hide(st.draft.offers), picked: hide(st.draft.picked), kept: hide(st.draft.kept), choice: [null, null] };
  }
  povCache.set(key, out);
  if (povCache.size > 400) povCache.delete(povCache.keys().next().value);
  return out;
}
export const curState = () => povState(S.replay.steps[S.step].state);
const statueName = (t) => (typeof t === 'string' ? t.replace(/\b(Victory Column|Mascot Statue)\b/gi, S.s274 === 'mascot' ? 'Mascot Statue' : 'Victory Column') : t);        // (setting "Statue card": the log of BGA says Victory Column, the card data says Mascot Statue; the line follows the setting)
export const labelOf = (s) => statueName((S.pov !== null && s.label_pov && s.label_pov[S.pov]) || s.label);
export function refreshLabels() {                                  // the move list again, e.g. after the name of a card changed (setting "Statue card")
  document.querySelectorAll('#moves li').forEach((li) => { const s = li._step; if (!s) return; const num = li.firstChild, badge = li.lastChild; li.replaceChildren(num, labelNode(labelOf(s) || '…'), badge); });
}

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
  let picked = null;
  const ok = el('button', 'povok', 'Confirm'); ok.type = 'button'; ok.disabled = true;
  const chips = S.replay.players.map((pl, seat) => {
    const b = el('button', 'povchip'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
    b.style.setProperty('--pc', seatColor(seat));
    b.append(el('i', 'povdot'), el('span', 'povname', pl.name));
    b.onclick = () => { picked = seat; ok.disabled = false; chips.forEach((c, i) => { c.classList.toggle('on', i === seat); c.setAttribute('aria-pressed', String(i === seat)); }); };   // (a chip only selects: Confirm applies the choice, so it can be changed first)
    row.append(b);
    return b;
  });
  const done = () => { if (picked === null) return; document.removeEventListener('keydown', onKey, true); modal.remove(); chooseSpectated(picked); };
  const onKey = (e) => { if (e.key === 'Enter' && picked !== null && !e.isComposing) { e.preventDefault(); e.stopPropagation(); done(); } };       // (Enter confirms once a player is selected, whichever button has the focus)
  ok.onclick = done;
  document.addEventListener('keydown', onKey, true);
  box.append(row, ok); modal.append(box); document.body.append(modal);
}
function chooseSpectated(seat) {
  S.orient = seat; S.pov = seat;
  try { sessionStorage.setItem(ORIENT_KEY, String(seat)); } catch (e) { /* no storage */ }
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

// The eye of a player sits in the tab above the player's zoo (zoo.js).
export function eyeButton(seat) {                                          // open eye = this player's cards are shown; exactly one eye is open, opening the other closes it
  if (PLAY || MINIGAME) return document.createTextNode('');                     // (a live game: no eyes, the server decides what a seat sees)
  const open = eyeOpen(seat), locked = eyeLocked(seat), nm = S.replay.players[seat].name;
  const b = el('button', 'poveye' + (open ? '' : ' closed') + (locked ? ' only' : ''));
  b.type = 'button';
  b.title = locked ? nm + "'s cards are shown" : 'Show ' + nm + "'s cards (and hide the other player's)";
  b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', String(open));
  const g = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  g.append(svg('path', { d: 'M2 12C5 6.5 8.5 4.5 12 4.5S19 6.5 22 12C19 17.5 15.5 19.5 12 19.5S5 17.5 2 12Z' }), svg('circle', { cx: 12, cy: 12, r: 3.2, fill: 'currentColor' }));
  if (!open) g.append(svg('path', { class: 'strike-under', d: 'M3.5 3.5L20.5 20.5' }), svg('path', { class: 'strike', d: 'M3.5 3.5L20.5 20.5', 'stroke-width': 2.6 }));         // closed: the same eye, struck through (the under-stroke is the outline of the line, see parkposter.css)
  b.append(g);
  b.onclick = () => toggleEye(seat);
  return b;
}
