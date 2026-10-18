// [module] Right column per player: tracker (score, appeal, income, reputation...), break track, bonus tokens.
import { $, el, seatColor } from './util.js';
import { PLAY, S, SHOW_ELO, table } from './state.js';
import { hides, seatOrder } from './pov.js';
import { bindPreview, variantStatsBox, zoneNew } from './cards.js';
import { ACTION_ICON, ACTION_NAMES, iconUrl, inkDxEm, pic, workerUrl } from './icons.js';
import { clockBadge, gameMenu } from './play.js';

// score = appeal + conservation points (-14 at 0, +2 per step to 10, then +3): same rule as engine/tracks.py, used when the server did not send it
const trackScore = (p) => Math.max(0, Math.min(113, p.appeal)) + (p.conservation <= 10 ? 2 * p.conservation - 14 : 3 * Math.min(41, p.conservation) - 24);
// money the appeal track gives at a break (engine/tracks.py income_from_appeal): 5 at 0, +1 per appeal to 5, then per 2 to 17, 3 to 32, 4 to 56, 5 to 96, 6 to 113
function trackIncome(appeal) {
  let income = 5, start = 0;
  appeal = Math.max(0, Math.min(113, appeal));
  for (const [end, step] of [[5, 1], [17, 2], [32, 3], [56, 4], [96, 5], [113, 6]]) {
    if (appeal <= end) return income + Math.floor((appeal - start) / step);
    income += Math.floor((end - start) / step);
    start = end;
  }
  return income;
}
const isLight = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); return !!m && (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255 > 0.6; };
// The score of a player as a scoreboard: one plate per character on a dark plate (two plates at least, so a one-digit score keeps the width), the plate grows with the score (-105, 123).
// When the score is not the one this seat showed in the previous render, the plates that change swing over one by one, the ones first (like the plates of a ballpark scoreboard); new plates for a
// third digit or a minus sign come in blank and swing over too, plates that are no longer needed swing to blank and are removed. The sidebar is rebuilt on every step, so the score shown last is
// remembered per table and seat (`shownScore`); the first render of a table and any render with the same score show the number without moving.
const FLIP_MS = 620, FLIP_STAGGER = 90;
const shownScore = new Map();                                             // table:seat -> { value, from, t0 }: the score shown last, the one before it, when it changed
const nbsp = (ch) => (ch === ' ' ? '\u00a0' : ch);
const animates = () => !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function plate(ch) {
  const t = el('b', 'ft'), card = el('span', 'fc'), front = el('span', 'ff', nbsp(ch)), back = el('span', 'ff back');
  card.append(front, back); t.append(card);
  t.flipTo = (to, delay) => {                                              // (a negative delay: the swing is already under way, the sidebar was rebuilt in between)
    back.textContent = nbsp(to);
    const a = card.animate([{ transform: 'rotateX(0)', offset: 0 }, { transform: 'rotateX(200deg)', offset: 0.62 }, { transform: 'rotateX(172deg)', offset: 0.82 }, { transform: 'rotateX(180deg)', offset: 1 }], { duration: FLIP_MS, delay, easing: 'ease-in-out', fill: 'both' });
    a.onfinish = () => { front.textContent = nbsp(to); a.cancel(); };
  };
  return t;
}
// `from`: the score before the change (undefined = show the number as it is), `elapsed`: ms since it changed
const fmt = (v) => { const s = String(v); return s.length < 2 ? '0' + s : s; };            // (a one-digit score shows a 0 on the first plate: 08; -8 has two characters already)
function flipScore(value, from, elapsed) {
  const w = el('span', 'flip'), to = fmt(value).padStart(2, ' ');
  const n = from === undefined ? 0 : Math.max(fmt(from).length, to.length, 2);
  const total = (n - 1) * FLIP_STAGGER + FLIP_MS + 40;
  if (from === undefined || String(from) === String(value) || elapsed >= total || !animates()) { for (const ch of to) w.append(plate(ch)); return w; }
  const f = fmt(from).padStart(n, ' '), t = to.padStart(n, ' ');
  const plates = [...f].map(plate);
  w.append(...plates);
  plates.forEach((pl, i) => { if (f[i] !== t[i]) pl.flipTo(t[i], (n - 1 - i) * FLIP_STAGGER - elapsed); });
  if (n > to.length) setTimeout(() => plates.slice(0, n - to.length).forEach((pl) => pl.remove()), total - elapsed);
  return w;
}
// the numbered resource tile of the info box: the number sits on the icon (`ov`) or under it (`xt`)
function tile(cls, title, img, value, sub) {
  const t = el('span', 'rt ' + cls);
  t.title = title;
  const b = el('b', '', value);
  if (/\bov\b/.test(cls) && !/\b(xo|money)\b/.test(cls) && String(value).length > 1) {          // appeal, conservation, reputation: several digits are set tighter (-.1em, like the money tiles), centred by their ink
    b.style.letterSpacing = '-.1em';
    b.style.transform = 'translateX(' + inkDxEm(value) + 'em)';
  }
  t.append(img, b);
  if (sub !== undefined) t.append(el('small', '', sub));
  return t;
}
// the live count of the endgame points (engine/endgame.py `live_scoring`): a violet "+X" pill under the tile; `n` 0 / undefined = no pill
function egPill(tileEl, n, what) {
  if (!(n > 0)) return tileEl;
  const s = el('small', 'eg', '+' + n);
  s.title = 'Endgame live count: ' + what + ' would give +' + n + ' now';
  tileEl.append(s);
  return tileEl;
}
// the number of endgame scoring cards that count for the player whose cards are hidden, as a small card (terracotta back, light inner border: the look of an endgame card) with the number on it, at the upper
// right of the conservation tile: 1 normally (2 at the start, one is discarded at 10 conservation), more with Resistance. The player whose cards are shown has the cards in the hand and the points in the pill.
let egCardId = 0;
function egCardIcon(n) {
  const id = 'egcg' + (++egCardId);
  const w = el('span', 'egcard');
  w.title = n === 1 ? 'Endgame scoring cards: 1 is scored' : 'Endgame scoring cards: ' + n + ' are scored';
  w.innerHTML = '<svg viewBox="0 0 26 36" width="100%" height="100%" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" x2="1"><stop offset="0" stop-color="#a94a33"/><stop offset=".5" stop-color="#c9704f"/><stop offset="1" stop-color="#a94a33"/></linearGradient></defs>'
    + '<rect x="1" y="1" width="24" height="34" rx="5" fill="url(#' + id + ')" stroke="#4a1d12" stroke-width="1.4"/><rect x="3.6" y="3.6" width="18.8" height="28.8" rx="3" fill="none" stroke="#f3cdb6" stroke-opacity=".75" stroke-width=".9"/></svg>';
  w.append(el('i', 'n', n));
  return w;
}
const plainIcon = (id, h) => { const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = ''; i.height = h; return i; };
// The number is centred by its ink, not by its advance width: the digits of Bowlby One have uneven side bearings (a 1 sat 1.6 px left of the middle, a 10 1.2 px right).
// The Turn number of the Round | Turn element: the turn of the player who is acting, counted per player (both players' first turns are turn 1). The action card draft and the choice of the
// starting hand are no turns (0 until the first player chooses an action card). `st.turn` counts the finished turns of both players (a second action of the same turn does not count, see
// replay/builder.py), the players alternate, so the first player is `active_player` xor (turn odd). A turn begins with "chooses action card" (`current_action` is set); between two turns the
// number of the player who has just finished stays.
function turnNumber(st) {
  const t = st.turn || 0, a = st.active_player || 0, first = a ^ (t & 1);
  const done = (seat) => Math.floor((t + (seat === first ? 1 : 0)) / 2);        // (the finished turns of a seat)
  if (st.current_action) return done(a) + 1;
  const steps = S.replay && S.replay.steps, cur = steps && steps[S.step];
  if (cur && cur.state === st) {                                    // (replay: after the first action of a turn with a second one to come, no card is chosen for a moment; the turn goes on)
    for (let j = S.step - 1; j >= 0 && steps[j].state.turn === t; j--) if (steps[j].state.current_action) return done(a) + 1;
  }
  return done(1 - a);
}
// The player's name is drawn 86% as wide (Bowlby One is very wide): the text is scaled inside the link (`.ppname .nm`, parkposter.css) and the link takes the squeezed width, so the Elo pill and the
// eye move closer; the link is a flex item and still shrinks when the row is tight, then the name ends in an ellipsis. The width is measured with a canvas (font and size as in `.ppname`, 18px).
const NAME_SQUEEZE = 0.86;
function squeezeName(a, text) {
  a.textContent = '';
  a.append(el('span', 'nm', text));
  const fit = () => {
    const ctx = (squeezeName.ctx = squeezeName.ctx || document.createElement('canvas').getContext('2d'));
    ctx.font = '400 20px "Bowlby One"';
    a.style.width = Math.ceil(ctx.measureText(text).width * NAME_SQUEEZE + 1) + 'px';
  };
  fit();
  if (document.fonts && !document.fonts.check('20px "Bowlby One"')) document.fonts.ready.then(fit);          // (the font may still be loading on the first draw)
}
function centreInk(node) {
  const shift = () => {
    const cs = getComputedStyle(node), ctx = (centreInk.ctx = centreInk.ctx || document.createElement('canvas').getContext('2d'));
    ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    const m = ctx.measureText(node.textContent);
    const off = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 - m.width / 2;
    node.style.transform = 'translateX(' + (-off).toFixed(2) + 'px)';
  };
  shift();
  if (document.fonts && !document.fonts.check('28px "Bowlby One"')) document.fonts.ready.then(shift);          // (the font may still be loading on the first draw)
}
// round and break counter: the two pills at the right of the top bar (#hdrstats)
function headerStats(st, flash) {
  const root = $('hdrstats');
  if (!root) return;
  root.replaceChildren();
  const rnd = flash('round', st.round, el('div', 'pill rnd'));
  rnd.title = 'Round ' + st.round + ': a new round starts when a break ends. Turn: the number of turns the player who is acting has had in this game (the action card draft and the starting hand do not count)';
  const rn = el('b', 'rn', st.round), tn = el('b', 'tn', turnNumber(st));
  const rh = el('div', 'half'), th = el('div', 'half');          // (two equal halves, the word small above the number, a dashed divider between them)
  rh.append(el('span', 'lab', 'Round'), rn);
  th.append(el('span', 'lab', 'Turn'), tn);
  rnd.append(rh, el('i', 'dv'), th);
  centreInk(rn); centreInk(tn);
  const brk = flash('break', st.break_position, el('div', 'pill brk'));
  brk.title = 'Break track: the break ends the round when the token reaches 9';
  const pips = el('div', 'pips');
  for (let k = 0; k < 9; k++) pips.append(el('i', k < st.break_position - 1 ? 'done' : k === st.break_position - 1 ? 'cur' : ''));
  const num = el('b', 'bn', st.break_position);
  num.append(el('small', '', '/9'));
  const mug = el('img', 'brkicon'); mug.src = '/icons/r3c14.webp'; mug.alt = 'Break'; mug.draggable = false;            // (Ark Nova's symbol for the break: a coffee mug)
  brk.append(mug, num, pips);
  root.append(rnd, brk);
  const menu = PLAY ? gameMenu() : null;                                 // concede / propose to abandon / end on overtime
  if (menu) root.append(menu);
}
const CARD_TOKEN_ICON = { Venom: 'r2c12', Constriction: 'r2c9', Multiplier: 'r6c8' };       // (icons of BGA's sheet, see web/icons/names.json)
const CARD_TOKEN_TEXT = { Venom: 'Venom token: it goes when this card is used or put back; if no token was removed this turn, 2 money are owed', Constriction: 'Constriction token: this card has 2 less strength until it is used or put back', Multiplier: 'Multiplier token' };
export function sidePanel(st) {
  const root = $('side');
  root.replaceChildren();
  const nums = {};
  const flash = (key, value, node) => {
    nums[key] = value;
    const old = S.lastNums[key];
    if (old !== undefined && old !== value) node.classList.add(value > old ? 'flash-up' : 'flash-down');
    return node;
  };
  headerStats(st, flash);
  seatOrder().forEach((seat) => {                                   // (the spectated player's box first: above)
    const p = st.players[seat];
    const box = el('div', 'pp' + (st.active_player === seat && st.phase !== 'over' ? ' active' : ''));
    box.style.setProperty('--pc', seatColor(seat));
    if (isLight(seatColor(seat))) box.classList.add('light');
    const head = el('div', 'pphead' + (st.active_player === seat && st.phase !== 'over' ? ' on' : ''));          // (`on`: the player whose turn it is: a glowing gold edge under the header)
    const pl = S.replay.players[seat];
    const name = el('a', 'ppname');
    squeezeName(name, pl.name);
    // the name links to the player's BGA profile (new tab); it looks like plain text (see .ppname)
    if (pl.id) { name.href = 'https://boardgamearena.com/player?id=' + encodeURIComponent(pl.id); name.target = '_blank'; name.rel = 'noopener noreferrer'; }
    const scoreValue = p.score !== undefined ? p.score : trackScore(p);
    const score = flash(seat + ':score', scoreValue, el('span', 'ppscore'));
    score.title = 'Score (appeal + conservation points)';
    const shownKey = (table || '') + ':' + seat;
    let shown = shownScore.get(shownKey);
    if (!shown) shown = { value: scoreValue, from: undefined, t0: 0 };
    else if (shown.value !== scoreValue) shown = { value: scoreValue, from: shown.value, t0: performance.now() };
    shownScore.set(shownKey, shown);
    score.append(flipScore(scoreValue, shown.from, performance.now() - shown.t0));
    const who = el('span', 'who');
    who.append(name);
    if (SHOW_ELO && pl.elo) { const elo = el('span', 'ppelo', String(pl.elo)); elo.title = 'Elo of ' + pl.name + ' at this table (before the game)'; who.append(elo); }
    const cb = clockBadge(seat);                                            // the clock of the time control, next to the name
    head.append(...(cb ? [who, cb, score] : [who, score]));
    box.append(head);

    const res = el('div', 'ppres');                                        // the five tiles: money (and income), X tokens, reputation, appeal, conservation points
    const inc = p.income_total !== undefined ? p.income_total : p.income !== undefined ? p.income : trackIncome(p.appeal);
    const mo = flash(seat + ':money', p.money, tile('ov money', 'Money', pic('money', 48), p.money, '+' + inc));          // (the total income paid at the next break sits on the money tile)
    const IN = { appeal: 'appeal track', kiosks: 'kiosks', map: 'map ability', sponsors: 'sponsors', map_bonuses: 'map bonuses' };
    mo.querySelector('small').title = 'Income at the next break: ' + (p.income_parts ? Object.entries(p.income_parts).map(([k, v]) => v + ' ' + IN[k]).join(', ') : 'from the appeal track');
    res.append(mo);
    res.append(flash(seat + ':x', p.x_tokens, tile('ov xo', 'X tokens', pic('xtoken', 46), p.x_tokens)));          // (the number lies on the X, white with a black outline)
    res.append(flash(seat + ':reputation', p.reputation, tile('ov', 'Reputation', pic('reputation', 48), p.reputation)));
    const lv = S.endgameLive && p.endgame_live ? p.endgame_live : null;                // sponsors: both players; endgame cards: only for a player whose hand is shown (the eye is open / the own seat)
    const cardCp = lv && !hides(seat) && p.endgame_cards ? p.endgame_cards : 0;
    res.append(flash(seat + ':appeal', p.appeal, egPill(tile('ov dk', 'Appeal', pic('appeal', 48), p.appeal), lv && lv.appeal, 'the sponsors')));
    res.append(flash(seat + ':conservation', p.conservation, egPill(tile('ov dk', 'Conservation points', pic('conservation', 48), p.conservation), lv && lv.conservation + cardCp, cardCp ? 'the sponsors and the endgame cards' : 'the sponsors')));
    const nEg = p.endgame_hand.length >= 2 && p.conservation < 10 ? p.endgame_hand.length - 1 : p.endgame_hand.length;          // (before the discard at 10 conservation one of the cards is going to be thrown away)
    if (nEg > 0 && hides(seat)) res.children[4].append(egCardIcon(nEg));          // (only where the cards are hidden)
    box.append(res);

    const res2 = el('div', 'ppres2');
    const workers = p.tokens.filter((t) => t.type === 'worker');
    const ready = workers.filter((t) => t.location === 'reserve').length;     // workers ready to use (the ones in the reserve)
    const wi = el('img', 'icon'); wi.src = workerUrl(seat); wi.alt = ''; wi.height = 36;
    const owned = workers.filter((t) => !/^supply_/.test(t.location)).length;     // workers the player has (the locked ones in the supply do not count yet)
    const wr = flash(seat + ':workers', ready, tile('wk', 'Workers available / owned (' + workers.filter((t) => /^supply_/.test(t.location)).length + ' still locked)', wi, ready));
    wr.querySelector('b').append(el('small', '', '/' + owned));               // like the hand: 1/3
    const limit = p.hand_limit !== undefined ? p.hand_limit : (p.tokens.some((t) => t.type === 'fac-rep-hand' && /^university_/.test(t.location)) ? 5 : 3);
    const hb = el('b', p.hand.length > limit ? 'over' : '', p.hand.length);   // red while the hand is over the limit, as on BGA
    hb.append(el('small', '', '/' + limit));
    const hand = el('span', 'rt hd');
    hand.title = 'Cards in hand / hand size';
    hand.append(plainIcon('r10c8', 36), hb);
    flash(seat + ':hand', p.hand.length, hand);
    res2.append(wr, hand);
    // the bonus tokens of the player's notepad (one-time effects), at the right end of the row; every token goes at the step it is used
    const toks = p.tokens.filter((t) => BONUS_TOKENS.includes(t.type)).sort((x, y) => BONUS_TOKENS.indexOf(x.type) - BONUS_TOKENS.indexOf(y.type) || x.id - y.id);
    const bz = zoneNew(seat + ':bonustokens', toks.map((t) => t.type));
    const bons = el('span', 'bons');
    bons.title = 'Bonus tokens';
    const items = toks.map((t) => bonusToken(t.type, bz.isNew(t.type) ? 'card-new' : ''));
    for (const g of bz.gone) items.splice(Math.min(g.index, items.length), 0, bonusToken(g.key, 'card-gone', true));      // a token that was just used fades away in its place
    bons.append(...items);
    res2.append(bons);
    box.append(res2);

    const acts = el('div', 'ppactions');
    p.action_cards.forEach((a, i) => {
      // the card chosen for the running action (set by "chooses action card", cleared when it is placed back on slot 1 at the end of the action)
      const chosen = st.current_action && st.current_action.seat === seat && st.current_action.slot === i + 1;
      const c = el('span', 'ac' + (a.level === 2 ? ' lvl2' : '') + (chosen ? ' chosen' : ''));
      c.title = 'Slot ' + (i + 1) + ': ' + ACTION_NAMES[a.type] + (a.level === 2 ? ' II' : '') + (a.variant ? ' (variant ' + a.variant + ')' : '');
      c.append(pic(ACTION_ICON[a.type], 40));
      const art = '/action_cards/' + a.type + '_' + (S.replay.marine_worlds ? a.variant : 0) + '_' + (a.level === 2 ? 2 : 1) + '.webp';     // the whole action card
      bindPreview(c, art, undefined, () => variantStatsBox(st, seat, a));
      if (S.replay.marine_worlds && a.variant) {         // the variant's silver effect badge (side I or II of the card) on the top left of the action card
        const b = el('img', 'variant');
        b.src = '/action_icons/' + a.type + '_' + a.variant + '_' + (a.level === 2 ? 2 : 1) + '.webp'; b.alt = 'Variant ' + a.variant;
        c.append(b);
      }
      (a.tokens || []).forEach((t, k) => {                // the tokens that lie on the card: Venom (-> 2 money unless removed), Constriction (-2 strength), Multiplier
        const id = CARD_TOKEN_ICON[t]; if (!id) return;
        const b = el('img', 'actoken'); b.src = iconUrl(id); b.alt = t; b.title = CARD_TOKEN_TEXT[t] || t; b.style.setProperty('--k', String(k));
        c.append(b);
      });
      acts.append(c);
    });
    if (st.actions_hidden) acts.classList.add('unseen');          // (before the action cards are shuffled: the space stays, the cards are invisible)
    box.append(acts);

    const grid = el('div', 'ppicons');                            // the icons in three rows like BGA: 5 continents, 5 (6 with Marine Worlds) animal kinds, 5 others
    const ICON_ROWS = [['Africa', 'Europe', 'Asia', 'Americas', 'Australia'],
                       ['Bird', 'Predator', 'Herbivore', 'Reptile', 'Primate', ...(S.replay.marine_worlds ? ['SeaAnimal'] : [])],
                       ['Bear', 'Pet', 'Science', 'Rock', 'Water']];
    ICON_ROWS.forEach((names) => {
      const row = el('div', 'icrow');
      for (const k of names) {
        const n = (p.icons || {})[k] || 0;
        const c = el('span', 'ic' + (n ? '' : ' zero'));
        c.title = k;
        const img = el('img', 'badge');
        img.src = '/badges/' + k + '.webp'; img.alt = k; img.width = 44; img.height = 44;
        c.append(img, el('b', '', n));
        flash(seat + ':icon:' + k, n, c);
        row.append(c);
      }
      grid.append(row);
    });
    box.append(grid);
    root.append(box);
  });
  S.lastNums = nums;
}

const BONUS_TOKENS = ['bonus-icon', 'bonus-sponsor-gray', 'bonus-ignore-conditions', 'bonus-extra-shift'];
const BONUS_TOKEN_TEXT = { 'bonus-icon': 'Bonus icon: counts as one more icon of your choice for a conservation project or an animal condition',
                           'bonus-sponsor-gray': 'Sponsor bonus: play a sponsor card without paying its cost or meeting its requirements',
                           'bonus-ignore-conditions': 'Ignore conditions: ignore one condition of an animal card', 'bonus-extra-shift': 'Extra shift: take an association worker back' };
function bonusToken(type, cls, ghost) {
  const t = el('span', 'btoken ' + (cls || ''));
  t.title = BONUS_TOKEN_TEXT[type] || type;
  const id = S.iconNames[type];
  if (id) { const img = el('img'); img.src = iconUrl(id); img.alt = type; img.height = 36; t.append(img); } else t.append(el('b', '', type));
  if (ghost) t.addEventListener('animationend', () => t.remove());
  return t;
}
