// [module] JS layout: scales the page to the window (fitScale) and fits the display to its half of the shared area.
import { S } from './state.js';
import { fitSidebar } from './sidebar.js';

// ---- scaling -------------------------------------------------------------------------------------------------------------------------------
// The whole page is laid out at DESIGN_W px wide (the size the layout was made for) and zoomed (CSS zoom on <body>) to the real window width, so every desktop
// viewport shows the same layout, only smaller or bigger. The media queries of replay.css that test the width / height are written for the design viewport in this
// mode (see changelog.md, section 2), and vh / vw units are replaced by --vh / --vw which are set here. Below DESKTOP_MIN px nothing is scaled (phones, later).
const DESIGN_W = 1920, DESKTOP_MIN = 900;
export function fitScale() {
  const root = document.documentElement, w = root.clientWidth;
  S.scaled = w >= DESKTOP_MIN;
  S.scale = S.scaled ? w / DESIGN_W : 1;
  document.body.style.zoom = S.scaled ? String(S.scale) : '';
  if (S.scaled) {
    root.style.setProperty('--vw', DESIGN_W / 100 + 'px');
    root.style.setProperty('--vh', window.innerHeight / S.scale / 100 + 'px');
  } else {
    root.style.removeProperty('--vw'); root.style.removeProperty('--vh');
  }
}
// The display element (conservation track + folders + reputation track) and the association element (project area + board + project area) are exactly equally high. Both
// have a fixed proportion (the display: height = 0.433 x width, the board 0.2955 x its width, the two project areas a fixed height), so the widths that give one height follow
// from a linear equation: with W the width of the shared area without the gap, rd = height / width of the display, rb = of the board, c = the fixed height of the association
// element (project areas + gaps): rd * (W - wa) = rb * wa + c  ->  wa = (rd * W - c) / (rd + rb). The association element gets wa (--assocw on #shared, used by the grid in
// table.css), the display is zoomed to the rest. Without the scaled desktop layout (phones) the display is simply fitted to its column.
const DISPLAY_MAX = 1.1, DISPLAY_MIN = 0.3;
// The measured sizes differ by a hair from one step to the next (fonts, the content of the display), so the computed width and zoom would too, and an icon that lies close to a
// half pixel then flips by one pixel from step to step (the X token under reputation 12 did, on a tester's screen). While the window and the column layout stay the same, a new value
// that differs from the last one only by such noise is not applied: the last one is kept. A real change (a resize, another layout, other content) is larger and goes through.
const FIT_TOL_W = 1, FIT_TOL_ZOOM = 0.0025;                            // (design px for the association width; relative for the zoom of the display)
let lastFit = { key: '', wa: null, zoom: null };
const steady = (prev, v, tol) => (prev !== null && Math.abs(v - prev) <= tol ? prev : v);
export function fitDisplay() {
  const box = document.querySelector('.displaybox'), shared = document.getElementById('shared');
  if (!box || !box.parentElement || !shared) return;
  const imgs = [...shared.querySelectorAll('img')].filter((i) => !i.complete);
  if (imgs.length) imgs.forEach((i) => i.addEventListener('load', fitDisplay, { once: true }));       // (the heights are only known when the pictures are loaded)
  const tc = shared.querySelector('.tablecol'), board = tc && tc.children[1];
  box.style.zoom = 1;
  const sc = S.scale || 1, rect = (e) => { const r = e.getBoundingClientRect(); return [r.width / sc, r.height / sc]; };       // (getBoundingClientRect is in zoomed px)
  const [nw, nh] = rect(box);
  const col = box.parentElement, cs = getComputedStyle(col), px = (n) => parseFloat(cs[n]) || 0;
  const colX = px('paddingLeft') + px('paddingRight') + px('borderLeftWidth') + px('borderRightWidth'), colY = px('paddingTop') + px('paddingBottom') + px('borderTopWidth') + px('borderBottomWidth');       // (the display's panel: border and padding around the display)
  let width = col.clientWidth - px('paddingLeft') - px('paddingRight');
  const cols = getComputedStyle(shared).gridTemplateColumns.split(' ').length;
  const key = [S.scale, S.scaled, shared.clientWidth, cols].join('|');     // (the window and the column layout; not the column widths, which follow from the values kept here)
  if (key !== lastFit.key) lastFit = { key, wa: null, zoom: null };
  if (S.scaled && tc && board && nw > 0 && cols > 1) {
    const [tw, th] = rect(tc), [bw, bh] = rect(board);
    if (bw > 0) {
      const rd = nh / nw, rb = bh / bw, c = th - rb * tw;
      const gap = parseFloat(getComputedStyle(shared).columnGap) || 0, W = shared.clientWidth - gap;
      const wa = lastFit.wa = steady(lastFit.wa, Math.max(300, Math.min(W * 0.6, (rd * (W - colX) + colY - c) / (rd + rb))), FIT_TOL_W);
      shared.style.setProperty('--assocw', wa + 'px');
      const zs = document.getElementById('zoos'); if (zs) zs.style.setProperty('--assocw', wa + 'px');       // (the tabbed layout puts the played cards under the association element: the same column width)
      width = W - wa - colX;
    }
  }
  const zoom = Math.max(DISPLAY_MIN, Math.min(DISPLAY_MAX, width / nw));
  lastFit.zoom = steady(lastFit.zoom, zoom, (lastFit.zoom || zoom) * FIT_TOL_ZOOM);
  box.style.zoom = lastFit.zoom;
  for (const pn of shared.querySelectorAll('.projpanel.pair')) {       // two spots in a panel made for three: shifted so that the space between the icon and the pair equals the space between the pair and the panel's right edge (measured after the widths are final)
    const icon = pn.querySelector('.projicon'), slots = pn.querySelectorAll('.projslot');
    if (!icon || !slots.length) continue;
    pn.style.setProperty('--shift', '0px');
    const k = S.scale || 1, ir = icon.getBoundingClientRect(), pr = pn.getBoundingClientRect(), first = slots[0].getBoundingClientRect(), last = slots[slots.length - 1].getBoundingClientRect();
    pn.style.setProperty('--shift', (((ir.right + pr.right) / 2 - (first.left + last.right) / 2) / k) + 'px');       // (equal space between the icon and the pair and between the pair and the right edge)
  }
  fitSidebar();       // (the width of the control pane's scrollbar, once the layout is final)
}
window.addEventListener('resize', () => { fitScale(); fitSidebar(); fitDisplay(); });
