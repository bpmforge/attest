[🏠 Index](README.md)  |  [← HANDOFF Delegation Protocol](07-handoff-protocol.md)  |  [Installation Flow →](09-installation.md)

---

# 8. Validation Gate System

### 8.1 Phase Gate Structure

```mermaid
flowchart TD
    subgraph Gates["Phase Gate Chain"]
        P0["Phase 0 Gate<br/>File existence only<br/>VISION.md, COMPETITIVE_ANALYSIS.md"]
        P1["Phase 1 Gate<br/>File existence + prereq: phase-0<br/>SCOPE, RISKS, CONSTRAINTS, PERSONAS"]
        P2["Phase 2 Gate<br/>use-cases + user-stories + traceability<br/>prereq: phase-1"]
        P3["Phase 3 Gate<br/>architecture + api-coverage + sequence-coverage<br/>+ erd-coverage + c3-coverage + entry-points<br/>+ tech-stack + adrs + security-controls<br/>prereq: phase-2"]
        P35["Phase 3.5 Gate<br/>validate-test-design<br/>prereq: phase-3"]
        P4["Phase 4 Gate<br/>build + lint + tests + tests-mapping + migrations<br/>prereq: phase-3.5"]
        P5["Phase 5 Gate (Release)<br/>FIX_BACKLOG closed + reviews APPROVED<br/>+ RUNTIME PASS<br/>prereq: phase-4"]
    end

    P0 -->|"✅ lock file written"| P1
    P1 -->|"✅ lock file written"| P2
    P2 -->|"✅ lock file written"| P3
    P3 -->|"✅ lock file written"| P35
    P35 -->|"✅ lock file written"| GateB{Human Gate B}
    GateB -->|"user approves"| P4
    P4 -->|"✅ lock file written"| P5
    P5 -->|"✅ all pass"| Ship([Ship])

    subgraph Standalone["Standalone Gates"]
        OD["onboard-deep<br/>inventory + architecture<br/>+ erd-coverage + sequence-coverage"]
        SD["security-deep<br/>owasp + attack-chains"]
    end
```

### 8.2 Coverage Loop Protocol

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant CL as run-coverage-loop.sh
    participant VAL as Specific Validator
    participant SPEC as Specialist Agent

    LEAD->>CL: run-coverage-loop.sh phase-N
    
    loop Max 3 iterations
        CL->>VAL: Run phase-N validators
        VAL-->>CL: exit 0 (clean) or exit 1 (gaps) or exit 2 (exhausted)
        
        alt exit 0 — clean
            CL-->>LEAD: All rows covered
            LEAD->>LEAD: Mark tracker DONE, advance
            Note over LEAD: Loop ends
        else exit 1 — gaps remain (iter < 3)
            CL-->>LEAD: docs/work/COVERAGE_LOOP_phase_date.md
            LEAD->>LEAD: Read gap list
            LEAD->>SPEC: HANDOFF — fill specific gaps
            SPEC-->>LEAD: Gaps filled
        else exit 2 — 3 iterations exhausted
            CL-->>LEAD: Escalation block
            LEAD->>LEAD: Read RALPH_WIGGUM_LOOP.md
            LEAD->>LEAD: Offer: waiver / lower-bar / specialist / manual
        end
    end
```

---

---

[🏠 Index](README.md)  |  [← HANDOFF Delegation Protocol](07-handoff-protocol.md)  |  [Installation Flow →](09-installation.md)
