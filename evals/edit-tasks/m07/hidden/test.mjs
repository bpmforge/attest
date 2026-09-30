import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
test('boardLines lists the rota in date order', async () => {
  const { boardLines } = await import(W + '/src/board.mjs');
  assert.deepEqual(boardLines(), [
    'Cleo @ East, 2026-09-15',
    'Ada @ North, 2026-09-29',
    'Bram @ South, 2026-10-02',
  ]);
});
test('data file and existing modules untouched', async () => {
  const { readData, lampOil } = await import(W + '/src/index.mjs');
  const rota = readData('rota');
  assert.equal(rota.length, 3);
  assert.deepEqual(rota[0], { who: 'Bram', tower: 'South', on: '02/10/2026' });
  assert.equal(lampOil(10), 4);
});
