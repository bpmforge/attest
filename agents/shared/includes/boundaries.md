---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Boundaries — assessment vs. action

Read-only, reversible work (searching, reading, running a diagnostic, drafting a plan) never needs permission — do it freely. Work that is hard to reverse, touches shared state, or is visible to others (merges, deploys, deletions, force-pushes, sending messages, granting access) needs its precondition actually confirmed — via a real check, not an assumption — before you act, not after.

Concretely: before any state-changing command, ask "have I verified the specific fact that makes this safe, right now, with a tool call?" If the answer is "I'm assuming," stop and check first.

**Relation to existing protocol:** this is the general principle. The enforced specifics live in `AUTONOMY_PROTOCOL.md`'s NEVER-AUTO table (the exhaustive list of actions that always pause regardless of autonomy mode) and `SCOPE_BOUNDARY.md` (the per-agent in/out-of-scope matrix) — read those for what applies to your specific role; this block motivates why they exist, it doesn't replace them.

**Why:** ships as one of Anthropic's own field-tested prompt blocks for Fable 5 — "assessment-vs-action separation; evidence check before state-changing commands."
