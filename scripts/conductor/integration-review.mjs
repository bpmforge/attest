#!/usr/bin/env node
// integration-review.mjs — the ONCE-PER-BRANCH audit (TOKEN_OPTIMIZATION_PLAN, item A).
//
// The per-ticket gate (conductor.mjs, `--review-tier ticket`) runs one lean
// code-reviewer plus whatever a HIGH-signal pattern or the board explicitly
// asks for. The broad audits — the 7-specialist code-health review, the OWASP
// security auditor, performance, ux — used to run on every ticket and again on
// every fix iteration; measured at 0.5–1.4M input tokens per reviewer session
// on a frontier model. They now run HERE: once, over the whole branch diff
// (`<base>...<head>`), in parallel, at the point where the whole tree is what
// is actually being judged — before the PR to main, and again at release.
//
// Deterministic scanners run first and feed the model sessions (so the OWASP
// auditor reads semgrep's JSON instead of re-deriving it): see
// scripts/scan/collect.sh. Each auditor writes
// docs/reviews/INTEGRATION_<kind>_<base>..<head>_<date>.md ending in a verdict
// line; the exit code is 0 only when every required verdict is APPROVED.
//
// Usage:
//   node scripts/conductor/integration-review.mjs [--root .] [--base main] [--head HEAD]
//        [--models models.json] [--reviewers code-reviewer,security,perf,ux]
//        [--parallel on|off] [--session-minutes 45] [--dry-run] [--no-scan]
//        [--names integration|final|feature:<slug>]   (document naming scheme, see docFor)
//
// Exit: 0 all approved · 1 a verdict blocks (or a reviewer wrote nothing) ·
//       2 usage/config · 3 nothing to review (empty diff).

import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { triggeredReviewers } from '../lib/review-triggers.mjs';
import { readVerdict } from '../lib/runtime-verdict.mjs';
import { loadModelsConfig, resolveRole } from '../lib/model-tiers.mjs';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_SCRIPTS = resolve(SELF_DIR, '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : dflt;
};
const ROOT = resolve(String(opt('root', '.')));
const BASE = String(opt('base', 'main'));
const HEAD = String(opt('head', 'HEAD'));
const DRY = args.includes('--dry-run');
const NO_SCAN = args.includes('--no-scan');
const PARALLEL = String(opt('parallel', 'auto'));
const SESSION_MIN = Number(opt('session-minutes', 45)) || 45;
const OPENCODE_BIN = process.env.OPENCODE_BIN || 'opencode';
const MODELS_JSON = resolve(String(opt('models',
  existsSync(resolve(ROOT, 'models.json')) ? resolve(ROOT, 'models.json') : resolve(REPO_SCRIPTS, '..', 'models.json'))));
const MODELS = existsSync(MODELS_JSON) ? loadModelsConfig(MODELS_JSON) : null;
const REVIEWER_MODEL = opt('model', null) || resolveRole('reviewer', MODELS) || null;
const REVIEW_AGENTS = {
  'code-reviewer': MODELS?.agents?.['integration-reviewer'] || 'code-reviewer',
  security: 'security-auditor',
  perf: 'performance-engineer',
  ux: 'ux-engineer',
};
const LOCAL_PROVIDER_RE = /^(lmstudio|ollama|llama\.?cpp|llamacpp|local|mlx)\b/i;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const log = (kind, extra = {}) => {
  const row = { ts: new Date().toISOString(), kind, ...extra };
  process.stdout.write(JSON.stringify(row) + '\n');
  try {
    mkdirSync(resolve(ROOT, 'docs/work'), { recursive: true });
    writeFileSync(resolve(ROOT, 'docs/work/integration-review-log.jsonl'), JSON.stringify(row) + '\n', { flag: 'a' });
  } catch { /* logging never blocks the review */ }
};

