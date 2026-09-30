#!/usr/bin/env node
/** analyze-edit-tasks.mjs <results.jsonl> — apply the pre-registered flip rule (docs/work/GROUP_K_DESIGN.md K2). */
import { readFileSync } from "node:fs";
import { evaluate } from "./lib/edit-task-stats.mjs";

const f = process.argv[2];
if (!f) { console.error("usage: analyze-edit-tasks.mjs <results.jsonl>"); process.exit(2); }
const rows = readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const r = evaluate(rows);
const p = (x) => (Number.isFinite(x) ? x.toFixed(3) : "n/a");
const ci = (c) => `mean ${p(c.mean)}  95% CI [${p(c.lo)}, ${p(c.hi)}]`;
console.log(`runs: ${rows.length}  gamed (excluded): ${r.gamedRuns}`);
for (const m of ["itt", "firedOnly"]) {
  console.log(`\n[${m}] B-A multi-module (${r[m].multi.tasks} tasks): ${ci(r[m].multi)}  sign p=${p(r[m].multi.sign.p)}`);
  console.log(`[${m}] B-A isolated     (${r[m].isolated.tasks} tasks): ${ci(r[m].isolated)}  sign p=${p(r[m].isolated.sign.p)}`);
}
console.log(`\nB-D (fact request vs pure pause): ${ci(r.BminusD)}`);
console.log(`B-C (gate vs prompt line):        ${ci(r.BminusC)}`);
console.log(`median duration overhead B vs A:   ${p(r.overhead * 100)}%`);
console.log(`\nVERDICT: ${r.verdict}${r.note ? " — " + r.note : ""}`);
process.exit(r.verdict === "FLIP" ? 0 : 1);
