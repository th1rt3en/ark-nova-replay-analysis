/* The sound of the library rooms (cards, action cards, bonus tiles, maps): the same ambience loop as the hall (web/js/library.js, web/sounds/library_ambience.mp3),
   switched by one button per page and one remembered choice for the whole library (`libraryHallSound`, shared with the hall). Browsers do not let a page start sound
   by itself, so when the choice is "on" the loop starts at once if the browser allows it, else on the first click anywhere. The loop carries on where it stopped when
   one library page opens the next (`libraryHallTime` + `libraryHallAt` in sessionStorage, written when a page is left; the hall page does the same). A page change still
   leaves a short gap that cannot be avoided (the next page has to load), so it is softened: the loop fades out when a link is followed (FADE_OUT ms), the position
   carries on by the time the gap took (the loop is not replayed), the file is requested as early as possible and the loop fades in again (FADE_IN ms).
   Add to a page: a button with id `roomsound` (or `sound`) and <script type="module" src="/js/library_sound.js">. Other code can follow the choice with
   `isSoundOn()` / `onSoundChange(fn)` (js/library_tiles.js plays its wooden taps only while it is on). */
const KEY = 'libraryHallSound', TIME = 'libraryHallTime', AT = 'libraryHallAt', VOLUME = .25, FADE_IN = 500, FADE_OUT = 160;
// (the storage object is looked up inside the try: where the browser refuses storage, reading `localStorage` itself throws)
const storeOf = (which) => (which === 'session' ? sessionStorage : localStorage);
const get = (k, which) => { try { return storeOf(which).getItem(k); } catch { return null; } };
const put = (k, v, which) => { try { storeOf(which).setItem(k, v); } catch { /* not remembered */ } };
// One volume for the whole library, set with the slider beside the sound button (the tile room's own earlier key is still read).
const volumeInput=document.getElementById('library-volume')||document.querySelector('.libvol-range'), VOLUME_KEY='libraryVolume';
const storedVolume=Number(get(VOLUME_KEY)||get('libraryTileVolume'));
let level=storedVolume>0&&storedVolume<=1?storedVolume:.5, zeroed=false;   // (50 % until a volume is chosen; zeroed: the slider was pulled down to 0)
let want = get(KEY) === '1';
export const getSoundVolume=()=>want?level:0;
function showVolume(){if(!volumeInput)return;const v=want||!zeroed?Math.round(level*100):0;volumeInput.value=v;volumeInput.style.setProperty('--volume',v+'%');volumeInput.setAttribute('aria-valuetext',v===0?'Muted':want?v+' percent':v+' percent, muted');}   // (muted by the button: the slider stays at the level)
const listeners = new Set();
export const isSoundOn = () => want;
export const onSoundChange = (fn) => { listeners.add(fn); };
export const isPlaying = () => !snd.paused;

