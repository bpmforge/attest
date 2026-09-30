import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NEW = 'kayak-double';
const W = process.env.WORKDIR;

async function load(dir) {
  const m = async (p) => import(dir + p + '?v=' + Math.random());
  return {
    ...(await m('/src/fleet.mjs')), ...(await m('/src/rates.mjs')), ...(await m('/src/revenue.mjs')),
    ...(await m('/src/service.mjs')), ...(await m('/src/briefing.mjs')), ...(await m('/src/cli.mjs')),
  };
}

test('renamed boat end to end', async () => {
  const a = await load(W);
  assert.equal(a.getBoat(NEW).name, 'Double Kayak');
  assert.throws(() => a.getBoat('kayak-2'), /unknown boat: kayak-2/);
  assert.equal(a.rate(NEW, 'hourly'), 18);
  assert.equal(a.rate(NEW, 'daily'), 70);
  assert.equal(a.special(), 'Weekend special: Double Kayak $70.00/day');
  assert.deepEqual(a.revenueReport(), ['Double Kayak: $72.00', 'Canoe: $30.00', 'Paddleboard: $48.00']);
  assert.equal(a.lastService(NEW), '2026-02-10');
  assert.deepEqual(await a.briefing(NEW), { boat: NEW, rules: ['life jackets on', 'stay within buoys'] });
  assert.equal(await a.run(), 'Double Kayak | $18.00/h | serviced 2026-02-10 | briefing: life jackets on');
  assert.equal(await a.run('canoe'), 'Canoe | $15.00/h | serviced 2026-03-01 | briefing: sit low');
});

test('every data source and module is really keyed by the new id (mutated copy)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'm10-'));
  cpSync(W, d, { recursive: true });
  const edit = (f, fn) => { const p = join(d, f); const j = JSON.parse(readFileSync(p, 'utf8')); fn(j); writeFileSync(p, JSON.stringify(j)); };
  edit('data/rates.json', (j) => { assert.ok(`${NEW}/hourly` in j && `${NEW}/daily` in j); j[`${NEW}/hourly`] = 2000; j[`${NEW}/daily`] = 8000; });
  edit('data/bookings.json', (j) => { const mine = j.filter((x) => x.boat === NEW); assert.equal(mine.length, 2); mine[0].hours = 5; });
  edit('data/service.json', (j) => { const r = j.find((x) => x[0] === NEW); assert.ok(r); r[1] = '2026-09-09'; });
  assert.ok(existsSync(join(d, 'src/briefings', NEW + '.mjs')));
  writeFileSync(join(d, 'src/briefings', NEW + '.mjs'), `export default { boat: '${NEW}', rules: ['helmets on'] };\n`);
  const b = await load(d);
  assert.equal(b.special(), 'Weekend special: Double Kayak $80.00/day');
  assert.deepEqual(b.revenueReport(), ['Double Kayak: $120.00', 'Canoe: $30.00', 'Paddleboard: $48.00']);
  assert.equal(await b.run(), 'Double Kayak | $20.00/h | serviced 2026-09-09 | briefing: helmets on');
});
