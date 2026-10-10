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
export function renderBoards(into, key, unitLabel = null) {
  for (const [period, title] of [['month', 'This month'], ['all', 'All time']]) {
    const box = mk('div'); box.append(mk('h3', null, 'Leaderboard: ' + title)); into.append(box);
    api(`/${key}/leaderboard?period=${period}`).then((b) => {
      if (!b.rows.length) { box.append(mk('p', 'muted', b.min_plays > 1 ? `Nobody is listed yet (a player needs ${b.min_plays} plays). Log in and play to appear here.` : 'Nobody is listed yet. Log in and play to appear here.')); return; }
      const unit = unitLabel || (b.unit ? b.unit[0].toUpperCase() + b.unit.slice(1) : 'Score');
      const t = mk('table'); t.innerHTML = `<tr><th>#</th><th>Player</th><th>Plays</th><th>${unit}</th></tr>`;
      for (const r of b.rows.slice(0, 10)) { const tr = mk('tr'); for (const v of [r.rank, r.name, r.plays, r.value]) tr.append(mk('td', null, String(v))); t.append(tr); }
      box.append(t);
    }).catch(() => box.append(mk('p', 'muted', 'The leaderboard could not be loaded.')));
  }
}

/** A month calendar of the days that have a puzzle (for a game with `allow_past`): `onPick(day)` is called with YYYY-MM-DD. */
export function mountCalendar(host, key, selectedDay, onPick) {
  const today = selectedDay && /^\d{4}-\d{2}-\d{2}$/.test(selectedDay) ? selectedDay : null;
  let month = (today || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const nowMonth = new Date().toISOString().slice(0, 7);
  const shift = (m, d) => { const [y, mo] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return t.toISOString().slice(0, 7); };
  async function draw() {
    let data;
    try { data = await api(`/${key}/days?month=${month}`); } catch (e) { host.textContent = 'The calendar could not be loaded.'; return; }
    const have = new Map(data.days.map((d) => [d.day, d]));
    host.replaceChildren();
    const head = mk('div', 'cal-head');
    const prev = mk('button', 'linkbtn', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous month'); prev.onclick = () => { month = shift(month, -1); draw(); };
    const next = mk('button', 'linkbtn', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Next month'); next.disabled = month >= nowMonth; next.onclick = () => { month = shift(month, 1); draw(); };
    head.append(prev, mk('b', null, new Date(month + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })), next);
    host.append(head);
    const grid = mk('div', 'cal-grid');
    for (const w of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) grid.append(mk('span', 'cal-dow', w));
    const first = new Date(month + '-01T00:00:00Z');
    const lead = (first.getUTCDay() + 6) % 7, last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    for (let i = 0; i < lead; i++) grid.append(mk('span'));
    for (let d = 1; d <= last; d++) {
      const day = `${month}-${String(d).padStart(2, '0')}`, info = have.get(day);
      const c = mk(info ? 'button' : 'span', 'cal-day' + (info ? ' has' : '') + (info && info.played ? ' played' : '') + (day === selectedDay ? ' sel' : '') + (day === data.today ? ' today' : ''));
      c.append(mk('b', null, String(d)));
      if (info) { c.type = 'button'; c.title = info.played ? `Played: ${info.score}` : 'Not played yet'; if (info.played) c.append(mk('i', null, String(info.score))); c.onclick = () => onPick(day); }
      grid.append(c);
    }
    host.append(grid);
  }
  draw();
}
