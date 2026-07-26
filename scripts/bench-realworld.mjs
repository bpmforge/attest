#!/usr/bin/env node
// bench-realworld.mjs — drive both models through the real bpm expert pipeline
// on a real client brief, end to end, and grade the result objectively.
//
// See evals/realworld/tool-library/PLAN.md for the design. In short: the model
// gets BRIEF.md + CONTRACT.md and nothing else, runs requirements -> research ->
// design -> implement -> test -> review as separate specialist sessions, and is
// then scored against a 25-test HIDDEN acceptance suite it never sees.
//
// Every lesson from docs/BENCH_LOCAL_MODEL_COMPARISON.md is wired in:
//   - workcopies staged IN-REPO (opencode auto-rejects external_directory)
//   - provider-qualified model ids (bare ids exit in ~1s and look like a 0 score)
//   - tool counting matches ⚙ (MCP) and ✗ (failed), not just ✱/→
//   - fresh session per phase — the documented local-model usage
//   - a phase that dies without output is INVOCATION_ERROR, never a score
//
// Usage:
//   node scripts/bench-realworld.mjs --models a,b [--impl-repeats 2] [--phase P2,...]

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const REPO = join(dirname(new URL(import.meta.url).pathname), '..');
const PROJ = join(REPO, 'evals/realworld/tool-library');
const HIDDEN = join(PROJ, '.hidden');
const STAGE = join(REPO, '.tmp-realworld');
const OUT = join(REPO, 'docs/work');

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const MODELS = (flag('--models') || '').split(',').filter(Boolean);
const PROVIDER = flag('--provider', 'lmstudio');
const IMPL_REPEATS = Number(flag('--impl-repeats', '2'));
const ONLY = flag('--phase', null)?.split(',').map((s) => s.trim());
if (!MODELS.length) { console.error('usage: --models a,b'); process.exit(2); }

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const cnt = (s, re) => (s.match(re) || []).length;

