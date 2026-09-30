#!/usr/bin/env node
/** analyze-edit-tasks.mjs <results.jsonl> — apply the pre-registered flip rule (docs/work/GROUP_K_DESIGN.md K2). */
import { readFileSync } from "node:fs";
import { evaluate } from "./lib/edit-task-stats.mjs";

const f = process.argv[2];
if (!f) { console.error("usage: analyze-edit-tasks.mjs <results.jsonl>"); process.exit(2); }
const rows = readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
let r;
try { r = evaluate(rows); } catch (e) { console.error(`INVALID INPUT: ${e.message}`); process.exit(2); }
const p = (x) => (Number.isFinite(x) ? x.toFixed(3) : "n/a");
const ci = (c) => `mean ${p(c.mean)}  95% CI [${p(c.lo)}, ${p(c.hi)}]  tasks=${c.tasks}  sign p=${p(c.sign.p)}`;
console.log(`runs: ${r.runs}  gamed: ${r.gamedRuns}  infra-failed: ${r.infraRuns}  gate fire rate (B): ${p(r.fireRateB)}  trace rate: ${p(r.traceRate)}`);
if (r.itt) {
  for (const m of ["itt", "editedOnly"]) {
    console.log(`\n[${m}] B-A multi-module: ${ci(r[m].multi)}`);
    console.log(`[${m}] B-A isolated:     ${ci(r[m].isolated)}`);
    console.log(`[${m}] B-A reuse-trap:   ${ci(r[m].reuse)}   (informational; not in the flip rule)`);
  }
  console.log(`\nB-D (fact request vs pure pause): ${ci(r.BminusD)}`);
  console.log(`B-C (gate vs prompt line):        ${ci(r.BminusC)}`);
  console.log(`median paired duration overhead B vs A: ${p(r.overhead * 100)}%`);
}
console.log(`\nVERDICT: ${r.verdict}${r.note ? " — " + r.note : ""}`);
process.exit(r.verdict === "FLIP" ? 0 : 1);
