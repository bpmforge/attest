import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
const { getItem } = await import(W + '/src/menu.mjs');
const { label } = await import(W + '/src/label.mjs');
const { inStock } = await import(W + '/src/stock.mjs');
const { menuBoard } = await import(W + '/src/board.mjs');
const { special } = await import(W + '/src/promo.mjs');
const { recipe } = await import(W + '/src/recipes.mjs');
const { run } = await import(W + '/src/cli.mjs');

test('menu uses the new sku, keeps the name', () => {
  assert.equal(getItem('choc-eclair').name, 'Eclair');
  assert.throws(() => getItem('eclair'), /unknown sku: eclair/);
  assert.equal(label('choc-eclair'), 'Eclair $3.95');
});
test('stock follows the new sku', () => {
  assert.equal(inStock('choc-eclair'), 6);
  assert.equal(inStock('baguette'), 8);
});
test('board and special', () => {
  assert.deepEqual(menuBoard(), ['Croissant $3.25', 'Eclair $3.95', 'Baguette $4.50']);
  assert.equal(special(), 'Special today: Eclair $3.95');
});
test('recipes', async () => {
  const r = await recipe('choc-eclair');
  assert.equal(r.sku, 'choc-eclair');
  assert.ok(r.steps.length > 0);
  assert.equal((await recipe('croissant')).sku, 'croissant');
});
test('cli quick order', () => {
  assert.equal(run(), 'Quick order: 2 x Eclair $3.95 = $7.90');
});
