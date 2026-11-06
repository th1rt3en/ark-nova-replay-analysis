// [module] Pure card movement classification. Only the visible player's state is supplied.
export const difference = (next, before) => {
  const left = [...before];
  return next.filter((key) => { const i = left.indexOf(key); if (i < 0) return true; left.splice(i, 1); return false; });
};
// Public played zones identify the card even when the player's hand is hidden.
export function playedCards(before, after) {
  return after.players.flatMap((b, seat) => {
    const a = before.players[seat];
    if (!a) return [];
    return ['animals', 'sponsors'].flatMap((kind) => difference(b[kind] || [], a[kind] || []).filter((key) => key && key !== '?').map((key) => ({
      seat, key, kind, source: (before.display || []).includes(key) && !(after.display || []).includes(key) ? 'display' : 'hand',
    })));
  });
}
// The played cards that left a player's zones (animals / sponsors) between two states: released, sent away by an expedition ...
export function playedRemoved(before, after) {
  return after.players.flatMap((b, seat) => {
    const a = before.players[seat];
    if (!a) return [];
    return ['animals', 'sponsors'].flatMap((kind) => difference(a[kind] || [], b[kind] || []).filter((key) => key && key !== '?').map((key) => ({ seat, key, kind })));
  });
}
// Buildings (enclosures, kiosks, pavilions, sponsor buildings) that appeared or disappeared between two states, per seat. A building is told by type and anchor hex: a turn
// (another rotation) or an animal moving in / out of it is not an arrival.
export function buildingChanges(before, after) {
  const ids = (p) => new Set(((p && p.buildings) || []).map((b) => b.type + '|' + b.x + '|' + b.y));
  const added = [], removed = [];
  (after.players || []).forEach((b, seat) => {
    const a = before.players && before.players[seat];
    if (!a) return;
    const was = ids(a), now = ids(b);
    for (const id of now) if (!was.has(id)) added.push({ seat, id });
    for (const id of was) if (!now.has(id)) removed.push({ seat, id });
  });
  return { added, removed };
}
// Standard enclosures (size-N) that stayed where they are but turned to the other side: an animal moved in (empty -> occupied) or was released (occupied -> empty). A new or
// cut down building (a size increase) is not a turn, it is a change of buildingChanges.
export function buildingFlips(before, after) {
  const std = /^size-\d$/, held = (b) => !!(b.animal || (b.animals && b.animals.length));
  const flips = [];
  (after.players || []).forEach((b, seat) => {
    const a = before.players && before.players[seat];
    if (!a) return;
    const was = new Map(((a.buildings) || []).filter((x) => std.test(x.type)).map((x) => [x.type + '|' + x.x + '|' + x.y, held(x)]));
    for (const x of (b.buildings || [])) {
      const id = x.type + '|' + x.x + '|' + x.y;
      if (std.test(x.type) && was.has(id) && was.get(id) !== held(x)) flips.push({ seat, id, occupied: held(x) });
    }
  });
  return flips;
}
// The display: cards that left it through a wave / a natural discard (they land in the discard pile, a take by a player does not) and cards that were put in (replenished).
export function displayChanges(before, after) {
  const was = (before.display || []).filter(Boolean), now = (after.display || []).filter(Boolean);
  const dumped = difference(after.main_discard || [], before.main_discard || []);
  return { leaving: difference(was, now).filter((k) => dumped.includes(k)), added: difference(now, was), taken: difference(was, now).filter((k) => !dumped.includes(k)) };
}
// The names of the cards a targeted draw of `name` found (the log names them; empty when only a count is given): "X draws A, B for ..." -> ['A', 'B'].
export function targetedNames(text, name = '') {
  const out = [];
  for (const line of String(text || '').split(/ · |\n/)) {
    const l = line.trim();
    if ((name && !l.startsWith(name + ' ')) || !/\bdraws\b/.test(l) || !TARGETED.some((re) => re.test(l))) continue;
    const m = /\bdraws (.+?)(?: for | with |: | from |$| \()/.exec(l);
    if (m && m[1] && !/^\d+ /.test(m[1]) && !/^</.test(m[1])) out.push(...m[1].split(/, /));
  }
  return out;
}
// Pilfering: one line "A gives B <card> from the Pilfering effect" (both hands change in the step), or, in older data, two lines per card: "X gives <card> from the Pilfering effect" (the giver's hand shrinks) and "Y gets <card> from the Pilfering effect" (the receiver's grows); the
// "X gives 1 card to Y from Pilfering effect" summary changes nothing and the money lines ("gives 5 money to Y for Pilfering effect") are not cards. Two players: the other seat is the partner.
export function parsePilfer(text, names = []) {
  const seats = {};                                                // "from>to" -> cards, the larger of what the giving and the getting lines say
  const add = (from, to, side) => { const k = from + '>' + to; (seats[k] ||= { from, to, give: 0, get: 0 })[side]++; };
  for (const line of String(text || '').split(/ · |\n/)) {
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), l = line.trim();
    const whole = names.length === 2 && names.findIndex((nm, k) => new RegExp('^' + esc(nm) + ' gives ' + esc(names[1 - k]) + ' .+ from the Pilfering effect$', 'i').test(l));
    if (whole >= 0 && names.length === 2) { add(whole, 1 - whole, 'give'); add(whole, 1 - whole, 'get'); continue; }       // "A gives B <card> from the Pilfering effect": one step for both hands
    const m = /^(.+?) (gives|gets) (.+?) from the Pilfering effect/i.exec(l);
    if (!m) continue;
    const seat = names.indexOf(m[1]);
    if (seat < 0 || names.length !== 2) continue;
    if (m[2].toLowerCase() === 'gives') add(seat, 1 - seat, 'give'); else add(1 - seat, seat, 'get');
  }
  return Object.values(seats).map((e) => ({ from: e.from, to: e.to, give: e.give, get: e.get }));   // (give: hand of `from` shrinks, get: hand of `to` grows)
}
// Targeted draws (the card is picked out of the deck, not drawn off the top): the University and the Monkey Gang effect, the species Management Plans, the sponsor from the deck by map 8 / 8a,
// the person sponsor for a worker on map 14 (not the one at the start of the game: "Map 14 effect") and the animal of Waza Special Assignment. The lines are the step's log lines.
const TARGETED = [/<SEARCH-[A-Z]+>/, /\bfor monkey gang effect/, /\bdraws (?:\d+ )?<(?:BIRD|HERBIVORE|PREDATOR|PRIMATE|REPTILE|SEAANIMAL)> card/, / with <(?:BIRD|HERBIVORE|PREDATOR|PRIMATE|REPTILE|SEAANIMAL)> \(/,
  /\((?:1st|2nd|last) worker bonus\)/, /\(Map 14 effect\)/, /\(Map 8 effect\)/, /\(Waza Special Assign\w+ effect\)/];
export function targetedCount(text, name = '') {
  let n = 0;
  for (const line of String(text || '').split(/ · |\n/)) {
    const l = line.trim();
    if ((name && !l.startsWith(name + ' ')) || !/\bdraws\b/.test(l) || !TARGETED.some((re) => re.test(l))) continue;
    const hidden = /\bdraws (\d+) /.exec(l), named = /\bdraws (.+?)(?: for | with |: | from |$| \()/.exec(l);
    n += hidden ? Number(hidden[1]) : named && named[1] && !/^</.test(named[1]) ? named[1].split(/, /).length : 1;
  }
  return n;
}
const elsewhere = (p, key) => [p.animals, p.sponsors, p.stored, p.pouched].some((list) => (list || []).includes(key));
export function movementPlan(before, after, seat, text = '', pilfer = []) {
  const a = before.players[seat], b = after.players[seat];
  if (!a || !b) return { arrivals: [], departures: [], projects: [] };
  const species = /<SEARCH-(BIRD|HERBIVORE|PREDATOR|PRIMATE|REPTILE|SEAANIMAL)>/i.exec(text)?.[1];
  const badges = { BIRD: 'Bird', HERBIVORE: 'Herbivore', PREDATOR: 'Predator', PRIMATE: 'Primate', REPTILE: 'Reptile', SEAANIMAL: 'SeaAnimal' };
  let got = pilfer.filter((p) => p.to === seat).reduce((n, p) => n + p.get, 0), gave = pilfer.filter((p) => p.from === seat).reduce((n, p) => n + p.give, 0);
  const giver = pilfer.find((p) => p.to === seat)?.from, taker = pilfer.find((p) => p.from === seat)?.to;
  let picked = Math.min(1, targetedCount(text) || (species ? 1 : 0));                          // (one card of a step gets the search animation)
  const arrivals = difference(b.hand, a.hand).filter((k) => k !== '?').map((key) => {
    if ((before.display || []).includes(key) && !(after.display || []).includes(key)) return { key, kind: 'display' };
    if (got > 0) { got--; return { key, kind: 'pilfer', from: giver }; }
    if (picked > 0) { picked = 0; return { key, kind: 'targeted', ...(species ? { species: badges[species] } : {}) }; }
    return { key, kind: 'deck' };
  });
  const discarded = difference(after.main_discard || [], before.main_discard || []);
  const departures = difference(a.hand, b.hand).filter((k) => k !== '?').flatMap((key) => {
    // Playing, storing, giving or stealing a card is not a discard.
    const source = Object.keys(b.under || {}).find((src) => difference(b.under[src], a.under?.[src] || []).includes(key));
    if (source || difference(b.pouched || [], a.pouched || []).includes(key)) return [{ key, kind: 'pouch', source }];
    if (!discarded.includes(key)) return gave > 0 && !elsewhere(b, key) ? (gave--, [{ key, kind: 'pilfer', to: taker }]) : [];
    return [{ key, kind: /\bglid(?:e|ing)\b/i.test(text) ? 'glide' : /\b(?:sunbath\w*|sell\w*|sold)\b|\bto (?:gain money|increase Sponsors action.s strength)\b/i.test(text) ? 'sun' : 'discard' }];
  });
  // A conservation project played from the hand or from the display (the cards that join `projects_in_play`)
  const live = (st) => (st.projects_in_play || []).filter(Boolean);
  const projects = difference(live(after), live(before)).flatMap((key) => (a.hand.includes(key) && !b.hand.includes(key) ? [{ key, source: 'hand' }] : (before.display || []).includes(key) && !(after.display || []).includes(key) ? [{ key, source: 'display' }] : []));
  return { arrivals, departures, projects };
}

// The other seat (the one whose hand is not shown): only counts are known, never cards. Draws from the deck and discards are shown as card backs, a take from the display as the real (public) card.
// "A, B" -> 2
const listCount = (t) => (/^\d+$/.test(String(t).trim()) ? Number(t) : String(t).split(/, | and /).filter(Boolean).length || 1);          // ("2" of the other player's hidden line "sells 2 cards", or a list of names)
// How many cards the player `name` sold (sunbathing, Sponsors level 3: money or +2 strength) and glided away, from the log lines of the step.
export function discardKinds(text, name) {
  let sun = 0, glide = 0;
  if (!name) return { sun, glide };
  for (const line of String(text || '').split(/ · |\n/)) {
    const l = line.trim();
    if (!l.startsWith(name + ' ')) continue;
    const rest = l.slice(name.length + 1);
    let m;
    if ((m = /^sells (.+?) cards?(?: for|$)/i.exec(rest))) sun += listCount(m[1]);
    else if ((m = /^discards (.+?) to (?:gain money|increase Sponsors action.s strength)/i.exec(rest))) sun += listCount(m[1]);
    else if (/glid(?:e|ing)/i.test(rest) && (m = /^discards? (.+?)(?: \(| for |$)/i.exec(rest))) glide += listCount(m[1]);
  }
  return { sun, glide };
}
// The other seat (the one whose hand is not shown): only counts are known, never cards. Draws from the deck, discards, sunbathing, gliding and pouching are shown as card backs, a take from the display as the real (public) card.
export function otherPlan(before, after, seat, pilfer = [], text = '', name = '', eg = null) {
  const o = 1 - seat, a = before.players[o], b = after.players[o];
  if (!a || !b) return { display: [], deck: 0, targeted: 0, discard: 0, sun: 0, glide: 0, pouch: 0, projects: [], egDeck: 0, egDiscard: 0 };
  const got = pilfer.filter((p) => p.to === o).reduce((n, p) => n + p.get, 0), gave = pilfer.filter((p) => p.from === o).reduce((n, p) => n + p.give, 0);
  const net = b.hand.length - a.hand.length - got + gave;                 // what is left once the pilfered cards are explained
  // a conservation project played: from the display (public card) or, when the hand shrank, from the hidden hand
  const live = (st) => (st.projects_in_play || []).filter(Boolean);
  const fresh = difference(live(after), live(before));
  let spare = Math.max(0, a.hand.length - b.hand.length + got - gave);
  const projects = fresh.flatMap((key) => (before.display || []).includes(key) && !(after.display || []).includes(key) ? [{ key, source: 'display' }] : spare > 0 ? (spare--, [{ key, source: 'hand' }]) : []);
  const newlyPlayed = new Set([...fresh, ...difference(b.animals || [], a.animals || []), ...difference(b.sponsors || [], a.sponsors || [])]);
  const display = net > 0 ? difference((before.display || []).filter(Boolean), (after.display || []).filter(Boolean)).filter((k) => !newlyPlayed.has(k)).slice(0, net) : [];
  const played = playedCards(before, after).filter((p) => p.seat === o && p.source === 'hand').length;
  const out = Math.max(0, (net < 0 ? -net : 0) - projects.filter((q) => q.source === 'hand').length - played);
  const under = (p) => Object.values(p.under || {}).flat();
  const pouch = Math.min(out, difference(under(b), under(a)).length + difference(b.pouched || [], a.pouched || []).length);
  const discarded = difference(after.main_discard || [], before.main_discard || []).length;
  const k = discardKinds(text, name), sun = Math.min(k.sun, out - pouch, discarded), glide = Math.min(k.glide, out - pouch - sun, discarded - sun);
  const discard = Math.max(0, Math.min(out - pouch - sun - glide, discarded - sun - glide));
  const fromDeck = net > 0 ? net - display.length : 0, targeted = Math.min(1, fromDeck, targetedCount(text, name));
  // endgame cards (only counts are known): `eg` = { out, in } of an Adapt that happened in this step (a card drawn and discarded again changes nothing), else the change of the count
  const en = (b.endgame_hand || []).length - (a.endgame_hand || []).length, egIn = eg ? eg.in : Math.max(0, en), egOut = eg ? eg.out : Math.max(0, -en);
  return { display, deck: fromDeck - targeted, targeted, discard, sun, glide, pouch, projects, egDeck: egIn, egDiscard: egOut };
}
// The endgame cards of a seat whose cards are known: drawn ones come from the deck (Resistance, Adapt), discarded ones go back (Adapt, the discard at the end of the game). `after`: when both happen in one step (Adapt) the
// discards are played first and the draws start once they are over. The two endgame cards of the starting hand are a draw too.
export function endgamePlan(before, after, seat) {
  const a = before.players[seat], b = after.players[seat], none = { arrivals: [], departures: [], projects: [], after: true };
  if (!a || !b) return none;
  const real = (k) => k && k !== '?';
  return { ...none, arrivals: difference(b.endgame_hand || [], a.endgame_hand || []).filter(real).map((key) => ({ key, kind: 'deck' })), departures: difference(a.endgame_hand || [], b.endgame_hand || []).filter(real).map((key) => ({ key, kind: 'discard' })) };
}
