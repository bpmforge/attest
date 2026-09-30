import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
const load = () => import(W + '/src/report.mjs');

test('depotReport worked examples', async () => {
  const { depotReport } = await load();
  assert.equal(
    depotReport([{ tram: 'T10', meters: 1150 }, { tram: 'T2', meters: 1000 }, { tram: 'T2', meters: 1150 }]),
    'T2: 2.2 km (65.2%)\nT10: 1.2 km (34.8%)\nTotal: 3.3 km');
  assert.equal(depotReport([]), 'Total: 0.0 km');
  assert.equal(
    depotReport([{ tram: 'A1', meters: 23 }, { tram: 'A2', meters: 1977 }]),
    'A1: 0.0 km (1.2%)\nA2: 2.0 km (98.9%)\nTotal: 2.0 km');
  assert.equal(
    depotReport([{ tram: 'T5', meters: 1234550 }, { tram: 'T5', meters: 50 }, { tram: 'T3', meters: 'x' }, { tram: 'T3', meters: -40 }, { tram: 'T4' }]),
    'T3: 0.0 km (0.0%)\nT4: 0.0 km (0.0%)\nT5: 1,234.6 km (100.0%)\nTotal: 1,234.6 km');
  assert.equal(
    depotReport([{ tram: 'x', meters: 0 }]),
    'x: 0.0 km (0.0%)\nTotal: 0.0 km');
});

test('ordering: letters first, uppercase before lowercase, number numerically, ties first-seen', async () => {
  const { depotReport } = await load();
  const rows = ['t5', 'T10', 'T02', 'B7', 'T2', 'T1', 'A100', 'T11'].map((tram) => ({ tram, meters: 100 }));
  const names = depotReport(rows).split('\n').slice(0, -1).map((l) => l.split(':')[0]);
  assert.deepEqual(names, ['A100', 'B7', 'T1', 'T02', 'T2', 'T10', 'T11', 't5']);
});

// independent BigInt oracle
function oracle(trips) {
  const tot = new Map();
  for (const t of trips) {
    const n = Number(t.meters);
    const m = BigInt(Number.isFinite(n) && n >= 0 ? n : 0);
    tot.set(t.tram, (tot.get(t.tram) ?? 0n) + m);
  }
  let grand = 0n;
  for (const v of tot.values()) grand += v;
  const km = (m) => {
    const tn = (2n * m + 100n) / 200n;
    return `${(tn / 10n).toString().replace(/\B(?=(\d{3})+$)/g, ',')}.${tn % 10n} km`;
  };
  const pc = (m) => {
    if (grand === 0n) return '0.0%';
    const tn = (2000n * m + grand) / (2n * grand);
    return `${tn / 10n}.${tn % 10n}%`;
  };
  const key = (s) => { const [, p, n] = /^(\D*)(\d*)$/.exec(s); return [p, Number(n || 0)]; };
  const keys = [...tot.keys()].sort((a, b) => {
    const [pa, na] = key(a), [pb, nb] = key(b);
    return pa === pb ? na - nb : pa < pb ? -1 : 1;
  });
  return [...keys.map((k) => `${k}: ${km(tot.get(k))} (${pc(tot.get(k))})`), `Total: ${km(grand)}`].join('\n');
}

test('depotReport matches an exact-arithmetic oracle on generated depots', async () => {
  const { depotReport } = await load();
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const trams = ['T2', 'T10', 'T11', 'T02', 't5', 'B7', 'A100', 'T1'];
  const junk = [undefined, null, -5, NaN, 'abc', Infinity];
  for (let c = 0; c < 150; c++) {
    const trips = [];
    const n = 1 + rnd(14);
    for (let i = 0; i < n; i++) {
      const r = rnd(10);
      const meters = r === 0 ? junk[rnd(junk.length)]
        : r < 4 ? 50 * (1 + rnd(400)) + (rnd(3) === 0 ? 0 : 100 * rnd(3))
        : r < 6 ? 1000 * rnd(3000) + 50 * rnd(2)
        : rnd(200000);
      trips.push({ tram: trams[rnd(trams.length)], meters });
    }
    assert.equal(depotReport(trips), oracle(trips), JSON.stringify(trips));
  }
});

test('existing fleet code still works', async () => {
  const { tramLine } = await import(W + '/src/index.mjs');
  assert.equal(tramLine('T2', 1150), 'T2 ran 1.2 km today');
});
