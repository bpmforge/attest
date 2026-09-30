import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
const load = () => import(W + '/src/report.mjs');

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

test('depotReport worked examples', async () => {
  const { depotReport } = await load();
  assert.equal(
    depotReport([{ tram: 'T10', meters: 1250 }, { tram: 'T2', meters: 1000 }, { tram: 'T2', meters: 1250 }]),
    'T2: 2.3 km (64.3%)\nT10: 1.3 km (35.7%)\nTotal: 3.5 km');
  assert.equal(depotReport([]), 'Total: 0.0 km');
  assert.equal(
    depotReport([{ tram: 'T5', meters: 1234550 }, { tram: 'T5', meters: 50 }, { tram: 'T3', meters: 'x' }, { tram: 'T3', meters: -40 }, { tram: 'T4' }]),
    'T3: 0.0 km (0.0%)\nT4: 0.0 km (0.0%)\nT5: 1,234.6 km (100.0%)\nTotal: 1,234.6 km');
  assert.equal(
    depotReport([{ tram: 'A1', meters: 1 }, { tram: 'A2', meters: 399 }]),
    'A1: 0.0 km (0.3%)\nA2: 0.4 km (99.8%)\nTotal: 0.4 km');
  assert.equal(
    depotReport([{ tram: 'B1', meters: 100 }, { tram: 'B1', meters: -100 }, { tram: 'B2', meters: 250 }]),
    'B1: 0.1 km (28.6%)\nB2: 0.3 km (71.4%)\nTotal: 0.4 km');
});

test('ordering: letters first, uppercase before lowercase, number numerically, ties first-seen', async () => {
  const { depotReport } = await load();
  const rows = ['t5', 'T10', 'T02', 'B7', 'T2', 'T1', 'A100', 'T11'].map((tram) => ({ tram, meters: 100 }));
  const names = depotReport(rows).split('\n').slice(0, -1).map((l) => l.split(':')[0]);
  assert.deepEqual(names, ['A100', 'B7', 'T1', 'T02', 'T2', 'T10', 'T11', 't5']);
});

test('legs are clamped per trip before summing, shares come from unrounded totals', async () => {
  const { depotReport } = await load();
  // -500 must not cancel the 500 of the same tram; 40+40+40 m must total 0.1 km not 0.0
  assert.equal(
    depotReport([{ tram: 'Z1', meters: 500 }, { tram: 'Z1', meters: -500 }, { tram: 'Z2', meters: 40 }, { tram: 'Z2', meters: 40 }, { tram: 'Z2', meters: 40 }]),
    depotReport([{ tram: 'Z1', meters: 500 }, { tram: 'Z2', meters: 120 }]));
  assert.equal(
    depotReport([{ tram: 'Z1', meters: 500 }, { tram: 'Z1', meters: -500 }, { tram: 'Z2', meters: 40 }, { tram: 'Z2', meters: 40 }, { tram: 'Z2', meters: 40 }]),
    'Z1: 0.5 km (80.6%)\nZ2: 0.1 km (19.4%)\nTotal: 0.6 km');
});

test('depotReport matches an exact-arithmetic oracle on generated depots', async () => {
  const { depotReport } = await load();
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 65536) % n; };
  const trams = ['T2', 'T10', 'T11', 'T02', 't5', 'B7', 'A100', 'T1', 'x'];
  const junk = [undefined, null, -5, NaN, 'abc', Infinity, -Infinity, {}];
  for (let c = 0; c < 250; c++) {
    const trips = [];
    const n = 1 + rnd(14);
    for (let i = 0; i < n; i++) {
      const r = rnd(12);
      const small = rnd(6) === 0;
      const meters = small ? 1 + rnd(40) : r === 0 ? junk[rnd(junk.length)]
        : r === 1 ? -50 * (1 + rnd(40))
        : r < 5 ? 50 * (1 + rnd(400)) + (rnd(3) === 0 ? 0 : 100 * rnd(3))
        : r < 7 ? 1000 * rnd(3000) + 50 * rnd(2)
        : r === 7 ? 1000000000 * rnd(3) + rnd(1000000)
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
