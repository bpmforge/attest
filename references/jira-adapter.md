# Jira Adapter — mirror the ticket lifecycle to Jira Data Center

**Last updated:** 2026-07-14
**Code:** `scripts/jira/jira.mjs` (+ `jira.sh` wrapper), `scripts/lib/lifecycle-outbox.mjs`
**Design:** [`docs/DESIGN_JIRA_ADAPTER.md`](../docs/DESIGN_JIRA_ADAPTER.md)

The adapter projects this system's internal ticket lifecycle onto a real Jira
Data Center instance. **`plan.json` stays the source of truth** (the
`scripts/lib/tickets.mjs` engine — claim/start/comment/close/accept/release,
WIP=1, maker≠verifier, `history[]` audit); Jira is a **mirrored ledger**. When
Jira is not configured, every verb still runs on `plan.json` with zero behavior
change — the adapter is a no-op.

## Setup

```bash
export JIRA_BASE_URL=https://jira.company.com   # unset ⇒ adapter disabled (fallback)
export JIRA_TOKEN=<personal-access-token>       # sent as Authorization: Bearer
export JIRA_PROJECT=PROJ
# optional:
export JIRA_FLAVOR=datacenter                   # datacenter (default) | cloud (follow-up)
export JIRA_CONFIG=path/to/jira.config.json     # field/name overrides (see sample below)
export TRACKER_BACKEND=auto                      # auto (default) | jira | none
export PLAN_JSON=docs/work/plan.json            # source-of-truth plan

scripts/jira/jira.sh doctor                     # verify config + connectivity + status names
```

Copy `scripts/jira/jira.config.sample.json` to your project as `jira.config.json`
and override only what your instance names differently (issue types, the "Epic
Link" field id, workflow status names, lane→component map). Every field has a
built-in default; auto-discovery finds the Epic Link field if you omit it.

## Verbs

```
jira.sh sync-plan                     # create/update epics+stories+links+components (idempotent)
jira.sh claim   <issue|id> <actor>    # assign+transition; refuses epics & cross-grabbed issues
jira.sh start   <issue|id> <actor>
jira.sh comment <issue|id> <actor> <note>
jira.sh close   <issue|id> <actor> --branch <b> --commits <c1,c2>
jira.sh accept  <issue|id> <actor>    # maker≠verifier: refuses if Jira assignee == acceptor
jira.sh release <issue|id> <actor> <reason>
jira.sh close-epic <EPIC-KEY>         # refused unless every Epic-Link child is Done
jira.sh reconcile [--check]           # drain outbox + converge Jira to plan-state; --check reports drift
jira.sh pull                          # normalized TrackerItem snapshot → stdout
jira.sh doctor                        # config + connectivity + status-name + drift check
```

Issues are addressed by either the Jira key (`PROJ-142`) or the plan module id
(`M-frontend`) — `sync-plan` stores each module's Jira key back on the module
(`jira_key`) so both resolve.

## SDLC hygiene (mirrors the internal rules onto Jira)

| Rule | How it's enforced |
|---|---|
| Grab issues, not epics | `claim` on an Epic issue is refused |
| Close epic only when children done | `close-epic` refused unless every Epic-Link child is Done |
| No two workers on one ticket | WIP=1 on `plan.json` **+** `claim` refused if the Jira issue is already assigned to a different user (cross-surface guard) |
| Maker ≠ verifier | `accept` refused if the Jira assignee equals the acceptor |
| Comment on update / close on done | verbs post Jira comments / transition + evidence |
| Proper user spaces | each module's `lane` → a Jira **Component** (e.g. `ui`) via `laneToComponent` |
| Blocking links | each `depends_on` → an "is blocked by" issue link (idempotent) |

## Graceful degradation (never blocks local work)

`plan.json` is written **first** and is authoritative. The Jira mirror is a
best-effort op appended to a durable outbox (`docs/work/jira-outbox.jsonl`) and
applied immediately when Jira is healthy. On any failure (network, 5xx, auth)
the op stays pending and `jira.sh reconcile` replays it — every REST mutation is
idempotent, so replay is always safe.

**`reconcile` is two passes:** (1) drain the outbox (replays queued verb events,
including comments), then (2) **converge from plan-state** — `syncState` reads
`plan.json` and makes each issue's assignee + status match the module,
idempotently. Pass 2 is the any-writer catch-all: a writer that never emitted an
outbox event (the **conductor**, which calls the lifecycle functions in-process;
or a manual `plan.json` edit) still converges. The conductor runs `reconcile`
automatically after each pick-up and each accept (gated on `TRACKER_BACKEND=jira`),
so unattended runs mirror without any per-caller hooks.

| Condition | Behavior |
|---|---|
| `JIRA_BASE_URL` unset | adapter disabled; verbs run `plan.json`-only; no mirror. |
| Configured but unreachable | local verb still succeeds; op queued; drain later with `reconcile`. |
| Configured and healthy | mirror applied inline (real-time). |

The gate `scripts/validators/validate-jira-hygiene.sh` (active only when
`TRACKER_BACKEND=jira`) flags unmirrored work (pending outbox ops) and modules
that advanced without a Jira sync. Live drift (epic open with all children done,
in-progress issue with no assignee, plan-done-but-Jira-not) is reported by
`jira.sh doctor`.

## Jira Cloud

Set `JIRA_FLAVOR=cloud` (same interface, different backend): `/rest/api/3`,
`email + API-token` Basic auth (`JIRA_EMAIL` + `JIRA_TOKEN`), ADF comment bodies,
`accountId` assignment, and the native `parent` field for epic membership. In a
Cloud project the **actor** is a Jira `accountId` (that's how Cloud identifies
users), so pass accountIds as actors to `claim`/`accept`/`release`.

```bash
export JIRA_BASE_URL=https://your-site.atlassian.net
export JIRA_FLAVOR=cloud
export JIRA_EMAIL=you@company.com
export JIRA_TOKEN=<api-token>          # https://id.atlassian.com/manage/api-tokens
export JIRA_PROJECT=PROJ
```
