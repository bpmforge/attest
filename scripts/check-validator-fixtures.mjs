#!/usr/bin/env node
// check-validator-fixtures.mjs — red/green fixture harness for chained
// validators (T22.5).
//
// "Chained" = a validator script named in validate-phase-gate.sh's
// GATE_VALIDATORS lists (populate_phase_artifacts()) -- i.e. load-bearing,
// gate-blocking. Convention: evals/fixtures/validators/<name>/{red,green}/
// (name = the validator script's filename without .sh). A RED fixture is a
// small project dir the validator should find ≥1 gap in (exit 1); a GREEN
// fixture is one it should pass clean (exit 0). RED is mandatory -- proving
// the validator can actually go red is the whole point of this harness, a
// green-only fixture proves nothing about whether the check fires -- a
// chained validator with no red fixture must be on the grandfather list, or
// this harness fails. GREEN is optional even off the grandfather list (it's
// checked when present, just not required).
//
// The grandfather list may only shrink: every entry is checked against
// whether fixtures now exist for it (stale entries -- fixtures were added
// but the list wasn't updated -- are a hard failure), so it can't silently
// grow or go stale. New chained validators are never auto-grandfathered.
//
// Usage: node scripts/check-validator-fixtures.mjs [--json]

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const REPO = join(dirname(new URL(import.meta.url).pathname), '..');
// P-A14: the denominator is EVERY gate-bearing chain, not just the phase
// gate. run-handoff-gates.sh gates every returning HANDOFF — its validators
// (validate-scope, validate-tracker-fresh, ...) ran unproven for months
// because only validate-phase-gate.sh was parsed here.
const GATE_SCRIPTS = [
  join(REPO, 'scripts/validators/validate-phase-gate.sh'),
  join(REPO, 'scripts/validators/run-handoff-gates.sh'),
];
const VALIDATORS_DIR = join(REPO, 'scripts/validators');
const FIXTURES_DIR = join(REPO, 'evals/fixtures/validators');
const GRANDFATHER_FILE = join(FIXTURES_DIR, 'GRANDFATHERED.json');

const JSON_OUT = process.argv.includes('--json');

function chainedValidators() {
  const names = new Set();
  for (const gate of GATE_SCRIPTS) {
    const src = readFileSync(gate, 'utf8');
    // both quoting styles appear across the two chains:
    //   "$VALIDATORS_DIR/validate-scope.sh"   and   "validate-scope.sh"
    for (const m of src.matchAll(/(validate-[a-z0-9-]+\.sh)/g)) names.add(m[1]);
  }
  names.delete('validate-phase-gate.sh'); // the orchestrator, not a check
  return [...names].sort();
}

/**
 * P-A14 fixture conventions, superset of the original `validator.sh <dir>`:
 *  - ARGS      one token per line, run as `validator.sh <tokens...>` with
 *              cwd = the fixture dir, so `.` and relative paths resolve inside
 *              the fixture. Needed for validators whose signature is not
 *              `<dir>` (validate-scope takes scope dirs + --root;
 *              validate-completion-manifest takes <manifest> <root>).
 *  - SETUP.sh  run first (bash, cwd = a TEMP COPY of the fixture) to create
 *              state git cannot track — e.g. the .git repo validate-scope
 *              inspects. The temp copy keeps fixtures declarative and every
 *              run hermetic; the copy is deleted afterwards.
 */
