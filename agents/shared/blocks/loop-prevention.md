---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

## Loop prevention (MANDATORY)

The rules below are the whole budget — do NOT read the long form (`~/.config/opencode/agents/shared/LOOP_PREVENTION.md`, 15KB) unless a classification is contested; `agents/shared/cards/LOOP_PREVENTION_CARD.md` (1.5KB) has the tool cheat-sheet. Three loop classes have caused real failures:

1. **Failure loop** — same tool error 3+ times → STOP after 3 strikes
2. **Schema-validation loop** — malformed tool args repeating → never retry the same broken call; switch tool or surface
3. **Success loop** — every call works but you keep going → hard cap at 15 total / 4 per work-unit, no duplicate URLs, diminishing-returns check after each call

These rules override the "be thorough" / "iterate more" / "try harder" instinct. Always track call counts and seen URLs/files explicitly. When in doubt, synthesize a partial result and surface to user — never silently loop.
