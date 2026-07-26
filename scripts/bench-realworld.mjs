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

import { spawn, spawnSync } from 'node:child_process';
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
// Resume against an existing workcopy instead of wiping it. Phases build on each
// other (implement reads SRS + design), so a --phase subset run MUST be able to
// keep prior phases' artifacts or it silently destroys the upstream work and
// grades the model on inputs it never received.
const RESUME = argv.includes('--resume');
if (!MODELS.length && !argv.includes('--self-test')) { console.error('usage: --models a,b [--self-test]'); process.exit(2); }

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

// TOOL-SURFACE SCOPING. A full session exposes ~80 tools across 5 MCP servers.
// Measured 2026-07-26: given that surface, a model spent 702s of its IMPLEMENTATION
// phase driving Playwright (33 browser artifacts) to write a Node module, and
// another burned 77 tool calls / 31 failures thrashing. Selection degrades with
// surface area, so scope the surface to the phase: an implementation phase has no
// business seeing a browser.
//
// Implemented by generating a filtered opencode config per phase and pointing
// OPENCODE_CONFIG at it — no model cooperation required.
function phaseConfig(phase) {
  const allow = phase.mcp ?? [];
  const userCfgPath = join(process.env.HOME, '.config/opencode/opencode.json');
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(userCfgPath, 'utf8')); } catch { return null; }
  const mcp = {};
  for (const [name, def] of Object.entries(cfg.mcp || {})) {
    mcp[name] = { ...def, enabled: allow.includes(name) };
  }
  cfg.mcp = mcp;
  // Custom tools in ~/.config/opencode/tools/ are NOT MCP, so the filter above
  // cannot reach them — playwright_web/playwright_test survive it, and
  // playwright_web is the exact tool that burned 702s of an implementation phase.
  // The `tools` disable map is best-effort: verified the config still loads, not
  // verified to remove them. MCP filtering is the measured win (80 -> 29 tools).
  if (!allow.includes('playwright-mcp')) {
    cfg.tools = { ...(cfg.tools || {}), playwright_web: false, playwright_test: false };
  }
  const dir = join(STAGE, '_cfg');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${phase.id}.json`);
  writeFileSync(out, JSON.stringify(cfg, null, 2));
  return out;
}
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
    id: 'P2-requirements', agent: null, timeout: 1_500_000, mcp: [],
    prompt: 'Read BRIEF.md and CONTRACT.md. Produce docs/SRS.md (IEEE 830 style, numbered FR-NNN requirements covering every business rule) and docs/USER_STORIES.md. Explicitly call out any rules in the brief that are ambiguous or that conflict with each other, in an "Open Questions" section of SRS.md. Then stop.',
    artifacts: ['docs/SRS.md', 'docs/USER_STORIES.md'],
  },
  {
    // Deliberately research-dependent: it cannot be answered from the brief, and
    // the correct answer depends on the CURRENT state of the ecosystem. This is
    // where MCP/web use is measured rather than assumed.
    id: 'P3-research', agent: 'researcher', timeout: 1_500_000, mcp: ['context7', 'playwright-search'],
    prompt: 'For this Node.js service we must do date arithmetic (adding days to ISO dates, counting days between dates) and integer-pence money arithmetic, with zero floating-point error and deterministic behaviour. Research the CURRENT recommended approach: is a date library warranted or is built-in Temporal/Date sufficient, and what is the present status of the Temporal API in Node? Note anything deprecated or recently changed. Write docs/RESEARCH_DATE_MONEY.md with a recommendation and cite every source as a full URL. Then stop.',
    artifacts: ['docs/RESEARCH_DATE_MONEY.md'],
    verifySources: true,
  },
  {
    id: 'P3-design', agent: 'architecture-designer', timeout: 1_500_000, mcp: ['context7'],
    prompt: 'Read BRIEF.md, CONTRACT.md and docs/SRS.md. Produce docs/ARCHITECTURE.md (module boundaries, data model, Mermaid diagram) and docs/THREAT_MODEL.md (STRIDE, covering who may call each contract method). Then stop.',
    artifacts: ['docs/ARCHITECTURE.md', 'docs/THREAT_MODEL.md'],
  },
  {
    id: 'P4-implement', agent: 'coding-agent', timeout: 2_400_000, repeats: true, mcp: ['context7'],
    prompt: 'Implement the service in src/library.mjs exactly per CONTRACT.md, satisfying every rule in BRIEF.md and every FR in docs/SRS.md. It must export createLibrary(seed) and the seven methods with the documented reason codes. All money is integer pence. Never read the system clock — dates are passed in. Do not create any other entry point. Then stop.',
    artifacts: ['src/library.mjs'],
    scored: true,
  },
  {
    id: 'P5-tests', agent: 'test-engineer', timeout: 1_800_000, mcp: [],
    prompt: 'Write a test suite at tests/library.test.mjs using node:test that covers the business rules in BRIEF.md and docs/SRS.md against src/library.mjs. Then run it and report the pass/fail count. Then stop.',
    artifacts: ['tests/library.test.mjs'],
  },
  {
    id: 'P6-review', agent: 'code-reviewer', timeout: 1_800_000, mcp: [],
    prompt: 'Review src/library.mjs against BRIEF.md, CONTRACT.md and docs/SRS.md. Write docs/reviews/CODE_REVIEW.md listing every defect you find, each with file:line and why it matters. Be specific about any business rule implemented incorrectly. Then stop.',
    artifacts: ['docs/reviews/CODE_REVIEW.md'],
  },
  {
    id: 'P6-security', agent: 'security-auditor', timeout: 1_500_000, mcp: [],
    prompt: 'Security-audit src/library.mjs against CONTRACT.md. The trustees require that non-staff can never set maintenance or waive a fee. Write docs/reviews/SECURITY_FINDINGS.md. Then stop.',
    artifacts: ['docs/reviews/SECURITY_FINDINGS.md'],
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────

// Declared INPUTS per phase (the artifact gate). A phase whose inputs are absent is
// BLOCKED, never run-and-scored: an absent finding from a phase that had nothing to
// read is missing data, not a capability signal. Function declaration, not a const
// arrow — it is referenced from the main loop above its definition point.
const UPSTREAM = {
  'P3-design': ['docs/SRS.md'],
  'P4-implement': ['docs/SRS.md'],
  'P5-tests': ['src/library.mjs'],
  'P6-review': ['src/library.mjs'],
  'P6-security': ['src/library.mjs'],
};
function requiredUpstream(phase) { return UPSTREAM[phase.id] || []; }

// PROCESS FIDELITY (PLAN.md §B — promised, previously not implemented). The real
// system gates each phase with scripts/validators/validate-phase-gate.sh. Checking
// only "did a file appear" measures far less than the gate does: the 27B's Phase 2
// output existed, read well, and still failed the gate on missing USE_CASES.md,
// a missing REQUIREMENTS_MATRIX.md and untraceable user stories.
//
// Gaps are split. `phase-ordering` gaps come from deliberately skipping Phases 0-1
// and are NOT model deficiencies; content gaps are.
const GATE_FOR = { 'P2-requirements': 'phase-2', 'P3-design': 'phase-3', 'P4-implement': 'phase-4' };

function runGate(dir, phase) {
  const gate = GATE_FOR[phase.id];
  if (!gate) return null;
  const r = spawnSync('bash', [join(REPO, 'scripts/validators/validate-phase-gate.sh'), gate, dir],
    { encoding: 'utf8', timeout: 180000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const m = /\{"validator":"validate-phase-gate".*\}/.exec(out);
  if (!m) return { gate, error: 'no JSON summary emitted' };
  try {
    const j = JSON.parse(m[0]);
    const items = j.items || [];
    const ordering = items.filter((i) => i.category === 'phase-ordering');
    const content = items.filter((i) => i.category !== 'phase-ordering');
    return {
      gate, passed: j.exit === 0, gaps_total: j.gaps,
      gaps_content: content.length, gaps_ordering: ordering.length,
      content_detail: content.map((i) => `${i.category}: ${String(i.detail).slice(0, 110)}`),
    };
  } catch { return { gate, error: 'unparseable gate JSON' }; }
}

// LIVELOCK WATCHDOG. Measured 2026-07-26: a model emitted `Write` with a missing
// `filePath` argument, received the same error, and retried IDENTICALLY 12+ times
// until the 2400s timeout — 40 minutes of wall-clock for zero progress.
//
// LOOP_PREVENTION.md and PERSISTENCE.md already cover this, but both are
// PROMPT-side ("read this once at the start"). The agent never loaded them, and a
// heavily-quantized model may not obey them if it does. A mechanical detector
// works regardless of whether the model can follow instructions — which is the
// entire argument for fixing process rather than prompts.
//
// Reported as LIVELOCK: not a TIMEOUT (which implies "needed more time" — it did
// not) and never a score.
const LIVELOCK_REPEATS = 6;

function runPhase(dir, model, phase, label) {
  return new Promise((resolve) => {
    const args = ['run', '--dir', dir, '-m', `${PROVIDER}/${model}`];
    if (phase.agent && !BARE) args.push('--agent', phase.agent);
    args.push(phase.prompt);
    const t0 = performance.now();
    const cfgPath = phaseConfig(phase);
    const proc = spawn('opencode', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        OPENCODE_AUTONOMY: 'auto',
        ...(cfgPath ? { OPENCODE_CONFIG: cfgPath } : {}),
      },
    });
    let buf = '', lastErr = null, repeats = 0, livelocked = null;
    const onData = (chunk) => {
      const text = strip(String(chunk));
      buf += text;
      for (const line of text.split('\n')) {
        const m = /ERROR:\s*(.+)/.exec(line);
        if (!m) continue;
        const sig = m[1].trim().slice(0, 120);
        if (sig === lastErr) {
          if (++repeats >= LIVELOCK_REPEATS && !livelocked) { livelocked = sig; proc.kill('SIGTERM'); }
        } else { lastErr = sig; repeats = 1; }
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    const timer = setTimeout(() => proc.kill('SIGTERM'), phase.timeout);
    proc.on('close', () => {
      clearTimeout(timer);
      const secs = +((performance.now() - t0) / 1000).toFixed(1);
      resolve(finish(dir, phase, label, secs, buf, livelocked));
    });
  });
}

function finish(dir, phase, label, secs, out, livelocked) {
  const timedOut = !livelocked && secs >= phase.timeout / 1000 - 3;
  const tools = cnt(out, /^\s*[⚙✱→✗↓]\s*\S+/gm);
  const rec = {
    phase: phase.id, label, secs, timedOut,
    tools, mcp: cnt(out, /^\s*[⚙✗]\s*\S+/gm), failed: cnt(out, /^\s*✗\s*\S+/gm),
    artifacts: Object.fromEntries(phase.artifacts.map((a) => [a, existsSync(join(dir, a))])),
    transcript: out.slice(-4000),
  };
  // Dead-fast exit with no tool activity is a harness fault, not a model score.
  if (!timedOut && tools === 0) rec.invocation_error = out.slice(0, 300).replace(/\s+/g, ' ');
  if (livelocked) {
    rec.livelock = livelocked;
    rec.outcome = 'LIVELOCK';
    rec.note = `killed after ${LIVELOCK_REPEATS} identical tool errors — no progress was being made`;
  }
  // ABANDONED: the model oriented (read files, globbed) and then stopped without
  // producing anything. Distinct from "tried and got it wrong" — this is the
  // announce-then-stop pause PERSISTENCE.md targets, and it must not be scored as
  // a capability result.
  const madeAny = phase.artifacts.some((a) => existsSync(join(dir, a)));
  if (!rec.outcome && !timedOut && !madeAny && tools > 0 && tools <= 10) {
    rec.outcome = 'ABANDONED';
    rec.note = 'oriented then stopped: tool calls made, no declared artifact written, no completion phrase';
  }
  // A subagent passed to --agent silently falls back to the default agent AND the
  // fallback loses --dir, so the phase runs against the wrong tree. Never score it.
  if (/is a subagent, not a primary agent/.test(out)) {
    rec.invocation_error = `agent "${phase.agent}" is a subagent; opencode fell back to the default agent and lost --dir`;
  }
  // ESCAPE DETECTION (v2 — v1 never fired). v1 required `!dir.startsWith(STAGE)`,
  // but dir is ALWAYS in STAGE, so the condition was dead. Measured cost: a P4
  // implement run wrote src/library.mjs into evals/realworld/tool-library/ instead
  // of the workcopy and was scored 0/25 — the real score was 14/25.
  //
  // Check the ARTIFACT, not the transcript: if a declared artifact is missing from
  // the workcopy but present at the same relative path under REPO, the session
  // escaped. That is concrete and cannot be fooled by log formatting.
  const escaped = phase.artifacts.filter(
    (a) => !existsSync(join(dir, a)) && existsSync(join(REPO, a)),
  );
  if (escaped.length) {
    rec.invocation_error =
      `session escaped the workcopy: ${escaped.join(', ')} landed under the expert repo ` +
      `instead of ${dir}. Score is INVALID (the artifact exists, just not where --dir said).`;
    rec.escaped_artifacts = escaped;
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
function scoreHidden(dir, libDirOverride = null) {
  const lib = libDirOverride ? join(libDirOverride, 'library.mjs') : join(dir, 'src/library.mjs');
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
  if (RESUME && existsSync(join(dir, 'BRIEF.md'))) return dir;   // keep prior phases
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const f of ['BRIEF.md', 'CONTRACT.md']) cpSync(join(PROJ, f), join(dir, f));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, type: 'module', private: true }, null, 2));
  return dir;
}


// ── I1: harness calibration gate ─────────────────────────────────────────────
// A detector that matches nothing looks exactly like a model that did nothing.
// Before this harness grades anything it must prove, on inputs whose answers are
// known, that it can tell good from bad. Five of the eight faults in the
// 2026-07-25 evaluation were detectors silently returning a plausible zero.
//
// Passing the reference is NOT sufficient — a suite of `assert(true)` would also
// pass. So we MUTATE the reference (flip one business rule) and require the suite
// to CATCH it. Mutating the real reference on the fly keeps the known-bad input
// in sync with the known-good one automatically.
function selfTest() {
  let ok = true;
  const say = (pass, what, detail = '') => {
    if (!pass) ok = false;
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? `  — ${detail}` : ''}`);
  };

  // 1. known-good: reference must score full marks
  const refDir = join(HIDDEN, 'reference');
  const good = scoreHidden(join(HIDDEN, '..', '.hidden-selftest-good'), refDir);
  say(good.ran && good.fail === 0 && good.pass >= 25, 'hidden suite passes the reference',
      `${good.pass}/${good.total}`);

  // 2. known-bad: flip "more than £10" to ">=" and require the suite to catch it
  const mutantDir = join(STAGE, '_selftest_mutant');
  mkdirSync(mutantDir, { recursive: true });
  const src = readFileSync(join(refDir, 'library.mjs'), 'utf8');
  const mutated = src.replace('outstanding(memberId) > FEE_THRESHOLD',
                              'outstanding(memberId) >= FEE_THRESHOLD');
  if (mutated === src) { say(false, 'mutation applied', 'pattern not found — update the mutant'); }
  writeFileSync(join(mutantDir, 'library.mjs'), mutated);
  const bad = scoreHidden(mutantDir, mutantDir);
  say(bad.ran && bad.fail > 0, 'hidden suite CATCHES a mutated business rule',
      `${bad.pass}/${bad.total}, failures: ${(bad.failedTests || []).slice(0, 2).join('; ') || 'none'}`);

  // 3. tool-glyph counter must be non-zero on real opencode output (fault #3/#4)
  const sample = `\u001b[0m\u001b[0m\u2731 \u001b[0mGlob "*"\n\u001b[0m\u2192 \u001b[0mRead a.txt\n\u2699 context7_query-docs {}\n\u2717 WebFetch failed\n`;
  const plain = strip(sample);
  say(cnt(plain, /^\s*[\u2699\u2731\u2192\u2717\u2193]\s*\S+/gm) === 4, 'tool counter sees builtin + MCP + failed glyphs',
      `counted ${cnt(plain, /^\s*[\u2699\u2731\u2192\u2717\u2193]\s*\S+/gm)}/4`);

  // 4. link classifier must separate dead from merely blocked (fault #7)
  const cls = (code) => (/^2|^3/.test(code) ? 'live' : /^(403|429)$/.test(code) ? 'blocked' : 'dead');
  say(cls('200') === 'live' && cls('403') === 'blocked' && cls('404') === 'dead',
      'link classifier is three-way (live/blocked/dead)');

  rmSync(mutantDir, { recursive: true, force: true });

  // 5. DRY-RUN the phase machinery. The gate previously only exercised SCORING and
  // exited before the run loop, so a ReferenceError in the loop shipped happily —
  // measured: a 4-hour run that died 3 seconds in on an undefined symbol, because
  // `node --check` validates syntax, not resolution. Exercise every code path the
  // real run touches, short of spawning a model.
  let dryOk = true;
  for (const phase of PHASES) {
    try {
      if (!phase.id || !Array.isArray(phase.artifacts) || !phase.timeout) throw new Error('phase missing id/artifacts/timeout');
      if (!Array.isArray(requiredUpstream(phase))) throw new Error('requiredUpstream did not return an array');
      const cfg = phaseConfig(phase);
      if (cfg && !existsSync(cfg)) throw new Error('phaseConfig returned a path that does not exist');
      if (cfg) {
        const parsed = JSON.parse(readFileSync(cfg, 'utf8'));
        const enabled = Object.entries(parsed.mcp || {}).filter(([, d]) => d.enabled).map(([n]) => n);
        const want = (phase.mcp ?? []).slice().sort().join(',');
        if (enabled.sort().join(',') !== want) throw new Error(`mcp scoping mismatch: got [${enabled}] want [${want}]`);
      }
    } catch (e) { dryOk = false; say(false, `phase machinery: ${phase.id}`, e.message); }
  }
  say(dryOk, 'every phase dry-runs (symbols resolve, tool scoping applies)');

  console.log(ok ? '\ncalibration PASSED — harness may grade\n' : '\ncalibration FAILED — do NOT trust any number this harness produces\n');
  return ok;
}

