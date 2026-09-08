// tickets-lifecycle.mjs — enforced ticket lifecycle (T26.1). Chapter module
// for tickets.mjs (the barrel), split out to keep tickets.mjs under the
// file-size cap. See CODE_BOOK_PROTOCOL.md.
//
// Root cause this closes: status was "set by whoever is working it" — no
// enforced transition graph, no stored evidence, "done" was a self-asserted
// string an agent could print without any gate ever running. That's the
// exact mechanism behind the 2026-07-07 ticket-hygiene incident.
//
//   ready --claim--> claimed --start--> in_progress --close--> in_review --accept--> done
//                        ^                    |
//                        `------ release -----'   (back to ready, clears owner)
//
// Every transition appends an immutable history[] entry ({ts,actor,from,to,note}).
// `comment` appends free-text at any time without changing status (from===to).
// `close` is the load-bearing verb: it runs the ticket's OWN pre-configured
// `verify` command itself — NEVER a caller-supplied override. Accepting an
// override would let a careless or dishonest closer just pass a trivially-
// passing command and defeat the entire point of this gate. `accept` is
// reviewer-only: refuses if the acceptor is the same actor who owns the
// ticket (don't accept your own work — the 3-layer-check split).
//
// Agents never hand-edit `status`/`owner` again; these functions are the
// only sanctioned path. Each returns { ok, error? } (close also returns a
// paste-able `receipt` string on success) and mutates `plan` in place —
// callers persist with savePlan().

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
// Pure graph invariants (validatePlan/writeScopeCollisions/hygieneCheck) live
// in their own module specifically so claim() here can import them without a
// circular dependency on tickets.mjs (the barrel that imports claim() FROM
// this file). See tickets-graph.mjs's header for the full story (T26.3
// independent review: the hygiene check had only ever been wired into the
// CLI, not into claim() itself, so a direct library import bypassed it).
import { hygieneCheck } from './tickets-graph.mjs';

function now() {
  return new Date().toISOString();
}

function findModule(plan, id) {
  return (plan.modules || []).find((m) => m.id === id);
}

// Actor identity is a free-text CLI arg with no documented convention
// anywhere in this repo — trim+casefold before EVERY identity comparison.
// Found by independent review (2026-07-07): without this, WIP=1 and the
// anti-self-accept check both had a trivial bypass via casing/whitespace
// variance ("bmatthews" vs "Bmatthews" vs "bmatthews ") — the second one
// directly defeats the don't-accept-your-own-work guarantee this whole
// lifecycle exists to enforce, reachable purely through the public API,
// no plan.json tampering required. Stored values (m.owner, history[].actor)
// keep the caller's original casing for a readable audit trail — only
// comparisons are normalized.
function sameActor(a, b) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

function pushHistory(m, actor, from, to, note) {
  if (!Array.isArray(m.history)) m.history = [];
  m.history.push({ ts: now(), actor, from, to, note: note ?? null });
}

// openTicketFor: read-only query -- the module (if any) `actor` already owns
// that is `claimed`/`in_progress` (i.e. still open; `in_review` does NOT
// count -- that work is closed, the actor is just waiting on a reviewer, see
// T26.1's rationale above). Exposed separately from claim() (T26.3) so a
// caller can ask "is it safe to hand this actor NEXT work" without attempting
// a specific claim -- run-until-done.sh's refuse-to-select-next-work preflight
// uses exactly this query via `tickets.mjs open-for`.
export function openTicketFor(plan, actor, excludeId = null) {
  return (
    (plan.modules || []).find(
      (o) => sameActor(o.owner, actor) && o.id !== excludeId && (o.status === 'claimed' || o.status === 'in_progress'),
    ) ?? null
  );
}

