import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
const { orderTotal, describeOrder } = await import(W + '/src/order.mjs');
const { label } = await import(W + '/src/label.mjs');

test('total sums menu prices in dollars', () => {
  assert.equal(orderTotal([{ sku: 'croissant', qty: 3 }]), 9.75);
  assert.equal(orderTotal([{ sku: 'baguette', qty: 1 }, { sku: 'eclair', qty: 2 }]), 12.4);
  assert.equal(orderTotal([]), 0);
});
test('unknown sku still throws', () => {
  assert.throws(() => orderTotal([{ sku: 'nope', qty: 1 }]), /unknown sku: nope/);
});
test('existing label/describe untouched', () => {
  assert.equal(label('eclair'), 'Eclair $3.95');
  assert.equal(describeOrder([{ sku: 'baguette', qty: 2 }]), '2 x Baguette $4.50');
});
