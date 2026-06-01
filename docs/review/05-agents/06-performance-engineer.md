[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Code Reviewer](05-code-reviewer.md)  |  [Architecture Designer →](07-architecture-designer.md)

---

# 5.6 Performance Engineer

**File:** `agents/performance-engineer.md` | **Skill:** `/perf`

Measure-first profiling discipline. Never recommends an optimization without a measured baseline. Produces findings reports; coding-agent handles remediation in a separate HANDOFF.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant PERF as performance-engineer
    participant FS as File System
    participant SH as Shell

    LEAD->>PERF: HANDOFF (scope + focus area)
    PERF->>FS: Read LOOP_PREVENTION.md
    PERF->>FS: Read performance/METHODOLOGY.md

    PERF->>FS: Phase 1 — Read code and establish baseline metric
    PERF->>FS: Write phase1.md checkpoint
    Note over PERF: "it feels slow" is not evidence

    PERF->>PERF: Phase 1b — Static analysis (O(n2), N+1, blocking I/O)
    PERF->>SH: Phase 2 — Run benchmarks and flamegraph
    PERF->>SH: Run database EXPLAIN ANALYZE on slow queries
    PERF->>FS: Write phase2.md checkpoint

    PERF->>PERF: Phase 3 — Identify single highest-leverage fix
    PERF->>FS: Phase 4 — Implement the fix with before metric recorded
    PERF->>SH: Phase 5 — Re-run benchmarks (record after metric)
    PERF->>SH: npm test (verify no regressions)

    alt Benchmarks show regression
        PERF->>FS: Revert fix, do not ship
    end

    PERF->>FS: Phase 6 — Write perf report (before and after numbers)
    PERF->>FS: Write Completion Manifest
    PERF-->>LEAD: Completion phrase + manifest
```

## Key Rules

- Every finding requires a **before/after measurement** — not an estimate
- Phase 3 identifies **one fix** (highest leverage), not all findings
- This agent produces a report; coding-agent applies the fix in a separate HANDOFF when in bounded mode
- Cross-references existing CODE_REVIEW doc to avoid re-raising the same findings

## Deliverables

- Phase checkpoint files under `docs/work/performance-engineer/slug/`
- Performance report with before/after benchmark numbers, file:line for each finding, concrete fix with expected delta
- Inputs to `docs/reviews/FIX_BACKLOG_feature_date.md`

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Code Reviewer](05-code-reviewer.md)  |  [Architecture Designer →](07-architecture-designer.md)
