// Run with: node --test tests/card-motion-plan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { movementPlan, difference, otherPlan, parsePilfer, discardKinds, playedCards, playedRemoved, targetedCount, buildingChanges, buildingFlips, buildingGrowths, plainPlan, plainOther, displayChanges, targetedNames, endgamePlan } from '../web/js/card-motion-plan.js';
const state = (hand) => ({ players: [{ hand, under: {}, pouched: [], animals: [], sponsors: [], stored: [] }], display: ['A438'], main_discard: [] });
test('multiset differences preserve duplicates and ignore ordering', () => {
  assert.deepEqual(difference(['A','B','A'], ['B','A']), ['A']);
  assert.deepEqual(difference(['B','A'], ['A','B']), []);
});
test('display draw is identified by the actual card leaving the display', () => {
  const a = state([]), b = state(['A438']); b.display=[];
  assert.equal(movementPlan(a,b,0).arrivals[0].kind,'display');
});
test('targeted university/Monkey Gang draw carries the species badge', () => {
  const a=state([]),b=state(['A452']);
  assert.deepEqual(movementPlan(a,b,0,'draws with <SEARCH-PRIMATE>').arrivals,[{key:'A452',kind:'targeted',species:'Primate'}]);
});
test('Sunbathing uses BGA sell wording; Glide is distinct from normal discard', () => {
  const a=state(['A401']),b=state([]);b.main_discard=['A401'];
  for(const [text,kind] of [['sells cards','sun'],['sunbathed a card','sun'],['discard (Glide effect)','glide'],['discards','discard']]) assert.equal(movementPlan(a,b,0,text).departures[0].kind,kind);
});
test('pouch identifies the actual source; map pouch does not invent an animal', () => {
  const a=state(['A401']),b=state([]);b.players[0].under.A528=['A401'];
  assert.deepEqual(movementPlan(a,b,0).departures,[{key:'A401',kind:'pouch',source:'A528'}]);
  b.players[0].under={};b.players[0].pouched=['A401'];
  assert.equal(movementPlan(a,b,0).departures[0].source,undefined);
});
test('playing, storing and giving a card never become discard animations', () => {
  const a=state(['A401']),b=state([]);
  b.players[0].animals=['A401'];assert.deepEqual(movementPlan(a,b,0).departures,[]);
  b.players[0].stored=['A401'];assert.deepEqual(movementPlan(a,b,0).departures,[]);
});
test('hidden cards and pure reordering produce no animations', () => {
  assert.deepEqual(movementPlan(state(['?']),state(['?','?']),0),{arrivals:[],departures:[],projects:[]});
  assert.deepEqual(movementPlan(state(['A','B']),state(['B','A']),0),{arrivals:[],departures:[],projects:[]});
});

