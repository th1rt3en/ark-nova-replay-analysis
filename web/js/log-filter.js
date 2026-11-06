// [module] Filter bar of the Log: the funnel of the search bar opens two dropdowns, Players and Actions; lines that do not match are hidden (`li.fout`).
// Nothing narrowed (every player and every action ticked) shows the whole log. Players and Actions combine with AND, the ticked actions with OR.
// Both the owner (player) and the action of a line are derived from the labels (no data from the server): a turn is every line from "chooses action card X" up to the next
// "chooses action card" (or the next break): all of it belongs to the player who chose and to the action X, whoever the line names (the display refill and the Constriction
// token after the action are part of the turn). Neutral (no player, `owner` null; the log shows them with a grey stripe, `NEUTRAL_COLOR`): the action card draft and the setup
// before the first turn, the whole break (income, discards, refills), and the final scoring after the last turn. Neutral steps are no menu entry: they show while no player is
// narrowed and are hidden as soon as a player is unticked (Actions > Break shows the break alone). X-back is a turn without a chosen action: the player puts the action card back and gains an X-token ("X gains 1 xtoken" followed by "X places action card Y at position 1").
import { $, el, seatColor } from './util.js';
import { S } from './state.js';
import { iconUrl } from './icons.js';
import { FILTERS, refreshLogSearch } from './log-search.js';

export const NEUTRAL_COLOR = '#B5B2A8';                                                       // (the stripe of a neutral step: a light warm grey, not the mid grey of a white player nor a black player's)
export const ACTIONS = [['animals', 'Animals', 'action-animals'], ['build', 'Build', 'action-build'], ['cards', 'Cards', 'action-cards'], ['association', 'Association', 'action-association'],
                        ['sponsors', 'Sponsors', 'action-sponsors'], ['xback', 'X-back', 'xtoken'], ['break', 'Break', 'break']];
const NS = 'http://www.w3.org/2000/svg';
const sel = { players: new Set([0, 1]), actions: new Set(ACTIONS.map((a) => a[0])) };      // what is ticked (everything = no filter)
let panel, fun, fields, menu, foot, openMenu = null, cache = null;                         // `openMenu`: 'players' | 'actions' | null

/** Which turn each step belongs to: [{act, owner, x}] (act: animals ... xback, break, or null; owner: 0 / 1, or null = neutral). */
export function groupsOf(steps) {
  if (cache && cache.steps === steps && cache.n === steps.length) return cache.out;
  const names = ((S.replay && S.replay.players) || []).map((p) => p.name);
  const out = []; let cur = null, owner = null, inBreak = false, pend = [], ended = false, lastPlace = -1;
  steps.forEach((s, i) => {
    const l = (s && s.label) || '';
    if (/^Starting a new break/.test(l)) inBreak = true;
    const m = / chooses action card (Animals|Build|Cards|Association|Sponsors)/.exec(l);
    if (m) {
      cur = m[1].toLowerCase();
      const seat = typeof s.actor === 'number' ? s.actor : names.findIndex((n) => l.startsWith(n + ' '));
      owner = seat >= 0 ? seat : null;
      for (const j of pend) { out[j].act = cur; out[j].owner = owner; }
      pend = [];
    }
    const back = !inBreak && !m && /^(.+) gains \d+ xtoken$/.exec(l);          // (X-back: the player puts the action card back instead of using it and gains an X-token; the next line is the card being placed)
    if (back && ((steps[i + 1] && steps[i + 1].label) || '').startsWith(back[1] + ' places action card')) {
      const seat = names.indexOf(back[1]);
      cur = 'xback'; owner = seat >= 0 ? seat : typeof s.actor === 'number' ? s.actor : null;
    }
    out[i] = { act: inBreak ? 'break' : cur, owner: inBreak ? null : owner };
    if (/pays \d+ xtoken for increasing card strength/.test(l)) pend.push(i);          // (paid before the card is chosen: it belongs to the turn that follows)
    if (/^End of game triggered/.test(l)) ended = true;
    if (/ places action card .*\(finishing action\)/.test(l)) lastPlace = i;
    if (/^End of the break/.test(l)) { inBreak = false; cur = null; owner = null; }
  });
  if (ended && lastPlace >= 0) for (let i = lastPlace + 1; i < out.length; i++) out[i] = { act: null, owner: null };      // (the final scoring after the last turn)
  cache = { steps, n: steps.length, out };
  return out;
}
const narrowedPlayers = () => sel.players.size < 2;
const narrowedActions = () => sel.actions.size < ACTIONS.length;
const playerOk = (g) => !narrowedPlayers() || (g.owner !== null && sel.players.has(g.owner));          // (narrowed to a player: neutral steps are hidden)
const actionOk = (g, key) => key ? g.act === key : !narrowedActions() || sel.actions.has(g.act);

