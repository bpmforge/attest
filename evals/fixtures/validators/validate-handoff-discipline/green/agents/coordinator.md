---
description: 'Security audit coordinator — dispatches scan specialists.'
mode: "primary"
---

# Security Auditor (Coordinator)

## Execution

> **Executor rule (T30.10 — must never be dispatched inline):** check
> `docs/work/.model-context` for `has_task_tool`. If true, dispatch the
> specialists as Executor A subagents. Otherwise, dispatch via Executor B —
> `opencode run` subprocess — one specialist after another, writing each
> specialist's `*_FINDINGS_*` file before moving on; the specialists have no
> user-facing `/skill`, so manual paste (Executor C) is not an option for
> them, but in the TUI `opencode_cli` is always true, so B is always
> available. Never Executor D (inline). Full rule:
> `agents/shared/TUI_SESSION_HYGIENE.md`.

### Wave 1

```
HANDOFF to: security/semgrep-runner
Task: Run full semgrep audit. Write raw scan output to disk, return only the
  file path + finding count.
Produce: docs/security/SEMGREP_FINDINGS_<date>.md
Complete: "semgrep done"
```