// claim: ready+unowned -> claimed. WIP=1 — refuses if actor already owns
// another module that's claimed or in_progress elsewhere (in_review doesn't
// count: that work is done, the actor is just waiting on a reviewer). T26.3:
// also refuses to select a NEW ticket while the ticket graph itself is
// unhygienic (malformed or write-scope-colliding) — the SAME check
// validate-tickets.sh enforces in the gate sweep, checked here in the
// library function itself (not just the CLI) so ANY caller is refused the
// same way; independent review found an earlier version only wired this
// into the CLI's `claim` handler, silently bypassable by a direct import.
export function claim(plan, id, actor) {
  const m = findModule(plan, id);
  if (!m) return { ok: false, error: `no such module '${id}'` };
  if (m.status !== 'ready') return { ok: false, error: `'${id}' is '${m.status}', not 'ready'` };
  if (m.owner != null) return { ok: false, error: `'${id}' already owned by '${m.owner}'` };
  const hygiene = hygieneCheck(plan);
  if (!hygiene.ok)
    return { ok: false, error: `refusing to claim '${id}' — ticket graph hygiene is red:\n${hygiene.output}` };
  const openElsewhere = openTicketFor(plan, actor, id);
  if (openElsewhere)
    return {
      ok: false,
      error: `'${actor}' already has an open ticket ('${openElsewhere.id}', ${openElsewhere.status}) — WIP=1, close or release it first`,
    };
  m.owner = actor;
  m.claimed_at = now();
  pushHistory(m, actor, 'ready', 'claimed');
  m.status = 'claimed';
  return { ok: true };
}

// start: claimed -> in_progress. Only the claiming owner may start it. Returns
// a paste-able "start receipt" (T26.3) -- Stage 0 of the /reflow claim HANDOFF
// requires the executor to paste this before doing any work, the same way
// close()'s receipt is the required final-stage artifact.
export function start(plan, id, actor) {
  const m = findModule(plan, id);
  if (!m) return { ok: false, error: `no such module '${id}'` };
  if (m.status !== 'claimed') return { ok: false, error: `'${id}' is '${m.status}', not 'claimed'` };
  if (!sameActor(m.owner, actor)) return { ok: false, error: `'${id}' is owned by '${m.owner}', not '${actor}'` };
  pushHistory(m, actor, 'claimed', 'in_progress');
  m.status = 'in_progress';
  const ts = m.history[m.history.length - 1].ts;
  const receipt =
    `── start receipt: ${id} ──\n` +
    `actor: ${actor}\n` +
    `status: claimed -> in_progress\n` +
    `timestamp: ${ts}\n` +
    `paste this block verbatim as Stage 0 of the HANDOFF you are about to execute`;
  return { ok: true, receipt };
}

// comment: append a free-text history entry at any time, any state. Does
// NOT change status — from/to both record the current status.
export function comment(plan, id, actor, note) {
  const m = findModule(plan, id);
  if (!m) return { ok: false, error: `no such module '${id}'` };
  if (!note || !String(note).trim()) return { ok: false, error: 'comment note must be non-empty' };
  pushHistory(m, actor, m.status, m.status, note);
  return { ok: true };
}

// close: in_progress -> in_review. Refuses without ALL of: (a) a manifest
// file that actually exists at module.manifest, (b) module.verify exiting 0
// when run HERE (not claimed by the closer — RUN), (c) branch + at least one
// commit supplied by the caller. cwd resolves module.manifest/module.verify
// (both may be relative paths) — defaults to process.cwd().
// The close gate's own bounds. `execSync` defaults to NO timeout and a 1MB
// maxBuffer, and both defaults are wrong for this call:
//
//   - No timeout means an unattended executor hangs FOREVER on a verify that
//     hangs (a watch-mode test runner, a prompt, a wedged container). Every
//     other loop in the conductor is bounded; this one — the load-bearing gate
//     — was not. 30 minutes is deliberately generous; conductor.config.json's
//     `verifyTimeoutMs` overrides it per project.
//   - The 1MB maxBuffer makes execSync THROW ENOBUFS when a verify that exits
//     ZERO simply prints a lot. That throw landed in the catch below and was
//     reported as "verify gate did not exit 0" — so a fully green ticket was
//     refused, and the stated reason was false: there was no exit code at all.
//     Verified: `execSync` on a command printing 2MB and exiting 0 throws
//     ENOBUFS. 256MB matches what conductor.mjs already uses for the same
//     command shape.
const VERIFY_TIMEOUT_MS = 30 * 60_000;
const VERIFY_MAX_BUFFER = 256 * 1024 * 1024;

