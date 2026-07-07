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
| `manifest` | string (path) | required for `close` | Path (relative to `plan.json`'s directory) to this ticket's Completion Manifest. `close()` refuses unless this file exists on disk. |
| `history` | `{ts,actor,from,to,note}[]` | machine-managed | Append-only transition log written by the lifecycle verbs (T26.1). Never hand-edited — the audit trail the 2026-07-07 incident showed doesn't exist otherwise. |
| `evidence` | `{branch,commits[],verify_cmd}` \| absent | machine-managed | Set by `close()` on success — records what was actually verified, not just claimed. |
| `claimed_at` | string (ISO timestamp) \| null | machine-managed | Set by `claim()`, cleared by `release()`. |

## Status semantics

- **Auto-resolved** (`recomputeStatus`): only `blocked` ⇄ `ready`. A module is `ready` iff every
  `depends_on` module is `done`, else `blocked`.
- **Owned/terminal** (`claimed`, `in_progress`, `in_review`, `done`): set ONLY by the lifecycle
  verbs below (T26.1) — never hand-edited, never auto-changed by `recomputeStatus`.
- **Claimable** = `ready` AND `owner == null`.

## Lifecycle (T26.1) — enforced transition graph

```
ready ──claim──► claimed ──start──► in_progress ──close──► in_review ──accept──► done
                                        │
                                        └──────── release ────────► (back to ready, clears owner)
```

Agents never hand-edit `status`/`owner` again — these six CLI verbs (also exported as functions
from `scripts/lib/tickets.mjs`, implemented in `scripts/lib/tickets-lifecycle.mjs`) are the only
sanctioned path, and each appends an immutable `history[]` entry:

- **`claim <plan> <id> <actor>`** — refused unless `ready` + unowned; refused if `actor` already
  owns another `claimed`/`in_progress` ticket (**WIP=1**). Sets `claimed_at`.
- **`start <plan> <id> <actor>`** — `claimed → in_progress`. Owner-only.
- **`comment <plan> <id> <actor> <note>`** — appends free-text history at any time, any state.
  Does not change status.
- **`close <plan> <id> <actor> --branch <b> --commits <c1,c2,...>`** — `in_progress → in_review`.
  The load-bearing gate: refused unless **all** of (a) `module.manifest` exists on disk, (b)
  `module.verify` — and *only* `module.verify*, never a caller-supplied override* — exits 0 when
  run by this code, (c) `branch` + at least one commit supplied. Sets `evidence`, prints a
  paste-able receipt.
- **`accept <plan> <id> <actor>`** — `in_review → done`. Reviewer-only: refused if `actor` is the
  same as the ticket's `owner` (don't accept your own work — the 3-layer-check split).
- **`release <plan> <id> <actor> <reason>`** — `claimed`/`in_progress` → `ready`, clears
  `owner`/`claimed_at`. Requires a non-empty reason; staleness/abandonment is a human/reflow
  decision, never silent.

Every verb returns non-zero and a `[x] <reason>` message on refusal; `plan.json` is only
persisted back to disk when a verb succeeds.

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
