// Isolated world: receives the captured log, shows the button, and hands the log to the replay site's import page.
(() => {
  const DEFAULT_SITE = 'https://ark-nova-replay-analysis-725889947830.us-central1.run.app';
  const api = typeof browser !== 'undefined' ? browser : chrome;
  let captured = null;                                   // { table, log }
  let button = null;

  const siteOrigin = async () => {
    try {
      const { site } = await api.storage.sync.get('site');
      return new URL(site || DEFAULT_SITE).origin;
    } catch (e) { return DEFAULT_SITE; }
  };

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.source === 'ark-nova-capture') {
      captured = { table: e.data.table, log: e.data.log };
      render();
    }
  });

  function render() {
    if (!/^\/gamereview/.test(location.pathname) || !document.body) return;
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
    button.textContent = 'Open in Ark Nova Replay (table ' + captured.table + ')';
  }

  async function openReplay() {
    if (!captured) return;
    const origin = await siteOrigin();
    const { table, log } = captured;
    const win = window.open(origin + '/import.html?table=' + table, '_blank');
    if (!win) { alert('The popup was blocked, allow popups for this site.'); return; }
    // the import page announces itself once loaded; answer only the window we opened, only from the site's origin
    const onReady = (e) => {
      if (e.source !== win || e.origin !== origin || !e.data || e.data.type !== 'ark-nova-import-ready') return;
      window.removeEventListener('message', onReady);
      win.postMessage({ type: 'ark-nova-log', table, log }, origin);
    };
    window.addEventListener('message', onReady);
    setTimeout(() => window.removeEventListener('message', onReady), 60000);
  }

  // the button appears only after the log was captured; the body may not exist yet at document_start
  document.addEventListener('DOMContentLoaded', () => { if (captured) render(); });
})();