// ── phases ───────────────────────────────────────────────────────────────────
// Each runs as its OWN opencode session (fresh context), matching LOCAL_LLM_GUIDE.
const PHASES = [
  {
    // NOT sdlc-lead: that is the top-level ORCHESTRATOR (mode:primary, 44 handoff
    // refs) whose job is to route work to specialists, and whose mandatory startup
    // sequence reads scripts/detect-sdlc-state.sh + docs/work/SDLC_AUDIT.md — neither
    // of which exists in a clean project workcopy. Pointed at a single unattended
    // session it burns 2 probe calls, finds no pipeline state, and writes nothing.
    // Measured: 38.6s, 0/2 artifacts — which reads as "the model cannot do
    // requirements" and is purely an agent-selection error.
    //
    // Nor sdlc-init-phases-0-2: that one is mode:subagent, and `opencode run
    // --agent <subagent>` FALLS BACK to the default agent — and the fallback path
    // LOSES --dir. It then read from and wrote into the expert repo itself rather
    // than the workcopy. Use the default agent here: it honours --dir (proven) and
    // the prompt fully specifies the deliverable.
    id: 'P2-requirements', agent: null, timeout: 1_500_000,
    prompt: 'Read BRIEF.md and CONTRACT.md. Produce docs/SRS.md (IEEE 830 style, numbered FR-NNN requirements covering every business rule) and docs/USER_STORIES.md. Explicitly call out any rules in the brief that are ambiguous or that conflict with each other, in an "Open Questions" section of SRS.md. Then stop.',
    artifacts: ['docs/SRS.md', 'docs/USER_STORIES.md'],
  },
  {
    // Deliberately research-dependent: it cannot be answered from the brief, and
    // the correct answer depends on the CURRENT state of the ecosystem. This is
    // where MCP/web use is measured rather than assumed.
    id: 'P3-research', agent: 'researcher', timeout: 1_500_000,
    prompt: 'For this Node.js service we must do date arithmetic (adding days to ISO dates, counting days between dates) and integer-pence money arithmetic, with zero floating-point error and deterministic behaviour. Research the CURRENT recommended approach: is a date library warranted or is built-in Temporal/Date sufficient, and what is the present status of the Temporal API in Node? Note anything deprecated or recently changed. Write docs/RESEARCH_DATE_MONEY.md with a recommendation and cite every source as a full URL. Then stop.',
    artifacts: ['docs/RESEARCH_DATE_MONEY.md'],
    verifySources: true,
  },
  {
    id: 'P3-design', agent: 'architecture-designer', timeout: 1_500_000,
    prompt: 'Read BRIEF.md, CONTRACT.md and docs/SRS.md. Produce docs/ARCHITECTURE.md (module boundaries, data model, Mermaid diagram) and docs/THREAT_MODEL.md (STRIDE, covering who may call each contract method). Then stop.',
    artifacts: ['docs/ARCHITECTURE.md', 'docs/THREAT_MODEL.md'],
  },
  {
    id: 'P4-implement', agent: 'coding-agent', timeout: 2_400_000, repeats: true,
    prompt: 'Implement the service in src/library.mjs exactly per CONTRACT.md, satisfying every rule in BRIEF.md and every FR in docs/SRS.md. It must export createLibrary(seed) and the seven methods with the documented reason codes. All money is integer pence. Never read the system clock — dates are passed in. Do not create any other entry point. Then stop.',
    artifacts: ['src/library.mjs'],
    scored: true,
  },
  {
    id: 'P5-tests', agent: 'test-engineer', timeout: 1_800_000,
    prompt: 'Write a test suite at tests/library.test.mjs using node:test that covers the business rules in BRIEF.md and docs/SRS.md against src/library.mjs. Then run it and report the pass/fail count. Then stop.',
    artifacts: ['tests/library.test.mjs'],
  },
  {
    id: 'P6-review', agent: 'code-reviewer', timeout: 1_800_000,
    prompt: 'Review src/library.mjs against BRIEF.md, CONTRACT.md and docs/SRS.md. Write docs/reviews/CODE_REVIEW.md listing every defect you find, each with file:line and why it matters. Be specific about any business rule implemented incorrectly. Then stop.',
    artifacts: ['docs/reviews/CODE_REVIEW.md'],
  },
  {
    id: 'P6-security', agent: 'security-auditor', timeout: 1_500_000,
    prompt: 'Security-audit src/library.mjs against CONTRACT.md. The trustees require that non-staff can never set maintenance or waive a fee. Write docs/reviews/SECURITY_FINDINGS.md. Then stop.',
    artifacts: ['docs/reviews/SECURITY_FINDINGS.md'],
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────
function runPhase(dir, model, phase, label) {
  const args = ['run', '--dir', dir, '-m', `${PROVIDER}/${model}`];
  if (phase.agent) args.push('--agent', phase.agent);
  args.push(phase.prompt);
  const t0 = performance.now();
  const r = spawnSync('opencode', args, {
    encoding: 'utf8', timeout: phase.timeout, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, OPENCODE_AUTONOMY: 'auto' },
  });
  const secs = +((performance.now() - t0) / 1000).toFixed(1);
  const out = strip(`${r.stdout || ''}${r.stderr || ''}`);
  const timedOut = r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM';
  const tools = cnt(out, /^\s*[⚙✱→✗↓]\s*\S+/gm);
  const rec = {
    phase: phase.id, label, secs, timedOut,
    tools, mcp: cnt(out, /^\s*[⚙✗]\s*\S+/gm), failed: cnt(out, /^\s*✗\s*\S+/gm),
    artifacts: Object.fromEntries(phase.artifacts.map((a) => [a, existsSync(join(dir, a))])),
    transcript: out.slice(-4000),
  };
  // Dead-fast exit with no tool activity is a harness fault, not a model score.
  if (!timedOut && secs < 5 && tools === 0) rec.invocation_error = out.slice(0, 300).replace(/\s+/g, ' ');
  // A subagent passed to --agent silently falls back to the default agent AND the
  // fallback loses --dir, so the phase runs against the wrong tree. Never score it.
  if (/is a subagent, not a primary agent/.test(out)) {
    rec.invocation_error = `agent "${phase.agent}" is a subagent; opencode fell back to the default agent and lost --dir`;
  }
  // Belt and braces: if the session touched the expert repo instead of the
  // workcopy, the result is about the wrong files entirely.
  if (out.includes(`${REPO}/docs/`) && !dir.startsWith(join(REPO, '.tmp-realworld'))) {
    rec.invocation_error = 'session escaped the workcopy and wrote into the expert repo';
  }
  return rec;
}

// Objective research-quality check: do the cited URLs actually exist?
// Catches the failure mode where a model emits a plausible citation it never fetched.
function verifySources(dir, file) {
  const p = join(dir, file);
  if (!existsSync(p)) return null;
  const urls = [...new Set((readFileSync(p, 'utf8').match(/https?:\/\/[^\s)\]<>"'`]+/g) || [])
    .map((u) => u.replace(/[.,;]+$/, '')))];
  const checked = urls.slice(0, 12).map((u) => {
    // Send a browser UA: npmjs/gitlab/cloudflare answer bare curl with 403 even
    // for pages that plainly exist.
    const r = spawnSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '-L',
      '--max-time', '15', '--retry', '1', '-A',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      u], { encoding: 'utf8' });
    return { url: u, status: (r.stdout || '000').trim() };
  });
  // THREE outcomes, not two. 403/429 means the host refused to answer a script —
  // that is NOT evidence the page is fabricated. Only 404/410/000 is. Collapsing
  // "blocked" into "dead" scored three real npm packages as invented citations.
  const is = (c, re) => re.test(c.status);
  return {
    total: urls.length, checked: checked.length,
    live: checked.filter((c) => is(c, /^2|^3/)).length,
    blocked: checked.filter((c) => is(c, /^(403|429)$/)).map((c) => `${c.status} ${c.url}`),
    dead: checked.filter((c) => !is(c, /^2|^3/) && !is(c, /^(403|429)$/)).map((c) => `${c.status} ${c.url}`),
  };
}

