#!/usr/bin/env node
// eval-status.mjs — live fan-out tracker for an in-flight eval run.
//
// A coordinator agent (e.g. code-reviewer) spawns a cluster of sub-agents, and
// the parent's stdout goes quiet while they work — so the run can look stalled
// when it is actually busy. This reads the breadcrumbs that ARE emitted
// (telemetry.jsonl, one row per agent message; live `opencode run` processes)
// and renders the fan-out: which cell/agent is active, the sub-agent tree, and
// how long since the last sign of life.
//
// One-shot snapshot. For a live view: `while sleep 5; do clear; node scripts/eval-status.mjs; done`
// Args: [--since-min <n>=20]

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const sinceMin = Number(argv[argv.indexOf('--since-min') + 1]) || 20;
const now = Date.now();
const ageStr = (ms) => (ms < 90_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60000)}m`);

// ── 1. live `opencode run` processes — the actual fan-out right now ──────────
function liveProcs() {
  const r = spawnSync('ps', ['-axo', 'pid,etime,command'], { encoding: 'utf8' });
  return (r.stdout || '')
    .split('\n')
    .filter((l) => l.includes('opencode run') && !l.includes('eval-status'))
    .map((l) => {
      const m = l.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
      if (!m) return null;
      const cmd = m[3];
      const model = (cmd.match(/-m\s+(\S+)/) || [])[1] || '(default)';
      const agent = (cmd.match(/--agent\s+(\S+)/) || [])[1] || '?';
      const sub = !/-m\s/.test(cmd); // sub-agents are spawned without -m
      return { pid: m[1], etime: m[2], agent, model, sub };
    })
    .filter(Boolean);
}

// ── 2. telemetry — per-session agent fan-out within the window ───────────────
function telemetry() {
  const f = join(REPO, 'docs', 'work', 'telemetry.jsonl');
  if (!existsSync(f)) return { sessions: [], newestAgeMs: Infinity };
  const rows = readFileSync(f, 'utf8')
    .trim()
    .split('\n')
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((r) => r && r.source === 'plugin' && r.ts);
  const cutoff = now - sinceMin * 60_000;
  const recent = rows.filter((r) => new Date(r.ts).getTime() >= cutoff);
  const byId = new Map();
  for (const r of recent) {
    const s = byId.get(r.session) || { agents: new Map(), last: 0, tokensOut: 0 };
    const a = s.agents.get(r.agent) || { msgs: 0, tokensOut: 0, model: r.model };
    a.msgs++; a.tokensOut += r.tokens_out || 0;
    s.agents.set(r.agent, a);
    s.last = Math.max(s.last, new Date(r.ts).getTime());
    s.tokensOut += r.tokens_out || 0;
    byId.set(r.session, s);
  }
  const sessions = [...byId.entries()].sort((a, b) => b[1].last - a[1].last);
  const newestAgeMs = rows.length ? now - new Date(rows[rows.length - 1].ts).getTime() : Infinity;
  return { sessions, newestAgeMs };
}

// ── 3. which cells have completed ────────────────────────────────────────────
function cells() {
  const dir = join(REPO, 'docs', 'work', 'eval-runs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const s = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return { label: s.label, model: s.model, pass: s.pass, fail: s.fail, ageMs: now - statSync(join(dir, f)).mtimeMs };
  });
}

// ── render ───────────────────────────────────────────────────────────────────
const procs = liveProcs();
const { sessions, newestAgeMs } = telemetry();

console.log(`eval-status @ ${new Date(now).toLocaleTimeString()}  (window ${sinceMin}m)`);
console.log('─'.repeat(64));

console.log(`LIVE opencode procs: ${procs.length}`);
for (const p of procs) {
  console.log(`  ${p.sub ? '└─ sub' : '▶ cell'}  ${p.agent.padEnd(20)} ${p.model.padEnd(34)} ${p.etime}`);
}
if (procs.length === 0) console.log('  (none running)');

console.log(`\nTELEMETRY fan-out (last ${sinceMin}m) — newest row ${ageStr(newestAgeMs)} ago` +
  (newestAgeMs > 120_000 ? '  ⚠ quiet (coordinator may be synthesizing)' : ''));
for (const [sid, s] of sessions) {
  console.log(`  session ${sid.slice(0, 14)}…  last ${ageStr(now - s.last)} ago  ${s.tokensOut} tok out`);
  for (const [agent, a] of [...s.agents.entries()].sort((x, y) => y[1].msgs - x[1].msgs)) {
    console.log(`    • ${agent.padEnd(22)} ${String(a.msgs).padStart(3)} msgs  ${String(a.tokensOut).padStart(6)} tok  [${a.model || '?'}]`);
  }
}
if (sessions.length === 0) console.log('  (no agent activity in window)');

const cs = cells();
if (cs.length) {
  console.log('\nCELLS done:');
  for (const c of cs) console.log(`  ${(c.label || '?').padEnd(12)} ${c.pass}P/${c.fail}F  ${c.model || ''}  (written ${ageStr(c.ageMs)} ago)`);
}
