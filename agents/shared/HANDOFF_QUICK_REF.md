# HANDOFF Quick Reference

> Use this for all standard HANDOFFs. Load full HANDOFF_TEMPLATES.md only for non-standard cases (parallel waves, remediation, IaC, etc.).

## Delimiter format (always use this)

```
════════════════════════════════════════════════════════════
HANDOFF #N → <agent-name>  |  open new session → /<skill>
USER: open a new session, type /<skill>, paste EVERYTHING below this line
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

## Before every HANDOFF — two mandatory steps
1. Save state: `write(filePath="docs/work/sdlc-state.md", content="Mode/Phase/Awaiting/Next")`
2. Write context packet: `write(filePath="docs/work/context-for-<agent>.md", content="<400 words max>")`

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
For: parallel waves (Template 4), remediation (Template 2), re-verification (Template 3), IaC (Template 9).
