// [module] Settings pop-up: animation/autoplay speed, timeline, hand, played cards, card variants and board layout. Remembered in localStorage.settings, including animationSpeed (.25/.5/1/1.25/1.5/1.75/2; default 1) and animations ('all' | 'standard' | 'none'; default 'all').
import { $, el } from './util.js';
import { FORK, MINIGAME, PLAY, S, SANDBOX } from './state.js';
import { setSpeed } from './playback.js';
import { fitSidebar, placeLog } from './sidebar.js';
import { NO_SNAKE_MODES } from './nosnake.js';
import { playStep, preloadSounds } from './step-sound.js';
import { ANIMATION_SPEEDS, ANIMATION_MODES, setAnimationSpeed, setAnimations } from './card-motion.js';
import { winnerButton, showWinnerButton } from './winner-picker.js';
import { onScrollbar } from './modalscroll.js';
import { AMBIENCE, setAmbience } from './ambience.js';                         // (the page behind an open pop-up does not scroll)

let animalMore = false;                                                    // the Animal sounds window (More) is open (not stored)
let settingsTab = 0;                                                       // the tab of the pop-up that is open: 0 Control, 1 Board, 2 Cards, 3 Sound (not stored)
const KEY = 'settings';                                                    // localStorage: { speed: 0.5 | 1 | 2 | 3 | 4, timeline: boolean, hand: 0.5 ... 2, handMode: 'fan' | 'tray', noSnake: 'show' | 'hide' | 'worm', s274: 'victory' | 'mascot', vcSeason: season number | null, zoos: 'side' | 'tabs' | 'stack', boardSwitch: boolean, played: 'below' | 'tray' | 'drawer', drawerFull: { 0: boolean, 1: boolean }, logPos: 'tab' | 'below', logOrder: { tab, below: 'oldest' | 'newest' } }
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
export const PLAYED_MODES = [['drawer', 'Slide-out drawer'], ['below', 'Below the map'], ['tray', 'Tray in the hand dock'], ['beside', 'Cards next to the map']];       // where the played cards are shown (zoo.js `playedMode`)
export const MUSIC = AMBIENCE;                                             // the soundscapes of the setting "Ambience": [value, name] (ambience.js)
const syncAmbience = () => setAmbience(S.music, Math.min(1, S.soundVolume * S.musicVolume * 2));          // (Volume x Ambience volume; both at 50 %, the defaults, play the file at 0.5: about 10 LU under the card and step sounds)
export const SPEEDS = [0.5, 1, 1.5, 2, 3, 4];                                  // the autoplay speeds, the steps of the slider (1 = the default)
export const HAND_SCALES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];            // the sizes of the cards in the hand (1 = the default size)
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ speed: S.speed, animationSpeed: S.animationSpeed, animations: S.animations, timeline: S.showTimeline, egLive: S.endgameLive, discounts: S.applyDiscounts, hand: S.handScale, bpreview: S.previewBuilding, encBorders: S.encBorders, actionStrip: S.actionStrip, handMode: S.handMode, noSnake: S.noSnake, animalSounds: S.animalSounds, stepSound: S.stepSound, volume: Math.round(S.soundVolume * 100), snakeSounds: S.snakeSounds, animalFor: S.animalFor, shoebillKey: S.shoebillKey, animalVolume: Math.round(S.animalVolume * 100), music: S.music, musicVolume: Math.round(S.musicVolume * 100), s274: S.s274, vcSeason: S.vcSeason, zoos: S.zooLayout, boardSwitch: S.boardSwitch, played: S.playedMode, drawerFull: S.drawerFull, logPos: S.logPos, logOrder: S.logOrder })); } catch (e) { /* no storage */ } };
document.addEventListener('drawerfull', () => save());
/* (no 'kelayout' save: see above) */                    // (the Key events graph of the results: order and open types, results.js `keSave`)                  // (the size button of the drawer, zoo.js: narrow beside the map / expanded over it)
export const settingsOpen = () => { const m = $('settingsModal'); return !!m && !m.hidden; };
let soundJump = null;                                                      // set by setupSettings: switches the open pop-up to the Sound tab with the extra Animal sounds settings unfolded
export function openSoundSettings() {                                     // the TURN ON tag of the Ctrl + S key in the keyboard pop-up (shortcuts.js) sends the user here
  const m = $('settingsModal');
  if (!m || !soundJump) return;
  if (m.hidden) toggleSettings();
  if (!m.hidden) soundJump();
}
export function toggleSettings() {
  const m = $('settingsModal'), g = $('settings');
  if (!m || !g || g.offsetParent === null) return;                 // (no gear on the page, e.g. the fork page: no settings)
  if (m.hidden) { m.hidden = false; m.querySelector('.modalx').focus(); } else close();
}
function close() { const m = $('settingsModal'); if (m) m.hidden = true; document.dispatchEvent(new Event('settingsclosed')); }
// the timeline is a row of its own between the two button rows of the control panel; while it is off, a decorative line (#tldeco) holds its place
export function applyTimeline() {
  const shown = S.showTimeline && !(S.replay && S.replay.partial);          // (a partial replay, the first moves only: its timeline would end after a few steps and mislead; the full replay brings it, main.js `loadRest`)
  const t = $('timeline');
  if (t) t.hidden = !shown;
  const d = $('tldeco');                                                   // the decorative line that the timeline replaces
  if (d) d.hidden = shown;
  fitSidebar();
}
export function applyHandScale() { document.body.style.setProperty('--hs', String(S.handScale)); }       // (parkposter.css sizes the dock from --hs)
// a slider with a few fixed steps whose knob carries the current value (the knob is drawn by CSS, the number lies over it): the autoplay speed and the size of the cards in the hand
function knobSlider(values, current, label, onPick, format = (v) => v + 'x') {
  const slider = el('input'); slider.type = 'range'; slider.className = 'setrange'; slider.min = '0'; slider.max = String(values.length - 1); slider.step = '1';
  slider.value = String(values.indexOf(current)); slider.setAttribute('aria-label', label);
  const track = el('div', 'settrack'), bubble = el('b', 'setbubble');
  const showVal = () => { const f = Number(slider.value) / (values.length - 1), v = values[Number(slider.value)]; bubble.textContent = format(v); slider.setAttribute('aria-valuetext', format(v)); bubble.style.left = 'calc(var(--inset, 0px) + var(--knob) / 2 + (100% - 2 * var(--inset, 0px) - var(--knob)) * ' + f + ')'; track.style.setProperty('--f', String(f)); };
  slider.addEventListener('input', () => { onPick(values[Number(slider.value)]); showVal(); }); showVal();
  track.append(slider, bubble);
  return track;
}
// the little icon chip in front of every setting (css `.setico`): a drawn glyph on a pastel tile
const ICONS = {
  people: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.3 3.3 0 0 1 0 6.4M18 14.3c2.2.6 3.5 2.7 3.5 5.7', '#b9dc9c'], snake: ['M3 17c2.5 0 3.5-1.5 3.5-3.5S5 10 7.5 8.5 12 8 12 10.5s-2 4.5.5 5.5 4-1 4-3-2-3 0-4.5 3.5-.5 4 1', '#c9b8e8'],
  keys: ['M3 7h18v10H3zM7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17.5 10.5h.01M8 14h8', '#9fc3ee'], music: ['M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z', '#f4a6a0'], mvol: ['M6 20v-6M6 10V4M12 20v-9M12 7V4M18 20v-4M18 12V4M4 14h4M10 7h4M16 16h4', '#f2d36b'],
  speed: ['M4 5l8 7-8 7zM12 5l8 7-8 7z', '#e58b6b'], log: ['M5 4h14v16H5zM8 8.5h8M8 12h8M8 15.5h5', '#f3c98b'], order: ['M7 4v16M4 17l3 3 3-3M13 6h7M13 11h5M13 16h3', '#b8d98f'], anim: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.5l5.5 3.5-5.5 3.5z', '#7fc3dd'], stopwatch: ['M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4.5l3 1.8M9.5 2h5M12 2v3', '#F4B63F'], time: ['M3 12h18M6 8v8M12 6v12M18 9v6', '#8fd09a'], shield: ['M12 2.5L19.5 4.5 18.3 8.2 21 10.5C21 16.5 16.5 20 12 21.5 7.5 20 3 16.5 3 10.5L5.7 8.2 4.5 4.5z', '#cdb8e8'], actions: ['M8 3h11v18H8zM8 7H4.5M8 12H4.5M8 17H4.5M12 8h4M12 12h4', '#d98ee0'],
  swap: ['M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4', '#a7a3ee'],
  boards: ['M3 5h8v14H3zM13 5h8v14h-8z', '#8fd09a'], played: ['M5 8h10v12H5zM9 4h10v12', '#e7c15d'], hand: ['M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15', '#9fb7e6'], frame: ['M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z', '#6fd0c3'], lens: ['M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l5 5', '#f0a8c8'],
  discount: ['M4 12l8-8h8v8l-8 8zM15.5 8.5h.01', '#f0a58f'], sound: ['M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10', '#9fd3c7'],
  note: ['M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', '#eea9c4'], paw: ['M12 12.5c-2.5 0-5 2.6-5 5 0 1.7 1.2 2.5 2.6 2.5 1 0 1.5-.4 2.4-.4s1.4.4 2.4.4c1.4 0 2.6-.8 2.6-2.5 0-2.4-2.5-5-5-5zM3.5 10.5a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0M7.3 6.5a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0M13.3 6.5a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0M17.1 10.5a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0', '#f2b27a'],
  statue: ['M4 20h16M7 20V10M12 20V10M17 20V10M4 10h16L12 4z', '#cdb8e8'], panda: ['M12 20.5c4.4 0 7.5-2.8 7.5-6.3S16.4 8.5 12 8.5s-7.5 2.2-7.5 5.7 3.1 6.3 7.5 6.3zM5.8 10.2A2.7 2.7 0 1 1 9 7.2M18.2 10.2A2.7 2.7 0 1 0 15 7.2', '#e4e0d4', '<ellipse cx="8.8" cy="13.5" rx="1.7" ry="2.2" transform="rotate(18 8.8 13.5)"/><ellipse cx="15.2" cy="13.5" rx="1.7" ry="2.2" transform="rotate(-18 15.2 13.5)"/><ellipse cx="12" cy="16.8" rx="1.3" ry="0.9"/>'],
};
const chip = (k) => { const [d, c, extra = ''] = ICONS[k], i = el('i', 'setico ico-' + k); i.style.background = c; i.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/>' + (extra ? '<g fill="#17262B" stroke="none">' + extra + '</g>' : '') + '</svg>'; return i; };
export function setupSettings() {
  const st = read();
  S.previewBuilding = st.bpreview !== false;                              // default: on
  S.actionStrip = st.actionStrip === true && !MINIGAME;                    // default: off (the action cards pinned under each board, zoo.js `actionStrip`)
  S.encBorders = st.encBorders === true;                                  // default: off
  S.applyDiscounts = st.discounts !== false;                              // default: on
  S.endgameLive = st.egLive !== false;                                    // default: on
  S.showTimeline = st.timeline === true;                                   // default: off
  S.logPos = st.logPos === 'below' && !MINIGAME ? 'below' : 'tab';         // default: the log is a tab of its own (sidebar.js `placeLog`)
  { const o = st.logOrder || {}, pick = (v, d) => (v === 'oldest' || v === 'newest' ? v : d); S.logOrder = { tab: pick(o.tab, 'oldest'), below: pick(o.below, 'newest') }; }      // default: oldest first as a tab, newest first below the boxes
  S.speed = SPEEDS.includes(st.speed) ? st.speed : 1;                  // default: 1x
  setAnimations(st.animations);                                    // default: all
  setAnimationSpeed(st.animationSpeed);                            // default: new half-pace 1x; independent of autoplay
  S.handScale = HAND_SCALES.includes(st.hand) ? st.hand : 1;               // default: 1x
  S.handMode = st.handMode === 'fan' ? 'fan' : 'tray';                   // default: the floating tray
  S.vcSeason = Number.isInteger(st.vcSeason) && st.vcSeason > 0 ? st.vcSeason : null;       // the Emu Cup winner on the Victory Column (null = the newest, winner-picker.js)
  S.s274 = st.s274 === 'mascot' ? 'mascot' : 'victory';                       // default: Victory Column (the BGA name)
  S.noSnake = NO_SNAKE_MODES.some(([v]) => v === st.noSnake) ? st.noSnake : 'show';        // default: show
  S.animalSounds = st.animalSounds === true;
  S.soundVolume = typeof st.volume === 'number' && st.volume >= 0 && st.volume <= 100 ? Math.round(st.volume / 5) * 0.05 : 0.5;       // default 50 %
  S.animalFor = st.animalFor === 'me' ? 'me' : 'all';                       // default: every player
  S.animalVolume = typeof st.animalVolume === 'number' && st.animalVolume >= 0 && st.animalVolume <= 100 ? Math.round(st.animalVolume / 5) / 20 : 0.5;       // default 50 %
  S.music = MUSIC.some(([v]) => v === st.music) ? st.music : 'off';          // default: off
  S.musicVolume = typeof st.musicVolume === 'number' && st.musicVolume >= 0 && st.musicVolume <= 100 ? Math.round(st.musicVolume / 5) / 20 : 0.5;       // default 50 %
  S.shoebillKey = st.shoebillKey !== false;                                // default: on
  S.snakeSounds = st.snakeSounds !== false;                                // default: on
  S.stepSound = st.stepSound === true;                                     // default: off (step-sound.js)                               // default: off (animal-sounds.js)
  if (S.stepSound) preloadSounds();                                       // (decoded before the first step, so the first hits are on time)
  S.zooLayout = ['side', 'tabs', 'stack'].includes(st.zoos) && (!FORK || PLAY) && !SANDBOX && !MINIGAME ? st.zoos : 'side';       // default: side by side (only the replay: a fork needs both boards)
  // (the Key events graph of the results is not restored: every new session starts with the default order and everything folded to a strip; changes only last while the page lives)
  S.boardSwitch = st.boardSwitch !== false;                                 // default: on (the Tabbed layout goes to the other player's board for key actions, card-motion.js)
  S.playedMode = PLAYED_MODES.some(([v]) => v === st.played) ? st.played : 'drawer';          // (default: the slide-out drawer; the old value 'side' was the drawer too)
  S.drawerFull = st.drawerFull === true ? { 0: true, 1: true } : st.drawerFull && typeof st.drawerFull === 'object' ? { 0: st.drawerFull[0] === true, 1: st.drawerFull[1] === true } : {};      // the drawer of each board: narrow beside the map (default) or expanded over it; the last choice is kept (an old setting was one boolean for both boards)
  if (S.playedMode === 'tray' && S.handMode !== 'tray') S.playedMode = 'drawer';           // the tray needs the floating hand (default of the setting: the drawer)
  applyHandScale();
  placeLog();                                                              // (the log's place and order, sidebar.js)
  const modal = el('div', 'modal'); modal.id = 'settingsModal'; modal.hidden = true;
  let openMenu = null;                                                     // the open dropdown list (only one at a time)
  const closeMenu = () => { if (openMenu) { openMenu.menu.remove(); openMenu.btn.setAttribute('aria-expanded', 'false'); openMenu = null; } };
  const dropdown = (sel) => {                                              // a dropdown in our style instead of the browser's list (that one scrolls and looks like Chrome): the native <select> stays hidden as the model (value, onchange, options), `sync` event = redraw after a programmatic change
    const wrap = el('span', 'setdd'), btn = el('button', 'setselect'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', sel.getAttribute('aria-label') || '');
    sel.hidden = true; sel.tabIndex = -1;
    const label = () => { const o = sel.options[sel.selectedIndex]; btn.textContent = o ? o.textContent : ''; };
    const pick = (o) => { sel.value = o.value; label(); closeMenu(); sel.dispatchEvent(new Event('change')); btn.focus(); };
    const open = () => {
      closeMenu();
      const menu = el('div', 'setmenu'); menu.setAttribute('role', 'listbox'); menu.style.setProperty('--tc', getComputedStyle(box).getPropertyValue('--tc'));      // (the active tab's colour fills the selected / hovered entry)
      const items = [...sel.options].map((o) => { const b = el('button', 'setopt' + (o.value === sel.value ? ' on' : ''), o.textContent); b.type = 'button'; b.setAttribute('role', 'option'); b.disabled = o.disabled; b.onclick = () => pick(o); menu.append(b); return b; });
      const m = modal.getBoundingClientRect(), r = btn.getBoundingClientRect(), z = m.width / modal.offsetWidth || 1;      // (the viewer is zoomed: screen pixels / zoom = layout pixels)
      menu.style.left = ((r.left - m.left) / z) + 'px'; menu.style.width = (r.width / z) + 'px'; menu.style.top = ((r.bottom - m.top) / z + modal.scrollTop + 6) + 'px';      // (+ scrollTop: the pop-up scrolls when it is taller than the window, modalscroll.js)
      modal.append(menu);
      if (menu.offsetTop + menu.offsetHeight > modal.scrollTop + modal.clientHeight - 8) menu.style.top = Math.max(8, (r.top - m.top) / z + modal.scrollTop - 6 - menu.offsetHeight) + 'px';      // (no room below: opens upward)
      openMenu = { menu, btn }; btn.setAttribute('aria-expanded', 'true');
      (items.find((b) => b.classList.contains('on')) || items.find((b) => !b.disabled))?.focus();
    };
    btn.onclick = () => (openMenu && openMenu.btn === btn ? closeMenu() : open());
    btn.onkeydown = (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } };
    sel.addEventListener('sync', label);
    label(); wrap.style.display = 'contents'; wrap.append(btn, sel);
    return wrap;
  };
  document.addEventListener('mousedown', (e) => { if (openMenu && !openMenu.menu.contains(e.target) && e.target !== openMenu.btn) closeMenu(); });
  document.addEventListener('keydown', (e) => {                            // keys inside an open list: arrows move, Esc closes only the list
    if (!openMenu) return;
    const items = [...openMenu.menu.querySelectorAll('.setopt:not(:disabled)')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); const b = openMenu.btn; closeMenu(); b.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
  }, true);
  const box = el('div', 'modalbox'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Settings');
  const head = el('div', 'modalhead');
  const x = el('button', 'modalx'); x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4L20 20M20 4L4 20" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" fill="none"/></svg>'; x.type = 'button'; x.title = 'Close (Esc)'; x.setAttribute('aria-label', 'Close'); x.onclick = close;
  head.append(el('b', '', 'Settings'), x);
  // Animations: a three-part switch (green all, yellow only standard, red none), css `.setthree`; the words are the tooltips
  const THREE = [['all', 'All', 'All\n(full animation pack)', '<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>'],
    ['standard', 'Only standard', 'Standard only\n(no detailed thematic animations)', '<path d="M4 12h16M14 6l6 6-6 6"/>'],
    ['none', 'None', 'None\n(all actions happen instantly)', '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>']];
  const animRow = el('div', 'setrow'), three = el('div', 'setthree'); three.setAttribute('role', 'radiogroup'); three.setAttribute('aria-label', 'Animations');
  let speedRange = null;
  const syncSpeed = () => { const off = S.animations === 'none', r = speedRange; box.classList.toggle('noanim', off); if (r) { r.disabled = off; r.title = off ? 'Off while Animations is None' : ''; } };      // (Animations = None: the speed slider is greyed and cannot be moved)
  const syncThree = () => { [...three.children].forEach((b, i) => { const on = ANIMATION_MODES[i] === S.animations; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }); syncSpeed(); };
  THREE.forEach(([v, name, tip, svg], i) => {
    const b = el('button', 'setthree-opt'); b.type = 'button'; b.dataset.v = v; b.dataset.tip = tip; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name);
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + svg + '</svg>';
    b.onclick = () => { setAnimations(v); save(); syncThree(); };
    b.onkeydown = (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); const n = (i + (e.key === 'ArrowRight' ? 1 : panels.length - 1)) % panels.length; setAnimations(THREE[n][0]); save(); syncThree(); three.children[n].focus(); } };
    three.append(b);
  });
  syncThree();
  animRow.append(el('span', 'setlabel', 'Animations'), three);
  const animationRow = el('div', 'setrow setslide speedrow');
  animationRow.append(el('span', 'setlabel', 'Animation speed'), knobSlider(ANIMATION_SPEEDS, S.animationSpeed, 'Animation speed', (v) => { setAnimationSpeed(v); save(); }, (v) => v + 'x'));
  speedRange = animationRow.querySelector('.setrange'); syncSpeed();
  const volRow = el('div', 'setrow setslide');                             // the volume of every sound (step sounds, animal calls): 0-100 % in steps of 5, default 50 %
  volRow.append(el('span', 'setlabel', 'Volume'), knobSlider(Array.from({ length: 21 }, (_, i) => i * 5), Math.round(S.soundVolume * 100), 'Sound volume', (v) => { S.soundVolume = v / 100; save(); syncAmbience(); }, (v) => v + '%'));
  volRow.querySelector('input').addEventListener('change', () => playStep());          // (let go of the slider: the swoosh at the new level)
  const stepRow = el('label', 'setrow');                                  // a short swoosh on each step forward (step-sound.js), every mode
  const stepsw = el('input'); stepsw.type = 'checkbox'; stepsw.className = 'setswitch'; stepsw.checked = S.stepSound;
  stepsw.onchange = () => { S.stepSound = stepsw.checked; save(); if (S.stepSound) playStep(); };
  stepRow.append(el('span', 'setlabel', 'Animation sounds'), stepsw);
  const speedRow = el('div', 'setrow setslide');                         // the autoplay speed: a slider with five steps (0.5x ... 4x)
  speedRow.append(el('span', 'setlabel', 'Autoplay speed'), knobSlider(SPEEDS, S.speed, 'Autoplay speed', (v) => { setSpeed(v); save(); }));
  const tlRow = el('label', 'setrow');
  const sw = el('input'); sw.type = 'checkbox'; sw.className = 'setswitch'; sw.checked = S.showTimeline;
  sw.onchange = () => { S.showTimeline = sw.checked; save(); applyTimeline(); };
  tlRow.append(el('span', 'setlabel', 'Timeline in the control panel'), sw);
  const egRow = el('label', 'setrow');                                    // the live count of the endgame points of the sponsors (and, for a player whose cards are shown, of the endgame cards)
  const egsw = el('input'); egsw.type = 'checkbox'; egsw.className = 'setswitch'; egsw.checked = S.endgameLive;
  egsw.onchange = () => { S.endgameLive = egsw.checked; save(); document.dispatchEvent(new Event('eglive')); };
  egRow.append(el('span', 'setlabel', 'Endgame live count'), egsw);
  egRow.title = 'Shows the points that the sponsors (and your endgame cards) would give at the end of the game right now, as a violet +X under the appeal and conservation points';
  const pvRow = el('label', 'setrow');                                    // the placement preview: a right click on a sponsor building card of a hand, or on a zoo map (an enclosure of the picker), shows where it would fit (bpreview.js)
  const pvsw = el('input'); pvsw.type = 'checkbox'; pvsw.className = 'setswitch'; pvsw.checked = S.previewBuilding;
  pvsw.onchange = () => { S.previewBuilding = pvsw.checked; save(); document.dispatchEvent(new Event('bpreview')); };
  const pvLabel = el('span', 'setlabel', 'Map placement preview');
  const pvNote = el('div', 'pvnote'); pvNote.hidden = true; pvNote.setAttribute('role', 'tooltip');
  pvNote.innerHTML = '<h4>Map placement preview</h4><ul><li>Right-click a card with a sponsor building in your hand to preview its placement</li><li>Right-click on the map to preview the placement of standard and special enclosures</li></ul>';
  const showNote = (help, note) => {                                      // the note hangs from the ? (its tape touches it): measured in screen pixels, divided by the viewer zoom
    const m = modal.getBoundingClientRect(), q = help.getBoundingClientRect(), z = m.width / modal.offsetWidth || 1;
    const left = box.offsetLeft + 28, w = box.offsetWidth - 56, qx = (q.left + q.width / 2 - m.left) / z;
    note.style.left = left + 'px'; note.style.width = w + 'px'; note.style.top = ((q.bottom - m.top) / z + modal.scrollTop + 21) + 'px'; note.style.setProperty('--tx', (qx - left) + 'px'); note.hidden = false;
  };
  const helpMark = (label, note) => {                                     // a ? in a label: the sticky note opens on hover or keyboard focus
    const h = el('span', 'qm', '?'); h.tabIndex = 0; h.setAttribute('role', 'note'); h.setAttribute('aria-label', label + ' help');
    h.onmouseenter = h.onfocus = () => showNote(h, note); h.onmouseleave = h.onblur = () => { note.hidden = true; }; h.onclick = (e) => e.preventDefault();
    return h;
  };
  pvLabel.append(helpMark('Map placement preview', pvNote));
  pvRow.append(pvLabel, pvsw);
  const ebRow = el('label', 'setrow');                                    // a border round every enclosure (board.js ENC_BORDER)
  const ebsw = el('input'); ebsw.type = 'checkbox'; ebsw.className = 'setswitch'; ebsw.checked = S.encBorders;
  ebsw.onchange = () => { S.encBorders = ebsw.checked; save(); document.dispatchEvent(new Event('encborders')); };
  ebRow.append(el('span', 'setlabel', 'Show enclosure borders'), ebsw);
  const asRow = el('label', 'setrow');                                    // the five action cards in their real order under each board (zoo.js `actionStrip`)
  const assw = el('input'); assw.type = 'checkbox'; assw.className = 'setswitch'; assw.checked = S.actionStrip;
  assw.onchange = () => { S.actionStrip = assw.checked; save(); document.dispatchEvent(new Event('actionstrip')); };
  asRow.append(el('span', 'setlabel', 'Action cards under the board'), assw);
  const dcRow = el('label', 'setrow');                                    // the price of the animals after the discounts (price.js): the badge of the card is drawn again, every card is drawn again
  const dcsw = el('input'); dcsw.type = 'checkbox'; dcsw.className = 'setswitch'; dcsw.checked = S.applyDiscounts;
  dcsw.onchange = () => { S.applyDiscounts = dcsw.checked; save(); document.dispatchEvent(new Event('nosnake')); };
  const dcLabel = el('span', 'setlabel', 'Apply discounts to animals');
  const dcNote = el('div', 'pvnote'); dcNote.hidden = true; dcNote.setAttribute('role', 'tooltip');
  dcNote.innerHTML = '<h4>Apply discounts to animals</h4><ul><li>Automatically apply discounts from partner zoos, Expert in Small Animals and Expert in Large Animals to animal cards</li></ul>';
  dcLabel.append(helpMark('Apply discounts to animals', dcNote));
  dcRow.append(dcLabel, dcsw);
  const handRow = el('div', 'setrow setslide');                            // the size of the cards in the hand: a slider with seven steps
  handRow.append(el('span', 'setlabel', 'Hand card size'), knobSlider(HAND_SCALES, S.handScale, 'Size of the cards in the hand', (v) => { S.handScale = v; applyHandScale(); save(); }));
  const modeRow = el('div', 'setrow');                                    // how the hand is shown: a fan at the screen edge, or a floating tray (dock.js)
  const sel = el('select', 'setselect'); sel.setAttribute('aria-label', 'Cards in hand');
  for (const [v, t] of [['tray', 'Floating container'], ['fan', 'Fan at the screen edge']]) { const o = el('option', '', t); o.value = v; sel.append(o); }
  sel.value = S.handMode;
  sel.onchange = () => {
    S.handMode = sel.value === 'fan' ? 'fan' : 'tray';
    if (S.handMode !== 'tray' && S.playedMode === 'tray') { S.playedMode = 'drawer'; psel.value = 'drawer'; document.dispatchEvent(new Event('playedmode')); }   // the played-cards tray lives in the hand dock: back to the default
    syncPlayedOptions(); save(); document.dispatchEvent(new Event('handmode'));
  };
  modeRow.append(el('span', 'setlabel', 'Cards in hand'), dropdown(sel));
  const playedRow = el('div', 'setrow');                                  // where the played cards are shown (zoo.js)
  const psel = el('select', 'setselect'); psel.setAttribute('aria-label', 'Played cards');
  const syncPlayedOptions = () => {                                       // the tabbed and the top / bottom layouts list only "Cards next to the map"; the side-by-side layout lists the first three (the tray is greyed without the floating hand)
    const beside = (!FORK || PLAY) && !SANDBOX && !MINIGAME && (S.zooLayout === 'tabs' || S.zooLayout === 'stack');      // (the same test as zoo.js `besideLayout`)
    psel.replaceChildren();
    for (const [v, t] of PLAYED_MODES) {
      if (beside ? v !== 'beside' : v === 'beside') continue;                // (the options that do not belong to the layout are not listed at all)
      const o = el('option', '', t); o.value = v;
      if (!beside && v === 'tray' && S.handMode !== 'tray') { o.disabled = true; o.style.color = 'rgba(23,38,43,.6)'; }
      psel.append(o);
    }
    psel.value = beside ? 'beside' : S.playedMode === 'beside' || (S.playedMode === 'tray' && S.handMode !== 'tray') ? 'drawer' : S.playedMode;      // (what zoo.js `playedMode` shows)
    psel.dispatchEvent(new Event('sync'));                                // (the dropdown redraws its label)
  };
  syncPlayedOptions();
  psel.onchange = () => { S.playedMode = psel.value; save(); document.dispatchEvent(new Event('playedmode')); };
  playedRow.append(el('span', 'setlabel', 'Played cards'), dropdown(psel));
  const snakeRow = el('div', 'setrow');                                   // the cards with a snake photo (nosnake.js): shown, suppressed or replaced by the Slow Worm
  const ssel = el('select', 'setselect'); ssel.setAttribute('aria-label', 'No-snake mode');
  for (const [v, t] of NO_SNAKE_MODES) { const o = el('option', '', t); o.value = v; ssel.append(o); }
  ssel.value = S.noSnake;
  ssel.onchange = () => { S.noSnake = ssel.value; save(); document.dispatchEvent(new Event('nosnake')); };
  snakeRow.append(el('span', 'setlabel', 'No-snake mode'), dropdown(ssel));
  const sndRow = el('label', 'setrow');                                   // an animal that enters a zoo plays its call (animal-sounds.js), only when the board moves on by one step
  const sndsw = el('input'); sndsw.type = 'checkbox'; sndsw.className = 'setswitch'; sndsw.checked = S.animalSounds;
  sndsw.onchange = () => { S.animalSounds = sndsw.checked; save(); syncSub(); if (sndsw.checked) setMore(true); };          // (switching them on opens their window, see setMore)
  const snakeSndRow = el('label', 'setrow');                       // under Animal sounds, unfolded by its More button: the calls of the snakes (the cobras, pythons and the Slow Worm's hiss)
  const snakeSw = el('input'); snakeSw.type = 'checkbox'; snakeSw.className = 'setswitch'; snakeSw.checked = S.snakeSounds;
  snakeSw.onchange = () => { S.snakeSounds = snakeSw.checked; save(); };
  snakeSndRow.append(el('span', 'setlabel', 'Snake sounds'), snakeSw);
  const forRow = el('div', 'setrow');                                // "Calls for": every player's animals, or only the followed player's / your own (animal-sounds.js `mySeat`)
  const fsel = el('select', 'setselect'); fsel.setAttribute('aria-label', 'Animal calls for');
  for (const [v, t] of [['all', 'All players'], ['me', 'Only me']]) { const o = el('option', '', t); o.value = v; fsel.append(o); }
  fsel.value = S.animalFor; fsel.onchange = () => { S.animalFor = fsel.value; save(); };
  forRow.append(el('span', 'setlabel', 'Play animal sounds for'), dropdown(fsel));
  const avolRow = el('div', 'setrow setslide');                       // the volume of the animal calls on top of Volume: 0-100 %, default 100
  avolRow.append(el('span', 'setlabel', 'Animal volume'), knobSlider(Array.from({ length: 21 }, (_, i) => i * 5), Math.round(S.animalVolume * 100), 'Animal call volume', (v) => { S.animalVolume = v / 100; save(); }, (v) => v + '%'));
  const keyRow = el('label', 'setrow');                             // Ctrl + S plays the Shoebill's call (main.js, animal-sounds.js `playShoebill`); off: the browser keeps Ctrl + S
  const keySw = el('input'); keySw.type = 'checkbox'; keySw.className = 'setswitch'; keySw.checked = S.shoebillKey;
  keySw.onchange = () => { S.shoebillKey = keySw.checked; save(); };
  const keys = el('span', 'setlabel setkeys'); keys.innerHTML = '<kbd>Ctrl</kbd><i>+</i><kbd>S</kbd><span>for Shoebill sound</span>';
  keyRow.append(keys, keySw);
  const subRows = [forRow, avolRow, snakeSndRow, keyRow];
  const syncSub = () => { closeMenu(); subRows.forEach((r) => { r.classList.toggle('off', !sndsw.checked); r.inert = !sndsw.checked; if (sndsw.checked) r.removeAttribute('aria-disabled'); else r.setAttribute('aria-disabled', 'true'); }); };          // (Animal sounds off: the rows of its window are greyed out and cannot be changed, `inert` also keeps the keyboard out)
  const sub = el('div', 'modalbox subwin'); sub.setAttribute('role', 'dialog'); sub.setAttribute('aria-label', 'Animal sounds');   // the window of the extra Animal sounds settings: opened by More, over the dimmed Settings (smaller than it); X, Esc or a click on the dim close it
  const subDim = el('div', 'subdim');
  const back = el('button', 'modalx'); back.type = 'button'; back.title = 'Close (Esc)'; back.setAttribute('aria-label', 'Close'); back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4L20 20M20 4L4 20" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" fill="none"/></svg>';
  const shead = el('div', 'modalhead'); shead.append(el('b', '', 'Animal sounds'), back);
  const spanel = el('div', 'setpanel');
  for (const [r, k] of [[forRow, 'people'], [avolRow, 'sound'], [snakeSndRow, 'snake'], [keyRow, 'keys']]) { r.prepend(chip(k)); spanel.append(r); }
  const credit = el('div', 'subcredit');                                   // credit for the original developer of the animal sounds (a standalone browser plugin), under the settings of this window
  const plug = el('div', 'creditrow'); plug.append('All sounds are taken from the ', el('b', '', 'Ark Nova Ambience'), ' plugin.');
  const thanks = el('div', 'creditrow'); thanks.append('Big thanks to Yurii! Check out his other stuff ');
  const here = el('a', '', 'here'); here.href = 'https://play.google.com/store/apps/developer?id=Yurii+Sol'; here.target = '_blank'; here.rel = 'noopener noreferrer'; thanks.append(here, '.');
  credit.append(plug, thanks);
  sub.append(shead, spanel, credit);
  syncSub();
  const moreBtn = el('button', 'setmore'); moreBtn.type = 'button'; moreBtn.setAttribute('aria-haspopup', 'dialog'); moreBtn.setAttribute('aria-label', 'More animal sound settings');
  moreBtn.innerHTML = 'More <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4"/></svg>';
  const setMore = (open, focus = true) => { closeMenu(); const was = animalMore; animalMore = open; sub.hidden = subDim.hidden = !open; moreBtn.setAttribute('aria-expanded', String(open)); if (!focus) return; if (open) back.focus({ preventScroll: true }); else if (was) moreBtn.focus({ preventScroll: true }); };
  setMore(false, false);
  moreBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setMore(true); };          // (the row's own click toggles the Animal sounds switch: only this button opens the window)
  back.onclick = () => setMore(false);
  subDim.addEventListener('mousedown', () => setMore(false));
  document.addEventListener('settingsclosed', () => setMore(false, false));
  sndsw.id = 'animalSoundsSwitch'; sndRow.htmlFor = sndsw.id;               // (a click on the row toggles this switch, not the More button: the first control inside a label would be its target)
  sndRow.append(el('span', 'setlabel', 'Animal sounds'), moreBtn, sndsw);
  const statueRow = el('div', 'setrow');                                  // the sponsor S274: Victory Column (BGA) or Mascot Statue (card data); cards.js `info` swaps name and pictures
  const tsel = el('select', 'setselect'); tsel.setAttribute('aria-label', 'Statue card');
  for (const [v, t] of [['victory', 'Victory Column'], ['mascot', 'Mascot Statue']]) { const o = el('option', '', t); o.value = v; tsel.append(o); }
  tsel.value = S.s274;
  const vcBtn = winnerButton(() => { save(); document.dispatchEvent(new Event('nosnake')); });                       // the portrait of the chosen Emu Cup winner left of the dropdown (only with Victory Column)
  tsel.onchange = () => { S.s274 = tsel.value; showWinnerButton(vcBtn, S.s274 !== 'mascot'); save(); document.dispatchEvent(new Event('nosnake')); };       // (the same refresh as the no-snake mode: every card is drawn again)
  statueRow.append(el('span', 'setlabel', 'Statue card'), vcBtn, dropdown(tsel));
  const zooRow = el('div', 'setrow');                                     // how the two zoo boards are laid out (main.js `zooBoards`)
  const zsel = el('select', 'setselect'); zsel.setAttribute('aria-label', "Players' boards");
  for (const [v, t] of [['side', 'Side by side'], ['stack', 'Top / bottom'], ['tabs', 'Tabbed']]) { const o = el('option', '', t); o.value = v; zsel.append(o); }
  zsel.value = S.zooLayout;
  zsel.onchange = () => { S.zooLayout = zsel.value; syncPlayedOptions(); syncBsw(); save(); document.dispatchEvent(new Event('zoolayout')); };
  zooRow.append(el('span', 'setlabel', 'Player boards'), dropdown(zsel));
  const bswRow = el('label', 'setrow');                                   // only in the Tabbed layout: does the shown board follow the other player's key actions (card-motion.js `tabVisit`)
  const bswsw = el('input'); bswsw.type = 'checkbox'; bswsw.className = 'setswitch'; bswsw.checked = S.boardSwitch;
  bswsw.onchange = () => { S.boardSwitch = bswsw.checked; save(); };
  bswRow.append(el('span', 'setlabel', 'Switches to other board for key actions'), bswsw);
  const syncBsw = () => { bswRow.style.display = S.zooLayout === 'tabs' ? '' : 'none'; };
  syncBsw();
  const musicRow = el('div', 'setrow');                                  // background ambience: Off or a soundscape (MUSIC = ambience.js AMBIENCE)
  const msel = el('select', 'setselect'); msel.setAttribute('aria-label', 'Ambience');
  for (const [v, t] of [['off', 'Off'], ...MUSIC]) { const o = el('option', '', t); o.value = v; msel.append(o); }
  msel.value = S.music; msel.onchange = () => { S.music = msel.value; save(); syncAmbience(); };
  musicRow.append(el('span', 'setlabel', 'Ambience'), dropdown(msel));
  const mvolRow = el('div', 'setrow setslide');                           // the volume of the ambience on top of Volume: 0-100 %, default 50
  mvolRow.append(el('span', 'setlabel', 'Ambience volume'), knobSlider(Array.from({ length: 21 }, (_, i) => i * 5), Math.round(S.musicVolume * 100), 'Ambience volume', (v) => { S.musicVolume = v / 100; save(); syncAmbience(); }, (v) => v + '%'));
  const logRow = el('div', 'setrow');                                     // where the log is: a tab of its own, or under the info boxes in the control pane (sidebar.js `placeLog`)
  const lsel = el('select', 'setselect'); lsel.setAttribute('aria-label', 'Log');
  for (const [v, t] of [['tab', 'Tabbed mode'], ['below', 'Scroll mode']]) { const o = el('option', '', t); o.value = v; lsel.append(o); }
  lsel.value = S.logPos;
  const orderRow = el('div', 'setrow');                                   // which move the log lists first; remembered for each place of the log (a tab: oldest first, below the boxes: newest first by default)
  const osel = el('select', 'setselect'); osel.setAttribute('aria-label', 'Log order');
  for (const [v, t] of [['oldest', 'Oldest move first'], ['newest', 'Newest move first']]) { const o = el('option', '', t); o.value = v; osel.append(o); }
  const placeKey = () => (S.logPos === 'below' ? 'below' : 'tab');
  osel.value = S.logOrder[placeKey()];
  lsel.onchange = () => { S.logPos = lsel.value === 'below' ? 'below' : 'tab'; osel.value = S.logOrder[placeKey()]; osel.dispatchEvent(new Event('sync')); save(); placeLog(); };
  osel.onchange = () => { S.logOrder = { ...S.logOrder, [placeKey()]: osel.value === 'newest' ? 'newest' : 'oldest' }; save(); placeLog(); };
  logRow.append(el('span', 'setlabel', 'Log'), dropdown(lsel));
  orderRow.append(el('span', 'setlabel', 'Log order'), dropdown(osel));
  const tabs = el('div', 'settabs'); tabs.setAttribute('role', 'tablist');       // Control | Board | Cards | Sound: the rows are grouped on four tabs; the one last used stays open while the page is open
  const panels = [['Control', [[animRow, 'anim'], [animationRow, 'stopwatch'], [egRow, 'shield'], [tlRow, 'time'], [speedRow, 'speed'], [logRow, 'log'], [orderRow, 'order']]], ['Board', [[zooRow, 'boards'], [bswRow, 'swap'], [modeRow, 'hand'], [playedRow, 'played'], [asRow, 'actions'], [pvRow, 'lens'], [ebRow, 'frame']]], ['Cards', [[handRow, 'played'], [dcRow, 'discount'], [statueRow, 'statue'], [snakeRow, 'panda']]], ['Sound', [[volRow, 'sound'], [musicRow, 'music'], [mvolRow, 'mvol'], [stepRow, 'note'], [sndRow, 'paw']]]].map(([name, rows], i) => {
    const pn = el('div', 'setpanel'); pn.setAttribute('role', 'tabpanel'); for (const [r, k] of rows) { if (k) r.prepend(chip(k)); pn.append(r); }
    const b = el('button', 'settab', name); b.type = 'button'; b.setAttribute('role', 'tab');
    b.onclick = () => showTab(i);
    b.onkeydown = (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); const n = (i + (e.key === 'ArrowRight' ? 1 : panels.length - 1)) % panels.length; showTab(n); tabs.children[n].focus(); } };
    tabs.append(b);
    return pn;
  });
  const showTab = (i) => { settingsTab = i; box.dataset.tab = String(i); panels.forEach((pn, k) => { pn.hidden = k !== i; tabs.children[k].classList.toggle('on', k === i); tabs.children[k].setAttribute('aria-selected', String(k === i)); tabs.children[k].tabIndex = k === i ? 0 : -1; }); };
  showTab(settingsTab);
  soundJump = () => { showTab(3); setMore(true); };                          // (see openSoundSettings)
  box.append(head, tabs, ...panels, subDim, sub);
  modal.append(box, pvNote, dcNote);
  modal.addEventListener('mousedown', (e) => { if (e.target === modal && !onScrollbar(e, modal)) close(); });         // a click on the dimmed background closes it
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && settingsOpen()) { e.stopPropagation(); if (animalMore) setMore(false); else close(); } }, true);          // (Esc closes the Animal sounds window first)
  document.body.append(modal);
  const wheel = $('settings');
  if (wheel) wheel.onclick = () => { modal.hidden = false; x.focus(); };
  setSpeed(S.speed);
  syncAmbience();
  applyTimeline();
}
