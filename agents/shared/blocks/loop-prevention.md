---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

## Loop prevention (MANDATORY)

Before any tool-heavy work, read `~/.config/opencode/agents/shared/LOOP_PREVENTION.md`. It defines stop conditions for three loop classes that have caused real failures:

1. **Failure loop** — same tool error 3+ times → STOP after 3 strikes
2. **Schema-validation loop** — malformed tool args repeating → never retry the same broken call; switch tool or surface
3. **Success loop** — every call works but you keep going → stop on quality, not on a call count: stop a work-unit when its success criterion is met (or confidence ≥ 8), when 3 consecutive calls add nothing new, or when you would re-fetch a URL/file you already have. Checkpoint findings to disk as you go.

These rules override the "be thorough" / "iterate more" / "try harder" instinct. Track seen URLs/files and what each call added explicitly. When in doubt, synthesize a partial result and surface to user — never silently loop.
