// [module] Notifications of the custom games, on every page of the site for a logged-in player: it asks GET /api/lobbies/inbox every few seconds (which also tells the server that the
// player is online, so others can invite them) and shows, at the bottom right, the invitations to a lobby (Accept / Decline) and the messages (an invitation was declined, you were
// removed from a lobby, a lobby was closed). Nothing happens without an account or when the lobbies are switched off (404).
import { onPush, pushReady } from './push.js';
const POLL_MS = 10000, SAFETY_MS = 120000;                                                 // (every request is a call of the Lobbies Durable Object: a few thousand an hour from an open tab was too many)
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };

const css = el('style', {}, `
@import url(/css/park-fonts.css);
#arknotify { position: fixed; right: 18px; bottom: 18px; z-index: 2000; display: flex; flex-direction: column; gap: 14px; width: min(360px, calc(100vw - 36px)); pointer-events: none; font: 600 15px/1.35 'Barlow', system-ui, sans-serif; }
#arknotify .toast { pointer-events: auto; position: relative; background: #F8EDCB; color: #17262B; border: 4px solid #17262B; border-radius: 20px; padding: 12px 16px 14px; box-shadow: 0 5px 0 #17262B; animation: toastin .25s ease-out; }
#arknotify .toast.invite { background: #F4B63F; }
#arknotify .toast.bad { background: #F8EDCB; border-color: #A8321E; box-shadow: 0 5px 0 #A8321E; color: #A8321E; }
#arknotify .toast b { display: block; margin: 0 22px 3px 0; font: 400 1.05rem/1.15 'Park Head', 'Bowlby One', system-ui, sans-serif; }
#arknotify .toast .row { display: flex; gap: 10px; margin-top: 10px; }
#arknotify .toast button { font: 700 .95rem 'Barlow', system-ui, sans-serif; cursor: pointer; padding: .25rem 1rem .3rem; background: #F8EDCB; color: #17262B; border: 3px solid #17262B; border-radius: 999px; box-shadow: 0 3px 0 #17262B; }
#arknotify .toast button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 0 #17262B; }
#arknotify .toast button:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #17262B; }
#arknotify .toast button.go { background: #EE6C2B; color: #fff; text-shadow: 0 2px 0 rgba(23, 38, 43, .45); }
#arknotify .toast button:disabled { opacity: .55; cursor: default; }
#arknotify .toast .x { position: absolute; top: 6px; right: 8px; width: 26px; height: 26px; padding: 0; border: 0; background: none; box-shadow: none; font-size: 22px; line-height: 1; }
#arknotify .toast .x:hover:not(:disabled) { transform: none; box-shadow: none; color: #A8321E; }
#arknotify .toast .err { color: #A8321E; margin-top: 6px; font-weight: 700; }
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
