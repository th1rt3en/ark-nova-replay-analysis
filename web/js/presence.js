// "Who is on the site": an anonymous heartbeat to the Cloudflare Worker (`POST <worker>/presence`, cloudflare/src/presence.ts), never to Cloud Run, so it does not keep the
// service awake. The id is random, kept in this browser only (no account, no address). A heartbeat goes out every minute while the tab is on show and the person did something in the last
// 15 minutes (a tab left open in the background, or a page nobody touches, is not counted). The page kind (replay, fork, play, sandbox) only splits the count.
import { FORK, MINIGAME, PLAY, SANDBOX } from './state.js';

const EVERY_MS = 60 * 1000;
const IDLE_MS = 15 * 60 * 1000;

function visitorId() {
  const make = () => {
    const bytes = new Uint8Array(18);
    (window.crypto || { getRandomValues: (a) => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
    return Array.from(bytes, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  };
  try {
    let id = localStorage.getItem('ark:visitor');
    if (!/^[a-z0-9]{16,40}$/.test(id || '')) { id = make(); localStorage.setItem('ark:visitor', id); }
    return id;
  } catch (e) { return make(); }                          // (no storage: one id for this page view)
}

async function workerBase() {
  try {
    const cached = sessionStorage.getItem('ark:presence-base');
    if (cached !== null) return cached;
  } catch (e) { /* no session storage */ }
  let base = '';
  try { base = ((await (await fetch('/api/presence/config')).json()).base || '').replace(/\/$/, ''); } catch (e) { /* no config: no heartbeat */ }
  try { sessionStorage.setItem('ark:presence-base', base); } catch (e) { /* fine */ }
  return base;
}

export async function startPresence() {
  if (window.ARK_NO_PRESENCE) return;
  const base = await workerBase();
  if (!base) return;
  const id = visitorId(), page = MINIGAME ? 'other' : PLAY ? 'play' : SANDBOX ? 'sandbox' : FORK ? 'fork' : 'replay';
  let lastActive = Date.now(), lastBeat = 0;
  const beat = () => {
    const now = Date.now();
    if (document.hidden || now - lastActive > IDLE_MS || now - lastBeat < EVERY_MS / 2) return;
    lastBeat = now;
    // (no-cors with a plain text body: no preflight, the answer is not read)
    fetch(base + '/presence', { method: 'POST', mode: 'no-cors', keepalive: true, body: JSON.stringify({ id, page }) }).catch(() => {});
  };
  let throttled = false;
  const touch = () => {
    lastActive = Date.now();
    if (!throttled) { throttled = true; setTimeout(() => { throttled = false; }, 2000); }
  };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'pointermove']) window.addEventListener(ev, () => { if (!throttled) touch(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastActive = Date.now(); beat(); } });   // (back on the tab: counted again at once)
  setInterval(beat, EVERY_MS);
  beat();
}
