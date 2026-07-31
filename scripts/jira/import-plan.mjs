#!/usr/bin/env node
// import-plan.mjs — reconstruct plan.json module tickets FROM Jira.
//
// The adapter's normal direction is plan.json -> Jira (`sync-plan`), and
// docs/DESIGN_JIRA_ADAPTER.md §1 is explicit that plan.json stays source of
// truth. This is the reverse pass, for the two cases that direction cannot
// serve: a plan.json that has drifted from (or been lost relative to) the Jira
// board, and tickets authored in Jira that never had a module ticket at all.
//
// It does NOT make Jira the source of truth. It produces a CANDIDATE plan and
// a drift report, and refuses to touch plan.json unless you pass --apply and
// the candidate validates. Jira becomes the thing you validate against, which
// is the useful half of "Jira as source of truth" without the half that would
// let a remote edit silently rewrite the local execution contract.
//
// DETERMINISTIC FIRST, LLM ONLY FOR THE GAPS. sync-plan writes a structured
// description:
//     Interface: <text>
//     Write-scope: a.js, b.js
//     Acceptance criteria:
//     - [ ] ...
//     _Mirrored from plan.json module <id> — plan.json is source of truth._
// so interface/write_scope/acceptance round-trip exactly, `depends_on` comes
// from real "is blocked by" issue links, `status` from the configured
// statusMap, `lane` from deriveLane(), and `manifest` from convention. Only
// what genuinely cannot be recovered goes to a model. A parser that is right
// is worth more than a model that is usually right, and every field it
// recovers is one fewer field to review.
//
// Usage:
//   node scripts/jira/import-plan.mjs                 # candidate + drift report
//   node scripts/jira/import-plan.mjs --no-llm        # deterministic only
//   node scripts/jira/import-plan.mjs --apply         # write plan.json (validated)
// Flags: --out <path> --model <m> --plan <path> --json

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveConfig, JiraClient, loadPlanAt } from './jira.mjs';
import { validatePlan, testSiblingWarnings } from '../lib/tickets-graph.mjs';
import { deriveLane } from '../lib/derive-lanes.mjs';

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);

const ROOT = process.cwd();
const PLAN_PATH = resolve(ROOT, flag('--plan', process.env.PLAN_JSON || 'docs/work/plan.json'));
const OUT_PATH = resolve(ROOT, flag('--out', 'docs/work/plan.imported.json'));
const MODEL = flag('--model', process.env.IMPORT_MODEL || null);
const USE_LLM = !has('--no-llm');
const APPLY = has('--apply');
const JSON_OUT = has('--json');

const log = (...a) => { if (!JSON_OUT) console.log(...a); };

// ---------------------------------------------------------------------------
// Deterministic recovery
// ---------------------------------------------------------------------------

/** Jira Cloud returns ADF (a document tree); DC returns a plain string. */
function descriptionText(d) {
  if (!d) return '';
  if (typeof d === 'string') return d;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return '';
    if (n.type === 'text') return n.text || '';
    if (n.type === 'hardBreak') return '\n';
    const inner = (n.content || []).map(walk).join('');
    return /^(paragraph|listItem|bulletList|heading)$/.test(n.type) ? inner + '\n' : inner;
  };
  return walk(d).trim();
}

/** Parse exactly what acceptanceDescription() emits. */
export function parseDescription(text) {
  const out = { interface: null, write_scope: [], acceptance: [], planId: null };
  const lines = String(text || '').split('\n').map((l) => l.trim());
  let inAcceptance = false;
  for (const l of lines) {
    let m;
    if ((m = /^Interface:\s*(.+)$/i.exec(l))) { out.interface = m[1].trim(); inAcceptance = false; continue; }
    if ((m = /^Write-scope:\s*(.+)$/i.exec(l))) {
      out.write_scope = m[1].split(',').map((s) => s.trim()).filter(Boolean);
      inAcceptance = false; continue;
    }
    if (/^Acceptance criteria:/i.test(l)) { inAcceptance = true; continue; }
    if ((m = /_Mirrored from plan\.json module ([^\s—]+)/.exec(l))) { out.planId = m[1].trim(); continue; }
    if (inAcceptance && (m = /^[-*]\s*\[[ xX]\]\s*(.+)$/.exec(l))) { out.acceptance.push(m[1].trim()); continue; }
    if (inAcceptance && l === '') continue;
    if (inAcceptance && !/^[-*]/.test(l)) inAcceptance = false;
  }
  return out;
}

/** plan-id label wins; the description footer is the fallback; else the key. */
function planIdOf(issue, parsed) {
  const label = (issue.fields.labels || []).find((l) => l.startsWith('plan-id:'));
  if (label) return label.slice('plan-id:'.length);
  if (parsed.planId) return parsed.planId;
  return issue.key;
}

