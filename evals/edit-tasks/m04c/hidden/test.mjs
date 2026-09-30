import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const W = process.env.WORKDIR;
const { fineCents } = await import(W + '/src/fines.mjs');
const { terms } = await import(W + '/src/terms.mjs');
const { deskSlip } = await import(W + '/src/app.mjs');
const { kioskBanner } = await import(W + '/kiosk/banner.mjs');
const T = 'Late fee: $0.40 per day after a 3-day grace period.';

test('core fine', () => {
  assert.equal(fineCents(3), 0);
  assert.equal(fineCents(5), 80);
  assert.equal(fineCents(12), 360);
});
test('terms text and kiosk banner', () => {
  assert.equal(terms(), T);
  assert.equal(kioskBanner(), 'Overdue desk: late fee 40c/day');
});
test('desk slip for every plan, including weekly billing', async () => {
  assert.deepEqual(await deskSlip('standard', 2), { terms: T, fee: 0, billed: 0 });
  assert.deepEqual(await deskSlip('member', 6), { terms: T, fee: 120, billed: 120 });
  assert.deepEqual(await deskSlip('standard', 10), { terms: T, fee: 280, billed: 280 });
  assert.deepEqual(await deskSlip('member', 13), { terms: T, fee: 400, billed: 400 });
  assert.deepEqual(await deskSlip('member', 24), { terms: T, fee: 840, billed: 840 });
});
test('plans are discovered by name; other wiring untouched', async () => {
  const d = mkdtempSync(join(tmpdir(), 'm04c-'));
  cpSync(W, d, { recursive: true });
  writeFileSync(join(d, 'plans/trial.mjs'), 'export default { fee: (n) => n * 7 };\n');
  writeFileSync(join(d, 'kiosk/config.json'), JSON.stringify({ rateLabel: '40c/day', title: 'Returns' }));
  const { deskSlip: slip } = await import(d + '/src/app.mjs');
  const { kioskBanner: kb } = await import(d + '/kiosk/banner.mjs');
  assert.equal((await slip('trial', 4)).fee, 28);
  assert.equal((await slip('member', 17)).billed, 560);
  assert.equal(kb(), 'Returns: late fee 40c/day');
});
