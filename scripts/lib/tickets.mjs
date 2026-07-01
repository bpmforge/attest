#!/usr/bin/env node
// tickets.mjs — module-contract ticket layer over plan.json (T1).
//
// Adds an assignable MODULE layer above task-decomposer's fine-grained node DAG.
// A module is a *contract* (interface + exclusive write-scope + acceptance +
// depends_on), not an assignment to a specific agent — any agent, including a
// contributor's own, may claim one as long as it honors the contract. This file
// is the reader/writer/validator the rest of the feature (T2 board, T3 /reflow,
// T6 validators) builds on.
//
// DESIGN RULES (what keeps parallel work collision-free):
//   1. modules[] is OPTIONAL and additive — a plain task-decomposer plan.json
//      (nodes[] only) stays valid. Backward compatible.
//   2. Write-scopes of modules that are simultaneously workable MUST be disjoint;
//      writeScopeCollisions() surfaces violations (T6 will fail on them).
//   3. Status is auto-computed only for non-claimed, non-terminal modules:
//      a module is `ready` when every depends_on module is `done`, else `blocked`.
//      Human/agent-owned states (claimed/in_progress/in_review/done) are never
//      auto-downgraded.
//
// CLI:  node scripts/lib/tickets.mjs validate <plan.json>
//       node scripts/lib/tickets.mjs status   <plan.json>   # recompute + print claimable
//
// Exit 0 ok / 1 invalid or collisions / 2 usage.

import { readFileSync, writeFileSync } from 'fs';

export const STATUSES = ['blocked', 'ready', 'claimed', 'in_progress', 'in_review', 'done'];
const AUTO = new Set(['blocked', 'ready']);           // states the resolver may set
const ACTIVE = new Set(['claimed', 'in_progress', 'in_review']); // "someone is in here"

