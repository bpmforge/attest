import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
const idx = await import(W + '/src/index.mjs');
const reg = await import(W + '/src/registry.mjs');
const { seed } = await import(W + '/src/seed.mjs');

test('renamed everywhere', () => {
  assert.equal(typeof reg.registerLlama, 'function');
  assert.equal(typeof idx.registerLlama, 'function');
  assert.equal(reg.register, undefined);
  assert.equal(idx.register, undefined);
});
test('behaviour unchanged, seed and stats work via the barrel', () => {
  idx.reset();
  seed();
  assert.equal(idx.totalWool(), 1650);
  assert.throws(() => idx.registerLlama('Dolly', 1), /duplicate llama: Dolly/);
  assert.deepEqual(idx.registerLlama('Luis', 5), { name: 'Luis', woolGrams: 5 });
});
