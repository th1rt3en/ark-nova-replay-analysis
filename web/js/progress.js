// A progress circle with an estimate, for the waits that have no real progress to report (building a replay, verifying a log): the server answers in one piece, so the
// circle follows the time this wait took last time (kept in localStorage, per `key`) and stays under 100% until the answer is there.
//   const p = Progress.start(host, { key: 'replay', title: 'Loading the table and log', expected: 9000, stages: [[0, 'Looking up the table'], [0.15, 'Reading the log'], ...] });
//   p.stage('Preparing the board');  p.done();  p.fail();
window.Progress = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const R = 34, C = 2 * Math.PI * R;
  const stored = (key) => { try { return +localStorage.getItem('progress.' + key) || 0; } catch (e) { return 0; } };
  const save = (key, ms) => { try { const old = stored(key); localStorage.setItem('progress.' + key, String(Math.round(old ? (old + ms) / 2 : ms))); } catch (e) { /* no storage */ } };

  function start(host, opts) {
    const expected = Math.max(1500, stored(opts.key) || opts.expected || 6000);
    const t0 = performance.now();
    const box = document.createElement('div');
    box.className = 'progress';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 80 80');
    svg.setAttribute('class', 'progresscircle');
    svg.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(NS, 'circle'), arc = document.createElementNS(NS, 'circle'), pct = document.createElementNS(NS, 'text');
    for (const c of [track, arc]) { c.setAttribute('cx', 40); c.setAttribute('cy', 40); c.setAttribute('r', R); c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', 7); }
    track.setAttribute('class', 'ptrack');
    arc.setAttribute('class', 'parc');
    arc.setAttribute('stroke-linecap', 'round');
    arc.setAttribute('stroke-dasharray', String(C));
    arc.setAttribute('transform', 'rotate(-90 40 40)');
    pct.setAttribute('x', 40); pct.setAttribute('y', 46); pct.setAttribute('text-anchor', 'middle'); pct.setAttribute('class', 'ppct');
    svg.append(track, arc, pct);
    const text = document.createElement('div');
    text.className = 'progresstext';
    const title = document.createElement('div'), stageEl = document.createElement('div'), eta = document.createElement('div');
    title.className = 'ptitle'; stageEl.className = 'pstage'; eta.className = 'peta';
    title.textContent = opts.title || 'Loading';
    text.append(title, stageEl, eta);
    box.setAttribute('role', 'progressbar');
    box.setAttribute('aria-valuemin', '0'); box.setAttribute('aria-valuemax', '100');
    box.append(svg, text);
    host.replaceChildren(box);
    let value = 0, timer = null, finished = false, manual = null;

    const fraction = (f) => (f < 1 ? 0.9 * f : 0.9 + 0.09 * (1 - Math.exp(-(f - 1) * 1.5)));      // 90% at the expected time, then slowly towards 99%
    function paint(v) {
      value = v;
      const p = Math.round(v * 100);
      arc.setAttribute('stroke-dashoffset', String(C * (1 - v)));
      pct.textContent = p + '%';
      box.setAttribute('aria-valuenow', String(p));
    }
    function tick() {
      if (finished) return;
      const t = performance.now() - t0, f = t / expected;
      paint(Math.max(value, fraction(f)));
      const list = opts.stages || [];
      const current = manual || (list.filter((s) => s[0] <= Math.min(f, 0.999)).pop() || [0, ''])[1];
      stageEl.textContent = current;
      eta.textContent = f < 1 ? 'about ' + Math.max(1, Math.round((expected - t) / 1000)) + ' s left' : 'taking longer than usual…';
    }
    timer = setInterval(tick, 120);
    tick();
    return {
      stage(s) { manual = s; stageEl.textContent = s; },
      done() { if (finished) return; finished = true; clearInterval(timer); save(opts.key, performance.now() - t0); paint(1); eta.textContent = ''; },
      stop() { finished = true; clearInterval(timer); },
      fail() { finished = true; clearInterval(timer); },
    };
  }
  return { start };
})();
