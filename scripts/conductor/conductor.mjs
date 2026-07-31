#!/usr/bin/env node
// T28.1 — Conductor core loop, adapted from the field-proven shipwright port
// (see README.md history). This version targets THIS repo's actual
// machinery: scripts/lib/tickets.mjs's enforced module lifecycle
// (ready->claimed->in_progress->in_review->done) instead of shipwright's
// flat todo/in_progress/blocked/done, and `opencode run` instead of
// `claude -p`. Breakpoints/morning-queue (T28.4) is explicitly out of scope
// here — see its board entry.
//
// T28.5 — resume + drift refusal (scripts/conductor/resume.mjs). On
// startup, any module left `claimed`/`in_progress` and owned by THIS actor
// (orphaned by a killed prior run) is reconciled from disk — re-verified
// via the same scope/close gates, never redone with a fresh coder session,
// when the worktree already carries real committed work — or refused
// outright, for the whole run, when plan.json disagrees with its own
// receipts (docs/work/conductor-log.jsonl) or the git reality of its
// worktree/branch. See resume.mjs's header for the full rationale.
//
// T28.2 — models.json role→model routing. The coder session's --model is
// resolved from models.json's `roles.coder` (CLI --model still wins when
// given explicitly). Maker != verifier is enforced mechanically at startup,
// before any ticket is claimed: if roles.reviewer or roles.challenger
// resolve to the SAME model id as roles.coder, the run either refuses
// (--role-gate block, the default — the never-self-judge principle from the
// M27 audit, now checked against actual model identity instead of only the
// ACTOR/REVIEWER_ACTOR string split land() already enforced) or logs a
// warning and continues (--role-gate warn). land()'s accept() call remains
// identity-enforced (a distinct REVIEWER_ACTOR) — this repo's conductor does
// not yet spawn a live reviewer session, so roles.reviewer/challenger are a
// routing declaration for when one exists (T28.4+), checked here for
// distinctness now rather than left to silently drift.
/**
 * conductor.mjs — unattended ticket executor for a target project's
 * module-contract plan.json (docs/TICKET_SCHEMA.md).
 *
 * THE CONDUCTOR HOLDS THE GATES, NOT THE AGENTS: each ticket runs in a
 * fresh `opencode run` session inside its OWN git worktree (isolated tree +
 * branch) with NO git or plan.json access — the session's only job is to
 * write code inside its write_scope and a Completion Manifest. Every status
 * transition (claim/start/close/accept/release) is performed by THIS
 * script, on the target project's `plan.json`, via scripts/lib/tickets.mjs's
 * enforced lifecycle verbs — never hand-edited, never asserted by the
 * session. `close()` itself is the load-bearing gate: it runs the ticket's
 * `verify` command (normally run-handoff-gates.sh) from OUTSIDE the
 * session and refuses to advance the ticket if it's non-zero.
 *
 * Usage:
 *   node conductor.mjs --root <target-project> [--plan plan.json]
 *     [--actor conductor] [--reviewer-actor conductor-review]
 *     [--max-attempts 2] [--max-tickets N] [--model provider/model]
 *     [--agent coding-agent] [--rounds 3|1] [--fix-iterations 3]
 *     [--models models.json] [--role-gate warn|block]
 *     [--no-merge] [--no-push] [--dry-run]
 *
 * Stop any time: `touch STOP` in --root (checked between tickets).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { triggeredReviewers } from '../lib/review-triggers.mjs';
import { loadPlan, savePlan, validatePlan, writeScopeCollisions, recomputeStatus, claimable, claim, start, comment, close, accept, release } from '../lib/tickets.mjs';
import { loadModelsConfig, resolveRole, checkMakerVerifierDistinct } from '../lib/model-tiers.mjs';
import { findDrift, loadLogRows, startReceiptFromHistory, reconcileOrphan } from './resume.mjs';

const SELF_DIR = dirname(fileURLToPath(import.meta.url)); // scripts/conductor
const LIB_ROOT = resolve(SELF_DIR, '..');                 // scripts/ (this repo — where our own tickets.mjs/validators live)
const VALIDATORS_DIR = resolve(LIB_ROOT, 'validators');

// ---------- args ----------
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : dflt;
};
const ROOT = resolve(String(opt('root', '.')));           // target project being conducted

// Where the module board lives, when --plan does not say.
//
// Nothing in this system agreed on that. task-decomposer writes
// `docs/work/plan/plan.json`; sdlc-feature-mode writes `docs/work/plan.json`;
// run-until-done.sh reads `docs/work/plan.json`; and this file defaulted to
// `<root>/plan.json`, which NO producer has ever written. The join was a step
// the operator had to know to make by hand (`--plan docs/work/plan.json`) with
// nothing documenting it — so pointing the conductor at a project the SDLC had
// just planned reported "no plan.json" and looked like the SDLC had failed to
// produce one.
//
// Probing is ordered by producer, and a candidate only wins if it actually
// carries a `modules[]` layer: `docs/work/plan/plan.json` is usually a
// task-decomposer NODE dag, which this executor cannot run, and it must not
// shadow a real module board sitting at the root. An explicit --plan always
// wins and is never probed — an operator naming a file gets that file, or a
// clean error about that file.
const PLAN_CANDIDATES = ['docs/work/plan.json', 'docs/work/plan/plan.json', 'plan.json'];
function discoverPlanPath() {
  const explicit = opt('plan', null);
  if (explicit) return resolve(ROOT, String(explicit));
  const present = PLAN_CANDIDATES.filter((p) => existsSync(resolve(ROOT, p)));
  for (const p of present) {
    try {
      const plan = JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
      if ((plan.modules || []).length) return resolve(ROOT, p);
    } catch { /* unreadable/!JSON — let the normal load path report it */ }
  }
  // Nothing carried modules[]. Fall back to the first that exists so the
  // existing "no plan.json at <path>" / schema errors still fire on a real
  // file, and to the historical default when the project has none at all.
  return resolve(ROOT, present[0] || 'plan.json');
}
const PLAN_PATH = discoverPlanPath();
const ACTOR = String(opt('actor', 'conductor'));
const REVIEWER_ACTOR = String(opt('reviewer-actor', 'conductor-review'));
const MAX_ATTEMPTS = Number(opt('max-attempts', 2));       // MASTER_PROMPT.md rule 9: ~2 sessions before giving up
const MAX_TICKETS = Number(opt('max-tickets', 999));
const SESSION_MIN = Number(opt('session-minutes', 45));
const MODEL = opt('model', null);
const AGENT = opt('agent', null);
const DO_MERGE = !args.includes('--no-merge');
const DO_PUSH = !args.includes('--no-push');
const DRY = args.includes('--dry-run');

// ---------- T28.2: models.json role→model routing ----------
// Default registry path mirrors validate-model-pins.sh's own fallback: the
// target project's own models.json, else this repo's (the program's real
// tier/role definitions) — so a fixture/target with no models.json of its
// own still routes against a real registry instead of silently no-op'ing.
const MODELS_JSON_PATH = resolve(String(opt('models',
  existsSync(resolve(ROOT, 'models.json')) ? resolve(ROOT, 'models.json') : resolve(LIB_ROOT, '..', 'models.json'))));
