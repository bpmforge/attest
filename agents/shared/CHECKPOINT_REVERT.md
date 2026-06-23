---
description: 'Reference document — git checkpoint-per-phase and revert-to-known-good for deterministic recovery on multi-phase work.'
disable: true
mode: "all"
---

# CHECKPOINT_REVERT.md

**Canonical checkpoint/revert protocol for multi-phase work (Lever 8 / B7).**

`LOOP_PREVENTION.md` stops a *single* step from spiralling (no-progress kill, iteration caps). This protocol stops a *multi-phase run* from spiralling: when a later phase fails, recover by reverting to the last **gated, known-good** state instead of trying to unwind an error-laden transcript. A weak model especially cannot reliably edit its way out of a broken state — it is far cheaper to throw the broken work away and restart the phase from clean ground.

**Applies to:** Foreman and any orchestrator running **> 3 sequential gated phases** (e.g. an SDLC run). For a single bounded task, `BOUNDED_TASK_CONTRACT.md` Rule 8 (3-strike failure) already covers recovery.

---

## Principle

> After a phase's gate returns **PASS**, checkpoint it in git. If the next phase fails unrecoverably, **revert to that checkpoint** and restart the phase from clean state — do not continue from the error context.

Two invariants:
1. **Only PASS is checkpointed** — never MAYBE, never FAIL. A checkpoint is a *known-good* anchor by definition.
2. **Revert is for unrecoverable failure, not iteration** — see the anti-pattern below.

---

## Checkpoint (after a phase gate returns PASS)

```bash
# proof-of-pass artifact is already written by the gate (RUNTIME_<phase>_<date>.md)
git add -A                                  # the phase's committed work + proof
git commit -m "chore(phase): <phase-name> PASS — $(date -I)"
git tag "phase/<phase-name>-pass-$(date +%s)" -m "Phase <phase-name> gated PASS"
```

The tag is the anchor. One tag per gated phase; tags are cheap and never deleted mid-run.

---

## Revert (when the next phase fails unrecoverably)

A phase is *unrecoverably* failed when its gate returns FAIL after the BOUNDED_TASK_CONTRACT 3-strike budget is spent (not on the first stumble).

1. **Find the last known-good anchor:**
   ```bash
   git tag -l 'phase/*' | sort -V | tail -1
   ```
2. **Discard the broken work and reset to it:**
   ```bash
   git reset --hard <phase-tag>
   ```
   (`reset --hard` is blocked by the safety hook in normal sessions; an orchestrator running this protocol invokes it deliberately and records why — see step 3.)
3. **Document the revert** in `docs/reviews/ROLLBACK_<phase>_<date>.md`: what failed, why it was unrecoverable, what to try differently next attempt. This is the institutional memory that stops the same wall being hit twice.
4. **Return PARTIAL + escalate** to the orchestrator/user with the rollback doc — do not silently retry the same approach from the same state.

---

## Anti-pattern: revert as an undo button

Reverts are for **unrecoverable failure**, not "I'd like to try a different design." Exploration uses a **branch**, not a revert:

```bash
git checkout -b attempt/<phase>-v2 <phase-tag>   # explore from known-good, keep the original
```

Reverting to iterate destroys the audit trail and risks ping-ponging between two broken states.

---

## Integration

- **SDLC / Foreman orchestrator:** call the checkpoint step after every phase gate PASS (`git-expert` exposes it as the merge/checkpoint path; Foreman builds it into phase logic).
- **`BOUNDED_TASK_CONTRACT.md` Rule 10** points here for phase-gated recovery.
- **`git-workflow-checklist.md`** lists the checkpoint as an SDLC integration point.
- Pairs with **error-pruning** (`MODEL_ADAPTER.md` small-tier B2): after a revert, the next attempt starts with the failed turns *out* of context, not just out of the working tree.
