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
    // `manifest` is a PATH and `verify` is a COMMAND — both strings, both
    // consumed by close() as `resolve(cwd, m.manifest)` and a shell command.
    // Neither was type-checked here, so a board could validate perfectly clean
    // and then crash the lifecycle: resolve() throws ERR_INVALID_ARG_TYPE on a
    // non-string, which surfaces as a stack trace rather than a refusal naming
    // the ticket. Observed 2026-07-31 — an SDLC-generated board described the
    // manifest as a rich object ({files, exports, tests}), which reads as a
    // sensible interpretation of the word and is unusable as a path.
    //
    // Checked only WHEN PRESENT: docs/TICKET_SCHEMA.md makes `manifest`
    // "required for close", not required to exist, and close() already refuses
    // clearly when it is absent. Requiring it here would invalidate boards
    // that are legitimately mid-draft.
    if (m.manifest !== undefined && (typeof m.manifest !== 'string' || !m.manifest.trim())) {
      errors.push(`${where}: manifest must be a non-empty string path to the Completion Manifest (got ${Array.isArray(m.manifest) ? 'array' : typeof m.manifest})`);
    } else if (typeof m.manifest === 'string' && m.manifest.trim()) {
      // A string is not enough — the path has to point at a DOCUMENT, because
      // the executor instructs its session to "Write a Completion Manifest at
      // <module.manifest>". Point it at a source file and the agent dutifully
      // overwrites that file with markdown: the ticket's own code or test is
      // destroyed, and `verify` then runs node --test against a markdown file.
      // The failure does not look like a bad path; it looks like the agent
      // wrecking its own deliverable. Observed 2026-07-31 — an SDLC board set
      // manifest to `tests/parse.test.js`, a file the same ticket had to
      // create, after a type-only check let the agent pick the nearest string
      // it had.
      if (!/\.md$/i.test(m.manifest.trim()))
        errors.push(`${where}: manifest must be a .md document (conventionally docs/reviews/MANIFEST_${m.id}.md) — the executor WRITES the Completion Manifest to this path, so a non-document path is overwritten`);
      // NOTE: whether the manifest sits somewhere the SCOPE GATE allows is a
      // conductor-specific constraint, not a schema one, and it is checked in
      // conductor.mjs (G6) rather than here. validatePlan serves every caller,
      // including a human driving the lifecycle by hand with a `manifest.md`
      // at the project root — perfectly valid, no scope gate involved. Making
      // it a schema error broke 19 lifecycle tests; the tests were right.
      const scope = Array.isArray(m.write_scope) ? m.write_scope : [];
      if (scope.some((s) => typeof s === 'string' && s.trim() === m.manifest.trim()))
        errors.push(`${where}: manifest '${m.manifest}' is also in write_scope — the manifest is written to that path and would clobber the ticket's own deliverable`);
    }
    // `verify` is type-checked only. A BARE PATH is valid here and is in fact
    // this repo's own convention — examples/tickets-plan.sample.json uses
    // `scripts/validators/validate-migrations.sh`, and the ai-daytrader
    // fixture uses `tests/unit/learning/test_pit_bars.py`. A rule rejecting
    // single-token paths as "not a command" was tried and reverted: it failed
    // six existing tests, because the premise was wrong, not the tests.
    if (m.verify !== undefined && (typeof m.verify !== 'string' || !m.verify.trim()))
      errors.push(`${where}: verify must be a non-empty string command (got ${Array.isArray(m.verify) ? 'array' : typeof m.verify})`);
    for (const nid of (m.nodes || [])) if (!nodeIds.has(nid)) errors.push(`${where}: references node '${nid}' not in plan.nodes`);
    // T29.2: stories[] is optional but, when present, must be a plain string
    // array — unlike `nodes`, it points at docs/USER_STORIES.md (an external
    // doc, not part of plan.json), so referential integrity against real
    // story ids is checked elsewhere (storyCoverageWarnings/requirementClosure),
    // not here.
    if (m.stories !== undefined && (!Array.isArray(m.stories) || m.stories.some((s) => typeof s !== 'string')))
      errors.push(`${where}: stories must be an array of strings`);
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

// ADVISORY (Shipwright field run 2026-07-12; three live instances of the class):
// a module whose acceptance names a concrete path in its OWN territory that no
// write_scope glob covers cannot deliver what it promises — the executor either
// blocks on the scope gate (W0-01 lockfile, W0-05 migrations dir) or silently
// under-delivers (W1-01 named-examples import). Scoped to the module's own
// top-level dirs so incidental mentions of other modules' files don't flag;
// docs/ and dotfiles skipped (shared-ledger convention). Returned as WARNINGS,
// not errors — the CLI prints them as [!] lines; validate-tickets.sh gates
// only on [x].
export function scopeCoverageWarnings(plan) {
  const out = [];
  for (const m of plan.modules || []) {
    const scopes = (m.write_scope || []).map(normScope).filter(Boolean);
    const ownTop = new Set(scopes.map(s => s.split('/')[0]));
    const text = (m.acceptance || []).join(' ');
    const paths = [...text.matchAll(/([\w.-]+(?:\/[\w.*-]+)+\.[a-z]{2,4})\b/g)].map(x => x[1]);
    for (const p of new Set(paths)) {
      if (p.startsWith('docs/') || p.startsWith('.')) continue;
      if (!ownTop.has(p.split('/')[0])) continue;
      const covered = scopes.some(s => p === s || p.startsWith(s + '/'));
      if (!covered) out.push({ id: m.id, path: p, msg: `module '${m.id}': acceptance names '${p}' in its own area but no write_scope glob covers it` });
    }
  }
  return out;
}

