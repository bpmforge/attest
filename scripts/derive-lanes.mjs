#!/usr/bin/env node
// derive-lanes.mjs — CLI: fill in missing `lane` fields on a plan.json's
// modules[] via deriveLane() (T10.4). Existing lanes are kept unless
// --overwrite is passed.
//
// Usage:
//   node scripts/derive-lanes.mjs <plan.json> [--overwrite] [--stdout]
// Without --stdout, writes the result back to the same file (in place).

import { readFileSync, writeFileSync } from 'fs';
import { deriveLanes } from './lib/derive-lanes.mjs';

const args = process.argv.slice(2);
const overwrite = args.includes('--overwrite');
const toStdout = args.includes('--stdout');
const planPath = args.find(a => !a.startsWith('--'));

if (!planPath) {
  console.error('Usage: node scripts/derive-lanes.mjs <plan.json> [--overwrite] [--stdout]');
  process.exit(2);
}

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const before = (plan.modules || []).filter(m => !m.lane).length;
deriveLanes(plan, { overwrite });
const after = (plan.modules || []).filter(m => !m.lane).length;

const json = JSON.stringify(plan, null, 2) + '\n';
if (toStdout) {
  process.stdout.write(json);
} else {
  writeFileSync(planPath, json);
  console.error(`derived lanes for ${before - after} module(s) (${after} still missing)`);
}
