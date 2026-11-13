// [module] Flights of the association side: the cylinders on the reputation / conservation tracks, the partner zoos and universities (supply of the association board <-> the player's slot,
// refilled from the invisible deck in the break), the workers (info box icon <-> task slot, invisible deck -> icon), the cubes of supported projects and donations.
// Like action-motion.js: `captureAssoc(before, after)` measures the old picture before the render, `runAssoc(capture, api)` flies copies from there to the new places after it
// (the real pieces are hidden until their copy has landed). Every glide has the pace of a card's glide (the same ease, 650-1500 ms by distance). What is counted (the number next
// to the worker icon) changes when the piece leaves / arrives, not before.
import { S } from './state.js';
import { ICON_IDS, iconUrl, workerUrl } from './icons.js';
import { trackMoves, taken, supplyChanges, workerMoves, newCubes } from './assoc-motion-plan.js';

const NS = 'http://www.w3.org/2000/svg';
const $ = (sel) => document.querySelector(sel);
const rectOf = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top } : null; };
const tileOf = (seat) => $('#side [data-wk-seat="' + seat + '"]') || $('[data-wk-seat="' + seat + '"]');
const eyeOf = (seat) => rectOf($('#zoos [data-zoo-seat="' + seat + '"] .poveye')) || rectOf($('#zoos [data-zoo-seat="' + seat + '"] .ztab, #zoos [data-zoo-seat="' + seat + '"] h2'));

// The picture of a partner zoo / university and its visible part (the transparent edge of the picture is cut off), as in association.js `drawToken` and assocbar.js.
function tokenArt(kind, type) {
  const id = ICON_IDS[kind === 'partner' ? String(type).replace('partner-', '') : type];
  if (!id) return null;
  const [w0, h0] = S.iconSizes[id] || [190, 152];
  const crop = kind === 'partner' ? [5, 4, 179, 142] : w0 === 121 ? [1, 1, 119, 84] : [7, 6, 119, 84];
  return { href: iconUrl(id), w0, h0, crop };
}
// where the visible part of a token lies, from the rect of the whole picture it is drawn in (an <image> that keeps its proportions, centred)
function visibleRect(art, r) {
  const k = Math.min(r.w / art.w0, r.h / art.h0), left = r.x - art.w0 * k / 2, top = r.y - art.h0 * k / 2, [bx, by, bw, bh] = art.crop;
  return { x: left + (bx + bw / 2) * k, y: top + (by + bh / 2) * k, w: bw * k, h: bh * k };
}
const sized = (e, r) => { Object.assign(e.style, { left: r.x - r.w / 2 + 'px', top: r.y - r.h / 2 + 'px', width: r.w + 'px', height: r.h + 'px' }); return e; };
function plainSvg(n) {                                                      // a copy of a cube (svg) that fills whatever it is put in
  const c = n.cloneNode(true); c.removeAttribute('class'); c.removeAttribute('style'); c.setAttribute('width', '100%'); c.setAttribute('height', '100%'); c.style.overflow = 'visible'; return c;
}
function svgEl(tag, attrs) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v)); return e; }
function imageGhost(href, r) {                                              // a picture that fills its rect
  const e = document.createElement('img'); e.src = href; e.alt = ''; e.style.cssText = 'width:100%;height:100%;display:block;object-fit:fill'; return e;
}

