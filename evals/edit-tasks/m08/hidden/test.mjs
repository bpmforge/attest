import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
test('compost exports blendBatch, not mixBatch', async () => {
  const c = await import(W + '/src/compost.mjs');
  assert.equal(typeof c.blendBatch, 'function');
  assert.equal(c.mixBatch, undefined);
  assert.deepEqual(c.blendBatch(8, 2), { strawKg: 8, manureKg: 2, totalKg: 10 });
});
test('index re-export, beds and report still work', async () => {
  const i = await import(W + '/src/index.mjs');
  assert.equal(typeof i.blendBatch, 'function');
  assert.equal(i.mixBatch, undefined);
  assert.deepEqual(i.seedBed('A', 8).batch, { strawKg: 8, manureKg: 2, totalKg: 10 });
  assert.equal(i.batchLine(8, 2), 'batch 10 kg, 6 L water');
});
