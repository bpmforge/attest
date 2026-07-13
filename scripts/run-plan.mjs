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
// Tier-aware retry budgets (O2 runtime fold, T31.7 — folds FIX_VERIFY_LOOP.md's
// v2 iteration classes from protocol text into this runner):
//   - STALLED: a failed attempt whose checkpoint file (<output>.checkpoint.md)
//     did not grow since the prior attempt. Two STALLED attempts in a row
//     escalate immediately (stall-2-then-escalate) — even inside the base
//     --max-retries budget, never waiting for a third identical attempt.
//   - PROGRESSED: a failed attempt whose checkpoint grew. Does not count
//     against the stall budget; may extend retries past --max-retries as
//     long as each attempt keeps progressing, up to a tier-aware ceiling
//     read from docs/work/.model-context (attemptCeiling(): 6 on
//     metered/cloud tiers, 12 on local/unknown tiers — same convention as
//     fix-verify.mjs's R4 classes). Hitting the ceiling while still
//     PROGRESSED is a decomposition signal, not folded in here — it falls
//     through to the existing escalation path.
//   - Infra event (timeout/kill): spends an attempt but is never judged
//     STALLED or PROGRESSED — it does not touch the stall counter.
//
// Journal: <plan dir>/journal.json — re-running the script resumes; completed
// nodes never re-run. Logs: <plan dir>/logs/<node>.log
//
// Exit codes: 0 all done · 2 bad plan · 3 replan required · 4 nodes escalated

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, mkdtempSync, readFileSync as rf } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

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
const AUTO_ESCALATE = has('--auto-escalate');
const MAX_ESCALATIONS = parseInt(flag('--max-escalations', '5'), 10);
const TIER_ORDER = ['small', 'medium', 'large'];
let escalationsUsed = 0;

