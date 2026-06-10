---
name: guide
description: 'Expert-system concierge / front door. Describe any goal in plain English and it routes you to the right expert and drives the workflow — SDLC, security (find + fix), code health, dead code, performance, database, UX, tests, releases, research. Use when you do not know which command to run, or just want to say what you want done.'
---

# Guide — Expert Concierge

Load and follow the instructions in the `guide` agent.

The front door to the whole expert system. You describe what you want; it
picks the expert, explains the route, checks prerequisites (via `doctor.sh`),
and drives the workflow — handing off to specialists and always offering the
next step (especially: "want me to fix what I found?").

## When to use

- You're not sure which `/command` fits your goal.
- You want to describe a goal in plain English ("check all my source for security issues and help fix them", "harden this before launch", "this codebase is unfamiliar — where do I start?").
- The goal spans several experts and you want them sequenced.

## Examples

| You say | Guide routes to |
|---|---|
| "securely check all my source and help fix issues" | `/security` → triage → `/security --fix` |
| "is there code in here that nothing uses?" | `/review-code` (dead-code dimension) |
| "I don't know this codebase" | `/sdlc onboard` |
| "make this production-ready" | sequenced: security → review-code → perf → fix → tests |
| "break this big task into steps" | `task-decomposer` → `scripts/run-plan.mjs` |

It does not produce deliverables itself — it gets you to the expert that does.
