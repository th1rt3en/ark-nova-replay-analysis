// Runs on the replay tool's import page (import.html) when the extension opened it without a click (?ark=auto, after the base projects were collected):
// there is no opener to answer, so the stored log, table info and base projects are handed to the page here, in the message the page expects from the extension.
(() => {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const params = new URLSearchParams(location.search), table = params.get('table');
  if (!/^\d+$/.test(table || '') || params.get('ark') !== 'auto') return;
  (async () => {
    const k = (kind) => `ark:${kind}:${table}`;
    const got = await api.storage.local.get([k('log'), k('index'), k('bp')]);
    const log = got[k('log')], index = got[k('index')], bp = got[k('bp')];
    if (!log || !index || String(index.data.id) !== table || String(log.table) !== table) { console.debug('[ark-nova] nothing stored for table', table); return; }
    const projects = bp && Array.isArray(bp.projects) ? bp.projects : null;
    const send = () => window.postMessage({ type: 'ark-nova-log', table, log: log.text, index: index.data, base_projects: projects }, location.origin);
    console.debug('[ark-nova] handing the log of table', table, 'to the page');
    send();
    setTimeout(send, 1500);                              // (the page ignores a second copy: this one covers a page that was not listening yet)
  })().catch(() => {});
})();