export function close(plan, id, actor, {
  branch,
  commits,
  cwd = process.cwd(),
  timeoutMs = VERIFY_TIMEOUT_MS,
  maxBuffer = VERIFY_MAX_BUFFER,
} = {}) {
  const m = findModule(plan, id);
  if (!m) return { ok: false, error: `no such module '${id}'` };
  if (m.status !== 'in_progress') return { ok: false, error: `'${id}' is '${m.status}', not 'in_progress'` };
  if (!sameActor(m.owner, actor)) return { ok: false, error: `'${id}' is owned by '${m.owner}', not '${actor}'` };
  if (!m.manifest)
    return { ok: false, error: `'${id}' has no manifest path configured — set module.manifest before closing` };
  const manifestPath = resolve(cwd, m.manifest);
  if (!existsSync(manifestPath)) return { ok: false, error: `manifest not found: ${manifestPath}` };
  if (!m.verify)
    return { ok: false, error: `'${id}' has no verify command configured — set module.verify before closing` };
  if (!branch) return { ok: false, error: 'close requires --branch' };
  if (!Array.isArray(commits) || commits.length === 0)
    return { ok: false, error: 'close requires at least one --commits entry' };

  let verifyOutput = '';
  try {
    verifyOutput = execSync(m.verify, {
      cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs, maxBuffer,
    }).toString();
  } catch (err) {
    const out = (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '');
    // SAY WHICH FAILURE THIS WAS. All three used to report "did not exit 0",
    // and for two of them that sentence is simply untrue — there was no exit
    // code. An operator reading "did not exit 0" goes looking for a failing
    // test that does not exist.
    if (err.code === 'ETIMEDOUT' || err.signal) {
      return {
        ok: false,
        error: `verify gate '${m.verify}' did not finish within ${Math.round(timeoutMs / 60_000)} minute(s) and was killed — it produced no exit code, so the ticket is NOT verified${out ? `. Last output:\n${out.slice(-2000)}` : ''}`,
      };
    }
    if (err.code === 'ENOBUFS') {
      return {
        ok: false,
        error: `verify gate '${m.verify}' produced more than ${Math.round(maxBuffer / (1024 * 1024))}MB of output and was killed before reporting an exit code — the ticket is NOT verified (this is a harness limit, not a test failure; quieten the command or raise maxBuffer)`,
      };
    }
    return {
      ok: false,
      error: `verify gate '${m.verify}' did not exit 0${out ? `:\n${out.slice(0, 2000)}` : ''}`,
    };
  }
  void verifyOutput; // captured for a future --verbose flag; not asserted on beyond exit code today

  m.evidence = { branch, commits, verify_cmd: m.verify };
  pushHistory(m, actor, 'in_progress', 'in_review', `verify: ${m.verify} — exit 0`);
  m.status = 'in_review';
  const ts = m.history[m.history.length - 1].ts;
  const receipt =
    `── close receipt: ${id} ──\n` +
    `actor: ${actor}\n` +
    `branch: ${branch}\n` +
    `commits: ${commits.join(', ')}\n` +
    `verify: ${m.verify} (exit 0)\n` +
    `manifest: ${m.manifest}\n` +
    `timestamp: ${ts}\n` +
    `status: in_review — awaiting accept() by a reviewer other than '${actor}'`;
  return { ok: true, receipt };
}