// testSiblingWarnings: a ticket whose write_scope carries implementation files
// but no test file cannot add tests without tripping the scope gate.
//
// The agent is asked for tests by its acceptance criteria and forbidden from
// writing them by its write_scope, and the only honest moves left are to
// self-block or to delete the tests it just wrote. Both have happened for real:
// a downstream project's W6-01 ticket wrote five table-driven tests, verified
// them, then deleted them rather than self-amend its own scope; and on 2026-07-31 an
// SDLC-generated board here scoped `src/parse.js` alone while its acceptance
// demanded tests — the session wrote 214 lines of them and lost the whole
// attempt to "tests/parse.test.js written outside assigned scope".
//
// ADVISORY, not an error. examples/tickets-plan.sample.json has zero of five
// modules with a test in scope, so gating on this would invalidate this repo's
// own canonical board. (A stricter `verify`-shape rule was tried the same day
// and reverted for exactly this reason — the fixtures encode the convention,
// and a rule that fails them is usually wrong about the convention.)
//
// Same-directory, not exact-sibling naming: foo.test.js, foo.spec.ts,
// foo_test.go and test_foo.py are all legitimate layouts, and demanding one
// filename produces false warnings on real trees.
const TEST_PATH_RE = /(^|\/)(tests?|__tests__|spec)\//i;
const TEST_FILE_RE = /((\.|_|-)(test|spec)s?\.[a-z]+$)|((^|\/)test_[^/]+$)|(_test\.[a-z]+$)|(Test\.[a-z]+$)/i;
const SOURCE_FILE_RE = /\.(js|mjs|cjs|jsx|ts|tsx|py|go|rs|rb|java|kt|swift|php|cs|scala)$/i;

export function testSiblingWarnings(plan) {
  const out = [];
  const isTest = (f) => TEST_PATH_RE.test(f) || TEST_FILE_RE.test(f);
  const dirOf = (f) => f.slice(0, f.lastIndexOf('/') + 1);
  for (const m of plan.modules || []) {
    // A settled ticket's scope is history; warning on it every run buries the
    // actionable ones (27 of 29 warnings on a real board).
    if (m.status === 'done') continue;
    const scope = (m.write_scope || []).filter((f) => typeof f === 'string');
    // Glob scopes (`src/**`) already admit any test file under them.
    const impl = scope.filter((f) => !f.includes('*') && SOURCE_FILE_RE.test(f) && !isTest(f));
    if (!impl.length) continue;
    const testDirs = new Set(scope.filter(isTest).map(dirOf));
    const globDirs = scope.filter((f) => f.includes('*')).map((f) => f.slice(0, f.indexOf('*')));
    const uncovered = impl.filter((f) =>
      !testDirs.has(dirOf(f)) && !globDirs.some((g) => f.startsWith(g)));
    if (uncovered.length)
      out.push({ id: m.id, msg: `module '${m.id}': write_scope has implementation (${uncovered.join(', ')}) but no test file in the same directory — the agent cannot add tests for it without an out-of-scope gate failure` });
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

// storyCoverageWarnings (T29.2): a story that exists in docs/USER_STORIES.md
// (storyIds, extracted by scripts/lib/user-stories.mjs) but is referenced by
// stories[] in ZERO modules — the "task closure says done, but nothing ever
// claimed this requirement" gap the field lesson (A-6.3) named. Advisory —
// same posture as scopeCoverageWarnings: validate-tickets.sh prints these as
// [!] lines and only gates on them when STORY_COVERAGE_STRICT promotes them
// to [x]. storyIds is caller-supplied (plain array or Set of strings) since
// this module never reads files itself (kept pure/testable).
export function storyCoverageWarnings(plan, storyIds) {
  const ids = new Set(storyIds);
  const covered = new Set();
  for (const m of plan.modules || []) for (const s of (m.stories || [])) covered.add(s);
  const out = [];
  for (const id of ids) {
    if (!covered.has(id)) out.push({ id, msg: `story '${id}' is not referenced by stories[] on any module` });
  }
  return out;
}

// requirementClosure (T29.2): the Phase 4→5 gate's real question — is every
// REQUIREMENT (story) closed, not just every module ("task"). A story is
// closed only when (a) at least one module references it via stories[] AND
// (b) every module referencing it is status 'done'. Deliberately independent
// of task closure: a plan can be 100% modules-done and still fail this if a
// story was never mapped to any module (the ticket's red-fixture scenario) —
// or partially open if some, but not all, of a story's modules are done.
export function requirementClosure(plan, storyIds) {
  const modules = plan.modules || [];
  const byStory = new Map();
  for (const id of new Set(storyIds)) byStory.set(id, []);
  for (const m of modules) {
    for (const s of (m.stories || [])) {
      if (!byStory.has(s)) byStory.set(s, []); // module references a story outside the known set — still tracked, graded same as any other
      byStory.get(s).push(m);
    }
  }
  const stories = [];
  let openCount = 0, closedCount = 0;
  for (const [id, mods] of byStory) {
    let status, reason;
    if (mods.length === 0) {
      status = 'open'; reason = 'unmapped — no module references this story';
    } else if (mods.every((m) => m.status === 'done')) {
      status = 'closed';
    } else {
      status = 'open'; reason = `incomplete — ${mods.filter((m) => m.status !== 'done').map((m) => `${m.id}:${m.status}`).join(', ')}`;
    }
    if (status === 'closed') closedCount++; else openCount++;
    stories.push({ id, status, reason, modules: mods.map((m) => m.id) });
  }
  stories.sort((a, b) => a.id.localeCompare(b.id));
  return { stories, openCount, closedCount };
}
