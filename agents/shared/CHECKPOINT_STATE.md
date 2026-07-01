---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Checkpoint & Resume — STATE.md (T4)

The SDLC loop builds large context. This protocol lets a user **clear context at any
point and continue** without losing the thread: the orchestrator writes a compact
checkpoint after every step, and `/sdlc resume` (T5) rehydrates from it. Distinct from
`CHECKPOINT_REVERT.md` (that is *git* checkpoints for rolling back code; this is the
*context* checkpoint for resuming work).

## The rule

After completing **any** SDLC step — a phase, a HANDOFF resume, a module claim, a gate —
overwrite `docs/work/STATE.md`. It is the single source of "where am I". Keep it to ~one
screen: reference artifacts by path, never inline them (Session Rule 4 — write to disk,
keep context lean).

## STATE.md schema

```markdown
# STATE — <mode> · <phase or step>
Updated: <YYYY-MM-DD HH:MM>   (pass the stamp in; do not invent one)

## Done
- <step / module id> — <one line> → <artifact path>

## In flight
- <awaiting HANDOFF #N → agent> — manifest: docs/work/HANDOFF_MANIFEST.md
- (nothing, if no HANDOFF is outstanding)

## Next
- <the single next step to run>

## Read to catch up (priority order)
1. docs/work/sdlc-state.md          # mode / phase / awaiting / next (fine-grained)
2. docs/work/TICKETS.md             # module board (if the project uses tickets)
3. docs/sdlc/SDLC_TRACKER.md        # per-step DONE/PENDING
4. docs/work/HANDOFF_MANIFEST.md    # only if a parallel wave is outstanding
5. <the 1–3 artifacts the Next step actually needs>
```

Rules:
- **Capped.** If Done grows long, keep the last few lines and a one-line rollup
  ("phases 0–2 complete → docs/sdlc/SDLC_TRACKER.md"). The tracker holds the full history.
- **Next is exactly one step.** Ambiguity here is what makes resume guess.
- **The catch-up list is ordered and minimal** — it is what a fresh session reads, in order,
  to reconstruct position without replaying conversation history.

## Context-budget nudge

When context crosses the `CONTEXT_BUDGET.md` threshold, write the checkpoint and print
exactly:

```
Checkpoint written to docs/work/STATE.md — safe to /clear, then run /sdlc resume to continue.
```

Do not silently keep going past the threshold; the whole point is to let the user reclaim
context. (Auto-emitting this at the threshold vs. only on request is a project flag — default
is to emit the nudge whenever you notice the threshold crossed.)

## Resume (read side — see T5 `/sdlc resume`)

A resuming session: reads `STATE.md` → the catch-up list in order → re-primes the six rules
(`SESSION_PRIMER.md`) → announces "you are at <mode/phase>, next is <X>" → continues. It never
reconstructs state from chat scrollback.

## Interaction with HANDOFF discipline

Resuming does not re-run completed HANDOFFs. If `In flight` names an outstanding HANDOFF, the
resumer waits for its completion phrase / manifest (per `EXECUTOR_SELECTION.md`) rather than
re-emitting it. Checkpoints are written **before** emitting a HANDOFF (so a cleared session can
still find the outstanding delegation) — this matches the existing "save state before every
HANDOFF" rule, of which STATE.md is the compact, resume-oriented superset.
