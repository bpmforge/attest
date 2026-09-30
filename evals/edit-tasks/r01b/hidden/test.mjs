import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const load = (p) => import(pathToFileURL(process.env.WORKDIR + p).href);
const ids = async (q) => (await load('/src/registry.mjs')).findHives(q).map((h) => h.id);

const CASES = [
  ['odon', [1, 2]],
  ['ODON 2', [1, 2]],
  ['hive', [5, 6, 7, 8, 12, 13, 4, 3]],
  ['hive strasse', [4, 3]],
  ['STRAßE   hive', [4, 3]],
  ['hive, Strasse!', [4, 3]],
  ['aero', [5, 6]],
  ['ærø', [5, 6]],
  ['Łódź', [7, 8]],
  ['lodz hive 7', [7]],
  ['hive 007', [8]],
  ['hive 12', [6]],
  ['Søren', [11]],
  ['box soren', [11]],
  ['  queen-agnes!  ', [10, 9]],
  ['agnes queen 10', [9]],
  ['mill 2', [13]],
  ['old mill', [12, 13]],
  ['2', [1, 2, 13, 11]],
  ['queen bee', []],
  ['str', []],
  ['', []],
  ['   ', []],
  ['!!!', []],
];
test('findHives matches whole words, any order, plain spelling, natural order', async () => {
  for (const [q, want] of CASES) assert.deepEqual(await ids(q), want, `query ${JSON.stringify(q)}`);
});
test('findHives returns the registry objects, not copies', async () => {
  const { findHives, hives } = await load('/src/registry.mjs');
  assert.equal(findHives('soren')[0], hives[10]);
  assert.equal(hives.length, 13);
});
test('findHives does not reorder the registry', async () => {
  const { findHives, hives } = await load('/src/registry.mjs');
  findHives('hive');
  assert.deepEqual(hives.map((h) => h.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
});
