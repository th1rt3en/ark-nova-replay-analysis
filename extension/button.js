// Isolated world. Stores what capture.js sees, per table id, in the extension's storage (so opening several tables keeps each one's data),
// and shows one button, "Open in Ark Nova Replay", on the game review page once the table's log is stored (and, when the table info was seen too, agrees with it).
// A review page opened directly, without the table page, has no table info: the maps are then read off BGA's replay, as when BGA masks them.
// A click opens the replay tool when the three base conservation projects are known: the log shows all of them (they appear only when a project is supported) or they were
// read before; and, when BGA masks the players' maps in the table info (no BGA premium: "*masked*"), when the maps were read as well. Otherwise a BGA replay page of a player
// opens in a background tab, where this script (also running in the game's iframe) reads the projects off the association board (#base-projects-holder) and the maps off the
// zoo boards (.zoo-map-board-background[data-map]) and stores them; the review page, which shows "Preparing your replay…" meanwhile, then opens the replay tool (importer.js hands it the stored data).
// Everything the extension puts on a page can be closed with its x.
(() => {
  const DEFAULT_SITE = 'https://ark-nova.pages.dev';
  const READY_FOR = 30000;                                // ms the "ready" popup stays
  const SLOW_AFTER = 60000;                               // ms: after that the popup offers to open the replay without the projects
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const key = (kind, table) => `ark:${kind}:${table}`;
  const PROJECT = /^P\d{3}$/;
  const MAP = /^(\d{1,2}[a-z]?|[A-Z]|T1)$/;                 // a map as the replay tool names it: "9", "3a", "A", "T1"
  let pair = null;                                        // { table, log, index, complete, projects } for the table on show, once its log and index data are stored and match
  let checked = null;                                     // the page (kind:table) whose storage was looked at last
  let lastPage = null;                                    // the page seen on the last look (a new one forgets what was closed and what was read)
  let loadSeq = 0;
  let dismissed = null;                                   // the page whose button was closed with its x
  let waiting = null;                                     // review page: { slow } while a replay page collects the projects
  let slowTimer = null;
  let found = {};                                         // replay page: what was read on this visit ({ projects, maps })
  let lastNote = 0;                                       // the time of the last console note while looking for the board
  let ui = null, dlg = null;

  const siteOrigin = async () => {
    try {
      const { site } = await api.storage.sync.get('site');
      return new URL(site || DEFAULT_SITE).origin;
    } catch (e) { return DEFAULT_SITE; }
  };

  // the review page of a table, BGA's replay page of it (/archive/replay/<version>/?table=...&player=...) or the frame of that page that holds the game
  function pageOf() {
    const table = new URLSearchParams(location.search).get('table');
    if (!/^\d+$/.test(table || '')) return null;
    if (/^\/gamereview/.test(location.pathname)) return { kind: 'review', table };
    if (/^\/archive\/archive\/frame\.html/.test(location.pathname)) return { kind: 'frame', table };
    if (/^\/archive\//.test(location.pathname)) return { kind: 'replay', table };
    return null;
  }
  const pageKey = (p) => (p ? p.kind + ':' + p.table : null);

  // whether the log names base_0..2 (a base project is shown on its slot once it is supported)
  function logComplete(text) {
    const slots = [null, null, null];
    try {
      const data = JSON.parse(text).data;
      for (const move of data.logs || []) {
        for (const e of move.data || []) {
          const card = e && e.type === 'slideMeeples' && e.args && e.args.card;
          const where = card && /^base_([0-2])$/.exec(String(card.location || ''));
          if (where) slots[+where[1]] = String(card.id || '').slice(0, 4);
        }
      }
    } catch (e) { return true;  /* a log that cannot be read is not a reason to hold the replay back: the replay tool verifies it */ }
    return slots.every((k) => PROJECT.test(k || ''));
  }

  // the player ids of the log
  function playerIds(text) {
    try { return (JSON.parse(text).data.players || []).map((p) => String(p.id)); } catch (e) { return []; }
  }

  // whether BGA hid the players' maps in the table info (the end-of-game stats are a BGA premium feature: the maps read "*masked*"): the replay page then has to tell them
  function mapsMasked(index) {
    const field = ((((index || {}).result || {}).stats || {}).player || {}).map;
    if (!field) return false;
    return [...Object.values(field.valuelabels || {}), ...Object.values(field.values || {})].some((v) => /masked/i.test(String(v)));
  }

  // what is stored for `table`: the log and the index data, only when both exist and agree; the base projects and the maps read off BGA's replay, when there are some
  async function loadPair(table) {
    const got = await api.storage.local.get([key('log', table), key('index', table), key('bp', table), key('maps', table)]);
    const log = got[key('log', table)], index = got[key('index', table)], bp = got[key('bp', table)], seen = got[key('maps', table)];
    if (!log || String(log.table) !== String(table)) return null;
    if (index && String(index.data.id) !== String(table)) return null;      // the table ids must agree (no table info at all is fine: the review page was opened directly, without the table page)
    const ok = bp && Array.isArray(bp.projects) && bp.projects.length === 3 && bp.projects.every((k) => PROJECT.test(k));
    const ids = playerIds(log.text);
    const mapsOk = seen && seen.maps && ids.length > 0 && ids.every((id) => MAP.test(String(seen.maps[id] || '')));
    return { table, log: log.text, index: index ? index.data : null, complete: logComplete(log.text), projects: ok ? bp.projects : null,
             needsMaps: !index || mapsMasked(index.data), maps: mapsOk ? seen.maps : null, players: ids };      // (without the table info the maps are unknown, as when BGA masks them)
  }

  // everything the replay tool needs is known: the base projects (the log shows them or they were read) and, when BGA masks the maps, the maps
  const isReady = (p) => !!p && (p.complete || !!p.projects) && (!p.needsMaps || !!p.maps);

  async function refresh() {
    const page = pageOf(), id = pageKey(page);
    if (id !== lastPage) { lastPage = id; dismissed = null; found = {}; stopWaiting(); }
    if (id !== checked) {                                 // another page (or none): look at the storage again
      checked = id;
      const mine = ++loadSeq;
      const loaded = page ? await loadPair(page.table).catch(() => null) : null;
      if (mine !== loadSeq) return;
      pair = loaded;
    }
    if (waiting && !waiting.ready && isReady(pair)) {                                 // (the replay page has read them)
      stopWaiting();
      waiting = { ready: true };                          // the popup stays with a button: the tab opened below needs the extension to have access to the site, a click always works
      openImportTab();
      slowTimer = setTimeout(() => { stopWaiting(); render(); }, READY_FOR);
    }
    render();
  }

  // ---- BGA's replay page: the three base projects of the association board, left to right (base-project-0..2) -------------------------------
  // (the game is in a same-origin iframe of the replay page: the page's own script looks into it as well, so it does not depend on the script being injected into the frame)
  function readBoard(doc = document, depth = 0) {
    const keys = [];
    for (let n = 0; n < 3; n += 1) {
      const card = doc.querySelector(`#base-projects-holder #base-project-${n} .project-card[data-id]`);
      const m = card && /^(P\d{3})/.exec(card.getAttribute('data-id') || '');
      if (!m) break;
      keys.push(m[1]);
    }
    if (keys.length === 3 && new Set(keys).size === 3) return keys;
    if (depth > 3) return null;
    for (const f of doc.querySelectorAll('iframe')) {
      try { const inner = f.contentDocument && readBoard(f.contentDocument, depth + 1); if (inner) return inner; } catch (e) { /* another origin */ }
    }
    return null;
  }

  // ---- BGA's replay page: the map of each player (the zoo map board has data-map="<map>"; the player's id is in an id / data attribute of the zoo around it) ----
  function ownerOf(el, ids) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      for (const attr of ['data-player-id', 'data-player', 'data-pid', 'id']) {
        const hit = (n.getAttribute(attr) || '').match(/\d{5,}/g);
        const id = hit && hit.find((x) => ids.includes(x));
        if (id) return id;
      }
    }
    return null;
  }
  function readMaps(ids, doc = document, depth = 0, out = {}) {
    for (const el of doc.querySelectorAll('.zoo-map-board-background[data-map]')) {
      const owner = ownerOf(el, ids), map = el.getAttribute('data-map');
      if (owner && MAP.test(map || '') && !(owner in out)) out[owner] = map;
    }
    if (depth <= 3) {
      for (const f of doc.querySelectorAll('iframe')) {
        try { if (f.contentDocument) readMaps(ids, f.contentDocument, depth + 1, out); } catch (e) { /* another origin */ }
      }
    }
    return ids.length && ids.every((id) => out[id]) ? out : null;
  }

  async function collect() {
    const page = pageOf();
    if (!page || page.kind === 'review' || !pair || pair.table !== page.table) return;
    const wantProjects = !pair.complete && !pair.projects && !found.projects;
    const wantMaps = pair.needsMaps && !pair.maps && !found.maps;
    if (!wantProjects && !wantMaps) return;
    const seen = wantProjects ? readBoard() : null, maps = wantMaps ? readMaps(pair.players) : null;
    if (wantProjects && !seen || wantMaps && !maps) {
      if (Date.now() - lastNote > 10000) {                // (for a bug report: what this frame can see; F12 console, filter "ark-nova")
        lastNote = Date.now();
        const zoo = [...document.querySelectorAll('.zoo-map-board-background')].map((el) => ({ map: el.getAttribute('data-map'), owner: ownerOf(el, pair.players), id: el.id, parent: el.parentElement && el.parentElement.id }));
        console.debug('[ark-nova] looking for the base projects / maps:', { page: page.kind, iframes: document.querySelectorAll('iframe').length, holder: !!document.querySelector('#base-projects-holder'), zoo });
      }
    }
    if (seen) {
      found.projects = seen;
      console.debug('[ark-nova] base projects read from the board:', seen.join(', '));
      await api.storage.local.set({ [key('bp', page.table)]: { table: page.table, projects: seen, savedAt: Date.now() } }).catch(() => {});
    }
    if (maps) {
      found.maps = maps;
      console.debug('[ark-nova] maps read from the zoo boards:', JSON.stringify(maps));
      await api.storage.local.set({ [key('maps', page.table)]: { table: page.table, maps, savedAt: Date.now() } }).catch(() => {});
    }
    if ((seen || !wantProjects) && (maps || !wantMaps)) api.runtime.sendMessage({ type: 'board-read' }).catch(() => {});       // (a tab the extension opened for this closes itself, once it has read everything)
  }

  // ---- the button and the popup ------------------------------------------------------------------------------------------------------------------
  const BOX = { background: '#fff', color: '#222', border: '2px solid #2e7d32', borderRadius: '8px', padding: '14px 18px', font: '14px/1.45 sans-serif', maxWidth: '340px', boxShadow: '0 4px 16px rgba(0,0,0,.4)' };
  const GREEN = { border: 'none', borderRadius: '6px', background: '#2e7d32', color: '#fff', font: '600 14px sans-serif', cursor: 'pointer', padding: '10px 16px', boxShadow: '0 2px 8px rgba(0,0,0,.35)' };
  const make = (tag, style, text) => { const n = document.createElement(tag); Object.assign(n.style, style || {}); if (text) n.textContent = text; return n; };
  function closeButton(onClose) {
    const close = make('button', { position: 'absolute', top: '-9px', right: '-9px', width: '22px', height: '22px', padding: 0, border: 'none', borderRadius: '50%', background: '#333', color: '#fff', font: '700 14px/22px sans-serif', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.4)' }, '×');
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', onClose);
    return close;
  }

  function render() {
    const page = pageOf();
    const show = page && page.kind === 'review' && pair && pair.table === page.table && document.body;
    // the button
    if (!show || dismissed === pageKey(page)) { if (ui) { ui.remove(); ui = null; } }
    else if (!ui || !ui.isConnected) {
      ui = make('div', { position: 'fixed', right: '16px', top: '72px', zIndex: 99999 });
      ui.id = 'ark-nova-replay-ui';
      const button = make('button', GREEN, 'Open in Ark Nova Replay (table ' + pair.table + ')');
      button.id = 'ark-nova-replay-btn';
      button.addEventListener('click', onClick);
      ui.append(button, closeButton(() => { dismissed = pageKey(pageOf()); render(); }));
      document.body.appendChild(ui);
    }
    // the popup while a replay page collects the projects
    if (!show || !waiting) { if (dlg) { dlg.remove(); dlg = null; } return; }
    const sig = waiting.ready ? 'ready' : String(waiting.slow);
    if (dlg && dlg.isConnected && dlg.dataset.sig === sig) return;
    if (dlg) dlg.remove();
    dlg = make('div', { position: 'fixed', left: '50%', top: '30%', transform: 'translateX(-50%)', zIndex: 100000 });
    dlg.id = 'ark-nova-replay-dialog';
    dlg.dataset.sig = sig;
    const box = make('div', BOX);
    const head = make('div', { display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '700', fontSize: '16px', marginBottom: '6px' });
    const spinner = make('span', { width: '16px', height: '16px', border: '3px solid #c8e6c9', borderTopColor: '#2e7d32', borderRadius: '50%', display: 'inline-block' });
    try { spinner.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 900, iterations: Infinity }); } catch (e) { /* no animation */ }
    if (waiting.ready) {
      head.append(make('span', {}, 'Your replay is ready'));
      box.append(head, make('div', {}, 'It should open in a new tab. If it does not, open it here:'));
      const open = make('button', { ...GREEN, marginTop: '8px', padding: '7px 12px' }, 'Open replay');
      open.addEventListener('click', () => { stopWaiting(); openReplay(); render(); });
      box.append(open);
    } else {
      head.append(spinner, make('span', {}, 'Preparing your replay…'));
      box.append(head, make('div', {}, 'Collecting the remaining game information. Your replay will open automatically when it’s ready.'));
    }
    if (waiting.slow) {
      box.append(make('div', { marginTop: '8px' }, 'This is taking longer than expected.'));
      const b = make('button', { ...GREEN, marginTop: '8px', padding: '7px 12px' }, 'Open the replay anyway');
      b.addEventListener('click', () => { stopWaiting(); openReplay(); render(); });
      box.append(b);
    }
    dlg.append(box, closeButton(() => { stopWaiting(); render(); }));
    document.body.appendChild(dlg);
  }

  function stopWaiting() {
    waiting = null;
    if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
  }

  // BGA's replay page of a player, from the review page's own links (div.playerselection), else built from the version of the table info
  function playerReplayUrl() {
    const link = document.querySelector('.playerselection a.choosePlayerLink[href*="/archive/replay/"], a[href*="/archive/replay/"][href*="table=' + pair.table + '"]');
    if (link) { try { return new URL(link.getAttribute('href'), location.href).href; } catch (e) { /* fall through */ } }
    const version = pair.index && pair.index.siteversion;
    let player = null;
    try { const p = (JSON.parse(pair.log).data.players || [])[0]; player = p && p.id; } catch (e) { /* no players */ }
    return version && player ? `${location.origin}/archive/replay/${version}/?table=${pair.table}&player=${player}&comments=` : null;
  }

  function onClick() {
    if (!pair) return;
    if (isReady(pair)) { openReplay(); return; }                           // the projects (and the maps BGA masks) are known
    const url = playerReplayUrl();
    if (!url) { openReplay(); return; }                                    // (no replay page to read them from: the replay tool infers them)
    waiting = { slow: false };
    slowTimer = setTimeout(() => { if (waiting) { waiting.slow = true; render(); } }, SLOW_AFTER);
    api.runtime.sendMessage({ type: 'open-helper', url }).catch(() => { stopWaiting(); openReplay(); });
    render();
  }

  // the replay tool, from a click: its import page announces itself once loaded; answer only the window we opened, only from the site's origin
  async function openReplay() {
    if (!pair) return;
    const origin = await siteOrigin();
    const { table, log, index } = pair;
    const base_projects = pair.complete ? null : pair.projects;             // (a log that shows them all needs nothing: it stays the authority)
    const maps = pair.needsMaps ? pair.maps : null;                         // (only when BGA masks them in the table info)
    const win = window.open(origin + '/import.html?table=' + table, '_blank');
    if (!win) { alert('The popup was blocked, allow popups for this site.'); return; }
    const onReady = (e) => {
      if (e.source !== win || e.origin !== origin || !e.data || e.data.type !== 'ark-nova-import-ready') return;
      window.removeEventListener('message', onReady);
      win.postMessage({ type: 'ark-nova-log', table, log, index, base_projects, maps }, origin);
    };
    window.addEventListener('message', onReady);
    setTimeout(() => window.removeEventListener('message', onReady), 60000);
  }

  // without a click (the projects arrived later) a tab is opened by the background script; importer.js there hands over the stored log
  async function openImportTab() {
    if (!pair) return;
    const origin = await siteOrigin();
    api.runtime.sendMessage({ type: 'open-import', url: origin + '/import.html?table=' + pair.table + '&ark=auto' }).catch(() => {});
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
