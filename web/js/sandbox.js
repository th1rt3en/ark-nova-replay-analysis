// [module] Sandbox mode: lobby / setup tools (map choice, slots, project picking) on top of fork mode.
import { $, el, seatColor } from './util.js';
import { S } from './state.js';
import { curState } from './pov.js';
import { card, cardName, hidePreview, info, largeOf, showPreview } from './cards.js';
import { ACTION_ICON, ACTION_NAMES, ICON_IDS, iconUrl, pic } from './icons.js';
import { bonusTile } from './shared.js';
import { render } from './main.js';
import { commitSteps, renderForkMoves } from './fork.js';
import { buildMoveList } from './playback.js';


// ---- fork: the information line (seed), the legal moves of both seats, and adding the step that a move makes -----------------------------------------------------

// ---- sandbox ------------------------------------------------------------------------------------------------------------------------------
// The controller sets the game up (the empty base projects and conservation bonuses) and edits it at any time with the tools panel; every edit is a step (Undo / the
// arrows take it back). The server answers each move of the controller with the moves of the bot, which only passes.
const BONUS_POOL = [{ 'Partner-Zoo': 1 }, { Fac: 1 }, { Multiplier: 1 }, { xtoken: 3 }, { 'take-in-range-or-deck': 3 }, { 'size-3': 1 }, { 'bonus-ignore-conditions': 3 },
                    { 'bonus-increased-hand': 1 }, { 'bonus-icon': 1 }, { 'bonus-scoring-cards': 3 }, { 'bonus-sponsor-gray': 1 }, { 'bonus-sponsor': 1 }, { reputation: 2 },
                    { 'bonus-extra-shift': 1 }, { 'bonus-kiosk-pavilion': 3 }, { money: 10 }];
export const sbMeta = () => (S.replay.steps[S.step] && S.replay.steps[S.step].sandbox) || S.replay.sandbox;
export const sbReady = () => !Object.values(sbMeta().unset).some((a) => a.some(Boolean));

