#!/usr/bin/env node
// gen-tickets-board.mjs — regenerate the human-readable ticket board (T2/T10.2).
//
// Reads a plan.json module layer, recomputes blocked/ready, and emits
// docs/work/TICKETS.md: a "claim right now" header, a lane-column board
// (each lane's tickets grouped Ready/In Progress/Blocked), and a mermaid
// dependency DAG. Idempotent — the board is a derived view, never
// hand-edited (plan.json is the source).
//
// Usage:
//   node scripts/gen-tickets-board.mjs [plan.json] [out.md]
//   node scripts/gen-tickets-board.mjs [plan.json] --stdout
// Defaults: plan = docs/work/plan.json (else examples/tickets-plan.sample.json),
//           out  = docs/work/TICKETS.md

import { existsSync, writeFileSync } from 'fs';
import { loadPlan, savePlan, recomputeStatus, claimable } from './lib/tickets.mjs';

const args = process.argv.slice(2);
const toStdout = args.includes('--stdout');
const positional = args.filter(a => !a.startsWith('--'));
const planPath = positional[0]
  || (existsSync('docs/work/plan.json') ? 'docs/work/plan.json' : 'examples/tickets-plan.sample.json');
const outPath = positional[1] || 'docs/work/TICKETS.md';

export function renderBoard(plan, planPath) {
  const modules = plan.modules || [];
  const byId = Object.fromEntries(modules.map(m => [m.id, m]));

  const blockers = m => {
    const b = (m.depends_on || []).filter(d => byId[d]?.status !== 'done');
    return b.length ? b.join(', ') : '—';
  };

  const claimableIds = claimable(plan).map(m => m.id);
  const claimHeader = claimableIds.length
    ? `**${claimableIds.length} agent${claimableIds.length === 1 ? '' : 's'} can start right now:** ${claimableIds.join(', ')}`
    : '**0 agents can start right now** — every module is blocked, claimed, or done.';

  // Lane-column board: one section per lane, tickets grouped by status
  // bucket within it, so "what can I work on in my lane" is answerable
  // without scanning the full flat table below. validatePlan() requires
  // `lane` on every module, but this generator has its own --stdout CLI
  // path that doesn't call it -- a lane-less module (hand-edited or legacy
  // plan.json) still needs to be visible here, not silently dropped from
  // the board while the claim-right-now header (which doesn't filter on
  // lane) still counts it. UNASSIGNED_LANE makes that mismatch impossible.
  const UNASSIGNED_LANE = '(unassigned)';
  const laneOf = m => m.lane || UNASSIGNED_LANE;
  const lanes = [...new Set(modules.map(laneOf))].sort();
  const laneSections = lanes.map(lane => {
    const laneModules = modules.filter(m => laneOf(m) === lane);
    const ready = laneModules.filter(m => m.status === 'ready' && m.owner == null);
    const inProgress = laneModules.filter(m =>
      ['claimed', 'in_progress', 'in_review'].includes(m.status));
    const blocked = laneModules.filter(m => m.status === 'blocked');

    const readyLines = ready.length
      ? ready.map(m => `- **${m.id}** — ${m.title} _(claimable)_`).join('\n')
      : '- (none)';
    const inProgressLines = inProgress.length
      ? inProgress.map(m => `- **${m.id}** — ${m.title} _(owner: ${m.owner ?? '—'}, status: ${m.status})_`).join('\n')
      : '- (none)';
    const blockedLines = blocked.length
      ? blocked.map(m => `- **${m.id}** — ${m.title} _(blocked by: ${blockers(m)})_`).join('\n')
      : '- (none)';

    return `### ${lane}\n\n**Ready**\n${readyLines}\n\n**In Progress**\n${inProgressLines}\n\n**Blocked**\n${blockedLines}`;
  }).join('\n\n');

  const rows = modules.map(m =>
    `| ${m.id} | ${m.title} | ${m.status} | ${m.owner ?? '—'} | ${blockers(m)} | ${m.write_scope.join(', ')} |`
  ).join('\n');

  const edges = modules.flatMap(m => (m.depends_on || []).map(d => `  ${d} --> ${m.id}`)).join('\n')
    || '  %% no dependencies';

  return `# Tickets

> Derived from \`${planPath}\` by \`scripts/gen-tickets-board.mjs\`. Do not hand-edit — edit the plan and regenerate.

${claimHeader}

## Board (by lane)

${laneSections || '_(no lanes assigned)_'}

## Full table

| ID | Module | Status | Owner | Blocked by | Write-scope |
|----|--------|--------|-------|------------|-------------|
${rows}

\`\`\`mermaid
graph LR
${edges}
\`\`\`
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plan = recomputeStatus(loadPlan(planPath));
  const board = renderBoard(plan, planPath);

  if (toStdout) {
    process.stdout.write(board);
  } else {
    // persist recomputed statuses back to the plan, then write the board
    if (positional[0] || existsSync('docs/work/plan.json')) savePlan(planPath, plan);
    writeFileSync(outPath, board);
    console.log(`wrote ${outPath} (${plan.modules.length} module(s))`);
  }
}
