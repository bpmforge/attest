---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# HANDOFF Quick Reference

> Use this for all standard HANDOFFs. Load full HANDOFF_TEMPLATES.md only for non-standard cases (parallel waves, remediation, IaC, etc.).

## Delimiter format (always use this)

> **Nothing addressed to the user goes inside the delimiters.** The block below is written to
> `docs/work/HANDOFF_<agent>.md` and *read by the specialist* — any `USER: open a new session…`
> line inside it will be read as a task and relayed back at you. Instructions for the human go in
> the pointer you print (below), never in the body.

```
════════════════════════════════════════════════════════════
HANDOFF #N → <agent-name>  |  run by: <agent-name> via /<skill>
════════════════════════════════════════════════════════════
SDLC-TASK for <agent-name>:

ROLE: You are a [domain expert — e.g. "senior database architect"].
Use domain-precise vocabulary. Quantitative > qualitative ("P95 < 200ms" not "fast").

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md   -- six rules
- docs/work/context-for-<agent>.md         -- context packet (max 400 words)
- <file 1>                                 -- <what it contains>

WRITE-SCOPE (exclusive): <dir>/

YOUR TASK: <2-4 sentences — what to produce, not which mode to run>

PRODUCE exactly:
- <output file 1>   -- <what it should contain>
- <output file 2>   -- <what it should contain>

VERIFY before completing:
- <required topic 1>
- <required topic 2>
If missing, add before printing completion phrase.

Completion Manifest at <manifest-path>: files produced, decisions, known issues, verify result.

Print exactly: "<agent> done -- <one sentence>"
Then stop.
════════════════════════════════════════════════════════════
END HANDOFF #N
════════════════════════════════════════════════════════════
```

## Pointer to print for the user (goes ABOVE the delimiters, never inside)

The specialist must receive a prompt that **starts with the `SDLC-TASK for` trigger** — otherwise a
smaller model falls through to its default/orchestrator mode and hands the task straight back. Give
the user one line to paste:

```
── NEXT HANDOFF ──────────────────────────────
Open agent:  /<skill>          (<agent-name>)
Paste this one line into it:

    SDLC-TASK for <agent-name>: read docs/work/HANDOFF_<agent>.md and execute it.

It produces: <report path>   ← come back with this
──────────────────────────────────────────────
```

## Before every HANDOFF — three mandatory steps
1. Save state: `write(filePath="docs/work/sdlc-state.md", content="Mode/Phase/Awaiting/Next")`
2. Write context packet: `write(filePath="docs/work/context-for-<agent>.md", content="<400 words max>")`
3. **Code tasks with a ` ```verify ` fence — probe the fence yourself, now:**
   `bash ~/.config/opencode/scripts/verify-handoff.sh docs/work/context-for-<agent>.md --baseline`
   You wrote the fence, so its defects are yours. This one run proves each command
   actually runs here (a `matched nothing` verdict = an excluded path or bad glob —
   fix it before dispatch), records the pre-existing failures so the specialist is
   not blamed for them, and flags any fence line whose paths all sit outside the
   WRITE-SCOPE you just wrote. Dispatching an unprobed fence is how a specialist
   ends up with the work done, green unreachable, and nothing delivered.

## Context packet template (400 word cap)
```markdown
# Context for <agent>
## Project (2 sentences max)
## Your task (what to produce, success criteria)
## Files to read (3-5 max, priority order)
## Patterns to follow (naming, structure, test patterns)
## Do NOT do (scope limits)
```

## Full templates (load only when needed)
`read(filePath="~/.config/opencode/agents/shared/HANDOFF_TEMPLATES.md")`
For: parallel waves (Template 4), remediation (Template 2), re-verification (Template 3), IaC (Template 9),
requirement reconciliation before Phase 5 (Template 11 — mandatory when `plan.json` modules declare `stories[]`).
