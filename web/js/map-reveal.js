// [module] The live game's reveal of the chosen maps. The step of the second map pick says "X confirms their map pick", then one line per player ("A will play on map 5a",
// "B will play on map 6a"). The replay has one step per player for these lines (replay/view.py), so the live page splits the step the same way: the lines before the maps
// are one step, then one step per player in seat order; only the last one keeps the legal actions and the options (the others are passed through, like `expandLagoonDeal`).
const MAP_LINE = / will play on map /;

// The texts of the steps a label is split into, or null when it does not name two maps.
export function mapRevealLabels(label) {
  const lines = String(label || '').split('\n'), maps = lines.filter((l) => MAP_LINE.test(l));
  if (maps.length < 2) return null;
  const head = lines.filter((l) => !MAP_LINE.test(l)).join('\n');
  return [...(head ? [head] : []), ...maps];
}

// `steps` of the page: every step whose label names two maps becomes one step per text.
export function expandMapReveal(steps) {
  const quiet = { actions: [], options: null, engine_state: undefined, fork: false, irreversible: false };
  return steps.flatMap((step) => {
    const parts = mapRevealLabels(step.label);
    if (!parts) return [step];
    return parts.map((label, i) => ({ ...step, ...(i === parts.length - 1 ? {} : quiet), label, label_pov: null }));
  });
}
