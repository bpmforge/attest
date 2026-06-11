#!/usr/bin/env node
// run-evals.mjs — golden-task eval suite for the expert system itself
// (ARCHITECTURE_EVOLUTION_PLAN.md §4.11).
//
// Runs the pipeline against tiny fixture repos with PLANTED defects and
// asserts the expected artifacts/findings appear. Makes "did this protocol
// edit help or hurt?" measurable instead of vibes — per release, per tier.
//
// Modes:
//   deterministic (default) — runs scriptable scanners (semgrep, jscpd,
//     validate-*.sh) against each fixture and asserts expected findings.
//     Fast, no LLM, CI-able. Tools that are missing → SKIP, not FAIL.
//   --agent — additionally drives `opencode run --agent <agent>` against a
//     temp copy of each fixture and asserts the produced artifacts mention
//     the planted defects. Expensive; result is stamped with the model tier.
//
// Usage:
//   node scripts/run-evals.mjs [--fixture <name>] [--agent] [--json] [--keep]
//
// Exit: 0 = all non-skipped checks pass / 1 = failures / 2 = invocation error
//
// Lesson baked in from run-plan.mjs: spawn `opencode run` with stdin IGNORED —
// an open stdin pipe makes it hang forever.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const REPO = join(dirname(new URL(import.meta.url).pathname), '..');
const EXPECT_DIR = join(REPO, 'evals', 'expectations');
const FIXTURE_DIR = join(REPO, 'evals', 'fixtures');

const argv = process.argv.slice(2);
const AGENT_MODE = argv.includes('--agent');
const JSON_OUT = argv.includes('--json');
const KEEP = argv.includes('--keep');
const ONLY = argv.includes('--fixture') ? argv[argv.indexOf('--fixture') + 1] : null;
const AGENT_TIMEOUT_MS = Number(process.env.EVAL_AGENT_TIMEOUT_MS || 900_000);

function log(msg) { if (!JSON_OUT) console.log(msg); }

function toolExists(name) {
  return spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' }).status === 0;
}

function readTier() {
  const f = join(REPO, 'docs', 'work', '.model-context');
  if (!existsSync(f)) return { tier: 'unknown' };
  const out = {};
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

function* walkFiles(dir) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walkFiles(p);
    else yield p;
  }
}

function runCheck(check, cwd) {
  if (check.requires && !toolExists(check.requires)) {
    return { id: check.id, status: 'SKIP', detail: `tool not installed: ${check.requires}` };
  }
  const cmd = check.cmd.map((a) => a.replace('{REPO}', REPO));
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000, encoding: 'utf8',
  });
  const output = (r.stdout || '') + (r.stderr || '');
  const re = new RegExp(check.match, 'gi');
  const count = (output.match(re) || []).length;
  const min = check.min ?? 1;
  return count >= min
    ? { id: check.id, status: 'PASS', detail: `${count} match(es) for /${check.match}/` }
    : { id: check.id, status: 'FAIL', detail: `expected ≥${min} match(es) for /${check.match}/, got ${count}`, output: output.slice(-1500) };
}

function runAgentCheck(check, cwd) {
  if (!toolExists('opencode')) {
    return { id: check.id, status: 'SKIP', detail: 'opencode CLI not installed' };
  }
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  const r = spawnSync('opencode', ['run', '--agent', check.agent, check.prompt], {
    cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: AGENT_TIMEOUT_MS, encoding: 'utf8',
  });
  if (r.error?.code === 'ETIMEDOUT') {
    return { id: check.id, status: 'FAIL', detail: `agent timed out after ${AGENT_TIMEOUT_MS / 1000}s` };
  }
  // Assert on everything the agent produced (artifacts on disk + final text)
  let corpus = (r.stdout || '');
  for (const f of walkFiles(cwd)) {
    if (f.endsWith('.md') || f.endsWith('.json')) {
      try { corpus += '\n' + readFileSync(f, 'utf8'); } catch { /* unreadable artifact — skip */ }
    }
  }
  const missing = (check.match_all || []).filter((p) => !new RegExp(p, 'i').test(corpus));
  return missing.length === 0
    ? { id: check.id, status: 'PASS', detail: `all ${check.match_all.length} expected mention(s) present (agent: ${check.agent})` }
    : { id: check.id, status: 'FAIL', detail: `missing mention(s): ${missing.join(' , ')}`, output: (r.stdout || '').slice(-1500) };
}

// ── main ─────────────────────────────────────────────────────────────────
if (!existsSync(EXPECT_DIR)) {
  console.error(`run-evals: no expectations directory at ${EXPECT_DIR}`);
  process.exitCode = 2;
} else {
  const expectations = readdirSync(EXPECT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(EXPECT_DIR, f), 'utf8')))
    .filter((e) => !ONLY || e.fixture === ONLY);

  if (expectations.length === 0) {
    console.error(`run-evals: no expectations${ONLY ? ` for fixture "${ONLY}"` : ''}`);
    process.exitCode = 2;
  } else {
    const tier = readTier();
    const results = [];

    for (const exp of expectations) {
      const src = join(FIXTURE_DIR, exp.fixture);
      if (!existsSync(src)) {
        results.push({ fixture: exp.fixture, id: '-', status: 'FAIL', detail: 'fixture directory missing' });
        continue;
      }
      // Work on a copy: agent runs write artifacts; scanners may drop caches.
      const work = mkdtempSync(join(tmpdir(), `eval-${exp.fixture}-`));
      cpSync(src, work, { recursive: true });
      log(`\n── ${exp.fixture} — ${exp.description}`);

      for (const check of exp.checks || []) {
        const res = { fixture: exp.fixture, ...runCheck(check, work) };
        results.push(res);
        log(`  [${res.status}] ${res.id} — ${res.detail}`);
      }
      if (AGENT_MODE) {
        for (const check of exp.agent_checks || []) {
          log(`  [....] ${check.id} — running agent ${check.agent} (≤${AGENT_TIMEOUT_MS / 1000}s)`);
          const res = { fixture: exp.fixture, ...runAgentCheck(check, work) };
          results.push(res);
          log(`  [${res.status}] ${res.id} — ${res.detail}`);
        }
      }
      if (KEEP) log(`  (workdir kept: ${work})`);
      else rmSync(work, { recursive: true, force: true });
    }

    const summary = {
      ranAt: new Date().toISOString(),
      mode: AGENT_MODE ? 'deterministic+agent' : 'deterministic',
      tier: tier.tier || 'unknown',
      model: tier.model || null,
      pass: results.filter((r) => r.status === 'PASS').length,
      fail: results.filter((r) => r.status === 'FAIL').length,
      skip: results.filter((r) => r.status === 'SKIP').length,
      results,
    };

    mkdirSync(join(REPO, 'docs', 'work'), { recursive: true });
    const outFile = join(REPO, 'docs', 'work', 'EVAL_RESULTS.json');
    writeFileSync(outFile, JSON.stringify(summary, null, 2) + '\n');

    if (JSON_OUT) console.log(JSON.stringify(summary, null, 2));
    else {
      console.log(`\nrun-evals: ${summary.pass} pass, ${summary.fail} fail, ${summary.skip} skip` +
        ` (mode: ${summary.mode}, tier: ${summary.tier}) → ${outFile}`);
    }
    process.exitCode = summary.fail > 0 ? 1 : 0;
  }
}
