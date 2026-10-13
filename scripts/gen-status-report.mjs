#!/usr/bin/env node
// gen-status-report.mjs — regenerate docs/work/STATUS.md (T29.3, H7/C-1).
//
// Reads a plan.json module layer (+ docs/USER_STORIES.md's stories[] layer
// when adopted), derives % from BOTH the task layer and the requirement
// layer, and writes a STATUS.md that visually splits "platform / foundation
// built" from "features complete" -- never painting a phase green with an
// open story. See scripts/lib/status-report.mjs for the derivation itself
// (kept pure/testable there; this file is only the CLI + file I/O).
//
// Usage:
//   node scripts/gen-status-report.mjs [plan.json] [user-stories.md] [out.md]
//   node scripts/gen-status-report.mjs [plan.json] [user-stories.md] [out.md] --check
// Defaults: plan    = docs/work/plan.json (else examples/tickets-plan.sample.json)
//           stories = docs/USER_STORIES.md if present, else none
//           out     = docs/work/STATUS.md
//
// `--check` verifies freshness of an already-generated STATUS.md against a
// live recompute instead of regenerating it (wrapped by
// scripts/validators/validate-status-freshness.sh). Exit 0 fresh / 1 stale
// or missing / 2 usage.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { loadPlan, recomputeStatus } from './lib/tickets.mjs';
import { extractStoryIds } from './lib/user-stories.mjs';
import { computeStatusReport, renderStatusMarkdown, checkStatusFreshness } from './lib/status-report.mjs';

const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const positional = args.filter((a) => !a.startsWith('--'));

const planPath = positional[0]
  || (existsSync('docs/work/plan.json') ? 'docs/work/plan.json' : 'examples/tickets-plan.sample.json');
const storiesPath = positional[1] !== undefined
  ? (positional[1] || null)
  : (existsSync('docs/USER_STORIES.md') ? 'docs/USER_STORIES.md' : null);
const outPath = positional[2] || 'docs/work/STATUS.md';

function loadStoryIds() {
  if (!storiesPath || !existsSync(storiesPath)) return [];
  return extractStoryIds(readFileSync(storiesPath, 'utf8')).map((s) => s.id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(planPath)) {
    console.error(`[x] plan not found: ${planPath}`);
    process.exit(2);
  }
  const plan = recomputeStatus(loadPlan(planPath));
  const storyIds = loadStoryIds();

  if (checkMode) {
    if (!existsSync(outPath)) {
      console.error(`[x] ${outPath} not found -- nothing to check`);
      process.exit(1);
    }
    const existing = readFileSync(outPath, 'utf8');
    const { stale, reasons } = checkStatusFreshness(existing, plan, storyIds);
    if (stale) {
      for (const r of reasons) console.error(`  [x] ${r}`);
      console.error(`STALE -- ${outPath} is out of date, regenerate with: node scripts/gen-status-report.mjs ${planPath}${storiesPath ? ` ${storiesPath}` : ''} ${outPath}`);
      process.exit(1);
    }
    console.log(`ok -- ${outPath} is fresh`);
    process.exit(0);
  }

  const report = computeStatusReport(plan, storyIds);
  const generatedAt = new Date().toISOString();
  const markdown = renderStatusMarkdown(report, { planPath, generatedAt });
  writeFileSync(outPath, markdown);
  console.log(`wrote ${outPath} -- tasks ${report.tasks.percent}% / stories ${report.stories.percent}% / ${report.phase}`);
}
