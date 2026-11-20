// [module] The final scoring show ("One card, full stage" with a tug-of-war rope, changelog: "Final scoring show"), in replays, forks and live games (not the sandbox).
// Replays: the final scoring is the last block of replay steps (the last BGA move): one step per card that scores ("X gains 1 conservation (Science Library)", "... gains 3 appeal (...)")
// and the two summary lines ("X has 95<APPEAL> and scores 54 ..."). Forks and live games: the engine scores everything in the one step that ends the game; the show is built from the
// position before it, which lists what each sponsor scores (`endgame_sponsor_lines`, `endgame_appeal_lines`), and from the final position, which has what each kept endgame card scored
// (`endgame_card_pts`; in a live game the other player's endgame cards stay hidden: they come face down, together, with the points the server's totals leave for them).
// Every sponsor with an endgame ability in the zoo and every kept endgame card takes the stage, also those that score nothing (a dark +0 chip, the score only shakes).
// It plays over the dimmed board instead of stepping into the end, when Animations is "All" (settings.js): the two totals stand large at the left and right edge, a rope between them
// carries a knot that shows who leads and by how much (the middle mark = a tie), and in the middle one card at a time takes the stage with its name on a banner. A chip with the
// shield (or the appeal ticket) and the amount is stamped on the card, flies to its owner's score, the card lands on a fanned pile under it, the score counts up by the points it is
// worth (a conservation point is 2 or 3 score points) and the knot is pulled. Under each score two face-down stacks, sponsors with an endgame ability and endgame cards, with the
// number left on a badge: each card is dealt from its stack, the stack shrinks to 0. Endgame cards come face up, like the sponsors (no wobble, no flip).
// Order: all sponsors first, alternating, starting with the first player; then all endgame cards, alternating, starting with the first player. Then the winner's banner, and the show
// hands over (the replay's post-game screen, results.js; the fork's last step; the live game's end screen).
// Sound ("Animation sounds" on): a ding when a chip with points lands on the card, a wooden pluck for a +0 chip (step-sound.js `scoreSound`).
// The Skip button at the top centre, or → twice within a second, skips to that end at once (one → alone does nothing, nobody skips by accident); ← stops the show and stays on the
// step before the end. Speed follows the animation speed of the settings.
import { S } from './state.js';
import { cardName, info } from './cards.js';
import { seatColor } from './util.js';
import { ICON_IDS, iconUrl } from './icons.js';
import { scoreSound } from './step-sound.js';

const SCORING = /^(.+?) gains (\d+) (conservation|appeal) \((.+)\)\s*$/;
const SUMMARY = /has \d+<APPEAL> and scores \d+ for having/;
const BACK = '/card_back.webp', BACK_EG = '/card_back_endgame.webp';
const W = 1920, H = 1080;
// the sponsors with an endgame ability (effectType "endgame" in src/ark_nova/data/sponsors.json); keep in step with it
const EG_SPONSORS = new Set(['S201', 'S208', 'S215', 'S218', 'S225', 'S226', 'S241', 'S242', 'S243', 'S244', 'S245', 'S246', 'S247', 'S257', 'S258', 'S259', 'S260', 'S261', 'S264', 'S265',
  'S267', 'S268', 'S269', 'S271', 'S272', 'S274', 'S279', 'S280', 'S281']);
const baseKey = (k) => String(k || '').replace(/_.*$/, '');
const hasEndgame = (k) => EG_SPONSORS.has(baseKey(k));
const isEndgameKey = (k) => /^F/.test(String(k || ''));
const firstSeat = (R) => { const a = R.steps[0] && R.steps[0].state && R.steps[0].state.active_player; return a === 1 ? 1 : 0; };
// the score of a track position (engine/tracks.py `score`)
const trackScore = (a, c) => { a = Math.max(0, Math.min(113, a)); c = Math.max(0, Math.min(41, c)); return a + (c <= 10 ? 2 * c - 14 : 3 * c - 24); };