export async function sbEdit(op, args) {
  if (S.forkBusy) return;
  S.forkBusy = true;
  try {
    const res = await fetch('/api/sandbox/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ state: S.replay.steps[S.step].engine_state, meta: sbMeta(), op, args }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'the edit could not be made');
    commitSteps(body.steps);
  } catch (err) {
    S.forkBusy = false;
    renderForkMoves(err.message);
  }
}
export function sbButton(text, tip, onclick, cls) {
  const b = el('button', 'forkmove sbbtn' + (cls ? ' ' + cls : ''), text);
  b.type = 'button'; b.title = tip; b.onclick = onclick;
  return b;
}
// the two buttons of an empty bonus space of the conservation track / the reputation track
export function sbSlotButtons(th, i) {
  const d = el('div', 'sbslot');
  d.append(sbButton('\u{1F3B2}', 'Randomize this bonus', () => sbEdit('set_bonus', { threshold: th, slot: i, bonus: null }), 'sbmini'),
           sbButton('\u270E', 'Choose this bonus', async () => {
             const m = sbMeta();
             const others = Object.entries(m.initial).flatMap(([t, bs]) => bs.filter((b, j) => !(t === th && j === i) && !m.unset['b' + t][j]));      // the bonuses already set anywhere on the board
             const bonus = await sbPickBonus(others);
             if (bonus) sbEdit('set_bonus', { threshold: th, slot: i, bonus });
           }, 'sbmini'));
  return d;
}

// ---- pop-ups ----
function sbModal(title, build) {
  return new Promise((resolve) => {
    const back = el('div', 'modalback');
    const box = el('div', 'modalbox sbmodal');
    const done = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    const head = el('div', 'sbmodalhead');
    const x = el('button', 'sbclose', '\u00D7');
    x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = () => done(null);
    head.append(el('h3', '', title), x);
    box.append(head, build(done));
    back.append(box);
    back.addEventListener('click', (e) => { if (e.target === back) done(null); });
    document.addEventListener('keydown', onKey);
    document.body.append(back);
  });
}
function sbPickCard(title, groups) {            // groups: [[label, [card keys]], ...] -> the key chosen, or null
  return sbModal(title, (done) => {
    const wrap = el('div', 'sbpick');
    const filter = el('input', 'sbfilter');
    filter.type = 'search'; filter.placeholder = 'Filter by name'; filter.setAttribute('aria-label', 'Filter by name');
    const list = el('div', 'sblist');
    const fill = () => {
      const q = filter.value.trim().toLowerCase();
      list.replaceChildren();
      let shown = 0;
      for (const [label, keys] of groups) {
        const hits = keys.filter((k) => !q || cardName(k).toLowerCase().includes(q) || k.toLowerCase() === q).sort((a, b) => cardName(a).localeCompare(cardName(b)));
        if (!hits.length) continue;
        list.append(el('div', 'sbgroup', label + ' (' + hits.length + ')'));
        for (const k of hits.slice(0, 120 - Math.min(shown, 120))) {
          const b = el('button', 'sbrow', cardName(k));
          b.type = 'button';
          b.append(el('span', 'sbkey', k));
          b.onclick = () => done(k);
          b.onmouseenter = () => showPreview(largeOf(info(k)));
          b.onmouseleave = hidePreview;
          list.append(b);
          shown++;
        }
      }
      if (!shown) list.append(el('div', 'muted', 'No card matches.'));
    };
    filter.oninput = fill;
    fill();
    wrap.append(filter, list);
    setTimeout(() => filter.focus(), 0);
    return wrap;
  }).finally(hidePreview);
}
function sbPickBonus(taken) {
  return sbModal('Choose the bonus', (done) => {
    const grid = el('div', 'sbbonuses');
    for (const b of BONUS_POOL) {
      const [name] = Object.keys(b);
      const t = bonusTile(name, b[name]);
      const btn = el('button', 'sbtile');
      btn.type = 'button';
      btn.title = name.replace(/^bonus-/, '').replace(/-/g, ' ') + (b[name] > 1 ? ' (' + b[name] + ')' : '');
      btn.disabled = taken.some((o) => JSON.stringify(o) === JSON.stringify(b));
      if (t) { t.classList.remove('ctbonus'); btn.append(t); } else btn.textContent = btn.title;
      btn.onclick = () => done(b);
      grid.append(btn);
    }
    return grid;
  });
}
export function sbPickProjects(n, current) {
  return sbModal('Choose ' + n + ' base project' + (n === 1 ? '' : 's'), (done) => {
    const wrap = el('div', 'sbpick');
    const chosen = [];
    const grid = el('div', 'sbprojects');
    const ok = sbButton('Confirm', 'Set the projects', () => done(chosen.slice()), 'forkconfirm');
    ok.disabled = true;
    const refresh = () => { ok.disabled = chosen.length !== n; ok.textContent = 'Confirm (' + chosen.length + '/' + n + ')'; };
    for (const k of S.replay.base_pool || []) {
      const wrapc = el('div', 'sbproject' + (current.includes(k) ? ' taken' : ''));
      wrapc.append(card(k));
      wrapc.onclick = () => {
        if (current.includes(k)) return;
        const at = chosen.indexOf(k);
        if (at >= 0) chosen.splice(at, 1); else if (chosen.length < n) chosen.push(k);
        wrapc.classList.toggle('marked', chosen.includes(k));
        refresh();
      };
      wrapc.title = cardName(k);
      grid.append(wrapc);
    }
    refresh();
    wrap.append(grid, el('div', 'modalrow'));
    wrap.lastChild.append(ok);
    return wrap;
  });
}

export function renderSandboxTools(st) {
  const box = $('sbtools');
  if (!box) return;
  box.hidden = !!S.replay.setup;
  if (S.replay.setup) return;
  const meta = sbMeta();
  if (S.sbSeat === null) S.sbSeat = meta.controller;
  const seat = S.sbSeat, p = st.players[seat];
  const sum = el('summary', '', 'Sandbox tools');
  box.open = S.sbOpen;
  box.ontoggle = () => { S.sbOpen = box.open; };
  const body = el('div', 'sbbody');
  const sec = (title, ...nodes) => { const d = el('div', 'sbsec'); d.append(el('h4', '', title), ...nodes); body.append(d); return d; };

  const who = el('select', 'sbselect');
  who.setAttribute('aria-label', 'Seat to edit');
  st.players.forEach((q, i) => { const o = el('option', '', S.replay.players[i].name + (i === meta.controller ? ' (you play this seat)' : ' (passes)')); o.value = i; who.append(o); });
  who.value = seat;
  who.onchange = () => { S.sbSeat = +who.value; renderSandboxTools(curState()); };
  sec('Edit the seat of', who);

  const fields = el('div', 'sbfields');
  for (const [f, label, lo, hi] of [['money', 'Money', 0, 999], ['x_tokens', 'X tokens', 0, 5], ['conservation', 'Conservation', 0, 40], ['reputation', 'Reputation', 0, 15]]) {
    const l = el('label', 'sbfield', label + ' ');
    const inp = el('input');
    inp.type = 'number'; inp.min = lo; inp.max = hi; inp.value = p[f];
    inp.onchange = () => { const v = parseInt(inp.value, 10); if (Number.isFinite(v)) sbEdit('set_value', { seat, field: f, value: v }); };
    l.append(inp);
    fields.append(l);
  }
  sec('Resources (set directly: no bonus follows)', fields);

  const ul = el('ul', 'sblist-actions');
  let drag = null;
  for (const [n, a] of p.action_cards.entries()) {
    const li = el('li', 'sbaction' + (S.sbUnlocked ? ' unlocked' : ''));
    li.dataset.type = a.type;
    li.draggable = S.sbUnlocked;
    li.append(el('span', 'sbn', n + 1), pic(ACTION_ICON[a.type], 26), el('span', 'sbname', ACTION_NAMES[a.type] + (a.level === 2 ? ' II' : '')));
    const v = el('select', 'sbselect');
    v.title = S.replay.marine_worlds ? 'Variant of the action card' : 'The variants belong to Marine Worlds';
    v.disabled = !S.replay.marine_worlds;
    for (const k of [0, 1, 2, 3, 4]) { const o = el('option', '', k ? 'Variant ' + k : 'Standard'); o.value = k; v.append(o); }
    v.value = a.variant || 0;
    v.onchange = () => sbEdit('set_variant', { seat, type: a.type, variant: +v.value });
    li.append(v);
    li.addEventListener('dragstart', (e) => { drag = li; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.type); });
    li.addEventListener('dragover', (e) => {
      if (!drag || drag === li) return;
      e.preventDefault();
      const r = li.getBoundingClientRect();
      ul.insertBefore(drag, e.clientY > r.top + r.height / 2 ? li.nextSibling : li);
    });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); drag = null; });
    ul.append(li);
  }
  const lock = sbButton(S.sbUnlocked ? '\u{1F513} Unlocked: drag to reorder' : '\u{1F512} Locked', S.sbUnlocked ? 'Click to lock the new order' : 'Click to unlock and drag the action cards into another order', () => {
    if (S.sbUnlocked) {
      const order = [...ul.children].map((li) => li.dataset.type);
      S.sbUnlocked = false;
      if (order.join() !== p.action_cards.map((c) => c.type).join()) sbEdit('reorder', { seat, order });
      else renderSandboxTools(curState());
    } else { S.sbUnlocked = true; renderSandboxTools(curState()); }
  }, S.sbUnlocked ? 'on' : '');
  sec('Action cards (slot 1 first)', lock, ul);

  const deckKeys = st.main_deck.filter((k) => k !== '?'), discardKeys = (st.main_discard || []).filter((k) => k !== '?'), egKeys = st.endgame_deck.filter((k) => k !== '?');
  sec('Cards', sbButton('Add a card to the hand…', 'A card of the draw pile, the discard pile or the endgame deck goes to the hand', async () => {
    const k = await sbPickCard('Add a card to the hand of ' + S.replay.players[seat].name, [['Draw pile', deckKeys], ['Discard pile', discardKeys], ['Endgame deck', egKeys]]);
    if (k) sbEdit('add_hand', { seat, card: k });
  }));
  const disp = el('div', 'sbdisplay');
  st.display.forEach((k, i) => {
    const b = sbButton((i + 1) + ': ' + (k ? cardName(k) : '(empty)'), 'Change this display card: the card that leaves takes the place of the new one', async () => {
      const c = await sbPickCard('Display space ' + (i + 1), [['Draw pile', deckKeys], ['Discard pile', discardKeys], ['Display', st.display.filter((x, j) => x && j !== i)]]);
      if (c) sbEdit('set_display', { index: i, card: c });
    });
    disp.append(b);
  });
  sec('Display', disp);

  const tiles = el('div', 'sbtiles');
  const tile = (kind, name, id, tip) => {
    const b = el('button', 'sbtile');
    b.type = 'button'; b.title = tip;
    const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = tip; i.height = 40;
    b.append(i);
    b.onclick = () => sbEdit('add_tile', { seat, tile: kind, name });
    tiles.append(b);
  };
  for (const c of ['Africa', 'Europe', 'Asia', 'Americas', 'Australia']) tile('partner', c, ICON_IDS[c], 'Partner zoo: ' + c);
  for (const u of ['fac-rep-hand', 'fac-science-rep', 'fac-science-science']) tile('university', u, ICON_IDS[u], 'University: ' + u.replace('fac-', '').replace(/-/g, ' '));
  for (const c of ['bird', 'predator', 'herbivore', 'primate', 'reptile'].concat(S.replay.marine_worlds ? ['marine'] : [])) tile('university', c, ICON_IDS['fac-science-' + c], 'Species university: ' + c);
  sec('Partner zoos and universities (their bonuses follow)', tiles);

  const w = (where) => p.tokens.filter((t) => t.type === 'worker' && t.location.startsWith(where)).length;
  const wk = el('div', 'sbworkers');
  wk.append(sbButton('Unlock a worker (' + w('supply_') + ' locked)', 'Unlock the next locked worker', () => sbEdit('workers', { seat, what: 'unlock' })));
  for (const [where, label] of [['supply_', 'locked'], ['reserve', 'ready'], ['association_', 'placed']]) {
    const b = sbButton('Remove a ' + label + ' worker (' + w(where) + ')', 'Take a worker away for good', () => sbEdit('workers', { seat, what: 'remove', where }));
    b.disabled = !w(where);
    wk.append(b);
  }
  sec('Workers', wk);
  box.replaceChildren(sum, body);
}

