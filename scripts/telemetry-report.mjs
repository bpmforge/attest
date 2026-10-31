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
//   stall     — sessions aborted by the harness stall guard (WP-X1) -> `## Stalls` section
//
// Not telemetry rows, read from disk when present (WP-A8) -> `## Scan & review scope` section:
//   docs/work/scan/*.json (collect.sh meta.scope / changed_files / carried_forward),
//   docs/reviews/INTEGRATION_SUMMARY_*.md (Scope: full|delta, reviewers reused),
//   docs/work/.integration-reviewed.json (per-reviewer watermark, `reused`).
// Manual run: node scripts/telemetry-report.mjs | grep -A12 'Scan & review scope'  (section is absent when no data).

import { existsSync, readFileSync, readdirSync } from 'node:fs';

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
      // Stream health: a provider that drops streams shows up as errors and
      // as finishes that are neither stop nor tool-calls; `length` is the
      // output cap. Both looked like "the agent is looping" in the TUI.
      finish_length: g.filter((r) => r.finish === 'length').length,
      finish_other: g.filter((r) => r.finish && !['stop', 'tool-calls', 'length'].includes(String(r.finish))).length,
    };
  }).sort((a, b) => b.messages - a.messages);

  // Per-model stream reliability, so a flaky provider is one line in the report.
  report.sections.stream_health = Object.entries(groupBy(plugin, (r) => r.model ?? '?')).map(([model, g]) => {
    const failed = g.filter((r) => r.error || (r.finish && !['stop', 'tool-calls'].includes(String(r.finish))));
    return {
      model, messages: g.length,
      failed: failed.length,
      failure_rate: Number((failed.length / g.length).toFixed(3)),
      errors: Object.fromEntries(Object.entries(groupBy(g.filter((r) => r.error), (r) => r.error)).map(([k, v]) => [k, v.length])),
      finish_length: g.filter((r) => r.finish === 'length').length,
      verdict: failed.length / g.length > 0.1 ? 'UNRELIABLE — route sdlc-lead / reviewer roles elsewhere (models.json) or raise the provider timeout'
        : failed.length ? 'occasional stream failures' : 'ok',
    };
  }).sort((a, b) => b.failure_rate - a.failure_rate);
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

// ── stall rows (WP-X1): sessions the harness stall guard aborted ─────────
// Rows: {source:"stall", session, turns, tokens_in_wasted, reason}. "Turns saved" is an estimate: the turns an
// un-guarded session would have kept spending, taken from the observed degenerate-run length (602-turn incident)
// minus the turns at abort, floored at 0 — a lower bound is not knowable, so treat it as indicative only.
const stallRows = rows.filter((r) => r.source === 'stall');
if (stallRows.length) {
  const REF_RUNAWAY_TURNS = 602;
  const perTurnIn = (r) => (r.turns > 0 ? (r.tokens_in_wasted ?? 0) / Math.min(r.turns, 6) : 0);
  report.sections.stalls = stallRows.map((r) => {
    const saved = Math.max(0, REF_RUNAWAY_TURNS - (r.turns ?? 0));
    return {
      session: r.session, aborted_at_turn: r.turns ?? 0, tokens_in_at_abort: r.tokens_in_wasted ?? 0,
      turns_saved_est: saved, tokens_saved_est: Math.round(saved * perTurnIn(r)), reason: r.reason ?? '',
    };
  });
  report.stall_summary = {
    sessions_aborted: stallRows.length,
    tokens_in_at_abort: stallRows.reduce((a, r) => a + (r.tokens_in_wasted ?? 0), 0),
    turns_saved_est: report.sections.stalls.reduce((a, r) => a + r.turns_saved_est, 0),
    tokens_saved_est: report.sections.stalls.reduce((a, r) => a + r.tokens_saved_est, 0),
  };
}