/** "is blocked by" = this issue depends on the other. */
function blockedByKeys(issue, blocksLinkType) {
  return (issue.fields.issuelinks || [])
    .filter((l) => l.type?.name === blocksLinkType && l.inwardIssue)
    .map((l) => l.inwardIssue.key);
}

function reverseStatus(jiraName, statusMap) {
  for (const [planStatus, name] of Object.entries(statusMap)) if (name === jiraName) return planStatus;
  return null;
}

// ---------------------------------------------------------------------------
// LLM normalization — only for fields deterministic recovery could not fill
// ---------------------------------------------------------------------------

const GAP_SCHEMA_NOTE = `Return ONLY a JSON object, no prose, of the form:
{"write_scope":["path/to/file.ext", "..."],"acceptance":["...","..."],"verify":"<shell command>"}
Rules:
- write_scope lists the EXCLUSIVE files this ticket may edit. It is a safety
  fence, not a wish list: anything omitted cannot be written, and anything
  wrongly included lets this ticket edit another's files.
- If the ticket needs tests, write_scope MUST also contain the test file
  (e.g. src/x.js AND src/x.test.js), or the ticket is unsatisfiable.
- verify is a COMMAND or a path to a check script, e.g. "npm test" or
  "node --test src/x.test.js".
- Omit any field you cannot determine. Do not invent file paths that the
  description does not support.`;

function askModel(issue, parsed, missing) {
  const prompt = [
    `A Jira issue must be expressed as a module ticket for an automated executor.`,
    `Fill ONLY these missing fields: ${missing.join(', ')}.`,
    ``,
    `Issue: ${issue.key} — ${issue.fields.summary || ''}`,
    `Description:`,
    descriptionText(issue.fields.description) || '(empty)',
    ``,
    `Already recovered (do not contradict):`,
    JSON.stringify({ write_scope: parsed.write_scope, acceptance: parsed.acceptance }, null, 1),
    ``,
    GAP_SCHEMA_NOTE,
  ].join('\n');

  const args = ['run'];
  if (MODEL) args.push('--model', MODEL);
  const r = spawnSync(process.env.OPENCODE_BIN || 'opencode', [...args, prompt],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 180_000 });
  const out = `${r.stdout || ''}`;
  // Tolerate prose around the object — take the last balanced {...} block.
  const start = out.lastIndexOf('{');
  const end = out.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(out.slice(start, end + 1)); } catch { return null; }
}

// ---------------------------------------------------------------------------

