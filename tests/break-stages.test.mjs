import test from 'node:test';
import assert from 'node:assert/strict';
import { stageBreaks } from '../web/js/break-stages.js';

const w = (l) => ({ type: 'worker', location: l });
const sup = (l, t = 'partner-Asia') => ({ type: t, location: l });
const step = (label, workers, board, move = 5) => ({ label, move_id: move, state: { players: [{ tokens: [w(workers)] }], board_tokens: board } });
test('the break moves workers and supply to their own lines', () => {
  const r = { steps: [
    step('Starting a new break', 'association_2', [sup('association_3')], 4),
    step('a discards X', 'reserve', [sup('association_3'), sup('association_3', 'partner-Europe')]),
    step('All tokens are removed from player cards', 'reserve', [sup('association_3'), sup('association_3', 'partner-Europe')]),
    step("All workers go back to each player's reserve", 'reserve', [sup('association_3'), sup('association_3', 'partner-Europe')]),
    step('Replenishing partner zoos and universities', 'reserve', [sup('association_3'), sup('association_3', 'partner-Europe')]),
  ] };
  stageBreaks(r);
  const at = (i) => r.steps[i].state;
  assert.equal(at(1).players[0].tokens[0].location, 'association_2');
  assert.equal(at(2).players[0].tokens[0].location, 'association_2');
  assert.equal(at(3).players[0].tokens[0].location, 'reserve');
  assert.equal(at(1).board_tokens.length, 1);
  assert.equal(at(3).board_tokens.length, 1);
  assert.equal(at(4).board_tokens.length, 2);
});
test('steps without a break are left alone', () => {
  const r = { steps: [step('x', 'reserve', []), step('y', 'reserve', [])] };
  const a = r.steps[1].state; stageBreaks(r); assert.equal(r.steps[1].state, a);
});
test('a gained worker appears at its own line', () => {
  const mk = (label, loc, move) => ({ label, move_id: move, state: { players: [{ tokens: [{ type: 'worker', location: loc }] }], board_tokens: [] } });
  const r = { players: [{ name: 'ann' }], steps: [mk('ann chooses', 'supply_1', 1), mk('ann plays a card', 'reserve', 2), mk('ann gains 8 appeal', 'reserve', 3), mk('ann gains a new Association worker', 'reserve', 3), mk('ann places', 'reserve', 4)] };
  stageBreaks(r);
  assert.deepEqual(r.steps.map((s) => s.state.players[0].tokens[0].location), ['supply_1', 'supply_1', 'supply_1', 'reserve', 'reserve']);
});
test('a break that is triggered mid-turn is held until its lines, in a later move', () => {
  const r = { steps: [
    step('chooses card', 'association_2', [sup('association_3')], 1),
    step('advances break token and reach the last space', 'reserve', [sup('association_3'), sup('association_3', 'partner-Europe')], 2),
    step('gains 10 money', 'reserve', [sup('association_3'), sup('association_3', 'partner-Europe')], 2),
    step('Starting a new break', 'reserve', [sup('association_3'), sup('association_3', 'partner-Europe')], 3),
    step("All workers go back to each player's reserve", 'reserve', [sup('association_3'), sup('association_3', 'partner-Europe')], 3),
    step('Replenishing partner zoos and universities', 'reserve', [sup('association_3'), sup('association_3', 'partner-Europe')], 3),
  ] };
  stageBreaks(r);
  assert.deepEqual(r.steps.map((s) => s.state.players[0].tokens[0].location), ['association_2', 'association_2', 'association_2', 'association_2', 'reserve', 'reserve']);
  assert.deepEqual(r.steps.map((s) => s.state.board_tokens.length), [1, 1, 1, 1, 1, 2]);
});
