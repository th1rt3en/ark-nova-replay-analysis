// [module] The results of a finished replay (BGA's "Game results" tab): at the last step the move bar becomes the switch Final board | Game stats, › on the last step opens
// the results and ‹ closes them. The statistics are counted in the browser from the raw log (`countStats`, fetched once when the end is reached), the score race (the graph
// view for now) from the replay's steps. Replays only (not forks, the sandbox, live games or the mini games).
import { $, el, seatColor, seatRawColor, seatText } from './util.js';
import { FORK, MINIGAME, PLAY, S, params, table } from './state.js';
import { framesOf } from './frames.js';
import { seatOrder } from './pov.js';
import { render } from './main.js';

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const lastStep = () => S.replay.steps.length - 1;
const finalState = () => S.replay.steps[lastStep()].state;

// ---- when the results exist ---------------------------------------------------------------------------------------------------------------------------------------------
// A game that ended normally has a final state with its result (phase 'over'). A conceded game has none: the log says who conceded (`playerConcedeGame`), so it is known once
// the log has been read (`S.postStats.conceded`); the switch appears then.
export function resultsAvailable() {
  if (FORK || PLAY || MINIGAME || !S.replay) return false;
  const st = finalState();
  return st.phase === 'over' || (S.postStats && S.postStats.conceded !== null && S.postStats.conceded !== undefined);
}
const atLast = () => S.step === lastStep() && S.phase >= framesOf(S.step).length - 1;
export function openResults() { if (!resultsAvailable()) return; S.results = true; loadStats(); render(); }
export function closeResults() { if (!S.results) return; S.results = false; S.lastBoard = null; render(); }

// ---- the statistics, counted from the raw log -------------------------------------------------------------------------------------------------------------------------------
// Thinking time as text: under an hour "12:34" (mm:ss, no unit), under a day "4h 15 min", else "5d 12h"; no value (a local copy) -> the placeholder "12:34".
export function thinkingTime(sec) {
  if (sec == null || !isFinite(sec)) return '12:34';
  sec = Math.max(0, Math.round(sec));
  if (sec < 3600) return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ' + String(Math.floor((sec % 3600) / 60)).padStart(2, '0') + ' min';
  return Math.floor(sec / 86400) + 'd ' + Math.floor((sec % 86400) / 3600) + 'h';
}
// Only the table channel is read (every public event once). Thinking time is a placeholder for now: BGA's own clock is not in the log.
const UNIQUE = new Set(['adventure', 'amazon', 'aquarium', 'arcade', 'baboon', 'cable', 'entrance', 'excavation', 'hyena', 'meerkat', 'monkey', 'okapi', 'owl', 'penguin', 'polar-bear',
  'sea-turtle', 'underwater-tunnel', 'victory', 'water-playground', 'zoo-school']);          // (the sponsors' unique buildings, src/ark_nova/data/unique_shapes.json)
