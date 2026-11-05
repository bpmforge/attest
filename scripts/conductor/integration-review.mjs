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
//        [--since auto|full|<sha>] [--branch <name>] [--no-validators]
//
// WATERMARK + DELTA RE-REVIEW (INCREMENTAL_SCAN_PLAN WP-A5, decision D3(b)).
// After each reviewer finishes, docs/work/.integration-reviewed.json records
// { "<branch>": { "<reviewer>": { head_sha, doc, verdict, date, base_sha, scope } } }.
// `--since auto` (default): a reviewer with a watermark that is an ancestor of
// HEAD reviews only `<wm>...HEAD` (its prompt carries a DELTA REVIEW line and
// the prior report; the scan is collected over the same range, one collect per
// distinct base). A reviewer the delta does not touch (empty delta, or its
// trigger rule does not fire on it) REUSES its prior verdict: logged as
// `integration.review.reused`, no session spawned. `--since full` (alias
// `--full`) forces today's merge-base behaviour and clears the branch's
// watermark. `--since <sha>` forces that base for every reviewer. Nothing is
// written under --dry-run.
//
// TRADE-OFF (plan claim C4): a delta review is a WEAKER guarantee than full
// re-approval. The summary therefore says `Scope: full` or `Scope: delta …`,
// and validate-release-readiness.sh refuses a release whose newest summary
// says `Scope: delta` — release never rides on a chain of deltas.
//
// B5 (token plan): validate-code-health / validate-dead-code / validate-deps run
// once BEFORE the model sessions, followed by `validate-tests.sh --scope full` (the
// whole suite, never an impact run; it refreshes the test ledger the release gate reads); 
// their exit codes are linked in the summary as a `| Validator | Exit |` table. They never gate the verdict on their own.
//
// Exit: 0 all approved · 1 a verdict blocks (or a reviewer wrote nothing) ·
//       2 usage/config · 3 nothing to review (empty diff).

