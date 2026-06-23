#!/usr/bin/env node
// eval-compare.mjs — tiered lift / gap / cost analysis over labeled run-evals runs.
//
// Answers ch.06's evaluation question: "did the scaffold help, how big is the gap
// to frontier, and is it worth the cost?" — measured, not vibes.
//
// Workflow:
//   1. Run the suite once per cell, labeled:
//        node scripts/run-evals.mjs --agent --label frontier      # .model-context = a frontier model
//        node scripts/run-evals.mjs --agent --label local         # .model-context = a local model (scaffolded)
//        node scripts/run-evals.mjs --bare  --label local-bare    # (future) same model, no agent scaffold
//      Each writes docs/work/eval-runs/<label>.json.
//   2. Compare:
//        node scripts/eval-compare.mjs --frontier frontier --local local [--bare local-bare] [--json]
//
//   lift = pass-rate(local scaffolded) − pass-rate(bare)      → what the scaffold buys
//   gap  = pass-rate(frontier) − pass-rate(local scaffolded)  → what's left to frontier
//   cost = tokens/duration per cell                           → is the scaffold worth it
//
// Per-horizon (short/medium/long) too, because the gap widens with task length.
//
// Usage: eval-compare.mjs [--frontier L] [--local L] [--bare L] [--runs <dir>] [--json] [--self-test]
// Exit 0 ok / 1 self-test fail or no runs / 2 invocation error.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const JSON_OUT = argv.includes('--json');
const SELF_TEST = argv.includes('--self-test');
const RUNS_DIR = flag('--runs') || join(REPO, 'docs', 'work', 'eval-runs');
const ROLES = { bare: flag('--bare'), local: flag('--local'), frontier: flag('--frontier') };

const nz = (x) => (x == null ? 0 : x);
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

function passRate(summary, pred) {
  const rows = (summary.results || []).filter((r) => pred(r) && r.status !== 'SKIP');
  if (!rows.length) return null;
  return rows.filter((r) => r.status === 'PASS').length / rows.length;
}

function analyze(summaries, roles) {
  const byLabel = Object.fromEntries(summaries.map((s) => [s.label, s]));
  const hz = [...new Set(summaries.flatMap((s) => (s.results || []).map((r) => r.horizon || 'unknown')))].sort();
  const overall = {};
  const perHorizon = {};
  for (const s of summaries) overall[s.label] = passRate(s, () => true);
  for (const h of hz) {
    perHorizon[h] = {};
    for (const s of summaries) perHorizon[h][s.label] = passRate(s, (r) => (r.horizon || 'unknown') === h);
  }
  const cost = Object.fromEntries(
    summaries.map((s) => [s.label, s.costEst || { durationMs: 0, tokensOutEst: 0 }]),
  );
  const pr = (label, h) =>
    label && byLabel[label] ? (h ? perHorizon[h][label] : overall[label]) : null;
  const comp = (h) => {
    const out = {};
    if (roles.bare && roles.local && byLabel[roles.bare] && byLabel[roles.local])
      out.lift = nz(pr(roles.local, h)) - nz(pr(roles.bare, h));
    if (roles.frontier && roles.local && byLabel[roles.frontier] && byLabel[roles.local])
      out.gap = nz(pr(roles.frontier, h)) - nz(pr(roles.local, h));
    return out;
  };
  const deltas = { overall: comp(null), perHorizon: Object.fromEntries(hz.map((h) => [h, comp(h)])) };
  return { labels: summaries.map((s) => s.label), horizons: hz, overall, perHorizon, cost, deltas, roles };
}

function render(a) {
  const L = a.labels;
  const lines = ['# Eval comparison — lift / gap / cost', ''];
  lines.push('| Scope | ' + L.join(' | ') + (a.roles.local ? ' | lift | gap' : '') + ' |');
  lines.push('|' + '---|'.repeat(L.length + 1 + (a.roles.local ? 2 : 0)));
  const row = (scope, prByLabel, d) =>
    `| ${scope} | ` + L.map((l) => pct(prByLabel[l])).join(' | ') +
    (a.roles.local ? ` | ${d?.lift != null ? pct(d.lift) : '—'} | ${d?.gap != null ? pct(d.gap) : '—'}` : '') + ' |';
  lines.push(row('overall', a.overall, a.deltas.overall));
  for (const h of a.horizons) lines.push(row(`horizon: ${h}`, a.perHorizon[h], a.deltas.perHorizon[h]));
  lines.push('', '## Cost per cell', '', '| Label | agent duration | tokens out (est) |', '|---|---|---|');
  for (const l of L) lines.push(`| ${l} | ${Math.round((a.cost[l].durationMs || 0) / 1000)}s | ${a.cost[l].tokensOutEst || 0} |`);
  if (a.roles.local) {
    lines.push('', '> **lift** = local-scaffolded − bare (what the scaffold buys). **gap** = frontier − local-scaffolded (what is left). Read cost beside lift: a scaffold that costs more inference than the gap it closes is not worth it on paid APIs (free on owned hardware — see book ch. 06).');
  }
  return lines.join('\n') + '\n';
}

function loadRuns(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .filter((s) => s && s.label);
}

function selfTest() {
  const mk = (label, rows, cost) => ({ label, costEst: cost, results: rows.map(([horizon, status]) => ({ horizon, status })) });
  const summaries = [
    mk('bare', [['short', 'PASS'], ['medium', 'FAIL'], ['long', 'FAIL']], { durationMs: 1000, tokensOutEst: 100 }),
    mk('local', [['short', 'PASS'], ['medium', 'PASS'], ['long', 'FAIL']], { durationMs: 4000, tokensOutEst: 400 }),
    mk('frontier', [['short', 'PASS'], ['medium', 'PASS'], ['long', 'PASS']], { durationMs: 9000, tokensOutEst: 900 }),
  ];
  const a = analyze(summaries, { bare: 'bare', local: 'local', frontier: 'frontier' });
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  const checks = [
    ['overall bare = 1/3', near(a.overall.bare, 1 / 3)],
    ['overall local = 2/3', near(a.overall.local, 2 / 3)],
    ['overall lift = 1/3', near(a.deltas.overall.lift, 1 / 3)],
    ['overall gap = 1/3', near(a.deltas.overall.gap, 1 / 3)],
    ['medium lift = 1 (bare FAIL→local PASS)', near(a.deltas.perHorizon.medium.lift, 1)],
    ['long gap = 1 (local FAIL→frontier PASS)', near(a.deltas.perHorizon.long.gap, 1)],
    ['cost carried', a.cost.local.tokensOutEst === 400],
    ['render is non-empty', render(a).length > 50],
  ];
  let ok = true;
  for (const [name, pass] of checks) { console.log(`  [${pass ? 'ok' : 'FAIL'}] ${name}`); if (!pass) ok = false; }
  console.log(ok ? 'eval-compare self-test: PASS' : 'eval-compare self-test: FAIL');
  process.exit(ok ? 0 : 1);
}

if (SELF_TEST) selfTest();

const summaries = loadRuns(RUNS_DIR);
if (!summaries.length) {
  console.error(`eval-compare: no labeled runs in ${RUNS_DIR} — run \`run-evals.mjs --agent --label <name>\` per cell first.`);
  process.exit(1);
}
const a = analyze(summaries, ROLES);
const report = render(a);
mkdirSync(join(REPO, 'docs', 'work'), { recursive: true });
writeFileSync(join(REPO, 'docs', 'work', 'EVAL_COMPARE.md'), report);
if (JSON_OUT) console.log(JSON.stringify(a, null, 2));
else console.log(report);