const snd = new Audio('/sounds/library_ambience.mp3'); snd.loop = true; snd.preload = want ? 'auto' : 'none'; snd.volume = VOLUME * level;   // (when it was on, fetch the file now)
const btn = document.getElementById('roomsound') || document.getElementById('sound') || document.getElementById('soundbtn');
const show = (on) => { if (!btn) return; btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on)); btn.setAttribute('aria-label', on ? 'Sound on' : 'Sound off'); showVolume(); };
let fade = 0, leaving = null;           // leaving: the page is being left (the function that goes on): no other fade may replace the fade-out
function ramp(to, ms, done) {            // volume ramp (a fade is a short series of steps: an <audio> element has no gain node)
  if (leaving && done !== leaving) return;
  cancelAnimationFrame(fade); const from = snd.volume, t0 = performance.now();
  const step = (now) => { const k = Math.max(0, Math.min(1, (now - t0) / ms)); snd.volume = Math.max(0, Math.min(1, from + (to - from) * k)); if (k < 1) fade = requestAnimationFrame(step); else if (done) done(); };
  fade = requestAnimationFrame(step);
}
function resumeAt() {                    // where the loop was when the last page was left, plus the time since then
  const t = parseFloat(get(TIME, 'session')), at = parseFloat(get(AT, 'session'));
  if (!Number.isFinite(t) || t <= 0 || !snd.duration) return 0;
  const gap = Number.isFinite(at) ? Math.max(0, Math.min(10, (Date.now() - at) / 1000)) : 0;
  return (t + gap) % snd.duration;
}
let pendingStart=null;
function start() {
  if(!snd.paused){ramp(VOLUME*level,100);return Promise.resolve();}
  if(pendingStart)return pendingStart;
  const ready=snd.readyState>=1?Promise.resolve():new Promise((ok,no)=>{snd.addEventListener('loadedmetadata',ok,{once:true});snd.addEventListener('error',no,{once:true});snd.load();});
  pendingStart=ready.then(()=>{if(!want)return;const t=resumeAt();if(t>0){try{snd.currentTime=t;}catch{}}snd.volume=0;return snd.play().then(()=>{if(want)ramp(VOLUME*level,FADE_IN);else snd.pause();});}).finally(()=>{pendingStart=null;});
  return pendingStart;
}
function set(on) {
  want = on; if (on) zeroed = false; put(KEY, on ? '1' : '0'); showVolume();
  if (on) start().then(() => show(want && !snd.paused), () => show(false)); else { ramp(0, 200, () => { snd.pause(); snd.volume = VOLUME * level; }); show(false); }
  listeners.forEach((fn) => fn(on));
}
if(volumeInput)volumeInput.addEventListener('input',()=>{const v=Number(volumeInput.value)/100;zeroed=v===0;if(v>0){level=v;put(VOLUME_KEY,String(level));}set(v>0);});
// (on while it plays or is starting; when the browser blocked the start the button shows off, and a click turns it on)
if (btn) btn.addEventListener('click', () => set(!(want && (!snd.paused || pendingStart))));
show(false);
if (want) {
  // (a press on the sound button is left to the button: starting here and then toggling would turn the sound off)
  const first = (e) => { if (btn && btn.contains(e.target)) { document.addEventListener('pointerdown', first, { once: true }); return; } if (want && snd.paused) start().then(() => show(want && !snd.paused), () => {}); };
  start().then(() => show(want && !snd.paused), () => document.addEventListener('pointerdown', first, { once: true }));
}
// back on this page from the browser's cache: the loop was faded out when the page was left
addEventListener('pageshow', (e) => { if (e.persisted) leaving = null; if (e.persisted && want) start().then(() => show(want && !snd.paused), () => show(false)); });
addEventListener('pagehide', () => { if (!snd.paused) { put(TIME, String(snd.currentTime), 'session'); put(AT, String(Date.now()), 'session'); } });
// (the hall's bays are not links: they fade the loop out with this before they open a section)
// The page goes on exactly once: when the fade-out ends, or a moment after its time when the fade cannot finish (a hidden tab gets no animation frames).
export const fadeOutThen = (go) => {
  if (leaving) return;
  let gone = false;
  leaving = () => { if (!gone) { gone = true; go(); } };
  if (snd.paused) return leaving();
  ramp(0, FADE_OUT, leaving);
  setTimeout(leaving, FADE_OUT + 150);
};
// following a link of the library: fade the loop out first (a moment later the next page loads).
// The library's links carry no `href` while the page is open: a link with an `href` makes the browser show its address in a box at the bottom left on hover.
// So at load (and for every link made later) the `href` moves to `data-href`, the link keeps its role, focus and Enter key, and this handler follows it.
const NOPREVIEW = (a) => { const h = a.getAttribute('href'); if (h == null) return; a.dataset.href = h; a.removeAttribute('href'); a.setAttribute('role', 'link'); if (a.tabIndex < 0 || !a.hasAttribute('tabindex')) a.tabIndex = 0; a.style.cursor = 'var(--cur-hand, pointer)'; };
const scanLinks = (root) => { if (root.nodeType !== 1) return; if (root.matches('a[href]')) NOPREVIEW(root); root.querySelectorAll('a[href]').forEach(NOPREVIEW); };
scanLinks(document.documentElement);
new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(scanLinks))).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[data-href]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const url = new URL(a.dataset.href, location.href); if (url.origin !== location.origin) return;
  e.preventDefault(); fadeOutThen(() => { location.href = url.href; });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.defaultPrevented && e.target.matches && e.target.matches('a[data-href]')) { e.preventDefault(); e.target.click(); } });
// another library tab changed the volume
addEventListener('storage', (e) => { if (e.key !== VOLUME_KEY) return; const v = Number(e.newValue); if (v > 0 && v <= 1) { level = v; showVolume(); if (!snd.paused) ramp(VOLUME * level, 100); } });
// another library tab changed the choice
addEventListener('storage', (e) => { if (e.key === KEY) { want = e.newValue === '1'; if (want && snd.paused) start().then(() => show(want && !snd.paused), () => {}); if (!want) { snd.pause(); show(false); } listeners.forEach((fn) => fn(want)); } });
