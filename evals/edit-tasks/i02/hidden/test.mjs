import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const load = (p) => import(pathToFileURL(process.env.WORKDIR + p).href);
test('flashesPerMinute counts whole flashes', async () => {
  const { flashesPerMinute } = await load('/src/lighthouse.mjs');
  assert.equal(flashesPerMinute(500, 1500), 30);
  assert.equal(flashesPerMinute(1000, 3500), 13);
  assert.equal(flashesPerMinute(60000, 1), 0);
});
test('describeLight is unchanged', async () => {
  const { describeLight } = await load('/src/lighthouse.mjs');
  assert.equal(describeLight('white', 500, 1500), 'white light, flash 500ms, gap 1500ms');
});