// ── self-test (O2.4): exercise auto-escalate success / fail / cap with a stub ──
if (has('--self-test')) {
  const THIS = fileURLToPath(import.meta.url);
  const runSub = (dir, extra) => new Promise((res) => {
    const child = spawn(process.execPath, [THIS, join(dir, 'plan.json'), ...extra],
      { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, EXPERTS_TELEMETRY: '0' } });
    let out = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
    child.on('close', code => res({ code, out }));
  });
  const mkCase = (succeedAboveSmall) => {
    const dir = mkdtempSync(join(tmpdir(), 'runplan-'));
    const out = join(dir, 'out.txt');
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({ request: 'self-test',
      nodes: [{ id: 'n1', agent: 'stub', task: 'self-test node', inputs: [], output: out, depends_on: [], tier_needed: 'small' }] }));
    const stub = join(dir, 'stub.mjs');
    writeFileSync(stub, `import {writeFileSync} from 'node:fs';\n` +
      `const tier=process.env.RUN_PLAN_TIER||'small';\n` +
      `if (${succeedAboveSmall} && tier!=='small') { writeFileSync(${JSON.stringify(out)},'ok'); }\n` +
      `else { process.exit(1); }\n`);
    return { dir, stub };
  };
  // Stub that grows <output>.checkpoint.md by 10 bytes on every failed
  // attempt (a real checkpoint-writing agent, minus the model) — optionally
  // succeeds once its own invocation counter reaches successAt, or never
  // succeeds (successAt=null) to exercise the ceiling. modelContext, when
  // given, is written to docs/work/.model-context before the run so
  // attemptCeiling() reads a forced tier.
  const mkGrowingCase = (successAt, modelContext) => {
    const dir = mkdtempSync(join(tmpdir(), 'runplan-'));
    const out = join(dir, 'out.txt');
    const checkpoint = `${out}.checkpoint.md`;
    const countFile = join(dir, 'count');
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({ request: 'self-test',
      nodes: [{ id: 'n1', agent: 'stub', task: 'self-test node', inputs: [], output: out, depends_on: [], tier_needed: 'small' }] }));
    if (modelContext) {
      mkdirSync(join(dir, 'docs/work'), { recursive: true });
      writeFileSync(join(dir, 'docs/work/.model-context'), modelContext);
    }
    const stub = join(dir, 'stub.mjs');
    writeFileSync(stub, [
      `import {writeFileSync,existsSync,readFileSync} from 'node:fs';`,
      `const c=${JSON.stringify(countFile)};`,
      `const n=(existsSync(c)?parseInt(readFileSync(c,'utf8')):0)+1;`,
      `writeFileSync(c,String(n));`,
      `if (${successAt !== null} && n>=${successAt}) { writeFileSync(${JSON.stringify(out)},'ok'); }`,
      `else { writeFileSync(${JSON.stringify(checkpoint)}, 'x'.repeat(n*10)); process.exit(1); }`,
    ].join('\n'));
    return { dir, stub };
  };
  const fail = (m) => { console.log(`run-plan self-test FAIL: ${m}`); process.exit(1); };
  // 1. escalate-success — fails at small, succeeds after bump to medium
  let c = mkCase(true);
  let r = await runSub(c.dir, ['--auto-escalate', '--max-retries', '0', '--cmd', `node ${c.stub}`]);
  let j = JSON.parse(readFileSync(join(c.dir, 'journal.json'), 'utf8'));
  if (!(r.code === 0 && j.n1.status === 'done' && j.n1.escalation?.outcome === 'done')) fail(`escalate-success (code=${r.code}, status=${j.n1?.status})`);
  // 2. escalate-fail — never writes, escalates even after the bump
  c = mkCase(false);
  r = await runSub(c.dir, ['--auto-escalate', '--max-retries', '0', '--cmd', `node ${c.stub}`]);
  j = JSON.parse(readFileSync(join(c.dir, 'journal.json'), 'utf8'));
  if (!(r.code === 4 && j.n1.status === 'escalated')) fail(`escalate-fail (code=${r.code}, status=${j.n1?.status})`);
  // 3. cap — --max-escalations 0 blocks the bump
  c = mkCase(true);
  r = await runSub(c.dir, ['--auto-escalate', '--max-escalations', '0', '--max-retries', '0', '--cmd', `node ${c.stub}`]);
  j = JSON.parse(readFileSync(join(c.dir, 'journal.json'), 'utf8'));
  if (!(r.code === 4 && j.n1.status === 'escalated' && /cap 0 reached/.test(r.out))) fail(`cap (code=${r.code})`);
  // 4. stall-2-then-escalate (T31.7) — a node that never progresses (no
  // checkpoint growth) escalates after 2 attempts, well inside a generous
  // --max-retries budget — never waiting for a 3rd identical attempt.
  c = mkCase(false);
  r = await runSub(c.dir, ['--max-retries', '5', '--cmd', `node ${c.stub}`]);
  j = JSON.parse(readFileSync(join(c.dir, 'journal.json'), 'utf8'));
  if (!(r.code === 4 && j.n1.status === 'escalated' && j.n1.attempts === 2 && j.n1.consecutiveStalls === 2))
    fail(`stall-2-then-escalate (code=${r.code}, attempts=${j.n1?.attempts}, stalls=${j.n1?.consecutiveStalls})`);
  // 5. PROGRESSED extension (T31.7) — a node whose checkpoint keeps growing
  // extends past --max-retries (2, i.e. 3 base attempts) and succeeds on
  // attempt 5, under the tier-aware ceiling (12, no .model-context present).
  c = mkGrowingCase(5, null);
  r = await runSub(c.dir, ['--max-retries', '2', '--cmd', `node ${c.stub}`]);
  j = JSON.parse(readFileSync(join(c.dir, 'journal.json'), 'utf8'));
  if (!(r.code === 0 && j.n1.status === 'done' && j.n1.attempts === 5))
    fail(`progressed-extension (code=${r.code}, attempts=${j.n1?.attempts})`);
  // 6. Tier-aware ceiling hit while still PROGRESSED (T31.7) — a node that
  // keeps growing its checkpoint but never succeeds still stops at the
  // metered ceiling (6, forced via a docs/work/.model-context tier=large
  // fixture) rather than extending forever.
  c = mkGrowingCase(null, 'type=cloud\ntier=large\n');
  r = await runSub(c.dir, ['--max-retries', '2', '--cmd', `node ${c.stub}`]);
  j = JSON.parse(readFileSync(join(c.dir, 'journal.json'), 'utf8'));
  if (!(r.code === 4 && j.n1.status === 'escalated' && j.n1.attempts === 6 && j.n1.attemptCeiling === 6))
    fail(`ceiling-while-progressed (code=${r.code}, attempts=${j.n1?.attempts}, ceiling=${j.n1?.attemptCeiling})`);
  console.log('run-plan self-test PASS (escalate-success + escalate-fail + cap + stall-2-then-escalate + progressed-extension + tier-ceiling)');
  process.exit(0);
}

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
const sh = (cmd, args, timeoutMs, env) =>
  new Promise((res) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: env ?? process.env });
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

