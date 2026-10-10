// Daily starting hand (minigames/daily_hand.html): the viewer shows one redacted position (MINIGAME_MODE), this panel lets the player pick the cards to keep, then
// shows what the original player kept, the pick rates of the day, the table and the leaderboards. Nothing here knows another mini game.
import { api } from './shell.js';

const KEY = 'daily_hand';
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const $ = (id) => document.getElementById(id);

async function start() {
  let puzzle;
  try { puzzle = await api(`/${KEY}/today`); } catch (e) {
    const m = $('loading'); m.className = 'status error'; m.textContent = 'Today\'s puzzle could not be loaded: ' + e.message;
    return;
  }
  window.MINIGAME_REPLAY = puzzle.public.replay;
  window.MINIGAME_POV = puzzle.public.pov;
  await import('/js/main.js');                                           // boots the viewer on the puzzle's one step
  for (let i = 0; i < 200 && $('app').hidden; i++) await new Promise((r) => setTimeout(r, 50));
  mount(puzzle, await import('/js/cards.js'), await import('/js/state.js'));
}

function mount(puzzle, cards, state) {
  const { info, cardName, largeOf, showPreview, hidePreview } = cards;
  const root = $('puzzle');
  const pub = puzzle.public;
  const picked = new Set();
  let result = puzzle.result;
  const seatLabel = pub.replay.players[pub.pov].name;

  function cardNode(key, extra) {
    const c = info(key);
    const node = el('div', 'pz-card' + (extra || ''));
    const img = el('img'); img.src = c.image; img.alt = cardName(key); img.loading = 'eager';
    node.append(img, el('div', 'pz-name', cardName(key)));
    node.onmouseenter = () => showPreview(largeOf(c));
    node.onmouseleave = hidePreview;
    return node;
  }

  function loginNote() {
    if (!window.arkAccountsEnabled || window.arkAccount) return null;
    return el('p', 'pz-login', 'You can create an account to save your results and compete in a monthly leaderboard, or submit your prediction anonymously.');
  }

  function draw() {
    root.replaceChildren();
    root.append(el('h1', null, 'Daily starting hand'), el('p', 'muted', `${puzzle.day} (UTC). Both players' names are hidden; their Elo before this game is shown.`));
    root.append(el('p', null, `You are ${seatLabel}, looking at your dealt hand before the initial selection. Pick the ${pub.keep} cards you would keep. You score 1 point for every card the original player kept too.`));
    const hand = el('div', 'pz-hand' + (result ? ' done' : ''));
    for (const key of pub.hand) {
      let extra = '';
      if (result) extra = (result.original.includes(key) ? ' orig' : '') + (result.picks.includes(key) ? ' on' : '');
      else if (picked.has(key)) extra = ' on';
      const node = cardNode(key, extra);
      if (result) {
        const rate = (result.stats.pick_rates || {})[key] || 0;
        const tag = result.original.includes(key) ? (result.picks.includes(key) ? 'Kept by both' : 'Original kept') : result.picks.includes(key) ? 'Your pick' : '';
        node.append(el('div', 'pz-tag', tag));
        const bar = el('div', 'pz-bar'); const fill = el('i'); fill.style.width = Math.round(rate * 100) + '%'; bar.append(fill);
        node.append(bar, el('div', 'pz-tag', Math.round(rate * 100) + '% of players'));
      } else {
        node.onclick = () => { if (picked.has(key)) picked.delete(key); else if (picked.size < pub.keep) picked.add(key); draw(); };
      }
      hand.append(node);
    }
    root.append(hand);
    if (result) { drawResult(); return; }
    const note = loginNote();
    if (note) root.append(note);
    const actions = el('div', 'pz-actions');
    const go = el('button', null, 'Confirm'); go.disabled = picked.size !== pub.keep;
    actions.append(go, el('span', 'muted', `${picked.size} / ${pub.keep} cards picked`));
    const err = el('p', 'muted'); err.style.color = '#a12f2f';
    go.onclick = async () => {
      go.disabled = true; err.textContent = '';
      try { result = await api(`/${KEY}/submit`, { day: puzzle.day, payload: { picks: [...picked] } }); draw(); }
      catch (e) {
        if (e.code === 'already_played') { const again = await api(`/${KEY}/today`); result = again.result; draw(); return; }
        err.textContent = e.message; go.disabled = false;
      }
    };
    root.append(actions, err);
  }

  function drawResult() {
    root.append(el('p', 'pz-result', `You scored ${result.score} out of ${result.of}.`));
    const stats = result.stats;
    root.append(el('p', 'muted', `${stats.players} player${stats.players === 1 ? '' : 's'} played this puzzle today so far. The green cards are what the original player kept.`));
    const p = el('p');
    p.append('This was ');
    const a = el('a', null, `table #${result.table_id}`); a.href = result.links.bga; a.target = '_blank'; a.rel = 'noopener';
    const b = el('a', null, 'open its replay'); b.href = result.links.replay; b.target = '_blank'; b.rel = 'noopener';
    p.append(a, ' on Board Game Arena (', b, '). A new puzzle comes at 00:00 UTC.');
    root.append(p);
    const note = loginNote();
    if (note) root.append(note);
    const boards = el('div', 'pz-board');
    root.append(boards);
    for (const [period, title] of [['month', 'This month'], ['all', 'All time']]) board(boards, period, title);
  }

  async function board(into, period, title) {
    const box = el('div'); box.append(el('h3', null, 'Leaderboard: ' + title)); into.append(box);
    try {
      const b = await api(`/${KEY}/leaderboard?period=${period}`);
      if (!b.rows.length) { box.append(el('p', 'muted', 'Nobody is listed yet. Log in and play to appear here.')); return; }
      const t = el('table'); t.innerHTML = '<tr><th>#</th><th>Player</th><th>Plays</th><th>Points</th></tr>';
      for (const r of b.rows.slice(0, 10)) {
        const tr = el('tr'); for (const v of [r.rank, r.name, r.plays, r.value]) tr.append(el('td', null, String(v))); t.append(tr);
      }
      box.append(t);
    } catch (e) { box.append(el('p', 'muted', 'The leaderboard could not be loaded.')); }
  }

  document.addEventListener('account-changed', () => { if (!result) draw(); });
  draw();
}

start();
