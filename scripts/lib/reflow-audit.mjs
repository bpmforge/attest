// reflow-audit.mjs — /reflow audit reconciliation mode (T26.4).
//
// The incident recovery tool for the 2026-07-07 ticket-hygiene incident (M26):
// an executor worked tickets without claiming/closing them and self-asserted
// "done" with no audit trail. validate-ticket-hygiene.sh (T26.2) is a
// forward-looking GATE — it blocks new claims while a plan.json's *recorded*
// evidence is incomplete or doesn't check out, and (checkEvidenceScope) it
// verifies evidence→code correspondence (does a recorded commit stay inside
// its module's write_scope?). This tool answers the reverse, retrospective
// question a post-incident cleanup actually needs: for a plan.json that may
// already be unrecoverable process-wise, what does the CODE say was really
// built, independent of what the tickets claim? It grades every non-blocked
// module VERIFIED / UNVERIFIED / ORPHAN-CODE by checking manifest existence,
// re-running the verify gate, and cross-referencing evidence + write_scope
// against real git history — then renders docs/work/RECONCILIATION.md.
//
// Re-running `module.verify` here (unlike T27.2's validate-completion-manifest.sh,
// which deliberately does NOT re-execute a Verify command extracted from prose —
// "both an injection vector and non-reproducible in a validator's context") is
// safe for the SAME reason close() already re-runs it: this only ever runs
// module.verify, the plan's own pre-configured field, never a caller-supplied
// string, and — unlike a phase-gate validator — this is a manually-invoked,
// one-off recovery tool an operator runs deliberately against a plan.json they
// chose, not an unattended chain another agent's prose can steer. Pass
// `skipVerify: true` (CLI: --skip-verify) when the target plan's `verify`
// fields aren't safe/known-runnable commands (e.g. bare doc paths, or a
// command with real side effects) — grading degrades gracefully: a module
// simply cannot reach VERIFIED without a confirmed verify pass, so skipping
// only ever costs precision, it never fabricates a pass.
//
// Path bases (a real trap, see write_scope's row in TICKET_SCHEMA.md):
//   - module.manifest is PLAN-DIR-relative (matches close()'s own resolution).
//   - module.write_scope entries are REPO-ROOT-relative (matches
//     checkEvidenceScope()'s `git show --name-only` comparison).
// gradeModule() takes both `planDir` and `repoRoot` separately — do not
// collapse them, they are frequently different directories (e.g. ai-daytrader's
// plan.json lives at docs/learning-system/plan.json, several levels below the
// repo root that write_scope paths are relative to).
//
// Orphan-code detection walks `git log` on the CURRENT checkout (HEAD) only,
// not `--all` — `--all` would pull in unmerged feature branches and could
// attribute a scope to code that was never actually built on the mainline,
// a false ORPHAN-CODE the whole point of this tool is to avoid.

import { existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { loadPlan } from './tickets.mjs';

// Same trailing-wildcard-only glob convention as tickets-graph.mjs's
// normScope() / ticket-hygiene.mjs's fileInScope() — a write_scope glob and
// a real git path are compared by the identical rule the ticket schema
// already uses elsewhere, not a new minimatch implementation.
function normScope(g) {
  return String(g).replace(/\/\*\*?$/, '').replace(/\/\*$/, '').replace(/\*+$/, '').replace(/\/$/, '');
}

function isGitRepo(root) {
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function commitExists(root, commit) {
  try {
    execFileSync('git', ['-C', root, 'cat-file', '-e', `${commit}^{commit}`], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Real commits (on HEAD's history, not --all) touching any path under a
// module's write_scope. One `git log` call per scope entry (a directory
// pathspec is recursive by default; a literal file pathspec matches itself).
function writeScopeCommits(root, writeScope) {
  const commits = new Map(); // hash -> Set(files)
  for (const entry of writeScope || []) {
    const pathspec = normScope(entry);
    if (!pathspec) continue;
    let out;
    try {
      out = execFileSync(
        'git',
        ['-C', root, 'log', '--format=%H', '--name-only', '--', pathspec],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch {
      continue;
    }
    let currentHash = null;
    for (const line of out.split('\n')) {
      if (/^[0-9a-f]{40}$/.test(line)) {
        currentHash = line;
        if (!commits.has(currentHash)) commits.set(currentHash, new Set());
      } else if (line.trim() && currentHash) {
        commits.get(currentHash).add(line.trim());
      }
    }
  }
  return [...commits.entries()].map(([hash, files]) => ({ hash, files: [...files] }));
}

function runVerify(root, verifyCmd, timeoutMs = 10000) {
  try {
    execFileSync('sh', ['-c', verifyCmd], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    return { state: 'pass', detail: `${verifyCmd} — exit 0` };
  } catch (err) {
    const out = ((err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '')).trim();
    const reason = err.signal === 'SIGTERM' ? 'timed out' : `exit ${err.status ?? '?'}`;
    return {
      state: 'fail',
      detail: `${verifyCmd} — ${reason}${out ? `: ${out.slice(0, 300)}` : ''}`,
    };
  }
}

// Grade a single module. Returns { id, title, status, owner, grade, checks, reasons }.
// `checks` carries the raw per-axis state for callers that want it (tests,
// alternate renderers); `reasons` is the human-readable line list the
// markdown report uses directly.
export function gradeModule(m, { planDir, repoRoot, skipVerify = false, verifyTimeoutMs = 10000 } = {}) {
  const reasons = [];

  // -- manifest -------------------------------------------------------
  let manifestState;
  if (!m.manifest) {
    manifestState = 'not-configured';
    reasons.push('manifest: not configured on this module');
  } else {
    const manifestPath = resolve(planDir, m.manifest);
    if (existsSync(manifestPath)) {
      manifestState = 'present';
      reasons.push(`manifest: present (${m.manifest})`);
    } else {
      manifestState = 'missing';
      reasons.push(`manifest: configured but missing on disk (${m.manifest})`);
    }
  }

  // -- verify -----------------------------------------------------------
  let verifyState;
  let verifyDetail = null;
  if (!m.verify) {
    verifyState = 'not-configured';
    reasons.push('verify: not configured on this module');
  } else if (skipVerify) {
    verifyState = 'skipped';
    reasons.push(`verify: skipped (--skip-verify) — configured command '${m.verify}' not re-run`);
  } else {
    const r = runVerify(repoRoot, m.verify, verifyTimeoutMs);
    verifyState = r.state;
    verifyDetail = r.detail;
    reasons.push(`verify: ${r.detail}`);
  }
  const verifySatisfied = verifyState === 'not-configured' || verifyState === 'pass';

  // -- evidence -----------------------------------------------------------
  const commits = Array.isArray(m.evidence?.commits) ? m.evidence.commits : [];
  let evidenceState;
  if (commits.length === 0) {
    evidenceState = 'not-recorded';
    reasons.push('evidence: not recorded (no evidence.commits)');
  } else {
    const missing = repoRoot && isGitRepo(repoRoot) ? commits.filter((c) => !commitExists(repoRoot, c)) : commits;
    if (missing.length === 0) {
      evidenceState = 'confirmed';
      reasons.push(`evidence: ${commits.length} commit(s) recorded, all found in git history`);
    } else {
      evidenceState = 'commit-missing';
      reasons.push(`evidence: recorded but ${missing.length}/${commits.length} commit(s) not found in git history (${missing.join(', ')})`);
    }
  }

  // -- code (orphan detection) ---------------------------------------------
  const codeCommits = repoRoot && isGitRepo(repoRoot) ? writeScopeCommits(repoRoot, m.write_scope) : [];
  if (codeCommits.length > 0) {
    reasons.push(`code: ${codeCommits.length} commit(s) on HEAD touch this ticket's write_scope (${codeCommits.slice(0, 3).map((c) => c.hash.slice(0, 8)).join(', ')}${codeCommits.length > 3 ? ', …' : ''})`);
  } else {
    reasons.push("code: no commits found on HEAD touching this ticket's write_scope");
  }

  // -- grade ----------------------------------------------------------
  const verified = manifestState === 'present' && verifySatisfied && evidenceState === 'confirmed';
  let grade;
  if (verified) {
    grade = 'VERIFIED';
  } else if (codeCommits.length > 0 && evidenceState === 'not-recorded') {
    grade = 'ORPHAN-CODE';
    reasons.push('grade: code exists for this write_scope but no evidence was ever recorded — the lifecycle machinery never captured it (the 2026-07-07 incident pattern)');
  } else {
    grade = 'UNVERIFIED';
  }

  return {
    id: m.id,
    title: m.title,
    status: m.status,
    owner: m.owner ?? null,
    grade,
    checks: { manifestState, verifyState, verifyDetail, evidenceState, codeCommitCount: codeCommits.length },
    reasons,
  };
}

// Resolve the git repo root a plan.json's write_scope paths are relative to.
// Falls back to planDir itself if git isn't available (grading still works,
// just without evidence/orphan-code confirmation — every module bottoms out
// UNVERIFIED, which is the honest answer when there's no git history to check).
export function resolveRepoRoot(planDir) {
  try {
    return execFileSync('git', ['-C', planDir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return planDir;
  }
}

export function auditPlan(plan, { planDir, repoRoot, skipVerify = false, verifyTimeoutMs = 10000 } = {}) {
  const modules = Array.isArray(plan.modules) ? plan.modules : [];
  const graded = modules
    .filter((m) => m.status !== 'blocked')
    .map((m) => gradeModule(m, { planDir, repoRoot, skipVerify, verifyTimeoutMs }));
  const blockedCount = modules.filter((m) => m.status === 'blocked').length;
  return { graded, blockedCount, totalModules: modules.length };
}

function headRev(repoRoot) {
  try {
    return execFileSync('git', ['-C', repoRoot, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '(no git repo)';
  }
}

export function renderReport({ planPath, repoRoot, graded, blockedCount, totalModules, generatedAt }) {
  const byGrade = { VERIFIED: [], UNVERIFIED: [], 'ORPHAN-CODE': [] };
  for (const g of graded) byGrade[g.grade].push(g);

  const section = (grade, blurb) => {
    const rows = byGrade[grade];
    if (rows.length === 0) return `## ${grade} (0)\n\n_(none)_\n`;
    const body = rows
      .map((r) => `### ${r.id} — ${r.title}\n_status: ${r.status} · owner: ${r.owner ?? '—'}_\n\n${r.reasons.map((x) => `- ${x}`).join('\n')}`)
      .join('\n\n');
    return `## ${grade} (${rows.length})\n\n${blurb}\n\n${body}\n`;
  };

  return `# Reconciliation Report

Generated by \`/reflow audit\` (T26.4) on ${generatedAt} against \`${planPath}\` @ \`${repoRoot}\` (HEAD ${headRev(repoRoot)}).

Grades every non-\`blocked\` module by cross-checking three independent signals against real
git history — a self-asserted \`status\` field is not trusted on its own:

- **manifest** — does \`module.manifest\` exist on disk?
- **verify** — does \`module.verify\`, re-run now, exit 0?
- **evidence** — do \`module.evidence.commits\` (if any) actually exist in git history?
- **code** — does git history show real commits touching this module's \`write_scope\`, on HEAD?

\`VERIFIED\` requires all three of manifest/verify/evidence to check out. \`ORPHAN-CODE\` is the
2026-07-07 incident pattern: real commits exist for the write_scope, but no evidence was ever
recorded — code was built outside the lifecycle machinery. Everything else is \`UNVERIFIED\` —
including tickets not yet started; that is not itself a red flag.

## Summary

- **VERIFIED**: ${byGrade.VERIFIED.length}
- **UNVERIFIED**: ${byGrade.UNVERIFIED.length}
- **ORPHAN-CODE**: ${byGrade['ORPHAN-CODE'].length}
- **not graded (blocked)**: ${blockedCount}
- total modules in plan: ${totalModules}

${section('ORPHAN-CODE', 'Code exists for these write_scopes; no evidence was ever recorded. Highest-priority reconciliation targets — confirm what was actually built, then record evidence retroactively (or re-close properly) before trusting the ticket layer again.')}
${section('VERIFIED', 'Manifest, verify gate, and evidence all check out against real git history.')}
${section('UNVERIFIED', 'At least one of manifest/verify/evidence could not be confirmed. Includes not-yet-started tickets (nothing to verify) as well as tickets whose claims could not be substantiated.')}
`;
}

// -- CLI ------------------------------------------------------------------
const USAGE =
  'usage: reflow-audit.mjs <plan.json> [--repo <path>] [--out <path>] [--skip-verify] [--verify-timeout-ms <n>]';

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  const positional = [];
  const flags = { skipVerify: false, repo: null, out: null, verifyTimeoutMs: 10000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo') flags.repo = argv[++i];
    else if (argv[i] === '--out') flags.out = argv[++i];
    else if (argv[i] === '--skip-verify') flags.skipVerify = true;
    else if (argv[i] === '--verify-timeout-ms') flags.verifyTimeoutMs = Number(argv[++i]);
    else positional.push(argv[i]);
  }
  const [planPath] = positional;
  if (!planPath) {
    console.error(USAGE);
    process.exit(2);
  }
  const plan = loadPlan(planPath);
  const planDir = dirname(resolve(planPath));
  const repoRoot = flags.repo ? resolve(flags.repo) : resolveRepoRoot(planDir);
  const { graded, blockedCount, totalModules } = auditPlan(plan, {
    planDir,
    repoRoot,
    skipVerify: flags.skipVerify,
    verifyTimeoutMs: flags.verifyTimeoutMs,
  });
  const generatedAt = new Date().toISOString();
  const report = renderReport({ planPath, repoRoot, graded, blockedCount, totalModules, generatedAt });
  const outPath = flags.out ? resolve(flags.out) : resolve(planDir, 'RECONCILIATION.md');
  const { writeFileSync } = await import('fs');
  writeFileSync(outPath, report);
  const orphan = graded.filter((g) => g.grade === 'ORPHAN-CODE').length;
  console.log(`wrote ${outPath} — VERIFIED=${graded.filter((g) => g.grade === 'VERIFIED').length} UNVERIFIED=${graded.filter((g) => g.grade === 'UNVERIFIED').length} ORPHAN-CODE=${orphan} (blocked, not graded: ${blockedCount})`);
  process.exit(0);
}
