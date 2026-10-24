// [module] The numbers drawn in svg (bonus tiles, placement bonuses, association slots) are Archivo (`Park Num`, parkposter.css). The white number with a dark outline gets a second copy below it that carries
// the outline (`.num-under`); the copy on top (`.num-top`) is the plain white number. (While the font was Bowlby One, a thin stroke in the outline's colour thinned the copy on top; it is gone.) Numbers on the
// appeal and conservation icons (`.dk`) are black without an outline (no copy). The CSS is at the end of parkposter.css.
const SEL = 'text.bonus-number:not(.dk):not(.num-top):not(.num-under), text.slot-number:not(.dk):not(.num-top):not(.num-under)';

function thin(root) {
  const list = root.matches && root.matches(SEL) ? [root] : [];
  if (root.querySelectorAll) list.push(...root.querySelectorAll(SEL));
  for (const t of list) {
    if (!t.parentNode) continue;
    const under = t.cloneNode(true);
    under.classList.add('num-under');
    t.classList.add('num-top');
    t.parentNode.insertBefore(under, t);
  }
}

if (typeof MutationObserver !== 'undefined' && document.body) {
  thin(document.body);
  new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) thin(n); }).observe(document.body, { childList: true, subtree: true });
}
