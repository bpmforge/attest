#!/usr/bin/env node
// e2e-sdlc-path.mjs — prove the FULL expert SDLC path runs unattended.
//
// The repo has three runners and no test that they compose:
//   run-until-done.sh  drives SDLC phases (STATE.md, /sdlc resume, promise token)
//   conductor.mjs      drives Phase 4 module tickets (plan.json, gates, merges)
//   run-plan.mjs       drives task-decomposer node DAGs
// Between phase 3 and phase 4 sits the handoff a human normally does by hand:
// read the design docs, write plan.json module tickets, then point the executor
// at them. This script does that end to end against a throwaway project and
// grades what actually landed, so "the automation works" stops being a claim.
//
// THE SEAM THIS EXISTS TO TEST. Nothing agrees on where plan.json lives:
//   task-decomposer   writes docs/work/plan/plan.json
//   sdlc-feature-mode writes docs/work/plan.json
//   run-until-done.sh reads  docs/work/plan.json
//   conductor.mjs     reads  <root>/plan.json        <-- nothing produces this
// The conductor takes --plan, so this is a wiring gap, not a bug — but it is
// exactly the manual step being automated here, so bridge() probes every known
// location and FAILS LOUDLY naming what it found rather than defaulting.
//
// WHAT IS ACTUALLY AUTOMATABLE. Phases 0-3 are NOT: sdlc-lead.md marks the
// Discovery Interview NEVER-AUTO ("this is user input — no default exists;
// pauses even in autonomy: auto"). `/sdlc init` is specified to stop and wait
// for a human, so a model that runs straight through it is violating the
// protocol rather than demonstrating autonomy. Phase 4 — the coding phase,
// against a board that already exists — is the automation target, and is what
// this harness runs by default.
//
// Usage:
//   node scripts/e2e-sdlc-path.mjs                   # Phase 4 on a seeded board (default)
//   node scripts/e2e-sdlc-path.mjs --stage-only      # build the fixture, no model calls (free)
//   node scripts/e2e-sdlc-path.mjs --dry-run         # + wire-check the runners (free)
//   node scripts/e2e-sdlc-path.mjs --phase a         # phases 0-3 — NEEDS A HUMAN at the interview
//   node scripts/e2e-sdlc-path.mjs --phase all       # both, same caveat
//
// Flags: --coder <m> --reviewer <m> --max-sessions <n> --max-session-seconds <n>
//        --keep (do not wipe an existing fixture)
//
// Staging is IN-REPO (.tmp-e2e/, gitignored via .tmp-*/). bench-realworld.mjs
// learned this the hard way: opencode rejects an external_directory, so a
// workcopy under /tmp silently fails every tool call.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);

const NAME = flag('--name', 'ledger');
const STAGE = join(REPO, '.tmp-e2e');
const PROJ = join(STAGE, NAME);

// Cheap, and — critically — DISTINCT. G4 refuses a run whose coder and reviewer
// are the same model, and G4b refuses ids `opencode models` cannot resolve.
// Both defaults were verified present on this install before being hardcoded.
const CODER = flag('--coder', 'github-copilot/claude-haiku-4.5');
const REVIEWER = flag('--reviewer', 'github-copilot/gpt-5.4-mini');
const MAX_SESSIONS = flag('--max-sessions', '6');
const MAX_SESSION_SECONDS = flag('--max-session-seconds', '900');
// Phase 4 is the DEFAULT, and phases 0-3 are opt-in, because only Phase 4 is
// automatable. sdlc-lead.md:377 marks the Discovery Interview NEVER-AUTO —
// "this is user input — no default exists; pauses even in autonomy: auto" — so
// `/sdlc init` is specified to stop and wait for a human. A model that runs
// straight through it is violating the protocol, not demonstrating autonomy,
// and an earlier version of this harness proved "the full path unattended" on
// exactly that violation. A different model family parked at the interview and
// was right to. The real automation target is the coding phase against a board
// that already exists — which is also the situation of any project whose
// planning was done in an earlier interactive session.
const PHASE = flag('--phase', 'b');
const DRY = has('--dry-run');
const STAGE_ONLY = has('--stage-only');