const two = (h0, h1) => ({ players: [{ hand: h0, under: {}, pouched: [], animals: [], sponsors: [], stored: [] }, { hand: h1, under: {}, pouched: [], animals: [], sponsors: [], stored: [] }], display: ['A1', 'A2', null], main_discard: [] });
test('played animals and sponsors use public identities and the actual display departure', () => {
  const a=two(['S201'],['?']),b=two([],[]);b.display=[null,'A2',null];
  b.players[0].sponsors=['S201'];b.players[1].animals=['A1'];
  assert.deepEqual(playedCards(a,b),[{seat:0,key:'S201',kind:'sponsors',source:'hand'},{seat:1,key:'A1',kind:'animals',source:'display'}]);
  assert.deepEqual(movementPlan(a,b,0).departures,[]);
});
test('played-card reordering and expedition removals do not create new plays', () => {
  const a=two([],[]),b=two([],[]);a.players[0].sponsors=['S201','S202'];b.players[0].sponsors=['S202'];
  a.players[1].animals=['A1','A2'];b.players[1].animals=['A2','A1'];
  assert.deepEqual(playedCards(a,b),[]);
});
test('a hidden-hand play is not counted as a discard when another card is discarded in the same step', () => {
  const a=two([],['?']),b=two([],[]);b.players[1].sponsors=['S201'];b.main_discard=['A9'];
  assert.equal(otherPlan(a,b,0).discard,0);
});
test('parsePilfer reads the give / get lines once per card and ignores money and the summary line', () => {
  const n = ['Ann', 'Bob'];
  assert.deepEqual(parsePilfer('Ann gives Savanna from the Pilfering effect', n), [{ from: 0, to: 1, give: 1, get: 0 }]);
  assert.deepEqual(parsePilfer('Bob gets Savanna from the Pilfering effect', n), [{ from: 0, to: 1, give: 0, get: 1 }]);
  assert.deepEqual(parsePilfer('Ann gives Savanna from the Pilfering effect · Bob gets Savanna from the Pilfering effect', n), [{ from: 0, to: 1, give: 1, get: 1 }]);
  assert.deepEqual(parsePilfer('Ann gives 3 money to Bob for Pilfering effect · Ann gives 1 card to Bob from Pilfering effect', n), []);
});
test('pilfer: the receiver gets a pilfer arrival, the giver a pilfer departure', () => {
  const a = two(['P'], ['X']), b = two(['P', 'X'], []);
  const plan = movementPlan(a, b, 0, '', [{ from: 1, to: 0, give: 1, get: 1 }]);
  assert.equal(plan.arrivals[0].kind, 'pilfer');
  const c = two(['K'], ['Y']), d = two([], ['Y', 'K']);
  assert.equal(movementPlan(c, d, 0, '', [{ from: 0, to: 1, give: 1, get: 1 }]).departures[0].kind, 'pilfer');
});
test('otherPlan: display take, deck draw and discard of the other seat', () => {
  const a = two(['?'], ['?']), b = two(['?'], ['?', '?', '?']); b.display = [null, 'A2', null];
  assert.deepEqual(otherPlan(a, b, 0), { display: ['A1'], deck: 1, targeted: 0, discard: 0, sun: 0, glide: 0, pouch: 0, pouchSource: null, projects: [], egDeck: 0, egDiscard: 0 });
  const c = two(['?'], ['?', '?']), d = two(['?'], ['?']); d.main_discard = ['Z'];
  assert.deepEqual(otherPlan(c, d, 0), { display: [], deck: 0, targeted: 0, discard: 1, sun: 0, glide: 0, pouch: 0, pouchSource: null, projects: [], egDeck: 0, egDiscard: 0 });
  assert.deepEqual(otherPlan(a, two(['?'], ['?', '?']), 0, [{ from: 0, to: 1, give: 1, get: 1 }]), { display: [], deck: 0, targeted: 0, discard: 0, sun: 0, glide: 0, pouch: 0, pouchSource: null, projects: [], egDeck: 0, egDiscard: 0 });
});
test('Sponsors level 3 discards count as sunbathing, level 4 (Marketing) discards are normal discards; discardKinds counts cards per line', () => {
  for (const [text, kind] of [['Ann discards X to gain money (Sponsors3 effect)', 'sun'], ["Ann discards X to increase Sponsors action's strength by 2 (Sponsors3 effect)", 'sun'], ['Ann discards X to play a Sponsor card for money (Sponsors4 effect)', 'discard'], ['Ann discards X to snap a Sponsor card (Sponsors4 effect)', 'discard']]) {
    const a = state(['A401']), b = state([]); b.main_discard = ['A401'];
    assert.equal(movementPlan(a, b, 0, text).departures[0].kind, kind);
  }
  assert.deepEqual(discardKinds('Bob discards A to snap a Sponsor card (Sponsors4 effect) · Bob discards B to play a Sponsor card for money (Sponsors4 effect)', 'Bob'), { sun: 0, glide: 0 });
  assert.deepEqual(discardKinds("Bob discards A to increase Sponsors action's strength by 2 (Sponsors3 effect)", 'Bob'), { sun: 1, glide: 0 });
  assert.deepEqual(discardKinds('Bob sells A, B cards for 8 money · Ann sells C cards for 4 money', 'Bob'), { sun: 2, glide: 0 });
  assert.deepEqual(discardKinds('Bob discards A to gain money (Sponsors3 effect)', 'Bob'), { sun: 1, glide: 0 });
});
test('otherPlan splits discards into sun, glide and pouch by count', () => {
  const a = two(['?', '?', '?', '?'], ['?', '?', '?', '?']), b = two(['?', '?', '?', '?'], ['?']); b.main_discard = ['Z1', 'Z2', 'Z3'];
  assert.deepEqual(otherPlan(a, b, 0, [], 'Bob sells A, B cards for 8 money', 'Bob'), { display: [], deck: 0, targeted: 0, discard: 1, sun: 2, glide: 0, pouch: 0, pouchSource: null, projects: [], egDeck: 0, egDiscard: 0 });
  b.main_discard = ['Z1'];
  const c = two(['?'], ['?', '?']), d = two(['?'], ['?']); d.players[1].pouched = ['P'];
  assert.equal(otherPlan(c, d, 0).pouch, 1);
  assert.equal(otherPlan(c, d, 0).pouchSource, null);                              // (pouched by the map: no card to tuck it under)
  const e = two(['?'], ['?']); e.players[1].under = { S212: ['X'] };
  const f = two(['?'], ['?', '?']); f.players[1].under = {};
  assert.deepEqual([otherPlan(f, e, 0).pouch, otherPlan(f, e, 0).pouchSource], [1, 'S212']);          // (under Expert On Australia)
});
test('otherPlan: the giver\'s step and the getter\'s step each explain only their own hand', () => {
  const a = two(['?'], ['?']), b = two(['?'], ['?', '?']);
  assert.equal(otherPlan(a, b, 1, [{ from: 0, to: 1, give: 0, get: 1 }]).deck, 0);   // seat 1 is the getter, seat 0 (shown here) did not change in this step
  assert.equal(otherPlan(a, b, 0, [{ from: 0, to: 1, give: 0, get: 1 }]).deck, 0);
});
test('parsePilfer reads the one-line form "A gives B <card> from the Pilfering effect"', () => {
  assert.deepEqual(parsePilfer('Ann gives Bob Savanna from the Pilfering effect', ['Ann', 'Bob']), [{ from: 0, to: 1, give: 1, get: 1 }]);
  assert.deepEqual(parsePilfer('Bob gives Ann Basic Research from the Pilfering effect', ['Ann', 'Bob']), [{ from: 1, to: 0, give: 1, get: 1 }]);
});
test('a played conservation project is found, from the hand and from the display', () => {
  const a = state(['P127', 'A1']), b = state(['A1']); a.projects_in_play = [null, null]; b.projects_in_play = ['P127', null];
  assert.deepEqual(movementPlan(a, b, 0).projects, [{ key: 'P127', source: 'hand' }]);
  assert.deepEqual(movementPlan(a, b, 0).departures, []);
  const c = state(['A1']), d = state(['A1']); c.display = ['P118']; d.display = ['A5']; c.projects_in_play = [null, null]; d.projects_in_play = ['P118', null];
  assert.deepEqual(movementPlan(c, d, 0).projects, [{ key: 'P118', source: 'display' }]);
});