// ── scan & review scope (WP-A8): how much of the tree each scan/review actually covered ─────────────
// Sources are plain files, not telemetry rows; every read is best-effort and a missing dir/file is silent.
const safeJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const listDir = (d) => { try { return readdirSync(d).sort(); } catch { return []; } };
const count = (arr, key) => arr.reduce((m, r) => ((m[key(r)] = (m[key(r)] || 0) + 1), m), {});
const scanRuns = listDir('docs/work/scan').filter((f) => f.endsWith('.json')).flatMap((f) => {
  const m = safeJson(`docs/work/scan/${f}`)?.meta;
  if (!m || typeof m !== 'object' || !m.scope) return []; // ledger.json and foreign files carry no meta.scope
  const len = (v) => (Array.isArray(v) ? v.length : Number.isFinite(Number(v)) ? Number(v) : 0);
  return [{ file: f, scope: String(m.scope), changed_files: len(m.changed_files), carried_forward: len(m.carried_forward) }];
});
const summaries = listDir('docs/reviews').filter((f) => /^INTEGRATION_SUMMARY_.*\.md$/.test(f)).map((f) => {
  let txt = ''; try { txt = readFileSync(`docs/reviews/${f}`, 'utf8'); } catch { /* unreadable: counted as unknown */ }
  const sc = /^\W*Scope\W*:?\W*(full|delta)\b/im.exec(txt)?.[1]?.toLowerCase() ?? 'unknown';
  const ru = /reviewers reused:\s*([^)\n]+)/i.exec(txt)?.[1]?.trim();
  return { file: f, scope: sc, reused: !ru || /^none$/i.test(ru) ? 0 : ru.split(',').filter((x) => x.trim()).length };
});
const wmRaw = safeJson('docs/work/.integration-reviewed.json');
const watermark = wmRaw && typeof wmRaw === 'object'
  ? Object.entries(wmRaw).flatMap(([branch, rv]) => Object.entries(rv && typeof rv === 'object' ? rv : {}).map(([reviewer, e]) => ({ branch, reviewer, reused: !!e?.reused })))
  : [];
if (scanRuns.length || summaries.length || watermark.length) {
  report.sections.scan_review_scope = {
    scans: { total: scanRuns.length, by_scope: count(scanRuns, (r) => r.scope),
      changed_files: scanRuns.reduce((a, r) => a + r.changed_files, 0), carried_forward: scanRuns.reduce((a, r) => a + r.carried_forward, 0) },
    integration_summaries: { total: summaries.length, by_scope: count(summaries, (r) => r.scope), reviewers_reused: summaries.reduce((a, r) => a + r.reused, 0) },
    watermark: { reviewers_tracked: watermark.length, reused_at_last_run: watermark.filter((w) => w.reused).length },
    scan_files: scanRuns, summary_files: summaries,
  };
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
  table('Stream health per model (errors + non-stop finishes; >10% = UNRELIABLE)', report.sections.stream_health);
  table('run-plan nodes', report.sections.nodes);
  table('Eval agent checks', report.sections.evals);
  table('Validators', report.sections.validators);
  if (report.stall_summary) {
    console.log('## Stalls');
    console.log(`sessions aborted: ${report.stall_summary.sessions_aborted} | tokens_in at abort: ${report.stall_summary.tokens_in_at_abort} | turns saved (est, vs a ${602}-turn runaway): ${report.stall_summary.turns_saved_est} | tokens saved (est): ${report.stall_summary.tokens_saved_est}`);
    console.table(report.sections.stalls);
  }
  const srs = report.sections.scan_review_scope;
  if (srs) {
    console.log('## Scan & review scope');
    const fmt = (o) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(' ') || 'none';
    if (srs.scans.total) console.log(`scans (docs/work/scan): ${srs.scans.total} | ${fmt(srs.scans.by_scope)} | changed_files=${srs.scans.changed_files} carried_forward=${srs.scans.carried_forward}`);
    if (srs.integration_summaries.total) console.log(`integration reviews (INTEGRATION_SUMMARY): ${srs.integration_summaries.total} | ${fmt(srs.integration_summaries.by_scope)} | reviewers reused=${srs.integration_summaries.reviewers_reused}`);
    if (srs.watermark.reviewers_tracked) console.log(`watermark (.integration-reviewed.json): reviewers tracked=${srs.watermark.reviewers_tracked} | reused at last run=${srs.watermark.reused_at_last_run}`);
    if (srs.scan_files.length) console.table(srs.scan_files);
  }
  console.log('Use: p95 tokens_out per agent → CONTEXT_BUDGET/plan max_tokens_est; p95 duration → run-plan TIMEOUTS; retry/escalation rates → escalation ladder thresholds.');
}
