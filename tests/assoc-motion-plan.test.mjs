import test from 'node:test';
import assert from 'node:assert/strict';
import { trackMoves, taken, supplyChanges, workerMoves, newCubes } from '../web/js/assoc-motion-plan.js';

const player = (o = {}) => ({ reputation: 1, conservation: 0, tokens: [], flags: {}, ...o });
const st = (players, board_tokens = []) => ({ players, board_tokens });
const tok = (type, location) => ({ id: Math.random(), type, location });

test('track moves: reputation, and conservation only on the first 10 points', () => {
  const a = st([player(), player({ conservation: 9 })]), b = st([player({ reputation: 3 }), player({ conservation: 12 })]);
  assert.deepEqual(trackMoves(a, b), [{ seat: 0, track: 'rep', from: 1, to: 3 }, { seat: 1, track: 'cons', from: 9, to: 12 }]);
  assert.deepEqual(trackMoves(st([player({ conservation: 11 })]), st([player({ conservation: 14 })])), []);
});
test('taken partner zoos / universities are told by place, not id', () => {
  const a = st([player()]), b = st([player({ tokens: [tok('partner-Asia', 'partner_1'), tok('fac-generic', 'university_0')] })]);
  assert.deepEqual(taken(a, b), [{ seat: 0, kind: 'partner', slot: 1, type: 'partner-Asia' }, { seat: 0, kind: 'university', slot: 0, type: 'fac-generic' }]);
  assert.deepEqual(taken(b, b), []);
});
test('the break refills the supply', () => {
  const a = st([player()], [tok('partner-Asia', 'association_3')]), b = st([player()], [tok('partner-Asia', 'association_3'), tok('partner-Europe', 'association_3'), tok('fac-generic', 'association_4')]);
  assert.equal(supplyChanges(a, b).refilled.length, 2);
  assert.equal(supplyChanges(b, a).left.length, 2);
});
test('workers: spend, return, gain', () => {
  const w = (l) => tok('worker', l);
  assert.deepEqual(workerMoves(st([player({ tokens: [w('reserve')] })]), st([player({ tokens: [w('association_3')] })])), [{ seat: 0, kind: 'spend', task: 3 }]);
  assert.deepEqual(workerMoves(st([player({ tokens: [w('association_2'), w('association_2')] })]), st([player({ tokens: [w('reserve'), w('reserve')] })])).map((x) => x.kind), ['return', 'return']);
  assert.deepEqual(workerMoves(st([player({ tokens: [w('supply_1')] })]), st([player({ tokens: [w('reserve')] })])), [{ seat: 0, kind: 'gain' }]);
});
test('cubes: a supported project names the bonus space that was used, a donation has none', () => {
  const a = st([player({ flags: { bonus_used: 1 } })]), b = st([player({ flags: { bonus_used: 5 }, tokens: [tok('token', 'P102_Habitat_2'), tok('token', 'association_0_1')] })]);
  assert.deepEqual(newCubes(a, b), [{ seat: 0, kind: 'project', key: 'P102', slot: 2, bonus: 2 }, { seat: 0, kind: 'donation', k: 1 }]);
});