export function loadPlan(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function savePlan(path, plan) {
  writeFileSync(path, JSON.stringify(plan, null, 2) + '\n');
}

// Normalize a write-scope glob to a comparable path prefix: strip trailing
// /**, /*, and a bare trailing * so "src/dashboard/**" -> "src/dashboard".
function normScope(g) {
  return String(g).replace(/\/\*\*?$/, '').replace(/\/\*$/, '').replace(/\*+$/, '').replace(/\/$/, '');
}

// Two scopes overlap if one path is a prefix of the other at a segment boundary.
function scopesOverlap(a, b) {
  const x = normScope(a), y = normScope(b);
  if (x === y) return true;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  return longer === shorter || longer.startsWith(shorter + '/');
}

export function validatePlan(plan) {
  const errors = [];
  const modules = Array.isArray(plan.modules) ? plan.modules : [];
  const nodeIds = new Set((plan.nodes || []).map(n => n.id));
  const modIds = new Set();

  for (const m of modules) {
    const where = `module '${m.id ?? '(no id)'}'`;
    if (!m.id || typeof m.id !== 'string') { errors.push(`${where}: missing string id`); continue; }
    if (modIds.has(m.id) || nodeIds.has(m.id)) errors.push(`${where}: duplicate id`);
    modIds.add(m.id);
    if (m.kind !== 'module') errors.push(`${where}: kind must be "module"`);
    if (!m.title) errors.push(`${where}: missing title`);
    if (!Array.isArray(m.write_scope) || m.write_scope.length === 0) errors.push(`${where}: write_scope must be a non-empty array`);
    if (!Array.isArray(m.acceptance) || m.acceptance.length === 0) errors.push(`${where}: acceptance must be a non-empty array`);
    if (!Array.isArray(m.depends_on)) errors.push(`${where}: depends_on must be an array`);
    if (!STATUSES.includes(m.status)) errors.push(`${where}: status '${m.status}' not one of ${STATUSES.join('|')}`);
    if (m.owner != null && typeof m.owner !== 'string') errors.push(`${where}: owner must be a string or null`);
    for (const nid of (m.nodes || [])) if (!nodeIds.has(nid)) errors.push(`${where}: references node '${nid}' not in plan.nodes`);
  }
  // depends_on must reference real modules
  for (const m of modules) for (const d of (m.depends_on || [])) if (!modIds.has(d)) errors.push(`module '${m.id}': depends_on '${d}' is not a module`);

  // cycle detection over module depends_on
  const byId = Object.fromEntries(modules.map(m => [m.id, m]));
  const WHITE = 0, GRAY = 1, BLACK = 2; const color = {};
  const cyc = [];
  const visit = (id, stack) => {
    color[id] = GRAY;
    for (const d of (byId[id]?.depends_on || [])) {
      if (color[d] === GRAY) cyc.push([...stack, id, d].join(' -> '));
      else if (color[d] !== BLACK && byId[d]) visit(d, [...stack, id]);
    }
    color[id] = BLACK;
  };
  for (const m of modules) if (color[m.id] !== BLACK) visit(m.id, []);
  for (const c of cyc) errors.push(`dependency cycle: ${c}`);

  return { ok: errors.length === 0, errors };
}

// Recompute blocked/ready for non-claimed modules. Returns the plan (mutated).
export function recomputeStatus(plan) {
  const modules = plan.modules || [];
  const byId = Object.fromEntries(modules.map(m => [m.id, m]));
  const isDone = id => byId[id]?.status === 'done';
  for (const m of modules) {
    if (!AUTO.has(m.status)) continue;               // never touch claimed/in_progress/in_review/done
    m.status = (m.depends_on || []).every(isDone) ? 'ready' : 'blocked';
  }
  return plan;
}

export function claimable(plan) {
  return (plan.modules || []).filter(m => m.status === 'ready' && m.owner == null);
}

// Collisions among modules "someone is in" (active) plus ready modules that
// would collide with an active one — i.e. what /reflow must refuse to hand off.
export function writeScopeCollisions(plan, { states = new Set([...ACTIVE, 'ready']) } = {}) {
  const modules = (plan.modules || []).filter(m => states.has(m.status));
  const out = [];
  for (let i = 0; i < modules.length; i++)
    for (let j = i + 1; j < modules.length; j++) {
      const a = modules[i], b = modules[j];
      // two ready-but-unclaimed modules colliding is fine until one is claimed;
      // only flag when at least one side is already active.
      if (!ACTIVE.has(a.status) && !ACTIVE.has(b.status)) continue;
      for (const sa of a.write_scope) for (const sb of b.write_scope)
        if (scopesOverlap(sa, sb)) out.push({ a: a.id, b: b.id, scope: `${sa} ∩ ${sb}` });
    }
  return out;
}

// ── CLI ────────────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const [cmd, path] = process.argv.slice(2);
  if (!cmd || !path) { console.error('usage: tickets.mjs <validate|status> <plan.json>'); process.exit(2); }
  const plan = loadPlan(path);
  if (cmd === 'validate') {
    const { ok, errors } = validatePlan(plan);
    const collisions = writeScopeCollisions(plan);
    for (const e of errors) console.log(`  [x] ${e}`);
    for (const c of collisions) console.log(`  [x] write-scope collision: ${c.a} vs ${c.b} (${c.scope})`);
    const clean = ok && collisions.length === 0;
    console.log(clean ? `ok — ${(plan.modules || []).length} module(s) valid, no collisions` : `INVALID — ${errors.length} error(s), ${collisions.length} collision(s)`);
    process.exit(clean ? 0 : 1);
  } else if (cmd === 'status') {
    recomputeStatus(plan);
    const ready = claimable(plan);
    console.log(`claimable (${ready.length}):`);
    for (const m of ready) console.log(`  ${m.id} — ${m.title}  [${m.write_scope.join(', ')}]`);
    process.exit(0);
  } else { console.error(`unknown command: ${cmd}`); process.exit(2); }
}