function main() {
  if (!existsSync(resolve(ROOT, '.git'))) {
    console.error(`integration-review: ${ROOT} is not a git repository`);
    return 2;
  }
  const headSha = git('rev-parse', HEAD);
  const baseSha = git('merge-base', BASE, HEAD);
  const range = `${baseSha.slice(0, 12)}..${headSha.slice(0, 12)}`;
  const diff = git('diff', `${baseSha}...${headSha}`);
  if (!diff.trim()) {
    log('integration.empty', { base: BASE, head: HEAD, msg: 'no diff between base and head — nothing to review' });
    return 3;
  }
  const files = git('diff', '--name-only', `${baseSha}...${headSha}`).split('\n').filter(Boolean);
  const date = new Date().toISOString().slice(0, 10);

  // 1. Deterministic scanners, once, feeding every auditor.
  let scanJson = null;
  if (!NO_SCAN) {
    const collect = resolve(REPO_SCRIPTS, 'scan', 'collect.sh');
    if (existsSync(collect)) {
      const out = resolve(ROOT, 'docs/work/scan', `integration_${range}.json`);
      mkdirSync(dirname(out), { recursive: true });
      const r = spawnSync('bash', [collect, '--root', ROOT, '--base', baseSha, '--head', headSha, '--out', out], {
        encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 20 * 60_000,
      });
      log('integration.scan', { exit: r.status, out, msg: (r.stderr || '').split('\n').filter(Boolean).slice(-3).join(' | ') });
      if (existsSync(out)) scanJson = out;
    }
  }

  // 2. Which auditors — every rule-bearing reviewer, ux only when UI moved.
  const explicit = opt('reviewers', null);
  const declared = explicit ? String(explicit).split(',').map((s) => s.trim()).filter(Boolean) : [];
  const { reviewers, reasons } = triggeredReviewers({ reviews: declared }, diff, REVIEW_AGENTS, { tier: 'integration' });
  log('integration.reviewers', { range, files: files.length, msg: `${reviewers.join(', ')} — ${reasons.join('; ')}` });

  // 3. One session per auditor, concurrently unless the model is local.
  const parallel = PARALLEL === 'on' || (PARALLEL === 'auto' && !DRY && !LOCAL_PROVIDER_RE.test(String(REVIEWER_MODEL || '')));
  // Document naming. Default: INTEGRATION_<KIND>_<range>_<date>.md. The attended
  // SDLC flows have their own expected names (validate-release-readiness.sh
  // reads *_FINAL_*, Mode 3 reads *_<feature>_*), so --names selects a scheme:
  //   --names final            CODE_REVIEW_FINAL / SECURITY_FINAL / PERF_FINAL / UX_AUDIT
  //   --names feature:<slug>   CODE_REVIEW_<slug> / SECURITY_<slug> / PERF_<slug> / UX_REVIEW_<slug>
  const NAMES = String(opt('names', 'integration'));
  const docFor = (r) => {
    const kind = r === 'code-reviewer' ? 'CODE_REVIEW' : r === 'security' ? 'SECURITY' : r === 'perf' ? 'PERF' : 'UX';
    if (NAMES === 'final') return `docs/reviews/${kind === 'UX' ? 'UX_AUDIT' : `${kind}_FINAL`}_${date}.md`;
    if (NAMES.startsWith('feature:')) { const slug = NAMES.slice(8); return `docs/reviews/${kind === 'UX' ? 'UX_REVIEW' : kind}_${slug}_${date}.md`; }
    return `docs/reviews/INTEGRATION_${kind === 'UX' ? 'UX' : kind}_${range}_${date}.md`;
  };
  const prompts = reviewers.map((r) => {
    const agent = REVIEW_AGENTS[r];
    const doc = docFor(r);
    try { rmSync(resolve(ROOT, doc), { force: true }); } catch { /* fresh */ }
    const prompt = `SDLC-TASK for ${agent}:

INTEGRATION REVIEW (branch-level, once before merge to ${BASE}). Review the WHOLE change set
${baseSha.slice(0, 12)}..${headSha.slice(0, 12)} — ${files.length} file(s) — as one unit. This is the
broad audit the per-ticket gates deliberately skipped; nothing narrower than the full diff is in scope.

Get the diff with: git diff ${baseSha.slice(0, 12)}...${headSha.slice(0, 12)}
Files changed:
${files.map((f) => `- ${f}`).join('\n')}
${scanJson ? `
Deterministic scanner output is ALREADY collected at \`${scanJson.replace(ROOT + '/', '')}\` (semgrep, secrets,
dependency audit, dead code, complexity). Read it — do not re-run those tools; spend your judgement on
what the tools cannot see, and on triaging what they found.` : ''}

WRITE-SCOPE (exclusive):
- ${doc}

PRODUCE
- \`${doc}\`

Cite file:line for every finding — an uncited finding is deleted before the report is written. Rank
findings CRITICAL / HIGH / MEDIUM / LOW. End the document with a single line of the form
"VERDICT: APPROVED" or "VERDICT: CHANGES REQUESTED" followed by the blocking (CRITICAL/HIGH) findings.

Do NOT edit the implementation. Do NOT run git write commands. You are reviewing, not fixing.`;
    return { r, agent, doc, prompt };
  });

  const runOne = ({ r, agent, doc, prompt }) => new Promise((done) => {
    log('integration.review.start', { reviewer: r, agent, model: REVIEWER_MODEL, doc });
    if (DRY) return done({ r, doc, present: false, approved: false, dry: true });
    const runArgs = ['run', prompt, '--dir', ROOT, '--agent', agent];
    if (REVIEWER_MODEL) runArgs.push('--model', String(REVIEWER_MODEL));
    const res = spawnSync(OPENCODE_BIN, runArgs, {
      cwd: ROOT, encoding: 'utf8', timeout: SESSION_MIN * 60_000, maxBuffer: 64 * 1024 * 1024,
    });
    const abs = resolve(ROOT, doc);
    const body = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
    const v = readVerdict(body);
    const approved = v.found && v.approved;
    log('integration.review.verdict', {
      reviewer: r, doc, exit: res.status,
      msg: !body ? 'NO DOCUMENT' : !v.found ? 'NO VERDICT LINE (blocking)' : approved ? 'APPROVED' : 'CHANGES REQUESTED',
    });
    done({ r, doc, present: Boolean(body), approved, exit: res.status });
  });

  return (parallel ? Promise.all(prompts.map(runOne)) : prompts.reduce((p, x) => p.then((acc) => runOne(x).then((v) => [...acc, v])), Promise.resolve([])))
    .then((verdicts) => {
      const blocking = verdicts.filter((v) => !v.approved);
      const summary = resolve(ROOT, `docs/reviews/INTEGRATION_SUMMARY_${range}_${date}.md`);
      mkdirSync(dirname(summary), { recursive: true });
      writeFileSync(summary, [
        `# Integration review — ${range} (${date})`,
        '',
        `Base: \`${BASE}\` (${baseSha.slice(0, 12)}) · Head: \`${HEAD}\` (${headSha.slice(0, 12)}) · ${files.length} file(s)`,
        '',
        `Base-SHA: ${baseSha}`,
        `Head-SHA: ${headSha}`,
        scanJson ? `Scanner output: \`${scanJson.replace(ROOT + '/', '')}\`` : 'Scanner output: (skipped)',
        '',
        '| Reviewer | Document | Verdict |',
        '|---|---|---|',
        ...verdicts.map((v) => `| ${v.r} | \`${v.doc}\` | ${v.dry ? 'dry-run' : !v.present ? 'NO DOCUMENT' : v.approved ? 'APPROVED' : 'CHANGES REQUESTED'} |`),
        '',
        blocking.length ? `INTEGRATION: BLOCKED (${blocking.map((v) => v.r).join(', ')})` : 'INTEGRATION: APPROVED',
        '',
      ].join('\n'));
      log('integration.end', { summary, approved: !blocking.length, blocking: blocking.map((v) => v.r) });
      return DRY ? 0 : blocking.length ? 1 : 0;
    });
}

Promise.resolve(main()).then((code) => process.exit(code)).catch((e) => {
  console.error(`integration-review: ${e?.stack || e}`);
  process.exit(2);
});
