// [module] Right column per player: tracker (score, appeal, income, reputation...), break track, deck / discard icons, bonus tokens.
import { $, el, seatColor, svg } from './util.js';
import { PLAY, S } from './state.js';
import { eyeLocked, eyeOpen, seatOrder, toggleEye } from './pov.js';
import { bindPreview, zoneNew } from './cards.js';
import { ACTION_ICON, ACTION_NAMES, iconUrl, pic, workerUrl } from './icons.js';
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
function eyeButton(seat) {                                          // open eye = this player's cards are shown; exactly one eye is open, opening the other closes it
  if (PLAY) return document.createTextNode('');                     // (a live game: no eyes, the server decides what a seat sees)
  const open = eyeOpen(seat), locked = eyeLocked(seat), nm = S.replay.players[seat].name;
  const b = el('button', 'poveye' + (open ? '' : ' closed') + (locked ? ' only' : ''));
  b.type = 'button';
  b.title = locked ? nm + "'s cards are shown" : 'Show ' + nm + "'s cards (and hide the other player's)";
  b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', String(open));
  const g = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  g.append(svg('path', { d: 'M2 12C5 6.5 8.5 4.5 12 4.5S19 6.5 22 12C19 17.5 15.5 19.5 12 19.5S5 17.5 2 12Z' }), svg('circle', { cx: 12, cy: 12, r: 3.2, fill: 'currentColor' }));
  if (!open) g.append(svg('path', { d: 'M3.5 3.5L20.5 20.5', 'stroke-width': 2.6 }));         // closed: the same eye, struck through (and faded by .poveye.closed)
  b.append(g);
  b.onclick = () => toggleEye(seat);
  return b;
}
const isLight = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); return !!m && (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255 > 0.6; };
// a starburst with a number in it (the score of a player, the round)
function burst(value) {
  const w = el('span', 'burst');
  const s = svg('svg', { viewBox: '0 0 54 54', 'aria-hidden': 'true' });
  const pts = [];
  for (let i = 0; i < 24; i++) { const r = i % 2 ? 21 : 27, a = Math.PI * 2 * i / 24; pts.push((27 + r * Math.cos(a)).toFixed(1) + ',' + (27 + r * Math.sin(a)).toFixed(1)); }
  s.append(svg('polygon', { points: pts.join(' '), fill: '#F4B63F', stroke: '#17262B', 'stroke-width': 3, 'stroke-linejoin': 'round' }));
  w.append(s, el('b', '', value));
  return w;
}
// the numbered resource tile of the info box: the number sits on the icon (`ov`) or under it (`xt`)
function tile(cls, title, img, value, sub) {
  const t = el('span', 'rt ' + cls);
  t.title = title;
  t.append(img, el('b', '', value));
  if (sub !== undefined) t.append(el('small', '', sub));
  return t;
}
const plainIcon = (id, h) => { const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = ''; i.height = h; return i; };
// The number is centred by its ink, not by its advance width: the digits of Bowlby One have uneven side bearings (a 1 sat 1.6 px left of the middle, a 10 1.2 px right).
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
  rnd.title = 'Round ' + st.round + ': a new round starts when a break ends';
  const rn = el('b', 'rn', st.round);
  rnd.append(el('span', 'lab', 'Round'), rn);
  centreInk(rn);          // (stacked: the word small above the number, a slim pill: the room goes to the logo)
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
    const head = el('div', 'pphead');
    const pl = S.replay.players[seat];
    const name = el('a', 'ppname', pl.name);                       // the name links to the player's BGA profile (new tab); it looks like plain text (see .ppname)
    if (pl.id) { name.href = 'https://boardgamearena.com/player?id=' + encodeURIComponent(pl.id); name.target = '_blank'; name.rel = 'noopener noreferrer'; }
    const scoreValue = p.score !== undefined ? p.score : trackScore(p);
    const score = flash(seat + ':score', scoreValue, el('span', 'ppscore'));
    score.title = 'Score (appeal + conservation points)';
    score.append(burst(scoreValue));
    const who = el('span', 'who');
    if (st.active_player === seat && st.phase !== 'over') who.append(el('i', 'live'));
    who.append(name, eyeButton(seat));
    const cb = clockBadge(seat);                                            // the clock of the time control, next to the name
    head.append(...(cb ? [who, cb, score] : [who, score]));
    box.append(head);

    const res = el('div', 'ppres');                                        // the five tiles: money, X tokens, reputation, appeal (and income), conservation points
    res.append(flash(seat + ':money', p.money, tile('ov money', 'Money', pic('money', 48), p.money)));
    res.append(flash(seat + ':x', p.x_tokens, tile('xt', 'X tokens', pic('xtoken', 36), p.x_tokens)));
    res.append(flash(seat + ':reputation', p.reputation, tile('ov', 'Reputation', pic('reputation', 48), p.reputation)));
    const inc = p.income !== undefined ? p.income : trackIncome(p.appeal);
    const ap = flash(seat + ':appeal', p.appeal, tile('ov dk', 'Appeal', pic('appeal', 48), p.appeal, '+' + inc));
    ap.querySelector('small').title = 'Income at the next break (from the appeal track' + (['5', '5a'].includes(S.replay.maps[seat].id) ? ' and the hexes covered next to the restaurant' : '') + ')';
    res.append(ap);
    res.append(flash(seat + ':conservation', p.conservation, tile('ov dk', 'Conservation points', pic('conservation', 48), p.conservation)));
    box.append(res);

    const res2 = el('div', 'ppres2');
    const workers = p.tokens.filter((t) => t.type === 'worker');
    const ready = workers.filter((t) => t.location === 'reserve').length;     // workers ready to use (the ones in the reserve)
    const wi = el('img', 'icon'); wi.src = workerUrl(seat); wi.alt = ''; wi.height = 36;
    const wr = flash(seat + ':workers', ready, tile('wk', 'Workers available (' + workers.filter((t) => /^supply_/.test(t.location)).length + ' still locked)', wi, ready));
    const limit = p.hand_limit !== undefined ? p.hand_limit : (p.tokens.some((t) => t.type === 'fac-rep-hand' && /^university_/.test(t.location)) ? 5 : 3);
    const hb = el('b', p.hand.length > limit ? 'over' : '', p.hand.length);   // red while the hand is over the limit, as on BGA
    hb.append(el('small', '', '/' + limit));
    const hand = el('span', 'rt hd');
    hand.title = 'Cards in hand / hand size';
    hand.append(plainIcon('r10c8', 36), hb);
    flash(seat + ':hand', p.hand.length, hand);
    res2.append(wr, hand);
    const egBase = p.conservation >= 10 ? 1 : 2;                            // endgame scoring cards: 2 at the start, 1 after the discard at 10 conservation; the extra ones (Resistance...) are shown, only when there are any
    if (p.endgame_hand.length > egBase) {
      const eg = el('span', 'rt egx');
      eg.title = 'Endgame scoring cards: ' + p.endgame_hand.length + ' (' + (p.endgame_hand.length - egBase) + ' more than usual)';
      eg.append(plainIcon('r10c15', 36), el('b', '', '+' + (p.endgame_hand.length - egBase)));
      flash(seat + ':endgame', p.endgame_hand.length, eg);
      res2.append(eg);
    }
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
      bindPreview(c, art);
      if (S.replay.marine_worlds && a.variant) {         // the variant's silver effect badge (side I or II of the card) on the top left of the action card
        const b = el('img', 'variant');
        b.src = '/action_icons/' + a.type + '_' + a.variant + '_' + (a.level === 2 ? 2 : 1) + '.webp'; b.alt = 'Variant ' + a.variant;
        c.append(b);
      }
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
