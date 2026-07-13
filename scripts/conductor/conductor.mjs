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
 *     [--models models.json] [--role-gate warn|block]
 *     [--no-merge] [--no-push] [--dry-run]
 *
 * Stop any time: `touch STOP` in --root (checked between tickets).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const PLAN_PATH = resolve(ROOT, String(opt('plan', 'plan.json')));
const ACTOR = String(opt('actor', 'conductor'));
const REVIEWER_ACTOR = String(opt('reviewer-actor', 'conductor-review'));
const MAX_ATTEMPTS = Number(opt('max-attempts', 2));       // MASTER_PROMPT.md rule 9: ~2 sessions before giving up
const MAX_TICKETS = Number(opt('max-tickets', 999));
const SESSION_MIN = Number(opt('session-minutes', 45));
const MODEL = opt('model', null);
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
const MODELS_CONFIG = existsSync(MODELS_JSON_PATH) ? loadModelsConfig(MODELS_JSON_PATH) : null;
const ROLE_MODELS = {
  coder: resolveRole('coder', MODELS_CONFIG),
  reviewer: resolveRole('reviewer', MODELS_CONFIG),
  challenger: resolveRole('challenger', MODELS_CONFIG),
};
// Explicit --model always wins (interactive override); else route by role.
const CODER_MODEL = MODEL || ROLE_MODELS.coder || null;
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

function loadFreshPlan() { return loadPlan(PLAN_PATH); }
function persistPlan(plan, message) {
  savePlan(PLAN_PATH, plan);
  if (DRY) return;
  git('add', PLAN_PATH);
  try { git('commit', '-q', '-m', message); }
  catch (e) { if (!/nothing to commit/i.test(String(e.stdout || e.message))) throw e; }
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

async function runSession(prompt, wt) {
  let backoff = 5 * 60_000;
  for (let attempt = 1; attempt <= 6; attempt++) {
    if (existsSync(STOPFILE)) throw new Error('STOP file present');
    log('session.start', { msg: `attempt ${attempt}`, wt, role: 'coder', model: CODER_MODEL });
    if (DRY) return { out: '[dry-run] no session executed', code: 0 };
    const runArgs = ['run', prompt, '--dir', wt, '--auto'];
    if (CODER_MODEL) runArgs.push('--model', String(CODER_MODEL));
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
    return { out, code: res.status ?? 1 };
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
- Write a Completion Manifest at \`${m.manifest}\` with these headings: "Files produced" (backtick-quoted paths, must exist), "Decisions", "Known issues", "Verify result" (a backtick-quoted path to real evidence — a test log or receipt), plus a \`Maker: ${ACTOR}\` line and a \`Verifier: ${REVIEWER_ACTOR}\` line (must differ from Maker), a \`Tracker updated: <file>\` line, and end the manifest with a completion phrase of the form "${m.id} done -- <one sentence>".
- Include this claim receipt verbatim somewhere in the manifest as proof of provenance:\n${startReceipt}
- Nothing you print is trusted — only the tree state and manifest are checked. When finished, stop; do not wait for further input.`;

// ---------- per-ticket flow ----------
// T28.5: `alreadyStarted` lets a resumed ticket (start() already ran, in a
// now-dead prior process) re-enter the attempt loop without re-running the
// one-shot claimed->in_progress transition (start() would simply refuse —
// the module is no longer 'claimed'). `maxAttempts` lets a resumed ticket's
// remaining budget be less than a full fresh MAX_ATTEMPTS, accounting for
// attempts already spent before the crash (see reconcileOrphan in main()).
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
    startReceipt = startRes.receipt;
  }

  const gapsPerAttempt = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { branch, wt } = makeWorktree(m); // always fresh off main — no leftover state from a prior attempt

    log('ticket.attempt', { ticket: m.id, msg: `attempt ${attempt}/${maxAttempts}`, role: 'coder', model: CODER_MODEL });
    await runSession(handoffPrompt(m, startReceipt, gapsPerAttempt.length ? gapsPerAttempt[gapsPerAttempt.length - 1] : null), wt);

    if (!hasUncommittedWork(wt)) {
      const gap = 'session produced no changes (clean working tree)';
      gapsPerAttempt.push([gap]);
      comment(plan, m.id, ACTOR, `CONDUCTOR attempt ${attempt}/${maxAttempts} failed: ${gap}`);
      persistPlan(plan, `chore(${m.id}): conductor logs gate failure (attempt ${attempt})`);
      removeWorktree(wt);
      continue;
    }

    const scope = scopeGate(wt, m.write_scope);
    if (!scope.ok) {
      const gaps = [`scope gate failed: ${scope.detail}`];
      gapsPerAttempt.push(gaps);
      log('gates.fail', { ticket: m.id, msg: gaps[0].slice(0, 300) });
      comment(plan, m.id, ACTOR, `CONDUCTOR attempt ${attempt}/${maxAttempts} failed: ${gaps[0]}`.slice(0, 900));
      persistPlan(plan, `chore(${m.id}): conductor logs gate failure (attempt ${attempt})`);
      removeWorktree(wt);
      continue;
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
  try { mkdirSync(dirname(HALT_NOTICE), { recursive: true }); writeFileSync(HALT_NOTICE, body); } catch {}
  return counts;
}

// ---------- main ----------
async function main() {
  for (const bin of ['git']) {
    try { sh('which', [bin]); } catch { console.error(`missing prerequisite: ${bin}`); process.exit(1); }
  }
  if (!existsSync(PLAN_PATH)) { console.error(`no plan.json at ${PLAN_PATH}`); process.exit(1); }
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
    msg: `root=${ROOT} plan=${PLAN_PATH} actor=${ACTOR} maxAttempts=${MAX_ATTEMPTS} merge=${DO_MERGE} push=${DO_PUSH} roles=coder:${ROLE_MODELS.coder ?? 'none'},reviewer:${ROLE_MODELS.reviewer ?? 'none'},challenger:${ROLE_MODELS.challenger ?? 'none'}`,
    roles: ROLE_MODELS,
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
