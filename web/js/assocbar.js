// [module] The bar under a zoo box while its played-cards drawer is open: the bonus spaces (taken / still covered), the partner zoo slots and the university slots of the player in one
// row, as wide as the map and the drawer together. Both drawer sizes hide the bonus panel and the association strip, so this keeps their state in view. The bar hangs below the box
// (absolute: nothing in the layout moves); zoo.js adds it with the drawer, parkposter.css styles it.
import { el, svg } from './util.js';
import { S } from './state.js';
import { ICON_IDS, iconUrl } from './icons.js';
import { slotGlyph } from './association.js';
import { HANDSHAKE, UNIVERSITY } from './handshake.js';

const UNI_NAME = { 'fac-rep-hand': 'reputation and cards', 'fac-science-rep': 'science and reputation', 'fac-science-science': 'two science', 'fac-generic': 'any science' };
function bonusText(bn) {                                                   // what a bonus space gives, in words for the tooltip
  const v = bn.value || 1;
  switch (bn.type) {
    case 'money': return v + ' money';
    case 'reputation': return v + ' reputation';
    case 'xtoken': return v + ' X-token' + (v > 1 ? 's' : '');
    case 'conservation': return v + ' conservation';
    case 'Worker': return 'hire a worker';
    case 'size-2': return 'a size 2 enclosure';
    case 'take-in-range-or-deck': return 'take a card';
    default: return String(bn.type || 'a bonus');
  }
}
const slotEl = (cls, svgEl) => { const s = el('span', cls); s.append(svgEl); return s; };

// a bonus space: the panel's own picture (slotGlyph) in a small svg centred on it
function bonusSpace(sl, taken, size, n) {
  const root = svg('svg', { viewBox: '69 60 80 80', width: size, height: size, class: 'abglyph' });
  slotGlyph(root, sl, 100);
  const t = svg('title');
  t.textContent = 'Bonus space ' + n + ' (' + (taken ? 'taken' : 'still covered') + '): ' + bonusText(sl.bonus || {});
  root.append(t);
  return slotEl('abs abg ' + (taken ? 'on' : 'off') + (sl.kind === 'instant_income' ? ' pur' : ' yel'), root);
}
// a partner zoo slot: the continent token, or the handshake of the slot when empty (a token picture is 190 x 152, its drawn part 179 x 142 from (5, 4))
function partnerSlot(type, n, h) {
  const root = svg('svg', { viewBox: type ? '5 4 179 142' : '0 0 283 230', width: type ? h * 179 / 142 : h * 283 / 230, height: h, class: 'abpartner ' + (type ? 'on' : 'off') });
  if (type) root.append(svg('image', { href: iconUrl(ICON_IDS[type.replace('partner-', '')]), x: 0, y: 0, width: 190, height: 152 }));
  else root.append(svg('path', { d: HANDSHAKE.plaque, fill: '#000', 'fill-opacity': 0.2, 'fill-rule': 'evenodd' }), svg('path', { d: HANDSHAKE.dark, fill: '#000', 'fill-opacity': 0.2, 'fill-rule': 'evenodd' }));
  const t = svg('title');
  t.textContent = 'Partner zoo ' + n + ': ' + (type ? type.replace('partner-', '') : 'empty');
  root.append(t);
  return slotEl('abs', root);
}
// a university slot: its tile, or the silhouette of a tile when empty (the pictures are 121 or 137 px wide; the drawn part is 119 x 84)
function universitySlot(type, n, h) {
  const [w0, h0] = (type && S.iconSizes[ICON_IDS[type]]) || [137, 98];
  const root = svg('svg', { viewBox: type ? (w0 === 121 ? '1 1 119 84' : '7 6 119 84') : '0.5 1 120 84', width: h * 119 / 84, height: h, class: 'abuni ' + (type ? 'on' : 'off') });
  if (type) root.append(svg('image', { href: iconUrl(ICON_IDS[type]), x: 0, y: 0, width: w0, height: h0 }));
  else root.append(svg('path', { d: UNIVERSITY, fill: '#000', 'fill-opacity': 0.2 }));
  const t = svg('title');
  t.textContent = 'University ' + n + ': ' + (type ? UNI_NAME[type] || type : 'empty');
  root.append(t);
  return slotEl('abs', root);
}

export function assocBar(map, p, seat) {
  const slots = [...(map.bonus_slots || [])].sort((a, b) => a.index - b.index);
  const used = p.flags.bonus_used || 0;
  const partners = [null, null, null, null], unis = [null, null, null];
  for (const t of p.tokens) {
    const m = /^(partner|university)_(\d)$/.exec(t.location);
    if (m) (m[1] === 'partner' ? partners : unis)[+m[2] - 1] = t.type;
  }
  const bar = el('div', 'assocbar seat' + seat);
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Bonus spaces, partner zoos and universities of ' + S.replay.players[seat].name);
  const cluster = (items) => { const c = el('div', 'abcl'); c.append(...items); return c; };      // (a cluster: the icons of one kind, close together; the groups spread their clusters evenly)
  if (slots.length) {
    const g = el('div', 'abgroup');
    const income = slots.filter((s) => s.kind === 'instant_income').length;           // (the purple income spaces first, then the yellow ones in a cluster of their own, as in the panel)
    const spaces = slots.map((sl) => bonusSpace(sl, !!(used & (1 << sl.index)), sl.kind === 'instant_income' ? 38 : 42, sl.index + 1));
    g.append(...(income && income < slots.length ? [cluster(spaces.slice(0, income)), cluster(spaces.slice(income))] : [cluster(spaces)]));
    bar.append(g, el('i', 'abperf'));
  }
  const a = el('div', 'abgroup');
  a.append(cluster(partners.map((t, i) => partnerSlot(t, i + 1, 36))), cluster(unis.map((t, i) => universitySlot(t, i + 1, 34))));
  bar.append(a);
  return bar;
}
