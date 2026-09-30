import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const load = (p) => import(pathToFileURL(process.env.WORKDIR + p).href);
test('deepestPuddle picks the deepest', async () => {
  const { deepestPuddle } = await load('/src/puddle.mjs');
  assert.equal(deepestPuddle([{ name: 'gate', cm: 3 }, { name: 'lane', cm: 9 }, { name: 'yard', cm: 4 }]), 'lane');
});
test('ties go to the first listed; empty gives null', async () => {
  const { deepestPuddle } = await load('/src/puddle.mjs');
  assert.equal(deepestPuddle([{ name: 'a', cm: 5 }, { name: 'b', cm: 5 }]), 'a');
  assert.equal(deepestPuddle([]), null);
});
test('totalDepth unchanged', async () => {
  const { totalDepth } = await load('/src/puddle.mjs');
  assert.equal(totalDepth([{ name: 'a', cm: 2 }, { name: 'b', cm: 3 }]), 5);
});
