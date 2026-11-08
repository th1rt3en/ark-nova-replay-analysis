// [module] JS pop-ups: while a pop-up is open (.modal not hidden, or a .modalback of the fork / sandbox), the mouse wheel never scrolls the page behind it. It scrolls the pop-up
// (or a scrolling list inside it) when that can scroll in the wheel's direction, and otherwise does nothing. CSS (overflow: hidden on <html>) would take the window's scrollbar away
// and shift the zoomed page sideways, so this is done on the wheel event instead: nothing in the layout changes. Ctrl + wheel (browser zoom) is left alone.
const OPEN = '.modal:not([hidden]), .modalback';

function canScroll(n, dx, dy) {
  const cs = getComputedStyle(n);
  if (dy && /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) {
    if (dy < 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1) return true;
  }
  if (dx && /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1) {
    if (dx < 0 ? n.scrollLeft > 0 : n.scrollLeft + n.clientWidth < n.scrollWidth - 1) return true;
  }
  return false;
}

document.addEventListener('wheel', (e) => {
  if (e.ctrlKey || !document.querySelector(OPEN)) return;
  for (let n = e.target instanceof Element ? e.target : null; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    if (canScroll(n, e.deltaX, e.deltaY)) return;                       // (an element under the pointer that can scroll this way takes the wheel)
  }
  e.preventDefault();
}, { passive: false, capture: true });

// true when a mouse event lies on the pop-up's own scrollbar (it has one only while it is taller than the window): a click there must not count as a click on the dimmed backdrop
export function onScrollbar(e, m) {
  const r = m.getBoundingClientRect(), z = r.width / m.offsetWidth || 1;              // (the viewer is zoomed: screen pixels / zoom = layout pixels)
  return (e.clientX - r.left) / z >= m.clientWidth;
}
