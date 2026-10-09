// The end of a live game: the score cards, the sources of the points and the comparison of the two players.
// `EndStats.render(box, { names, scores, winner, conceded, status, stats })` fills `box`; `stats` = [one dict per player] of the engine (engine/gamestats.py).
// Used by the end page (end.html) and by the play page, where it replaces the player boards when the game ends (play.js).
(function () {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const SOURCES = [['animals', 'Animals'], ['sponsors', 'Sponsors'], ['projects', 'Projects'], ['others', 'Others']];
  const ACTIONS = [['build', 'Build'], ['animals', 'Animals'], ['association', 'Association'], ['sponsors', 'Sponsors'], ['cards', 'Cards']];
  const color = (i) => (i === 0 ? 'var(--p0)' : 'var(--p1)');

  function scoreCards(box, d) {
    const { names, scores, winner, conceded, status, reason } = d;
    const abandoned = status === 'abandoned';
    const tie = !abandoned && (winner === null || winner === undefined) && scores.length === 2 && scores[0] === scores[1];
    const win = winner === 0 || winner === 1 ? winner : null;
    const head = el('div', 'esresult');
    head.append(el('h2', 'eshead', abandoned ? 'Game abandoned' : tie ? "It's a tie" : win === null ? 'Game over' : names[win] + ' wins'));
    head.append(el('div', 'esnote', abandoned ? 'Both players agreed to abandon the game: there is no winner.'
      : reason === 'overtime' && (conceded === 0 || conceded === 1) ? 'Won on overtime: ' + names[conceded] + "'s clock ran out · the scores are those of the position"
      : (conceded === 0 || conceded === 1) ? names[conceded] + ' conceded · the scores are those of the position when they gave up' : 'The game ended normally'));
    box.append(head);
    const board = el('div', 'esboard');
    for (const i of [0, 1]) {
      const c = el('div', 'esside' + (win === i ? ' winner' : tie ? ' tie' : ''));
      c.style.setProperty('--c', color(i));
      c.append(el('div', 'estag', win === i ? '\u{1F451} Winner' : tie ? 'Tie' : conceded === i ? (reason === 'overtime' ? 'Out of time' : 'Conceded') : ''), el('div', 'esname', names[i]),
               el('div', 'esscore', scores[i] === undefined ? '–' : String(scores[i])));
      board.append(c);
    }
    box.append(board);
  }

  function chart(box, d) {
    const P = d.stats;
    const vals = SOURCES.flatMap(([k]) => P.map((p) => p.points[k] || 0));
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = (hi - lo) || 1;
    const zero = (-lo / span) * 100;
    box.append(el('h3', 'esh3', 'Where the points came from'));
    const legend = el('div', 'eslegend');
    for (const i of [0, 1]) { const l = el('span'); const sw = el('i'); sw.style.background = color(i); l.append(sw, d.names[i]); legend.append(l); }
    box.append(legend);
    const grid = el('div', 'eschart');
    for (const [k, label] of SOURCES) {
      grid.append(el('div', 'eslab', label));
      const bars = el('div', 'esbars');
      const z = el('div', 'eszero'); z.style.left = zero + '%'; bars.append(z);
      for (const i of [0, 1]) {
        const v = P[i].points[k] || 0;
        const b = el('div', 'esbar'); b.style.setProperty('--c', color(i));
        const w = (Math.abs(v) / span) * 100;
        const fill = el('span', 'esfill'); fill.style.left = (v >= 0 ? zero : zero - w) + '%'; fill.style.width = w + '%';
        const t = el('span', 'esval', (v > 0 ? '+' : '') + v);
        if (v >= 0) t.style.left = (zero + w) + '%'; else { t.style.left = (zero - w) + '%'; t.style.transform = 'translateX(-100%)'; }
        b.append(fill, t); bars.append(b);
      }
      grid.append(bars);
    }
    box.append(grid);
  }

  function table(box, d) {
    const P = d.stats;
    box.append(el('h3', 'esh3', 'The two players compared'));
    const t = el('table', 'escmp');
    const head = el('thead'), hr = el('tr');
    hr.append(el('th'), ...[0, 1].map((i) => { const h = el('th', '', d.names[i]); h.style.color = color(i); return h; }));
    head.append(hr); t.append(head);
    const body = el('tbody');
    const group = (title) => { const r = el('tr', 'esgroup'); const c = el('td', '', title); c.colSpan = 3; r.append(c); body.append(r); };
    const row = (label, a, b) => { const r = el('tr'); r.append(el('td', '', label), el('td', a > b ? 'lead' : '', String(a)), el('td', b > a ? 'lead' : '', String(b))); body.append(r); };
    const both = (label, f) => row(label, f(P[0]), f(P[1]));
    group('Turns');
    both('Turns taken', (p) => p.turns);
    group('Actions taken');
    for (const [k, l] of ACTIONS) both(l, (p) => p.actions[k]);
    both('Passes for an X token', (p) => p.passes);
    group('Money');
    both('Total gained (not the 25 at the start)', (p) => p.money_gained);
    both('Total spent', (p) => p.money_spent);
    group('Association');
    both('Association actions spent on 2 reputation', (p) => p.assoc.reputation);
    both('Partner zoos taken', (p) => p.assoc.partner);
    both('Universities taken', (p) => p.assoc.university);
    both('Projects supported', (p) => p.assoc.conservation);
    group('Animals and sponsors');
    both('Animals played', (p) => p.animals_played);
    both('Animals released', (p) => p.animals_released);
    both('Sponsors played', (p) => p.sponsors_played);
    group('Breaks and X tokens');
    both('Breaks triggered', (p) => p.breaks);
    both('X tokens gained', (p) => p.x_gained);
    both('X tokens used', (p) => p.x_used);
    const icons = P.map((p) => p.icons || {});
    const names = [...new Set([...Object.keys(icons[0] || {}), ...Object.keys(icons[1] || {})])].sort();
    if (names.length) {
      group('Final icon counts');
      for (const n of names) row(n.replace(/([a-z])([A-Z])/g, '$1 $2'), icons[0][n] || 0, icons[1][n] || 0);
    }
    t.append(body);
    box.append(t);
    box.append(el('p', 'esnote small', 'Moves that were taken back are not counted. Points are counted where they were scored: while an Animals, Sponsors or Association (= projects) action ran, ' +
      'the final scoring of the sponsors under Sponsors; the rest (Build, Cards, the income of the breaks, the start of the game at -14, the endgame cards) under Others.'));
  }

  window.EndStats = {
    render(box, d) {
      box.replaceChildren();
      scoreCards(box, d);
      if (d.stats && d.stats.length === 2) { chart(box, d); table(box, d); }
    },
  };
})();
