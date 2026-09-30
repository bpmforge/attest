import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const load = (p) => import(pathToFileURL(process.env.WORKDIR + p).href);
test('invoiceTotal sums exact charges', async () => {
  const { invoiceTotal } = await load('/src/invoice.mjs');
  assert.equal(invoiceTotal([{ tons: 10, ratePerTon: 2.5 }, { tons: 4, ratePerTon: 1 }]), 29);
  assert.equal(invoiceTotal([]), 0);
});
test('each line follows the harbour rounding rule before summing', async () => {
  const { invoiceTotal } = await load('/src/invoice.mjs');
  // 3 * 0.11 = 0.33 -> 0.35 ; 7 * 0.11 = 0.77 -> 0.80 ; total 1.15 (unrounded sum 1.10)
  assert.equal(invoiceTotal([{ tons: 3, ratePerTon: 0.11 }, { tons: 7, ratePerTon: 0.11 }]), 1.15);
  // 0.1 * 3 float noise (0.30000000000000004) must stay 0.30
  assert.equal(invoiceTotal([{ tons: 3, ratePerTon: 0.1 }]), 0.3);
});
test('result is a clean 2-decimal number', async () => {
  const { invoiceTotal } = await load('/src/invoice.mjs');
  const t = invoiceTotal([{ tons: 3, ratePerTon: 0.11 }, { tons: 3, ratePerTon: 0.11 }, { tons: 3, ratePerTon: 0.11 }]);
  assert.equal(t, 1.05);
});