async function main() {
  const cfg = resolveConfig();
  if (!cfg.enabled) {
    console.error('jira not configured (set JIRA_BASE_URL + credentials, or TRACKER_BACKEND=jira) — nothing to import');
    process.exit(2);
  }
  const client = new JiraClient(cfg);

  const jql = `project = "${cfg.project}" ORDER BY created ASC`;
  const fields = ['summary', 'description', 'issuetype', 'labels', 'status', 'issuelinks', 'parent'];
  const issues = (await client.search(jql, fields)).issues || [];
  log(`[import] ${issues.length} issue(s) from ${cfg.project}`);

  // Pass 1 — deterministic.
  const keyToPlanId = {};
  const rows = issues.map((issue) => {
    const parsed = parseDescription(descriptionText(issue.fields.description));
    const id = planIdOf(issue, parsed);
    keyToPlanId[issue.key] = id;
    return { issue, parsed, id };
  });

  const modules = [];
  const needsLlm = [];
  for (const { issue, parsed, id } of rows) {
    const status = reverseStatus(issue.fields.status?.name, cfg.statusMap) || 'ready';
    const m = {
      id,
      kind: 'module',
      title: issue.fields.summary || id,
      lane: parsed.write_scope.length ? deriveLane(parsed.write_scope) : undefined,
      owner: null,
      status,
      write_scope: parsed.write_scope,
      depends_on: blockedByKeys(issue, cfg.blocksLinkType).map((k) => keyToPlanId[k] || k),
      acceptance: parsed.acceptance,
      manifest: `docs/reviews/MANIFEST_${id}.md`,
      jira_key: issue.key,
    };
    if (parsed.interface) m.interface = parsed.interface;

    // `verify` never round-trips — sync-plan does not write it to Jira.
    const missing = [];
    if (!m.write_scope.length) missing.push('write_scope');
    if (!m.acceptance.length) missing.push('acceptance');
    missing.push('verify');
    if (missing.length) needsLlm.push({ module: m, issue, parsed, missing });
    modules.push(m);
  }

  const llmFilled = [];
  if (USE_LLM && needsLlm.length) {
    log(`[import] ${needsLlm.length} ticket(s) need model help for: ${[...new Set(needsLlm.flatMap((n) => n.missing))].join(', ')}`);
    for (const n of needsLlm) {
      const got = askModel(n.issue, n.parsed, n.missing);
      if (!got) { log(`  [!] ${n.module.id}: model returned nothing usable — left for a human`); continue; }
      const filled = [];
      // Only ever FILL a gap. A model must not overwrite a field the parser
      // recovered from the description — that text is the mirrored contract.
      if (!n.module.write_scope.length && Array.isArray(got.write_scope) && got.write_scope.length) {
        n.module.write_scope = got.write_scope.filter((s) => typeof s === 'string');
        n.module.lane = deriveLane(n.module.write_scope);
        filled.push('write_scope');
      }
      if (!n.module.acceptance.length && Array.isArray(got.acceptance) && got.acceptance.length) {
        n.module.acceptance = got.acceptance.filter((s) => typeof s === 'string');
        filled.push('acceptance');
      }
      if (!n.module.verify && typeof got.verify === 'string' && got.verify.trim()) {
        n.module.verify = got.verify.trim();
        filled.push('verify');
      }
      if (filled.length) llmFilled.push({ id: n.module.id, fields: filled });
    }
  }

  for (const m of modules) if (!m.lane) m.lane = deriveLane(m.write_scope || []);

  const candidate = {
    goal: `imported from Jira project ${cfg.project}`,
    importedAt: new Date().toISOString(),
    sourceTracker: 'jira',
    modules,
  };

  // Validate the candidate exactly as the executor will.
  const { ok, errors } = validatePlan(candidate);
  const siblings = testSiblingWarnings(candidate);

  // Drift vs the local board — this is the "Jira as validation" half.
  const drift = [];
  if (existsSync(PLAN_PATH)) {
    const local = loadPlanAt(PLAN_PATH);
    const byId = Object.fromEntries((local.modules || []).map((m) => [m.id, m]));
    for (const m of modules) {
      const l = byId[m.id];
      if (!l) { drift.push(`${m.id}: in Jira, absent from ${PLAN_PATH}`); continue; }
      if (l.status !== m.status) drift.push(`${m.id}: status local='${l.status}' jira='${m.status}'`);
      const a = JSON.stringify((l.write_scope || []).slice().sort());
      const b = JSON.stringify((m.write_scope || []).slice().sort());
      if (a !== b) drift.push(`${m.id}: write_scope differs (local ${a} vs jira ${b})`);
      const da = JSON.stringify((l.depends_on || []).slice().sort());
      const db = JSON.stringify((m.depends_on || []).slice().sort());
      if (da !== db) drift.push(`${m.id}: depends_on differs (local ${da} vs jira ${db})`);
    }
    for (const l of local.modules || []) if (!modules.some((m) => m.id === l.id)) drift.push(`${l.id}: in ${PLAN_PATH}, absent from Jira`);
  }

  writeFileSync(OUT_PATH, JSON.stringify(candidate, null, 2) + '\n');

  const report = {
    issues: issues.length, modules: modules.length, out: OUT_PATH,
    valid: ok, errors, testSiblingWarnings: siblings.map((s) => s.msg),
    llmFilled, drift, applied: false,
  };

  if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); }
  else {
    log(`[import] wrote ${OUT_PATH}`);
    for (const e of errors) log(`  [x] ${e}`);
    for (const s of siblings) log(`  [!] ${s.msg}`);
    for (const f of llmFilled) log(`  [~] ${f.id}: model supplied ${f.fields.join(', ')} — REVIEW before running`);
    for (const d of drift) log(`  [drift] ${d}`);
    log(`[import] ${ok ? 'valid' : `INVALID — ${errors.length} error(s)`}; ${drift.length} drift item(s)`);
  }

  if (APPLY) {
    // Refuse to overwrite the execution contract with something that does not
    // validate. An invalid board does not fail at import; it fails one coding
    // session per ticket, hours later.
    if (!ok) {
      console.error(`[x] refusing --apply: candidate is INVALID (${errors.length} error(s)). Fix ${OUT_PATH} first.`);
      process.exit(1);
    }
    if (llmFilled.length) {
      console.error(`[x] refusing --apply: ${llmFilled.length} ticket(s) carry model-supplied fields (${llmFilled.map((f) => f.id).join(', ')}).`);
      console.error(`    write_scope is a safety fence — review ${OUT_PATH}, then copy it over ${PLAN_PATH} yourself.`);
      process.exit(1);
    }
    writeFileSync(PLAN_PATH, JSON.stringify(candidate, null, 2) + '\n');
    report.applied = true;
    log(`[import] applied to ${PLAN_PATH}`);
  }

  process.exit(ok ? 0 : 1);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main().catch((e) => { console.error(`[x] ${e.message}`); process.exit(1); });
