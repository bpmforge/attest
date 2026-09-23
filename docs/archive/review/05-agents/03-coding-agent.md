[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← SDLC Orchestrator](02-sdlc-orchestrator.md)  |  [Security Auditor →](04-security-auditor.md)

---

# 5.3 Coding Agent

**File:** `agents/coding-agent.md` | **Skill:** `/code`

Doc-driven implementation engineer. Refuses to start without a design spec and enforces strict anti-slop rules on every file written. Runs API verification via Context7 MCP before writing any library call.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant COD as coding-agent
    participant CTX as Context7 MCP
    participant FS as File System
    participant SH as Shell

    LEAD->>COD: SDLC-TASK HANDOFF (context + produce list)
    COD->>FS: Read LOOP_PREVENTION.md + ANTI_SLOP_RULES.md
    COD->>FS: Read all design docs listed in context
    COD->>FS: Read 2-3 existing files in target directories

    loop Phase 2 - API Verification (per library)
        COD->>CTX: resolve-library-id + get-library-docs
        alt Context7 available
            CTX-->>COD: Current API docs
        else Context7 unavailable
            COD->>FS: Read node_modules or grep existing usages
        end
    end

    loop Phase 3 - Implement (per file in PRODUCE list)
        COD->>FS: Read existing file before editing
        COD->>FS: Write implementation file
        COD->>FS: Write companion test file
    end

    COD->>SH: npm run build
    SH-->>COD: Build result
    COD->>SH: npm test
    SH-->>COD: Test result
    alt Tests fail
        COD->>FS: Fix implementation (never modify tests)
        COD->>SH: npm test (retry)
    end

    loop Phase 5 - Self-Audit (7 dimensions)
        COD->>COD: Score each dimension 1-10
        alt Any dimension < 7
            COD->>FS: Fix and re-score (max 3 attempts)
        end
    end

    COD->>SH: validate-code-health.sh
    COD->>FS: Write Completion Manifest
    COD-->>LEAD: Completion phrase + manifest
```

## Self-Audit Dimensions

| Dimension | What it checks |
|-----------|---------------|
| Correctness | Logic matches spec requirements |
| Test coverage | Happy path, error path, and edge cases covered |
| Anti-slop | No over-engineering, no premature abstraction |
| Pattern matching | Matches conventions from existing files |
| Tech stack compliance | No unapproved libraries |
| Scope compliance | Only files listed in PRODUCE were written |
| Code clarity | No comments explaining what (only why when non-obvious) |

## Deliverables

- Implementation files (exactly those named in the PRODUCE list)
- Companion test files alongside each module
- Verification doc under `docs/improve/VERIFY_ITEM_N.md`
- Completion Manifest with anti-slop checklist, test result, deferred items

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← SDLC Orchestrator](02-sdlc-orchestrator.md)  |  [Security Auditor →](04-security-auditor.md)
