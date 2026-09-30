import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NEW = 'monstera-deliciosa';
const W = process.env.WORKDIR;

async function load(dir) {
  const m = async (p) => import(dir + p + '?v=' + Math.random());
  return {
    ...(await m('/src/species.mjs')), ...(await m('/src/stock.mjs')), ...(await m('/src/pricing.mjs')),
    ...(await m('/src/care.mjs')), ...(await m('/src/board.mjs')), ...(await m('/src/cli.mjs')),
  };
}

test('renamed species end to end', async () => {
  const a = await load(W);
  assert.equal(a.getSpecies(NEW).name, 'Monstera');
  assert.throws(() => a.getSpecies('monstera'), /unknown species: monstera/);
  assert.equal(a.label(NEW), 'Monstera $18.00');
  assert.equal(a.inStock(NEW), 7);
  assert.deepEqual(a.shelfBoard(), ['Fern $14.00 (14 left)', 'Monstera $18.00 (7 left)', 'Cactus $8.10 (20 left)']);
  assert.equal(a.featured(), 'Featured: Monstera $18.00');
  assert.deepEqual(await a.care(NEW), { id: NEW, water: 'weekly' });
  assert.equal((await a.care('cactus')).water, 'monthly');
  assert.equal(await a.run(), 'Monstera $18.00 | 7 in stock | water weekly');
});

test('every data source and module is really keyed by the new id (mutated copy)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'm09-'));
  cpSync(W, d, { recursive: true });
  const edit = (f, fn) => { const p = join(d, f); const j = JSON.parse(readFileSync(p, 'utf8')); fn(j); writeFileSync(p, JSON.stringify(j)); };
  edit('data/species.json', (j) => { const s = j.species.find((x) => x.id === NEW); assert.ok(s); s.cents = 3000; });
  edit('data/stock.json', (j) => { assert.ok(NEW in j); j[NEW] = 99; });
  edit('data/sale.json', (j) => { assert.ok(NEW in j); j[NEW] = 0.5; });
  edit('data/shelves.json', (j) => { assert.ok(j.order.includes(NEW)); j.order.reverse(); });
  assert.ok(existsSync(join(d, 'src/care', NEW + '.mjs')));
  writeFileSync(join(d, 'src/care', NEW + '.mjs'), `export default { id: '${NEW}', water: 'daily' };\n`);
  const b = await load(d);
  assert.deepEqual(b.shelfBoard(), ['Cactus $8.10 (20 left)', 'Monstera $15.00 (99 left)', 'Fern $14.00 (14 left)']);
  assert.equal(b.featured(), 'Featured: Monstera $15.00');
  assert.equal(await b.run(), 'Monstera $15.00 | 99 in stock | water daily');
});
