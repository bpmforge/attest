# Unattended Execution — running Phase 4 tickets without a human

Phases 0–3 plan. **Phase 4 codes.** This guide covers running the coding phase
unattended: the conductor claims a ticket, runs a coding session in an isolated
worktree, puts the result through review and runtime gates, merges it, and moves
to the next one — repeating until the board is done or nothing is claimable.

> **Phases 0–3 are not automatable, by design.** Every SDLC mode opens with a
> Discovery Interview marked **NEVER-AUTO** (`agents/sdlc-lead.md`): *"this is
> user input — no default exists; pauses even in `autonomy: auto`"*. A model
> that runs straight through it is violating the protocol, not demonstrating
> autonomy. Plan interactively; automate the coding.

---

## What you need

1. **A module board** — `docs/work/plan.json` with a `modules[]` layer
   (`docs/TICKET_SCHEMA.md`). Normally produced by an earlier interactive
   planning session.
2. **A formatter-clean git repo** on `main`, working tree clean.
3. **Two distinct models** — the coder and the reviewer must differ, and both
   must resolve on your install (`opencode models`).

---

## The five-minute version

```bash
# 1. Preflight the board — free, and catches the failures that otherwise cost
#    one full coding session each
TEST_SIBLING_STRICT=1 node ~/.config/opencode/scripts/lib/tickets.mjs \
  validate docs/work/plan.json

# 2. Preflight the run — every startup gate fires, no model is called
node ~/.config/opencode/scripts/conductor/conductor.mjs --root . --dry-run

# 3. A small batch first. Never start with the whole board.
node ~/.config/opencode/scripts/conductor/conductor.mjs \
  --root . --max-tickets 3 --max-attempts 2
```

Then read the landing rate before scaling. 3/3 → remove `--max-tickets`.
Anything less → read `docs/work/attempt-evidence/` before spending more.

---

## Model routing

Roles come from `models.json` in the target project (or `--model` for a flat
override):

```json
{
  "roles": {
    "coder":    "openai/gpt-5.6-luna",
    "reviewer": "openai/gpt-5.4-mini"
  }
}
```

The coder writes; the reviewer judges. **They must be different models** — that
is what makes "maker ≠ verifier" a fact rather than a declaration, and the run
refuses otherwise (see G4 below). Reviewers are the cheaper half of the bill;
the coder is where capability matters, because a ticket that fails burns its
whole attempt budget before you learn anything.

---

## Startup gates — these run before any model is called

Each one converts a failure that would cost *N coding sessions* into a
sub-second refusal. On a 50-ticket board that is the difference between a
wasted afternoon and a corrected board.

| Gate | Refuses when | Exit |
|---|---|---|
| **G4** | coder and reviewer resolve to the same model | 1 |
| **G4b** | a configured model this install cannot resolve | 2 |
| **G5** | the board is covered by `.gitignore` — every transition commits it | 2 |
| **G6** | a ticket's manifest is outside `docs/work/` or `docs/reviews/` | 2 |
| resume | `plan.json` disagrees with its own receipts or git reality | 3 |

`--role-gate warn` downgrades G4; `--model-gate warn|off` downgrades G4b. Do not
downgrade them for an unattended run — G4b exists because
`opencode run --model <unknown>` does **not** error, it silently falls back to
the agent's own model, so both roles quietly become one and the review is
theatre.

---

## The three rounds, per ticket

```
Round 1  code       coder model, isolated worktree, no git or plan.json access
         ↓          scope gate + Completion Manifest gate
Round 2  review     reviewer model — code-reviewer, plus whoever the diff triggers
         ↓          blocking verdict → bounded fix loop (--fix-iterations, default 3)
Round 3  runtime    build / lint / test actually executed; verdict must be evidenced
         ↓
         close()    runs the ticket's own `verify` from OUTSIDE the session
         merge --no-ff → next ticket
```

**Reviewers are triggered by the diff**, per `PARALLEL_WAVE_PROTOCOL`:

| Reviewer | Fires when the diff touches |
|---|---|
| `code-reviewer` | always |
| `security` | auth, input handling, secrets, shell-exec |
| `perf` | DB queries or loops |
| `ux` | UI components |

A ticket may also request reviewers explicitly with `"reviews": ["security",
"perf", "test"]`. That is a **union** with the triggers, not a replacement — use
it to force a discipline that the patterns would not otherwise summon.

Each reviewer writes its own document (`docs/reviews/SECURITY_<id>.md`, …) and
they are committed alongside the code, so every landed ticket carries its own
audit trail.

