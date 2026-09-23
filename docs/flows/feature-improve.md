# Feature and Improve Flows — `/sdlc feature`, `/sdlc improve`

_Mode 3 adds a feature to an existing codebase. Mode 4 audits one and works a prioritized improvement backlog._

Source of truth: `agents/sdlc-feature-mode.md`, `agents/sdlc-improve-mode.md`, `commands/sdlc-feature.md`, `commands/sdlc-improve.md`.

## Mode 3 — Feature addition

```mermaid
flowchart TD
    S(["/sdlc feature 'description'"]) --> DI["Feature Discovery Interview - docs/FEATURE_CONTEXT.md"]
    DI --> S0["Step 0: docs/sdlc/SDLC_TRACKER.md"]
    S0 --> S1["Step 1: app-cartographer - docs/explore/EXPLORE_feature.md"]
    S1 --> S15{"Step 1.5: atomic or split?"}
    S15 -->|split| DAG["COMPONENT_DAG.md - Steps 2-5 per sub-component, in waves"]
    S15 -->|atomic| S2
    DAG --> S2["Step 2 Design as needed: db-architect, migration-planner, api-designer, security-auditor design review"]
    S2 --> B["3.1 git-expert: feat/slug branch + draft PR"]
    B --> UC["3.2 Lead appends USE_CASES.md, test-engineer writes a failing E2E"]
    UC --> IMP["3.3 Implement"]
    IMP --> G1{"Feature test + existing P0 pass?"}
    G1 -->|no| IMP
    G1 -->|yes| RV["3.4 code-reviewer always; security, perf, ux if triggered"]
    RV --> FB["3.5 FIX_BACKLOG + run-coverage-loop.sh feature"]
    FB --> CH{"Any HIGH or CRITICAL row?"}
    CH -->|yes| CHAL["challenger: CHALLENGE_REPORT"]
    CH -->|no| FV
    CHAL --> FV["3.6 Fix-verify loop"]
    FV --> S4["Step 4 Verify: full suite, backlog closed"]
    S4 --> S5["Step 5 Document + runtime validators: build, lint, tests, smoke, deps"]
    S5 --> M["git-expert: PR ready, squash merge"]
```

The test is written first and must **fail** before implementation begins, then pass after it. Reviewers are added by trigger: security for auth/input/secrets, perf for queries and hot paths, ux for UI files.

## Mode 4 — Improve

```mermaid
flowchart TD
    S(["/sdlc improve 'focus'"]) --> DI["Improvement Discovery Interview - IMPROVE_CONTEXT.md"]
    DI --> S1["Step 1: git-expert improve/slug branch, tracker, reuse Mode 2 docs or write SYSTEM_SNAPSHOT.md"]
    S1 --> S15["Step 1.5: test-engineer or ux-engineer - DISCOVERY_PRE.md, skipped with no running app"]
    S15 --> S175["Step 1.75: app-cartographer - EXPLORE_feature.md, only for feature:X"]
    S175 --> AUD["Step 2 audits, sequential or parallel"]
    AUD --> OUT["docs/improve/*_AUDIT.md"]
    OUT --> S25["Step 2.5: researcher - RESEARCH_VISION, only if a vision was given"]
    S25 --> S3["Step 3: Lead writes docs/improve/IMPROVEMENT_BACKLOG.md, items sized S, M, L"]
    S3 --> S3b{"Step 3b: run-coverage-loop.sh improve"}
    S3b -->|gaps| S3
    S3b -->|clean| S4["Step 4: user approves items - EXECUTION_PLAN.md"]
    S4 --> SZ{"Step 5: item size"}
    SZ -->|S| SS["User implements at checkpoint"]
    SZ -->|M| SM["IMPROVEMENT_n_DESIGN.md, then coding-agent"]
    SZ -->|L| SL["Runs as a Mode 3 feature"]
    SS --> VI["Auditing specialist re-verifies: VERIFY_ITEM_n.md, commit"]
    SM --> VI
    SL --> VI
    VI -->|next item| SZ
    VI -->|all done| S55["Step 5.5: DISCOVERY_POST.md compared with DISCOVERY_PRE.md"]
    S55 --> S6["Step 6: IMPROVEMENT_SUMMARY.md, code-health + module-boundary gates, git-expert PR"]
```

**Step 2 audits.** There are five core audits, each writing `docs/improve/<X>_AUDIT.md`:

- ux-engineer
- code-reviewer
- performance-engineer
- security-auditor
- db-architect

These specialists are added on demand: a11y-compliance, data-steward, reliability-engineer, cost-engineer and analytics-architect. Every approved item is verified by the specialist who found it, not the one who fixed it.
