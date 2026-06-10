[🏠 Index](README.md)  |  [← Agent System](05-agents.md)  |  [HANDOFF Delegation Protocol →](07-handoff-protocol.md)

---

# 6. SDLC Workflow

The SDLC Lead orchestrates four distinct modes based on user intent.

### 6.1 Mode Routing

```mermaid
flowchart TD
    Start([User types command or natural language])
    Start --> Detect{Detect intent}

    Detect -->|"build new app / start project"| M1["Mode 1: /sdlc init"]
    Detect -->|"understand this codebase / onboard"| M2["Mode 2: /sdlc onboard"]
    Detect -->|"add X feature / build X"| M3["Mode 3: /sdlc feature"]
    Detect -->|"improve / audit / review / find gaps"| M4["Mode 4: /sdlc improve"]
    Detect -->|"single file/function review"| Direct["Direct to specialist<br/>/review-code or /security"]

    M1 --> State{Check SDLC state<br/>detect-sdlc-state.sh}
    State -->|fresh| Interview["Discovery Interview<br/>7 questions"]
    State -->|partial| Resume["Resume from<br/>lowest incomplete phase"]
    State -->|brownfield| Onboard["Recommend /sdlc onboard first"]
    State -->|complete| Improve["Offer /sdlc improve or /sdlc feature"]

    Interview --> Confirm[User confirms summary]
    Confirm --> Phase0["Phase 0: Ideation<br/>VISION.md, COMPETITIVE_ANALYSIS.md"]
    Phase0 --> Gate0{Gate 0 pass?}
    Gate0 -->|yes| Phase1["Phase 1: Planning<br/>SCOPE, RISKS, CONSTRAINTS, PERSONAS"]
    Gate0 -->|no| Phase0
    Phase1 --> Gate1{Gate 1 pass?}
    Gate1 --> Phase2["Phase 2: Requirements<br/>SRS, USER_STORIES, USE_CASES"]
    Phase2 --> GateA{Human Gate A<br/>Requirements locked}
    GateA -->|approved| Phase3["Phase 3: Design<br/>ARCHITECTURE, API, DB, SECURITY..."]
    Phase3 --> Gate3{Gate 3 pass?}
    Gate3 --> Phase35["Phase 3.5: Test Design<br/>TEST_DESIGN.md"]
    Phase35 --> GateB{Human Gate B<br/>Contracts frozen}
    GateB -->|approved| Phase4["Phase 4: Implementation<br/>coding-agent waves"]
    Phase4 --> Gate4{Gate 4 pass?}
    Gate4 --> Phase5["Phase 5: Release<br/>FIX_BACKLOG closed, reviews APPROVED"]
    Phase5 --> Done([Ship])
```

### 6.2 Mode 4 (Audit and Improve) Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant LEAD as sdlc-lead
    participant REV as code-reviewer
    participant SEC as security-auditor
    participant PERF as performance-engineer
    participant UX as ux-engineer
    participant COD as coding-agent
    participant GIT as git-expert

    U->>LEAD: /sdlc improve ["focus"]
    LEAD->>LEAD: Read sdlc-improve-mode.md
    LEAD->>U: Discovery Interview (scope, vision, tolerance)
    U-->>LEAD: Answers
    LEAD->>LEAD: Write docs/IMPROVE_CONTEXT.md
    LEAD->>U: Confirm summary

    Note over LEAD: Step 2 - Parallel Audit Fan-Out

    par Audit wave (all in parallel)
        LEAD->>U: HANDOFF #1 -> code-reviewer
        U->>REV: Open new session, /review-code
        REV->>REV: 4-pass review (security, perf, correctness, style)
        REV-->>U: docs/improve/CODE_HEALTH_REPORT.md
        U-->>LEAD: code-reviewer done
    and
        LEAD->>U: HANDOFF #2 -> security-auditor
        U->>SEC: Open new session, /security
        SEC->>SEC: 5-phase audit (understand, scan, owasp, verify, chains)
        SEC-->>U: docs/improve/SECURITY_REPORT.md
        U-->>LEAD: security-auditor done
    and
        LEAD->>U: HANDOFF #3 -> performance-engineer
        U->>PERF: Open new session, /perf
        PERF->>PERF: Profile, benchmark, bottleneck analysis
        PERF-->>U: docs/improve/PERF_REPORT.md
        U-->>LEAD: performance-engineer done
    and
        LEAD->>U: HANDOFF #4 -> ux-engineer (optional)
        U->>UX: Open new session, /ux
        UX->>UX: UX audit, WCAG check, workflow analysis
        UX-->>U: docs/improve/UX_REPORT.md
        U-->>LEAD: ux-engineer done
    end

    LEAD->>LEAD: Synthesize all reports
    LEAD->>LEAD: Write docs/improve/IMPROVEMENT_BACKLOG.md
    LEAD->>U: Present ranked backlog (CRITICAL/HIGH/MEDIUM/LOW)
    U-->>LEAD: Approve priorities

    Note over LEAD: Step 5 - Fix Execution Waves

    loop For each approved priority tier
        LEAD->>U: HANDOFF -> coding-agent (fix wave)
        U->>COD: Open session, /code
        COD->>COD: Fix items from FIX_BACKLOG at cited file:line
        COD-->>U: FIX_SUMMARY_*.md
        U-->>LEAD: coding-agent done

        LEAD->>U: HANDOFF -> specialist (re-verify)
        U->>REV: Targeted re-verification
        REV-->>U: VERIFY_*.md (PASS/FAIL per row)
        U-->>LEAD: code-reviewer done
    end

    LEAD->>U: HANDOFF -> git-expert
    U->>GIT: PR to main
    GIT-->>U: PR created
```

---

---

[🏠 Index](README.md)  |  [← Agent System](05-agents.md)  |  [HANDOFF Delegation Protocol →](07-handoff-protocol.md)
