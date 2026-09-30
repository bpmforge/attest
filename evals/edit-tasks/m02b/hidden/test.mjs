import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
const { loadTable } = await import(W + '/src/tides.mjs');
const { describeNext, minutesUntil } = await import(W + '/src/alerts.mjs');
const { run } = await import(W + '/src/cli.mjs');
const { banner } = await import(W + '/web/banner.mjs');
const table = loadTable();
const at = (s) => new Date(s);

test('alert shows height in metres, one decimal', () => {
  assert.equal(describeNext(table, at('2025-06-01T00:00:00Z')), 'High tide at 04:10Z (4.8m)');
  assert.equal(describeNext(table, at('2025-06-01T05:00:00Z')), 'High tide at 16:35Z (5.1m)');
  assert.equal(describeNext(table, at('2025-06-01T17:00:00Z')), 'High tide at 05:00Z (5.0m)');
  assert.equal(describeNext(table, at('2025-06-02T06:00:00Z')), 'No more high tides');
});
test('minutes and cli', () => {
  assert.equal(minutesUntil(table, at('2025-06-01T15:35:00Z')), 60);
  assert.equal(minutesUntil(table, at('2025-06-02T06:00:00Z')), null);
  assert.equal(run('2025-06-01T05:00:00Z'), 'High tide at 16:35Z (5.1m)');
});
test('web banner keeps its wording', () => {
  assert.equal(banner(table, at('2025-06-01T05:00:00Z')), 'Next high: 16:35Z');
  assert.equal(banner(table, at('2025-06-02T06:00:00Z')), 'No high tide today');
});