test('other seat: a project played from the hidden hand is not a discard, from the display it stays a display project', () => {
  const pl = (hand) => [{ hand, animals: [], sponsors: [] }, { hand: ['?', '?', '?'], animals: [], sponsors: [] }];
  const before = { players: pl(['A1']), display: ['P101', 'A2'], projects_in_play: [], main_discard: [] };
  const hand = { players: [before.players[0], { hand: ['?', '?'], animals: [], sponsors: [] }], display: ['P101', 'A2'], projects_in_play: ['P140'], main_discard: [] };
  const a = otherPlan(before, hand, 0);
  assert.deepEqual(a.projects, [{ key: 'P140', source: 'hand' }]);
  assert.equal(a.discard, 0);
  const disp = { players: before.players, display: ['A2', 'A3'], projects_in_play: ['P101'], main_discard: [] };
  assert.deepEqual(otherPlan(before, disp, 0).projects, [{ key: 'P101', source: 'display' }]);
});

test('targeted draws: university, monkey gang, management plan, map 8, map 14 workers, Waza', () => {
  const yes = ['P draws Reindeer for gaining a new university with <SEARCH-HERBIVORE>', 'P draws Mantled Guereza for monkey gang effect', 'P draws 1 card for monkey gang effect',
    'P draws Moose with <HERBIVORE> (Herbivore Management Plan)', 'P draws 1 <BIRD> card: ? (Bird Management Plan)', 'P draws Science Museum from the deck (Map 8 effect)', 'P draws 1 card from the deck (Map 8 effect)',
    'P draws Hydrologist with <SPONSOR-PERSON> (2nd worker bonus)', 'P draws Expert On Asia with <SPONSOR-PERSON> (1st worker bonus)', 'P draws Expert In Predators with <SPONSOR-PERSON> (last worker bonus)',
    'P draws Sharknose Goby from the deck (Waza Special Assignement effect)', 'P draws 1 card from the deck (Waza Special Assignement effect)', 'P draws X with <SPONSOR-PERSON> (Map 14 effect)'];
  for (const t of yes) assert.equal(targetedCount(t), 1, t);
  for (const t of ['P draws Moose from the deck', 'P draws Moose for sprint effect', 'P gains 1 conservation (last worker bonus)', 'Q draws Reindeer for monkey gang effect'])
    assert.equal(targetedCount(t, t.startsWith('Q') ? 'P' : ''), 0, t);
  assert.equal(targetedCount('P draws 2 sponsor card(s) from the deck (Map 8 effect)'), 2);
});
test('own plan: the first arrival of a targeted step is targeted, the others stay deck draws', () => {
  const a = state([]), b = state(['A1', 'A2']);
  assert.deepEqual(movementPlan(a, b, 0, 'P draws A1 from the deck (Map 8 effect)').arrivals.map((x) => x.kind), ['targeted', 'deck']);
  assert.deepEqual(movementPlan(a, b, 0, 'P draws A1, A2 from the deck').arrivals.map((x) => x.kind), ['deck', 'deck']);
});
test('other seat: a targeted draw is split from the plain deck draws', () => {
  const mk = (n) => ({ players: [{ hand: [], animals: [], sponsors: [] }, { hand: Array(n).fill('?'), animals: [], sponsors: [], under: {}, pouched: [] }], display: [], main_discard: [], projects_in_play: [] });
  const plan = otherPlan(mk(3), mk(5), 0, [], 'Q draws 1 card for monkey gang effect · Q draws 1 card from the deck', 'Q');
  assert.equal(plan.targeted, 1); assert.equal(plan.deck, 1);
});

