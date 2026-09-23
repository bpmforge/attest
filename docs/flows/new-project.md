# New Project Flow — `/sdlc init`

_Mode 1: from a one-line idea to a signed release tag._

Source of truth: `agents/sdlc-init-mode.md` (routing), `agents/sdlc-init-phases-0-2.md`, `agents/sdlc-init-phase-3.md` (Phase 3 and 3.5), `agents/sdlc-init-phase-4.md`, `agents/sdlc-init-phase-5.md`. `agents/sdlc-init-phases-3-4.md` is a legacy file that `sdlc-init-mode.md` does not load.

## Lifecycle overview

```mermaid
flowchart TD
    S(["/sdlc init name 'description'"]) --> DI["Discovery Interview - 7 questions"]
    DI --> D["Confirm answers, write docs/DISCOVERY.md"]
    D --> P0[Phase 0 Ideation] --> P1[Phase 1 Planning] --> P2[Phase 2 Requirements]
    P2 --> GA{"Human Approval Gate A"}
    GA --> P3[Phase 3 Design] --> P35["Phase 3.5 Test Design"]
    P35 --> GB{"Human Approval Gate B"}
    GB --> M["git-expert: merge sdlc/setup to main"]
    M --> P4[Phase 4 Implementation] --> P5["Phase 5 Review and Release"]
    P5 --> T(["Signed release tag"])
```

The Discovery Interview is NEVER-AUTO: planning stays interactive even in `autonomy: auto`. Each phase ends with an inter-phase check-in and a git-expert commit on `sdlc/setup`.

## Phase 0 — Ideation

```mermaid
flowchart TD
    A["git-expert: init repo + sdlc/setup branch"] --> B["Lead writes docs/sdlc/SDLC_TRACKER.md"]
    B --> C["researcher: RESEARCH_competitive_date.md"]
    C --> D{"Contradicts DISCOVERY.md?"}
    D -->|yes| U[Surface to user, wait for direction] --> W
    D -->|no| W["Lead writes VISION.md + COMPETITIVE_ANALYSIS.md"]
    W --> G["Track 2 confidence loop, target 7 or higher"]
    G --> K["git-expert commit"] --> I[Inter-Phase Check-In]
```

## Phase 1 — Planning

```mermaid
flowchart TD
    A["researcher: RESEARCH_feasibility_date.md"] --> B{Showstopper?}
    B -->|yes| U[Surface to user before scoping] --> W
    B -->|no| W["Lead writes SCOPE, RISKS, CONSTRAINTS, USER_PERSONAS"]
    W --> G["Track 2 confidence rating, RISKS 7 or higher"]
    G --> K["git-expert commit"] --> I[Inter-Phase Check-In]
```

## Phase 2 — Requirements

```mermaid
flowchart TD
    A["ux-engineer: docs/design/USER_FLOWS.md"] --> B["Lead writes docs/work/REQUIREMENTS_MATRIX.md"]
    B --> C["User reviews candidate requirements - NEVER-AUTO"]
    C --> D["Lead writes SRS.md + USER_STORIES.md + docs/testing/USE_CASES.md"]
    D --> G["run-coverage-loop.sh phase-2"]
    G -->|exit 1 gaps| D
    G -->|"exit 2 or 3"| E[Escalate to user]
    G -->|exit 0| K["git-expert commit"] --> CA["challenger: SRS.md"] --> GA{"Human Approval Gate A"}
```

## Phase 3 — Design, then 3.5 Test Design

