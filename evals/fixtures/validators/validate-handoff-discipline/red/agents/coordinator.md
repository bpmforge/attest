---
description: 'Security audit coordinator — dispatches scan specialists.'
mode: "primary"
---

# Security Auditor (Coordinator)

## Execution

> **Executor rule:** check `docs/work/.model-context` for `has_task_tool`. If
> true, dispatch the specialists as subagents. Otherwise (opencode / no task
> tool) do NOT wait on parallel spawns that cannot run — read each
> specialist's agent file and execute its methodology directly in this
> conversation, one specialist after another, writing each specialist's
> `*_FINDINGS_*` file before moving on. The specialists have no user-facing
> `/skill`, so manual paste (Executor C) is not an option for them — in
> opencode the coordinator runs them inline.

### Wave 1

```
HANDOFF to: security/semgrep-runner
Task: Run full semgrep audit.
Produce: docs/security/SEMGREP_FINDINGS_<date>.md
Complete: "semgrep done"
```
