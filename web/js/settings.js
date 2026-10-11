// [module] Settings pop-up (the wheel in the control panel): the autoplay speed, the switch that adds the timeline to the control panel and the size of the cards in the hand. All are remembered in the browser.
import { $, el } from './util.js';
import { S } from './state.js';
import { setSpeed } from './playback.js';
import { fitSidebar } from './sidebar.js';
import { NO_SNAKE_MODES } from './nosnake.js';

const KEY = 'settings';                                                    // localStorage: { speed: 1 | 2 | 4, timeline: boolean, hand: 0.5 ... 2, handMode: 'fan' | 'tray', noSnake: 'show' | 'hide' | 'worm' }
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
export const HAND_SCALES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];            // the sizes of the cards in the hand (1 = the default size)
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ speed: S.speed, timeline: S.showTimeline, hand: S.handScale, handMode: S.handMode, noSnake: S.noSnake })); } catch (e) { /* no storage */ } };
export const settingsOpen = () => { const m = $('settingsModal'); return !!m && !m.hidden; };
export function toggleSettings() {
  const m = $('settingsModal'), g = $('settings');
  if (!m || !g || g.offsetParent === null) return;                 // (no gear on the page, e.g. the fork page: no settings)
  if (m.hidden) { m.hidden = false; m.querySelector('.modalx').focus(); } else close();
}
function close() { const m = $('settingsModal'); if (m) m.hidden = true; document.dispatchEvent(new Event('settingsclosed')); }
// the timeline is a row of its own between the two button rows of the control panel; while it is off, a decorative line (#tldeco) holds its place
export function applyTimeline() {
  const t = $('timeline');
  if (t) t.hidden = !S.showTimeline;
  const d = $('tldeco');                                                   // the decorative line that the timeline replaces
  if (d) d.hidden = S.showTimeline;
  fitSidebar();
}
export function applyHandScale() { document.body.style.setProperty('--hs', String(S.handScale)); }       // (parkposter.css sizes the dock from --hs)
export function setupSettings() {
  const st = read();
  S.showTimeline = st.timeline === true;                                   // default: off
  S.speed = [1, 2, 4].includes(st.speed) ? st.speed : 1;                  // default: 1x
  S.handScale = HAND_SCALES.includes(st.hand) ? st.hand : 1;               // default: 1x
  S.handMode = st.handMode === 'fan' ? 'fan' : 'tray';                   // default: the floating tray
  S.noSnake = NO_SNAKE_MODES.some(([v]) => v === st.noSnake) ? st.noSnake : 'show';        // default: show
  applyHandScale();
  const modal = el('div', 'modal'); modal.id = 'settingsModal'; modal.hidden = true;
  const box = el('div', 'modalbox'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Settings');
  const head = el('div', 'modalhead');
  const x = el('button', 'modalx'); x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4L20 20M20 4L4 20" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" fill="none"/></svg>'; x.type = 'button'; x.title = 'Close (Esc)'; x.setAttribute('aria-label', 'Close'); x.onclick = close;
  head.append(el('b', '', 'Settings'), x);
  const speedRow = el('div', 'setrow');
  const sp = el('span', 'speed setspeed'); sp.setAttribute('role', 'group'); sp.setAttribute('aria-label', 'Autoplay speed');
  for (const v of [1, 2, 4]) {
    const b = el('button', '', v + 'x'); b.type = 'button'; b.dataset.speed = String(v); b.title = 'Autoplay at ' + v + 'x';
    b.onclick = () => { setSpeed(v); save(); };
    sp.append(b);
  }
  speedRow.append(el('span', 'setlabel', 'Autoplay speed'), sp);
  const tlRow = el('label', 'setrow');
  const sw = el('input'); sw.type = 'checkbox'; sw.className = 'setswitch'; sw.checked = S.showTimeline;
  sw.onchange = () => { S.showTimeline = sw.checked; save(); applyTimeline(); };
  tlRow.append(el('span', 'setlabel', 'Timeline in the control panel'), sw);
  const handRow = el('div', 'setrow setslide');                            // the size of the cards in the hand: a slider with seven steps
  const slider = el('input'); slider.type = 'range'; slider.className = 'setrange'; slider.min = '0'; slider.max = String(HAND_SCALES.length - 1); slider.step = '1';
  slider.value = String(HAND_SCALES.indexOf(S.handScale)); slider.setAttribute('aria-label', 'Size of the cards in the hand'); slider.setAttribute('list', 'handSizes');
  slider.oninput = () => { S.handScale = HAND_SCALES[Number(slider.value)]; applyHandScale(); save(); };
  const track = el('div', 'settrack'), bubble = el('b', 'setbubble');     // the current size is written on the slider's knob (the knob is drawn by CSS, the number lies over it)
  const showVal = () => { const f = Number(slider.value) / (HAND_SCALES.length - 1); bubble.textContent = S.handScale.toFixed(2).replace(/0$/, '').replace(/\.0$/, '') + 'x'; bubble.style.left = 'calc(var(--knob) / 2 + (100% - var(--knob)) * ' + f + ')'; };
  slider.addEventListener('input', showVal); showVal();
  track.append(slider, bubble);
  handRow.append(el('span', 'setlabel', 'Cards in hand'), track);
  const modeRow = el('div', 'setrow');                                    // how the hand is shown: a fan at the screen edge, or a floating tray (dock.js)
  const sel = el('select', 'setselect'); sel.setAttribute('aria-label', 'Hand display');
  for (const [v, t] of [['tray', 'Floating container'], ['fan', 'Fan at the screen edge']]) { const o = el('option', '', t); o.value = v; sel.append(o); }
  sel.value = S.handMode;
  sel.onchange = () => { S.handMode = sel.value === 'fan' ? 'fan' : 'tray'; save(); document.dispatchEvent(new Event('handmode')); };
  modeRow.append(el('span', 'setlabel', 'Hand display'), sel);
  const snakeRow = el('div', 'setrow');                                   // the cards with a snake photo (nosnake.js): shown, suppressed or replaced by the Slow Worm
  const ssel = el('select', 'setselect'); ssel.setAttribute('aria-label', 'No-snake mode');
  for (const [v, t] of NO_SNAKE_MODES) { const o = el('option', '', t); o.value = v; ssel.append(o); }
  ssel.value = S.noSnake;
  ssel.onchange = () => { S.noSnake = ssel.value; save(); document.dispatchEvent(new Event('nosnake')); };
  snakeRow.append(el('span', 'setlabel', 'No-snake mode'), ssel);
  box.append(head, speedRow, tlRow, handRow, modeRow, snakeRow);
  modal.append(box);
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });         // a click on the dimmed background closes it
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && settingsOpen()) { e.stopPropagation(); close(); } }, true);
  document.body.append(modal);
  const wheel = $('settings');
  if (wheel) wheel.onclick = () => { modal.hidden = false; x.focus(); };
  setSpeed(S.speed);
  applyTimeline();
}
