#!/usr/bin/env node
/**
 * delegation-metrics.mjs — the correction rate, derived rather than tallied.
 *
 * A downstream project logs 118 delegations at roughly 76% accepted / 24%
 * requiring a correction round, with zero escapes to main. That number is the
 * strongest available answer to "can you trust AI-authored code here" — it turns
 * a vibe into a trending quantity. Two problems with it as it stands:
 *
 *   1. It was counted by hand. A coverage claim whose denominator comes from the
 *      claimant is exactly what this program's own rubric refuses everywhere else.
 *   2. It is a single scalar. It cannot say WHICH model or WHICH agent produces
 *      the corrections — so the only available response is "more gates", when the
 *      cheaper fix might be a model-tier change on one agent.
 *
 * This reads the delegation log and reports the rate split by model and by agent.
 * If one tier carries most of the corrections, that is a config change, not an
 * engineering program — and it is the least expensive experiment available.
 *
 *   node delegation-metrics.mjs [--log=docs/work/DELEGATION_LOG.md] [--json]
 *
 * Expected row format (markdown table or one entry per line), tolerant of column
 * order — it keys off the header when there is one:
 *
 *   | ticket | agent | model | outcome | notes |
 *
 * outcome is matched case-insensitively: DONE/ACCEPT/PASS count as accepted;
 * REDO/REVISE/FAIL/REJECT count as corrections; PENDING/WIP are excluded from
 * the denominator rather than silently counted as successes.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const ROOT = process.cwd();
const LOG = (() => {
  const l = opt("log", join("docs", "work", "DELEGATION_LOG.md"));
  return isAbsolute(l) ? l : join(ROOT, l);
})();

const ACCEPTED = /^(done|accept(ed)?|pass(ed)?|ok|merged)$/i;
const CORRECTION = /^(redo|revise[d]?|fail(ed)?|reject(ed)?|blocked)$/i;
const EXCLUDED = /^(pending|wip|in.?flight|in.?progress)$/i;

function parse(text) {
  const rows = [];
  let cols = null;
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (!cells.length) continue;
    if (/^-+$/.test(cells[0].replace(/[:\s]/g, ""))) continue; // separator row
    const lower = cells.map((c) => c.toLowerCase());
    if (!cols && lower.some((c) => /outcome|status|result/.test(c))) {
      cols = {
        outcome: lower.findIndex((c) => /outcome|status|result/.test(c)),
        model: lower.findIndex((c) => /model/.test(c)),
        agent: lower.findIndex((c) => /agent|specialist|delegate/.test(c)),
        ticket: lower.findIndex((c) => /ticket|id|task/.test(c)),
      };
      continue;
    }
    if (!cols || cols.outcome < 0) continue;
    rows.push({
      ticket: cols.ticket >= 0 ? cells[cols.ticket] : "",
      agent: cols.agent >= 0 ? cells[cols.agent] || "(unrecorded)" : "(unrecorded)",
      model: cols.model >= 0 ? cells[cols.model] || "(unrecorded)" : "(unrecorded)",
      outcome: cells[cols.outcome] ?? "",
    });
  }
  return { rows, cols };
}

function tally(rows, key) {
  const by = new Map();
  for (const r of rows) {
    const k = r[key] || "(unrecorded)";
    if (!by.has(k)) by.set(k, { accepted: 0, corrections: 0 });
    const t = by.get(k);
    if (ACCEPTED.test(r.outcome)) t.accepted++;
    else if (CORRECTION.test(r.outcome)) t.corrections++;
  }
  return by;
}

function report(label, by) {
  const entries = [...by].filter(([, t]) => t.accepted + t.corrections > 0);
  if (!entries.length) return;
  entries.sort((a, b) => {
    const ra = a[1].corrections / (a[1].accepted + a[1].corrections);
    const rb = b[1].corrections / (b[1].accepted + b[1].corrections);
    return rb - ra;
  });
  console.log(`\nBy ${label}:`);
  console.log("  " + label.padEnd(26) + "n".padStart(5) + "corrections".padStart(14) + "  rate");
  console.log("  " + "─".repeat(60));
  for (const [k, t] of entries) {
    const n = t.accepted + t.corrections;
    const rate = ((t.corrections / n) * 100).toFixed(0);
    // A rate over a handful of samples is noise; say so rather than ranking on it.
    const note = n < 10 ? "  (n<10, not yet meaningful)" : "";
    console.log("  " + k.slice(0, 24).padEnd(26) + String(n).padStart(5) + String(t.corrections).padStart(14) + `  ${rate}%${note}`);
  }
}

if (!existsSync(LOG)) {
  console.error(`delegation-metrics: no log at ${LOG.replace(ROOT + "/", "")}`);
  console.error(`delegation-metrics: pass --log=<path>`);
  process.exit(2);
}

const { rows, cols } = parse(readFileSync(LOG, "utf8"));
if (!rows.length) {
  console.error(`delegation-metrics: no rows parsed from ${LOG.replace(ROOT + "/", "")}`);
  console.error(`  expected a markdown table with an outcome/status/result column`);
  process.exit(2);
}

const accepted = rows.filter((r) => ACCEPTED.test(r.outcome)).length;
const corrections = rows.filter((r) => CORRECTION.test(r.outcome)).length;
const excluded = rows.filter((r) => EXCLUDED.test(r.outcome)).length;
const scored = accepted + corrections;

if (argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        scored,
        accepted,
        corrections,
        excluded,
        correctionRate: scored ? corrections / scored : null,
        byModel: Object.fromEntries(tally(rows, "model")),
        byAgent: Object.fromEntries(tally(rows, "agent")),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(`${LOG.replace(ROOT + "/", "")} — ${rows.length} row(s)\n`);
console.log(`  scored          ${scored}`);
console.log(`  accepted        ${accepted}`);
console.log(`  corrections     ${corrections}`);
console.log(`  in flight       ${excluded}  (excluded from the denominator, not counted as passes)`);
console.log(
  `  correction rate ${scored ? ((corrections / scored) * 100).toFixed(1) : "—"}%`,
);

report("model", tally(rows, "model"));
report("agent", tally(rows, "agent"));

const unrecordedModel = rows.filter((r) => r.model === "(unrecorded)").length;
if (cols.model < 0 || unrecordedModel === rows.length) {
  console.log(
    `\nNo model column in the log, so the split above cannot be produced.\n` +
      `Add one: the aggregate rate says corrections happen, not where they come from,\n` +
      `and a tier change on one agent is a far cheaper remedy than another gate.`,
  );
} else if (unrecordedModel) {
  console.log(`\n${unrecordedModel} row(s) have no model recorded — that many are invisible to the split.`);
}