const log = (...a) => console.log(`[e2e]`, ...a);
const sh = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });

// ---------------------------------------------------------------------------
// 1. Stage a throwaway project
// ---------------------------------------------------------------------------

// Deliberately small AND deliberately modular: three disjoint file trees, so
// task-decomposer's "modular feature detection" emits a modules[] layer at all.
// A single-file brief would skip the module tickets and test nothing about the
// conductor. Node-based so `node --test` is a real verify command with no
// toolchain install.
const BRIEF = `# BRIEF — ${NAME}

A tiny double-entry ledger CLI. Three independent pieces:

1. **Parser** (\`src/parse.js\`) — parse ledger lines of the form
   \`YYYY-MM-DD | <account> | <amount> | <description>\`
   into entry objects. Reject malformed lines with a clear error naming the line number.
2. **Balance** (\`src/balance.js\`) — given entries, compute the balance per account
   and a grand total. Amounts are decimal strings; do not use floating point for money.
3. **Report** (\`src/report.js\`) — render balances as a fixed-width text table,
   accounts sorted alphabetically, amounts right-aligned to 2 decimal places.

A \`src/cli.js\` wires them: read a file path from argv, print the report.

## Acceptance
- \`node --test\` passes, with tests for each of the three modules.
- A malformed input line produces a non-zero exit and names the offending line.
- Money never round-trips through a JS float.
`;

function stage() {
  if (existsSync(PROJ) && !has('--keep')) {
    rmSync(PROJ, { recursive: true, force: true });
    // The conductor puts worktrees in a SIBLING of the target
    // (resolve(ROOT, '..', worktreeDir)), so wiping the project alone leaves
    // them behind. Stale ones from a prior run then sit next to the new run's,
    // each with git metadata pointing into a repo that no longer exists —
    // harmless to the run, and exactly the kind of debris that makes a later
    // "which worktree is this?" question take ten minutes.
    rmSync(join(STAGE, '.conductor-worktrees'), { recursive: true, force: true });
  }
  mkdirSync(PROJ, { recursive: true });
  const git = (...a) => {
    const r = sh('git', a, { cwd: PROJ });
    if (r.status !== 0) throw new Error(`git ${a.join(' ')} failed: ${r.stderr || r.stdout}`);
    return r.stdout;
  };

  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'e2e@example.com');
  git('config', 'user.name', 'E2E Harness');
  git('config', 'commit.gpgsign', 'false');

  writeFileSync(join(PROJ, 'BRIEF.md'), BRIEF);
  writeFileSync(join(PROJ, 'package.json'), JSON.stringify({
    name: NAME, version: '0.1.0', type: 'module', private: true,
    scripts: { test: 'node --test' },
  }, null, 2) + '\n');
  // The CANONICAL bootstrap ignore list, verbatim from agents/git-expert.md
  // (v3.0.4). It ignores SPECIFIC per-machine files under docs/work/ — never
  // the directory — because docs/work/STATE.md and docs/work/plan.json are
  // tracked artifacts the whole lifecycle depends on. Ignoring docs/work/
  // wholesale (the obvious-looking shortcut) makes persistPlan()'s
  // `git add <plan>` hard-fail on the first board transition, killing the run.
  // Using the real list is the point: a fixture that ignores more than the
  // documented setup would prove the path works in a configuration nobody has.
  writeFileSync(join(PROJ, '.gitignore'), [
    'node_modules/',
    '',
    '# Expert-system runtime artifacts — generated per-machine, never committed',
    '.code-search/',
    'docs/work/.model-context',
    'docs/work/verify-logs/',
    'docs/work/verify-baseline.txt',
    '**/docs/work/telemetry.jsonl',
    '**/docs/work/session-receipts.jsonl',
    '**/docs/work/watchdog-events.jsonl',
    '**/docs/work/run-until-done.log',
    '',
    '# Conductor run artifacts',
    '.conductor-worktrees/',
    'docs/work/conductor-log.jsonl',
    'docs/work/scope-violation-*.diff',
    '',
  ].join('\n'));
  mkdirSync(join(PROJ, 'src'), { recursive: true });
  writeFileSync(join(PROJ, 'src/.gitkeep'), '');
  mkdirSync(join(PROJ, 'docs/work'), { recursive: true });

  git('add', '-A');
  git('commit', '-q', '-m', 'chore: seed project (brief + toolchain)');

  // The seed must be formatter-clean. The post-edit hook reformats any file a
  // session touches; if the seed is not already formatted, that reformat lands
  // outside the ticket's write_scope and the scope gate refuses — correctly and
  // unavoidably. This cost four attempts across two tickets on a real run.
  const dirty = sh('git', ['status', '--porcelain'], { cwd: PROJ }).stdout.trim();
  if (dirty) throw new Error(`seed is not clean after commit:\n${dirty}`);

  log(`staged ${PROJ}`);
  return PROJ;
}

