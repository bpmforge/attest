#!/usr/bin/env node
// soak-monitor.mjs — O3 measurement #2: accidental-pause soak analysis.
//
// After a long local session (qwen3.6 + O0 config + auto-resume/todo-reminder plugins), this
// counts how many times the plugins auto-recovered a stall vs. how many manual "continue"s the
// operator had to type. Target: zero manual continues in a multi-hour session (auto-resume may
// fire — that's the fix working). Feed it the session transcript and/or run-until-done.log.
//
// Detection (override markers with --resume-re / --manual-re):
//   auto-resume fires  : /auto[- ]?resume|auto[- ]?continue|resend.*continue/i
//   manual continues   : a line that IS just "continue" (optionally "USER: continue") — the
//                        operator convention for a hand-typed nudge
//   outer-loop sessions: run-until-done.log "[run-until-done] session N/…"
//
// Usage:
//   node soak-monitor.mjs --log session.log [--run-log docs/work/run-until-done.log]
//   node soak-monitor.mjs --self-test
// Exit 0 = clean (zero manual) or reported · 1 = manual continues detected · 2 = usage.

import { readFileSync, existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const has = (n) => argv.includes(n);

const RESUME_RE = new RegExp(flag('--resume-re', 'auto[- ]?resume|auto[- ]?continue|resend.*continue'), 'i');
const MANUAL_RE = new RegExp(flag('--manual-re', '^(user:\\s*)?continue\\s*$'), 'i');

function analyze(file) {
  if (!file || !existsSync(file)) return { file, missing: true, autoResumes: 0, manualContinues: 0 };
  const lines = readFileSync(file, 'utf8').split('\n');
  let autoResumes = 0, manualContinues = 0;
  for (const l of lines) {
    if (RESUME_RE.test(l)) autoResumes++;
    else if (MANUAL_RE.test(l.trim())) manualContinues++;
  }
  return { file, autoResumes, manualContinues };
}
function sessions(file) {
  if (!file || !existsSync(file)) return 0;
  return (readFileSync(file, 'utf8').match(/\[run-until-done\] session \d+/g) || []).length;
}

if (has('--self-test')) {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'soak-'));
  // clean session: 3 auto-resumes fired, 0 manual continues
  writeFileSync(join(dir, 'clean.log'), ['work...', '[auto-resume] stall detected, sending continue', 'more work', 'auto-resume: raw-text tool call, resend', 'auto-continue fired', 'done'].join('\n'));
  // dirty session: 1 auto-resume + 2 manual continues
  writeFileSync(join(dir, 'dirty.log'), ['auto-resume fired', 'USER: continue', 'stuff', 'continue'].join('\n'));
  writeFileSync(join(dir, 'run.log'), ['[run-until-done] session 1/12', '[run-until-done] session 2/12'].join('\n'));
  const fail = (m) => { console.log(`soak-monitor self-test FAIL: ${m}`); process.exit(1); };
  const clean = analyze(join(dir, 'clean.log'));
  const dirty = analyze(join(dir, 'dirty.log'));
  if (clean.autoResumes !== 3) fail(`clean autoResumes ${clean.autoResumes} != 3`);
  if (clean.manualContinues !== 0) fail(`clean manualContinues ${clean.manualContinues} != 0`);
  if (dirty.manualContinues !== 2) fail(`dirty manualContinues ${dirty.manualContinues} != 2`);
  if (sessions(join(dir, 'run.log')) !== 2) fail('session count != 2');
  console.log('soak-monitor self-test PASS (auto-resumes counted, manual continues flagged, sessions counted)');
  process.exit(0);
}

if (flag('--log')) {
  const a = analyze(flag('--log'));
  const s = sessions(flag('--run-log'));
  console.log(JSON.stringify({ ...a, outerLoopSessions: s }));
  console.error(`[soak-monitor] auto-resumes=${a.autoResumes} manual-continues=${a.manualContinues}` + (s ? ` sessions=${s}` : '') + ` — target manual=0`);
  process.exit(a.manualContinues > 0 ? 1 : 0);
}

console.error('usage: soak-monitor.mjs --log F [--run-log F] | --self-test');
process.exit(2);
