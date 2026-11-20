// A manually submitted log is ~10 MB: too big for sessionStorage, so it travels to the replay page through IndexedDB.
// One connection per page (opened at the first use, given up when the browser asks for it: a newer version, or the page closing). A write counts as saved only
// when its transaction has committed (`oncomplete`): a request can succeed and the transaction still fail later (a full disk is reported at commit), and the
// page that saves goes on to the replay page right after the promise resolves.
const LogStore = (() => {
  let db = null;
  const open = () => db || (db = new Promise((resolve, reject) => {
    const req = indexedDB.open('ark-nova-replay', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('logs');
    req.onsuccess = () => {
      const conn = req.result;
      conn.onversionchange = () => { conn.close(); db = null; };            // (another tab opens a newer version: let it)
      conn.onclose = () => { db = null; };                                   // (closed by the browser: the next use opens again)
      resolve(conn);
    };
    req.onerror = () => { db = null; reject(req.error); };
    req.onblocked = () => { db = null; reject(new Error('the log store is blocked by another tab: close the other tabs of this site and try again')); };
  }));
  const run = async (mode, fn) => {
    const conn = await open();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = conn.transaction('logs', mode); } catch (e) { db = null; reject(e); return; }
      const req = fn(tx.objectStore('logs'));
      let result;
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || req.error);
      tx.onabort = () => reject(tx.error || new Error('the log could not be saved'));
    });
  };
  return {
    put: (tableId, text) => run('readwrite', (s) => s.put(text, String(tableId))),
    get: (tableId) => run('readonly', (s) => s.get(String(tableId))),
  };
})();
