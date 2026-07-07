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

import { existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

function now() {
  return new Date().toISOString();
}

function findModule(plan, id) {
  return (plan.modules || []).find((m) => m.id === id);
}

function pushHistory(m, actor, from, to, note) {
  if (!Array.isArray(m.history)) m.history = [];
  m.history.push({ ts: now(), actor, from, to, note: note ?? null });
}

// claim: ready+unowned -> claimed. WIP=1 — refuses if actor already owns
// another module that's claimed or in_progress elsewhere (in_review doesn't
// count: that work is done, the actor is just waiting on a reviewer).
export function claim(plan, id, actor) {
  const m = findModule(plan, id);
  if (!m) return { ok: false, error: `no such module '${id}'` };
  if (m.status !== 'ready') return { ok: false, error: `'${id}' is '${m.status}', not 'ready'` };
  if (m.owner != null) return { ok: false, error: `'${id}' already owned by '${m.owner}'` };
  const openElsewhere = (plan.modules || []).find(
    (o) => o.owner === actor && o.id !== id && (o.status === 'claimed' || o.status === 'in_progress'),
  );
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

// start: claimed -> in_progress. Only the claiming owner may start it.
export function start(plan, id, actor) {
  const m = findModule(plan, id);
  if (!m) return { ok: false, error: `no such module '${id}'` };
  if (m.status !== 'claimed') return { ok: false, error: `'${id}' is '${m.status}', not 'claimed'` };
  if (m.owner !== actor) return { ok: false, error: `'${id}' is owned by '${m.owner}', not '${actor}'` };
  pushHistory(m, actor, 'claimed', 'in_progress');
  m.status = 'in_progress';
  return { ok: true };
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
export function close(plan, id, actor, { branch, commits, cwd = process.cwd() } = {}) {
  const m = findModule(plan, id);
  if (!m) return { ok: false, error: `no such module '${id}'` };
  if (m.status !== 'in_progress') return { ok: false, error: `'${id}' is '${m.status}', not 'in_progress'` };
  if (m.owner !== actor) return { ok: false, error: `'${id}' is owned by '${m.owner}', not '${actor}'` };
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
    verifyOutput = execSync(m.verify, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (err) {
    const out = (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '');
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

// accept: in_review -> done. Reviewer-only — refuses if the acceptor is the
// same actor who owns (did) the work, preserving don't-accept-your-own-work.
export function accept(plan, id, actor) {
  const m = findModule(plan, id);
  if (!m) return { ok: false, error: `no such module '${id}'` };
  if (m.status !== 'in_review') return { ok: false, error: `'${id}' is '${m.status}', not 'in_review'` };
  if (actor === m.owner)
    return { ok: false, error: `'${actor}' cannot accept their own work on '${id}' — needs a different reviewer` };
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