const svg = (cls, vb, d) => { const s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path'); s.setAttribute('class', cls); s.setAttribute('viewBox', vb); s.setAttribute('aria-hidden', 'true'); p.setAttribute('d', d); s.append(p); return s; };
const CHEV = () => svg('lf-chv', '0 0 16 16', 'M3 6l5 5 5-5');
const TICK = () => svg('lf-tick', '0 0 12 12', 'M2 6.5l3 3 5-7');
const plural = (n) => n + (n === 1 ? ' line' : ' lines');

/** Apply the filter to the lines, then redraw the fields, the open menu and the footer. Called after every render and every click. */
export function refreshLogFilter() {
  if (!panel) return;
  const steps = (S.replay && S.replay.steps) || [], list = $('moves'), g = groupsOf(steps), kids = [...list.children];
  let shown = 0, total = 0;
  const countP = [0, 0], countA = {}; ACTIONS.forEach((a) => { countA[a[0]] = 0; });
  kids.forEach((li, i) => {
    if (i > (S.seenStep ?? S.step) || li.style.display === 'none') { li.classList.remove('fout'); return; }
    total++;
    const ok = playerOk(g[i]) && actionOk(g[i]);                                  // (the step on show is hidden too when it does not match; `followLog` then follows the last line before it that is shown)
    li.classList.toggle('fout', !ok);
    if (ok) shown++;
    if (g[i].owner !== null && actionOk(g[i])) countP[g[i].owner]++;
    if (playerOk(g[i])) for (const a of ACTIONS) if (actionOk(g[i], a[0])) countA[a[0]]++;
  });
  FILTERS.active = (narrowedPlayers() ? 1 : 0) + (narrowedActions() ? 1 : 0);
  drawFields();
  drawMenu(countP, countA);
  foot.hidden = !FILTERS.active;
  foot.firstChild.textContent = 'Showing ' + shown + ' of ' + plural(total);
}

function drawFields() {
  fields.replaceChildren();
  const players = (S.replay && S.replay.players) || [];
  const p = el('button', 'lf-dd' + (openMenu === 'players' ? ' open' : '')); p.type = 'button'; p.append(el('span', 'lf-lbl', 'Players'));
  const sw = el('span', 'lf-sw');
  [0, 1].forEach((k) => { const b = el('i', sel.players.has(k) ? '' : 'off'); if (sel.players.has(k)) b.style.background = seatColor(k); sw.append(b); });
  p.append(sw, CHEV());
  const a = el('button', 'lf-dd' + (openMenu === 'actions' ? ' open' : '')); a.type = 'button'; a.append(el('span', 'lf-lbl', 'Actions'));
  a.append(narrowedActions() ? el('span', 'lf-n', sel.actions.size + '/' + ACTIONS.length) : el('span', 'lf-all', 'All'), CHEV());
  for (const [b, key] of [[p, 'players'], [a, 'actions']]) { b.setAttribute('aria-expanded', String(openMenu === key)); b.onclick = () => { openMenu = openMenu === key ? null : key; refreshLogFilter(); }; }
  fields.append(p, a);
}

function row(on, label, count, lead, toggle, only) {
  const r = el('div', 'lf-row' + (on ? ' on' : ''));
  const main = el('button', 'lf-main'); main.type = 'button'; main.setAttribute('role', 'menuitemcheckbox'); main.setAttribute('aria-checked', String(on));
  const bx = el('span', 'lf-bx'); if (on) bx.append(TICK());
  main.append(bx, lead, el('span', 'lf-name', label));
  main.onclick = toggle;
  const side = el('button', 'lf-only'); side.type = 'button'; side.title = 'Only ' + label; side.setAttribute('aria-label', 'Only ' + label);        // (the count; while the row is hovered it is the "only" button)
  side.append(el('b', '', String(count)), el('u', '', 'only'));
  side.onclick = only;
  r.append(main, side);
  return r;
}
function drawMenu(countP, countA) {
  menu.replaceChildren(); menu.hidden = !openMenu;
  if (openMenu === 'players') {
    ((S.replay && S.replay.players) || []).slice(0, 2).forEach((pl, i) => {
      const sq = el('i', 'lf-seat'); sq.style.background = seatColor(i);
      menu.append(row(sel.players.has(i), pl.name, countP[i], sq, () => { sel.players.has(i) ? sel.players.delete(i) : sel.players.add(i); changed(); }, () => { sel.players = new Set([i]); openMenu = null; changed(); }));
    });
  } else if (openMenu === 'actions') {
    for (const [key, name, icon] of ACTIONS) {
      const im = el('img', 'lf-ic'); im.alt = ''; im.src = iconUrl(S.iconNames && S.iconNames[icon] ? S.iconNames[icon] : icon);
      menu.append(row(sel.actions.has(key), name, countA[key], im, () => { sel.actions.has(key) ? sel.actions.delete(key) : sel.actions.add(key); changed(); }, () => { sel.actions = new Set([key]); openMenu = null; changed(); }));
    }
  }
}
const changed = () => { refreshLogFilter(); refreshLogSearch(); };
function reset() { sel.players = new Set([0, 1]); sel.actions = new Set(ACTIONS.map((a) => a[0])); changed(); }

export function setupLogFilter() {
  const box = $('logBox'), bar = box && box.querySelector('.logsearch'); fun = bar && bar.querySelector('.ls-fun');
  if (!box || !fun || panel) return;
  panel = el('div', 'logfilter'); panel.hidden = true;
  fields = el('div', 'lf-hd'); menu = el('div', 'lf-menu'); menu.setAttribute('role', 'menu'); menu.hidden = true;
  foot = el('div', 'lf-foot'); foot.append(el('span', ''), (() => { const b = el('button', 'lf-reset', 'Select all'); b.type = 'button'; b.onclick = reset; return b; })()); foot.hidden = true;
  panel.append(fields, menu, foot);
  bar.after(panel);
  fun.setAttribute('aria-expanded', 'false');
  fun.onclick = () => { panel.hidden = !panel.hidden; if (panel.hidden) openMenu = null; fun.setAttribute('aria-expanded', String(!panel.hidden)); refreshLogFilter(); };
  document.addEventListener('pointerdown', (e) => { if (openMenu && !panel.contains(e.target)) { openMenu = null; refreshLogFilter(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenu) { openMenu = null; refreshLogFilter(); } });
}
