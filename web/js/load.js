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
  if (FORK) {
    const seed = params.get('seed');
    res = await fetch(url.replace(/\/replay$/, '/fork'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                           body: JSON.stringify({ step: parseInt(params.get('step'), 10), seed: seed ? parseInt(seed, 10) : undefined }) });
  } else if (params.get('source') === 'upload') {
    const text = await LogStore.get(table);
    if (!text) { location.replace('/submit.html?table=' + encodeURIComponent(table)); return null; }
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text });
  } else {
    res = await fetch(url);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'the replay could not be loaded');
  if (FORK) S.forkInfo = body.fork;
  return body;
}
