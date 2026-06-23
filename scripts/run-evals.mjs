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
// --bare runs the same agent_checks with the SAME prompt but WITHOUT the
// specialist `--agent` scaffold (model under opencode's default agent). Pairing
// a --bare cell with a scaffolded cell of the same model measures lift =
// scaffolded − bare (what our scaffold buys). Implies running the agent checks.
const BARE = argv.includes('--bare');
const JSON_OUT = argv.includes('--json');
const KEEP = argv.includes('--keep');
const ONLY = argv.includes('--fixture') ? argv[argv.indexOf('--fixture') + 1] : null;
// --label <name> tags this run (e.g. "frontier", "local-qwen14b") so eval-compare.mjs
// can diff cells. Labeled runs are also saved to docs/work/eval-runs/<label>.json.
const LABEL = argv.includes('--label') ? argv[argv.indexOf('--label') + 1] : null;
const AGENT_TIMEOUT_MS = Number(process.env.EVAL_AGENT_TIMEOUT_MS || 900_000);
// Pin the model for this run (provider/model). Passed to `opencode run -m`.
const EVAL_MODEL = process.env.EVAL_MODEL || null;
// Accumulated cost of agent runs (for the cost-vs-accuracy comparison).
let agentDurationMs = 0;
let agentTokensOut = 0;

function log(msg) { if (!JSON_OUT) console.log(msg); }