// ---- the block of a replay's final scoring: { start, end, items, from, to, first } or null (cached per replay and length) ----
const cache = new WeakMap();
export function finalBlock() {
  const R = S.replay; if (!R || !R.steps || !R.steps.length) return null;
  const hit = cache.get(R); if (hit && hit.n === R.steps.length) return hit.b;
  const st = R.steps, last = st.length - 1, mv = st[last].move_id;
  let start = last + 1, out = null;
  // (only the last step has to be the finished game: the card steps before it can carry another phase, e.g. 'turn' in some games with two different maps, 946790823)
  if (st[last].state && st[last].state.phase === 'over') {
    for (let i = last; i > 0; i--) {
      const s = st[i], lab = s.label || '';
      if (s.move_id !== mv || !(SCORING.test(lab) || SUMMARY.test(lab)) || !s.state) break;
      start = i;
    }
    if (start <= last && st[start - 1] && st[start - 1].state) {
      const items = [];
      for (let i = start; i <= last; i++) {
        const s = st[i], m = SCORING.exec(s.label || ''); if (!m) continue;
        const seat = Number.isInteger(s.actor) ? s.actor : R.players.findIndex((p) => p.name === m[1]); if (seat < 0) continue;
        const prev = st[i - 1].state.players[seat].score, now = s.state.players[seat].score, key = cardKey(m[4]);
        items.push({ seat, n: +m[2], kind: m[3], name: m[4], pts: Number.isFinite(now - prev) ? now - prev : 0, key, eg: isEndgameKey(key) });
      }
      if (items.length) {
        const pre = st[start - 1].state;
        addZeros(items, pre, pre);
        out = { start, end: last, items, from: pre.players.map((p) => p.score), to: st[last].state.players.map((p) => p.score), first: firstSeat(R) };
      }
    }
  }
  cache.set(R, { n: R.steps.length, b: out });
  return out;
}
function cardKey(name) {
  const want = String(name).trim().toLowerCase();
  const hits = Object.keys(S.replay.cards || {}).filter((k) => String(info(k).name || '').toLowerCase() === want);
  return (S.replay.marine_worlds && hits.find((k) => /_MW$/.test(k))) || hits.find((k) => !/_MW$/.test(k)) || hits[0] || null;      // (a Marine Worlds game uses the _MW variant where one exists)
}
// the cards that score nothing take the stage too: every sponsor with an endgame ability in the zoo (`spon`: the position with the zoo) and every kept endgame card (`hands`: the
// position with the endgame cards that are scored: all of them once the discard is done, else all but one, engine/endgame.py `kept_endgame_cards`)
function addZeros(items, spon, hands) {
  [0, 1].forEach((seat) => {
    const mine = items.filter((it) => it.seat === seat), has = (k) => mine.some((it) => it.key && baseKey(it.key) === baseKey(k));
    for (const k of (spon.players[seat].sponsors || [])) if (hasEndgame(k) && !has(k)) items.push({ seat, n: 0, kind: 'conservation', name: cardName(k), pts: 0, key: k, eg: false });
    const hand = hands.players[seat].endgame_hand || [], kept = hands.endgame_discard_done || hand.length < 2 ? hand.length : hand.length - 1;
    let need = kept - mine.filter((it) => it.eg).reduce((a, it) => a + (it.count || 1), 0);
    for (const k of hand) { if (need <= 0) break; if (k && k !== '?' && !has(k)) { items.push({ seat, n: 0, kind: 'conservation', name: cardName(k), pts: 0, key: k, eg: true }); need--; } }
    if (need > 0) items.push({ seat, n: 0, kind: 'conservation', name: 'Endgame card', pts: 0, key: null, eg: true, count: need });
  });
}

