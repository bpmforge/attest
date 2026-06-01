[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Overview](01-overview.md)  |  [Coding Agent →](03-coding-agent.md)

---

# 5.2 SDLC Orchestrator

The orchestrator is split across five files loaded on demand: `sdlc-lead.md` (spine) + one mode file per session.

## sdlc-lead — Startup and Gate Loop

Every session starts with state detection and mode routing. Every HANDOFF return passes a 3-gate scoring loop before advancing.

```mermaid
sequenceDiagram
    participant U as User
    participant LEAD as sdlc-lead
    participant SH as detect-sdlc-state.sh
    participant MODE as Mode File
    participant SPEC as Specialist Agent
    participant GATE as run-handoff-gates.sh

    U->>LEAD: slash command or natural language
    LEAD->>SH: detect-sdlc-state.sh
    SH-->>LEAD: fresh, partial, brownfield, or complete
    LEAD->>LEAD: Read sdlc-state.md if prior session
    LEAD-->>U: Present state summary and mode options
    U->>LEAD: Confirm mode
    LEAD->>MODE: Read mode file (init, onboard, feature, or improve)
    MODE-->>LEAD: Mode instructions loaded

    loop Per delegation
        LEAD->>LEAD: Write context-for-agent.md
        LEAD->>SPEC: HANDOFF block (task + context + produce)
        SPEC-->>LEAD: Completion Manifest + phrase
        LEAD->>GATE: run-handoff-gates.sh
        GATE-->>LEAD: scope gate + manifest gate + coverage gate
        alt score >= 7
            LEAD->>LEAD: Append DONE to DELEGATION_LOG.md
            LEAD-->>U: Phase complete, confirm next?
        else score 5-6
            LEAD->>SPEC: HANDOFF REVISE (max 3x)
        else score < 5
            LEAD-->>U: Auto-fail with gap explanation
        end
    end
```

**Human approval gates:**
- **Gate A** (Phase 2 → 3): blocks before any design docs are written
- **Gate B** (Phase 3.5 → 4): blocks before any coding HANDOFFs are emitted

---

## Mode 1 — New Project (sdlc-init-mode)

```mermaid
sequenceDiagram
    participant U as User
    participant LEAD as sdlc-lead
    participant GIT as git-expert
    participant SPEC as Specialist Agents
    participant COD as coding-agent
    participant GATE as validate-phase-gate.sh

    LEAD-->>U: Discovery Interview (7 questions)
    U->>LEAD: Answers confirmed
    LEAD->>LEAD: Write docs/DISCOVERY.md
    LEAD->>GIT: HANDOFF — create sdlc/setup branch

    loop Phases 0-2 (Ideation, Planning, Requirements)
        LEAD->>LEAD: Write phase documents directly
        LEAD->>GATE: validate-phase-gate.sh phase-N
        GATE-->>LEAD: exit 0 or gap list
    end

    LEAD-->>U: Gate A — approve Phase 3 design?
    U->>LEAD: Yes

    par Phase 3 Design HANDOFFs
        LEAD->>SPEC: architecture-designer
        LEAD->>SPEC: db-architect
        LEAD->>SPEC: api-designer
        LEAD->>SPEC: security-auditor
        LEAD->>SPEC: ux-engineer (if UI project)
    end
    LEAD->>GATE: validate-phase-gate.sh phase-3

    LEAD->>SPEC: test-engineer (TEST_DESIGN.md)
    LEAD-->>U: Gate B — approve implementation?
    U->>LEAD: Yes

    loop Phase 4 — Per Wave
        LEAD->>COD: HANDOFF coding-agent (module wave)
        COD-->>LEAD: Wave complete
        LEAD->>GATE: validate-build + validate-tests
    end

    par Phase 5 — Final Reviews
        LEAD->>SPEC: code-reviewer
        LEAD->>SPEC: security-auditor
    end
    LEAD->>COD: HANDOFF Fix-Verify loop (up to 3x)
    LEAD->>GIT: HANDOFF — merge PR and tag release
    LEAD-->>U: Release complete
```

---

## Mode 2 — Onboard Existing Codebase (sdlc-onboard-mode)

Three depth levels: `--quick` (steps 1-7 only), default (+ lightweight inventory loop), `--deep` (+ Ralph Wiggum exhaustive loop).

