// jira-hygiene.mjs — OFFLINE hygiene checks for the Jira mirror (the gate
// behind scripts/validators/validate-jira-hygiene.sh). Only meaningful when a
// Jira backend is configured; a project not using Jira has nothing to check.
//
// These are the checks that need NO live Jira (CI-safe): unmirrored work in the
// durable outbox, and lifecycle-advanced modules that were never synced to
// Jira. The LIVE drift checks (epic-open-with-children-done, in-progress issue
// with no assignee, split-grab) require the Jira API and live in `jira.sh
// doctor`, which the gate invokes only when connectivity exists.
//
// Prints "[x] <category>\t<detail>" per gap, same convention as
// ticket-hygiene.mjs so the shell wrapper trusts only [x]-marked lines.

import { readFileSync } from 'fs';
import { backendConfigured, pendingOps } from './lifecycle-outbox.mjs';

const LIFECYCLE_ADVANCED = new Set(['claimed', 'in_progress', 'in_review', 'done']);

export function jiraHygieneGaps(plan, planPath, env = process.env) {
  if (!backendConfigured(env)) return { skipped: true, gaps: [] };
  const gaps = [];
  const pend = pendingOps(planPath);
  if (pend.length)
    gaps.push(['pending-mirror', `${pend.length} lifecycle op(s) queued but not mirrored to Jira — run 'jira.sh reconcile'`]);
  for (const m of plan.modules || []) {
    if (LIFECYCLE_ADVANCED.has(m.status) && !m.jira_key)
      gaps.push(['unsynced-module', `'${m.id}' is ${m.status} but has no jira_key — run 'jira.sh sync-plan' (work advanced without a Jira mirror)`]);
  }
  return { skipped: false, gaps };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const planPath = process.argv[2];
  if (!planPath) { console.error('usage: jira-hygiene.mjs <plan.json>'); process.exit(2); }
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const { skipped, gaps } = jiraHygieneGaps(plan, planPath);
  if (skipped) { console.log('skip — no Jira backend configured'); process.exit(0); }
  for (const [cat, detail] of gaps) console.log(`[x] ${cat}\t${detail}`);
  console.log(gaps.length ? `INVALID — ${gaps.length} jira-hygiene gap(s)` : 'ok — jira mirror hygiene clean');
  process.exit(gaps.length ? 1 : 0);
}
