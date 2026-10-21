---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

## Loop prevention (MANDATORY)

Caps: same tool error 3× → STOP. Malformed tool args twice → STOP, never retry the same broken call. Success loop → hard cap 15 total calls / 4 per work-unit. When in doubt, write a partial result to disk and surface to the user. Card: `agents/shared/cards/LOOP_PREVENTION_CARD.md`; full rules (on demand): `agents/shared/LOOP_PREVENTION.md`.
