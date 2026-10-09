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
export function fitDisplay() {
  const box = document.querySelector('.displaybox'), shared = document.getElementById('shared');
  if (!box || !box.parentElement || !shared) return;
  const imgs = [...shared.querySelectorAll('img')].filter((i) => !i.complete);
  if (imgs.length) imgs.forEach((i) => i.addEventListener('load', fitDisplay, { once: true }));       // (the heights are only known when the pictures are loaded)
  const tc = shared.querySelector('.tablecol'), board = tc && tc.children[1];
  box.style.zoom = 1;
  const sc = S.scale || 1, rect = (e) => { const r = e.getBoundingClientRect(); return [r.width / sc, r.height / sc]; };       // (getBoundingClientRect is in zoomed px)
  const [nw, nh] = rect(box);
  let width = box.parentElement.clientWidth;
  if (S.scaled && tc && board && nw > 0 && getComputedStyle(shared).gridTemplateColumns.split(' ').length > 1) {
    const [tw, th] = rect(tc), [bw, bh] = rect(board);
    if (bw > 0) {
      const rd = nh / nw, rb = bh / bw, c = th - rb * tw;
      const gap = parseFloat(getComputedStyle(shared).columnGap) || 0, W = shared.clientWidth - gap;
      const wa = Math.max(300, Math.min(W * 0.6, (rd * W - c) / (rd + rb)));
      shared.style.setProperty('--assocw', wa + 'px');
      width = W - wa;
    }
  }
  box.style.zoom = Math.max(DISPLAY_MIN, Math.min(DISPLAY_MAX, width / nw));
  for (const pn of shared.querySelectorAll('.projpanel.pair')) {       // two spots in a panel made for three: shifted so that the space between the icon and the pair equals the space between the pair and the panel's right edge (measured after the widths are final)
    const icon = pn.querySelector('.projicon'), slots = pn.querySelectorAll('.projslot');
    if (!icon || !slots.length) continue;
    pn.style.setProperty('--shift', '0px');
    const k = S.scale || 1, ir = icon.getBoundingClientRect(), pr = pn.getBoundingClientRect(), first = slots[0].getBoundingClientRect(), last = slots[slots.length - 1].getBoundingClientRect();
    pn.style.setProperty('--shift', (((ir.right + pr.right) / 2 - (first.left + last.right) / 2) / k) + 'px');       // (equal space between the icon and the pair and between the pair and the right edge)
  }
  fitSidebar();       // (the control panel is aligned with the project area, whose place is final only now)
}
window.addEventListener('resize', () => { fitScale(); fitSidebar(); fitDisplay(); });
