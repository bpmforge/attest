---
name: autopilot
description: 'Orchestrator entry point for unattended run-to-completion — ASSESS what is left (board, gates, requirement ledger, unmerged branches, red suites, with the SRS/stories as the denominator), DECIDE an ordered path forward where every next action carries an exit predicate, DRIVE the existing loops (conductor / run-until-done / run-plan) one bounded unit at a time, HEAL stuck units up a fixed ladder (narrow -> split -> escalate tier -> park with evidence), and EXIT only on the GOAL predicate or a documented halt. NOT /goal (one objective, one metric); NOT /sdlc (interactive lifecycle); NOT /reflow (ticket-graph bookkeeping); NOT /wave (one integration gate) — this is the outer product loop that decides what to run next and keeps running it.'
---

# Autopilot

Run the PRODUCT to completion unattended: the GOAL + ORCHESTRATOR roles of
`agents/shared/PRODUCT_SHAPE_PROTOCOL.md`, wired to the machinery this repo
already has. Autopilot builds nothing new — it assesses, sequences, and
drives the existing loops, and it heals or parks what gets stuck. **Done is
a predicate, never a feeling** — and **a drained board proves nothing**: the
denominator for "what's left" is the SRS / user stories, not the ticket list.

**Usage:**
- `/autopilot` — ASSESS + DECIDE only: write the state-of-the-product report and the ordered next-actions list, run nothing
- `/autopilot --run` — full loop: ASSESS → DECIDE → DRIVE → HEAL until the EXIT predicate or the iteration cap
- `/autopilot --run --budget <N>` — override the iteration cap (defaults below; existing caps only, never invented numbers)

