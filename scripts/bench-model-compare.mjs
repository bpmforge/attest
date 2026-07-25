#!/usr/bin/env node
// bench-model-compare.mjs — head-to-head local-model comparison on three axes:
// SPEED, TOOL CALLING, and agentic OUTPUT QUALITY.
//
// Complements run-evals.mjs. That suite answers "is the pipeline still green?"
// per tier; this one answers "given a fixed memory budget, which local model
// should I actually run?" — the ch.06 economic question, one layer down.
//
// Why these three axes: a local model is only usable in the expert system if it
// (a) is fast enough to finish a phase, (b) can drive tools without derailing,
// and (c) produces work worth reading. A model can ace any one and be useless.
//
// Tiers:
//   A speed — direct LM Studio API, streamed. TTFT + generation tok/s across
//     three prompt sizes. No agent scaffold, so it measures the model, not us.
//   B tools — direct API tool-call battery, N repeats per scenario. Scores
//     hard-failure rate, tool selection, and argument extraction SEPARATELY:
//     "called the right tool with wrong args" is a different defect than
//     "emitted ungrammatical garbage", and they have different fixes.
//     Includes a no-tool-needed probe — over-calling is a real failure mode
//     that a battery of only positive cases will happily hide.
//   C quality — `opencode run` against evals/fixtures with PLANTED defects, so
//     accuracy is ground-truthed rather than vibed. Emits a blind grading
//     packet (models anonymized as A/B) for rubric scoring of detail and
//     level-of-work, which no assertion can capture.
//
// Usage:
//   node scripts/bench-model-compare.mjs --models a,b [--tier A,B,C]
//                                        [--repeats 3] [--base URL] [--keep]
//
// Lesson reused from run-evals.mjs: spawn `opencode run` with stdin IGNORED —
// an open stdin pipe makes it hang forever.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const REPO = join(dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = join(REPO, 'docs/work');

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);

const BASE = flag('--base', 'http://localhost:1234/v1');
const MODELS = (flag('--models') || '').split(',').filter(Boolean);
const TIERS = (flag('--tier', 'A,B,C')).split(',').map((s) => s.trim().toUpperCase());
const REPEATS = Number(flag('--repeats', '3'));
const KEEP = has('--keep');
// Tiers A/B hit the LM Studio API directly and use the bare model id; tier C
// goes through `opencode run -m`, which needs a provider-qualified id. Same
// model, two namespaces — keep them explicitly separate or tier C silently
// errors out in ~1s and reads as "the model scored zero".
const PROVIDER = flag('--provider', 'lmstudio');
const TASK_FILTER = flag('--task', null);
const opencodeId = (model) => `${PROVIDER}/${model}`;

if (MODELS.length < 2) {
  console.error('usage: --models <modelA>,<modelB> [--tier A,B,C] [--repeats N]');
  process.exit(2);
}

// ── Memory ───────────────────────────────────────────────────────────────────
// Two numbers matter and they are not the same. `weights_mb` is the static cost
// of having the model resident (what `lms ps` reports). `peak_rss_mb` is what it
// actually costs while working — weights plus KV cache, which grows with context
// and is the number that decides whether two models can be co-resident.
// MLX uses unified memory on Apple silicon, so runner RSS captures GPU use too.
//
// Sampling is only meaningful with ONE model loaded, hence soloLoad() below.
function runnerRssMB() {
  const r = spawnSync('sh', ['-c',
    `ps -Ao rss=,command= | grep '[.]lmstudio/.internal/utils/node' | awk '{s+=$1} END {print s+0}'`,
  ], { encoding: 'utf8' });
  return Math.round(Number((r.stdout || '0').trim()) / 1024);
}

function lmsPs() {
  const r = spawnSync('lms', ['ps', '--json'], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout || '[]'); } catch { return []; }
}

