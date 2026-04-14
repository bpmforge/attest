# Agent Process Flow — Step by Step

_How the SDLC lead orchestrates specialists. Every arrow is a handoff/return._

## Mode 1: New Project — Full Agent Flow

```
User: /sdlc init my-app "description"
         │
         ▼
    ┌─────────────┐
    │  SDLC Lead   │ ← Discovery Interview (7 questions)
    └──────┬──────┘
           │ User confirms answers
           ▼
    Phase 0: Ideation
           │
           ├── task(git-expert) → init repo, create sdlc/setup branch
           │   └── RETURN: "git init done — repo initialized"
           │
           ├── HANDOFF → researcher (competitive landscape)
           │   └── PRODUCE: docs/research/RESEARCH_competitive_*.md
           │   └── RETURN: "researcher done — competitive analysis: [key finding]"
           │
           ├── SDLC lead reviews research (Research Findings Review Protocol)
           │   └── IF contradiction with discovery → surface to user, wait
           │
           └── SDLC lead writes VISION.md + COMPETITIVE_ANALYSIS.md
               └── Gate loop → confidence ≥ 7 → Inter-Phase Check-In → user confirms

    Phase 1: Planning
           │
           ├── HANDOFF → researcher (technical feasibility)
           │   └── PRODUCE: docs/research/RESEARCH_feasibility_*.md
           │   └── RETURN: "researcher done — feasibility: [key finding or showstopper]"
           │
           ├── Research Findings Review → surface contradictions
           │
           └── SDLC lead writes SCOPE.md, RISKS.md, CONSTRAINTS.md, USER_PERSONAS.md
               └── Gate → Check-In → user confirms

    Phase 2: Requirements
           │
           ├── HANDOFF → ux-engineer
           │   └── PRODUCE: docs/design/USER_FLOWS.md
           │   └── RETURN: "ux done — N flows produced"
           │
           ├── SDLC lead writes SRS.md + USER_STORIES.md
           │
           ├── ★ NEW: SDLC lead writes docs/testing/USE_CASES.md
           │   └── Derive from USER_PERSONAS.md + SRS.md + USER_STORIES.md
           │   └── One use case per user story, with persona, preconditions,
           │       main flow, alt flows, success criteria
           │
           ├── ★ NEW: HANDOFF → test-engineer
           │   └── PRODUCE: docs/testing/TEST_PLAN.md
           │   └── Review USE_CASES.md, assign P0/P1/P2 priorities,
           │       map each to a test file, define cross-cutting checks
           │   └── RETURN: "test-plan done — N use cases mapped to test files"
           │
           └── Gate → Check-In → user confirms

    Phase 3: Design
           │
           ├── HANDOFF → researcher (framework/stack comparison)
           │   └── PRODUCE: docs/research/RESEARCH_framework_comparison_*.md
           │   └── RETURN: "researcher done — framework comparison: [recommended stack]"
           ├── Research Findings Review
           ├── SDLC lead writes TECH_STACK.md
           │
           ├── HANDOFF → db-architect
           │   └── PRODUCE: docs/DATABASE.md
           │   └── RETURN: "db done — N tables, key relationships"
           │
           ├── HANDOFF → api-designer
           │   └── PRODUCE: docs/API_DESIGN.md
           │   └── RETURN: "api done — N endpoints designed"
           │
           ├── HANDOFF → ux-engineer (if UI-bearing)
           │   └── PRODUCE: DESIGN_PRINCIPLES.md, STYLE_GUIDE.md, UX_SPEC.md
           │   └── RETURN: "ux done — design system and UX spec"
           │
           ├── HANDOFF → frontend-design (if UI-bearing, after ux-engineer)
           │   └── PRODUCE: design tokens, DESIGN_SYSTEM.md, IMPLEMENTATION_NOTES.md
           │   └── RETURN: "frontend done — tokens implemented"
           │
           ├── HANDOFF → security-auditor
           │   └── PRODUCE: docs/THREAT_MODEL.md
           │   └── RETURN: "security done — N threats found"
           │
           └── SDLC lead writes ARCHITECTURE.md
               └── Gate → Check-In → Merge sdlc/setup → main

    Phase 4: Implementation
           │
           ├── HANDOFF → test-engineer
           │   └── PRODUCE: docs/TEST_STRATEGY.md (framework selection + approach)
           │   └── RETURN: "test-strategy done"
           │
           ├── IMPLEMENTATION CHECKPOINT (Size S items: user builds directly)
           │   └── Constraint: use ONLY tech listed in docs/TECH_STACK.md
           │   └── "Write tests alongside each module"
           │   └── RETURN: user says "implementation done"
           │
           ├── HANDOFF → coding-agent (Size M items from Mode 4 backlog)
           │   └── READ: docs/TECH_STACK.md + IMPROVEMENT_[n]_DESIGN.md
           │   └── VERIFY: all library APIs via Context7 before writing
           │   └── ENFORCE: anti-slop rules (no over-engineering, no hallucinated APIs)
           │   └── PRODUCE: implementation files + docs/improve/VERIFY_ITEM_[n].md
           │   └── RETURN: "coding-agent done — item [n]: [one sentence]"
           │
           ├── ★ NEW: HANDOFF → test-engineer (WRITE ACTUAL E2E TESTS)
           │   └── READ: docs/testing/USE_CASES.md + docs/testing/TEST_PLAN.md
           │   └── PRODUCE: e2e/use-cases/*.spec.ts — one per P0 use case
           │   └── PRODUCE: e2e/use-cases/_fixtures.ts — shared helpers
           │   └── RUN: full test suite, report pass/fail
           │   └── RETURN: "e2e-tests done — N/M passing"
           │
           ├── ★ NEW: SDLC lead runs DISCOVERY AUDIT
           │   └── Walk all pages, collect errors, produce report
           │   └── Triage: fix blockers before reviews
           │
           ├── HANDOFF → db-architect (migration verification)
           ├── HANDOFF → api-designer (contract verification)
           │
           ├── HANDOFF → container-ops (Dockerfile, compose, .dockerignore)
           │   └── Must run BEFORE sre-engineer — CI/CD needs container config
           │
           ├── HANDOFF → sre-engineer (CI/CD pipeline, monitoring, deploy)
           │   └── Uses container config from container-ops as input
           ├── HANDOFF → container-ops (Dockerfile, compose)
           │
           ├── HANDOFF → code-reviewer
           │   └── ★ NEW: GATE: all P0 tests must pass before review starts
           │   └── PRODUCE: docs/reviews/CODE_REVIEW_*.md
           │
           ├── HANDOFF → security-auditor (audit implementation)
           │   └── PRODUCE: docs/reviews/SECURITY_REVIEW_*.md
           │
           ├── HANDOFF → sre-engineer (CI/CD + deploy)
           │
           └── ★ NEW: FINAL GATE — all P0 + P1 tests passing
               └── task(git-expert) → PR + merge
```

