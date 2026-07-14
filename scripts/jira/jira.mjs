#!/usr/bin/env node
// jira.mjs — Jira Data Center adapter for the internal ticket lifecycle.
//
// DESIGN (docs/DESIGN_JIRA_ADAPTER.md):
//   plan.json (scripts/lib/tickets.mjs + tickets-lifecycle.mjs) is the SOURCE
//   OF TRUTH. This adapter is a MIRRORED LEDGER: it projects the six lifecycle
//   verbs (claim/start/comment/close/accept/release) onto Jira DC REST v2, plus
//   sync-plan (create epics/stories/links/components), close-epic (gated on all
//   children done), pull (normalized TrackerItem snapshot), reconcile (drain the
//   durable outbox) and doctor (config/connectivity/drift/status-name check).
//
//   Never blocks local work: every lifecycle verb updates plan.json FIRST via
//   the internal engine; the Jira mirror is best-effort and, on any failure,
//   the op stays pending in docs/work/jira-outbox.jsonl for `reconcile` to
//   replay. Every REST mutation is idempotent so replay is safe.
//
//   Graceful fallback: no JIRA_BASE_URL (TRACKER_BACKEND=auto→none) → the
//   adapter is disabled; the lifecycle verbs still run on plan.json exactly as
//   before, and jira.sh verbs are a no-op mirror with a one-line notice.
//
// Auth: Jira DC/Server, Personal Access Token as `Authorization: Bearer`.
// Cloud (v3/ADF/email+token) is a follow-up behind the same JiraClient
// interface (JIRA_FLAVOR=cloud) — not built in this pass.
//
// The REST client takes an injectable `fetchImpl`, so jira.test.mjs / the
// test-jira-adapter.ts chapter exercise every path against a mocked Jira with
// no live instance.

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import {
  loadPlan, savePlan,
  claim, start, comment, close, accept, release,
} from '../lib/tickets.mjs';
// The outbox primitives are Jira-free and shared with tickets.mjs (the SoT
// engine emits through the same seam) — see lifecycle-outbox.mjs header.
import {
  backendConfigured, outboxPath, appendOutbox, pendingOps, ackOp, nowIso,
} from '../lib/lifecycle-outbox.mjs';

// ── Config & backend selection ──────────────────────────────────────────────

export const DEFAULT_CONFIG = {
  flavor: 'datacenter',
  issuetypes: { epic: 'Epic', story: 'Story', task: 'Task' },
  blocksLinkType: 'Blocks',            // inward: "is blocked by"
  epicLinkFieldId: null,               // DC "Epic Link"; auto-discovered if null
  statusMap: {
    ready: 'To Do',
    claimed: 'Selected for Development',
    in_progress: 'In Progress',
    in_review: 'In Review',
    done: 'Done',
  },
  laneToComponent: {},                 // e.g. { frontend: 'ui', backend: 'api' }
};

// Resolve the effective config from env + an optional per-project
// jira.config.json. `enabled:false` is the fallback signal — every caller must
// honour it and degrade to plan.json-only.
export function resolveConfig(env = process.env, configPath = null) {
  const backend = (env.TRACKER_BACKEND || 'auto').toLowerCase();
  const baseUrl = (env.JIRA_BASE_URL || '').replace(/\/+$/, '');
  // backendConfigured() is the neutral selection check shared with the outbox
  // seam, so tickets.mjs and this adapter can never disagree on "is Jira on".
  if (!backendConfigured(env) || !baseUrl) {
    return { enabled: false, reason: baseUrl ? `TRACKER_BACKEND=${backend}` : 'JIRA_BASE_URL unset' };
  }
  let fileCfg = {};
  const cfgPath = configPath || env.JIRA_CONFIG;
  if (cfgPath && existsSync(cfgPath)) {
    try { fileCfg = JSON.parse(readFileSync(cfgPath, 'utf8')); }
    catch (e) { throw new Error(`bad jira.config.json (${cfgPath}): ${e.message}`); }
  }
  return {
    enabled: true,
    baseUrl,
    token: env.JIRA_TOKEN || '',
    email: env.JIRA_EMAIL || fileCfg.email || '',   // Cloud Basic auth (email:token)
    project: env.JIRA_PROJECT || fileCfg.project || '',
    flavor: (env.JIRA_FLAVOR || fileCfg.flavor || DEFAULT_CONFIG.flavor).toLowerCase(),
    issuetypes: { ...DEFAULT_CONFIG.issuetypes, ...(fileCfg.issuetypes || {}) },
    blocksLinkType: fileCfg.blocksLinkType || DEFAULT_CONFIG.blocksLinkType,
    epicLinkFieldId: fileCfg.epicLinkFieldId || DEFAULT_CONFIG.epicLinkFieldId,
    statusMap: { ...DEFAULT_CONFIG.statusMap, ...(fileCfg.statusMap || {}) },
    laneToComponent: { ...DEFAULT_CONFIG.laneToComponent, ...(fileCfg.laneToComponent || {}) },
  };
}

