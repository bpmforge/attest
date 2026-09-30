import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const load = (p) => import(pathToFileURL(process.env.WORKDIR + p).href);
test('findHive is forgiving of case and spacing', async () => {
  const { findHive } = await load('/src/registry.mjs');
  assert.equal(findHive('queen agnes').id, 1);
  assert.equal(findHive('  OLD   Mill   hive ').id, 3);
});
test('findHive ignores accents and punctuation the way the rest of the app does', async () => {
  const { findHive } = await load('/src/registry.mjs');
  assert.equal(findHive('odon the great').id, 2);
  assert.equal(findHive('Queen-Agnes!').id, 1);
  assert.equal(findHive('old_mill_hive').id, 3);
});
test('findHive returns null when nothing matches', async () => {
  const { findHive } = await load('/src/registry.mjs');
  assert.equal(findHive('queen bee'), null);
  assert.equal(findHive(''), null);
});
