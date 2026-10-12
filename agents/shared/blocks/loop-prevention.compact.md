---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

## Loop prevention (MANDATORY)

Caps: same tool error 3× → STOP. Malformed tool args twice → STOP, never retry the same broken call. Success loop → stop on quality, not call count: criterion met or confidence ≥ 8, 3 calls with nothing new, or a repeat URL/file → stop. When in doubt, write a partial result to disk and surface to the user. Full rules: `agents/shared/LOOP_PREVENTION.md`.