test('buildingChanges: arrivals and cut downs by type and anchor, not turns or animals moving in', () => {
  const b = (type, x, y, rotation = 0, animal = null) => ({ type, x, y, rotation, animal });
  const before = { players: [{ buildings: [b('size-2', 1, 1), b('kiosk', 3, 3)] }, { buildings: [] }] };
  const after = { players: [{ buildings: [b('size-2', 1, 1, 2, 'A1'), b('size-4', 5, 5)] }, { buildings: [b('pavilion', 0, 0)] }] };
  assert.deepEqual(buildingChanges(before, after), { added: [{ seat: 0, id: 'size-4|5|5' }, { seat: 1, id: 'pavilion|0|0' }], removed: [{ seat: 0, id: 'kiosk|3|3' }] });
  assert.deepEqual(buildingChanges(after, after), { added: [], removed: [] });
});

test('buildingGrowths: an enclosure that grew is paired with the bigger one that covers its cells, whatever its new anchor and rotation', () => {
  const b = (type, x, y, rotation, cells, animal = null) => ({ type, x, y, rotation, cells, animal });
  // the two enlargements of table 941429583: move 284 (same anchor, rotation 5 -> 0) and move 394 (anchor 4|9 -> 4|11)
  const s2 = b('size-2', 4, 9, 5, [[4, 9], [4, 11]]), s3 = b('size-3', 4, 9, 0, [[4, 9], [4, 11], [5, 10]], 'A491'), s4 = b('size-4', 4, 11, 0, [[4, 9], [4, 11], [5, 10], [5, 12]], 'A491');
  const kiosk = b('kiosk', 1, 1, 0, [[1, 1]]), st = (...bs) => ({ players: [{ buildings: bs }, { buildings: [] }] });
  assert.deepEqual(buildingGrowths(st(s2, kiosk), st(s3, kiosk)), [{ seat: 0, from: 'size-2|4|9', to: 'size-3|4|9' }]);
  assert.deepEqual(buildingGrowths(st(s3), st(s4)), [{ seat: 0, from: 'size-3|4|9', to: 'size-4|4|11' }]);
  assert.deepEqual(buildingGrowths(st(s2), st(s4)), [{ seat: 0, from: 'size-2|4|9', to: 'size-4|4|11' }], 'a jump over two enlargements');
  // not a growth: a smaller one (a step back), one that does not cover the old cells, a non-standard building, no cells (old data), nothing changed
  assert.deepEqual(buildingGrowths(st(s4), st(s3)), []);
  assert.deepEqual(buildingGrowths(st(s3), st(b('size-4', 8, 8, 0, [[8, 8], [8, 10], [9, 9], [9, 11]]))), []);
  assert.deepEqual(buildingGrowths(st(b('size-1', 1, 1, 0, [[1, 1]])), st(b('kiosk', 1, 1, 0, [[1, 1]]))), []);
  assert.deepEqual(buildingGrowths(st({ ...s3, cells: undefined }), st({ ...s4, cells: undefined })), []);
  assert.deepEqual(buildingGrowths(st(s3), st(s3)), []);
  // two enclosures grew in one step (or a jump): each takes its own bigger one; the other seat is apart
  const t1 = b('size-1', 0, 0, 0, [[0, 0]]), t2 = b('size-2', 0, 0, 0, [[0, 0], [0, 2]]);
  const both = buildingGrowths({ players: [{ buildings: [s3, t1] }, { buildings: [t1] }] }, { players: [{ buildings: [s4, t2] }, { buildings: [t2] }] });
  assert.deepEqual(both, [{ seat: 0, from: 'size-3|4|9', to: 'size-4|4|11' }, { seat: 0, from: 'size-1|0|0', to: 'size-2|0|0' }, { seat: 1, from: 'size-1|0|0', to: 'size-2|0|0' }]);
});

