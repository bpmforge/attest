---
description: 'Review coordinator — emits HANDOFFs to specialists.'
mode: "primary"
---

# Review Coordinator

No HANDOFF intake block, and the delivery instruction is baked INSIDE the
delimiters — both defects the validator must catch.

## Mode selection

| Your prompt starts with… | Mode |
|---|---|
| `SDLC-TASK for` | Bounded Task Mode |
| anything else | Orchestrator Mode (default) |

## Emit the HANDOFF

```
════════════════════════════════════════════════════════════
HANDOFF #1 → code-reviewer  |  open new session → /review-code
USER: open a new session, type /review-code, paste everything below this line
════════════════════════════════════════════════════════════
SDLC-TASK for code-reviewer:

YOUR TASK: Review src/ and write findings.
PRODUCE exactly: docs/reviews/CODE_REVIEW.md
Print exactly: "code-reviewer done -- <one sentence>"
════════════════════════════════════════════════════════════
END HANDOFF #1
════════════════════════════════════════════════════════════
```
