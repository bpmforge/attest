import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;

const CASES = [
  ['comte', [2, 1, 3]],
  ['COMTÉ', [2, 1, 3]],
  ['  comté  ', [2, 1, 3]],
  ['vieux comte', [3, 1]],
  ['comté vieux!', [1, 3]],
  ['vieux', [3, 1]],
  ['fort', [12, 7, 11]],
  ["d'ete beaufort", [7]],
  ['D’ÉTÉ', [7]],
  ['coeur', [8]],
  ['cœur', [8]],
  ['neufchatel, coeur', [8]],
  ['pont l eveque', [4]],
  ["l'évêque", [4]],
  ['Pont-L’Évêque.', [4]],
  ['eveque,   pont', [4]],
  ['mont d or', [6, 5]],
  ["mont d'or vacherin", [5]],
  ['vacherin (mont)', [5]],
  ['saint nectaire', [9]],
  ['nectaire-saint', [9]],
  ['epoisses', [10]],
  ['comte vieux', [1, 3]],
  ['comte\tvieux', [1, 3]],
  ['cheddar', []],
  ['comte brie', []],
  ['', []],
  ['   ', []],
  ['?!', []],
];
test('searchWheels: every word, any order, plain spelling, ranked exact/prefix/rest', async () => {
  const { searchWheels } = await import(W + '/src/search.mjs');
  for (const [q, want] of CASES) assert.deepEqual(searchWheels(q).map((w) => w.id), want, `query ${JSON.stringify(q)}`);
});
test('searchWheels returns the wheel objects and leaves the list alone', async () => {
  const { searchWheels } = await import(W + '/src/search.mjs');
  const { WHEELS } = await import(W + '/src/index.mjs');
  assert.equal(searchWheels('roquefort')[0], WHEELS[10]);
  searchWheels('fort');
  assert.deepEqual(WHEELS.map((w) => w.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});
test('existing lookup still works', async () => {
  const { wheelByName, oldest } = await import(W + '/src/index.mjs');
  assert.equal(wheelByName('comte').id, 2);
  assert.equal(wheelByName('mont d’or').id, 6);
  assert.equal(oldest().id, 3);
});