test('displayChanges: wave / natural discard leaves, a take does not, replenished cards are added', () => {
  const before = { display: ['A1', 'A2', 'A3'], main_discard: ['A9'] };
  const after = { display: ['A3', 'A4', 'A5'], main_discard: ['A9', 'A1'] };
  assert.deepEqual(displayChanges(before, after), { leaving: ['A1'], added: ['A4', 'A5'], taken: ['A2'] });
});
test('targetedNames: the cards a targeted draw found, from the log line', () => {
  assert.deepEqual(targetedNames('Dubsy draws Sharknose Goby for gaining a new university with <SEARCH-SEAANIMAL>', 'Dubsy'), ['Sharknose Goby']);
  assert.deepEqual(targetedNames('Dubsy draws 1 card from the deck (Map 8 effect)', 'Dubsy'), []);
  assert.deepEqual(targetedNames('Dubsy draws A, B for monkey gang effect', 'Other'), []);
});

test('every kind of targeted draw is counted and named, Map 14 included', () => {
  for (const line of ['A draws Engineer with <SPONSOR-PERSON> (Map 14 effect)', 'A draws Science Museum from the deck (Map 8 effect)', 'A draws Goby from the deck (Waza Special Assignement effect)', 'A draws Macaque for monkey gang effect']) {
    assert.equal(targetedCount(line, 'A'), 1, line);
    assert.equal(targetedNames(line, 'A').length, 1, line);
  }
});

