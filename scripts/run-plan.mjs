#!/usr/bin/env node
// run-plan.mjs — deterministic DAG runner for task-decomposer plans.
//
// Deterministic control flow, probabilistic leaf work: this script owns the
// plan; agents only execute one bounded node at a time. No model ever has to
// remember where it is.
//
//   node scripts/run-plan.mjs [plan.json] [flags]
//
// Flags:
//   --dry-run            print execution order + prompts, spawn nothing
//   --node <id>          run a single node (ignores journal status for it)
//   --max-retries <n>    checkpoint-continue attempts per node (default 2)
//   --cmd <template>     agent command, default: opencode run --agent {agent}
//                        (prompt is passed as the final argument)
//   --auto-replan        on plan_invalidating, re-dispatch task-decomposer
//                        automatically (default: stop with exit 3)
//   --parallel <n>       max concurrent ready nodes (default 1)
//
// Behavior per node (per ARCHITECTURE_EVOLUTION_PLAN.md 4.1 + G2/G5/G6):
//   pre-flight health check (local model server re-warm) → spawn with
//   tier-scaled timeout → verify the output artifact exists → journal it.
//   Incomplete node: retry FROM ITS CHECKPOINT (never from scratch), max
//   --max-retries, then mark escalated; downstream nodes are blocked, but
//   independent branches keep running.
//
// Journal: <plan dir>/journal.json — re-running the script resumes; completed
// nodes never re-run. Logs: <plan dir>/logs/<node>.log
//
// Exit codes: 0 all done · 2 bad plan · 3 replan required · 4 nodes escalated

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readFileSync as rf } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(name);
  return i === -1 ? def : argv[i + 1];
};
const has = (name) => argv.includes(name);

const PLAN_PATH = resolve(argv[0] && !argv[0].startsWith('--') ? argv[0] : 'docs/work/plan/plan.json');
const PLAN_DIR = dirname(PLAN_PATH);
const JOURNAL_PATH = join(PLAN_DIR, 'journal.json');
const LOG_DIR = join(PLAN_DIR, 'logs');
const DRY = has('--dry-run');
const ONLY_NODE = flag('--node', null);
const MAX_RETRIES = parseInt(flag('--max-retries', '2'), 10);
const CMD_TEMPLATE = flag('--cmd', 'opencode run --agent {agent}');
const AUTO_REPLAN = has('--auto-replan');
const PARALLEL = parseInt(flag('--parallel', '1'), 10);

// Tier-scaled timeouts (seconds). Local generation is legitimately slow —
// a cloud-calibrated timeout kills healthy work (plan G6).
const TIMEOUTS = { small: 1800, medium: 1200, large: 900 };

// ── plan load + validation ──────────────────────────────────────────────
if (!existsSync(PLAN_PATH)) {
  console.error(`[run-plan] no plan at ${PLAN_PATH} — run the task-decomposer agent first`);
  process.exit(2);
}
const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'));
const nodes = plan.nodes ?? [];
const byId = new Map(nodes.map((n) => [n.id, n]));

const errors = [];
for (const n of nodes) {
  if (!n.id || !n.agent || !n.task || !n.output) errors.push(`${n.id ?? '?'}: missing id/agent/task/output`);
  for (const d of n.depends_on ?? []) if (!byId.has(d)) errors.push(`${n.id}: depends_on unknown node ${d}`);
}
// cycle check via repeated topological peel
{
  const indeg = new Map(nodes.map((n) => [n.id, (n.depends_on ?? []).length]));
  const q = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  let seen = 0;
  while (q.length) {
    const id = q.shift(); seen++;
    for (const m of nodes) if ((m.depends_on ?? []).includes(id)) {
      indeg.set(m.id, indeg.get(m.id) - 1);
      if (indeg.get(m.id) === 0) q.push(m.id);
    }
  }
  if (seen !== nodes.length) errors.push('cycle detected in depends_on graph');
}
if (errors.length) {
  console.error('[run-plan] invalid plan:\n  ' + errors.join('\n  '));
  process.exit(2);
}

// ── journal ─────────────────────────────────────────────────────────────
const journal = existsSync(JOURNAL_PATH) ? JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) : {};
const saveJournal = () => writeFileSync(JOURNAL_PATH, JSON.stringify(journal, null, 2));
const state = (id) => journal[id]?.status ?? 'pending';