```mermaid
flowchart TD
    Q["Design Clarification Interview: DESIGN_CONTEXT.md"] --> R["researcher: framework comparison"]
    R --> TS["Lead writes TECH_STACK.md"]
    TS --> AD["architecture-designer: MODULE_DESIGN.md + INFRASTRUCTURE.md"]
    AD --> DB["db-architect: DATABASE.md"]
    DB --> API["api-designer: API_DESIGN.md + openapi.yaml"]
    API --> UI{UI-bearing?}
    UI -->|yes| UX["ux-engineer: DESIGN_PRINCIPLES + STYLE_GUIDE + UX_SPEC"]
    UX -.->|"optional"| FE["frontend-design: DESIGN_SYSTEM.md"]
    UX --> TM
    UI -->|no| TM["security-auditor: THREAT_MODEL.md"]
    TM --> SC["security-auditor: SECURITY_CONTROLS.md"]
    SC --> RC["db-architect + api-designer: apply security controls"]
    RC --> INF["sre-engineer: INFRASTRUCTURE.md"]
    INF --> SY["Lead writes ARCHITECTURE.md + PARALLELIZATION_MAP.md + TRACEABILITY.md"]
    SY --> G["run-coverage-loop.sh phase-3"]
    G --> TD["Phase 3.5 - test-engineer: docs/testing/TEST_DESIGN.md"]
    TD --> G35["run-coverage-loop.sh phase-3.5"] --> CB["challenger: TECH_STACK, THREAT_MODEL, SECURITY_CONTROLS"] --> GB{"Human Approval Gate B"}
    GB --> MG["git-expert: merge sdlc/setup to main"]
```

"Phase 3.5" is **Test Design**. A separate design chain (ux-researcher → design-system-lead → content-designer) exists as agents, but sdlc-lead doesn't dispatch it. It is reached only through an `--auto` note inside the ux-engineer HANDOFF, for when `docs/design/flows.md` or `tokens.json` is missing, and no gate checks it.

## Phase 4 — Implementation

```mermaid
flowchart TD
    C{"Board plan.json + scripts/conductor/conductor.mjs present?"}
    C -->|yes| CD["Conductor runs the board unattended - see unattended.md"]
    C -->|no| MS["Ask user: sequential or parallel per wave"]
    MS --> W0["frontend-design: Wave 0 design system - UI projects only"]
    W0 --> TS["test-engineer: TEST_STRATEGY.md"]
    TS --> R1["Round 1: coding-agent per module + handoff gates"]
    R1 --> R2["Round 2: one expert review pass per wave, FIX_BACKLOG_wave_date.md"]
    R2 --> R2b["2b challenger if HIGH, 2c fix-verify"]
    R2b --> R3["Round 3: runtime validation, RUNTIME_module_date.md, 3b design-iterator"]
    R3 --> NW{More waves?}
    NW -->|yes| R1
    NW -->|no| E2E["test-engineer: e2e specs per P0 use case"]
    E2E --> DA["test-engineer: docs/audits/discovery-date.md"]
    DA --> MIG["db-architect + api-designer: migration + contract review"]
    MIG --> CO["container-ops: Dockerfile + docker-compose.yml"]
    CO --> INF["sre-engineer: infra + CI"]
    INF --> G["run-coverage-loop.sh phase-4"]
    CD --> G
```

Wave rules (scope collisions, when parallel is refused) are in `agents/sdlc/PARALLEL_WAVE_PROTOCOL.md`.

## Phase 5 — Review and Release

```mermaid
flowchart TD
    P["Pre-gate: phase-4 receipt, RUNTIME PASS"] --> R1["Round 1 parallel: security-auditor, performance-engineer, code-reviewer, ux-engineer, qa-vnv-engineer if UI"]
    R1 --> FB["Lead writes FIX_BACKLOG_RELEASE_date.md"]
    FB --> R2["Round 2: fix-verify loop, max 3"]
    R2 --> R3["Round 3 audits: tech debt, coverage, container, doc gaps"]
    R3 --> G["Round 4: run-coverage-loop.sh phase-5"]
    G -->|exit 1| R2
    G -->|exit 2| E[Escalate to user]
    G -->|exit 0| REL["Round 5: git-expert --release - CHANGELOG + signed tag"]
```

Phase 5 tags and publishes a release. It does not deploy.

## Paths every phase agrees on

- Use cases: `docs/testing/USE_CASES.md`. Validators and state detection still accept a legacy `docs/USE_CASES.md`, preferring the canonical path.
- Test design: `docs/testing/TEST_DESIGN.md` (Phase 3.5), which Phase 4 updates with each P0's test file and result. `TEST_PLAN.md` belongs to onboarding.
- Gate fact-checks: Gate A challenges `docs/SRS.md`. Gate B challenges `docs/TECH_STACK.md`, `docs/THREAT_MODEL.md` and `docs/SECURITY_CONTROLS.md`.