if (argv.includes('--self-test')) {
  console.log('harness calibration (I1):');
  process.exit(selfTest() ? 0 : 1);
}

// ── run ──────────────────────────────────────────────────────────────────────
mkdirSync(STAGE, { recursive: true });
const results = { generated: new Date().toISOString(), models: {} };

for (const model of MODELS) {
  const slug = model.replace(/[^a-z0-9]+/gi, '-') + (LABEL ? `--${LABEL}` : '');
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
        const rec = await runPhase(rdir, model, phase, `impl${i + 1}`);
        rec.gate = runGate(rdir, phase);
        rec.hidden = scoreHidden(rdir);
        rec.dir = rdir;
        console.error(`     ${rec.secs}s tools=${rec.tools} mcp=${rec.mcp} → hidden ${rec.hidden.pass}/${rec.hidden.total || 25}${rec.outcome ? `  ⚠ ${rec.outcome}` : ''}`);
        m.impl.push(rec);
        m.phases.push(rec);
      }
      // Best implementation carries forward into test/review phases.
      const best = [...m.impl].sort((a, b) => (b.hidden?.pass ?? 0) - (a.hidden?.pass ?? 0))[0];
      if (best?.dir) { rmSync(dir, { recursive: true, force: true }); cpSync(best.dir, dir, { recursive: true }); }
      continue;
    }

    // ARTIFACT GATE. Every phase must PRODUCE something; downstream phases consume
    // it. Running P5/P6 after a P4 that wrote no code grades the reviewer on an
    // empty tree and reports it as a model result. Measured 2026-07-26: the whole
    // tail of a run executed against nothing and produced four more zeros.
    const missingUpstream = NO_UPSTREAM ? [] : requiredUpstream(phase).filter((a) => !existsSync(join(dir, a)));
    if (missingUpstream.length) {
      console.error(`  ▸ ${phase.id} — BLOCKED (missing upstream: ${missingUpstream.join(', ')})`);
      m.phases.push({
        phase: phase.id, label: phase.id, outcome: 'BLOCKED', secs: 0,
        note: `upstream artifact(s) absent: ${missingUpstream.join(', ')} — not run, NOT a model result`,
        artifacts: {}, tools: 0, mcp: 0, failed: 0,
      });
      continue;
    }
    console.error(`  ▸ ${phase.id}…`);
    const rec = await runPhase(dir, model, phase, phase.id);
    rec.gate = runGate(dir, phase);
    if (phase.verifySources) { rec.sources = verifySources(dir, phase.artifacts[0]); m.research = rec.sources; }
    const made = Object.values(rec.artifacts).filter(Boolean).length;
    console.error(`     ${rec.secs}s tools=${rec.tools} mcp=${rec.mcp} failed=${rec.failed} artifacts=${made}/${phase.artifacts.length}` +
      (rec.sources ? ` sources ${rec.sources.live}/${rec.sources.checked} live` : '') +
      (rec.gate ? `  gate:${rec.gate.passed ? 'PASS' : `${rec.gate.gaps_content} content-gaps`}` : '') +
      (rec.outcome ? `  ⚠ ${rec.outcome}` : rec.invocation_error ? '  ⚠ INVOCATION_ERROR' : ''));
    m.phases.push(rec);
  }

  m.finalDir = dir;
  results.models[LABEL ? `${model} [${LABEL}]` : model] = m;
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
