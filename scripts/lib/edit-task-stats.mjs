/**
 * edit-task-stats.mjs — analysis for the gateguard A/B (Group K2). Pure; seeded.
 * Rows: { task, kind, arm, run, pass, edited?, fired?, traced?, durationMs, gamed?, infra?, timedOut? }.
 * Unit of analysis is the TASK (paired across arms), not the run: runs of one task are not independent.
 * A run counts only if it is VALID: not gamed and not an infrastructure failure (dead model server etc.).
 */
import { createHash } from "node:crypto";

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const valid = (r) => !r.gamed && !r.infra;

export function assertNoDuplicates(rows) {
  const seen = new Set();
  for (const r of rows) {
    const k = `${r.task}|${r.arm}|${r.run}`;
    if (seen.has(k)) throw new Error(`duplicate result row ${k}: a re-run must resume, not append`);
    seen.add(k);
  }
}

/** per-task pass fraction for an arm over VALID runs; editedOnly conditions on "the agent attempted a write" (same rule for every arm) */
export function taskRates(rows, arm, { editedOnly = false } = {}) {
  const by = new Map();
  for (const r of rows.filter((r) => r.arm === arm && valid(r) && (!editedOnly || r.edited))) {
    if (!by.has(r.task)) by.set(r.task, { kind: r.kind, pass: 0, n: 0 });
    const t = by.get(r.task); t.n++; t.pass += r.pass ? 1 : 0;
  }
  return new Map([...by].map(([k, v]) => [k, { kind: v.kind, rate: v.pass / v.n, n: v.n }]));
}

export function pairedDeltas(rows, x, y, { kind, editedOnly = false } = {}) {
  const rx = taskRates(rows, x, { editedOnly }), ry = taskRates(rows, y, { editedOnly });
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
  let s = 0; for (let i = 0; i <= Math.min(k, n - k); i++) s += c(n, i);
  return { n, p: Math.min(1, (2 * s) / 2 ** n) };
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
const summarize = (deltas) => ({ ...bootstrapCI(deltas), sign: signTest(deltas), tasks: deltas.length });

/** Paired per-task median duration ratio (timed-out runs excluded: their duration is censored). */
function overheadOf(rows, arm, base) {
  const dur = (a, t) => median(rows.filter((r) => r.arm === a && r.task === t && valid(r) && !r.timedOut && r.durationMs > 0).map((r) => r.durationMs));
  const ratios = [...new Set(rows.map((r) => r.task))].map((t) => dur(arm, t) / dur(base, t) - 1).filter(Number.isFinite);
  return ratios.length ? median(ratios) : NaN;
}

/**
 * Pre-registered flip rule (docs/work/GROUP_K_DESIGN.md K2). Verdicts:
 *   INVALID       the experiment did not measure the treatment (gate never fired / no traces / infra failures / gamed)
 *   INSUFFICIENT  not enough tasks or valid runs to decide
 *   FLIP | STAY_OPT_IN
 */
export function evaluate(rows, { isolatedMargin = -0.05, maxOverhead = 0.25, minRuns = 5, minFireRate = 0.8, maxInfra = 0.2, alpha = 0.05,
  minTasks = { total: 16, "multi-module": 6, isolated: 4, "reuse-trap": 4 } } = {}) {
  assertNoDuplicates(rows);
  const report = { runs: rows.length, gamedRuns: rows.filter((r) => r.gamed).length, infraRuns: rows.filter((r) => r.infra).length };
  const arms = [...new Set(rows.map((r) => r.arm))];
  const tasks = [...new Set(rows.map((r) => r.task))];
  const kindOf = (t) => rows.find((r) => r.task === t)?.kind;
  report.fireRateB = (() => { const b = rows.filter((r) => r.arm === "B" && valid(r)); return b.length ? b.filter((r) => r.fired).length / b.length : NaN; })();
  report.traceRate = (() => { const v = rows.filter(valid); return v.length ? v.filter((r) => r.traced).length / v.length : NaN; })();

  // INVALID first: a run of the wrong experiment must never read as "the gate does not help".
  const why = [];
  if (!["A", "B", "C", "D"].every((a) => arms.includes(a))) why.push(`arms missing (have ${arms.join(",")}); B-D and B-C cannot be judged`);
  if (report.infraRuns / rows.length > maxInfra) why.push(`${report.infraRuns}/${rows.length} runs were infrastructure failures (agent exit != 0 / timeout)`);
  if (!(report.fireRateB >= minFireRate)) why.push(`gate fire rate on arm B is ${Number.isFinite(report.fireRateB) ? (report.fireRateB * 100).toFixed(0) : "n/a"}% (need >=${minFireRate * 100}%): the plugin was probably not loaded`);
  if (!(report.traceRate >= minFireRate)) why.push(`only ${Number.isFinite(report.traceRate) ? (report.traceRate * 100).toFixed(0) : "n/a"}% of valid runs produced trace rows: the plugin was not loaded in every arm`);
  if (rows.length && rows.every((r) => r.gamed)) why.push("every run was gamed");
  if (why.length) { report.verdict = "INVALID"; report.note = why.join("; "); return report; }

  const validCount = (arm, task) => rows.filter((r) => r.arm === arm && r.task === task && valid(r)).length;
  const kinds = { total: tasks.length };
  for (const k of ["multi-module", "isolated", "reuse-trap"]) kinds[k] = tasks.filter((t) => kindOf(t) === k).length;
  const shortKinds = Object.entries(minTasks).filter(([k, n]) => kinds[k] < n).map(([k, n]) => `${k} ${kinds[k]}/${n}`);
  const thin = tasks.filter((t) => ["A", "B", "C", "D"].some((a) => validCount(a, t) < minRuns));
  if (shortKinds.length || thin.length) {
    report.verdict = "INSUFFICIENT";
    report.note = [shortKinds.length ? `task minimums not met: ${shortKinds.join(", ")}` : "", thin.length ? `${thin.length} task(s) have <${minRuns} valid runs in some arm` : ""].filter(Boolean).join("; ");
    return report;
  }

  for (const [mode, opts] of [["itt", {}], ["editedOnly", { editedOnly: true }]]) {
    report[mode] = {
      multi: summarize(D(rows, "B", "A", { kind: "multi-module", ...opts })),
      isolated: summarize(D(rows, "B", "A", { kind: "isolated", ...opts })),
      reuse: summarize(D(rows, "B", "A", { kind: "reuse-trap", ...opts })),
    };
  }
  report.BminusD = summarize(D(rows, "B", "D"));
  report.BminusC = summarize(D(rows, "B", "C"));
  report.overhead = overheadOf(rows, "B", "A");
  const itt = report.itt;
  const liftOk = itt.multi.lo > 0 && itt.multi.sign.p <= alpha;
  const pass = liftOk && itt.isolated.mean >= isolatedMargin && report.overhead <= maxOverhead;
  const agrees = (report.editedOnly.multi.lo > 0) === (itt.multi.lo > 0);
  report.verdict = pass && agrees ? "FLIP" : "STAY_OPT_IN";
  report.note = pass && !agrees ? "ITT passes but edited-only disagrees: not a flip" : undefined;
  return report;
}