// ---------------------------------------------------------------------------
// 2. Phase A — SDLC phases 0-3 via the session-restart outer loop
// ---------------------------------------------------------------------------

// A hand-authored board, standing in for the plan.json a project already has
// from its interactive planning session. This is what lets Phase 4 be tested on
// its own: the coding phase does not care how the board was produced, only that
// it validates. Every field here is one the executor actually consumes — test
// siblings in write_scope, a runnable verify, a manifest under docs/reviews/.
function seedBoard() {
  const mk = (id, title, file, deps) => ({
    id, kind: 'module', title, lane: 'src', owner: null, status: 'ready',
    write_scope: [`src/${file}.js`, `src/${file}.test.js`],
    depends_on: deps,
    acceptance: [
      `${title} implemented in src/${file}.js as named exports`,
      'unit tests in the sibling .test.js using node:test',
      'money handled as decimal strings, never JS floats',
    ],
    verify: `node --test src/${file}.test.js`,
    manifest: `docs/reviews/MANIFEST_${id}.md`,
  });
  const plan = {
    goal: 'ledger CLI — pre-made module board',
    modules: [
      mk('T-decimal', 'Decimal string arithmetic', 'decimal', []),
      mk('T-parse', 'Ledger line parser', 'parse', ['T-decimal']),
      mk('T-balance', 'Balance computation', 'balance', ['T-decimal', 'T-parse']),
    ],
  };
  mkdirSync(join(PROJ, 'docs/work'), { recursive: true });
  writeFileSync(join(PROJ, 'docs/work/plan.json'), JSON.stringify(plan, null, 2) + '\n');
  mkdirSync(join(PROJ, 'docs/reviews'), { recursive: true });
  writeFileSync(join(PROJ, 'docs/reviews/.gitkeep'), '');
  sh('git', ['add', '-A'], { cwd: PROJ });
  sh('git', ['commit', '-q', '-m', 'chore: module board (as an interactive planning session would leave it)'], { cwd: PROJ });
  log(`seeded a ${plan.modules.length}-ticket board at docs/work/plan.json`);
}

