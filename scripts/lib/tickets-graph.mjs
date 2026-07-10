// tickets-graph.mjs — pure module-contract graph invariants for tickets.mjs
// (T1, extracted T26.3).
//
// Split out from tickets.mjs so tickets-lifecycle.mjs can import validatePlan()
// / writeScopeCollisions() without a circular import (tickets.mjs is the
// barrel that imports lifecycle verbs FROM tickets-lifecycle.mjs; if the
// graph functions stayed in tickets.mjs, tickets-lifecycle.mjs importing them
// back would cycle). Found by independent review (T26.3): claim()'s
// refuse-to-select-next-work hygiene check had only ever been wired into the
// CLI's `claim` handler in tickets.mjs, not into the exported claim()
// function itself — a caller that imported the library directly (as this
// repo's own test fixtures already do) bypassed the gate entirely, despite
// tickets-lifecycle.mjs's own header comment calling these functions "the
// only sanctioned path." This module is what makes moving the check into
// claim() itself possible without a cycle.
//
// No other behavior change from the pre-T26.3 tickets.mjs — same functions,
// same logic, just relocated. tickets.mjs re-exports all of these for
// backward compatibility (its public API / CLI is unchanged).

export const STATUSES = ['blocked', 'ready', 'claimed', 'in_progress', 'in_review', 'done'];
const AUTO = new Set(['blocked', 'ready']);           // states the resolver may set
const ACTIVE = new Set(['claimed', 'in_progress', 'in_review']); // "someone is in here"

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
    if (!m.lane || typeof m.lane !== 'string') errors.push(`${where}: missing string lane`);
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

  // cross-lane write_scope overlap is a schema-validity error, not just a runtime
  // race — see crossLaneCollisions() for why this is unconditional on status.
  for (const c of crossLaneCollisions(plan))
    errors.push(`write-scope collision across lanes: '${c.a}' (${c.lane_a}) vs '${c.b}' (${c.lane_b}) — ${c.scope}`);

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

// Lane grouping shared by the CLI (`tickets.mjs status`) and the board
// generator: a module with no `lane` still needs a bucket instead of being
// silently dropped (T10.2 independent review found exactly this bug for the
// board — same fix applies here).
export const UNASSIGNED_LANE = '(unassigned)';
export const laneOf = m => m.lane || UNASSIGNED_LANE;

// claimable() grouped by lane (T10.3) — lane is the parallel-safety
// partition (crossLaneCollisions()), so "what can start now" should be
// answerable per lane, not as one flat list a newcomer has to cross-reference
// against write-scopes by hand. Every lane present in the plan gets a
// bucket, even an empty one — "0 claimable in backend right now" is useful
// signal, not noise to hide, and it mirrors gen-tickets-board.mjs's
// Ready/In Progress/Blocked sections, which show "(none)" the same way.
export function claimableByLane(plan) {
  const modules = plan.modules || [];
  const readyIds = new Set(claimable(plan).map(m => m.id));
  const lanes = [...new Set(modules.map(laneOf))].sort();
  return lanes.map(lane => ({
    lane,
    modules: modules
      .filter(m => laneOf(m) === lane && readyIds.has(m.id))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }));
}

// Collisions among modules "someone is in" (active) plus ready modules that
// would collide with an active one — i.e. what /reflow must refuse to hand off.
// SAME-LANE pairs only: a different-lane overlap is a schema error caught
// unconditionally by crossLaneCollisions()/validatePlan(), not a runtime race —
// checking it again here would just double-report the same defect.
export function writeScopeCollisions(plan, { states = new Set([...ACTIVE, 'ready']) } = {}) {
  const modules = (plan.modules || []).filter(m => states.has(m.status));
  const out = [];
  for (let i = 0; i < modules.length; i++)
    for (let j = i + 1; j < modules.length; j++) {
      const a = modules[i], b = modules[j];
      if (a.lane !== b.lane) continue;
      // two ready-but-unclaimed modules colliding is fine until one is claimed;
      // only flag when at least one side is already active.
      if (!ACTIVE.has(a.status) && !ACTIVE.has(b.status)) continue;
      for (const sa of a.write_scope) for (const sb of b.write_scope)
        if (scopesOverlap(sa, sb)) out.push({ a: a.id, b: b.id, scope: `${sa} ∩ ${sb}` });
    }
  return out;
}

// Any two modules in DIFFERENT lanes must never share write_scope — this is the
// invariant that makes "different lane = safe to run in parallel" true. Checked
// regardless of status: a plan with this defect is malformed, not just racy at
// runtime, so it belongs in validatePlan() rather than gated on active/ready.
export function crossLaneCollisions(plan) {
  const modules = plan.modules || [];
  const out = [];
  for (let i = 0; i < modules.length; i++)
    for (let j = i + 1; j < modules.length; j++) {
      const a = modules[i], b = modules[j];
      if (a.lane == null || b.lane == null || a.lane === b.lane) continue;
      for (const sa of (a.write_scope || [])) for (const sb of (b.write_scope || []))
        if (scopesOverlap(sa, sb)) out.push({ a: a.id, b: b.id, lane_a: a.lane, lane_b: b.lane, scope: `${sa} ∩ ${sb}` });
    }
  return out;
}

// hygieneCheck (T26.3): the same ticket-graph invariant validate-tickets.sh
// enforces in the gate sweep (validatePlan()+writeScopeCollisions(), the
// identical check) — exposed here so claim() (tickets-lifecycle.mjs) can
// refuse to select a NEW ticket while the graph itself is malformed or
// colliding, regardless of whether the caller goes through the CLI or
// imports the library directly.
export function hygieneCheck(plan) {
  const { ok, errors } = validatePlan(plan);
  const collisions = writeScopeCollisions(plan);
  if (ok && collisions.length === 0) return { ok: true };
  const lines = [
    ...errors.map((e) => `  [x] ${e}`),
    ...collisions.map((c) => `  [x] write-scope collision: ${c.a} vs ${c.b} (${c.scope})`),
  ];
  return { ok: false, output: lines.join('\n') };
}
