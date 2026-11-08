// Hovering a player's category university (bird, predator, ...) on the association strip shows the card that university gave:
// the card slides out from behind the tile, tilted, with a ribbon naming the university and a ring in the category colour.
import { S } from './state.js';
import { info, largeOf } from './cards.js';

export const UNI_CATS = {                                          // category -> [name, ribbon background, ribbon text]
  reptile: ['Reptile', '#4B3F9E', '#fff'], marine: ['Marine', '#2F7FC4', '#fff'], bird: ['Bird', '#6EC1E4', '#17262B'],
  predator: ['Predator', '#C23B2E', '#fff'], herbivore: ['Herbivore', '#3E9B52', '#fff'], primate: ['Primate', '#EE8B1E', '#17262B'],
};
const CARD_W = 170, TUCK = 14;
let box = null;

let watch = null;
const M = 8;                                                      // (margin to the edge of the window, design px)

export function hideUniCard() {
  if (box) { box.remove(); box = null; }
  if (watch) { watch(); watch = null; }
}

export function showUniCard(tile, cat, key) {
  hideUniCard();
  const c = UNI_CATS[cat];
  if (!c || !key || !S.replay || !S.replay.cards || !S.replay.cards[key]) return;
  const sc = S.scaled && S.scale ? S.scale : 1;
  const b = document.createElement('div');
  b.className = 'unipeek';
  b.setAttribute('aria-hidden', 'true');
  b.style.setProperty('--rc', c[1]); b.style.setProperty('--rt', c[2]); b.style.setProperty('--cw', CARD_W + 'px'); b.style.setProperty('--dy', '0px');
  const clip = document.createElement('div'); clip.className = 'upk-clip';
  const card = document.createElement('div'); card.className = 'upk-card';
  const img = document.createElement('img'); img.alt = ''; img.draggable = false;
  const rib = document.createElement('div'); rib.className = 'upk-rib'; rib.textContent = c[0] + ' University';
  card.append(img, rib); clip.append(card);
  b.append(clip);
  box = b;
  // Hide at once when the pointer is no longer over the tile (a scroll or a redraw moves the tile without a mouseleave), or the tile is gone.
  const inside = (x, y) => { const r = tile.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  const onMove = (e) => { if (!inside(e.clientX, e.clientY)) hideUniCard(); };
  const kill = () => hideUniCard();
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('wheel', kill, { capture: true, passive: true });
  window.addEventListener('scroll', kill, true);
  window.addEventListener('resize', kill);
  document.addEventListener('keydown', kill, true);
  let raf = requestAnimationFrame(function tick() { if (!tile.isConnected) return hideUniCard(); raf = requestAnimationFrame(tick); });
  watch = () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('mousemove', onMove, true); document.removeEventListener('wheel', kill, true);
    window.removeEventListener('scroll', kill, true); window.removeEventListener('resize', kill); document.removeEventListener('keydown', kill, true);
  };
  const place = () => {
    if (box !== b) return;
    const r = tile.getBoundingClientRect();
    const tw = r.width / sc, th = r.height / sc, left = r.left / sc, top = r.top / sc;
    const W = window.innerWidth / sc, H = window.innerHeight / sc;
    b.style.cssText += ';left:' + r.left + 'px;top:' + r.top + 'px;width:' + tw + 'px;height:' + th + 'px;transform:scale(' + sc + ');--tw:' + tw + 'px';
    document.documentElement.append(b);
    const ribW = rib.offsetWidth, cardH = img.naturalWidth ? CARD_W * img.naturalHeight / img.naturalWidth : CARD_W * 1.4;
    const reach = CARD_W + Math.max(0, (ribW - CARD_W) / 2) + 14;                                  // (how far the card with its ribbon reaches out of the tile)
    const flip = left < reach && W - (left + tw) > left;                        // (not enough room on the left, more on the right)
    b.classList.toggle('flip', flip);
    const cy = top + th / 2, up = cardH / 2 + 12, down = cardH / 2 + 12 + 46;   // (tilt and ribbon included)
    const dy = Math.max(M - (cy - up), 0) + Math.min(H - M - (cy + down), 0);
    b.style.setProperty('--dy', dy + 'px');
    void b.offsetWidth;
    b.classList.add('on');
  };
  img.onload = place; img.src = largeOf(info(key));
  if (img.complete && img.naturalWidth) place();
  else document.documentElement.append(b);
}

export function bindUniCard(g, tile, cat, key) {
  g.addEventListener('mouseenter', () => showUniCard(tile, cat, key));
  g.addEventListener('mouseleave', hideUniCard);
}
