// Isolated world. Stores what capture.js sees, per table id, in the extension's storage (so opening several tables keeps each one's data),
// and shows "Open in Ark Nova Replay" on the game review page only when the table's index data AND its log are both stored
// and the index data is about the same table as the log.
(() => {
  const DEFAULT_SITE = 'https://ark-nova.pages.dev';
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const key = (kind, table) => `ark:${kind}:${table}`;
  let ready = null;                                       // { table, log, index } once both are stored and match, for the table on show
  let checked = null;                                     // the table whose storage was looked at last
  let button = null;

  const siteOrigin = async () => {
    try {
      const { site } = await api.storage.sync.get('site');
      return new URL(site || DEFAULT_SITE).origin;
    } catch (e) { return DEFAULT_SITE; }
  };

  const tableOfPage = () => (/^\/gamereview/.test(location.pathname) ? new URLSearchParams(location.search).get('table') : null);

  // what is stored for `table`: the log and the index data, only when both exist and agree
  async function loadPair(table) {
    const got = await api.storage.local.get([key('log', table), key('index', table)]);
    const log = got[key('log', table)], index = got[key('index', table)];
    if (!log || !index) return null;
    if (String(index.data.id) !== String(log.table) || String(log.table) !== String(table)) return null;      // the table ids must agree
    return { table, log: log.text, index: index.data };
  }

  async function refresh() {
    const table = tableOfPage();
    if (table !== checked) {                              // another table (or no review page): look at the storage again
      checked = table;
      ready = table ? await loadPair(table).catch(() => null) : null;
    }
    render();
  }

  function render() {
    if (!ready || tableOfPage() !== ready.table || !document.body) { if (button) { button.remove(); button = null; } return; }
    if (!button) {
      button = document.createElement('button');
      button.id = 'ark-nova-replay-btn';
      Object.assign(button.style, {
        position: 'fixed', right: '16px', top: '72px', zIndex: 99999, padding: '10px 16px', border: 'none',
        borderRadius: '6px', background: '#2e7d32', color: '#fff', font: '600 14px sans-serif', cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,.35)',
      });
      button.addEventListener('click', openReplay);
      document.body.appendChild(button);
    }
    button.textContent = 'Open in Ark Nova Replay (table ' + ready.table + ')';
  }

  async function openReplay() {
    if (!ready) return;
    const origin = await siteOrigin();
    const { table, log, index } = ready;
    const win = window.open(origin + '/import.html?table=' + table, '_blank');
    if (!win) { alert('The popup was blocked, allow popups for this site.'); return; }
    // the import page announces itself once loaded; answer only the window we opened, only from the site's origin
    const onReady = (e) => {
      if (e.source !== win || e.origin !== origin || !e.data || e.data.type !== 'ark-nova-import-ready') return;
      window.removeEventListener('message', onReady);
      win.postMessage({ type: 'ark-nova-log', table, log, index }, origin);
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

  document.addEventListener('DOMContentLoaded', refresh);
  // BGA navigates without reloading (history API): look again when the address changes
  setInterval(() => { if (tableOfPage() !== checked) refresh(); else render(); }, 500);
})();