// The setup before the game: the seat to play, then the map of each seat (a click on a map shows it on the player board; it can be changed before Confirm).
// `replay.setup` = {stage: 'seat' | 'map0' | 'map1', controller, maps: [id, id]}; the real game starts when the last map is confirmed.
const mapViews = {};
async function sbShowMap(seat, id) {
  if (!mapViews[id]) {
    const res = await fetch('/api/sandbox/map/' + encodeURIComponent(id));
    if (!res.ok) return;
    mapViews[id] = await res.json();
  }
  S.replay.setup.maps[seat] = id;
  S.replay.maps[seat] = mapViews[id];
  render();
}
export function sbSetupBar(bar) {
  const set = S.replay.setup;
  bar.hidden = false;
  bar.replaceChildren();
  if (!S.sbMapList) {
    S.sbMapList = [];
    fetch('/api/sandbox/maps?marine_worlds=' + (S.replay.marine_worlds ? 'true' : 'false')).then((r) => r.json()).then((b) => { S.sbMapList = b.maps; if (S.replay.setup) render(); });
  }
  if (set.stage === 'seat') {
    bar.append(el('b', '', 'Choose the seat you play'));
    for (const seat of [0, 1]) {
      const b = sbButton('Seat ' + (seat + 1) + (seat === 0 ? ' (plays first)' : ''), 'You play this seat; the other one is a bot that passes', () => { set.controller = seat; set.stage = 'map0'; render(); }, 'forkchoice');
      b.style.setProperty('--pc', seatColor(seat));
      bar.append(b);
    }
    return;
  }
  const seat = set.stage === 'map0' ? 0 : 1;
  const head = el('b', '', 'Choose the map of seat ' + (seat + 1) + (seat === set.controller ? ' (you)' : ' (the bot)'));
  const list = el('div', 'sbmaps');
  for (const m of S.sbMapList) {
    const b = el('button', 'forkmove sbmapbtn' + (set.maps[seat] === m.id ? ' on' : ''), 'Map ' + m.id + ': ' + m.name);
    b.type = 'button';
    b.onclick = () => sbShowMap(seat, m.id);
    list.append(b);
  }
  const ok = sbButton('Confirm', 'Use this map', async () => {
    if (seat === 0) { set.stage = 'map1'; set.maps[1] = null; render(); return; }
    ok.disabled = true;
    const res = await fetch('/api/sandbox/new', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ marine_worlds: S.replay.marine_worlds, maps: set.maps, controller: set.controller }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { ok.disabled = false; renderForkMoves(body.message || 'could not start'); return; }
    sessionStorage.setItem('sandboxGame', JSON.stringify(body));
    location.reload();
  }, 'forkconfirm');
  ok.disabled = !set.maps[seat];
  const back = sbButton('Back', 'Go back', () => { set.stage = seat === 0 ? 'seat' : 'map0'; render(); });
  const dice = sbButton('Random map', 'Pick a map at random: it is shown on the board and can still be changed before Confirm', () => {
    if (S.sbMapList.length) sbShowMap(seat, S.sbMapList[Math.floor(Math.random() * S.sbMapList.length)].id);
  });
  bar.append(head, list, dice, ok, back);
}