// ── helpers ─────────────────────────────────────────────────────────────
// spawn with stdin IGNORED — a piped-but-never-closed stdin makes CLIs that
// accept stdin input (opencode run does) wait forever. Found by live testing.
const sh = (cmd, args, timeoutMs) =>
  new Promise((res) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      res({ err: code === 0 ? null : { code, killed }, stdout, stderr });
    });
    child.on('error', (e) => { clearTimeout(timer); res({ err: e, stdout, stderr }); });
  });

async function healthCheck() {
  // Only meaningful for local backends; read .model-context if present.
  const mc = 'docs/work/.model-context';
  if (!existsSync(mc) || !readFileSync(mc, 'utf8').includes('type=local')) return true;
  const url = process.env.LMSTUDIO_URL ?? 'http://127.0.0.1:1234';
  for (let i = 0; i < 2; i++) {
    const { err } = await sh('curl', ['-s', '--max-time', '5', `${url}/v1/models`], 10_000);
    if (!err) return true;
    console.log(`[run-plan] model server unreachable at ${url} — retrying in 10s (re-warm)`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  return false;
}

function buildPrompt(n, attempt) {
  const checkpoint = `${n.output}.checkpoint.md`;
  const inputs = [...(n.inputs ?? [])];
  if (attempt > 0 && existsSync(checkpoint)) inputs.unshift(checkpoint + '  (YOUR PRIOR PARTIAL PROGRESS — continue from it, do not start over)');
  return [
    `SDLC-TASK for ${n.agent}: ${n.task}`,
    ``,
    `CONTEXT (read only these):`,
    ...(inputs.length ? inputs.map((i) => `- ${i}`) : ['- (none — work from the task statement)']),
    ``,
    `WRITE-SCOPE (exclusive): ${dirname(n.output)}/`,
    `PRODUCE: ${n.output}`,
    ``,
    `Rules: stay inside WRITE-SCOPE; produce exactly the PRODUCE file; follow your`,
    `agent file's Completion Manifest format inside the output. If you cannot finish,`,
    `write partial progress to ${checkpoint} and print exactly: NODE ${n.id} CHECKPOINT`,
    `On success print exactly: NODE ${n.id} DONE`,
  ].join('\n');
}

const outputOk = (n) => existsSync(n.output) && statSync(n.output).size > 0;

// Telemetry (plan 4.12): per-node actuals → docs/work/telemetry.jsonl.
// opencode run doesn't report token usage, so sizes are char/4 ESTIMATES
// (the plugin hook logs real token counts for the same work; join on time).
// Disable with EXPERTS_TELEMETRY=0. Never let telemetry break a run.
function telemetry(row) {
  if (process.env.EXPERTS_TELEMETRY === '0') return;
  try {
    mkdirSync('docs/work', { recursive: true });
    writeFileSync('docs/work/telemetry.jsonl', JSON.stringify({ ts: new Date().toISOString(), source: 'run-plan', ...row }) + '\n', { flag: 'a' });
  } catch { /* telemetry must never break the run */ }
}

async function runNode(n) {
  const entry = (journal[n.id] ??= { status: 'pending', attempts: 0 });
  const tier = n.tier_needed ?? plan.executor_tier ?? 'small';
  const timeoutMs = (TIMEOUTS[tier] ?? TIMEOUTS.small) * 1000;
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(dirname(n.output), { recursive: true });

  while (entry.attempts <= MAX_RETRIES) {
    const attempt = entry.attempts;
    const prompt = buildPrompt(n, attempt);
    if (DRY) {
      console.log(`\n── [dry-run] ${n.id} (${n.agent}, tier=${tier}, attempt ${attempt}) ──\n${prompt}`);
      entry.status = 'dry'; return true;
    }
    if (!(await healthCheck())) {
      console.error(`[run-plan] ${n.id}: model server down — stopping (resume with the same command)`);
      entry.status = 'blocked-backend'; saveJournal(); process.exit(4);
    }
    const parts = CMD_TEMPLATE.replace('{agent}', n.agent).split(' ');
    console.log(`[run-plan] ${n.id} → ${n.agent} (tier=${tier}, attempt ${attempt + 1}/${MAX_RETRIES + 1}, timeout ${timeoutMs / 1000}s)`);
    entry.started = new Date().toISOString();
    const { err, stdout, stderr } = await sh(parts[0], [...parts.slice(1), prompt], timeoutMs);
    entry.attempts += 1;
    writeFileSync(join(LOG_DIR, `${n.id}.log`), `# attempt ${attempt + 1}\n## stdout\n${stdout}\n## stderr\n${stderr}\n## err\n${err ?? ''}\n`, { flag: 'a' });

    if (outputOk(n)) {
      entry.status = 'done';
      entry.finished = new Date().toISOString();
      entry.duration_s = Math.round((Date.parse(entry.finished) - Date.parse(entry.started)) / 1000);
      saveJournal();
      telemetry({ node: n.id, agent: n.agent, tier, status: 'done', attempts: entry.attempts, duration_s: entry.duration_s, prompt_chars: prompt.length, output_chars: stdout.length, tokens_out_est: Math.round(stdout.length / 4) });
      console.log(`[run-plan] ${n.id} ✓ done (${entry.duration_s}s) → ${n.output}`);
      return true;
    }
    console.log(`[run-plan] ${n.id} ✗ no valid output after attempt ${attempt + 1}` + (err ? ` (${err.killed ? 'TIMEOUT' : 'error'})` : ''));
    saveJournal();
  }
  entry.status = 'escalated';
  saveJournal();
  telemetry({ node: n.id, agent: n.agent, tier, status: 'escalated', attempts: entry.attempts });
  console.error(`[run-plan] ${n.id} ESCALATED after ${MAX_RETRIES + 1} attempts — log: ${join(LOG_DIR, `${n.id}.log`)}`);
  console.error(`  Next: retry at a higher tier (edit tier_needed), run the node interactively, or fix inputs.`);
  return false;
}

// ── main loop ───────────────────────────────────────────────────────────
const depDone = (d) => state(d) === 'done' || (DRY && state(d) === 'dry');
const ready = () => nodes.filter((n) =>
  state(n.id) === 'pending' &&
  (n.depends_on ?? []).every(depDone));
const blocked = () => nodes.filter((n) =>
  state(n.id) === 'pending' &&
  (n.depends_on ?? []).some((d) => ['escalated', 'blocked'].includes(state(d))));

if (ONLY_NODE) {
  const n = byId.get(ONLY_NODE);
  if (!n) { console.error(`[run-plan] unknown node ${ONLY_NODE}`); process.exit(2); }
  journal[n.id] = { status: 'pending', attempts: 0 };
  await runNode(n);
  process.exit(state(n.id) === 'done' || DRY ? 0 : 4);
}

console.log(`[run-plan] plan: ${plan.request ?? '(no request)'} — ${nodes.length} nodes, ${nodes.filter((n) => state(n.id) === 'done').length} already done`);

let anyEscalated = false;
for (;;) {
  // mark dep-blocked nodes
  for (const n of blocked()) { journal[n.id] = { status: 'blocked', attempts: 0 }; console.log(`[run-plan] ${n.id} blocked (failed dependency)`); }
  const batch = ready().slice(0, Math.max(1, PARALLEL));
  if (batch.length === 0) break;
  const results = await Promise.all(batch.map(runNode));
  anyEscalated = anyEscalated || results.includes(false);

  // G2: plan-invalidating discovery → replan the unexecuted tail
  const invalidator = batch.find((n, i) => results[i] && n.plan_invalidating);
  if (invalidator && !DRY) {
    if (AUTO_REPLAN) {
      console.log(`[run-plan] ${invalidator.id} invalidated the plan — re-dispatching task-decomposer`);
      const prompt = `SDLC-TASK for task-decomposer: re-plan the remaining work. Original request: ${plan.request}. ` +
        `Completed nodes (do not re-plan): ${nodes.filter((n) => state(n.id) === 'done').map((n) => `${n.id} → ${n.output}`).join('; ')}. ` +
        `New discovery to incorporate: ${invalidator.output}. Write the updated plan to ${PLAN_PATH} keeping completed node ids unchanged.`;
      const parts = CMD_TEMPLATE.replace('{agent}', 'task-decomposer').split(' ');
      await sh(parts[0], [...parts.slice(1), prompt], TIMEOUTS.large * 1000);
      console.log(`[run-plan] replan written — re-run this script to continue with the updated plan`);
      process.exit(3);
    } else {
      console.log(`[run-plan] ${invalidator.id} set plan_invalidating — re-run task-decomposer with ${invalidator.output}, then re-run this script (or use --auto-replan)`);
      process.exit(3);
    }
  }
}

const done = nodes.filter((n) => state(n.id) === 'done').length;
const esc = nodes.filter((n) => state(n.id) === 'escalated');
const blk = nodes.filter((n) => state(n.id) === 'blocked');
console.log(`\n[run-plan] finished: ${done}/${nodes.length} done` +
  (esc.length ? `, escalated: ${esc.map((n) => n.id).join(',')}` : '') +
  (blk.length ? `, blocked: ${blk.map((n) => n.id).join(',')}` : ''));
process.exit(esc.length || blk.length ? 4 : 0);
