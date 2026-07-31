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
const REPO_ROOT = resolve(HERE, '..', '..');                     // attest
const CONDUCTOR = resolve(HERE, 'conductor.mjs');
const GATES_SH = resolve(REPO_ROOT, 'scripts/validators/run-handoff-gates.sh');
const GATES_SCOPE = resolve(REPO_ROOT, 'scripts/validators/validate-scope.sh');

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
  // The fixture carries its OWN models.json so the run is hermetic. Without
  // one, MODELS_JSON_PATH falls back to this repo's root models.json and the
  // suite's outcome depends on which providers the developer happens to have
  // authenticated — a real source of "passes on my machine".
  writeFileSync(resolve(target, 'models.json'), JSON.stringify({
    roles: { coder: 'fixture/coder-model', reviewer: 'fixture/reviewer-model' },
  }, null, 2) + '\n');
  // Scope dirs are deliberately NOT pre-created.
  //
  // They used to be, with a comment explaining why: `git status --porcelain`
  // collapses a wholly-new untracked directory into one "?? dir/" entry
  // instead of listing its files, which validate-scope.sh's prefix match could
  // not classify. Pre-creating them as tracked dodged that — and in doing so
  // made this suite pass over a product defect that made EVERY greenfield
  // ticket unpassable, since a first ticket in a new project always creates
  // its own directory. The workaround was in the test instead of the fix.
  // validate-scope.sh now reads `--porcelain -uall`, so leaving these absent
  // is what actually exercises the case (v3.1.8).
  //
  // docs/reviews is still pre-created: it holds manifests, is in ALWAYS_OK,
  // and is not the thing under test here.
  for (const d of ['docs/reviews']) {
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
# G4b (v3.1.1) preflights \`opencode models\` before any ticket runs. A stub
# that answers nothing is indistinguishable from an install that resolves
# nothing, so it must enumerate exactly the ids this fixture's models.json
# configures — that keeps the gate genuinely exercised on the happy path
# instead of bypassed with --model-gate off.
if [[ "\${1:-}" == "models" ]]; then
  printf '%s\\n' fixture/coder-model fixture/reviewer-model
  exit 0
fi
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

## Memory written
- None — nothing durable

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
    sh('node', [CONDUCTOR, '--root', target, '--rounds', '1', '--actor', 'conductor', '--reviewer-actor', 'conductor-review', '--max-attempts', '2', '--no-push'], {
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
    sh('node', [CONDUCTOR, '--root', target, '--rounds', '1', '--max-attempts', '2', '--no-push'], {
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
function setupRoleRoutingFixture({
  stubModels = ['fixture/coder-model', 'fixture/reviewer-model'],
  // Where the board lives. Defaults to the historical root location; the
  // discovery tests move it to where the SDLC actually writes it.
  planAt = 'plan.json',
  // The fixture's full .gitignore. Default ignores docs/work/ wholesale, which
  // is what G5 refuses; the discovery test overrides it with the canonical
  // per-file list. It must be a REPLACEMENT, not an append: git cannot
  // re-include a file inside an excluded directory, so `!docs/work/plan.json`
  // under `docs/work/` is silently inert — the exact trap G5 exists to catch.
  ignore = ['docs/work/', '.conductor-worktrees/'],
} = {}) {
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
  mkdirSync(dirname(resolve(target, planAt)), { recursive: true });
  writeFileSync(resolve(target, planAt), JSON.stringify(plan, null, 2) + '\n');
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
  // NOTE: this fixture ignores docs/work/ wholesale, which is NOT the canonical
  // bootstrap list (that ignores named files under it, because STATE.md and
  // plan.json are tracked). Kept for the root-plan cases; the discovery cases
  // below override it, since a board under an ignored directory is exactly what
  // G5 now refuses.
  writeFileSync(resolve(target, '.gitignore'), ignore.join('\n') + '\n');
  git('add', '-A');
  // -f: a board staged under an ignored path must still reach the fixture's
  // initial commit, or G5 would be testing a missing file instead of an ignored one.
  git('add', '-f', planAt);
  git('commit', '-q', '-m', 'initial fixture');

  const binDir = resolve(base, 'bin');
  mkdirSync(binDir, { recursive: true });
  const stub = resolve(binDir, 'opencode-stub.sh');
  const argsLog = resolve(base, 'stub-args.log');
  writeFileSync(stub, `#!/usr/bin/env bash
set -euo pipefail
# G4b's model enumeration is a preflight, not a session — it must answer the
# configured ids without landing in the argv log, which the assertions below
# read as "what the coder session was spawned with".
if [[ "\${1:-}" == "models" ]]; then
  ${stubModels.length ? `printf '%s\\n' ${stubModels.join(' ')}` : 'true'}
  exit 0
fi
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

## Memory written
- None — nothing durable

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
    sh('node', [CONDUCTOR, '--root', target, '--rounds', '1', '--max-attempts', '1', '--no-push'], {
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

// G4b (v3.1.1) — the gate must still BITE. `opencode run --model <unknown>`
// does not error; it falls back to the agent's own model, so an unresolvable
// id makes the maker/verifier split fiction while every log line reports the
// configured ids. This is the negative case v3.1.1 shipped without: paired
// with the empty-list case below, it pins the gate between the two ways it can
// be wrong — refusing everything, or refusing nothing.
test('conductor.mjs: G4b refuses a models.json naming a model this install cannot resolve', { timeout: 60_000 }, () => {
  // The stub enumerates the reviewer id but NOT the coder id.
  const { base, target, stub, argsLog } = setupRoleRoutingFixture({ stubModels: ['fixture/reviewer-model'] });
  try {
    let err = null;
    try {
      sh('node', [CONDUCTOR, '--root', target, '--rounds', '1', '--max-attempts', '1', '--no-push'], {
        cwd: target,
        env: { ...process.env, OPENCODE_BIN: stub },
      });
    } catch (e) { err = e; }

    assert.ok(err, 'an unresolvable role model must refuse the run, not proceed');
    assert.equal(err.status, 2, 'G4b refusal exits 2');
    assert.match(String(err.stderr), /fixture\/coder-model/, 'the refusal must name the id that does not resolve');
    assert.equal(existsSync(argsLog), false, 'no coder session may be spawned when the gate refuses');

    const plan = JSON.parse(readFileSync(resolve(target, 'plan.json'), 'utf8'));
    assert.equal(plan.modules.find((m) => m.id === 'TICK-ROLE').status, 'ready', 'a refused run must leave the board untouched');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// validate-scope.sh greenfield case (v3.1.8), tested directly.
//
// `git status --porcelain` collapses a wholly-new untracked directory into one
// "?? tests/" entry instead of listing its files. A write_scope of explicit
// FILE paths — which is what the SDLC actually generates — then cannot match
// it, and the ticket is failed for writing exactly what it was assigned. Any
// first ticket in a new project creates its own directory, so this made every
// greenfield ticket unpassable.
//
// A glob scope (`tests/**`) hides the bug, because the collapsed "tests/" still
// prefix-matches it — which is why the conductor fixture above never caught
// this. The file-path scope here is the real reproduction.
test('conductor.mjs: validate-scope classifies files in a BRAND-NEW directory against file-path scopes', { timeout: 60_000 }, () => {
  const base = mkdtempSync(resolve(tmpdir(), 'conductor-scope-'));
  const target = resolve(base, 'repo');
  mkdirSync(target, { recursive: true });
  const git = (...a) => sh('git', a, { cwd: target });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'scope@example.com');
  git('config', 'user.name', 'Scope Test');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(resolve(target, 'README.md'), 'seed\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'seed');

  try {
    // `tests/` does not exist in the seed — the session creates it.
    mkdirSync(resolve(target, 'tests'), { recursive: true });
    writeFileSync(resolve(target, 'tests/parse.test.js'), 'test\n');
    mkdirSync(resolve(target, 'src'), { recursive: true });
    writeFileSync(resolve(target, 'src/parse.js'), 'code\n');

    const clean = sh('bash', [GATES_SCOPE, '--scope', 'src/parse.js', '--scope', 'tests/parse.test.js', '--root', '.'], { cwd: target });
    assert.match(clean, /"gaps":0/, 'files in a brand-new directory must be classified against their file-path scopes, not reported out-of-scope');

    // ...and a real violation in that same new directory is still caught, by
    // NAME rather than as a collapsed directory entry.
    writeFileSync(resolve(target, 'tests/sneaky.js'), 'nope\n');
    let out = '';
    try {
      out = sh('bash', [GATES_SCOPE, '--scope', 'src/parse.js', '--scope', 'tests/parse.test.js', '--root', '.'], { cwd: target });
    } catch (e) { out = String(e.stdout || ''); }
    assert.match(out, /tests\/sneaky\.js written outside assigned scope/, 'a genuine violation must still fire, naming the file');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// Plan discovery (v3.1.4): the Phase 3 -> Phase 4 seam. The SDLC writes its
// module board to docs/work/plan.json; this executor defaulted to
// <root>/plan.json, which no producer has ever written. Pointing the conductor
// at a freshly-planned project therefore said "no plan.json" and read as the
// SDLC having failed to produce one. Discovery closes that by hand-joining
// nothing — the operator no longer has to know to pass --plan.
test('conductor.mjs: finds the SDLC-written board at docs/work/plan.json without --plan', { timeout: 60_000 }, () => {
  const { base, target, stub } = setupRoleRoutingFixture({
    planAt: 'docs/work/plan.json',
    // The CANONICAL bootstrap list: named per-machine files under docs/work/,
    // never the directory — so the board itself stays tracked.
    ignore: ['.conductor-worktrees/', 'docs/work/.model-context', 'docs/work/telemetry.jsonl'],
  });
  try {
    // NOTE: no --plan argument. That is the whole point of the test.
    const out = sh('node', [CONDUCTOR, '--root', target, '--rounds', '1', '--max-attempts', '1', '--no-push'], {
      cwd: target,
      env: { ...process.env, OPENCODE_BIN: stub },
    });
    assert.match(out, /plan=.*docs\/work\/plan\.json/, 'the resolved board must be the docs/work one, not <root>/plan.json');

    const plan = JSON.parse(readFileSync(resolve(target, 'docs/work/plan.json'), 'utf8'));
    assert.equal(plan.modules.find((m) => m.id === 'TICK-ROLE').status, 'done',
      'the discovered board must be the one actually driven and written back');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// G5 (v3.1.4). persistPlan() raw-`git add`s the board after every transition,
// so an ignored board does not degrade — it hard-fails on the first claim, mid
// run. `docs/work/` looks exactly like a directory worth ignoring wholesale,
// which is why this needs to be caught rather than documented.
test('conductor.mjs: G5 refuses a board that .gitignore covers, before claiming anything', { timeout: 60_000 }, () => {
  const { base, target, stub } = setupRoleRoutingFixture({ planAt: 'docs/work/plan.json' });
  try {
    let err = null;
    try {
      sh('node', [CONDUCTOR, '--root', target, '--rounds', '1', '--max-attempts', '1', '--no-push'], {
        cwd: target,
        env: { ...process.env, OPENCODE_BIN: stub },
      });
    } catch (e) { err = e; }

    assert.ok(err, 'an ignored board must refuse the run');
    assert.equal(err.status, 2, 'G5 refusal exits 2');
    assert.match(String(err.stderr), /covered by \.gitignore/, 'the refusal must name the actual cause');

    const plan = JSON.parse(readFileSync(resolve(target, 'docs/work/plan.json'), 'utf8'));
    assert.equal(plan.modules.find((m) => m.id === 'TICK-ROLE').status, 'ready',
      'nothing may be claimed when the board cannot be committed');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// The other half: an enumeration that SUCCEEDS and returns nothing is not
// evidence that nothing resolves — it is evidence the enumeration did not
// work (an `opencode` too old for the subcommand, a wrapper that swallows it).
// Treating empty as authoritative made G4b refuse every model in the config
// and blame the config, which took the whole conductor suite RED at v3.1.1.
test('conductor.mjs: G4b treats an empty model list as un-enumerable, not as "nothing resolves"', { timeout: 60_000 }, () => {
  const { base, target, stub } = setupRoleRoutingFixture({ stubModels: [] });
  try {
    sh('node', [CONDUCTOR, '--root', target, '--rounds', '1', '--max-attempts', '1', '--no-push'], {
      cwd: target,
      env: { ...process.env, OPENCODE_BIN: stub },
    });

    const plan = JSON.parse(readFileSync(resolve(target, 'plan.json'), 'utf8'));
    assert.equal(plan.modules.find((m) => m.id === 'TICK-ROLE').status, 'done', 'an un-enumerable install must not block the run');

    const log = readFileSync(resolve(target, 'docs/work/conductor-log.jsonl'), 'utf8')
      .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const skipped = log.find((r) => r.kind === 'gate.model-resolve' && /empty list/i.test(r.msg || ''));
    assert.ok(skipped, 'the skip must be logged — a gate that silently stops checking is worse than one that refuses');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
