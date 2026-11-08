// [module] The "Right click" view of the shortcuts pop-up: a small copy of the page with an epicentre (soft orange ripples) on every spot where a right click does something. A click on an epicentre shows what the right click does there. Opened by a click on the mouse beside the pop-up (shortcuts.js).
import { S } from './state.js';
import { roundJumps } from './playback.js';
import { PREVIEW_CARDS, card } from './cards.js';

const TEXT = {
  tl: 'Right click on any point of the timeline to jump to the beginning of its round',
  map: 'Right click on any map to select any standard enclosure and preview its map placement',
  card: 'Right click on a sponsor building card in hand to preview its map placement',
};
const SIDE = { tl: 'bottom', map: 'bottom', card: 'right' };              // (where the tip sits next to its epicentre)
const RINGS = 3;
const BIG = new Set(['S243', 'S244', 'S245', 'S246', 'S247', 'S248', 'S249', 'S250', 'S251', 'S252', 'S253', 'S254', 'S263', 'S271', 'S272', 'S278']);          // sponsor buildings of at least 3 hexes (their ripple is worth showing)
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const inView = (r) => r.width > 20 && r.height > 8 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;

export function createPageView(onBack) {
  const box = mk('div', 'rcbox'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Mouse controls');
  const head = mk('div', 'rchead'), hint = mk('span', 'rchint');
  const x = mk('button', 'rcx'); x.type = 'button'; x.setAttribute('aria-label', 'Back to the keyboard');
  x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4L20 20M20 4L4 20" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" fill="none"/></svg>';
  head.append(mk('b', '', 'Mouse controls'), hint, x);
  const shot = mk('div', 'rcshot'), clone = mk('div', 'rcclone'), spots = mk('div', 'rcspots'), tip = mk('div', 'rctip');
  clone.setAttribute('aria-hidden', 'true'); clone.inert = true; tip.hidden = true;
  shot.append(clone, spots, tip);
  box.append(head, shot);
  x.onclick = () => onBack();

  let current = null;
  const scale = () => S.scale || 1;

  function finds() {                                                        // the spots, found in the copy (so a hand that lies below the fold of the real window is found too), in px of the shot
    const s = scale(), q = shot.getBoundingClientRect(), out = [];
    const at = (e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 8 ? { x: (r.left + r.width / 2 - q.left) / s - 3, y: (r.top + r.height / 2 - q.top) / s - 3 } : null; };
    const tl = document.getElementById('timeline');
    if (roundJumps() && tl && !tl.hidden) { const e = clone.querySelector('#timeline'), p = e && at(e); if (p) out.push({ k: 'tl', ...p }); }
    if (S.previewBuilding) {
      const m = clone.querySelector('svg.board'), pm = m && at(m);
      if (pm) { const mr = m.getBoundingClientRect(); pm.y = (mr.top - q.top) / s - 3 + mr.height / s * 0.07; out.push({ k: 'map', ...pm }); }   // (the very top of the map: lower down it would lie too close to the hand)
      const c = [...clone.querySelectorAll('.card.markable[data-key]')].find((e) => BIG.has(e.dataset.key) && getComputedStyle(e).visibility !== 'hidden' && at(e)), pc = c && at(c);
      if (pc) out.push({ k: 'card', ...pc });
    }
    return out;
  }

  function hideTip() { tip.hidden = true; current = null; spots.querySelectorAll('.sel').forEach((e) => e.classList.remove('sel')); }
  function placeTip() {
    if (!current) return;
    const { k, el } = current, side = SIDE[k], q = shot.getBoundingClientRect(), r = el.getBoundingClientRect(), z = scale();
    tip.dataset.side = side;
    const t = mk('p', '', ''), lead = 'Right click'; t.append(mk('b', '', lead), TEXT[k].slice(lead.length)); tip.replaceChildren(t);          // (one text; the words "Right click" at its start are bold and orange)
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight, cx = (r.left + r.width / 2 - q.left) / z, cy = (r.top + r.height / 2 - q.top) / z, g = 46, W = q.width / z, H = q.height / z;
    let px = cx - w / 2, py = cy - h - g;
    if (side === 'bottom') py = cy + g; else if (side === 'right') { px = cx + g; py = cy - h / 2; }
    tip.style.left = Math.max(8, Math.min(px, W - w - 8)) + 'px';
    tip.style.top = Math.max(8, Math.min(py, H - h - 8)) + 'px';
  }

  function open(width) {
    hideTip();
    box.style.width = width + 'px';
    box.hidden = false;
    const s = scale(), vw = innerWidth / s, cs = getComputedStyle(document.body), hs = getComputedStyle(document.documentElement);
    const bg = cs.backgroundImage !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs : hs;
    shot.style.backgroundColor = bg.backgroundColor; shot.style.backgroundImage = bg.backgroundImage; shot.style.backgroundSize = 'cover';
    clone.replaceChildren();
    let bottom = innerHeight;                                                // the whole page, also the part below the fold of the window (the real page scrolls)
    const top0 = document.body.getBoundingClientRect().top;
    for (const c of document.body.children) {
      if (c.classList.contains('modal') || /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(c.tagName)) continue;
      clone.append(c.cloneNode(true));
      const r = c.getBoundingClientRect(); if (r.height > 0 && getComputedStyle(c).position !== 'fixed') bottom = Math.max(bottom, r.bottom - top0);
    }
    const vh = bottom / s, inner = width - 52 - 6;                           // (the box has 26 px padding and the shot a 3 px border)
    const fitH = innerHeight / s - 200, shotW = Math.max(300, Math.min(inner, fitH * vw / vh));          // (never taller than the window)
    shot.style.width = shotW + 'px'; shot.style.aspectRatio = vw + ' / ' + vh;
    clone.style.width = vw + 'px'; clone.style.height = vh + 'px';
    const k = (shotW - 6) / vw;
    clone.style.transform = 'scale(' + k + ')';
    clone.querySelectorAll('.dock').forEach((d) => d.classList.add('raised'));                 // the copy always shows the hand open: the fan raised, a folded tray unfolded
    clone.querySelectorAll('.handtray').forEach((t) => { t.classList.remove('fol', 'enter'); t.classList.add('unf'); });
    if (S.previewBuilding && ![...clone.querySelectorAll('.card.markable[data-key]')].some((e) => BIG.has(e.dataset.key))) {          // no sponsor building of 3+ hexes in the hand: the copy shows Amazon House in place of the last card, so the spot can be shown
      const last = [...clone.querySelectorAll('.dockpanel .cards .card, .handtray .card')].pop();
      if (last) { const n = card('S278'); last.classList.forEach((c) => n.classList.add(c)); n.classList.add('markable'); n.dataset.key = 'S278'; n.style.cssText = last.style.cssText; last.replaceWith(n); }
    }
    clone.classList.add('rcstatic');                                         // (no transitions in the copy, so it can be measured at once)
    const dock = clone.querySelector('.dock'), hand = [...clone.querySelectorAll('.dockpanel .cards .card, .handtray .card')];
    if (dock && hand.length) {                                               // the real hand reaches below the window edge: the copy lifts it so that the whole hand is in
      const over = (Math.max(...hand.map((e) => e.getBoundingClientRect().bottom)) - clone.getBoundingClientRect().bottom) / (k * s);
      if (over > 0) dock.style.transform = 'translateY(' + -(over + 12) + 'px)';
    }
    const found = finds();
    spots.replaceChildren();
    for (const f of found) {
      const b = mk('button', 'rcepi'); b.type = 'button'; b.dataset.k = f.k; b.setAttribute('aria-label', TEXT[f.k]);
      b.style.left = f.x + 'px'; b.style.top = f.y + 'px';
      for (let i = 0; i < RINGS; i++) { const r = mk('i'); r.style.animationDelay = (i * 3.6 / RINGS).toFixed(2) + 's'; b.append(r); }
      const show = (e) => { e.preventDefault(); e.stopPropagation(); hideTip(); b.classList.add('sel'); current = { k: f.k, el: b }; placeTip(); };
      b.onclick = show; b.oncontextmenu = show;
      spots.append(b);
    }
    hint.textContent = S.previewBuilding ? '' : 'Turn on Building preview in the settings for more';
    x.focus();
  }
  function close() { box.hidden = true; hideTip(); clone.replaceChildren(); spots.replaceChildren(); }
  shot.addEventListener('click', (e) => { if (!e.target.closest('.rcepi')) hideTip(); });
  return { box, open, close, isOpen: () => !box.hidden };
}
