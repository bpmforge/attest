---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# BOUNDED_TASK_CONTRACT.md

**Six canonical rules that govern every HANDOFF in this system.**

Every specialist agent must read and honour these rules when its prompt starts with `SDLC-TASK for`. They are the contract between the orchestrator (sdlc-lead) and every downstream specialist. Breaking any rule voids the HANDOFF and the output is rejected at the gate.

---

## Rule 1 — Write-scope isolation

You may only write files inside the directory (or directories) listed under `WRITE-SCOPE` in the HANDOFF prompt, plus:
- `docs/work/**` — intermediate work files and context packets
- `docs/reviews/**` — manifests and verification output

**Do NOT write to any path outside your WRITE-SCOPE.** If a necessary file falls outside your scope, note it in the Completion Manifest under "Known issues / deferred" and stop. Do not write it.

If your WRITE-SCOPE is `src/auth/`, you may not touch `src/billing/` even if you notice a bug there. Observations go to "Known issues / deferred" only.

---

## Rule 2 — Produce only what PRODUCE names

The HANDOFF lists exact files under `PRODUCE`. Create those files and no others. Do not create additional files "for completeness" or "because they seemed useful." The orchestrator's gate validators check for exactly the files listed — extra files are invisible to the gate and wasted effort.

---

## Rule 3 — Verbatim completion phrase

When all PRODUCE files are written, output the exact phrase from the HANDOFF prompt. Copy it character-for-character. The orchestrator uses this phrase as a signal that the HANDOFF is complete. Paraphrasing or rewording it breaks the resume flow.

If the HANDOFF does not specify a completion phrase, use the default phrase declared in your own agent file (the `Print:` line). Fill any `[N]`/`[summary]` placeholders with real values — the prefix before the first placeholder must stay verbatim, because the orchestrator matches on it.

---

## Rule 4 — No scope expansion

If you notice something outside your task — a bug in another module, a missing test, an outdated dependency — do NOT fix it. Record it in the Completion Manifest under "Known issues / deferred." Scope creep silently overwrites files the orchestrator thinks are stable, causing divergence.

---

## Rule 5 — Stop means stop

After printing the completion phrase, end your response. Do not:
- Summarize what you did (the Completion Manifest already does this)
- Ask follow-up questions
- Suggest next steps
- Offer to do more

The orchestrator resumes the workflow. Your job is done when the phrase is printed.

**Pairs with `agents/shared/PERSISTENCE.md`:** persistence governs the moment *before* the phrase (never end your turn after merely announcing an action — perform it, then print the phrase); stop-means-stop governs *after* it. Emitting a plan as your final message when execution was requested violates persistence; adding chatter after the phrase violates stop-means-stop.

---

## Rule 6 — Completion Manifest is mandatory

Before the completion phrase, output a Completion Manifest:

```markdown
# Completion Manifest

## Files produced
- `path/to/file` — [what it contains] — [line count]

## Files modified
- `path/to/existing` — [what changed, why]

## Decisions made
- [Decision] — [why, alternatives considered]

## Known issues / deferred
- [Issue] — [why deferred, which agent should address it]

## Memory written
- memory_store: [type] — "[≤1-line durable decision / error / verified-fact + citation]"   (or "None — nothing durable")

## Model tier: [small|medium|large] — [estimated context used: low|medium|high]

## Ready for: [next agent name, or "SDLC lead resume"]

Tracker updated: [SDLC_TRACKER.md row / PROGRESS.md / DELEGATION_LOG.md / CHANGELOG.md — where this step was recorded]
```

All sections are required. "None" is a valid value for sections with nothing to report. The **`Tracker updated:` line is mandatory** (G-D, tracking-as-gate): a step that changes work files but records nothing is how work gets lost between steps and sessions — the git-based `validate-tracker-fresh.sh` proves a tracker actually changed, and `validate-completion-manifest.sh` proves the manifest declares it.

**`## Memory written` (MEMORY_PRIMER M4 write-back).** You do NOT recall memory — the SDLC lead handed you a memory slice in your context packet. But you MUST **`memory_store` any durable decision, error, or verified fact you established** (with a `citation`), then record it here — otherwise your "Decisions made" evaporate at session end and the next HANDOFF re-derives them. Never store secrets/PII (redact per MEMORY_PRIMER). Nothing durable? Write "None — nothing durable".

---

## Why these rules exist