// manifestHasCloseReceipt: does the module's Completion Manifest have the
// close()-issued receipt pasted into it, verbatim (T26.3)? This is the
// enforcement behind "a close receipt is the ONLY accepted completion
// signal" -- a manifest that only ends with a self-asserted "<id> done --
// ..." phrase (still required by validate-completion-manifest.sh's generic
// HANDOFF check, an unrelated axis this does not replace) is NOT enough to
// move a ticket in_review -> done; the actual receipt text close() printed
// must appear somewhere in the file. The evidence cross-check (recorded
// branch + every recorded commit, AND (independent review, T26.3) the
// receipt's own `actor:` line matching `expectedActor` -- normalized via
// sameActor(), same as every other identity comparison in this file) is what
// defeats a hand-typed fake receipt that merely matches the header shape --
// without the actor check, a real branch+commits could be pasted under a
// fabricated `actor:` line and still pass; `expectedActor` should be the
// ticket's owner (the actor close() actually ran as), which accept() passes
// as m.owner.
export function manifestHasCloseReceipt(manifestPath, id, evidence, expectedActor) {
  if (!manifestPath || !existsSync(manifestPath)) return { ok: false, reason: `manifest not found: ${manifestPath}` };
  const text = readFileSync(manifestPath, 'utf8');
  const idEsc = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`close receipt:\\s*${idEsc}\\s*──`, 'i').test(text))
    return {
      ok: false,
      reason: `manifest has no 'close receipt: ${id}' block pasted verbatim -- a bare "done" claim without a pasted close receipt is not an accepted completion signal (T26.3)`,
    };
  const required = ['actor:', 'branch:', 'commits:', 'verify:', 'manifest:', 'timestamp:', 'status:'];
  const lower = text.toLowerCase();
  for (const field of required)
    if (!lower.includes(field)) return { ok: false, reason: `manifest's close receipt is missing a '${field}' line` };
  if (!/status:\s*in_review/i.test(text))
    return { ok: false, reason: `manifest's close receipt does not show 'status: in_review'` };
  if (evidence?.branch && !text.includes(evidence.branch))
    return {
      ok: false,
      reason: `manifest's pasted receipt branch does not match the recorded evidence branch '${evidence.branch}' -- looks hand-typed rather than pasted from close()`,
    };
  if (Array.isArray(evidence?.commits)) {
    for (const c of evidence.commits)
      if (!text.includes(c))
        return {
          ok: false,
          reason: `manifest's pasted receipt is missing recorded commit '${c}' -- looks hand-typed rather than pasted from close()`,
        };
  }
  if (expectedActor != null) {
    const actorLine = text.match(/^[ \t]*actor:[ \t]*(.+?)[ \t]*$/im);
    const pastedActor = actorLine ? actorLine[1] : null;
    if (!pastedActor || !sameActor(pastedActor, expectedActor))
      return {
        ok: false,
        reason: `manifest's pasted receipt actor ('${pastedActor ?? '(none)'}') does not match the ticket owner ('${expectedActor}') -- looks hand-typed rather than pasted from close()`,
      };
  }
  return { ok: true };
}

// accept: in_review -> done. Reviewer-only — refuses if the acceptor is the
// same actor who owns (did) the work, preserving don't-accept-your-own-work.
// T26.3: also refuses unless the module's Completion Manifest actually has
// the close() receipt pasted into it (manifestHasCloseReceipt, cross-checked
// against m.owner and m.evidence) -- this is the code-enforced gate behind
// "a HANDOFF completing without a close receipt must be rejected." `cwd`
// resolves module.manifest the same way close() does (relative to
// plan.json's directory) -- defaults to process.cwd().
export function accept(plan, id, actor, { cwd = process.cwd() } = {}) {
  const m = findModule(plan, id);
  if (!m) return { ok: false, error: `no such module '${id}'` };
  if (m.status !== 'in_review') return { ok: false, error: `'${id}' is '${m.status}', not 'in_review'` };
  if (sameActor(actor, m.owner))
    return { ok: false, error: `'${actor}' cannot accept their own work on '${id}' — needs a different reviewer` };
  if (!m.manifest) return { ok: false, error: `'${id}' has no manifest path configured — cannot verify a close receipt` };
  const manifestPath = resolve(cwd, m.manifest);
  const receiptCheck = manifestHasCloseReceipt(manifestPath, id, m.evidence, m.owner);
  if (!receiptCheck.ok) return { ok: false, error: `close-receipt check failed for '${id}': ${receiptCheck.reason}` };
  pushHistory(m, actor, 'in_review', 'done', 'accepted');
  m.status = 'done';
  return { ok: true };
}

// release: claimed|in_progress -> ready, clears owner + claimed_at. Requires
// a non-empty reason — staleness/abandonment is a human/reflow decision,
// never silent (the validator that flags staleness lives elsewhere; this is
// just the mechanism it, or a human, calls).
export function release(plan, id, actor, reason) {
  const m = findModule(plan, id);
  if (!m) return { ok: false, error: `no such module '${id}'` };
  if (m.status !== 'claimed' && m.status !== 'in_progress')
    return { ok: false, error: `'${id}' is '${m.status}', not 'claimed' or 'in_progress'` };
  if (!reason || !String(reason).trim()) return { ok: false, error: 'release requires a non-empty reason' };
  pushHistory(m, actor, m.status, 'ready', reason);
  m.status = 'ready';
  m.owner = null;
  m.claimed_at = null;
  return { ok: true };
}