Set `autonomy=auto` per `agents/shared/AUTONOMY_PROTOCOL.md` before `--run`
(the FULL NEVER-AUTO table below still pauses — all seven rows, NA-1..NA-7,
not just interviews and destructive ops). **NA-3 stance, stated because DRIVE
runs the conductor whose loop ends in `merge --no-ff` + dual push:** driving
the conductor unattended is only legal under a STANDING founder approval that
names merges-to-main as pre-approved for the board being driven (the
conductor's own APPROVALS.md pattern); absent that document, autopilot must
run the loop with merge disabled / park-at-review and surface the landings
for a human.

## ASSESS — mechanical inventory, no narrative

Collect each of these from its existing source; every line of the report
cites the command output behind it. A source that does not exist in the
target repo is recorded as ABSENT, never guessed at:

1. **Board state** — `docs/work/plan.json` tickets by status
   (ready / claimed / in_progress / in_review / blocked / parked / done),
   via `scripts/validators/validate-tickets.sh` +
   `scripts/lib/tickets.mjs`. Parked and blocked are listed by name — a
   park is not a landing.
2. **Phase gates** — `scripts/validators/validate-phase-gate.sh <phase>`
   (read-only check) for the current phase per `docs/work/STATE.md`;
   receipts at `docs/work/gates/`.
3. **Requirement closure — the real denominator** —
   `scripts/validators/validate-requirement-closure.sh`: every SRS story
   closed only by a done module that cites it, plus the reconciliation
   matrix (`docs/work/REQUIREMENT_RECONCILIATION.md`). Report
   closed/total STORIES, not done/total tickets.
4. **Product map / seams** — `docs/work/PRODUCT_MAP.md` and seam records:
   assembly tickets outstanding, gaps in BOTH directions.
5. **Unmerged branches** — `git branch --no-merged main` + parked branches
   recorded on the board; each mapped to its ticket/feature or flagged
   orphan.
6. **Red suites** — run the project's verify command (build/test/lint) and
   record exact counts.

Output: the **State of the Product** section of
`docs/work/AUTOPILOT_<date>.md` — stories closed/total, gate status per
phase, board tallies, parked/blocked list with reasons, red-suite counts.

## DECIDE — the path forward, ordered, each step with an exit predicate

From the assessment, emit an ordered next-actions list. Every entry names
the unit (ticket id / wave / gate / branch), the loop that will drive it,
and its **exit predicate** — the command + passing condition that proves it
done. An entry without a checkable predicate is refused, same rule as
`/goal`'s intake gate (`agents/shared/RALPH_WIGGUM_LOOP.md` refuse-to-loop).
Default ordering: red suites first, then the open phase gate, then claimable
board work (conductor order), then assembly/seam tickets, then unmerged
feature landings — sequence is autopilot's to decide; doneness never is
(it belongs to the predicates and the EXIT gate).

## DRIVE — existing loops only, one bounded unit at a time

- **Ticket board** (`docs/work/plan.json`): `scripts/conductor/conductor.mjs`
  under `scripts/conductor/supervise.sh` — claim → isolated worktree →
  outside gates (`scripts/validators/run-handoff-gates.sh`) → distinct
  reviewer → merge. `STOP` file semantics and `--max-attempts` apply as
  documented in `scripts/conductor/README.md`.
- **SDLC phase work**: `scripts/run-until-done.sh` (resume from STATE.md,
  watchdog + stall detection, `<promise>COMPLETE</promise>` verified by
  validators, never trusted).
- **Decomposed DAG plans**: `scripts/run-plan.mjs` (journaled, per-node
  retries, checkpoint-continue).

Never drive two loops over the same write-scope concurrently. Never edit
plan.json by hand mid-run — state changes go through the loops' own verbs.

## HEAL — the ladder, in order; never silently loop

A unit is STUCK when its loop reports it (conductor release-to-ready after
`--max-attempts`, run-plan escalated node, run-until-done stall exit, a
STALLED classification per `agents/shared/FIX_VERIFY_LOOP.md`). Apply the
ladder one rung at a time, recording each rung in the run report:

1. **Retry with narrowed scope** — re-run the unit once with a tighter
   write-scope / smaller acceptance slice targeting the recorded gap.
2. **Split** — a ceiling hit while still PROGRESSED is a decomposition
   signal (`FIX_VERIFY_LOOP.md`): split the unit into smaller tickets/nodes
   via the board's own tooling, then re-enter DRIVE.
3. **Escalate model tier** — re-run on a stronger tier per
   `agents/shared/MODEL_ADAPTER.md` / `models.json` roles (STALLED escalates
   after 2 same-tier attempts, never 3; OSCILLATING escalates on the first
   regression).
4. **Park with evidence for a human** — durable `parked` status at the root
   board, committed, with the gap history and receipts attached
   (`PRODUCT_SHAPE_PROTOCOL.md`: parks are durable, NOT claimable on
   restart, and a park is not a landing).

**No-progress HALT (the /goal rule):** a gap set byte-identical across two
consecutive passes means iterating again is futile — HALT immediately
(exit-3 semantics, `RALPH_WIGGUM_LOOP.md`; run-until-done's
stall-2-then-escalate is the same rule at session level) and suspect the
validator before the work. Never re-enter DRIVE on an unchanged gap set.

## EXIT — the GOAL predicate, or a halt with evidence

**Iteration cap is mandatory:** count one iteration per full
ASSESS→DRIVE→HEAL cycle; cap at the tier-aware ceilings that already exist
(6 metered / 12 local, `FIX_VERIFY_LOOP.md` / `.model-context`) unless
`--budget` says otherwise. At every iteration boundary, evaluate the
assembly-gate-style predicate — ALL of:

- requirement closure clean (every story proven — validator green, no
  OUTSTANDING reconciliation rows);
- every seam's assembly ticket done (wiring evidence recorded);
- phase gates green with receipts; ticket hygiene clean; verify green on
  main; no unmerged feature branches unaccounted for.

Predicate true → STOP: final report with the evidence per clause.
Cap reached or HALT triggered → STOP: `docs/work/AUTOPILOT_HALT.md` with the
remaining gap list, the parked units and their evidence, and the ladder rung
each stuck unit reached. Silently continuing past the cap, or declaring done
on a drained board, is the failure mode this skill exists to prevent.

## Boundaries

- **Not `/goal`** — that loops ONE objective toward ONE measurable exit;
  autopilot decides WHICH units to run and drives many, and may dispatch
  `/goal` for a single named gap.
- **Not `/wave` / `/gauntlet`** — those are gates/loops autopilot may invoke,
  never re-implement.
- **Not `/sdlc`** — planning stays interactive; autopilot refuses to start
  when there is no SRS/story denominator to assess against (route to
  `/sdlc` first — an autopilot with no denominator is a feeling, not a loop).
- Autopilot never writes code itself; BOTS do, through the loops.

## Known seam gap (named follow-up, do not build inline)

The conductor has no read-only `--assess` summary mode; ASSESS composes the
inventory from the validators and board files directly. If that composition
proves error-prone in the field, file a ticket for a `conductor.mjs
--assess` (board tallies + claimability + halt-file echo) rather than
teaching this skill to parse conductor internals.

## Outputs

- `docs/work/AUTOPILOT_<date>.md` — State of the Product (story-denominated),
  ordered next-actions with exit predicates, one row per iteration (unit,
  loop, result, heal rung if any), final state: EXIT MET (evidence per
  clause) / HALTED (gap list + parked evidence).
- `docs/work/AUTOPILOT_HALT.md` — on halt only: the stuck evidence a human
  needs to resume.