function phaseA() {
  const prompt = [
    `/sdlc init ${NAME} "double-entry ledger CLI"`,
    ``,
    `Read BRIEF.md in this directory. Run the SDLC from Phase 0 through Phase 3,`,
    `then produce the Phase 4 module-ticket layer: write docs/work/plan.json with a`,
    `modules[] array per docs/TICKET_SCHEMA.md — one module per independently`,
    `buildable piece, each with an exclusive write_scope, depends_on, acceptance,`,
    `verify and manifest fields. Validate it with`,
    // Install-qualified on purpose. The first run of this harness handed the
    // agent the bare project-relative path; it looked in the project, found
    // nothing, and wrote its own validator against a schema it invented.
    `\`node ~/.config/opencode/scripts/lib/tickets.mjs validate docs/work/plan.json\``,
    `before finishing, and FIX what it reports — a board that does not validate`,
    `cannot be executed by the Phase 4 conductor.`,
    `Every module's \`manifest\` must be \`docs/reviews/MANIFEST_<id>.md\` — the`,
    `executor writes the Completion Manifest to that path, and only docs/work/`,
    `and docs/reviews/ are writable outside a ticket's write_scope.`,
    `Give EVERY module \`"reviews": ["security", "perf", "test"]\` so the Phase 4`,
    `executor runs the security-auditor, performance-engineer and test-engineer`,
    `against each ticket in addition to the default code-reviewer. Without that`,
    `field only one reviewer runs, and a ticket can land having been checked for`,
    `code quality alone.`,
    `Keep the docs short — this is a small project, not an enterprise program.`,
  ].join('\n');

  const args = [
    join(REPO, 'scripts/run-until-done.sh'),
    '--root', '.',
    '--prompt', prompt,
    '--agent', 'sdlc-lead',
    '--model', CODER,
    '--max-sessions', String(MAX_SESSIONS),
    '--max-session-seconds', String(MAX_SESSION_SECONDS),
  ];

  if (DRY) { log('DRY phase A:', 'bash', args.map((a) => (a.includes('\n') ? '<prompt>' : a)).join(' ')); return { dry: true }; }

  log(`phase A — SDLC 0-3 on ${CODER} (max ${MAX_SESSIONS} sessions)`);
  const r = sh('bash', args, { cwd: PROJ, stdio: 'inherit' });
  log(`phase A exit=${r.status}`);
  return { status: r.status };
}

// ---------------------------------------------------------------------------
// 3. The bridge — find the plan the SDLC actually wrote
// ---------------------------------------------------------------------------

const PLAN_CANDIDATES = [
  'docs/work/plan.json',       // sdlc-feature-mode, run-until-done.sh
  'docs/work/plan/plan.json',  // task-decomposer
  'plan.json',                 // conductor.mjs's own default
];

function bridge() {
  const found = PLAN_CANDIDATES.filter((p) => existsSync(join(PROJ, p)));
  if (!found.length) {
    return { ok: false, reason: `no plan.json at any known location: ${PLAN_CANDIDATES.join(', ')}` };
  }
  // Prefer the first that actually carries a modules[] layer — a nodes-only
  // plan is a task-decomposer DAG, which the conductor cannot execute.
  for (const p of found) {
    let plan;
    try { plan = JSON.parse(readFileSync(join(PROJ, p), 'utf8')); } catch (e) {
      return { ok: false, reason: `${p} is not valid JSON: ${e.message}` };
    }
    const mods = plan.modules || [];
    if (mods.length) return { ok: true, path: p, modules: mods.length, found };
  }
  return { ok: false, reason: `found ${found.join(', ')} but none carries a modules[] layer`, found };
}

// ---------------------------------------------------------------------------
// 4. Phase B — Phase 4 module tickets via the conductor
// ---------------------------------------------------------------------------

// The handoff itself. A human does this by hand between "the SDLC finished
// planning" and "start the executor": commit whatever the phase left loose,
// because conductor.mjs refuses to start on a dirty tree. Automating the path
// means automating this too — and it must be LOUD, because silently committing
// an agent's uncommitted work is how unreviewed changes get laundered into a
// baseline. Anything still dirty here is reported before it is committed.
function commitPhaseOutput() {
  const dirty = sh('git', ['status', '--porcelain'], { cwd: PROJ }).stdout.trim();
  if (!dirty) { log('handoff: tree already clean'); return; }
  log(`handoff: committing ${dirty.split('\n').length} pending path(s) left by phase A:`);
  for (const l of dirty.split('\n')) log(`    ${l}`);
  sh('git', ['add', '-A'], { cwd: PROJ });
  sh('git', ['commit', '-q', '-m', 'chore(sdlc): commit phase 0-3 output before Phase 4 handoff'], { cwd: PROJ });
}