// Unload everything else so RSS attribution is unambiguous.
function soloLoad(model) {
  for (const m of lmsPs()) {
    if (m.identifier !== model) spawnSync('lms', ['unload', m.identifier], { stdio: 'ignore' });
  }
  if (!lmsPs().some((m) => m.identifier === model)) {
    spawnSync('lms', ['load', model, '-y'], { stdio: 'ignore', timeout: 600000 });
  }
  const info = lmsPs().find((m) => m.identifier === model) || {};
  const q = info.quantization;
  return {
    weights_mb: info.sizeBytes ? Math.round(info.sizeBytes / 1048576) : null,
    quantization: q && typeof q === 'object' ? (q.name ?? `${q.bits}bit`) : (q ?? null),
    params: info.paramsString ?? null,
    trained_for_tool_use: info.trainedForToolUse ?? null,
    context_length: info.contextLength ?? null,
    idle_rss_mb: runnerRssMB(),
  };
}

// Poll RSS while an async op runs; returns [result, peakMB].
async function withMemSampling(fn, intervalMs = 250) {
  let peak = runnerRssMB();
  const t = setInterval(() => { const v = runnerRssMB(); if (v > peak) peak = v; }, intervalMs);
  try { return [await fn(), peak]; } finally { clearInterval(t); }
}

// ── Tier A: speed ────────────────────────────────────────────────────────────
// Three sizes because prompt-processing and generation scale differently: a big
// model that generates slowly can still win overall if it needs fewer tokens to
// get there, and long-context prefill is where MoE/dense diverge most.
const FILLER = 'The nursery tracks seedling trays across greenhouses. ';
const SPEED_PROMPTS = [
  { id: 'short', prompt: 'In one sentence, what is a race condition?' },
  { id: 'medium', prompt: `${FILLER.repeat(120)}\n\nSummarize the passage above in exactly three bullet points.` },
  { id: 'long', prompt: `${FILLER.repeat(600)}\n\nSummarize the passage above in exactly three bullet points.` },
];

async function streamOnce(model, prompt, maxTokens = 220) {
  const t0 = performance.now();
  let ttft = null, genTokens = 0, text = '', usage = null;
  let res;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens, temperature: 0, stream: true,
        stream_options: { include_usage: true },
      }),
    });
  } catch (e) { return { error: `fetch: ${e.message}` }; }
  if (!res.ok) return { error: `http ${res.status}: ${(await res.text()).slice(0, 200)}` };

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      let j; try { j = JSON.parse(payload); } catch { continue; }
      if (j.error) return { error: String(j.error).slice(0, 200) };
      if (j.usage) usage = j.usage;
      const delta = j.choices?.[0]?.delta;
      const piece = (delta?.content || '') + (delta?.reasoning_content || '');
      if (piece) {
        if (ttft === null) ttft = performance.now() - t0;
        genTokens++; text += delta?.content || '';
      }
    }
  }
  const total = performance.now() - t0;
  // Prefer server-reported completion tokens; SSE chunks are not 1:1 with tokens.
  const outTokens = usage?.completion_tokens ?? genTokens;
  const genMs = ttft === null ? total : total - ttft;
  return {
    ttft_ms: ttft === null ? null : Math.round(ttft),
    total_ms: Math.round(total),
    out_tokens: outTokens,
    prompt_tokens: usage?.prompt_tokens ?? null,
    gen_tps: genMs > 0 ? +(outTokens / (genMs / 1000)).toFixed(2) : null,
    chars: text.length,
  };
}

async function tierSpeed(model) {
  const rows = [];
  for (const sp of SPEED_PROMPTS) {
    const runs = [];
    let peakRss = 0;
    for (let i = 0; i < REPEATS; i++) {
      process.stderr.write(`    speed/${sp.id} run ${i + 1}/${REPEATS}\r`);
      const [res, peak] = await withMemSampling(() => streamOnce(model, sp.prompt));
      runs.push(res);
      if (peak > peakRss) peakRss = peak;
    }
    const ok = runs.filter((r) => !r.error);
    const med = (k) => {
      const v = ok.map((r) => r[k]).filter((x) => typeof x === 'number').sort((a, b) => a - b);
      return v.length ? v[Math.floor(v.length / 2)] : null;
    };
    rows.push({
      size: sp.id, runs: runs.length, errors: runs.length - ok.length,
      error_detail: runs.find((r) => r.error)?.error ?? null,
      ttft_ms: med('ttft_ms'), gen_tps: med('gen_tps'),
      out_tokens: med('out_tokens'), prompt_tokens: ok[0]?.prompt_tokens ?? null,
      total_ms: med('total_ms'), peak_rss_mb: peakRss,
    });
  }
  return rows;
}

