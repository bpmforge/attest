# Code-Health and Performance Flows — `/review-code`, `/perf`

Source of truth: `agents/code-reviewer.md` + `agents/code-review/*.md`; `agents/performance-engineer.md` + `agents/performance/*.md`.

## `/review-code`

```mermaid
flowchart TD
    S(["/review-code --review, --debt, --consolidate or --patterns"]) --> W1
    subgraph W1 [Wave 1 - parallel]
        CA["complexity-analyzer"]
        DD["duplication-detector"]
        EH["error-handling-auditor"]
    end
    W1 --> W2
    subgraph W2 [Wave 2 - parallel]
        TS["type-safety-checker"]
        PC["pattern-consistency-checker"]
        AS["anti-slop-auditor - R-01 to R-31"]
        DC["dead-code-detector"]
    end
    W2 --> D9["Coordinator runs validate-tech-stack.sh"]
    D9 --> SY["code-health-synthesizer - needs all 7 FINDINGS files, else BLOCKED"]
    SY --> OUT["CODE_REVIEW_module_date.md + FIX_BACKLOG_date.md"]
    OUT --> G{"Any HIGH or CRITICAL?"}
    G -->|yes| CH["challenger: CHALLENGE_REPORT_code_module_date.md"]
    CH --> FIN["Finalize FIX_BACKLOG if nothing CONTRADICTED"]
    G -->|no| FIN
    FIN --> MO["Mode output in docs/reviews: CODE_REVIEW, TECH_DEBT, CONSOLIDATION or PATTERNS"]
```

The mode flag changes only the final document; every mode runs the same specialists. Each specialist writes `<NAME>_FINDINGS_<date>.md`. The synthesizer looks for **compounding risk**, where one module is complex, duplicated *and* handles errors badly. `/review-code` never applies fixes itself; they go to FIX_BACKLOG.

## `/perf`

```mermaid
flowchart TD
    S(["/perf"]) --> W1
    subgraph W1 [Wave 1]
        SP["static-perf-analyzer - always"]
        DB["db-query-analyzer - if a database is detected"]
        CC["concurrency-checker - always"]
    end
    W1 --> W2
    subgraph W2 [Wave 2]
        PR["profiler-agent - only if profiling requested or a problem confirmed"]
        BA["bundle-analyzer - only if a frontend build is detected"]
    end
    W2 --> SY["perf-synthesizer - compounding slowdowns"]
    SY --> R["docs/performance/PERFORMANCE_REPORT_date.md"]
    SY --> FB["docs/performance/PERF_FIX_BACKLOG_date.md"]
    R --> G{"HIGH or CRITICAL regression?"}
    G -->|yes| CH["challenger: CHALLENGE_REPORT_perf_date.md"]
    G -->|no| E([Done])
    CH --> E
```

The rule is to measure before optimizing. A slow query inside an O(n²) loop with no caching is scored as multiplicative, not additive.
