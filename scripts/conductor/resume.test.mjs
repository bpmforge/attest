// resume.test.mjs (T28.5) — end-to-end: a killed conductor run is
// reconstructed by hand (real tickets.mjs claim()/start() lifecycle, a real
// git worktree/branch with a committed checkpoint, a hand-written
// docs/work/conductor-log.jsonl matching what that run would have logged),
// then a FRESH `conductor.mjs` invocation is run against it — proving
// resume re-verifies the leftover committed work instead of spawning a
// duplicate coder session, and that a plan.json claim with no receipt trail
// backing it is refused outright, before anything is touched.
//
// Run standalone: node --test scripts/conductor/resume.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { reconcileOrphan } from './resume.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));            // scripts/conductor
const REPO_ROOT = resolve(HERE, '..', '..');                     // attest
const CONDUCTOR = resolve(HERE, 'conductor.mjs');
const GATES_SH = resolve(REPO_ROOT, 'scripts/validators/run-handoff-gates.sh');

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

function manifestBody(id, scope) {
  return `# Completion Manifest — ${id}

Maker: conductor
Verifier: conductor-review
Tracker updated: CHANGELOG.md

## Files produced
- \`${scope}/hello.txt\`

## Decisions
- kept it simple

## Known issues
- none

## Verify result
- \`${scope}/hello.txt\` written and present

## Memory written
- None — nothing durable

${id} done -- wrote ${scope}/hello.txt.
`;
}

