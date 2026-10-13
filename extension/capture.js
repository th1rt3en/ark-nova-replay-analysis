// Runs in the page's own JS world (document_start) so it can see BGA's XHR/fetch responses.
// Two kinds of response are kept (handed to button.js in the isolated world with window.postMessage):
//   'log'    the game log (archive/logs.html, on the game review page)
//   'index'  the table info (tableinfos.html, on the table page): the data the replay site would have from its index
(() => {
  const LOGS = /\/archive\/archive\/logs\.html/;
  const TABLEINFOS = /\/tableinfos\.html/;
  const post = (kind, table, payload) => window.postMessage({ source: 'ark-nova-capture', kind, table, payload }, location.origin);
  const tableOf = (url) => { try { return new URL(url, location.href).searchParams.get('table'); } catch (e) { return null; } };

  const handle = (url, text) => {
    if (typeof text !== 'string') return;
    try {
      if (LOGS.test(url)) {
        const table = tableOf(url);
        if (table && /^\d+$/.test(table)) post('log', table, text);
      } else if (TABLEINFOS.test(url)) {
        const info = JSON.parse(text);
        const id = info && info.status === 1 && info.data && String(info.data.id || '');
        if (id && /^\d+$/.test(id)) post('index', id, info.data);
      }
    } catch (e) { /* not the JSON we expect: ignore */ }
  };
  const wanted = (url) => LOGS.test(url) || TABLEINFOS.test(url);

  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (wanted(String(url))) {
      this.addEventListener('load', () => {
        if (this.responseType === '' || this.responseType === 'text') handle(String(url), this.responseText);
      });
    }
    return xhrOpen.apply(this, arguments);
  };

  const realFetch = window.fetch;
  window.fetch = function (input) {
    const p = realFetch.apply(this, arguments);
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (wanted(url)) p.then((r) => r.clone().text().then((t) => handle(url, t))).catch(() => {});
    return p;
  };
})();
