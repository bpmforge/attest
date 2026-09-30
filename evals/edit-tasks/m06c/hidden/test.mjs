import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const W = process.env.WORKDIR;
const { sightingsInMonth, brightest } = await import(W + '/src/sightings.mjs');

test('month filter across all feeds, observatory days, stable ties', () => {
  assert.deepEqual(sightingsInMonth(2025, 3), [
    'Bramble', 'Zephyr', 'Quill', 'Bramble', 'Zephyr', 'Hale, Jr.', 'Kite', 'Lyra', 'Vega Tail', 'Orion Dust', 'Cinder',
  ]);
  assert.deepEqual(sightingsInMonth(2025, 2), ['Halley-Ish', 'Dust Bunny', 'Aster']);
  assert.deepEqual(sightingsInMonth(2025, 4), ['Nova Kite', 'Zephyr']);
  assert.deepEqual(sightingsInMonth(2024, 3), ['Old Timer']);
  assert.deepEqual(sightingsInMonth(2025, 12), []);
});
test('brightest still correct', () => {
  assert.equal(brightest().comet, 'Hale, Jr.');
  assert.equal(brightest().magnitude, 2.8);
});
test('works on different data', async () => {
  const d = mkdtempSync(join(tmpdir(), 'm06c-'));
  cpSync(W, d, { recursive: true });
  writeFileSync(join(d, 'data/sightings.csv'), [
    'date,comet,magnitude',
    '2026-07-04,"Lee, the Third",1.5',
    '09/07/2026,Aster,3.0',
    '01/07/2026,"Bo, Peep",7.1',
    '30/06/2026,Cinder,4.0',
  ].join('\n') + '\n');
  writeFileSync(join(d, 'data/amateur.json'), JSON.stringify([
    { object: 'Moth', seen: '04/07/2026', mag: 5 },
    { object: 'Ember', seen: '2026-07-01', mag: 6 },
  ]));
  writeFileSync(join(d, 'data/radio.log'), [
    '2026-07-01T04:59:59Z\tDusk\t6.6',
    '2026-07-01T05:00:00Z\tDawn\t0.5',
    '2026-08-01T04:00:00Z\tLate\t3.3',
    '2026-07-04T23:00:00Z\tEve\t2.2',
  ].join('\n') + '\n');
  const m = await import(d + '/src/sightings.mjs');
  assert.deepEqual(m.sightingsInMonth(2026, 7), ['Bo, Peep', 'Ember', 'Dawn', 'Lee, the Third', 'Moth', 'Eve', 'Aster', 'Late']);
  assert.deepEqual(m.sightingsInMonth(2026, 6), ['Cinder', 'Dusk']);
  assert.deepEqual(m.sightingsInMonth(2026, 8), []);
  assert.equal(m.brightest().comet, 'Dawn');
});
