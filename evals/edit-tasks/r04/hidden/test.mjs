import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
test('searchWheels is forgiving about how customers type', async () => {
  const { searchWheels } = await import(W + '/src/search.mjs');
  const ids = (q) => searchWheels(q).map((w) => w.id);
  assert.deepEqual(ids('fort'), [2, 3]);
  assert.deepEqual(ids('COMTE'), [1]);
  assert.deepEqual(ids('  comté '), [1]);
  assert.deepEqual(ids("beaufort d'ete"), [2]);
  assert.deepEqual(ids('mimolette   vieille'), [4]);
  assert.deepEqual(ids('cheddar'), []);
});
test('existing lookup still works', async () => {
  const { wheelByName, oldest } = await import(W + '/src/index.mjs');
  assert.equal(wheelByName('comte').id, 1);
  assert.equal(oldest().id, 4);
});
