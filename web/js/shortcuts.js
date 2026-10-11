// [module] Keyboard shortcuts pop-up (the ? button in the control panel, or the ? key): a keyboard where only the keys with a function are coloured; a click on such a key, or pressing it, shows what it does (the keys do not act while the pop-up is open).
import { $, el } from './util.js';
import { settingsOpen } from './settings.js';

const D = {                                                                // key id (KeyboardEvent.key, letters lower case) -> [label, title, detail]; keep in step with the keydown handler in main.js
  ArrowLeft: ['←', 'Back one step', 'Skips the opponent\'s hidden steps in the action card draft.'],
  ArrowRight: ['→', 'Forward one step', 'Skips the opponent\'s hidden steps in the action card draft.'],
  ' ': ['Space', 'Start / stop autoplay', ''],
  Home: ['Home', 'Jump to the first step', ''],
  End: ['End', 'Jump to the last step', ''],
  h: ['H', 'Show / hide the hand', 'The floating tray or the fan.'],
  s: ['S', 'Open the settings', ''],
  '?': ['?', 'Open this window', 'Shift + / on most keyboards.'],
  Escape: ['Esc', 'Close', 'A card pile, the settings or this window.'],
};
const GAP = [' ', .5];                                                     // (a blank space in a row: [label '', width])
const MAIN = [
  [['Esc', 1, 'Escape'], GAP, ...[1, 2, 3, 4].map((i) => ['F' + i, 1]), GAP, ...[5, 6, 7, 8].map((i) => ['F' + i, 1]), GAP, ...[9, 10, 11, 12].map((i) => ['F' + i, 1])],
  [...'`1234567890-='.split('').map((c) => [c, 1]), ['⌫', 2]],
  [['Tab', 1.5], ...'QWERTYUIOP[]'.split('').map((c) => [c, 1]), ['\\', 1.5]],
  [['Caps', 1.75], ...'ASDFGHJKL;\''.split('').map((c) => [c, 1]), ['Enter', 2.25]],
  [['Shift', 2.25], ...'ZXCVBNM,.'.split('').map((c) => [c, 1]), ['/', 1, '?'], ['Shift', 2.75]],
  [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], ['Space', 6.25, ' '], ['Alt', 1.25], ['Win', 1.25], ['Fn', 1.25], ['Ctrl', 1.25]],
];
const NAV = [
  [['Ins', 1], ['Home', 1, 'Home'], ['PgUp', 1]],
  [['Del', 1], ['End', 1, 'End'], ['PgDn', 1]],
  [['', 1], ['↑', 1], ['', 1]],
  [['←', 1, 'ArrowLeft'], ['↓', 1], ['→', 1, 'ArrowRight']],
];
const idOf = (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; return k === '/' ? '?' : k; };
export const shortcutsOpen = () => { const m = $('shortcutsModal'); return !!m && !m.hidden; };

export function setupShortcuts() {
  const btn = $('extra');
  if (!btn) return;                                                        // (only the replay page has the button)
  const keys = {};
  const info = el('div', 'kbinfo');
  const pick = (id) => {
    for (const k of Object.values(keys)) k.classList.remove('sel');
    if (!keys[id]) return;
    keys[id].classList.add('sel');
    const [label, title, detail] = D[id];
    info.replaceChildren(el('kbd', '', label), el('p', '', ''));
    info.lastChild.append(el('b', '', title));
    if (detail) info.lastChild.append(el('small', '', detail));
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
        if (label.length > 3) k.classList.add('long');
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
  head.append(el('b', '', 'Keyboard shortcuts'), x);
  const kb = el('div', 'kb'); kb.append(block(MAIN), block(NAV));
  box.append(head, kb, info, el('div', 'kbhint', 'Click a key, or press it, to see what it does. Esc or ✕ closes this window.'));
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
