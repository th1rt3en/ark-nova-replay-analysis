// Public action-card identities remain stable across reorders, upgrades and attached-token changes.
const TOKENS = new Set(['Venom', 'Constriction', 'Multiplier']);
export function actionChanges(before, after) {
  if (before.actions_hidden || after.actions_hidden) return [];
  return (after.players || []).flatMap((p, seat) => {
    const old = before.players[seat]?.action_cards || [], next = p.action_cards || [];
    return next.flatMap((card, slot) => {
      if (!card?.type) return [];
      const from = old.findIndex((a) => a?.type === card.type);
      if (from < 0) return [];
      const a = old[from], available = (a.tokens || []).map((type, index) => ({ type, index }));
      const added = [], kept = [];
      (card.tokens || []).forEach((type, index) => {
        if (!TOKENS.has(type)) return;
        const at = available.findIndex((t) => t.type === type);
        if (at < 0) added.push({ type, index });
        else { const [t] = available.splice(at, 1); kept.push({ type, from: t.index, to: index }); }
      });
      const removed = available.filter((t) => TOKENS.has(t.type));
      const upgraded = a.level === 1 && card.level === 2;
      if (from === slot && !upgraded && !added.length && !removed.length) return [];
      return [{ seat, type: card.type, from, to: slot, upgraded, added, removed, kept }];
    });
  });
}
