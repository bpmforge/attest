// resume.mjs — T28.5: Conductor resume + drift refusal.
//
// A module left `claimed`/`in_progress` and owned by THIS actor when the
// process starts is either (a) genuinely mid-flight from a killed prior
// conductor run — safe to reconcile from disk without redoing already-good
// work — or (b) a plan.json whose state disagrees with its own receipts
// (docs/work/conductor-log.jsonl) or the git reality of its worktree/branch.
// This is T27.4's drift-check pattern (claims vs receipts vs disk, refuse
// rather than paper over) applied to Conductor's own state store: plan.json
// plays the STATE.md role here (there is no phase-based STATE.md in this
// ticket lifecycle), conductor-log.jsonl is the receipts trail, and the
// target repo's git worktrees/branches are disk.
//
// Kept as pure, dependency-injected functions (no imports from
// conductor.mjs) so this chapter is unit-testable in isolation — see
// resume.test.mjs — and so conductor.mjs, already over the file-size cap
// pre-T28.5 (see README.md), doesn't grow further; this ticket's logic lives
// here instead of inline.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function sameActor(a, b) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

export function branchName(id, suffix, slug) {
  return `feat/${slug(id)}${suffix}`;
}

// inspectDisk: does this ticket's worktree/branch exist, is it already
// merged into main, does it carry real committed work ahead of main.
export function inspectDisk({ root, wt, branch }) {
  const wtPath = resolve(wt);
  const wtExists = existsSync(wtPath);
  let branchExists = false;
  try {
    sh('git', ['rev-parse', '--verify', '--quiet', branch], { cwd: root });
    branchExists = true;
  } catch { /* branch does not exist */ }
  let mergedIntoMain = false;
  if (branchExists) {
    try {
      sh('git', ['merge-base', '--is-ancestor', branch, 'main'], { cwd: root });
      mergedIntoMain = true;
    } catch { /* not an ancestor of main */ }
  }
  let uncommitted = false;
  let commitsAheadOfMain = 0;
  // Commit count is asked of the REPO (root), by branch name, not the
  // worktree checkout — the branch is what's real and shared repo-wide; the
  // worktree directory is just wherever it happens to be mounted (a
  // conductor.config.json override could relocate it without moving the
  // branch's history).
  if (branchExists) {
    try { commitsAheadOfMain = Number(sh('git', ['rev-list', '--count', `main..${branch}`], { cwd: root })); } catch { /* leave 0 */ }
  }
  if (wtExists) {
    try { uncommitted = sh('git', ['status', '--porcelain'], { cwd: wtPath }).length > 0; } catch { /* leave false */ }
  }
  return { branch, wt: wtPath, wtExists, branchExists, mergedIntoMain, uncommitted, commitsAheadOfMain };
}

