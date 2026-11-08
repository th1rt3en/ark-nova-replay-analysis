import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sharkTimeline, biteHole, teeth, fangs, qpt, JAW_W, JAW_H } from '../web/js/shark-motion.js';

test('one card is bitten, two or more are taken by one pass of the fin', () => {
  assert.equal(sharkTimeline([{ x: 200, w: 130.25 }], { x0: 0, x1: 900 }).kind, 'bite');
  const t = sharkTimeline([{ x: 80, w: 130.25 }, { x: 356, w: 130.25 }], { x0: 15, x1: 836 });
  assert.equal(t.kind, 'pass');
  assert.ok(t.from < 15 && t.to > 836, 'the fin crosses the whole display');
  assert.ok(t.grabs[0] < t.grabs[1], 'the cards go under from left to right, as the fin passes them');
  assert.ok(t.length >= t.grabs[1] + 560, 'the last card has time to sink');
});

test('the fin keeps its speed per card width at any zoom', () => {
  const a = sharkTimeline([{ x: 80, w: 130.25 }, { x: 356, w: 130.25 }], { x0: 15, x1: 836 });
  const b = sharkTimeline([{ x: 160, w: 260.5 }, { x: 712, w: 260.5 }], { x0: 30, x1: 1672 });
  assert.equal(a.run, b.run);
});

test('a bite cuts the mouth out of the card exactly where the jaws close, with a notch for every tooth', () => {
  const cw = 130.25, ch = 181.02, jw = cw * .82, jh = jw * JAW_H / JAW_W, box = { left: (cw - jw) / 2, top: ch + 12, w: jw, h: jh, ty: -(jh + 6) + 8, sy: .74 };
  const one = biteHole([{ ...box, tx: -18 }], cw, ch), two = biteHole([{ ...box, tx: -18 }, { ...box, tx: 22 }], cw, ch);
  assert.match(one, /^polygon\(0% 0%,100% 0%,100% 100%,/);
  const pts = (poly) => poly.slice(8, -1).split(',').map((p) => p.trim().split(' ').map(parseFloat));
  // the gum corners of the teeth of the closed jaws, mapped to the card in %, are on the hole's outline; the notch over the middle tooth is above the apex
  const map = ([X, Y]) => [(box.left - 18 + X / JAW_W * jw) / cw * 100, (box.top + box.h / 2 + box.ty + (Y / JAW_H * jh - jh / 2) * box.sy) / ch * 100];
  for (const t of teeth()) { const [tx, ty] = map(t.A0); assert.ok(pts(one).some(([x, y]) => Math.abs(x - tx) < .05 && Math.abs(y - ty) < .05), 'the hole follows the gum where the jaws close'); }
  const [ax, ay] = map(qpt(.5)), top = Math.min(...pts(one).slice(3).map(([, y]) => y));
  assert.ok(top < ay && ay - top < 4, 'a small tooth notch rises above the apex');
  // the hole is as wide as the mouth (corner to corner)
  const xs = pts(one).filter(([, y]) => y === 100).map(([x]) => x).filter((x) => x > 0 && x < 100);
  const mouth = (98 - 22) / JAW_W * jw / cw * 100;
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - mouth) < 1, 'as wide as the mouth (the notches of the outer teeth reach a little into the sides)');
  // two overlapping bites make one outline that never runs backwards along the lower edge
  const p2 = pts(two).slice(3, -1).map(([x]) => x);
  assert.ok(p2.every((x, i) => i === 0 || x <= p2[i - 1] + 1e-9), 'the outline runs from right to left without crossing itself');
});

test('the fangs stand on the mouth\'s edge, side by side, the middle one centred on the apex', () => {
  const teeth = fangs().split('M').filter(Boolean);
  assert.equal(teeth.length, 7);
  const onEdge = ([x, y]) => { for (let i = 0; i <= 800; i++) { const [ax, ay] = qpt(i / 800); if (Math.hypot(ax - x, ay - y) < 1.8) return true; } return false; };
  const num = (tooth) => tooth.match(/-?\d+(\.\d+)?/g).map(Number);
  let prevEnd = null;
  teeth.forEach((tooth, i) => {
    const nums = num(tooth), start = [nums[0], nums[1]], tip = [nums[4], nums[5]], end = [nums[8], nums[9]];
    assert.ok(onEdge(start) && onEdge(end), 'both corners of the base sit on the gum line');
    if (prevEnd) assert.ok(Math.hypot(prevEnd[0] - start[0], prevEnd[1] - start[1]) < .01, 'each tooth touches the next one');
    assert.ok(tip[1] > Math.max(start[1], end[1]), 'the tip points into the mouth (down)');
    if (i === 3) { assert.ok(Math.abs(tip[0] - 60) < .05, 'the middle tooth points straight down at the apex'); assert.ok(Math.abs((60 - start[0]) - (end[0] - 60)) < .3, 'and is symmetric'); }
    if (i === 2 || i === 4) { const mid = num(teeth[3]); assert.ok(i === 2 ? tip[0] < mid[4] : tip[0] > mid[4], 'its neighbours do not cross it'); }
    prevEnd = end;
  });
});

test('the mouth is a tall arch with a soft top: symmetric, high apex, steep sides, no sharp point', () => {
  const [lx, ly] = qpt(.45), [rx, ry] = qpt(.55), [ax, ay] = qpt(.5), [cx, cy] = qpt(.02), [dx, dy] = qpt(.04);
  assert.ok(Math.abs((60 - lx) - (rx - 60)) < 1e-6 && Math.abs(ly - ry) < 1e-6, 'symmetric about the middle');
  assert.ok(ay < 34, 'the apex is high: the mouth is tall, not a flat arch');
  assert.ok((ly - ay) / (60 - lx) < .8, 'gentle near the top: a soft point, not a pyramid');
  assert.ok((cy - dy) / (dx - cx) > 2, 'the sides rise steeply from the corners');
});

test('only the cone of the head shows: the bottom of the mouth stays below the card\'s edge, at the top of the leap and at the bite', () => {
  const src = fs.readFileSync(new URL('../web/js/shark-motion.js', import.meta.url), 'utf8');
  assert.match(src, /up = -\(jh \+ 6 \* u\)/);
  for (const w of [130.25, 260.5]) {
    const u = w / 130.25, h = w * 181.02 / 130.25, jw = w * .82, jh = jw * JAW_H / JAW_W, top0 = h + 12 * u, up = -(jh + 6 * u);
    assert.ok(top0 + up + jh > h, 'at the top of the leap');
    const ty = up + 8 * u, bottomAtBite = top0 + ty + jh / 2 + (jh / 2) * .74;
    assert.ok(bottomAtBite > h, 'at the bite');
  }
});
