// [module] Loads the game to show: a replay from the API, an uploaded log (IndexedDB LogStore), a fork start state or the sandbox game from sessionStorage.
import { FORK, MINIGAME, PLAY, S, SANDBOX, params, table } from './state.js';
import { playLoad } from './play.js';


// ---- loading --------------------------------------------------------------------------------------------------
export async function fetchReplay() {
  if (PLAY) return playLoad();
  if (MINIGAME) return window.MINIGAME_REPLAY;                             // the puzzle page loaded the redacted position before it started the viewer
  const url = '/api/tables/' + encodeURIComponent(table) + '/replay';
  let res;
  if (SANDBOX) {                                                           // the game the lobby started
    const raw = sessionStorage.getItem('sandboxGame');
    if (!raw) { location.replace('/sandbox.html'); return null; }
    const game = JSON.parse(raw);
    game.steps.forEach((st, i) => { st.index = i; });
    return game;
  }
  const server = params.get('source') === 'upload' ? await keptOnServer() : { kept: false, complete: false };       // (what the server keeps of this table: nothing to send when it has the log, and nothing at all when it has the data too)
  if (FORK) {
    const seed = params.get('seed');
    let log, kept = false, index = null, base_projects = null, maps = null;              // a table without a collected log (opened with the extension): the log and the table info are in this browser, the server builds the fork from them
    if (params.get('source') === 'upload') {
      kept = server.kept && !server.complete;                                // (a table whose log and data the server keeps opens like a logged one: nothing is sent)
      if (!server.complete) {
        if (!kept) log = await LogStore.get(table);
        if (!kept && !log) { location.replace('/submit.html?table=' + encodeURIComponent(table)); return null; }
        const info = await LogStore.get('index:' + table);
        index = info ? JSON.parse(info) : null;
        const projects = await LogStore.get('baseprojects:' + table);
        base_projects = projects ? JSON.parse(projects) : null;
        const seen = await LogStore.get('maps:' + table);
        maps = seen ? JSON.parse(seen) : null;
      }
    }
    const forkPost = async (withLog) => fetch(url.replace(/\/replay$/, '/fork'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                                                  body: await packed(JSON.stringify({ step: parseInt(params.get('step'), 10), seed: seed ? parseInt(seed, 10) : undefined, log: withLog ? log : undefined, kept: !withLog && kept, index, base_projects, maps })) });
    res = await forkPost(!kept);
    if (kept && res.status === 409) {                                        // (the kept copy is gone: send the log)
      log = await LogStore.get(table);
      if (!log) { location.replace('/submit.html?table=' + encodeURIComponent(table)); return null; }
      res = await forkPost(true);
    }
  } else if (params.get('source') === 'upload' && !server.complete) {       // (a complete kept table is fetched below like a logged one: the server has its log and its data, and caches the replay)
    let kept = server.kept;                                 // (the log is already in GCS: nothing to send)
    let text = kept ? null : await LogStore.get(table);
    if (!kept && !text) { location.replace('/submit.html?table=' + encodeURIComponent(table)); return null; }
    const info = await LogStore.get('index:' + table);                       // the table info of the extension (optional): the Elo of the players
    const projects = await LogStore.get('baseprojects:' + table);            // the base projects the extension read off BGA's replay (optional)
    const seenMaps = await LogStore.get('maps:' + table);                    // the maps of the players, read there when the table info masks them (optional)
    const send = async (extra) => fetch('/api/tables/' + encodeURIComponent(table) + '/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                                                                body: await packed('{"log":' + (kept ? 'null,"kept":true' : text) + ',"index":' + (info || 'null') + ',"base_projects":' + (projects || 'null') + ',"maps":' + (seenMaps || 'null')  + extra + '}') });
    const post = async (extra) => {
      const r = await send(extra);
      if (!(kept && r.status === 409)) return r;                             // (the kept copy is gone: send the log as usual)
      kept = false;
      text = await LogStore.get(table);
      if (!text) { location.replace('/submit.html?table=' + encodeURIComponent(table)); return r; }
      return send(extra);
    };
    fullFetch = () => post('');
    res = await post(',"quick":true');                                       // (the draft and the starting hand first: the engine's replay of the whole game takes a while)
  } else {
    fullFetch = () => fetch(url);
    res = await fetch(url, { headers: { 'X-Quick': '1' } });                 // (a replay the browser or the server has comes back whole; else the draft and the starting hand only)
  }
  const body = await readReplay(res);
  if (FORK) S.forkInfo = body.fork;
  return body;
}

// Whether the server already keeps this table's log (GCS): then the page does not upload it. Any trouble counts as "no": the log is sent as before.
async function keptOnServer() {
  try {
    const res = await fetch('/api/tables/' + encodeURIComponent(table) + '/kept', { cache: 'no-store' });
    const body = res.ok ? await res.json() : {};
    return { kept: body.kept === true, complete: body.complete === true };
  } catch (e) { return { kept: false, complete: false }; }
}

let fullFetch = null;
async function readReplay(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'the replay could not be loaded');
  return body;
}
// The whole replay, for a first answer that has `partial: true` (the viewer swaps it in when it arrives).
export async function fetchFullReplay() {
  return readReplay(await fullFetch());
}

// A log is some 10 MB of text and 30 times smaller gzipped: the upload of a slow connection took longer than anything else (the server unpacks a body that starts with the gzip bytes).
async function packed(text) {
  if (typeof CompressionStream === 'undefined') return text;
  try { return await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); } catch (e) { return text; }
}
