/**
 * edit-task-stats.mjs — analysis for the gateguard A/B (Group K2). Pure; seeded.
 * Rows: { task, kind, arm, run, pass, fired, durationMs, gamed }.
 * Unit of analysis is the TASK (paired across arms), not the run: runs of one task are not independent.
 */
import { createHash } from "node:crypto";

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };

/** per-task pass fraction for an arm (gamed runs excluded and counted; optional fired-only filter for gated arms) */
export function taskRates(rows, arm, { firedOnly = false } = {}) {
  const by = new Map();
  for (const r of rows.filter((r) => r.arm === arm && !r.gamed && (!firedOnly || r.fired))) {
    if (!by.has(r.task)) by.set(r.task, { kind: r.kind, pass: 0, n: 0 });
    const t = by.get(r.task); t.n++; t.pass += r.pass ? 1 : 0;
  }
  return new Map([...by].map(([k, v]) => [k, { kind: v.kind, rate: v.pass / v.n, n: v.n }]));
}

/** paired per-task deltas (x − y) over tasks present in both arms, optionally within one kind */
export function pairedDeltas(rows, x, y, { kind, firedOnly = false } = {}) {
  const rx = taskRates(rows, x, { firedOnly }), ry = taskRates(rows, y);
  const out = [];
  for (const [task, a] of rx) { const b = ry.get(task); if (b && (!kind || a.kind === kind)) out.push({ task, delta: a.rate - b.rate }); }
  return out;
}

/** exact two-sided sign test on non-zero deltas */
export function signTest(deltas) {
  const nz = deltas.filter((d) => d !== 0);
  const n = nz.length, k = nz.filter((d) => d > 0).length;
  if (!n) return { n: 0, p: 1 };
  const c = (m, i) => { let r = 1; for (let j = 1; j <= i; j++) r = (r * (m - i + j)) / j; return r; };
  const tail = (t) => { let s = 0; for (let i = 0; i <= t; i++) s += c(n, i); return s / 2 ** n; };
  return { n, p: Math.min(1, 2 * Math.min(tail(Math.min(k, n - k)), 1)) };
}

/** seeded bootstrap 95% CI of the mean of task deltas (resampling TASKS) */
export function bootstrapCI(deltas, { iters = 10000, seed = "k2" } = {}) {
  if (!deltas.length) return { lo: NaN, hi: NaN, mean: NaN };
  let h = createHash("sha256").update(seed).digest(), i = 0;
  const rnd = () => { if (i >= h.length - 4) { h = createHash("sha256").update(h).digest(); i = 0; } const v = h.readUInt32BE(i); i += 4; return v / 2 ** 32; };
  const means = [];
  for (let b = 0; b < iters; b++) { let s = 0; for (let j = 0; j < deltas.length; j++) s += deltas[Math.floor(rnd() * deltas.length)]; means.push(s / deltas.length); }
  means.sort((a, b) => a - b);
  return { lo: means[Math.floor(0.025 * iters)], hi: means[Math.floor(0.975 * iters) - 1], mean: mean(deltas) };
}

const D = (rows, x, y, o) => pairedDeltas(rows, x, y, o).map((d) => d.delta);

/** Pre-registered flip rule (docs/work/GROUP_K_DESIGN.md K2). */
export function evaluate(rows, { isolatedMargin = -0.05, maxOverhead = 0.25, minMulti = 6, minRuns = 5 } = {}) {
  const runsPerCell = (arm, task) => rows.filter((r) => r.arm === arm && r.task === task).length;
  const tasks = [...new Set(rows.map((r) => r.task))];
  const multi = tasks.filter((t) => rows.find((r) => r.task === t)?.kind === "multi-module");
  const enough = multi.length >= minMulti && tasks.every((t) => ["A", "B"].every((a) => runsPerCell(a, t) >= minRuns));
  const report = {};
  for (const [mode, opts] of [["itt", {}], ["firedOnly", { firedOnly: true }]]) {
    const bm = D(rows, "B", "A", { kind: "multi-module", ...opts }), bi = D(rows, "B", "A", { kind: "isolated", ...opts });
    report[mode] = {
      multi: { ...bootstrapCI(bm), sign: signTest(bm), tasks: bm.length },
      isolated: { ...bootstrapCI(bi), sign: signTest(bi), tasks: bi.length },
    };
  }
  const dur = (arm) => median(rows.filter((r) => r.arm === arm && r.durationMs).map((r) => r.durationMs));
  const overhead = dur("B") / dur("A") - 1;
  report.BminusD = bootstrapCI(D(rows, "B", "D"));
  report.BminusC = bootstrapCI(D(rows, "B", "C"));
  report.overhead = overhead;
  report.gamedRuns = rows.filter((r) => r.gamed).length;
  const itt = report.itt;
  const pass = itt.multi.lo > 0 && itt.isolated.mean >= isolatedMargin && overhead <= maxOverhead;
  const agrees = report.firedOnly.multi.lo > 0 === itt.multi.lo > 0;
  report.verdict = !enough ? "INSUFFICIENT" : pass && agrees ? "FLIP" : "STAY_OPT_IN";
  report.note = !enough ? `need >=${minMulti} multi-module tasks and >=${minRuns} runs per cell per arm`
    : pass && !agrees ? "ITT passes but fired-only disagrees: not a flip" : undefined;
  return report;
}
