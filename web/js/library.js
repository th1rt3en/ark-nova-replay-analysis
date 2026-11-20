// The Library hall (library/index.html): one candle-lit wall of mahogany bookcases, drawn as an SVG. Four bays, one per section of the library:
// Cards (opens the card library), Action cards, Bonus tiles (over an open fire) and Maps (a world map, the continent atlases, a globe that spins on a click).
// A narrow bookcase between them is a door, ajar, with a dark-red glow behind it. A cat sits in a basket by the fire: it blinks, and a click pets it.
import { isPlaying, fadeOutThen, getSoundVolume } from './library_sound.js?v=20261120a';
const svg = document.getElementById('hall');
const INK = '#2A1210', BRASS = '#D9A441';
const F = (n) => Math.round(n * 10) / 10;
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const PAL = ['#7A1F2E', '#8C2F39', '#A23B3B', '#5A1A28', '#7A1F2E', '#B5533C', '#C98B3A', '#D9A441', '#4F6B45', '#2F5248', '#34506B', '#4A3B5C', '#6B3A4A', '#D8BE93', '#8A6A4A', '#8C2F39'];
const ZCOL = ['#2F5248', '#5A1A28', '#243B55', '#4F6B45', '#6B2A36'];

/* ---------- pieces ---------- */
function book(x, yb, w, h, col, r, title) {
  let s = `<rect x="${F(x)}" y="${F(yb - h)}" width="${F(w)}" height="${F(h)}" rx="1.2" fill="${col}"/>`;
  if (title) {
    const top = yb - h + 10, bot = yb - 12, band = bot - top - 12, fs = Math.min(10.2, band / (title.length * .82 + .5));
    s += `<rect x="${F(x + 3)}" y="${F(yb - h + 8)}" width="${F(w - 6)}" height="2" fill="${BRASS}"/><rect x="${F(x + 3)}" y="${F(yb - 12)}" width="${F(w - 6)}" height="2" fill="${BRASS}"/><text transform="translate(${F(x + w / 2 + fs * .34)} ${F((top + bot) / 2 + .4)}) rotate(-90)" text-anchor="middle" font-size="${F(fs)}" font-weight="600" letter-spacing=".5" fill="#EBCB7C" font-family="Fraunces,Georgia,serif">${title}</text>`;
  } else {
    const k = r();
    if (k < .34) s += `<rect x="${F(x)}" y="${F(yb - h * .82)}" width="${F(w)}" height="1.8" fill="${BRASS}" opacity=".85"/><rect x="${F(x)}" y="${F(yb - h * .2)}" width="${F(w)}" height="1.8" fill="${BRASS}" opacity=".85"/>`;
    else if (k < .5 && w > 9) s += `<rect x="${F(x + 2)}" y="${F(yb - h * .7)}" width="${F(w - 4)}" height="${F(h * .22)}" fill="#E9D7AE" opacity=".8"/>`;
  }
  return s + `<rect x="${F(x)}" y="${F(yb - h)}" width="${F(w)}" height="${F(h)}" rx="1.2" fill="url(#sp)" stroke="${INK}" stroke-width=".9"/>`;
}
function row(x0, x1, yb, hmax, seed, gaps = [], titles = []) {
  const r = rng(seed); let s = '', x = x0, prev = null; /* prev: the book standing right before x (its right edge and height), for a book to lean on */ const t = titles.slice(); const at = t.map((_, i) => x0 + (x1 - x0) * ((i + .35 + r() * .3) / t.length));
  while (x < x1 - 6) {
    const g = gaps.find(([a, b]) => x + 4 > a && x < b); if (g) { x = g[1]; prev = null; continue; }
    const next = gaps.find(([a]) => a > x), lim = next ? Math.min(x1, next[0]) : x1;
    if (t.length && x >= at[0] && lim - x > 30) { const w = 27 + r() * 4, h = hmax * (.9 + r() * .08); s += book(x, yb, w, h, ZCOL[Math.floor(r() * ZCOL.length)], r, t.shift()); at.shift(); x += w; prev = { r: x, h }; continue; }
    const w = Math.min(lim - x, 8 + r() * 13); if (w < 5) { x = lim; prev = null; continue; }
    const h = hmax * (.6 + r() * .36), col = PAL[Math.floor(r() * PAL.length)];
    // A leaning book rests like a real one: it stands on its bottom-left corner on the shelf and leans left against the book before it, touching it
    // (with its top-left corner when that book is taller, else with its left side on that book's top corner), so it never overlaps a book or leans on air.
    // Only right after a standing book, never after a gap; the next book stands right of its lifted bottom-right corner.
    let lean = 0, p = 0;
    if (r() < .06 && prev && Math.abs(prev.r - x) < .01) {
      const deg = 9 + (w * 7) % 6, a = deg * Math.PI / 180;
      p = x + .6 + (prev.h >= h * Math.cos(a) ? h * Math.sin(a) : prev.h * Math.tan(a));
      if (p + w * Math.cos(a) + 1 <= lim) lean = deg;
    }
    if (lean) { const a = lean * Math.PI / 180; s += `<g transform="rotate(${F(-lean)} ${F(p)} ${yb})">${book(p, yb, w, h, col, r)}</g>`; x = p + w * Math.cos(a) + .8; prev = null; }
    else { s += book(x, yb, w, h, col, r); x += w; prev = { r: x, h }; }
  }
  return s;
}
const pot = (x, yb, w, h, c = '#B5623C') => `<path d="M${x - w / 2} ${yb - h}H${x + w / 2}L${F(x + w * .36)} ${yb}H${F(x - w * .36)}Z" fill="${c}" stroke="${INK}" stroke-width="1.6"/><rect x="${F(x - w / 2 - 2)}" y="${yb - h - 5}" width="${w + 4}" height="6" rx="2" fill="${c}" stroke="${INK}" stroke-width="1.6"/><path d="M${F(x - w * .3)} ${yb - h + 2}L${F(x - w * .22)} ${yb - 2}" stroke="#fff" stroke-width="2" opacity=".25"/>`;
function fern(x, yb, s = 1, seed = 1) {
  const r = rng(seed); let fr = '';
  for (let i = 0; i < 8; i++) { const a = -70 + i * 20 + r() * 8, L = (34 + r() * 16) * s, rad = a * Math.PI / 180, ex = Math.sin(rad) * L, ey = -Math.cos(rad) * L * .9 + Math.abs(Math.sin(rad)) * L * .35; const col = i % 2 ? '#5E9A63' : '#3F7A4A'; fr += `<path d="M0 0Q${F(ex * .3)} ${F(ey * .9)} ${F(ex)} ${F(ey)}" fill="none" stroke="${INK}" stroke-width="${F(7 * s)}" stroke-linecap="round"/><path d="M0 0Q${F(ex * .3)} ${F(ey * .9)} ${F(ex)} ${F(ey)}" fill="none" stroke="${col}" stroke-width="${F(5 * s)}" stroke-linecap="round" stroke-dasharray="${F(6 * s)} ${F(2.2 * s)}"/>`; }
  return `<g>${pot(x, yb, 26 * s, 20 * s)}<g transform="translate(${x} ${F(yb - 24 * s)})"><g class="sway" style="animation-duration:${F(6 + r() * 4)}s">${fr}</g></g></g>`;
}
function ivy(x, y, len, seed = 1, cls = 'hang') {
  const r = rng(seed); let p = `M0 0`, lv = '', cx = 0, cy = 0;
  for (let i = 0; i < len; i++) { const nx = cx + (r() - .5) * 16, ny = cy + 15; p += `Q${F(cx + (r() - .5) * 14)} ${F(cy + 8)} ${F(nx)} ${F(ny)}`; const side = i % 2 ? 1 : -1; lv += `<path d="M${F(nx)} ${F(ny)}q${6 * side} -7 ${11 * side} 0q${-5 * side} 7 ${-11 * side} 0z" fill="${i % 3 ? '#5E9A63' : '#7FB56C'}" stroke="${INK}" stroke-width="1"/>`; cx = nx; cy = ny; }
  return `<g transform="translate(${x} ${y})"><g class="${cls}" style="animation-duration:${F(8 + r() * 5)}s"><path d="${p}" fill="none" stroke="#3F7A4A" stroke-width="2.2"/>${lv}</g></g>`;
}
const succ = (x, yb) => `<g>${pot(x, yb, 22, 14, '#C9A26A')}<g transform="translate(${x} ${yb - 19})">${[-50, -25, 0, 25, 50].map((a) => `<path d="M0 0q-6 -12 0 -22q6 10 0 22z" transform="rotate(${a})" fill="#7FB56C" stroke="${INK}" stroke-width="1.1"/>`).join('')}</g></g>`;
const terrarium = (x, yb) => `<g><path d="M${x - 26} ${yb}V${yb - 34}A26 30 0 0 1 ${x + 26} ${yb - 34}V${yb}Z" fill="#CFE6E2" opacity=".28" stroke="${BRASS}" stroke-width="2.2"/><path d="M${x - 24} ${yb - 2}q24 -12 48 0z" fill="#5A3A24"/><g transform="translate(${x} ${yb - 6})"><g class="sway"><path d="M0 0q-12 -16 -8 -34M0 0q6 -18 14 -30M0 0q-2 -22 2 -42" fill="none" stroke="#5E9A63" stroke-width="4" stroke-linecap="round"/><circle cx="-8" cy="-36" r="5" fill="#C2344D" stroke="${INK}" stroke-width="1"/></g></g><path d="M${x - 16} ${yb - 44}q6 -10 14 -12" stroke="#fff" stroke-width="2.2" opacity=".5" fill="none"/><rect x="${x - 28}" y="${yb - 3}" width="56" height="4" fill="${BRASS}" stroke="${INK}" stroke-width="1"/></g>`;
/* ---------- the world: coastlines as [lon, lat], drawn by hand from real coordinates (coarse, but the real shapes) ---------- */
const LAND = {
  namerica: [[-168,66],[-162,70],[-156,71],[-141,70],[-128,70],[-115,68],[-108,68],[-96,68],[-94,72],[-86,70],[-82,67],[-87,64],[-93,61],[-94,58],[-88,56],[-82,55],[-80,52],[-79,55],[-77,60],[-78,62],[-73,62],[-65,60],[-62,57],[-60,54],[-56,52],[-60,50],[-66,50],[-64,46],[-66,44],[-70,43],[-71,41],[-74,40],[-76,35],[-81,31],[-80,26],[-82,25],[-83,29],[-86,30],[-90,29],[-94,29],[-97,27],[-98,22],[-95,19],[-91,19],[-90,21],[-87,21],[-88,16],[-84,15],[-83,10],[-80,9],[-77,8],[-80,7],[-83,8],[-86,11],[-92,14],[-96,16],[-102,17],[-105,20],[-106,23],[-109,27],[-113,31],[-115,31.5],[-112,27],[-110,23.5],[-112,25],[-115,29],[-117,32.5],[-120,34.5],[-124,40],[-124,47],[-123,49],[-128,51],[-131,54],[-135,58],[-140,60],[-147,61],[-152,59],[-158,56],[-164,55],[-158,58],[-162,60],[-166,62],[-161,64],[-166,65]],
  greenland: [[-73,78],[-62,82],[-40,83.5],[-22,82],[-18,77],[-22,71],[-28,68],[-40,65],[-43,60],[-48,61],[-52,65],[-55,70],[-60,76]],
  baffin: [[-88,73],[-80,74],[-72,71],[-62,67],[-65,63],[-72,64],[-78,67],[-86,70]],
  ellesmere: [[-90,77],[-80,83],[-62,82.5],[-70,79],[-80,76.5]],
  victoria: [[-118,71],[-110,73],[-102,71],[-106,69],[-116,69]],
  newfoundland: [[-59.3,47.6],[-55.5,51.6],[-52.7,47.5],[-56,46.8]],
  cuba: [[-85,22],[-80,23.2],[-75,20.5],[-77.5,19.9],[-80,22]],
  hispaniola: [[-74.5,19.8],[-70,19.9],[-68.4,18.6],[-71.5,17.7],[-74.5,18.4]],
  samerica: [[-77,8],[-72,12],[-67,11],[-62,11],[-60,8.5],[-52,5],[-50,1],[-50,-1],[-44,-2.5],[-38,-4],[-35,-6],[-35,-9],[-39,-14],[-39,-18],[-41,-22],[-45,-24],[-48,-27],[-52,-32],[-54,-34.5],[-58,-34.5],[-57,-38],[-62,-39],[-65,-41],[-65,-45],[-68,-50],[-69,-52.5],[-66,-55],[-71,-54],[-74,-52],[-75,-47],[-73,-42],[-73,-37],[-71,-30],[-70,-23],[-70,-18],[-76,-14],[-80,-6],[-81,-4],[-80,-1],[-80,1],[-78,3]],
  eurasia: [[-9,37],[-9.5,43],[-2,43.5],[-1.5,46],[-4.5,48.5],[-1.5,48.7],[2,51],[4,52],[8,54],[8.5,57],[10.5,57],[10,54.5],[14,54],[19,54.5],[21,57],[24,57.5],[23.5,59.5],[30,60],[25,60],[22.5,60],[21.5,63],[25,65.5],[22,65.8],[17.5,62],[18.5,60],[16.5,57],[14,55.5],[12.5,56],[11,59],[8,58],[5.5,59],[5,62],[10,64],[13,66],[15,68.5],[20,70],[25.5,71],[31,70],[33,69.5],[41,67.5],[41,66],[34,66.5],[35,64.5],[38,64],[40,65],[44,66.5],[44,68.5],[53,68.5],[60,69],[67,68.5],[68,71.5],[73,72.5],[75,72],[80,73.5],[87,75],[98,76],[105,77.5],[113,76],[108,73.5],[120,73],[128,73],[131,71],[140,72.5],[150,71],[160,69.5],[170,69],[178,69],[180,68.5],[180,65],[178,62.5],[170,60],[163,61.5],[164,58],[162,56],[160,53],[156.5,51],[156,57],[160,61],[155,59.5],[143,59],[135,54.5],[141,53],[140,48.5],[135,43.5],[131,42.5],[129.5,41],[127.5,39.5],[129.5,37],[129,35],[126.5,34.5],[126,37],[125,39.5],[121.5,39],[122,40.5],[118,39],[119,37],[122.5,37],[119.5,35],[121,32],[122,30],[121,28],[119,25],[116,23],[113,22],[110,21],[108.5,21.5],[106,19],[107.5,16.5],[109.3,13],[109,11.5],[106.5,9],[105,10],[103,11.5],[100.5,13.5],[99.3,9.5],[100.5,7],[103,5.5],[104,1.5],[101.5,2.5],[100.3,5.5],[98.3,8],[98.7,12],[97.5,16.5],[94.5,16],[94,19],[91.5,22.5],[89,22],[87,21],[85,19.5],[80.3,15.5],[80,13],[79.8,10.3],[77.5,8],[76,10],[74.5,14],[73,17],[72.7,21],[70,21],[69,22.5],[67,24.5],[62,25.2],[57,25.5],[56.5,27],[51.5,28],[50,30],[48,30],[48.5,28.5],[50,26.5],[51.5,24.5],[54,24],[56.3,26.3],[56.8,24.5],[59.8,22.5],[57.7,19],[55,17],[52,15.8],[45,12.8],[43.3,13],[42.5,16.5],[39,21.5],[37,25],[35,28],[34.6,29.5],[34.3,27.8],[32.6,29.9],[32.3,31.3],[34.3,31.3],[35,33],[36,35.8],[36,36.8],[33,36.2],[30.5,36.5],[27.5,37],[26.5,39],[27,40.5],[29,41],[31,41.2],[35,42],[38,41],[41.5,41.5],[41,43],[38.5,44.5],[37,45.3],[39,47],[35,46.2],[36.5,45.2],[33.5,44.5],[32.5,46],[30.8,46.5],[29.5,45],[28,43.5],[28,42],[28.5,41.3],[26,40.8],[24,40.8],[23,40],[24,38],[23,36.5],[21.7,37],[21,39],[19.5,40.5],[19.5,42],[16,43.5],[13.5,45.5],[12.3,45.3],[12.5,44],[14,42.3],[16,41.8],[18.4,40],[16.9,40.4],[16.6,39],[16,38],[15.6,38],[16,39.5],[15,40.2],[12.5,41.5],[10.3,43],[8.8,44.4],[7.5,43.8],[4.5,43.4],[3.2,42.4],[3.2,41.8],[0.5,40.5],[-0.3,39.2],[-0.5,38],[-2,36.8],[-5.3,36.1],[-6.3,36.8]],
  britain: [[-5.5,50],[-3,50.6],[1.3,51.2],[1.7,52.7],[0,53.5],[-1.5,55],[-2,56],[-3.5,58.5],[-5,58.5],[-6,56.5],[-5,55],[-3.3,54.8],[-3,53.4],[-4.5,53.2],[-4.2,52.2],[-5.2,51.8],[-3.2,51.4]],
  ireland: [[-10,52],[-6.2,52.2],[-6,54],[-7.5,55.2],[-10,54]],
  iceland: [[-24,65.5],[-22,66.4],[-16,66.4],[-13.6,65],[-18,63.4],[-22.5,63.9]],
  novaya: [[51.5,71.5],[56,74.5],[68,77],[60,75],[55,71.5]],
  sakhalin: [[142,54.3],[143.5,50],[143,46.2],[142,47.5]],
  honshu: [[130,31.5],[131.5,33.5],[135.5,34.5],[137,34.6],[140,35.2],[141,38],[141.5,40.5],[140.2,41.2],[139.8,39],[137,37],[136,36],[133,35.5],[131,34.3],[129.8,33]],
  hokkaido: [[140.3,42],[141.5,45.4],[145.3,43.6],[143.3,42],[141,42.5]],
  taiwan: [[120.2,23],[121.6,25.2],[121.5,22]],
  srilanka: [[79.8,8.5],[81.8,7.5],[81,6],[80,6.2]],
  sumatra: [[95.3,5.6],[98,4],[102,1],[104.5,-2],[106,-5.5],[104,-5.7],[101,-2.5],[98.5,1.5]],
  java: [[105.5,-6.5],[108.5,-6.6],[111,-6.5],[114.5,-7.7],[114.3,-8.6],[110,-8],[106.5,-7.4]],
  borneo: [[109,1.5],[111.5,2.8],[114,4.5],[116.7,7],[119,5],[117.8,1],[116.3,-3.8],[114,-3.5],[110.5,-3]],
  sulawesi: [[120,1],[124.8,1.5],[121,-0.5],[123.3,-1],[121.5,-2.5],[122.5,-5],[120.3,-5.5],[119.5,-3]],
  newguinea: [[131,-0.8],[134.5,-0.8],[138,-1.8],[141,-2.6],[145,-4.5],[147.8,-6.5],[150.5,-10.3],[146.5,-8.5],[143,-9],[141,-9],[138.5,-8.2],[138,-5.5],[134.5,-4],[132.5,-2.8]],
  luzon: [[120.3,18.5],[122.2,18.4],[122,16],[124,13],[121,13.7],[120,16]],
  mindanao: [[122,7],[125.5,9.7],[126.5,7],[125.3,5.8],[123.5,7.6]],
  africa: [[-5.9,35.8],[-2,35.2],[3,36.9],[9.8,37.3],[11,35],[10,33.8],[15,32.3],[20,31],[22,32.8],[25,31.7],[29,30.9],[32.3,31.3],[32.6,29.9],[34,26],[35.7,23.5],[37.2,21],[37.5,18.7],[39.5,15.5],[41.5,13],[43.3,11.5],[44,10.5],[51,11.9],[51.2,10.5],[48,5],[44,1.2],[41.5,-1.8],[39.2,-5],[39.5,-8],[40.5,-11],[40.5,-15],[35.5,-20],[35.3,-24],[32.8,-26],[32,-29],[28,-33],[25.5,-34],[20,-34.8],[18.4,-34],[17.8,-31],[15.2,-27],[14.5,-22.5],[11.8,-17.3],[13.8,-12.5],[12.3,-6],[9,-1],[9.7,2],[9.5,4],[6,4.3],[4.5,6.3],[1,5.9],[-4,5.2],[-7.5,4.4],[-11.5,6.8],[-13.3,9],[-15,11],[-16.7,12.5],[-17.5,14.7],[-16.3,19],[-17,21],[-14.8,25],[-13,27.7],[-9.8,29.7],[-9.6,32],[-6.8,34]],
  madagascar: [[49.3,-12],[50.5,-15.5],[47.8,-24.8],[45,-25.5],[43.3,-22],[44.3,-17],[47,-15]],
  australia: [[113.7,-22],[114,-26],[115,-31.5],[115,-34.2],[118,-35],[123.5,-34],[129,-31.6],[133.5,-32],[135.6,-34.8],[137.5,-33],[138,-35.5],[140.5,-38],[144.5,-38.3],[147,-38.8],[150,-37.3],[151.3,-33.5],[153.5,-28.2],[153,-25.3],[149.5,-22],[146.3,-19],[145.5,-15],[143.5,-14.2],[142.6,-10.8],[141.5,-13],[140.8,-17.5],[139.3,-17.6],[135.5,-15],[136.8,-12.3],[132.5,-11.5],[130,-13],[129.5,-15],[127,-14],[124.5,-16.4],[122.2,-18],[119,-20],[116,-21]],
  tasmania: [[144.7,-40.8],[148.3,-40.9],[148,-43.3],[146,-43.6]],
  nznorth: [[172.7,-34.5],[175.5,-36.8],[178.5,-37.8],[177,-39.5],[175,-41.6],[174.8,-39.5],[173.8,-39.3],[174.6,-37]],
  nzsouth: [[172.7,-40.6],[174.3,-41.8],[172.7,-43.8],[170.6,-45.9],[168.5,-46.6],[166.5,-45.8],[168.5,-44],[171.3,-41.8]],
  antarctica: [[-180,-78],[-150,-76],[-130,-74],[-100,-73],[-75,-73],[-64,-65],[-58,-64],[-60,-70],[-45,-78],[-25,-75],[-10,-71],[10,-70],[35,-69],[55,-66.5],[80,-67],[100,-66],[125,-66.5],[145,-67],[165,-71],[170,-78],[180,-78],[180,-89],[-180,-89]],
};
const CASPIAN = [[47,45.5],[51,47],[53,45],[51,43],[54,40.5],[53.5,37],[50,37.3],[49,40],[47.5,43]];
const dens = (poly, step = 4) => { const o = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 0; k < n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } return o; };
const LANDD = Object.values(LAND).map((p) => dens(p)), CASPD = dens(CASPIAN);
const RAD = Math.PI / 180;
// the wall map: Hammer's oval projection (the whole world in one ellipse)
const hammer = (lon, lat) => { const l = lon * RAD / 2, p = lat * RAD, d = Math.sqrt(1 + Math.cos(p) * Math.cos(l)); return [2 * Math.SQRT2 * Math.cos(p) * Math.sin(l) / d, -Math.SQRT2 * Math.sin(p) / d]; };
function worldMap(cx, cy, rx, ry) {
  const sx = rx / (2 * Math.SQRT2), sy = ry / Math.SQRT2, pt = (a, b) => { const [x, y] = hammer(a, b); return F(cx + x * sx) + ' ' + F(cy + y * sy); };
  const P = (poly) => 'M' + poly.map(([a, b]) => pt(a, b)).join('L') + 'Z';
  let grat = ''; for (let lon = -150; lon <= 150; lon += 30) { let d = ''; for (let lat = -90; lat <= 90; lat += 6) d += (d ? 'L' : 'M') + pt(lon, lat); grat += d; } for (let lat = -60; lat <= 60; lat += 30) { let d = ''; for (let lon = -180; lon <= 180; lon += 8) d += (d ? 'L' : 'M') + pt(lon, lat); grat += d; }
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#BCD2CB" stroke="#5A4526" stroke-width="1.4"/><path d="${grat}" fill="none" stroke="#5A4526" stroke-width=".5" opacity=".35"/><path d="${LANDD.map(P).join('')}" fill="#B9A66C" stroke="#5A4526" stroke-width=".7" stroke-linejoin="round"/><path d="${P(CASPD)}" fill="#BCD2CB" stroke="#5A4526" stroke-width=".5"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#5A4526" stroke-width="1.4"/>`;
}
// the globe: an orthographic view, centred on lon0 (0 = Greenwich), tilted a little towards the north; points on the far side are pushed to the rim
function globeGeo(lon0, R, lat0 = 18) {
  const sp = Math.sin(lat0 * RAD), cp = Math.cos(lat0 * RAD);
  const proj = ([lon, lat]) => { const l = (lon - lon0) * RAD, p = lat * RAD, cl = Math.cos(l), x = Math.cos(p) * Math.sin(l), y = cp * Math.sin(p) - sp * Math.cos(p) * cl, z = sp * Math.sin(p) + cp * Math.cos(p) * cl; if (z < 0) { const m = Math.hypot(x, y) || 1e-6; return [x / m * R, -y / m * R, 0]; } return [x * R, -y * R, 1]; };
  let land = ''; for (const poly of LANDD) { const q = poly.map(proj); if (!q.some((v) => v[2])) continue; land += 'M' + q.map((v) => F(v[0]) + ' ' + F(v[1])).join('L') + 'Z'; }
  let grat = ''; const seg = (pts) => { let on = false; for (const v of pts.map(proj)) { if (v[2]) { grat += (on ? 'L' : 'M') + F(v[0]) + ' ' + F(v[1]); on = true; } else on = false; } };
  for (let lon = -180; lon < 180; lon += 30) { const a = []; for (let lat = -84; lat <= 84; lat += 6) a.push([lon, lat]); seg(a); }
  for (let lat = -60; lat <= 60; lat += 30) { const a = []; for (let lon = -180; lon <= 180; lon += 6) a.push([lon, lat]); seg(a); }
  let prime = ''; { let on = false; for (let lat = -84; lat <= 84; lat += 6) { const v = proj([0, lat]); if (v[2]) { prime += (on ? 'L' : 'M') + F(v[0]) + ' ' + F(v[1]); on = true; } else on = false; } }
  return { land, grat, prime };
}
const cover = (x, yb, w, h, col, glyph) => `<g><rect x="${x}" y="${yb - h}" width="${w}" height="${h}" rx="2" fill="${col}" stroke="${INK}" stroke-width="1.4"/><rect x="${x + 4}" y="${yb - h + 4}" width="${w - 8}" height="${h - 8}" fill="none" stroke="${BRASS}" stroke-width="1.2"/><g transform="translate(${x + w / 2} ${yb - h / 2})">${glyph}</g><rect x="${x}" y="${yb - h}" width="${w}" height="${h}" rx="2" fill="url(#sp)" opacity=".7"/></g>`;
const PAW = `<g fill="${BRASS}"><circle cx="0" cy="5" r="7"/><circle cx="-9" cy="-4" r="3.4"/><circle cx="-3.4" cy="-9" r="3.4"/><circle cx="3.4" cy="-9" r="3.4"/><circle cx="9" cy="-4" r="3.4"/></g>`;
const LEAF = `<g fill="${BRASS}" stroke="${BRASS}"><path d="M0 13V-12" stroke-width="1.6" fill="none"/><path d="M0 -12q-7 -1 -7 -9q8 0 7 9zM0 -4q-9 1 -11 -7q9 -2 11 7zM0 -4q9 1 11 -7q-9 -2 -11 7zM0 5q-9 2 -12 -5q9 -3 12 5zM0 5q9 2 12 -5q-9 -3 -12 5z" stroke="none"/></g>`;
// an owl on a branch, in gold, its eyes, beak and feather lines in the colour of the cover
const OWL = (c) => `<g><path d="M-18 21H18" stroke="${BRASS}" stroke-width="2.6" stroke-linecap="round"/><path d="M12 21q5 -7 9 -3q-3 5 -9 3z" fill="${BRASS}"/>
  <path d="M-10 -14L-14 -24L-4 -18ZM10 -14L14 -24L4 -18Z" fill="${BRASS}"/><path d="M0 -19C-12 -19 -15 -8 -14 3C-13 13 -7 19 0 19C7 19 13 13 14 3C15 -8 12 -19 0 -19Z" fill="${BRASS}"/>
  <circle cx="-5.6" cy="-8" r="5.4" fill="${c}"/><circle cx="5.6" cy="-8" r="5.4" fill="${c}"/><circle cx="-5.6" cy="-8" r="2.5" fill="${BRASS}"/><circle cx="5.6" cy="-8" r="2.5" fill="${BRASS}"/><circle cx="-5.6" cy="-8" r="1" fill="${c}"/><circle cx="5.6" cy="-8" r="1" fill="${c}"/>
  <path d="M0 -5.5L-2.4 -1.4L0 2L2.4 -1.4Z" fill="${c}"/><path d="M-6 6l2 2.6 2 -2.6 2 2.6 2 -2.6 2 2.6 2 -2.6M-4 11.5l2 2.6 2 -2.6 2 2.6 2 -2.6" fill="none" stroke="${c}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M-13.5 -1C-11 7 -10 11 -6.5 16M13.5 -1C11 7 10 11 6.5 16" fill="none" stroke="${c}" stroke-width="1.2" stroke-linecap="round"/><path d="M-5 19v3M-2 19v3M2 19v3M5 19v3" stroke="${BRASS}" stroke-width="1.6" stroke-linecap="round"/></g>`;
