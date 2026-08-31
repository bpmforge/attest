---
name: wave
description: 'Wave integration gate (Level 2) — after a wave of tickets lands, composes a reviewer set from the aggregate diff, runs the reviewers CONCURRENTLY in isolated contexts, ingests their finding SETS (summaries, never transcripts), and synthesizes one consensus-weighted wave-gate report with each finding attributed to the ticket that introduced it. NOT /gauntlet (rebuilds until work beats a named bar); NOT /challenge (verifies factual claims in one artifact); NOT /review (one-pass verdict on one change) — this gates a whole wave''s integrated result.'
---

# Wave

Compose, run, and synthesize a **Level-2 wave integration gate**: the per-ticket
gates (Level 1) already passed one at a time — this gate reviews what the wave
adds up to, because integration defects live between tickets, not inside them.

**Usage:**
- `/wave` — gate the most recently completed wave: aggregate diff → reviewer set → concurrent review → synthesized wave-gate report
- `/wave --base <ref>` — explicit wave baseline (default: the merge-base of the wave's first ticket branch, or the last `WAVE [N] COMPLETE` marker in `docs/PARALLELIZATION_MAP.md`)
- `/wave --reviewers <a,b,c>` — override the composed reviewer set (additive overrides only — you may add reviewers, never silently drop a recruited one)

## Workflow

1. **Aggregate the diff.** Compute the whole wave's diff against the wave
   baseline (`git diff <base>...HEAD`), and build a file→ticket map from the
   wave's commits/tickets so every later finding can be attributed to the
   ticket that introduced the lines it cites.
2. **Compose the reviewer set from the aggregate diff.** Recruit per what the
   wave as a whole touched — security surfaces (auth/input/secrets/deps) →
   `security-auditor`; schema/query files → `db-architect`; UI → `ux-engineer`
   + accessibility; hot paths/queries → `performance-engineer`;
   `code-reviewer` always. Recruit off the AGGREGATE, not per ticket: two
   tickets that are individually benign can compose into a reviewable surface.
3. **Run reviewers CONCURRENTLY, each in its own session/context.** One
   reviewer per context, dispatched in parallel — no reviewer sees another
   reviewer's output, reasoning, or verdict while reviewing (the same
   maker≠verifier + blindness discipline as `agents/shared/GAUNTLET_LOOP.md`;
   in `autonomy=auto` spawn tasks/subprocesses, in interactive mode separate
   HANDOFFs per `EXECUTOR_SELECTION.md`).
4. **Collect finding SETS — summaries, never transcripts.** Each reviewer
   returns a structured finding list (severity, file:line, one-paragraph
   evidence, suggested fix). The orchestrator ingests ONLY these sets; a
   reviewer transcript or chain-of-thought is never pulled into the
   synthesizing context (§15.1 lesson — transcripts blow the context budget
   and bias the synthesis toward the most verbose reviewer).
5. **Synthesize ONE wave-gate report with consensus weighting.** Merge the
   finding sets: findings that 2+ independent reviewers raised on the same
   code are highest-signal and lead the report; lone-reviewer findings are
   kept and tiered per the **Consensus & agreement map** in
   `agents/shared/CHALLENGER_PROTOCOL.md` (Act On / Consider / Noted /
   Dismissed — a Dismissed entry always carries a written reason). Attribute
   every finding to its introducing ticket via the step-1 map.
6. **Gate.** HIGH/CRITICAL findings in the Act On tier trigger the Challenger
   Gate per `agents/shared/CHALLENGER_PROTOCOL.md` before the backlog is
   finalized (claims get verified before tickets get filed), then route fixes
   back to the owning tickets via `FIX_VERIFY_LOOP.md`. The wave does not
   advance to Wave N+1 until the report's Act On list is empty or explicitly
   accepted by the user (`agents/sdlc/PARALLEL_WAVE_PROTOCOL.md` Wave Gate).

## Boundaries

- **Not a gauntlet:** `GAUNTLET_LOOP.md` maximizes quality against a named
  real bar with builder/critic loops; a wave gate is a verification pass over
  work already built. Do not loop builders from here.
- **Not a challenge:** `CHALLENGER_PROTOCOL.md` verifies factual claims in an
  artifact; here it is invoked ON this gate's HIGH/CRITICAL findings, not as
  the review itself.
- Reviewers never fix; findings route back to the introducing ticket's owner.

## Outputs

- `docs/reviews/WAVE_GATE_<N>_<date>.md` — reviewer set + why each was
  recruited (from which aggregate-diff surfaces), per-reviewer finding-set
  summary counts, the consensus-weighted merged findings table
  (tier · severity · file:line · introducing ticket · agreeing reviewers),
  Dismissed entries with written reasons, and the gate verdict
  (ADVANCE / HOLD with the blocking findings).
