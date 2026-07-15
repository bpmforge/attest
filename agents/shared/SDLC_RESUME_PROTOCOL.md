---
description: 'Reference document — read on demand, not an agent. The deterministic procedure for resuming an INCOMPLETE SDLC (status: partial): gate-verify claimed-complete phases, per-artifact disposition (LOCKED / REPAIR / PRODUCE), and the additive-never-regenerate rule that stops weak models from redesigning from scratch instead of continuing.'
disable: true
mode: "all"
---

# SDLC Resume Protocol — continuing an incomplete SDLC

For `SDLC_AUDIT status: partial` (some phases done, work stopped mid-stream —
possibly by a different tool, model, or person; **do not assume
`docs/work/sdlc-state.md` exists**). The failure this prevents: a model asked to
"continue" either **redesigns from scratch** (the fresh-design reflex — wasted
work, contradicts accepted docs) or **builds on unvalidated docs** (a stale
Phase-2 poisons Phase 3+). Neither. Resume is *verify → dispose per artifact →
continue additively*.

## The procedure (deterministic — no judgment calls until step 4)

**1. Inventory** — you already have `docs/work/SDLC_AUDIT.md` from the startup
sequence (artifact-level: present vs missing, receipted vs needs-a-gate-run).
If it's stale (>1 day or the repo changed), re-run `detect-sdlc-state.sh`.

**2. Gate-verify every claimed-complete phase, lowest first — never trust the
claim.** A doc *existing* is not a phase *passing*:

```
bash(command="bash scripts/validators/validate-phase-gate.sh phase-0 . ; \
              bash scripts/validators/validate-phase-gate.sh phase-1 . ; ...")
```
(run per completed phase, lowest → highest; each prints a JSON gap summary)

**3. Fix the resume point:** the resume point is the **first phase that fails
its gate or has missing artifacts** — even if the audit called a later phase
"in progress". A claimed-complete phase that fails its gate is NOT complete;
it re-enters as the resume point with the validator's specific gaps as the
work list.

**4. Disposition per artifact** (this is the whole trick — per artifact, not
per phase):

| Artifact state | Disposition | What you do |
|---|---|---|
| Exists + its phase gate passes | **LOCKED** | Never regenerate. Read it as authoritative input. Extend **additively** if the current work needs a new section. |
| Exists + gate fails on it | **REPAIR** | Dispatch the owning agent with the validator's specific gap list ("fix these 3 gaps in USE_CASES.md") — NOT "rewrite USE_CASES.md". |
| Missing | **PRODUCE** | Normal phase HANDOFF to the owning agent, exactly as init-mode specifies for that phase. |
| Exists but contradicts newer decisions/code | **FLAG** | Surface the contradiction to the user with both versions. Do not silently pick one. Autonomy=auto: prefer the newer + log to APPROVALS.md. |

**5. Announce the resume plan before executing** (never auto-advance silently):

```
Resume plan (status: partial)
| Phase | Gate | Disposition summary |
|-------|------|---------------------|
| 0-1   | PASS | LOCKED (2 artifacts) |
| 2     | FAIL (3 gaps) | REPAIR USE_CASES.md; PRODUCE REQUIREMENTS_MATRIX |
| 3+    | not started | normal pipeline from phase-3 |
Resuming at: phase-2 (REPAIR). Proceed?
```

**6. Execute** by loading the phase file for the resume phase
(`sdlc-init-phase-*.md`) and entering at the step matching the first
REPAIR/PRODUCE artifact — **skip HANDOFFs whose PRODUCE artifacts are LOCKED.**
If `docs/work/sdlc-state.md` exists AND its claims survive step 2's gate check,
its "last completed step" refines where you enter; if its claims failed the
gate check, trust the gates, not the state file.

## The three hard rules (what makes resume ≠ init)

1. **Additive, never regenerative.** A LOCKED doc is settled decision-record —
   you may append sections, you may not rewrite it. Wholesale regeneration of an
   existing artifact requires the user's explicit ask, and is otherwise a
   protocol violation even if you think your version would be better.
2. **Gates decide, not vibes.** "Looks complete" / "looks stale" are not
   dispositions — the phase gate's JSON output is. If a validator doesn't cover
   a doubt you have, FLAG it; don't act on it.
3. **Repair is surgical.** REPAIR handoffs carry the validator's specific gap
   list as YOUR TASK. The owning agent fixes those gaps and nothing else —
   scope rules apply exactly as in a normal bounded HANDOFF.

## Interaction with the other modes

- Resume applies to a partial **init pipeline**. If the "incomplete SDLC" is
  actually a *finished system with thin docs* → that's `brownfield` → onboard.
- Mid-resume feature/improve asks: finish the resume to a stable gate first, or
  route the ask to Mode 3/4 explicitly — never interleave silently.
- `/sdlc resume` (context-clear recovery via STATE.md receipts) is the
  *session*-resume path; this protocol is the *project*-resume path. When both
  apply, run this protocol's gate verification first — receipts don't
  substitute for gates on work done by someone else.
