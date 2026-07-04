#!/usr/bin/env node
// pause-census.mjs — O3 measurement #1: count user-input pauses in a run.
//
// The autonomy claim (Wave O1): in `autonomy: auto`, the only pauses that remain are the
// NEVER-AUTO ones; `interactive` is unchanged. This tool measures it from run transcripts —
// it does not need a model itself (feed it the transcript from a real /sdlc run).
//
// A "pause event" = the agent yielded the turn on a user-input directive. Detected as a line
// matching the pause markers (same set as validate-autonomy-wiring). In `auto` runs the
// APPROVALS.md ledger lists every gate auto-taken; a remaining pause should be NEVER-AUTO only.
//
// Usage:
//   node pause-census.mjs --transcript run.log                 # count pauses in one run
//   node pause-census.mjs --interactive i.log --auto a.log \
//        [--approvals docs/work/APPROVALS.md] [--never-auto N]  # compare, assert the claim
//   node pause-census.mjs --self-test
// Exit 0 = claim holds / reported · 1 = claim violated · 2 = usage.

import { readFileSync, existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const has = (n) => argv.includes(n);

const PAUSE = /wait for (the )?user|get approval first|do not auto-continue|do not execute yet|do not auto-advance|type "yes"/i;

function countPauses(file) {
  if (!existsSync(file)) return { file, pauses: 0, missing: true };
  const lines = readFileSync(file, 'utf8').split('\n');
  const pauses = lines.filter(l => PAUSE.test(l)).length;
  return { file, pauses };
}
function approvalsTaken(file) {
  if (!file || !existsSync(file)) return 0;
  // count table rows (skip header + separator + blanks)
  return readFileSync(file, 'utf8').split('\n')
    .filter(l => l.trim().startsWith('|') && !/^\|\s*-+/.test(l) && !/when.*gate.*default/i.test(l)).length;
}

function report(o) { console.log(JSON.stringify(o)); }

if (has('--self-test')) {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'census-'));
  // interactive: 5 pause markers; auto: 1 (a NEVER-AUTO interview)
  writeFileSync(join(dir, 'i.log'), ['Wait for user to type "yes"', 'do not auto-continue', 'get approval first', 'Wait for user answers', 'do not auto-advance'].join('\n'));
  writeFileSync(join(dir, 'a.log'), ['STOP and wait for the user to respond (interview)'].join('\n'));
  writeFileSync(join(dir, 'APPROVALS.md'), '| when | gate | default taken | asked |\n|---|---|---|---|\n| t1 | Gate A | advance | proceed? |\n| t2 | inter-phase | continue | next? |\n');
  const i = countPauses(join(dir, 'i.log')), a = countPauses(join(dir, 'a.log'));
  const appr = approvalsTaken(join(dir, 'APPROVALS.md'));
  const fail = (m) => { console.log(`pause-census self-test FAIL: ${m}`); process.exit(1); };
  if (i.pauses !== 5) fail(`interactive count ${i.pauses} != 5`);
  if (a.pauses !== 1) fail(`auto count ${a.pauses} != 1`);
  if (appr !== 2) fail(`approvals ${appr} != 2`);
  if (!(a.pauses < i.pauses)) fail('auto not < interactive');
  if (!(a.pauses <= 1)) fail('auto pauses exceed NEVER-AUTO budget (1)');
  console.log('pause-census self-test PASS (auto < interactive, auto ≤ NEVER-AUTO, approvals counted)');
  process.exit(0);
}

if (flag('--interactive') && flag('--auto')) {
  const i = countPauses(flag('--interactive'));
  const a = countPauses(flag('--auto'));
  const appr = approvalsTaken(flag('--approvals'));
  const neverAuto = flag('--never-auto') ? parseInt(flag('--never-auto'), 10) : null;
  report({ interactive_pauses: i.pauses, auto_pauses: a.pauses, auto_gates_auto_taken: appr, never_auto_budget: neverAuto });
  const holds = a.pauses <= i.pauses && (neverAuto == null || a.pauses <= neverAuto);
  console.error(`[pause-census] claim ${holds ? 'HOLDS' : 'VIOLATED'}: auto=${a.pauses} interactive=${i.pauses}` + (neverAuto != null ? ` never-auto=${neverAuto}` : ''));
  process.exit(holds ? 0 : 1);
}

if (flag('--transcript')) {
  report(countPauses(flag('--transcript')));
  process.exit(0);
}

console.error('usage: pause-census.mjs --transcript F | --interactive I --auto A [--approvals F] [--never-auto N] | --self-test');
process.exit(2);