function runValidator(scriptName, fixtureDir) {
  const scriptPath = join(VALIDATORS_DIR, scriptName);
  const argsFile = join(fixtureDir, 'ARGS');
  const setupFile = join(fixtureDir, 'SETUP.sh');
  let cwd = fixtureDir;
  let tempDir = null;
  try {
    if (existsSync(setupFile)) {
      tempDir = mkdtempSync(join(tmpdir(), 'fixture-'));
      cpSync(fixtureDir, tempDir, { recursive: true });
      execFileSync('bash', [join(tempDir, 'SETUP.sh')], { stdio: 'pipe', cwd: tempDir });
      cwd = tempDir;
    }
    const args = existsSync(argsFile)
      ? readFileSync(argsFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
      : [fixtureDir];
    try {
      execFileSync('bash', [scriptPath, ...args], { stdio: 'pipe', encoding: 'utf8', cwd });
      return { exitCode: 0 };
    } catch (err) {
      return { exitCode: err.status ?? 1, stderr: err.stderr };
    }
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  const chained = chainedValidators();
  const grandfathered = new Set(
    existsSync(GRANDFATHER_FILE) ? JSON.parse(readFileSync(GRANDFATHER_FILE, 'utf8')) : [],
  );
  const fixturedNames = new Set(
    existsSync(FIXTURES_DIR)
      ? readdirSync(FIXTURES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
      : [],
  );

  const results = [];
  let failures = 0;

  for (const validatorScript of chained) {
    const name = validatorScript.replace(/\.sh$/, '');
    const dir = join(FIXTURES_DIR, name);
    const redDir = join(dir, 'red');
    const greenDir = join(dir, 'green');
    const hasRed = existsSync(redDir);
    const hasGreen = existsSync(greenDir);

    if (!hasRed) {
      if (grandfathered.has(validatorScript)) {
        results.push({ validator: validatorScript, status: 'GRANDFATHERED' });
      } else {
        results.push({
          validator: validatorScript,
          status: 'FAIL',
          reason: 'chained validator has no red fixture and is not on the grandfather list',
        });
        failures++;
      }
      continue;
    }

    // A red fixture exists for a grandfathered entry -- the list must
    // shrink, not silently keep a now-stale entry alongside a real fixture.
    if (grandfathered.has(validatorScript)) {
      results.push({
        validator: validatorScript,
        status: 'FAIL',
        reason: 'has a red fixture now but is still on the grandfather list — remove it (list may only shrink)',
      });
      failures++;
      continue;
    }

    if (hasRed) {
      const r = runValidator(validatorScript, redDir);
      if (r.exitCode === 0) {
        results.push({
          validator: validatorScript,
          status: 'FAIL',
          reason: `red fixture did not fail: ${validatorScript} exited 0 against ${name}/red`,
        });
        failures++;
        continue;
      }
    }
    if (hasGreen) {
      const r = runValidator(validatorScript, greenDir);
      if (r.exitCode !== 0) {
        results.push({
          validator: validatorScript,
          status: 'FAIL',
          reason: `green fixture did not pass: ${validatorScript} exited ${r.exitCode} against ${name}/green`,
        });
        failures++;
        continue;
      }
    }
    results.push({ validator: validatorScript, status: 'OK', red: hasRed, green: hasGreen });
  }

  // A grandfather entry that doesn't correspond to any currently-chained
  // validator is dead weight -- not a failure (the validator may have been
  // legitimately removed from the chain), but worth surfacing.
  const staleGrandfatherEntries = [...grandfathered].filter((v) => !chained.includes(v));

  // An unrecognized directory under evals/fixtures/validators/ (typo, or a
  // fixture for a validator that isn't actually chained) is silently
  // ignored by the loop above -- surface it instead of hiding it.
  const unchainedFixtureDirs = [...fixturedNames].filter(
    (name) => !chained.includes(`${name}.sh`) && name !== 'GRANDFATHERED.json',
  );

  const summary = {
    chainedCount: chained.length,
    grandfatheredCount: grandfathered.size,
    fixturedCount: results.filter((r) => r.status === 'OK').length,
    failures,
    staleGrandfatherEntries,
    unchainedFixtureDirs,
    results,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`chained validators: ${summary.chainedCount}`);
    console.log(`  fixtured (red/green present): ${summary.fixturedCount}`);
    console.log(`  grandfathered (no fixture, allowed): ${summary.grandfatheredCount}`);
    for (const r of results) {
      if (r.status === 'FAIL') console.error(`  [FAIL] ${r.validator}: ${r.reason}`);
    }
    if (staleGrandfatherEntries.length)
      console.error(`  stale grandfather entries (not chained anymore): ${staleGrandfatherEntries.join(', ')}`);
    if (unchainedFixtureDirs.length)
      console.error(`  fixture dirs for non-chained names: ${unchainedFixtureDirs.join(', ')}`);
    console.log(failures === 0 ? 'clean' : `${failures} failure(s)`);
  }

  process.exit(failures > 0 ? 1 : 0);
}

main();
