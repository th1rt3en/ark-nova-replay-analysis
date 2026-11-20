// [module] The on-screen answer to the M key (settings.js `toggleMute` fires `mutetoggle`): a dark rounded panel in the middle of the screen, like a computer's volume pop-up,
// with the speaker (crossed out when muted, with its waves when the sound is back), 20 bars that drain to 0 or fill up to the level that came back, and "Muted" / "50 %" under them.
// It shows for about 2 s; a new press restarts it. Every mode with the viewer's keys (replay, fork, sandbox, live play).
import { el } from './util.js';

const BARS = 20;
const SPK = (muted) => '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 24h11l15-12v40L19 40H8z" fill="currentColor"/>' + (muted
  ? '<path class="mpslash" d="M44 22l16 20M60 22L44 42" stroke="#e5484d" stroke-width="6" stroke-linecap="round" fill="none"/>'
  : '<path d="M42 24a11 11 0 0 1 0 16M48 17a20 20 0 0 1 0 30M54 10a29 29 0 0 1 0 44" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/>') + '</svg>';
let box = null, anim = null, raf = 0;

function show({ muted, volume }) {
  if (!box) {
    box = el('div', 'mutepop'); box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
    box.append(el('div', 'mpspk'), el('div', 'mpbars'), el('div', 'mptxt'));
    for (let i = 0; i < BARS; i++) box.children[1].append(el('i', ''));
    document.body.append(box);
  }
  const lvl = Math.round((volume || 0) / 100 * BARS), from = muted ? lvl : 0, to = muted ? 0 : lvl;
  box.children[0].innerHTML = SPK(muted);
  box.children[2].textContent = muted ? 'Muted' : volume + ' %';
  const bars = [...box.children[1].children], set = (n) => bars.forEach((b, i) => b.classList.toggle('on', i < n));
  set(from);
  if (anim) anim.cancel();
  cancelAnimationFrame(raf);
  anim = box.animate([{ opacity: 0, transform: 'translate(-50%, calc(-50% + 20px))' }, { opacity: 1, transform: 'translate(-50%, -50%)', offset: 0.12 },
    { opacity: 1, transform: 'translate(-50%, -50%)', offset: 0.82 }, { opacity: 0, transform: 'translate(-50%, -50%)' }], { duration: 1900, fill: 'forwards' });
  const t0 = performance.now();
  const step = (t) => { const f = Math.min(1, (t - t0 - 200) / 500); if (f >= 0) set(Math.round(from + (to - from) * f)); if (f < 1) raf = requestAnimationFrame(step); };          // (the bars run from the old to the new level in 0.5 s, after 0.2 s)
  raf = requestAnimationFrame(step);
}
document.addEventListener('mutetoggle', (e) => show(e.detail || {}));
