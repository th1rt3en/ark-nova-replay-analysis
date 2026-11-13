// [module] Right column per player: tracker (score, appeal, income, reputation...), break track, bonus tokens.
import { $, el, seatColor } from './util.js';
import { PLAY, S, SHOW_ELO, table } from './state.js';
import { hides, seatOrder } from './pov.js';
import { motionOff } from './motion.js';
import { bindPreview, variantStatsBox, zoneNew } from './cards.js';
import { ACTION_ICON, ACTION_NAMES, iconUrl, inkDxEm, pic, workerUrl } from './icons.js';
import { clockBadge, gameMenu } from './play.js';
import { hideIncome, showEndgame, showIncome } from './incomepop.js';
import { hdPentagonSvg } from './ctrack.js';
import { amountIcon } from './log-labels.js';
import { bindChip } from './move-hover.js';

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
// The colour of the score chip: the player colour darkened (CSS, `.chip`); three colours need their own chip, set by a class on the box: `chip-black` (a black player: the chip would vanish on the header),
// `chip-amber` (orange) and `chip-gold` (yellow; a darkened yellow turns olive green). Anything else, including BGA's white (shown grey) and grey, uses the darkened colour.
function chipTone(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return '';
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx < 0.16) return 'chip-black';
  if (!isLight(hex) || mx - mn < 0.4) return '';
  const h = ((mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4) * 60 + 360) % 360;
  return h >= 20 && h < 45 ? 'chip-amber' : h >= 45 && h < 75 ? 'chip-gold' : '';
}
// the numbered resource tile of the info box: the number sits on the icon (`ov`) or under it (`xt`)
function tile(cls, title, img, value, sub) {
  const t = el('span', 'rt ' + cls);
  t.title = title;
  const b = el('b', String(value).length >= 3 ? 'd3' : '', value);          // (three digits, very rare: tightened in the CSS so they fit the tile)
  if (/\bov\b/.test(cls) && !/\b(xo|money)\b/.test(cls) && String(value).length > 1) b.style.transform = 'translateX(' + inkDxEm(value, 0) + 'em)';          // appeal, conservation, reputation: several digits keep Park Num's own spacing (it is already narrow), centred by their ink
  t.append(img, b);
  if (sub !== undefined) t.append(el('small', '', sub));
  return t;
}
// the live count of the endgame points (engine/endgame.py `live_scoring`): a violet "+X" pill under the tile; `n` 0 / undefined = no pill
// the endgame cards that will count for a player (before the discard at 10 conservation one of two is thrown away)
const nEgNow = (p) => (p.endgame_hand.length >= 2 && p.conservation < 10 ? p.endgame_hand.length - 1 : p.endgame_hand.length);
function egPill(tileEl, n, what, slip) {
  if (!(n > 0)) return tileEl;
  const s = el('small', 'eg', '+' + n);
  if (slip) { s.title = ''; s.onmouseenter = () => slip(s); s.onmouseleave = hideIncome; }          // (hover: the slip with one line per source)
  else s.title = 'Endgame live count: ' + what + ' would give +' + n + ' now';
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
// BGA replays provide the accepted normal-turn ordinal directly. The engine's
// completed-turn counter below remains the compatibility path for live games,
// forks, sandbox positions and older archived replay payloads.
function turnNumber(st) {
  if (st.turn_context) return st.turn_context.display;  // accepted normal starts, including interrupted turns; neutral phases retain the last number
  const t = st.turn || 0, a = st.active_player || 0, first = a ^ (t & 1);
  const done = (seat) => Math.floor((t + (seat === first ? 1 : 0)) / 2);        // (the finished turns of a seat)
  if (st.current_action) return done(a) + 1;
  const steps = S.replay && S.replay.steps, cur = steps && steps[S.step];
  if (cur && cur.state === st) {                                    // (replay: after the first action of a turn with a second one to come, no card is chosen for a moment; the turn goes on)
    for (let j = S.step - 1; j >= 0 && steps[j].state.turn === t; j--) if (steps[j].state.current_action) return done(a) + 1;
  }
  return done(1 - a);
}
// The player's name sits in a span inside the link (`.ppname .nm`, parkposter.css). A name that is too long for the row is set smaller (20 px down to 16 px, so it just fits);
// if it does not fit even at 16 px it keeps that size and ends in an ellipsis (`.nm` has text-overflow).
const NAME_MAX = 20, NAME_MIN = 16;
const zoomOf = (e) => e.getBoundingClientRect().width / (e.offsetWidth || 1) || 1;          // (the page is zoomed to the window: widths from getBoundingClientRect are scaled)
function squeezeName(a, text) {
  a.textContent = '';
  a.append(el('span', 'nm', text));
  const fit = () => {
    const who = a.parentElement, head = who && who.parentElement;
    if (!head || !head.clientWidth) return;
    const px = (e, k) => parseFloat(getComputedStyle(e)[k]) || 0;
    const others = (box) => [...box.children].filter((c) => c !== a && c !== who);
    // the room of the name = the header minus its padding, minus everything else in the header (and in the name's own group) and the gaps between them
    const w = head.clientWidth - px(head, 'paddingLeft') - px(head, 'paddingRight') -
      others(head).reduce((s, c) => s + c.getBoundingClientRect().width / zoomOf(head), 0) - px(head, 'columnGap') * (head.children.length - 1) -
      others(who).reduce((s, c) => s + c.getBoundingClientRect().width / zoomOf(head), 0) - px(who, 'columnGap') * (who.children.length - 1);
    const ctx = (squeezeName.ctx = squeezeName.ctx || document.createElement('canvas').getContext('2d'));
    ctx.font = "400 " + NAME_MAX + "px 'Park Head', system-ui, sans-serif";
    const tw = ctx.measureText(text).width;
    const size = tw <= w ? NAME_MAX : Math.max(NAME_MIN, Math.floor(NAME_MAX * (w - 2) / tw * 10) / 10);          // (2 px spare so a near miss does not end in an ellipsis)
    a.style.fontSize = size === NAME_MAX ? '' : size + 'px';
  };
  if (typeof ResizeObserver !== 'undefined') queueMicrotask(() => { if (a.parentElement && a.parentElement.parentElement) new ResizeObserver(fit).observe(a.parentElement.parentElement); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
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
// The break marker moves from dot to dot (a hop on a small arc per step, the first hop of a round drops onto the first dot; a new round puts the marker back on the first dot with a pop), the number changes and ticks when the marker has landed, and the pill flashes green when the marker reaches 9. Only when
// the break moved from the picture before (a few steps: a jump of the position leaves it as it is); every mode (css `.pips .mk`, `.bn.tick`). The dots are drawn in their final state by `headerStats`: here they go back to the start and fill up.
const HOP_MS = 230, hopsReduced = motionOff;
function hopBreak(brk, pips, num, from, to) {
  if (from === undefined || from === to || hopsReduced() || !pips.animate) return;
  const speed = Math.max(.1, Number(S.animationSpeed) || 1), dots = [...pips.children], ms = HOP_MS / speed;
  const setNum = (v) => { num.firstChild.nodeValue = v; }, tick = () => { num.classList.add('tick'); num.style.animationDuration = (300 / speed) + 'ms'; };
  if (to < from) {                                                         // a new round: the marker is back on the first dot
    tick();
    if (to === 1) dots[0].animate([{ transform: 'scale(.4)' }, { transform: 'scale(1.15)' }], { duration: 260 / speed, easing: 'ease-out' });
    return;
  }
  const cur = dots[to - 1], pitch = dots[1].offsetLeft - dots[0].offsetLeft, mk = el('b', 'mk');
  setNum(from);                                                            // (the number only changes when the marker has landed)
  cur.classList.remove('cur'); for (let k = Math.max(0, from - 1); k < to - 1; k++) dots[k].classList.remove('done');
  pips.append(mk);
  const at = (k, extra = '') => 'translateX(' + k * pitch + 'px) ' + extra;
  const opts = { duration: ms, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' };
  (async () => {
    for (let p = from; p < to && mk.isConnected; p++) {                    // (every step is one hop of the same length: 0 to 9 = nine hops; the first hop of a round drops onto the first dot from the side of the number)
      if (p >= 1) dots[p - 1].classList.add('done');
      const a = p === 0
        ? mk.animate([{ transform: at(-.5, 'scale(.3)'), opacity: 0 }, { transform: at(-.25, 'translateY(-11px) scale(1.22)'), opacity: 1, offset: .5 }, { transform: at(0, 'scale(1.15)'), opacity: 1 }], opts)
        : mk.animate([{ transform: at(p - 1, 'scale(1.15)') }, { transform: at(p - .5, 'translateY(-11px) scale(1.22)'), offset: .5 }, { transform: at(p, 'scale(1.15)') }], opts);
      try { await a.finished; } catch (e) { break; }
    }
    mk.remove(); cur.classList.add('cur'); setNum(to); tick();
    if (to === 9 && brk.isConnected) brk.classList.add('flash-up');       // (the green wash of the pill, only for the end of the break)
  })();
}
// round and break counter: the two pills at the right of the top bar (#hdrstats)
function headerStats(st, flash) {
  const root = $('hdrstats');
  if (!root) return;
  root.replaceChildren();
  const rnd = flash('round', st.round, el('div', 'pill rnd'), true);          // (the Round | Turn pill never animates)
  const rn = el('b', 'rn', st.round), tn = el('b', 'tn', turnNumber(st));
  const rh = el('div', 'half'), th = el('div', 'half');          // (two equal halves, the word small above the number, a dashed divider between them)
  rh.append(el('span', 'lab', 'Round'), rn);
  th.append(el('span', 'lab', 'Turn'), tn);
  rnd.append(rh, el('i', 'dv'), th);
  centreInk(rn); centreInk(tn);
  const brk = flash('break', st.break_position, el('div', 'pill brk'), true);          // (no colour change while the marker advances: it hops from dot to dot, `hopBreak`; only the 9 flashes green)
  brk.title = 'Break track: the break ends the round when the token reaches 9';
  const pips = el('div', 'pips');
  for (let k = 0; k < 9; k++) pips.append(el('i', k < st.break_position - 1 ? 'done' : k === st.break_position - 1 ? 'cur' : ''));
  const num = el('b', 'bn', st.break_position);
  num.append(el('small', '', '/9'));
  const mug = el('img', 'brkicon'); mug.src = '/icons/r3c14.webp'; mug.alt = 'Break'; mug.draggable = false;            // (Ark Nova's symbol for the break: a coffee mug)
  brk.append(mug, num, pips);
  root.append(rnd, brk);
  bindChip(rh, th, turnNumber);          // (hover: the move bar shows the breaks / the actions of the players, move-hover.js)
  hopBreak(brk, pips, num, S.lastNums.break, st.break_position);
  const menu = PLAY ? gameMenu() : null;                                 // concede / propose to abandon / end on overtime
  if (menu) root.append(menu);
}
export const CARD_TOKEN_ICON = { Venom: 'r2c12', Constriction: 'r2c9', Multiplier: 'r6c8' };       // (icons of BGA's sheet, see web/icons/names.json)
export const CARD_TOKEN_TEXT = { Venom: 'Venom token: it goes when this card is used or put back; if no token was removed this turn, 2 money are owed', Constriction: 'Constriction token: this card has 2 less strength until it is used or put back', Multiplier: 'Multiplier token' };
export function sidePanel(st) {
  const root = $('side');
  root.replaceChildren();
  const nums = {};
  const flash = (key, value, node, quiet) => {                       // (`quiet`: only remember the number, no flash: the round / break pills of the top bar)
    nums[key] = value;
    const old = S.lastNums[key];
    if (!quiet && old !== undefined && old !== value) node.classList.add(value > old ? 'flash-up' : 'flash-down');
    return node;
  };
  headerStats(st, flash);
  seatOrder().forEach((seat) => {                                   // (the spectated player's box first: above)
    const p = st.players[seat];
    const box = el('div', 'pp' + (st.active_player === seat && st.phase !== 'over' ? ' active' : ''));
    box.dataset.seat = String(seat);                                  // (card-motion.js flies cards to and from the box of a seat)
    box.style.setProperty('--pc', seatColor(seat));
    if (isLight(seatColor(seat))) box.classList.add('light');
    { const tone = chipTone(seatColor(seat)); if (tone) box.classList.add(tone); }
    const head = el('div', 'pphead' + (st.active_player === seat && st.phase !== 'over' ? ' on' : ''));          // (`on`: the player whose turn it is; no style for now)
    const pl = S.replay.players[seat];
    const name = el('a', 'ppname');
    squeezeName(name, pl.name);
    // the name links to the player's BGA profile (new tab); it looks like plain text (see .ppname)
    if (pl.id) { name.href = 'https://boardgamearena.com/player?id=' + encodeURIComponent(pl.id); name.target = '_blank'; name.rel = 'noopener noreferrer'; }
    const scoreValue = p.score !== undefined ? p.score : trackScore(p);
    const score = flash(seat + ':score', scoreValue, el('span', 'ppscore'));
    score.title = 'Score (appeal + conservation points)';
    score.append(el('b', 'chip', String(scoreValue)));                      // (an ink chip with the number: its width follows the digits, 56 / 112 / -14 keep the same type size and shape)
    const who = el('span', 'who');
    who.append(name);
    if (SHOW_ELO && pl.elo) { const elo = el('span', 'ppelo', String(pl.elo)); elo.title = 'Elo of ' + pl.name + ' at this table (before the game)'; who.append(elo); }
    const cb = clockBadge(seat);                                            // the clock of the time control, next to the name
    head.append(...(cb ? [who, cb, score] : [who, score]));
    box.append(head);

    const res = el('div', 'ppres');                                        // the five tiles: money (and income), X tokens, reputation, appeal, conservation points
    const inc = p.income_total !== undefined ? p.income_total : p.income !== undefined ? p.income : trackIncome(p.appeal);
    const mo = flash(seat + ':money', p.money, tile('ov money', 'Money', pic('money', 48), p.money, '+' + inc));          // (the total income paid at the next break sits on the money tile)
    const chip = mo.querySelector('small');                                   // (hover: the income slip, one line per source and per sponsor)
    chip.title = ''; chip.onmouseenter = () => showIncome(chip, p); chip.onmouseleave = hideIncome;
    res.append(mo);
    res.append(flash(seat + ':x', p.x_tokens, tile('ov xo', 'X tokens', pic('xtoken_ns', 46), p.x_tokens)));          // (the number lies on the X, white with a black outline)
    res.append(flash(seat + ':reputation', p.reputation, tile('ov', 'Reputation', pic('reputation', 48), p.reputation)));
    const lv = S.endgameLive && p.endgame_live ? p.endgame_live : null;                // sponsors: both players; endgame cards: only for a player whose hand is shown (the eye is open / the own seat)
    const cardCp = lv && !hides(seat) && p.endgame_cards ? p.endgame_cards : 0;
    res.append(flash(seat + ':appeal', p.appeal, egPill(tile('ov dk', 'Appeal', pic('appeal', 48), p.appeal), lv && lv.appeal, 'the sponsors', (chipEl) => showEndgame(chipEl, p, 'appeal', !hides(seat), p.eg_appeal && hides(seat) ? Math.max(0, nEgNow(p)) : 0))));          // (no endgame card scores appeal yet: `p.eg_appeal`, replay/view.py `_endgame_has_appeal`, turns the hidden-card line on when the data has one)
    res.append(flash(seat + ':conservation', p.conservation, egPill(tile('ov dk', 'Conservation points', pic('conservation', 48), p.conservation), lv && lv.conservation + cardCp, cardCp ? 'the sponsors and the endgame cards' : 'the sponsors', (chipEl) => showEndgame(chipEl, p, 'conservation', !!cardCp, hides(seat) ? Math.max(0, nEgNow(p)) : 0))));
    const nEg = p.endgame_hand.length >= 2 && p.conservation < 10 ? p.endgame_hand.length - 1 : p.endgame_hand.length;          // (before the discard at 10 conservation one of the cards is going to be thrown away)
    const left = p.endgame_unscored === undefined ? (st.phase === 'over' ? 0 : nEg) : Math.min(nEg, p.endgame_unscored);          // (the cards not scored yet, `endgame_unscored` in every state: replays count it per card, view.py `_endgame_unscored`; the engine of forks / sandbox / live games scores all cards in the step that ends the game)
    if (left > 0 && hides(seat)) res.children[4].append(egCardIcon(left));          // (only where the cards are hidden)
    box.append(res);

    const res2 = el('div', 'ppres2');
    const workers = p.tokens.filter((t) => t.type === 'worker');
    const ready = workers.filter((t) => t.location === 'reserve').length;     // workers ready to use (the ones in the reserve)
    const wi = el('img', 'icon'); wi.src = workerUrl(seat); wi.alt = ''; wi.height = 36;
    const owned = workers.filter((t) => !/^supply_/.test(t.location)).length;     // workers the player has (the locked ones in the supply do not count yet)
    const wr = flash(seat + ':workers', ready, tile('wk', 'Workers available / owned (' + workers.filter((t) => /^supply_/.test(t.location)).length + ' still locked)', wi, ready));
    wr.querySelector('b').append(el('small', '', '/' + owned));               // like the hand: 1/3
    wr.dataset.wkSeat = String(seat);                                        // (assoc-motion.js: the icon is the store of the player's workers; its number follows the flights)
    const limit = p.hand_limit !== undefined ? p.hand_limit : (p.tokens.some((t) => t.type === 'fac-rep-hand' && /^university_/.test(t.location)) ? 5 : 3);
    const hb = el('b', p.hand.length > limit ? 'over' : '', p.hand.length);   // red while the hand is over the limit, as on BGA
    hb.append(el('small', '', '/' + limit));
    const hand = el('span', 'rt hd');
    hand.title = 'Cards in hand / hand size';
    hand.append(plainIcon('r10c8', 36), hb);
    flash(seat + ':hand', p.hand.length, hand);
    res2.append(wr, hand);
    if (p.map_id === '11') {                                                   // map 11 (Caves): the cards stored under the notepad, X/3, next to the hand
      const sb = el('b', '', (p.stored || []).length);
      sb.append(el('small', '', '/3'));
      const st3 = el('span', 'rt hd stored');
      st3.title = 'Cards stored under the notepad (Caves) / capacity';
      st3.append(plainIcon('r5c2', 36), sb);
      flash(seat + ':stored', (p.stored || []).length, st3);
      res2.append(st3);
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
    // before the action cards are shuffled (`actions_hidden`) the order is not known: slot 1 is always Animals (drawn like the real card), the other four are empty numbered slots
    const slots = st.actions_hidden ? [{ type: 'animals', level: 1, variant: 0, tokens: [] }, null, null, null, null] : p.action_cards;
    slots.forEach((a, i) => {
      if (!a) { const g = el('span', 'ac ghost'); g.append(el('b', '', i + 1)); acts.append(g); return; }
      // the card chosen for the running action (set by "chooses action card", cleared when it is placed back on slot 1 at the end of the action)
      const chosen = st.current_action && st.current_action.seat === seat && st.current_action.slot === i + 1;
      const c = el('span', 'ac' + (a.level === 2 ? ' lvl2' : '') + (chosen ? ' chosen' : ''));
      c.dataset.actionSeat = seat; c.dataset.actionType = a.type; c.dataset.actionView = 'sidebar';
      c.title = 'Slot ' + (i + 1) + ': ' + ACTION_NAMES[a.type] + (a.level === 2 ? ' II' : '') + (a.variant ? ' (variant ' + a.variant + ')' : '');
      c.append(pic(ACTION_ICON[a.type], 40));
      const art = '/action_cards/' + a.type + '_' + (S.replay.marine_worlds ? a.variant : 0) + '_' + (a.level === 2 ? 2 : 1) + '.webp';     // the whole action card
      bindPreview(c, art, undefined, () => variantStatsBox(st, seat, a));
      if (S.replay.marine_worlds && a.variant) {         // the variant's silver effect badge (side I or II of the card) on the top left of the action card
        const b = el('img', 'variant');
        b.src = '/action_icons/' + a.type + '_' + a.variant + '_' + (a.level === 2 ? 2 : 1) + '.webp'; b.alt = 'Variant ' + a.variant;
        c.append(b);
      }
      if (p.map_id === '12' && !st.actions_hidden && p.slot_numbers) {      // map 12 (Binders): the slot's real strength (conceal markers raise it) as the small strength icon on the bottom left
        const n = amountIcon('STRENGTH', p.slot_numbers[i]);
        if (n) { const w = el('span', 'acstr'); w.append(n); c.append(w); }
      }
      (a.tokens || []).forEach((t, k) => {                // the tokens that lie on the card: Venom (-> 2 money unless removed), Constriction (-2 strength), Multiplier
        const id = CARD_TOKEN_ICON[t]; if (!id) return;
        const b = el('img', 'actoken'); b.src = iconUrl(id); b.alt = t; b.title = CARD_TOKEN_TEXT[t] || t; b.style.setProperty('--k', String(k));
        b.dataset.actionToken = t; b.dataset.tokenIndex = k;
        c.append(b);
      });
      acts.append(c);
    });
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
  if (BONUS_TOKENS.includes(type)) { const k = hdPentagonSvg(type, 36); k.setAttribute('class', 'btoken-hd'); t.append(k); }          // (the pentagon of the track's bonus with its HD picture, like the Extra Shift on the board; no sprite)
  else if (id) { const img = el('img'); img.src = iconUrl(id); img.alt = type; img.height = 36; t.append(img); } else t.append(el('b', '', type));
  if (ghost) t.addEventListener('animationend', () => t.remove());
  return t;
}
