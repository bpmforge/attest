import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeChange,
  applyDiscount,
  formatMoney,
  isValidPrice,
  dailyTotal,
  addSale,
} from './cashbox.mjs';

test('makeChange uses the fewest coins (quarters before dimes)', () => {
  assert.deepEqual(makeChange(25), { quarters: 1, dimes: 0, nickels: 0, pennies: 0 });
  assert.deepEqual(makeChange(40), { quarters: 1, dimes: 1, nickels: 1, pennies: 0 });
  assert.deepEqual(makeChange(99), { quarters: 3, dimes: 2, nickels: 0, pennies: 4 });
});

test('applyDiscount treats percent as a percentage', () => {
  assert.equal(applyDiscount(100, 20), 80);
  assert.equal(applyDiscount(250, 10), 225);
  assert.equal(applyDiscount(199, 0), 199);
});

test('formatMoney zero-pads the cents', () => {
  assert.equal(formatMoney(305), '$3.05');
  assert.equal(formatMoney(1200), '$12.00');
  assert.equal(formatMoney(99), '$0.99');
});

test('isValidPrice requires a positive whole number of cents', () => {
  assert.equal(isValidPrice(150), true);
  assert.equal(isValidPrice(0), false);
  assert.equal(isValidPrice(-5), false);
  assert.equal(isValidPrice(1.5), false);
  assert.equal(isValidPrice('150'), false);
});

test('dailyTotal excludes refunded sales', () => {
  const ledger = [
    { item: 'cup', price: 150, refunded: false },
    { item: 'cup', price: 150, refunded: true },
    { item: 'jug', price: 500, refunded: false },
  ];
  assert.equal(dailyTotal(ledger), 650);
});

test('addSale does not mutate the input ledger', () => {
  const original = [{ item: 'cup', price: 150, refunded: false }];
  const updated = addSale(original, 'jug', 500);
  assert.equal(original.length, 1);
  assert.equal(updated.length, 2);
  assert.equal(updated[1].item, 'jug');
});
