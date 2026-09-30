import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
const { fineCents } = await import(W + '/src/fines.mjs');
const { policySummary } = await import(W + '/src/summary.mjs');
const { terms } = await import(W + '/src/terms.mjs');
const { quickQuote } = await import(W + '/src/quote.mjs');
const { estimate } = await import(W + '/src/estimate.mjs');
const { kioskBanner } = await import(W + '/kiosk/banner.mjs');

test('core fine', () => {
  assert.equal(fineCents(3), 0);
  assert.equal(fineCents(5), 80);
  assert.equal(fineCents(12), 360);
});
test('policy and terms text', () => {
  assert.equal(policySummary(), 'Grace 3 days, then 40 cents/day');
  assert.equal(terms(), 'Late fee: $0.40 per day after a 3-day grace period.');
});
test('quick quote table and fallback', () => {
  assert.equal(quickQuote(2), 0);
  assert.equal(quickQuote(4), 40);
  assert.equal(quickQuote(6), 120);
  assert.equal(quickQuote(10), 280);
  assert.equal(quickQuote(12), 360);
});
test('estimate default rate', () => {
  assert.equal(estimate(6), 120);
  assert.equal(estimate(6, 10), 30);
});
test('kiosk banner', () => {
  assert.equal(kioskBanner(), 'Overdue desk: late fee 40c/day');
});
