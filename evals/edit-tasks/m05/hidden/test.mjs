import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
const { listJars } = await import(W + '/src/inventory.mjs');
const { report } = await import(W + '/src/report.mjs');
const { labelsFor } = await import(W + '/src/labels.mjs');

test('empty/unknown apiary gives []', () => {
  assert.deepEqual(listJars('hilltop'), []);
  assert.deepEqual(listJars('nowhere'), []);
  assert.equal(listJars('orchard').length, 1);
});
test('report still says no jars for empty/unknown', () => {
  assert.equal(report('hilltop'), 'No jars at hilltop');
  assert.equal(report('nowhere'), 'No jars at nowhere');
  assert.equal(report('meadow'), 'meadow: 2 jars, 750g');
});
test('labels still work', () => {
  assert.deepEqual(labelsFor('meadow'), ['meadow/j1', 'meadow/j2']);
  assert.deepEqual(labelsFor('hilltop'), []);
});