// a panda's face over two bamboo leaves
const PANDA = `<g><path d="M-16 23q8 -7 16 -2q8 -5 16 2" fill="none" stroke="${BRASS}" stroke-width="1.6" stroke-linecap="round"/><path d="M-9 19q-8 -1 -9 5q7 1 9 -5zM9 19q8 -1 9 5q-7 1 -9 -5z" fill="${BRASS}"/>
  <circle cx="-11.5" cy="-13" r="6" fill="#1E1614" stroke="${INK}" stroke-width="1"/><circle cx="11.5" cy="-13" r="6" fill="#1E1614" stroke="${INK}" stroke-width="1"/>
  <path d="M0 -17C-11 -17 -16.5 -9 -16.5 -1C-16.5 8 -9 13 0 13C9 13 16.5 8 16.5 -1C16.5 -9 11 -17 0 -17Z" fill="#FBF3E6" stroke="${INK}" stroke-width="1.2"/>
  <ellipse cx="-6.6" cy="-3" rx="4.4" ry="5.6" fill="#1E1614" transform="rotate(24 -6.6 -3)"/><ellipse cx="6.6" cy="-3" rx="4.4" ry="5.6" fill="#1E1614" transform="rotate(-24 6.6 -3)"/><circle cx="-6" cy="-3.4" r="1.5" fill="#fff"/><circle cx="6" cy="-3.4" r="1.5" fill="#fff"/>
  <ellipse cx="0" cy="3.6" rx="2.8" ry="1.9" fill="#1E1614"/><path d="M0 5.5v2M0 7.5q-2.6 2.4 -5 .6M0 7.5q2.6 2.4 5 .6" fill="none" stroke="#1E1614" stroke-width="1.1" stroke-linecap="round"/></g>`;