// ---- the block of a fork's / live game's end (the engine's one step, index `i`): built from the positions around it, or null ----
// (only the very last step: that is where a fork's or live game's end always is; a replay can mark a step of the last turn 'over' before its final scoring, 943170782 step 554)
export function engineBlock(i) {
  const R = S.replay, st = R && R.steps; if (!st || !st[i] || !st[i].state || st[i].state.phase !== 'over' || i < 1 || i !== st.length - 1) return null;
  const end = st[i].state, last = st[i - 1].state; if (!last || last.phase === 'over') return null;
  let j = i - 1; while (j > 0 && st[j].state && st[j].state.phase === 'scoring') j--;                 // (the endgame discard at the end is a 'scoring' position: the zoo lines come from before it)
  const pre = st[j].state; if (!pre || pre.phase === 'over' || st[j].log_only) return null;
  const items = [];
  [0, 1].forEach((seat) => {
    const p = pre.players[seat], q = end.players[seat]; if (!p || !q) return;
    const sp = [];
    for (const [k, n] of (p.endgame_appeal_lines || [])) sp.push({ seat, n, kind: 'appeal', name: cardName(k), key: k, eg: false });
    for (const [k, n] of (p.endgame_sponsor_lines || [])) sp.push({ seat, n, kind: 'conservation', name: cardName(k), key: k, eg: false });
    sp.sort((a, b) => (baseKey(a.key) === 'S281' ? -1 : baseKey(b.key) === 'S281' ? 1 : 0) || (baseKey(a.key) === 'S274' ? 1 : baseKey(b.key) === 'S274' ? -1 : 0));        // (Arcade first, Mascot Statue last)
    items.push(...sp);
    const pts = q.endgame_card_pts || {}, hand = q.endgame_hand || [];
    let hidden = 0, shown = 0;
    for (const k of hand) {
      if (k && k !== '?' && pts[k] && Number.isFinite(pts[k].conservation)) { items.push({ seat, n: pts[k].conservation, kind: 'conservation', name: cardName(k), key: k, eg: true }); shown += pts[k].conservation; } else hidden++;
    }
    if (hidden) {                                                          // (the other player's endgame cards in a live game: what the totals leave for them)
      const spon = sp.filter((it) => it.kind === 'conservation').reduce((a, it) => a + it.n, 0), rest = Math.max(0, (q.conservation || 0) - (p.conservation || 0) - spon - shown);
      items.push({ seat, n: rest, kind: 'conservation', name: 'Endgame card', key: null, eg: true, count: hidden });
    }
  });
  addZeros(items, pre, end);
  const b = { start: i, end: i, items, from: last.players.map((p) => p.score), to: end.players.map((p) => p.score), first: firstSeat(R) };
  // the score points of each card, in the order of the show (a conservation point is worth 2 below 10 and 3 above)
  const tr = [0, 1].map((s) => ({ a: pre.players[s].appeal || 0, c: pre.players[s].conservation || 0 }));
  for (const it of order(b)) { const t = tr[it.seat], before = trackScore(t.a, t.c); if (it.kind === 'appeal') t.a += it.n; else t.c += it.n; it.pts = trackScore(t.a, t.c) - before; }
  return b;
}
// the end block that the step `i` starts (a replay's last BGA move, or the engine's end step), or null
export function blockAt(i) {
  const b = finalBlock(); if (b && i >= b.start && i <= b.end) return b;
  return engineBlock(i);
}
// the order of the show (see the head of the file): sponsors (and the other lines of the final scoring) alternating, then the endgame cards alternating, both from the first player
function order(b) {
  const deal = (eg) => {
    const L = [0, 1].map((s) => b.items.filter((it) => it.seat === s && !!it.eg === eg));          // (each player's own order: the log's / Arcade first and Mascot Statue last, then the cards worth nothing)
    const out = [];
    for (let t = b.first || 0; L[0].length || L[1].length; t = 1 - t) out.push(L[t].length ? L[t].shift() : L[1 - t].shift());
    return out;
  };
  return deal(false).concat(deal(true));
}
const stackOf = (it) => (it.eg ? 'eg' : it.key && hasEndgame(it.key) ? 'sp' : null);

