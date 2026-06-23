---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# MICRO_LOOP.md — micro-agents running micro-loops

**The architecture in one line:** the system is **micro-agents arranged in macro-loops, and every micro-agent runs its own bounded micro-loop.** Two nested levels, the same five guarantees at each.

```
MACRO LOOP  (orchestrator, RALPH_WIGGUM_LOOP / FIX_VERIFY_LOOP)
  ├─ micro-agent A ── MICRO LOOP ── produce → self-verify → revise (≤cap) → return
  ├─ micro-agent B ── MICRO LOOP ── produce → self-verify → revise (≤cap) → return
  └─ micro-agent C ── MICRO LOOP ── produce → self-verify → revise (≤cap) → return
        (run in parallel; orchestrator scores returns, re-dispatches gaps)
```

The macro loop owns **coverage** (is every inventory row covered?). The micro-loop owns **correctness of one artifact** (is this one thing actually right before I return it?). Without micro-loops the orchestrator carries all the iteration; with them, each agent returns work that already passed its own checkable gate — the macro loop converges far faster.

---

## The micro-loop contract (every specialist HANDOFF)

A specialist does NOT return its first draft. It runs this internal loop before printing its completion phrase:

```
1. CRITERION  — restate the ONE checkable success criterion for this artifact.
                If none exists, STOP — refuse to loop (see § Refuse-to-loop).
                For CODE, the criterion also includes: every file ≤ size cap,
                every external API verified, anti-slop clean (validate-code-health
                exit 0).
1b. PLAN-SHAPE — (code only) if the unit would exceed the file-size cap, design the
                book-style split UP FRONT — an index/barrel + chapter modules, one
                concern each — BEFORE producing. Never write a monolith you intend to
                refactor later (small models botch the extraction). See
                CODE_BOOK_PROTOCOL.md.
2. PRODUCE    — make the artifact (maker step).
3. SELF-VERIFY— run the criterion:
                 - deterministic first: a validator script / test / grep / build
                 - only if no script exists: judge it — but on verifier_model,
                   in a cleared sub-context, never grading your own reasoning in place
4. REVISE     — if the criterion fails, fix the cited gap and go to step 3.
4b. TRACK     — (G-D) before EXIT, record this unit in the tracker / PROGRESS /
                inventory / DELEGATION_LOG row. A step is NOT done until its work
                is written down — this is what stops things getting lost between
                steps and sessions. Gate: `validate-tracker-fresh.sh` must pass
                (work files changed ⇒ a tracker changed) and the Completion
                Manifest carries a `Tracker updated: <file>` line.
5. EXIT       — criterion passes  → return with Completion Manifest + phrase
                cap reached / stalled → return [PARTIAL] + escalation note + loop-learn
```

**Bounds (non-negotiable — these are why a micro-loop is safe to run unattended):**

| Guard | Rule | Reuses |
|-------|------|--------|
| **Cap** | ≤ 2 revise iterations inside a micro-loop (3 is a macro-loop budget; a micro-loop that needs 3 should return PARTIAL and let the orchestrator re-scope). | RALPH cap |
| **Checkable exit** | The criterion must be objectively decidable. No binary pass/fail ⇒ do not loop. | G7 refuse-to-loop |
| **Independent verify** | Deterministic check preferred; model self-verify runs on `verifier_model`, not the maker session. | G1 maker/verifier |
| **No-progress kill** | If the same gap survives a revision (gap unchanged), stop — don't burn the second iteration. | G2 gap-checksum |
| **Learn on exit-without-success** | On PARTIAL/stall, run `scripts/loop-learn.mjs` so the same miss isn't repeated. | G3 loop-learn |

---

## Refuse-to-loop (the most important rule)

A micro-loop with no checkable criterion is not a loop — it's an unbounded spend (Osmani's "loopmaxxing"). Before step 2, the agent must name its criterion from this menu:

- a `validate-*.sh` / `fix-verify.mjs` result,
- a test that references the artifact,
- a build / lint / smoke that must pass,
- a `grep` whose presence/absence is the proof (e.g. "no `query.*\+.*req` remains").

If the task's "done" is genuinely subjective (taste, wording, "make it nicer") with no measurable target → **return immediately, flag `BLOCKED: no checkable success`, route to a human.** Looping cannot converge on a goal it cannot evaluate.

---

## Which loop is which (don't nest the wrong thing)

| Level | Loop | Owner | Cap | Question it answers |
|-------|------|-------|-----|---------------------|
| Macro | RALPH_WIGGUM_LOOP | orchestrator | 3 (2 for feature/improve) | Is every inventory row covered? |
| Macro | FIX_VERIFY_LOOP | orchestrator | 3 | Are all CRITICAL/HIGH findings closed? |
| **Micro** | **this contract** | **the specialist itself** | **2** | Is this one artifact correct before I return it? |

A micro-loop never spawns sub-agents (one level of orchestration only — opencode #9280). A micro-loop never re-scans for new work — it verifies the ONE artifact it owns. Cross-artifact coverage is always the macro loop's job.

---

## Why two levels and not one

- **Cheaper convergence.** An agent that returns self-verified work means the orchestrator's score is usually ≥7 on the first return — fewer macro re-dispatches.
- **Bounded blast radius.** A micro-loop that stalls returns PARTIAL and dies; it can't spin the whole pipeline.
- **Honest verification.** The independent-verifier rule at the micro level stops the maker from rubber-stamping itself before the orchestrator ever sees it — the over-report is caught one layer earlier.
- **Composability.** Same five guarantees at both levels means one mental model, and the same tooling (`run-coverage-loop.sh`, `fix-verify.mjs`, `loop-learn.mjs`, `verifier_model`) serves both.

This is the shape Foreman runs unattended: a tree of micro-agents, each self-verifying in a micro-loop, wrapped in macro coverage/fix loops, gated by validators, with budgets and a human approval queue at the irreversible edges.
