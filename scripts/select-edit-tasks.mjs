#!/usr/bin/env node
/**
 * select-edit-tasks.mjs <calibration.jsonl> — apply the pre-registered task-selection rule
 * (docs/work/GROUP_K_DESIGN.md "K2 task selection rule"). Uses ARM-A rows only; no gated result can influence it.
 *   isolated               -> KEEP (cost/tax control, not a lift target)
 *   multi-module/reuse-trap-> KEEP iff arm-A pass rate over 3 runs is 1/3 or 2/3; DROP at 0/3 and 3/3
 * Exit 0 if the post-calibration minimums are met (>=6 multi-module, >=4 isolated, >=2 reuse-trap, >=12 total), else 1.
 */
import { readFileSync } from "node:fs";

export function selectTasks(rows, { runs = 3 } = {}) {
  const a = rows.filter((r) => r.arm === "A" && !r.infra && !r.gamed);
  const by = new Map();
  for (const r of a) { if (!by.has(r.task)) by.set(r.task, { task: r.task, kind: r.kind, pass: 0, n: 0 }); const t = by.get(r.task); t.n++; t.pass += r.pass ? 1 : 0; }
  const out = [...by.values()].sort((x, y) => x.task.localeCompare(y.task)).map((t) => {
    let verdict, reason;
    if (t.kind === "isolated") { verdict = "KEEP"; reason = "isolated control"; }
    else if (t.n < runs) { verdict = "INCOMPLETE"; reason = `only ${t.n}/${runs} valid runs`; }
    else if (t.pass === 0) { verdict = "DROP"; reason = "0/3: unsolvable for this model"; }
    else if (t.pass === t.n) { verdict = "DROP"; reason = "3/3: ceiling"; }
    else { verdict = "KEEP"; reason = `${t.pass}/${t.n}: in band`; }
    return { ...t, verdict, reason };
  });
  const kept = out.filter((t) => t.verdict === "KEEP");
  const count = (k) => kept.filter((t) => t.kind === k).length;
  const counts = { total: kept.length, "multi-module": count("multi-module"), isolated: count("isolated"), "reuse-trap": count("reuse-trap") };
  const need = { total: 12, "multi-module": 6, isolated: 4, "reuse-trap": 2 };
  const short = Object.entries(need).filter(([k, n]) => counts[k] < n).map(([k, n]) => `${k} ${counts[k]}/${n}`);
  const incomplete = out.filter((t) => t.verdict === "INCOMPLETE").map((t) => t.task);
  return { tasks: out, kept: kept.map((t) => t.task), counts, short, incomplete, ok: short.length === 0 && incomplete.length === 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f = process.argv[2];
  if (!f) { console.error("usage: select-edit-tasks.mjs <calibration.jsonl>"); process.exit(2); }
  const r = selectTasks(readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)));
  for (const t of r.tasks) console.log(`${t.task.padEnd(5)} ${t.kind.padEnd(13)} ${t.pass}/${t.n}  ${t.verdict.padEnd(10)} ${t.reason}`);
  console.log(`\nkept (${r.kept.length}): ${r.kept.join(" ")}\ncounts: ${JSON.stringify(r.counts)}`);
  const incomplete = r.tasks.filter((t) => t.verdict === "INCOMPLETE").map((t) => t.task);
  if (r.ok) console.log("MINIMUMS MET");
  else {
    const why = [r.short.length ? `minimums not met: ${r.short.join(", ")}` : "", incomplete.length ? `incomplete calibration (need 3 valid arm-A runs): ${incomplete.join(", ")}` : ""].filter(Boolean).join("; ");
    console.log(`NOT READY: ${why}${r.short.length ? " — harden the ceiling tasks and re-calibrate them" : " — finish the missing runs"}`);
  }
  process.exit(r.ok ? 0 : 1);
}