// ── Tier B: tool calling ─────────────────────────────────────────────────────
const TOOLS = [
  { type: 'function', function: { name: 'read_file', description: 'Read a file from disk', parameters: { type: 'object', properties: { path: { type: 'string', description: 'absolute path' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'list_dir', description: 'List files in a directory', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'convert_temp', description: 'Convert a temperature between units', parameters: { type: 'object', properties: { value: { type: 'number' }, from: { type: 'string', enum: ['c', 'f', 'k'] }, to: { type: 'string', enum: ['c', 'f', 'k'] } }, required: ['value', 'from', 'to'] } } },
  { type: 'function', function: { name: 'search_code', description: 'Search the codebase for a regex pattern', parameters: { type: 'object', properties: { pattern: { type: 'string' }, glob: { type: 'string' } }, required: ['pattern'] } } },
];

// Each scenario validates tool choice and arguments independently so the report
// can distinguish "picked wrong tool" from "picked right tool, mangled args".
const SCENARIOS = [
  { id: 'single_basic', messages: [{ role: 'user', content: 'List everything in the directory /var/log.' }], want: 'list_dir', args: (a) => a.path === '/var/log' },
  { id: 'select_among_4', messages: [{ role: 'user', content: 'Find every place the string TODO appears in the codebase.' }], want: 'search_code', args: (a) => typeof a.pattern === 'string' && /todo/i.test(a.pattern) },
  { id: 'arg_numeric_enum', messages: [{ role: 'user', content: 'Convert 37.5 degrees celsius into fahrenheit.' }], want: 'convert_temp', args: (a) => Number(a.value) === 37.5 && a.from === 'c' && a.to === 'f' },
  { id: 'arg_path_exact', messages: [{ role: 'user', content: 'Show me the contents of /etc/hosts please.' }], want: 'read_file', args: (a) => a.path === '/etc/hosts' },
  {
    id: 'chain_from_result', want: 'convert_temp', args: (a) => Number(a.value) === 14,
    messages: [
      { role: 'user', content: 'What is the weather in Paris?' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/weather/paris"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '{"temp_c":14,"cond":"rain"}' },
      { role: 'user', content: 'Convert that temperature to kelvin.' },
    ],
  },
  // Negative control: answering from knowledge is correct; any tool call is a defect.
  { id: 'no_tool_needed', messages: [{ role: 'user', content: 'What is the capital of France? Answer directly.' }], want: null },
];

async function toolOnce(model, sc) {
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: sc.messages, tools: TOOLS, max_tokens: 1600, temperature: 0 }),
    });
    const j = await res.json();
    if (j.error) return { outcome: 'HARD_FAIL', detail: String(j.error).slice(0, 160) };
    const msg = j.choices?.[0]?.message || {};
    const calls = msg.tool_calls || [];
    if (sc.want === null) {
      return calls.length === 0
        ? { outcome: 'PASS' }
        : { outcome: 'SPURIOUS_CALL', detail: calls[0]?.function?.name };
    }
    if (calls.length === 0) return { outcome: 'NO_CALL', detail: (msg.content || '').slice(0, 80) };
    const c = calls[0].function || {};
    if (c.name !== sc.want) return { outcome: 'WRONG_TOOL', detail: c.name };
    let a; try { a = JSON.parse(c.arguments || '{}'); } catch { return { outcome: 'BAD_JSON', detail: String(c.arguments).slice(0, 80) }; }
    return sc.args && !sc.args(a)
      ? { outcome: 'WRONG_ARGS', detail: JSON.stringify(a).slice(0, 120) }
      : { outcome: 'PASS' };
  } catch (e) { return { outcome: 'HARD_FAIL', detail: e.message.slice(0, 160) }; }
}

