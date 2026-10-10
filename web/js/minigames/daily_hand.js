// Daily starting hand (minigames/daily_hand.html): the viewer shows one redacted position (MINIGAME_MODE), this panel lets the player pick the cards to keep, then
// shows what the original player kept, the pick rates of the day, the table and the leaderboards. Nothing here knows another mini game.
import { api, renderBoards } from './shell.js';

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
  await mount(puzzle);
}

async function mount(puzzle) {
  const { cardName } = await import('/js/cards.js');
  const { quietly } = await import('/js/cards.js');
  const { renderDock } = await import('/js/dock.js');
  const { curState } = await import('/js/pov.js');
  const { S } = await import('/js/state.js');
  const root = $('puzzle');
  const pub = puzzle.public;
  const picked = new Set();
  let result = puzzle.result;
  const seatLabel = pub.replay.players[pub.pov].name;
  const redock = () => quietly(() => renderDock(curState()));

  // The cards are the ones of the player's hand in the dock at the bottom of the screen (the viewer's own hand view): dock.js asks this hook to decorate that row.
  S.minigame = {
    decorate(row, where) {
      if (where !== `${pub.pov}:hand`) return;
      for (const node of row.querySelectorAll('.card[data-key]')) {
        const key = node.dataset.key;
        node.classList.add('pz-dock-card');
        if (result) {
          const orig = result.original.includes(key), mine = result.picks.includes(key), rate = (result.stats.pick_rates || {})[key] || 0;
          node.classList.toggle('pz-orig', orig); node.classList.toggle('pz-mine', mine);
          const tag = el('div', 'pz-dtag');
          tag.append(el('b', null, orig ? (mine ? 'Kept by both' : 'Original kept') : mine ? 'Your pick' : ''), el('span', null, Math.round(rate * 100) + '% of players'));
          const bar = el('i', 'pz-dbar'); const fill = el('u'); fill.style.width = Math.round(rate * 100) + '%'; bar.append(fill); tag.append(bar);
          node.append(tag);
        } else {
          node.classList.toggle('pz-mine', picked.has(key));
          node.onclick = () => { if (picked.has(key)) picked.delete(key); else if (picked.size < pub.keep) picked.add(key); draw(); redock(); };
        }
      }
    },
  };
  S.dockSel = { seat: pub.pov, kind: 'hand' };                         // the hand is open from the start
  S.dockHidden = false;

  function loginNote() {
    if (!window.arkAccountsEnabled || window.arkAccount) return null;
    return el('p', 'pz-login', 'You can create an account to save your results and compete in a monthly leaderboard, or submit your prediction anonymously.');
  }

  function draw() {
    root.replaceChildren();
    root.append(el('h1', null, 'Daily starting hand'), el('p', 'muted', `${puzzle.day} (UTC). Both players' names are hidden; their Elo before this game is shown.`));
    root.append(el('p', null, `You are ${seatLabel}, looking at your dealt hand before the initial selection. Click the ${pub.keep} cards you would keep in your hand at the bottom of the screen. You score 1 point for every card the original player kept too.`));
    if (result) { drawResult(); return; }
    const note = loginNote();
    if (note) root.append(note);
    const actions = el('div', 'pz-actions');
    const go = el('button', null, 'Confirm'); go.disabled = picked.size !== pub.keep;
    const list = [...picked].map((k) => cardName(k));
    actions.append(go, el('span', 'muted', `${picked.size} / ${pub.keep} cards picked${list.length ? ': ' + list.join(', ') : ''}`));
    const err = el('p', 'muted'); err.style.color = '#a12f2f';
    go.onclick = async () => {
      go.disabled = true; err.textContent = '';
      try { result = await api(`/${KEY}/submit`, { day: puzzle.day, payload: { picks: [...picked] } }); draw(); redock(); }
      catch (e) {
        if (e.code === 'already_played') { const again = await api(`/${KEY}/today`); result = again.result; draw(); redock(); return; }
        err.textContent = e.message; go.disabled = false;
      }
    };
    root.append(actions, err);
  }

  function drawResult() {
    root.append(el('p', 'pz-result', `You scored ${result.score} out of ${result.of}.`));
    const stats = result.stats;
    root.append(el('p', 'muted', `${stats.players} player${stats.players === 1 ? '' : 's'} played this puzzle today so far. In your hand at the bottom of the screen, green cards are what the original player kept, blue ones are your picks, and each card shows how many players kept it.`));
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
    renderBoards(boards, KEY, 'Points', true);          // (fresh: the player's own score must be in it)
  }

  document.addEventListener('account-changed', () => { draw(); });
  draw();
  redock();
}

start();