## What's New (★ marked above)

### 1. USE_CASES.md in Phase 2

SDLC lead writes this INLINE (not a handoff) because it derives directly from requirements:
- One use case per user story from USER_STORIES.md
- Each has: persona, preconditions, trigger, main flow, alt flows, success criteria
- This is the source of truth for what gets tested

### 2. TEST_PLAN.md via test-engineer in Phase 2

After USE_CASES.md is written, test-engineer reviews it and produces TEST_PLAN.md:
- Assigns P0/P1/P2 priority to each use case
- Maps each to a test file name
- Defines cross-cutting checks (no console errors, no 5xx, loading states)
- This is the test backlog — tracked through Phase 4

### 3. E2E test writing in Phase 4 (AFTER implementation)

Currently Phase 4 only produces TEST_STRATEGY.md (framework choices) and tells the developer to "write tests alongside code." That's aspirational — developers skip it under time pressure.

**New:** After implementation is done, SDLC lead hands off to test-engineer with a specific task:
- Read USE_CASES.md + TEST_PLAN.md
- Write one E2E spec per P0 use case
- Write shared fixtures helper
- Run the full suite
- Report pass/fail count

This catches integration issues (like the ones we found in Sibling) BEFORE code review starts.

### 4. Discovery audit after implementation

SDLC lead runs an inline discovery check:
- Navigate every page/endpoint the app exposes
- Collect: console errors, 4xx/5xx responses, visible error text, slow loads
- Produce: docs/audits/discovery-YYYY-MM-DD.md
- Triage: fix blockers before sending to code-reviewer

### 5. P0 gate before code review

