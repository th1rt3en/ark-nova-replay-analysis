// [module] No native tooltips on pictures. One rule: a PICTURE never has a tooltip (the text a browser shows after a hover), so the tooltip is removed from
//   - every <img> and every SVG (the boards, tracks, cubes, zoo maps: the `title` attribute and the <title> child elements),
//   - everything inside the conservation project panel and the reputation upgrade marker (PICTURE_ZONES),
//   - any element that holds an image / SVG and has no text of its own (cards, icons).
// Buttons, links, inputs and elements with text keep theirs. It runs on every DOM change, so no other code has to know about it: set `title` wherever it helps
// (it is still the accessible name), and it is dropped here. To show a tooltip on a picture again, remove it from the rule below (or drop the setupNoTips() call).
const PICTURE_ZONES = '.projpanel, .repupgrade';       // add a selector here to silence a whole area
const PICTURE = 'img, svg';
const KEEP = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL']);

const isPicture = (n) => n.matches(PICTURE) || !!n.closest(PICTURE + ', ' + PICTURE_ZONES) || (!!n.querySelector(PICTURE) && !n.textContent.trim());

function strip(root) {
  root.querySelectorAll('svg title').forEach((t) => t.remove());                          // (SVG tooltips are <title> children)
  for (const n of [root, ...root.querySelectorAll('[title]')]) {
    if (n.hasAttribute && n.hasAttribute('title') && !KEEP.has(n.tagName) && isPicture(n)) n.removeAttribute('title');
  }
}

export function setupNoTips() {
  let queued = false;
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; strip(document.body); }); } })
    .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  strip(document.body);
}
