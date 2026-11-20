// [module] The page's push socket to the lobbies hub (the Worker's `/lobbies-ws`, src/lobbies.ts): one socket per page, shared by the notifications, the lobby list, a lobby and the chat.
// The server only says *that* something changed ({type: "changed", topic}); the page then asks for the view as before. `onPush(topic, fn)` listens (`list`, `lobby:L3`, `chat:E7`;
// `inbox` is the logged-in account's own); `pushReady()` tells whether the socket is open, so a page can ask rarely (a safety net) instead of every few seconds. Without a socket
// (the dev server, a failed connection) `pushReady()` is false and the pages poll as they did before. While the socket is open the player is online.
const subs = new Map();                                            // topic -> Set of functions
let ws = null, ready = false, wanted = false, retry = 1000, timer = 0, ping = 0, unavailable = false;
let connectedAs;                                                   // the account (id or null) the socket was opened for; undefined = not opened yet

export const pushReady = () => ready;

function topics() { return [...subs.keys()].filter((t) => subs.get(t).size); }
function sendSubs() { if (ready) { try { ws.send(JSON.stringify({ sub: topics() })); } catch (e) { /* closing */ } } }
function fire(topic) { for (const fn of subs.get(topic) || []) { try { fn(); } catch (e) { /* a listener must not stop the others */ } } }

// One socket at a time: `connecting` is the open in progress (a second subscriber that comes while the config is fetched waits for it instead of opening another
// socket), `generation` grows whenever the socket in use is given up (a new account, a close), so a fetch or a socket of an older generation changes nothing.
let connecting = null, generation = 0, announced;                  // announced: the account the widget announced last (undefined: none yet)

function connect() {
  clearTimeout(timer);
  if (ws || connecting || unavailable || !wanted) return connecting;
  const gen = generation;
  connecting = open(gen).finally(() => { if (gen === generation) connecting = null; });
  return connecting;
}

async function open(gen) {
  const asked = announced;
  let cfg = null;
  try { cfg = await fetch('/api/lobbies/socket', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); } catch (e) { /* offline */ }
  if (gen !== generation) return;                                  // (given up meanwhile: the new generation opens its own socket)
  if (announced !== asked) { timer = setTimeout(connect, 0); return; }        // (the account changed while the ticket was fetched: fetch it again, once per change)
  if (!cfg || !cfg.url) { if (cfg) unavailable = true; else timer = setTimeout(connect, retry = Math.min(retry * 2, 30000)); return; }       // (no push on this server: the pages poll)
  connectedAs = cfg.account || null;
  let mine;
  try { mine = new WebSocket(cfg.url + (cfg.ticket ? '?ticket=' + encodeURIComponent(cfg.ticket) : '')); } catch (e) { timer = setTimeout(connect, retry = Math.min(retry * 2, 30000)); return; }
  ws = mine;
  mine.onopen = () => {
    if (ws !== mine) { try { mine.close(); } catch (e) { /* closed */ } return; }        // (a socket given up before it opened: it must not take over the shared state)
    ready = true; retry = 1000;
    sendSubs();
    clearInterval(ping);
    ping = setInterval(() => { try { mine.send('ping'); } catch (e) { /* closing */ } }, 25000);       // (answered by the hub without waking it)
    for (const t of subs.keys()) fire(t);                          // (what happened while the socket was down)
  };
  mine.onmessage = (e) => { if (ws !== mine) return; try { const m = JSON.parse(e.data); if (m && m.type === 'changed') fire(m.topic); } catch (err) { /* pong */ } };
  mine.onclose = () => {
    if (ws !== mine) return;
    ws = null; ready = false; clearInterval(ping);
    if (wanted) timer = setTimeout(connect, retry = Math.min(retry * 2, 30000));
  };
}

/** Listen to a topic; returns the function that stops listening. */
export function onPush(topic, fn) {
  if (!subs.has(topic)) subs.set(topic, new Set());
  subs.get(topic).add(fn);
  wanted = true;
  if (ready) sendSubs(); else connect();
  // Stopping a listener does not close the socket: it lives as long as the page (an open socket is what makes the player "online" for the lobbies, and
  // notify.js keeps listening to `inbox` on every page). A topic nobody listens to any more is dropped and the hub is told.
  return () => { const set = subs.get(topic); if (!set) return; set.delete(fn); if (!set.size) subs.delete(topic); sendSubs(); };
}

/** The account changed (log in / out): the socket is opened again with the right ticket. (The widget announces the account several times while the page loads: only a different account counts.) */
document.addEventListener('account-changed', (e) => {
  const id = (e.detail && e.detail.id) || null;
  announced = id;
  if (connecting) return;                                          // (the open in progress sees the change when its ticket comes back)
  if (!ws) { if (connectedAs !== undefined && id !== connectedAs) { retry = 1000; connect(); } return; }
  if (id === connectedAs) return;
  generation++;
  const old = ws; ws = null; ready = false; clearInterval(ping);
  try { old.close(); } catch (err) { /* closed */ }
  connect();
});
