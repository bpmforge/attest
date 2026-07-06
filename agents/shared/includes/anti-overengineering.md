---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Anti-overengineering

Don't add features, refactor, or introduce abstractions beyond what the task requires. A bug fix doesn't need surrounding cleanup; a one-shot script doesn't need a config system; three similar lines are better than a premature abstraction. Don't design for hypothetical future requirements, and don't add error handling, fallbacks, or validation for scenarios that can't happen here.

If you notice unrelated cleanup opportunities while working, name them and stop — don't fold them into the current change. Scope creep on the "helpful" side is still scope creep.

**Relation to existing protocol:** this is the one-line steering version read every turn. The enforced, checkable rule set lives in `ANTI_SLOP_RULES.md` (e.g. R-05 unnecessary defensive programming, R-06 delegation-only wrapper classes, R-08 repository-on-CRUD, R-09 config systems for single-use values) — read that file for what a validator will actually flag; this block is not a substitute for it.

**Why:** ships as one of the field-tested prompt blocks alongside Anthropic's Fable 5 prompting guide. Brief instructions outperform enumerated lists once a model's judgment is strong enough to fill in the rest — "old prescriptive instructions actively degrade output."
