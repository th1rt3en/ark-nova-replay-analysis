// [module] Our tooltip, on every page (loaded by notify.js and by a script tag on the pages without it): it replaces the browser's own tooltip of every `title` attribute and every
// SVG <title>. A small "mini poster" (the map tooltip in small: white, square corners, ink border, hard offset shadow), under the element with a pointer to it, above it when there is
// no room below. While the pointer is on the element its title is taken off (and put back when it leaves), so the browser shows nothing and code that reads `.title` still works;
// a title set again while hovered (a counter that changes) is taken over at once. Elements with a tooltip of their own (the map badge, card previews) have no `title` and are not touched.
const DELAY = 350, QUICK = 450;                                  // ms before a tooltip shows; within QUICK of the last one the next shows at once (like the browser)
const css = document.createElement('style');
css.textContent = `
@import url(/css/park-fonts.css);
#arktip { position: fixed; z-index: 3000; left: 0; top: 0; max-width: 280px; box-sizing: border-box; padding: 3px 8px 4px; text-align: center; text-wrap: balance; background: #fff; color: #17262B; border: 2px solid #17262B; border-radius: 0;
  box-shadow: 3px 3px 0 #17262B; font: 600 13px/1.3 'Barlow', system-ui, sans-serif; white-space: pre-line; overflow-wrap: break-word; pointer-events: none; opacity: 0; transition: opacity .1s; }
#arktip.on { opacity: 1; }
#arktip::before { content: ""; position: absolute; left: var(--ax, 50%); top: -7px; margin-left: -6px; border: 6px solid transparent; border-top: 0; border-bottom: 6px solid #17262B; }
#arktip.up::before { top: auto; bottom: -7px; border-bottom: 0; border-top: 6px solid #17262B; }
`;
document.head.append(css);
let tip = null, cur = null, timer = 0, lastHide = 0, watch = null;
function box() {
  if (!tip) { tip = document.createElement('div'); tip.id = 'arktip'; tip.setAttribute('role', 'tooltip'); document.documentElement.append(tip); }
  return tip;
}
// the nearest element with a tooltip: a `title` attribute, or an SVG element with a <title> child
function owner(n) {
  for (; n && n.nodeType === 1; n = n.parentNode) {
    if (n.id === 'arktip') return null;
    const t = n.getAttribute('title');
    if (t) return { n, text: t };
    if (n instanceof SVGElement) { const c = [...n.children].find((k) => k.tagName.toLowerCase() === 'title' && k.textContent.trim()); if (c) return { n, text: c.textContent, svg: c }; }
  }
  return null;
}
function take(o) {                                                // the browser's tooltip off while hovered
  if (o.svg) { o.next = o.svg.nextSibling; o.svg.remove(); }
  else { o.n.removeAttribute('title'); o.n.dataset.arktip = '1'; }
  if (!o.n.hasAttribute('aria-label') && !o.svg) { o.n.setAttribute('aria-label', o.text); o.label = true; }
  watch = new MutationObserver(() => { const t = o.n.getAttribute('title'); if (t !== null) { o.text = t; o.n.removeAttribute('title'); if (tip && tip.classList.contains('on')) { tip.textContent = t; place(); } } });
  watch.observe(o.n, { attributes: true, attributeFilter: ['title'] });
}
function give(o) {                                                // and back when the pointer leaves
  if (watch) { watch.disconnect(); watch = null; }
  if (o.svg) { if (o.n.isConnected) o.n.insertBefore(o.svg, o.next && o.next.parentNode === o.n ? o.next : o.n.firstChild); }
  else { if (!o.n.hasAttribute('title')) o.n.setAttribute('title', o.text); delete o.n.dataset.arktip; if (o.label) o.n.removeAttribute('aria-label'); }
}
function place() {
  if (!cur || !tip) return;
  tip.style.left = '0px';                                         // (measured at the left edge: where it was last placed would squeeze it narrower)
  const r = cur.n.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, gap = 9, vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const cx = r.left + r.width / 2, left = Math.max(6, Math.min(vw - w - 6, cx - w / 2));
  const up = r.bottom + gap + h > vh - 4 && r.top - gap - h > 4;
  tip.classList.toggle('up', up);
  tip.style.left = left + 'px'; tip.style.top = (up ? r.top - gap - h : r.bottom + gap) + 'px';
  tip.style.setProperty('--ax', Math.max(10, Math.min(w - 10, cx - left)) + 'px');
}
function show() {
  timer = 0;
  if (!cur || !cur.n.isConnected) return hide();
  const t = box(); t.textContent = cur.text; t.classList.add('on'); place();
}
function hide() {
  clearTimeout(timer); timer = 0;
  if (tip && tip.classList.contains('on')) { tip.classList.remove('on'); lastHide = performance.now(); }
  if (cur) { give(cur); cur = null; }
}
document.addEventListener('mouseover', (e) => {
  const o = owner(e.target);
  if (cur && o && o.n === cur.n) return;
  if (cur && !o && cur.n.contains(e.target)) return;
  const quick = (tip && tip.classList.contains('on')) || performance.now() - lastHide < QUICK;
  hide();
  if (!o) return;
  cur = o; take(o);
  if (quick) show(); else timer = setTimeout(show, DELAY);
}, true);
document.addEventListener('mouseout', (e) => { if (cur && !(e.relatedTarget && cur.n.contains(e.relatedTarget))) hide(); }, true);
for (const ev of ['mousedown', 'wheel', 'keydown', 'blur', 'touchstart']) addEventListener(ev, () => { if (cur) { hide(); lastHide = 0; } }, true);
addEventListener('scroll', () => { if (cur) hide(); }, true);
setInterval(() => { if (cur && !cur.n.isConnected) hide(); }, 300);          // (the element was drawn again under the pointer)
