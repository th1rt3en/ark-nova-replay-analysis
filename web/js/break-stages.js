// [module] The break of a replay, step by step, and gained workers at their own line. The engine's state already holds the break (workers home, supply refilled) from the step that triggers it ("advances break token ... reach the last space" mid-turn) or from the first break line; the log says it in later lines ("All workers go back to each player's reserve", "Replenishing partner zoos and universities"). The viewer moves those changes to their lines: the steps before keep the workers on the association board and the supply as it was.
// Display only, in every mode: applied when a replay is loaded (`main.js`) and again after a fork / sandbox move (`commitSteps` in `fork.js`) and a live step (`pushLive` in `play.js`).
const ASSOC_SUPPLY = /^association_[34]$/;
const workersSig = (st) => st.players.map((p) => p.tokens.filter((t) => t.type === 'worker').map((t) => t.location).sort().join(',')).join('|');
const supplySig = (st) => (st.board_tokens || []).filter((t) => ASSOC_SUPPLY.test(t.location)).map((t) => t.type + '@' + t.location).sort().join(',');
// The engine's state changes at the step that triggers the break (a break token that reaches the end of the track mid-turn) or at the first break line; the lines come later. For each
// line the state is held back: the steps from the engine's change up to the line show the state before it.
export function stageBreaks(replay) {
  const steps = (replay && replay.steps) || [];
  steps.forEach((line, j) => {
    const l = line.label || '';
    const workers = /^All workers go back/.test(l), supply = /^Replenishing partner zoos/.test(l);
    if ((!workers && !supply) || !line.state) return;
    const sig = workers ? workersSig : supplySig;
    const now = sig(line.state);
    let c = j;
    while (c > 0 && j - c < 16 && steps[c - 1].state && sig(steps[c - 1].state) === now) c--;
    const base = steps[c - 1] && steps[c - 1].state;
    if (c === j || !base) return;
    for (let k = c; k < j; k++) {
      const st = steps[k].state;
      if (!st) continue;
      steps[k].state = workers
        ? { ...st, players: st.players.map((p, i) => (base.players[i] ? { ...p, tokens: [...p.tokens.filter((t) => t.type !== 'worker'), ...base.players[i].tokens.filter((t) => t.type === 'worker')] } : p)) }
        : { ...st, board_tokens: [...(st.board_tokens || []).filter((t) => !ASSOC_SUPPLY.test(t.location)), ...(base.board_tokens || []).filter((t) => ASSOC_SUPPLY.test(t.location))] };
    }
  });
  stageWorkerGains(replay);
  return replay;
}
// A worker that is gained ("<name> gains a new Association worker ...") is in the engine's state from the step of the action that earned it (the animal that is played, the reputation
// it reaches). The steps from there up to the line that says it keep the worker locked, so it is gained at its own line.
const owned = (p) => p.tokens.filter((t) => t.type === 'worker' && !/^supply_/.test(t.location)).length;
function stageWorkerGains(replay) {
  const steps = replay.steps || [], names = (replay.players || []).map((p) => p.name);
  steps.forEach((s, j) => {
    const seat = names.findIndex((n) => n && String(s.label || '').startsWith(n + ' gains a new Association worker'));
    if (seat < 0 || !s.state || !s.state.players[seat]) return;
    const n = owned(s.state.players[seat]);
    let c = j;
    while (c > 0 && j - c < 10 && steps[c - 1].state && steps[c - 1].state.players[seat] && owned(steps[c - 1].state.players[seat]) === n && (!Number.isFinite(steps[j].move_id) || steps[c - 1].move_id >= steps[j].move_id - 3)) c--;
    const before = steps[c - 1] && steps[c - 1].state && steps[c - 1].state.players[seat];
    if (c === j || !before || owned(before) !== n - 1) return;
    const keep = before.tokens.filter((t) => t.type === 'worker');
    for (let k = c; k < j; k++) {
      const st = steps[k].state;
      if (!st || owned(st.players[seat]) !== n) continue;
      steps[k].state = { ...st, players: st.players.map((p, i) => (i === seat ? { ...p, tokens: [...p.tokens.filter((t) => t.type !== 'worker'), ...keep] } : p)) };
    }
  });
}
