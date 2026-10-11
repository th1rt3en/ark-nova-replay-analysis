// The mini games hub: one tile per enabled game (from GET /api/minigames), then the fixed "more coming soon" tile.
import { api, renderBoards } from './shell.js';
import { mountCalendar } from './calendar.js';

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };

function tile(g) {
  const sec = el('section', { className: 'mode' + (g.available ? '' : ' unavailable') });
  sec.append(el('h2', {}, g.title || g.key));
  sec.append(el('p', { className: 'muted' }, g.blurb || ''));
  const status = g.today.played ? `Played today: ${g.today.score} ${g.unit || 'points'}` : 'Not played today';
  sec.append(el('p', { className: 'small muted' }, g.available ? status : 'Not available right now'));
  if (g.available) {
    const a = el('a', { href: `/minigames/${encodeURIComponent(g.key)}.html` });
    a.append(el('button', { type: 'button' }, g.today.played ? 'See your result' : 'Play today\'s puzzle'));
    sec.append(a);
  }
  return sec;
}

// The calendar of every game whose earlier puzzles can be played: a day opens that game's page on that day.
function pastPuzzles(games) {
  if (!games.length) return;
  const wrap = document.getElementById('past'), list = document.getElementById('pastlist');
  wrap.hidden = false;
  for (const g of games) {
    const box = el('div', { className: 'pastgame' });
    box.append(el('h3', {}, g.title || g.key));
    const cal = el('div'); box.append(cal); list.append(box);
    mountCalendar(cal, g.key, null, (day) => { location.href = `/minigames/${encodeURIComponent(g.key)}.html?day=${day}`; });
  }
}

// The leaderboards of every game, one tab per game; each tab shows the month and the all time table side by side (loaded when the tab is opened).
function leaderboards(games) {
  if (!games.length) return;
  const wrap = document.getElementById('boards'), tabs = document.getElementById('lbtabs'), panel = document.getElementById('lbpanel');
  wrap.hidden = false;
  const loaded = new Set();
  function select(key) {
    for (const b of tabs.children) { const on = b.dataset.key === key; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
    panel.replaceChildren();
    const grid = el('div', { className: 'lbgrid' });
    panel.append(grid);
    renderBoards(grid, key);
    loaded.add(key);
  }
  for (const g of games) {
    const b = el('button', { type: 'button', className: 'lbtab', role: 'tab' }, g.title || g.key);
    b.dataset.key = g.key;
    b.onclick = () => select(g.key);
    b.onkeydown = (e) => {
      const i = [...tabs.children].indexOf(b), n = tabs.children.length;
      const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i + n - 1) % n : -1;
      if (to >= 0) { e.preventDefault(); tabs.children[to].focus(); select(tabs.children[to].dataset.key); }
    };
    tabs.append(b);
  }
  select(games[0].key);
}

async function main() {
  const soon = document.getElementById('soon');
  try {
    const { games } = await api('');
    for (const g of games) soon.before(tile(g));
    pastPuzzles(games.filter((g) => g.available && g.allow_past));
    leaderboards(games.filter((g) => g.available));
  } catch (e) {
    const err = document.getElementById('err');
    err.textContent = 'The mini games could not be loaded: ' + e.message;
    err.hidden = false;
  }
}
main();