/* ---------- geometry ---------- */
const BAYS = [{ id: 'cards', name: 'CARDS', x0: 56, x1: 404 }, { id: 'action', name: 'ACTION CARDS', x0: 440, x1: 760 }, { id: 'tiles', name: 'BONUS TILES', x0: 920, x1: 1224 }, { id: 'maps', name: 'MAPS', x0: 1260, x1: 1544 }];
const LIVE = { cards: '/library/cards', action: '/library/actions', tiles: '/library/tiles', maps: '/library/maps' };          // the bays that open a page (a bay missing here is "coming soon")
const DOOR = { x0: 796, x1: 884 };
const SH = [250, 358, 466, 574, 682, 790];
const arch = (x0, x1, pad = 0) => `M${x0 - pad} 790V150Q${x0 - pad} ${100 - pad} ${(x0 + x1) / 2} ${84 - pad}Q${x1 + pad} ${100 - pad} ${x1 + pad} 150V790Z`;

/* ---------- bay contents (sit back: they move less than the frame) ---------- */
function bayBack(x0, x1) { return `<rect x="${x0 - 30}" y="50" width="${x1 - x0 + 60}" height="760" fill="url(#back)"/>`; }
function cards() {
  const [a, b] = [56, 404];
  return bayBack(a, b)
    + row(a - 10, b + 10, SH[0], 86, 11, [[290, 354]], ['MAMMALIA']) + shelfInstruments() + row(a - 10, b + 10, SH[1], 92, 12, [[318, 392]], ['AVES', 'CARNIVORA'])
    + row(a - 10, b + 10, SH[2], 92, 13, [[300, 372]], ['REPTILIA']) + row(a - 10, b + 10, SH[3], 92, 14, [[74, 152]], ['PRIMATES'])
    + row(a - 10, b + 10, SH[4], 92, 15, [[236, 304]], ['PISCES', 'URSIDAE']) + row(a - 10, b + 10, SH[5], 92, 16, [], ['AMPHIBIA', 'FELIDAE'])
    + fern(355, SH[1], 1.05, 3) + cover(80, SH[3], 62, 84, '#2F5248', PAW) + cover(305, SH[2], 62, 86, '#3F6B4A', PANDA) + terrarium(270, SH[4]);
}
// the five action cards as box files; their labels carry soft versions of the action icons: an elephant (Animals), a person (Association), a shovel (Build), three cards (Cards), an @ (Sponsors)
// Worn bookcloth binders: actual action artwork, aged labels and recessed rings.

const binderIcons=["/icons/r3c7.webp", "/icons/r3c8.webp", "/icons/r3c9.webp", "/icons/r3c10.webp", "/icons/r3c12.webp"];
function drawBinders(){let result='';for(let i=0;i<5;i++){
const x=523+i*36,y=SH[5]-88,c=['#167b9d','#197aab','#176b99','#9c3064','#227b9b'][i];
let wear='';const rand=rng(412+i);for(let j=0;j<95;j++){const xx=2+rand()*32,yy=2+rand()*83;wear+=`<path d="M${F(xx)} ${F(yy)}l${F(.3+rand()*1.4)} ${F(rand()*.4)}" stroke="${j%2?'#e4c99b':'#190c08'}" opacity="${(.04+rand()*.12).toFixed(2)}" stroke-width=".25"/>`;}
const label='#e2cfa4';
result+=`<g transform="translate(${x} ${y})"><rect x="1" y="2" width="36" height="87" rx="2" fill="#100806" opacity=".65"/><path d="M2 0Q18 -1 34 1L36 86Q18 89 0 87V3Z" fill="${c}" stroke="#28160f" stroke-width="1.2"/><path d="M3 3V84M33 3V84" stroke="#ceb78c" stroke-width=".5" opacity=".28"/><rect x="0" y="1" width="36" height="86" fill="url(#sp)"/>${wear}`;
result+=`<path d="M4 14L31 13.5L32 43L4.5 44Z" fill="${label}" stroke="#38251a" stroke-width="1.3"/><path d="M5 15L30 15M6 42L30 42" stroke="#fff0cb" opacity=".4" stroke-width=".6"/>`;
// Actual in-game action artwork: preserve the elephant and other silhouettes exactly.
result+=`<image href="${binderIcons[i]}" x="7" y="16" width="22" height="25" style="mix-blend-mode:multiply;filter:sepia(.8)"/>`;
result+=`<circle cx="18" cy="68" r="5.5" fill="#1c110d" stroke="#aa8551" stroke-width="1.4"/><path d="M14 65a5 5 0 0 1 8 0" fill="none" stroke="#e0c38a" stroke-width=".6"/><path d="M3 85q14 1 29 -1" stroke="#d4b484" stroke-width=".7" opacity=".35"/></g>`;
}return result;}
const BINDER_NEIGHBOURS=['#74713d','#b18a3f','#d8c59d','#426348','#87674a','#9a9a65'];
// Pack the two binder-side groups edge to edge, without leaning-book gaps.
function binderSideBooks(x0,x1,seed){const r=rng(seed),n=Math.ceil((x1-x0)/14),w=(x1-x0)/n;let books='';for(let i=0;i<n;i++)books+=book(x0+i*w,SH[5],w,66+r()*21,BINDER_NEIGHBOURS[(i+seed)%BINDER_NEIGHBOURS.length],r);return books;}

