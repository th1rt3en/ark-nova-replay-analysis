// [module] Keyboard shortcuts pop-up (the ? button in the control panel, or the ? key): a keyboard where only the keys with a function are coloured; a click on such a key, or pressing it, shows what it does (the keys do not act while the pop-up is open; light grey window with orange selected key, the text of the picked key is a typed prompt line in the title row).
import { $, el } from './util.js';
import { settingsOpen } from './settings.js';

const SHOW_KEY_DETAILS = false;                                            // the grey detail line under a key's title is switched off for now (the texts stay in D, to be overhauled)
const D = {                                                                // key id (KeyboardEvent.key, letters lower case) -> [label, title, detail]; keep in step with the keydown handler in main.js
  ArrowLeft: ['←', 'Go back one step in replay', 'Skips the opponent\'s hidden steps in the action card draft. On the results of a finished game: back to the final board.'],
  ArrowRight: ['→', 'Go forward one step in replay', 'Skips the opponent\'s hidden steps in the action card draft. On the last step of a finished game: opens the results.'],
  ' ': ['Space', 'Start / stop autoplay', ''],
  ArrowUp: ['↑', 'Switch to table (post-game only)', 'In the game stats: shows the table.'],
  ArrowDown: ['↓', 'Switch to graph (post-game only)', 'In the game stats: shows the score graph.'],
  Home: ['Home', 'Jump to first step', ''],
  End: ['End', 'Jump to last step', 'The final board, also from the results.'],
  r: ['R', 'Rotate building during map preview', 'While a sponsor building is being previewed (right click on its card in a hand): Shift + R turns it the other way, the mouse wheel over the map too.'],
  Tab: ['Tab', 'Switch between tabs in hand', 'Cycles through the tabs of the shown cards: hand, endgame cards, the cards stored under the notepad (map 11) and the played cards (when the setting "Played cards" is the tray). Shift + Tab goes back.'],
  h: ['H', 'Show / hide hand', 'The floating tray or the fan.'],
  s: ['S', 'Open settings', ''],
  F11: ['F11', 'Full screen', 'Switches the browser to full screen and back; the full screen button next to the settings wheel does the same.'],
  '?': ['/', 'Open keyboard tooltips (= this window)', 'Shift + / on most keyboards.'],
  Escape: ['Esc', 'Close', 'The settings, a dialog or this window.'],
};
const GAP = [' ', .5];                                                     // (a blank space in a row: [label '', width])
const MAIN = [
  [['Esc', 1, 'Escape'], GAP, ...[1, 2, 3, 4].map((i) => ['F' + i, 1]), GAP, ...[5, 6, 7, 8].map((i) => ['F' + i, 1]), GAP, ...[9, 10, 11, 12].map((i) => i === 11 ? ['F11', 1, 'F11'] : ['F' + i, 1])],
  [...'`1234567890-='.split('').map((c) => [c, 1]), ['⌫', 2]],
  [['Tab', 1.5, 'Tab'], ...'QWERTYUIOP[]'.split('').map((c) => [c, 1]), ['\\', 1.5]],
  [['Caps', 1.75], ...'ASDFGHJKL;\''.split('').map((c) => [c, 1]), ['Enter', 2.25]],
  [['Shift', 2.25], ...'ZXCVBNM,.'.split('').map((c) => [c, 1]), ['/', 1, '?'], ['Shift', 2.75]],
  [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], ['Space', 6.25, ' '], ['Alt', 1.25], ['Win', 1.25], ['Fn', 1.25], ['Ctrl', 1.25]],
];
const NAV = [
  [['Ins', 1], ['Home', 1, 'Home'], ['PgUp', 1]],
  [['Del', 1], ['End', 1, 'End'], ['PgDn', 1]],
  [['', 1], ['↑', 1, 'ArrowUp'], ['', 1]],
  [['←', 1, 'ArrowLeft'], ['↓', 1, 'ArrowDown'], ['→', 1, 'ArrowRight']],
];
const idOf = (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; return k === '/' ? '?' : k; };
export const shortcutsOpen = () => { const m = $('shortcutsModal'); return !!m && !m.hidden; };

export function setupShortcuts() {
  const btn = $('extra');
  if (!btn) return;                                                        // (only the replay page has the button)
  const keys = {};
  const info = el('div', 'kbprompt'); info.setAttribute('role', 'status');   // the text of the picked key, typed letter by letter in the title row
  let typing = 0;
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const pick = (id) => {
    for (const k of Object.values(keys)) k.classList.remove('sel');
    if (!keys[id]) return;
    keys[id].classList.add('sel');
    const [label, title, detail] = D[id];
    const txt = el('span', 'kbtxt'); txt.setAttribute('aria-hidden', 'true');
    info.replaceChildren(el('em', '', '›'), el('span', '', label), ...(id.startsWith('Arrow') ? [] : [el('span', 'kbsep', '|')]), txt,   // (a bar between the key and its text; not after the four arrows, which show as a glyph)
       el('span', 'kbcur'), el('span', 'kbsr', label + ': ' + title));
    info.title = SHOW_KEY_DETAILS && detail ? detail : '';
    const my = ++typing;
    if (reduced()) { txt.textContent = title; return; }
    let n = 0;
    (function step() { if (my !== typing) return; txt.textContent = title.slice(0, ++n); if (n < title.length) setTimeout(step, 13); })();
  };
  const block = (rows) => {
    const b = el('div', 'kbblk');
    for (const r of rows) {
      const row = el('div', 'kbrow');
      for (const [label, w, id] of r) {
        if (label === ' ') { const g = el('i', 'kbgap'); g.style.setProperty('--w', String(w)); row.append(g); continue; }
        const kid = id || (label.length === 1 && D[label.toLowerCase()] ? label.toLowerCase() : null);
        const k = el(kid && D[kid] ? 'button' : 'div', 'kbkey', label);
        k.style.setProperty('--w', String(w)); k.style.setProperty('--g', String(Math.max(0, Math.round(w) - 1)));
        if (label.length > 3 && w < 3) k.classList.add('long');                  // (long labels on narrow keys get a smaller font; Space is wide and keeps the normal size)
        if (kid && D[kid]) { k.type = 'button'; k.classList.add('on'); k.onclick = () => pick(kid); keys[kid] = k; }
        row.append(k);
      }
      b.append(row);
    }
    return b;
  };
  const modal = el('div', 'modal'); modal.id = 'shortcutsModal'; modal.hidden = true;
  const box = el('div', 'modalbox kbbox'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Keyboard shortcuts');
  const head = el('div', 'modalhead');
  const x = el('button', 'modalx'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
  x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4L20 20M20 4L4 20" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" fill="none"/></svg>';
  head.append(el('b', '', 'Keyboard shortcuts'), info, x);
  const kb = el('div', 'kb'); kb.append(block(MAIN), block(NAV));
  box.append(head, kb);
  modal.append(box);
  document.body.append(modal);
  const open = () => { modal.hidden = false; pick('ArrowRight'); x.focus(); };
  const close = () => { modal.hidden = true; };
  btn.onclick = open;
  x.onclick = close;
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => {                            // capture: while open, the keys only explain themselves
    if (shortcutsOpen()) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      const id = idOf(e);
      if (keys[id]) { e.preventDefault(); e.stopPropagation(); pick(id); keys[id].classList.add('down'); }
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && btn.offsetParent !== null && !settingsOpen()) { e.preventDefault(); e.stopPropagation(); open(); }
  }, true);
  document.addEventListener('keyup', (e) => { const k = keys[idOf(e)]; if (k) k.classList.remove('down'); });
}
