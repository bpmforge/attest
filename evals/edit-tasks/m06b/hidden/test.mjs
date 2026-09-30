import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const W = process.env.WORKDIR;
const { sightingsInMonth, brightest } = await import(W + '/src/sightings.mjs');

test('month filter across both sources, chronological, stable ties', () => {
  assert.deepEqual(sightingsInMonth(2025, 3), ['Bramble', 'Zephyr', 'Bramble', 'Zephyr', 'Hale, Jr.', 'Kite', 'Vega Tail']);
  assert.deepEqual(sightingsInMonth(2025, 2), ['Halley-Ish', 'Dust Bunny']);
  assert.deepEqual(sightingsInMonth(2025, 4), ['Nova Kite', 'Zephyr']);
  assert.deepEqual(sightingsInMonth(2024, 3), ['Old Timer']);
  assert.deepEqual(sightingsInMonth(2025, 12), []);
});
test('brightest still correct (quoted names, both sources)', () => {
  assert.equal(brightest().comet, 'Hale, Jr.');
  assert.equal(brightest().magnitude, 2.8);
});
test('works on different data', async () => {
  const d = mkdtempSync(join(tmpdir(), 'm06b-'));
  cpSync(W, d, { recursive: true });
  writeFileSync(join(d, 'data/sightings.csv'), [
    'date,comet,magnitude',
    '2026-07-04,"Lee, the Third",1.5',
    '09/07/2026,Aster,3.0',
    '01/07/2026,"Bo, Peep",7.1',
    '2026-08-01,Aster,2.0',
    '30/06/2026,Cinder,4.0',
  ].join('\n') + '\n');
  writeFileSync(join(d, 'data/amateur.json'), JSON.stringify([
    { object: 'Moth', seen: '04/07/2026', mag: 5 },
    { object: 'Ember', seen: '2026-07-01', mag: 6 },
    { object: 'Frost', seen: '2026-06-30', mag: 0.5 },
  ]));
  const m = await import(d + '/src/sightings.mjs');
  assert.deepEqual(m.sightingsInMonth(2026, 7), ['Bo, Peep', 'Ember', 'Lee, the Third', 'Moth', 'Aster']);
  assert.deepEqual(m.sightingsInMonth(2026, 6), ['Cinder', 'Frost']);
  assert.deepEqual(m.sightingsInMonth(2026, 8), ['Aster']);
  assert.equal(m.brightest().comet, 'Frost');
});
