import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
const { loadTable, nextHighTide } = await import(W + '/src/tides.mjs');
const { describeNext, minutesUntil } = await import(W + '/src/alerts.mjs');
const { run } = await import(W + '/src/cli.mjs');
const table = loadTable();

test('nextHighTide returns {time,height}', () => {
  const r = nextHighTide(table, new Date('2025-06-01T05:00:00Z'));
  assert.ok(r.time instanceof Date);
  assert.equal(r.time.toISOString(), '2025-06-01T16:35:00.000Z');
  assert.equal(r.height, 5.1);
  assert.equal(nextHighTide(table, new Date('2025-06-02T00:00:00Z')), null);
});
test('alerts still work', () => {
  assert.equal(describeNext(table, new Date('2025-06-01T00:00:00Z')), 'High tide at 04:10Z');
  assert.equal(describeNext(table, new Date('2025-06-03T00:00:00Z')), 'No more high tides');
  assert.equal(minutesUntil(table, new Date('2025-06-01T15:35:00Z')), 60);
  assert.equal(minutesUntil(table, new Date('2025-06-03T00:00:00Z')), null);
});
test('cli still works', () => {
  assert.equal(run('2025-06-01T05:00:00Z'), 'High tide at 16:35Z');
});