export function loadLogRows(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// startReceiptFromHistory: a resumed attempt re-enters the coder-session
// loop without calling start() again (it already ran, in a now-dead
// process) — this reconstructs the same descriptive text tickets-lifecycle's
// real start() receipt carries, from plan.json's own history[], for the
// handoff prompt. Purely informational provenance text, not load-bearing
// for any gate (close()/accept() only check the pasted CLOSE receipt).
export function startReceiptFromHistory(m) {
  const h = [...(m.history || [])].reverse().find((x) => x.to === 'in_progress');
  if (!h) {
    return `── start receipt: ${m.id} (reconstructed on resume — no matching history entry found) ──\n` +
      `actor: ${m.owner}\nstatus: claimed -> in_progress`;
  }
  return `── start receipt: ${m.id} (reconstructed on resume) ──\n` +
    `actor: ${h.actor}\nstatus: claimed -> in_progress\ntimestamp: ${h.ts}`;
}

// findDrift: partitions this actor's claimed/in_progress modules into
// `safe` (reconcilable from disk) and `drift` (plan.json disagrees with its
// own receipts or disk — resume must refuse the whole run rather than guess
// which source is right).
export function findDrift(plan, logRows, actor, { root, wtBase, branchSuffix, slug }) {
  const orphans = (plan.modules || []).filter(
    (m) => (m.status === 'claimed' || m.status === 'in_progress') && sameActor(m.owner, actor),
  );
  const drift = [];
  const safe = [];
  for (const m of orphans) {
    const receipts = logRows.filter((r) => r.ticket === m.id);
    const branch = branchName(m.id, branchSuffix, slug);
    const disk = inspectDisk({ root, wt: resolve(wtBase, m.id), branch });

    if (m.evidence) {
      drift.push({
        id: m.id,
        reason: `status is '${m.status}' but m.evidence is already populated — evidence is only ever set by close(), which also advances status to in_review, so plan.json is internally inconsistent`,
      });
      continue;
    }
    if (receipts.length === 0) {
      drift.push({
        id: m.id,
        reason: `status is '${m.status}' (owner '${m.owner}') but the conductor log has zero entries for '${m.id}' — no receipt trail backs this claim (looks hand-doctored, not conductor-written)`,
      });
      continue;
    }
    if (m.status === 'claimed' && (disk.wtExists || disk.branchExists)) {
      drift.push({
        id: m.id,
        reason: `status is 'claimed' (start() never ran) but a worktree/branch already exists on disk ('${disk.branch}') — plan.json and disk disagree on how far this ticket got`,
      });
      continue;
    }
    if (disk.mergedIntoMain) {
      drift.push({
        id: m.id,
        reason: `status is '${m.status}' but branch '${disk.branch}' is already merged into main — the work landed on disk but plan.json was never advanced past '${m.status}'`,
      });
      continue;
    }
    safe.push({ m, disk });
  }
  return { drift, safe };
}

// reconcileInProgress: an `in_progress` module whose worktree/branch already
// carries real committed work ahead of main (one of findDrift's `safe`
// entries) is re-verified against the SAME gates a fresh attempt would
// run — never re-run through a new coder session, which would duplicate
// work a killed prior process already produced. `ctx` injects conductor.mjs's
// own git/gate/log primitives (this module stays import-free of
// conductor.mjs so it's independently unit-testable — see resume.test.mjs).
export function reconcileInProgress(ctx, plan, m, disk) {
  const { actor, log, git, gitIn, scopeGate, close, comment, persistPlan, removeWorktree, appendFileSync, resolvePath } = ctx;
  log('resume.reverify', { ticket: m.id, msg: `${disk.commitsAheadOfMain} commit(s) already on '${disk.branch}' — re-verifying gates instead of re-running the coder session` });
  const discard = () => { removeWorktree(disk.wt); try { git('branch', '-D', disk.branch); } catch { /* not a real branch or already gone */ } };

  const scope = scopeGate(disk.wt, m.write_scope);
  if (!scope.ok) {
    const gap = `scope gate failed on resume: ${scope.detail}`;
    log('gates.fail', { ticket: m.id, msg: gap.slice(0, 300) });
    comment(plan, m.id, actor, `CONDUCTOR resume re-verify failed: ${gap}`.slice(0, 900));
    persistPlan(plan, `chore(${m.id}): conductor logs resume gate failure`);
    discard();
    return { ok: false };
  }
  const sha = gitIn(disk.wt, 'rev-parse', 'HEAD');
  const closeRes = close(plan, m.id, actor, { branch: disk.branch, commits: [sha], cwd: disk.wt });
  if (!closeRes.ok) {
    log('gates.fail', { ticket: m.id, msg: closeRes.error.slice(0, 300) });
    comment(plan, m.id, actor, `CONDUCTOR resume re-verify failed: ${closeRes.error}`.slice(0, 900));
    persistPlan(plan, `chore(${m.id}): conductor logs resume gate failure`);
    discard();
    return { ok: false };
  }
  persistPlan(plan, `chore(${m.id}): conductor closes ticket on resume (in_review)`);
  const manifestPath = resolvePath(disk.wt, m.manifest);
  appendFileSync(manifestPath, `\n${closeRes.receipt}\n`);
  gitIn(disk.wt, 'add', m.manifest);
  gitIn(disk.wt, 'commit', '-q', '-m', `chore(${m.id}): paste close receipt into manifest (resume)`);
  log('ticket.receipt', { ticket: m.id, msg: 'close receipt (resume, no duplicate session)', receipt: closeRes.receipt });
  return { ok: true, branch: disk.branch, wt: disk.wt };
}

// reconcileOrphan: drives one of findDrift's `safe` orphans to a terminal
// outcome (landed or released) BEFORE the main claim loop starts, so the
// loop below only ever sees a plan.json with no dangling claimed/in_progress
// tickets owned by this actor. Attempt budget already spent (read from the
// conductor log) is subtracted from a resumed retry's remaining attempts —
// a crash does not grant free extra attempts.
export async function reconcileOrphan(ctx, m, disk, logRows) {
  const { actor, maxAttempts, log, git, removeWorktree, land, executeTicket, loadFreshPlan } = ctx;
  let plan = loadFreshPlan();
  let mLive = plan.modules.find((x) => x.id === m.id);
  const attemptsUsed = logRows.filter((r) => r.kind === 'ticket.attempt' && r.ticket === m.id).length;

  if (mLive.status === 'in_progress' && disk.wtExists && disk.branchExists && disk.commitsAheadOfMain > 0 && !disk.uncommitted) {
    const res = reconcileInProgress(ctx, plan, mLive, disk);
    if (res.ok) return (await land(plan, mLive, res.branch, res.wt)) ? 'landed' : 'accept-refused';
    plan = loadFreshPlan();
    mLive = plan.modules.find((x) => x.id === m.id);
  } else if (disk.wtExists || disk.branchExists) {
    log('resume.discard', { ticket: m.id, msg: `no usable committed work on '${disk.branch}' (commits=${disk.commitsAheadOfMain}, uncommitted=${disk.uncommitted}) — discarding stale worktree/branch, ticket restarts fresh` });
    removeWorktree(disk.wt);
    try { git('branch', '-D', disk.branch); } catch { /* not a real branch or already gone */ }
  }

  if (mLive.status === 'claimed' || mLive.status === 'in_progress') {
    const remaining = Math.max(1, maxAttempts - attemptsUsed);
    log('resume.retry', { ticket: m.id, msg: `resuming attempt loop (${attemptsUsed} attempt(s) already logged before restart, ${remaining} remaining)` });
    const res = await executeTicket(plan, mLive, { alreadyStarted: mLive.status === 'in_progress', maxAttempts: remaining });
    if (res.ok) return (await land(plan, mLive, res.branch, res.wt)) ? 'landed' : 'accept-refused';
    return 'exhausted';
  }
  return 'noop';
}
