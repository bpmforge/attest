import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const W = process.env.WORKDIR;
const load = async (root) => ({
  ...(await import(root + '/src/readings.mjs')),
  ...(await import(root + '/src/alerts.mjs')),
  ...(await import(root + '/src/cli.mjs')),
  ...(await import(root + '/dashboard/status.mjs')),
});
const m = await load(W);
const table = m.loadReadings();
const at = (s) => new Date(s);

test('alert shows Celsius with one decimal for every source format', () => {
  assert.equal(m.alertFor(table, at('2025-07-01T00:00:00Z')), 'Heat alert: Bed A at 06:30 (31.4C)');
  assert.equal(m.alertFor(table, at('2025-07-01T10:00:00Z')), 'Heat alert: Vents at 13:45 (36.1C)');
  assert.equal(m.alertFor(table, at('2025-07-01T16:00:00Z')), 'Heat alert: Bed B at 18:20 (35.2C)');
  assert.equal(m.alertFor(table, at('2025-07-02T00:00:00Z')), 'Heat alert: Bed C at 02:15 (33.0C)');
  assert.equal(m.alertFor(table, at('2025-07-02T03:00:00Z')), 'All zones normal');
});
test('minutes and cli', () => {
  assert.equal(m.minutesUntil(table, at('2025-07-01T12:45:00Z')), 60);
  assert.equal(m.minutesUntil(table, at('2025-07-02T03:00:00Z')), null);
  assert.equal(m.run('2025-07-01T10:00:00Z'), 'Heat alert: Vents at 13:45 (36.1C)');
});
test('dashboard keeps its wording', () => {
  assert.equal(m.statusLine(table, at('2025-07-01T10:00:00Z')), 'ATTENTION Vents @ 13:45');
  assert.equal(m.statusLine(table, at('2025-07-01T16:00:00Z')), 'ATTENTION Bed B @ 18:20');
  assert.equal(m.statusLine(table, at('2025-07-02T03:00:00Z')), 'Greenhouse OK');
});
test('app entry point prints both lines', () => {
  const out = execFileSync('node', [W + '/app.mjs', '2025-07-01T10:00:00Z'], { encoding: 'utf8' });
  assert.equal(out, 'Heat alert: Vents at 13:45 (36.1C)\nATTENTION Vents @ 13:45\n');
});
test('not hard-coded: mutated data', async () => {
  const d = mkdtempSync(join(tmpdir(), 'm11-'));
  cpSync(W, d, { recursive: true });
  writeFileSync(d + '/data/readings.json', JSON.stringify([
    { t: '2026-01-05T01:00:00Z', zone: 'North Bench', temp: '104F', flag: 'hot' },
    { t: '2026-01-05T02:00:00Z', zone: 'Mist Room', temp: 40, flag: 'hot' },
    { t: '2026-01-05T03:00:00Z', zone: 'Seedlings', temp: '29.96°C', flag: 'hot' },
    { t: '2026-01-05T04:00:00Z', zone: 'Loft', temp: '86F', flag: 'hot' },
    { t: '2026-01-05T05:00:00Z', zone: 'Loft', temp: 12, flag: 'ok' },
  ]));
  const x = await load(d);
  const t = x.loadReadings();
  assert.equal(x.alertFor(t, at('2026-01-05T00:00:00Z')), 'Heat alert: North Bench at 01:00 (40.0C)');
  assert.equal(x.alertFor(t, at('2026-01-05T01:30:00Z')), 'Heat alert: Mist Room at 02:00 (40.0C)');
  assert.equal(x.alertFor(t, at('2026-01-05T02:30:00Z')), 'Heat alert: Seedlings at 03:00 (30.0C)');
  assert.equal(x.alertFor(t, at('2026-01-05T03:30:00Z')), 'Heat alert: Loft at 04:00 (30.0C)');
  assert.equal(x.statusLine(t, at('2026-01-05T01:30:00Z')), 'ATTENTION Mist Room @ 02:00');
  assert.equal(x.statusLine(t, at('2026-01-05T04:30:00Z')), 'Greenhouse OK');
});