// The grade that matters: a suite the model never saw.
function scoreHidden(dir) {
  const lib = join(dir, 'src/library.mjs');
  if (!existsSync(lib)) return { ran: false, why: 'src/library.mjs missing', pass: 0, fail: 0, total: 25 };
  const r = spawnSync('node', ['--test', '--test-reporter=tap', join(HIDDEN, 'acceptance.test.mjs')], {
    encoding: 'utf8', timeout: 180000, cwd: HIDDEN, env: { ...process.env, LIB_PATH: lib },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const pass = Number(/^# pass (\d+)/m.exec(out)?.[1] ?? 0);
  const fail = Number(/^# fail (\d+)/m.exec(out)?.[1] ?? 0);
  const failed = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
  return { ran: pass + fail > 0, pass, fail, total: pass + fail, failedTests: failed, stderr: out.slice(0, 400) };
}

function newWorkcopy(name) {
  const dir = join(STAGE, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const f of ['BRIEF.md', 'CONTRACT.md']) cpSync(join(PROJ, f), join(dir, f));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, type: 'module', private: true }, null, 2));
  return dir;
}

// ── run ──────────────────────────────────────────────────────────────────────
mkdirSync(STAGE, { recursive: true });
const results = { generated: new Date().toISOString(), models: {} };

for (const model of MODELS) {
  const slug = model.replace(/[^a-z0-9]+/gi, '-');
  console.error(`\n████ ${model}`);
  const m = { phases: [], impl: [], research: null };

  const dir = newWorkcopy(slug);
  for (const phase of PHASES) {
    if (ONLY && !ONLY.includes(phase.id)) continue;

    if (phase.repeats) {
      // N>=2 on the scored phase. Each repeat is an independent workcopy carrying
      // the SAME upstream docs, so implementation variance is isolated.
      for (let i = 0; i < IMPL_REPEATS; i++) {
        const rdir = join(STAGE, `${slug}-impl${i + 1}`);
        rmSync(rdir, { recursive: true, force: true });
        cpSync(dir, rdir, { recursive: true });
        console.error(`  ▸ ${phase.id} [${i + 1}/${IMPL_REPEATS}]…`);
        const rec = runPhase(rdir, model, phase, `impl${i + 1}`);
        rec.hidden = scoreHidden(rdir);
        rec.dir = rdir;
        console.error(`     ${rec.secs}s tools=${rec.tools} mcp=${rec.mcp} → hidden ${rec.hidden.pass}/${rec.hidden.total || 25}`);
        m.impl.push(rec);
        m.phases.push(rec);
      }
      // Best implementation carries forward into test/review phases.
      const best = [...m.impl].sort((a, b) => (b.hidden?.pass ?? 0) - (a.hidden?.pass ?? 0))[0];
      if (best?.dir) { rmSync(dir, { recursive: true, force: true }); cpSync(best.dir, dir, { recursive: true }); }
      continue;
    }

    console.error(`  ▸ ${phase.id}…`);
    const rec = runPhase(dir, model, phase, phase.id);
    if (phase.verifySources) { rec.sources = verifySources(dir, phase.artifacts[0]); m.research = rec.sources; }
    const made = Object.values(rec.artifacts).filter(Boolean).length;
    console.error(`     ${rec.secs}s tools=${rec.tools} mcp=${rec.mcp} failed=${rec.failed} artifacts=${made}/${phase.artifacts.length}` +
      (rec.sources ? ` sources ${rec.sources.live}/${rec.sources.checked} live` : '') +
      (rec.invocation_error ? '  ⚠ INVOCATION_ERROR' : ''));
    m.phases.push(rec);
  }

  m.finalDir = dir;
  results.models[model] = m;
}

mkdirSync(OUT, { recursive: true });
// MERGE per model, never overwrite. Phases are routinely run in separate
// invocations (--phase / --models subsets); a plain write silently discards the
// other model's results — which is exactly what happened to the 9B's P2/P3 data.
// Same bug already fixed in bench-model-compare.mjs; fixed here too.
const outPath = join(OUT, 'BENCH_REALWORLD.json');
let merged = results;
if (existsSync(outPath)) {
  try {
    const prev = JSON.parse(readFileSync(outPath, 'utf8'));
    merged = { ...prev, ...results, models: { ...prev.models, ...results.models } };
  } catch { /* unreadable prior file — clean write */ }
}
writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`);
console.error(`\nwrote ${join(OUT, 'BENCH_REALWORLD.json')}`);

console.log('\nmodel                     phase              secs   tools  mcp  failed  artifacts  hidden');
for (const [model, m] of Object.entries(results.models)) {
  for (const p of m.phases) {
    const made = Object.values(p.artifacts).filter(Boolean).length;
    const tot = Object.keys(p.artifacts).length;
    console.log(`${model.padEnd(25)} ${String(p.label).padEnd(18)} ${String(p.secs).padStart(6)} ${String(p.tools).padStart(6)} ${String(p.mcp).padStart(4)} ${String(p.failed).padStart(7)} ${String(`${made}/${tot}`).padStart(10)}  ${p.hidden ? `${p.hidden.pass}/${p.hidden.total || 25}` : ''}${p.invocation_error ? ' ⚠' : ''}`);
  }
  const total = m.phases.reduce((a, p) => a + p.secs, 0);
  console.log(`${''.padEnd(25)} ${'TOTAL'.padEnd(18)} ${String(total.toFixed(1)).padStart(6)}`);
}
