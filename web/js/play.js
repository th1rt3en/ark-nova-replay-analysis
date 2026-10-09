// [module] Live play (play.html): the game is kept by the server (the Table Durable Object); the page draws every pushed state with the code of the fork, turns a click into one of the
// legal actions and posts it. Also the clocks, the end of the game, abandoning by agreement, the turn alert and the game menu. State: `S.play` (state.js).
import { $, el } from './util.js';
import { S, params } from './state.js';
import { render } from './main.js';
import { buildMoveList, go } from './playback.js';
import { refreshBar } from './action-bar.js';
import { forkBar, renderForkMoves, warnIrreversible } from './fork.js';

const P = S.play;

// ---- live play ---------------------------------------------------------------------------------------------------------------------------
// The server keeps the game (the Table Durable Object) and pushes a view + the seat's legal actions after every move; the page draws them with the same code as the fork and
// turns a click into one of the legal actions, which it posts. A step is a pushed state; the latest one is the position. The game id and the seat token come from the url
// (`play.html?game=E12&s=<token>`; no token = a spectator).
// ---- the clocks (time control): the server sends the time left at one moment and who runs; the page counts down by itself ----------------------------------------
function setClock(c) {
  if (!c) return;
  P.clock = c;
  P.clockSkew = (c.now || Date.now()) - Date.now();
  tickClocks();
}
function clockLeft(seat) {                                                  // milliseconds left on a seat's clock now (may be below zero)
  if (!P.clock) return null;
  const spent = P.clock.running[seat] && P.status === 'playing' ? Math.max(0, Date.now() + P.clockSkew - P.clock.at) : 0;
  return P.clock.remaining[seat] - spent;
}
function clockText(seat) {
  const ms = clockLeft(seat);
  if (ms === null) return '';
  const s = Math.ceil(Math.abs(ms) / 1000);                              // (a clock below zero is shown with a minus sign)
  return (ms < 0 && s > 0 ? '-' : '') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
export function tickClocks() {
  for (const n of document.querySelectorAll('.clock[data-seat]')) {
    const seat = +n.dataset.seat, ms = clockLeft(seat);
    n.textContent = clockText(seat);
    n.classList.toggle('running', !!(P.clock && P.clock.running[seat] && P.status === 'playing'));
    n.classList.toggle('low', ms !== null && ms < 30000);
    n.classList.toggle('negative', ms !== null && ms < 0);
  }
  const claim = $('claimtime');                                              // the menu's button to win on overtime: enabled while the opponent's clock is not above zero
  if (claim) claim.disabled = !(P.seat !== null && P.clock && clockLeft(1 - P.seat) <= 0);
}
export function clockBadge(seat) {
  if (!P.clock) return null;
  const b = el('span', 'clock', clockText(seat));
  b.dataset.seat = String(seat);
  b.title = 'Time left (' + (P.clock.mode === 'custom' ? 'custom' : P.clock.speed) + ' time control: ' + Math.round(P.clock.start / 60000 * 10) / 10 + ' min, +' + Math.round(P.clock.increment / 1000) + ' s per turn)';
  return b;
}
async function refreshClock() {
  const r = await playApi('/setup' + (P.token ? '?s=' + encodeURIComponent(P.token) : '')).catch(() => null);
  if (r && r.ok && r.body.clock) setClock(r.body.clock);
}
export const firstPlayerText = () => (S.replay.players && S.replay.players[0] ? S.replay.players[0].name + ' plays first. ' : '');
const playHeaders = () => (P.token ? { 'X-Seat-Token': P.token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' });
async function playApi(path, body) {
  const res = await fetch('/api/games/' + P.id + path, body === undefined ? { headers: playHeaders() } : { method: 'POST', headers: playHeaders(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: data };
}
function playStep(p, index) {
  return { index, move_id: null, label: p.label || '', state: { ...p.view, main_deck_known: 0 }, engine: { source: 'engine', status: 'ok', detail: '' }, options: (p.decision && p.decision.options) || null,
           actor: null, label_pov: null, fork: false, actions: (p.decision && p.decision.actions) || [], version: p.version };
}
export async function playLoad() {
  P.id = params.get('game');
  if (!/^E\d+$/.test(P.id || '')) { location.replace('/play.html'); return null; }
  P.token = params.get('s');
  try { if (P.token) localStorage.setItem('playToken.' + P.id, P.token); else P.token = localStorage.getItem('playToken.' + P.id); } catch (e) { /* no storage */ }
  const setup = await playApi('/setup' + (P.token ? '?s=' + encodeURIComponent(P.token) : ''));
  if (!setup.ok && setup.status === 404) { location.replace('/end.html?game=' + encodeURIComponent(P.id)); return null; }       // the table is gone: it ended and was exported
  if (!setup.ok) throw new Error(setup.body.message || 'no such game');
  if (['finished', 'conceded', 'abandoned'].includes(setup.body.status)) { location.replace('/end.html?game=' + encodeURIComponent(P.id)); return null; }
  const state = await playApi('/state' + (P.token ? '?s=' + encodeURIComponent(P.token) : ''));
  if (!state.ok) throw new Error(state.body.message || 'the game could not be read');
  P.seat = setup.body.seat;
  P.version = state.body.version;
  P.status = state.body.status || setup.body.status;
  setAbandon(setup.body.abandon);
  setClock(setup.body.clock);
  return { ...setup.body, table_id: P.id, result: [], setup_steps: 0, steps: [playStep(state.body, 0)] };
}
export function pushLive(p) {
  if (p.version <= P.version) return;
  P.version = p.version;
  if (p.status) P.status = p.status;
  if (p.view && p.view.clock) setClock(p.view.clock);
  const wasLast = S.step === S.replay.steps.length - 1;
  const hadMove = S.replay.steps.some((st) => (st.actions || []).length > 0);
  for (const st of S.replay.steps) st.actions = [];                          // (only the latest position can be played)
  const next = playStep(p, S.replay.steps.length);
  S.replay.steps.push(next);
  buildMoveList();
  $('jump').max = S.replay.steps.length - 1;
  S.forkBusy = false;
  if ((!S.replay.maps || S.replay.maps.length < 2) && p.view.players[0].map_id) {            // the maps have just been chosen: the page gets them (and the cards)
    playApi('/setup' + (P.token ? '?s=' + encodeURIComponent(P.token) : '')).then((r) => {
      if (r.ok && r.body.maps.length) { Object.assign(S.replay, { maps: r.body.maps, map_names: r.body.map_names, map_images: r.body.map_images, map_views: r.body.map_views, cards: r.body.cards, base_projects: r.body.base_projects }); go(S.replay.steps.length - 1); }
    });
  }
  if (wasLast) go(S.replay.steps.length - 1); else renderForkMoves();
  if (p.view && p.view.end) showGameEnd(p.view.end);
  else playEndCheck();
  if (!hadMove && next.actions.length) turnAlert('It is your turn');                  // the turn has just passed to this player (not after the player's own move)
}
function playMessage(m) {
  if (m.type === 'abandon') setAbandon(m, true);
  else if (m.type === 'state') pushLive(m);
  else if (m.type === 'lobby') { (m.names || []).forEach((n, i) => { if (n) S.replay.players[i].name = n; }); if (m.status) P.status = m.status; playHeadline(); render(); if (P.status === 'playing') refreshClock(); }
  else if (m.type === 'status') { P.status = m.status; render(); playEndCheck(); if (P.status === 'playing') refreshClock(); }
}
export async function playConnect() {
  let base = '';
  try { base = (await (await fetch('/api/live/config')).json()).ws_base || ''; } catch (e) { /* no config: poll */ }
  const open = () => {
    const ws = new WebSocket(base + '/ws/' + P.id + (P.token ? '?s=' + encodeURIComponent(P.token) : ''));
    P.socket = ws;
    let ping = null;
    ws.onopen = () => { P.backoff = 1000; ping = setInterval(() => { try { ws.send('ping'); } catch (e) { /* closed */ } }, 25000); };
    ws.onmessage = (e) => { if (e.data === 'pong') return; try { playMessage(JSON.parse(e.data)); } catch (err) { /* not for us */ } };
    ws.onclose = () => { clearInterval(ping); if (P.status === 'playing' || P.status === 'waiting') setTimeout(open, P.backoff = Math.min(P.backoff * 2, 15000)); };
  };
  if (base) { open(); return; }
  P.poll = setInterval(async () => {                                      // (no socket server configured: ask every 2 seconds)
    const r = await playApi('/state' + (P.token ? '?s=' + encodeURIComponent(P.token) : '')).catch(() => null);
    if (r && r.ok) { if (r.body.version > P.version) pushLive(r.body); else if (r.body.status && r.body.status !== P.status) { const was = P.status; P.status = r.body.status; render(); if (was === 'waiting') refreshClock(); } }
    const lobby = await playApi('').catch(() => null);                      // (and the names of the seats, which a socket would push)
    if (lobby && lobby.ok) {
      let changed = false;
      (lobby.body.names || []).forEach((n, i) => { if (n && S.replay.players[i] && S.replay.players[i].name !== n) { S.replay.players[i].name = n; changed = true; } });
      if (changed) { playHeadline(); render(); }
    }
    if (r && r.ok && P.status === 'playing') {                            // (and the proposal to abandon, which a socket would push)
      const ab = await playApi('/abandon').catch(() => null);
      if (ab && ab.ok) { if (ab.body.status && ab.body.status !== P.status) { P.status = ab.body.status; render(); playEndCheck(); } else setAbandon(ab.body, true); }
    }
    else if (r && r.status === 404) { clearInterval(P.poll); P.status = 'closed'; render(); playEndCheck(); }
    if (['finished', 'conceded', 'abandoned', 'closed'].includes(P.status)) clearInterval(P.poll);        // (over: nothing more to ask)
  }, 2000);
}
// ---- the end of the game ------------------------------------------------------------------------------------------------------------
// The result and the statistics of the game slide in from the right in place of the player boards; a button switches between them and the final position.
function showGameEnd(end) {
  if (P.endShown || !window.EndStats) return;
  const names = [0, 1].map((i) => (S.replay.players[i] ? S.replay.players[i].name : 'Player ' + (i + 1)));
  const conceded = end.conceded === 0 || end.conceded === 1;
  const w = end.winner === 0 || end.winner === 1 ? end.winner : null;
  try {
    EndStats.render($('endstats'), { names, scores: end.scores || [], winner: end.winner, conceded: conceded ? end.conceded : null, status: end.abandoned ? 'abandoned' : conceded ? 'conceded' : 'finished', reason: end.reason, stats: end.stats });
  } catch (err) { console.error('end screen', err); return; }                // (not marked as shown: the next check draws it again)
  P.endShown = true;
  const bar = $('endbar');
  bar.replaceChildren();
  bar.append(el('b', '', end.abandoned ? 'Game abandoned: no winner.' : w === null ? 'Game over: a tie.' : 'Game over: ' + names[w] + ' wins ' + end.scores[w] + ' to ' + end.scores[1 - w] + '.'));
  const sw = el('button', 'turnbtn confirm');
  sw.type = 'button';
  const paint = () => { sw.textContent = document.body.classList.contains('showstats') ? 'Show the final board' : 'Show the game statistics'; };
  sw.onclick = () => { document.body.classList.toggle('showstats'); paint(); };
  bar.append(sw);
  const ab = $('abandonbox'); if (ab) ab.hidden = true;
  document.body.classList.add('gameover', 'showstats');
  paint();
  sw.addEventListener('click', () => { if (document.body.classList.contains('showstats')) $('endstats').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('endstats').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// the game has ended but its last position did not reach the page (the socket closed first, or there is none): ask for the result instead
export function playEndCheck() {
  if (['finished', 'conceded', 'abandoned', 'closed'].includes(P.status) && !P.endShown && !P.leaving) { P.leaving = true; setTimeout(endFromResult, 1500); }
}
async function endFromResult() {
  for (let i = 0; i < 15 && !P.endShown; i++) {
    const r = await fetch('/api/games/' + encodeURIComponent(P.id) + '/result').catch(() => null);
    if (r && r.ok) {
      const d = await r.json();
      if (d.status === 'abandoned') { showGameEnd({ abandoned: true, scores: [], winner: null }); if (P.endShown) return; }
      else if (d.stats && d.result) { showGameEnd({ scores: d.result.scores || [], winner: d.result.winner, conceded: d.result.conceded, reason: d.result.reason || (/overtime/.test(d.end_reason || '') ? 'overtime' : undefined), stats: d.stats.players }); if (P.endShown) return; }
    }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
}

// ---- abandoning by agreement ----------------------------------------------------------------------------------------------------------
// One player proposes, the other accepts (the game ends with no winner) or rejects (the proposer must wait before proposing again). The server keeps the proposal and
// the cooldowns and pushes every change; `#abandonbox` shows an open proposal wherever the page is.
function setAbandon(a, fromSocket) {
  if (!a) return;
  const was = P.abandon.proposal;
  P.abandon = { proposal: a.proposal || null, cooldown: a.cooldown || {}, skew: (a.now || Date.now()) - Date.now() };
  renderAbandon();
  clearTimeout(P.abandonTimer);
  const wait = P.seat === null ? 0 : abandonWait();
  if (wait > 0) P.abandonTimer = setTimeout(refreshGameMenu, wait * 1000 + 300);      // (the menu button is enabled again when the cooldown is over)
  if (fromSocket && P.abandon.proposal && (!was || was.at !== P.abandon.proposal.at) && P.abandon.proposal.by !== P.seat && P.seat !== null) turnAlert('Your opponent proposes to abandon the game');
  if (fromSocket && $('actionbar')) refreshBar();
}
const abandonWait = () => {                                              // seconds until this seat may propose again (0 = now)
  const until = +(P.abandon.cooldown[String(P.seat)] || 0);
  return Math.max(0, Math.ceil((until - (Date.now() + P.abandon.skew)) / 1000));
};
async function abandonCall(path, body) {
  const r = await playApi('/abandon' + path, body || {});
  if (r.ok && r.body.status === 'abandoned') { P.status = 'abandoned'; setAbandon({ proposal: null, cooldown: {} }); render(); playEndCheck(); }       // (answered yes, or both players proposed: the table is closed)
  else if (r.ok && r.body.proposal !== undefined) setAbandon(r.body);
  else if (!r.ok) renderForkMoves(r.body.message || 'that did not work');
  return r;
}
function abandonButton() {
  if (P.seat === null || P.status !== 'playing' || P.abandon.proposal) return null;
  const wait = abandonWait();
  const b = el('button', 'turnbtn restart', 'Propose to abandon');
  b.type = 'button';
  b.title = wait ? 'You can propose again in ' + Math.ceil(wait / 60) + ' minute(s)' : 'Ask the other player to end the game with no winner';
  b.disabled = wait > 0;
  b.onclick = async () => { if (confirm('Ask the other player to abandon the game? It ends with no winner if they agree.')) { await abandonCall(''); } };
  return b;
}
function renderAbandon() {
  const box = $('abandonbox');
  if (typeof refreshGameMenu === 'function') refreshGameMenu();
  if (!box) return;
  box.replaceChildren();
  const pr = P.abandon.proposal;
  box.hidden = !pr || P.status !== 'playing' || P.seat === null;
  if (box.hidden) return;
  const name = (seat) => (S.replay && S.replay.players && S.replay.players[seat] ? S.replay.players[seat].name : 'The other player');
  if (pr.by === P.seat) {
    const w = el('button', 'turnbtn restart', 'Withdraw');
    w.type = 'button'; w.onclick = () => abandonCall('/withdraw');
    box.append(el('b', '', 'You proposed to abandon the game. Waiting for ' + name(1 - P.seat) + '… '), w);
    return;
  }
  const yes = el('button', 'turnbtn confirm', 'Agree');
  yes.type = 'button'; yes.onclick = () => abandonCall('/answer', { agree: true });
  const no = el('button', 'turnbtn restart', 'Reject');
  no.type = 'button'; no.title = 'They cannot propose again for a while'; no.onclick = () => abandonCall('/answer', { agree: false });
  box.append(el('b', '', name(pr.by) + ' proposes to abandon the game (no winner). '), yes, no);
}

// ---- the turn alert ---------------------------------------------------------------------------------------------------------------------
// When the turn passes to the player: a short sound, the tab title flashes while the page is in the background and, when allowed, a browser notification.
let alertsOn = true, audioCtx = null, titleTimer = null;
try { alertsOn = localStorage.getItem('playAlerts') !== 'off'; } catch (e) { /* no storage */ }
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.16); g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.16 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.15);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.16);
    });
  } catch (e) { /* the browser does not allow sound yet */ }
}
function stopTitleFlash() {
  if (titleTimer) { clearInterval(titleTimer); titleTimer = null; document.title = 'Play ' + P.id + ' - Ark Nova'; }
}
function turnAlert(text) {
  if (!alertsOn || P.seat === null) return;
  beep();
  if (document.hidden || !document.hasFocus()) {
    if (!titleTimer) {
      let on = false;
      titleTimer = setInterval(() => { on = !on; document.title = on ? '\u{1F514} ' + text : 'Play ' + P.id + ' - Ark Nova'; }, 1000);
    }
    try { if (window.Notification && Notification.permission === 'granted') new Notification('Ark Nova', { body: text, tag: 'ark-nova-turn-' + P.id }); } catch (e) { /* not allowed */ }
  }
}
function alertToggle() {
  const b = el('button', 'alertbtn');
  b.type = 'button';
  const paint = () => { b.textContent = alertsOn ? '\u{1F514} Alerts on' : '\u{1F515} Alerts off'; b.title = 'A sound, a flashing tab title and a notification when it is your turn'; };
  b.onclick = () => {
    alertsOn = !alertsOn;
    try { localStorage.setItem('playAlerts', alertsOn ? 'on' : 'off'); } catch (e) { /* no storage */ }
    if (alertsOn) { beep(); try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* not available */ } }
    paint();
  };
  paint();
  return b;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) stopTitleFlash(); });