function phaseB(planPath) {
  commitPhaseOutput();
  // The conductor resolves role models from the TARGET project's models.json
  // when it has one, so write it here rather than mutating the repo's.
  writeFileSync(join(PROJ, 'models.json'), JSON.stringify({
    roles: { coder: CODER, reviewer: REVIEWER },
  }, null, 2) + '\n');
  const git = (...a) => sh('git', a, { cwd: PROJ });
  git('add', 'models.json');
  git('commit', '-q', '-m', 'chore: role models for the conductor');

  const args = [
    join(REPO, 'scripts/conductor/conductor.mjs'),
    '--root', PROJ,
    '--plan', planPath,
    '--max-attempts', '2',
    '--no-push',
  ];
  if (DRY) args.push('--dry-run');

  log(`phase B — conductor on ${planPath} (coder=${CODER} reviewer=${REVIEWER})`);
  const r = sh('node', args, { cwd: PROJ, stdio: 'inherit' });
  log(`phase B exit=${r.status}`);
  return { status: r.status };
}

// ---------------------------------------------------------------------------
// 5. Grade what actually landed
// ---------------------------------------------------------------------------

function verify() {
  const rows = [];
  const check = (label, pass, detail = '') => rows.push({ label, pass, detail });
  const at = (p) => join(PROJ, p);

  // Phase 0-3 artifacts. Not an exhaustive SDLC audit — the question is whether
  // the phases ran at all, so one representative doc per phase band.
  check('Phase 0-1 docs', existsSync(at('docs/VISION.md')) || existsSync(at('docs/SCOPE.md')),
    'docs/VISION.md or docs/SCOPE.md');
  check('Phase 2 requirements', existsSync(at('docs/SRS.md')) || existsSync(at('docs/USER_STORIES.md')),
    'docs/SRS.md or docs/USER_STORIES.md');
  check('Phase 3 design', existsSync(at('docs/ARCHITECTURE.md')) || existsSync(at('docs/TECH_STACK.md')),
    'docs/ARCHITECTURE.md or docs/TECH_STACK.md');
  check('STATE.md exists', existsSync(at('docs/work/STATE.md')), 'the resume anchor');

  const b = bridge();
  check('plan.json with modules[]', b.ok, b.ok ? `${b.path} — ${b.modules} module(s)` : b.reason);

  // Ticket hygiene, using the real validator rather than a shape guess.
  if (b.ok) {
    const v = sh('node', [join(REPO, 'scripts/lib/tickets.mjs'), 'validate', b.path], { cwd: PROJ });
    check('tickets validate', v.status === 0, (v.stdout || v.stderr || '').trim().slice(0, 200));
  }

  // State drift: every phase STATE.md claims done must have a gate receipt.
  const drift = sh('bash', [join(REPO, 'scripts/validators/validate-state-drift.sh'), PROJ, at('docs/work/STATE.md')]);
  check('state-drift clean', drift.status === 0, (drift.stdout || '').trim().split('\n').slice(-2).join(' '));

  // The point of the whole exercise: did code land, and does it pass?
  const srcFiles = sh('git', ['ls-files', 'src/'], { cwd: PROJ }).stdout.trim().split('\n').filter((s) => s && !s.endsWith('.gitkeep'));
  check('source files committed', srcFiles.length > 0, `${srcFiles.length} file(s): ${srcFiles.slice(0, 6).join(', ')}`);

  // Did the BOARD finish, not just "did anything land". Without this the
  // scorecard reported 9/9 on a run where one of five tickets was refused and
  // released back to `ready` — every check it happened to make passed, and the
  // one that mattered was not being made. A measurement instrument that
  // over-reports is worse than a missing one.
  if (b.ok) {
    const plan = JSON.parse(readFileSync(at(b.path), 'utf8'));
    const mods = plan.modules || [];
    const done = mods.filter((m) => m.status === 'done');
    const unfinished = mods.filter((m) => m.status !== 'done');
    check('every ticket landed', unfinished.length === 0,
      `${done.length}/${mods.length} done` +
      (unfinished.length ? ` — outstanding: ${unfinished.map((m) => `${m.id}(${m.status})`).join(', ')}` : ''));
  }

  // WHICH REVIEWERS ACTUALLY RAN. The conductor runs `code-reviewer` plus
  // whatever each ticket opts into via `reviews: [...]`; a board that requests
  // none gets exactly one reviewer, and a ticket can land checked for code
  // quality alone. That is what happened on the first passing run, and the
  // scorecard said nothing — "it landed" and "it was reviewed properly" are
  // different claims and this file must not conflate them. Read from the
  // receipts, not from the board's intent.
  const receipts = at('docs/work/conductor-log.jsonl');
  if (existsSync(receipts)) {
    const ran = new Set();
    for (const line of readFileSync(receipts, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.kind === 'round2.review.start') {
          const who = /^(\S+)\s*->/.exec(r.msg || '')?.[1];
          if (who) ran.add(who);
        }
      } catch { /* partial line */ }
    }
    const wanted = ['code-reviewer', 'security', 'perf', 'test'];
    const missing = wanted.filter((w) => !ran.has(w));
    check('full reviewer set ran', ran.size > 0 && missing.length === 0,
      `ran: ${[...ran].join(', ') || '(none)'}${missing.length ? ` — MISSING: ${missing.join(', ')}` : ''}`);
  }

  // Run node --test directly with the reporter PINNED rather than going
  // through `npm test`, whose script we do not control. node --test picks
  // `spec` on a TTY and `tap` otherwise, and the two summarise differently
  // (`ℹ pass 6` vs `# pass 6`) — parsing one form silently misreports the
  // other as "no tests passed". Pass 53 hit exactly this; the scorecard had
  // the same bug, which would have scored a GREEN suite as a FAIL the moment
  // the conductor actually landed tests. Accept either form regardless.
  const t = sh('node', ['--test', '--test-reporter=tap'], { cwd: PROJ });
  const out = `${t.stdout || ''}${t.stderr || ''}`;
  const passCount = /^# pass (\d+)$/m.exec(out)?.[1] ?? /ℹ pass (\d+)/.exec(out)?.[1];
  const failCount = /^# fail (\d+)$/m.exec(out)?.[1] ?? /ℹ fail (\d+)/.exec(out)?.[1];
  check('project tests pass', Number(passCount || 0) > 0 && Number(failCount || 0) === 0,
    passCount ? `${passCount} passing, ${failCount ?? '?'} failing` : out.trim().split('\n').slice(-3).join(' | '));

  console.log('\n=== E2E SDLC PATH SCORECARD ===');
  for (const r of rows) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
  const failed = rows.filter((r) => !r.pass).length;
  console.log(`\n${rows.length - failed}/${rows.length} checks passed\n`);
  return failed === 0;
}

// ---------------------------------------------------------------------------

function main() {
  if (!existsSync(PROJ) || !has('--keep')) stage();
  if (STAGE_ONLY) { log('staged only — no model calls made'); return 0; }

  // Phases 0-3 only on explicit request — they need a human at the Discovery
  // Interview. Otherwise seed the board Phase 4 consumes.
  if (PHASE === 'a' || PHASE === 'all') phaseA();
  else if (!existsSync(join(PROJ, 'docs/work/plan.json'))) seedBoard();

  const b = bridge();
  if (!b.ok) {
    log(`BRIDGE FAILED: ${b.reason}`);
    if (!DRY) { verify(); return 1; }
  } else {
    log(`bridge: ${b.path} carries ${b.modules} module ticket(s)`);
  }

  if (PHASE === 'b' || PHASE === 'all') {
    if (!b.ok && !DRY) { log('cannot run phase B without a modules[] plan'); return 1; }
    phaseB(b.ok ? b.path : 'docs/work/plan.json');
  }

  if (DRY) { log('dry run complete — no model calls made'); return 0; }
  return verify() ? 0 : 1;
}

process.exit(main());
