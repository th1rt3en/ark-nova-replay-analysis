// [module] The bar under a zoo box while its played-cards drawer is open: the bonus spaces (taken / still covered), the partner zoo slots and the university slots of the player in one
// row, as wide as the map and the drawer together. Both drawer sizes hide the bonus panel and the association strip, so this keeps their state in view. The bar hangs below the box
// (absolute: nothing in the layout moves); zoo.js adds it with the drawer, parkposter.css styles it.
import { el, svg } from './util.js';
import { S } from './state.js';
import { ICON_IDS, iconUrl } from './icons.js';
import { bonusOrder, slotBonusTag, slotGlyph, upgradeSetItems, setBonusTag } from './association.js';
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
const ORD = ['1st', '2nd', '3rd'];
function bonusSpace(sl, taken, size, n, seat, nth) {
  const root = svg('svg', { viewBox: '69 60 80 80', width: size, height: size, class: 'abglyph' });
  slotGlyph(root, sl, 100);
  const t = svg('title');
  t.textContent = 'Bonus space ' + n + ' (' + (taken ? 'taken' + (nth ? ' ' + (nth > 3 ? nth + 'th' : ORD[nth - 1]) : '') : 'still covered') + '): ' + bonusText(sl.bonus || {});
  root.append(t);
  const e = slotEl('abs abg ' + (taken ? 'on' : 'off') + (sl.kind === 'instant_income' ? ' pur' : ' yel'), root);
  if (taken && nth) e.append(el('i', 'abord', String(nth)));                    // the ink stamp: the order the spaces were taken in (the same order as the dashed numbers on the bonus panel)
  e.dataset.abonus = String(sl.index); e.dataset.aseat = String(seat);          // (assoc-motion.js: the cube of a supported project flies from the bonus space that was taken)
  return e;
}
// the slot's bonus as a tag on its lower right corner, only while the slot is empty (a token on it covers the bonus, as on the strip)
function tagged(e, type, map, key) {
  const tag = !type && map && slotBonusTag(map, key, 26);
  if (tag) e.append(tag);
  return e;
}
// a partner zoo slot: the continent token, or the handshake of the slot when empty (a token picture is 190 x 152, its drawn part 179 x 142 from (5, 4))
function partnerSlot(type, n, h, seat, map) {
  const root = svg('svg', { 'data-assoc-slot': 'partner_' + n, 'data-assoc-seat': seat, viewBox: type ? '5 4 179 142' : '0 0 283 230', width: type ? h * 179 / 142 : h * 283 / 230, height: h, class: 'abpartner ' + (type ? 'on' : 'off') });
  if (type) root.append(svg('image', { href: iconUrl(ICON_IDS[type.replace('partner-', '')]), x: 0, y: 0, width: 190, height: 152 }));
  else root.append(svg('path', { d: HANDSHAKE.plaque, fill: '#000', 'fill-opacity': 0.2, 'fill-rule': 'evenodd' }), svg('path', { d: HANDSHAKE.dark, fill: '#000', 'fill-opacity': 0.2, 'fill-rule': 'evenodd' }));
  const t = svg('title');
  t.textContent = 'Partner zoo ' + n + ': ' + (type ? type.replace('partner-', '') : 'empty');
  root.append(t);
  return tagged(slotEl('abs', root), type, map, 'partner_' + n);
}
// a university slot: its tile, or the silhouette of a tile when empty (the pictures are 121 or 137 px wide; the drawn part is 119 x 84)
function universitySlot(type, n, h, seat, map) {
  const [w0, h0] = (type && S.iconSizes[ICON_IDS[type]]) || [137, 98];
  const root = svg('svg', { 'data-assoc-slot': 'university_' + n, 'data-assoc-seat': seat, viewBox: type ? (w0 === 121 ? '1 1 119 84' : '7 6 119 84') : '0.5 1 120 84', width: h * 119 / 84, height: h, class: 'abuni ' + (type ? 'on' : 'off') });
  if (type) root.append(svg('image', { href: iconUrl(ICON_IDS[type]), x: 0, y: 0, width: w0, height: h0 }));
  else root.append(svg('path', { d: UNIVERSITY, fill: '#000', 'fill-opacity': 0.2 }));
  const t = svg('title');
  t.textContent = 'University ' + n + ': ' + (type ? UNI_NAME[type] || type : 'empty');
  root.append(t);
  return tagged(slotEl('abs', root), type, map, 'university_' + n);
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
    const order = bonusOrder(seat, used);
    const spaces = slots.map((sl) => bonusSpace(sl, !!(used & (1 << sl.index)), sl.kind === 'instant_income' ? 38 : 42, sl.index + 1, seat, order.indexOf(sl.index) + 1));
    g.append(...(income && income < slots.length ? [cluster(spaces.slice(0, income)), cluster(spaces.slice(income))] : [cluster(spaces)]));
    bar.append(g, el('i', 'abperf'));
  }
  const a = el('div', 'abgroup');
  a.append(cluster(partners.map((t, i) => partnerSlot(t, i + 1, 36, seat, map))), cluster(unis.map((t, i) => universitySlot(t, i + 1, 34, seat, map))));
  bar.append(a);
  const sets = upgradeSetItems(map);
  if (sets.length) {
    const draw = () => setLines(bar, sets);
    if (typeof ResizeObserver === 'function') new ResizeObserver(draw).observe(bar); else requestAnimationFrame(draw);       // (the slots have a place only once the bar is in the page)
  }
  return bar;
}

