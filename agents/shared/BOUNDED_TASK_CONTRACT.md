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

## Model tier: [small|medium|large] — [estimated context used: low|medium|high]

## Ready for: [next agent name, or "SDLC lead resume"]
```

All seven sections are required. "None" is a valid value for sections with nothing to report.

---

## Why these rules exist

Cross-agent coordination is via explicit HANDOFF documents — dispatched by the Task tool where the runtime supports it (`has_task_tool=true` in `docs/work/.model-context`), pasted into a new session otherwise. Either way the specialist runs in an isolated context. This means:

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