---

## Stopping, resuming, and failure

- **Stop cleanly:** `touch STOP` in the project root. Checked between tickets
  and before each session.
- **Resume:** just re-run. Work already committed by a killed run is
  **re-verified**, never re-run. If `plan.json` disagrees with its receipts or
  with git, the whole run refuses (exit 3) rather than guessing.
- **A failed ticket goes back to `ready`**, never forward. Nothing half-verified
  reaches `done`.
- **Evidence survives.** A failed attempt's review documents, runtime verdict
  and full diff are copied to
  `docs/work/attempt-evidence/<id>-attempt<n>/` before the worktree is
  destroyed. Read that before re-running anything.

Useful flags: `--max-tickets N`, `--max-attempts N` (default 2),
`--fix-iterations N` (default 3), `--no-merge` (land on branches, review before
main), `--no-push`, `--rounds 1` (skip review/runtime — not for real work).

> **`--no-merge` has a dependency trap.** Worktrees branch from `main`, so a
> ticket depending on an unmerged one builds against a `main` that lacks it.
> Safe for a batch of independent tickets; wrong for a dependency-chained run.

---

## Jira

If your tickets are mirrored to Jira, set `TRACKER_BACKEND=jira` and the
conductor converges Jira on every pick-up and every accept. `plan.json` remains
the source of truth; Jira is a mirrored ledger, and a Jira outage never blocks
local work — operations queue and `jira.sh reconcile` replays them.

```bash
scripts/jira/jira.sh doctor          # connectivity, status map, drift, pending ops
scripts/jira/jira.sh sync-plan       # push board → Jira (epics, stories, blocking links)
TRACKER_BACKEND=jira node ~/.config/opencode/scripts/conductor/conductor.mjs --root .
```

To rebuild a board **from** Jira — a drifted or lost `plan.json` —
`scripts/jira/import-plan.mjs` reconstructs it: interface, write-scope and
acceptance round-trip out of the issue description, `depends_on` from real
"is blocked by" links, status from the configured map. It writes a *candidate*
plus a drift report and refuses `--apply` when the candidate is invalid or when
any field came from a model. `write_scope` is a safety fence; one a model
invented needs a human before it governs anything.

---

## Board hygiene that costs you sessions if wrong

The preflight catches all of these. They are listed because each one cost a real
coding session before it was gated.

| Mistake | Symptom |
|---|---|
| `write_scope` without the test sibling | agent must write tests it is forbidden to write; scope gate refuses |
| `manifest` as an object, or pointing at a source file | `close()` crashes, or the session overwrites its own deliverable with markdown |
| `manifest` outside `docs/work/` or `docs/reviews/` | written as instructed, then flagged out-of-scope |
| board under a gitignored path | `git add` hard-fails on the first transition, mid-run |
| repo not formatter-clean at `main` | the post-edit hook reformats a file, it lands outside scope, gate refuses |

---

## Troubleshooting

**"no plan.json"** — the conductor probes `docs/work/plan.json`,
`docs/work/plan/plan.json`, then `plan.json`, accepting only a candidate with a
`modules[]` layer. Name one explicitly with `--plan`.

**A ticket exhausted and you want to know why** — read
`docs/work/attempt-evidence/<id>-attempt<n>/`. The runtime report has a
`## Why it failed` section; `attempt.diff` has everything the session wrote.

**Everything fails instantly with a provider error** — that is quota or auth,
not the agents. The log says `session failed before finishing (exit 1) — no work
was attempted`, which is deliberately distinct from "produced no changes".

**A ticket fails on a command your project does not define** — a missing
`build`/`lint` script is *skipped*, not a failure. If a runtime report still
fails on one, the harness re-runs the ticket's own `verify` and downgrades an
unsupported FAIL (`round3.runtime.unsubstantiated`).

---

## Verifying the machinery itself

`scripts/e2e-sdlc-path.mjs` runs the whole path against a throwaway project and
grades what actually landed — including *which* reviewers ran and whether every
ticket landed, so a partial result cannot read as success.

```bash
node scripts/e2e-sdlc-path.mjs --stage-only   # build the fixture, no model calls
node scripts/e2e-sdlc-path.mjs --dry-run      # + wire-check the runners
node scripts/e2e-sdlc-path.mjs               # Phase 4 on a seeded 3-ticket board
```

Run it against a **second model family** before trusting a long run. Two
model-portability defects were found that way in one afternoon — a contradictory
`/sdlc resume` preamble and a runtime verdict that failed on missing npm
scripts — both invisible on the model they were developed against.
