// [module] The strip with the points an endgame card would score right now (`points` = { conservation: n, appeal: n }): the icon of the kind and the number, on the picture of the card (css `.egpts`,
// the last block of parkposter.css). Conservation is always shown (0 too), any other kind only when it is not 0, so a card that scores appeal needs no change here. Used by the Resistance
// lightbox (reveal.js, big cards) and by the endgame cards of the hand dock (dock.js, small cards; the enlarged preview is a picture of its own and has none).
import { el } from './util.js';
import { ICON_IDS, iconUrl } from './icons.js';

const KIND_ICON = { conservation: () => ICON_IDS.conservation, appeal: () => ICON_IDS.appeal };
export function pointsBadge(points) {
  if (!points) return null;
  const kinds = Object.keys(KIND_ICON).filter((k) => points[k] != null && (points[k] || k === 'conservation'));
  if (!kinds.length) return null;
  const b = el('div', 'egpts');
  for (const k of kinds) {
    const pt = el('span', 'pt pt-' + k), ic = el('img'), id = KIND_ICON[k]();
    if (id) { ic.src = iconUrl(id); ic.alt = k; ic.draggable = false; pt.append(ic); }
    pt.append(el('b', '', points[k]));
    b.append(pt);
  }
  b.title = 'Points this card scores now';
  return b;
}
