# Module-Contract Ticket Schema (T1)

Canonical schema for the module layer added to `plan.json`. Machine contract for
`scripts/lib/tickets.mjs`, the `/reflow` skill (T3), and the ticket validators (T6).
Human-facing rationale lives in `docs/SDLC_TICKETS_REFLOW_RESUME_PLAN.md`.

## Shape

`plan.json` gains an **optional** top-level `modules[]` array alongside the existing
task-decomposer `nodes[]`. A plan with only `nodes[]` stays valid (backward compatible).

```json
{
  "goal": "string",
  "modules": [ <ModuleTicket>, ... ],   // optional; the assignable contract layer
  "nodes":   [ <Node>, ... ]            // existing fine-grained DAG (unchanged)
}
```

## ModuleTicket

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `id` | string, unique across modules+nodes | yes | Stable ticket id, e.g. `M-frontend-dashboard` |
| `kind` | `"module"` | yes | Discriminates from a `node` |
| `title` | string | yes | Human label for the board |
| `lane` | string | yes | Parallel-safety partition (project-defined, e.g. `frontend`/`backend`/`design`/`infra`/`docs`). The guarantee a lane makes: two modules in *different* lanes never share `write_scope` — that's what makes "different lane = safe to start in parallel" true. Modules in the *same* lane may still collide; that's an ordinary sequencing concern, not a lane violation. |
| `owner` | string \| null | yes | Free-text handle (`"brad"`) or agent name (`"coding-agent"`); `null` = unclaimed |
| `status` | enum | yes | `blocked` \| `ready` \| `claimed` \| `in_progress` \| `in_review` \| `done` |
| `interface` | string (path) | recommended | The contract other modules code against (enables interface-first parallelism) |
| `write_scope` | string[] (globs), non-empty | yes | Exclusive edit territory. Disjoint across concurrently-workable modules |
| `depends_on` | string[] (module ids) | yes | DAG edges. Satisfied when each referenced module is `done` |
| `acceptance` | string[], non-empty | yes | Jira-style checkable criteria = the module's PRODUCE contract |
| `verify` | string (path) | recommended | The gate that closes the ticket (validator script / challenger) |
| `nodes` | string[] (node ids) | optional | Fine-grained `plan.json` nodes implementing this module |
| `after_replan` | boolean | optional | Recompute this ticket after a scout/replan node returns |

## Status semantics

- **Auto-resolved** (`recomputeStatus`): only `blocked` ⇄ `ready`. A module is `ready` iff every
  `depends_on` module is `done`, else `blocked`.
- **Owned/terminal** (`claimed`, `in_progress`, `in_review`, `done`): never auto-changed — set by
  whoever is working it or by the closing gate.
- **Claimable** = `ready` AND `owner == null`.

## Invariants (enforced by the lib; T6 turns these into a gate)

1. Ids unique across `modules[]` and `nodes[]`.
2. `depends_on` references existing module ids; the module DAG is acyclic.
3. `module.nodes` reference existing `plan.nodes` ids.
4. **Write-scopes of active modules in the SAME lane are disjoint.** `writeScopeCollisions()`
   flags any same-lane overlap where at least one side is active
   (`claimed`/`in_progress`/`in_review`) — that is the condition under which two contributors
   in the same lane would clobber each other.
5. **Write-scopes never overlap ACROSS different lanes — checked unconditionally, any status.**
   `crossLaneCollisions()` (folded into `validatePlan()`'s errors) flags any overlap between two
   modules whose `lane` differs, regardless of `status`. This is a schema-validity error, not a
   runtime race: the entire point of a lane is the guarantee that a different lane is safe to
   start in parallel, so a plan where two different lanes touch the same files is malformed the
   moment it's written, whether or not either module has been claimed yet. (Same-lane overlap is
   fine at this level — invariant 4 catches it only once it becomes active.)

## API (`scripts/lib/tickets.mjs`)

```
loadPlan(path) · savePlan(path, plan)
validatePlan(plan)            -> { ok, errors[] }   // includes lane-required + cross-lane collision errors
recomputeStatus(plan)         -> plan (blocked/ready resolved)
claimable(plan)               -> ModuleTicket[]
writeScopeCollisions(plan)    -> { a, b, scope }[]           // same-lane, active-status only
crossLaneCollisions(plan)     -> { a, b, lane_a, lane_b, scope }[]   // cross-lane, any status
```

CLI: `node scripts/lib/tickets.mjs validate <plan.json>` · `... status <plan.json>`

Reference sample: `examples/tickets-plan.sample.json` (validates; every module has a `lane`;
`status` resolves two blocked frontend modules to claimable once their `done` deps are met).