const ROLE_GATE = String(opt('role-gate', 'block')); // 'block' (default, fail-closed) | 'warn'
// G4b: does each configured role model actually resolve on this install?
// 'block' (default) | 'warn' | 'off' (skip the `opencode models` call entirely).
const MODEL_GATE = String(opt('model-gate', 'block'));
const MODELS_CONFIG = existsSync(MODELS_JSON_PATH) ? loadModelsConfig(MODELS_JSON_PATH) : null;
const ROLE_MODELS = {
  coder: resolveRole('coder', MODELS_CONFIG),
  reviewer: resolveRole('reviewer', MODELS_CONFIG),
  challenger: resolveRole('challenger', MODELS_CONFIG),
};
// Explicit --model always wins (interactive override); else route by role.
const CODER_MODEL = MODEL || ROLE_MODELS.coder || null;

// Role→AGENT routing. Until 2026-07-30 this file never passed `--agent` at all
// (0 occurrences), so every ticket ran as opencode's default `build` agent —
// without the HANDOFF intake rules, BOUNDED_TASK_CONTRACT, the anti-slop rules
// or the verify-loop discipline. The conductor was driving a generic agent and
// then judging it with expert-system gates. Routing mirrors the model routing
// above: explicit --agent wins, else models.json `agents.<role>`, else the
// expert-system default.
const ROLE_AGENTS = MODELS_CONFIG?.agents ?? {};
const CODER_AGENT = AGENT || ROLE_AGENTS.coder || 'coding-agent';
const REVIEWER_AGENT = ROLE_AGENTS.reviewer || 'code-reviewer';
const REVIEWER_MODEL = ROLE_MODELS.reviewer || CODER_MODEL;

// ---------- Phase 4 mini-lifecycle (PARALLEL_WAVE_PROTOCOL) ----------
// The protocol runs THREE rounds per module: code -> review -> runtime. Until
// 2026-07-31 the conductor ran only round 1, so `roles.reviewer` was a routing
// declaration with nothing behind it — maker != verifier was checked at startup
// and then never exercised, because no reviewer session existed. ROUNDS=3 runs
// the real loop: a review session on the REVIEWER model and agent (so the
// verifier genuinely is not the maker), a bounded fix loop, then a runtime
// verdict. ROUNDS=1 keeps the old coder-only behaviour for a bare run.
const ROUNDS = Number(opt('rounds', 3));
const FIX_ITERATIONS = Number(opt('fix-iterations', 3)); // protocol: up to 3
// Optional extra reviewers per ticket via `reviews: ["security", ...]`.
const REVIEW_AGENTS = {
  security: 'security-auditor',
  perf: 'performance-engineer',
  ux: 'ux-engineer',
  test: 'test-engineer',
};
const OPENCODE_BIN = process.env.OPENCODE_BIN || 'opencode'; // overridable so tests/CI can stub it

// ---------- config (target-project-specific; script itself stays repo-agnostic) ----------
const DEFAULT_CONFIG = {
  branchSuffix: '-conductor',
  worktreeDir: '.conductor-worktrees',
  remotes: ['github', 'origin'],
};
const CONFIG = (() => {
  const f = resolve(ROOT, 'conductor.config.json');
  if (!existsSync(f)) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(f, 'utf8')) };
})();
const WT_BASE = resolve(ROOT, '..', CONFIG.worktreeDir);
const LOG = resolve(ROOT, 'docs/work/conductor-log.jsonl');
const HALT_NOTICE = resolve(ROOT, 'docs/work/CONDUCTOR_HALT.md');
const STOPFILE = resolve(ROOT, 'STOP');

