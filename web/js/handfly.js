// [module] The cards a reveal keeps (Perception, Scavenging, Hunter, Scuba Dive) are dealt into the hand when the lightbox closes: the lightbox and every card in it vanish at once (nothing flies from the
// large card to the small one, that looked awkward), and the kept cards arrive in the hand the way the starting hand is dealt (dock.js `dockIntro`): in the floating tray they drop in from above one
// after the other, in the fan they rise from below the screen edge and settle into their tilt. Nothing here changes data: the hand already has the cards (the dock is drawn from the state as always);
// `afterRender()` (end of `render()` in main.js) only animates the dock cards that match the kept ones.
//   `setPending()`  called by `noteLightbox()` (reveal.js) before the lightbox layer is cleared: remembers the chosen cards of a reveal lightbox that is on show (`.picked`)
//   `afterRender()` called after every render: when a lightbox with chosen cards has just closed and the dock has those cards, they are dealt in
import { S } from './state.js';

const DROP_MS = 560, DROP_GAP = 100, DEAL_MS = 520, DEAL_GAP = 110;                    // (the same numbers as the starting hand in dock.js)
let pending = null, anims = [];
const dockCards = () => [...document.querySelectorAll('#dock .cards .card[data-key]')];

export function setPending() {
  const box = document.getElementById('draftbox');
  if (!box || box.hidden || !box.classList.contains('revealbox')) return;
  const keys = [...box.querySelectorAll('.draftcard.picked[data-key]')].map((c) => c.dataset.key);
  if (keys.length) pending = { keys, step: S.step };
}
function stop() { for (const a of anims) a.cancel(); anims = []; }

export function afterRender() {
  stop();
  const box = document.getElementById('draftbox'), p = pending;
  pending = null;
  if (!p || (box && !box.hidden) || S.step < p.step || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const used = new Set(), targets = [];
  for (const key of p.keys) { const t = dockCards().find((e) => e.dataset.key === key && !used.has(e)); if (t && t.animate) { used.add(t); targets.push(t); } }
  const tray = S.handMode === 'tray', hk = parseFloat(getComputedStyle(document.body).getPropertyValue('--hk')) || 1.5, rise = 240 * hk;
  targets.forEach((c, i) => {
    if (tray) anims.push(c.animate([{ transform: 'translateY(-260px) rotate(' + (i % 2 ? -9 : 9) + 'deg)', opacity: 0 }, { opacity: 1, offset: .2 }, { transform: 'translateY(6px) rotate(0deg)', opacity: 1, offset: .75 }, { transform: 'none', opacity: 1 }],
      { duration: DROP_MS, delay: i * DROP_GAP, easing: 'ease-out', fill: 'backwards' }));
    else anims.push(c.animate([{ transform: 'translateY(' + (rise * 1.2) + 'px) rotate(0deg)', opacity: 0 }, { opacity: 1, offset: .25 }, { transform: getComputedStyle(c).transform, opacity: 1 }],
      { duration: DEAL_MS, delay: i * DEAL_GAP, easing: 'cubic-bezier(.2,.9,.3,1.08)', fill: 'backwards' }));
  });
}
