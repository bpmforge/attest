---
name: goal
description: 'Bounded objective loop — "keep going until metric X or budget Y" as a primitive, not prose. REQUIRES a measurable exit condition (a script, test, validator, or numeric threshold) and an iteration/budget cap declared up front; REFUSES unmeasurable objectives ("make it better") per the Ralph Wiggum refuse-to-loop gate. NOT /gauntlet (quality vs a named exemplar with builder/critic roles); NOT /sdlc (full lifecycle); NOT /reflow (ticket-graph bookkeeping) — this loops one objective toward one measurable exit.'
---

# Goal

Run a **bounded objective loop**: iterate toward a single objective until a
measurable exit condition is met or a declared budget is exhausted — never
"until it feels done."

**Usage:**
- `/goal "<objective>" --exit "<check>" --budget <N>` — loop on the objective; `<check>` is the measurable exit (a command/test/validator plus its passing condition, or a metric with a numeric threshold), `<N>` the iteration cap
- `/goal "<objective>" --exit "<check>"` — budget defaults to the Ralph Wiggum hard cap (3 iterations — `agents/shared/RALPH_WIGGUM_LOOP.md`); no other default exists
- `/goal "<objective>"` — no measurable exit given: the skill asks for one, and REFUSES to loop if none can be stated

## Intake gate — refuse before you loop

Before iteration 1, both of these MUST be written down (in the goal file, see
Outputs). Missing either one is a refusal, not a warning:

1. **Measurable exit condition.** A check the loop can run and grade
   mechanically: a test suite + threshold, a validator exit code, a script
   emitting a number compared against a target, a benchmark bound. This is
   the Ralph Wiggum **refuse-to-loop gate** applied at the objective level
   (`agents/shared/RALPH_WIGGUM_LOOP.md`): a subjective "done" ("improve the
   UX", "make the copy punchier") with no script and no measurable target
   gets `BLOCKED: no checkable success` and is routed to a human — **looping
   cannot converge on a goal it cannot evaluate.**
2. **Iteration/budget cap.** Declared up front, using the EXISTING caps —
   never freshly invented numbers: the default hard cap is Ralph Wiggum's
   **3 iterations**; any extension follows `agents/shared/FIX_VERIFY_LOOP.md`
   semantics exactly (see below).

## Loop semantics (existing caps only)

Each iteration: run the exit check → if it passes, STOP with evidence → else
make one bounded change targeting the gap → re-run the check → classify the
iteration per `agents/shared/FIX_VERIFY_LOOP.md`:

- **STALLED** — the targeted gap is unchanged after an iteration that
  explicitly targeted it: 2 targeted attempts at the same specialist/tier,
  never 3 — escalate on the 2nd (different specialist / stronger tier),
  don't wait for the loop cap.
- **PROGRESSED** — prior gaps closed, new smaller ones opened: the loop may
  extend past 3 only while every iteration closes its prior gaps AND the new
  gap count strictly decreases, up to FIX_VERIFY_LOOP.md's tier-aware
  ceiling (6 metered / 12 local). Hitting a ceiling while still PROGRESSED
  is a decomposition signal — split the objective, don't raise the cap.
- **OSCILLATING** — a previously-closed gap regresses: zero tolerance; first
  regression escalate immediately, second stop.

At the hard cap with the exit unmet, behave as Ralph Wiggum's cap demands:
escalate with the remaining gap list and evidence — never silently loop on,
never quietly declare success. Metric readings are taken from the check's
real output every iteration; a claimed number without the command output
recorded beside it does not count.

## Boundaries

- `/gauntlet` (`agents/shared/GAUNTLET_LOOP.md`) maximizes quality against a
  named exemplar with separate builder/critic contexts; `/goal` drives one
  context toward one measurable exit. If the "exit" is really "as good as
  product X", that's a bar — use `/gauntlet`.
- Per-agent tool-call limits (`LOOP_PREVENTION.md`) still govern every
  iteration; this skill's budget is the cross-iteration bound on top.

## Outputs

- `docs/work/GOAL_<slug>.md` — the objective, the verbatim exit check + its
  passing condition, the declared budget, then one row per iteration:
  metric reading (with the command output cited), classification
  (STALLED / PROGRESSED / OSCILLATING), change made, and the final state:
  EXIT MET (evidence) / ESCALATED at cap (gap list) / REFUSED
  (`BLOCKED: no checkable success`).