// Sandbox guard: an eval agent (esp. the bare default agent) can autonomously
// git-commit its output. Capture this repo's HEAD so we can abort if an agent
// escapes its work dir and commits to the canonical repo.
function gitHead(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

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

// Telemetry (plan 4.12): one row per agent-mode check → docs/work/telemetry.jsonl.
// Disable with EXPERTS_TELEMETRY=0.
function telemetry(row) {
  if (process.env.EXPERTS_TELEMETRY === '0') return;
  try {
    mkdirSync(join(REPO, 'docs', 'work'), { recursive: true });
    writeFileSync(join(REPO, 'docs', 'work', 'telemetry.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), source: 'evals', ...row }) + '\n', { flag: 'a' });
  } catch { /* telemetry must never break an eval run */ }
}

function runAgentCheck(check, cwd, fixture) {
  if (!toolExists('opencode')) {
    return { id: check.id, status: 'SKIP', detail: 'opencode CLI not installed' };
  }
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  const startedAt = Date.now();
  // EVAL_MODEL pins the model for this cell (provider/model), so the same suite
  // can be run once per model tier and compared by eval-compare.mjs.
  const modelArgs = EVAL_MODEL ? ['-m', EVAL_MODEL] : [];
  // Per-check budget: coordinator agents (fan-out) need far more than a single
  // agent. A TIMEOUT is "ran out of budget", reported distinctly from FAIL
  // ("got it wrong") so a clock-out can never masquerade as a wrong answer.
  const timeoutMs = check.timeout_ms || AGENT_TIMEOUT_MS;
  // Bare cell: omit the specialist agent so it's the model under opencode's
  // default agent — the no-scaffold baseline for the lift measurement.
  const agentArgs = BARE ? [] : ['--agent', check.agent];
  const r = spawnSync('opencode', ['run', ...modelArgs, ...agentArgs, check.prompt], {
    cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs, encoding: 'utf8',
  });
  const durationMs = Date.now() - startedAt;
  agentDurationMs += durationMs;
  agentTokensOut += Math.round((r.stdout || '').length / 4);
  if (r.error?.code === 'ETIMEDOUT') {
    telemetry({ fixture, check: check.id, agent: check.agent, status: 'TIMEOUT', duration_ms: durationMs });
    return { id: check.id, status: 'TIMEOUT', detail: `agent did not finish within ${timeoutMs / 1000}s (budget, not a wrong answer)` };
  }
  if (r.error) {
    telemetry({ fixture, check: check.id, agent: check.agent, status: 'ERROR', duration_ms: durationMs });
    return { id: check.id, status: 'ERROR', detail: `agent process error: ${r.error.code || r.error.message}` };
  }
  // Outcome-based check: run a verifier in the work dir (e.g. the test suite)
  // AFTER the agent. Stronger than matching the agent's chatter — it scores
  // whether the agent actually made the criterion true (suite green), not
  // whether it merely claimed to. PASS iff the verifier exits 0.
  if (check.verify_cmd) {
    const vr = spawnSync(check.verify_cmd[0], check.verify_cmd.slice(1), {
      cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, encoding: 'utf8',
    });
    const vout = (vr.stdout || '') + (vr.stderr || '');
    const matchOk = check.verify_match ? new RegExp(check.verify_match, 'i').test(vout) : true;
    const status = vr.status === 0 && matchOk ? 'PASS' : 'FAIL';
    telemetry({ fixture, check: check.id, agent: check.agent, status, duration_ms: durationMs, verify_exit: vr.status });
    return status === 'PASS'
      ? { id: check.id, status, detail: `verifier passed: \`${check.verify_cmd.join(' ')}\` exit 0 (${BARE ? 'bare' : check.agent})` }
      : { id: check.id, status, detail: `verifier failed: \`${check.verify_cmd.join(' ')}\` exit ${vr.status}`, output: vout.slice(-1200) };
  }
  // Assert on everything the agent produced (artifacts on disk + final text)
  let corpus = (r.stdout || '');
  for (const f of walkFiles(cwd)) {
    if (f.endsWith('.md') || f.endsWith('.json')) {
      try { corpus += '\n' + readFileSync(f, 'utf8'); } catch { /* unreadable artifact — skip */ }
    }
  }
  const missing = (check.match_all || []).filter((p) => !new RegExp(p, 'i').test(corpus));
  const status = missing.length === 0 ? 'PASS' : 'FAIL';
  telemetry({ fixture, check: check.id, agent: check.agent, status, duration_ms: durationMs, output_chars: (r.stdout || '').length, tokens_out_est: Math.round((r.stdout || '').length / 4) });
  return status === 'PASS'
    ? { id: check.id, status, detail: `all ${check.match_all.length} expected mention(s) present (agent: ${check.agent})` }
    : { id: check.id, status, detail: `missing mention(s): ${missing.join(' , ')}`, output: (r.stdout || '').slice(-1500) };
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
    // Sandbox: remember the canonical repo's HEAD; abort if an agent commits to it.
    const SANDBOXED = AGENT_MODE || BARE;
    const repoHeadBefore = SANDBOXED ? gitHead(REPO) : null;

    for (const exp of expectations) {
      const src = join(FIXTURE_DIR, exp.fixture);
      if (!existsSync(src)) {
        results.push({ fixture: exp.fixture, id: '-', status: 'FAIL', detail: 'fixture directory missing' });
        continue;
      }
      // Work on a copy: agent runs write artifacts; scanners may drop caches.
      const work = mkdtempSync(join(tmpdir(), `eval-${exp.fixture}-`));
      cpSync(src, work, { recursive: true });
      // Make the work copy its own git repo so an agent that decides to commit
      // lands in the throwaway sandbox, not the canonical repo.
      if (SANDBOXED) spawnSync('git', ['-C', work, 'init', '-q'], { stdio: 'ignore' });
      log(`\n── ${exp.fixture} — ${exp.description}`);

      for (const check of exp.checks || []) {
        // Deterministic checks are a fixture-health gate (do the planted defects
        // exist?) — model-independent, kept OUT of the frontier-vs-local gap.
        const res = { fixture: exp.fixture, horizon: exp.horizon || 'unknown', kind: 'deterministic', ...runCheck(check, work) };
        results.push(res);
        log(`  [${res.status}] ${res.id} — ${res.detail}`);
      }
      if (AGENT_MODE || BARE) {
        for (const check of exp.agent_checks || []) {
          const budgetS = (check.timeout_ms || AGENT_TIMEOUT_MS) / 1000;
          log(`  [....] ${check.id} — running ${BARE ? `BARE (no scaffold, default agent)` : `agent ${check.agent}`} (≤${budgetS}s)`);
          // Agent checks are the model-dependent signal that the gap is computed on.
          const res = { fixture: exp.fixture, horizon: exp.horizon || 'unknown', kind: 'agent', ...runAgentCheck(check, work, exp.fixture) };
          results.push(res);
          log(`  [${res.status}] ${res.id} — ${res.detail}`);
        }
      }
      if (KEEP) log(`  (workdir kept: ${work})`);
      else rmSync(work, { recursive: true, force: true });

      // Guard: if an agent escaped the sandbox and committed to THIS repo, stop
      // now — never let an eval run silently contaminate the canonical repo.
      if (SANDBOXED) {
        const headNow = gitHead(REPO);
        if (headNow && repoHeadBefore && headNow !== repoHeadBefore) {
          console.error(
            `\nFATAL: the canonical repo HEAD moved during an eval agent run ` +
            `(${repoHeadBefore.slice(0, 8)} → ${headNow.slice(0, 8)}). An agent committed to ` +
            `${REPO} instead of its sandbox. Aborting before this reaches a release; ` +
            `inspect with \`git log\` and \`git reset --hard ${repoHeadBefore.slice(0, 8)}\` if the commits are agent-made.`
          );
          process.exit(2);
        }
      }
    }

    const summary = {
      ranAt: new Date().toISOString(),
      label: LABEL || null,
      mode: BARE ? 'deterministic+bare' : AGENT_MODE ? 'deterministic+agent' : 'deterministic',
      tier: tier.tier || 'unknown',
      model: EVAL_MODEL || tier.model || null,
      pass: results.filter((r) => r.status === 'PASS').length,
      fail: results.filter((r) => r.status === 'FAIL').length,
      skip: results.filter((r) => r.status === 'SKIP').length,
      timeout: results.filter((r) => r.status === 'TIMEOUT').length,
      error: results.filter((r) => r.status === 'ERROR').length,
      costEst: { durationMs: agentDurationMs, tokensOutEst: agentTokensOut },
      results,
    };

    mkdirSync(join(REPO, 'docs', 'work'), { recursive: true });
    const outFile = join(REPO, 'docs', 'work', 'EVAL_RESULTS.json');
    writeFileSync(outFile, JSON.stringify(summary, null, 2) + '\n');
    // Labeled runs are also archived so eval-compare.mjs can diff cells.
    if (LABEL) {
      const runsDir = join(REPO, 'docs', 'work', 'eval-runs');
      mkdirSync(runsDir, { recursive: true });
      writeFileSync(join(runsDir, `${LABEL}.json`), JSON.stringify(summary, null, 2) + '\n');
    }

    if (JSON_OUT) console.log(JSON.stringify(summary, null, 2));
    else {
      console.log(`\nrun-evals: ${summary.pass} pass, ${summary.fail} fail, ${summary.skip} skip` +
        `, ${summary.timeout} timeout, ${summary.error} error` +
        ` (mode: ${summary.mode}, tier: ${summary.tier}) → ${outFile}`);
    }
    // A TIMEOUT is a budget signal, not a wrong answer — it does not fail the run.
    process.exitCode = summary.fail > 0 ? 1 : 0;
  }
}
