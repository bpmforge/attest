#!/usr/bin/env node
// jira-tickets.mjs — JIRA board driver for the M28 Conductor (field
// integration, docs/work/CONDUCTOR_JIRA_INTEGRATION_PLAN.md v4 steps 6+7).
//
// conductor.mjs touches the board through exactly one import (see line 64 of
// that file); this module is a drop-in second implementation of the same 13
// names, selected via CONDUCTOR_BOARD=jira. `plan.json` (tickets.mjs) stays
// the default board — this file changes nothing about that path.
//
// DATA-OWNERSHIP SPLIT (the core design decision — see the context packet
// §3): a ticket has two halves with two different owners.
//   - Lifecycle state (status, owner, depends_on)      -> JIRA, via jira.sh
//   - Module contract (write_scope, acceptance, verify,
//     manifest, title)                                  -> a checked-in file,
//     TICKET_SCOPE_MAP (docs/work/ticket-scope-map.json in the target repo)
// Rationale: write_scope needs code review, a PR diff, and git history.
// JIRA has no such field, and a free-text description field would be
// strictly worse (no review, no diff, browser-editable).
//
// HARD RULE: a JIRA ticket with no entry in the scope map is not claimable.
// It is omitted from modules[] and the omission is logged with a reason —
// never inferred from the title, never defaulted to a permissive glob. A
// guessed scope silently disables the scope gate, which is the only thing
// bounding an unattended agent's merge.
//
// Repo-agnosticism: this driver hardcodes no project-specific paths. The JIRA CLI
// location comes from JIRA_CLI; the scope-map location comes from
// TICKET_SCOPE_MAP (resolved relative to the conductor's --root). The driver
// never reads credentials itself — jira.sh owns auth; no token ever enters
// this file, conductor.mjs, or an agent session.
//
// close()/accept() reuse tickets-lifecycle.mjs verbatim — their local gates
// (manifest exists, verify exits 0, receipt pasted verbatim, accept refuses
// actor === owner) never learn what JIRA is. This driver adds the JIRA
// transition only after that local gate has already passed.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  close as lifecycleClose,
  accept as lifecycleAccept,
} from './tickets-lifecycle.mjs';
import {
  validatePlan,
  writeScopeCollisions,
  claimable,
} from './tickets-graph.mjs';

export { validatePlan, writeScopeCollisions, claimable };

// LANE: the scope map carries no lane data (write_scope + acceptance only —
// see the header), and the task said not to invent per-ticket lanes from
// JIRA fields (JIRA has no such concept). A single constant lane means every
// module is compared against every other in writeScopeCollisions() — safe
// but conservative: it can never under-detect a same-lane collision by
// mis-partitioning tickets into lanes that don't reflect real parallel
// safety. The cost is that unrelated tickets sharing no scope still pay the
// comparison; the collision predicate itself (scope overlap + one side
// ACTIVE) is what filters those out, not the lane.
const JIRA_LANE = 'jira';

function jiraCli() {
  const cli = process.env.JIRA_CLI;
  if (!cli) throw new Error('JIRA_CLI env var is not set — point it at the target project\'s jira.sh');
  return cli;
}

// The conductor calls loadPlan(PLAN_PATH) — a FILE path (`<root>/plan.json`),
// not a directory — while everything here needs the project ROOT. Prefer an
// explicit CONDUCTOR_ROOT (set by conductor.mjs at startup); fall back to the
// argument's directory when the argument names a .json file, so a direct
// loadPlan('<root>') call still works. Getting this wrong resolved the scope
// map to `<root>/plan.json/docs/work/...` and threw ENOENT only at runtime.
function projectRoot(arg) {
  if (process.env.CONDUCTOR_ROOT) return process.env.CONDUCTOR_ROOT;
  const s = String(arg ?? '.');
  return s.endsWith('.json') ? dirname(s) : s;
}

function scopeMapPath(rootArg) {
  const root = projectRoot(rootArg);
  const map = process.env.TICKET_SCOPE_MAP;
  if (!map) throw new Error('TICKET_SCOPE_MAP env var is not set — point it at the target project\'s scope-map file');
  return resolve(root, map);
}

function loadScopeMap(root) {
  const path = scopeMapPath(root);
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  return doc.tickets || {};
}

// Shell out to jira.sh. Returns { code, stdout, stderr } — never throws on a
// non-zero exit, since jira.sh's exit codes (SKIP=2/3, RACED=4, DoD BLOCKED=5)
// are meaningful control flow the caller must inspect, not failures to
// propagate as JS exceptions.
function runJira(args) {
  try {
    const stdout = execFileSync(jiraCli(), args, { encoding: 'utf8' });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      code: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

// Parses `jira.sh ready` output lines of the form "KEY  Summary text".
function parseReadyKeys(stdout) {
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('('))
    .map((l) => l.split(/\s+/, 1)[0])
    .filter(Boolean);
}

// Parses `jira.sh blockers <key>` output lines of the form "KEY  Status  [OPEN|DONE]".
function parseBlockerKeys(stdout) {
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('('))
    .map((l) => l.split(/\s+/)[0])
    .filter(Boolean);
}

