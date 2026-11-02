// [module] The page of the saved maps (web/my_maps.html): the maps of the logged-in account (at most 3), each with its name and id; open one in the map editor, rename it, delete it.
// The map editor (map_editor.js) saves them: POST /api/maps (a new one), PUT /api/maps/<id> (the same one again, or a new name), DELETE /api/maps/<id>.
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
let account = null, limit = 3;

async function call(method, path, body) {
  const res = await fetch('/api/maps' + path, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Something went wrong.'), { status: res.status });
  return data;
}
const say = (text) => { $('msg').textContent = text || ''; };
const day = (iso) => (iso || '').slice(0, 10);

function render(maps) {
  $('count').textContent = `(${maps.length} of ${limit})`;
  $('newmap').hidden = maps.length >= limit;
  const box = $('rows');
  if (!maps.length) { box.replaceChildren(el('p', { className: 'empty' }, 'You have no saved maps yet. Make one in the map editor and save it there.')); return; }
  const t = el('table');
  t.append(el('tr', {}, ...['Name', 'Id', 'Changed', ''].map((h) => el('th', {}, h))));
  for (const m of maps) {
    const open = el('a', { href: '/map_editor.html?map=' + encodeURIComponent(m.id), className: 'btnlink', title: 'Open this map in the map editor' }, 'Open in the editor');
    const rename = el('button', { type: 'button', className: 'linkbtn' }, 'Rename');
    rename.onclick = async () => {
      const name = prompt('New name for this map (up to 40 characters):', m.name);
      if (name === null || !name.trim() || name.trim() === m.name) return;
      say('');
      try { await call('PUT', '/' + encodeURIComponent(m.id), { name: name.trim() }); await load(); } catch (e) { say(e.message); }
    };
    const del = el('button', { type: 'button', className: 'linkbtn' }, 'Delete');
    del.onclick = async () => {
      if (!confirm(`Delete the map "${m.name}" (${m.id})? This cannot be undone.`)) return;
      say('');
      try { await call('DELETE', '/' + encodeURIComponent(m.id)); await load(); } catch (e) { say(e.message); }
    };
    t.append(el('tr', {}, el('td', {}, m.name), el('td', { className: 'count' }, m.id), el('td', {}, day(m.updated_at)), el('td', {}, open, ' ', rename, ' ', del)));
  }
  box.replaceChildren(t);
}

async function load() {
  $('listing').hidden = !account;
  if (!account) return;
  try {
    const d = await call('GET', '');
    limit = d.limit || limit;
    $('limit').textContent = limit;
    render(d.maps);
  } catch (e) { $('rows').textContent = e.status === 404 ? 'Saved maps are not available here.' : e.message; }
}

function setAccount(a) {
  account = a;
  $('login').hidden = !!a;
  load();
}

async function boot() {
  $('loginbtn').onclick = () => { const b = document.querySelector('#acctbar button'); if (b) b.click(); };
  document.addEventListener('account-changed', (e) => setAccount(e.detail));
  const me = await fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  setAccount(me && me.account ? me.account : null);
  if (!me) $('login').hidden = true;                                                // (no accounts on this server)
}
boot();