function countStats(raw) {
  const data = raw.data || raw, ids = (data.players || []).map((p) => String(p.id));
  const seatOf = (pid) => { const i = ids.indexOf(String(pid)); return i < 0 ? null : i; };
  const blank = () => ({ turns: 0, act: { build: 0, animals: 0, cards: 0, association: 0, sponsors: 0 }, xPass: 0, xGained: 0, xUsed: 0, money: 0, income: 0, onAnimals: 0, onBuildings: 0,
    onDonations: 0, onRange: 0, drawn: 0, fromRange: 0, snapped: 0, discarded: 0, animals: 0, sponsors: 0, released: 0, workers: 1, projects: 0, partners: 0, universities: 0, donations: 0,
    reputation: 0, breaks: 0, advances: 0, manualSnaps: 0, projectSnaps: 0, freeTwos: 0, clever: 0, enclosures: 0, kiosks: 0, pavilions: 0, unique: 0 });
  const P = [blank(), blank()], chose = [false, false];
  let first = null, ender = null, conceded = null, inBreak = false;
  // where a snap comes from (only two kinds are told apart): `sel` = the snap selector of a seat (gameStateChange id 59: its `source`, 'map bonus space' = a project snap, an animal's name = something else),
  // `proj` = snaps a break-income takeBonus "Snapping" (map bonus space) has granted and not used yet, `cards` = the snap state of the Cards action (id 34, descSuffix 'snap'), open until that action ends
  const sel = [null, null], proj = [0, 0], cards = [0, 0];
  const build = [null, null];                                                                           // the `source` of the seat's build selector (gameStateChange id 30): 'map bonus space' = a free enclosure from the conservation bonus slot
  // the display before a move: the last step of an earlier move id (a card played from the display costs its folder number)
  const steps = S.replay.steps;
  const displayBefore = (moveId) => { let st = null; for (const s of steps) { if (Number(s.move_id) < moveId) st = s.state; else break; } return st ? st.display || [] : []; };
  for (const pk of data.logs || []) {
    if (!String(pk.channel || '').startsWith('/table/')) continue;
    for (const e of pk.data || []) {
      const a = e.args && typeof e.args === 'object' && !Array.isArray(e.args) ? e.args : {}, log = e.log || '', ty = e.type;
      if (ty === 'gameStateChange' && a.id === 59 && a.args && typeof a.args === 'object') { const q = seatOf(a.active_player); if (q !== null) sel[q] = { src: a.args.source || null, suffix: a.args.descSuffix || '' }; }
      if (ty === 'gameStateChange' && a.id === 30 && a.args && typeof a.args === 'object') { const q = seatOf(a.active_player); if (q !== null) build[q] = a.args.source || null; }
      if (ty === 'gameStateChange' && a.id === 34 && a.args && typeof a.args === 'object' && a.args.descSuffix === 'snap' && a.args.nSnap > 0) { const q = seatOf(a.active_player); if (q !== null) cards[q] = a.args.nSnap; }
      if (ty === 'takeBonus' && a.source === 'map bonus space' && a.bonus_desc && a.bonus_desc.args && a.bonus_desc.args.bonus_type === 'Snapping') { const q = seatOf(a.player_id); if (q !== null) proj[q] += Number(a.bonus_desc.args.bonus_n) || 1; }
      if (ty === 'startBreak') inBreak = true;
      if (ty === 'advanceBreak') { const q = seatOf(a.player_id); if (q !== null) P[q].advances += Number(a.n) || 0; }       // every step of the break track a player caused (a Sponsors card for 5 = 5, Cards = 2, a jumping animal = its jump)
      if (ty === 'finishBreak') inBreak = false;
      const s = seatOf(a.player_id);
      if (ty === 'playerConcedeGame' && s !== null) conceded = s;
      if (s === null) continue;
      const p = P[s];
      if (ty === 'chooseActionCard') { sel[s] = null; if (first === null) first = s; const k = String(a.action_card_type || '').toLowerCase(); if (k in p.act) p.act[k] += 1; chose[s] = true; }
      else if (ty === 'actionCardCleanup' && log.includes('(Clever effect)')) p.clever += 1;                  // one resolved Clever = one action card moved by it, whatever its source (sponsor, bonus, animal, project ...)
      else if (ty === 'actionCardCleanup' && log.includes('finishing action')) { cards[s] = 0; sel[s] = null; p.turns += 1; if (!chose[s]) p.xPass += 1; chose[s] = false; }
      else if (ty === 'getBonuses') {
        const b = a.bonuses && typeof a.bonuses === 'object' ? a.bonuses : {}, x = b.xtoken || 0, m = b.money || 0;
        if (x > 0) p.xGained += x; else if (x < 0) p.xUsed -= x;
        if (m > 0) { p.money += m; if (inBreak) p.income += m; }
        if (a.source === 'triggering break') p.breaks += 1;
      } else if (ty === 'buyAnimal' || ty === 'playSponsor') {
        if (ty === 'buyAnimal') { p.animals += 1; p.onAnimals += Number(a.amount) || 0; } else p.sponsors += 1;
        if (a.fromDisplay) { const key = String(a.card_id || '').split('_')[0], at = displayBefore(Number(pk.move_id)).indexOf(key); if (at >= 0) p.onRange += at + 1; }
      } else if (ty === 'releaseAnimal') p.released += 1;
      else if (ty === 'buyBuilding') {
        p.onBuildings += Number(a.amount_money) || 0;
        const t = a.building && typeof a.building === 'object' ? String(a.building.type || '') : String(a.building || '');
        if (t === 'size-2' && log.includes('for free') && build[s] === 'map bonus space') { p.freeTwos += 1; build[s] = null; }       // a free 2-hex enclosure from the map's bonus space (counted as an enclosure as well)
        if (t === 'kiosk') p.kiosks += 1; else if (t === 'pavilion') p.pavilions += 1; else if (UNIQUE.has(t)) p.unique += 1; else p.enclosures += 1;
      } else if (ty === 'donation') { const m = (a.bonuses && a.bonuses.money) || 0; p.donations += 1; p.onDonations += Math.abs(m); }
      else if (ty === 'drawCards' && log.startsWith('${player_name} draws ${n} card(s) from the deck')) p.drawn += Number(a.n) || 0;
      else if (ty === 'snapCard') {
        const n = (a.cards || []).length || 1;
        if (log.includes('reputation range')) p.fromRange += n;
        else {
          p.snapped += n;
          // the source, strongest first: the selector's own source, a break-income grant not used yet, the open Cards action
          const d = sel[s]; sel[s] = null;
          if (d && d.src === 'map bonus space') { p.projectSnaps += n; if (proj[s] > 0) proj[s] = Math.max(0, proj[s] - n); }
          else if (d && (d.src || d.suffix)) { /* an animal / Waza: neither */ }
          else if (proj[s] > 0) { p.projectSnaps += n; proj[s] = Math.max(0, proj[s] - n); }
          else if (cards[s] > 0) { p.manualSnaps += n; cards[s] = Math.max(0, cards[s] - n); }
        }
      }
      else if (ty === 'discardCards' && (log.includes('discards ${n} card(s)') || log.includes('during break'))) p.discarded += Number(a.n) || 0;
      else if (ty === 'slideMeeples') {
        if (log.includes('conservation project')) p.projects += 1;
        else if (log.includes('university')) p.universities += 1;
        else if (log.includes('Partner zoo')) p.partners += 1;
        else if (log.includes('increases reputation')) p.reputation += 1;
        else if (log.includes('new Association worker') || log.includes('hires a new worker')) p.workers += 1;
      } else if (ty === 'endOfGame') ender = s;
    }
  }
  return { players: P, first, ender, conceded };
}
// the covered and the empty hexes of a zoo: the cells of its buildings, the plain hexes of its map that are not covered (as on BGA: covered + empty = the plain hexes)
function hexes(seat) {
  const map = S.replay.maps && S.replay.maps[seat], p = finalState().players[seat];
  const cells = new Set(p.buildings.flatMap((b) => (b.cells || []).map((c) => c[0] + ',' + c[1])));
  const plain = map ? map.hexes.filter((h) => h.terrain === 'plain').map((h) => h.x + ',' + h.y) : [];
  return { covered: cells.size, empty: plain.filter((k) => !cells.has(k)).length };
}
async function readLog() {
  if (params.get('source') === 'upload') return JSON.parse(await LogStore.get(table));
  const res = await fetch('/api/tables/' + encodeURIComponent(table) + '/log');
  if (!res.ok) throw new Error('log ' + res.status);
  return res.json();
}
// read and count once; a render follows (the switch of a conceded game appears, the panel fills)
export function loadStats() {
  if (S.postStats || FORK || PLAY || MINIGAME) return;
  S.postStats = { loading: true };
  readLog().then((raw) => { S.postStats = countStats(raw); }).catch(() => { S.postStats = { error: true }; }).then(() => { if (S.step === lastStep()) render(); });
}