window.addEventListener('focus', stopTitleFlash);

export async function playLive(action) {
  if (S.forkBusy) return;
  S.forkBusy = true;
  renderForkMoves();
  const last = S.replay.steps[S.replay.steps.length - 1];
  try {
    const ask = await playApi('/preview', { version: last.version, action: { player: action.player, kind: action.kind, args: action.args } });
    if (!ask.ok) throw new Error(ask.status === 409 ? 'Another move got in first: look at the new position.' : ask.body.message || 'that move cannot be played');
    if (ask.body.irreversible) {
      S.forkBusy = false;
      const ok = await warnIrreversible(ask.body.reason);
      if (!ok) { refreshBar(); return; }
      S.forkBusy = true;
    }
    const done = await playApi('/actions', { version: last.version, action: { player: action.player, kind: action.kind, args: action.args }, request_id: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) });
    if (!done.ok) throw new Error(done.status === 409 ? 'Another move got in first: look at the new position.' : done.body.message || 'that move cannot be played');
    S.forkBusy = false;
    pushLive(done.body);
  } catch (err) {
    S.forkBusy = false;
    renderForkMoves(err.message);
  }
}
export function playWaitingBar(bar) {
  bar.hidden = false;
  bar.replaceChildren();
  const st = S.replay.steps[S.step].state, pr = st.prompt;
  const name = (seat) => (S.replay.players[seat] ? S.replay.players[seat].name : 'a player');
  const toAct = Array.isArray(st.to_act) ? st.to_act : [];            // the seats that have a move now (both when both discard at once)
  let text;
  if (['finished', 'conceded', 'abandoned', 'closed'].includes(P.status)) {
    text = 'The game is over.';                                       // (the result and the statistics replace the player boards: showGameEnd)
  }
  else if (['error'].includes(P.status)) text = 'The game is over (' + P.status + ').';
  else if (P.status === 'waiting') text = 'Waiting for the other player to join…';
  else if (P.seat === null) text = 'Watching: ' + (toAct.length ? toAct.map(name).join(' and ') : pr ? name(pr.player) : '…') + ' to play';
  else text = 'Waiting for ' + (toAct.length ? toAct.filter((s) => s !== P.seat).map(name).join(' and ') : pr && pr.player !== P.seat ? name(pr.player) : 'the other player') + '…';
  bar.append(el('b', '', text));
  if (['finished', 'conceded'].includes(P.status)) {
    const a = el('a', '', 'Open the replay');
    a.href = '/replay.html?table=' + encodeURIComponent(P.id);
    a.title = 'The record is ready a moment after the end of the game';
    bar.append(a);
  }
}
// The game menu, in the row of the round counter: concede, propose to abandon (and the settings that follow later).
export function gameMenu() {
  if (P.seat === null || !['playing', 'waiting'].includes(P.status)) return null;
  const wrap = el('div', 'gamemenu'); wrap.id = 'gamemenu';
  const toggle = el('button', 'gamemenubtn', 'Game ▾');
  toggle.type = 'button'; toggle.title = 'Concede, propose to abandon…'; toggle.setAttribute('aria-haspopup', 'true'); toggle.setAttribute('aria-expanded', String(P.menuOpen));
  const list = el('div', 'gamemenulist'); list.hidden = !P.menuOpen;
  toggle.onclick = (e) => { e.stopPropagation(); P.menuOpen = !P.menuOpen; list.hidden = !P.menuOpen; toggle.setAttribute('aria-expanded', String(P.menuOpen)); };
  const concede = el('button', 'gamemenuitem', 'Concede');
  concede.type = 'button'; concede.title = 'Give up the game';
  concede.onclick = async () => {
    P.menuOpen = false; list.hidden = true;
    if (!confirm('Concede the game?')) return;
    const r = await playApi('/concede', {});
    if (r.ok) { if (r.body.view) pushLive(r.body); P.status = 'conceded'; render(); playEndCheck(); } else renderForkMoves(r.body.message || 'could not concede');
  };
  list.append(concede);
  if (P.clock && P.status === 'playing') {                               // time control: win on overtime
    const ot = el('button', 'gamemenuitem', 'End the game: opponent out of time');
    ot.type = 'button'; ot.id = 'claimtime'; ot.disabled = !(clockLeft(1 - P.seat) <= 0);
    ot.title = "Available while your opponent's clock is at zero or below: you win on overtime";
    ot.onclick = async () => {
      P.menuOpen = false; list.hidden = true;
      if (!confirm("End the game now? You win on overtime because your opponent's clock has run out.")) return;
      const r = await playApi('/timeout', {});
      if (r.ok) { if (r.body.view) pushLive(r.body); P.status = 'conceded'; render(); playEndCheck(); } else renderForkMoves(r.body.message || 'could not end the game');
    };
    list.append(ot);
  }
  const ab = abandonButton();
  if (ab) { ab.className = 'gamemenuitem'; const click = ab.onclick; ab.onclick = () => { P.menuOpen = false; list.hidden = true; return click(); }; list.append(ab); }
  wrap.append(toggle, list);
  return wrap;
}
document.addEventListener('click', (e) => { if (P.menuOpen && !e.target.closest('#gamemenu')) { P.menuOpen = false; const l = document.querySelector('#gamemenu .gamemenulist'); if (l) l.hidden = true; } });
export function refreshGameMenu() { const old = $('gamemenu'); const fresh = gameMenu(); if (old && fresh) old.replaceWith(fresh); else if (old) old.remove(); }
// confirm the turn / take it back: legal actions of the engine, drawn like the buttons of the replay's confirm bar
export function playTurnButtons(bar, acts) {
  const find = (k) => acts.find((a) => a.kind === k);
  if (!find('confirm_turn') && !find('undo_last') && !find('restart_turn')) return;
  for (const [cls, label, kind, tip] of [['confirm', 'Confirm', 'confirm_turn', 'Confirm the turn and pass to the next player'], ['undo', 'Undo last step', 'undo_last', 'Take back the last step'],
                                         ['restart', 'Restart turn', 'restart_turn', 'Take back the steps of the turn (not past a step that cannot be taken back)']]) {
    const a = find(kind);
    if (!a && cls === 'confirm') continue;
    const b = el('button', 'turnbtn ' + cls, label);
    b.type = 'button'; b.title = tip; b.disabled = !a || S.forkBusy;
    if (a) b.onclick = () => playFork(a);
    bar.append(b);
  }
}

export function playHeadline() {                                             // who is who and who plays first (known as soon as the game has started)
  const t = $('forkinfo'); if (!t) return;
  const me = P.seat === null ? 'spectating' : 'you are ' + S.replay.players[P.seat].name;
  const started = P.status !== 'waiting';
  t.hidden = false;
  t.dataset.live = '1';
  const text = 'Live game ' + P.id + ' · ' + me + (S.replay.marine_worlds ? ' · Marine Worlds' : '') + (started && S.replay.players[0] ? ' · First player: ' + S.replay.players[0].name + (P.seat === 0 ? ' (you)' : '') : '');
  let line = t.querySelector('.playline');
  if (!line) { line = el('span', 'playline'); t.prepend(line); }
  line.textContent = text;
}
export function initPlay() {
  document.title = 'Play ' + P.id + ' - Ark Nova';
  const box = $('forkinfo');
  box.hidden = false;
  box.replaceChildren();
  playHeadline();
  if (P.seat !== null) { S.dockSel = { seat: P.seat, kind: 'hand' }; S.dockHidden = false; }
  document.body.classList.add('forkpage', 'playpage');
  if (P.seat !== null) box.append(alertToggle());
  renderAbandon();
  playConnect();
  setInterval(tickClocks, 500);
}
