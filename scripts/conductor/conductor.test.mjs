// conductor.test.mjs (T28.1) — end-to-end fixture: a real temp git repo with
// a 3-ticket plan.json, a stub `opencode` binary standing in for real
// sessions, run through the actual conductor.mjs subprocess. Exercises the
// real scripts/lib/tickets.mjs lifecycle and the real
// run-handoff-gates.sh/validate-completion-manifest.sh/validate-scope.sh
// validators — not mocked. Ticket TICK-3's stub deliberately writes outside
// its write_scope so the scope gate fails on every attempt, proving a
// gate-failing ticket goes back to `ready`, never forward to `in_review`/`done`.
//
// Not wired into scripts/test.ts's Pass-N suite (see README.md) — run
// standalone: node --test scripts/conductor/conductor.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));            // scripts/conductor
const REPO_ROOT = resolve(HERE, '..', '..');                     // bpm-opencode-experts
const CONDUCTOR = resolve(HERE, 'conductor.mjs');
const GATES_SH = resolve(REPO_ROOT, 'scripts/validators/run-handoff-gates.sh');

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

function setupFixture() {
  const base = mkdtempSync(resolve(tmpdir(), 'conductor-t28-1-'));
  const target = resolve(base, 'target-repo');
  mkdirSync(target, { recursive: true });
  const git = (...a) => sh('git', a, { cwd: target });

  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'conductor-test@example.com');
  git('config', 'user.name', 'Conductor Test');
  git('config', 'commit.gpgsign', 'false');

  const verifyFor = (id, scopeDir) =>
    `bash ${GATES_SH} --scope ${scopeDir} --manifest docs/reviews/MANIFEST_${id}.md --root .`;

  const plan = {
    goal: 'T28.1 conductor fixture',
    modules: [
      {
        id: 'TICK-1', kind: 'module', title: 'Ticket one', lane: 'lane-a', owner: null, status: 'ready',
        write_scope: ['a/**'], depends_on: [], acceptance: ['writes a/hello.txt'],
        verify: verifyFor('TICK-1', 'a'), manifest: 'docs/reviews/MANIFEST_TICK-1.md',
      },
      {
        id: 'TICK-2', kind: 'module', title: 'Ticket two', lane: 'lane-b', owner: null, status: 'ready',
        write_scope: ['b/**'], depends_on: [], acceptance: ['writes b/hello.txt'],
        verify: verifyFor('TICK-2', 'b'), manifest: 'docs/reviews/MANIFEST_TICK-2.md',
      },
      {
        id: 'TICK-3', kind: 'module', title: 'Ticket three (deliberately broken)', lane: 'lane-c', owner: null, status: 'ready',
        write_scope: ['c/**'], depends_on: [], acceptance: ['writes c/hello.txt'],
        verify: verifyFor('TICK-3', 'c'), manifest: 'docs/reviews/MANIFEST_TICK-3.md',
      },
    ],
  };
  writeFileSync(resolve(target, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
  // Pre-create scope dirs + docs/reviews as TRACKED — matches real projects
  // (a ticket's write_scope dir usually already exists). This matters for
  // validate-scope.sh: `git status --porcelain` collapses a wholly-NEW
  // untracked directory into a single "?? dir/" line instead of listing the
  // files inside it, which the validator's literal-prefix match can't
  // classify — an already-tracked dir doesn't have that collapsing problem.
  for (const d of ['a', 'b', 'c', 'docs/reviews']) {
    mkdirSync(resolve(target, d), { recursive: true });
    writeFileSync(resolve(target, d, '.gitkeep'), '');
  }
  mkdirSync(resolve(target, 'docs/work'), { recursive: true });
  writeFileSync(resolve(target, '.gitignore'), 'docs/work/\n.conductor-worktrees/\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'initial fixture');

  // Stub `opencode` binary: plays TICK-1/TICK-2 straight (in-scope files +
  // a valid Completion Manifest), and TICK-3 badly (writes outside c/**,
  // no manifest) — same broken behavior on every attempt, deterministically.
  const binDir = resolve(base, 'bin');
  mkdirSync(binDir, { recursive: true });
  const stub = resolve(binDir, 'opencode-stub.sh');
  writeFileSync(stub, `#!/usr/bin/env bash
set -euo pipefail
[[ "\${1:-}" == "run" ]] || exit 0
PROMPT="$2"; shift 2
DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in --dir) DIR="$2"; shift 2 ;; *) shift ;; esac
done
manifest() {
  local id="$1" scope="$2"
  mkdir -p "$DIR/docs/reviews"
  cat > "$DIR/docs/reviews/MANIFEST_\${id}.md" <<EOF
# Completion Manifest — \${id}

Maker: conductor
Verifier: conductor-review
Tracker updated: CHANGELOG.md

## Files produced
- \\\`\${scope}/hello.txt\\\`

## Decisions
- kept it simple

## Known issues
- none

## Verify result
- \\\`\${scope}/hello.txt\\\` written and present

\${id} done -- wrote \${scope}/hello.txt.
EOF
}
if grep -qF 'TICKET TICK-1 ' <<<"$PROMPT"; then
  mkdir -p "$DIR/a"; echo hello > "$DIR/a/hello.txt"; manifest TICK-1 a
elif grep -qF 'TICKET TICK-2 ' <<<"$PROMPT"; then
  mkdir -p "$DIR/b"; echo hello > "$DIR/b/hello.txt"; manifest TICK-2 b
elif grep -qF 'TICKET TICK-3 ' <<<"$PROMPT"; then
  echo oops > "$DIR/outside-of-scope.txt"
fi
exit 0
`);
  chmodSync(stub, 0o755);

  return { base, target, stub };
}

test('conductor.mjs: 3-ticket fixture lands 2, releases the gate-failing one, never advances it', { timeout: 180_000 }, () => {
  const { base, target, stub } = setupFixture();
  try {
    sh('node', [CONDUCTOR, '--root', target, '--actor', 'conductor', '--reviewer-actor', 'conductor-review', '--max-attempts', '2', '--no-push'], {
      cwd: target,
      env: { ...process.env, OPENCODE_BIN: stub },
    });

    const plan = JSON.parse(readFileSync(resolve(target, 'plan.json'), 'utf8'));
    const byId = Object.fromEntries(plan.modules.map((m) => [m.id, m]));

    assert.equal(byId['TICK-1'].status, 'done', 'TICK-1 should land');
    assert.equal(byId['TICK-2'].status, 'done', 'TICK-2 should land');
    assert.equal(byId['TICK-3'].status, 'ready', 'TICK-3 must go back to ready, never forward');
    assert.equal(byId['TICK-3'].owner, null, 'TICK-3 ownership must be cleared on release');

    const t3History = byId['TICK-3'].history.map((h) => `${h.from}->${h.to}: ${h.note ?? ''}`).join('\n');
    assert.match(t3History, /release|CONDUCTOR/i, 'TICK-3 history must record the gate failures');
    assert.ok(
      byId['TICK-3'].history.some((h) => h.to === 'in_review' || h.to === 'done') === false,
      'TICK-3 must never have transitioned to in_review or done',
    );

    // Receipts: exactly TICK-1 and TICK-2 got a real close() receipt logged.
    const log = readFileSync(resolve(target, 'docs/work/conductor-log.jsonl'), 'utf8')
      .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const receipts = log.filter((r) => r.kind === 'ticket.receipt');
    assert.equal(receipts.length, 2, 'exactly 2 tickets should produce a close() receipt');
    for (const t of ['TICK-1', 'TICK-2']) {
      const r = receipts.find((x) => x.ticket === t);
      assert.ok(r, `${t} should have a receipt log entry`);
      assert.match(r.receipt, new RegExp(`close receipt: ${t}`), `${t} receipt text should be the real close() receipt`);
    }
    const exhausted = log.filter((r) => r.kind === 'ticket.exhausted');
    assert.equal(exhausted.length, 1, 'exactly 1 ticket should be logged exhausted');
    assert.equal(exhausted[0].ticket, 'TICK-3');

    // Halt notice: nothing left claimable (TICK-3 is skipped-this-run, not reclaimed).
    assert.ok(existsSync(resolve(target, 'docs/work/CONDUCTOR_HALT.md')), 'halt notice should be written');
    const halt = readFileSync(resolve(target, 'docs/work/CONDUCTOR_HALT.md'), 'utf8');
    assert.match(halt, /TICK-3/);

    // Merge history: TICK-1/TICK-2 merged into main, TICK-3's branch was not.
    const mergeLog = sh('git', ['log', '--merges', '--format=%s'], { cwd: target });
    assert.match(mergeLog, /TICK-1/);
    assert.match(mergeLog, /TICK-2/);
    assert.doesNotMatch(mergeLog, /TICK-3/);

    // Re-run: TICK-3 is `ready` again (release() clears ownership at the end
    // of a run, by design — a human may have fixed something), so a fresh
    // invocation retries it — and, the stub still being broken, fails it
    // the same way again. Proves the failure path is stable across runs,
    // not just within a single process's in-memory skip-set.
    sh('node', [CONDUCTOR, '--root', target, '--max-attempts', '2', '--no-push'], {
      cwd: target,
      env: { ...process.env, OPENCODE_BIN: stub },
    });
    const plan2 = JSON.parse(readFileSync(resolve(target, 'plan.json'), 'utf8'));
    assert.equal(plan2.modules.find((m) => m.id === 'TICK-3').status, 'ready');
    assert.equal(plan2.modules.find((m) => m.id === 'TICK-1').status, 'done');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// T28.2 (M28 model routing): a single-ticket fixture whose OWN models.json
// carries a `roles.coder` distinct from `roles.reviewer` — proves the
// resolved coder-role model actually threads through to the real
// `opencode run --model <...>` spawn (not just resolved and logged), and
// that a fully-distinct roles map lands the ticket normally (the routing
// gate itself never blocks a clean config).
function setupRoleRoutingFixture() {
  const base = mkdtempSync(resolve(tmpdir(), 'conductor-t28-2-'));
  const target = resolve(base, 'target-repo');
  mkdirSync(target, { recursive: true });
  const git = (...a) => sh('git', a, { cwd: target });

  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'conductor-test@example.com');
  git('config', 'user.name', 'Conductor Test');
  git('config', 'commit.gpgsign', 'false');

  const verifyFor = (id, scopeDir) =>
    `bash ${GATES_SH} --scope ${scopeDir} --manifest docs/reviews/MANIFEST_${id}.md --root .`;

  const plan = {
    goal: 'T28.2 role-routing fixture',
    modules: [{
      id: 'TICK-ROLE', kind: 'module', title: 'Role-routed ticket', lane: 'lane-a', owner: null, status: 'ready',
      write_scope: ['a/**'], depends_on: [], acceptance: ['writes a/hello.txt'],
      verify: verifyFor('TICK-ROLE', 'a'), manifest: 'docs/reviews/MANIFEST_TICK-ROLE.md',
    }],
  };
  writeFileSync(resolve(target, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
  // Distinct, obviously-fake model ids -- this test only needs to prove they
  // route through, not that they're real opencode-recognized identifiers.
  writeFileSync(resolve(target, 'models.json'), JSON.stringify({
    roles: { coder: 'fixture/coder-model', reviewer: 'fixture/reviewer-model' },
  }, null, 2) + '\n');
  for (const d of ['a', 'docs/reviews']) {
    mkdirSync(resolve(target, d), { recursive: true });
    writeFileSync(resolve(target, d, '.gitkeep'), '');
  }
  mkdirSync(resolve(target, 'docs/work'), { recursive: true });
  writeFileSync(resolve(target, '.gitignore'), 'docs/work/\n.conductor-worktrees/\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'initial fixture');

  const binDir = resolve(base, 'bin');
  mkdirSync(binDir, { recursive: true });
  const stub = resolve(binDir, 'opencode-stub.sh');
  const argsLog = resolve(base, 'stub-args.log');
  writeFileSync(stub, `#!/usr/bin/env bash
set -euo pipefail
echo "$@" >> ${JSON.stringify(argsLog)}
[[ "\${1:-}" == "run" ]] || exit 0
DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in --dir) DIR="$2"; shift 2 ;; *) shift ;; esac
done
mkdir -p "$DIR/a" "$DIR/docs/reviews"
echo hello > "$DIR/a/hello.txt"
cat > "$DIR/docs/reviews/MANIFEST_TICK-ROLE.md" <<EOF
# Completion Manifest — TICK-ROLE

Maker: conductor
Verifier: conductor-review
Tracker updated: CHANGELOG.md

## Files produced
- \\\`a/hello.txt\\\`

## Decisions
- kept it simple

## Known issues
- none

## Verify result
- \\\`a/hello.txt\\\` written and present

TICK-ROLE done -- wrote a/hello.txt.
EOF
exit 0
`);
  chmodSync(stub, 0o755);

  return { base, target, stub, argsLog };
}

test('conductor.mjs: T28.2 role routing — resolved coder-role model reaches the real opencode spawn', { timeout: 60_000 }, () => {
  const { base, target, stub, argsLog } = setupRoleRoutingFixture();
  try {
    sh('node', [CONDUCTOR, '--root', target, '--max-attempts', '1', '--no-push'], {
      cwd: target,
      env: { ...process.env, OPENCODE_BIN: stub },
    });

    const plan = JSON.parse(readFileSync(resolve(target, 'plan.json'), 'utf8'));
    assert.equal(plan.modules.find((m) => m.id === 'TICK-ROLE').status, 'done', 'the ticket should land — a clean, distinct roles map must never block a run');

    // The stub echoes its raw argv (`echo "$@"`); the prompt argument itself
    // contains embedded newlines, so this is read as one blob, not split
    // per-line — a per-line parse would truncate at the prompt's first line.
    const stubArgv = readFileSync(argsLog, 'utf8');
    assert.ok(stubArgv.trimStart().startsWith('run '), 'opencode stub should have received a run invocation');
    assert.match(stubArgv, /--model fixture\/coder-model/, 'the spawned opencode session must receive roles.coder\'s resolved model, not roles.reviewer\'s or none at all');

    const log = readFileSync(resolve(target, 'docs/work/conductor-log.jsonl'), 'utf8')
      .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const start = log.find((r) => r.kind === 'conductor.start');
    assert.deepEqual(start.roles, { coder: 'fixture/coder-model', reviewer: 'fixture/reviewer-model', challenger: null }, 'conductor.start log entry must show the mapped model per role');
    const mismatch = log.find((r) => r.kind === 'gate.role-mismatch');
    assert.equal(mismatch, undefined, 'a fully-distinct roles map must never be flagged');

    const sessionStarts = log.filter((r) => r.kind === 'session.start');
    assert.ok(sessionStarts.length > 0 && sessionStarts.every((r) => r.role === 'coder' && r.model === 'fixture/coder-model'), 'every session.start entry must be tagged with the coder role + its resolved model');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
