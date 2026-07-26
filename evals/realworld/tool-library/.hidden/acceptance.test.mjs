// HIDDEN acceptance suite — the models must NEVER see this file.
// It is written from BRIEF.md + CONTRACT.md only, before either model runs.
//
// Why hidden: a model that writes its own tests proves only that it tested what
// it built. This suite measures "did you build what was asked", which is the
// question the client actually has.
//
// Run: node --test --test-reporter=tap acceptance.test.mjs
// Expects LIB_PATH env var pointing at the candidate's src/library.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createLibrary } = await import(process.env.LIB_PATH);

const M = (over = {}) => ({ id: 'm1', name: 'Ann', tier: 'basic', staff: false, ...over });
const T = (over = {}) => ({ id: 't1', name: 'Drill', status: 'available', replacementValuePence: 5000, ...over });
const base = (over = {}) => ({
  members: [M(), M({ id: 'm2', name: 'Bo' }), M({ id: 's1', name: 'Staff', staff: true })],
  tools: [T(), T({ id: 't2', name: 'Mower' }), T({ id: 't3', name: 'Saw' }),
          T({ id: 't4', name: 'Sander' }), T({ id: 't5', name: 'Hedger' }),
          T({ id: 't6', name: 'Auger' })],
  loans: [], reservations: [], fees: [], stocktakeDate: '2026-09-01', ...over,
});
const lib = (over) => createLibrary(base(over));

// ── Rule 1 — hold limits by tier
test('R1a basic member blocked at 2 held tools', () => {
  const L = lib({ loans: [
    { id: 'l1', memberId: 'm1', toolId: 't1', startDate: '2026-03-01', dueDate: '2026-03-15', returnedDate: null, renewed: false },
    { id: 'l2', memberId: 'm1', toolId: 't2', startDate: '2026-03-01', dueDate: '2026-03-15', returnedDate: null, renewed: false },
  ] });
  const r = L.borrow('m1', 't3', '2026-03-02');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'AT_HOLD_LIMIT');
});

test('R1b patron may hold 5, blocked at 6th', () => {
  const loans = ['t1', 't2', 't3', 't4', 't5'].map((t, i) => ({
    id: `l${i}`, memberId: 'p1', toolId: t, startDate: '2026-03-01', dueDate: '2026-03-22', returnedDate: null, renewed: false }));
  const L = lib({ members: [M({ id: 'p1', tier: 'patron' })], loans });
  assert.equal(L.borrow('p1', 't6', '2026-03-02').reason, 'AT_HOLD_LIMIT');
});

test('R1c returned loans do not count toward the limit', () => {
  const L = lib({ loans: [
    { id: 'l1', memberId: 'm1', toolId: 't1', startDate: '2026-03-01', dueDate: '2026-03-15', returnedDate: '2026-03-05', renewed: false },
    { id: 'l2', memberId: 'm1', toolId: 't2', startDate: '2026-03-01', dueDate: '2026-03-15', returnedDate: null, renewed: false },
  ] });
  assert.equal(lib().borrow('m1', 't3', '2026-03-06').ok, true);
  assert.equal(L.borrow('m1', 't3', '2026-03-06').ok, true);
});

// ── Rule 2 — loan periods
test('R2a basic loan is 14 days', () => {
  assert.equal(lib().borrow('m1', 't1', '2026-03-01').dueDate, '2026-03-15');
});

test('R2b patron loan is 21 days', () => {
  const L = lib({ members: [M({ id: 'p1', tier: 'patron' })] });
  assert.equal(L.borrow('p1', 't1', '2026-03-01').dueDate, '2026-03-22');
});

// ── Rule 3 — overdue fees, integer pence, capped at replacement value
test('R3a fee is 50p per day late', () => {
  const L = lib({ loans: [{ id: 'l1', memberId: 'm1', toolId: 't1', startDate: '2026-03-01', dueDate: '2026-03-15', returnedDate: null, renewed: false }] });
  const r = L.returnTool('l1', '2026-03-19');   // 4 days late
  assert.equal(r.ok, true);
  assert.equal(r.feePence, 200);
  assert.equal(Number.isInteger(r.feePence), true);
});

test('R3b no fee when returned on or before the due date', () => {
  const L = lib({ loans: [{ id: 'l1', memberId: 'm1', toolId: 't1', startDate: '2026-03-01', dueDate: '2026-03-15', returnedDate: null, renewed: false }] });
  assert.equal(L.returnTool('l1', '2026-03-15').feePence, 0);
});

test('R3c fee is capped at the tool replacement value', () => {
  const L = lib({
    tools: [T({ replacementValuePence: 300 })],
    loans: [{ id: 'l1', memberId: 'm1', toolId: 't1', startDate: '2026-01-01', dueDate: '2026-01-15', returnedDate: null, renewed: false }],
  });
  const r = L.returnTool('l1', '2026-06-01');   // wildly late
  assert.equal(r.feePence, 300);
});

// ── Rule 4 — maintenance
test('R4 tool in maintenance cannot be borrowed', () => {
  const L = lib({ tools: [T({ status: 'maintenance' })] });
  const r = L.borrow('m1', 't1', '2026-03-01');
  assert.equal(r.ok, false);
  assert.match(r.reason, /TOOL_IN_MAINTENANCE|TOOL_UNAVAILABLE/);
});

// ── Rule 5 — renew once, and not if reserved
test('R5a renewal extends by a full loan period', () => {
  const L = lib({ loans: [{ id: 'l1', memberId: 'm1', toolId: 't1', startDate: '2026-03-01', dueDate: '2026-03-15', returnedDate: null, renewed: false }] });
  const r = L.renew('l1', '2026-03-10');
  assert.equal(r.ok, true);
  assert.equal(r.dueDate, '2026-03-29');
});

