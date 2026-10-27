// Background script. The page scripts cannot open an unfocused tab, close one, or open a tab without a click (a popup blocker stops it), so they ask for it here:
//   'open-helper'  BGA's replay page of a player in a new background tab (it collects the base projects; the tab is ours to close)
//   'open-import'  the replay tool's import page in a new tab (importer.js, running there, hands it the stored log)
//   'board-read'   the helper tab has read the base projects: close it
const api = typeof browser !== 'undefined' ? browser : chrome;
const area = () => api.storage.session || api.storage.local;       // (the tabs of an earlier browser session are gone: session storage where there is one)
const KEY = 'ark:helperTabs';

async function helpers() {
  try { return (await area().get(KEY))[KEY] || []; } catch (e) { return []; }
}
async function setHelpers(list) {
  try { await area().set({ [KEY]: list }); } catch (e) { /* the tab then stays open: harmless */ }
}

api.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg.type !== 'string') return;
  const from = sender && sender.tab ? sender.tab.id : undefined;
  if (msg.type === 'open-helper' && typeof msg.url === 'string' && /^https:\/\/boardgamearena\.com\//.test(msg.url)) {
    api.tabs.create({ url: msg.url, active: false, ...(from !== undefined ? { openerTabId: from } : {}) }).then(async (tab) => {
      await setHelpers([...(await helpers()), tab.id]);
    }).catch(() => {});
  } else if (msg.type === 'open-import' && typeof msg.url === 'string') {
    api.tabs.create({ url: msg.url, active: true }).catch(() => {});
  } else if (msg.type === 'board-read' && from !== undefined) {
    helpers().then(async (list) => {
      if (!list.includes(from)) return;                           // (a replay tab the user opened is left alone)
      await setHelpers(list.filter((id) => id !== from));
      api.tabs.remove(from).catch(() => {});
    });
  }
});