// The gramophone on the shelf: an oak horn, a turned-column case, a record that winds up and runs down, and a tone arm that drops onto the record
// (sound on) or swings up (mute). Only the drawing is here; its controls (the brass sound button, the volume lever, the tone arm's click area) are
// native elements in index.html at the same 1600 x 900 scene coordinates, and the code at the bottom of this file moves the arm and the record.
function compactRadio() {
  return `<g id="shelf-radio" transform="translate(1392 0)" pointer-events="none"><defs>
  <linearGradient id="grBrass" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f3d58a"></stop><stop offset=".45" stop-color="#c99a45"></stop><stop offset="1" stop-color="#7a5520"></stop></linearGradient>
  <linearGradient id="grWal" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8a4626"></stop><stop offset="1" stop-color="#5a2a16"></stop></linearGradient>
  <linearGradient id="grWalD" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6e3519"></stop><stop offset="1" stop-color="#3f1c0e"></stop></linearGradient>
  <linearGradient id="grTop" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5a2a16"></stop><stop offset="1" stop-color="#8a4626"></stop></linearGradient>
  <linearGradient id="grOak" x1="0" x2="0" y1="-1" y2="1" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#c98a4e"></stop><stop offset=".5" stop-color="#9a5a2c"></stop><stop offset="1" stop-color="#5a2e14"></stop></linearGradient>
  <radialGradient id="grMouth" cx=".35" cy=".5" r=".7"><stop offset="0" stop-color="#1e0e06"></stop><stop offset=".75" stop-color="#4a2410"></stop><stop offset="1" stop-color="#8a5028"></stop></radialGradient>
</defs>
  <path d="M104 636C105 629 107 625 112 622" fill="none" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"></path>
  <path d="M104 636C105 629 107 625 112 622" fill="none" stroke="url(#grBrass)" stroke-width="2.6" stroke-linecap="round"></path>
  <g transform="translate(111 623) rotate(-42)">
    <path d="M0 -2.1C11 -2.7 20 -5.6 31 -14L31 14C20 5.6 11 2.7 0 2.1Z" fill="url(#grOak)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"></path>
    <path d="M2 -2.0C10 -2.6 18 -5.8 31 -11.8" fill="none" stroke="#5a2e14" stroke-width=".5" opacity=".9"></path><path d="M2 -1.0C10 -1.3 18 -2.9 31 -5.9" fill="none" stroke="#5a2e14" stroke-width=".5" opacity=".9"></path><path d="M2 0.0C10 0.0 18 0.0 31 0.0" fill="none" stroke="#5a2e14" stroke-width=".5" opacity=".9"></path><path d="M2 1.0C10 1.3 18 2.9 31 5.9" fill="none" stroke="#5a2e14" stroke-width=".5" opacity=".9"></path><path d="M2 2.0C10 2.6 18 5.8 31 11.8" fill="none" stroke="#5a2e14" stroke-width=".5" opacity=".9"></path>
    <ellipse cx="31" cy="0" rx="4.6" ry="14" fill="url(#grMouth)" stroke="${INK}" stroke-width="1"></ellipse>
    <ellipse cx="31.3" cy="0" rx="3.9" ry="13.1" fill="none" stroke="#e0b765" stroke-width=".8"></ellipse>
  </g>
  <path d="M4 648H120L113 633H11Z" fill="url(#grTop)" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"></path>
  <rect x="2" y="647" width="120" height="5.5" rx="1.2" fill="#7a3f22" stroke="${INK}" stroke-width="1.1"></rect>
  <rect x="8" y="652.5" width="108" height="21.5" fill="url(#grWal)" stroke="${INK}" stroke-width="1.3"></rect>
  <rect x="17" y="655" width="98" height="16.5" rx="1.5" fill="none" stroke="#c1854b" stroke-width=".6"></rect>
  <g fill="url(#grWalD)" stroke="${INK}" stroke-width=".9"><rect x="3" y="652.5" width="7" height="21.5" rx="3.5"></rect><rect x="114" y="652.5" width="7" height="21.5" rx="3.5"></rect></g>
  <path d="M3 656h7M3 670.5h7M114 656h7M114 670.5h7" stroke="#d9ab52" stroke-width="1"></path>
  <rect x="1" y="674" width="122" height="3.6" rx="1.2" fill="#4a2214" stroke="${INK}" stroke-width="1"></rect>
  <path d="M4 677.6h8v2.4h-8zM112 677.6h8v2.4h-8z" fill="${INK}"></path>
  <ellipse cx="54" cy="641.2" rx="40" ry="6.80" fill="#3d1f12" stroke="${INK}" stroke-width=".8"></ellipse>
  <g transform="translate(54 640) scale(0.952 0.138)"><g id="gram-disc">
    <circle r="39" fill="#171310" stroke="#0c0907" stroke-width="2"></circle>
    <circle r="32" fill="none" stroke="#2c2621" stroke-width="1.6"></circle>
    <circle r="25" fill="none" stroke="#2c2621" stroke-width="1.6"></circle>
    <path d="M-36 -5A37 37 0 0 1 -14 -34" fill="none" stroke="#6a5d52" stroke-width="3.5" stroke-linecap="round"></path>
    <circle r="12" fill="#8f2f20"></circle><rect x="-2" y="-11" width="4" height="6" fill="#dfc99b"></rect><circle r="2.2" fill="#dfc99b"></circle>
  </g></g>
  <rect x="100.5" y="633.5" width="7" height="7" rx="1.5" fill="url(#grBrass)" stroke="${INK}" stroke-width=".8"></rect>
  <g id="gram-arm">
    <path d="M104 636Q88.0 632 73 634.5" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"></path>
    <path d="M104 636Q88.0 632 73 634.5" fill="none" stroke="url(#grBrass)" stroke-width="1.6" stroke-linecap="round"></path>
    <ellipse cx="72" cy="635" rx="2.6" ry="4.4" fill="url(#grBrass)" stroke="${INK}" stroke-width=".8"></ellipse><path d="M72 639.4v2" stroke="${INK}" stroke-width=".9"></path>
  </g>
  <circle cx="104" cy="636" r="1.8" fill="#f3d58a" stroke="${INK}" stroke-width=".6"></circle>
  <path d="M28.5 664.5v1.6M41.8 664.5v1.6M55.0 664.5v2.1M68.2 664.5v1.6M81.5 664.5v1.6" stroke="#c9a35a" stroke-width=".6" opacity=".8"></path>
</g>`;
}
// The way back to the park: big-cat paw tracks at the bottom left that walk slowly out of the library on their own (one print after the other
// toward the left edge, then they fade back; css/library.css). They are the link: hover or focus makes them glow and shows "← Back to Park Nova" in
// gilt letters (no tooltip: the label is the hint), a click goes there (the click handler at the bottom of this file fades the sound out first).
// The hover never touches the prints' walk (css/library.css): only their colour and the glow of the group around them change.
function parkReturn() {
  const PAW = '<ellipse cx="0" cy="2" rx="4.2" ry="3.4"/><circle cx="-4.4" cy="-3.2" r="1.6"/><circle cx="-1.5" cy="-5.4" r="1.6"/><circle cx="1.8" cy="-5.4" r="1.6"/><circle cx="4.6" cy="-3.2" r="1.6"/>';
  const paws = Array.from({length:8},(_,k)=>`<g class="exit-paw" style="--k:${k}" transform="translate(${26+k*22} ${860+(k%2)*11}) rotate(-90) scale(1.15)">${PAW}</g>`).join('');
  return `<defs><linearGradient id="gilt" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FFF3CC"/><stop offset=".5" stop-color="#F6D486"/><stop offset="1" stop-color="#DDAE55"/></linearGradient></defs>
  <a id="hall-return" href="/" aria-label="Back to Park Nova" tabindex="0">
    <rect x="0" y="808" width="210" height="80" fill="transparent"/><g class="exit-paws">${paws}</g>
    <g class="exit-label" aria-hidden="true"><text x="106" y="836.5" text-anchor="middle" font-family="Fraunces,Georgia,serif" font-size="15" font-weight="700" letter-spacing="1" fill="url(#gilt)" stroke="#1a0806" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke"><tspan font-size="1.3em">←</tspan> Back to Park Nova</text></g>
  </a>`;
}

// The miniature telescope occupies the top shelf of the Cards bookcase.
function shelfInstruments() {
  return `<g id="shelf-instruments"><g transform="translate(322 250)"><path d="M-4 0L4 -30M12 0L4 -30M4 0V-30" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M-4 0L4 -30M12 0L4 -30M4 0V-30" stroke="#8A4632" stroke-width="1.8" stroke-linecap="round"/><g transform="translate(4 -32) rotate(-24)"><rect x="-22" y="-4.5" width="26" height="9" rx="2" fill="${BRASS}" stroke="${INK}" stroke-width="1.3"/><rect x="2" y="-3.4" width="18" height="6.8" rx="1.5" fill="#F0CE7A" stroke="${INK}" stroke-width="1.3"/><rect x="-25" y="-5.6" width="5" height="11.2" rx="1.5" fill="#B8862E" stroke="${INK}" stroke-width="1.3"/><rect x="18" y="-2.6" width="5" height="5.2" rx="1" fill="#B8862E" stroke="${INK}" stroke-width="1.3"/></g></g></g>`;
}

// Approved storybook B: warm illustrated gold trophy, reduced to 80% scale.
function emuCupTrophy() {
  return `<g id="emu-cup-trophy" role="img" aria-label="Emu Cup: a crowned golden emu trophy on a dark pedestal"><image href="/assets/library-emu-cup-storybook.webp?v=20261116a" x="486.8" y="149.2" width="78.4" height="100.8" preserveAspectRatio="xMidYMax meet"/></g>`;
}

