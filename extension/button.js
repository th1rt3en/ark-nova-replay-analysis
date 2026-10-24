// Isolated world. Stores what capture.js sees, per table id, in the extension's storage (so opening several tables keeps each one's data),
// and shows "Open in Ark Nova Replay" on the game review page only when the table's index data AND its log are both stored
// and the index data is about the same table as the log.
// The three base conservation projects must be known for a replay. When the log never shows all of them (they appear only when a project is supported), the review page
// shows a prompt instead of the button: open BGA's own replay as one of the players, where the extension reads the projects off the association board (#base-projects-holder),
// stores them with the table, and the button then sends them along with the log. Everything the extension puts on a page can be closed with its x.
(() => {
  const DEFAULT_SITE = 'https://ark-nova.pages.dev';
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const key = (kind, table) => `ark:${kind}:${table}`;
  const PROJECT = /^P\d{3}$/;
  let pair = null;                                        // { table, log, index, complete, players, projects, names } for the table on show, once its log and index data are stored and match
  let checked = null;                                     // the page (kind:table) whose storage was looked at last
  let lastPage = null;                                    // the page seen on the last look (a new one forgets what was closed and what was read)
  let loadSeq = 0;
  let dismissed = null;                                   // the page whose panel was closed with its x
  let found = null;                                       // replay page: { projects, names } read off the board on this visit
  let ui = null;

  const siteOrigin = async () => {
    try {
      const { site } = await api.storage.sync.get('site');
      return new URL(site || DEFAULT_SITE).origin;
    } catch (e) { return DEFAULT_SITE; }
  };

  // the review page of a table, or BGA's replay page of it (/archive/replay/<version>/?table=...&player=...)
  function pageOf() {
    const table = new URLSearchParams(location.search).get('table');
    if (!/^\d+$/.test(table || '')) return null;
    if (/^\/gamereview/.test(location.pathname)) return { kind: 'review', table };
    if (/^\/archive\/replay\//.test(location.pathname)) return { kind: 'replay', table };
    return null;
  }
  const pageKey = (p) => (p ? p.kind + ':' + p.table : null);

  // what the log says without the replay tool: the players, and whether base_0..2 are all named (a base project is shown on its slot once it is supported)
  function logFacts(text) {
    const slots = [null, null, null], players = [];
    try {
      const data = JSON.parse(text).data;
      for (const p of data.players || []) players.push({ id: String(p.id), name: String(p.name) });
      for (const move of data.logs || []) {
        for (const e of move.data || []) {
          const card = e && e.type === 'slideMeeples' && e.args && e.args.card;
          const where = card && /^base_([0-2])$/.exec(String(card.location || ''));
          if (where) slots[+where[1]] = String(card.id || '').slice(0, 4);
        }
      }
    } catch (e) { return { complete: true, players };  /* a log that cannot be read is not a reason to hide the button: the replay tool verifies it */ }
    return { complete: slots.every((k) => PROJECT.test(k || '')), players };
  }

  // what is stored for `table`: the log and the index data, only when both exist and agree; the base projects read off BGA's replay, when there are some
  async function loadPair(table) {
    const got = await api.storage.local.get([key('log', table), key('index', table), key('bp', table)]);
    const log = got[key('log', table)], index = got[key('index', table)], bp = got[key('bp', table)];
    if (!log || !index) return null;
    if (String(index.data.id) !== String(log.table) || String(log.table) !== String(table)) return null;      // the table ids must agree
    const facts = logFacts(log.text);
    const ok = bp && Array.isArray(bp.projects) && bp.projects.length === 3 && bp.projects.every((k) => PROJECT.test(k));
    return { table, log: log.text, index: index.data, complete: facts.complete, players: facts.players, projects: ok ? bp.projects : null, names: ok && Array.isArray(bp.names) ? bp.names : [] };
  }

  async function refresh() {
    const page = pageOf(), id = pageKey(page);
    if (id !== lastPage) { lastPage = id; dismissed = null; found = null; }
    if (id !== checked) {                                 // another page (or none): look at the storage again
      checked = id;
      const mine = ++loadSeq;
      const loaded = page ? await loadPair(page.table).catch(() => null) : null;
      if (mine !== loadSeq) return;
      pair = loaded;
    }
    render();
  }

  // ---- BGA's replay page: the three base projects of the association board, left to right (base-project-0..2) -------------------------------
  function readBoard() {
    const keys = [], names = [];
    for (let n = 0; n < 3; n += 1) {
      const card = document.querySelector(`#base-projects-holder #base-project-${n} .project-card[data-id]`);
      const m = card && /^(P\d{3})/.exec(card.getAttribute('data-id') || '');
      if (!m) return null;
      keys.push(m[1]);
      const title = card.querySelector('.ark-card-title');
      names.push(title ? title.textContent.trim() : m[1]);
    }
    return new Set(keys).size === 3 ? { projects: keys, names } : null;
  }

  async function collect() {
    const page = pageOf();
    if (!page || page.kind !== 'replay' || !pair || pair.table !== page.table || pair.complete || found) return;
    const seen = readBoard();
    if (!seen) return;
    found = seen;
    pair = { ...pair, projects: seen.projects, names: seen.names };
    await api.storage.local.set({ [key('bp', page.table)]: { table: page.table, projects: seen.projects, names: seen.names, savedAt: Date.now() } }).catch(() => {});
    render();
  }

  // ---- the panel ---------------------------------------------------------------------------------------------------------------------------------
  const BOX = { background: '#fff', color: '#222', border: '2px solid #2e7d32', borderRadius: '8px', padding: '10px 14px', font: '13px/1.4 sans-serif', maxWidth: '300px', boxShadow: '0 2px 8px rgba(0,0,0,.35)' };
  const GREEN = { border: 'none', borderRadius: '6px', background: '#2e7d32', color: '#fff', font: '600 14px sans-serif', cursor: 'pointer', padding: '10px 16px', boxShadow: '0 2px 8px rgba(0,0,0,.35)' };
  const make = (tag, style, text) => { const n = document.createElement(tag); Object.assign(n.style, style || {}); if (text) n.textContent = text; return n; };

  // what the panel shows for the page: null (nothing), the button ('open'), the prompt to pick a point of view ('pick') or the wait for the board ('reading')
  function view() {
    const page = pageOf();
    if (!page || !pair || pair.table !== page.table || dismissed === pageKey(page)) return null;
    if (page.kind === 'review') {
      if (pair.complete) return { mode: 'open' };
      return pair.projects ? { mode: 'open', projects: pair.projects, names: pair.names } : { mode: 'pick' };
    }
    if (pair.complete) return null;                       // (a replay page of a table whose log needs nothing from it)
    return pair.projects ? { mode: 'open', projects: pair.projects, names: pair.names } : { mode: 'reading' };
  }

  function render() {
    const v = view();
    if (!v || !document.body) { if (ui) { ui.remove(); ui = null; } return; }
    const sig = JSON.stringify([v, pair.table, pair.players]);
    if (ui && ui.isConnected && ui.dataset.sig === sig) return;
    if (ui) ui.remove();
    ui = make('div', { position: 'fixed', right: '16px', top: '72px', zIndex: 99999 });
    ui.id = 'ark-nova-replay-ui';
    ui.dataset.sig = sig;
    const body = make('div', { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' });
    if (v.mode === 'open') {
      const button = make('button', GREEN, 'Open in Ark Nova Replay (table ' + pair.table + ')');
      button.id = 'ark-nova-replay-btn';
      button.addEventListener('click', openReplay);
      body.append(button);
      if (v.projects) body.append(make('div', { ...BOX, padding: '4px 10px', fontSize: '12px' }, 'Base projects read from the BGA replay: ' + (v.names.length === 3 ? v.names : v.projects).join(', ')));
    } else if (v.mode === 'pick') {
      const box = make('div', BOX);
      box.append(make('div', { fontWeight: '600', marginBottom: '4px' }, 'This log does not show all 3 base conservation projects.'));
      box.append(make('div', { marginBottom: '8px' }, 'Open the BGA replay as one of the players: the extension reads the projects off the board and sends them with the log.'));
      const row = make('div', { display: 'flex', flexWrap: 'wrap', gap: '6px' });
      for (const p of pair.players) {
        const b = make('button', { ...GREEN, padding: '6px 10px', fontSize: '13px' }, 'Replay as ' + p.name);
        b.addEventListener('click', () => window.open(replayUrl(p.id), '_blank'));
        row.append(b);
      }
      box.append(row);
      body.append(box);
    } else {
      body.append(make('div', BOX, 'Reading the base projects from the board… (they appear once the game has loaded)'));
    }
    const close = make('button', { position: 'absolute', top: '-9px', right: '-9px', width: '22px', height: '22px', padding: 0, border: 'none', borderRadius: '50%', background: '#333', color: '#fff', font: '700 14px/22px sans-serif', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.4)' }, '×');
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => { dismissed = pageKey(pageOf()); render(); });
    ui.append(body, close);
    document.body.appendChild(ui);
  }

  // BGA's own replay page of the table as `player`: a link of the page when there is one, else built from the version of the table info (the version BGA's replay urls carry)
  function replayUrl(player) {
    let version = pair.index && pair.index.siteversion;
    for (const a of document.querySelectorAll('a[href*="/archive/replay/"]')) {
      try {
        const u = new URL(a.href, location.href), m = /\/archive\/replay\/([^/]+)\//.exec(u.pathname);
        if (u.searchParams.get('table') === pair.table && u.searchParams.get('player') === player) return u.href;
        if (m && !version) version = m[1];
      } catch (e) { /* not a link */ }
    }
    return `${location.origin}/archive/replay/${version ? version + '/' : ''}?table=${pair.table}&player=${player}&comments=${player};`;
  }

  async function openReplay() {
    const v = view();
    if (!v || !pair) return;
    const origin = await siteOrigin();
    const { table, log, index } = pair;
    const base_projects = pair.complete ? null : pair.projects;             // (a log that shows them all needs nothing: it stays the authority)
    const win = window.open(origin + '/import.html?table=' + table, '_blank');
    if (!win) { alert('The popup was blocked, allow popups for this site.'); return; }
    // the import page announces itself once loaded; answer only the window we opened, only from the site's origin
    const onReady = (e) => {
      if (e.source !== win || e.origin !== origin || !e.data || e.data.type !== 'ark-nova-import-ready') return;
      window.removeEventListener('message', onReady);
      win.postMessage({ type: 'ark-nova-log', table, log, index, base_projects }, origin);
    };
    window.addEventListener('message', onReady);
    setTimeout(() => window.removeEventListener('message', onReady), 60000);
  }

  // capture.js hands over each response; it is stored under its table id and the page is looked at again
  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'ark-nova-capture') return;
    const { kind, table, payload } = e.data;
    const value = kind === 'index' ? { table, data: payload, savedAt: Date.now() } : { table, text: payload, savedAt: Date.now() };
    await api.storage.local.set({ [key(kind, table)]: value }).catch(() => {});
    checked = null;                                       // (the storage changed: read the pair again)
    refresh();
  });
  // the base projects stored by the replay tab reach the review tab of the same table
  try { api.storage.onChanged.addListener((changes, area) => { if (area === 'local') { checked = null; refresh(); } }); } catch (e) { /* no change events: the next look at the page reads them */ }

  document.addEventListener('DOMContentLoaded', refresh);
  // BGA navigates without reloading (history API): look again when the address changes; on the replay page the board is read as soon as it is there
  setInterval(() => { if (pageKey(pageOf()) !== checked) refresh(); else { collect(); render(); } }, 500);
})();
