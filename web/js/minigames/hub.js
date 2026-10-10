// The mini games hub: one tile per enabled game (from GET /api/minigames), then the fixed "more coming soon" tile.
import { api } from './shell.js';

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

async function main() {
  const soon = document.getElementById('soon');
  try {
    const { games } = await api('');
    for (const g of games) soon.before(tile(g));
  } catch (e) {
    const err = document.getElementById('err');
    err.textContent = 'The mini games could not be loaded: ' + e.message;
    err.hidden = false;
  }
}
main();
