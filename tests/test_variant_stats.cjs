const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/js/cards.js'), 'utf8');
const chunk = source.slice(source.indexOf('const VARIANT_NAME ='), source.indexOf('// Puts the enlarged view')).replace('export function', 'function');
const context = { S: { replay: { marine_worlds: true } }, FORK: false, PLAY: false, SANDBOX: false, MINIGAME: false,
  el: (tag, cls, text) => ({ tag, cls, text, children: [], append(...children) { this.children.push(...children); } }),
};
const render = vm.runInNewContext(chunk + '\nvariantStatsBox;', context);
const result = (type, variant, stats) => JSON.parse(JSON.stringify(render({ variant_stats: { 0: { [type]: stats } } }, 0, { type, variant })));
const textRows = (rows) => rows.slice(1).map((r) => r.children.map((c) => c.text));
assert.deepEqual(textRows(result('cards', 1, { extra_kept: 7 })), [['7', 'Additional cards kept']]);
assert.equal(result('cards', 1, {})[0].text, 'Keep Cards');
assert.deepEqual(textRows(result('cards', 1, {})), [['0', 'Additional cards kept']]);
assert.deepEqual(textRows(result('build', 3, { extra_strength: 1, identical: 3 })), [
  ['1', 'Times the extra strength was used'], ['3', 'Additional identical standard enclosures (side II)'],
]);
assert.equal(result('sponsors', 1, {})[0].text, 'Trade Sponsors');
assert.equal(result('sponsors', 2, {})[0].text, 'Money Sponsors');
assert.equal(result('sponsors', 4, {})[0].text, 'Marketing Sponsor');
assert.deepEqual(textRows(result('sponsors', 4, { snap: 2, play: 3 })), [
  ['2', 'Sponsors discarded to snap a sponsor (side I)'], ['3', 'Marketing'],
]);
assert.deepEqual(textRows(result('animals', 1, { ignored: 4 })), [['4', 'Animals played ignoring a condition']]);
assert.deepEqual(textRows(result('cards', 4, { clever_paid: 2, clever_free: 3 })), [
  ['2', 'Clevers for 2 money (side I)'], ['3', 'Clevers for free (side II)'],
]);
context.FORK = true;
assert.equal(render({ variant_stats: {} }, 0, { type: 'cards', variant: 1 }), null);
console.log('Action variant hover rendering checks passed.');
