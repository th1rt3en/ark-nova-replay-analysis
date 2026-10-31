// [module] A lobby of a custom game (web/lobby.html): the two seats and the chat. Whoever opens the link to a lobby only looks at it: a player takes an empty seat by clicking it ("Take this
// seat"). The host can remove the other player, click the empty seat to invite an online player into it (the seat then shows the invited player behind a white filter until they
// accept; if they decline it looks empty again) and start the game once both seats are taken. When the host has started it every member goes to the table (play.html) by itself,
// the others get a link to watch it. The page polls the lobby.
import { mountChat } from './chat.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const id = new URLSearchParams(location.search).get('id') || '';
const POLL_MS = 2000;                                     // (a member sees a change of the other seat within about two seconds; every request is a call of the Lobbies Durable Object)
let timer = 0, view = null, invitingSeat = null, searchBox = null, gone = false, chatMounted = false, starting = false;

async function call(path, body) {
  const res = await fetch('/api/lobbies' + path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Something went wrong.'), { status: res.status, code: data.status });
  return data;
}

function say(text) { $('msg').textContent = text || ''; }
function over(text) {                                                  // the lobby is gone (closed, or this player was removed), or there is nothing to show
  gone = true; clearTimeout(timer);
  $('title').textContent = 'Lobby closed'; $('sub').textContent = text;
  $('seats').replaceChildren(); $('actions').replaceChildren(el('a', { href: '/lobbies.html' }, 'Back to the lobbies'));
  $('chatbox').hidden = true;
}

async function act(path, body) {
  say('');
  try { view = await call(path, body); draw(); } catch (e) { say(e.message); if (e.status === 404) refresh(); }
}

function seatCard(s) {
  const role = s.host ? 'Host' : 'Seat ' + (s.index + 1);
  const host = view.is_host;
  if (s.account_id) {                                                   // a player is seated
    const kids = [el('span', { className: 'role' }, role), el('span', { className: 'name' }, el('span', { className: 'dot' + (s.online ? ' on' : ''), title: s.online ? 'Online' : 'Away' }), s.username + (s.account_id === view.you ? ' (you)' : ''))];
    if (host && !s.host) {
      const rm = el('button', { type: 'button', className: 'danger' }, 'Remove from lobby');
      rm.onclick = () => act('/' + id + '/kick', { account_id: s.account_id });
      kids.push(el('div', { className: 'row' }, rm));
    }
    return el('div', { className: 'seat' }, ...kids);
  }
  if (s.pending) {                                                      // invited: the seat looks taken, behind a white filter until the player accepts
    const kids = [el('span', { className: 'role' }, role), el('span', { className: 'name' }, s.username), el('span', { className: 'note' }, 'Invited: waiting for the answer…')];
    const inv = host && (view.invites || []).find((i) => i.seat === s.index && i.status === 'pending');
    if (inv) {
      const cancel = el('button', { type: 'button' }, 'Cancel invitation');
      cancel.onclick = () => act('/' + id + '/invites/' + inv.id + '/cancel', {});
      kids.push(el('div', { className: 'row' }, cancel));
    }
    return el('div', { className: 'seat pending' }, ...kids);
  }
  const seat = el('div', { className: 'seat empty' }, el('span', { className: 'role' }, role), el('span', { className: 'name' }, 'Empty'));
  if (view.status !== 'open') return seat;
  if (host) {                                                           // the host offers the seat to an online player
    if (invitingSeat !== s.index) {
      const open = el('button', { type: 'button', className: 'go' }, 'Invite a player');
      open.onclick = () => { invitingSeat = s.index; draw(); if (searchBox) searchBox.focus(); };
      seat.append(el('span', { className: 'note' }, 'Waiting for a player to take this seat, or invite someone who is online.'), el('div', { className: 'row' }, open));
    } else seat.append(...inviteForm(s.index));
    const declined = (view.invites || []).filter((i) => i.status === 'declined' && i.seat === s.index);
    if (declined.length) seat.append(el('span', { className: 'declined' }, declined.map((d) => d.username + ' declined the invitation.').join(' ')));
  } else if (!view.is_member) {                                         // a visitor takes the seat by clicking it
    const take = el('button', { type: 'button', className: 'go' }, 'Take this seat');
    take.onclick = () => { if (!window.arkAccount) { say('Log in to join a lobby.'); const b = document.querySelector('#acctbar button'); if (b) b.click(); return; } act('/' + id + '/join', { seat: s.index }); };
    seat.append(el('span', { className: 'note' }, window.arkAccount ? 'Click to join the game in this seat.' : 'Log in to join the game in this seat.'), el('div', { className: 'row' }, take));
  } else seat.append(el('span', { className: 'note' }, 'Waiting for a player to join.'));
  return seat;
}

function inviteForm(index) {
  const input = el('input', { type: 'text', placeholder: 'Type a username', autocomplete: 'off', 'aria-label': 'Username to invite' });
  const list = el('div', { className: 'suggest', hidden: true });
  const send = async (name) => { invitingSeat = null; await act('/' + id + '/invite', { username: name, seat: index }); };
  let seq = 0;
  input.oninput = async () => {
    const mine = ++seq;
    try {
      const d = await call('/online?q=' + encodeURIComponent(input.value));
      if (mine !== seq) return;
      list.replaceChildren(...d.names.map((n) => { const b = el('button', { type: 'button' }, n); b.onclick = () => send(n); return b; }));
      list.hidden = !d.names.length;
      if (!d.names.length && input.value.trim()) { list.replaceChildren(el('span', { className: 'note' }, 'Nobody online with that name.')); list.hidden = false; }
    } catch (e) { /* ignore */ }
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (input.value.trim()) send(input.value.trim()); } if (e.key === 'Escape') { invitingSeat = null; draw(); } };
  const cancel = el('button', { type: 'button' }, 'Cancel');
  cancel.onclick = () => { invitingSeat = null; draw(); };
  searchBox = input;
  setTimeout(() => input.oninput(), 0);
  return [input, list, el('div', { className: 'row' }, cancel)];
}

