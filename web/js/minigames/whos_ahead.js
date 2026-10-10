// Who's ahead (minigames/whos_ahead.html): the viewer shows a position with everything of both players visible (MINIGAME_MODE, no point of view), this panel takes the chances
// of the three outcomes, scores them (Brier), and shows the real result. Past days are played from the calendar (?day=YYYY-MM-DD). Nothing here knows another mini game.
import { api, mountCalendar, renderBoards } from './shell.js';

const KEY = 'whos_ahead';
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const $ = (id) => document.getElementById(id);
const day = new URLSearchParams(location.search).get('day');

async function start() {
  let puzzle;
  try { puzzle = await api(day ? `/${KEY}/puzzle/${encodeURIComponent(day)}` : `/${KEY}/today`); } catch (e) {
    const m = $('loading'); m.className = 'status error'; m.textContent = 'This puzzle could not be loaded: ' + e.message;
    return;
  }
  window.MINIGAME_REPLAY = puzzle.public.replay;
  window.MINIGAME_POV = puzzle.public.pov;                                // null: both players' cards are visible
  await import('/js/main.js');
  for (let i = 0; i < 200 && $('app').hidden; i++) await new Promise((r) => setTimeout(r, 50));
  mount(puzzle);
}

function mount(puzzle) {
  const root = $('puzzle');
  const pub = puzzle.public;
  const names = pub.replay.players.map((p) => p.name);
  let result = puzzle.result;
  let askedLogin = false;

  function accountsOn() { return !!window.arkAccountsEnabled; }

  function draw() {
    root.replaceChildren();
    root.append(el('h1', null, "Who's ahead"), el('p', 'muted', `Puzzle of ${puzzle.day} (UTC). Both players' names are hidden; their Elo before this game is shown. The draw and discard piles are not shown.`));
    root.append(el('p', null, `Everything about both players is visible: the position is the start of ${names[pub.to_act] || 'a player'}'s turn. How likely is each player to win this game? Enter a chance for each (the tie is optional); they must add up to 100.`));
    const box = el('details'); box.append(el('summary', null, 'Calendar: play a past puzzle')); const cal = el('div'); box.append(cal); root.append(box);
    mountCalendar(cal, KEY, puzzle.day, (d) => { location.search = '?day=' + d; });
    if (result) { drawResult(); return; }
    const inputs = {};
    const form = el('div', 'pz-form');
    for (const [k, label] of [['p1', `${names[0]} wins (%)`], ['p2', `${names[1]} wins (%)`], ['tie', 'Tie (%, optional)']]) {
      const l = el('label', null, label); const i = el('input'); i.type = 'number'; i.min = 0; i.max = 100; i.step = 1; i.inputMode = 'numeric'; i.placeholder = k === 'tie' ? '0' : '';
      i.oninput = update; l.append(i); form.append(l); inputs[k] = i;
    }
    const total = el('span', 'pz-total'); form.append(total);
    root.append(form);
    const actions = el('div', 'pz-actions'); const go = el('button', null, 'Submit'); actions.append(go);
    const err = el('p'); err.style.color = '#a12f2f';
    const prompt = el('div', 'pz-prompt'); prompt.hidden = true;
    root.append(actions, prompt, err);
    const values = () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim() === '' ? (k === 'tie' ? 0 : NaN) : Number(i.value)]));
    function update() {
      const v = values(); const sum = [v.p1, v.p2, v.tie].reduce((a, b) => a + b, 0);
      const ok = [v.p1, v.p2, v.tie].every((x) => Number.isInteger(x) && x >= 0 && x <= 100) && sum === 100;
      total.textContent = Number.isNaN(sum) ? 'Enter both chances' : sum === 100 ? 'Total: 100' : `Total: ${sum} (${sum < 100 ? 100 - sum + ' left' : sum - 100 + ' over'})`;
      total.className = 'pz-total ' + (ok ? 'ok' : 'bad'); go.disabled = !ok; err.textContent = '';
    }
    async function send() {
      go.disabled = true; prompt.hidden = true;
      try { result = await api(`/${KEY}/submit`, { day: puzzle.day, payload: values() }); draw(); }
      catch (e) {
        if (e.code === 'already_played') { const again = await api(`/${KEY}/puzzle/${puzzle.day}`); result = again.result; draw(); return; }
        err.textContent = e.message; go.disabled = false;
      }
    }
    go.onclick = () => {
      if (accountsOn() && !window.arkAccount && !askedLogin) {              // not logged in: offer the login, or an anonymous submission
        askedLogin = true; prompt.hidden = false; prompt.replaceChildren(el('p', null, 'Log in or create an account to save this result and be ranked on the leaderboards, or submit it anonymously.'));
        const row = el('div', 'pz-actions'); const login = el('button', null, 'Log in / Sign up'); const anon = el('button', 'alt', 'Submit anonymously');
        login.onclick = () => document.querySelector('#acctbar button')?.click();
        anon.onclick = send; row.append(login, anon); prompt.append(row);
        return;
      }
      send();
    };
    document.addEventListener('account-changed', () => { if (window.arkAccount) { prompt.hidden = true; askedLogin = true; } }, { once: false });
    update();
  }

  function drawResult() {
    const r = result;
    const who = r.winner === null ? 'The game ended in a tie' : `${names[r.winner]} won`;
    root.append(el('p', 'pz-result', `${who}, ${r.scores[0]} to ${r.scores[1]}.`));
    const o = r.picks;
    root.append(el('p', null, `Your chances: ${names[0]} ${o.p1}%, ${names[1]} ${o.p2}%, tie ${o.tie}%. Your Brier score: ${r.score.toFixed(3)} (0 is perfect, 0.5 is a 50/50 guess without a tie, lower is better).`));
    const s = r.stats;
    root.append(el('p', 'muted', `${s.players} player${s.players === 1 ? '' : 's'} played this puzzle. Their average chances: ${names[0]} ${s.mean_p1}%, ${names[1]} ${s.mean_p2}%, tie ${s.mean_tie}%.`));
    const p = el('p'); p.append('This was ');
    const a = el('a', null, `table #${r.table_id}`); a.href = r.links.bga; a.target = '_blank'; a.rel = 'noopener';
    const b = el('a', null, 'open its replay'); b.href = r.links.replay; b.target = '_blank'; b.rel = 'noopener';
    p.append(a, ' on Board Game Arena (', b, '). Pick another day from the calendar, or come back at 00:00 UTC for a new puzzle.');
    root.append(p);
    if (accountsOn() && !window.arkAccount) root.append(el('p', 'pz-login', 'Log in or create an account to save your results and compete on the leaderboards.'));
    const boards = el('div', 'pz-board'); root.append(boards);
    renderBoards(boards, KEY, 'Mean Brier', true);          // (fresh: the player's own score must be in it)
  }

  document.addEventListener('account-changed', () => { if (result) draw(); });
  draw();
}

start();