export function captureAssoc(before, after) {
  const tracks = trackMoves(before, after), tk = taken(before, after), sup = supplyChanges(before, after), wk = workerMoves(before, after), cubes = newCubes(before, after);
  if (!(tracks.length || tk.length || sup.refilled.length || wk.length || cubes.length)) return null;
  const cap = { before, after, tracks, taken: tk, refilled: sup.refilled, workers: wk, cubes };
  cap.trackShots = tracks.map((t) => { const n = $('.trackcube[data-track="' + t.track + '"][data-seat="' + t.seat + '"]'); return { rect: rectOf(n), copy: n ? plainSvg(n) : null }; });
  cap.takenShots = tk.map((t) => { const n = $('image[data-supply="' + t.type + '"]'); return rectOf(n); });
  cap.tiles = {};
  for (const seat of new Set(wk.map((w) => w.seat))) {
    const tile = tileOf(seat), b = tile && tile.querySelector('b');
    cap.tiles[seat] = { icon: rectOf(tile && tile.querySelector('img.icon')), html: b ? b.innerHTML : null };
  }
  cap.slots = wk.filter((w) => w.kind === 'return').map((w) => $$slots(w.seat, w.task).map(rectOf));          // the old slots of the returning workers: the last ones of that player at that task
  cap.bonusCubes = cubes.map((c) => (c.kind === 'project' && c.bonus >= 0 ? (() => { const n = $('image[data-bcube="' + c.bonus + '"][data-bseat="' + c.seat + '"]'); return { rect: rectOf(n), href: n && n.getAttribute('href'), bar: rectOf($('[data-abonus="' + c.bonus + '"][data-aseat="' + c.seat + '"]')) }; })() : null));
  return cap;
}
function $$slots(seat, task) { return [...document.querySelectorAll('image[data-wtask="' + task + '"][data-wseat="' + seat + '"]')]; }

