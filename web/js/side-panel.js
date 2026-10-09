// [module] Right column per player: tracker (score, appeal, income, reputation...), break track, deck / discard icons, bonus tokens.
import { $, el, seatColor, svg } from './util.js';
import { PLAY, S } from './state.js';
import { eyeLocked, eyeOpen, toggleEye } from './pov.js';
import { hidePreview, showPreview, zoneNew } from './cards.js';
import { ACTION_ICON, ACTION_NAMES, iconUrl, pic, workerUrl } from './icons.js';
import { openPile } from './pile.js';
import { clockBadge, gameMenu } from './play.js';

// the draw pile (two grey cards, the count on the front one) and the discard pile (count and a trash can), drawn like BGA's
function deckIcon(n) {
  const w = el('span', 'dc');
  w.title = 'Cards in the deck';
  const s = svg('svg', { viewBox: '0 0 72 56', width: 72, height: 56 });
  s.append(svg('rect', { x: 26, y: 3, width: 40, height: 48, rx: 6, transform: 'rotate(8 46 27)', fill: '#7d7a73', stroke: '#2b2b2b', 'stroke-width': 3 }));
  s.append(svg('rect', { x: 8, y: 6, width: 40, height: 48, rx: 6, fill: '#8d8a83', stroke: '#2b2b2b', 'stroke-width': 3 }));
  s.append(svg('rect', { x: 12, y: 10, width: 32, height: 40, rx: 4, fill: 'none', stroke: 'rgba(255,255,255,.35)', 'stroke-width': 2 }));
  const t = svg('text', { x: 28, y: 36, class: 'deck-num', style: 'font-size:' + (String(n).length > 2 ? 17 : 22) + 'px' });
  t.textContent = n;
  s.append(t);
  w.append(s);
  return w;
}
function discardIcon(n) {
  const w = el('span', 'dc');
  w.title = 'Cards in the discard pile';
  w.append(el('b', '', n));
  const s = svg('svg', { viewBox: '0 0 44 48', width: 40, height: 44 });
  s.append(svg('rect', { x: 2, y: 2, width: 40, height: 44, rx: 9, fill: '#5d5a54', stroke: '#fff', 'stroke-width': 2.5 }));
  s.append(svg('rect', { x: 2, y: 2, width: 40, height: 44, rx: 9, fill: 'none', stroke: '#1d1d1d', 'stroke-width': 1 }));
  s.append(svg('path', { d: 'M13 16h18M18 16v-3h8v3M15 19l1.5 17a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2L29 19z', fill: 'none', stroke: '#111', 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  s.append(svg('path', { d: 'M20 22v12M24 22v12', stroke: '#111', 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
  w.append(s);
  return w;
}
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
function eyeButton(seat) {                                          // open eye = this player's cards are shown; the only open eye cannot be closed
  if (PLAY) return document.createTextNode('');                     // (a live game: no eyes, the server decides what a seat sees)
  const open = eyeOpen(seat), locked = eyeLocked(seat), nm = S.replay.players[seat].name;
  const b = el('button', 'poveye' + (open ? '' : ' closed') + (locked ? ' only' : ''));
  b.type = 'button';
  b.title = locked ? nm + "'s cards are shown (at least one player's cards must stay visible)" : open ? 'Hide ' + nm + "'s cards" : 'Show ' + nm + "'s cards";
  b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', String(open));
  const g = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  g.append(svg('path', { d: 'M2 12C5 6.5 8.5 4.5 12 4.5S19 6.5 22 12C19 17.5 15.5 19.5 12 19.5S5 17.5 2 12Z' }), svg('circle', { cx: 12, cy: 12, r: 3.2, fill: 'currentColor' }));
  if (!open) g.append(svg('path', { d: 'M3.5 3.5L20.5 20.5', 'stroke-width': 2.6 }));         // closed: the same eye, struck through (and faded by .poveye.closed)
  b.append(g);
  b.onclick = () => toggleEye(seat);
  return b;
}
const isLight = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); return !!m && (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255 > 0.6; };
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
  const top = el('div', 'sidetop');
  const brk = el('div', 'breaktrack');
  brk.title = 'Break track';
  const bi = el('img', 'icon'); bi.src = iconUrl('r3c14'); bi.alt = 'Break'; bi.height = 40;
  const rnd = flash('round', st.round, el('span', 'roundno', 'Round ' + st.round));
  rnd.title = 'Round ' + st.round + ': a new round starts when a break ends';
  brk.append(flash('break', st.break_position, el('b', '', st.break_position + ' / 9')), bi, rnd);
  const menu = PLAY ? gameMenu() : null;                                 // concede / propose to abandon / end on overtime, in the row of the round counter
  if (menu) brk.append(menu);
  top.append(brk);
  const counts = el('div', 'deckcounts');
  const discardBtn = flash('discard', st.main_discard_size, discardIcon(st.main_discard_size));
  discardBtn.classList.add('pilebtn');
  discardBtn.title = 'Discard pile: click to list its cards';
  discardBtn.onclick = () => openPile('discard');
  const deckBtn = flash('deck', st.main_deck_size, deckIcon(st.main_deck_size));
  deckBtn.classList.add('pilebtn');
  deckBtn.title = 'Draw pile: click to list the cards that are left (in no particular order)';
  deckBtn.onclick = () => openPile('deck');
  counts.append(deckBtn, discardBtn);
  const eg = el('span', 'dc');
  eg.title = 'Endgame cards left';
  const ei = el('img', 'icon'); ei.src = iconUrl('r10c15'); ei.alt = 'Endgame cards'; ei.height = 32;
  eg.append(el('b', '', st.endgame_deck_size), ei);                       // the number first, like the discard pile
  eg.classList.add('pilebtn');
  eg.title = 'Endgame cards left: click to list them';
  eg.onclick = () => openPile('endgame');
  flash('egdeck', st.endgame_deck_size, eg);
  counts.append(eg);
  top.append(counts);
  root.append(top);
  st.players.forEach((p, seat) => {
    const box = el('div', 'pp' + (st.active_player === seat && st.phase !== 'over' ? ' active' : ''));
    const head = el('div', 'pphead');
    const pl = S.replay.players[seat];
    const name = el('a', 'ppname', pl.name);                       // the name links to the player's BGA profile (new tab); it looks like plain text (see .ppname)
    if (pl.id) { name.href = 'https://boardgamearena.com/player?id=' + encodeURIComponent(pl.id); name.target = '_blank'; name.rel = 'noopener noreferrer'; }
    name.style.color = seatColor(seat);
    if (isLight(seatColor(seat))) name.classList.add('light');     // yellow / white: a very thin black outline keeps the name readable
    const score = el('span', 'ppscore');
    score.title = 'Score (appeal + conservation points)';
    const scoreValue = p.score !== undefined ? p.score : trackScore(p);
    score.append(document.createTextNode(scoreValue + ' ★'));
    flash(seat + ':score', scoreValue, score);
    const who = el('span', 'who');
    who.append(name);
    who.append(eyeButton(seat));
    const cb = clockBadge(seat);                                            // the clock of the time control, to the right of the name
    head.append(...(cb ? [who, cb, score] : [who, score]));
    box.append(head);

    const res = el('div', 'ppres');
    const xr = el('span', 'rs xr');               // X tokens: the number sits to the left of the token
    xr.title = 'X tokens';
    xr.append(el('b', '', p.x_tokens), pic('xtoken', 40));
    flash(seat + ':x', p.x_tokens, xr);
    for (const [icon, n, label] of [['money', p.money, 'Money'], ['reputation', p.reputation, 'Reputation'], ['appeal', p.appeal, 'Appeal'], ['conservation', p.conservation, 'Conservation']]) {
      const r = el('span', 'rs inside rs-' + icon + (icon === 'money' ? ' money' : ''));    // the number is printed over the icon
      r.title = label;
      r.append(pic(icon, 42), el('b', '', n));
      flash(seat + ':' + icon, n, r);
      if (icon === 'appeal') {                       // a small money icon on top of the appeal icon: the income this player gets at a break
        const inc = el('span', 'income money');       // the standard money tile: number inside the icon, white rounded border
        inc.title = 'Income at the next break (from the appeal track' + (['5', '5a'].includes(S.replay.maps[seat].id) ? ' and the hexes covered next to the restaurant' : '') + ')';
        inc.append(pic('money', 30), el('i', '', p.income !== undefined ? p.income : trackIncome(p.appeal)));
        r.append(inc);
      }
      res.append(r);
      if (icon === 'money') res.append(xr);
    }

    box.append(res);

    const res2 = el('div', 'ppres2');
    const wr = el('span', 'rs xr');                // workers ready to use (the ones in the reserve); the number sits left of the meeple like the X tokens
    wr.title = 'Workers available (' + p.tokens.filter((t) => t.type === 'worker' && /^supply_/.test(t.location)).length + ' still locked)';
    const wi = el('img', 'icon'); wi.src = workerUrl(seat); wi.alt = 'Workers'; wi.height = 40;
    const ready = p.tokens.filter((t) => t.type === 'worker' && t.location === 'reserve').length;
    wr.append(el('b', '', ready), wi);
    flash(seat + ':workers', ready, wr);
    const hand = el('span', 'rs handcount');         // cards in hand / hand size (3, or 5 with the hand-size university)
    const limit = p.hand_limit !== undefined ? p.hand_limit : (p.tokens.some((t) => t.type === 'fac-rep-hand' && /^university_/.test(t.location)) ? 5 : 3);
    hand.title = 'Cards in hand / hand size';
    const hi = el('img', 'icon'); hi.src = iconUrl('r10c8'); hi.alt = 'Cards in hand'; hi.height = 40;
    const hb = el('b', p.hand.length > limit ? 'over' : '', p.hand.length + '/' + limit);   // red while the hand is over the limit, as on BGA
    hand.append(hi, hb);
    flash(seat + ':hand', p.hand.length, hand);
    const eg = el('span', 'rs handcount');          // endgame scoring cards held: 2 at the start, 1 after the discard at 10 conservation, more with Resistance
    eg.title = 'Endgame scoring cards';
    const ei = el('img', 'icon'); ei.src = iconUrl('r10c15'); ei.alt = 'Endgame cards'; ei.height = 40;
    eg.append(ei, el('b', '', p.endgame_hand.length));
    flash(seat + ':endgame', p.endgame_hand.length, eg);
    res2.append(wr, hand, eg);
    box.append(res2);

    const acts = el('div', 'ppactions');
    p.action_cards.forEach((a, i) => {
      // the card chosen for the running action (set by "chooses action card", cleared when it is placed back on slot 1 at the end of the action)
      const chosen = st.current_action && st.current_action.seat === seat && st.current_action.slot === i + 1;
      const c = el('span', 'ac' + (a.level === 2 ? ' lvl2' : '') + (chosen ? ' chosen' : ''));
      c.title = 'Slot ' + (i + 1) + ': ' + ACTION_NAMES[a.type] + (a.level === 2 ? ' II' : '') + (a.variant ? ' (variant ' + a.variant + ')' : '');
      c.append(pic(ACTION_ICON[a.type], 40));
      const art = '/action_cards/' + a.type + '_' + (S.replay.marine_worlds ? a.variant : 0) + '_' + (a.level === 2 ? 2 : 1) + '.webp';     // the whole action card
      c.addEventListener('mouseenter', () => showPreview(art));
      c.addEventListener('mouseleave', hidePreview);
      if (S.replay.marine_worlds && a.variant) {         // the variant's silver effect badge (side I or II of the card) on the top left of the action card
        const b = el('img', 'variant');
        b.src = '/action_icons/' + a.type + '_' + a.variant + '_' + (a.level === 2 ? 2 : 1) + '.webp'; b.alt = 'Variant ' + a.variant;
        c.append(b);
      }
      acts.append(c);
    });
    if (st.actions_hidden) acts.classList.add('unseen');          // (before the action cards are shuffled: the space stays, the cards are invisible)
    box.append(acts);

    const grid = el('div', 'ppicons');
    const ICON_ROWS = [['Africa', 'Europe', 'Asia', 'Americas', 'Australia'],
                       ['Bird', 'Predator', 'Herbivore', 'Reptile', 'Primate', ...(S.replay.marine_worlds ? ['SeaAnimal'] : [])],
                       ['Bear', 'Pet', 'Science', 'Rock', 'Water']];
    ICON_ROWS.forEach((names, r) => names.forEach((k, ci) => {
      const n = (p.icons || {})[k] || 0;
      const c = el('span', 'ic' + (n ? '' : ' zero'));
      c.title = k;
      const img = el('img', 'badge');
      img.src = '/badges/' + k + '.webp'; img.alt = k; img.width = 30; img.height = 30;
      c.append(el('b', '', n), img);
      flash(seat + ':icon:' + k, n, c);
      c.style.gridColumn = String(ci + 1);                            // (a row of 5 icons fills the 5 columns, the 6 of the animal row use 6 columns)
      c.style.gridRow = String(r + 1);
      grid.append(c);
    }));
    grid.style.gridTemplateColumns = 'repeat(' + (S.replay.marine_worlds ? 6 : 5) + ', 1fr)';
    box.append(grid);
    // the bonus tokens of the player's notepad (one-time effects); the row exists only while the player has at least one, every token goes at the step it is used
    const toks = p.tokens.filter((t) => BONUS_TOKENS.includes(t.type)).sort((x, y) => BONUS_TOKENS.indexOf(x.type) - BONUS_TOKENS.indexOf(y.type) || x.id - y.id);
    const bz = zoneNew(seat + ':bonustokens', toks.map((t) => t.type));
    if (toks.length) {
      const row = el('div', 'bonusrow');
      row.title = 'Bonus tokens';
      const items = toks.map((t) => bonusToken(t.type, bz.isNew(t.type) ? 'card-new' : ''));
      for (const g of bz.gone) items.splice(Math.min(g.index, items.length), 0, bonusToken(g.key, 'card-gone', true));      // a token that was just used fades away in its place
      row.append(...items);
      box.append(row);
    }
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
