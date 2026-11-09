// [module] The map options of a new game (the same rule as engine/map_select.py): the maps 1-8 are always in; Map Pack 1 (9, 10), Map Pack 2 (11-14, T1) and the alternative maps 1a-8a
// (next to 1-8, or in their place) are added by the player. `mapOptionControls()` builds the controls (the tiles of the lobby pages); `value()` is what the API takes as `map_options`.
export const ALT_LABELS = { off: 'Maps 1–8 only', replace: 'Maps 1a–8a only', include: 'Both 1–8 and 1a–8a' };

export function mapOptionControls(name = 'mapAlt') {
  const tile = (title, text) => {
    const label = document.createElement('label'); label.className = 'lobbycheck';
    const input = document.createElement('input'); input.type = 'checkbox';
    const span = document.createElement('span'), b = document.createElement('b'), small = document.createElement('small');
    b.textContent = title; small.textContent = text; span.append(b, document.createElement('br'), small);
    label.append(input, span);
    return { label, input };
  };
  const p1 = tile('Include Map Pack 1', 'Maps 9 and 10 (map 10 needs Marine Worlds).');
  const p2 = tile('Include Map Pack 2', 'Maps 11 to 14 and T1 (maps 11 to 14 need Marine Worlds).');
  const alt = document.createElement('div'); alt.className = 'mapalt';
  const head = document.createElement('span'); head.textContent = 'Alternative maps (1a–8a)';
  const kind = document.createElement('div'); kind.className = 'kind';
  for (const [value, text] of Object.entries(ALT_LABELS)) {
    const l = document.createElement('label'); const r = document.createElement('input');
    r.type = 'radio'; r.name = name; r.value = value; r.checked = value === 'off';
    l.append(r, ' ' + text); kind.append(l);
  }
  alt.append(head, kind);
  return {
    nodes: [alt, p1.label, p2.label],
    value: () => ({ pack1: p1.input.checked, pack2: p2.input.checked, alt: (alt.querySelector('input:checked') || {}).value || 'off' }),
  };
}

// the names of the options of a lobby / a game, for its tags
export function mapOptionTags(o) {
  o = o || [];
  return [...(o.pack1 ? ['Map Pack 1'] : []), ...(o.pack2 ? ['Map Pack 2'] : []), ...(o.alt === 'include' ? ['Alternative maps'] : o.alt === 'replace' ? ['Maps 1a–8a'] : [])];
}
