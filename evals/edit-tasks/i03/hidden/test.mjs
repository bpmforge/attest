import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const load = (p) => import(pathToFileURL(process.env.WORKDIR + p).href);
test('label uses the new format', async () => {
  const { label } = await load('/src/jam.mjs');
  assert.equal(label({ fruit: 'Plum', grams: 250 }), 'PLUM JAM - 250 g');
  assert.equal(label({ fruit: 'apricot', grams: 40 }), 'APRICOT JAM - 40 g');
});
test('SHELF_LIFE_MONTHS still exported', async () => {
  const m = await load('/src/jam.mjs');
  assert.equal(m.SHELF_LIFE_MONTHS, 18);
});