// api = { animate, finish, hide, show, element, deckPoint, scale, glideEase, projectLanding }
// Two phases, because a played project card animates its strip (the cube inside it can not be measured while that runs): `runAssoc` measures and hides the real pieces and returns `go`,
// which creates the flights once the other animations of the step exist (a cube then knows when its project card has settled).
export function runAssoc(cap, api) {
  if (!cap) return () => {};
  const sc = api.scale(), jobs = [], counts = [];
  let spendEnd = 0;          // a worker that is spent goes first; everything else of the step starts when it has landed
  const ms = (a, b) => Math.min(1500, Math.max(650, 650 * Math.hypot(a.x - b.x, a.y - b.y) / sc / 850));
  const settle = (a, fn) => a.finished.then(fn, fn);
  const deck = () => { const d = api.deckPoint(); return { x: d.x, y: d.y }; };
  // One flight: `content` is laid over `to`, starts at `from` (centre + size), glides with the ease of a card and lands; `hidden` are the real pieces that wait for it.
  const fly = (spec) => { (spec.hidden || []).forEach((n) => api.hide(n)); jobs.push(spec); return spec; };
  function launch(j) {
    const { content, from, to, hidden = [], fadeIn = false } = j, own = Math.max(typeof j.delay === 'function' ? j.delay() : j.delay || 0, 0), delay = j.spend ? own : j.sync ? Math.max(own, spendEnd) : own + spendEnd;
    const e = sized(api.element('cm-piece'), to);
    e.append(content);
    const dx = from.x - to.x, dy = from.y - to.y, sx = (from.w || to.w) / to.w, sy = (from.h || to.h) / to.h, T = j.duration || ms(from, to);
    const frames = Array.from({ length: 41 }, (_, i) => { const t = i / 40, u = api.glideEase(t); return { offset: t, transform: `translate(${dx * (1 - u)}px,${dy * (1 - u)}px) scale(${sx + (1 - sx) * u},${sy + (1 - sy) * u})`, opacity: fadeIn ? Math.min(1, t / .14) : 1 }; });
    const a = api.animate(e, frames, T, delay, 'linear');
    settle(a, () => { hidden.forEach((n) => api.show(n)); e.remove(); });
    j.end = delay + T;
  }
  // the number next to a worker icon keeps its old picture until the worker has left (`mode` 'leave': at once) / arrived (`tag`: the flights it waits for)
  function count(seat, tag, mode) {
    const tile = tileOf(seat), old = cap.tiles[seat], b = tile && tile.querySelector('b');
    if (!b || !old || old.html === null || b.innerHTML === old.html) return;
    const now = b.innerHTML, up = tile.classList.contains('flash-up'), down = tile.classList.contains('flash-down');
    b.innerHTML = old.html; tile.classList.remove('flash-up', 'flash-down');
    counts.push({ b, tile, now, up, down, tag, mode });
  }

  // 1. the cylinders of the tracks
  cap.tracks.forEach((t, i) => {
    const shot = cap.trackShots[i], node = $('.trackcube[data-track="' + t.track + '"][data-seat="' + t.seat + '"]'), to = rectOf(node);
    if (!shot.rect || !shot.copy || !to) return;
    fly({ content: shot.copy, from: shot.rect, to, hidden: [node] });
  });

  // 2. partner zoos / universities taken: from the supply of the association board to the slot (it can be smaller in the bar of an open drawer)
  const slotRect = (kind, slot, seat) => {
    for (const n of document.querySelectorAll('[data-assoc-slot="' + kind + '_' + slot + '"][data-assoc-seat="' + seat + '"]')) { const r = rectOf(n); if (r) return { r, n }; }
    return null;
  };
  const tokenSvg = (art) => { const s = svgEl('svg', { viewBox: art.crop.join(' '), width: '100%', height: '100%', preserveAspectRatio: 'none' }); s.append(svgEl('image', { href: art.href, x: 0, y: 0, width: art.w0, height: art.h0 })); return s; };
  cap.taken.forEach((t, i) => {
    const art = tokenArt(t.kind, t.type), dest = slotRect(t.kind, t.slot, t.seat);
    if (!art || !dest) return;
    const src = cap.takenShots[i], from = src ? visibleRect(art, src) : { ...deck(), w: dest.r.w * .6, h: dest.r.h * .6 };
    const holder = dest.n.tagName.toLowerCase() === 'rect' ? dest.n.parentNode : dest.n;          // (the strip: the group of the token; the bar: the slot itself)
    holder.classList.remove('tok-new');
    fly({ content: tokenSvg(art), from, to: dest.r, hidden: [holder], fadeIn: !src });
  });

  // 3. the break refills the supply from the invisible deck
  cap.refilled.forEach((t, i) => {
    const node = $('image[data-supply="' + t.type + '"]'), to = rectOf(node), kind = t.type.startsWith('partner') ? 'partner' : 'university', art = tokenArt(kind, t.type);
    if (!to || !art) return;
    const s = svgEl('svg', { viewBox: '0 0 ' + art.w0 + ' ' + art.h0, width: '100%', height: '100%' }); s.append(svgEl('image', { href: art.href, x: 0, y: 0, width: art.w0, height: art.h0 }));
    fly({ content: s, from: { ...deck(), w: to.w * .5, h: to.h * .5 }, to, delay: i * 95, hidden: [node], fadeIn: true });
  });

  // 4. workers. Spent: from the icon (the number drops as it leaves) to the slot of the task. Back / gained: into the icon (the number rises on arrival); all that come home go together.
  const spends = cap.workers.filter((w) => w.kind === 'spend' || w.kind === 'gain-spend'), nth = {};
  for (const w of spends) {
    const key = w.seat + ':' + w.task, all = [...document.querySelectorAll('image[data-wtask="' + w.task + '"][data-wseat="' + w.seat + '"]')];
    const left = spends.filter((x) => x.seat === w.seat && x.task === w.task).length, node = all[all.length - left + (nth[key] || 0)];
    nth[key] = (nth[key] || 0) + 1;
    const to = rectOf(node), tile = cap.tiles[w.seat];
    if (!to) continue;
    const from = w.kind === 'spend' && tile && tile.icon ? tile.icon : { ...deck(), w: to.w * .6, h: to.h * .6 };
    fly({ content: imageGhost(workerUrl(w.seat), to), from: { x: from.x, y: from.y, w: from.w * .9, h: from.w * .9 * to.h / to.w }, to, hidden: [node], fadeIn: w.kind !== 'spend', spend: true });
    if (w.kind === 'spend') count(w.seat, null, 'leave');
  }
  const back = cap.workers.filter((w) => w.kind === 'return' || w.kind === 'gain'), used = {}, homing = [];
  back.forEach((w) => {
    const tile = tileOf(w.seat), to = rectOf(tile && tile.querySelector('img.icon')); if (!to) return;
    let from;
    if (w.kind === 'return') {
      const list = cap.slots[cap.workers.filter((x) => x.kind === 'return').indexOf(w)] || [], key = w.seat + ':' + w.task, k = used[key] = (used[key] || 0) + 1;
      from = list[list.length - k];
    }
    homing.push({ content: imageGhost(workerUrl(w.seat), to), to, from: from || { ...deck(), w: to.w * .6, h: to.h * .6 }, fadeIn: !from, tag: 'home' + w.seat });
  });
  if (homing.length) {
    const T = Math.max(...homing.map((j) => ms(j.from, j.to)));
    homing.forEach((j) => { j.duration = T; fly(j); });
    for (const seat of new Set(back.map((w) => w.seat))) count(seat, 'home' + seat, 'land');
  }

  // 5. cubes of supported projects and donations: from the cube that left the bonus panel (when that panel is not shown: from the bonus space in the bottom row) / from the eye
  cap.cubes.forEach((c, i) => {
    const node = c.kind === 'project' ? $('.blockcube[data-pkey="' + c.key + '"][data-pseat="' + c.seat + '"][data-pslot="' + c.slot + '"]') : $('image[data-dseat="' + c.seat + '"][data-dk="' + c.k + '"]');
    const to = rectOf(node);
    if (!to) return;
    const bc = cap.bonusCubes[i], eye = eyeOf(c.seat), size = Math.min(to.w, to.h);
    // (a board that was not shown before the step, e.g. the other player's board in the Tabbed layout: its panel did not exist when the cube was measured; the space where the cube sat is on the board now)
    const here = !bc || !(bc.bar || bc.rect) ? (c.kind === 'project' && c.bonus >= 0 ? { panel: rectOf($('[data-bpos="' + c.bonus + '"][data-bpseat="' + c.seat + '"]')), bar: rectOf($('[data-abonus="' + c.bonus + '"][data-aseat="' + c.seat + '"]')) } : null) : null;
    const barSize = Math.max(size * 1.2, 20), from = bc && bc.bar ? { x: bc.bar.x, y: bc.bar.y, w: barSize, h: barSize } : bc && bc.rect ? bc.rect : here && here.panel ? here.panel : here && here.bar ? { x: here.bar.x, y: here.bar.y, w: barSize, h: barSize } : eye ? { x: eye.x, y: eye.y, w: size * .5, h: size * .5 } : { ...deck(), w: size * .5, h: size * .5 };
    const content = node.tagName.toLowerCase() === 'image' ? imageGhost(node.getAttribute('href'), to) : plainSvg(node);
    fly({ content, from, to, delay: c.kind === 'project' ? () => api.projectLanding(c.key) : 0, hidden: [node], fadeIn: !(bc && bc.rect && !bc.bar), sync: c.kind === 'project' });          // (a project card played in this step: the cube waits until the card lies in its strip)
  });

  return function go() {
    for (const j of jobs.filter((x) => x.spend)) { launch(j); spendEnd = Math.max(spendEnd, j.end); }
    for (const j of jobs.filter((x) => !x.spend)) launch(j);
    for (const c of counts) {
      const at = c.mode === 'leave' ? 140 : Math.max(0, ...jobs.filter((j) => j.tag === c.tag).map((j) => j.end || 0));
      const a = api.animate(c.b, [{ opacity: 1 }, { opacity: 1 }], 1, at);
      settle(a, () => { a.cancel(); if (!c.b.isConnected) return; c.b.innerHTML = c.now; for (const k of [c.up && 'flash-up', c.down && 'flash-down']) if (k) { c.tile.classList.remove(k); void c.tile.offsetWidth; c.tile.classList.add(k); } });
    }
  };
}
