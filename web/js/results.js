// [module] The results of a finished replay (BGA's "Game results" tab): at the last step the move bar becomes the switch Final board | Game stats, › on the last step opens
// the results and ‹ closes them. The statistics are counted in the browser from the raw log (`countStats`, fetched once when the end is reached), the score race (the graph
// view for now) from the replay's steps. Replays only (not forks, the sandbox, live games or the mini games).
import { $, el, seatColor, seatRawColor, seatText } from './util.js';
import { FORK, MINIGAME, PLAY, S, params, table } from './state.js';
import { framesOf } from './frames.js';
import { seatOrder } from './pov.js';
import { render } from './main.js';
import { ICON_IDS, SHOW_VALUE, iconUrl, moneyTile } from './icons.js';
import { adaptIcon, binderSvg } from './bonusart.js';

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
  return st.phase === 'over' || (S.postStats && S.postStats.synthetic) || (S.postStats && S.postStats.conceded !== null && S.postStats.conceded !== undefined);          // (synthetic: a fork that stopped before the end, scored where it stands)
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
// Only the table channel is read; identified Break effects are counted once. Thinking time is a placeholder for now: BGA's own clock is not in the log.
const UNIQUE = new Set(['adventure', 'amazon', 'aquarium', 'arcade', 'baboon', 'cable', 'entrance', 'excavation', 'hyena', 'meerkat', 'monkey', 'okapi', 'owl', 'penguin', 'polar-bear',
  'sea-turtle', 'underwater-tunnel', 'victory', 'water-playground', 'zoo-school']);          // (the sponsors' unique buildings, src/ark_nova/data/unique_shapes.json)