// Tier-aware attempt ceiling (O2 runtime fold, T31.7). Same
// docs/work/.model-context convention + defaults as fix-verify.mjs's R4
// classes (metered_ceiling 6 / local_ceiling 12, values overridable via the
// context file) — kept as a standalone read here (not imported) so this
// script has no cross-script dependency, matching the rest of the file's
// style. Deliberately reads the AMBIENT session tier (is this session itself
// running on a local model), never a node's own tier_needed — those are two
// different axes and conflating them would apply the wrong ceiling.
function readModelContext() {
  const contextFile = 'docs/work/.model-context';
  const defaults = { tier: 'unknown', metered_ceiling: 6, local_ceiling: 12 };
  if (!existsSync(contextFile)) return defaults;
  try {
    const ctx = {};
    for (const line of readFileSync(contextFile, 'utf8').split('\n')) {
      const [k, v] = line.split('=');
      if (k) ctx[k.trim()] = v?.trim();
    }
    return {
      tier: ctx.tier || defaults.tier,
      metered_ceiling: parseInt(ctx.metered_ceiling || defaults.metered_ceiling, 10),
      local_ceiling: parseInt(ctx.local_ceiling || defaults.local_ceiling, 10),
    };
  } catch {
    return defaults;
  }
}

function attemptCeiling() {
  const ctx = readModelContext();
  const t = ctx.tier;
  if (!t || t === 'unknown' || t.includes('local') || t.includes('small')) return ctx.local_ceiling;
  return ctx.metered_ceiling;
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
  entry.consecutiveStalls ??= 0;
  entry.lastCheckpointSize ??= 0;
  let tier = n.tier_needed ?? plan.executor_tier ?? 'small';
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(dirname(n.output), { recursive: true });

  // One dispatch attempt at the given tier. Returns true on valid output.
  const attemptOnce = async (curTier, attemptLabel) => {
    const timeoutMs = (TIMEOUTS[curTier] ?? TIMEOUTS.small) * 1000;
    const prompt = buildPrompt(n, entry.attempts);
    if (DRY) {
      console.log(`\n── [dry-run] ${n.id} (${n.agent}, tier=${curTier}, ${attemptLabel}) ──\n${prompt}`);
      entry.status = 'dry'; return true;
    }
    if (!(await healthCheck())) {
      console.error(`[run-plan] ${n.id}: model server down — stopping (resume with the same command)`);
      entry.status = 'blocked-backend'; saveJournal(); process.exit(4);
    }
    const parts = CMD_TEMPLATE.replace('{agent}', n.agent).split(' ');
    console.log(`[run-plan] ${n.id} → ${n.agent} (tier=${curTier}, ${attemptLabel}, timeout ${timeoutMs / 1000}s)`);
    entry.started = new Date().toISOString();
    const { err, stdout, stderr } = await sh(parts[0], [...parts.slice(1), prompt], timeoutMs,
      { ...process.env, RUN_PLAN_TIER: curTier });
    entry.attempts += 1;
    writeFileSync(join(LOG_DIR, `${n.id}.log`), `# ${attemptLabel} (tier=${curTier})\n## stdout\n${stdout}\n## stderr\n${stderr}\n## err\n${err ?? ''}\n`, { flag: 'a' });
    if (outputOk(n)) {
      entry.status = 'done';
      entry.finished = new Date().toISOString();
      entry.duration_s = Math.round((Date.parse(entry.finished) - Date.parse(entry.started)) / 1000);
      saveJournal();
      telemetry({ node: n.id, agent: n.agent, tier: curTier, status: 'done', attempts: entry.attempts, duration_s: entry.duration_s, prompt_chars: prompt.length, output_chars: stdout.length, tokens_out_est: Math.round(stdout.length / 4) });
      console.log(`[run-plan] ${n.id} ✓ done (${entry.duration_s}s, tier=${curTier}) → ${n.output}`);
      return true;
    }
    console.log(`[run-plan] ${n.id} ✗ no valid output (${attemptLabel})` + (err ? ` (${err.killed ? 'TIMEOUT' : 'error'})` : ''));
    entry.lastAttemptInfra = !!(err && err.killed);
    saveJournal();
    return false;
  };

  const ceiling = attemptCeiling();
  entry.attemptCeiling = ceiling;
  const checkpointPath = `${n.output}.checkpoint.md`;
  const checkpointSize = () => (existsSync(checkpointPath) ? statSync(checkpointPath).size : 0);

  for (;;) {
    const withinBase = entry.attempts <= MAX_RETRIES;
    const extending = !withinBase && entry.iterationClass === 'PROGRESSED' && entry.attempts < ceiling;
    if (!withinBase && !extending) break;
    if (entry.consecutiveStalls >= 2) break;

    const label = withinBase
      ? `attempt ${entry.attempts + 1}/${MAX_RETRIES + 1}`
      : `progressed-extension attempt ${entry.attempts + 1}/${ceiling}`;
    if (await attemptOnce(tier, label)) return true;
    if (DRY) return true;

    if (entry.lastAttemptInfra) continue; // infra event (timeout/kill): no stall/progress verdict

    const size = checkpointSize();
    if (size > entry.lastCheckpointSize) {
      entry.iterationClass = 'PROGRESSED';
      entry.consecutiveStalls = 0;
    } else {
      entry.iterationClass = 'STALLED';
      entry.consecutiveStalls += 1;
    }
    entry.lastCheckpointSize = size;
    saveJournal();
    if (entry.consecutiveStalls >= 2) {
      console.log(`[run-plan] ${n.id} STALLED twice in a row (no checkpoint growth) — escalating now`);
      break;
    }
  }

  // O2.4: auto-escalate — bump one tier and retry ONCE at the stronger tier.
  if (AUTO_ESCALATE) {
    const idx = TIER_ORDER.indexOf(tier);
    if (idx === -1 || idx >= TIER_ORDER.length - 1) {
      console.error(`[run-plan] ${n.id} auto-escalate: already at top tier (${tier}) — cannot bump`);
    } else if (escalationsUsed >= MAX_ESCALATIONS) {
      console.error(`[run-plan] ${n.id} auto-escalate: escalation cap ${MAX_ESCALATIONS} reached`);
    } else {
      const fromTier = tier, toTier = TIER_ORDER[idx + 1];
      escalationsUsed += 1;
      tier = toTier;
      console.log(`[run-plan] ${n.id} auto-escalate ${fromTier} → ${toTier} (${escalationsUsed}/${MAX_ESCALATIONS})`);
      const ok = await attemptOnce(toTier, `escalated attempt (${fromTier}→${toTier})`);
      entry.escalation = { fromTier, toTier, outcome: ok ? 'done' : 'escalated' };
      saveJournal();
      // loop-learn: teach the playbook which node types need the strong tier up front.
      const learn = join(SCRIPT_DIR, 'loop-learn.mjs');
      if (existsSync(learn)) {
        await sh(process.execPath, [learn,
          '--symptom', `run-plan node ${n.id} (${n.agent}) failed at tier=${fromTier}, ${ok ? 'succeeded' : 'still failed'} at ${toTier}`,
          '--root-cause', `node type '${n.agent}' under-tiered for this work`,
          '--rule', `plan ${n.agent} nodes at tier >= ${toTier} from the start`], 60000).catch(() => {});
      }
      if (ok) return true;
    }
  }

  entry.status = 'escalated';
  saveJournal();
  telemetry({ node: n.id, agent: n.agent, tier, status: 'escalated', attempts: entry.attempts });
  console.error(`[run-plan] ${n.id} ESCALATED after ${entry.attempts} attempt(s) — log: ${join(LOG_DIR, `${n.id}.log`)}`);
  console.error(`  Next: retry at a higher tier (edit tier_needed / --auto-escalate), run the node interactively, or fix inputs.`);
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