// Parses `jira.sh mine` output lines of the form "KEY  [Status Name]  Summary".
// Returns { key, statusName }. The "(nothing in progress...)" placeholder line
// is filtered the same way as ready/blockers' own "(...)" placeholders.
function parseMine(stdout) {
  const out = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('(')) continue;
    const m = trimmed.match(/^(\S+)\s+\[([^\]]+)\]/);
    if (m) out.push({ key: m[1], statusName: m[2] });
  }
  return out;
}

// loadPlan: builds an in-memory ModuleTicket-shaped plan from JIRA + the
// checked-in scope map. `path` is the conductor's --root (jira.sh and the
// scope map are both resolved relative to it via env vars, per the
// repo-agnosticism constraint — this function never assumes a filesystem
// layout of its own).
export function loadPlan(root) {
  const scopeMap = loadScopeMap(root);
  const ready = runJira(['ready']);
  if (ready.code !== 0) throw new Error(`jira.sh ready failed: ${ready.stderr || ready.stdout}`);
  const keys = parseReadyKeys(ready.stdout);

  const modules = [];
  const omitted = [];
  for (const key of keys) {
    const contract = scopeMap[key];
    if (!contract) {
      omitted.push({ id: key, reason: `no entry in TICKET_SCOPE_MAP for '${key}' — not claimable` });
      continue;
    }
    const blockers = runJira(['blockers', key]);
    const depends_on = blockers.code === 3 ? parseBlockerKeys(blockers.stdout) : [];
    modules.push({
      id: key,
      kind: 'module',
      title: contract.title,
      owner: null,
      status: blockers.code === 0 ? 'ready' : 'blocked',
      lane: JIRA_LANE,
      write_scope: contract.write_scope,
      depends_on,
      acceptance: contract.acceptance,
      verify: contract.verify,
      manifest: contract.manifest,
      history: [],
    });
  }

  // Recovery path for the HIGH review finding: a ticket `claim()` already
  // moved to "In Progress" in JIRA is absent from `ready`'s output (it is no
  // longer free) and, since savePlan() is a no-op, has no plan.json history
  // for resume.mjs to diff against — a crash between claim() and start()
  // otherwise makes the ticket invisible to every future loadPlan() call:
  // not blocked, not claimed, just gone, and stuck "In Progress" in real
  // JIRA until a human notices. `jira.sh mine` is scoped by the CLI's own
  // authenticated identity (cmd_mine's `assignee = "$me"`), so folding it in
  // here restores exactly the tickets THIS actor's credentials already own —
  // no actor parameter needed, and no risk of surfacing someone else's
  // in-flight ticket as if it were ours.
  const seen = new Set(modules.map((m) => m.id));
  const mine = runJira(['mine']);
  if (mine.code === 0) {
    for (const { key, statusName } of parseMine(mine.stdout)) {
      if (seen.has(key)) continue;
      const contract = scopeMap[key];
      if (!contract) {
        omitted.push({ id: key, reason: `no entry in TICKET_SCOPE_MAP for '${key}' — not claimable` });
        continue;
      }
      modules.push({
        id: key,
        kind: 'module',
        title: contract.title,
        owner: 'me',
        status: /review/i.test(statusName) ? 'in_review' : 'in_progress',
        lane: JIRA_LANE,
        write_scope: contract.write_scope,
        depends_on: [],
        acceptance: contract.acceptance,
        verify: contract.verify,
        manifest: contract.manifest,
        history: [],
      });
      seen.add(key);
    }
  }

  return { goal: 'jira board', modules, omitted };
}

// savePlan: no-op. JIRA owns the lifecycle state this driver would otherwise
// persist — there is no plan.json for a JIRA-backed board to write.
export function savePlan() {
  // intentionally a no-op — see header
}

// recomputeStatus: a no-op here, re-exported under the shared name. JIRA is
// the sole authority for `status` (via cmd_blockers/cmd_ready reflecting
// real-time issuelinks), recomputed fresh on every loadPlan() call — there
// is no separate derived-status step, so this driver does not delegate to
// tickets-graph.mjs's recomputeStatus() (which would reset 'ready'/'blocked'
// from depends_on, redundant with what loadPlan() just computed from JIRA).
export function recomputeStatus(plan) {
  return plan;
}

