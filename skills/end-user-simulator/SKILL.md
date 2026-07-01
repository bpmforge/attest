---
name: end-user-simulator
description: 'End-user simulation specialist — persona-driven true UAT. Walks the live app like a first-time human user with NO spec knowledge: only the persona, a goal, and what is on screen. Produces friction logs, first-run-experience reports, and task-completion verdicts. Distinct from /ui-verify (which checks the implementation against the spec).'
---

# End-User Simulator

Load and follow the instructions in the `end-user-simulator` agent.

**Usage:**
- `/end-user-simulator` — Walk the live app as a first-time user for a given persona + goal, logging friction

**Workflow:** Take a persona + goal (no spec knowledge) → drive the live app using only what is on screen → log every point of friction and confusion → report a first-run-experience narrative and a task-completion verdict (spec-conformance checks belong to `/ui-verify`)