Code-reviewer and security-auditor should not waste time reviewing code that doesn't pass its own tests. New gate: all P0 tests must be green before review starts.

## Context Packet Protocol (for all HANDOFFs)

Before every HANDOFF, SDLC lead prepares a context packet — NOT in the handoff prompt itself (that's for task instructions), but as a separate file the agent reads:

```
write(filePath="docs/work/context-for-{agent}.md", content="
# Context Packet for {agent}

## Project (3 sentences from DISCOVERY.md)
## Your task (specific: what to do, what to produce)
## Files to read (in priority order, with what's relevant in each)
## Files to produce (with expected content description)
## Patterns to follow (from CODING_MEMORY.md or project conventions)
## What NOT to do (scope boundaries)
")
```

Then in the HANDOFF prompt:
```
CONTEXT (read these before starting):
- docs/work/context-for-{agent}.md — full context for this task
- [specific file 1]
- [specific file 2]
```

### Why: agents that re-explore the codebase waste 30-50% of their context on orientation. A focused context packet front-loads them.

## Completion Manifest Protocol (for all returning agents)

Every specialist must end with:

```
# Completion: {agent} — {task summary}
Files produced: [list with line counts]
Files modified: [list with what changed]
Tests: [new count, existing pass/fail, test command]
Decisions: [key choices made, with reasoning]
Known issues: [deferred items, with why]
Ready for: {next agent or "SDLC lead resume"}
```

SDLC lead reads this, verifies files exist + have content, runs the test command, then continues.

### Why: "check file exists with >50 lines" is too weak. Completion manifests give structured verification.

---

## Mode 3: Feature Addition — Agent Flow

```
User: /sdlc feature "add payment processing"
         │
         ▼
    Feature Discovery Interview (7 questions) → user confirms
         │
    Step 1: Impact Analysis (SDLC lead inline)
         ├── Read codebase, identify affected files
         └── Write docs/FEATURE_IMPACT.md
         │
    Step 2: Design
         ├── HANDOFF → relevant specialist (db-architect if schema change,
         │              api-designer if new endpoints, ux-engineer if new UI)
         │
         ├── ★ NEW: SDLC lead writes USE CASES for this feature
         │   └── Append to docs/testing/USE_CASES.md
         │
         ├── ★ NEW: HANDOFF → test-engineer (write acceptance test FIRST)
         │   └── PRODUCE: e2e/use-cases/{feature}.spec.ts
         │   └── Test should FAIL initially (TDD)
         │   └── RETURN: "test written — fails as expected (feature not built yet)"
         │
    Step 3: Implement
         ├── Developer builds the feature
         ├── Test should now PASS
         │
    Step 4: Review
         ├── ★ NEW: GATE — feature test + all existing P0 tests pass
         ├── HANDOFF → code-reviewer
         ├── HANDOFF → security-auditor (if security-sensitive)
         │
    Step 5: PR + Merge
         └── task(git-expert) → PR, review, merge
```

## Mode 4: Improve — Agent Flow

```
User: /sdlc improve "ux"
         │
    Improvement Discovery Interview → user confirms scope
         │
    Step 1: Context Check
         ├── Read AGENTS.md, existing docs, recent git history
         │
    ★ NEW Step 1.5: Discovery Audit
         ├── Walk all pages, collect errors, network failures
         ├── PRODUCE: docs/audits/discovery-pre-improve.md
         ├── This gives ground truth BEFORE any audit agent runs
         │
    Step 2: Targeted Audits
         ├── HANDOFF → ux-engineer (if UX focus)
         ├── HANDOFF → code-reviewer (if quality focus)
         ├── HANDOFF → performance-engineer (if perf focus)
         ├── HANDOFF → security-auditor (if security focus)
         │
    Step 3: Consolidate + Plan
         ├── SDLC lead reads all audit reports
         ├── Produces docs/improve/IMPROVEMENT_PLAN.md
         ├── ★ NEW: Include "regression test" column in plan
         │   └── For each fix, what test prevents regression?
         │
    Step 4: Implement Fixes
         ├── Per fix: implement → write regression test → verify
         │
    Step 5: Verify
         ├── ★ NEW: Re-run discovery audit
         ├── Compare before/after findings
         ├── All P0 tests still pass (no regressions)
         │
    Step 6: PR + Merge
         └── task(git-expert) → PR with before/after metrics
```
