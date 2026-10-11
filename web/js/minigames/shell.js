// Shared by the mini game pages (docs/accounts_plan.md): the anonymous id and the API calls. A game page imports this and nothing from another game.
const ANON_KEY = 'minigameAnonId';

export function anonId() {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + String(Date.now())).replace(/[^A-Za-z0-9_-]/g, '');
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch (e) { return 'session' + Math.random().toString(36).slice(2, 12); }          // no storage: a new id for this page view
}

export async function api(path, body) {
  const res = await fetch('/api/minigames' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Anon-Id': anonId(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Something went wrong.'), { status: res.status, code: data.status });
  return data;
}

// ---- widgets shared by the game pages ---------------------------------------------------------------------------------------------
const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

/** The monthly and all-time leaderboards of a game, as two boxes in `into` (a `.pz-board` grid). */
export function renderBoards(into, key, unitLabel = null, fresh = false) {
  for (const [period, title] of [['month', 'This month'], ['all', 'All time']]) {
    const box = mk('div'); box.append(mk('h3', null, 'Leaderboard: ' + title)); into.append(box);
    api(`/${key}/leaderboard?period=${period}${fresh ? '&_=' + Date.now() : ''}`).then((b) => {
      if (!b.rows.length) { box.append(mk('p', 'muted', b.min_plays > 1 ? `Nobody is listed yet (a player needs ${b.min_plays} plays). Log in and play to appear here.` : 'Nobody is listed yet. Log in and play to appear here.')); return; }
      const unit = unitLabel || (b.unit ? b.unit[0].toUpperCase() + b.unit.slice(1) : 'Score');
      const t = mk('table'); t.innerHTML = `<tr><th>#</th><th>Player</th><th>Plays</th><th>${unit}</th></tr>`;
      for (const r of b.rows.slice(0, 10)) { const tr = mk('tr'); for (const v of [r.rank, r.name, r.plays, r.value]) tr.append(mk('td', null, String(v))); t.append(tr); }
      box.append(t);
    }).catch(() => box.append(mk('p', 'muted', 'The leaderboard could not be loaded.')));
  }
}
