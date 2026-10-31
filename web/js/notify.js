// [module] Notifications of the custom games, on every page of the site for a logged-in player: it asks GET /api/lobbies/inbox every few seconds (which also tells the server that the
// player is online, so others can invite them) and shows, at the bottom right, the invitations to a lobby (Accept / Decline) and the messages (an invitation was declined, you were
// removed from a lobby, a lobby was closed). Nothing happens without an account or when the lobbies are switched off (404).
import { onPush, pushReady } from './push.js';
const POLL_MS = 10000, SAFETY_MS = 120000;                                                 // (every request is a call of the Lobbies Durable Object: a few thousand an hour from an open tab was too many)
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };

const css = el('style', {}, `
#arknotify { position: fixed; right: 16px; bottom: 16px; z-index: 2000; display: flex; flex-direction: column; gap: 10px; width: min(340px, calc(100vw - 32px)); pointer-events: none; font: 14px/1.35 system-ui, sans-serif; }
#arknotify .toast { pointer-events: auto; background: #fffaf0; color: #2b1d12; border: 2px solid #2e7d32; border-radius: 10px; padding: 10px 12px; box-shadow: 0 6px 20px rgba(0,0,0,.3); animation: toastin .25s ease-out; }
#arknotify .toast.invite { border-color: #e9662a; }
#arknotify .toast.bad { border-color: #b3261e; }
#arknotify .toast b { display: block; margin-bottom: 2px; }
#arknotify .toast .row { display: flex; gap: 8px; margin-top: 8px; }
#arknotify .toast button { font: inherit; cursor: pointer; border-radius: 6px; border: 1px solid #2b1d12; padding: 4px 12px; background: #fff; color: #2b1d12; }
#arknotify .toast button.go { background: #2e7d32; color: #fff; border-color: #2e7d32; }
#arknotify .toast button:disabled { opacity: .5; cursor: default; }
#arknotify .toast .x { float: right; border: 0; background: none; padding: 0 2px; font-size: 18px; line-height: 1; }
#arknotify .toast .err { color: #b3261e; margin-top: 6px; }
@keyframes toastin { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }
`);
const box = el('div', { id: 'arknotify', 'aria-live': 'polite' });
let timer = 0, running = false;
const invites = new Map();                                      // invitation id -> its toast

function attach() { if (!box.isConnected) { document.head.append(css); document.body.append(box); } }

function say(text, bad = false) {
  attach();
  const t = el('div', { className: 'toast' + (bad ? ' bad' : '') }, el('button', { className: 'x', type: 'button', title: 'Close', onclick: () => t.remove() }, '×'), text);
  box.append(t);
  setTimeout(() => t.remove(), 14000);
}

function describe(inv) { return `${inv.mode_label}${inv.marine_worlds ? ', Marine Worlds' : ''}${inv.rated ? ', rated' : ', friendly'}`; }

function inviteToast(inv) {
  attach();
  const err = el('div', { className: 'err', hidden: true });
  const answer = async (accept, btns) => {
    btns.forEach((b) => { b.disabled = true; });
    try {
      const res = await fetch('/api/lobbies/invites/' + encodeURIComponent(inv.id) + '/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Something went wrong.');
      if (accept) { location.href = '/lobby.html?id=' + encodeURIComponent(body.lobby); return; }
      t.remove(); invites.delete(inv.id);
    } catch (e) {
      err.textContent = e.message; err.hidden = false;
      setTimeout(() => { t.remove(); invites.delete(inv.id); }, 5000);
    }
  };
  const yes = el('button', { type: 'button', className: 'go' }, 'Accept'), no = el('button', { type: 'button' }, 'Decline');
  yes.onclick = () => answer(true, [yes, no]); no.onclick = () => answer(false, [yes, no]);
  const t = el('div', { className: 'toast invite', role: 'alert' }, el('b', {}, `${inv.host} invites you to a game`), describe(inv), el('div', { className: 'row' }, yes, no), err);
  box.append(t);
  invites.set(inv.id, t);
}

async function poll() {
  clearTimeout(timer);
  try {
    const res = await fetch('/api/lobbies/inbox', { cache: 'no-store' });
    if (res.status === 404) { stop(); return; }                  // (the lobbies are not on this site)
    if (res.status === 401) { stop(); return; }                  // (logged out)
    const body = await res.json();
    const now = new Set(body.invites.map((i) => i.id));
    for (const i of body.invites) if (!invites.has(i.id) && !(location.pathname.endsWith('/lobby.html') && new URLSearchParams(location.search).get('id') === i.lobby)) inviteToast(i);
    for (const [id, t] of invites) if (!now.has(id)) { t.remove(); invites.delete(id); }           // (answered elsewhere, withdrawn or expired)
    for (const n of body.notices) {
      say(n.message, n.type !== 'declined' ? true : false);
      document.dispatchEvent(new CustomEvent('lobby-notice', { detail: n }));
    }
  } catch (e) { /* offline: try again */ }
  if (running && !document.hidden) timer = setTimeout(poll, pushReady() ? SAFETY_MS : POLL_MS);       // (with the push socket: the hub says when there is something; a tab in the background does not ask on its own)
}
let offInbox = null;                                              // (the socket is opened only for a logged-in player: a visitor of another page has none)

function start() { if (running) return; running = true; if (!offInbox) offInbox = onPush('inbox', () => { if (running) poll(); }); poll(); }
function stop() { running = false; clearTimeout(timer); if (offInbox) { offInbox(); offInbox = null; } for (const t of invites.values()) t.remove(); invites.clear(); }

document.addEventListener('account-changed', (e) => { if (e.detail) start(); else stop(); });
document.addEventListener('visibilitychange', () => { if (running && !document.hidden) { clearTimeout(timer); poll(); } });
fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.account) start(); }).catch(() => {});