import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { triggeredReviewers } from '../lib/review-triggers.mjs';
import { detectOpencodeMajor, opencodeRunSpec } from '../lib/opencode-cli.mjs';
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
const SINCE = String(opt('since', args.includes('--full') ? 'full' : 'auto'));
const BRANCH_OPT = opt('branch', null);
const NO_VALIDATORS = args.includes('--no-validators');
const WATERMARK_REL = 'docs/work/.integration-reviewed.json';
const VALIDATORS = ['validate-code-health.sh', 'validate-dead-code.sh', 'validate-deps.sh'];
// The once-per-branch tier always runs the whole suite (TEST_IMPACT_PLAN.md §2.4): never an impact run.
// A green full run also refreshes the test ledger that validate-release-readiness.sh reads.
const TESTS_VALIDATOR = ['validate-tests.sh', '--scope', 'full'];
const SESSION_MIN = Number(opt('session-minutes', 45)) || 45;
const OPENCODE_BIN = process.env.OPENCODE_BIN || 'opencode';
const OPENCODE_MAJOR = detectOpencodeMajor({ bin: OPENCODE_BIN, spawn: false }); // env override or install stamp; null => v1 argv
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

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const gitOk = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }).status === 0;
const isAncestor = (anc, desc) => gitOk('merge-base', '--is-ancestor', anc, desc);
const commitExists = (sha) => /^[0-9a-f]{7,40}$/i.test(String(sha || '')) && gitOk('cat-file', '-e', `${sha}^{commit}`);
const readWatermark = () => {
  try { const j = JSON.parse(readFileSync(resolve(ROOT, WATERMARK_REL), 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; }
};
const writeWatermark = (wm) => {
  mkdirSync(resolve(ROOT, 'docs/work'), { recursive: true });
  writeFileSync(resolve(ROOT, WATERMARK_REL), JSON.stringify(wm, null, 2) + '\n');
};
const norm = (verdictApproved) => (verdictApproved ? 'APPROVED' : 'CHANGES REQUESTED');
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
  const fullRange = `${baseSha.slice(0, 12)}..${headSha.slice(0, 12)}`;
  const fullDiff = git('diff', `${baseSha}...${headSha}`);
  if (!fullDiff.trim()) {
    log('integration.empty', { base: BASE, head: HEAD, msg: 'no diff between base and head — nothing to review' });
    return 3;
  }
  const namesOf = (a, b) => git('diff', '--name-only', `${a}...${b}`).split('\n').filter(Boolean);
  const date = new Date().toISOString().slice(0, 10);
  const branch = typeof BRANCH_OPT === 'string' ? BRANCH_OPT : git('rev-parse', '--abbrev-ref', 'HEAD');

  // 0. Watermark. `--since full` clears this branch's entry (never under --dry-run).
  const wmAll = readWatermark();
  if (SINCE === 'full' && !DRY && wmAll[branch]) {
    delete wmAll[branch];
    writeWatermark(wmAll);
    log('integration.watermark.cleared', { branch, msg: '--since full: watermark cleared for branch' });
  }
  const wmBranch = SINCE === 'full' ? {} : (wmAll[branch] || {});
  let sinceSha = null;
  if (SINCE !== 'auto' && SINCE !== 'full') {
    try { sinceSha = git('rev-parse', '--verify', `${SINCE}^{commit}`); } catch { sinceSha = null; }
    if (!sinceSha || !isAncestor(sinceSha, headSha)) {
      console.error(`integration-review: --since ${SINCE} is not a commit that is an ancestor of ${HEAD}`);
      return 2;
    }
  }

  // 1. Which auditors — every rule-bearing reviewer, ux only when UI moved. Computed
  //    over the whole branch; each is then narrowed to its own delta below.
  const explicit = opt('reviewers', null);
  const declared = explicit ? String(explicit).split(',').map((s) => s.trim()).filter(Boolean) : [];
  const trigger = (diff) => triggeredReviewers({ reviews: declared }, diff, REVIEW_AGENTS, { tier: 'integration' });
  const { reviewers: candidates, reasons } = trigger(fullDiff);

  // 2. Per-reviewer scope: full (merge-base), delta (<wm>...HEAD) or reused (nothing for it to review).
  const plan = candidates.map((r) => {
    const e = wmBranch[r];
    let wm = null; let prior = null; let why = '';
    if (SINCE === 'full') why = '--since full';
    else if (sinceSha) { wm = sinceSha; prior = e || null; }
    else if (e && commitExists(e.head_sha) && isAncestor(e.head_sha, headSha)) { wm = e.head_sha; prior = e; }
    else why = e ? 'watermark is not an ancestor of HEAD' : 'no watermark';
    if (!wm) return { r, mode: 'full', base: baseSha, wm: null, prior: null, why, files: namesOf(baseSha, headSha) };
    const dDiff = git('diff', `${wm}...${headSha}`);
    const hasVerdict = prior && (prior.verdict === 'APPROVED' || prior.verdict === 'CHANGES REQUESTED');
    if (!dDiff.trim()) {
      if (hasVerdict) return { r, mode: 'reused', base: wm, wm, prior, why: 'empty delta', files: [] };
      return { r, mode: 'full', base: baseSha, wm: null, prior: null, why: 'empty delta but no prior verdict to reuse', files: namesOf(baseSha, headSha) };
    }
    if (hasVerdict && !trigger(dDiff).reviewers.includes(r)) {
      return { r, mode: 'reused', base: wm, wm, prior, why: 'delta does not touch this reviewer\'s domain', files: namesOf(wm, headSha) };
    }
    return { r, mode: 'delta', base: wm, wm, prior, why: 'watermark', files: namesOf(wm, headSha) };
  });
  const deltaPlans = plan.filter((p) => p.mode !== 'full');
  const reusedNames = plan.filter((p) => p.mode === 'reused').map((p) => p.r);
  const scope = deltaPlans.length ? 'delta' : 'full';
  const wmShas = [...new Set(deltaPlans.map((p) => p.wm))];
  const scopeLine = scope === 'full'
    ? 'Scope: full'
    : `Scope: delta ${wmShas.map((s) => s.slice(0, 7)).join(',')}..${headSha.slice(0, 7)} (reviewers reused: ${reusedNames.join(', ') || 'none'})`;
  // Display range: the earliest base in play, so a delta summary never overwrites a full one.
  const range = scope === 'full' ? fullRange : `${wmShas[0].slice(0, 12)}..${headSha.slice(0, 12)}`;
  log('integration.scope', {
    scope, branch, range,
    msg: scope === 'full' ? 'scope: full' : `scope: delta ${wmShas.map((s) => s.slice(0, 7)).join(',')}..${headSha.slice(0, 7)}`,
    reviewers: Object.fromEntries(plan.map((p) => [p.r, p.mode === 'full' ? `full (${p.why})` : `${p.mode} ${p.wm.slice(0, 7)}..${headSha.slice(0, 7)}`])),
    reused: reusedNames,
  });
  log('integration.reviewers', {
    range, files: namesOf(baseSha, headSha).length,
    msg: `${candidates.join(', ')} — ${reasons.join('; ')}${reusedNames.length ? ` — reused: ${reusedNames.join(', ')}` : ''}`,
  });
  for (const p of plan.filter((x) => x.mode === 'reused')) {
    log('integration.review.reused', {
      reviewer: p.r, doc: p.prior.doc, verdict: p.prior.verdict, since: p.wm.slice(0, 12), msg: `${p.why} — prior verdict reused, no session spawned`,
    });
  }

  // 3. Deterministic scanners, once per DISTINCT base (most reviewers share one), feeding every spawned auditor.
  const spawned = plan.filter((p) => p.mode !== 'reused');
  const scanFor = new Map();
  if (!NO_SCAN) {
    const collect = resolve(REPO_SCRIPTS, 'scan', 'collect.sh');
    if (existsSync(collect)) {
      for (const base of [...new Set(spawned.map((p) => p.base))]) {
        const out = resolve(ROOT, 'docs/work/scan', `integration_${base.slice(0, 12)}..${headSha.slice(0, 12)}.json`);
        mkdirSync(dirname(out), { recursive: true });
        const r = spawnSync('bash', [collect, '--root', ROOT, '--base', base, '--head', headSha, '--out', out], {
          encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 20 * 60_000,
        });
        log('integration.scan', { base: base.slice(0, 12), exit: r.status, out, msg: (r.stderr || '').split('\n').filter(Boolean).slice(-3).join(' | ') });
        if (existsSync(out)) scanFor.set(base, out);
      }
    }
  }

  // 4. B5: whole-tree validators, once, before any model session. Informational — they link, they do not gate.
  const validators = [];
  if (!NO_VALIDATORS && spawned.length) {
    for (const spec of [...VALIDATORS.map((x) => [x]), TESTS_VALIDATOR]) {
      const [name, ...extra] = spec;
      const v = [name, ...extra].join(' ');
      const path = resolve(REPO_SCRIPTS, 'validators', name);
      if (!existsSync(path)) { validators.push({ v, exit: 'missing' }); continue; }
      const r = spawnSync('bash', [path, ROOT, ...extra], {
        cwd: ROOT, encoding: 'utf8', env: { ...process.env, PROJECT_ROOT: ROOT }, maxBuffer: 64 * 1024 * 1024, timeout: name === 'validate-tests.sh' ? 60 * 60_000 : 10 * 60_000,
      });
      validators.push({ v, exit: r.status ?? (r.signal ? `signal ${r.signal}` : 'error') });
    }
    log('integration.validators', { msg: validators.map((x) => `${x.v}=${x.exit}`).join(' '), tests_cmd: `bash validators/${TESTS_VALIDATOR.join(' ')} <root>` });
  }

  // 5. One session per auditor, concurrently unless the model is local.
  const parallel = PARALLEL === 'on' || (PARALLEL === 'auto' && !DRY && !LOCAL_PROVIDER_RE.test(String(REVIEWER_MODEL || '')));
  // Document naming. Default: INTEGRATION_<KIND>_<range>_<date>.md. The attended
  // SDLC flows have their own expected names (validate-release-readiness.sh
  // reads *_FINAL_*, Mode 3 reads *_<feature>_*), so --names selects a scheme:
  //   --names final            CODE_REVIEW_FINAL / SECURITY_FINAL / PERF_FINAL / UX_AUDIT
  //   --names feature:<slug>   CODE_REVIEW_<slug> / SECURITY_<slug> / PERF_<slug> / UX_REVIEW_<slug>
  const NAMES = String(opt('names', 'integration'));
  const docFor = (r, rRange) => {
    const kind = r === 'code-reviewer' ? 'CODE_REVIEW' : r === 'security' ? 'SECURITY' : r === 'perf' ? 'PERF' : 'UX';
    if (NAMES === 'final') return `docs/reviews/${kind === 'UX' ? 'UX_AUDIT' : `${kind}_FINAL`}_${date}.md`;
    if (NAMES.startsWith('feature:')) { const slug = NAMES.slice(8); return `docs/reviews/${kind === 'UX' ? 'UX_REVIEW' : kind}_${slug}_${date}.md`; }
    return `docs/reviews/INTEGRATION_${kind === 'UX' ? 'UX' : kind}_${rRange}_${date}.md`;
  };
  // Newest prior review doc for the same reviewer + naming scheme (any date), so the
  // agent can carry findings forward per its DELTA_REVIEW block (full mode, no watermark).
  const priorDocFor = (cur, rRange) => {
    const m = cur.match(/^(.*\/)(.+)_(\d{4}-\d{2}-\d{2})\.md$/);
    if (!m) return null;
    const [, dir, stem] = m;
    try {
      // The integration scheme embeds the sha range in the name; a prior report covers an earlier range, so wildcard it.
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pat = esc(stem.replace(rRange, '\u0000')).replace('\u0000', '[0-9a-f]+\\.\\.[0-9a-f]+');
      const re = new RegExp(`^${pat}_(\\d{4}-\\d{2}-\\d{2})\\.md$`);
      const hits = readdirSync(resolve(ROOT, dir)).map((f) => ({ f, m: f.match(re) })).filter((x) => x.m)
        .sort((x, y) => (y.m[1] + y.f).localeCompare(x.m[1] + x.f));
      return hits.length ? dir + hits[0].f : null;
    } catch { return null; }
  };
  const prompts = spawned.map((p) => {
    const { r, base, prior } = p;
    const agent = REVIEW_AGENTS[r];
    const rRange = `${base.slice(0, 12)}..${headSha.slice(0, 12)}`;
    const doc = docFor(r, rRange);
    const scanJson = scanFor.get(base) || null;
    const delta = p.mode === 'delta';
    let priorPath = null;
    if (delta && prior?.doc) {
      priorPath = prior.doc;
      if (prior.doc === doc && existsSync(resolve(ROOT, doc))) {
        // Same-named doc (--names final|feature:*): keep the prior report readable while the fresh one is written.
        const keep = `docs/work/.integration-prior/${doc.split('/').pop()}`;
        mkdirSync(resolve(ROOT, 'docs/work/.integration-prior'), { recursive: true });
        writeFileSync(resolve(ROOT, keep), readFileSync(resolve(ROOT, doc)));
        priorPath = keep;
      }
    } else {
      const found = priorDocFor(doc, rRange);
      priorPath = found && found !== doc ? found : null;
    }
    try { rmSync(resolve(ROOT, doc), { force: true }); } catch { /* fresh */ }
    const priorBase = (prior?.base_sha || baseSha).slice(0, 12);
    const deltaLine = delta
      ? (priorPath
        ? `DELTA REVIEW: prior report ${priorPath} (verdict ${prior.verdict}) covers ${priorBase}..${p.wm.slice(0, 12)}; review only this delta and carry forward per the Delta review rules in your agent file.\n\n`
        : `DELTA REVIEW: no prior report on record; review only ${rRange} and say so in your report header (Scope: delta).\n\n`)
      : '';
    const prompt = `SDLC-TASK for ${agent}:

${deltaLine}INTEGRATION REVIEW (branch-level, once before merge to ${BASE}). ${delta
    ? `Review the DELTA ${rRange} — ${p.files.length} file(s) changed since the last review of this branch —`
    : `Review the WHOLE change set\n${rRange} — ${p.files.length} file(s) —`} as one unit. ${delta
    ? 'Everything outside the delta is covered by the prior report; carry its findings forward, do not re-audit it.'
    : 'This is the\nbroad audit the per-ticket gates deliberately skipped; nothing narrower than the full diff is in scope.'}

Get the diff with: git diff ${base.slice(0, 12)}...${headSha.slice(0, 12)}
Files changed:
${p.files.map((f) => `- ${f}`).join('\n')}
${scanJson ? `
Deterministic scanner output is ALREADY collected at \`${scanJson.replace(ROOT + '/', '')}\` (semgrep, secrets,
dependency audit, dead code, complexity). Read it — do not re-run those tools; spend your judgement on
what the tools cannot see, and on triaging what they found.` : ''}
${priorPath ? `
Prior report: ${priorPath}` : ''}

WRITE-SCOPE (exclusive):
- ${doc}

PRODUCE
- \`${doc}\`

Cite file:line for every finding — an uncited finding is deleted before the report is written. Rank
findings CRITICAL / HIGH / MEDIUM / LOW. End the document with a single line of the form
"VERDICT: APPROVED" or "VERDICT: CHANGES REQUESTED" followed by the blocking (CRITICAL/HIGH) findings.

Do NOT edit the implementation. Do NOT run git write commands. You are reviewing, not fixing.`;
    return { r, agent, doc, prompt, p };
  });

  const setWatermark = (r, entry) => {
    if (DRY) return;
    const all = readWatermark();
    all[branch] = { ...(all[branch] || {}), [r]: entry };
    try { writeWatermark(all); } catch { /* the watermark never blocks the review */ }
  };

  const runOne = ({ r, agent, doc, prompt, p }) => new Promise((done) => {
    log('integration.review.start', { reviewer: r, agent, model: REVIEWER_MODEL, doc, scope: p.mode });
    if (DRY) return done({ r, doc, present: false, approved: false, dry: true, mode: p.mode });
    // v2: no --dir (cwd is the project) and --auto because reviewers run unattended (see opencode-cli.mjs).
    const spec = opencodeRunSpec(OPENCODE_MAJOR, { prompt, dir: ROOT, agent, model: REVIEWER_MODEL, unattended: true });
    const res = spawnSync(OPENCODE_BIN, spec.args, {
      cwd: spec.cwd ?? ROOT, encoding: 'utf8', timeout: SESSION_MIN * 60_000, maxBuffer: 64 * 1024 * 1024,
    });
    const abs = resolve(ROOT, doc);
    const body = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
    const v = readVerdict(body);
    const approved = v.found && v.approved;
    log('integration.review.verdict', {
      reviewer: r, doc, exit: res.status, scope: p.mode,
      msg: !body ? 'NO DOCUMENT' : !v.found ? 'NO VERDICT LINE (blocking)' : approved ? 'APPROVED' : 'CHANGES REQUESTED',
    });
    // Only a finished, verdict-bearing review advances the watermark.
    if (body && v.found) {
      setWatermark(r, {
        head_sha: headSha, doc, verdict: norm(approved), date,
        base_sha: p.mode === 'delta' ? (p.prior?.base_sha || baseSha) : baseSha, scope: p.mode,
      });
    }
    done({ r, doc, present: Boolean(body), approved, exit: res.status, mode: p.mode });
  });

  // Reused reviewers: the prior verdict stands; the watermark moves to HEAD (nothing in their domain changed).
  const reusedVerdicts = plan.filter((x) => x.mode === 'reused').map((x) => {
    setWatermark(x.r, { ...x.prior, head_sha: headSha, base_sha: x.prior.base_sha || baseSha, reused: true });
    return { r: x.r, doc: x.prior.doc, present: true, approved: x.prior.verdict === 'APPROVED', reused: true, mode: 'reused', verdict: x.prior.verdict };
  });

  return (parallel ? Promise.all(prompts.map(runOne)) : prompts.reduce((q, x) => q.then((acc) => runOne(x).then((v) => [...acc, v])), Promise.resolve([])))
    .then((ran) => {
      const verdicts = [...ran, ...reusedVerdicts];
      const blocking = verdicts.filter((v) => !v.approved);
      const summary = resolve(ROOT, `docs/reviews/INTEGRATION_SUMMARY_${range}_${date}.md`);
      mkdirSync(dirname(summary), { recursive: true });
      const scanAll = [...new Set(scanFor.values())];
      writeFileSync(summary, [
        `# Integration review — ${range} (${date})`,
        '',
        `Base: \`${BASE}\` (${baseSha.slice(0, 12)}) · Head: \`${HEAD}\` (${headSha.slice(0, 12)}) · ${namesOf(baseSha, headSha).length} file(s) · Branch: \`${branch}\``,
        '',
        scopeLine,
        `Base-SHA: ${baseSha}`,
        `Head-SHA: ${headSha}`,
        scanAll.length ? `Scanner output: ${scanAll.map((f) => `\`${f.replace(ROOT + '/', '')}\``).join(', ')}` : 'Scanner output: (skipped)',
        '',
        '| Reviewer | Document | Verdict | Scope |',
        '|---|---|---|---|',
        ...verdicts.map((v) => `| ${v.r} | \`${v.doc}\` | ${v.reused ? `${v.verdict} (reused)` : v.dry ? 'dry-run' : !v.present ? 'NO DOCUMENT' : v.approved ? 'APPROVED' : 'CHANGES REQUESTED'} | ${v.mode} |`),
        '',
        '| Validator | Exit |',
        '|---|---|',
        ...(validators.length ? validators.map((x) => `| ${x.v} | ${x.exit} |`) : [`| (not run) | ${NO_VALIDATORS ? 'skipped (--no-validators)' : 'n/a (no session spawned)'} |`]),
        '',
        'Validators run once before the model sessions and are linked here for the reader; they do not change the verdict.',
        '',
        blocking.length ? `INTEGRATION: BLOCKED (${blocking.map((v) => v.r).join(', ')})` : 'INTEGRATION: APPROVED',
        '',
      ].join('\n'));
      log('integration.end', { summary, scope, approved: !blocking.length, blocking: blocking.map((v) => v.r) });
      return DRY ? 0 : blocking.length ? 1 : 0;
    });
}

Promise.resolve(main()).then((code) => process.exit(code)).catch((e) => {
  console.error(`integration-review: ${e?.stack || e}`);
  process.exit(2);
});
