[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Security Auditor](04-security-auditor.md)  |  [Performance Engineer →](06-performance-engineer.md)

---

# 5.5 Code Reviewer

**File:** `agents/code-reviewer.md` | **Skill:** `/review-code`

Senior code-health auditor covering 8 quality dimensions. Flags and routes — does not fix security issues or performance bottlenecks. Operates in 4 output modes and an optional Phase Mode for single-phase execution.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant REV as code-reviewer
    participant FS as File System
    participant SH as Shell

    LEAD->>REV: HANDOFF (scope + mode flag)
    REV->>FS: Read code-health-checklist.md
    REV->>FS: Read anti-slop-audit.md
    REV->>FS: Read LOOP_PREVENTION.md

    REV->>FS: Phase 1 - Read entry points and existing patterns
    REV->>FS: Write phase1.md checkpoint

    REV->>SH: Phase 2 - Run anti-slop validator script
    REV->>FS: Write per-file tooling findings

    loop Phase 3 - 8 review passes (one per dimension)
        REV->>FS: Read source files for verbatim snippets
        REV->>FS: Write findings (file:line + snippet + fix)
    end

    REV->>FS: Phase 4 - Synthesize Health Dashboard
    REV->>FS: Write mode-specific output file
    REV->>SH: validate-book-structure.sh (if output > 300 lines)
    REV->>SH: validate-mermaid.sh
    REV->>FS: Write Completion Manifest
    REV-->>LEAD: Completion phrase + manifest
```

## Output Modes

| Flag | Output file | What it covers |
|------|-------------|---------------|
| `--review` | `docs/reviews/CODE_REVIEW_date.md` | Full 8-dimension health pass + Health Dashboard |
| `--debt` | `docs/reviews/TECH_DEBT_date.md` | Prioritized tech-debt backlog |
| `--consolidate` | `docs/reviews/CONSOLIDATION_date.md` | DRY and error-handling consolidation proposals |
| `--patterns` | `docs/reviews/PATTERNS_date.md` | Cross-codebase pattern consistency audit |

## 8 Review Dimensions

Maintainability, error handling, test quality, code duplication, complexity, naming clarity, dependency hygiene, security-adjacent patterns (flagged for security-auditor, not fixed here).

## Routing Rules

Findings in security, performance, database, UX, or API domains are listed in a `## Handoffs` section pointing to the responsible specialist — the code-reviewer does not fix them.

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Security Auditor](04-security-auditor.md)  |  [Performance Engineer →](06-performance-engineer.md)
