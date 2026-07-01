#!/usr/bin/env node
// gen-tickets-board.mjs — regenerate the human-readable ticket board (T2).
//
// Reads a plan.json module layer, recomputes blocked/ready, and emits
// docs/work/TICKETS.md: a status table + a mermaid dependency DAG. Idempotent —
// the board is a derived view, never hand-edited (plan.json is the source).
//
// Usage:
//   node scripts/gen-tickets-board.mjs [plan.json] [out.md]
//   node scripts/gen-tickets-board.mjs [plan.json] --stdout
// Defaults: plan = docs/work/plan.json (else examples/tickets-plan.sample.json),
//           out  = docs/work/TICKETS.md

import { existsSync } from 'fs';
import { loadPlan, savePlan, recomputeStatus } from './lib/tickets.mjs';
import { writeFileSync } from 'fs';

const args = process.argv.slice(2);
const toStdout = args.includes('--stdout');
const positional = args.filter(a => !a.startsWith('--'));
const planPath = positional[0]
  || (existsSync('docs/work/plan.json') ? 'docs/work/plan.json' : 'examples/tickets-plan.sample.json');
const outPath = positional[1] || 'docs/work/TICKETS.md';

const plan = recomputeStatus(loadPlan(planPath));
const modules = plan.modules || [];

const blockers = m => {
  const byId = Object.fromEntries(modules.map(x => [x.id, x]));
  const b = (m.depends_on || []).filter(d => byId[d]?.status !== 'done');
  return b.length ? b.join(', ') : '—';
};

const rows = modules.map(m =>
  `| ${m.id} | ${m.title} | ${m.status} | ${m.owner ?? '—'} | ${blockers(m)} | ${m.write_scope.join(', ')} |`
).join('\n');

const edges = modules.flatMap(m => (m.depends_on || []).map(d => `  ${d} --> ${m.id}`)).join('\n')
  || '  %% no dependencies';

const board = `# Tickets

> Derived from \`${planPath}\` by \`scripts/gen-tickets-board.mjs\`. Do not hand-edit — edit the plan and regenerate.

| ID | Module | Status | Owner | Blocked by | Write-scope |
|----|--------|--------|-------|------------|-------------|
${rows}

\`\`\`mermaid
graph LR
${edges}
\`\`\`

**Claimable now:** ${modules.filter(m => m.status === 'ready' && m.owner == null).map(m => m.id).join(', ') || '(none)'}
`;

if (toStdout) {
  process.stdout.write(board);
} else {
  // persist recomputed statuses back to the plan, then write the board
  if (positional[0] || existsSync('docs/work/plan.json')) savePlan(planPath, plan);
  writeFileSync(outPath, board);
  console.log(`wrote ${outPath} (${modules.length} module(s))`);
}
