// A manually submitted log is ~10 MB: too big for sessionStorage, so it travels to the replay page through IndexedDB.
const LogStore = (() => {
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open('ark-nova-replay', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('logs');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction('logs', mode).objectStore('logs'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };
  return {
    put: (tableId, text) => run('readwrite', (s) => s.put(text, String(tableId))),
    get: (tableId) => run('readonly', (s) => s.get(String(tableId))),
  };
})();