// ---------- utils ----------
const now = () => new Date().toISOString();
const log = (kind, data = {}) => {
  const row = { ts: now(), kind, ...data };
  console.log(`[${row.ts}] ${kind}${data.ticket ? ` ${data.ticket}` : ''}${data.msg ? ` — ${data.msg}` : ''}`);
  try { mkdirSync(dirname(LOG), { recursive: true }); appendFileSync(LOG, JSON.stringify(row) + '\n'); } catch {}
};
const sh = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const git = (...a) => sh('git', a, { cwd: ROOT }).trim();       // runs in ROOT (stays on main)
const gitIn = (dir, ...a) => sh('git', a, { cwd: dir }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mirror the board to an external tracker (Jira) after a transition. The
// conductor calls the lifecycle functions IN-PROCESS (not the tickets.mjs CLI),
// so it never emits an outbox event; instead it runs the adapter's `reconcile`,
// whose convergence pass (syncState) aligns Jira to plan.json regardless of
// which writer changed it. No-op unless a Jira backend is configured
// (TRACKER_BACKEND=jira / JIRA_BASE_URL set). Best-effort: a Jira failure never
// breaks the conductor — the next reconcile catches up (lossless outbox).
function mirrorJira(reason) {
  const backend = (process.env.TRACKER_BACKEND || 'auto').toLowerCase();
  const on = backend === 'jira' || (backend === 'auto' && process.env.JIRA_BASE_URL);
  if (!on) return;
  const jira = resolve(import.meta.dirname, '../jira/jira.mjs');
  try {
    const out = sh('node', [jira, 'reconcile'], { cwd: ROOT, env: { ...process.env, PLAN_JSON: PLAN_PATH } });
    log('jira.mirror', { msg: `${reason}: ${out.trim().split('\n')[0]}` });
  } catch (e) {
    log('jira.mirror.deferred', { msg: `${reason}: ${String(e.message).split('\n')[0]} — next reconcile catches up` });
  }
}

function loadFreshPlan() { return loadPlan(PLAN_PATH); }
function persistPlan(plan, message) {
  savePlan(PLAN_PATH, plan);
  if (DRY) return;
  git('add', PLAN_PATH);
  try { git('commit', '-q', '-m', message); }
  catch (e) { if (!/nothing to commit/i.test(String(e.stdout || e.message))) throw e; }
}

/**
 * Commit one run artifact the conductor itself wrote.
 *
 * WHY. main() refuses to start on a dirty target tree, and the conductor was
 * leaving its OWN output uncommitted — CONDUCTOR_HALT.md. The second run of
 * the day then died on `target repo working tree not clean` because of a file
 * the FIRST run created. Anything the conductor writes into the target repo
 * it must also commit. (Sole caller today: the halt notice. The scope-violation
 * diffs captureScopeEvidence() writes are NOT routed through here — they live
 * under the same ignored docs/work/, so they never dirty the tree either.)
 *
 * UNLESS git already ignores it. v3.0.4 put `docs/work/` in the bootstrap
 * .gitignore precisely because it holds this system's runtime artifacts — and
 * every path this function is given lives there. An ignored file never appears
 * in `git status --porcelain`, so it cannot dirty the tree, so the entire
 * reason to commit it is gone; `git add` on it just hard-fails ("paths are
 * ignored by one of your .gitignore files"), which took down the halt path —
 * the LAST thing a run does — in every project that follows our own bootstrap.
 * Same drift as v3.0.1/3.0.4/3.0.6/3.1.0: a requirement moved, its consumer
 * did not. Forcing the add with -f would be the wrong repair; it would commit
 * runtime noise that v3.0.4 deliberately excluded.
 */
function commitArtifact(absPath, message) {
  if (DRY || !existsSync(absPath)) return;
  // `git check-ignore` exits 0 when the path IS ignored, 1 when it is not.
  // --no-index for the same reason G5 needs it: without it a tracked file under
  // an ignored directory reports not-ignored, and the `git add` below then
  // hard-fails on exactly the path this check was meant to skip.
  let ignored = false;
  try { git('check-ignore', '-q', '--no-index', absPath); ignored = true; } catch { ignored = false; }
  if (ignored) {
    log('artifact.ignored', { msg: `${absPath} is covered by .gitignore — written but not committed (an ignored file cannot dirty the tree)` });
    return;
  }
  try {
    git('add', absPath);
    git('commit', '-q', '-m', message);
  } catch (e) {
    if (!/nothing to commit/i.test(String(e.stdout || e.message))) throw e;
  }
}

// ---------- worktree lifecycle ----------
function slug(id) { return id.toLowerCase().replace(/[^a-z0-9.]+/g, '-'); }
function branchFor(id) { return `feat/${slug(id)}${CONFIG.branchSuffix}`; }
function makeWorktree(m) {
  const branch = branchFor(m.id);
  const wt = resolve(WT_BASE, m.id);
  try { git('worktree', 'remove', '--force', wt); } catch {}
  try { rmSync(wt, { recursive: true, force: true }); } catch {}
  try { git('branch', '-D', branch); } catch {}
  mkdirSync(WT_BASE, { recursive: true });
  git('worktree', 'add', '-q', '-b', branch, wt, 'main');
  return { branch, wt };
}
function removeWorktree(wt) {
  try { git('worktree', 'remove', '--force', wt); } catch {}
  try { rmSync(wt, { recursive: true, force: true }); } catch {}
}

// ---------- provider-limit-aware session runner ----------
const LIMIT_RE = /(session limit|usage limit|rate.?limit|quota exceeded|overloaded|\b429\b|\b529\b)/i;

/** Last n non-blank lines of a session's output, for a one-line failure message. */
function tailLines(out, n) {
  return String(out || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(-n).join(' | ').slice(0, 600);
}

/**
 * Which model actually served the session, read back from the plugin's receipt.
 *
 * The conductor asks for a model; opencode is free to ignore it. That gap is
 * not theoretical — an unresolvable `--model` runs the agent's own model with
 * no warning anywhere in the session's output. The receipt is written from
 * inside the session by expert-hooks, so it reports what ran, not what was
 * requested; comparing the two is the only way the conductor can tell.
 */
function actualSessionModel(wt) {
  try {
    const rows = readFileSync(resolve(wt, 'docs/work/session-receipts.jsonl'), 'utf8').trim().split('\n');
    return JSON.parse(rows[rows.length - 1]).model || null;
  } catch {
    return null;   // no receipt (plugin not installed in the target) — unknowable, not a failure
  }
}

async function runSession(prompt, wt, { agent = CODER_AGENT, model = CODER_MODEL, role = 'coder' } = {}) {
  let backoff = 5 * 60_000;
  for (let attempt = 1; attempt <= 6; attempt++) {
    if (existsSync(STOPFILE)) throw new Error('STOP file present');
    log('session.start', { msg: `attempt ${attempt}`, wt, role, agent, model });
    if (DRY) return { out: '[dry-run] no session executed', code: 0 };
    // NOTE: no `--auto` here. It is a TUI-only flag — `opencode run` accepts it
    // silently and does nothing with it (verified 2026-07-30), so passing it
    // bought false confidence that approvals were granted. Unattended runs get
    // their permissions from opencode config (the agent's `permission` block),
    // not from a flag; see the startup preflight below.
    const runArgs = ['run', prompt, '--dir', wt];
    if (agent) runArgs.push('--agent', String(agent));
    if (model) runArgs.push('--model', String(model));
    const res = spawnSync(OPENCODE_BIN, runArgs, {
      cwd: wt, encoding: 'utf8', timeout: SESSION_MIN * 60_000, maxBuffer: 64 * 1024 * 1024,
    });
    const out = `${res.stdout || ''}\n${res.stderr || ''}`;
    if (res.error) return { out: `${out}\n${res.error.message}`, code: 1 };
    if (res.signal) { log('session.timeout', { msg: `killed after ${SESSION_MIN}m (${res.signal})` }); return { out, code: 124 }; }
    if (res.status !== 0 && LIMIT_RE.test(out)) {
      const wait = Math.min(backoff, 60 * 60_000);
      backoff *= 2;
      log('limit.pause', { msg: `provider limit; sleeping ${(wait / 60000).toFixed(0)}m` });
      await sleep(wait);
      continue;
    }
    const ran = actualSessionModel(wt);
    if (model && ran && ran !== String(model)) {
      log('session.model-drift', {
        role, agent, requested: String(model), actual: ran,
        msg: `requested ${model} but ${ran} served the session — opencode fell back silently`,
      });
    }
    return { out, code: res.status ?? 1, model: ran || String(model || ''), role };
  }
  throw new Error('limit retries exhausted');
}

// ---------- gates (run OUTSIDE the session) ----------
// Gate A: scope, checked on the DIRTY (uncommitted) tree the session leaves
// behind — validate-scope.sh only inspects `git status --porcelain`, so it
// must run BEFORE the conductor commits anything (a committed clean tree
// would trivially pass regardless of what changed).
// validate-scope.sh compares literal directory prefixes, not globs — strip a
// trailing /**, /*, or bare * the same way tickets-graph.mjs's normScope()
// does for write_scope comparisons elsewhere in this codebase.
function normScopeDir(glob) {
  return String(glob).replace(/\/\*\*?$/, '').replace(/\*+$/, '').replace(/\/$/, '');
}

function scopeGate(wt, writeScope) {
  const dirs = [...new Set(writeScope.map(normScopeDir).filter(Boolean))];
  const scopeArgs = [...dirs, '--root', wt];
  try {
    sh('bash', [resolve(VALIDATORS_DIR, 'validate-scope.sh'), ...scopeArgs]);
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: String(e.stdout || e.message).slice(-1500) };
  }
}

/**
 * Preserve WHAT went out of scope, before the worktree carrying it is destroyed.
 *
 * WHY THIS EXISTS. A scope failure used to surface as exactly one line —
 * `src/hop.rs written outside assigned scope` — and the next statement removed
 * the only copy of the change. That is unfalsifiable from the operator's chair:
 * a plan whose write_scope is too narrow and an agent that wandered produce a
 * byte-identical message, and the two have opposite fixes (widen the ticket vs.
 * constrain the session). It cost a full run to notice that two unrelated
 * tickets — NT-1 (path aggregate) and NT-2 (TUI rows) — were both failing on the
 * same third file, which no amount of re-reading the log could explain.
 *
 * The diff is written under the PROJECT root so it survives removeWorktree(),
 * and a bounded excerpt goes back into the retry prompt — the previous attempt's
 * mistake was described to it in the abstract but never shown.
 */
/**
 * Preserve a FAILED attempt's review + runtime documents before its worktree
 * and branch are destroyed.
 *
 * makeWorktree() force-removes the worktree and `branch -D`s the branch at the
 * start of every attempt, so everything rounds 2-3 wrote — the reviewers'
 * findings and the runtime verdict, the only records of WHY the attempt failed
 * — is gone by the time anyone reads the log. The operator is left with
 * "round 3: runtime verdict FAIL (docs/reviews/RUNTIME_T-decimal.md)" naming a
 * file that no longer exists anywhere.
 *
 * Same lesson as the scope-violation diff in v3.1.1: a gate that deletes its
 * own evidence forces the next person to reproduce the failure to understand
 * it. On a 50-ticket board that is the difference between reading why three
 * tickets failed and re-running them to find out.
 *
 * Best-effort by design — losing evidence must never fail a ticket that would
 * otherwise pass, so every step is swallowed.
 */
function preserveAttemptEvidence(m, attempt, wt) {
  const kept = [];
  try {
    const srcDir = resolve(wt, 'docs/reviews');
    if (!existsSync(srcDir)) return kept;
    const outDir = resolve(ROOT, `docs/work/attempt-evidence/${m.id}-attempt${attempt}`);
    mkdirSync(outDir, { recursive: true });
    for (const f of readdirSync(srcDir)) {
      if (!f.endsWith(`_${m.id}.md`) && !f.includes(m.id)) continue;
      try {
        writeFileSync(resolve(outDir, f), readFileSync(resolve(srcDir, f), 'utf8'));
        kept.push(f);
      } catch { /* one unreadable doc must not lose the others */ }
    }
    if (kept.length) log('gates.evidence-kept', { ticket: m.id, msg: `attempt ${attempt}: ${kept.join(', ')} -> docs/work/attempt-evidence/${m.id}-attempt${attempt}/` });
  } catch { /* never let evidence capture break the run */ }
  return kept;
}

function captureScopeEvidence(m, attempt, wt) {
  const rel = `docs/work/scope-violation-${m.id}-attempt${attempt}.diff`;
  let result = { feedback: null, path: null, abs: null };
  try {
    // Stage everything so untracked files appear too — `git diff` alone would
    // silently omit a brand-new out-of-scope file, the most common case. The
    // worktree is discarded immediately after, so mutating its index is free.
    gitIn(wt, 'add', '-A');
    const stat = gitIn(wt, 'diff', '--cached', '--stat');
    const diff = gitIn(wt, 'diff', '--cached');
    const out = resolve(ROOT, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(
      out,
      `# ${m.id} attempt ${attempt} — scope violation evidence\n` +
        `# write_scope: ${JSON.stringify(m.write_scope)}\n\n${stat}\n\n${diff.slice(0, 400_000)}\n`,
    );
    // Is the whole change whitespace? Then no agent decided anything — a
    // formatter did. The post-edit hook runs rustfmt/prettier/black on what the
    // session touches, so a repository committed in a NOT-formatter-clean state
    // hands every ticket a scope violation it cannot avoid and cannot fix from
    // inside its own write_scope. That is what happened here: nettrace's seed
    // src/hop.rs held `Self { ttl, addr: addr.into(), rtt_ms }`, rustfmt expands
    // it, and two unrelated tickets (a path aggregate and a TUI renderer) both
    // died on the same file across four attempts. The gate was right every
    // time; the message just could not say why.
    const semantic = gitIn(wt, 'diff', '--cached', '-w', '--ignore-blank-lines', '--stat');
    const cosmetic = Boolean(stat) && !semantic;
    if (cosmetic) log('gates.evidence-cosmetic', { ticket: m.id, msg: 'every change is whitespace-only — a formatter, not the session, wrote these files' });

    log('gates.evidence', { ticket: m.id, msg: `changed files (attempt ${attempt}):\n${stat}`, path: rel });
    result = {
      feedback:
        `What you actually changed last time (diffstat):\n${stat}\n` +
        (cosmetic
          ? `NOTE: every one of those changes is whitespace-only. A formatter produced them, not you. ` +
            `The repository is not formatter-clean at its baseline, so any file the toolchain reformats ` +
            `lands outside write_scope no matter how careful you are. Report this under "Known issues" — ` +
            `it is a repository defect, not a ticket you can fix.\n`
          : '') +
        `If a file outside write_scope was genuinely required, do NOT edit it — ` +
        `implement what you can inside scope and record the blocker under "Known issues" ` +
        `in the manifest so the plan can be corrected.`,
      path: rel,
      abs: out,
    };
  } catch {
    // Evidence capture must never be what fails a run.
  }
  // Committing is deliberately OUTSIDE the try that builds `result`: a target
  // repo that gitignores docs/work/** makes `git add` throw, and swallowing
  // that inside the same try would discard the feedback we just built — the
  // very failure mode this function exists to end. Force-add for the same
  // reason: the diff is evidence, and an ignore rule must not silently drop it.
  if (result.abs) {
    try { git('add', '-f', result.abs); git('commit', '-q', '-m', `chore(${m.id}): scope violation evidence (attempt ${attempt})`); }
    catch { /* uncommitted evidence still beats no evidence */ }
  }
  return result;
}

function hasUncommittedWork(wt) {
  return gitIn(wt, 'status', '--porcelain').length > 0;
}

// ---------- prompts ----------
const handoffPrompt = (m, startReceipt, feedback) => `You are executing exactly ONE ticket, unattended, with no git or plan.json access — the conductor handles both from outside this session.

TICKET ${m.id} — ${m.title}
write_scope (exclusive — do not touch anything outside these globs): ${JSON.stringify(m.write_scope)}
acceptance:
${(m.acceptance || []).map((a, i) => `  ${i + 1}. ${a}`).join('\n')}
${feedback ? `\nA PREVIOUS ATTEMPT FAILED ITS GATES. Inspect the current tree first (it was reset to main). Gate failures to fix:\n${feedback.map((g) => `- ${g}`).join('\n')}\n` : ''}
Rules of engagement:
- You are already in the correct working directory on an isolated branch. Do NOT run git commands and do NOT touch plan.json — the conductor commits your work and manages ticket status itself.
- Implement the ticket fully within write_scope. Do not touch files outside it (docs/work/** and docs/reviews/** are always allowed for the manifest).
- Write a Completion Manifest at \`${m.manifest}\` with these headings: "Files produced" (backtick-quoted paths, must exist), "Decisions", "Known issues", "Verify result" (a backtick-quoted path to real evidence — a test log or receipt), "Memory written" (durable decisions/errors/verified-facts you established, or exactly "None — nothing durable" — the section is REQUIRED and its absence fails the manifest gate), plus a \`Maker: ${ACTOR}\` line and a \`Verifier: ${REVIEWER_ACTOR}\` line (must differ from Maker), a \`Tracker updated: <file>\` line, and end the manifest with a completion phrase of the form "${m.id} done -- <one sentence>".
- Include this claim receipt verbatim somewhere in the manifest as proof of provenance:\n${startReceipt}
- Nothing you print is trusted — only the tree state and manifest are checked. When finished, stop; do not wait for further input.`;

// ---------- per-ticket flow ----------
// T28.5: `alreadyStarted` lets a resumed ticket (start() already ran, in a
// now-dead prior process) re-enter the attempt loop without re-running the
// one-shot claimed->in_progress transition (start() would simply refuse —
// the module is no longer 'claimed'). `maxAttempts` lets a resumed ticket's
// remaining budget be less than a full fresh MAX_ATTEMPTS, accounting for
// attempts already spent before the crash (see reconcileOrphan in main()).
// ---------- Phase 4 rounds 2-3 (PARALLEL_WAVE_PROTOCOL) ----------
const reviewDoc  = (m, kind) => `docs/reviews/${kind}_${m.id}.md`;
const APPROVED_RE = /verdict\s*[:\-]?\s*\**\s*(APPROVED|PASS)/i;
const RUNTIME_PASS_RE = /runtime\s*(verdict)?\s*[:\-]?\s*\**\s*PASS/i;

/** Round 2 — one review session per triggered reviewer, on the REVIEWER model. */
// Reviewer selection lives in ../lib/review-triggers.mjs (this file calls
// main() at import time, so logic here cannot be unit-tested).
function pickReviewers(m, diff) {
  const { reviewers, reasons } = triggeredReviewers(m, diff, REVIEW_AGENTS);
  log('round2.reviewers', { ticket: m.id, msg: `${reviewers.join(', ')}${reasons.length ? ` — triggered by ${reasons.join('; ')}` : ''}` });
  return reviewers;
}

async function runReviewRound(m, wt, reviewers) {
  const verdicts = [];
  for (const r of reviewers) {
    const agent = r === 'code-reviewer' ? REVIEWER_AGENT : REVIEW_AGENTS[r];
    if (!agent) continue;
    const doc = reviewDoc(m, r === 'code-reviewer' ? 'CODE_REVIEW' : r.toUpperCase());
    const prompt = `SDLC-TASK for ${agent}:

Review the work already committed in this worktree for ticket ${m.id} — "${m.title}".

WRITE-SCOPE (exclusive):
- ${doc}

PRODUCE
- \`${doc}\`

Acceptance the work was meant to meet:
${(m.acceptance || []).map((a) => `- ${a}`).join('\n')}

Files the ticket was allowed to touch: ${(m.write_scope || []).join(', ')}

Write your findings to \`${doc}\`. Cite file:line for every finding — an
uncited finding is deleted before the report is written. End the document with a
single line of the form "VERDICT: APPROVED" or "VERDICT: CHANGES REQUESTED"
followed by the blocking findings.

Do NOT edit the implementation. Do NOT run git. You are reviewing, not fixing.`;
    log('round2.review.start', { ticket: m.id, msg: `${r} -> ${agent}`, role: 'reviewer', agent, model: REVIEWER_MODEL });
    await runSession(prompt, wt, { agent, model: REVIEWER_MODEL, role: 'reviewer' });
    const abs = resolve(wt, doc);
    const body = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
    const ok = APPROVED_RE.test(body);
    verdicts.push({ reviewer: r, doc, present: Boolean(body), approved: ok });
    log('round2.review.verdict', { ticket: m.id, msg: `${r}: ${!body ? 'NO DOCUMENT' : ok ? 'APPROVED' : 'CHANGES REQUESTED'}` });
  }
  return verdicts;
}

/** Fix-Verify loop — bounded remediation by the CODER after a blocking review. */
async function runFixLoop(m, wt, verdicts, startReceipt) {
  for (let i = 1; i <= FIX_ITERATIONS; i++) {
    const blocking = verdicts.filter((v) => !v.approved);
    if (!blocking.length) return { ok: true, iterations: i - 1 };
    const notes = blocking
      .map((v) => `${v.doc}:\n${existsSync(resolve(wt, v.doc)) ? readFileSync(resolve(wt, v.doc), 'utf8').slice(0, 4000) : '(missing)'}`)
      .join('\n\n');
    log('round2.fix.start', { ticket: m.id, msg: `iteration ${i}/${FIX_ITERATIONS}` });
    await runSession(`${handoffPrompt(m, startReceipt, null)}

A reviewer rejected the previous attempt. Address every blocking finding below,
then stop. Stay inside your write_scope — do not edit the review documents.

${notes}`, wt, { agent: CODER_AGENT, model: CODER_MODEL, role: 'coder' });
    // Re-review only the reviewers that blocked.
    const rerun = await runReviewRound(m, wt, blocking.map((v) => v.reviewer));
    for (const nv of rerun) {
      const idx = verdicts.findIndex((v) => v.reviewer === nv.reviewer);
      if (idx >= 0) verdicts[idx] = nv;
    }
  }
  const still = verdicts.filter((v) => !v.approved).map((v) => v.reviewer);
  return { ok: still.length === 0, iterations: FIX_ITERATIONS, blocking: still };
}

/** Round 3 — runtime verdict (build/lint/smoke), by the coder agent. */
async function runRuntimeRound(m, wt) {
  const doc = reviewDoc(m, 'RUNTIME');
  const prompt = `SDLC-TASK for ${CODER_AGENT}:

Runtime-validate ticket ${m.id} — "${m.title}" — in this worktree.

WRITE-SCOPE (exclusive):
- ${doc}

PRODUCE
- \`${doc}\`

Run the project's real build, lint/type-check and test commands. Paste each
command and its actual output. Do NOT edit implementation files; if something
fails, record it. End with a single line "RUNTIME: PASS" or "RUNTIME: FAIL".`;
  log('round3.runtime.start', { ticket: m.id, role: 'coder', agent: CODER_AGENT });
  await runSession(prompt, wt, { agent: CODER_AGENT, model: CODER_MODEL, role: 'runtime' });
  const abs = resolve(wt, doc);
  const body = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
  const pass = RUNTIME_PASS_RE.test(body);
  log('round3.runtime.verdict', { ticket: m.id, msg: !body ? 'NO DOCUMENT' : pass ? 'PASS' : 'FAIL' });
  return { present: Boolean(body), pass, doc };
}

async function executeTicket(plan, m, { alreadyStarted = false, maxAttempts = MAX_ATTEMPTS } = {}) {
  // start() is a one-shot claimed->in_progress transition — only valid once
  // per ticket, not once per retry attempt (a retry re-runs the session in a
  // fresh worktree, it does not re-start the ticket).
  let startReceipt;
  if (alreadyStarted) {
    startReceipt = startReceiptFromHistory(m);
  } else {
    const startRes = start(plan, m.id, ACTOR);
    if (!startRes.ok) {
      const rel = release(plan, m.id, ACTOR, `conductor: start() refused unexpectedly: ${startRes.error}`);
      if (rel.ok) persistPlan(plan, `chore(${m.id}): conductor releases after start() refusal`);
      return { ok: false, exhausted: true, gaps: [`start() refused: ${startRes.error}`] };
    }
    persistPlan(plan, `chore(${m.id}): conductor starts ticket`);
    mirrorJira(`ticket ${m.id} in_progress`);   // converge Jira to the picked-up state
    startReceipt = startRes.receipt;
  }

  const gapsPerAttempt = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { branch, wt } = makeWorktree(m); // always fresh off main — no leftover state from a prior attempt

    log('ticket.attempt', { ticket: m.id, msg: `attempt ${attempt}/${maxAttempts}`, role: 'coder', model: CODER_MODEL });
    const sess = await runSession(handoffPrompt(m, startReceipt, gapsPerAttempt.length ? gapsPerAttempt[gapsPerAttempt.length - 1] : null), wt);

    // A session that never ran and a session that ran and decided to do nothing
    // both leave a clean tree. Reporting both as "produced no changes" sent a
    // real provider failure (`{"name":"UnknownError"}`, exit 1, 1.2s) to the log
    // as if the model had considered the ticket and declined — the operator
    // reads that as an agent problem and goes looking in the prompt.
    if (sess.code !== 0) {
      const gap = `session failed before finishing (exit ${sess.code}) — no work was attempted: ${tailLines(sess.out, 6)}`;
      gapsPerAttempt.push([gap]);
      log('session.fail', { ticket: m.id, msg: gap.slice(0, 600), code: sess.code });
      comment(plan, m.id, ACTOR, `CONDUCTOR attempt ${attempt}/${maxAttempts} failed: ${gap}`.slice(0, 900));
      persistPlan(plan, `chore(${m.id}): conductor logs session failure (attempt ${attempt})`);
      removeWorktree(wt);
      continue;
    }

    if (!hasUncommittedWork(wt)) {
      const gap = 'session ran to completion (exit 0) but produced no changes (clean working tree)';
      gapsPerAttempt.push([gap]);
      comment(plan, m.id, ACTOR, `CONDUCTOR attempt ${attempt}/${maxAttempts} failed: ${gap}`);
      persistPlan(plan, `chore(${m.id}): conductor logs gate failure (attempt ${attempt})`);
      removeWorktree(wt);
      continue;
    }

    const scope = scopeGate(wt, m.write_scope);
    if (!scope.ok) {
      const ev = captureScopeEvidence(m, attempt, wt);
      const gaps = [`scope gate failed: ${scope.detail}`, ev.feedback].filter(Boolean);
      gapsPerAttempt.push(gaps);
      log('gates.fail', { ticket: m.id, msg: gaps[0].slice(0, 300) });
      comment(plan, m.id, ACTOR, `CONDUCTOR attempt ${attempt}/${maxAttempts} failed: ${gaps[0]}`.slice(0, 900));
      persistPlan(plan, `chore(${m.id}): conductor logs gate failure (attempt ${attempt})`);
      removeWorktree(wt);
      continue;
    }

    // ---- Rounds 2-3: review (different agent AND model) then runtime. ----
    // This is where maker != verifier stops being a declaration: the review
    // session runs on roles.reviewer, so the model judging the work is not the
    // model that wrote it. A blocking verdict feeds a bounded fix loop; an
    // unresolved one fails the attempt exactly like a gate.
    if (ROUNDS >= 3) {
      const reviewers = pickReviewers(m, git('diff', `main...${branch}`));
      const verdicts = await runReviewRound(m, wt, reviewers);
      const missing = verdicts.filter((v) => !v.present).map((v) => v.reviewer);
      if (missing.length) {
        const gaps = [`round 2: reviewer produced no document (${missing.join(', ')})`];
        gapsPerAttempt.push(gaps);
        log('gates.fail', { ticket: m.id, msg: gaps[0] });
        preserveAttemptEvidence(m, attempt, wt);
        comment(plan, m.id, ACTOR, `CONDUCTOR attempt ${attempt}/${maxAttempts} failed: ${gaps[0]}`.slice(0, 900));
        persistPlan(plan, `chore(${m.id}): conductor logs gate failure (attempt ${attempt})`);
        removeWorktree(wt);
        continue;
      }
      const fixed = await runFixLoop(m, wt, verdicts, startReceipt);
      if (!fixed.ok) {
        const gaps = [`round 2: still blocking after ${fixed.iterations} fix iteration(s): ${(fixed.blocking || []).join(', ')}`];
        gapsPerAttempt.push(gaps);
        log('gates.fail', { ticket: m.id, msg: gaps[0] });
        preserveAttemptEvidence(m, attempt, wt);
        comment(plan, m.id, ACTOR, `CONDUCTOR attempt ${attempt}/${maxAttempts} failed: ${gaps[0]}`.slice(0, 900));
        persistPlan(plan, `chore(${m.id}): conductor logs gate failure (attempt ${attempt})`);
        removeWorktree(wt);
        continue;
      }
      const runtime = await runRuntimeRound(m, wt);
      if (!runtime.present || !runtime.pass) {
        const gaps = [`round 3: runtime verdict ${!runtime.present ? 'missing' : 'FAIL'} (${runtime.doc})`];
        gapsPerAttempt.push(gaps);
        log('gates.fail', { ticket: m.id, msg: gaps[0] });
        preserveAttemptEvidence(m, attempt, wt);
        comment(plan, m.id, ACTOR, `CONDUCTOR attempt ${attempt}/${maxAttempts} failed: ${gaps[0]}`.slice(0, 900));
        persistPlan(plan, `chore(${m.id}): conductor logs gate failure (attempt ${attempt})`);
        removeWorktree(wt);
        continue;
      }
      // Re-check scope: rounds 2-3 wrote review/runtime docs under docs/reviews,
      // which validate-scope allows, but a fix iteration could have strayed.
      const rescope = scopeGate(wt, m.write_scope);
      if (!rescope.ok) {
        const ev = captureScopeEvidence(m, attempt, wt);
        const gaps = [`scope gate failed after rounds 2-3: ${rescope.detail}`, ev.feedback].filter(Boolean);
        gapsPerAttempt.push(gaps);
        log('gates.fail', { ticket: m.id, msg: gaps[0].slice(0, 300) });
        comment(plan, m.id, ACTOR, `CONDUCTOR attempt ${attempt}/${maxAttempts} failed: ${gaps[0]}`.slice(0, 900));
        persistPlan(plan, `chore(${m.id}): conductor logs gate failure (attempt ${attempt})`);
        removeWorktree(wt);
        continue;
      }
    }

    // Scope clean — commit the session's work as one checkpoint commit so
    // close()'s verify (run-handoff-gates.sh) inspects a real, reviewable diff.
    gitIn(wt, 'add', '-A');
    gitIn(wt, 'commit', '-q', '-m', `feat(${m.id}): ${m.title}\n\nConductor-run opencode session; gates verified from outside.`);
    const sha = gitIn(wt, 'rev-parse', 'HEAD');

    const closeRes = close(plan, m.id, ACTOR, { branch, commits: [sha], cwd: wt });
    if (!closeRes.ok) {
      const gaps = [closeRes.error];
      gapsPerAttempt.push(gaps);
      log('gates.fail', { ticket: m.id, msg: closeRes.error.slice(0, 300) });
      comment(plan, m.id, ACTOR, `CONDUCTOR attempt ${attempt}/${maxAttempts} failed: ${closeRes.error}`.slice(0, 900));
      persistPlan(plan, `chore(${m.id}): conductor logs gate failure (attempt ${attempt})`);
      removeWorktree(wt);
      continue;
    }

    persistPlan(plan, `chore(${m.id}): conductor closes ticket (in_review)`);

    // accept() (T26.3) refuses unless the close() receipt is pasted verbatim
    // into the manifest — the session can't do this itself (the receipt only
    // exists once close() has already run, after the session exits), so the
    // conductor pastes it: a separate, small commit so the WORK commit sha
    // recorded in m.evidence above stays exactly what it was verified against.
    const manifestPath = resolve(wt, m.manifest);
    appendFileSync(manifestPath, `\n${closeRes.receipt}\n`);
    gitIn(wt, 'add', m.manifest);
    gitIn(wt, 'commit', '-q', '-m', `chore(${m.id}): paste close receipt into manifest`);

    log('ticket.receipt', { ticket: m.id, msg: 'close receipt', receipt: closeRes.receipt });
    return { ok: true, branch, wt, receipt: closeRes.receipt };
  }
  const reason = `conductor exhausted ${maxAttempts} attempt(s) — ${gapsPerAttempt.map((g, i) => `[${i + 1}] ${g.join('; ')}`).join(' | ')}`.slice(0, 1800);
  const rel = release(plan, m.id, ACTOR, reason);
  if (rel.ok) persistPlan(plan, `chore(${m.id}): conductor releases after exhausting attempts`);
  return { ok: false, exhausted: true, gaps: gapsPerAttempt.flat() };
}

function pushRemotes(ticket) {
  if (!DO_PUSH || DRY) return;
  for (const rem of CONFIG.remotes) {
    try { sh('git', ['push', rem, 'main'], { cwd: ROOT, timeout: 60_000 }); }
    catch (e) { log('push.fail', { ticket, msg: `${rem}: ${String(e.message).slice(0, 80)}` }); }
  }
}

function land(plan, m, branch, wt) {
  // Reviewer-only accept(): a distinct actor from the ticket owner, per
  // don't-accept-your-own-work. T28.2 adds the model-identity half of that
  // split (checkMakerVerifierDistinct, enforced at conductor.start below) —
  // accept() itself stays identity-enforced (REVIEWER_ACTOR) since this
  // conductor doesn't yet spawn a live reviewer session; roles.reviewer is
  // logged here as the model that role is routed to for when one does.
  log('ticket.accept', { ticket: m.id, msg: 'accept() gate (reviewer role, identity-enforced)', role: 'reviewer', model: ROLE_MODELS.reviewer });
  const acceptRes = accept(plan, m.id, REVIEWER_ACTOR, { cwd: wt });
  if (!acceptRes.ok) {
    log('accept.fail', { ticket: m.id, msg: acceptRes.error });
    comment(plan, m.id, REVIEWER_ACTOR, `CONDUCTOR accept() refused: ${acceptRes.error}`);
    persistPlan(plan, `chore(${m.id}): conductor logs accept() refusal`);
    removeWorktree(wt);
    return false;
  }
  if (DO_MERGE) {
    git('merge', '--no-ff', '-q', '-m', `Merge ${branch}: ${m.id} ${m.title}\n\nConductor-verified: close() gate green (${m.verify}).`, branch);
  }
  persistPlan(plan, `chore(${m.id}): conductor accepts ticket (done)`);
  removeWorktree(wt);
  if (DO_MERGE) { try { git('branch', '-d', branch); } catch {} }
  pushRemotes(m.id);
  mirrorJira(`ticket ${m.id} done`);   // converge Jira to the accepted board state
  return true;
}

function tallyStatuses(plan) {
  return (plan.modules || []).reduce((acc, m) => ((acc[m.status] = (acc[m.status] || 0) + 1), acc), {});
}

function writeHaltNotice(plan) {
  const counts = tallyStatuses(plan);
  const rows = (plan.modules || [])
    .filter((m) => m.status !== 'done')
    .map((m) => `- ${m.id} [${m.status}]${m.owner ? ` owner=${m.owner}` : ''} — ${m.title}`)
    .join('\n');
  const body = `# Conductor halt — ${now()}\n\nBoard state: ${JSON.stringify(counts)}\n\n${rows || '(nothing outstanding)'}\n`;
  // A dry run must leave the target repo byte-identical: it cannot commit
  // (commitArtifact no-ops under DRY), so writing the notice would dirty the
  // tree and the NEXT real run would refuse to start on it.
  if (!DRY) {
    try { mkdirSync(dirname(HALT_NOTICE), { recursive: true }); writeFileSync(HALT_NOTICE, body); } catch {}
    commitArtifact(HALT_NOTICE, 'chore(conductor): halt notice');
  }
  return counts;
}

// ---------- main ----------
async function main() {
  for (const bin of ['git']) {
    try { sh('which', [bin]); } catch { console.error(`missing prerequisite: ${bin}`); process.exit(1); }
  }
  if (!existsSync(PLAN_PATH)) {
    console.error(
      `no plan.json at ${PLAN_PATH}\n` +
      `Probed (in producer order): ${PLAN_CANDIDATES.join(', ')} — pass --plan to name one explicitly.`,
    );
    process.exit(1);
  }
  // G6: every ticket's manifest must sit where the scope gate permits writes.
  //
  // The session is told "Write a Completion Manifest at <module.manifest>", and
  // validate-scope.sh's always-allowed list is exactly docs/work/ and
  // docs/reviews/. A manifest anywhere else is written as instructed and then
  // flagged out-of-scope, failing a ticket that did precisely what it was told.
  // `manifests/M-parse.md` did this on 2026-07-31 — a .md, not in write_scope,
  // so every schema rule passed it — and took down a whole run on its first
  // ticket. Conductor-specific by nature: a human driving the lifecycle by hand
  // has no scope gate, so this is not a schema error (see tickets-graph.mjs).
  {
    const MANIFEST_OK = ['docs/work/', 'docs/reviews/'];
    const offenders = (loadPlan(PLAN_PATH).modules || [])
      .filter((m) => typeof m.manifest === 'string' && m.manifest.trim())
      .map((m) => ({ id: m.id, path: m.manifest.trim().replace(/^\.\//, '') }))
      .filter((x) => !MANIFEST_OK.some((d) => x.path.startsWith(d)));
    if (offenders.length) {
      console.error(
        `${offenders.length} ticket(s) put the Completion Manifest outside the always-writable dirs (${MANIFEST_OK.join(', ')}):\n` +
        offenders.map((x) => `  - ${x.id}: ${x.path}`).join('\n') +
        `\nThe session writes the manifest to that path and the scope gate then refuses the ticket.` +
        `\nUse docs/reviews/MANIFEST_<id>.md.`,
      );
      process.exit(2);
    }
  }

  // G5: the board must be committable. persistPlan() does a raw `git add` on it
  // after EVERY lifecycle transition, so a gitignored board does not degrade —
  // it hard-fails on the first claim, after the run has already started. The
  // trap is specific and easy to fall into: the SDLC writes the board to
  // docs/work/, and `docs/work/` looks like a runtime-artifact directory worth
  // ignoring wholesale. It is not. The canonical bootstrap list ignores named
  // per-machine FILES under docs/work/ precisely because STATE.md and plan.json
  // are tracked artifacts. Caught here, before a single ticket is claimed.
  // --no-index is load-bearing. `git check-ignore` without it answers "is this
  // path ignored *given the index*", so a TRACKED file always reports
  // not-ignored — while `git add` on that same tracked file still refuses when
  // an ancestor DIRECTORY is ignored ("The following paths are ignored").
  // Probing without --no-index therefore green-lights precisely the case this
  // gate exists to catch. --no-index asks the question git add actually enforces.
  let planIgnored = false;
  try { git('check-ignore', '-q', '--no-index', PLAN_PATH); planIgnored = true; } catch { planIgnored = false; }
  if (planIgnored) {
    console.error(
      `the board at ${PLAN_PATH} is covered by .gitignore.\n` +
      `Every lifecycle transition commits it, so this run would fail on the first claim.\n` +
      `Ignore the named per-machine files under docs/work/ (see agents/git-expert.md), not the directory.`,
    );
    process.exit(2);
  }
  if (git('status', '--porcelain')) { console.error('target repo working tree not clean — commit or stash first'); process.exit(1); }
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') git('checkout', '-q', 'main');

  const preflight = loadFreshPlan();
  const { ok, errors } = validatePlan(preflight);
  const collisions = writeScopeCollisions(preflight);
  if (!ok || collisions.length) {
    for (const e of errors) log('lint.error', { msg: e });
    for (const c of collisions) log('lint.error', { msg: `write-scope collision: ${c.a} vs ${c.b} (${c.scope})` });
    console.error(`plan.json has ${errors.length} error(s), ${collisions.length} collision(s) — fix before running`);
    process.exit(2);
  }

  // G4 (T28.2): maker != verifier, mechanically — checked against models.json's
  // actual role→model config, before any ticket is claimed. Fail-closed by
  // default (same posture as G2/T30.2): a same-model coder/reviewer(or
  // challenger) config refuses the run outright unless downgraded to
  // --role-gate warn.
  if (MODELS_CONFIG) {
    const violations = checkMakerVerifierDistinct(MODELS_CONFIG);
    for (const v of violations) {
      log('gate.role-mismatch', { msg: `roles.${v.role} ("${v.model}") matches roles.coder — maker and verifier must differ (G4)` });
    }
    if (violations.length && ROLE_GATE === 'block') {
      console.error(`models.json role routing: coder model matches roles.${violations.map((v) => v.role).join(', roles.')} — refusing to run (pass --role-gate warn to downgrade, or fix ${MODELS_JSON_PATH})`);
      process.exit(2);
    }
  }

  // G4b: the role models must actually EXIST on this install.
  //
  // WHY. models.json shipped `google/gemini-2.5-flash` and
  // `anthropic/claude-opus-4-8` as the coder/reviewer roles. Neither provider
  // was ever configured here — `opencode auth list` has GitHub Copilot, OpenAI
  // and LMStudio; the only `provider` block in opencode.json is lmstudio. So
  // `opencode run --model google/gemini-2.5-flash` did not run gemini. It
  // SILENTLY FELL BACK to the agent's own model: the server log for the run
  // that "landed" NT-1 shows 23 streams on github-copilot/claude-haiku-4.5 and
  // zero on gemini, while the conductor logged
  // `roles=coder:google/gemini-2.5-flash` and the receipts inherited that claim.
  //
  // The G4 check directly above compares two strings from the same file, so it
  // passed while its guarantee was void — a coder and a reviewer that are
  // distinct in models.json both fall back to the same underlying model, and
  // "maker != verifier" becomes a sentence rather than a fact. Verifying that
  // each configured id is one opencode can resolve is what makes G4 mean
  // anything. Sometimes the bad id hard-errors in ~1s instead of falling back,
  // which the conductor then reported as "session produced no changes" — a
  // clean tree looks identical either way.
  if (MODELS_CONFIG && MODEL_GATE !== 'off') {
    const wanted = [...new Set(Object.values(ROLE_MODELS).filter(Boolean).map(String))];
    let known = null;
    try {
      const listed = new Set(sh(OPENCODE_BIN, ['models']).split('\n').map((s) => s.trim()).filter(Boolean));
      // An enumeration that succeeds and returns NOTHING is not evidence that
      // nothing resolves — it is evidence the enumeration did not work (an
      // `opencode` too old for the subcommand, a wrapper that swallows it, a
      // stub). Treating empty as authoritative makes this gate refuse every
      // model in the config and blame the config: the same shape of defect
      // this gate was written to catch, turned on its author. Absent evidence
      // is not evidence of absence, so fall through to the un-enumerable path.
      if (listed.size > 0) known = listed;
      else log('gate.model-resolve', { msg: `\`${OPENCODE_BIN} models\` returned an empty list — treating as un-enumerable, not as "no model resolves"; skipping resolution check` });
    } catch {
      log('gate.model-resolve', { msg: `could not enumerate models via \`${OPENCODE_BIN} models\` — skipping resolution check` });
    }
    if (known) {
      const missing = wanted.filter((m) => !known.has(m));
      for (const m of missing) {
        log('gate.model-resolve', { msg: `configured model "${m}" is not resolvable on this install — opencode will silently fall back to the agent's own model` });
      }
      if (missing.length && MODEL_GATE === 'block') {
        console.error(
          `models.json names ${missing.length} model(s) this opencode install cannot resolve:\n` +
          missing.map((m) => `  - ${m}`).join('\n') +
          `\nopencode does not fail on an unknown --model; it falls back, so every role would quietly run on the same model and the maker/verifier split would be fiction.` +
          `\nFix ${MODELS_JSON_PATH} (see \`${OPENCODE_BIN} models\`), or pass --model-gate warn to proceed anyway.`,
        );
        process.exit(2);
      }
    }
  }

  // T28.5: resume + drift refusal. Any module left claimed/in_progress and
  // owned by THIS actor before a single ticket is (re-)claimed below is
  // either safely reconcilable from disk or a sign plan.json disagrees with
  // its own receipts/disk — in which case the WHOLE run refuses to start,
  // surfacing every divergence found, rather than silently proceeding on
  // some tickets and guessing on others.
  const logRowsAtStart = loadLogRows(LOG);
  const resumePlan = loadFreshPlan();
  const { drift, safe } = findDrift(resumePlan, logRowsAtStart, ACTOR, {
    root: ROOT, wtBase: WT_BASE, branchSuffix: CONFIG.branchSuffix, slug,
  });
  if (drift.length) {
    for (const d of drift) log('resume.drift-refused', { ticket: d.id, msg: d.reason });
    console.error(
      `conductor: refusing to resume — ${drift.length} ticket(s) disagree between plan.json, receipts (${LOG}), and disk:\n` +
      drift.map((d) => `  - ${d.id}: ${d.reason}`).join('\n') +
      `\nResolve by hand (inspect the ticket's worktree/branch and ${LOG}, then release()/comment() plan.json as appropriate) before re-running.`,
    );
    process.exit(3);
  }

  log('conductor.start', {
    msg: `root=${ROOT} plan=${PLAN_PATH} actor=${ACTOR} maxAttempts=${MAX_ATTEMPTS} merge=${DO_MERGE} push=${DO_PUSH} agent=${CODER_AGENT} roles=coder:${ROLE_MODELS.coder ?? 'none'},reviewer:${ROLE_MODELS.reviewer ?? 'none'},challenger:${ROLE_MODELS.challenger ?? 'none'}`,
    roles: ROLE_MODELS,
    agents: { coder: CODER_AGENT },
  });
  // `opencode run` has no auto-approve flag; permissions come from opencode
  // config. Say so once at startup rather than implying a flag handled it.
  log('conductor.permissions', {
    msg: 'unattended sessions inherit opencode config permissions (`opencode run` has no --auto); a permission set to "ask" will stall a ticket with nobody to answer',
  });

  let landed = 0;
  if (safe.length) {
    const resumeCtx = {
      actor: ACTOR, maxAttempts: MAX_ATTEMPTS, log, git, gitIn, scopeGate, close, comment,
      persistPlan, removeWorktree, appendFileSync, resolvePath: resolve, land, executeTicket, loadFreshPlan,
    };
    for (const { m, disk } of safe) {
      const outcome = await reconcileOrphan(resumeCtx, m, disk, logRowsAtStart);
      log('resume.outcome', { ticket: m.id, msg: outcome });
      if (outcome === 'landed') landed++;
    }
  }

  // Tickets that exhausted every attempt THIS run are release()d back to
  // `ready` (so other tickets/lanes aren't blocked by their ownership) but
  // must not be immediately re-claimed in an infinite retry loop — skip them
  // for the rest of this process's lifetime; a future conductor invocation
  // (after a human looks at the gap history) is free to retry.
  const exhaustedThisRun = new Set();
  while (landed < MAX_TICKETS) {
    if (existsSync(STOPFILE)) { log('conductor.stop', { msg: 'STOP file present' }); break; }

    let plan = loadFreshPlan();
    recomputeStatus(plan);
    const next = claimable(plan).find((m) => !exhaustedThisRun.has(m.id));
    if (!next) {
      const counts = writeHaltNotice(plan);
      log('conductor.halt', { msg: `nothing claimable — board: ${JSON.stringify(counts)} — see ${HALT_NOTICE}` });
      break;
    }

    const claimRes = claim(plan, next.id, ACTOR);
    if (!claimRes.ok) { log('claim.fail', { ticket: next.id, msg: claimRes.error }); break; }
    persistPlan(plan, `chore(${next.id}): conductor claims ticket`);

    log('ticket.start', { ticket: next.id, msg: next.title });
    const res = await executeTicket(plan, next);
    if (res.ok) {
      const landedOk = land(plan, next, res.branch, res.wt);
      if (landedOk) { landed++; log('ticket.done', { ticket: next.id, msg: `${landed} landed this run` }); }
      else log('ticket.accept-refused', { ticket: next.id });
    } else {
      exhaustedThisRun.add(next.id);
      log('ticket.exhausted', { ticket: next.id, msg: (res.gaps || []).join(' | ').slice(0, 400) });
    }
  }

  const finalPlan = loadFreshPlan();
  const counts = tallyStatuses(finalPlan);
  log('conductor.end', { msg: `landed=${landed} board=${JSON.stringify(counts)}` });
}

main().catch((e) => { log('conductor.fatal', { msg: e.message }); process.exit(1); });
