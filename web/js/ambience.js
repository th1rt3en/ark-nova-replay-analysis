// [module] Background ambience: one looping soundscape per page (web/sounds/ambience/*.mp3, 60 min each, the end crossfaded into the start so the loop has no seam, all levelled to -34 LUFS like the library's hall sound).
// Used by the setting "Ambience" (settings.js, Sound tab: Volume x Ambience volume) and by the front page (landing.js, Park Nova, always on for now).
// Browsers do not let a page start sound by itself: when play() is refused, it starts at the first click or key press. It keeps playing while the tab or window is in the background, and each page starts at a random point of the hour.

export const AMBIENCE = [['park-nova', 'Park Nova'], ['jungle', 'Jungle'], ['ocean', 'Ocean'], ['rainy-night', 'Rainy Night'], ['farm', 'Farm']];
const GAIN = { 'rainy-night': 0.65 };                                       // per soundscape, on top of the volume: the rain is louder than the others (about -3.7 dB)
const FADE_MS = 1500;                                                       // fade in at the start (and after a change of the soundscape)

let audio = null, current = null, level = 0, armed = false, fade = 0;

const ramp = (a, to) => {                                                    // fade the element to the level `to`
  clearInterval(fade);
  const from = a.volume, t0 = performance.now();
  fade = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / FADE_MS); a.volume = from + (to - from) * k; if (k >= 1) clearInterval(fade); }, 40);
};

const start = () => {
  if (!audio) return;
  audio.play().then(() => ramp(audio, level), arm);
};

function arm() {                                                           // play() was refused (no click on the page yet): try again at the first click or key
  if (armed) return; armed = true;
  const go = () => { armed = false; for (const t of ['pointerdown', 'keydown', 'touchend']) document.removeEventListener(t, go, true); start(); };
  for (const t of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(t, go, true);
}

// (no pause while the tab or window is hidden: the soundscape keeps playing in the background like a music video; browsers only stop it when the audio was never started)
document.addEventListener('visibilitychange', () => { if (audio && audio.paused && !document.hidden) start(); });

// name: one of AMBIENCE (or 'off' / null = silence); volume: 0-1, the level of the element
export function setAmbience(name, volume) {
  const want = AMBIENCE.some(([v]) => v === name) ? name : null;
  level = Math.max(0, Math.min(1, volume * (GAIN[want] ?? 1)));
  if (want === current) { if (audio && !audio.paused) { clearInterval(fade); audio.volume = level; } return; }
  current = want;
  if (audio) { clearInterval(fade); audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
  if (!want) return;
  const a = new Audio('/sounds/ambience/' + want + '.mp3');
  a.loop = true; a.preload = 'auto'; a.volume = 0;
  a.addEventListener('loadedmetadata', () => { if (a.currentTime < 1 && isFinite(a.duration)) try { a.currentTime = Math.random() * a.duration * 0.9; } catch { /* the server does not allow seeking: from the start */ } }, { once: true });
  audio = a;
  start();
}
