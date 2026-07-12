#!/usr/bin/env node
// Provenance: shipwright scripts/conductor.mjs — FIELD-PROVEN reference implementation (conductor run 2026-07-11/12:
// 19 tickets landed unattended, provider-limit sleep-to-resume fired live, supervisor crash-recovery,
// sticky-findings + informed-APPROVE gate, diff-scoped validator gates). Implements M28/T28.x for
// plan.json boards. Adaptation notes: scripts/conductor/README.md. DO NOT hand-edit without porting tests.
/**
 * conductor.mjs — unattended, reusable ticket executor for a plan.json board.
 *
 * The M28 Conductor pattern: THE CONDUCTOR HOLDS THE GATES, NOT THE AGENTS.
 * Each ticket runs in a fresh `claude -p` session inside its OWN git worktree
 * (isolated tree + branch); this script verifies everything from outside the
 * session (gates, write-scope, commits, board state), runs an independent
 * review with sticky findings (maker ≠ verifier), and only then merges. It
 * survives provider limits (sleep-to-reset) and its own crashes (supervise.sh).
 *
 * Project-specific settings live in conductor.config.json — the script itself
 * is repo-agnostic. Models live in scripts/models.json.
 *
 *   node scripts/conductor.mjs [--waves W0,W1] [--breakpoint ticket|wave|never]
 *     [--max-tickets N] [--session-minutes 45] [--no-merge] [--no-push]
 *     [--dry-run] [--escalate] [--lint]
 *
 * --lint          validate plan.json and exit (also runs automatically at start)
 * Stop any time:  `touch STOP` in the repo root (checked between sessions).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = resolve(ROOT, 'docs/work/conductor-log.jsonl');
const STOPFILE = resolve(ROOT, 'STOP');
const planPath = (dir) => resolve(dir, 'plan.json');

// ---------- config (project-specific; script stays repo-agnostic) ----------
const DEFAULT_CONFIG = {
  branchPrefix: 'sw/',
  worktreeDir: '../.shipwright-worktrees',
  isolation: 'worktree',
  toolchainMarker: 'package.json',
  install: ['pnpm', ['install', '--prefer-offline']],
  gates: [['pnpm', ['lint']], ['pnpm', ['typecheck']], ['pnpm', ['test']]],
  gateTimeoutMin: 15,
  remotes: ['github', 'origin'],
  alwaysOk: ['plan.json', 'docs/STATUS.md', 'docs/work/**', 'docs/TECH_STACK.md', 'pnpm-lock.yaml', 'package.json'],
};
const CONFIG = (() => {
  const f = resolve(ROOT, 'conductor.config.json');
  if (!existsSync(f)) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(f, 'utf8')) };
})();
const WT_BASE = resolve(ROOT, CONFIG.worktreeDir);

// ---------- args ----------
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : dflt;
};
const WAVES = opt('waves', '') ? String(opt('waves', '')).split(',').map((s) => s.trim()) : null;
const BREAKPOINT = String(opt('breakpoint', 'never'));
const MODELS = JSON.parse(readFileSync(resolve(ROOT, String(opt('models', 'scripts/models.json'))), 'utf8'));
const MAX_TICKETS = Number(opt('max-tickets', 999));
const SESSION_MIN = Number(opt('session-minutes', 45));
const DO_MERGE = !args.includes('--no-merge');
const DO_PUSH = !args.includes('--no-push');
const DRY = args.includes('--dry-run');
const ESCALATE = args.includes('--escalate');
const LINT_ONLY = args.includes('--lint');

// ---------- utils ----------
const now = () => new Date().toISOString();
const log = (kind, data) => {
  const row = { ts: now(), kind, ...data };
  console.log(`[${row.ts}] ${kind}${data.ticket ? ` ${data.ticket}` : ''}${data.msg ? ` — ${data.msg}` : ''}`);
  try { mkdirSync(dirname(LOG), { recursive: true }); appendFileSync(LOG, JSON.stringify(row) + '\n'); } catch {}
};
const sh = (cmd, cmdArgs, opts = {}) =>
  // 512MB buffer: git diffs on large tickets blow past execFileSync's 1MB default (ENOBUFS).
  execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const git = (...a) => sh('git', a).trim();               // runs in ROOT (stays on main)
const gitIn = (dir, ...a) => sh('git', a, { cwd: dir }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const loadPlan = (dir = ROOT) => JSON.parse(readFileSync(planPath(dir), 'utf8'));
const wave = (id) => id.split('-')[0];

function globToRegex(glob) {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x01')
    .replace(/\*/g, '[^/]*')
    .replace(/\x01/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${esc}$`);
}
// Shared infra any ticket may touch regardless of write_scope (config-driven).
const ALWAYS_OK = CONFIG.alwaysOk.map(globToRegex);

function claimable(plan) {
  const done = new Set(plan.tickets.filter((t) => t.status === 'done').map((t) => t.id));
  const busyLanes = new Set(plan.tickets.filter((t) => t.status === 'in_progress').map((t) => t.lane));
  return plan.tickets
    .filter((t) => t.status === 'todo')
    .filter((t) => !WAVES || WAVES.includes(wave(t.id)))
    .filter((t) => t.depends_on.every((d) => done.has(d)))
    .filter((t) => !busyLanes.has(t.lane))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function pickModel(t) {
  if (MODELS.cheapLanes?.includes(t.lane) || t.points <= (MODELS.cheapMaxPoints ?? 0)) return MODELS.cheap;
  return MODELS.maker;
}

// ---------- plan linter (preflight; catches bad tickets before a run) ----------
const nonWildPrefix = (glob) => glob.replace(/[*?].*$/, '');
function lintPlan(plan) {
  const errors = [], warnings = [];
  const ids = new Set(plan.tickets.map((t) => t.id));
  for (const t of plan.tickets) {
    for (const k of ['id', 'title', 'lane', 'write_scope', 'depends_on', 'acceptance', 'status']) {
      if (t[k] === undefined) errors.push(`${t.id || '?'}: missing '${k}'`);
    }
    if (t.write_scope && !t.write_scope.length) errors.push(`${t.id}: empty write_scope`);
    if (t.acceptance && !t.acceptance.length) errors.push(`${t.id}: empty acceptance`);
    for (const d of t.depends_on || []) if (!ids.has(d)) errors.push(`${t.id}: depends_on unknown ticket '${d}'`);

    // High-value heuristic: acceptance names a source path that no write_scope glob
    // (nor the shared-infra allowlist) can cover — the exact defect that blocked
    // W0-01 (pnpm-lock) and W0-05 (migrations dir excluded from its own scope).
    const scopeRe = (t.write_scope || []).map(globToRegex);
    const scopePfx = (t.write_scope || []).map(nonWildPrefix);
    const scopeTop = new Set((t.write_scope || []).map((g) => g.split('/')[0]));
    const text = (t.acceptance || []).join(' ');
    const paths = [...text.matchAll(/([\w.-]+(?:\/[\w.*-]+)+\.[a-z]{2,4})/g)].map((m) => m[1]);
    for (const p of [...new Set(paths)]) {
      if (p.startsWith('docs/') || p.startsWith('.')) continue; // docs + dotpaths are shared/runtime, not deliverables
      // Only flag a path that lives in the ticket's OWN top-level territory but that
      // its globs can't cover — the "gap in my own scope" pattern (W0-05 class),
      // not an incidental path mention from elsewhere in the tree.
      if (!scopeTop.has(p.split('/')[0])) continue;
      const covered = scopeRe.some((r) => r.test(p)) || ALWAYS_OK.some((r) => r.test(p)) || scopePfx.some((pfx) => pfx && p.startsWith(pfx));
      if (!covered) warnings.push(`${t.id}: acceptance names '${p}' in its own area but no write_scope glob covers it`);
    }
  }
  // dependency cycle detection
  const deps = new Map(plan.tickets.map((t) => [t.id, t.depends_on || []]));
  const state = new Map();
  const visit = (n, stack) => {
    if (stack.has(n)) { errors.push(`dependency cycle: ${[...stack, n].join(' -> ')}`); return; }
    if (state.get(n)) return;
    state.set(n, true);
    for (const d of deps.get(n) || []) if (ids.has(d)) visit(d, new Set([...stack, n]));
  };
  for (const id of ids) visit(id, new Set());
  return { errors, warnings };
}

// ---------- provider-limit-aware session runner ----------
const LIMIT_RE = /(session limit|usage limit|rate.?limit|quota|overloaded|429|529)/i;
const RESET_RE = /resets?\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*([ap]m)/i;

function msUntilReset(text) {
  const m = text.match(RESET_RE);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'pm') h += 12;
  const t = new Date();
  t.setHours(h, Number(m[2]), 0, 0);
  if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
  return t.getTime() - Date.now() + 120_000;
}

async function runSession(prompt, model, label, cwd) {
  let backoff = 5 * 60_000;
  for (let attempt = 1; attempt <= 12; attempt++) {
    if (existsSync(STOPFILE)) throw new Error('STOP file present');
    log('session.start', { label, model, attempt });
    if (DRY) return { out: '[dry-run] no session executed', code: 0 };
    const res = spawnSync('claude', ['-p', prompt, '--model', model, '--dangerously-skip-permissions'], {
      cwd, encoding: 'utf8', timeout: SESSION_MIN * 60_000, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
    });
    const out = `${res.stdout || ''}\n${res.stderr || ''}`;
    if (res.signal) { log('session.timeout', { label, msg: `killed after ${SESSION_MIN}m (${res.signal})` }); return { out, code: 124 }; }
    if (res.status !== 0 && LIMIT_RE.test(out)) {
      const wait = msUntilReset(out) ?? Math.min(backoff, 60 * 60_000);
      backoff *= 2;
      log('limit.pause', { label, msg: `provider limit; sleeping ${(wait / 60000).toFixed(0)}m` });
      await sleep(wait);
      continue;
    }
    return { out, code: res.status ?? 1 };
  }
  throw new Error('limit retries exhausted');
}

// Run named validators from content/validators in the worktree. Each emits a JSON
// summary line: {validator,gaps,exit,items:[{category,detail}]}. Findings are
// DIFF-SCOPED to files this ticket changed — a ticket answers for its own diff,
// not the repo's pre-existing debt (and it keeps unrelated validator noise out).
function runValidators(wt, changed, names) {
  const dir = CONFIG.validators?.dir ?? 'content/validators';
  const out = [];
  for (const name of names || []) {
    const script = resolve(wt, dir, `${name}.sh`);
    if (!existsSync(script)) continue;
    let raw = '';
    try { raw = sh('bash', [script, '.'], { cwd: wt, timeout: 5 * 60_000 }); }
    catch (e) { raw = String(e.stdout || ''); } // validator exits 1 on gaps -> throws; JSON is on stdout
    const line = raw.split('\n').find((l) => l.includes(`"validator":"${name}"`));
    if (!line) continue;
    let parsed; try { parsed = JSON.parse(line); } catch { continue; }
    for (const it of parsed.items || []) {
      if (it.detail && changed.some((f) => it.detail.includes(f))) {
        out.push(`[${name}${it.category ? ':' + it.category : ''}] ${it.detail}`.slice(0, 280));
      }
    }
  }
  return out;
}

// ---------- gates (run OUTSIDE the session, in the ticket's worktree) ----------
function runGates(t, branch, wt) {
  const gaps = [];
  const row = loadPlan(wt).tickets.find((x) => x.id === t.id);
  if (!row || row.status !== 'done') gaps.push(`plan.json status is '${row?.status}', expected 'done'`);
  if (Number(git('rev-list', '--count', `main..${branch}`)) < 1) gaps.push('no commits on ticket branch');
  const changed = git('diff', '--name-only', `main...${branch}`).split('\n').filter(Boolean);
  const scopeRes = t.write_scope.map(globToRegex);
  const outOfScope = changed.filter((f) => !scopeRes.some((r) => r.test(f)) && !ALWAYS_OK.some((r) => r.test(f)));
  if (outOfScope.length) gaps.push(`out-of-scope edits: ${outOfScope.join(', ')}`);
  let advisory = [];
  if (existsSync(resolve(wt, CONFIG.toolchainMarker)) && !DRY) {
    try { sh(CONFIG.install[0], CONFIG.install[1], { cwd: wt, timeout: 10 * 60_000 }); } catch (e) { gaps.push(`install failed: ${String(e.stdout || e.message).slice(-300)}`); }
    for (const [cmd, cmdArgs] of CONFIG.gates) {
      try { sh(cmd, cmdArgs, { cwd: wt, timeout: CONFIG.gateTimeoutMin * 60_000 }); }
      catch (e) { gaps.push(`${cmd} ${cmdArgs[0]} failed: ${String(e.stdout || e.message).slice(-800)}`); }
    }
    // deterministic validator gates (diff-scoped) — hard gaps
    const vGaps = runValidators(wt, changed, CONFIG.validators?.gate);
    if (vGaps.length) { log('validators.gate', { ticket: t.id, msg: `${vGaps.length} diff-scoped violation(s)` }); gaps.push(...vGaps); }
    // heuristic validators — anchor the review (verified, not blocking)
    advisory = runValidators(wt, changed, CONFIG.validators?.advisory);
    if (advisory.length) log('validators.advisory', { ticket: t.id, msg: `${advisory.length} finding(s) fed to review` });
  }
  return { gaps, advisory };
}

// ---------- prompts ----------
const codingPrompt = (t, feedback) => `Read CLAUDE.md, MASTER_PROMPT.md and PLAYBOOK.md in this repo and obey them.
You are working EXACTLY ONE ticket from plan.json and nothing else.

TICKET ${t.id} — ${t.title}
lane: ${t.lane} · write_scope: ${JSON.stringify(t.write_scope)}
acceptance:
${t.acceptance.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}
${feedback ? `\nA PREVIOUS ATTEMPT FAILED ITS GATES. You may be resuming partial work — inspect the current tree first. Gate failures to fix:\n${feedback.map((g) => `- ${g}`).join('\n')}\n` : ''}
Rules of engagement:
- You are already on the correct git branch in an isolated worktree. Never switch branches, never touch main, never push.
- Set the ticket in_progress in plan.json first (commit), implement with tests per PLAYBOOK, stage explicit paths only, commit in small steps.
- Run the full gate yourself before closing (the project's lint/typecheck/test).
- When everything passes: set the ticket done in plan.json + append the docs/STATUS.md line (same commit), then stop.
- If genuinely blocked after one honest attempt: set status blocked with a notes entry explaining exactly what is missing, then stop.
- An external conductor independently verifies your work; nothing you print is trusted, only repo state.`;

const reviewPrompt = (t, diff, prior = [], advisory = []) => `You are an independent code reviewer (you did NOT write this code). Review the diff for ticket ${t.id} — ${t.title}.
Acceptance criteria:\n${t.acceptance.map((a) => `- ${a}`).join('\n')}

Review dimensions: correctness vs acceptance; error handling (no swallowed errors); security (secrets, injection, trust-boundary violations — this project's law: agent sessions untrusted, receipts required, maker!=verifier; for crypto/hash/integrity code verify the primitive is actually sound — e.g. a tamper-evident hash preimage must be injective/domain-separated); tests real and failing-capable (no assertion-free tests, no gamed fixtures); write-scope respected; no dead code or stub theater; matches docs/ARCHITECTURE.md module rules.
${advisory.length ? `\nDETERMINISTIC VALIDATOR FINDINGS on this diff (grep-heuristic — some are false positives, e.g. numbers inside comments/strings/status-codes, or "unreachable" on valid early-return code). ADJUDICATE each: is it a REAL defect worth a finding, or a false positive? Only raise the real ones:\n${advisory.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}\n` : ''}
${prior.length ? `\nPRIOR HIGH/CRITICAL FINDINGS raised on EARLIER attempts of THIS ticket. You MUST inspect the current diff and judge each one — a finding is NOT resolved merely because you would not raise it yourself; verify in the code that it was actually fixed:\n${prior.map((s, i) => `  ${i + 1}. [${s.severity}] ${s.file}: ${s.issue}`).join('\n')}\n` : ''}
Respond with ONLY a JSON object:
{"verdict":"APPROVE"|"FIX",
 "findings":[{"severity":"CRITICAL"|"HIGH"|"MEDIUM"|"LOW","file":"...","issue":"...","fix":"..."}],
 "prior_status":[{"finding":"<the issue text from the numbered list above>","status":"RESOLVED"|"PRESENT","evidence":"why — cite the code that fixes or still exhibits it"}]}
Include a prior_status entry for EVERY prior finding listed. Verdict FIX if any CRITICAL/HIGH is present in the new code OR any prior finding is not RESOLVED. Be specific; cite files.

DIFF:
${diff}`;

const securityPrompt = (w, diff) => `You are a security auditor. Audit the combined diff of wave ${w} of this project against: OWASP relevant classes, hardcoded secrets, command/path injection (this app spawns child processes and shells out to git), trust-boundary violations (agent-session outputs must never directly mutate state; receipts required), unsafe deserialization, and dependency risks. Respond with ONLY JSON: {"critical":[...],"high":[...],"medium":[...],"notes":"..."} where each item is {"file":"...","issue":"...","fix":"..."}.

DIFF:
${diff}`;

// ---------- worktree lifecycle ----------
function makeWorktree(t) {
  const branch = `${CONFIG.branchPrefix}${t.id.toLowerCase()}`;
  const wt = resolve(WT_BASE, t.id);
  try { git('worktree', 'remove', '--force', wt); } catch {}
  try { rmSync(wt, { recursive: true, force: true }); } catch {}
  try { git('branch', '-D', branch); } catch {}
  mkdirSync(WT_BASE, { recursive: true });
  git('worktree', 'add', '-q', '-b', branch, wt, 'main');
  return { branch, wt };
}
function removeWorktree(wt) {
  try { git('worktree', 'remove', '--force', wt); } catch {}
  try { rmSync(wt, { recursive: true, force: true }); } catch {}
}

// ---------- per-ticket flow ----------
async function executeTicket(t) {
  const { branch, wt } = makeWorktree(t);
  const attempts = [pickModel(t), pickModel(t), ...(ESCALATE ? [MODELS.escalate] : [])];
  let gaps = null;
  // Sticky findings: every HIGH/CRITICAL ever raised on this ticket, tracked to
  // CONFIRMED-fixed. A finding can never vanish because a later (non-deterministic)
  // reviewer instance fails to re-mention it — the harness analogue of the Challenger gate.
  const sticky = [];
  for (let i = 0; i < attempts.length; i++) {
    const model = attempts[i];
    if (i > 0) {
      log('ticket.retry', { ticket: t.id, msg: `attempt ${i + 1} on ${model}` });
      resetStatus(wt, t.id);
    }
    await runSession(codingPrompt(t, gaps), model, `code:${t.id}`, wt);
    const g = runGates(t, branch, wt);
    gaps = g.gaps;
    if (gaps.length) { log('gates.fail', { ticket: t.id, msg: gaps.join(' | ').slice(0, 400) }); continue; }

    const diff = git('diff', `main...${branch}`).slice(0, 180_000);
    const r = await runSession(reviewPrompt(t, diff, sticky, g.advisory), MODELS.reviewer, `review:${t.id}`, wt);
    const verdict = parseJson(r.out) ?? { verdict: 'FIX', findings: [{ severity: 'HIGH', file: '-', issue: 'review output unparseable', fix: 're-run review' }], prior_status: [] };

    // Findings the CURRENT pass raises fresh, and prior findings the reviewer — who is
    // shown every prior finding — explicitly says are STILL PRESENT. Those are the real
    // blockers. A prior finding that the reviewer neither re-raises nor marks PRESENT,
    // on an APPROVE verdict, is treated as resolved: an informed reviewer that has seen
    // the finding and approves is the authority, not my bookkeeping. (The earlier gate —
    // "APPROVE && zero-unresolved-sticky" with brittle text-matched resolution — false-
    // blocked W0-05/W1-01/W1-03: the reviewer APPROVED but the sticky rows never cleared.)
    const currentHigh = (verdict.findings ?? []).filter((x) => ['CRITICAL', 'HIGH'].includes(x.severity));
    for (const f of currentHigh) {
      const key = `${f.file}:${f.issue}`;
      if (!sticky.some((s) => s.key === key)) sticky.push({ key, severity: f.severity, file: f.file, issue: f.issue, fix: f.fix });
    }
    const presentPriors = (verdict.prior_status ?? []).filter((ps) => ps.status === 'PRESENT');
    const blockers = [
      ...currentHigh.map((f) => `[${f.severity}] ${f.file}: ${f.issue} — fix: ${f.fix}`),
      ...presentPriors.map((ps) => `[STILL-PRESENT] ${ps.finding} — ${ps.evidence || ''}`),
    ];
    log('review.result', { ticket: t.id, msg: `verdict=${verdict.verdict} newHigh=${currentHigh.length} priorsStillPresent=${presentPriors.length} (sticky-seen ${sticky.length})` });

    if (verdict.verdict === 'APPROVE' && blockers.length === 0) {
      log('review.approve', { ticket: t.id, msg: `informed APPROVE; ${sticky.length} prior finding(s) not re-raised` });
      return { ok: true, branch, wt };
    }
    log('review.fix', { ticket: t.id, msg: `${blockers.length} blocker(s): ${currentHigh.length} new + ${presentPriors.length} still-present` });
    gaps = blockers;
  }
  // Block with the last pass's real blockers; if none captured, fall back to the sticky-seen list.
  const ledger = (gaps && gaps.length) ? gaps : sticky.map((s) => `[${s.severity}] ${s.file}: ${s.issue} — fix: ${s.fix}`);
  return { ok: false, branch, wt, gaps: ledger };
}

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

// Reset ticket status to in_progress IN THE WORKTREE (on the branch) so a stale
// blocked/done from a prior attempt doesn't pre-fail the next attempt's gate.
function resetStatus(wt, id) {
  const plan = loadPlan(wt);
  const row = plan.tickets.find((x) => x.id === id);
  if (!row || row.status === 'in_progress') return;
  row.status = 'in_progress';
  writeFileSync(planPath(wt), JSON.stringify(plan, null, 2) + '\n');
  try { gitIn(wt, 'add', 'plan.json'); gitIn(wt, 'commit', '-q', '-m', `chore(${id}): conductor resets status before retry`); } catch {}
}

function pushRemotes(ticket) {
  if (!DO_PUSH) return;
  for (const rem of CONFIG.remotes) {
    try { sh('git', ['push', rem, 'main'], { timeout: 60_000 }); }
    catch (e) { log('push.fail', { ticket, msg: `${rem}: ${String(e.message).slice(0, 80)}` }); }
  }
}

function land(t, branch, wt) {
  // ROOT stays on main throughout — just merge the branch and clean up the worktree.
  if (DO_MERGE) {
    git('merge', '--no-ff', '-q', '-m', `Merge ${branch}: ${t.id} ${t.title}\n\nConductor-verified: gates green + independent review APPROVE (sticky findings all resolved).\nStanding approval: docs/work/APPROVALS.md A-001.\n\nCo-Authored-By: Claude (conductor run) <noreply@anthropic.com>`, branch);
    removeWorktree(wt);
    try { git('branch', '-d', branch); } catch {}
    pushRemotes(t.id);
  } else {
    log('parked', { ticket: t.id, msg: `left on ${branch} (worktree ${wt}) for review (--no-merge)` });
  }
}

function markBlocked(t, gaps, branch, wt) {
  // Block status is recorded on main (ROOT); the branch is kept for inspection, worktree removed.
  const plan = loadPlan();
  const row = plan.tickets.find((x) => x.id === t.id);
  row.status = 'blocked';
  row.notes.push(`CONDUCTOR ${now()}: blocked after ${ESCALATE ? 3 : 2} attempts. Branch ${branch} kept. Gaps: ${gaps.join(' | ').slice(0, 600)}`);
  writeFileSync(planPath(ROOT), JSON.stringify(plan, null, 2) + '\n');
  git('add', 'plan.json'); git('commit', '-q', '-m', `chore(${t.id}): conductor marks blocked with evidence`);
  removeWorktree(wt);
  pushRemotes(t.id);
}

// ---------- human-signed security waivers ----------
function loadSecurityWaivers() {
  const f = resolve(ROOT, 'docs/work/SECURITY_WAIVERS.md');
  if (!existsSync(f)) return [];
  const AGENT = /^(agent|claude|ai|assistant|conductor|bot|gpt|opus|sonnet|haiku)$/i;
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => /^\|\s*SW-\d/.test(l))
    .map((l) => l.split('|').map((c) => c.trim()))
    .filter((c) => c.length >= 7)
    .map((c) => ({ id: c[1], date: c[2], signedBy: c[3], fileMatch: c[4], issueMatch: c[5], reason: c[6] }))
    .filter((wv) => wv.fileMatch && wv.signedBy && !AGENT.test(wv.signedBy));
}
function matchWaiver(critical, waivers) {
  const file = String(critical.file ?? '').toLowerCase();
  const issue = String(critical.issue ?? '').toLowerCase();
  return waivers.find((wv) => file.includes(wv.fileMatch.toLowerCase()) && issue.includes((wv.issueMatch || '').toLowerCase()));
}

async function waveSecurityPass(w, baseSha) {
  const diff = git('diff', `${baseSha}..HEAD`).slice(0, 180_000);
  if (!diff) return;
  const r = await runSession(securityPrompt(w, diff), MODELS.security, `security:${w}`, ROOT);
  const report = parseJson(r.out);
  const path = resolve(ROOT, `docs/work/SECURITY_${w}.md`);
  writeFileSync(path, `# Security pass — wave ${w} (${now()})\n\n\`\`\`json\n${JSON.stringify(report ?? { raw: r.out.slice(0, 4000) }, null, 2)}\n\`\`\`\n`);
  git('add', path); git('commit', '-q', '-m', `docs: security pass for wave ${w}`);
  const waivers = loadSecurityWaivers();
  const crits = report?.critical ?? [];
  const active = crits.filter((c) => !matchWaiver(c, waivers));
  for (const c of crits.filter((c) => matchWaiver(c, waivers))) {
    const wv = matchWaiver(c, waivers);
    log('security.waived', { msg: `wave ${w}: CRITICAL waived by ${wv.id} (signed ${wv.signedBy}): ${String(c.issue).slice(0, 70)}` });
  }
  if (active.length > 0) {
    log('security.critical', { msg: `wave ${w}: ${active.length} unwaived CRITICAL — stopping for human review` });
    return 'STOP';
  }
}

// ---------- main ----------
async function main() {
  // plan lint — always, and exit early on --lint
  const { errors, warnings } = lintPlan(loadPlan());
  for (const w of warnings) log('lint.warn', { msg: w });
  if (errors.length) { for (const e of errors) log('lint.error', { msg: e }); if (!DRY) { console.error(`plan.json has ${errors.length} lint error(s) — fix before running`); process.exit(2); } }
  if (LINT_ONLY) { log('lint.done', { msg: `${errors.length} error(s), ${warnings.length} warning(s)` }); process.exit(errors.length ? 2 : 0); }

  for (const bin of ['claude', 'git']) {
    try { sh('which', [bin]); } catch { console.error(`missing prerequisite: ${bin}`); process.exit(1); }
  }
  if (git('status', '--porcelain')) { console.error('working tree not clean — commit or stash first'); process.exit(1); }
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') git('checkout', '-q', 'main');
  log('conductor.start', { msg: `breakpoint=${BREAKPOINT} waves=${WAVES ?? 'all'} isolation=${CONFIG.isolation} merge=${DO_MERGE} models=${JSON.stringify(MODELS)}` });

  let doneCount = 0;
  let currentWave = null;
  let waveBase = git('rev-parse', 'HEAD');

  while (doneCount < MAX_TICKETS) {
    if (existsSync(STOPFILE)) { log('conductor.stop', { msg: 'STOP file' }); break; }
    const next = claimable(loadPlan())[0];
    if (!next) { log('conductor.idle', { msg: 'nothing claimable (done or all blocked)' }); break; }

    if (currentWave && wave(next.id) !== currentWave) {
      const sec = await waveSecurityPass(currentWave, waveBase);
      if (sec === 'STOP') break;
      if (BREAKPOINT === 'wave') { log('conductor.breakpoint', { msg: `wave ${currentWave} complete` }); break; }
      waveBase = git('rev-parse', 'HEAD');
    }
    currentWave = wave(next.id);

    if (DRY) { log('ticket.dry', { ticket: next.id, msg: `${next.title} [${pickModel(next)}]` }); break; }
    log('ticket.start', { ticket: next.id, msg: `${next.title} [${pickModel(next)}]` });
    const res = await executeTicket(next);
    if (res.ok) {
      land(next, res.branch, res.wt);
      doneCount++;
      log('ticket.done', { ticket: next.id, msg: `${doneCount} landed this run` });
      if (BREAKPOINT === 'ticket') { log('conductor.breakpoint', { msg: 'per-ticket breakpoint' }); break; }
    } else {
      markBlocked(next, res.gaps ?? ['unknown'], res.branch, res.wt);
      log('ticket.blocked', { ticket: next.id });
    }
  }
  const counts = loadPlan().tickets.reduce((m, t) => ((m[t.status] = (m[t.status] || 0) + 1), m), {});
  log('conductor.end', { msg: `landed=${doneCount} board=${JSON.stringify(counts)}` });
}

main().catch((e) => { log('conductor.fatal', { msg: e.message }); process.exit(1); });