function setupFixture(ticketId, scope) {
  const base = mkdtempSync(resolve(tmpdir(), 'conductor-t28-5-'));
  const target = resolve(base, 'target-repo');
  mkdirSync(target, { recursive: true });
  const git = (...a) => sh('git', a, { cwd: target });

  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'conductor-test@example.com');
  git('config', 'user.name', 'Conductor Test');
  git('config', 'commit.gpgsign', 'false');

  const verify = `bash ${GATES_SH} --scope ${scope} --manifest docs/reviews/MANIFEST_${ticketId}.md --root .`;
  const plan = {
    goal: 'T28.5 resume fixture',
    modules: [{
      id: ticketId, kind: 'module', title: `Ticket ${ticketId}`, lane: 'lane-a', owner: null, status: 'ready',
      write_scope: [`${scope}/**`], depends_on: [], acceptance: [`writes ${scope}/hello.txt`],
      verify, manifest: `docs/reviews/MANIFEST_${ticketId}.md`,
    }],
  };
  writeFileSync(resolve(target, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
  // Own models.json — otherwise the fallback is this repo's root models.json
  // and the resume tests would depend on the developer's authenticated
  // providers rather than on resume behavior.
  writeFileSync(resolve(target, 'models.json'), JSON.stringify({
    roles: { coder: 'fixture/coder-model', reviewer: 'fixture/reviewer-model' },
  }, null, 2) + '\n');
  for (const d of [scope, 'docs/reviews']) {
    mkdirSync(resolve(target, d), { recursive: true });
    writeFileSync(resolve(target, d, '.gitkeep'), '');
  }
  mkdirSync(resolve(target, 'docs/work'), { recursive: true });
  writeFileSync(resolve(target, '.gitignore'), 'docs/work/\n.conductor-worktrees/\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'initial fixture');

  // A stub that must NEVER be invoked in the resume-without-duplication
  // test — its own presence in the args log is exactly what a duplicate
  // session would look like.
  const binDir = resolve(base, 'bin');
  mkdirSync(binDir, { recursive: true });
  const stub = resolve(binDir, 'opencode-stub.sh');
  const argsLog = resolve(base, 'stub-args.log');
  writeFileSync(stub, `#!/usr/bin/env bash
set -euo pipefail
# G4b (v3.1.1) enumerates models at startup, before resume decides anything.
# That is a preflight, not a coder session, so it answers and returns without
# touching the args log — the log's emptiness is this test's entire proof that
# no duplicate session was spawned, and a preflight in it would be a false
# positive. Answering (rather than exiting silently) also keeps the gate from
# reading an empty list as "no model resolves" and refusing before resume runs.
if [[ "\${1:-}" == "models" ]]; then
  printf '%s\\n' fixture/coder-model fixture/reviewer-model
  exit 0
fi
echo "invoked $*" >> ${JSON.stringify(argsLog)}
exit 0
`);
  chmodSync(stub, 0o755);

  return { base, target, git, stub, argsLog };
}

function appendLog(target, rows) {
  const logPath = resolve(target, 'docs/work/conductor-log.jsonl');
  mkdirSync(dirname(logPath), { recursive: true });
  for (const row of rows) appendFileSync(logPath, JSON.stringify(row) + '\n');
}

test('conductor.mjs resume: leftover committed work is re-verified, never re-run through a new session', { timeout: 60_000 }, () => {
  const TICKET = 'TICK-A';
  const SCOPE = 'a';
  const { base, target, git, stub, argsLog } = setupFixture(TICKET, SCOPE);
  try {
    // 1. Real claim()+start() via the actual CLI, exactly as a live run would
    // do — each committed immediately, matching conductor.mjs's own
    // persistPlan() after every transition (a real run never leaves plan.json
    // dirty in the target repo's working tree).
    sh('node', [resolve(REPO_ROOT, 'scripts/lib/tickets.mjs'), 'claim', 'plan.json', TICKET, 'conductor'], { cwd: target });
    git('add', 'plan.json');
    git('commit', '-q', '-m', `chore(${TICKET}): conductor claims ticket`);
    sh('node', [resolve(REPO_ROOT, 'scripts/lib/tickets.mjs'), 'start', 'plan.json', TICKET, 'conductor'], { cwd: target });
    git('add', 'plan.json');
    git('commit', '-q', '-m', `chore(${TICKET}): conductor starts ticket`);

    // 2. Simulate a coder session that already finished and committed, then
    // the conductor process was killed before it ran the scope/close gates.
    // Matches conductor.mjs's real WT_BASE: a sibling of --root (base/), not
    // nested inside it — DEFAULT_CONFIG.worktreeDir resolved via
    // resolve(ROOT, '..', worktreeDir).
    const branch = 'feat/tick-a-conductor';
    const wt = resolve(base, '.conductor-worktrees', TICKET);
    mkdirSync(resolve(base, '.conductor-worktrees'), { recursive: true });
    git('worktree', 'add', '-q', '-b', branch, wt, 'main');
    mkdirSync(resolve(wt, SCOPE), { recursive: true });
    writeFileSync(resolve(wt, SCOPE, 'hello.txt'), 'hello\n');
    mkdirSync(resolve(wt, 'docs/reviews'), { recursive: true });
    writeFileSync(resolve(wt, 'docs/reviews', `MANIFEST_${TICKET}.md`), manifestBody(TICKET, SCOPE));
    sh('git', ['add', '-A'], { cwd: wt });
    sh('git', ['commit', '-q', '-m', `feat(${TICKET}): killed-run checkpoint`], { cwd: wt });

    // 3. Hand-write the receipts trail a real run would have logged up to
    // the point of the kill (claim/start already ran; one attempt started).
    appendLog(target, [
      { ts: '2026-07-13T00:00:00.000Z', kind: 'conductor.start', msg: 'root=... (prior run)' },
      { ts: '2026-07-13T00:00:01.000Z', kind: 'ticket.start', ticket: TICKET, msg: `Ticket ${TICKET}` },
      { ts: '2026-07-13T00:00:02.000Z', kind: 'session.start', ticket: TICKET, msg: 'attempt 1', role: 'coder' },
      { ts: '2026-07-13T00:00:03.000Z', kind: 'ticket.attempt', ticket: TICKET, msg: 'attempt 1/2', role: 'coder' },
    ]);

    // 4. Fresh conductor invocation — this IS the resume. The stub must
    // never be invoked for TICKET: the whole point is not re-running the
    // coder session on top of already-committed, already-gated-worthy work.
    sh('node', [CONDUCTOR, '--root', target, '--rounds', '1', '--actor', 'conductor', '--reviewer-actor', 'conductor-review', '--max-attempts', '2', '--no-push'], {
      cwd: target,
      env: { ...process.env, OPENCODE_BIN: stub },
    });

    // Read the receipts BEFORE asserting on status: when resume declines to
    // land the ticket, the status alone ('ready') says only that something
    // refused, never which gate — and the temp fixture is destroyed in the
    // finally block, taking the evidence with it. Attaching the trail to the
    // assertion message is the difference between a diagnosis and a re-run.
    const log = readFileSync(resolve(target, 'docs/work/conductor-log.jsonl'), 'utf8')
      .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const trail = () => log.map((r) => `${r.kind} ${r.ticket || ''} — ${(r.msg || '').slice(0, 300)}`).join('\n');

    const plan = JSON.parse(readFileSync(resolve(target, 'plan.json'), 'utf8'));
    const m = plan.modules.find((x) => x.id === TICKET);
    assert.equal(m.status, 'done', `resume should land the ticket using the leftover committed work\n--- receipts ---\n${trail()}`);

    assert.equal(existsSync(argsLog), false, 'the opencode stub must never be invoked — resume must not spawn a duplicate coder session');
    assert.ok(log.some((r) => r.kind === 'resume.reverify' && r.ticket === TICKET), 'should log a resume.reverify entry');
    assert.ok(log.some((r) => r.kind === 'ticket.receipt' && r.ticket === TICKET && /resume/i.test(r.msg || '')), 'the close receipt should be logged as coming from resume, not a fresh session');
    assert.equal(log.filter((r) => r.kind === 'resume.drift-refused').length, 0, 'a genuinely reconcilable resume must not be flagged as drift');

    // No leftover worktree/branch after landing.
    assert.equal(existsSync(wt), false, 'worktree should be cleaned up after landing');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('conductor.mjs resume: a hand-doctored plan.json with no receipt trail is refused, not silently trusted', { timeout: 60_000 }, () => {
  const TICKET = 'TICK-B';
  const SCOPE = 'b';
  const { base, target, git, stub, argsLog } = setupFixture(TICKET, SCOPE);
  try {
    // Hand-doctor plan.json directly — bypassing claim()/start() entirely,
    // exactly the "STATE claims work is underway with nothing to back it up"
    // scenario. No docs/work/conductor-log.jsonl exists at all. Committed
    // (not left dirty) — a real crash's plan.json IS committed, at whatever
    // it was persisted to; it's the receipt trail behind that commit that's
    // fabricated here, not the fact that it's on disk.
    const planPath = resolve(target, 'plan.json');
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    const m = plan.modules.find((x) => x.id === TICKET);
    m.status = 'in_progress';
    m.owner = 'conductor';
    m.claimed_at = '2026-07-13T00:00:00.000Z';
    m.history = [{ ts: '2026-07-13T00:00:00.000Z', actor: 'conductor', from: 'ready', to: 'in_progress', note: 'hand-doctored, not via claim()/start()' }];
    writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n');
    git('add', 'plan.json');
    git('commit', '-q', '-m', 'hand-doctor plan.json (no receipts)');

    let threw = null;
    try {
      sh('node', [CONDUCTOR, '--root', target, '--rounds', '1', '--actor', 'conductor', '--reviewer-actor', 'conductor-review', '--max-attempts', '2', '--no-push'], {
        cwd: target,
        env: { ...process.env, OPENCODE_BIN: stub },
      });
    } catch (e) {
      threw = e;
    }
    assert.ok(threw, 'conductor must refuse to resume (non-zero exit), not proceed');
    assert.equal(threw.status, 3, 'resume drift refusal should exit with the dedicated code 3');
    assert.match(String(threw.stderr || ''), /refusing to resume/i);
    assert.match(String(threw.stderr || ''), new RegExp(TICKET));

    const after = JSON.parse(readFileSync(planPath, 'utf8'));
    const mAfter = after.modules.find((x) => x.id === TICKET);
    assert.equal(mAfter.status, 'in_progress', 'plan.json must be left untouched by a refused resume');
    assert.equal(existsSync(argsLog), false, 'the opencode stub must never be invoked when resume refuses');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('resume does not bypass unfinished review rounds on a committed candidate', async () => {
  const module = { id: 'TICK-REVIEW', status: 'in_progress', owner: 'conductor' };
  const plan = { modules: [module] };
  const calls = [];
  const ctx = {
    actor: 'conductor',
    maxAttempts: 2,
    rounds: 3,
    log: (kind) => calls.push(kind),
    git: (...args) => calls.push(`git:${args.join(' ')}`),
    removeWorktree: () => calls.push('removeWorktree'),
    land: async () => false,
    executeTicket: async (_plan, _module, options) => {
      calls.push(`execute:${JSON.stringify(options)}`);
      return { ok: false };
    },
    loadFreshPlan: () => plan,
  };
  const disk = {
    wt: '/tmp/review-incomplete',
    branch: 'feat/tick-review-conductor',
    wtExists: true,
    branchExists: true,
    commitsAheadOfMain: 1,
    uncommitted: false,
  };
  const rows = [{ kind: 'ticket.attempt', ticket: module.id }];

  const outcome = await reconcileOrphan(ctx, module, disk, rows);

  assert.equal(outcome, 'exhausted');
  assert.ok(calls.includes('resume.incomplete-rounds'));
  assert.ok(calls.includes('removeWorktree'));
  assert.ok(calls.includes('execute:{"alreadyStarted":true,"maxAttempts":1}'));
  assert.equal(calls.includes('resume.reverify'), false,
    'a committed but incompletely reviewed candidate must not jump directly to close()');
});
