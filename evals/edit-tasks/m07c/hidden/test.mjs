import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const W = process.env.WORKDIR;
test('boardLines lists the whole rota in date order', async () => {
  const { boardLines } = await import(W + '/src/board.mjs');
  assert.deepEqual(boardLines(), [
    'Cleo @ East, 2026-09-15',
    'Fay @ East, 2026-09-15',
    'Ada @ North, 2026-09-29',
    'Dov @ North, 2026-09-29',
    'Hal @ West, 2026-09-29',
    'Gus @ West, 2026-09-30',
    'Bram @ South, 2026-10-02',
    'Eli @ South, 2026-10-02',
  ]);
});
test('works on different rota data', async () => {
  const d = mkdtempSync(join(tmpdir(), 'm07c-'));
  cpSync(W, d, { recursive: true });
  writeFileSync(join(d, 'data/rota.json'), JSON.stringify([
    { fmt: 'b', keeper: 'Zed', station: 'W', starts: '2027-01-01T03:00:00Z' },
    { fmt: 'a', who: 'Yan', tower: 'East', on: '31/12/2026' },
    { fmt: 'c', who: 'Xia', tower: 'North', epochDay: 20819 },
    { fmt: 'b', keeper: 'Abe', station: 'E', starts: '2027-01-01T04:00:00Z' },
    { fmt: 'c', who: 'Wes', tower: 'South', epochDay: 20818 },
    { fmt: 'b', keeper: 'Ben', station: 'N', starts: '2026-12-31T23:59:59Z' },
  ]));
  const { boardLines } = await import(d + '/src/board.mjs');
  assert.deepEqual(boardLines(), [
    'Ben @ North, 2026-12-31',
    'Wes @ South, 2026-12-31',
    'Yan @ East, 2026-12-31',
    'Zed @ West, 2026-12-31',
    'Abe @ East, 2027-01-01',
    'Xia @ North, 2027-01-01',
  ]);
});
test('existing modules untouched', async () => {
  const { towerName } = await import(W + '/src/towers.mjs');
  const { stationDay } = await import(W + '/src/clock.mjs');
  const { stats } = await import(W + '/src/rota.mjs');
  assert.equal(towerName('W'), 'West');
  assert.equal(stationDay('2026-10-01T03:59:00Z'), '2026-09-30');
  assert.equal(stats.total, 8);
});
