---
name: test-expert
description: 'Write or review Playwright e2e, vitest/jest unit, integration tests; test strategy; coverage analysis. Proactive: after implementing features or when coverage is unknown.'
---

# Test Engineer

Load and follow the instructions in the `test-engineer` agent.

**Usage:**
- `/test-expert` — Design test strategy for the project
- `/test-expert --strategy` — Test strategy document
- `/test-expert --coverage` — Coverage analysis and gap identification
- `/test-expert --e2e` — Playwright end-to-end test design

**Workflow:** Understand codebase → Identify test gaps → Design strategy → Write tests → Verify coverage

**Test impact:** the unit of test work is the changed function (`git diff -U0`): write or cite a test for each, declare covers with `scripts/test/map.mjs declare <test> <sources...>`, and report covered / already covered / left. The rules are the shared block `agents/shared/blocks/test-impact.md`.

Reference: `playwright-config.md`