test('R5b a second renewal is refused', () => {
  const L = lib({ loans: [{ id: 'l1', memberId: 'm1', toolId: 't1', startDate: '2026-03-01', dueDate: '2026-03-15', returnedDate: null, renewed: true }] });
  assert.equal(L.renew('l1', '2026-03-10').reason, 'ALREADY_RENEWED');
});

test('R5c renewal refused when another member has reserved the tool', () => {
  const L = lib({
    loans: [{ id: 'l1', memberId: 'm1', toolId: 't1', startDate: '2026-03-01', dueDate: '2026-03-15', returnedDate: null, renewed: false }],
    reservations: [{ id: 'r1', memberId: 'm2', toolId: 't1', createdDate: '2026-03-09' }],
  });
  assert.equal(L.renew('l1', '2026-03-10').reason, 'RESERVED_BY_OTHER');
});

// ── Rule 6 — reservations expire after 3 days
test('R6 an expired reservation does not block renewal', () => {
  const L = lib({
    loans: [{ id: 'l1', memberId: 'm1', toolId: 't1', startDate: '2026-03-01', dueDate: '2026-03-15', returnedDate: null, renewed: false }],
    reservations: [{ id: 'r1', memberId: 'm2', toolId: 't1', createdDate: '2026-03-01' }],
  });
  assert.equal(L.renew('l1', '2026-03-10').ok, true);   // reservation is 9 days old
});

// ── Rule 7 — fee threshold is STRICTLY more than £10
test('R7a owing more than £10 blocks borrowing', () => {
  const L = lib({ fees: [{ id: 'f1', memberId: 'm1', amountPence: 1001, paid: false }] });
  assert.equal(L.borrow('m1', 't1', '2026-03-01').reason, 'FEES_OUTSTANDING');
});

test('R7b owing exactly £10 does NOT block borrowing', () => {
  const L = lib({ fees: [{ id: 'f1', memberId: 'm1', amountPence: 1000, paid: false }] });
  assert.equal(L.borrow('m1', 't1', '2026-03-01').ok, true);
});

test('R7c paid fees do not count toward the threshold', () => {
  const L = lib({ fees: [{ id: 'f1', memberId: 'm1', amountPence: 50000, paid: true }] });
  assert.equal(L.borrow('m1', 't1', '2026-03-01').ok, true);
});

// ── Rule 8 — authorization. The trustees' hard requirement.
test('R8a non-staff cannot set maintenance', () => {
  assert.equal(lib().setMaintenance('m1', 't1', true, '2026-03-01').reason, 'NOT_STAFF');
});

test('R8b non-staff cannot waive a fee', () => {
  const L = lib({ fees: [{ id: 'f1', memberId: 'm1', amountPence: 500, paid: false }] });
  assert.equal(L.waiveFee('m1', 'f1', '2026-03-01').reason, 'NOT_STAFF');
});

test('R8c staff CAN do both', () => {
  const L = lib({ fees: [{ id: 'f1', memberId: 'm1', amountPence: 500, paid: false }] });
  assert.equal(L.setMaintenance('s1', 't1', true, '2026-03-01').ok, true);
  assert.equal(L.waiveFee('s1', 'f1', '2026-03-01').ok, true);
});

// ── Rule 9 — stocktake day
test('R9 no loans go out on the stocktake day', () => {
  assert.equal(lib().borrow('m1', 't1', '2026-09-01').reason, 'STOCKTAKE_CLOSED');
});

// ── Rule 10 — late return suspends renewal for 30 days
test('R10 renewal is suspended for 30 days after a late return', () => {
  const L = lib({ loans: [
    { id: 'l1', memberId: 'm1', toolId: 't1', startDate: '2026-03-01', dueDate: '2026-03-15', returnedDate: null, renewed: false },
    { id: 'l2', memberId: 'm1', toolId: 't2', startDate: '2026-03-01', dueDate: '2026-03-20', returnedDate: null, renewed: false },
  ] });
  L.returnTool('l1', '2026-03-18');                       // 3 days late
  assert.equal(L.renew('l2', '2026-03-19').reason, 'RENEWAL_SUSPENDED');
});

// ── Contract-level requirements
test('C1 refusals carry a human-readable message, not a bare code', () => {
  const r = lib().borrow('m1', 't1', '2026-09-01');
  assert.equal(r.ok, false);
  assert.equal(typeof r.message, 'string');
  assert.ok(r.message.length > 15, 'message must be a sentence a volunteer can read aloud');
  assert.notEqual(r.message.trim(), r.reason);
});

test('C2 unknown ids are NOT_FOUND rather than a crash', () => {
  assert.equal(lib().borrow('nope', 't1', '2026-03-01').reason, 'NOT_FOUND');
  assert.equal(lib().borrow('m1', 'nope', '2026-03-01').reason, 'NOT_FOUND');
});

test('C3 deterministic — identical calls give identical results', () => {
  const a = lib().borrow('m1', 't1', '2026-03-01');
  const b = lib().borrow('m1', 't1', '2026-03-01');
  assert.deepEqual({ ...a, loanId: null }, { ...b, loanId: null });
});

test('C4 money paths stay integer under repeated fees', () => {
  const L = lib({ loans: [{ id: 'l1', memberId: 'm1', toolId: 't1', startDate: '2026-03-01', dueDate: '2026-03-15', returnedDate: null, renewed: false }] });
  const r = L.returnTool('l1', '2026-03-22');   // 7 days => 350
  assert.equal(r.feePence, 350);
  const s = L.memberStatus('m1', '2026-03-22');
  assert.equal(Number.isInteger(s.outstandingPence), true);
});