const eg = (hand) => ({ phase: 'play', players: [{ hand: [], endgame_hand: hand }, { hand: [], endgame_hand: ['?'] }], display: [], main_discard: [] });
test('endgamePlan: Resistance draws, Adapt discards then draws, unchanged cards animate nothing, the starting endgame cards are drawn', () => {
  assert.deepEqual(endgamePlan(eg(['F1']), eg(['F1', 'F2']), 0).arrivals, [{ key: 'F2', kind: 'deck' }]);
  const ad = endgamePlan(eg(['F1', 'F2']), eg(['F2', 'F3']), 0);
  assert.deepEqual([ad.departures, ad.arrivals, ad.after], [[{ key: 'F1', kind: 'discard' }], [{ key: 'F3', kind: 'deck' }], true]);
  const same = endgamePlan(eg(['F1', 'F2']), eg(['F2', 'F1']), 0);
  assert.equal(same.arrivals.length + same.departures.length, 0);
  assert.equal(endgamePlan({ ...eg([]), phase: 'setup' }, eg(['F1', 'F2']), 0).arrivals.length, 2);
});
test('otherPlan: endgame cards of the other seat are counted (Adapt gives its own counts)', () => {
  const hid = (n) => ({ phase: 'play', players: [{ hand: [], endgame_hand: [] }, { hand: [], endgame_hand: Array(n).fill('?') }], display: [], main_discard: [] });
  const r = otherPlan(hid(1), hid(2), 0);
  assert.deepEqual([r.egDeck, r.egDiscard], [1, 0]);
  const a = otherPlan(hid(2), hid(2), 0, [], '', '', { out: 1, in: 1 });
  assert.deepEqual([a.egDeck, a.egDiscard], [1, 1]);
});

test('playedRemoved lists the animals / sponsors that left a player\'s played zones', () => {
  const a = { players: [{ animals: ['A1', 'A2'], sponsors: ['S201'] }, { animals: ['A9'], sponsors: [] }] };
  const b = { players: [{ animals: ['A2'], sponsors: [] }, { animals: ['A9', 'A3'], sponsors: [] }] };
  assert.deepEqual(playedRemoved(a, b), [{ seat: 0, key: 'A1', kind: 'animals' }, { seat: 0, key: 'S201', kind: 'sponsors' }]);
  assert.deepEqual(playedRemoved(b, a), [{ seat: 1, key: 'A3', kind: 'animals' }]);
  assert.deepEqual(playedRemoved(a, a), []);
});

test('buildingFlips: a standard enclosure that fills or empties turns, a new one or another type does not', () => {
  const b = (type, x, y, animal) => ({ type, x, y, animal: animal || null, animals: [] });
  const before = { players: [{ buildings: [b('size-2', 1, 1), b('size-4', 2, 2, 'A1'), b('aquarium', 3, 3), b('size-1', 4, 4)] }] };
  const after = { players: [{ buildings: [b('size-2', 1, 1, 'A9'), b('size-4', 2, 2), b('aquarium', 3, 3, 'A5'), b('size-1', 4, 4), b('size-3', 5, 5, 'A7')] }] };
  assert.deepEqual(buildingFlips(before, after), [{ seat: 0, id: 'size-2|1|1', occupied: true }, { seat: 0, id: 'size-4|2|2', occupied: false }]);
  assert.deepEqual(buildingFlips(after, after), []);
});

test('plainPlan / plainOther: thematic kinds become a plain draw or discard', () => {
  const own = plainPlan({ arrivals: [{ key: 'A1', kind: 'targeted', species: 'Bird' }, { key: 'A2', kind: 'display' }], departures: [{ key: 'A3', kind: 'sun' }, { key: 'A4', kind: 'glide' }, { key: 'A5', kind: 'pouch', source: 'S1' }, { key: 'A6', kind: 'discard' }], projects: [] });
  assert.deepEqual(own.arrivals, [{ key: 'A1', kind: 'deck' }, { key: 'A2', kind: 'display' }]);
  assert.deepEqual(own.departures.map((d) => d.kind), ['discard', 'discard', 'discard', 'discard']);
  const other = plainOther({ display: [], deck: 1, targeted: 1, discard: 1, sun: 2, glide: 1, pouch: 1, projects: [], egDeck: 0, egDiscard: 0 });
  assert.deepEqual([other.deck, other.targeted, other.discard, other.sun, other.glide, other.pouch], [2, 0, 5, 0, 0, 0]);
  assert.equal(plainPlan(null), null);
});
