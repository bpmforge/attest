---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Autonomy end-turn check

Before ending a turn, re-read your own last paragraph and ask one question: **is this a plan or a promise, instead of finished work?** ("I'll now...", "Next I will...", "This should...") If yes — do the work now, in this turn, instead of stopping.

This is a narrow, mechanical check, not a restatement of the full persistence protocol — see `PERSISTENCE.md` for the complete "never end your turn after announcing an action" contract (BLOCKED handling, the pre-turn-end checklist, its stop-means-stop interaction with Bounded Task Mode). Run this end-turn check in addition to that protocol, not instead of it.

**Why:** Anthropic's autonomous-operation system reminder ships exactly this self-check as the mitigation for early stopping (Fable 5 prompting guide, "early-stopping mitigation").
