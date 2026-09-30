import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
const { sightingsInMonth, brightest } = await import(W + '/src/sightings.mjs');
const { loadSightings } = await import(W + '/src/loader.mjs');

test('month filter uses DD/MM/YYYY', () => {
  assert.deepEqual(sightingsInMonth(2025, 3), ['Zephyr', 'Bramble']);
  assert.deepEqual(sightingsInMonth(2025, 2), ['Halley-Ish']);
  assert.deepEqual(sightingsInMonth(2025, 4), ['Zephyr']);
  assert.deepEqual(sightingsInMonth(2024, 3), ['Old Timer']);
  assert.deepEqual(sightingsInMonth(2025, 12), []);
});
test('existing loader/brightest untouched', () => {
  assert.equal(brightest().comet, 'Bramble');
  assert.deepEqual(loadSightings()[0].date, { year: 2025, month: 2, day: 3 });
});