```mermaid
sequenceDiagram
    participant U as User
    participant LEAD as sdlc-lead
    participant GIT as git-expert
    participant SPEC as Specialist Agents
    participant VAL as run-coverage-loop.sh

    LEAD->>GIT: HANDOFF — create docs/onboard branch
    LEAD->>LEAD: Step 1 — Map landscape (README, package.json, globs)
    LEAD->>LEAD: Step 2 — Trace entry points and sequence diagrams
    LEAD->>GIT: HANDOFF — git checkpoint

    LEAD->>SPEC: db-architect — Step 3: reverse-engineer ERD
    LEAD->>LEAD: Step 4 — Map components (C2 + C3 diagrams)
    LEAD->>LEAD: Step 5 — Identify patterns

    par Step 6 — Health Audits
        LEAD->>SPEC: code-reviewer (health, debt, patterns)
        LEAD->>SPEC: security-auditor (OWASP Top 10)
        LEAD->>SPEC: test-engineer (coverage analysis)
        LEAD->>SPEC: performance-engineer (static scan)
    end

    LEAD->>LEAD: Step 7 — Produce ARCHITECTURE.md + ONBOARDING.md
    LEAD->>GIT: HANDOFF — commit and open PR

    alt "--deep" flag
        loop Ralph Wiggum loop (max 3 iterations)
            LEAD->>SPEC: researcher — full inventory
            LEAD->>VAL: validate-inventory.sh
            VAL-->>LEAD: exit 0 (done) or exit 1 (gaps)
            LEAD->>SPEC: Gap-fill HANDOFFs per flagged row
        end
    else default
        loop Lightweight coverage loop (max 3 iterations)
            LEAD->>VAL: run-coverage-loop.sh onboard-deep
            VAL-->>LEAD: exit 0 (done) or exit 1 (gaps)
        end
    end
```

---

## Mode 3 — Add Feature (sdlc-feature-mode)

```mermaid
sequenceDiagram
    participant U as User
    participant LEAD as sdlc-lead
    participant GIT as git-expert
    participant SPEC as Specialist Agents
    participant COD as coding-agent
    participant TEST as test-engineer

    LEAD-->>U: Feature Discovery Interview (7 questions)
    U->>LEAD: Answers confirmed
    LEAD->>LEAD: Step 1 — Impact analysis (grep + call-chain trace)
    LEAD->>LEAD: Step 2 — Design (options doc if non-trivial)

    par Conditional Design HANDOFFs
        LEAD->>SPEC: db-architect (if schema changes)
        LEAD->>SPEC: api-designer (if API changes)
        LEAD->>SPEC: security-auditor (if auth or user input touched)
    end

    LEAD->>GIT: HANDOFF — create feat/slug branch and draft PR
    LEAD->>TEST: HANDOFF — write E2E acceptance tests (TDD)
    LEAD-->>U: Implementation checkpoint — make tests pass
    U->>LEAD: Implementation done

    par Parallel Reviews (auto-triggered)
        LEAD->>SPEC: code-reviewer (always)
        LEAD->>SPEC: security-auditor (if auth in blast radius)
        LEAD->>SPEC: performance-engineer (if DB or loops touched)
        LEAD->>SPEC: ux-engineer (if UI files in blast radius)
    end

    LEAD->>LEAD: Synthesize FIX_BACKLOG

    loop Fix-Verify loop (max 3x)
        LEAD->>COD: HANDOFF — fix backlog items
        LEAD->>SPEC: HANDOFF — targeted re-verify
        alt All PASS
            LEAD->>LEAD: Exit loop
        else Failures remain
            LEAD->>LEAD: Update backlog and iterate
        end
    end

    LEAD->>LEAD: Run runtime gate validators
    LEAD->>GIT: HANDOFF — squash merge and delete branch
    LEAD-->>U: Feature shipped
```

---

## Mode 4 — Audit and Improve (sdlc-improve-mode)

```mermaid
sequenceDiagram
    participant U as User
    participant LEAD as sdlc-lead
    participant GIT as git-expert
    participant SPEC as Specialist Agents
    participant COD as coding-agent
    participant RES as researcher

    LEAD->>GIT: HANDOFF — create improve/slug branch
    LEAD->>LEAD: Step 1 — Check for existing Mode 2 docs
    LEAD->>SPEC: test-engineer — discovery audit (if running instance)

    par Step 2 — Audit HANDOFFs (parallel or sequential per user choice)
        LEAD->>SPEC: security-auditor
        LEAD->>SPEC: code-reviewer
        LEAD->>SPEC: performance-engineer
        LEAD->>SPEC: db-architect
        LEAD->>SPEC: ux-engineer (if UI project)
    end

    LEAD->>RES: HANDOFF — vision research (if user gave desired state)
    LEAD->>LEAD: Step 3 — Synthesize into IMPROVEMENT_BACKLOG.md
    LEAD-->>U: Step 4 — Present backlog, wait for item selection
    U->>LEAD: Items N approved

    loop Step 5 — Per approved item
        alt Size S (single-file)
            LEAD-->>U: Implementation checkpoint
            LEAD->>SPEC: Targeted verification HANDOFF
        else Size M (cross-cutting)
            LEAD->>LEAD: Write IMPROVEMENT_N_DESIGN.md
            LEAD->>COD: HANDOFF coding-agent
            LEAD->>SPEC: Verification HANDOFF
        else Size L (architectural)
            LEAD->>LEAD: Launch Mode 3 sub-workflow
        end
        LEAD->>GIT: HANDOFF — git checkpoint
    end

    LEAD->>SPEC: test-engineer — post-improvement discovery audit
    LEAD->>LEAD: Compare DISCOVERY_PRE vs DISCOVERY_POST
    LEAD->>GIT: HANDOFF — final PR
    LEAD-->>U: Improvement session complete
```

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Overview](01-overview.md)  |  [Coding Agent →](03-coding-agent.md)
