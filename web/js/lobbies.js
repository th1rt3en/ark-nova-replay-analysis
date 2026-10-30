// [module] The list of the open lobbies and of the games in progress of the custom games, and the form to open a lobby (web/lobbies.html). Anybody can look (no account needed);
// opening a lobby and, in a lobby, taking a seat or writing in the chat need an account: without one the page asks to log in.
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const POLL_MS = 3000;
let account = null, options = { game_modes: [] }, timer = 0, mine = null;

async function call(path, body) {
  const res = await fetch('/api/lobbies' + path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Something went wrong.'), { status: res.status });
  return data;
}

function render(lobbies) {
  const box = $('rows');
  if (!lobbies.length) { box.replaceChildren(el('p', { className: 'empty' }, 'No open lobbies right now. Create one below.')); return; }
  const t = el('table');
  t.append(el('tr', {}, ...['Host', 'Players', 'Game mode', 'Options', ''].map((h) => el('th', {}, h))));
  for (const l of lobbies) {
    const join = el('a', { href: '/lobby.html?id=' + encodeURIComponent(l.id), className: 'btnlink', title: 'Look at the lobby: you join by clicking an empty seat there' }, l.full ? 'View' : 'Open');       // (opening a lobby does not seat you)
    t.append(el('tr', {}, el('td', {}, l.host), el('td', { className: 'count' }, `${l.players}/${l.seats}`), el('td', {}, l.mode_label),
      el('td', {}, el('span', { className: 'tag' }, l.marine_worlds ? 'Marine Worlds' : 'Base'), el('span', { className: 'tag' }, l.rated ? 'Rated' : 'Friendly')), el('td', {}, join)));
  }
  box.replaceChildren(t);
}

function renderGames(games) {                                                     // the games in progress: anybody may watch, a player of one gets the link back into it
  $('gamessection').hidden = !games.length;
  if (!games.length) return;
  const t = el('table');
  t.append(el('tr', {}, ...['Players', 'Game mode', 'Options', ''].map((h) => el('th', {}, h))));
  for (const g of games) {
    const href = '/play.html?game=' + encodeURIComponent(g.game_id) + (g.token ? '&s=' + encodeURIComponent(g.token) : '');
    t.append(el('tr', {}, el('td', {}, g.players.join(' vs ')), el('td', {}, g.mode_label),
      el('td', {}, el('span', { className: 'tag' }, g.marine_worlds ? 'Marine Worlds' : 'Base'), el('span', { className: 'tag' }, g.rated ? 'Rated' : 'Friendly')),
      el('td', {}, el('a', { href, className: 'btnlink' }, g.token ? 'Back to your game' : 'Watch'))));
  }
  $('games').replaceChildren(t);
}

async function refresh() {
  clearTimeout(timer);
  try {
    const d = await call('');
    mine = account ? d.mine : null;
    $('mine').hidden = !mine;
    $('minebtn').onclick = () => { location.href = '/lobby.html?id=' + encodeURIComponent(mine); };
    render(d.lobbies);
    renderGames(d.games || []);
  } catch (e) { $('rows').textContent = e.status === 404 ? 'Custom games are not available here.' : e.message; }
  timer = setTimeout(refresh, POLL_MS);
}

function setAccount(a) {
  account = a;
  $('login').hidden = !!a;
  $('createbtn').disabled = !a;
  $('rated').disabled = !a;
  refresh();
}

async function boot() {
  options = await fetch('/api/live/options').then((r) => r.json()).catch(() => ({ game_modes: [] }));
  const ark = options.game_modes.filter((m) => m.id === 'ark360');                 // (the only mode that can be played from a lobby for now)
  const mode = $('mode');
  for (const m of ark) mode.append(el('option', { value: m.id, title: m.description }, m.label));
  const hint = () => { const m = ark.find((x) => x.id === mode.value); $('modehint').textContent = m ? m.description : ''; };
  mode.onchange = hint; hint();
  $('loginbtn').onclick = () => { const b = document.querySelector('#acctbar button'); if (b) b.click(); };
  $('createform').onsubmit = async (e) => {
    e.preventDefault();
    $('msg').textContent = ''; $('createbtn').disabled = true;
    try {
      const v = await call('', { game_mode: mode.value, marine_worlds: $('mw').checked, rated: $('rated').checked });
      location.href = '/lobby.html?id=' + encodeURIComponent(v.id);
    } catch (err) { $('msg').textContent = err.message; $('createbtn').disabled = !account; }
  };
  document.addEventListener('account-changed', (e) => setAccount(e.detail));
  const me = await fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  setAccount(me && me.account ? me.account : null);
  if (!me) $('login').hidden = true;                                              // (no accounts on this server)
}
boot();