function action() {
  const [a, b] = [440, 760];
  const fold = '<g id="binder-set">' + drawBinders() + '</g>';
  return bayBack(a, b)
    + row(a - 10, b + 10, SH[0], 86, 21, [[481, 572]], ['LOXODONTA']) + emuCupTrophy() + row(a - 10, b + 10, SH[1], 92, 22, [[690, 770]], ['CAPRA', 'DROMAIUS'])
    + row(a - 10, b + 10, SH[2], 92, 23, [[452, 520]], ['PANTHERA']) + row(a - 10, b + 10, SH[3], 92, 24, [[600, 640]], ['AILUROPODA', 'ELEPHAS'])
    + row(a - 10, b + 10, SH[4], 92, 25, [], ['STRIGIDAE'])
    + binderSideBooks(a - 10, 523, 26) + fold + binderSideBooks(703, b + 10, 27)
    + ivy(726, SH[0] + 14, 6, 5) + pot(726, SH[1], 24, 16, '#C9A26A') + ivy(716, SH[1] - 20, 5, 9, 'sway')
    + cover(458, SH[2], 56, 84, '#6B2A36', OWL('#6B2A36')) + succ(620, SH[3]);
}
// the bonus tiles: a low cabinet of small drawers and a glass case of tiles on the mantel, over an open fire
function tiles() {
  const [a, b] = [920, 1224]; const r = rng(77), TC = ['#D9A441', '#5E9A63', '#4E9CC4', '#B9B4AE', '#C96B4A', '#E6D2A2'];
  let d = `<rect x="936" y="150" width="272" height="176" fill="#4A2018" stroke="${INK}" stroke-width="2"/>`;
  const cw = 272 / 8, ch = 176 / 4;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { const x = 936 + i * cw + 3, y = 150 + j * ch + 3, open = r() < .16; d += `<rect x="${F(x)}" y="${F(y)}" width="${F(cw - 6)}" height="${F(ch - 6)}" rx="2" fill="${open ? '#2A1210' : 'url(#drw)'}" stroke="${INK}" stroke-width="1"/>` + (open ? `<rect x="${F(x + 4)}" y="${F(y + ch * .38)}" width="${F(cw - 14)}" height="${F(ch * .42)}" rx="1.5" fill="${TC[Math.floor(r() * TC.length)]}" stroke="${INK}" stroke-width="1"/><rect x="${F(x - 1)}" y="${F(y + ch - 13)}" width="${F(cw - 4)}" height="8" rx="2" fill="url(#drw)" stroke="${INK}" stroke-width="1"/>` : `<circle cx="${F(x + (cw - 6) / 2)}" cy="${F(y + (ch - 6) / 2)}" r="2.3" fill="${BRASS}" stroke="${INK}" stroke-width=".6"/><rect x="${F(x + 6)}" y="${F(y + 5)}" width="${F(cw - 18)}" height="6" rx="1" fill="#E9D7AE" opacity=".55"/>`); }
  let lay = ''; for (let i = 0; i < 10; i++) lay += `<rect x="${996 + i * 16}" y="${342 + (i % 2) * 2}" width="12" height="11" rx="1.5" fill="${TC[(i * 5 + 2) % TC.length]}" stroke="${INK}" stroke-width="1" transform="rotate(${(i * 37) % 9 - 4} ${1002 + i * 16} 348)"/>`;
  // the stones of the surround, in courses
  let st = ''; const sr = rng(9);
  for (let j = 0; j < 9; j++) { const y = 384 + j * 45.2; let x = 930 - (j % 2) * 30; while (x < 1214) { const w = 52 + sr() * 26, x0 = Math.max(930, x), x1 = Math.min(1214, x + w); if (x1 - x0 > 6) st += `<rect x="${F(x0)}" y="${F(y)}" width="${F(x1 - x0)}" height="45.2" rx="3" fill="${['#6E6266', '#665A5E', '#766A6C', '#5F5458'][Math.floor(sr() * 4)]}" stroke="#3A2E30" stroke-width="1.6"/>`; x += w; } }
  let sparks = ''; for (let i = 0; i < 9; i++) sparks += `<circle class="spark" cx="${1040 + (i * 23) % 70}" cy="${700 - (i % 3) * 14}" r="${1.4 + (i % 3) * .5}" fill="#FFD27A" style="--d:${1.6 + (i * .37) % 1.6}s;--l:${-(i * .53) % 3}s;--x:${(i % 2 ? 1 : -1) * (6 + i * 3)}px"/>`;
  return bayBack(a, b) + d + ivy(960, 96, 3, 12) + ivy(1180, 92, 4, 14)
    + `<rect x="984" y="334" width="176" height="26" fill="#CFE6E2" opacity=".2" stroke="${BRASS}" stroke-width="2"/>${lay}<path d="M994 338l18 18M1110 337l20 20" stroke="#fff" stroke-width="2" opacity=".28"/>`
    + `<g><path d="M-9 0h18l-3 -5h-12z" transform="translate(954 360)" fill="${BRASS}" stroke="${INK}" stroke-width="1.2"/><rect x="950.5" y="322" width="7" height="33" rx="2" fill="url(#wax)" stroke="${INK}" stroke-width="1.1"/><g transform="translate(954 322)"><path class="flame" d="M0 -1q-6 -8 0 -19q6 11 0 19z" fill="#FFD27A"/></g>
        <path d="M-9 0h18l-3 -5h-12z" transform="translate(1190 360)" fill="${BRASS}" stroke="${INK}" stroke-width="1.2"/><rect x="1186.5" y="328" width="7" height="27" rx="2" fill="url(#wax)" stroke="${INK}" stroke-width="1.1"/><g transform="translate(1190 328)"><path class="flame" style="--fd:.8s" d="M0 -1q-6 -8 0 -19q6 11 0 19z" fill="#FFD27A"/></g></g>`
    + `<rect x="930" y="384" width="284" height="406" fill="#5F5458"/>${st}
       <path d="M966 790V566Q966 470 1072 460Q1178 470 1178 566V790Z" fill="#3A2E30"/><path d="M976 790V568Q976 480 1072 471Q1168 480 1168 568V790Z" fill="#1A0B09"/>
       <path d="M976 640H1168M976 700H1168M1010 600V640M1072 640V700M1134 600V640M1040 700V760M1104 700V760" stroke="#2E1512" stroke-width="2" opacity=".8"/>
       <ellipse class="glow" cx="1072" cy="760" rx="120" ry="70" fill="url(#gf)" style="--gd:.5s"/>
       <g clip-path="url(#cfire)"><image id="fire" x="962" y="476" width="220" height="318" preserveAspectRatio="none"/></g>${sparks}
       <g stroke="${INK}" stroke-width="2"><rect x="1000" y="762" width="150" height="20" rx="10" fill="#5A3420" transform="rotate(-5 1075 772)"/><rect x="996" y="766" width="150" height="20" rx="10" fill="#6A3E26" transform="rotate(6 1071 776)"/></g><path d="M1006 770l136 -10M1002 780l138 12" stroke="#FF9A3A" stroke-width="3" stroke-linecap="round" stroke-dasharray="10 14 22 9 6 16" class="glow" style="--gd:.5s;mix-blend-mode:screen"/><ellipse cx="1072" cy="786" rx="80" ry="8" fill="#FF8A3A" opacity=".6" class="glow" style="--gd:.7s"/>
       <path d="M986 790V744M1014 790V752M1042 790V756M1072 790V758M1102 790V756M1130 790V752M1158 790V744M980 772H1164" stroke="#17100F" stroke-width="5" stroke-linecap="round"/>
       <g transform="translate(1072 424)"><circle r="21" fill="#7E7276" stroke="#3A2E30" stroke-width="2"/><g transform="scale(.9)"><g fill="#3A2E30"><circle cx="0" cy="5" r="7"/><circle cx="-9" cy="-4" r="3.4"/><circle cx="-3.4" cy="-9" r="3.4"/><circle cx="3.4" cy="-9" r="3.4"/><circle cx="9" cy="-4" r="3.4"/></g></g></g>`
    + `<rect x="920" y="362" width="304" height="16" rx="3" fill="url(#brd)" stroke="${INK}" stroke-width="1.8"/><rect x="928" y="378" width="288" height="8" fill="#4A2018" stroke="${INK}" stroke-width="1.2"/>`;
}
// Coordinated heritage-leather atlases; each spine shares the same title region.
const ATLAS = [['AMERICAS', 'Americas', '#8e4a25'], ['EUROPE', 'Europe', '#28566e'], ['AFRICA', 'Africa', '#76601e'], ['ASIA', 'Asia', '#3e5b3e'], ['AUSTRALIA', 'Australia', '#71253a']];
function atlasSet() {
  let x = 1269;
  let s = `<defs><filter id="atlas-foil" color-interpolation-filters="sRGB"><feFlood flood-color="#e8c47c"/><feComposite in2="SourceAlpha" operator="in"/></filter><linearGradient id="atlas-spine"><stop stop-color="#fff5d6" stop-opacity=".13"/><stop offset=".24" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity=".02"/><stop offset="1" stop-color="#130907" stop-opacity=".32"/></linearGradient></defs>`;
  ATLAS.forEach(([name, asset, c], i) => {
    const w = i === 4 ? 62 : 51, h = 126, y = SH[2] - h, cx = x + w / 2, r = rng(870 + i);
    s += `<g class="atlas-volume" data-name="${name}"><path d="M${x+.8} ${y+2}Q${cx} ${y} ${x+w-.4} ${y+1.5}V465Q${cx} 467 ${x+.4} 465Z" fill="${c}" stroke="#321b13" stroke-width=".8"/>`;
    s += `<path d="M${x+4} ${y+5}V461M${x+w-4} ${y+5}V461" stroke="#e4bf79" stroke-width=".55" opacity=".58"/><path d="M${x+5} ${y+8}H${x+w-5}M${x+5} 456H${x+w-5}M${x+5} 459H${x+w-5}" stroke="#e5bb70" stroke-width="1"/><path d="M${x+3} ${y+3}V${y+16}M${x+3} 449V462M${x+w-3} ${y+5}V${y+12}" stroke="#edcf9b" opacity=".44" stroke-width=".8"/>`;
    s += `<image class="atlas-emblem" href="/continents/${asset}.png" x="${cx-16}" y="${y+14}" width="32" height="30" preserveAspectRatio="xMidYMid meet" filter="url(#atlas-foil)"/>`;
    const ty = (y + 48 + 452) / 2;
    s += `<text class="atlas-name" transform="translate(${cx} ${ty}) rotate(-90)" text-anchor="middle" dominant-baseline="central" font-size="${name.length>=8?9.1:11}" font-weight="700" letter-spacing=".4" fill="#e8c47c" font-family="Fraunces,Georgia,serif">${name}</text>`;
    // A small increase over the mock's wear, kept deterministic and very faint.
    for (let j = 0; j < 63; j++) {
      const xx = x + 2 + r() * (w - 4), yy = y + 2 + r() * (h - 4);
      s += `<path d="M${F(xx)} ${F(yy)}l${F(.5+r()*1.4)} ${F((r()-.5)*.6)}" stroke="${j%2?'#f9dfad':'#25150d'}" stroke-width=".25" opacity=".15"/>`;
    }
    s += `<path d="M${x+.8} ${y+2}H${x+w-.5}V465H${x+.5}Z" fill="url(#atlas-spine)" pointer-events="none"/></g>`;
    x += w;
  });
  return `<g id="atlas-set">${s}</g>`;
}

function maps() {
  const [a, b] = [1260, 1544];
  const atl = atlasSet();
  // a rack of rolled maps under the atlases: two rows of cubbies, the ends of the rolls showing
  let rack = `<rect x="1266" y="486" width="272" height="78" fill="#3A1814" stroke="${INK}" stroke-width="1.8"/>`; const rr = rng(31);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 8; i++) { const cx = 1270 + i * 33.2, cy = 490 + j * 36; rack += `<rect x="${F(cx)}" y="${cy}" width="30.4" height="33" rx="3" fill="#1E0B0B" stroke="${INK}" stroke-width="1"/>`; const n = 1 + Math.floor(rr() * 3); for (let k = 0; k < n; k++) { const px = cx + 8 + k * 7.4 + rr() * 2, py = cy + 23 - (k % 2) * 9 - rr() * 2, R = 5.6 + rr() * 1.6; rack += `<circle cx="${F(px)}" cy="${F(py)}" r="${F(R)}" fill="${rr() < .5 ? '#E3CC98' : '#D6BD86'}" stroke="#5A4526" stroke-width="1"/><circle cx="${F(px)}" cy="${F(py)}" r="${F(R * .5)}" fill="none" stroke="#8A6F44" stroke-width=".8"/><circle cx="${F(px)}" cy="${F(py)}" r="1" fill="#5A4526"/>` + (rr() < .3 ? `<path d="M${F(px - R)} ${F(py)}h${F(R * 2)}" stroke="#C2344D" stroke-width="2"/>` : ''); } }
  rack += `<rect x="1260" y="562" width="284" height="10" fill="url(#brd)" stroke="${INK}" stroke-width="1.4"/><rect x="1260" y="572" width="284" height="22" fill="url(#shade)"/>`;
  let ch = ''; for (let k = 0; k < 3; k++) ch += `<rect x="1276" y="${696 + k * 31}" width="252" height="27" rx="2" fill="url(#drw)" stroke="${INK}" stroke-width="1.2"/><rect x="1380" y="${706 + k * 31}" width="44" height="6" rx="3" fill="${BRASS}" stroke="${INK}" stroke-width=".8"/>`;
  const [ux, uy] = hammer(131, -25.3), G = globeGeo(0, 37);
  return bayBack(a, b)
    + `<g><rect x="1272" y="146" width="260" height="8" rx="4" fill="#6A3424" stroke="${INK}" stroke-width="1.4"/><rect x="1280" y="152" width="244" height="178" fill="#E6D2A0" stroke="${INK}" stroke-width="1.8"/><rect x="1286" y="158" width="232" height="166" fill="none" stroke="#8A6F44" stroke-width="1"/>${worldMap(1402, 234, 110, 63)}
        <circle cx="${F(1402 + ux * 110 / (2 * Math.SQRT2))}" cy="${F(234 + uy * 63 / Math.SQRT2)}" r="2.6" fill="#C2344D" stroke="${INK}" stroke-width=".8"/>
        <g transform="translate(1304 306)"><circle r="11" fill="#E6D2A0" stroke="#5A4526" stroke-width="1"/><path d="M0 -9.5L2.6 0L0 9.5L-2.6 0Z" fill="#8C2F39"/><path d="M-9.5 0L0 -2.6L9.5 0L0 2.6Z" fill="#5A4526"/><text y="-13" text-anchor="middle" font-size="7" font-weight="800" fill="#5A4526" font-family="Fraunces,Georgia,serif">N</text></g>
        <text x="1402" y="316" text-anchor="middle" font-size="8.5" font-weight="600" letter-spacing="3" fill="#5A4526" font-family="Fraunces,Georgia,serif">ORBIS TERRARUM</text><rect x="1280" y="152" width="244" height="178" fill="url(#sp)" opacity=".45"/></g>`
    + atl + rack
    + `<rect x="1266" y="690" width="272" height="100" fill="#4A2018" stroke="${INK}" stroke-width="2"/>${ch}`
    + `<g id="globe" transform="translate(1320 683)" style="cursor:var(--cur-hand)" role="button" tabindex="0" aria-label="Globe: click to spin"><path d="M0 0V-12M-17 0H17" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/><path d="M0 0V-12M-17 0H17" stroke="${BRASS}" stroke-width="2.8" stroke-linecap="round"/>
        <g transform="translate(0 -50)"><clipPath id="gclip"><circle r="37"/></clipPath><circle r="37" fill="#8FB7C4" stroke="${INK}" stroke-width="2"/><g clip-path="url(#gclip)"><path id="ggrat" d="${G.grat}" fill="none" stroke="#2F5A66" stroke-width=".5" opacity=".45"/><path id="gland" d="${G.land}" fill="#9DAA63" stroke="#4A5A2A" stroke-width=".7" stroke-linejoin="round"/><path id="gprime" d="${G.prime}" fill="none" stroke="#C2344D" stroke-width="1.1" opacity=".85"/></g><circle r="37" fill="url(#ball)"/><circle r="37" fill="none" stroke="${INK}" stroke-width="2"/>
        <path d="M-41 -8A42 42 0 0 0 10 40.8" fill="none" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M-41 -8A42 42 0 0 0 10 40.8" fill="none" stroke="${BRASS}" stroke-width="2.4" stroke-linecap="round"/><circle r="40" fill="transparent"/></g></g>`
    + compactRadio() + ivy(1290, 96, 3, 21);
}

