import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
const { fineCents } = await import(W + '/src/fines.mjs');
const { overdueNotice } = await import(W + '/src/notices.mjs');
const { policySummary } = await import(W + '/src/summary.mjs');

test('fines respect 5-day grace', () => {
  assert.equal(fineCents(5), 0);
  assert.equal(fineCents(6), 25);
  assert.equal(fineCents(10), 125);
});
test('notices agree with grace', () => {
  assert.match(overdueNotice('Dune', 4), /within grace/);
  assert.match(overdueNotice('Dune', 5), /within grace/);
  assert.equal(overdueNotice('Dune', 6), 'Dune is 6d late; fine 25 cents');
  assert.equal(overdueNotice('Dune', 0), 'Dune is not overdue');
});
test('policy summary agrees', () => {
  assert.equal(policySummary(), 'Grace 5 days, then 25 cents/day');
});
