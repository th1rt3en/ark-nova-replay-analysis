// [module] Setting "Statue card" = Victory Column: which Emu Cup winner is on the card. A round portrait of the chosen winner (with a small swap mark) sits left of the dropdown in the settings;
// a click opens a window with the card of every winner (web/cards/S274_VC_<season>.webp, made by build_cards.py), a click on a card chooses it. S.vcSeason = the season, or null = the newest winner
// (the default: it follows when a new season is added to web/emu_cup_winners/winners.json). Winners without a photo (no `thumb` in winners.json: no card, no portrait) are shown greyed and cannot be chosen.
import { $, el } from './util.js';
import { S } from './state.js';
import { loadWinners } from './cards.js';
import { onScrollbar } from './modalscroll.js';

const pad = (n) => String(n).padStart(2, '0');
let list = [];                                                      // the winners, newest season first
let onChange = () => {};                                            // set by settings.js: save + redraw every card
let win = null, opener = null;                                      // the window (#winnerModal) and the button that opened it
const newest = () => (list[0] ? list[0].season : null);
const has = (w) => !!(w && w.thumb);                                // (the thumbnail and the card are made from the same photo: both exist, or neither)
export const currentSeason = () => (S.vcSeason && list.some((w) => w.season === S.vcSeason && has(w)) ? S.vcSeason : newest());
const current = () => list.find((w) => w.season === currentSeason());

const SWAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14l-4-4M20 16H6l4 4"/></svg>';
const SIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3.6-7 8-7s8 2.5 8 7"/></svg>';

function portrait(btn) {                                            // the portrait of the chosen winner on the button (an initial / silhouette until the list has loaded)
  const w = current();
  btn.querySelector('.vcface').replaceChildren(...(w && w.thumb ? [Object.assign(el('img'), { src: '/emu_cup_winners/thumbs/' + pad(w.season) + '.webp', alt: '' })] : []));
  btn.title = w ? 'Victory Column: ' + w.name + ' (Emu Cup season ' + w.season + ')' : 'Choose the Emu Cup winner';
}

export function closeWinners() {
  if (!win || win.hidden) return;
  win.hidden = true;
  if (opener) opener.focus();
}
const choose = (w) => {
  S.vcSeason = w.season === newest() ? null : w.season;             // (the newest winner is the default, not a fixed choice)
  closeWinners();
  onChange();
};

function buildWindow() {
  win = el('div', 'modal'); win.id = 'winnerModal'; win.hidden = true;
  win.addEventListener('mousedown', (e) => { if (e.target === win && !onScrollbar(e, win)) closeWinners(); });
  document.body.append(win);
}
function fillWindow() {
  const box = el('div', 'winbox'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Emu Cup champions');
  const head = el('div', 'winhead'); head.append(el('span', '', 'Emu Cup champions'));
  const x = el('button', 'winx'); x.type = 'button'; x.title = 'Close (Esc)'; x.setAttribute('aria-label', 'Close');
  x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4L20 20M20 4L4 20" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" fill="none"/></svg>';
  x.onclick = closeWinners; head.append(x);
  const grid = el('div', 'wingrid'), cur = currentSeason();
  let pending = cur;                                                // a click on a card only marks it; the button below puts it on the Victory Column
  const foot = el('div', 'winfoot'), cancel = el('button', 'winbtn', 'Cancel'), ok = el('button', 'winbtn ok', 'Use this card');
  cancel.type = ok.type = 'button'; cancel.onclick = closeWinners;
  const cards = new Map();
  const sync = () => {
    cards.forEach((b, s) => { b.classList.toggle('sel', s === pending); b.setAttribute('aria-pressed', String(s === pending)); });
    ok.disabled = pending === cur;                                  // (nothing to confirm while the marked card is the one in use)
  };
  for (const w of list) {
    const b = el('button', 'wincard' + (has(w) ? '' : ' no')); b.type = 'button'; b.disabled = !has(w);
    const art = el('span', 'winart');
    b.setAttribute('aria-label', w.name + ', season ' + w.season + (has(w) ? '' : ', no photo yet'));
    if (has(w)) { const img = el('img'); img.alt = ''; img.src = '/cards_large/S274_VC_' + pad(w.season) + '.webp'; art.append(img); }       // (the large card: its bar says "Emu Cup Champion: <name> (Season N)")
    else art.append(el('b', '', w.name), el('span', '', 'no photo yet'));                                            // (no card yet: nothing else says who it is)
    b.append(art);
    if (has(w)) { b.onclick = () => { pending = w.season; sync(); }; cards.set(w.season, b); }
    grid.append(b);
  }
  ok.onclick = () => { const w = list.find((v) => v.season === pending); if (w && pending !== cur) choose(w); };
  foot.append(cancel, ok);
  box.append(head, grid, foot);
  win.replaceChildren(box);
  sync();
  return x;
}
export function openWinners(from) {
  if (!win) buildWindow();
  opener = from || opener;
  const x = fillWindow();
  win.hidden = false;
  const first = win.querySelector('.wincard.sel') || x; first.focus();
}

document.addEventListener('keydown', (e) => {                       // Esc closes only this window, not the settings behind it (registered at import: before the settings' own handlers, which it keeps from running)
  if (e.key === 'Escape' && win && !win.hidden) { e.stopImmediatePropagation(); e.preventDefault(); closeWinners(); }
}, true);

// the button for the row of the setting: `after` runs once a winner is chosen (settings.js: save, redraw the cards)
export function winnerButton(after) {
  onChange = () => { after(); portrait(btn); };
  const btn = el('button', 'vcpick'); btn.type = 'button'; btn.hidden = S.s274 === 'mascot'; btn.setAttribute('aria-haspopup', 'dialog');
  const face = el('span', 'vcface'); face.innerHTML = '';
  const sil = el('span', 'vcsil'); sil.innerHTML = SIL;
  const swap = el('span', 'vcswap'); swap.innerHTML = SWAP;
  btn.append(sil, face, swap);
  btn.onclick = () => openWinners(btn);
  portrait(btn);
  loadWinners().then((d) => {
    list = [...(d.winners || [])].sort((a, b) => b.season - a.season);
    if (S.vcSeason && !list.some((w) => w.season === S.vcSeason && has(w))) { S.vcSeason = null; onChange(); }    // (a saved season that has no card any more: back to the default)
    portrait(btn);
  });
  return btn;
}
export const showWinnerButton = (btn, on) => { btn.hidden = !on; };