Cross-agent coordination is via explicit HANDOFF documents — in `autonomy=interactive` (default) written to `docs/work/HANDOFF_<agent>.md`, which the user opens the specialist against by pasting a one-line `SDLC-TASK for <agent>: read docs/work/HANDOFF_<agent>.md and execute it.`; in `autonomy=auto` dispatched programmatically (Task tool / subprocess). Either way the specialist runs in an isolated context. This means:

- The orchestrator (sdlc-lead) cannot see what a specialist is doing while it runs
- There is no shared context between sessions — every specialist starts fresh
- The HANDOFF prompt + CONTEXT files are the ONLY information the specialist has
- Gate validators run after the specialist is done; they cannot catch scope violations mid-flight

These rules keep the system predictable: the orchestrator knows exactly what changed, where, and why. Specialists that violate the contract produce output the orchestrator cannot safely incorporate.

---

## Rule 7 — Minimum Viable Output for short deliverables

Agents producing deliverables under 300 lines (micro-agents, scanners, verifiers) must still include:

1. **Executive summary** — 2-4 sentences: what was checked, what was found, overall verdict
2. **Findings table** — even if empty: `| Finding | Severity | File | Status |` with at least one row (or "None found" if clean)
3. **Confidence score** — overall confidence 1-10 with a one-line reason

A 3-line output that says "no issues found" with no confidence score, no scope statement, and no findings table is not a valid deliverable — a coordinator cannot tell if the agent ran correctly or just gave up.

---

## Rule 8 — Failure and recovery

**Commit phase files even on failure.** Multi-phase specialists write each
phase's output to `docs/work/<agent>/<task-slug>/phaseN.md` as they go. Those
files are the recovery state: if the session dies at phase 4, the next session
reads phase 1–3 from disk instead of redoing them. Run
`scripts/recover-phase-state.sh <agent> <task-slug>` to commit them to git and
print a resume packet.

**Three failures → escalate, never loop.** If the same step fails 3 times
(tool error, validator gap you cannot close, missing input), STOP. Do not
retry a 4th time and do not silently work around it. Write what you have to
the Completion Manifest under "Known issues / deferred" with the failure
detail, print your completion phrase with a `[PARTIAL]` prefix, and stop.
The orchestrator (or the user) decides: resume from your phase files, fix the
input, or hand the task to a different agent. This mirrors the Ralph Wiggum
3-iteration cap and run-plan's checkpoint-then-escalate (G5) — the cap is the
same everywhere on purpose.

**Resuming a failed HANDOFF.** A resume prompt includes the original HANDOFF
plus the line `RESUME from: docs/work/<agent>/<task-slug>/` — read the phase
files there first and continue from the last completed phase. Do not restart
phase 1.

## Rule 9 — Locate before create (anti-reinvention, G-B)

Before creating OR overwriting any file:

1. **Check it exists** — `ls` / `git ls-files <path>` / grep the symbol. If it exists, **read it fully** before touching it. Never "recreate from scratch" a file that already exists.
2. **Diff against canonical** — if the file is generated, vendored, or sourced from a canonical repo, confirm your change is real and superior by `diff`-ing against that source. **An audit that claims a file is "missing", "wrong", or "a stub" MUST be confirmed with `ls`/`diff`/`grep` against the source before you act on it.** A perception error (false "missing") that triggers a rewrite is the most expensive drift there is.
3. **Never hand-edit generated files** — anything in `GENERATED_FILES.txt` is a build output; regenerate it via the build, never edit it directly.

Enforced by `scripts/validators/validate-no-reinvent.sh` (hard-fails edits to `GENERATED_FILES.txt` paths; warns on wholesale rewrites of tracked files). This rule exists because a Mode-4 audit once falsely reported canonical loop-engineering files as "missing" and overwrote 6 of them with inferior stubs — a regression a single `diff` would have prevented.

## Rule 10 — Phase-gated checkpoint/revert (B7)

For multi-phase work (> 3 sequential gated phases), Rule 8's 3-strike escalation is backed by a git checkpoint. After a phase gate returns **PASS**, the orchestrator checkpoints it (commit + `phase/<name>-pass-*` tag). When a later phase fails unrecoverably, it **reverts to the last known-good checkpoint and restarts that phase from clean state** — it does not unwind from the error context (a weak model cannot reliably edit its way out of a broken state). See `agents/shared/CHECKPOINT_REVERT.md`. Reverts are for unrecoverable failure only; exploration uses a branch.