/* ---------- frame (front plane) ---------- */
function frame() {
  let s = '', holes = '';
  [...BAYS, DOOR].forEach((b) => { holes += arch(b.x0, b.x1); });
  s += `<path fill-rule="evenodd" d="M14 40H1586V816H14Z${holes}" fill="url(#wood)" stroke="${INK}" stroke-width="2.5"/>`;
  [...BAYS, DOOR].forEach((b) => { s += `<path d="${arch(b.x0, b.x1)}" fill="none" stroke="#2A1210" stroke-width="7" opacity=".55"/><path d="${arch(b.x0, b.x1, 5)}" fill="none" stroke="#B0623E" stroke-width="2" opacity=".7"/><path d="${arch(b.x0, b.x1)}" fill="none" stroke="${INK}" stroke-width="2.2"/>`; });
  // pilasters between the openings: a rounded column look, capital and base
  [[20, 56], [404, 440], [760, 796], [884, 920], [1224, 1260], [1544, 1580]].forEach(([a, b], i) => {
    s += `<rect x="${a + 5}" y="150" width="${b - a - 10}" height="640" fill="url(#col)" stroke="${INK}" stroke-width="1.6"/><rect x="${a + 1}" y="138" width="${b - a - 2}" height="14" rx="3" fill="url(#brd)" stroke="${INK}" stroke-width="1.6"/><rect x="${a + 1}" y="776" width="${b - a - 2}" height="14" rx="3" fill="url(#brd)" stroke="${INK}" stroke-width="1.6"/>`;
    if (i === 1 || i === 4) s += `<g class="hang" style="animation-duration:11s"><path d="M${a + 7} 176H${b - 7}V268L${(a + b) / 2} 284L${a + 7} 268Z" fill="#8C2F39" stroke="${INK}" stroke-width="1.6"/><path d="M${a + 10} 180H${b - 10}V266L${(a + b) / 2} 279L${a + 10} 266Z" fill="none" stroke="${BRASS}" stroke-width="1.2"/><g transform="translate(${(a + b) / 2} 224) scale(.62)" fill="${BRASS}">${i === 1 ? PAW : LEAF}</g><rect x="${a + 4}" y="172" width="${b - a - 8}" height="5" rx="2" fill="${BRASS}" stroke="${INK}" stroke-width="1"/></g>`;
  });
  // cornice, plinth, ladder rail
  s += `<rect x="8" y="30" width="1584" height="22" rx="4" fill="url(#brd)" stroke="${INK}" stroke-width="2.2"/><rect x="14" y="52" width="1572" height="8" fill="#3A1814" stroke="${INK}" stroke-width="1.4"/><rect x="8" y="790" width="1584" height="28" rx="3" fill="url(#brd)" stroke="${INK}" stroke-width="2.2"/><rect x="30" y="66" width="1540" height="5" rx="2.5" fill="${BRASS}" stroke="${INK}" stroke-width="1.2"/>`;
  return s;
}
function shelves() {
  let s = '';
  const rowsOf = { cards: [0, 1, 2, 3, 4], action: [0, 1, 2, 3, 4], maps: [2] };
  BAYS.forEach((b) => { (rowsOf[b.id] || []).forEach((k) => { const y = SH[k]; s += `<rect x="${b.x0}" y="${y}" width="${b.x1 - b.x0}" height="11" fill="url(#brd)" stroke="${INK}" stroke-width="1.4"/><rect x="${b.x0}" y="${y + 11}" width="${b.x1 - b.x0}" height="26" fill="url(#shade)"/>`; }); s += `<path d="${arch(b.x0, b.x1)}" fill="url(#inner)" pointer-events="none"/>`; });
  s += `<rect x="1260" y="682" width="284" height="10" fill="url(#brd)" stroke="${INK}" stroke-width="1.4"/>`;
  return s;
}
// The labels over the bookcases: a brass frame around a near-black plate with gilt letters (light on dark, readable from far), overhanging the
// cornice a little. A bookcase under the pointer, or with the keyboard focus, lights up its label (.plq.hot; the listeners are with the bays below).
function plaques() {
  const defs = `<defs><linearGradient id="plqBrass" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#F6DA8C"/><stop offset=".5" stop-color="#D9AE58"/><stop offset="1" stop-color="#A9782A"/></linearGradient><linearGradient id="plqPlate" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3B1712"/><stop offset="1" stop-color="#1E0B09"/></linearGradient><linearGradient id="plqGilt" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FFF3CC"/><stop offset=".5" stop-color="#F6D486"/><stop offset="1" stop-color="#DDAE55"/></linearGradient></defs>`;
  return defs + BAYS.map((b) => {
    const cx = (b.x0 + b.x1) / 2, w = b.name.length * (19 * .78 + 2.8) + 54, x = cx - w / 2;
    return `<g class="plq${LIVE[b.id] ? '' : ' soon'}" data-bay="${b.id}"><rect x="${x}" y="21" width="${w}" height="37" rx="5" fill="#000" opacity=".4" transform="translate(0 2.5)"/><rect x="${x}" y="21" width="${w}" height="37" rx="5" fill="url(#plqBrass)" stroke="${INK}" stroke-width="1.8"/><rect x="${x + 3.5}" y="24.5" width="${w - 7}" height="30" rx="3" fill="url(#plqPlate)" stroke="#6b4518" stroke-width=".8"/><path d="M${x + 13} 39.5l3.4-3.4l3.4 3.4l-3.4 3.4zM${x + w - 13} 39.5l-3.4-3.4l-3.4 3.4l3.4 3.4z" fill="url(#plqGilt)"/><text x="${cx}" y="46.5" text-anchor="middle" font-size="19" font-weight="800" letter-spacing="2.8" fill="url(#plqGilt)" stroke="#120504" stroke-width="2" paint-order="stroke" font-family="Fraunces,Georgia,serif">${b.name}</text></g>`;
  }).join('');
}
function door() {
  let leaf = `<rect x="0" y="0" width="92" height="716" fill="#33140F" stroke="${INK}" stroke-width="2"/>`;
  for (let k = 0; k < 6; k++) { const yb = 124 + k * 116; leaf += row(5, 87, yb, 84, 90 + k) + `<rect x="0" y="${yb}" width="92" height="9" fill="url(#brd)" stroke="${INK}" stroke-width="1.2"/>`; }
  return `<g id="door"><g clip-path="url(#cdoor)"><rect x="780" y="60" width="120" height="750" fill="#120608"/><g class="lay" data-d="-.7"><circle class="ember" cx="812" cy="470" r="260" fill="url(#gr)"/><circle class="ember" cx="808" cy="640" r="150" fill="url(#gr)" style="animation-duration:8s"/><circle class="ember" cx="806" cy="260" r="120" fill="url(#gr)" style="animation-duration:7s"/>${[0, 1, 2, 3, 4, 5].map((i) => `<circle class="rmote" cx="${804 + (i * 7) % 16}" cy="${700 - i * 86}" r="${1.6 + (i % 3) * .7}" fill="#FF8A8A" style="--md:${7 + i * 1.3}s;--ml:${-i * 1.7}s;--mx:${-10 - i * 9}px"/>`).join('')}</g>
    <g id="leaf"><g transform="translate(816 78) skewY(-3.2)"><g transform="scale(.76 1)">${leaf}<rect width="92" height="716" fill="url(#leafsh)"/></g></g></g>
    <rect x="780" y="60" width="50" height="750" fill="url(#gr2)" class="ember" style="mix-blend-mode:screen"/></g><rect x="796" y="84" width="88" height="706" fill="transparent"/></g>`;
}