// ---- the score race: the score of both players after every turn, the breaks as dashed lines ------------------------------------------------------------------------------
// The graph categories (the rail in the graph view): [title, what is plotted per round]. 'score' is the score race; null = not drawn yet.
const GRAPH_CATS = [['Points', 'score'], ['Key events', null], ['Conservation', 'conservation'], ['Appeal', 'appeal'], ['Reputation', 'reputation'], ['Money', 'money'], ['X-tokens', 'x_tokens']];
const metric = (p, key) => (key === 'cards' ? (Array.isArray(p.hand) ? p.hand.length : NaN) : p[key]);
function niceTicks(lo, hi) {
  const span = Math.max(1, hi - lo), raw = span / 5, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) || 10 * mag, out = [];
  for (let v = Math.floor(lo / step) * step; v < hi + step - 1e-9; v += step) { out.push(Math.round(v * 100) / 100); if (v >= hi - 1e-9) break; }
  return out;
}
function race(key = 'score') {
  // One point per round (both players have played): the scores after the round's last turn (the state's turn counts both players, so round = ceil(turn / 2)); the points the
  // end of the game adds (the endgame cards: phase 'over') are one more point, "End".
  const byRound = new Map(), breaks = [];
  let trigger = null, last = null;
  S.replay.steps.forEach((s) => {
    const st = s.state;
    if (st && Number.isFinite(st.turn) && st.players && st.players.every((p) => Number.isFinite(metric(p, key)))) {
      if (st.phase !== 'over') byRound.set(Math.ceil(st.turn / 2), st.players.map((p) => metric(p, key)));
      last = st;
    }
    const label = s.label || '';
    if (/\(triggering break\)/.test(label)) trigger = S.replay.players.findIndex((pl) => label.startsWith(pl.name + ' '));
    if (/^Starting a new break/m.test(label)) { breaks.push({ turn: (st.turn - 0.5) / 2, seat: trigger }); trigger = null; }
  });
  const turns = [...byRound.keys()].sort((a, b) => a - b), scores = turns.map((t) => byRound.get(t));
  const end = !!last && last.phase === 'over';
  if (end) { turns.push(turns[turns.length - 1] + 1); scores.push(last.players.map((p) => metric(p, key))); }
  const all = scores.flat();
  const ticks = key === 'score' ? [0, 25, 50, 75, 100] : niceTicks(Math.min(0, ...all), Math.max(1, ...all));
  const lo = key === 'score' ? Math.min(-20, ...all) : ticks[0], hi = key === 'score' ? Math.max(105, ...all) : ticks[ticks.length - 1];
  return { turns, scores, breaks, end, ticks, lo, hi, goal: key === 'score' };
}
let raceSeq = 0;
// How a seat is drawn on the dark graph (the colour the rest of the page uses is made for paper and info boxes). Every seat has the same parts: the line, a pill behind the numbers
// and a disc behind the break mug (pf/ps/pt = pill fill / edge / text, df/mf = disc / mug). A seat colour fills pill and disc, with dark (or white) content. A white seat is an ice
// white with a dark casing under the line (the page's mid grey looks like the cream break lines); a black seat is a black line with a thin grey core, a black pill, a slate disc.
function inkOn(hex) { const n = parseInt(String(hex).replace('#', ''), 16), l = ((n >> 16) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114); return l > 150 ? '#10222a' : '#ffffff'; }
function graphStyle(seat) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(seatRawColor(seat) || ''), ch = m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : null;
  if (ch && Math.max(...ch) < 80) return { black: true, c: '#050505', core: '#86949b', pf: '#050505', ps: '#6f7d84', pt: '#aebabf', df: '#4e5d64', mf: '#050505' };
  const white = ch && Math.min(...ch) >= 235, c = white ? '#cfe8f2' : seatColor(seat);
  return { c, cas: white ? '#06222b' : null, pf: c, ps: c, pt: inkOn(c), df: c, mf: '#0c1c22' };
}
function mugIcon(color, cx, cy, size) {                                                              // the break mug (cup, handle, steam) as a vector, so it takes any colour
  const g = sv('g', { class: 'rsmug', transform: `translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 24})` });
  g.append(sv('path', { d: 'M3 9.5h12.5v6.2a4.8 4.8 0 0 1-4.8 4.8H7.8A4.8 4.8 0 0 1 3 15.7z', fill: color }),
    sv('path', { d: 'M15.5 11.2h1.4a2.7 2.7 0 0 1 0 5.4h-1.4', fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round' }),
    sv('path', { d: 'M6.2 7.2c-1-1.2 1-2 0-3.4M10.4 7.2c-1-1.2 1-2 0-3.4', fill: 'none', stroke: color, 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: .8 }));
  return g;
}
function pillEl(p, GS) {                                                                                  // a number in a pill (rounded rect + text) in the seat's pill colours; set() places it by its left (or right) edge and vertical centre
  const g = sv('g', { class: 'rspill' }), r = sv('rect', { fill: GS[p].pf, stroke: GS[p].ps, 'stroke-width': 1.5 }), t = sv('text', { class: 'rspillt', fill: GS[p].pt, 'text-anchor': 'middle' });
  g.append(r, t);
  return { g, set(x, cy, str, anchor, size) {
    t.textContent = str; t.style.fontSize = size + 'px';
    const w = str.length * size * .62 + size * 1.1, h = size * 1.5, x0 = anchor === 'start' ? x : x - w;
    r.setAttribute('x', x0); r.setAttribute('y', cy - h / 2); r.setAttribute('width', w); r.setAttribute('height', h); r.setAttribute('rx', h / 2);
    t.setAttribute('x', x0 + w / 2); t.setAttribute('y', cy + size * .35);
  } };
}
function raceSvg(R, w, h, big) {
  const pad = big ? { l: 60, r: 78, t: 50, b: 46 } : { l: 40, r: 52, t: 36, b: 24 };
  const { lo, hi } = R, tickList = R.ticks;
  const t0 = R.turns[0] || 0, t1 = R.turns[R.turns.length - 1] || 1;
  const X = (t) => pad.l + (w - pad.l - pad.r) * (t - t0) / Math.max(1, t1 - t0), Y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
  const s = sv('svg', { viewBox: `0 0 ${w} ${h}`, class: 'rsrace-svg' + (big ? ' big' : '') });
  const uid = 'rs' + (++raceSeq), GS = [graphStyle(0), graphStyle(1)];
  const defs = sv('defs'), fade = sv('linearGradient', { id: uid + 'f', gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: pad.t, y2: h - pad.b });
  fade.append(sv('stop', { offset: 0, 'stop-color': '#f8edcb', 'stop-opacity': .6 }), sv('stop', { offset: 1, 'stop-color': '#f8edcb', 'stop-opacity': .18 }));
  defs.append(fade);
  if (R.goal) {                                                                                         // the 100-point line: a grid line with a faint red tint, and a barely visible red wash above it (where the game ends)
    const zone = sv('linearGradient', { id: uid + 'z', gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: pad.t - 4, y2: Y(100) });
    zone.append(sv('stop', { offset: 0, 'stop-color': '#ff7a64', 'stop-opacity': 0 }), sv('stop', { offset: 1, 'stop-color': '#ff7a64', 'stop-opacity': .16 }));
    defs.append(zone);
    s.append(sv('rect', { x: pad.l, y: pad.t - 4, width: w - pad.l - pad.r, height: Math.max(0, Y(100) - pad.t + 4), fill: `url(#${uid}z)` }));
  }
  s.prepend(defs);
  for (const g of tickList) {
    const goal = R.goal && g === 100;
    s.append(sv('line', { x1: pad.l, x2: w - pad.r, y1: Y(g), y2: Y(g), class: 'rsgrid' + (goal ? ' goal' : '') }));
    const t = sv('text', { x: pad.l - (big ? 18 : 11), y: Y(g) + (big ? 7 : 5), class: 'rsax' + (goal ? ' goal' : ''), 'text-anchor': 'end' }); t.textContent = g; s.append(t);
  }
  const yb = h - pad.b;                                                                                 // the axes: y at the left edge of the plot, x at its bottom (smooth, no number labels or ticks on x)
  s.append(sv('line', { x1: pad.l, x2: pad.l, y1: pad.t - 4, y2: yb, class: 'rsaxis' }), sv('line', { x1: pad.l, x2: w - pad.r, y1: yb, y2: yb, class: 'rsaxis' }));
  for (const g of tickList) s.append(sv('line', { x1: pad.l - 5, x2: pad.l, y1: Y(g), y2: Y(g), class: 'rsaxis' }));
  R.breaks.forEach((b) => {                                                                            // the breaks: one solid cream line (fading towards the axis), a coffee mug on top in the colour of the player who triggered it
    const known = b.seat !== null && b.seat >= 0, x = X(b.turn), sz = big ? 28 : 20, cy = pad.t - (big ? 22 : 15);
    s.append(sv('line', { x1: x, x2: x, y1: pad.t - 2, y2: h - pad.b, class: 'rsbreak', stroke: `url(#${uid}f)` }));
    s.append(sv('circle', { cx: x, cy, r: sz * .6, fill: known ? GS[b.seat].df : '#f8edcb' }));
    s.append(mugIcon(known ? GS[b.seat].mf : '#2a2a2a', x, cy, sz * .78));
  });
  const ends = [0, 1].map((p) => Y(R.scores[R.scores.length - 1][p]) + 5);
  const minGap = big ? 34 : 22;
  if (Math.abs(ends[0] - ends[1]) < minGap) { const top = ends[0] <= ends[1] ? 0 : 1, gap = (minGap - Math.abs(ends[0] - ends[1])) / 2; ends[top] -= gap; ends[1 - top] += gap; }
  [0, 1].forEach((p) => {
    const d = R.turns.map((t, i) => (i ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(R.scores[i][p]).toFixed(1)).join(' ');
    if (GS[p].cas) s.append(sv('path', { d, class: 'rsline rscase', stroke: GS[p].cas }));
    s.append(sv('path', { d, class: 'rsline' + (GS[p].black ? ' rsblk' : ''), stroke: GS[p].c }));
    if (GS[p].black) s.append(sv('path', { d, class: 'rsline rscore', stroke: GS[p].core }));
    const pl = pillEl(p, GS); pl.set(w - pad.r + 8, ends[p] - 5, String(R.scores[R.scores.length - 1][p]), 'start', big ? 20 : 13); s.append(pl.g);
  });
  const ax = sv('text', { x: (w + pad.l - pad.r) / 2, y: h - (big ? 6 : 3), class: 'rsax', 'text-anchor': 'middle' }); ax.textContent = '';                                                                                    // (no axis title: the hover chip names the round)
  // hover: a tick on the x-axis at the nearest round, a dot on each line, each score as a bare number next to its dot (the leader above, the trailer below, so they never touch; a tie keeps the
  // order of the last untied round) and the round in a small chip on the x-axis. At "End" the scores already stand at the line ends: only the dots and the chip.
  const hv = sv('g', { class: 'rshover', visibility: 'hidden', 'pointer-events': 'none' });
  const gl = sv('line', { y1: h - pad.b - 9, y2: h - pad.b + 7, class: 'rsguide' });          // (no vertical hover line: a short tick on the x-axis joins the round chip)
  const dots = [0, 1].map((p) => sv('circle', { r: big ? 7 : 4, class: 'rsdot', fill: GS[p].c, style: GS[p].black ? 'stroke:' + GS[p].core : '' }));   // (the same size for every seat)
  const nums = [0, 1].map((p) => pillEl(p, GS));
  const chip = sv('g', { class: 'rschip' }), cr = sv('rect', { class: 'rschipbg' }), ct = sv('text', { class: 'rschipt', 'text-anchor': 'middle' });
  chip.append(cr, ct); hv.append(gl, ...dots, ...nums.map((n) => n.g), chip);
  const hit = sv('rect', { x: pad.l, y: pad.t - 4, width: w - pad.l - pad.r, height: h - pad.t - pad.b + 4, fill: 'transparent', class: 'rshit' });
  const fs = big ? 22 : 14, cf = big ? 15 : 10, last = R.turns.length - 1;
  const leader = (k) => { for (let i = k; i >= 0; i--) if (R.scores[i][0] !== R.scores[i][1]) return R.scores[i][0] > R.scores[i][1] ? 0 : 1; return 0; };
  const show = (ev) => {
    const r = s.getBoundingClientRect(), px = (ev.clientX - r.left) * w / r.width;
    let k = 0, best = Infinity;
    R.turns.forEach((t, i) => { const d = Math.abs(X(t) - px); if (d < best) { best = d; k = i; } });
    const x = X(R.turns[k]), v = R.scores[k], top = leader(k), atEnd = R.end && k === last;
    gl.setAttribute('x1', x); gl.setAttribute('x2', x);
    dots.forEach((d, p) => { d.setAttribute('cx', x); d.setAttribute('cy', Y(v[p])); });
    const left = x > w - pad.r - fs * 3.2;
    nums.forEach((n, p) => {
      const above = p === top, y = Y(v[p]);
      n.g.style.display = atEnd ? 'none' : '';
      n.set(left ? x - fs * .45 : x + fs * .45, above ? y - fs * 1.2 : y + fs * 1.2, v[p] < 0 ? '\u2212' + Math.abs(v[p]) : String(v[p]), left ? 'end' : 'start', fs * .9);
    });
    ct.textContent = atEnd ? 'End' : k === 0 ? 'Start' : 'Turn ' + R.turns[k];
    const cw = ct.textContent.length * cf * .62 + cf * 1.6, ch = cf * 1.8, cy = h - pad.b + cf * .5;
    cr.setAttribute('x', x - cw / 2); cr.setAttribute('y', cy); cr.setAttribute('width', cw); cr.setAttribute('height', ch); cr.setAttribute('rx', ch / 2);
    ct.setAttribute('x', x); ct.setAttribute('y', cy + ch * .7);
    ax.style.visibility = 'hidden';
    hv.setAttribute('visibility', 'visible');
  };
  hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', () => { hv.setAttribute('visibility', 'hidden'); ax.style.visibility = ''; });
  s.append(hit, hv);
  return s;
}
// ---- the panel --------------------------------------------------------------------------------------------------------------------------------------------------------------
function outcome() {
  const st = finalState(), names = S.replay.players.map((p) => p.name);
  const conceded = st.phase === 'over' ? null : S.postStats && S.postStats.conceded;
  const scores = st.result && st.result.scores ? st.result.scores : st.players.map((p) => p.score);
  let winner = st.result && Number.isInteger(st.result.winner) ? st.result.winner : null;
  if (conceded !== null && conceded !== undefined) winner = 1 - conceded;
  return { names, scores, winner, conceded };
}
function groups(D) {
  const [a, b] = D.players, hx = [hexes(0), hexes(1)];
  const r = (label, f) => [label, f(a), f(b)];
  return [
    ['Actions', [r('Animals', (p) => p.act.animals), r('Association', (p) => p.act.association), r('Build', (p) => p.act.build), r('Cards', (p) => p.act.cards), r('Sponsors', (p) => p.act.sponsors), r('Clever', (p) => p.clever), r('X-back', (p) => p.xPass)]],
    ['Association', [r('Projects', (p) => p.projects), r('Releases', (p) => p.released), r('Donations', (p) => p.donations), r('Universities', (p) => p.universities), r('Partner zoos', (p) => p.partners), r('Reputation', (p) => p.reputation), r('Workers', (p) => p.workers)]],
    ['Cards', [r('Drawn from deck', (p) => p.drawn), r('Drawn from range', (p) => p.fromRange), r('Snapped', (p) => p.snapped), r('Manual snaps', (p) => p.manualSnaps), r('Bonus snaps', (p) => p.projectSnaps), r('Discarded', (p) => p.discarded), r('Animals played', (p) => p.animals), r('Sponsors played', (p) => p.sponsors)]],
    ['Money', [r('Gained overall', (p) => p.money), r('Gained from income', (p) => p.income), r('Spent on animals', (p) => p.onAnimals), r('Spent on buildings', (p) => p.onBuildings), r('Spent on donations', (p) => p.onDonations), r('Spent on display cost', (p) => p.onRange)]],
    ['X-tokens', [r('Gained', (p) => p.xGained), r('Used', (p) => p.xUsed)]],
    ['Zoo', [r('Enclosures', (p) => p.enclosures), r('Free 2-sizes', (p) => p.freeTwos), r('Pavilions', (p) => p.pavilions), r('Kiosks', (p) => p.kiosks), r('Unique buildings', (p) => p.unique), ['Covered hexes', hx[0].covered, hx[1].covered], ['Empty hexes', hx[0].empty, hx[1].empty]]],
  ];
}
// The game stats (`.gs`): a split duel. Top row: the Compare / Graph icons (left), the scores in the two seat colours with a dark spine (right). Below: the categories as a
// rail with a glowing dot that follows the scroll (left), every stat in one scrolling column (right): seat 0's value, the label in the spine, seat 1's value; the larger value
// keeps full strength and an orange pointer. Categories are separated by a glowing line, the stats by hairlines. The graph view shows the score race for now.
const GS_ICON = {
  table: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  graph: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20l5-7 4 3 8-10"/><path d="M3 3v17h18"/></svg>',
};
function overview(D) {
  const tt = S.replay.players.map((p) => p.thinking_time);                                                // (seconds from BigQuery `thinking_time`; no value in a local copy: the placeholder 12:34)
  const rows = [];
  if (D) {
    const yes = (a, b) => [a ? 'Yes' : 'No', b ? 'Yes' : 'No', a === b ? -1 : a ? 0 : 1];                   // a Yes/No row: the Yes gets the pointer
    if (D.first === 0 || D.first === 1) rows.push(['First player', ...yes(D.first === 0, D.first === 1)]);
    const end = D.ender !== null ? D.ender : finalState().end_triggered_by;
    if (end === 0 || end === 1) rows.push(['Triggered end', ...yes(end === 0, end === 1)]);
    rows.push(['Breaks triggered', D.players[0].breaks, D.players[1].breaks], ['Break advancements', D.players[0].advances, D.players[1].advances]);
  }
  const t0 = Number(tt[0]), t1 = Number(tt[1]), known = tt[0] != null && tt[1] != null && isFinite(t0) && isFinite(t1) && t0 !== t1;
  rows.push(['Thinking time', thinkingTime(tt[0]), thinkingTime(tt[1]), known ? (t0 < t1 ? 0 : 1) : -1]);       // (the lower time gets the pointer)
  return ['Overview', rows];
}
function gsRow([label, a, b, pick]) {                                  // pick (optional): which seat gets the pointer (0 / 1 / -1 = none), else the larger number
  if (seatOrder()[0] === 1) { [a, b] = [b, a]; if (pick !== undefined && pick >= 0) pick = 1 - pick; }          // the seat whose map / info box is on the left is the left column (its values are `a`)
  const num = typeof a === 'number' && typeof b === 'number', lead = pick !== undefined ? pick : num && a !== b ? (a > b ? 0 : 1) : -1;
  const row = el('div', 'gsrow' + (num ? '' : ' tx'));
  const val = (i, v) => {
    const c = el('div', 'gsv ' + (i ? 'b' : 'a') + (lead >= 0 && lead !== i ? ' lo' : '') + (lead === i ? ' hi' : ''));
    const n = el('span', '', String(v)); const ch = el('i', 'gsch');
    if (i) c.append(ch, n); else c.append(n, ch);
    return c;
  };
  row.append(val(0, a), el('div', 'gslab', label), val(1, b));
  return row;
}
function panel() {
  const O = outcome(), D = S.postStats && S.postStats.players ? S.postStats : null;
  const box = el('div', 'gs' + (S.gsGraph ? ' graph' : ''));
  const [L, R] = seatOrder();                                          // left / right seat: the same order as the maps and info boxes
  box.style.setProperty('--c0', seatColor(L)); box.style.setProperty('--c1', seatColor(R));
  const tg = el('div', 'gstg' + (S.gsGraph ? ' g' : '')); tg.setAttribute('role', 'group'); tg.setAttribute('aria-label', 'Comparison or graph');
  for (const [k, label] of [['table', 'Comparison'], ['graph', 'Graph']]) {
    const b = el('button'); b.type = 'button'; b.innerHTML = GS_ICON[k] + '<span>' + (k === 'table' ? 'Table' : 'Graph') + '</span><i class="chk"></i>'; b.title = label; b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', String((k === 'graph') === !!S.gsGraph));
    b.onclick = () => { if ((k === 'graph') !== !!S.gsGraph) { S.gsGraph = k === 'graph'; syncResults(); } };
    tg.append(b);
  }
  const hd = el('div', 'gshd');
  const conceded = O.conceded !== null && O.conceded !== undefined;
  // the new Elo and its change: a placeholder for now (the winner 130 +7, the other 116 -7); the real values will come from the index
  const eloAfter = (i) => { const w = O.winner === null || O.winner === i; return { elo: w ? 130 : 116, d: w ? 7 : -7 }; };
  const side = (i, pos) => {
    const h = el('div', 'gshh ' + (pos ? 'r' : 'l'));
    const who = el('div', 'gswho');
    const nm = el('span', 'gsnm', O.names[i]);
    const e = eloAfter(i), chip = el('span', 'gselo');
    const rgb = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(seatColor(i) || ''); if (rgb && Math.max(...[1, 2, 3].map((k) => parseInt(rgb[k], 16))) < 80) chip.classList.add('dk');   // a (nearly) black seat gets the solid grey chip
    chip.append(el('b', '', String(e.elo)), el('span', 'gsd ' + (e.d > 0 ? 'up' : e.d < 0 ? 'down' : ''), (e.d > 0 ? '+' : e.d < 0 ? '\u2212' : '\u00b1') + Math.abs(e.d)));
    chip.title = 'New Elo rating and its change';
    who.append(nm, chip); h.append(who);                                                                  // (the chip hangs below the name, so the name itself is centred like the score)
    return h;
  };
  const spine = el('div', 'gsspine'); const sc = el('div', 'gssc');
  const hi = (k) => (O.winner === null || O.winner === k ? '' : ' lo');
  sc.append(el('span', 'n' + hi(L), String(O.scores[L])), el('span', 'dash', '-'), el('span', 'n' + hi(R), String(O.scores[R])));
  spine.append(sc);
  hd.append(side(L, 0), spine, side(R, 1));
  const cats = S.gsGraph ? GRAPH_CATS.map(([t]) => [t, []]) : [overview(D), ...(D ? groups(D) : [])];       // (the graph view has its own categories: a click opens that graph, nothing scrolls)
  const rail = el('nav', 'gsrail'); rail.setAttribute('aria-label', 'Categories');
  const ul = el('ul'); const dot = el('i', 'gsdot'); ul.append(dot);
  const body = el('div', 'gsbody');
  const secs = [], lis = []; let pick = null;                                            // pick: the category last clicked in the rail (cleared by the reader's own scrolling)
  cats.forEach(([title, rows], i) => {
    const li = el('li'); const b = el('button', '', title); b.type = 'button'; li.append(b); ul.append(li); lis.push(li);
    const sec = el('section', 'gssec'); const sh = el('div', 'gssh'); sh.append(el('i'), el('span', '', title), el('i')); sec.append(sh, ...rows.map(gsRow));
    body.append(sec); secs.push(sec);
    b.onclick = () => { if (S.gsGraph) { if ((S.gsCat || 0) !== i) { S.gsCat = i; syncResults(); } return; } pick = i; body.scrollTo({ top: sec.offsetTop - 6, behavior: 'smooth' }); spy(); };
  });
  if (!D && !S.gsGraph) body.append(el('div', 'gswait', S.postStats && S.postStats.error ? 'The statistics could not be counted: the log of this table could not be read.' : 'Counting the statistics…'));
  rail.append(ul);
  const graph = el('div', 'gsgraph'); const gcat = GRAPH_CATS[S.gsCat || 0]; graph.append(gcat[1] ? raceSvg(race(gcat[1]), 1180, 760, true) : el('div', 'gsempty', gcat[0] + ': nothing to show here yet.'));
  let act = -1;
  const spy = () => {
    const y = body.scrollTop + 120; let i = 0;
    secs.forEach((s, k) => { if (s.offsetTop <= y) i = k; });
    // at the very bottom the last categories cannot reach the top (no empty room is left under them): the one clicked in the rail counts, else the last
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 2) i = pick !== null ? pick : secs.length - 1;
    if (i === act) return; act = i;
    lis.forEach((li, k) => li.classList.toggle('on', k === i));
    dot.style.top = (lis[i].offsetTop + lis[i].offsetHeight / 2) + 'px';
  };
  for (const ev of ['wheel', 'touchmove', 'keydown', 'pointerdown']) body.addEventListener(ev, () => { pick = null; }, { passive: true });
  body.addEventListener('scroll', () => { S.gsScroll = body.scrollTop; spy(); }, { passive: true });
  box.append(tg, hd, rail, S.gsGraph ? graph : body);
  requestAnimationFrame(() => { body.scrollTop = S.gsScroll || 0; act = -1; spy(); if (S.gsGraph) { act = S.gsCat || 0; lis.forEach((li, k) => li.classList.toggle('on', k === act)); dot.style.top = (lis[act].offsetTop + lis[act].offsetHeight / 2) + 'px'; } });
  return box;
}

// ---- the switch in the move bar and the results section; called at the end of every render ----------------------------------------------------------------------------------
function resultsSwitch() {
  const AL = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13 4l-6 6 6 6"/></svg>', AR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6"/></svg>';
  const mk = (cls, label, on, act, key) => { const b = el('button', 'rsflap ' + cls); b.type = 'button'; b.innerHTML = cls === 'fb' ? AL + '<span>' + label + '</span>' : '<span>' + label + '</span>' + AR; b.setAttribute('aria-pressed', String(on)); b.title = label + ' (' + key + ')'; b.onclick = act; return b; };
  const O = outcome(), text = el('span', 'rsswitchtext');
  text.textContent = 'Game over · ' + (O.winner === null ? 'tie ' : O.names[O.winner] + ' wins ') + O.scores[0] + ' : ' + O.scores[1];
  const w = el('div', 'rsswitchrow'); w.append(mk('fb', 'Final board', !S.results, closeResults, '←'), text, mk('fs', 'Game stats', S.results, openResults, '→'));
  return w;
}
export function syncResults() {
  if (FORK || PLAY || MINIGAME) return;
  if (S.step === lastStep()) loadStats();                                             // (read the log once the end is reached: a conceded game's switch needs it)
  const gate = atLast() && resultsAvailable();
  if (!gate) S.results = false;
  const pill = document.querySelector('.movepill');
  pill.classList.toggle('rsgate', gate);
  pill.querySelector('.rsswitchrow')?.remove();
  if (gate) pill.append(resultsSwitch());
  document.body.classList.toggle('showresults', S.results);
  document.documentElement.classList.toggle('showresults', S.results);        // (the page itself must not scroll while the table is shown: see parkposter.css)
  let sec = $('results');
  if (!S.results) { if (sec) sec.remove(); S.gsScroll = 0; return; }
  if (!sec) { sec = el('section', 'results'); sec.id = 'results'; $('zoos').after(sec); }
  sec.replaceChildren(panel());
  fitResults(); requestAnimationFrame(fitResults); setTimeout(fitResults, 400);
}
// The bottom edge of the table is the bottom edge of the last player info box in the sidebar (or the bottom of the window where the box is cut off): `--gsh` caps the height.
export function fitResults() {
  const gs = document.querySelector('.gs'), boxes = document.querySelectorAll('aside.sidebar .pp');
  if (!gs) return;
  const fitGraph = () => { const g = gs.querySelector('.gsgraph'); if (!g || !GRAPH_CATS[S.gsCat || 0][1]) return; const cs = getComputedStyle(g), w = g.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h = g.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom); if (w > 300 && h > 240) g.replaceChildren(raceSvg(race(GRAPH_CATS[S.gsCat || 0][1]), Math.round(w), Math.round(h), true)); };
  const k = S.scale || 1;
  gs.style.removeProperty('--gsh');
  if (!boxes.length) { fitGraph(); return; }
  const top = gs.getBoundingClientRect().top, bottom = boxes[boxes.length - 1].getBoundingClientRect().bottom;
  if (bottom > top) gs.style.setProperty('--gsh', Math.round((bottom - top) / k - 1) + 'px');          // (-1: the table's 1 px frame lies outside its edge)
  fitGraph();
}
window.addEventListener('resize', () => requestAnimationFrame(fitResults));