// ---- running ----
let run = null;                                     // { id }
export const finalShowRunning = () => !!run;
export function wantFinalShow() { return S.animations === 'all' && !matchMedia('(prefers-reduced-motion: reduce)').matches; }

class Stop extends Error {}
const el = (cls, st, html) => { const e = document.createElement('div'); if (cls) e.className = cls; if (st) Object.assign(e.style, st); if (html !== undefined) e.innerHTML = html; return e; };
const px = (v) => v + 'px';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SKIP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5l9 7-9 7zM12 5l9 7-9 7z"/><rect x="20" y="5" width="2.5" height="14" rx="1"/></svg>';
const SW = 72, SY = 525, PY = 749;                  // the stacks under the scores: card width, centre height; PY: centre height of the pile of scored cards
const CY = 565;                                      // the card on the stage: centred between the rope (bottom 229) and the banner (top 900)
const stackXY = (s, eg, SX) => [SX[s] + 180 + (eg ? 58 : -58), SY];
// a player's name in the panel (324 px wide, a box of two lines at 36 px): one line at 36 px, or shrunk down to 32 px; then two balanced lines at 36 px (broken at a space,
// an underscore or hyphen, a lower→Upper change or before digits; mid-word only for a name with none of those); if two lines at 36 px are not enough, two lines shrunk as needed
const NAME_W = 324, NAME_FS = 36, NAME_MIN = 32;
const softBreaks = (h) => h.replace(/([_\-])(?=.)/g, '$1<wbr>').replace(/([a-z])(?=[A-Z])/g, '$1<wbr>').replace(/([A-Za-z])(?=\d)/g, '$1<wbr>');
function fitName(sp) {
  const fit = () => {
    if (!sp.isConnected) return;
    const html = sp.dataset.name || (sp.dataset.name = sp.innerHTML), st = sp.style;
    st.whiteSpace = 'nowrap'; st.overflowWrap = ''; st.fontSize = NAME_FS + 'px'; st.maxWidth = 'none'; sp.innerHTML = html;
    const w = sp.offsetWidth; st.maxWidth = '';
    if (w <= NAME_W) return;
    const f = Math.floor(NAME_FS * NAME_W / w * 10) / 10;
    if (f >= NAME_MIN) { st.fontSize = f + 'px'; return; }
    sp.innerHTML = softBreaks(html); st.whiteSpace = 'normal';
    const natural = /\s|<wbr>/.test(sp.innerHTML);
    st.overflowWrap = natural ? 'normal' : 'anywhere';
    for (let fs = NAME_FS; fs >= 12; fs--) {
      st.fontSize = fs + 'px';
      if (sp.offsetHeight <= fs * 1.06 * 2 + 1 && sp.scrollWidth <= sp.clientWidth + 1) return;
    }
  };
  fit(); if (document.fonts) document.fonts.ready.then(fit);          // (again once the fonts are in: the widths depend on them)
}

