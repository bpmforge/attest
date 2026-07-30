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
 *
 * LEAD-FIXED is a correction too, and it is the one this metric was blindest to.
 * Field trace 2026-07 (downstream project): the lead repeatedly closed a specialist's gaps
 * itself — "I already know exactly what's needed and it's mechanical, I'll close
 * these directly rather than a round-trip", "~90% correct though — I'll finish
 * the small remaining gaps directly rather than risk another confused
 * round-trip", "both small/mechanical — lead fixed directly" — and logged the
 * row DONE. Rework happened; only the identity of who did it changed. Logging it
 * as accepted made the models generating the most rework look the cleanest,
 * which is precisely backwards for a metric whose stated purpose is "if one tier
 * carries most of the corrections, that is a config change, not an escalation".
 * DONE-LEAD-FIXED / LEAD-FIXED counts as a correction AND is reported as its own
 * subtotal, because "the specialist got another attempt" and "the lead silently
 * finished the work" call for different remedies.
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
// Absorbed-by-lead. Separate pattern so it can be counted twice: once as a
// correction (it is one) and once as its own subtotal (it means something else).
const LEAD_FIXED = /^(done.?lead.?fixed|lead.?fixed|accepted.?with.?lead.?fix)$/i;
const isCorrection = (o) => CORRECTION.test(o) || LEAD_FIXED.test(o);

// The outcome column is self-reported, so a lead that absorbs work and writes a
// plain DONE bypasses the count entirely. What saves us is that leads DESCRIBE
// what they did: all three absorptions in the 2026-07 trace were self-narrated
// ("I'll close these directly rather than a round-trip", "I'll finish the small
// remaining gaps directly", "both small/mechanical — lead fixed directly"). An
// accepted row whose own notes say the lead did the work is a mislabelled row,
// and that is mechanically checkable against the artifact — no judgement needed.
// Distinctive lead-absorption phrasings only. Deliberately NOT a bare "I fixed":
// the notes column can carry the specialist's own words, and "fixed the failing
// test" is ordinary specialist work, not absorption. A false positive here is a
// warning asking you to check a row, so the pattern leans specific over eager.
const LEAD_DID_IT = new RegExp(
  [
    "lead[- ]?fix",                                    // "lead fixed directly"
    "fix(?:ed|ing)? (?:it|them|these|those) (?:my|our)self", // "fixed them myself"
    "clos(?:e|ed|ing) (?:it|them|these|those) directly", // "close these directly"
    "finish(?:ed|ing)? the (?:small |remaining )*gaps?", // "finish the small remaining gaps"
    "did it myself",
    "rather than .{0,40}round.?trip",                  // "...rather than risk another confused round-trip"
    "instead of (?:a |another )?round.?trip",
  ].join("|"),
  "i",
);
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
      // The whole row, minus the outcome cell. The mislabel check below scans
      // this rather than a named notes column: the canonical log template
      // (GATE_SCORING_PROTOCOL Step 5) puts the self-description in a trailing
      // notes column with no header this parser keys off, and a lead may just as
      // easily narrate the absorption in the task-summary cell.
      raw: cells.filter((_, i) => i !== cols.outcome).join(" | "),
    });
  }
  return { rows, cols };
}

function tally(rows, key) {
  const by = new Map();
  for (const r of rows) {
    const k = r[key] || "(unrecorded)";
    if (!by.has(k)) by.set(k, { accepted: 0, corrections: 0, leadFixed: 0 });
    const t = by.get(k);
    if (ACCEPTED.test(r.outcome)) t.accepted++;
    else if (isCorrection(r.outcome)) {
      t.corrections++;
      if (LEAD_FIXED.test(r.outcome)) t.leadFixed++;
    }
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
    let note = n < 10 ? "  (n<10, not yet meaningful)" : "";
    // Surfaced inline: a key whose corrections are mostly lead-fixed is not a
    // specialist that keeps failing, it is one whose work keeps getting quietly
    // finished — a routing/scoping signal, not a gate signal.
    if (t.leadFixed > 0) note += `  (${t.leadFixed} lead-fixed)`;
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
const corrections = rows.filter((r) => isCorrection(r.outcome)).length;
const leadFixed = rows.filter((r) => LEAD_FIXED.test(r.outcome)).length;
const mislabelled = rows.filter(
  (r) => ACCEPTED.test(r.outcome) && LEAD_DID_IT.test(r.raw ?? ""),
);
const excluded = rows.filter((r) => EXCLUDED.test(r.outcome)).length;
const scored = accepted + corrections;

if (argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        scored,
        accepted,
        corrections,
        leadFixed,
        mislabelled: mislabelled.length,
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
console.log(
  `  ├─ lead-fixed   ${leadFixed}` +
    (leadFixed > 0
      ? "  (the lead closed the gap itself — rework that used to log as DONE)"
      : ""),
);
console.log(`  in flight       ${excluded}  (excluded from the denominator, not counted as passes)`);
console.log(
  `  correction rate ${scored ? ((corrections / scored) * 100).toFixed(1) : "—"}%`,
);

if (mislabelled.length) {
  console.log(
    `\n⚠ ${mislabelled.length} row(s) are marked accepted but their own notes say the lead\n` +
      `  did the work. Those are corrections — outcome DONE-LEAD-FIXED, not DONE.\n` +
      `  Counted as accepted here, so every rate below is flattered by them:`,
  );
  for (const r of mislabelled.slice(0, 10)) {
    console.log(`    ${r.agent} / ${r.model} — "${(r.raw ?? "").slice(0, 90)}"`);
  }
}

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