function draw() {
  if (!view || gone) return;
  if (view.status === 'started' && view.game && view.is_member) { location.href = '/play.html?game=' + encodeURIComponent(view.game.game_id); return; }      // (the seat belongs to the account: no key in the link)
  $('title').textContent = `${view.host}'s lobby`;
  $('sub').replaceChildren(el('span', { className: 'tag' }, view.mode_label), el('span', { className: 'tag' }, view.marine_worlds ? 'Marine Worlds' : 'Base'), el('span', { className: 'tag' }, view.rated ? 'Rated' : 'Friendly'), ` ${view.players}/${view.seats} players`,
    !view.is_member && view.status === 'open' ? el('span', { className: 'note' }, ' · You are looking at this lobby: click an empty seat to join.') : '');
  $('seats').replaceChildren(...view.seats_detail.map(seatCard));
  const actions = [];
  if (view.is_host) {
    const busy = starting || view.status === 'starting';
    const start = el('button', { type: 'button', className: 'go' + (busy ? ' busy' : ''), disabled: busy || !view.can_start }, busy ? el('span', { className: 'spinner', 'aria-hidden': 'true' }) : '', busy ? 'Starting the game…' : 'Start game');
    start.onclick = async () => { starting = true; draw(); await act('/' + id + '/start', {}); if (!(view.status === 'started' && view.game)) { starting = false; draw(); } };
    actions.push(start, el('span', { className: 'note' }, busy ? 'Setting up the table: you will be taken to it in a moment.' : view.can_start ? 'Both seats are taken: start when you are ready.' : 'The game can start when both seats are taken.'));
  } else if (view.is_member) actions.push(el('span', { className: 'note' }, view.status === 'starting' ? 'The host started the game: setting up the table…' : 'Waiting for the host to start the game…'));
  if (view.is_member) {
    const leave = el('button', { type: 'button' }, view.is_host ? 'Close lobby' : 'Leave lobby');
    leave.onclick = async () => { await call('/leave', {}).catch(() => {}); location.href = '/lobbies.html'; };
    actions.push(leave);
  } else {
    if (view.status === 'started' && view.game) actions.push(el('a', { href: '/play.html?game=' + encodeURIComponent(view.game.game_id) }, 'This game has started: watch it'));
    actions.push(el('a', { href: '/lobbies.html' }, 'Back to the lobbies'));
  }
  $('actions').replaceChildren(...actions);
  if (!chatMounted) { chatMounted = true; $('chatbox').hidden = false; mountChat($('chat'), { kind: 'lobbies', id }); }
}

async function refresh() {
  clearTimeout(timer);
  if (gone) return;
  try {
    const keep = searchBox && document.activeElement === searchBox;
    const v = await call('/' + id);
    const sig = (x) => JSON.stringify([x.status, x.players, x.is_member, x.seats_detail.map((s) => [s.account_id, s.username, s.pending]), x.invites, x.can_start]);
    if (!keep || !view || sig(v) !== sig(view)) { view = v; draw(); } else view = v;
  } catch (e) {
    if (e.status === 404) { over('This lobby is closed.'); return; }
  }
  if (!document.hidden) timer = setTimeout(refresh, POLL_MS);                      // (a tab in the background does not ask: it asks at once when it is looked at again)
}

if (!/^L\d+$/.test(id)) over('There is no such lobby.');
else {
  refresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.addEventListener('lobby-notice', () => refresh());                        // (a message, e.g. "you were removed", arrives: look at the lobby at once)
  document.addEventListener('account-changed', () => { chatMounted = false; refresh(); });
}
