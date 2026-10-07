// Runs in the page's own JS world (document_start) so it can see BGA's XHR/fetch responses.
// Whatever it captures is handed to button.js (isolated world) with window.postMessage.
(() => {
  const LOGS = /\/archive\/archive\/logs\.html/;
  const send = (url, text) => {
    try {
      const table = new URL(url, location.href).searchParams.get('table');
      if (table && /^\d+$/.test(table) && typeof text === 'string') {
        window.postMessage({ source: 'ark-nova-capture', table, log: text }, location.origin);
      }
    } catch (e) { /* ignore */ }
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (LOGS.test(String(url))) {
      this.addEventListener('load', () => {
        if (this.responseType === '' || this.responseType === 'text') send(String(url), this.responseText);
      });
    }
    return xhrOpen.apply(this, arguments);
  };

  const realFetch = window.fetch;
  window.fetch = function (input) {
    const p = realFetch.apply(this, arguments);
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (LOGS.test(url)) p.then((r) => r.clone().text().then((t) => send(url, t))).catch(() => {});
    return p;
  };
})();
