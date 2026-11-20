// [module] Pure classification of the association-side movements between two states (no DOM): what moves where, and who has to glide.
// Used by assoc-motion.js (the flights): the cylinders of the reputation / conservation tracks, the partner zoos and universities, the workers, the cubes of projects and donations.
// Token ids are not stable between steps (placeholders 9000+ until BGA's ids are seen), so a token is told by type and place; equal tokens are counted.
const idOf = (t) => t.type + '|' + t.location;
// The items of `now` that are not in `was` (a multiset difference by `key`).
function added(was, now, key = idOf) {
  const left = new Map();
  for (const t of was) left.set(key(t), (left.get(key(t)) || 0) + 1);
  return now.filter((t) => { const k = key(t), n = left.get(k) || 0; if (n > 0) { left.set(k, n - 1); return false; } return true; });
}

// A player's cylinder on the tracks that moved: [{ seat, track: 'rep' | 'cons', from, to }]. The conservation track shows the first 10 points only.
export function trackMoves(before, after) {
  const out = [];
  after.players.forEach((b, seat) => {
    const a = before.players[seat];
    if (!a) return;
    if (a.reputation !== b.reputation) out.push({ seat, track: 'rep', from: a.reputation, to: b.reputation });
    if (a.conservation !== b.conservation && Math.min(a.conservation, b.conservation) <= 10) out.push({ seat, track: 'cons', from: a.conservation, to: b.conservation });
  });
  return out;
}

// Partner zoos / universities that a player took (they leave the supply of the association board for a slot of the player's strip): [{ seat, kind, slot, type }].
export function taken(before, after) {
  const out = [];
  after.players.forEach((b, seat) => {
    const a = before.players[seat];
    if (!a) return;
    for (const t of added(a.tokens, b.tokens)) {
      const m = /^(partner|university)_(\d)$/.exec(t.location);
      if (m) out.push({ seat, kind: m[1], slot: Number(m[2]), type: t.type });
    }
  });
  return out;
}

// The supply of the association board (partner zoos at `association_3`, universities at `association_4`): tiles that are new there (the break refills it), and tiles that left it.
export function supplyChanges(before, after) {
  const was = before.board_tokens || [], now = after.board_tokens || [];
  return {
    refilled: added(was, now).filter((t) => /^association_[34]$/.test(t.location)),
    left: added(now, was).filter((t) => /^association_[34]$/.test(t.location)),
  };
}

// The workers that moved between the reserve (the icon in the player's info box), the supply (locked: gained from the invisible deck) and a task slot of the association board.
// kind: 'spend' (reserve -> slot), 'return' (slot -> reserve: the break, Extra Shift), 'gain' (supply -> reserve, or new). task = the association task (2..5) of the slot.
export function workerMoves(before, after) {
  const out = [];
  after.players.forEach((b, seat) => {
    const a = before.players[seat];
    if (!a) return;
    const wa = a.tokens.filter((t) => t.type === 'worker'), wb = b.tokens.filter((t) => t.type === 'worker');
    const gone = added(wb, wa).map((t) => t.location), came = added(wa, wb).map((t) => t.location);      // (the places that lost / gained a worker)
    const take = (re) => { const i = gone.findIndex((l) => re.test(l)); return i < 0 ? null : gone.splice(i, 1)[0]; };
    for (const to of came.filter((l) => l === 'reserve')) {
      const slot = take(/^association_\d$/);
      if (slot) { out.push({ seat, kind: 'return', task: Number(slot.slice(12)) }); continue; }
      take(/^supply_\d$/);
      out.push({ seat, kind: 'gain' });
    }
    for (const to of came.filter((l) => /^association_\d$/.test(l))) {
      const from = take(/^reserve$/);
      if (from) { out.push({ seat, kind: 'spend', task: Number(to.slice(12)) }); continue; }
      take(/^supply_\d$/);
      out.push({ seat, kind: 'gain-spend', task: Number(to.slice(12)) });
    }
  });
  return out;
}

// Cubes that appeared: a player's support of a project ({ kind: 'project', key, slot, bonus }: `bonus` = the bonus space whose cube left the player's bonus panel in the same step, or -1)
// and a donation ({ kind: 'donation', k }).
export function newCubes(before, after) {
  const out = [];
  after.players.forEach((b, seat) => {
    const a = before.players[seat];
    if (!a) return;
    const bits = ((b.flags || {}).bonus_used || 0) & ~((a.flags || {}).bonus_used || 0);
    const gone = []; for (let i = 0; i < 16; i++) if (bits & (1 << i)) gone.push(i);
    for (const t of added(a.tokens, b.tokens)) {
      let m;
      if ((m = /^(P\d+)_.*?_?(\d)$/.exec(t.location))) out.push({ seat, kind: 'project', key: m[1], slot: Number(m[2]), bonus: gone.length ? gone.shift() : -1 });
      else if ((m = /^association_0_(\d)$/.exec(t.location))) out.push({ seat, kind: 'donation', k: Number(m[1]) });
    }
  });
  return out;
}

// The bonus tokens of a player's info box (one-time effects: side-panel.js `BONUS_TOKENS`) that came or went: [{ seat, type, kind: 'gain' | 'use', from }]. A gained token's `from` is where
// its tile lay: '5' / '8' (the random bonuses of the conservation track) or '99' (Marine Worlds: the bonus of 16 reputation), when such a tile with that bonus was taken in the step; else null.
// Several tokens of one tile (Ignore conditions: 3) all come from it.
export const BONUS_TOKEN_TYPES = ['bonus-icon', 'bonus-sponsor-gray', 'bonus-ignore-conditions', 'bonus-extra-shift'];
export function bonusTokenMoves(before, after) {
  const out = [], opts = (st, th) => ((st.conservation_options || {})[th] || []);
  const tileTaken = {};                                                    // bonus name -> the threshold whose tile left the board in this step
  for (const th of ['5', '8', '99']) for (const o of added(opts(after, th), opts(before, th), (x) => JSON.stringify(x))) tileTaken[Object.keys(o)[0]] = th;
  after.players.forEach((b, seat) => {
    const a = before.players[seat];
    if (!a) return;
    const mine = (p) => (p.tokens || []).filter((t) => BONUS_TOKEN_TYPES.includes(t.type)), byType = (t) => t.type;
    for (const t of added(mine(a), mine(b), byType)) out.push({ seat, type: t.type, kind: 'gain', from: tileTaken[t.type] || null });
    for (const t of added(mine(b), mine(a), byType)) out.push({ seat, type: t.type, kind: 'use', from: null });
  });
  return out;
}
