#!/usr/bin/env node
// tickets.mjs — module-contract ticket layer over plan.json (T1).
//
// Adds an assignable MODULE layer above task-decomposer's fine-grained node DAG.
// A module is a *contract* (interface + exclusive write-scope + acceptance +
// depends_on), not an assignment to a specific agent — any agent, including a
// contributor's own, may claim one as long as it honors the contract. This file
// is the reader/writer/validator the rest of the feature (T2 board, T3 /reflow,
// T6 validators) builds on.
//
// DESIGN RULES (what keeps parallel work collision-free):
//   1. modules[] is OPTIONAL and additive — a plain task-decomposer plan.json
//      (nodes[] only) stays valid. Backward compatible.
//   2. Every module has a `lane` (T10.1). Different lanes are the parallel-safety
//      partition: their write_scopes must NEVER overlap, checked unconditionally
//      by validatePlan() via crossLaneCollisions() — a plan violating this is
//      malformed, not just racy. Same-lane write_scope collisions are an ordinary
//      runtime concern, caught only once a module goes active — see
//      writeScopeCollisions() (T6 will fail on either).
//   3. Status is auto-computed only for non-claimed, non-terminal modules:
//      a module is `ready` when every depends_on module is `done`, else `blocked`.
//      Human/agent-owned states (claimed/in_progress/in_review/done) are never
//      auto-downgraded.
//
// CLI:  node scripts/lib/tickets.mjs validate <plan.json>
//       node scripts/lib/tickets.mjs status   <plan.json>   # recompute + print claimable
//
// Exit 0 ok / 1 invalid or collisions / 2 usage.

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
// Pure graph invariants (T1) live in their own module so tickets-lifecycle.mjs
// can import validatePlan()/writeScopeCollisions() without a circular import —
// see tickets-graph.mjs's header for why (T26.3).
import {
  STATUSES,
  validatePlan,
  recomputeStatus,
  claimable,
  claimableByLane,
  laneOf,
  UNASSIGNED_LANE,
  writeScopeCollisions,
  crossLaneCollisions,
  scopeCoverageWarnings,
  storyCoverageWarnings,
  requirementClosure,
} from './tickets-graph.mjs';
export { STATUSES, validatePlan, recomputeStatus, claimable, claimableByLane, laneOf, UNASSIGNED_LANE, writeScopeCollisions, crossLaneCollisions, scopeCoverageWarnings, storyCoverageWarnings, requirementClosure };
// T29.2: story ids come from docs/USER_STORIES.md, an external doc — this is
// the only file in the lib/ chapter set that ever reads a *doc*, not just
// plan.json, since story-coverage/requirement-closure are inherently
// cross-artifact checks.
import { extractStoryIds } from './user-stories.mjs';
export { extractStoryIds };
// Backend-agnostic mirror seam (docs/DESIGN_JIRA_ADAPTER.md §6). A no-op unless
// a tracker backend is configured; carries NO tracker/Jira knowledge and no
// network — one synchronous JSONL append after a verb's savePlan() succeeds.
// This is the ONLY coupling the SoT engine has to any external tracker.
import { appendOutbox } from './lifecycle-outbox.mjs';
// Lifecycle verbs (T26.1) live in their own chapter module to keep this
// barrel under the file-size cap — see CODE_BOOK_PROTOCOL.md. claim() itself
// now enforces the T26.3 hygiene check (via tickets-graph.mjs), not just this
// CLI, so a direct library import is refused the same way the CLI is.
import {
  claim,
  start,
  comment,
  close,
  accept,
  release,
  openTicketFor,
  manifestHasCloseReceipt,
} from './tickets-lifecycle.mjs';
export { claim, start, comment, close, accept, release, openTicketFor, manifestHasCloseReceipt };

