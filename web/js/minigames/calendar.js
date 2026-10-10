// The calendar of the mini games (shared by the game pages and the hub): the days that have a puzzle, the ones the player has played, and a click on a day.
// The months are kept in the page and in sessionStorage: a month that was seen is drawn at once (and refreshed in the background), the months before and after are fetched while the player looks.
import { anonId, api } from './shell.js';

const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const memory = new Map();
const storeKey = (key, month) => `minigameCal:${anonId()}:${key}:${month}`;

function read(key, month) {
  const id = storeKey(key, month);
  if (memory.has(id)) return memory.get(id);
  try { const raw = sessionStorage.getItem(id); if (raw) { const v = JSON.parse(raw); memory.set(id, v); return v; } } catch (e) { /* no storage */ }
  return null;
}

function fetchMonth(key, month) {
  return api(`/${key}/days?month=${month}`).then((data) => {
    const id = storeKey(key, month);
    memory.set(id, data);
    try { sessionStorage.setItem(id, JSON.stringify(data)); } catch (e) { /* no storage */ }
    return data;
  });
}

/** After a submission the played marks of that game are out of date. */
export function forgetCalendar(key) {
  for (const id of [...memory.keys()]) if (id.includes(`:${key}:`)) memory.delete(id);
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k && k.startsWith('minigameCal:') && k.includes(`:${key}:`)) sessionStorage.removeItem(k); }
  } catch (e) { /* no storage */ }
}

const shift = (m, d) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + d, 1)).toISOString().slice(0, 7); };

/** Draws the calendar of `key` into `host`; `onPick(day)` gets YYYY-MM-DD; `selectedDay` is marked. */
export function mountCalendar(host, key, selectedDay, onPick) {
  const picked = selectedDay && /^\d{4}-\d{2}-\d{2}$/.test(selectedDay) ? selectedDay : null;
  const nowMonth = new Date().toISOString().slice(0, 7);
  let month = (picked || new Date().toISOString().slice(0, 10)).slice(0, 7);
  let shown = null;
  host.classList.add('cal');

  function paint(data) {
    shown = JSON.stringify(data);
    const have = new Map(data.days.map((d) => [d.day, d]));
    host.replaceChildren();
    const head = mk('div', 'cal-head');
    const prev = mk('button', 'cal-nav', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous month'); prev.onclick = () => { month = shift(month, -1); load(); };
    const next = mk('button', 'cal-nav', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Next month'); next.disabled = month >= nowMonth; next.onclick = () => { month = shift(month, 1); load(); };
    head.append(prev, mk('b', 'cal-title', new Date(month + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })), next);
    host.append(head);
    const grid = mk('div', 'cal-grid');
    for (const w of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) grid.append(mk('span', 'cal-dow', w));
    const first = new Date(month + '-01T00:00:00Z');
    const lead = (first.getUTCDay() + 6) % 7, last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    for (let i = 0; i < lead; i++) grid.append(mk('span', 'cal-pad'));
    for (let d = 1; d <= last; d++) {
      const day = `${month}-${String(d).padStart(2, '0')}`, info = have.get(day);
      const c = mk(info ? 'button' : 'span', 'cal-day' + (info ? ' has' : '') + (info && info.played ? ' played' : '') + (day === picked ? ' sel' : '') + (day === data.today ? ' today' : ''));
      c.append(mk('b', null, String(d)));
      if (info) {
        c.type = 'button';
        c.title = (info.played ? `Played: ${info.score}` : 'Not played yet') + (day === data.today ? ' (today)' : '');
        if (info.played) c.append(mk('i', null, String(Math.round(info.score * 100) / 100)));
        c.onclick = () => onPick(day);
      }
      grid.append(c);
    }
    host.append(grid);
    const legend = mk('div', 'cal-legend');
    legend.append(mk('span', 'cal-key has', 'Puzzle'), mk('span', 'cal-key played', 'Played'), mk('span', 'cal-key today', 'Today'));
    host.append(legend);
  }

  function load() {
    const hit = read(key, month);
    if (hit) paint(hit); else host.classList.add('loading');
    const wanted = month;
    fetchMonth(key, month).then((data) => {
      host.classList.remove('loading');
      if (wanted === month && JSON.stringify(data) !== shown) paint(data);
      for (const m of [shift(month, -1), shift(month, 1)]) if (m <= nowMonth && !read(key, m)) fetchMonth(key, m).catch(() => {});
    }).catch(() => { host.classList.remove('loading'); if (!hit) host.textContent = 'The calendar could not be loaded.'; });
  }
  load();
}
