const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'web/js/sponsor-stats.js'), 'utf8');
const rowsFor = vm.runInNewContext(source.replace('export function sponsorStatRows', 'function sponsorStatRows') + '\nsponsorStatRows;', {});
const rows = (input, sponsor) => JSON.parse(JSON.stringify(rowsFor(input, sponsor)));
assert.deepEqual(rows({}), []);
assert.deepEqual(rows({ money: 0, cards_gained: 0, 'placement:money': 0 }), []);
const africa = rows({ appeal_initial: 2, appeal_final: 5, clever: 3 });
assert.deepEqual(africa, [
  { key: 'appeal_initial', icon: 'appeal', value: '+2', label: 'Immediate appeal' },
  { key: 'appeal_final', icon: 'appeal', value: '+5', label: 'Final-scoring appeal' },
  { key: 'clever', value: '3×', label: 'Clevers activated' },
]);
const lab = rows({ cards_gained: 5, conservation: 2 });
assert.equal(lab.find((r) => r.key === 'cards_gained').label, 'Cards gained');
assert.equal(lab.find((r) => r.key === 'conservation').icon, 'conservation');
const bonuses = rows({ 'placement:money': 10, 'placement:Clever': 2, 'placement:SharkAttack': 1, 'placement:NewBonus': 1 });
assert.equal(bonuses.find((r) => r.key === 'placement:money').value, '+10');
assert.equal(bonuses.find((r) => r.key === 'placement:money').icon, 'money');
assert.equal(bonuses.find((r) => r.key === 'placement:Clever').label, 'Clever bonuses');
assert.equal(bonuses.find((r) => r.key === 'placement:SharkAttack').label, 'Shark Attack bonuses');
assert.equal(bonuses.find((r) => r.key === 'placement:NewBonus').label, 'New Bonus bonuses');
const counters = rows({ effect_used: 2, tokens_spent: 2, attacks_prevented: 1, water_covered: 4, rock_covered: 3, water_ignored: 1, rock_ignored: 1, saved: 12 });
assert.equal(counters.find((r) => r.key === 'effect_used').label, 'Effect used');
assert.equal(counters.find((r) => r.key === 'attacks_prevented').value, '1×');
assert.equal(counters.find((r) => r.key === 'saved').value, '+12');
assert.equal(counters.find((r) => r.key === 'saved').icon, 'money');
const old = ['pavilion', 'pouch', 'enlarge', 'snap_small', 'third_small', 'animals_marked', 'scuba3', 'kiosk', 'size1', 'birds', 'sunbathed', 'hunts', 'seen', 'donations'];
assert.equal(rows(Object.fromEntries(old.map((k) => [k, 1]))).length, old.length);
assert.deepEqual(rows({ 'placement:Scavenging:3': 1 }), [{ key: 'placement:Scavenging:3', value: '1×', label: 'Scavenging 3 bonuses' }]);

assert.deepEqual(rows({ money: 0 }, 'S265'), [{ key: 'money', icon: 'money', value: '+0', label: '' }]);
assert.deepEqual(rows({ money: 0 }, 'S257'), []);
assert.deepEqual(rows({ expeditions: 4 }), []);
assert.equal(rows({ birds: 2 })[0].label, 'Perceptions');
assert.equal(rows({ scuba3: 2 })[0].label, 'Scuba Dives');
assert.equal(rows({ animals_marked: 3 })[0].label, 'Animals marked');
assert.equal(rows({ appeal_income: 4 })[0].label, 'Income appeal');
assert.equal(rows({ appeal_enlargement: 8 })[0].label, 'Occupied-enclosure appeal');
assert.equal(rows({ 'doubled:money': 10 })[0].label, 'Doubled placement bonuses');
assert.equal(rows({ 'doubled:Fac': 2 })[0].label, 'University bonuses (doubled)');
assert.equal(rows({ 'doubled:Scavenging:3': 2 })[0].value, '2×');
assert.equal(rows({ 'doubled:Scavenging:3': 2 })[0].label, 'Scavenging 3 bonuses (doubled)');
console.log('Sponsor hover row contract checks passed.');