export function loadPlan(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function savePlan(path, plan) {
  writeFileSync(path, JSON.stringify(plan, null, 2) + '\n');
}

// Ticket lifecycle verbs (claim/start/comment/close/accept/release) are
// implemented in tickets-lifecycle.mjs and re-exported above (T26.1) — see
// that file for the enforced transition graph and full rationale.
// ── CLI ────────────────────────────────────────────────────────────────
// Lifecycle verbs (claim/start/comment/close/accept/release) persist the
// mutated plan back to disk on success — this CLI IS the single sanctioned
// writer of module status; nothing hand-edits plan.json's modules[].status.
const USAGE =
  'usage: tickets.mjs validate <plan.json> [user-stories.md]\n' +
  '   or: tickets.mjs status <plan.json>\n' +
  '   or: tickets.mjs claim      <plan.json> <id> <actor>\n' +
  '   or: tickets.mjs start      <plan.json> <id> <actor>\n' +
  '   or: tickets.mjs comment    <plan.json> <id> <actor> <note...>\n' +
  '   or: tickets.mjs close      <plan.json> <id> <actor> --branch <b> --commits <c1,c2,...>\n' +
  '   or: tickets.mjs accept     <plan.json> <id> <actor>\n' +
  '   or: tickets.mjs release    <plan.json> <id> <actor> <reason...>\n' +
  '   or: tickets.mjs open-for   <plan.json> <actor>\n' +
  '   or: tickets.mjs check-receipt <plan.json> <id>\n' +
  '   or: tickets.mjs requirement-status <plan.json> <user-stories.md>';

function parseFlags(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--branch') flags.branch = argv[++i];
    else if (argv[i] === '--commits') flags.commits = (argv[++i] || '').split(',').filter(Boolean);
    else rest.push(argv[i]);
  }
  return { flags, rest };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const [cmd, path, ...rest] = process.argv.slice(2);
  if (!cmd || !path) { console.error(USAGE); process.exit(2); }
  const plan = loadPlan(path);

  if (cmd === 'validate') {
    const { ok, errors } = validatePlan(plan);
    const collisions = writeScopeCollisions(plan);
    for (const e of errors) console.log(`  [x] ${e}`);
    for (const c of collisions) console.log(`  [x] write-scope collision: ${c.a} vs ${c.b} (${c.scope})`);
    // Advisory [!] lines — surfaced to humans/leads; validate-tickets.sh gates on [x] only.
    for (const w of scopeCoverageWarnings(plan)) console.log(`  [!] ${w.msg}`);
    // T29.2: story-coverage is advisory too, UNLESS STORY_COVERAGE_STRICT
    // promotes it to a gate (docs/TICKET_SCHEMA.md's "configurable gap").
    // Only runs when a USER_STORIES.md path was actually passed — a caller
    // that never adopted the stories[] layer sees no new output at all.
    let storyGaps = 0;
    const storiesPath = rest[0];
    if (storiesPath) {
      const storyIds = extractStoryIds(readFileSync(storiesPath, 'utf8')).map((s) => s.id);
      const strict = /^(1|true)$/i.test(process.env.STORY_COVERAGE_STRICT || '');
      for (const w of storyCoverageWarnings(plan, storyIds)) {
        if (strict) { console.log(`  [x] ${w.msg}`); storyGaps++; }
        else console.log(`  [!] ${w.msg}`);
      }
    }
    const clean = ok && collisions.length === 0 && storyGaps === 0;
    console.log(clean ? `ok — ${(plan.modules || []).length} module(s) valid, no collisions` : `INVALID — ${errors.length} error(s), ${collisions.length} collision(s), ${storyGaps} story gap(s)`);
    process.exit(clean ? 0 : 1);
  } else if (cmd === 'requirement-status') {
    const storiesPath = rest[0];
    if (!storiesPath) { console.error(USAGE); process.exit(2); }
    const storyIds = extractStoryIds(readFileSync(storiesPath, 'utf8')).map((s) => s.id);
    const { stories, openCount, closedCount } = requirementClosure(plan, storyIds);
    for (const s of stories) {
      if (s.status === 'open') console.log(`  [x] story '${s.id}' open — ${s.reason}`);
      else console.log(`  [ok] story '${s.id}' closed (${s.modules.join(', ')})`);
    }
    console.log(openCount === 0 ? `ok — ${closedCount} stor${closedCount === 1 ? 'y' : 'ies'} closed, 0 open` : `INVALID — ${openCount} stor${openCount === 1 ? 'y' : 'ies'} open, ${closedCount} closed`);
    process.exit(openCount === 0 ? 0 : 1);
  } else if (cmd === 'status') {
    recomputeStatus(plan);
    const ready = claimable(plan);
    console.log(`claimable (${ready.length}):`);
    // T10.3: broken out per lane — lane is the parallel-safety partition,
    // so "what can start now" should be answerable per lane without
    // cross-referencing write-scopes by hand.
    for (const { lane, modules } of claimableByLane(plan)) {
      console.log(`  ${lane} (${modules.length}):`);
      for (const m of modules) console.log(`    ${m.id} — ${m.title}  [${m.write_scope.join(', ')}]`);
    }
    process.exit(0);
  } else if (cmd === 'claim' || cmd === 'start') {
    const [id, actor] = rest;
    if (!id || !actor) { console.error(USAGE); process.exit(2); }
    // T26.3: claim() itself refuses to SELECT a NEW ticket while the ticket
    // graph is unhygienic (see tickets-lifecycle.mjs) — enforced in the
    // library function, not just here, so a direct import is refused the
    // same way this CLI is. `start` was never gated on this (it only ever
    // advances a ticket the actor already claimed; gating it on the WHOLE
    // plan's hygiene would deadlock an actor's own in-flight ticket on an
    // unrelated, unclaimed colliding module elsewhere in the graph).
    const r = (cmd === 'claim' ? claim : start)(plan, id, actor);
    if (!r.ok) { console.error(`[x] ${r.error}`); process.exit(1); }
    savePlan(path, plan);
    appendOutbox(path, { verb: cmd, planId: id, jiraKey: (plan.modules || []).find((m) => m.id === id)?.jira_key, actor });
    if (cmd === 'start') {
      console.log(r.receipt);
    } else {
      console.log(`ok — ${id}: ready -> claimed (${actor})`);
    }
    process.exit(0);
  } else if (cmd === 'open-for') {
    const [actor] = rest;
    if (!actor) { console.error(USAGE); process.exit(2); }
    const m = openTicketFor(plan, actor);
    if (m) {
      console.error(`[x] '${actor}' has an open ticket ('${m.id}', ${m.status}) — refuse to select next work until it is closed (T26.3)`);
      process.exit(1);
    }
    console.log(`ok — '${actor}' has no open ticket, clear to select next work`);
    process.exit(0);
  } else if (cmd === 'check-receipt') {
    const [id] = rest;
    if (!id) { console.error(USAGE); process.exit(2); }
    const m = (plan.modules || []).find((x) => x.id === id);
    if (!m) { console.error(`[x] no such module '${id}'`); process.exit(1); }
    if (!m.manifest) { console.error(`[x] '${id}' has no manifest configured`); process.exit(1); }
    const manifestPath = resolve(dirname(resolve(path)), m.manifest);
    const r = manifestHasCloseReceipt(manifestPath, id, m.evidence, m.owner);
    if (!r.ok) { console.error(`[x] ${r.reason}`); process.exit(1); }
    console.log(`ok — ${id}: manifest has a valid pasted close receipt`);
    process.exit(0);
  } else if (cmd === 'comment') {
    const [id, actor, ...noteParts] = rest;
    const note = noteParts.join(' ');
    if (!id || !actor || !note) { console.error(USAGE); process.exit(2); }
    const r = comment(plan, id, actor, note);
    if (!r.ok) { console.error(`[x] ${r.error}`); process.exit(1); }
    savePlan(path, plan);
    appendOutbox(path, { verb: 'comment', planId: id, jiraKey: (plan.modules || []).find((m) => m.id === id)?.jira_key, actor, note });
    console.log(`ok — comment appended to ${id}`);
    process.exit(0);
  } else if (cmd === 'close') {
    const { flags, rest: positional } = parseFlags(rest);
    const [id, actor] = positional;
    if (!id || !actor) { console.error(USAGE); process.exit(2); }
    const r = close(plan, id, actor, { branch: flags.branch, commits: flags.commits, cwd: dirname(resolve(path)) });
    if (!r.ok) { console.error(`[x] ${r.error}`); process.exit(1); }
    savePlan(path, plan);
    appendOutbox(path, { verb: 'close', planId: id, jiraKey: (plan.modules || []).find((m) => m.id === id)?.jira_key, actor, branch: flags.branch, commits: flags.commits });
    console.log(r.receipt);
    process.exit(0);
  } else if (cmd === 'accept') {
    const [id, actor] = rest;
    if (!id || !actor) { console.error(USAGE); process.exit(2); }
    const r = accept(plan, id, actor, { cwd: dirname(resolve(path)) });
    if (!r.ok) { console.error(`[x] ${r.error}`); process.exit(1); }
    savePlan(path, plan);
    appendOutbox(path, { verb: 'accept', planId: id, jiraKey: (plan.modules || []).find((m) => m.id === id)?.jira_key, actor });
    console.log(`ok — ${id}: in_review -> done (accepted by ${actor})`);
    process.exit(0);
  } else if (cmd === 'release') {
    const [id, actor, ...reasonParts] = rest;
    const reason = reasonParts.join(' ');
    if (!id || !actor || !reason) { console.error(USAGE); process.exit(2); }
    const r = release(plan, id, actor, reason);
    if (!r.ok) { console.error(`[x] ${r.error}`); process.exit(1); }
    savePlan(path, plan);
    appendOutbox(path, { verb: 'release', planId: id, jiraKey: (plan.modules || []).find((m) => m.id === id)?.jira_key, actor, reason });
    console.log(`ok — ${id}: ${r.ok ? 'released to ready' : ''}`);
    process.exit(0);
  } else { console.error(`unknown command: ${cmd}\n${USAGE}`); process.exit(2); }
}