// claim: shells to `jira.sh claim <key>`. Honours RACED/SKIP — on either,
// the claim fails and must not be retried by this function.
export function claim(plan, id, actor) {
  const r = runJira(['claim', id, actor]);
  if (r.code !== 0) {
    const msg = (r.stderr || r.stdout).trim();
    return { ok: false, error: msg || `jira.sh claim ${id} exited ${r.code}` };
  }
  const m = (plan.modules || []).find((x) => x.id === id);
  if (m) {
    m.owner = actor;
    m.status = 'claimed';
  }
  return { ok: true };
}

// start: no dedicated jira.sh verb — the claim transition already moves the
// issue to "In Progress" in JIRA (cmd_claim's step 2). This mirrors that in
// the in-memory module and returns the same paste-able receipt shape
// tickets-lifecycle.mjs's start() returns, so /reflow's Stage 0 requirement
// is unaffected by which board is active.
export function start(plan, id, actor) {
  const m = (plan.modules || []).find((x) => x.id === id);
  if (!m) return { ok: false, error: `no such module '${id}'` };
  if (m.status !== 'claimed') return { ok: false, error: `'${id}' is '${m.status}', not 'claimed'` };
  m.status = 'in_progress';
  const ts = new Date().toISOString();
  const receipt =
    `── start receipt: ${id} ──\n` +
    `actor: ${actor}\n` +
    `status: claimed -> in_progress\n` +
    `timestamp: ${ts}\n` +
    `paste this block verbatim as Stage 0 of the HANDOFF you are about to execute`;
  return { ok: true, receipt };
}

export function comment(plan, id, actor, note) {
  const r = runJira(['comment', id, note]);
  if (r.code !== 0) {
    const msg = (r.stderr || r.stdout).trim();
    return { ok: false, error: msg || `jira.sh comment ${id} exited ${r.code}` };
  }
  return { ok: true };
}

// close(): reuse tickets-lifecycle.mjs's gate verbatim (manifest exists,
// verify exits 0, branch + commits supplied). Only after that local gate
// passes does this function touch JIRA at all — a comment recording the
// receipt. No JIRA state transition happens here; `accept()` is what moves
// the issue to Done, matching the ready->claimed->in_progress->in_review->
// done semantics the conductor expects from any board.
export function close(plan, id, actor, opts) {
  const r = lifecycleClose(plan, id, actor, opts);
  if (!r.ok) return r;
  const commented = runJira(['comment', id, r.receipt]);
  if (commented.code !== 0) {
    // The local gate already passed and produced r.receipt — the one artifact
    // proving that — before the JIRA comment failed. savePlan() is a no-op for
    // this board, so nothing else persists it; returning it here lets a caller
    // (or a human) retry `jira.sh comment` with the already-produced text
    // instead of re-running the whole close sequence (MEDIUM, code review
    // 2026-07-31).
    return { ok: false, error: `local close gate passed but jira.sh comment failed: ${(commented.stderr || commented.stdout).trim()}`, receipt: r.receipt };
  }
  return r;
}

// accept(): reuse tickets-lifecycle.mjs's gate verbatim (manifestHasCloseReceipt,
// actor !== owner). Only after that local gate passes does this function
// transition the JIRA issue to Done via `jira.sh release <key> done`.
export function accept(plan, id, actor, opts) {
  const r = lifecycleAccept(plan, id, actor, opts);
  if (!r.ok) return r;
  const released = runJira(['release', id, 'done']);
  if (released.code !== 0) {
    return { ok: false, error: `local accept gate passed but jira.sh release ${id} done failed: ${(released.stderr || released.stdout).trim()}` };
  }
  return r;
}

// release: -> `jira.sh release <key> [done]`. Plain release (no `done`) is
// the abandon/hand-back path — clears ownership, ticket returns to ready.
export function release(plan, id, actor, reason) {
  const r = runJira(['release', id]);
  if (r.code !== 0) {
    const msg = (r.stderr || r.stdout).trim();
    return { ok: false, error: msg || `jira.sh release ${id} exited ${r.code}` };
  }
  const m = (plan.modules || []).find((x) => x.id === id);
  if (m) {
    m.owner = null;
    m.status = 'ready';
  }
  return { ok: true };
}

// Capability flag read by conductor.mjs's persistPlan(): this board keeps no
// plan file on disk (savePlan is a no-op — JIRA owns lifecycle state), so the
// conductor must not `git add`/commit PLAN_PATH for it. tickets.mjs exports no
// such flag, so it reads as undefined there and the plan.json path is
// unchanged: it still commits its plan file on every lifecycle transition,
// which is the trail resume.mjs's drift detection depends on.
export const BOARD_IS_FILE_BACKED = false;
