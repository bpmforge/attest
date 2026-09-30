import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const load = (p) => import(pathToFileURL(process.env.WORKDIR + p).href);
test('first inspection happens on the first day', async () => {
  const { inspectionDay } = await load('/src/hive.mjs');
  assert.equal(inspectionDay(10, 7, 1), 10);
  assert.equal(inspectionDay(10, 7, 3), 24);
});
test('inspectionDays list starts at firstDay', async () => {
  const { inspectionDays } = await load('/src/hive.mjs');
  assert.deepEqual(inspectionDays(3, 5, 4), [3, 8, 13, 18]);
  assert.deepEqual(inspectionDays(3, 5, 0), []);
});
