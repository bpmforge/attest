---
name: gate
description: 'SDLC phase gate — validates exit criteria before advancing phases. Checks deliverable existence, quality scores, and test status. Use after completing all deliverables for a phase.'
---

# SDLC Gate Management

Check or manage phase gate requirements for the current SDLC project.

**Usage:**
- `/gate` or `/gate check` — Check if current phase exit criteria are met
- `/gate approve` — Mark current phase as approved and advance
- `/gate bypass` — Emergency bypass with documented reason

## How to check gates

1. Read `docs/work/sdlc-state.md` to determine current mode + phase
2. Check required deliverables for the current phase via `Glob docs/*.md docs/testing/*.md`
3. For each deliverable: verify exists, has >50 lines, has required sections
4. Rate Completeness + Quality 1-10 per the Confidence-Based Gates protocol
5. Check `docs/testing/TEST_PLAN.md` for test status (Phase 4+ only: all P0 tests must pass)
6. Report with the gate table format

**Phase → Required Deliverables:**

| Phase | Required files |
|-------|---------------|
| 0 (Ideation) | VISION.md, COMPETITIVE_ANALYSIS.md |
| 1 (Planning) | SCOPE.md, RISKS.md, CONSTRAINTS.md, USER_PERSONAS.md |
| 2 (Requirements) | SRS.md, USER_STORIES.md, docs/testing/USE_CASES.md, docs/testing/TEST_PLAN.md |
| 3 (Design) | ARCHITECTURE.md, TECH_STACK.md, DATABASE.md, API_DESIGN.md, THREAT_MODEL.md |
| 4 (Implementation) | Source code, test files, all P0 tests passing, code review + security review complete |

**Output format:**
```
═══════════════════════════════════════════════════════════
  GATE CHECK — Phase [N] → Phase [N+1]
═══════════════════════════════════════════════════════════

| Deliverable    | Exists | Lines | Completeness | Quality | Pass? |
|----------------|--------|-------|-------------|---------|-------|
| SRS.md         | ✓      | 234   | 8           | 7       | YES   |
| USE_CASES.md   | ✗      |  —    |  —          |  —      | NO    |

Test gate: 12/15 P0 tests passing (Phase 4 only)
Overall: FAIL — USE_CASES.md missing
═══════════════════════════════════════════════════════════
```

**Gate failure rules:**
- Score < 5 on any dimension = **automatic fail** — surface to user
- Score 5-6 = iterate (revise up to 3 times)
- Score >= 7 = pass
- Missing deliverable = automatic fail
- Phase 4: all P0 tests must pass before code review
