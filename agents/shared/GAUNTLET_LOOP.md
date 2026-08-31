---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Gauntlet Loop Protocol

The multi-agent quality harness behind `/gauntlet` (technique: Matt Shumer, 2026). One sentence:
**the agent that builds never grades its own work, and a critic that watched a previous draft
never grades the retry.** A lead splits the goal into gradeable units, builders produce real
artifacts in clean context, blind fresh-context critics compare each artifact against a *real*
reference bar, and failures loop until the work passes, stalls, or the budget runs out.

This is a quality-maximization loop, not a verification gate. Boundaries:

| Loop | Question it answers |
|---|---|
| Challenger (`CHALLENGER_PROTOCOL.md`) | "Are the claims in this artifact actually true?" |
| Fix-Verify (`FIX_VERIFY_LOOP.md`) | "Are the known defects actually closed?" |
| Wiggum coverage (`run-coverage-loop.sh`) | "Is every unit of the denominator covered?" |
| **Gauntlet (this doc)** | "Is this work as good as something real that we named in advance?" |

## The three roles — separate contexts, always

- **LEAD** — sets the bar and the budget, splits the goal into the smallest *independently
  gradeable* units, dispatches builders and critics, routes failures back, merges, reports.
  The LEAD never builds: an agent that built something is a biased judge of it.
- **BUILDER** (one per unit, parallel where units are independent) — produces a real artifact in
  clean context. May be any implementing specialist (coding-agent, frontend-design,
  gameplay-engineer, a writing agent). Builders are allowed to be imperfect and **never declare
  PASS** — a builder's "done" means "ready for the critic," nothing more.
- **CRITIC** (blind, fresh per round) — receives ONLY: the artifact, the bar, and the reference
  exemplar. Never the builder's reasoning, never a prior round's critique, never the round number.
  Inspects the *real* artifact — running code, rendered pixels, actual test output — grades each
  bar criterion with evidence, returns PASS/FAIL per criterion plus specific, actionable gaps.

**Blindness rules (the whole point — do not soften them):**
1. Builder and critic are different agent contexts. In `autonomy=auto`, spawn each as its own
   task/subprocess; in interactive mode, separate HANDOFF docs per `EXECUTOR_SELECTION.md`.
2. A critic context is used for exactly ONE unit in ONE round, then discarded. The retry gets a
   brand-new critic. Prior critiques go to the *builder* as fix input — never to the next critic.
3. The critic's HANDOFF contains no builder chain-of-thought, no "this is round 3," no "the last
   critic said." Leakage biases the grade in both directions.
4. Maker/Verifier identities in the Completion Manifest must differ per the existing
   verifier-isolation rule — the gauntlet is that rule, systematized.

## The bar — must be something real

"Make it amazing" is not a bar. The artifact must **match or beat a named exemplar**:

- a reference implementation or library
- a test/eval suite with a numeric threshold
- a screenshot of a top product's equivalent screen (drop it in `docs/gauntlet/reference/`)
- a model essay / doc the writing must stand next to
- a measured baseline (latency, bundle size, WCAG pass count)

The bar is written down BEFORE the first build round, as concrete per-criterion checks the critic
can grade with evidence. An aspirational, possibly-unreachable bar is legitimate — it keeps the
loop pulling upward instead of settling at "good enough." What is not legitimate is a bar the
critic can't compare against side by side.

## The loop

1. **Bar + budget (LEAD).** Write `docs/gauntlet/BAR_<slug>.md`: the exemplar, per-criterion
   checks, and the budget (max rounds — default 5 — plus any time/token bound). Get the user's
   nod on the bar in interactive mode; the bar is the contract for everything after.
2. **Split (LEAD).** Decompose into the smallest units a critic can grade independently.
   Independent units run their build/critique rounds in parallel; a unit that depends on
   another's artifact waits for it.
3. **Build (BUILDER × N).** Real artifacts, clean context, one unit each.
4. **Critique (CRITIC, blind, fresh).** Side-by-side against the exemplar. Output per unit:
   `PASS` or `FAIL` per criterion, evidence for each verdict (measurement, screenshot path, test
   output), and specific gaps. No vibes — an unevidenced verdict is discarded and re-run.
5. **Fix and repeat.** FAILed units go back to a builder (same builder identity is fine — the
   *critic* is what must stay fresh) with the critique attached. Run longer than feels
   necessary: most gauntlets are stopped several rounds too early.
6. **Smooth (optional, once).** After all units pass, ONE fresh agent harmonizes seams
   (naming, tone, spacing, shared imports) WITHOUT redesigning anything. Its diff is re-graded
   by one final critic pass if it touched more than trivia.
7. **Report (LEAD).** `docs/gauntlet/GAUNTLET_<slug>.md`: the bar, the round log (per unit per
   round: verdict + evidence path), final PASS evidence, and — mandatory — what is still below
   the bar. Below-bar residuals are recorded, never silently dropped.

## Exit rules

Stop when ANY of these holds, and record which one fired:

- every unit clears every bar criterion; or
- **two consecutive rounds produce no improvement** on the failing criteria (stalled — escalate
  to the user with the gap, per the existing asymmetric-confidence discipline); or
- the budget (rounds / time / tokens) is exhausted.

If the work is still visibly improving and budget remains, keep going — do not stop early
because the loop "feels" done.

## Interplay with LOOP_PREVENTION.md

`LOOP_PREVENTION.md` caps tool calls *within one agent context*; it still governs every LEAD,
BUILDER, and CRITIC individually. The gauntlet's rounds are a *cross-context* budget owned by
the LEAD and written into the bar file — the two do not conflict. The failure-loop rule still
applies at the harness level: a unit whose builder errors identically 3 times is BLOCKED with
evidence, not retried a fourth.

## Composition with existing experts

- **Visual bar** → builders are `frontend-design`; the critic's evidence is screenshots per
  `references/visual-design-loop.md`'s capture discipline (viewport matrix, stabilized shots).
  `design-iterator` remains the *token-conformance* loop; a gauntlet is for "beat this
  reference product," not "match our own tokens."
- **Code bar** → builders are `coding-agent`; the bar is a test/eval suite plus a reference
  implementation; critics run the suite, never trust the builder's claim that it ran.
- **Game bar** → `playtest-evaluator`'s fun heuristics as criteria; builders are
  `gameplay-engineer`/`level-designer`.
- **Findings vs quality**: if what you need is "are these claims true," use the challenger — a
  gauntlet critic grades quality against a bar; it does not fact-check prose.

## Consensus & agreement map (P-A7 — multi-model critics)

Additive option, not a replacement: a gauntlet round may dispatch the SAME
unit to 2+ critic contexts on different models, each fully blind per the
rules above. The LEAD merges their grades using the **Consensus & agreement
map** defined in `CHALLENGER_PROTOCOL.md` (canonical — read it there):

- 2+-model agreement on a criterion verdict or a gap = highest signal; those
  gaps lead the fix input for the next build round (**Act On**).
- A lone-model gap is **Consider** — kept in the critique, marked as
  single-source; a lone-model HIGH/CRITICAL on a security surface is never
  auto-dismissed.
- **Dismissed** requires a written reason citing evidence, recorded in the
  round log. Conflicting PASS/FAIL between models = no consensus → the unit
  does NOT pass that criterion this round.

Single-critic rounds (one model) remain the default and fully valid — this
map only governs how to weigh multiple blind critics when you have them.
