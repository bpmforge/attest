// lifecycle-outbox.mjs — the backend-agnostic seam between the plan.json ticket
// lifecycle (tickets.mjs, the SOURCE OF TRUTH) and any external-tracker mirror
// (scripts/jira/jira.mjs today; Linear/GitHub Projects tomorrow).
//
// WHY THIS MODULE EXISTS: tickets.mjs must be able to emit a lifecycle event
// WITHOUT importing the Jira adapter — otherwise (a) the invariant engine gains
// a network/tracker dependency, and (b) jira.mjs ↔ tickets.mjs is a circular
// import. So the outbox primitives live here, Jira-free: appendOutbox is one
// synchronous file append, guarded by a neutral "is a tracker backend
// configured" env check. The adapter reads/drains this log; this module never
// talks to a tracker. See docs/DESIGN_JIRA_ADAPTER.md §6.
//
// Format: append-only JSONL at <plan-dir>/<basename>. An emitted event is
// {ts, verb, planId, ...}; a drainer records success by appending
// {verb:'ack', ref:<original ts>}. Pending = events with no matching ack.

import { appendFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';

export const OUTBOX_BASENAME = 'jira-outbox.jsonl';

// Neutral backend-selection check — mirrors resolveConfig() in jira.mjs but
// carries no REST/Jira detail, so this module stays tracker-agnostic. A future
// backend adds its own env signal here.
export function backendConfigured(env = process.env) {
  const backend = (env.TRACKER_BACKEND || 'auto').toLowerCase();
  if (backend === 'none') return false;
  if (backend === 'jira') return true;
  return backend === 'auto' && !!env.JIRA_BASE_URL;
}

export function outboxPath(planPath) {
  return join(dirname(resolve(planPath)), OUTBOX_BASENAME);
}

export function nowIso(env = process.env) {
  // Date is unavailable in some sandboxes and must stay deterministic in tests;
  // honour an explicit override, else the wall clock.
  return env && env.__JIRA_FAKE_TS ? env.__JIRA_FAKE_TS : new Date().toISOString();
}

// The ONE call tickets.mjs makes after a verb's savePlan() succeeds. Writes a
// single JSONL line iff a tracker backend is configured; otherwise a no-op
// (byte-for-byte the pre-adapter behaviour). No import of any adapter, no
// network, fully synchronous.
export function appendOutbox(planPath, event, env = process.env) {
  if (!backendConfigured(env)) return false;
  appendFileSync(outboxPath(planPath), JSON.stringify({ ts: nowIso(env), ...event }) + '\n');
  return true;
}

export function readOutbox(planPath) {
  const p = outboxPath(planPath);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function pendingOps(planPath) {
  const rows = readOutbox(planPath);
  const acked = new Set(rows.filter((r) => r.verb === 'ack').map((r) => r.ref));
  return rows.filter((r) => r.verb !== 'ack' && !acked.has(r.ts));
}

export function ackOp(planPath, ts, env = process.env) {
  appendFileSync(outboxPath(planPath), JSON.stringify({ ts: nowIso(env), verb: 'ack', ref: ts }) + '\n');
}