/* ---------- floor, props, light ---------- */
function floor() {
  let pl = ''; for (let x = -200; x <= 1800; x += 110) pl += `<path d="M${x} 900L${F(800 + (x - 800) * .82)} 816" stroke="#2A1210" stroke-width="1.4" opacity=".6"/>`;
  return `<rect y="816" width="1600" height="84" fill="url(#flr)"/>${pl}<path d="M0 846H1600" stroke="#2A1210" stroke-width="1" opacity=".35"/>
    <ellipse cx="800" cy="868" rx="470" ry="27" fill="#6E1C2B" stroke="${INK}" stroke-width="2"/><ellipse cx="800" cy="868" rx="446" ry="22" fill="none" stroke="${BRASS}" stroke-width="2" stroke-dasharray="10 7" opacity=".8"/><ellipse cx="800" cy="868" rx="380" ry="16" fill="#8C2F39" opacity=".7"/><ellipse cx="800" cy="868" rx="150" ry="8" fill="none" stroke="${BRASS}" stroke-width="1.6" opacity=".7"/>`;
}
function ladder() {
  let r = ''; for (let k = 0; k < 13; k++) { const t = (k + .7) / 14; r += `<path d="M${F(28 * t)} ${F(856 - 792 * t)}h62" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M${F(28 * t)} ${F(856 - 792 * t)}h62" stroke="#C98B4A" stroke-width="4.5" stroke-linecap="round"/>`; }
  return `<g id="ladder" style="transform:translate(795px,0)"><ellipse cx="50" cy="860" rx="62" ry="7" fill="#000" opacity=".3"/><path d="M0 856L28 64M62 856L90 64" stroke="${INK}" stroke-width="11" stroke-linecap="round"/><path d="M0 856L28 64M62 856L90 64" stroke="url(#rail)" stroke-width="7" stroke-linecap="round"/>${r}<circle cx="28" cy="68" r="7" fill="${BRASS}" stroke="${INK}" stroke-width="1.6"/><circle cx="90" cy="68" r="7" fill="${BRASS}" stroke="${INK}" stroke-width="1.6"/></g>`;
}
function props() {
  return `<rect x="952" y="816" width="240" height="16" rx="3" fill="#6E6266" stroke="#3A2E30" stroke-width="1.8"/>
    <g><ellipse cx="1564" cy="862" rx="40" ry="6" fill="#000" opacity=".3"/><rect x="1530" y="842" width="66" height="16" rx="2" fill="#5A1A28" stroke="${INK}" stroke-width="1.4"/><rect x="1536" y="827" width="58" height="15" rx="2" fill="#2F5248" stroke="${INK}" stroke-width="1.4"/><rect x="1532" y="813" width="56" height="14" rx="2" fill="#C98B3A" stroke="${INK}" stroke-width="1.4"/><path d="M1540 850h20M1546 834h18" stroke="${BRASS}" stroke-width="2"/></g>`;
}
// the lights: nothing floats. A brass lantern hangs on a chain in the arch of each bay, and candles stand in brass sconces on four of the pillars.
const LANTERNS = [230, 600, 1072, 1402], SCONCES = [[422, 430], [778, 400], [902, 400], [1242, 430]];
const FLAMES = [...LANTERNS.map((x) => [x, 120]), ...SCONCES.map(([x, y]) => [x, y - 44]), [954, 312], [1190, 318]];
function fixtures() {
  const flame = (i) => `<path class="flame" style="--fd:${F(.7 + (i * .13) % .5)}s" d="M0 0q-5.5 -8 0 -18q5.5 10 0 18z" fill="#FFD27A"/>`;
  return LANTERNS.map((x, i) => `<g><path d="M${x} 86V104" stroke="${INK}" stroke-width="3"/><path d="M${x} 86V104" stroke="${BRASS}" stroke-width="1.4" stroke-dasharray="3 2"/><path d="M${x - 9} 108L${x} 101L${x + 9} 108Z" fill="${BRASS}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/><rect x="${x - 8}" y="108" width="16" height="24" rx="2" fill="#FFE9A8" opacity=".35" stroke="${BRASS}" stroke-width="2"/><rect x="${x - 2.5}" y="121" width="5" height="10" fill="url(#wax)" stroke="${INK}" stroke-width=".8"/><g transform="translate(${x} 121) scale(.8)">${flame(i)}</g><rect x="${x - 10}" y="131" width="20" height="4" rx="2" fill="${BRASS}" stroke="${INK}" stroke-width="1.2"/></g>`).join('')
    + SCONCES.map(([x, y], i) => `<g><ellipse cx="${x}" cy="${y}" rx="7" ry="9" fill="${BRASS}" stroke="${INK}" stroke-width="1.4"/><path d="M${x} ${y}q0 12 0 0" stroke="${INK}"/><path d="M${x} ${y + 2}Q${x} ${y - 8} ${x} ${y - 10}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M${x - 9} ${y - 12}h18l-3 5h-12z" fill="${BRASS}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/><rect x="${x - 3.5}" y="${y - 40}" width="7" height="28" rx="2" fill="url(#wax)" stroke="${INK}" stroke-width="1.1"/><path d="M${x - 3.5} ${y - 34}q2 4 3.5 0" stroke="#D8BE93" stroke-width="1.2" fill="none"/><g transform="translate(${x} ${y - 41})">${flame(i + 4)}</g></g>`).join('');
}
function motes() { const r = rng(5); let s = ''; for (let i = 0; i < 34; i++) s += `<circle class="mote" cx="${F(r() * 1600)}" cy="${F(120 + r() * 700)}" r="${F(.8 + r() * 1.5)}" fill="#FFE9B0" style="--md:${F(14 + r() * 16)}s;--ml:${F(-r() * 30)}s;--mx:${F((r() - .5) * 120)}px;--mo:${F(.25 + r() * .45)}"/>`; return s; }
function lights() {
  return FLAMES.map(([x, y], i) => `<circle class="glow" cx="${x}" cy="${y}" r="${i < 4 ? 190 : 140}" fill="url(#gw)" style="--gd:${F(1.8 + (i * .7) % 2)}s"/>`).join('')
    + `<circle class="glow" cx="1072" cy="720" r="330" fill="url(#gf)" style="--gd:.6s"/><ellipse class="glow" cx="1072" cy="850" rx="330" ry="50" fill="url(#gf)" style="--gd:.8s"/>`;
}
/* ---------- the cat: a tuxedo cat sitting in a basket by the fire. It blinks; a click pets it (it leans its head into the hand, eyes shut, hearts rise). ---------- */
function catHead({ fur, muz = '#FFF4E2', eye = '#E9C53A', inner = '#EFA6A6', marks = '', nose = '#E27A86' }) {
  return `<g class="hd mv"><path d="M-22 -10Q-27 -30 -23 -37Q-10 -32 -4 -20Z" fill="${fur}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M22 -10Q27 -30 23 -37Q10 -32 4 -20Z" fill="${fur}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M-19 -15Q-22 -27 -20 -31Q-13 -27 -9 -20Z" fill="${inner}"/><path d="M19 -15Q22 -27 20 -31Q13 -27 9 -20Z" fill="${inner}"/>
    <path d="M0 -24C-17 -24 -29 -14 -29 0C-29 13 -17 21 0 21C17 21 29 13 29 0C29 -14 17 -24 0 -24Z" fill="${fur}" stroke="${INK}" stroke-width="2.4"/>${marks}
    <path d="M0 2C-8 2 -14 7 -14 12.5C-14 17.5 -7 20 0 20C7 20 14 17.5 14 12.5C14 7 8 2 0 2Z" fill="${muz}"/>
    <g class="eo"><ellipse cx="-11.5" cy="-2" rx="5.4" ry="6.4" fill="${eye}" stroke="${INK}" stroke-width="1.6"/><ellipse cx="11.5" cy="-2" rx="5.4" ry="6.4" fill="${eye}" stroke="${INK}" stroke-width="1.6"/><ellipse cx="-11.5" cy="-1.6" rx="3" ry="5" fill="#1E120C"/><ellipse cx="11.5" cy="-1.6" rx="3" ry="5" fill="#1E120C"/><circle cx="-10" cy="-4.4" r="1.7" fill="#fff"/><circle cx="13" cy="-4.4" r="1.7" fill="#fff"/></g>
    <g class="eh" fill="none" stroke="#FFF4E2" stroke-width="2.4" stroke-linecap="round"><path d="M-17 -1q5.5 -7 11 0M6 -1q5.5 -7 11 0"/></g>
    <path d="M-3 6.4h6L0 10.4z" fill="${nose}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><path d="M0 10.4q-2.6 4.6 -6.6 2.4M0 10.4q2.6 4.6 6.6 2.4" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M-17 9l-15 -3M-17 12.5l-15 2.5M17 9l15 -3M17 12.5l15 2.5" stroke="#FFF4E2" stroke-width="1" opacity=".6"/></g>`;
}
const catSVG = (() => {
  const w = 86, weave = '#9A6A2C'; let lines = '';
  for (let i = -5; i <= 5; i++) lines += `<path d="M${F(i * w / 5.6)} 6Q${F(i * w / 6)} 34 ${F(i * w / 7.4)} 58" stroke="${weave}" stroke-width="2.4" fill="none"/>`;
  for (let j = 1; j < 4; j++) lines += `<path d="M${-w + j * 5} ${j * 15}Q0 ${j * 15 + 14} ${w - j * 5} ${j * 15}" stroke="${weave}" stroke-width="2.2" fill="none" stroke-dasharray="11 7"/>`;
  const hearts = [[-18, 0, 0], [8, -8, .18], [26, 4, .36]].map(([dx, dy, d]) => `<g transform="translate(${dx} ${-126 + dy}) scale(1.5)"><path class="heart" style="--hd:${d}s" d="M0 5C-9 -2 -7 -10 -2 -10C0 -10 0 -8 0 -7C0 -8 0 -10 2 -10C7 -10 9 -2 0 5Z" fill="#E0465C" stroke="${INK}" stroke-width="1.2"/></g>`).join('');
  return `<g id="cat" transform="translate(1262 826) scale(.86)" role="button" tabindex="0" aria-label="Pet the cat"><ellipse cx="0" cy="62" rx="98" ry="9" fill="#000" opacity=".3"/>
    <ellipse cx="0" cy="0" rx="${w}" ry="17" fill="#5A3A1C" stroke="${INK}" stroke-width="2.6"/><ellipse cx="0" cy="5" rx="${w - 12}" ry="11" fill="#8C2F39"/>
    <path d="M-40 10C-50 -30 -30 -62 0 -62C30 -62 50 -30 40 10Z" fill="#2B2428" stroke="${INK}" stroke-width="2.6"/><path d="M-17 10C-20 -20 -12 -44 0 -46C12 -44 20 -20 17 10Z" fill="#FFF4E2"/>
    <g transform="translate(0 -78)">${catHead({ fur: '#2B2428', marks: `<path d="M0 -24C-5 -12 -6 -4 -5 2H5C6 -4 5 -12 0 -24Z" fill="#FFF4E2"/>` })}</g>
    <path d="M${-w} 0Q${-w + 4} 46 ${-w + 26} 60H${w - 26}Q${w - 4} 46 ${w} 0Q0 30 ${-w} 0Z" fill="#BA8440" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>${lines}<path d="M${-w} 0Q0 30 ${w} 0" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M${-w} 0Q0 30 ${w} 0" fill="none" stroke="#D9A85A" stroke-width="4" stroke-linecap="round" stroke-dasharray="9 5"/>
    <ellipse cx="-17" cy="9" rx="11" ry="7" fill="#FFF4E2" stroke="${INK}" stroke-width="2.2"/><ellipse cx="17" cy="9" rx="11" ry="7" fill="#FFF4E2" stroke="${INK}" stroke-width="2.2"/>
    <g transform="translate(58 4)"><g class="tl mv"><path d="M0 0C16 -2 26 14 22 40" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round"/><path d="M0 0C16 -2 26 14 22 40" fill="none" stroke="#2B2428" stroke-width="11.4" stroke-linecap="round"/><path d="M23 32L22 40" stroke="#FFF4E2" stroke-width="11.4" stroke-linecap="round"/></g></g>${hearts}</g>`;
})();

/* ---------- assemble ---------- */
const clips = BAYS.map((b) => `<clipPath id="c${b.id}"><path d="${arch(b.x0, b.x1)}"/></clipPath>`).join('') + `<clipPath id="cdoor"><path d="${arch(DOOR.x0, DOOR.x1)}"/></clipPath>`;
const content = { cards, action, tiles, maps };
svg.innerHTML = `<defs>${clips}
  <linearGradient id="sp" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>
  <linearGradient id="wood" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5C2A20"/><stop offset=".5" stop-color="#6E3024"/><stop offset="1" stop-color="#3E1A15"/></linearGradient>
  <linearGradient id="col" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#3A1814"/><stop offset=".35" stop-color="#9A5038"/><stop offset=".55" stop-color="#7A3A2C"/><stop offset="1" stop-color="#2E120F"/></linearGradient>
  <linearGradient id="brd" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#B0623E"/><stop offset=".45" stop-color="#8A4632"/><stop offset="1" stop-color="#4A2018"/></linearGradient>
  <linearGradient id="drw" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9A5038"/><stop offset="1" stop-color="#6A3024"/></linearGradient>
  <linearGradient id="rail" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#E0A462"/><stop offset="1" stop-color="#9A5F30"/></linearGradient>
  <linearGradient id="brass" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#F0CE7A"/><stop offset="1" stop-color="#B8862E"/></linearGradient>
  <linearGradient id="wax" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#FFF6DC"/><stop offset="1" stop-color="#D9C39A"/></linearGradient>
  <linearGradient id="back" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1E0B0B"/><stop offset="1" stop-color="#2E1310"/></linearGradient>
  <linearGradient id="shade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
  <linearGradient id="inner" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset=".07" stop-color="#000" stop-opacity="0"/><stop offset=".93" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>
  <linearGradient id="leafsh" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#3A0A12" stop-opacity=".55"/><stop offset=".5" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
  <linearGradient id="flr" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3A1814"/><stop offset="1" stop-color="#5C2A20"/></linearGradient>
  <linearGradient id="gr2" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#B3243A" stop-opacity=".0"/><stop offset=".45" stop-color="#C2344D" stop-opacity=".5"/><stop offset="1" stop-color="#B3243A" stop-opacity="0"/></linearGradient>
  <radialGradient id="gw"><stop offset="0" stop-color="#FFD98A" stop-opacity=".55"/><stop offset=".35" stop-color="#FFB15C" stop-opacity=".2"/><stop offset="1" stop-color="#FF9A4A" stop-opacity="0"/></radialGradient>
  <clipPath id="cfire"><path d="M976 800V568Q976 480 1072 471Q1168 480 1168 568V800Z"/></clipPath><filter id="fblur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter><radialGradient id="fp0"><stop offset="0" stop-color="#FFFBE0"/><stop offset=".45" stop-color="#FFE27A" stop-opacity=".85"/><stop offset="1" stop-color="#FFB03B" stop-opacity="0"/></radialGradient><radialGradient id="fp1"><stop offset="0" stop-color="#FFC65A" stop-opacity=".95"/><stop offset=".5" stop-color="#FF8A2A" stop-opacity=".7"/><stop offset="1" stop-color="#E8501F" stop-opacity="0"/></radialGradient><radialGradient id="fp2"><stop offset="0" stop-color="#F0602A" stop-opacity=".8"/><stop offset=".55" stop-color="#B92A14" stop-opacity=".45"/><stop offset="1" stop-color="#6E1208" stop-opacity="0"/></radialGradient><radialGradient id="gf"><stop offset="0" stop-color="#FFB25C" stop-opacity=".6"/><stop offset=".4" stop-color="#FF7A2E" stop-opacity=".24"/><stop offset="1" stop-color="#FF5A1E" stop-opacity="0"/></radialGradient><radialGradient id="gr"><stop offset="0" stop-color="#E0465C" stop-opacity=".75"/><stop offset=".4" stop-color="#9E1F35" stop-opacity=".4"/><stop offset="1" stop-color="#6E1223" stop-opacity="0"/></radialGradient>
  <radialGradient id="lit"><stop offset="0" stop-color="#FFD98A" stop-opacity=".6"/><stop offset="1" stop-color="#FFB15C" stop-opacity="0"/></radialGradient>
  <radialGradient id="ball" cx=".35" cy=".3"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
  <radialGradient id="vig" cx=".5" cy=".46" r=".75"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#12060A" stop-opacity=".78"/></radialGradient></defs>
  <rect width="1600" height="900" fill="#1A0D10"/>
  <g class="lay" data-d=".35"><rect x="-60" y="-40" width="1720" height="120" fill="#2A1C22"/><path d="M-60 26H1660" stroke="#3A2A30" stroke-width="3"/></g>
  <g class="lay" data-d="1.5">${floor()}</g>
  <g class="lay" data-d="1">
    ${BAYS.map((b) => `<g class="bay${LIVE[b.id] ? '' : ' soon'}" data-bay="${b.id}" tabindex="0" role="${LIVE[b.id] ? 'link' : 'img'}" aria-label="${b.name[0] + b.name.slice(1).toLowerCase()}${LIVE[b.id] ? '' : ' (coming soon)'}"><path d="${arch(b.x0, b.x1)}" fill="transparent"/><g clip-path="url(#c${b.id})"><g class="lay" data-d="-.45">${content[b.id]()}</g></g><path class="lit" d="${arch(b.x0, b.x1)}" fill="url(#lit)"/></g>`).join('')}
    ${door()}${shelves()}${frame()}${fixtures()}${plaques()}
  </g>
  <g class="lay" data-d="1.25">${ladder()}</g>
  <g class="lay" data-d="1.5">${props()}</g>
  
  ${catSVG}
  <g pointer-events="none">${lights()}</g>
  <g pointer-events="none">${motes()}</g>
  <rect width="1600" height="900" fill="url(#vig)" pointer-events="none"/>${parkReturn()}`;

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;                    // (the view is fixed: nothing shifts with the pointer)
const ladderEl = svg.querySelector('#ladder');
requestAnimationFrame(() => document.body.classList.add('ready'));             // (the radio buttons show only now, together with the hall)