function countStats(raw) {
  const data = raw.data || raw, ids = (data.players || []).map((p) => String(p.id));
  const seatOf = (pid) => { const i = ids.indexOf(String(pid)); return i < 0 ? null : i; };
  const blank = () => ({ turns: 0, act: { build: 0, animals: 0, cards: 0, association: 0, sponsors: 0 }, xPass: 0, xGained: 0, xUsed: 0, money: 0, income: 0, kioskIncome: 0, spentOther: 0, onAnimals: 0, onBuildings: 0,
    onDonations: 0, onRange: 0, drawn: 0, fromRange: 0, snapped: 0, discarded: 0, animals: 0, sponsors: 0, released: 0, workers: 1, projects: 0, partners: 0, universities: 0, donations: 0,
    reputation: 0, breaks: 0, advances: 0, manualSnaps: 0, projectSnaps: 0, freeTwos: 0, clever: 0, enclosures: 0, kiosks: 0, pavilions: 0, unique: 0 });
  const P = [blank(), blank()], chose = [false, false];
  const seenBreaks = new Set(), seenBreakEffects = new Set();
  const normal = S.replay.normal_turns;
  if (normal) normal.forEach((t) => { P[t.seat].turns = Math.max(P[t.seat].turns, t.number); });
  let first = normal && normal.length ? normal[0].seat : null, ender = null, conceded = null, inBreak = false, moveId = null;
  // where a snap comes from (only two kinds are told apart): `sel` = the snap selector of a seat (gameStateChange id 59: its `source`, 'map bonus space' = a project snap, an animal's name = something else),
  // `proj` = snaps a break-income takeBonus "Snapping" (map bonus space) has granted and not used yet, `cards` = the snap state of the Cards action (id 34, descSuffix 'snap'), open until that action ends
  const sel = [null, null], proj = [0, 0], cards = [0, 0];
  const build = [null, null];                                                                           // the `source` of the seat's build selector (gameStateChange id 30): 'map bonus space' = a free enclosure from the conservation bonus slot
  // the display before a move: the last step of an earlier move id (a card played from the display costs its folder number)
  const steps = S.replay.steps;
  const displayBefore = (moveId) => { let st = null; for (const s of steps) { if (Number(s.move_id) < moveId) st = s.state; else break; } return st ? st.display || [] : []; };
  for (const pk of data.logs || []) {
    if (pk.move_id != null) moveId = Number(pk.move_id);
    if (!String(pk.channel || '').startsWith('/table/')) continue;
    for (const [eventIndex, e] of (pk.data || []).entries()) {
      const a = e.args && typeof e.args === 'object' && !Array.isArray(e.args) ? e.args : {}, log = e.log || '', ty = e.type;
      if (ty === 'advanceBreak' || (ty === 'getBonuses' && a.source === 'triggering break')) {
        // Resends keep their event UID, or their packet/offset if no UID exists.
        // Never identify effects by amount/result or move alone: equal effects can both execute.
        const identity = e.uid != null && e.uid !== '' ? ['uid', String(e.uid)]
          : pk.packet_id != null && pk.packet_id !== '' ? ['packet', String(pk.packet_id), eventIndex] : null;
        if (identity) {
          const key = JSON.stringify([pk.channel, moveId, ty, ...identity]);
          if (seenBreakEffects.has(key)) continue;
          seenBreakEffects.add(key);
        }
      }
      if (ty === 'gameStateChange' && a.id === 59 && a.args && typeof a.args === 'object') { const q = seatOf(a.active_player); if (q !== null) sel[q] = { src: a.args.source || null, suffix: a.args.descSuffix || '' }; }
      if (ty === 'gameStateChange' && a.id === 30 && a.args && typeof a.args === 'object') { const q = seatOf(a.active_player); if (q !== null) build[q] = a.args.source || null; }
      if (ty === 'gameStateChange' && a.id === 34 && a.args && typeof a.args === 'object' && a.args.descSuffix === 'snap' && a.args.nSnap > 0) { const q = seatOf(a.active_player); if (q !== null) cards[q] = a.args.nSnap; }
      if (ty === 'takeBonus' && a.source === 'map bonus space' && a.bonus_desc && a.bonus_desc.args && a.bonus_desc.args.bonus_type === 'Snapping') { const q = seatOf(a.player_id); if (q !== null) proj[q] += Number(a.bonus_desc.args.bonus_n) || 1; }
      if (ty === 'startBreak' || ty === 'finishBreak') {
        const boundary = ty + ':' + (moveId ?? ('event:' + (e.uid || pk.packet_id)));
        if (seenBreaks.has(boundary)) continue;
        seenBreaks.add(boundary);
        inBreak = ty === 'startBreak';
      }
      if (ty === 'advanceBreak') { const q = seatOf(a.player_id); if (q !== null) P[q].advances += Number(a.n) || 0; }       // every step of the break track a player caused (a Sponsors card for 5 = 5, Cards = 2, a jumping animal = its jump)
      const s = seatOf(a.player_id);
      if (ty === 'playerConcedeGame' && s !== null) conceded = s;
      if (s === null) continue;
      const p = P[s];
      if (ty === 'chooseActionCard') { sel[s] = null; if (first === null) first = s; const k = String(a.action_card_type || '').toLowerCase(); if (k in p.act) p.act[k] += 1; chose[s] = true; }
      else if (ty === 'actionCardCleanup' && log.includes('(Clever effect)')) p.clever += 1;                  // one resolved Clever = one action card moved by it, whatever its source (sponsor, bonus, animal, project ...)
      else if (ty === 'actionCardCleanup' && log.includes('finishing action')) { cards[s] = 0; sel[s] = null; if (!normal) p.turns += 1; if (!chose[s]) p.xPass += 1; chose[s] = false; }
      else if (ty === 'getBonuses') {
        const b = a.bonuses && typeof a.bonuses === 'object' ? a.bonuses : {}, x = b.xtoken || 0, m = b.money || 0;
        if (x > 0) p.xGained += x; else if (x < 0) p.xUsed -= x;
        if (m > 0) { p.money += m; if (inBreak) p.income += m; if (a.source === 'kiosk income') p.kioskIncome += m; }
        else if (m < 0) p.spentOther -= m;      // (every other payment: sponsor cards and their range cost, Venom, ...; an animal's price already includes its range cost)
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
      } else if (ty === 'gainMarked' || (ty === 'discardCards' && log.includes(' sells '))) {      // money for a mark on a card / money from selling cards: gained, but no getBonuses event
        const m = Number(a.bonuses && a.bonuses.money) || 0; if (m > 0) p.money += m;
      } else if (ty === 'pilferingMoney') {      // player_id gives the money, player_id2 receives it: spent by one, gained by the other
        const m = Number(a.bonuses && a.bonuses.money) || 0, r = seatOf(a.player_id2); if (m > 0) { p.spentOther += m; if (r !== null) P[r].money += m; }
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
        else if (log.includes('increases reputation')) p.reputation += 1;      // (only the Association task: the 2 reputation of a 5 / 8 conservation points bonus replaces no action)
        else if (log.includes('new Association worker') || log.includes('hires a new worker')) p.workers += 1;
        // every partner zoo / university tile that arrives on the player's board, whatever brought it: the Association task, the free one of 5 / 8 conservation points or of the end of the reputation
        // track, a placement bonus of the map (the tile's own slide has an empty log line, so the text of the task is not enough)
        for (const mp of Array.isArray(a.meeples) ? a.meeples : []) {
          const where = String(mp.location || ''), kind = String(mp.type || '');
          if (where.startsWith('partner_') && kind.startsWith('partner-')) p.partners += 1;
          else if (where.startsWith('university_') && kind.startsWith('fac-')) p.universities += 1;
        }
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
const GRAPH_CATS = [['Key events', 'events'], ['Points', 'score'], ['Points per turn', 'score_turn'], ['Conservation', 'conservation'], ['Appeal', 'appeal'], ['Reputation', 'reputation'], ['Money', 'money'], ['X-tokens', 'x_tokens']];
const metric = (p, key) => (key === 'cards' ? (Array.isArray(p.hand) ? p.hand.length : NaN) : p[key]);
function niceTicks(lo, hi) {
  const span = Math.max(1, hi - lo), raw = span / 5, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) || 10 * mag, out = [];
  for (let v = Math.floor(lo / step) * step; v < hi + step - 1e-9; v += step) { out.push(Math.round(v * 100) / 100); if (v >= hi - 1e-9) break; }
  return out;
}
function race(key = 'score') {
  // Compare both players at the last actual normal-turn endpoint numbered n.
  // Earlier payloads retain the legacy completed-turn fallback. Final scoring
  // is a separate End column; Break income is outside normal-turn samples.
  const structuredBreaks = Array.isArray(S.replay.break_markers);
  const byRound = new Map(), breaks = structuredBreaks ? S.replay.break_markers.map((b) => ({ turn: b.turn, seat: b.seat })) : [];
  const normal = S.replay.normal_turns;
  if (normal) {
    if (S.replay.turn_start) byRound.set(0, S.replay.turn_start.map((p) => metric(p, key)));
    // Keep the paired-player axis: Turn n is the last normal-turn endpoint
    // numbered n, after both players have taken it when both exist.
    normal.forEach((t) => byRound.set(t.number, t.players.map((p) => metric(p, key))));
  }
  let trigger = null, last = null;
  S.replay.steps.forEach((s) => {
    const st = s.state;
    if (st && Number.isFinite(st.turn) && st.players && st.players.every((p) => Number.isFinite(metric(p, key)))) {
      if (!normal && st.phase !== 'over') byRound.set(Math.ceil(st.turn / 2), st.players.map((p) => metric(p, key)));
      last = st;
    }
    const label = s.label || '';
    if (!structuredBreaks && /\(triggering break\)/.test(label)) trigger = S.replay.players.findIndex((pl) => label.startsWith(pl.name + ' '));
    // a break is drawn exactly between the last finished round and the next point, whenever in the round it starts
    if (!structuredBreaks && st && /^Starting a new break/m.test(label)) { breaks.push({ turn: st.turn_context ? st.turn_context.display + .5 : Math.floor((st.turn - 0.5) / 2) + 0.5, seat: trigger }); trigger = null; }
  });
  const turns = [...byRound.keys()].sort((a, b) => a - b), scores = turns.map((t) => byRound.get(t));
  const end = !!last && last.phase === 'over';
  if (end) { turns.push(turns[turns.length - 1] + 1); scores.push(last.players.map((p) => metric(p, key))); }
  const all = scores.flat();
  const ticks = key === 'score' ? [0, 25, 50, 75, 100] : niceTicks(Math.min(0, ...all), Math.max(1, ...all));
  const lo = key === 'score' ? Math.min(-20, ...all) : ticks[0], hi = key === 'score' ? Math.max(105, ...all) : ticks[ticks.length - 1];
  return { turns, scores, breaks, end, ticks, lo, hi, goal: key === 'score' };
}
// Points per turn: the points each player gained in every normal turn (the score race differenced; the start and the End column - the final scoring - are not turns of their own)
function racePerTurn() {
  const R = race('score'), turns = R.turns.slice(), scores = R.scores.map((v) => v.slice());
  if (turns[0] !== 0) { turns.unshift(0); scores.unshift([0, 0]); }
  const last = turns.length - (R.end ? 1 : 0), t = [], sc = [];
  const nt = S.replay.normal_turns, has = (p, n) => !Array.isArray(nt) || nt.some((x) => x.seat === p && x.number === n);          // (a player without a turn n - the starting player's extra last turn - has no point there)
  for (let i = 1; i < last; i++) { t.push(turns[i]); sc.push(scores[i].map((v, p) => (has(p, turns[i]) ? v - scores[i - 1][p] : null))); }
  if (!t.length) return null;
  const all = sc.flat().filter((v) => v !== null), ticks = niceTicks(Math.min(0, ...all), Math.max(1, ...all));
  return { noPill: true, axis: [turns[0], turns[turns.length - 1]], turns: t, scores: sc, breaks: R.breaks.filter((b) => b.turn >= t[0] - 1 && b.turn <= t[t.length - 1] + 1), end: false, ticks, lo: ticks[0], hi: ticks[ticks.length - 1], goal: false };
}
let raceSeq = 0;
// ---- key events: when each player upgraded an action card, gained a worker, and what each Association action took --------------------------------------------------------------
// Three lanes on the turn axis of the score race (upgrades, workers, the Association actions; that lane is taller), without any lane text, each with a row per player tinted in the seat colour. An upgrade is the
// action card icon framed in the owner's colour with a II badge; a worker is the bare meeple in the seat colour; a partner zoo / university is its exact token, reputation the reputation icon,
// a supported project the conservation project icon. Several events of one row in the same round stack below each other.
const KE_UP = { animals: 'r3c7', association: 'r3c8', build: 'r3c9', cards: 'r3c10', sponsors: 'r3c12' }, KE_TYPE = { animals: 'Animals', association: 'Association', build: 'Build', cards: 'Cards', sponsors: 'Sponsors' };
const KE_UNI = { 'fac-rep-hand': 'Hand size', 'fac-science-rep': '2 reputation', 'fac-science-science': '2 science', 'fac-science-herbivore': 'Herbivores', 'fac-science-predator': 'Predators', 'fac-science-bird': 'Birds', 'fac-science-reptile': 'Reptiles', 'fac-science-primate': 'Primates', 'fac-science-marine': 'Sea Animals' };       // (fac-generic, the university before its kind is chosen, never becomes an event)
function keyEvents() {
  const names = S.replay.players.map((p) => p.name), seatOf = (n) => names.indexOf(n), ev = [];
  const held = (p) => { const m = new Map(); p.tokens.forEach((t) => { if (/^(partner|university)_/.test(t.location)) m.set(t.type, (m.get(t.type) || 0) + 1); }); return m; };
  let prev = null;
  const cpAt = new Map(), pend = {};                                                                      // 5 / 8 conservation point bonuses by 'move_id:seat' (view.cp_bonuses), the gift waiting for its partner zoo / university
  (S.replay.cp_bonuses || []).forEach((c) => cpAt.set(c.move_id + ':' + c.seat, c));
  S.replay.steps.forEach((s) => {
    const st = s.state, label = s.label || '';
    if (!st || !Number.isFinite(st.turn) || !st.players) return;
    const ctx = st.turn_context;
    // Effects in a normal turn belong to its owner, including temporary
    // opponent choices. Break choices remain neutral, between axis columns.
    const round = ctx ? (ctx.phase === 'turn' ? ctx.number : ctx.phase === 'break' ? ctx.display + .5 : null) : Math.ceil(st.turn / 2);
    if (round === null) { prev = st; return; }
    for (const m of label.matchAll(/^(.+?) upgrades (Animals|Association|Build|Cards|Sponsors)II\b/gm)) {
      const seat = seatOf(m[1].replace(/^.* · /, ''));
      if (seat >= 0) ev.push({ seat, round, lane: 0, kind: 'upgrade', type: m[2].toLowerCase() });
    }
    const firstW = ev.length;
    for (const m of label.matchAll(/(?:^|· )([^·\n]+?) gains a new Association worker/gm)) {
      const seat = seatOf(m[1]);
      if (seat >= 0) ev.push({ seat, round, lane: 1, kind: 'worker' });
    }
    for (const m of label.matchAll(/(?:^|· )([^·\n]+?) gets 1 x add-worker(?! \()/gm)) {                  // the 2 conservation points bonus (choice: worker or upgrade); the reputation track's has "(reputation track bonus)"
      const seat = seatOf(m[1]), w = ev.slice(firstW).filter((e) => e.kind === 'worker' && e.seat === seat).pop();
      if (w) w.cp = true;
    }
    for (const m of label.matchAll(/(?:^|· )([^·\n]+?) hires a new worker \(Association2 effect\)/gm)) {            // the unupgraded Association2 card: a worker instead of a project
      const seat = seatOf(m[1]);
      if (seat >= 0) ev.push({ seat, round, lane: 1, kind: 'worker' }, { seat, round, lane: 2, kind: 'hire' });
    }
    for (const m of label.matchAll(/(?:^|· )([^·\n]+?) supports a conservation project on the \w+ slot : ([^·\n]+)/gm)) {
      const seat = seatOf(m[1]);
      if (seat >= 0) ev.push({ seat, round, lane: 2, kind: 'project', name: m[2].trim() });
    }
    for (const m of label.matchAll(/(?:^|· )([^·\n]+?) increases reputation/gm)) { const seat = seatOf(m[1]); if (seat >= 0) ev.push({ seat, round, lane: 2, kind: 'reputation' }); }
    for (const m of label.matchAll(/(?:^|· )([^·\n]+?) gets (?:1 x (Fac|Partner-Zoo)|\d+ x (reputation))(?! \()/gm)) {       // the free partner zoo / university / reputation of 5 or 8 conservation points
      const seat = seatOf(m[1]), c = cpAt.get(s.move_id + ':' + seat);
      if (seat < 0 || !c) continue;
      if (m[3]) ev.push({ seat, round, lane: 2, kind: 'reputation', cp: c.threshold }); else pend[seat] = c.threshold;
    }
    if (prev) st.players.forEach((p, seat) => {                                                         // a partner zoo / university is a token that arrived on the player's board (counted by type)
      const a = held(prev.players[seat]), b = held(p);
      b.forEach((n, type) => { for (let i = a.get(type) || 0; i < n; i++) { ev.push({ seat, round, lane: 2, kind: type.startsWith('partner') ? 'partner' : 'university', type, cp: pend[seat] }); delete pend[seat]; } });
    });
    prev = st;
  });
  return ev;
}
function shield(g, bx, by, r, n) {                                                                   // the conservation shield with a number (the number style of the boards)
  g.append(sv('image', { href: iconUrl(ICON_IDS.conservation), x: bx - r, y: by - r, width: r * 2, height: r * 2 }));
  const t = sv('text', { x: bx, y: by + r * .38, class: 'kecp', 'text-anchor': 'middle', style: `font-size:${r * 1.45}px` }); t.textContent = String(n); g.append(t);
}
// ---- key events as an accordion: six event types, each a strip (folded: a dot per event) or a lane (open: a row per player with the events as icons) --------------------------
// The view (`keView`) is an HTML box the size of the graph area with three layers: at the back an SVG with what stays put (the break mugs and lines, the hover band, the base line and the
// turn chip, all exactly where the other graphs have them: PAD, the time axis X of `raceSvg`), in the middle the list of the six items (scrolls when more than two lanes are open), in front an SVG
// for the tooltip. Order and open types are kept in `S.keOrder` / `S.keOpen` while the page lives only (not saved: every new session starts with the default order and everything folded); the scroll position likewise.
// Upgrades, workers and the Association are drawn exactly as before (`keDraw`, the sizes of the old lanes); the three new types (placement bonuses, enclosures, icons gained) are
// placed by `kePlace` (all 36 px, stacks of more than three in two columns, overlapping when they do not fit).
const KE_PAD = { l: 60, r: 78, t: 50, b: 46 };                                                    // (the big graphs' padding, raceSvg: the turns and breaks lie where they lie on the Points graph)
const KE_TABW = 46, KE_STRIP = 40, KE_GAP = 8, KE_LL = 8, KE_TOP = 60;                             // tab width, strip height, gap between items, the list's left edge and top (the old lanes' top)
const KE_TYPES = [                                                                                  // the tab icons are placeholders
  { name: 'Upgrades', icon: () => iconUrl(ICON_IDS['bonus:upgrade-card']) },
  { name: 'Workers', icon: () => iconUrl(ICON_IDS['bonus:Worker']) },
  { name: 'Association', icon: () => iconUrl(ICON_IDS['bonus:Partner-Zoo']) },
  { name: 'Placement bonuses', icon: () => iconUrl(ICON_IDS.pentagon) },
  { name: 'Enclosures', icon: () => '/badges/Enclosure.webp' },
  { name: 'Species icons', icon: () => '/badges/Species.webp' },
  { name: 'Continent icons', icon: () => '/badges/Continents.webp' },
  { name: 'Terrain icons', icon: () => '/badges/Terrain.webp', badge: true },
  { name: 'Science icons', icon: () => '/badges/Science.webp', badge: true },
];
const KE_ICON_LANE = { Africa: 6, Americas: 6, Asia: 6, Australia: 6, Europe: 6, Water: 7, Rock: 7, Science: 8 };     // the icon lanes: continents, terrain, science; every other icon (the species) is lane 5
const KE_OUTLINE = 1.5;                                                                            // the width (px) of the white outline round the tab icons
const KE_OLD_ICON = 44;                                                                            // the size (px) of every upgrade, worker and Association event, the same in every window size
const KE_ICON = 36;                                                                                // the size (px) of every event of the new lane types, the same in every window size
const KE_ENCL = /^(size-[1-5]|petting-zoo|reptile-house|large-bird-aviary|small-aquarium|large-aquarium|kiosk|pavilion)$/;       // standard and special enclosures, kiosks and pavilions (no sponsor buildings)
const KE_ENCL_NAME = { 'petting-zoo': 'Petting Zoo', 'reptile-house': 'Reptile House', 'large-bird-aviary': 'Large Bird Aviary', 'small-aquarium': 'Small Aquarium', 'large-aquarium': 'Large Aquarium', kiosk: 'Kiosk', pavilion: 'Pavilion' };
const KE_LOGGED = new Set(['money', 'xtoken', 'reputation', 'appeal']);                          // placement bonuses the log names ("gains 5 money (placement bonus)"); the others are read off the covered hexes
const KE_BONUS_NAME = { money: 'money', xtoken: 'X-token', reputation: 'reputation', appeal: 'appeal', 'take-in-range-or-deck': 'a card', Clever: 'Clever', 'bonus-sponsor': 'a sponsor', kiosk: 'a free kiosk', wave: 'Wave',
  store: 'Store', conceal: 'Conceal', 'shark-attack': 'Shark Attack', Mark: 'Mark', adapt: 'Adapt', Fac: 'a university', 'extra-shift': 'Extra Shift', Multiplier: 'Multiplier', Scavenging: 'Scavenging', 'Partner-Zoo': 'a partner zoo' };
const keRound = (st) => { const ctx = st.turn_context; return ctx ? (ctx.phase === 'turn' ? ctx.number : ctx.phase === 'break' ? ctx.display + .5 : null) : Math.ceil(st.turn / 2); };       // (the rule of keyEvents)
// The three new types, from the steps: placement bonuses (lane 3), new enclosures (lane 4), icons gained (lane 5). The setup (the first state) gives none.
function keMoreEvents() {
  const names = S.replay.players.map((p) => p.name), seatOf = (n) => names.indexOf(n), ev = [];
  const maps = S.replay.maps || [];
  let prev = null; const ever = [new Set(), new Set()], built = [new Set(), new Set()];
  S.replay.steps.forEach((s) => {
    const st = s.state, label = s.label || '';
    if (!st || !Number.isFinite(st.turn) || !st.players) return;
    const round = keRound(st), first = !prev;
    for (const m of label.matchAll(/(?:^|· )([^·\n]+?) gains (\d+) (money|xtoken|reputation|appeal) \(placement bonus\)/gm)) {
      const seat = seatOf(m[1]);
      if (seat >= 0 && round !== null) ev.push({ seat, round, lane: 3, kind: 'bonus', type: m[3], value: +m[2] });
    }
    const rebuilt = /\((?:Reconstruction|Cut Down|Conference)\)/i.test(label), cutDown = /\(Cut Down effect\)/i.test(label);
    st.players.forEach((p, seat) => {
      const lay = p.bonus_layout || (maps[seat] && maps[seat].placement_bonuses) || [], bon = new Map(lay.map((b) => [b.x + ',' + b.y, b.bonus || {}]));
      const noBonus = (p.sponsors || []).some((k) => String(k).startsWith('S280'));                // (S280: no placement bonuses any more, engine/game.py)
      if (cutDown && prev && prev.players[seat]) {                                                // an enclosure cut down: it is gone from the map, drawn paled in the Enclosures lane (like a lost icon)
        const nowKeys = new Set((p.buildings || []).map((b) => b.type + ':' + b.x + ':' + b.y));
        for (const b of prev.players[seat].buildings || []) {
          const key = b.type + ':' + b.x + ':' + b.y;
          if (nowKeys.has(key) || !KE_ENCL.test(b.type) || !built[seat].has(key)) continue;
          built[seat].delete(key); if (round !== null) ev.push({ seat, round, lane: 4, kind: 'building', type: b.type, lost: true });
        }
      }
      for (const b of p.buildings || []) {
        for (const c of b.cells || []) {                                                          // a bonus hex covered for the first time (a building that is put back does not give it again)
          const k = c[0] + ',' + c[1];
          if (ever[seat].has(k)) continue;
          ever[seat].add(k);
          const bn = bon.get(k);
          if (!first && !noBonus && round !== null && bn && bn.type && !KE_LOGGED.has(bn.type)) ev.push({ seat, round, lane: 3, kind: 'bonus', type: bn.type, value: bn.value || 1 });
        }
        const key = b.type + ':' + b.x + ':' + b.y;
        if (built[seat].has(key)) continue;
        built[seat].add(key);
        if (!first && !rebuilt && round !== null && KE_ENCL.test(b.type)) ev.push({ seat, round, lane: 4, kind: 'building', type: b.type });
      }
      if (!first && round !== null && prev.players[seat]) {
        const a = prev.players[seat].icons || {}, b = p.icons || {};
        for (const ic of new Set([...Object.keys(a), ...Object.keys(b)])) {                     // gained and lost (a lost icon is drawn greyed)
          const was = a[ic] || 0, now = b[ic] || 0, lane = KE_ICON_LANE[ic] || 5;
          for (let i = was; i < now; i++) ev.push({ seat, round, lane, kind: 'icon', type: ic });
          for (let i = now; i < was; i++) ev.push({ seat, round, lane, kind: 'icon', type: ic, lost: true });
        }
      }
    });
    prev = st;
  });
  return ev;
}
const keMix = (hex, k) => { const n = parseInt(String(hex).replace('#', ''), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k)); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); };
// One event of the three old types, drawn as keSvg drew it (sz: the icon size of its cell, wr: the row height of the workers lane, for the size of the shields)
function keDraw(g, e, x, cy, sz, GS, wr) {
  const c = GS[e.seat].df, ol = inkOn(c) === '#10222a' ? '#06222b' : '#f6edd3';                  // (the outline: cream, dark on the bright seat colours white / yellow)
  if (e.kind === 'upgrade') {
    const q = sz * .9;                                                                              // (a dark casing, the owner's colour as the frame, a cream II chip: readable on every seat colour)
    g.append(sv('rect', { x: x - q / 2 - 2, y: cy - q / 2 - 2, width: q + 4, height: q + 4, rx: q * .24 + 2, fill: ol }), sv('rect', { x: x - q / 2, y: cy - q / 2, width: q, height: q, rx: q * .24, fill: c }),
      sv('image', { href: iconUrl(KE_UP[e.type]), x: x - q * .4, y: cy - q * .4, width: q * .8, height: q * .8 }),
      sv('rect', { x: x + q * .1, y: cy + q * .14, width: q * .52, height: q * .38, rx: q * .1, fill: '#f6edd3', stroke: '#06222b', 'stroke-width': 1.6 }));
    const ii = sv('text', { x: x + q * .36, y: cy + q * .43, class: 'keii', 'text-anchor': 'middle', style: `font-size:${q * .3}px` }); ii.textContent = 'II'; g.append(ii);
  } else if (e.kind === 'worker') {
    const raw = String(seatRawColor(e.seat) || '').replace('#', '').toLowerCase();
    g.append(sv('image', { href: '/workers/' + raw + '.webp', x: x - sz / 2, y: cy - sz / 2, width: sz, height: sz, class: GS[e.seat].black ? 'kerep' : '' }));
    if (e.cp) shield(g, x + sz * .3, cy + sz * .3, KE_OLD_ICON * .27, 2);                // taken as the 2 conservation points bonus instead of an upgrade: a small shield with 2 at the bottom right
  } else {
    const hire = e.kind === 'hire', id = e.kind === 'project' ? 'r11c6' : e.kind === 'reputation' ? ICON_IDS['bonus:reputation'] : ICON_IDS[e.kind === 'partner' ? e.type.replace('partner-', '') : e.type] || ICON_IDS['bonus:Fac'];
    g.append(sv('image', { href: hire ? '/action_icons/association_2_1.webp' : iconUrl(id), x: x - (hire ? sz * .4 : sz / 2), y: cy - (hire ? sz * .4 : sz / 2), width: hire ? sz * .8 : sz, height: hire ? sz * .8 : sz, class: e.kind === 'reputation' || hire ? 'kerep' : '' }));          // (no owner mark: the row already says whose it is)
  }
  if (e.lane === 2 && e.cp) shield(g, x + sz * .4, cy + sz * .4, KE_OLD_ICON * .27, e.cp);                  // a free gift of 5 / 8 conservation points, not an Association action
}
// One event of the new types: the placement bonus as its icon (no pentagon), the enclosure's picture, the icon's round badge
function keDrawNew(g, e, x, cy, sz) {
  if (e.lost && e.kind === 'building') { const root = g; g = sv('g', { class: 'kelostg' }); root.append(g); }          // (a cut down enclosure: everything in a paled group)
  const num = (v, y, fs) => { const t = sv('text', { x, y, class: 'kebn', 'text-anchor': 'middle', style: `font-size:${fs}px;stroke-width:${fs * .2}px` }); t.textContent = String(v); g.append(t); };
  if (e.kind === 'icon') g.append(sv('image', { href: '/badges/' + e.type + '.webp', x: x - sz / 2, y: cy - sz / 2, width: sz, height: sz, class: e.lost ? 'kebadge kelost' : 'kebadge' }));          // (the square badge cut to a round one)
  else if (e.kind === 'building') {                                                       // drawn as the building's own icon (as on the cards), not the board piece
    const T = e.type, ic = (href, w, h, st) => g.append(sv('image', { href, x: x - w / 2, y: cy - h / 2, width: w, height: h, preserveAspectRatio: 'xMidYMid meet', ...(st ? { style: st } : {}) }));
    const num = (v, dx, st) => { const t = sv('text', { x: x + dx, y: cy + sz * .2, 'text-anchor': 'middle', style: `font-family:'Park Num',system-ui,sans-serif;font-size:${sz * .58}px;fill:#fff;pointer-events:none;${st}` }); t.textContent = String(v); g.append(t); };
    if (/^size-/.test(T)) { ic(iconUrl('r9c3'), sz * 1.05, sz * .91); num(T.slice(5), 0, 'stroke:none'); }          // brown hexagon with its size
    else if (T === 'large-bird-aviary') ic(iconUrl('r9c9'), sz * 1.3, sz * 1.3);
    else if (T === 'petting-zoo') ic(iconUrl('r9c10'), sz * 1.3, sz * 1.3);
    else if (T === 'reptile-house') ic(iconUrl('r9c11'), sz * 1.3, sz * 1.3);
    else if (T === 'small-aquarium' || T === 'large-aquarium') { ic(iconUrl('r8c14'), sz * 1.1, sz * 1.25); num(T === 'small-aquarium' ? 2 : 5, -sz * .112, `stroke:#0a3a58;stroke-width:${sz * .075}px;paint-order:stroke;stroke-linejoin:round`); }   // 2 / 5 in the water, dark-blue outline
    else if (T === 'kiosk') ic('/icons_hd/placement-approved/kiosk.svg', sz * 1.05, sz * .91, 'filter:brightness(.655)');   // the sharp approved hexagon, white turned grey
    else if (T === 'pavilion') ic('/icons_hd/placement-approved/pavilion.svg', sz * 1.05, sz * .91);
  }
  else if (e.type === 'money') { moneyTile(g, x, cy, sz * .9); g.lastChild.style.strokeWidth = sz * .9 / 48 * 3.5; num(e.value, cy + sz * .26, sz * .66); }
  else if (e.type === 'conceal') g.append(binderSvg(x, cy, sz / 82));
  else if (e.type === 'adapt') adaptIcon(g, x, cy, e.value || 1, sz / 56);
  else {
    const id = e.type === 'xtoken' && e.value > 1 ? ICON_IDS['bonus:xtoken_num'] || ICON_IDS['bonus:xtoken'] : ICON_IDS['bonus:' + e.type];
    if (id) g.append(sv('image', { href: iconUrl(id), x: x - sz / 2, y: cy - sz / 2, width: sz, height: sz, preserveAspectRatio: 'xMidYMid meet', class: e.type === 'reputation' ? 'kerep' : '' }));
    if (SHOW_VALUE.has(e.type) || (e.type === 'xtoken' && e.value > 1) || (e.type === 'Scavenging' && e.value > 1)) num(e.value, cy + sz * .3, sz * .6);
  }
}
const keTip = (e) => {
  if (e.kind === 'bonus') return 'Placement bonus: ' + (e.value > 1 || KE_LOGGED.has(e.type) ? e.value + ' ' : '') + (KE_BONUS_NAME[e.type] || e.type);
  if (e.kind === 'building') return (e.lost ? 'Cut down: ' : 'Built: ') + (/^size-/.test(e.type) ? 'size-' + e.type.slice(5) + ' enclosure' : KE_ENCL_NAME[e.type] || e.type);
  if (e.kind === 'icon') return (e.lost ? 'Icon lost: ' : 'Icon: ') + (e.type === 'SeaAnimal' ? 'Sea Animal' : e.type);
  let what = e.kind === 'upgrade' ? KE_TYPE[e.type] + ' upgraded to II' : e.kind === 'worker' ? (e.cp ? 'Gained a worker (2 CP bonus)' : 'Gained a worker') : e.kind === 'project' ? 'Supported a project: ' + e.name
    : e.kind === 'hire' ? 'Hired a worker instead of a project' : e.kind === 'reputation' ? (e.cp ? 'Took reputation (' + e.cp + ' CP bonus)' : 'Took reputation') : e.kind === 'partner' ? 'Partner zoo: ' + e.type.replace('partner-', '') : 'University' + (KE_UNI[e.type] ? ': ' + KE_UNI[e.type] : '');
  if (e.cp && (e.kind === 'partner' || e.kind === 'university')) what += ' (' + e.cp + ' CP bonus)';
  return what;
};
let keScroll = 0, keDragging = false;
function keLayout() {                                                                               // the order and the open types, checked (the stored values are used only when they are valid)
  if (Array.isArray(S.keOrder) && S.keOrder.length === 6 && [0, 1, 2, 3, 4, 5].every((i) => S.keOrder.includes(i))) {        // saved before the icons were split in four: the old 'Icons gained' (5) becomes the four icon types in its place, species open if it was
    S.keOrder = S.keOrder.flatMap((i) => (i === 5 ? [5, 6, 7, 8] : [i]));
  }
  const ord = Array.isArray(S.keOrder) && S.keOrder.length === KE_TYPES.length && KE_TYPES.every((_, i) => S.keOrder.includes(i)) ? S.keOrder.slice() : KE_TYPES.map((_, i) => i);
  const open = new Set((Array.isArray(S.keOpen) ? S.keOpen : []).filter((i) => Number.isInteger(i) && i >= 0 && i < KE_TYPES.length));
  return { ord, open };
}
const keSave = (ord, open) => { S.keOrder = ord.slice(); S.keOpen = [...open].sort((a, b) => a - b); document.dispatchEvent(new Event('kelayout')); };
function keView(w, h) {
  const R = race('score'), t0 = R.turns[0] || 0, t1 = R.turns[R.turns.length - 1] || 1, pad = KE_PAD;
  const inPlot = (e) => e.round >= R.turns[0] && e.round <= R.turns[R.turns.length - 1];
  const ev = keyEvents().filter(inPlot).concat(keMoreEvents().filter(inPlot));
  const X = (t) => pad.l + (w - pad.l - pad.r) * (t - t0) / Math.max(1, t1 - t0), yb = h - pad.b;
  const GS = [graphStyle(0), graphStyle(1)], uid = 'ke' + (++raceSeq);
  const wrap = el('div', 'kewrap'); wrap.style.width = w + 'px'; wrap.style.height = h + 'px';
  // the back: break lines and mugs as on the other graphs, the hover band, the base line, the chip
  const back = sv('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, class: 'rsrace-svg big keback' });
  const defs = sv('defs'), fade = sv('linearGradient', { id: uid + 'f', gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: pad.t, y2: h - pad.b });
  fade.append(sv('stop', { offset: 0, 'stop-color': '#f8edcb', 'stop-opacity': .45 }), sv('stop', { offset: 1, 'stop-color': '#f8edcb', 'stop-opacity': .15 }));
  defs.append(fade); back.append(defs);
  const hover = sv('rect', { class: 'kehov', visibility: 'hidden' }); back.append(hover);
  back.append(sv('line', { x1: KE_LL, x2: w - 4, y1: yb, y2: yb, class: 'kebase' }));
  R.breaks.forEach((b) => {
    const known = b.seat !== null && b.seat >= 0, x = X(b.turn), cy = pad.t - 22;
    back.append(sv('line', { x1: x, x2: x, y1: pad.t - 2, y2: h - pad.b, class: 'rsbreak', stroke: `url(#${uid}f)` }));
    back.append(sv('circle', { cx: x, cy, r: 16.8, fill: known ? GS[b.seat].df : '#f8edcb' }));
    back.append(mugIcon(known ? GS[b.seat].mf : '#2a2a2a', x, cy, 21.8));
  });
  const cw = (w - pad.l - pad.r) / Math.max(1, t1 - t0), chip = sv('g', { class: 'rschip', visibility: 'hidden' }), cr = sv('rect', { class: 'rschipbg' }), ct = sv('text', { class: 'rschipt', 'text-anchor': 'middle' }), tick = sv('line', { class: 'rsguide', y1: yb - 9, y2: yb + 7 });
  chip.append(tick, cr, ct); back.append(chip);
  // the list
  const list = el('div', 'kelist'), listH = yb - 4 - KE_TOP;
  Object.assign(list.style, { left: KE_LL + 'px', top: KE_TOP + 'px', width: (w - KE_LL - 4) + 'px', height: listH + 'px' });
  const laneH = Math.max(120, (listH - 4 * KE_STRIP - 5 * KE_GAP) / 2), iw = w - KE_LL - 4 - 10;       // (two lanes and four strips fill the list; 10: the scrollbar's room, kept even when it does not show)
  const rowsOf = (H) => [0, 1].map((seat) => { const k = Math.max(0, seatOrder().indexOf(seat)), y0 = 6 + (H - 12) * k / 2, rh = (H - 12) / 2 - 3; return { seat, y0, rh, cy: y0 + rh / 2 }; });
  const wr = (laneH - 12) / 2 - 3;
  // the front: the tooltip
  const front = sv('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, class: 'rsrace-svg big kefront' });
  const tip = sv('g', { class: 'ketip', visibility: 'hidden', 'pointer-events': 'none' }), tb = sv('rect', { rx: 10, class: 'ketipbg' }), t1el = sv('text', { class: 'ketip1' }), t2el = sv('text', { class: 'ketip2' });
  tip.append(tb, t1el, t2el); front.append(tip);
  const scaleOf = () => { const r = wrap.getBoundingClientRect(); return { r, k: r.width / w || 1 }; };
  const showTip = (g, e) => {
    const { r, k } = scaleOf(), b = g.getBoundingClientRect(), x0 = (b.left - r.left) / k, x1 = (b.right - r.left) / k, cy = ((b.top + b.bottom) / 2 - r.top) / k;
    t1el.textContent = keTip(e); t2el.textContent = 'Turn ' + e.round + ' · ' + S.replay.players[e.seat].name;
    const wd = Math.max(t1el.getComputedTextLength(), t2el.getComputedTextLength()) + 28, th = 54;
    let tx = x1 + 10, ty = cy - th / 2; if (tx + wd > w - 4) tx = x0 - 10 - wd; ty = Math.max(4, Math.min(h - th - 4, ty));
    tb.setAttribute('x', tx); tb.setAttribute('y', ty); tb.setAttribute('width', wd); tb.setAttribute('height', th);
    [t1el, t2el].forEach((t, i) => { t.setAttribute('x', tx + 14); t.setAttribute('y', ty + 24 + i * 20); });
    tip.setAttribute('visibility', 'visible'); g.classList.add('on');
  };
  const hideTip = (g) => { tip.setAttribute('visibility', 'hidden'); g.classList.remove('on'); };
  const chev = (up) => { const b = el('button', 'kechev' + (up ? ' up' : '')); b.type = 'button'; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); return b; };
  function itemOf(t, open, ord) {
    const lane = open.has(t), H = lane ? laneH : KE_STRIP, it = el('div', 'keitem ' + (lane ? 'lane' : 'strip')); it.dataset.t = t; it.style.height = H + 'px';
    const tab = el('button', 'ketab'); tab.type = 'button'; tab.title = KE_TYPES[t].name;
    tab.setAttribute('aria-expanded', String(lane)); tab.setAttribute('aria-label', KE_TYPES[t].name + (lane ? ', open' : ', folded'));
    const disc = el('span', 'kedisc'), im = el('img'); im.src = KE_TYPES[t].icon(); if (KE_TYPES[t].badge) im.className = 'kebdg'; im.alt = ''; im.draggable = false; disc.append(im); tab.append(disc);
    if (lane) tab.append(el('span', 'kegrip'));
    const s = sv('svg', { class: 'keplot', width: iw, height: H }), g = sv('g', { transform: `translate(${-KE_LL} 0)` }); s.append(g);
    const mine = ev.filter((e) => e.lane === t);
    if (!lane) {
      mine.forEach((e) => {
        const k = Math.max(0, seatOrder().indexOf(e.seat)), c = GS[e.seat].black ? GS[e.seat].core : keMix(GS[e.seat].c, .28);
        g.append(sv('circle', e.lost ? { cx: X(e.round), cy: k ? 27 : 13, r: 2.75, fill: 'none', stroke: c, 'stroke-width': 1.5, class: 'kedot' } : { cx: X(e.round), cy: k ? 27 : 13, r: 3.5, fill: c, class: 'kedot' }));          // (a lost icon: a ring)
      });
    } else {
      rowsOf(H).forEach((row) => g.append(sv('rect', { x: KE_LL + KE_TABW + 6, y: row.y0, width: iw - KE_TABW - 12, height: row.rh, rx: 8, fill: GS[row.seat].c, class: 'kerow' })));
      const rows = rowsOf(H), cells = new Map();
      mine.forEach((e) => { const k = e.seat + ':' + e.round; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(e); });
      cells.forEach((cl) => {
        const e0 = cl[0], row = rows.find((r) => r.seat === e0.seat), rh = row.rh, n = cl.length;
        let place;
        if (t <= 2) {                                                                                     // the old types: their sizes and stacking unchanged
          const sz = KE_OLD_ICON, step = t === 2 ? Math.max(sz * .3, Math.min(sz * 1.15, (rh - 8 - sz) / Math.max(1, n - 1))) : sz * .62;          // (one size, whatever the window; an Association stack that does not fit overlaps more)
          place = (i) => ({ x: X(e0.round), cy: row.cy + (i - (n - 1) / 2) * (n > 1 ? step : 0), sz });
        } else {                                                                                          // the new ones: 36 px; more than three in two columns; overlapping when the stack does not fit
          const cols = n > 3 ? 2 : 1, per = Math.ceil(n / cols), sz = KE_ICON;                                // (one size for every icon, whatever the window and the number in the turn: a stack that does not fit overlaps more)
          const step = per > 1 ? Math.max(sz * .3, Math.min(sz * .95, (rh - 6 - sz) / (per - 1))) : 0;
          place = (i) => { const c = Math.floor(i / per), k = i % per, m = Math.min(per, n - c * per); return { x: X(e0.round) + (cols > 1 ? (c - .5) * sz * .85 : 0), cy: row.cy + (k - (m - 1) / 2) * step, sz }; };
        }
        cl.forEach((e, i) => {
          const p = place(i), eg = sv('g', { class: 'keev' }); eg.dataset.r = e.round;
          if (t <= 2) keDraw(eg, e, p.x, p.cy, p.sz, GS, wr); else keDrawNew(eg, e, p.x, p.cy, p.sz);
          eg.append(sv('rect', { x: p.x - p.sz / 2, y: p.cy - p.sz / 2, width: p.sz, height: p.sz, fill: 'transparent' }));
          eg.addEventListener('pointerenter', () => { if (!keDragging) showTip(eg, e); });
          eg.addEventListener('pointerleave', () => hideTip(eg));
          g.append(eg);
        });
      });
    }
    it.append(s, tab, chev(lane));
    // open / fold: a click on a strip, on a lane's tab or on the arrow; a press that moves more than 6 px drags the item (the whole strip, a lane by its tab)
    const toggle = () => { if (open.has(t)) open.delete(t); else open.add(t); keSave(ord, open); fill(); };
    it.querySelector('.kechev').addEventListener('click', (e2) => { e2.stopPropagation(); toggle(); });
    tab.addEventListener('click', (e2) => { if (e2.detail === 0) toggle(); });                       // (Enter / Space on the focused tab; the pointer is handled below)
    tab.addEventListener('keydown', (e2) => {
      if (!e2.altKey || (e2.key !== 'ArrowUp' && e2.key !== 'ArrowDown')) return;
      e2.preventDefault(); e2.stopPropagation();
      const i = ord.indexOf(t), j = i + (e2.key === 'ArrowUp' ? -1 : 1); if (j < 0 || j >= ord.length) return;
      ord.splice(i, 1); ord.splice(j, 0, t); keSave(ord, open); fill(); list.querySelector(`.keitem[data-t="${t}"] .ketab`)?.focus();
    });
    const handle = lane ? tab : it;
    handle.addEventListener('pointerdown', (pd) => {
      if (pd.button || pd.target.closest('.kechev') || (lane && !pd.target.closest('.ketab'))) return;
      const y0 = pd.clientY; let moved = false, bar = null, target = null, ghost = null, grab = 0;
      handle.setPointerCapture(pd.pointerId);
      const items = () => [...list.querySelectorAll('.keitem')];
      const move = (pm) => {
        if (!moved && Math.abs(pm.clientY - y0) < 6) return;
        if (!moved) {
          moved = true; keDragging = true; hideHover(); bar = el('div', 'keins');
          const wr = wrap.getBoundingClientRect(), ir = it.getBoundingClientRect(), k = wr.width / wrap.offsetWidth || 1;
          grab = (y0 - ir.top) / k;
          ghost = it.cloneNode(true); ghost.classList.add('keghost'); ghost.removeAttribute('data-t');          // the item itself follows the pointer (a see-through copy); the original stays behind, faded, as the gap
          ghost.style.left = (list.offsetLeft + it.offsetLeft) + 'px'; ghost.style.width = it.offsetWidth + 'px'; ghost.style.height = it.offsetHeight + 'px';
          wrap.append(ghost); it.classList.add('drag');
        }
        { const wr = wrap.getBoundingClientRect(), k = wr.width / wrap.offsetWidth || 1; ghost.style.top = Math.max(0, Math.min(wrap.offsetHeight - ghost.offsetHeight, (pm.clientY - wr.top) / k - grab)) + 'px'; }
        const lr = list.getBoundingClientRect(), edge = 30 * (lr.height / listH || 1);
        if (pm.clientY < lr.top + edge) list.scrollTop -= 12; else if (pm.clientY > lr.bottom - edge) list.scrollTop += 12;
        const its = items(); target = its.length;
        for (let i = 0; i < its.length; i++) { const r = its[i].getBoundingClientRect(); if (pm.clientY < r.top + r.height / 2) { target = i; break; } }
        if (target < its.length) list.insertBefore(bar, its[target]); else list.append(bar);
      };
      const end = (commit) => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', cancel); document.removeEventListener('keydown', esc, true);
        keDragging = false; ghost?.remove();
        if (!moved) { if (commit) toggle(); return; }
        if (commit && target !== null) { const from = ord.indexOf(t); let to = target; ord.splice(from, 1); if (to > from) to--; ord.splice(to, 0, t); keSave(ord, open); }
        fill();
      };
      const up = () => end(true), cancel = () => end(false), esc = (k) => { if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); end(false); } };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', cancel); document.addEventListener('keydown', esc, true);
    });
    return it;
  }
  function fill() {
    const { ord, open } = keLayout(), top = list.scrollTop || keScroll;
    list.replaceChildren(...ord.map((t) => itemOf(t, open, ord)));
    list.scrollTop = top;
  }
  list.addEventListener('scroll', () => { keScroll = list.scrollTop; }, { passive: true });
  fill();
  requestAnimationFrame(() => { list.scrollTop = keScroll; });                                     // (the list is measured once it is on the page)
  const ol = sv('svg', { width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute' }), fl = sv('filter', { id: 'keoutline', x: '-25%', y: '-25%', width: '150%', height: '150%', 'color-interpolation-filters': 'sRGB' });          // the white outline of the tab icons: the silhouette moved 16 ways by KE_OUTLINE px, all copies of the original (not of each other), so the width is the same all round, on every icon, in a strip and in a lane
  const merge = sv('feMerge', {});
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, n = 'o' + i; fl.append(sv('feOffset', { in: 'SourceAlpha', dx: (Math.cos(a) * KE_OUTLINE).toFixed(3), dy: (Math.sin(a) * KE_OUTLINE).toFixed(3), result: n })); merge.append(sv('feMergeNode', { in: n })); }
  fl.append(merge); merge.setAttribute('result', 'ring');
  fl.append(sv('feFlood', { 'flood-color': '#fff', result: 'w' }), sv('feComposite', { in: 'w', in2: 'ring', operator: 'in', result: 'wr' }));
  const top = sv('feMerge', {}); top.append(sv('feMergeNode', { in: 'wr' }), sv('feMergeNode', { in: 'SourceGraphic' })); fl.append(top);
  ol.append(fl); wrap.append(ol);
  wrap.append(back, list, front);
  // hover: anywhere over the plot (lanes, strips, gaps), the turn under the pointer gets the band, its icons grow, the turn in the chip on the base line
  const hideHover = () => { hover.setAttribute('visibility', 'hidden'); chip.setAttribute('visibility', 'hidden'); wrap.querySelectorAll('.keev.now').forEach((g) => g.classList.remove('now')); };
  wrap.addEventListener('pointermove', (pm) => {
    if (keDragging) return;
    const { r, k } = scaleOf(), px = (pm.clientX - r.left) / k, py = (pm.clientY - r.top) / k;
    if (px < pad.l - 12 || px > w - pad.r + 12 || py < pad.t - 4 || py > yb + 40) return hideHover();
    let i = 0, best = Infinity; R.turns.forEach((tt, j) => { const d = Math.abs(X(tt) - px); if (d < best) { best = d; i = j; } });
    const x = X(R.turns[i]);
    hover.setAttribute('x', x - cw / 2); hover.setAttribute('y', pad.t); hover.setAttribute('width', cw); hover.setAttribute('height', yb - pad.t); hover.setAttribute('visibility', 'visible');
    wrap.querySelectorAll('.keev').forEach((g) => g.classList.toggle('now', +g.dataset.r === R.turns[i]));
    ct.textContent = R.end && i === R.turns.length - 1 ? 'End' : i === 0 ? 'Start' : 'Turn ' + R.turns[i];
    const w2 = ct.textContent.length * 15 * .62 + 24, cy = yb + 12;
    cr.setAttribute('x', x - w2 / 2); cr.setAttribute('y', cy); cr.setAttribute('width', w2); cr.setAttribute('height', 27); cr.setAttribute('rx', 13.5);
    ct.setAttribute('x', x); ct.setAttribute('y', cy + 19); tick.setAttribute('x1', x); tick.setAttribute('x2', x); chip.setAttribute('visibility', 'visible');
  });
  wrap.addEventListener('pointerleave', hideHover);
  return wrap;
}
const graphFor = (key, w, h) => {
  if (key === 'events') return keView(w, h);
  const R = key === 'score_turn' ? racePerTurn() : race(key);
  return R ? raceSvg(R, w, h, true) : el('div', 'gsempty', 'Points per turn: nothing to show here yet.');
};

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
  const t0 = R.axis ? R.axis[0] : R.turns[0] || 0, t1 = R.axis ? R.axis[1] : R.turns[R.turns.length - 1] || 1;          // (Points per turn keeps the x axis of the Points graph, so the break lines stay where they are there)
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
  const ends = R.noPill ? [0, 0] : [0, 1].map((p) => Y(R.scores[R.scores.length - 1][p]) + 5);
  const minGap = big ? 34 : 22;
  if (!R.noPill && Math.abs(ends[0] - ends[1]) < minGap) { const top = ends[0] <= ends[1] ? 0 : 1, gap = (minGap - Math.abs(ends[0] - ends[1])) / 2; ends[top] -= gap; ends[1 - top] += gap; }
  [0, 1].forEach((p) => {
    const d = R.turns.map((t, i) => [t, R.scores[i][p]]).filter((q) => q[1] !== null).map((q, i) => (i ? 'L' : 'M') + X(q[0]).toFixed(1) + ' ' + Y(q[1]).toFixed(1)).join(' ');          // (a player without a turn there: the line stops)
    if (GS[p].cas) s.append(sv('path', { d, class: 'rsline rscase', stroke: GS[p].cas }));
    s.append(sv('path', { d, class: 'rsline' + (GS[p].black ? ' rsblk' : ''), stroke: GS[p].c }));
    if (GS[p].black) s.append(sv('path', { d, class: 'rsline rscore', stroke: GS[p].core }));
    if (!R.noPill) { const pl = pillEl(p, GS); pl.set(w - pad.r + 8, ends[p] - 5, String(R.scores[R.scores.length - 1][p]), 'start', big ? 20 : 13); s.append(pl.g); }          // (the number at the line end; not in Points per turn)
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
  const leader = (k) => { for (let i = k; i >= 0; i--) if (R.scores[i][0] !== R.scores[i][1] && R.scores[i][0] !== null && R.scores[i][1] !== null) return R.scores[i][0] > R.scores[i][1] ? 0 : 1; return 0; };
  const show = (ev) => {
    const r = s.getBoundingClientRect(), px = (ev.clientX - r.left) * w / r.width;
    let k = 0, best = Infinity;
    R.turns.forEach((t, i) => { const d = Math.abs(X(t) - px); if (d < best) { best = d; k = i; } });
    const x = X(R.turns[k]), v = R.scores[k], top = v[0] === null ? 1 : v[1] === null ? 0 : leader(k), atEnd = R.end && k === last;
    gl.setAttribute('x1', x); gl.setAttribute('x2', x);
    dots.forEach((d, p) => { d.setAttribute('cx', x); d.setAttribute('cy', v[p] === null ? 0 : Y(v[p])); d.style.display = v[p] === null ? 'none' : ''; });
    const left = x > w - pad.r - fs * 3.2;
    const ph = fs * .9 * 1.5, low = h - pad.b - ph / 2 - 3;                                           // (a pill never reaches the x-axis and its round chip: low scores near the axis push the trailer up, and the leader above it)
    const pcy = [0, 1].map((p) => (v[p] === null ? 0 : p === top ? Y(v[p]) - fs * 1.2 : Math.min(Y(v[p]) + fs * 1.2, low)));
    if (v[0] !== null && v[1] !== null) pcy[top] = Math.min(pcy[top], pcy[1 - top] - ph - 3);
    nums.forEach((n, p) => {
      n.g.style.display = atEnd || v[p] === null ? 'none' : '';
      if (v[p] === null) return;
      n.set(left ? x - fs * .45 : x + fs * .45, pcy[p], v[p] < 0 ? '\u2212' + Math.abs(v[p]) : String(v[p]), left ? 'end' : 'start', fs * .9);
    });
    ct.textContent = atEnd ? 'End' : k === 0 && R.turns[0] === 0 ? 'Start' : 'Turn ' + R.turns[k];
    const cw = ct.textContent.length * cf * .62 + cf * 1.6, ch = cf * 1.8, cy = h - pad.b + cf * (big ? .8 : .5);
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
// the points the final scoring added (the sponsors' endgame effects and the endgame cards): the final score minus the score after the last normal turn; null when that cannot be told
const HOURGLASS = '<svg class="gshg" viewBox="0 0 64 100" aria-hidden="true"><path d="M10 10H54V22C54 36 36.5 43.5 35.5 50C36.5 56.5 54 64 54 78V90H10V78C10 64 27.5 56.5 28.5 50C27.5 43.5 10 36 10 22Z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/><rect x="4" y="2" width="56" height="9" rx="3.5" fill="currentColor"/><rect x="4" y="89" width="56" height="9" rx="3.5" fill="currentColor"/><path d="M20 25C22.5 32 28 36.5 32 39.5C36 36.5 41.5 32 44 25Z" fill="currentColor"/><path d="M19 86.5H45V83C44.5 77 40.5 72 34.5 67.5H29.5C23.5 72 19.5 77 19 83Z" fill="currentColor"/></svg>';
// the hourglass of a seat on the black score area: the player's colour mixed 70% with white; the three greys are spread so that white, grey and black seats can be told apart
const HG_GREY = { ffffff: '#FFFFFF', '5a5856': '#ADA9A5', '000000': '#6F7B81' };
function hourglassColor(k) {
  const raw = String(seatRawColor(k) || '').replace('#', '').toLowerCase();
  if (HG_GREY[raw]) return HG_GREY[raw];
  const m = /^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(raw);
  return m && Math.max(...[1, 2, 3].map((q) => parseInt(m[q], 16))) < 80 ? HG_GREY['000000'] : 'color-mix(in srgb, #' + raw + ' 70%, #fff)';
}
function endgamePoints() {
  const fin = finalState(), nt = S.replay.normal_turns;
  if (fin.phase !== 'over' || !Array.isArray(nt) || !nt.length) return null;
  const last = nt[nt.length - 1].players, sc = fin.result && fin.result.scores ? fin.result.scores : fin.players.map((p) => p.score);       // (the same split as the End column of the graph: the score after the last normal turn)
  const d = sc.map((v, k) => v - (last[k] ? last[k].score : NaN));
  return d.every((x) => Number.isFinite(x) && x >= 0) ? d : null;
}
function outcome() {
  const st = finalState(), names = S.replay.players.map((p) => p.name);
  const conceded = st.phase === 'over' ? null : S.postStats && S.postStats.conceded;
  const scores = st.result && st.result.scores ? st.result.scores : st.players.map((p) => p.score);
  let winner = st.result && Number.isInteger(st.result.winner) ? st.result.winner : null;
  if (conceded !== null && conceded !== undefined) winner = 1 - conceded;
  return { names, scores, winner, conceded };
}
// ---- the map-specific rows (counted by `replay/mapstats.py`, `S.replay.map_stats`: one dict per seat with the keys of that seat's map) ------------------------------------------------
// A row shows up when either player's map has the key; the other player gets a dash. [label, key, factor]: map 13's quadrant keys are trigger counts (Appeal pays 2 each, Money 3 each).
const MAP_OVERVIEW = [['Tower appeal', 'tower_appeal'], ['Sponsors marketed\nwith map ability', 'tower_marketed'], ['Overall points of\nmarketed sponsors', 'tower_marketed_points'],
  ['Animals played\nwith map ability', 'ignore_animals'], ['Cards pouched\nwith map ability', 'pouched'], ['Continent markers removed', 'cubes'],
  ['Quadrant reputation', 'quad_reputation'], ['Quadrant appeal', 'quad_appeal', 2], ['Quadrant hunter', 'quad_hunters'],
  ['Shark Attack points', 'shark_points'], ['Person sponsors played\nwith map ability', 'person_free'], ['Cards discarded\nfor action strength', 't1_discards']];
const mapValue = (seat, key, factor = 1) => { const m = S.replay.map_stats && S.replay.map_stats[seat]; return m && m[key] !== undefined ? m[key] * factor : undefined; };
function mapRows(defs) {
  const rows = [];
  for (const [label, key, factor] of defs) {
    const v = [0, 1].map((i) => mapValue(i, key, factor));
    if (v[0] === undefined && v[1] === undefined) continue;
    rows.push([label, v[0] === undefined ? '\u2013' : v[0], v[1] === undefined ? '\u2013' : v[1], ...(v[0] === undefined || v[1] === undefined ? [-1] : [])]);
  }
  return rows;
}
// the income of a map's ability: map 13's is money from its quadrants (3 each, instant or in a break), the others are counted from the log
const incomeRow = () => {
  const v = [0, 1].map((i) => { const m = S.replay.map_stats && S.replay.map_stats[i]; if (!m) return undefined; return m.income_map !== undefined ? m.income_map : m.quad_money !== undefined ? m.quad_money * 3 : undefined; });
  if (v[0] === undefined && v[1] === undefined) return [];
  const quad = [0, 1].some((i) => mapValue(i, 'quad_money') !== undefined);
  return [[quad ? 'Gained from quadrant income' : 'Gained from map income', v[0] === undefined ? '\u2013' : v[0], v[1] === undefined ? '\u2013' : v[1], ...(v[0] === undefined || v[1] === undefined ? [-1] : [])]];
};
function groups(D) {
  const [a, b] = D.players, hx = [hexes(0), hexes(1)];
  const has = (k) => !D.available || D.available.includes(k);                                                  // (an exported fork has the numbers of the engine only: no row for what it does not count)
  const r = (label, f, key) => (key && !has(key) ? null : [label, f(a), f(b)]);
  const out = [
    ['Actions', [r('Animals', (p) => p.act.animals, 'act'), r('Association', (p) => p.act.association, 'act'), r('Build', (p) => p.act.build, 'act'), r('Cards', (p) => p.act.cards, 'act'), r('Sponsors', (p) => p.act.sponsors, 'act'), r('X-back', (p) => p.xPass, 'xPass'), r('Clever', (p) => p.clever, 'clever'), ...mapRows([['Clever from map ability', 'clever_map']])]],
    ['Association', [r('Projects', (p) => p.projects, 'projects'), r('Releases', (p) => p.released, 'released'), r('Donations', (p) => p.donations, 'donations'), r('Universities', (p) => p.universities, 'universities'), r('Partner zoos', (p) => p.partners, 'partners'), r('Reputation', (p) => p.reputation, 'reputation'), r('Workers', (p) => p.workers, 'workers')]],
    ['Cards', [r('Drawn from deck', (p) => p.drawn, 'drawn'), r('Drawn from range', (p) => p.fromRange, 'fromRange'), r('Snapped', (p) => p.snapped, 'snapped'), r('Manual snaps', (p) => p.manualSnaps, 'manualSnaps'), r('Bonus snaps', (p) => p.projectSnaps, 'projectSnaps'), r('Discarded', (p) => p.discarded, 'discarded'), r('Animals played', (p) => p.animals, 'animals'), r('Sponsors played', (p) => p.sponsors, 'sponsors')]],
    ['Money', [r('Gained overall', (p) => p.money, 'money'), r('Gained from income', (p) => p.income, 'income'), r('Gained from kiosk income', (p) => p.kioskIncome, 'kioskIncome'), ...mapRows([['Gained from map ability', 'harbor_money']]), ...incomeRow(), r('Spent overall', (p) => p.onAnimals + p.onBuildings + p.onDonations + p.spentOther, 'spentOther'), r('Spent on animals', (p) => p.onAnimals, 'onAnimals'), r('Spent on buildings', (p) => p.onBuildings, 'onBuildings'), r('Spent on donations', (p) => p.onDonations, 'onDonations'), r('Spent on display cost', (p) => p.onRange, 'onRange')]],
    ['X-tokens', [r('Gained', (p) => p.xGained, 'xGained'), r('Used', (p) => p.xUsed, 'xUsed')]],
    ['Zoo', [r('Enclosures', (p) => p.enclosures, 'enclosures'), r('Free 2-sizes', (p) => p.freeTwos, 'freeTwos'), r('Pavilions', (p) => p.pavilions, 'pavilions'), r('Kiosks', (p) => p.kiosks, 'kiosks'), r('Unique buildings', (p) => p.unique, 'unique'), ['Covered hexes', hx[0].covered, hx[1].covered], ['Empty hexes', hx[0].empty, hx[1].empty]]],
  ];
  return out.map(([title, rows]) => [title, rows.filter(Boolean)]).filter(([, rows]) => rows.length);
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
    const hasAdv = !D.available || D.available.includes('advances');
    rows.push(['Breaks triggered', D.players[0].breaks, D.players[1].breaks], ...(hasAdv ? [['Break advancements', D.players[0].advances, D.players[1].advances]] : []));
  }
  rows.push(...mapRows(MAP_OVERVIEW));
  const t0 = Number(tt[0]), t1 = Number(tt[1]), known = tt[0] != null && tt[1] != null && isFinite(t0) && isFinite(t1) && t0 !== t1;
  rows.push(['Thinking time', ...(S.replay.fork_replay ? ['N/A', 'N/A', -1] : [thinkingTime(tt[0]), thinkingTime(tt[1]), known ? (t0 < t1 ? 0 : 1) : -1])]);       // (the lower time gets the pointer; a fork has no clock)
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
  // the new Elo and its change: the player's `elo_after` / `elo_change` of the replay (BigQuery `post_match_elo` and `post_match_elo` - `pre_match_elo`, or the table info of an uploaded
  // log). Without them (a table the index has no Elo for) the chip is left out; only a local copy (no BigQuery) shows the placeholder (the winner 130 +7, the other 116 -7).
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const eloAfter = (i) => {
    if (S.replay.fork_replay) return null;                                                                 // (a fork changes no rating)
    const p = S.replay.players[i] || {};
    if (Number.isFinite(p.elo_after) && Number.isFinite(p.elo_change)) return { elo: p.elo_after, d: p.elo_change };
    if (!LOCAL) return null;
    const w = O.winner === null || O.winner === i; return { elo: w ? 130 : 116, d: w ? 7 : -7 };
  };
  const side = (i, pos) => {
    const h = el('div', 'gshh ' + (pos ? 'r' : 'l'));
    const who = el('div', 'gswho');
    const nm = el('span', 'gsnm', O.names[i]);
    const e = eloAfter(i), chip = el('span', 'gselo');
    if (!e) { who.append(nm); h.append(who); return h; }
    const rgb = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(seatColor(i) || ''); if (rgb && Math.max(...[1, 2, 3].map((k) => parseInt(rgb[k], 16))) < 80) chip.classList.add('dk');   // a (nearly) black seat gets the solid grey chip
    chip.append(el('b', '', String(e.elo)), el('span', 'gsd ' + (e.d > 0 ? 'up' : e.d < 0 ? 'down' : ''), (e.d > 0 ? '+' : e.d < 0 ? '\u2212' : '\u00b1') + Math.abs(e.d)));
    chip.title = 'New Elo rating and its change';
    who.append(nm, chip); h.append(who);                                                                  // (the chip hangs below the name, so the name itself is centred like the score)
    return h;
  };
  const spine = el('div', 'gsspine'); const sc = el('div', 'gssc');
  const hi = (k) => (O.winner === null || O.winner === k ? '' : ' lo');
  const eg = endgamePoints();
  const swrap = (k) => {                                                                                    // a score with its endgame points (hourglass + value between two thin lines) hanging under it
    const w = el('span', 'gsw'), n = el('span', 'n' + hi(k), String(O.scores[k])); w.append(n);
    if (eg) { const g = el('span', 'gseg'); g.style.setProperty('--hg', hourglassColor(k));
      g.title = 'Points from the final scoring (sponsors and endgame cards)'; g.innerHTML = HOURGLASS + '<b>+' + eg[k] + '</b>'; w.append(g); }
    return w;
  };
  sc.append(swrap(L), el('span', 'dash', '-'), swrap(R));
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
  const graph = el('div', 'gsgraph'); const gcat = GRAPH_CATS[S.gsCat || 0]; graph.append(gcat[1] ? graphFor(gcat[1], 1180, 760) : el('div', 'gsempty', gcat[0] + ': nothing to show here yet.'));
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
  if (S.replay.fork_replay) S.gsGraph = false;                                                           // (the graph needs the turns of a logged table)
  box.append(...(S.replay.fork_replay ? [] : [tg]), hd, rail, S.gsGraph ? graph : body);
  requestAnimationFrame(() => { body.scrollTop = S.gsScroll || 0; act = -1; spy(); if (S.gsGraph) { act = S.gsCat || 0; lis.forEach((li, k) => li.classList.toggle('on', k === act)); dot.style.top = (lis[act].offsetTop + lis[act].offsetHeight / 2) + 'px'; } });
  return box;
}

// ---- the switch in the move bar and the results section; called at the end of every render ----------------------------------------------------------------------------------
function resultsSwitch() {
  const ICB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l9 5v10l-9 5-9-5V7z" class="o"/><path d="M12 7l4.5 2.5v5L12 17l-4.5-2.5v-5z" class="f"/></svg>', ICS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18" class="o"/><rect x="4.5" y="11" width="4" height="8" rx="1" class="f"/><rect x="10" y="6" width="4" height="13" rx="1" class="f"/><rect x="15.5" y="13" width="4" height="6" rx="1" class="f"/></svg>';
  const AL = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13 4l-6 6 6 6"/></svg>', AR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6"/></svg>';
  const b = el('button', 'rsflap rsgo'); b.type = 'button';                                      // one button, only the view that can be switched to: Game stats on the final board, Final board on the results
  if (S.results) { b.classList.add('rsback'); b.innerHTML = AL + ICB + '<span>Final board</span>'; b.title = 'Final board (←)'; b.onclick = closeResults; }
  else { b.innerHTML = ICS + '<span>Game stats</span>' + AR; b.title = 'Game stats (→)'; b.onclick = openResults; }
  const O = outcome(), text = el('span', 'rsswitchtext');
  const hi = O.winner === null ? O.scores[0] : O.scores[O.winner], lo = O.winner === null ? O.scores[1] : O.scores[1 - O.winner];          // (the winner's score first: "Xiao Tsong wins 109-104")
  const stopped = !!(S.postStats && S.postStats.synthetic);                                      // (a fork that was stopped before the end: the score where it stands)
  text.append(stopped ? 'Fork stopped · ' : 'Game over · ');
  if (O.winner === null) text.append('tie ');
  else { const nm = el('span', 'rsswinner', O.names[O.winner]); nm.style.color = seatColor(O.winner); text.append(nm, stopped ? ' leads ' : ' wins '); }       // (the winner's name in the seat colour)
  text.append(stopped ? hi + ' to ' + lo : hi + '-' + lo);
  const w = el('div', 'rsswitchrow'); w.append(b, text);
  return w;
}
export function syncResults() {
  if (FORK || PLAY || MINIGAME) return;
  if (S.step === lastStep()) loadStats();                                             // (read the log once the end is reached: a conceded game's switch needs it)
  if (!atLast()) S.wantResults = false;
  if (S.wantResults && atLast() && resultsAvailable()) { S.wantResults = false; S.results = true; }       // (an address that points at the results, main.js boot)
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
  const fitGraph = () => { const g = gs.querySelector('.gsgraph'); if (!g || !GRAPH_CATS[S.gsCat || 0][1]) return; const cs = getComputedStyle(g), w = g.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h = g.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom); if (w > 300 && h > 240) g.replaceChildren(graphFor(GRAPH_CATS[S.gsCat || 0][1], Math.round(w), Math.round(h))); };
  const k = S.scale || 1;
  gs.style.removeProperty('--gsh');
  if (!boxes.length) { fitGraph(); return; }
  const top = gs.getBoundingClientRect().top, bottom = boxes[boxes.length - 1].getBoundingClientRect().bottom;
  if (bottom > top) gs.style.setProperty('--gsh', Math.round((bottom - top) / k - 1) + 'px');          // (-1: the table's 1 px frame lies outside its edge)
  fitGraph();
}
window.addEventListener('resize', () => requestAnimationFrame(fitResults));
