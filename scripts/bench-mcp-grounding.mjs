#!/usr/bin/env node
// bench-mcp-grounding.mjs — does giving a local model web/context7 access make it
// BETTER, or just SLOWER?
//
// Companion to bench-model-compare.mjs. That harness measures the model; this one
// measures the model's *tool discipline*: when the answer requires grounding in
// external docs, does it reach for MCP, reach efficiently, and get it right — and
// what does the round trip cost in wall-clock?
//
// Why this is its own script: tier B uses 4 synthetic tools. A real opencode
// session exposes ~80 (5 MCP servers). Selection under 80 tools is a different
// problem than selection under 4, and it is the one that actually runs.
//
// Metrics per run: correct?, total tool calls, MCP calls, FAILED calls, seconds.
// Failed calls matter — a model that reaches for a tool that errors and then
// flails costs time without buying accuracy.
//
// Usage: node scripts/bench-mcp-grounding.mjs --models a,b [--repeats 3]

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const REPO = join(dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const MODELS = (flag('--models') || '').split(',').filter(Boolean);
const REPEATS = Number(flag('--repeats', '3'));
const PROVIDER = flag('--provider', 'lmstudio');
if (MODELS.length < 1) { console.error('usage: --models a,b [--repeats N]'); process.exit(2); }

// Grounding tasks: each has a verifiable right answer that a model may or may not
// recall correctly, and which external docs settle definitively.
const TASKS = [
  {
    id: 'sqlite3-paramstyle',
    prompt: 'Look up the current documentation for the Python sqlite3 module and tell me exactly which PEP 249 paramstyle it uses and the placeholder character. Cite the source you consulted.',
    // qmark / "?" is correct; "%s" is the classic wrong answer (that's psycopg2).
    correct: (t) => /qmark/i.test(t) && /\?/.test(t) && !/%s/.test(t),
  },
  {
    id: 'flask-route-methods',
    prompt: 'Look up the current Flask documentation and state exactly how to allow both GET and POST on a single route decorator. Cite the source you consulted.',
    correct: (t) => /methods\s*=\s*\[[^\]]*['"]POST['"]/i.test(t) && /route/i.test(t),
  },
];

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const count = (s, re) => (s.match(re) || []).length;

const dir = join(REPO, '.tmp-bench', 'grounding');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const rows = [];
for (const model of MODELS) {
  for (const task of TASKS) {
    for (let i = 0; i < REPEATS; i++) {
      process.stderr.write(`${model} / ${task.id} [${i + 1}/${REPEATS}]…\n`);
      const t0 = performance.now();
      const r = spawnSync('opencode', ['run', '--dir', dir, '-m', `${PROVIDER}/${model}`, task.prompt],
        { encoding: 'utf8', timeout: 900000, stdio: ['ignore', 'pipe', 'pipe'] });
      const secs = +((performance.now() - t0) / 1000).toFixed(1);
      const out = strip(`${r.stdout || ''}${r.stderr || ''}`);
      rows.push({
        model, task: task.id, repeat: i + 1, secs,
        correct: task.correct(out),
        tools: count(out, /^\s*[⚙✱→✗↓]\s*\S+/gm),
        mcp: count(out, /^\s*[⚙✗]\s*\S+/gm),
        failed: count(out, /^\s*✗\s*\S+/gm),
      });
      const l = rows.at(-1);
      process.stderr.write(`   correct=${l.correct} tools=${l.tools} mcp=${l.mcp} failed=${l.failed} ${l.secs}s\n`);
    }
  }
}

writeFileSync(join(REPO, 'docs/work/BENCH_MCP_GROUNDING.json'),
  `${JSON.stringify({ generated: new Date().toISOString(), repeats: REPEATS, rows }, null, 2)}\n`);

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
console.log('\nmodel                     task                  correct  tools(med)  mcp(med)  failed  secs(med)  total_s');
for (const model of MODELS) {
  for (const task of TASKS) {
    const g = rows.filter((r) => r.model === model && r.task === task.id);
    if (!g.length) continue;
    console.log(
      `${model.padEnd(25)} ${task.id.padEnd(21)} ${String(g.filter((r) => r.correct).length + '/' + g.length).padEnd(8)} ` +
      `${String(med(g.map((r) => r.tools))).padEnd(11)} ${String(med(g.map((r) => r.mcp))).padEnd(9)} ` +
      `${String(g.reduce((a, r) => a + r.failed, 0)).padEnd(7)} ${String(med(g.map((r) => r.secs))).padEnd(10)} ` +
      `${g.reduce((a, r) => a + r.secs, 0).toFixed(1)}`);
  }
  const all = rows.filter((r) => r.model === model);
  console.log(`${''.padEnd(25)} ${'— ALL —'.padEnd(21)} ${String(all.filter((r) => r.correct).length + '/' + all.length).padEnd(8)} ` +
    `${''.padEnd(11)} ${''.padEnd(9)} ${String(all.reduce((a, r) => a + r.failed, 0)).padEnd(7)} ${''.padEnd(10)} ` +
    `${all.reduce((a, r) => a + r.secs, 0).toFixed(1)}`);
}
