// [module] Keyboard shortcuts pop-up (the ? button in the control panel, or the ? key): a keyboard where only the keys with a function are coloured; a click on such a key, or pressing it, shows what it does (the keys do not act while the pop-up is open; light grey window with orange selected key, the text of the picked key is a typed prompt line in the title row).
import { $, el } from './util.js';
import { onScrollbar } from './modalscroll.js';
import { settingsOpen } from './settings.js';
import { FORK, MINIGAME, PLAY, SANDBOX, S } from './state.js';
import { createPageView } from './rcview.js';

const SHOW_KEY_DETAILS = false;                                            // the grey detail line under a key's title is switched off for now (the texts stay in D, to be overhauled)
const D = {                                                                // key id (KeyboardEvent.key, letters lower case) -> [label, title, detail]; keep in step with the keydown handler in main.js
  ArrowLeft: ['←', 'Go back one step in replay', 'Also the side wheel of the mouse (or Shift + wheel) to the left. Skips the opponent\'s hidden steps in the action card draft. On the results of a finished game: back to the final board.'],
  ArrowRight: ['→', 'Go forward one step in replay', 'Also the side wheel of the mouse (or Shift + wheel) to the right. Skips the opponent\'s hidden steps in the action card draft. On the last step of a finished game: opens the results.'],
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
const CTRL_LAYER = !PLAY && !MINIGAME && (!FORK || SANDBOX);               // (the round jumps exist in the replay and the sandbox only)
const C = {                                                                // the Ctrl layer: key id -> [label, title, detail]; Alt + 1-9 does the same as Ctrl + 1-9 (browsers keep Ctrl + 1-9 for their tabs), a right click on the timeline goes to the start of that round
  ArrowLeft: ['Ctrl + ←', 'Jump to start of this round', 'The start of the current round (again: the round before).'],
  ArrowRight: ['Ctrl + →', 'Jump to start of next round', 'The start of the next round.'],
};
for (const d of '123456789') C[d] = ['Ctrl + ' + d, 'Jump to start of round ' + d, 'The start of round ' + d + ' (Alt + ' + d + ' does the same).'];
const GAP = [' ', .5];
const LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="2.5" y="7" width="11" height="7.5" rx="1.6" fill="currentColor"/></svg>';                                                     // (a blank space in a row: [label '', width])
const MAIN = [
  [['Esc', 1, 'Escape'], GAP, ...[1, 2, 3, 4].map((i) => ['F' + i, 1]), GAP, ...[5, 6, 7, 8].map((i) => ['F' + i, 1]), GAP, ...[9, 10, 11, 12].map((i) => i === 11 ? ['F11', 1, 'F11'] : ['F' + i, 1])],
  [...'`1234567890-='.split('').map((c) => [c, 1]), ['⌫', 2]],
  [['Tab', 1.5, 'Tab'], ...'QWERTYUIOP[]'.split('').map((c) => [c, 1]), ['\\', 1.5]],
  [['Caps', 1.75], ...'ASDFGHJKL;\''.split('').map((c) => [c, 1]), ['Enter', 2.25]],
  [['Shift', 2.25], ...'ZXCVBNM,.'.split('').map((c) => [c, 1]), ['/', 1, '?'], ['Shift', 2.75]],
  [['Ctrl', 1.25, 'Control'], ['Win', 1.25], ['Alt', 1.25], ['Space', 6.25, ' '], ['Alt', 1.25], ['Win', 1.25], ['Fn', 1.25], ['Ctrl', 1.25, 'Control']],
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
  const keys = {};                                                         // key id -> its key elements (the two Ctrl keys share one id)
  const lit = {};                                                          // key id -> [has a function in the normal layer, has one in the Ctrl layer]
  const info = el('div', 'kbprompt'); info.setAttribute('role', 'status');   // the text of the picked key, typed letter by letter in the title row
  let typing = 0, locked = false, picked = 'ArrowRight';
  const layer = () => CTRL_LAYER && locked;                                  // the Ctrl layer: Ctrl clicked or pressed once (latched until the next click / press, nothing is held)
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const textOf = (id) => id === 'Control' ? ['Ctrl', locked ? 'Locked' : 'Lock', ''] : layer() && C[id] ? C[id] : D[id];
  const pick = (id) => {
    picked = id;
    for (const l of Object.values(keys)) for (const k of l) k.classList.remove('sel');
    if (!keys[id] || !textOf(id)) return;
    if (id !== 'Control' || locked) keys[id].forEach((k) => k.classList.add('sel'));
    const [label, title, detail] = textOf(id);
    const txt = el('span', 'kbtxt'); txt.setAttribute('aria-hidden', 'true');
    info.replaceChildren(el('em', '', '›'), el('span', '', label), ...(id.startsWith('Arrow') && !layer() ? [] : [el('span', 'kbsep', '|')]), txt,   // (a bar between the key and its text; not after the four arrows in the normal layer, which show as a glyph)
       el('span', 'kbcur'), el('span', 'kbsr', label + ': ' + title));
    info.title = SHOW_KEY_DETAILS && detail ? detail : '';
    const my = ++typing;
    if (reduced()) { txt.textContent = title; return; }
    let n = 0;
    (function step() { if (my !== typing) return; txt.textContent = title.slice(0, ++n); if (n < title.length) setTimeout(step, 13); })();
  };
  const refresh = () => {                                                  // the keys with a function in the shown layer are lit, the others are quiet
    const on = layer();
    kb.classList.toggle('ctrl', on);
    for (const [id, l] of Object.entries(keys)) {
      const [plain, ctrl] = lit[id];
      const isOn = id === 'Control' ? CTRL_LAYER : on ? ctrl : plain;
      l.forEach((k) => { k.classList.toggle('on', isOn); k.tabIndex = isOn ? 0 : -1; });
    }
    if (picked === 'Control' && !locked) picked = 'ArrowRight';
    pick(on && !C[picked] && picked !== 'Control' ? (locked ? 'Control' : 'ArrowRight') : picked);
  };
  const press = (id) => {
    if (id === 'Control') { if (!CTRL_LAYER) return; locked = !locked; picked = 'Control'; refresh(); return; }
    if (!(layer() ? C[id] : D[id])) return;
    pick(id);
  };
  const block = (rows) => {
    const b = el('div', 'kbblk');
    for (const r of rows) {
      const row = el('div', 'kbrow');
      for (const [label, w, id] of r) {
        if (label === ' ') { const g = el('i', 'kbgap'); g.style.setProperty('--w', String(w)); row.append(g); continue; }
        const kid = id || (label.length === 1 && (D[label.toLowerCase()] || (CTRL_LAYER && C[label])) ? label.toLowerCase() : null);
        const plain = !!(kid && D[kid]), ctrl = !!(kid && CTRL_LAYER && C[kid]), isCtl = kid === 'Control';
        const has = isCtl ? CTRL_LAYER : plain || ctrl;
        const k = el(has ? 'button' : 'div', 'kbkey');
        if (isCtl) { k.classList.add('ctl'); k.innerHTML = LOCK; k.append(el('span', '', label)); } else k.textContent = label;
        k.style.setProperty('--w', String(w)); k.style.setProperty('--g', String(Math.max(0, Math.round(w) - 1)));
        if (label.length > 3 && w < 3) k.classList.add('long');                  // (long labels on narrow keys get a smaller font; Space is wide and keeps the normal size)
        if (has) { k.type = 'button'; k.onclick = () => press(kid); (keys[kid] = keys[kid] || []).push(k); lit[kid] = [plain, ctrl]; }
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
  const mouse = el('div', 'kbmouse');                                      // the mouse: its own element beside the pop-up (not part of the keyboard); only the right button is lit
  mouse.innerHTML = '<button type="button" class="mbtn l" tabindex="-1" aria-hidden="true">Left</button><button type="button" class="mbtn r" aria-label="Right click"><i class="ring"></i><span>Right</span></button><div class="mwheel"><i></i></div>';
  const rbtn = mouse.querySelector('.mbtn.r');
  const view = createPageView(() => togglePage(false));                      // the "Right click" view: a small copy of the page with an epicentre on each spot where a right click does something (rcview.js)
  modal.append(box, view.box, mouse);
  document.body.append(modal);
  function togglePage(on) {                                                  // any click on the mouse (left, right, wheel) swaps the keyboard for the page view and back; the right button stays pressed meanwhile
    if (on === undefined) on = !view.isOpen();
    if (on) { const w = box.getBoundingClientRect().width / (S.scale || 1); box.hidden = true; view.open(w); }
    else { view.close(); box.hidden = false; }
    rbtn.classList.toggle('down', on);
    (on ? rbtn : x).focus({ preventScroll: true });
  }
  for (const ev of ['click', 'contextmenu', 'auxclick']) mouse.addEventListener(ev, (e) => { e.preventDefault(); togglePage(); });
  modal.addEventListener('contextmenu', (e) => { if (mouse.contains(e.target) || e.target.closest('.rcepi')) return; e.preventDefault(); if (!view.isOpen()) togglePage(true); });   // a right click anywhere in the pop-up opens the page view (in the view it only keeps the browser menu away)
  mouse.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });          // (no auto-scroll arrows on a wheel click)
  const open = () => { modal.hidden = false; togglePage(false); locked = false; picked = 'ArrowRight'; refresh(); x.focus(); };
  const close = () => { togglePage(false); modal.hidden = true; locked = false; };
  window.addEventListener('resize', () => { if (view.isOpen()) togglePage(false); });
  btn.onclick = open;
  x.onclick = close;
  modal.addEventListener('mousedown', (e) => { if (e.target === modal && e.button === 0 && !onScrollbar(e, modal)) close(); });          // (only a left click on the backdrop closes; a right click there opens the page view)
  document.addEventListener('keydown', (e) => {                            // capture: while open, the keys only explain themselves
    if (shortcutsOpen()) {
      if (view.isOpen()) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); togglePage(false); } return; }                  // (in the page view the keys do nothing; Esc goes back to the keyboard)
      if (e.key === 'Control' && CTRL_LAYER) { e.preventDefault(); if (!e.repeat) { locked = !locked; picked = 'Control'; refresh(); } return; }          // (the real Ctrl key works like a click on the key: one press locks, the next one unlocks)
      if (e.ctrlKey && !e.metaKey && !e.altKey) { const cid = idOf(e); if (CTRL_LAYER && C[cid] && keys[cid]) { e.preventDefault(); e.stopPropagation(); if (!locked) { locked = true; refresh(); } pick(cid); keys[cid].forEach((k) => k.classList.add('down')); } return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      const id = idOf(e);
      if (keys[id] && (layer() ? C[id] : D[id])) { e.preventDefault(); e.stopPropagation(); pick(id); keys[id].forEach((k) => k.classList.add('down')); }          // (locked: the keys act as their Ctrl versions)
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && btn.offsetParent !== null && !settingsOpen()) { e.preventDefault(); e.stopPropagation(); open(); }
  }, true);
  document.addEventListener('keyup', (e) => {
    const l = keys[idOf(e)]; if (l) l.forEach((k) => k.classList.remove('down'));
  });
}