/* ---------- the globe: a click spins it twice round, fast, back to Greenwich ---------- */
const globe = svg.querySelector('#globe'), gEl = { land: svg.querySelector('#gland'), grat: svg.querySelector('#ggrat'), prime: svg.querySelector('#gprime') }; let spin = null;
const spinGlobe = (e) => { e.stopPropagation(); spin = { t: 0 }; };
globe.addEventListener('click', spinGlobe); globe.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); spinGlobe(e); } });
function stepGlobe(dt) { if (!spin) return; spin.t += dt; const u = Math.min(1, spin.t / 1.5), G = globeGeo(-720 * (1 - (1 - u) * (1 - u) * (1 - u)), 37); gEl.land.setAttribute('d', G.land); gEl.grat.setAttribute('d', G.grat); gEl.prime.setAttribute('d', G.prime); if (u >= 1) spin = null; }
/* ---------- the fire: flames computed pixel by pixel from flowing noise on a small canvas (92 x 110), shown through an <image> in the hearth ---------- */
const fireImg = svg.querySelector('#fire'), fcv = document.createElement('canvas'); fcv.width = 92; fcv.height = 110;
const fg = fcv.getContext('2d'), fdata = fg.createImageData(92, 110);
const LUT = new Uint8ClampedArray(1024); { const st = [[0, 90, 8, 0], [.22, 190, 36, 8], [.45, 240, 96, 16], [.68, 255, 176, 44], [.86, 255, 228, 120], [1, 255, 250, 214]]; for (let i = 1; i < 256; i++) { const v = i / 255; let k = 1; while (v > st[k][0]) k++; const p = st[k - 1], q = st[k], u = (v - p[0]) / (q[0] - p[0]); LUT.set([p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u, p[3] + (q[3] - p[3]) * u, Math.min(1, v * 5) * 255], i * 4); } }
const perm = new Uint8Array(512); { const r = rng(3); for (let i = 0; i < 256; i++) perm[i] = i; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; } for (let i = 0; i < 256; i++) perm[256 + i] = perm[i]; }
const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), X = xi & 255, Y = yi & 255, a = perm[perm[X] + Y], b = perm[perm[X + 1] + Y], c = perm[perm[X] + Y + 1], d = perm[perm[X + 1] + Y + 1]; return (a + (b - a) * u + (c + (d - c) * u - a - (b - a) * u) * v) / 255; };
const fbm = (x, y) => vn(x, y) * .5 + vn(x * 2.03, y * 2.03) * .27 + vn(x * 4.1, y * 4.1) * .15 + vn(x * 8.2, y * 8.2) * .08;
let fireAt = 0;
function stepFire(now) {
  if (now < fireAt) return; fireAt = now + 30;                                // about 30 pictures a second
  const W = 92, H = 110, d = fdata.data, t = now / 1000; let k = 0;
  for (let j = 0; j < H; j++) { const y = 1 - j / H; for (let i = 0; i < W; i++) { const x = (i / W - .5) * 2, warp = (fbm(x * 1.6 + 7, y * 2 - t * 1.3) - .5) * .5, xx = x + warp * y, half = .8 * (1 - y * .78) + .03, env = Math.max(0, 1 - (xx / half) * (xx / half)), n = fbm(xx * 2.6, y * 3.2 - t * 2.4), n2 = fbm(xx * 5.5 + 3, y * 6 - t * 3.6); let v = env * (1.2 - y * 1.05) + (n - .5) * 1.25 + (n2 - .5) * .5 - y * .42; v = Math.max(0, Math.min(1, (v - .2) * 1.75)); const q = (v * 255 | 0) * 4; d[k++] = LUT[q]; d[k++] = LUT[q + 1]; d[k++] = LUT[q + 2]; d[k++] = LUT[q + 3]; } }
  fg.putImageData(fdata, 0, 0); fireImg.setAttribute('href', fcv.toDataURL());
}
/* ---------- the cat: blinks; a click (or Enter) pets it ---------- */
const catEl = svg.querySelector('#cat');
const blink = () => { if (!catEl.classList.contains('pet')) { catEl.classList.add('blink'); setTimeout(() => catEl.classList.remove('blink'), 150); } setTimeout(blink, 2400 + Math.random() * 3600); };
setTimeout(blink, 1800);
const meow = new Audio('/sounds/cat_meow.mp3'); meow.preload = 'auto'; meow.volume = .28;          // (about 10 LU over the ambience: the file is -19 LUFS, the loop -34 LUFS at volume .5 = -40; plays only while the hall sound is on)
const pet = () => { if (catEl.classList.contains('pet')) return; catEl.classList.remove('blink'); catEl.classList.add('pet'); if (isPlaying()) { try { meow.volume = Math.min(1, .28 * getSoundVolume()); meow.currentTime = 0; meow.play().catch(() => {}); } catch { /* no sound */ } } setTimeout(() => catEl.classList.remove('pet'), 1500); };
catEl.addEventListener('click', pet); catEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pet(); } });
/* ---------- the sections: Cards opens the card library, Action cards the binder of the action cards; the other two are still to come ---------- */
let leaving = false;                                                                      // (the ladder rests at the door; a click sends it to the section first, then the page opens)
const LADDER_REST = 795;
svg.querySelectorAll('.bay').forEach((g) => {                // the bookcase under the pointer (or focused) lights up its label over the cornice
  const plq = svg.querySelector(`.plq[data-bay="${g.dataset.bay}"]`), hot = (v) => () => plq && plq.classList.toggle('hot', v);
  g.addEventListener('mouseenter', hot(true)); g.addEventListener('mouseleave', hot(false)); g.addEventListener('focus', hot(true)); g.addEventListener('blur', hot(false));
});
svg.querySelectorAll('.bay').forEach((g) => {
  const to = LIVE[g.dataset.bay]; if (!to) return;
  const b = BAYS.find((q) => q.id === g.dataset.bay), target = Math.round((b.x0 + b.x1) / 2 - 45);
  const open = () => fadeOutThen(() => { location.href = to; });
  const go = () => {
    if (leaving) return; leaving = true;
    if (still) { open(); return; }
    let done = false; const finish = () => { if (done) return; done = true; ladderEl.removeEventListener('transitionend', onEnd); open(); };
    const onEnd = (e) => { if (e.target === ladderEl && e.propertyName === 'transform') finish(); };
    ladderEl.addEventListener('transitionend', onEnd); setTimeout(finish, 1800);
    ladderEl.style.transform = `translate(${target}px,0)`;
  };
  g.addEventListener('click', go); g.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
});
addEventListener('pageshow', (e) => { if (!e.persisted) return; leaving = false; ladderEl.style.transition = 'none'; ladderEl.style.transform = `translate(${LADDER_REST}px,0)`; void ladderEl.getBoundingClientRect(); ladderEl.style.transition = ''; });
/* ---------- the ambient sound: js/library_sound.js (the button, the volume slider, the remembered choice, the loop carried across the pages) ---------- */
/* ---------- the gramophone: the tone arm follows the sound button, the record turns while the loop plays, a bigger volume slider opens on the lever ---------- */
{
  const arm = document.getElementById('gram-arm'), disc = document.getElementById('gram-disc');
  const lever = document.getElementById('library-volume'), sbtn = document.getElementById('soundbtn'), armHit = document.getElementById('gram-armhit');
  const UP = 20, PIVOT = ' 104 636';                                       // the arm's angle when lifted; its pivot (in the gramophone's own coordinates)
  let lift = sbtn.classList.contains('on') ? 0 : 1, speed = 0, turn = 0, prev = performance.now(), drawnLift = -1;
  (function gram(now) {
    const dt = Math.min(64, now - prev); prev = now;
    lift += ((sbtn.classList.contains('on') ? 0 : 1) - lift) * Math.min(1, dt / 120);           // (the arm follows the button: the button shows what really plays)
    if (Math.abs(lift - drawnLift) > .001) { arm.setAttribute('transform', 'rotate(' + (UP * lift).toFixed(2) + PIVOT + ')'); drawnLift = lift; }
    speed += ((isPlaying() && getSoundVolume() > 0 ? 1 : 0) - speed) * Math.min(1, dt / 450);   // (winds up and runs down like a real record)
    if (speed > .002) { turn = (turn + speed * dt * .2) % 360; disc.setAttribute('transform', 'rotate(' + turn.toFixed(2) + ')'); }
    requestAnimationFrame(gram);
  })(prev);
  armHit.addEventListener('click', () => sbtn.click());                     // the second way to switch the sound: drop or lift the arm
  armHit.addEventListener('mouseenter', () => armHit.setAttribute('aria-label', sbtn.classList.contains('on') ? 'Lift the arm (mute)' : 'Drop the arm (sound on)'));
  // the bigger slider: opens below the lever on hover or focus, stays while the pointer is on the lever or on it; 0-100 marks to click
  const pop = document.createElement('div'); pop.id = 'volpop'; pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', 'Library volume');
  pop.innerHTML = '<input type="range" min="0" max="100" step="1" aria-label="Library volume"><div class="ticks">' + [0, 25, 50, 75, 100].map((v) => '<button type="button" data-v="' + v + '">' + v + '</button>').join('') + '</div>';
  document.body.append(pop);
  const big = pop.querySelector('input');
  const sync = () => { big.value = lever.value; big.style.setProperty('--p', lever.value + '%'); };
  const setVol = (v) => { lever.value = Math.max(0, Math.min(100, Math.round(v))); lever.dispatchEvent(new Event('input', { bubbles: true })); sync(); };
  let hideT = 0, open = false, dragging = false;
  const place = () => {
    const r = lever.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, cx = r.left + r.width / 2;
    const left = Math.max(8, Math.min(innerWidth - w - 8, cx - w / 2));
    pop.style.left = left + 'px'; pop.style.top = Math.min(innerHeight - h - 8, r.bottom + 12) + 'px';
    pop.style.setProperty('--ax', Math.max(14, Math.min(w - 14, cx - left)) + 'px');
  };
  const show = () => { clearTimeout(hideT); sync(); place(); pop.classList.add('on'); open = true; };
  const hideSoon = () => { if (dragging) return; clearTimeout(hideT); hideT = setTimeout(() => { pop.classList.remove('on'); open = false; }, 280); };
  lever.addEventListener('mouseenter', show); lever.addEventListener('mouseleave', hideSoon);
  lever.addEventListener('focus', show); lever.addEventListener('blur', hideSoon);
  lever.addEventListener('input', sync);
  lever.addEventListener('pointerdown', () => { dragging = true; show(); });
  addEventListener('pointerup', () => { if (!dragging) return; dragging = false; if (!lever.matches(':hover') && !pop.matches(':hover')) hideSoon(); });
  const wheel = (e) => { e.preventDefault(); show(); setVol(+lever.value + (e.deltaY < 0 ? 2 : -2)); };
  lever.addEventListener('wheel', wheel, { passive: false }); pop.addEventListener('wheel', wheel, { passive: false });
  big.addEventListener('input', () => setVol(+big.value));
  pop.querySelectorAll('.ticks button').forEach((b) => b.addEventListener('click', () => setVol(+b.dataset.v)));
  pop.addEventListener('mouseenter', () => clearTimeout(hideT)); pop.addEventListener('mouseleave', hideSoon);
  pop.addEventListener('focusin', () => clearTimeout(hideT)); pop.addEventListener('focusout', (e) => { if (!pop.contains(e.relatedTarget) && e.relatedTarget !== lever) hideSoon(); });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { pop.classList.remove('on'); open = false; lever.focus(); } });
  addEventListener('resize', () => { if (open) place(); });
}
function tick(now) {
  const dt = Math.min(.05, (now - (tick.last || now)) / 1000); tick.last = now;
  stepFire(now); stepGlobe(dt);
  if (!still) requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// SVG links do not expose HTMLAnchorElement.origin to the shared fade handler.
svg.querySelector('#hall-return').addEventListener('click',e=>{
  if(e.defaultPrevented||e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
  e.preventDefault();fadeOutThen(()=>{location.href='/';});
});