export function initSandbox() {
  document.title = 'Sandbox - Ark Nova';
  if (S.replay.setup) {
    Object.assign(S.replay.setup, { stage: 'seat', controller: 0, maps: [null, null] });
    S.replay.players.forEach((q, i) => { q.name = 'Seat ' + (i + 1); });
    S.replay.steps[0].label = 'Choose your seat and the maps';
    buildMoveList();
    const box0 = $('forkinfo');
    box0.hidden = false;
    box0.replaceChildren(el('b', '', 'Sandbox setup'), el('div', 'forknote', 'Choose the seat you play, then the map of each seat. The other seat is a bot that only passes.'));
    document.body.classList.add('forkpage');
    return;
  }
  S.replay.sandbox = S.replay.sandbox || S.replay.steps[0].sandbox;
  const box = $('forkinfo');
  box.hidden = false;
  box.replaceChildren();
  const fresh = el('a', '', 'New sandbox');
  fresh.href = '/sandbox.html';
  fresh.onclick = () => { sessionStorage.removeItem('sandboxGame'); };
  box.append(el('b', '', 'Sandbox'), document.createTextNode(' · '), fresh, el('div', 'forknote', 'The other seat is a bot that only passes. Set the empty base projects and conservation bonuses, then play; the tools below change the game at any time. Going back a step undoes an edit or a move.'));
  document.body.classList.add('forkpage');
}