// The upgrade sets (maps 11, 12, T1: a partner zoo + a university of the same number) as lines that hang below the bar: down from the two slots, across, and a pentagon with the bonus in the middle.
// One colour per set (the strip's), 15 px between the lines, a line never runs through a slot's own bonus tag. Drawn in an svg over the bar and clipped so that nothing is drawn over the dark edge of
// the bar (its border and its shadow): the lines come out from under it. Places are read with offsets (not rects): the page is zoomed.
const EDGE = 10, FIRST = 7, GAP = 15, LINE = 5;                       // (the edge below the padding box: 4 px border + 6 px shadow; the first line's distance below it; spacing; the stroke width)
function setLines(bar, sets) {
  bar.querySelector('svg.abset-lines')?.remove();
  const pos = (e) => { let x = 0, y = 0, o = e; while (o && o !== bar) { x += o.offsetLeft; y += o.offsetTop; o = o.offsetParent; } return { x, y, w: e.offsetWidth, h: e.offsetHeight }; };
  const slot = (k, n) => bar.querySelector('[data-assoc-slot=' + k + '_' + n + ']');
  const W = bar.clientWidth, Hc = bar.clientHeight;
  if (!W || !slot('partner', 1)) return;
  const NS = 'http://www.w3.org/2000/svg', mk = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const s = mk('svg', { class: 'abset-lines', width: W, height: Hc + EDGE + FIRST + GAP * sets.length + 20 });
  const edge = (k, n) => {                                                      // where a set's line leaves a slot: its middle, left of the slot's own tag
    const sv = slot(k, n); if (!sv) return null;
    const e = sv.parentElement, p = pos(e), t = e.querySelector('svg.abtag');                 // (svg elements have no offsets: the span around the slot has its place)
    let x = p.x + p.w / 2;
    if (t) { const left = p.x + p.w + 5 - 28.6; if (x > left - 5) x = Math.min(x, left - 6); }          // (the tag: 28.6 px wide, 5 px outside the slot's right edge, see parkposter.css)
    return { x, bottom: p.y + p.h };
  };
  const tags = [];
  sets.forEach(({ n, kind, color }, i) => {
    const a = edge('partner', n), c = edge('university', n);
    if (!a || !c) return;
    const y = Hc + EDGE + FIRST + i * GAP, d = 'M' + a.x + ' ' + (a.bottom + 4) + 'V' + y + 'H' + c.x + 'V' + (c.bottom + 4);
    s.append(mk('path', { d, fill: 'none', stroke: color, 'stroke-width': LINE, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    const g = setBonusTag(kind, 26), k = 26 / 80;
    g.setAttribute('x', (a.x + c.x) / 2 - 44 * k); g.setAttribute('y', y - 44 * k); g.setAttribute('opacity', '1');
    tags.push(g);
  });
  s.append(...tags);                                                            // (all the pentagons after all the lines: a later set's line never runs over an earlier set's pentagon)
  const B = 2000;                                                               // clip: everything except the strip of the bar's edge
  s.style.clipPath = 'polygon(' + [-B, -B, W + B, -B, W + B, Hc, -B, Hc, -B, Hc + EDGE, W + B, Hc + EDGE, W + B, Hc + B, -B, Hc + B].map((v) => v + 'px').join(',') + ')';
  bar.append(s);
}
