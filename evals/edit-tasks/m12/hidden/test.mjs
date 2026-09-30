import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const W = process.env.WORKDIR;
const load = async (root) => ({
  ...(await import(root + '/src/timetable.mjs')),
  ...(await import(root + '/src/notice.mjs')),
  ...(await import(root + '/src/cli.mjs')),
  ...(await import(root + '/board/announce.mjs')),
});
const m = await load(W);
const table = m.loadTimetable();

test('notice shows delay in minutes for every source format', () => {
  assert.equal(m.describeNext(table, '06:00'), 'Next ferry to Harbour Isle at 08:15 (delay 0 min)');
  assert.equal(m.describeNext(table, '09:00'), 'Next ferry to Pine Cove at 11:40 (delay 7 min)');
  assert.equal(m.describeNext(table, '12:00'), 'Next ferry to Harbour Isle at 12:40 (delay 12 min)');
  assert.equal(m.describeNext(table, '13:00'), 'Next ferry to Pine Cove at 14:30 (delay 20 min)');
  assert.equal(m.describeNext(table, '15:00'), 'Next ferry to Harbour Isle at 17:45 (delay 0 min)');
  assert.equal(m.describeNext(table, '18:00'), 'Next ferry to Pine Cove at 21:10 (delay 65 min)');
});
test('minutes and cli', () => {
  assert.equal(m.minutesUntil(table, '12:00'), 40);
  assert.equal(m.minutesUntil(table, '23:00'), null);
  assert.equal(m.run('13:00'), 'Next ferry to Pine Cove at 14:30 (delay 20 min)');
  assert.equal(m.describeNext(table, '23:00'), 'No more ferries today');
});
test('board keeps its wording', () => {
  assert.equal(m.announce(table, '13:00'), 'NOW BOARDING PINE COVE 14:30');
  assert.equal(m.announce(table, '18:00'), 'NOW BOARDING PINE COVE 21:10');
  assert.equal(m.announce(table, '23:00'), 'No sailings');
});
test('app entry point prints both lines', () => {
  const out = execFileSync('node', [W + '/app.mjs', '13:00'], { encoding: 'utf8' });
  assert.equal(out, 'Next ferry to Pine Cove at 14:30 (delay 20 min)\nNOW BOARDING PINE COVE 14:30\n');
});
test('not hard-coded: mutated data', async () => {
  const d = mkdtempSync(join(tmpdir(), 'm12-'));
  cpSync(W, d, { recursive: true });
  writeFileSync(d + '/data/timetable.json', JSON.stringify([
    { dest: 'Gull Rock', dep: '6:05 AM', delay: '2:30' },
    { dest: 'Ash Quay', dep: '09:50', delay: 3 },
    { dest: 'Gull Rock', dep: '1:15 PM' },
    { dest: 'Ash Quay', dep: '22:00', delay: '0:59' },
  ]));
  const x = await load(d);
  const t = x.loadTimetable();
  assert.equal(x.describeNext(t, '05:00'), 'Next ferry to Gull Rock at 06:05 (delay 150 min)');
  assert.equal(x.describeNext(t, '07:00'), 'Next ferry to Ash Quay at 09:50 (delay 3 min)');
  assert.equal(x.describeNext(t, '10:00'), 'Next ferry to Gull Rock at 13:15 (delay 0 min)');
  assert.equal(x.describeNext(t, '20:00'), 'Next ferry to Ash Quay at 22:00 (delay 59 min)');
  assert.equal(x.announce(t, '05:00'), 'NOW BOARDING GULL ROCK 06:05');
  assert.equal(x.announce(t, '23:00'), 'No sailings');
});
