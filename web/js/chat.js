// [module] The chat of a lobby or a table: a list of messages and a line to write one (docs: src/ark_nova/live/chat.py). `mountChat(root, { kind: 'tables' | 'lobbies', id, token })` polls
// `GET /api/chat/<kind>/<id>?since=<seq>` every few seconds and sends with `POST`. A player of a table writes with the seat token; a spectator must be logged in (the server says so,
// the page then offers the log-in button of the account widget); the messages of spectators are marked. Texts are shown as plain text, never as HTML.
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const POLL_MS = 3000;
const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function mountChat(root, { kind, id, token = null, onUnread = () => {} }) {
  const list = el('div', { className: 'chatlist', role: 'log', 'aria-live': 'polite' });
  const note = el('p', { className: 'chatnote', hidden: true });
  const input = el('input', { type: 'text', className: 'chatinput', maxLength: 500, placeholder: 'Write a message…', autocomplete: 'off', 'aria-label': 'Chat message' });
  const send = el('button', { type: 'submit', className: 'chatsend' }, 'Send');
  const form = el('form', { className: 'chatform' }, input, send);
  root.replaceChildren(list, note, form);
  let last = 0, timer = 0, gone = false, unread = 0, first = true;
  const url = `/api/chat/${kind}/${encodeURIComponent(id)}`;
  const headers = () => (token ? { 'X-Seat-Token': token } : {});
  const visible = () => root.offsetParent !== null && !document.hidden;

  function say(text, login = false) {
    note.hidden = !text; note.replaceChildren(text || '');
    if (login) { const b = el('button', { type: 'button', className: 'linkbtn' }, 'Log in'); b.onclick = () => { const a = document.querySelector('#acctbar button'); if (a) a.click(); }; note.append(' ', b); }
  }
  function add(m) {
    const row = el('div', { className: 'chatmsg ' + m.kind + (m.seat !== null ? ' seat' + m.seat : '') });
    row.append(el('span', { className: 'chattime' }, hhmm(m.at)), ' ', el('b', { className: 'chatname' }, m.name), m.kind === 'spectator' ? el('i', { className: 'chattag' }, ' (spectator)') : '', ': ', el('span', { className: 'chattext' }, m.text));
    list.append(row);
  }
  async function poll() {
    clearTimeout(timer);
    if (gone) return;
    try {
      const res = await fetch(`${url}?since=${last}`, { headers: headers(), cache: 'no-store' });
      if (res.status === 404 || res.status === 403 || res.status === 401) { gone = res.status === 404; if (res.status !== 404) say('Log in to read this chat.', true); }
      else if (res.ok) {
        const d = await res.json();
        const stick = list.scrollTop + list.clientHeight >= list.scrollHeight - 30;
        for (const m of d.messages) { add(m); if (!first && !visible()) unread++; }
        if (d.messages.length) { last = d.messages[d.messages.length - 1].seq; if (stick || first) list.scrollTop = list.scrollHeight; }
        first = false;
        if (unread && visible()) unread = 0;
        onUnread(unread);
        if (!note.dataset.keep) say('');
      }
    } catch (e) { /* offline: try again */ }
    if (!gone && !document.hidden) timer = setTimeout(poll, POLL_MS);              // (a tab in the background does not ask: the visibilitychange below asks at once)
  }
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    send.disabled = true; say('');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ text }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { input.value = ''; poll(); }
      else say(d.message || 'The message could not be sent.', res.status === 401);
    } catch (err) { say('The message could not be sent.'); }
    send.disabled = false; input.focus();
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  document.addEventListener('account-changed', () => { say(''); poll(); });
  poll();
  return { refresh: poll, seen: () => { unread = 0; onUnread(0); }, stop: () => { gone = true; clearTimeout(timer); } };
}
