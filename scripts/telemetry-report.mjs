#!/usr/bin/env node
// telemetry-report.mjs — analyze docs/work/telemetry.jsonl (plan 4.12).
//
// Turns logged actuals into the numbers the protocols currently hand-wave:
// per-agent/per-model token distributions (tune CONTEXT_BUDGET tier tables),
// node durations (tune run-plan TIMEOUTS), retry/escalation rates (tune the
// escalation ladder), and validator pass rates.
//
// Usage:
//   node scripts/telemetry-report.mjs [path/to/telemetry.jsonl] [--json] [--days N]
//
// Rows come from three sources:
//   plugin    — real token counts/cost per assistant message (opencode plugin)
//   run-plan  — per-node status/attempts/duration (estimates marked _est)
//   evals     — per-agent-check pass/fail/duration
//   validator — per-validator gaps/exit

import { existsSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const DAYS = argv.includes('--days') ? Number(argv[argv.indexOf('--days') + 1]) : null;
const FILE = argv.find((a) => !a.startsWith('--') && a !== String(DAYS)) || 'docs/work/telemetry.jsonl';

if (!existsSync(FILE)) {
  console.error(`telemetry-report: no data at ${FILE} — telemetry rows appear after agent sessions (plugin), run-plan nodes, evals, or validator runs.`);
  process.exit(2);
}

const cutoff = DAYS ? Date.now() - DAYS * 86_400_000 : 0;
const rows = readFileSync(FILE, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
  try { return [JSON.parse(l)]; } catch { return []; }
}).filter((r) => !cutoff || Date.parse(r.ts) >= cutoff);

const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
const stats = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  return { n: s.length, p50: pct(s, 50), p95: pct(s, 95), max: s[s.length - 1] ?? 0, sum: s.reduce((a, b) => a + b, 0) };
};
const groupBy = (arr, key) => arr.reduce((m, r) => ((m[key(r)] ??= []).push(r), m), {});

const report = { file: FILE, rows: rows.length, window: DAYS ? `last ${DAYS}d` : 'all', sections: {} };

// ── plugin rows: real tokens per agent×model ─────────────────────────────
const plugin = rows.filter((r) => r.source === 'plugin');
if (plugin.length) {
  report.sections.messages = Object.entries(groupBy(plugin, (r) => `${r.agent ?? '?'} @ ${r.model}`)).map(([k, g]) => {
    const tin = stats(g.map((r) => r.tokens_in ?? 0));
    const tout = stats(g.map((r) => r.tokens_out ?? 0));
    const dur = stats(g.map((r) => r.duration_ms ?? 0));
    return {
      group: k, messages: g.length,
      in_p50: tin.p50, in_p95: tin.p95, in_total: tin.sum,
      out_p50: tout.p50, out_p95: tout.p95, out_total: tout.sum,
      cache_read: g.reduce((a, r) => a + (r.cache_read ?? 0), 0),
      cost: Number(g.reduce((a, r) => a + (r.cost ?? 0), 0).toFixed(4)),
      ms_p50: dur.p50, ms_p95: dur.p95,
      errors: g.filter((r) => r.error).length,
    };
  }).sort((a, b) => b.messages - a.messages);
}

// ── run-plan rows: node outcomes per agent×tier ──────────────────────────
const planRows = rows.filter((r) => r.source === 'run-plan');
if (planRows.length) {
  report.sections.nodes = Object.entries(groupBy(planRows, (r) => `${r.agent} @ tier=${r.tier}`)).map(([k, g]) => {
    const done = g.filter((r) => r.status === 'done');
    const dur = stats(done.map((r) => r.duration_s ?? 0));
    return {
      group: k, nodes: g.length, done: done.length,
      escalated: g.filter((r) => r.status === 'escalated').length,
      retry_rate: Number((g.reduce((a, r) => a + Math.max(0, (r.attempts ?? 1) - 1), 0) / g.length).toFixed(2)),
      s_p50: dur.p50, s_p95: dur.p95, s_max: dur.max,
      out_est_p95: stats(done.map((r) => r.tokens_out_est ?? 0)).p95,
    };
  }).sort((a, b) => b.nodes - a.nodes);
}

// ── evals rows ───────────────────────────────────────────────────────────
const evalRows = rows.filter((r) => r.source === 'evals');
if (evalRows.length) {
  report.sections.evals = Object.entries(groupBy(evalRows, (r) => r.agent)).map(([k, g]) => ({
    agent: k, runs: g.length,
    pass: g.filter((r) => r.status === 'PASS').length,
    fail: g.filter((r) => r.status === 'FAIL').length,
    timeout: g.filter((r) => r.status === 'TIMEOUT').length,
    duration_ms_p95: stats(g.map((r) => r.duration_ms ?? 0)).p95,
  }));
}

// ── validator rows ───────────────────────────────────────────────────────
const valRows = rows.filter((r) => r.source === 'validator');
if (valRows.length) {
  report.sections.validators = Object.entries(groupBy(valRows, (r) => r.validator)).map(([k, g]) => ({
    validator: k, runs: g.length,
    clean: g.filter((r) => r.exit === 0).length,
    gapped: g.filter((r) => r.exit !== 0).length,
    gaps_p95: stats(g.map((r) => r.gaps ?? 0)).p95,
  })).sort((a, b) => b.runs - a.runs);
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`telemetry-report — ${report.rows} rows (${report.window}) from ${FILE}\n`);
  const table = (title, items) => {
    if (!items?.length) return;
    console.log(`## ${title}`);
    console.table(items);
  };
  table('Assistant messages (real tokens — plugin)', report.sections.messages);
  table('run-plan nodes', report.sections.nodes);
  table('Eval agent checks', report.sections.evals);
  table('Validators', report.sections.validators);
  console.log('Use: p95 tokens_out per agent → CONTEXT_BUDGET/plan max_tokens_est; p95 duration → run-plan TIMEOUTS; retry/escalation rates → escalation ladder thresholds.');
}