async function tierTools(model) {
  const rows = [];
  for (const sc of SCENARIOS) {
    const outs = [];
    for (let i = 0; i < REPEATS; i++) {
      process.stderr.write(`    tools/${sc.id} run ${i + 1}/${REPEATS}   \r`);
      outs.push(await toolOnce(model, sc));
    }
    rows.push({
      scenario: sc.id,
      pass: outs.filter((o) => o.outcome === 'PASS').length,
      n: outs.length,
      outcomes: outs.map((o) => o.outcome),
      detail: outs.find((o) => o.outcome !== 'PASS')?.detail ?? null,
    });
  }
  return rows;
}

// ── Tier C: agentic quality on ground-truthed fixtures ───────────────────────
// `verify` is objective (planted defects / a real test suite). Rubric scoring of
// detail and level-of-work happens outside, against the blind packet.
const TASKS = [
  {
    // scaffold: which agent condition this ran under. cashbox runs BARE (opencode's
    // default agent), security-audit runs SCAFFOLDED (a specialist). Do not average
    // the two into one "quality" number — that attributes a scaffold effect to the model.
    id: 'cashbox-fix', fixture: 'lemonade-cashbox', horizon: 'long', agent: null, scaffold: 'bare-default', timeout_ms: 1_800_000,
    prompt: 'The module cashbox.mjs in this directory has bugs: its test suite cashbox.test.mjs currently fails. Fix the implementations in cashbox.mjs so that ALL tests pass. Do not edit the test file.',
    verify: (dir) => {
      // Pin the TAP reporter: the default reporter varies by node version and
      // does not emit the `# pass/# fail` summary this parses.
      const r = spawnSync('node', ['--test', '--test-reporter=tap'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
      const out = `${r.stdout || ''}${r.stderr || ''}`;
      const pass = Number(/^# pass (\d+)/m.exec(out)?.[1] ?? 0);
      const fail = Number(/^# fail (\d+)/m.exec(out)?.[1] ?? 0);
      return { objective: `${pass} pass / ${fail} fail`, score: fail === 0 && pass > 0 ? 1 : 0, pass, fail };
    },
  },
  {
    id: 'security-audit', fixture: 'flask-sqli', horizon: 'short', agent: 'security-auditor', scaffold: 'specialist', timeout_ms: 900_000,
    prompt: 'Run a quick security audit of this repository. Write findings to docs/reviews/SECURITY_FINDINGS.md using the standard finding schema. Then stop.',
    verify: (dir) => {
      const f = join(dir, 'docs/reviews/SECURITY_FINDINGS.md');
      if (!existsSync(f)) return { objective: 'no report written', score: 0 };
      const t = readFileSync(f, 'utf8').toLowerCase();
      // Defect 2 is a hardcoded RSA PRIVATE key (see the fixture README), not an
      // API key — match the words a correct report would actually use, or a model
      // that found it gets marked MISSED.
      const sqli = /sql injection|sqli|f-string|parameteriz|tainted/.test(t);
      const key = /private key|rsa|hardcoded|secret|credential|deploy_key/.test(t);
      return {
        objective: `sqli=${sqli ? 'found' : 'MISSED'} hardcoded-key=${key ? 'found' : 'MISSED'}`,
        score: (sqli ? 0.5 : 0) + (key ? 0.5 : 0), bytes: t.length,
      };
    },
  },
];

const timedOutish = (r) => r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM';

function runTask(model, task) {
  const src = join(REPO, 'evals/fixtures', task.fixture);
  if (!existsSync(src)) return { skipped: 'fixture missing' };
  // Stage INSIDE the repo. opencode auto-rejects `external_directory` file
  // access, so a fixture under $TMPDIR makes every specialist agent fail to read
  // its own working tree — which reads as "the model produced nothing" when it
  // never got permission to look. Measured: both models scored 0 on the security
  // task purely from this, until the fixture moved in-repo.
  const stage = join(REPO, '.tmp-bench');
  mkdirSync(stage, { recursive: true });
  const dir = mkdtempSync(join(stage, `${task.fixture}-`));
  cpSync(src, dir, { recursive: true });
  const args = ['run', '--dir', dir, '-m', opencodeId(model)];
  if (task.agent) args.push('--agent', task.agent);
  args.push(task.prompt);
  const t0 = performance.now();
  const r = spawnSync('opencode', args, {
    encoding: 'utf8', timeout: task.timeout_ms,
    stdio: ['ignore', 'pipe', 'pipe'],  // stdin IGNORED or opencode hangs forever
  });
  const ms = Math.round(performance.now() - t0);
  // opencode writes assistant prose to stdout but tool-progress lines to STDERR.
  // Count tool activity from the merged stream or it is always 0.
  const stdout = `${r.stdout || ''}${r.stderr || ''}`;
  const stderr = r.stderr || '';
  // A run that dies instantly produced no work; scoring it as a 0 would blame
  // the model for a harness fault. Surface it as INVOCATION_ERROR instead.
  if (!timedOutish(r) && ms < 5000 && !/[✱→]/.test(stdout)) {
    const why = `${stdout}${stderr}`.slice(0, 300).replace(/\s+/g, ' ').trim();
    if (!KEEP) rmSync(dir, { recursive: true, force: true });
    return { task: task.id, horizon: task.horizon, ms, invocation_error: why || 'exited immediately with no tool activity', score: null, objective: 'INVOCATION_ERROR' };
  }
  const timedOut = timedOutish(r);
  // opencode prints one line per tool invocation; a proxy for how much real
  // work the model actually drove, as opposed to how much prose it produced.
  // Strip ANSI FIRST: opencode emits `\x1b[0m✱ \x1b[0mGlob "*"`, so anchoring
  // on `^\s*[✱→]` against raw stdout matches nothing and silently reports 0.
  const plain = stdout.replace(/\x1b\[[0-9;]*m/g, '');
  const toolLines = (plain.match(/^\s*[✱→]\s*\S+/gm) || []).length;
  const v = timedOut ? { objective: 'TIMEOUT', score: 0 } : task.verify(dir);
  const out = {
    task: task.id, horizon: task.horizon, scaffold: task.scaffold, ms, timedOut,
    tool_invocations: toolLines, stdout_bytes: stdout.length,
    ...v, transcript: stdout.slice(-6000),
  };
  if (!KEEP) rmSync(dir, { recursive: true, force: true }); else out.dir = dir;
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────────
const results = { generated: new Date().toISOString(), base: BASE, repeats: REPEATS, models: {} };

for (const model of MODELS) {
  console.error(`\n▶ ${model}`);
  console.error('  loading solo (unloading others so RSS is attributable)…');
  const mem = soloLoad(model);
  console.error(`    weights ${mem.weights_mb}MB  quant=${mem.quantization}  idle rss ${mem.idle_rss_mb}MB`);
  const m = { memory: mem, speed: null, tools: null, quality: null };
  if (TIERS.includes('A')) { console.error('  tier A — speed'); m.speed = await tierSpeed(model); }
  if (TIERS.includes('B')) { console.error('  tier B — tool calling'); m.tools = await tierTools(model); }
  if (TIERS.includes('C')) {
    console.error('  tier C — agentic quality');
    m.quality = [];
    // Tier C MUST honor --repeats. Observed 2026-07-25: cashbox-fix flipped from
    // 6/6 to 0/6 for the SAME model between two N=1 runs — run-to-run variance
    // exceeds the between-model difference, so a single sample per cell measures
    // nothing. Report a fraction over repeats, never a single outcome.
    for (const t of TASKS) {
      if (TASK_FILTER && t.id !== TASK_FILTER) continue;
      for (let i = 0; i < REPEATS; i++) {
        console.error(`    ${t.id} [${i + 1}/${REPEATS}] (up to ${Math.round(t.timeout_ms / 60000)}m)…`);
        const r = runTask(model, t);
        r.repeat = i + 1;
        console.error(`      → ${r.objective ?? r.skipped} in ${r.ms ?? '–'}ms, ${r.tool_invocations ?? '–'} tool calls`);
        m.quality.push(r);
      }
    }
  }
  results.models[model] = m;
}

mkdirSync(OUT_DIR, { recursive: true });
const jsonPath = join(OUT_DIR, 'BENCH_MODEL_COMPARE.json');
// Tiers are usually run in separate invocations (A/B are cheap, C is not), so
// MERGE per model/tier instead of overwriting — a plain write would silently
// drop the speed numbers the moment you re-ran tier C alone.
let merged = results;
if (existsSync(jsonPath)) {
  try {
    const prev = JSON.parse(readFileSync(jsonPath, 'utf8'));
    merged = { ...prev, ...results, models: { ...prev.models } };
    for (const [model, m] of Object.entries(results.models)) {
      merged.models[model] = { ...(prev.models?.[model] || {}) };
      for (const [tier, val] of Object.entries(m)) {
        if (val !== null && val !== undefined) merged.models[model][tier] = val;
      }
    }
  } catch { /* unreadable prior file — fall back to a clean write */ }
}
writeFileSync(jsonPath, `${JSON.stringify(merged, null, 2)}\n`);

// Blind grading packet: models anonymized so rubric scoring of detail /
// level-of-work is not anchored by knowing which model produced which output.
if (TIERS.includes('C')) {
  const letters = ['A', 'B', 'C', 'D'];
  const key = {}; let blind = '# Blind grading packet\n\nScore each on accuracy, detail, level of work (1-5).\n';
  MODELS.forEach((m, i) => {
    key[letters[i]] = m;
    for (const q of results.models[m].quality || []) {
      blind += `\n\n## Candidate ${letters[i]} — task ${q.task}\nobjective: ${q.objective ?? q.skipped}\ntool_invocations: ${q.tool_invocations}\nduration_ms: ${q.ms}\n\n\`\`\`\n${(q.transcript || '').slice(-4000)}\n\`\`\`\n`;
    }
  });
  writeFileSync(join(OUT_DIR, 'BENCH_BLIND_PACKET.md'), blind);
  writeFileSync(join(OUT_DIR, 'BENCH_BLIND_KEY.json'), `${JSON.stringify(key, null, 2)}\n`);
}

console.error(`\nwrote ${jsonPath}`);
for (const [model, m] of Object.entries(results.models)) {
  console.log(`\n=== ${model}`);
  if (m.memory) console.log(`  mem   weights=${m.memory.weights_mb}MB quant=${m.memory.quantization} idle_rss=${m.memory.idle_rss_mb}MB tool_trained=${m.memory.trained_for_tool_use}`);
  if (m.speed) for (const s of m.speed) console.log(`  speed ${s.size.padEnd(6)} ttft=${String(s.ttft_ms).padStart(6)}ms  gen=${String(s.gen_tps).padStart(6)} tok/s  peak_rss=${String(s.peak_rss_mb).padStart(6)}MB  (prompt ${s.prompt_tokens} tok, errors ${s.errors})`);
  if (m.tools) {
    const tot = m.tools.reduce((a, r) => a + r.pass, 0);
    const n = m.tools.reduce((a, r) => a + r.n, 0);
    console.log(`  tools ${tot}/${n} pass`);
    for (const r of m.tools) if (r.pass < r.n) console.log(`     ✗ ${r.scenario}: ${r.outcomes.join(',')} ${r.detail ?? ''}`);
  }
  if (m.quality) for (const q of m.quality) console.log(`  qual  ${String(q.task).padEnd(15)} ${q.objective ?? q.skipped} (${q.ms}ms, ${q.tool_invocations} tool calls)`);
}