// ── REST client (v2, DC) ────────────────────────────────────────────────────

export class JiraClient {
  // fetchImpl defaults to global fetch; tests inject a mock.
  constructor(cfg, fetchImpl = globalThis.fetch) {
    if (!cfg || !cfg.enabled) throw new Error('JiraClient constructed with a disabled config');
    this.cfg = cfg;
    this.cloud = cfg.flavor === 'cloud';
    this.api = this.cloud ? '/rest/api/3' : '/rest/api/2';
    this._fetch = fetchImpl;
  }

  // DC/Server: PAT as Bearer. Cloud: email + API-token as Basic.
  _authHeader() {
    if (this.cloud) {
      const basic = Buffer.from(`${this.cfg.email}:${this.cfg.token}`).toString('base64');
      return `Basic ${basic}`;
    }
    return `Bearer ${this.cfg.token}`;
  }

  async _req(method, path, body) {
    const url = `${this.cfg.baseUrl}${path.startsWith('/rest') ? '' : this.api}${path}`;
    const res = await this._fetch(url, {
      method,
      headers: {
        'Authorization': this._authHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = typeof res.text === 'function' ? await res.text() : '';
    if (!res.ok) {
      const err = new Error(`Jira ${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return text ? JSON.parse(text) : {};
  }

  search(jql, fields = ['summary', 'status', 'assignee', 'issuetype', 'labels']) {
    const q = encodeURIComponent(jql);
    const f = encodeURIComponent(fields.join(','));
    return this._req('GET', `/search?jql=${q}&fields=${f}&maxResults=200`);
  }
  getIssue(key, fields = ['summary', 'status', 'assignee', 'issuetype', 'labels', 'issuelinks']) {
    return this._req('GET', `/issue/${key}?fields=${encodeURIComponent(fields.join(','))}`);
  }
  createIssue(fields) { return this._req('POST', '/issue', { fields }); }
  updateIssue(key, fields) { return this._req('PUT', `/issue/${key}`, { fields }); }
  // Cloud identifies users by accountId; DC/Server by username. `actor` is
  // interpreted accordingly, so a cloud project passes accountIds as actors.
  assign(key, actor) {
    const payload = this.cloud ? { accountId: actor || null } : { name: actor || null };
    return this._req('PUT', `/issue/${key}/assignee`, payload);
  }
  // The current assignee's identity in the flavor's own terms (accountId on
  // Cloud, username on DC) — what the claim/accept guards compare against.
  assigneeOf(issue) {
    const a = issue.fields?.assignee;
    if (!a) return null;
    return this.cloud ? (a.accountId || null) : (a.name || null);
  }
  // Cloud v3 comment bodies must be Atlassian Document Format; DC v2 is plain text.
  addComment(key, text) {
    const body = this.cloud
      ? { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: String(text) }] }] }
      : String(text);
    return this._req('POST', `/issue/${key}/comment`, { body });
  }
  listTransitions(key) { return this._req('GET', `/issue/${key}/transitions`); }
  doTransition(key, transitionId) { return this._req('POST', `/issue/${key}/transitions`, { transition: { id: transitionId } }); }
  createLink(inwardKey, outwardKey, typeName) {
    return this._req('POST', '/issueLink', { type: { name: typeName }, inwardIssue: { key: inwardKey }, outwardIssue: { key: outwardKey } });
  }
  getFields() { return this._req('GET', '/field'); }
  getStatuses() { return this._req('GET', '/status'); }
}

// ── Idempotent primitives ───────────────────────────────────────────────────

const planLabel = (id) => `plan-id:${id}`;
const laneLabel = (lane) => `lane:${lane}`;

// Find an existing Jira issue mirroring a plan module, by its plan-id label.
export async function findIssueByPlanId(client, planId) {
  const jql = `project = "${client.cfg.project}" AND labels = "${planLabel(planId)}"`;
  const r = await client.search(jql);
  return (r.issues && r.issues[0]) || null;
}

// Transition an issue to the Jira status mapped from a plan status. No-op if
// already there or if the workflow has no such transition available.
export async function transitionTo(client, key, planStatus) {
  const target = client.cfg.statusMap[planStatus];
  if (!target) return { ok: false, reason: `no statusMap entry for '${planStatus}'` };
  const issue = await client.getIssue(key, ['status']);
  if (issue.fields?.status?.name === target) return { ok: true, noop: true };
  const { transitions = [] } = await client.listTransitions(key);
  const t = transitions.find((x) => x.to?.name === target || x.name === target);
  if (!t) return { ok: false, reason: `no transition to '${target}' available from current status` };
  await client.doTransition(key, t.id);
  return { ok: true, to: target };
}

async function resolveEpicLinkField(client) {
  if (client.cfg.epicLinkFieldId) return client.cfg.epicLinkFieldId;
  const fields = await client.getFields();
  const f = fields.find((x) => x.name === 'Epic Link' || x.name === 'Parent');
  return f ? f.id : null;
}

// ── sync-plan: create/update epics + stories + links + components ────────────

export async function syncPlan(plan, client, { write = true } = {}) {
  const modules = plan.modules || [];
  const created = [];
  const linked = [];
  const cfg = client.cfg;
  const epicField = await resolveEpicLinkField(client).catch(() => null);

  // Pass 1: ensure an issue per module (idempotent by plan-id label).
  const keyByPlanId = {};
  for (const m of modules) {
    let issue = await findIssueByPlanId(client, m.id);
    if (!issue) {
      const isEpic = m.kind === 'epic' || m.epic === true;
      const itype = isEpic ? cfg.issuetypes.epic : (m.stories?.length ? cfg.issuetypes.story : cfg.issuetypes.task);
      const labels = [planLabel(m.id)];
      if (m.lane) labels.push(laneLabel(m.lane));
      const fields = {
        project: { key: cfg.project },
        summary: m.title || m.id,
        issuetype: { name: itype },
        labels,
        description: acceptanceDescription(m),
      };
      const comp = cfg.laneToComponent[m.lane];
      if (comp) fields.components = [{ name: comp }];
      const res = await client.createIssue(fields);
      issue = { key: res.key, fields };
      created.push(res.key);
    }
    keyByPlanId[m.id] = issue.key;
    m.jira_key = issue.key; // machine-managed reverse map (like evidence)
  }

  // Pass 2: epic links + blocking links (idempotent).
  for (const m of modules) {
    const key = keyByPlanId[m.id];
    // Epic membership: if this module declares an epic parent. Cloud v3 uses the
    // native `parent` field; DC/Server uses the "Epic Link" custom field.
    if (m.epic_parent && keyByPlanId[m.epic_parent]) {
      const parentKey = keyByPlanId[m.epic_parent];
      const fields = client.cloud ? { parent: { key: parentKey } } : (epicField ? { [epicField]: parentKey } : null);
      if (fields) await client.updateIssue(key, fields).catch(() => {});
    }
    // depends_on → "is blocked by": THIS issue is blocked by the dep's issue.
    for (const dep of m.depends_on || []) {
      const depKey = keyByPlanId[dep];
      if (!depKey) continue;
      if (await linkExists(client, key, depKey, cfg.blocksLinkType)) continue;
      // outward "Blocks": depKey blocks key  ⇒ key is blocked by depKey
      await client.createLink(depKey, key, cfg.blocksLinkType);
      linked.push(`${depKey} blocks ${key}`);
    }
  }

  if (write) savePlan(planPathOf(plan), plan);
  return { created, linked, keyByPlanId };
}

function acceptanceDescription(m) {
  const lines = [];
  if (m.interface) lines.push(`Interface: ${m.interface}`);
  if (m.write_scope?.length) lines.push(`Write-scope: ${m.write_scope.join(', ')}`);
  if (m.acceptance?.length) {
    lines.push('', 'Acceptance criteria:');
    for (const a of m.acceptance) lines.push(`- [ ] ${a}`);
  }
  lines.push('', `_Mirrored from plan.json module ${m.id} — plan.json is source of truth._`);
  return lines.join('\n');
}

async function linkExists(client, key, otherKey, typeName) {
  const issue = await client.getIssue(key, ['issuelinks']);
  const links = issue.fields?.issuelinks || [];
  return links.some((l) =>
    l.type?.name === typeName &&
    (l.inwardIssue?.key === otherKey || l.outwardIssue?.key === otherKey));
}

// planPathOf: modules carry no path; syncPlan callers set plan.__path. The CLI
// always sets it. Kept internal so library callers can pass write:false.
function planPathOf(plan) {
  if (!plan.__path) throw new Error('plan.__path not set — load via loadPlanAt()');
  return plan.__path;
}
export function loadPlanAt(path) {
  const plan = loadPlan(path);
  Object.defineProperty(plan, '__path', { value: resolve(path), enumerable: false });
  return plan;
}

// Outbox primitives (outboxPath/appendOutbox/pendingOps/ackOp/nowIso) are
// imported from ../lib/lifecycle-outbox.mjs — the Jira-free seam shared with
// tickets.mjs. Re-export for adapter consumers/tests.
export { outboxPath, appendOutbox, pendingOps };

// ── Verb mirrors (applied to Jira for one event) ────────────────────────────

// Apply a single lifecycle event to Jira. Idempotent. Returns {ok} or throws
// (throwing leaves the op pending for the next reconcile).
export async function applyEvent(client, plan, event) {
  const m = (plan.modules || []).find((x) => x.id === event.planId);
  const key = event.jiraKey || m?.jira_key;
  if (!key) throw new Error(`no Jira key for plan id '${event.planId}' — run sync-plan first`);
  const s = client.cfg.statusMap;
  switch (event.verb) {
    case 'claim':
      await client.assign(key, event.actor);
      await transitionTo(client, key, 'claimed');
      return { ok: true };
    case 'start':
      await transitionTo(client, key, 'in_progress');
      return { ok: true };
    case 'comment':
      await client.addComment(key, event.note || '');
      return { ok: true };
    case 'close':
      await transitionTo(client, key, 'in_review');
      await client.addComment(key, `Closed for review — branch \`${event.branch}\`, commits: ${(event.commits || []).join(', ')}`);
      return { ok: true };
    case 'accept':
      await transitionTo(client, key, 'done');
      return { ok: true };
    case 'release':
      await client.assign(key, null);
      await transitionTo(client, key, 'ready');
      return { ok: true };
    default:
      throw new Error(`unknown verb '${event.verb}'`);
  }
}

// Drain every pending op. Inline drain (jira.sh verb) and `reconcile` share
// this. Stops acking an op on first failure so it is retried next time.
export async function drainOutbox(client, plan, planPath, env = process.env) {
  const pending = pendingOps(planPath);
  const drained = [];
  const failed = [];
  for (const op of pending) {
    try {
      await applyEvent(client, plan, op);
      ackOp(planPath, op.ts, env);
      drained.push(op);
    } catch (e) {
      failed.push({ op, error: e.message });
    }
  }
  return { drained, failed };
}

// ── Guarded lifecycle verbs (SoT first, then mirror) ────────────────────────
//
// Each verb runs the INTERNAL engine on plan.json first (authoritative), emits
// the event, then drains inline (best-effort). A Jira-specific guard runs
// BEFORE the internal verb only where Jira carries state the local board
// can't see (cross-surface claim, maker≠verifier on the Jira assignee).

function resolveModule(plan, ref) {
  return (plan.modules || []).find((m) => m.jira_key === ref || m.id === ref);
}

async function runVerb(planPath, ref, internalFn, buildEvent, { client, preGuard } = {}) {
  const plan = loadPlanAt(planPath);
  const m = resolveModule(plan, ref);
  if (!m) return { ok: false, error: `no module for '${ref}' (by id or jira_key)` };
  if (client && preGuard) {
    const g = await preGuard(client, m);
    if (!g.ok) return g;
  }
  const r = internalFn(plan, m.id);
  if (!r.ok) return r;
  savePlan(planPath, plan);
  const event = { planId: m.id, jiraKey: m.jira_key, ...buildEvent(r) };
  appendOutbox(planPath, event);
  let mirror = { skipped: true };
  if (client) {
    const fresh = loadPlanAt(planPath);
    mirror = await drainOutbox(client, fresh, planPath).catch((e) => ({ failed: [{ error: e.message }] }));
  }
  return { ok: true, module: m.id, receipt: r.receipt, mirror };
}

export const verbs = {
  claim: (planPath, ref, actor, opts = {}) =>
    runVerb(planPath, ref, (plan, id) => claim(plan, id, actor),
      () => ({ verb: 'claim', actor }),
      { client: opts.client, preGuard: async (client, m) => {
        if (!m.jira_key) return { ok: true };
        const issue = await client.getIssue(m.jira_key, ['assignee', 'issuetype']);
        if (issue.fields?.issuetype?.name === client.cfg.issuetypes.epic)
          return { ok: false, error: `${m.jira_key} is an Epic — claim a child issue, not the epic` };
        const cur = client.assigneeOf(issue);
        if (cur && cur !== actor)
          return { ok: false, error: `${m.jira_key} already assigned to '${cur}' in Jira — refusing cross-surface double-grab` };
        return { ok: true };
      } }),
  start: (planPath, ref, actor, opts = {}) =>
    runVerb(planPath, ref, (plan, id) => start(plan, id, actor), () => ({ verb: 'start', actor }), opts),
  comment: (planPath, ref, actor, note, opts = {}) =>
    runVerb(planPath, ref, (plan, id) => comment(plan, id, actor, note), () => ({ verb: 'comment', actor, note }), opts),
  close: (planPath, ref, actor, flags, opts = {}) =>
    runVerb(planPath, ref, (plan, id) => close(plan, id, actor, { branch: flags.branch, commits: flags.commits, cwd: dirname(resolve(planPath)) }),
      () => ({ verb: 'close', actor, branch: flags.branch, commits: flags.commits }), opts),
  accept: (planPath, ref, actor, opts = {}) =>
    runVerb(planPath, ref, (plan, id) => accept(plan, id, actor, { cwd: dirname(resolve(planPath)) }),
      () => ({ verb: 'accept', actor }),
      { client: opts.client, preGuard: async (client, m) => {
        if (!m.jira_key) return { ok: true };
        const issue = await client.getIssue(m.jira_key, ['assignee']);
        const assignee = client.assigneeOf(issue);
        if (assignee && assignee === actor)
          return { ok: false, error: `${m.jira_key} is assigned to '${actor}' — a verifier must differ from the maker (maker≠verifier)` };
        return { ok: true };
      } }),
  release: (planPath, ref, actor, reason, opts = {}) =>
    runVerb(planPath, ref, (plan, id) => release(plan, id, actor, reason), () => ({ verb: 'release', actor, reason }), opts),
};

// ── close-epic: gated on all Epic-Link children Done ────────────────────────

export async function closeEpic(client, epicKey) {
  const target = client.cfg.statusMap.done;
  const jql = `"Epic Link" = ${epicKey} OR parentEpic = ${epicKey}`;
  let children;
  try { children = (await client.search(jql, ['status'])).issues || []; }
  catch { children = (await client.search(`"Epic Link" = ${epicKey}`, ['status'])).issues || []; }
  const open = children.filter((c) => c.fields?.status?.name !== target);
  if (open.length)
    return { ok: false, error: `${epicKey}: ${open.length} child issue(s) not ${target} — epic closes only when all children are done`, openKeys: open.map((c) => c.key) };
  await transitionTo(client, epicKey, 'done');
  return { ok: true, closed: children.length };
}

// ── syncState: convergence — align Jira to plan.json (any-writer catch-all) ──
//
// The keystone of the unattended path. Instead of relying on every writer to
// emit an outbox event, syncState reads plan.json (the source of truth) and
// makes each mirrored issue's assignee + status MATCH the module, idempotently.
// This is what makes the conductor (which calls the lifecycle functions
// in-process, not the CLI) mirror correctly with no per-caller hooks: run
// syncState after its transitions and Jira converges. Safe to run any number of
// times — a converged board changes nothing on the next pass.
export async function syncState(client, plan) {
  const changed = [];
  const missing = [];
  for (const m of plan.modules || []) {
    let key = m.jira_key;
    if (!key) { const iss = await findIssueByPlanId(client, m.id); key = iss?.key; }
    if (!key) { missing.push(m.id); continue; }         // never synced — sync-plan first
    const issue = await client.getIssue(key, ['assignee', 'status']);
    const desiredAssignee = m.owner || null;
    if (client.assigneeOf(issue) !== desiredAssignee) {
      await client.assign(key, desiredAssignee);
      changed.push(`${m.id} (${key}) assignee → ${desiredAssignee || '(none)'}`);
    }
    const desiredStatus = client.cfg.statusMap[m.status];
    if (desiredStatus && issue.fields?.status?.name !== desiredStatus) {
      const t = await transitionTo(client, key, m.status);
      if (t.ok && !t.noop) changed.push(`${m.id} (${key}) status → ${desiredStatus}`);
    }
  }
  return { changed, missing };
}

// ── pull: normalized TrackerItem snapshot (feeds tracker-model.mjs) ──────────

export async function pull(client) {
  const jql = `project = "${client.cfg.project}" ORDER BY created ASC`;
  const issues = (await client.search(jql, ['summary', 'issuetype', 'labels', 'status', 'customfield_10014', 'parent'])).issues || [];
  const items = issues.map((i) => ({
    id: i.key,
    type: (i.fields.issuetype?.name || '').toLowerCase(),
    title: i.fields.summary || '',
    parentId: i.fields.parent?.key || i.fields.customfield_10014 || null,
    labels: i.fields.labels || [],
  }));
  return { generatedAt: nowIso(), sourceTracker: 'jira', items };
}

// ── doctor: config + connectivity + status-name + drift ─────────────────────

export async function doctor(client, plan, planPath) {
  const out = { config: 'ok', connectivity: null, statusMismatch: [], drift: [], pending: 0 };
  try {
    const statuses = (await client.getStatuses()).map((s) => s.name);
    out.connectivity = 'ok';
    for (const [planStatus, jiraName] of Object.entries(client.cfg.statusMap)) {
      if (!statuses.includes(jiraName)) out.statusMismatch.push(`${planStatus} → '${jiraName}' (not a workflow status on this instance)`);
    }
  } catch (e) { out.connectivity = `FAIL: ${e.message}`; }
  out.pending = pendingOps(planPath).length;
  for (const m of plan.modules || []) {
    if (m.status === 'done' && m.jira_key) {
      try {
        const issue = await client.getIssue(m.jira_key, ['status']);
        if (issue.fields?.status?.name !== client.cfg.statusMap.done &&
            !pendingOps(planPath).some((o) => o.planId === m.id))
          out.drift.push(`${m.id} (${m.jira_key}): plan done but Jira ${issue.fields?.status?.name}, no pending mirror`);
      } catch { /* connectivity already reported */ }
    }
  }
  return out;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseFlags(argv) {
  const flags = {}; const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--branch') flags.branch = argv[++i];
    else if (argv[i] === '--commits') flags.commits = (argv[++i] || '').split(',').filter(Boolean);
    else if (argv[i] === '--check') flags.check = true;
    else rest.push(argv[i]);
  }
  return { flags, rest };
}

const USAGE = `usage: jira.sh <verb> ...   (plan via $PLAN_JSON, default docs/work/plan.json)
  sync-plan                          create/update epics+stories+links+components (idempotent)
  claim   <issue|id> <actor>         assign+transition; refuses epics & cross-grabbed
  start   <issue|id> <actor>
  comment <issue|id> <actor> <note>
  close   <issue|id> <actor> --branch <b> --commits <c1,c2>
  accept  <issue|id> <actor>         maker≠verifier
  release <issue|id> <actor> <reason>
  close-epic <EPIC-KEY>              gated: all children Done
  reconcile [--check]                drain outbox / report drift
  pull                               normalized snapshot → stdout
  doctor                             config + connectivity + status-name + drift`;

async function main(argv) {
  const cmd = argv[0];
  const planPath = process.env.PLAN_JSON || 'docs/work/plan.json';
  const cfg = resolveConfig(process.env, process.env.JIRA_CONFIG);

  if (!cmd) { console.error(USAGE); process.exit(2); }

  // Fallback path: no backend → verbs still run on plan.json via jira.mjs's
  // internal engine (no mirror). Only pure-Jira commands (sync-plan/pull/etc.)
  // require a backend.
  if (!cfg.enabled) {
    if (['sync-plan', 'pull', 'doctor', 'close-epic', 'reconcile'].includes(cmd)) {
      console.error(`[jira] not configured (${cfg.reason}) — plan.json is the ledger; '${cmd}' needs a backend. Set JIRA_BASE_URL.`);
      process.exit(cmd === 'doctor' ? 0 : 1);
    }
    console.error(`[jira] not configured (${cfg.reason}) — running '${cmd}' on plan.json only (no mirror).`);
  }
  const client = cfg.enabled ? new JiraClient(cfg) : null;
  const { flags, rest } = parseFlags(argv.slice(1));

  const emitResult = (r) => {
    if (!r.ok) { console.error(`[x] ${r.error}`); process.exit(1); }
    const mf = r.mirror?.failed?.length ? ` (mirror deferred: ${r.mirror.failed.length} pending — run reconcile)` : '';
    console.log(`ok — ${cmd} ${r.module}${mf}`);
    if (r.receipt) console.log(r.receipt);
    process.exit(0);
  };

  switch (cmd) {
    case 'sync-plan': {
      const plan = loadPlanAt(planPath);
      const r = await syncPlan(plan, client);
      console.log(`ok — sync-plan: ${r.created.length} created, ${r.linked.length} link(s)`);
      process.exit(0); break;
    }
    case 'claim':   return emitResult(await verbs.claim(planPath, rest[0], rest[1], { client }));
    case 'start':   return emitResult(await verbs.start(planPath, rest[0], rest[1], { client }));
    case 'comment': return emitResult(await verbs.comment(planPath, rest[0], rest[1], rest.slice(2).join(' '), { client }));
    case 'close':   return emitResult(await verbs.close(planPath, rest[0], rest[1], flags, { client }));
    case 'accept':  return emitResult(await verbs.accept(planPath, rest[0], rest[1], { client }));
    case 'release': return emitResult(await verbs.release(planPath, rest[0], rest[1], rest.slice(2).join(' '), { client }));
    case 'close-epic': {
      const r = await closeEpic(client, rest[0]);
      if (!r.ok) { console.error(`[x] ${r.error}`); process.exit(1); }
      console.log(`ok — epic ${rest[0]} closed (${r.closed} children done)`); process.exit(0); break;
    }
    case 'reconcile': {
      const plan = loadPlanAt(planPath);
      if (flags.check) {
        const p = pendingOps(planPath);
        console.log(p.length ? `drift — ${p.length} pending mirror op(s)` : 'ok — outbox drained, no pending ops');
        process.exit(p.length ? 1 : 0);
      }
      // Two passes: (1) drain the outbox — replays real-time verb events
      // (incl. comments, which convergence can't reconstruct); (2) converge
      // from plan-state — the any-writer catch-all that fixes assignee/status
      // drift left by callers that never emitted (e.g. the conductor).
      const r = await drainOutbox(client, plan, planPath);
      const s = await syncState(client, loadPlanAt(planPath));
      const missing = s.missing.length ? ` (${s.missing.length} module(s) never synced — run 'jira.sh sync-plan')` : '';
      console.log(`ok — reconcile: ${r.drained.length} drained, ${r.failed.length} still pending; ${s.changed.length} converged${missing}`);
      for (const c of s.changed) console.log(`  · ${c}`);
      process.exit(r.failed.length ? 1 : 0); break;
    }
    case 'pull': {
      console.log(JSON.stringify(await pull(client), null, 2)); process.exit(0); break;
    }
    case 'doctor': {
      const plan = loadPlanAt(planPath);
      const r = await doctor(client, plan, planPath);
      console.log(JSON.stringify(r, null, 2));
      const bad = r.connectivity !== 'ok' || r.statusMismatch.length || r.drift.length;
      process.exit(bad ? 1 : 0); break;
    }
    default: console.error(`unknown command: ${cmd}\n${USAGE}`); process.exit(2);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main(process.argv.slice(2)).catch((e) => { console.error(`[x] ${e.message}`); process.exit(1); });
