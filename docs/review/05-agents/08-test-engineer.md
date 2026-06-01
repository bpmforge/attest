[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Architecture Designer](07-architecture-designer.md)  |  [Database Architect →](09-db-architect.md)

---

# 5.8 Test Engineer

**File:** `agents/test-engineer.md` | **Skill:** `/test-expert`

Designs and writes unit, integration, and E2E tests focused on catching real bugs in critical paths — not chasing coverage numbers. Produces full Playwright infrastructure when invoked for a new SDLC project.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant TEST as test-engineer
    participant FS as File System
    participant SH as Shell

    LEAD->>TEST: HANDOFF (scope + test type)
    TEST->>FS: Read LOOP_PREVENTION.md
    TEST->>FS: Phase 1 — Glob existing test files, read test config
    TEST->>SH: Run existing test suite to establish baseline
    TEST->>FS: Write phase1.md checkpoint

    TEST->>FS: Phase 2 — Read framework docs and existing patterns
    TEST->>FS: Phase 3 — Plan test targets and categories
    TEST->>FS: Write phase3.md checkpoint

    loop Phase 4 — Per function or module (4-pass)
        TEST->>FS: Pass 1 — Happy path tests
        TEST->>FS: Pass 2 — Error path tests
        TEST->>FS: Pass 3 — Edge case tests
        TEST->>TEST: Pass 4 — Verify (break code, confirm tests catch it)
    end

    alt SDLC new project
        TEST->>FS: Write playwright.config.ts
        TEST->>FS: Write auth.setup.ts, BasePage.ts, fixtures.ts
        TEST->>FS: Write global-setup.ts (DB reset and seed)
        TEST->>FS: Write CI workflow yml
    end

    TEST->>SH: Phase 5 — npm test (run twice if any flakiness suspected)
    SH-->>TEST: All pass or failures
    alt Tests fail
        TEST->>FS: Fix test infrastructure (never the test assertions)
        TEST->>SH: npm test retry
    end

    TEST->>SH: validate-test-design.sh
    TEST->>FS: Phase 6 — Write TEST_PLAN.md and TEST_STRATEGY.md
    TEST->>FS: Write Completion Manifest
    TEST-->>LEAD: Completion phrase + manifest
```

## Test Pyramid

| Layer | Framework | Focus |
|-------|-----------|-------|
| Unit | vitest or jest | Pure functions, business logic |
| Integration | vitest + supertest | Service boundaries, DB interactions |
| E2E | Playwright | Full user flows, acceptance criteria |

## Deliverables

| File | When |
|------|------|
| Test spec files | Always |
| `playwright.config.ts` | New SDLC project |
| `e2e/auth.setup.ts` | New SDLC project |
| `e2e/pages/BasePage.ts` | New SDLC project |
| `e2e/fixtures.ts` | New SDLC project |
| CI workflow yml | New SDLC project |
| `docs/testing/TEST_PLAN.md` | Always |
| `docs/TEST_STRATEGY.md` | Full audit mode |

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Architecture Designer](07-architecture-designer.md)  |  [Database Architect →](09-db-architect.md)
