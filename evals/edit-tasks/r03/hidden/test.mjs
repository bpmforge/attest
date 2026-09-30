import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
test('depotReport totals, rounds half-up, sorts naturally', async () => {
  const { depotReport } = await import(W + '/src/report.mjs');
  const out = depotReport([
    { tram: 'T10', meters: 1150 },
    { tram: 'T2', meters: 1000 },
    { tram: 'T2', meters: 1150 },
  ]);
  assert.equal(out, 'T2: 2.2 km\nT10: 1.2 km');
});
test('existing fleet code still works', async () => {
  const { tramLine } = await import(W + '/src/index.mjs');
  assert.equal(tramLine('T2', 1150), 'T2 ran 1.2 km today');
});
