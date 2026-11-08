// [module] The price of an animal after the discounts (setting "Apply discounts to animals", S.applyDiscounts): the card keeps its picture, the price badge on it is drawn again with the new number.
// The rule is the engine's `animals_action.cost` without the display folder and the bonuses of an action in progress: the card price - 3 per partner zoo icon of the animal's continents
// (a continent icon counts once per icon on the card), - 3 with the sponsor Expert in Small Animals (S229, size 1-2), - 4 with Expert in Large Animals (S230, size 4-5), never below 0.
// The badges (web/price_badges/<n>.webp, geometry.json) are made from BGA's money icon by scripts/cardgen/shoot.mjs; the box of a card's badge is `pbox` of its catalog entry (fractions of the card).
// Setting "Cross out original price" (`S.strikePrice`): the printed badge is faded with a faint white slash corner to corner, and the new one sits just to its right.
import { S } from './state.js';

const CONTINENTS = new Set(['africa', 'europe', 'asia', 'americas', 'australia']);
const GAP = 0.13;                                                              // space between the printed badge and the gray plate of the new one
const BACK_PAD = 0.12;                                                         // gray plate of the printed cost, a little larger than the money icon
const BESIDE = 1 + GAP + BACK_PAD;                                             // the money icon of the new price (plate extends BACK_PAD to its left)
const COST_GRAY = '#878787';                                                   // the printed cost panel (BGA `.animal-card-cost`)

// the discounted price of animal `key` for seat `seat` (the seat whose partner zoos and sponsors count), or null when it is the printed price / the setting is off / the card is no animal
export function discounted(seat, key) {
  if (!S.applyDiscounts || !S.replay || !S.replay.steps[S.step]) return null;
  const c = S.replay.cards[key];
  if (!c || c.type !== 'animal' || typeof c.price !== 'number' || !c.pbox) return null;
  const st = S.replay.steps[S.step].state;
  const s = seat === 'display' ? (S.pov === 0 || S.pov === 1 ? S.pov : st.active_player) : seat;      // (the display belongs to nobody: the discounts of the player whose point of view is shown; with no point of view (live play) the player to move)
  const p = st.players && st.players[s];
  if (!p) return null;
  const zoos = {};
  for (const t of p.tokens || []) if (t.type.startsWith('partner-')) { const k = t.type.slice(8).toLowerCase(); zoos[k] = (zoos[k] || 0) + 1; }
  let price = c.price;
  for (const tag of c.tags || []) if (CONTINENTS.has(tag)) price -= 3 * (zoos[tag] || 0);
  const sponsors = p.sponsors || [];
  if (sponsors.includes('S229') && c.size <= 2) price -= 3;
  if (sponsors.includes('S230') && c.size >= 4) price -= 4;
  price = Math.max(0, price);
  return price === c.price ? null : price;
}

// the new price badge over the printed one (an <img> in % of the card, so it follows every card size). With S.strikePrice: a slash through the printed badge and the new one to its right.

function place(elm, x, y, w, h) {
  elm.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%`;
}
function badgeImg(price) {
  const b = document.createElement('img');
  b.className = 'cprice'; b.alt = ''; b.draggable = false; b.src = '/price_badges/' + price + '.webp';
  return b;
}
function roundBox(g, px, py, pw, ph, k) {
  const r = Math.min(pw, ph) * k;
  g.beginPath(); g.roundRect(px, py, pw, ph, r);
}
function backBox(x, y, w, h) {                                                 // the gray plate behind the new money icon
  const nx = x + w * BESIDE;
  return [nx - w * BACK_PAD, y - h * BACK_PAD, w * (1 + 2 * BACK_PAD), h * (1 + 2 * BACK_PAD)];
}
function drawGrayPlate(g, x, y, w, h, cw, ch) {
  const [bx, by, bw, bh] = backBox(x, y, w, h);
  g.fillStyle = COST_GRAY;
  g.fillRect(bx * cw, by * ch, bw * cw, bh * ch);
}
function slash(g, x, y, w, h, cw, ch) {                                        // fade the printed badge and a faint white slash corner to corner, same as `.cprice-off`
  const px = x * cw, py = y * ch, pw = w * cw, ph = h * ch;
  g.save();
  roundBox(g, px, py, pw, ph, 0.22); g.clip();
  g.fillStyle = 'rgba(255,255,255,0.42)'; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.58)'; g.lineWidth = Math.max(1.5, Math.min(pw, ph) * 0.07); g.lineCap = 'round';
  g.beginPath(); g.moveTo(px + pw * 0.14, py + ph * 0.14); g.lineTo(px + pw * 0.86, py + ph * 0.86); g.stroke();
  g.restore();
}

export function priceBadge(key, price) {
  const [x, y, w, h] = S.replay.cards[key].pbox;
  const b = badgeImg(price);
  if (!S.strikePrice) { place(b, x, y, w, h); return b; }
  const wrap = document.createElement('div'); wrap.className = 'cprices';
  const off = document.createElement('span'); off.className = 'cprice-off'; place(off, x, y, w, h);
  const back = document.createElement('span'); back.className = 'cprice-back'; place(back, ...backBox(x, y, w, h));
  b.classList.add('cprice-new'); place(b, x + w * BESIDE, y, w, h);
  wrap.append(off, back, b);
  return wrap;
}

// the large card of the hover preview with the new badge drawn into it (a canvas, so the enlarged picture is one image as before): `src` + '#price=N:x,y,w,h'[:s] -> a blob URL (kept per card and price); `:s` = the original is crossed out and the new badge sits to its right
const MADE = new Map();
export function withPrice(src, done) {
  const m = /^(.*)#price=(\d+):([\d.]+),([\d.]+),([\d.]+),([\d.]+)(:s)?$/.exec(src);
  if (!m) { done(src); return; }
  if (MADE.has(src)) { done(MADE.get(src)); return; }
  const [, base, price, xs, ys, ws, hs, strike] = m;
  const x = +xs, y = +ys, w = +ws, h = +hs;
  const card = new Image(), badge = new Image();
  let n = 0;
  const go = () => {
    if (++n < 2) return;
    const cv = document.createElement('canvas'); cv.width = card.naturalWidth; cv.height = card.naturalHeight;
    const g = cv.getContext('2d'); g.drawImage(card, 0, 0);
    if (strike) {
      slash(g, x, y, w, h, cv.width, cv.height);
      drawGrayPlate(g, x, y, w, h, cv.width, cv.height);
      g.drawImage(badge, (x + w * BESIDE) * cv.width, y * cv.height, w * cv.width, h * cv.height);
    } else {
      g.drawImage(badge, x * cv.width, y * cv.height, w * cv.width, h * cv.height);
    }
    cv.toBlob((blob) => { const u = URL.createObjectURL(blob); MADE.set(src, u); done(u); }, 'image/webp', 0.95);
  };
  card.onload = badge.onload = go;
  card.onerror = badge.onerror = () => done(base);
  card.src = base; badge.src = '/price_badges/' + price + '.webp';
}
export const priceSrc = (base, key, price) => (price == null ? base : base + '#price=' + price + ':' + S.replay.cards[key].pbox.join(',') + (S.strikePrice ? ':s' : ''));