// play the show of block `b` (default: the replay's final block); `land()` goes to the end (the last step and what follows it), `stay()` keeps the step before the end
export function playFinalShow(land, stay, block) {
  const b = block || finalBlock(); if (!b || run) return false;
  const id = {}, speed = Math.max(.25, Number(S.animationSpeed) || 1), names = S.replay.players.map((p) => p.name);
  const root = el('egshow'), stage = el('egstage'); root.append(el('egdim'), stage); document.body.append(root);
  const fit = () => { const k = Math.min(root.clientWidth / W, root.clientHeight / H); stage.style.transform = 'translate(' + px((root.clientWidth - W * k) / 2) + ',' + px((root.clientHeight - H * k) / 2) + ') scale(' + k + ')'; };
  fit(); addEventListener('resize', fit);
  const sleep = (ms) => new Promise((ok, no) => setTimeout(() => (run && run.id === id ? ok() : no(new Stop())), ms / speed));
  const anim = (e, kf, ms, opt = {}) => e.animate(kf, { duration: ms / speed, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards', ...opt }).finished.catch(() => {});
  const close = () => { removeEventListener('resize', fit); removeEventListener('keydown', onKey, true); root.remove(); run = null; };
  const finish = () => { if (!run) return; close(); land(); };
  let rightAt = 0, nudgeT = 0;
  const onKey = (e) => {
    e.stopImmediatePropagation();                                  // (the page behind does not react while the show runs; browser keys such as F5 or Ctrl + L still work)
    if (e.key === 'ArrowLeft') { e.preventDefault(); close(); stay(); }
    else if (e.key === 'ArrowRight') {                             // → twice within a second skips; the first one only says so under the button
      e.preventDefault(); if (e.repeat) return;
      const now = performance.now();
      if (now - rightAt < 1000) { finish(); return; }
      rightAt = now; again.classList.add('on'); clearTimeout(nudgeT); nudgeT = setTimeout(() => again.classList.remove('on'), 1000);
    }
  };
  addEventListener('keydown', onKey, true);
  run = { id };

  // the two sides: name, score, the stacks still to score, the pile of scored cards
  const sc = b.from.slice(), num = [], pile = [0, 0], flip = S.orient === 1, SX = flip ? [1430, 130] : [130, 1430];          // (the sides follow the boards: the spectated player chosen at the start, S.orient, is on the left)
  const seq = order(b), left = [0, 1].map((s) => ({ sp: 0, eg: 0 }));
  seq.forEach((it) => { const k = stackOf(it); if (k) left[it.seat][k] += it.count || 1; });
  const stacks = [{}, {}];
  [0, 1].forEach((s) => {
    stage.append(el('egpanel', { left: px(SX[s]), background: 'linear-gradient(180deg,' + seatColor(s) + ',#0a2e39 72%)' }));
    const nm = el('egname', { left: px(SX[s]) }, '<span>' + esc(names[s]) + '</span>'); stage.append(nm); fitName(nm.firstChild);
    const n = el('egscore', { left: px(SX[s]) }, String(sc[s])); stage.append(n); num[s] = n;
    stage.append(el('egtray', { left: px(SX[s] + 50), top: px(SY - 74) }));
    ['sp', 'eg'].forEach((k) => {
      const [x, y] = stackXY(s, k === 'eg', SX), d = el('egstack' + (left[s][k] ? '' : ' empty'), { left: px(x - SW / 2), top: px(y - SW * .7), width: px(SW), height: px(SW * 1.4) });
      d.append(el('egslot'));
      for (let i = 0; i < left[s][k]; i++) { const im = document.createElement('img'); im.src = k === 'eg' ? BACK_EG : BACK; im.alt = ''; im.style.left = px(i * 1.5); im.style.top = px(-i * 4); d.append(im); }
      const badge = el('egcount', { background: seatColor(s) }, String(left[s][k])); d.append(badge);
      stage.append(d); stacks[s][k] = { d, badge };
    });
  });
  const deal = (it) => {                                         // a card leaves its stack: one card fewer, the badge counts down
    const k = stackOf(it); if (!k) return null;
    const s = it.seat, st = stacks[s][k], from = left[s][k]; left[s][k] = Math.max(0, from - (it.count || 1));
    const ims = st.d.querySelectorAll('img'); for (let i = left[s][k]; i < from; i++) if (ims[i]) ims[i].style.opacity = '0';
    st.badge.textContent = String(left[s][k]); st.badge.classList.remove('egbump'); void st.badge.offsetWidth; st.badge.classList.add('egbump');
    st.d.classList.toggle('empty', left[s][k] === 0);
    return stackXY(s, k === 'eg', SX);
  };
  // the rope: from panel to panel, a mark in the middle; the knot sits at the lead
  const RL = 490, RR = 1430, RY = 214, CX = (RL + RR) / 2;
  let maxLead = Math.abs(sc[0] - sc[1]); { const t = sc.slice(); seq.forEach((it) => { t[it.seat] += it.pts; maxLead = Math.max(maxLead, Math.abs(t[0] - t[1])); }); }
  const K = Math.min(14, (RR - RL) / 2 * .86 / Math.max(10, maxLead)), kx = () => CX - (sc[0] - sc[1]) * K * (flip ? -1 : 1);          // (the knot is pulled towards the leader's side)
  stage.append(el('egrope', { left: px(RL - 6), top: px(RY - 9), width: px(RR - RL + 12) }), el('egtie', { left: px(CX - 2), top: px(RY - 30) }));
  const knot = el('egknot', { left: px(kx() - 26), top: px(RY - 26) }), lead = el('eglead', { left: px(kx() - 70), top: px(RY - 82) });
  stage.append(knot, lead);
  const showLead = () => { const d = sc[0] - sc[1]; lead.textContent = d === 0 ? 'Tie' : '+' + Math.abs(d); lead.style.background = d === 0 ? '#f8edcb' : seatColor(d > 0 ? 0 : 1); lead.style.color = d === 0 ? '#17262b' : '#fff'; };
  showLead();
  const banner = el('egbanner', { opacity: 0 }); stage.append(banner);
  // the Skip button at the top centre; the hint of the second →
  const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'egskip'; skip.innerHTML = SKIP_ICON + 'Skip <span class="egkey">&rarr;</span><span class="egkey">&rarr;</span>';
  skip.setAttribute('aria-label', 'Skip the final scoring (or press the right arrow twice)');
  skip.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
  const again = el('egagain', null, 'Press &rarr; again to skip');
  stage.append(skip, again);
  // no player name: the two lines of the banner are in the player's colour (for black with thin white edges, so they stand out from the dark stripe), the card name alone has the whole width
  const bannerText = (it, hide) => { const c = seatColor(it.seat); banner.style.borderColor = c; banner.classList.toggle('egblack', /^#?0{6}$/i.test(c)); banner.innerHTML = esc(hide || !it.key ? (it.count > 1 ? it.count + ' endgame cards' : 'Endgame card') : cardName(it.key)); };

  const cardEl = (it, w, x, y, faceDown) => {
    const c = el('egcard', { width: px(w), height: px(w * 503 / 360), left: px(x - w / 2), top: px(y - w * 503 / 720) }), fl = el('egfl');
    if (it.key || it.eg) {
      const f = document.createElement('img'); f.src = it.key ? info(it.key).large || info(it.key).image : BACK_EG; f.alt = '';
      const k = document.createElement('img'); k.src = it.eg ? BACK_EG : BACK; k.className = 'bk'; k.alt = '';
      fl.append(f, k);
    } else fl.append(el('egplain', null, '<span>' + esc(it.name) + '</span>'));
    c.append(fl); if (faceDown) fl.style.transform = 'rotateY(180deg)'; return c;
  };
  const chipEl = (it) => {
    const src = it.kind === 'appeal' ? (ICON_IDS.appeal ? iconUrl(ICON_IDS.appeal) : '') : iconUrl('r3c15');
    return el('egchip' + (it.n ? '' : ' zero'), { left: px(960), top: px(CY - 20) }, (src ? '<img src="' + src + '" alt="">' : '') + '+' + it.n);
  };
  const count = async (s, from, to, ms) => { const n = Math.max(1, Math.abs(to - from)); for (let i = 1; i <= n; i++) { num[s].textContent = String(from + (to > from ? i : -i)); await sleep(ms / n); } };
  const bump = (e, cls = 'egbump') => { e.classList.remove('egbump', 'egnudge'); void e.offsetWidth; e.classList.add(cls); };

  (async () => {
    try {
      await anim(root.firstChild, [{ opacity: 0 }, { opacity: 1 }], 400);
      await sleep(700);
      for (const it of seq) {
        const c = cardEl(it, 400, 960, CY, !!it.eg && !it.key); stage.append(c);          // (endgame cards come face up like the sponsors; only a hidden one, a live game's other player, stays face down)
        const from = deal(it);
        bannerText(it, false); anim(banner, [{ opacity: 0 }, { opacity: 1 }], 250);
        if (from) await anim(c, [{ opacity: .8, left: px(from[0] - SW / 2), top: px(from[1] - SW * .7), width: px(SW), height: px(SW * 1.4) }, { opacity: 1, left: c.style.left, top: c.style.top, width: c.style.width, height: c.style.height }], 520);
        else await anim(c, [{ opacity: 0, scale: .5, rotate: '-6deg' }, { opacity: 1, scale: 1, rotate: '0deg' }], 380);
        const ch = chipEl(it); stage.append(ch);
        await anim(ch, [{ transform: 'translate(-50%,-50%) scale(2.2)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], 300, { easing: 'cubic-bezier(.3,1.6,.5,1)' });
        scoreSound(!!it.n);          // (as the chip lands on the card: a ding when it scores, a wooden pluck for +0, step-sound.js)
        await sleep(650);
        const s = it.seat, px0 = SX[s] + 180, tx = px0 + (pile[s] % 5 - 2) * 26, ty = PY + (pile[s] % 2) * 14, rot = ((pile[s] % 5) - 2) * 5; pile[s]++;
        anim(ch, [{ left: '960px', top: px(CY - 20) }, { left: px(px0), top: '346px', opacity: 0 }], 450);
        await anim(c, [{ left: c.style.left, top: c.style.top, width: c.style.width, height: c.style.height, rotate: '0deg' }, { left: px(tx - 70), top: px(ty - 98), width: '140px', height: '196px', rotate: rot + 'deg' }], 480);
        ch.remove();
        if (it.pts) {
          const was = sc[s], k0 = kx(); sc[s] += it.pts; const k1 = kx();
          bump(num[s]); showLead();
          anim(knot, [{ left: px(k0 - 26) }, { left: px(k1 - 26) }], 600, { easing: 'cubic-bezier(.3,1.3,.5,1)' }); anim(lead, [{ left: px(k0 - 70) }, { left: px(k1 - 70) }], 600, { easing: 'cubic-bezier(.3,1.3,.5,1)' });
          await count(s, was, sc[s], 420);
        } else { bump(num[s], 'egnudge'); await sleep(300); }       // (nothing scored: the score only shakes, the knot stays)
        anim(banner, [{ opacity: 1 }, { opacity: 0 }], 200);
        await sleep(220);
      }
      // the totals of the log / the engine (the summary lines can add what no card shows)
      [0, 1].forEach((s) => { if (sc[s] !== b.to[s]) { sc[s] = b.to[s]; num[s].textContent = String(sc[s]); } }); showLead();
      await sleep(500);
      const w = sc[0] === sc[1] ? null : sc[0] > sc[1] ? 0 : 1;
      const win = el('egwin', w === null ? {} : { background: seatColor(w), color: '#fff' }, w === null ? 'Tie' : esc(names[w]) + ' wins by ' + Math.abs(sc[0] - sc[1]));
      stage.append(win);
      if (w !== null) { num[1 - w].style.opacity = '.55'; bump(num[w]); }
      await anim(win, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.08)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], 500);
      await sleep(1900);
      finish();
    } catch (e) { if (!(e instanceof Stop)) { console.error(e); finish(); } }
  })();
  return true;
}

// a fork's / live game's move that has just ended the game (the steps are in, the last one is the end): plays the show from the step before it. `after()` runs when the end is
// reached (skipped or played out), `go(i)` shows a step. Returns false when there is no show (no block, Animations not "All"): the caller goes on as before.
export function showEngineEnd(i, go, after) {
  if (run || !wantFinalShow()) return false;
  const b = engineBlock(i); if (!b) return false;
  go(i - 1);
  return playFinalShow(() => { go(i); if (after) after(); }, () => { if (after) after(); }, b);
}
