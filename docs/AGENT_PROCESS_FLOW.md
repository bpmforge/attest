# Agent Process Flow — Step by Step

_How the SDLC lead orchestrates specialists. Every arrow is a handoff or a return._

## Two protocols every agent honors

Before walking the mode flows, two cross-cutting protocols apply to every step in every diagram:

1. **Scope boundary** (`agents/shared/SCOPE_BOUNDARY.md`) — a primary agent invoked directly (e.g., the user typing `/research` or `/code`) checks whether the request belongs to its domain. If not, it prints a SCOPE-BOUNDARY block naming the right specialist (or `/sdlc` for orchestration) and stops. Phrases like "review for gaps", "audit this", "evaluate" are forced into Mode 4 (`/sdlc improve`) — never freelanced.
2. **Bounded task contract** (`agents/shared/BOUNDED_TASK_CONTRACT.md`) — when an agent receives a HANDOFF prompt starting with `SDLC-TASK for <agent>:`, the five rules apply: write-scope isolation, no extras beyond PRODUCE, verbatim completion phrase, no scope expansion, stop-means-stop.

The flows below assume both. If either fires, the diagram pauses and the user gets either a SCOPE-BOUNDARY block (mid-flight, agent stops) or a REVISE handoff (post-HANDOFF gate failure).

## Mode 1: New Project — full lifecycle

```mermaid
flowchart TD
    Start([User: /sdlc init my-app description]) --> Lead[SDLC Lead]
    Lead --> DI[Discovery Interview - 7 questions]
    DI --> P0[Phase 0: Ideation]
    P0 --> P1[Phase 1: Planning]
    P1 --> P2[Phase 2: Requirements]
    P2 --> P3[Phase 3: Design]
    P3 --> P4[Phase 4: Implementation]
    P4 --> P5[Phase 5: Release]
    P5 --> Done([Production deploy])
```

### Phase 0 — Ideation

```mermaid
flowchart TD
    Start[Phase 0: Ideation start] --> Git[task git-expert: init repo + sdlc/setup branch]
    Git --> Research[HANDOFF researcher: competitive landscape]
    Research --> Review[Research Findings Review Protocol]
    Review --> Surface{Contradicts DISCOVERY?}
    Surface -->|yes| Wait[Surface to user, wait for direction]
    Surface -->|no| Write[SDLC lead writes VISION.md + COMPETITIVE_ANALYSIS.md]
    Wait --> Write
    Write --> Gate[Confidence gate >= 7]
    Gate --> CheckIn[Inter-Phase Check-In]
    CheckIn --> P1Start[Phase 1 begins]
```

### Phase 1 — Planning

```mermaid
flowchart TD
    Start[Phase 1: Planning] --> Research[HANDOFF researcher: technical feasibility]
    Research --> Review[Research Findings Review]
    Review --> Showstopper{Showstopper found?}
    Showstopper -->|yes| Surface[Surface to user before scope]
    Showstopper -->|no| Write[Write SCOPE.md, RISKS.md, CONSTRAINTS.md, USER_PERSONAS.md]
    Surface --> Write
    Write --> Gate[Gate -> Check-In -> P2]
```

### Phase 2 — Requirements

```mermaid
flowchart TD
    Start[Phase 2: Requirements] --> UX[HANDOFF ux-engineer: USER_FLOWS.md]
    UX --> Write[SDLC lead writes SRS.md + USER_STORIES.md]
    Write --> UC[SDLC lead writes docs/testing/USE_CASES.md]
    UC --> TE[HANDOFF test-engineer: TEST_PLAN.md]
    TE --> Gate[Gate -> Check-In -> P3]
```

### Phase 3 — Design

```mermaid
flowchart TD
    Start[Phase 3: Design] --> Research[HANDOFF researcher: framework comparison]
    Research --> Tech[SDLC lead writes TECH_STACK.md]
    Tech --> DB[HANDOFF db-architect: DATABASE.md]
    DB --> API[HANDOFF api-designer: API_DESIGN.md + openapi.yaml]
    API --> UI{UI-bearing?}
    UI -->|yes| UX[HANDOFF ux-engineer: DESIGN_PRINCIPLES + STYLE_GUIDE + UX_SPEC]
    UX --> Frontend[HANDOFF frontend-design: design tokens + DESIGN_SYSTEM]
    UI -->|no| Sec[HANDOFF security-auditor: THREAT_MODEL.md]
    Frontend --> Sec
    Sec --> Synth[SDLC lead writes ARCHITECTURE.md + PARALLELIZATION_MAP.md]
    Synth --> Gate[Gate -> Merge sdlc/setup -> main -> P4]
```

### Phase 4 — Implementation (wave-based)

```mermaid
flowchart TD
    Start[Phase 4: Implementation] --> Mode{Sequential or Parallel waves?}
    Mode --> TS[HANDOFF test-engineer: TEST_STRATEGY.md]
    TS --> WaveLoop[For each wave in PARALLELIZATION_MAP]
    WaveLoop --> Seq{Wave mode?}
    Seq -->|sequential| OneAtATime[One coding-agent HANDOFF per module, wait verify >= 7]
    Seq -->|parallel| R1[Round 1: N coding-agent HANDOFFs in parallel]
    R1 --> R1Gate[Gate: all 'code done' + no write-scope collisions]
    R1Gate --> R2[Round 2: N code-reviewer HANDOFFs]
    R2 --> R2Gate[Gate: every module APPROVED]
    R2Gate --> R3[Round 3: N runtime-validation HANDOFFs]
    R3 --> R3Gate[Gate: every RUNTIME report = PASS]
    OneAtATime --> NextWave
    R3Gate --> NextWave[Next wave or fan-out]
    NextWave --> E2E[HANDOFF test-engineer: write E2E specs per P0 use case]
    E2E --> Disc[HANDOFF test-engineer: discovery audit on running app]
    Disc --> Container[HANDOFF container-ops: Dockerfile + compose]
    Container --> SRE[HANDOFF sre-engineer: CI/CD + deploy]
    SRE --> Reviews[Parallel review fan-out: code-reviewer + security + perf + ux]
    Reviews --> Synth[SDLC lead writes FIX_BACKLOG]
    Synth --> Loop[Fix-Verify Loop - max 3 iterations]
    Loop --> RuntimeGate[Runtime Validation Gate - blocking]
    RuntimeGate --> FinalGate[Final gate: RUNTIME PASS + FIX_BACKLOG closed + 0 open CRITICAL/HIGH]
    FinalGate --> Merge[task git-expert: PR ready + squash merge]
```

### Phase 5 — Release

Phase 5 is the release gate, not a workflow. It runs `validate-phase-gate.sh phase-5` which chains FIX_BACKLOG-closed, all reviews APPROVED, and runtime gates. If clean, it merges to `main` and tags the release.

## What's New (highlights from recent versions)

### USE_CASES.md in Phase 2

SDLC lead writes this inline (not a handoff) because it derives directly from requirements. One use case per user story, with persona, preconditions, trigger, main flow, alt flows, success criteria. This is the source of truth for what gets tested.

### TEST_PLAN.md via test-engineer in Phase 2

After USE_CASES.md is written, test-engineer reviews it and produces TEST_PLAN.md: P0/P1/P2 priorities, test-file mapping, cross-cutting checks. Tracked through Phase 4.

### E2E test writing in Phase 4

Phase 4 does not stop at TEST_STRATEGY.md (framework choices) — that's aspirational. After implementation, SDLC lead hands off to test-engineer to actually WRITE the E2E specs (one per P0 use case), run the suite, and report counts. Catches integration issues before code review starts.

### Discovery audit after implementation

SDLC lead runs an inline discovery check: navigate every page/endpoint, collect console errors / 4xx-5xx / visible error text / slow loads. Produces `docs/audits/discovery-YYYY-MM-DD.md`. Triage blockers before sending to code-reviewer.

### P0 gate before code review

Code-reviewer and security-auditor should not waste time on code that doesn't pass its own tests. All P0 tests must be green before review starts.

## Context Packet Protocol (for all HANDOFFs)

Before every HANDOFF, SDLC lead prepares a context packet — NOT inside the handoff prompt itself, but as a separate file the agent reads:

```
write(filePath="docs/work/context-for-{agent}.md", content="
# Context Packet for {agent}

## Project (3 sentences from DISCOVERY.md)
## Your task (specific: what to do, what to produce)
## Files to read (in priority order, with what's relevant in each)
## Files to produce (with expected content description)
## Patterns to follow (from CODING_MEMORY.md or project conventions)
## What NOT to do (scope boundaries)
")
```

Then in the HANDOFF prompt:
```
CONTEXT (read these before starting):
- docs/work/context-for-{agent}.md — full context for this task
- [specific file 1]
- [specific file 2]
```

**Why:** agents that re-explore the codebase waste 30-50% of their context on orientation. A focused context packet front-loads them.

## Completion Manifest Protocol (for all returning agents)

Every specialist must end with:

```
# Completion: {agent} — {task summary}
Files produced: [list with line counts]
Files modified: [list with what changed]
Tests: [new count, existing pass/fail, test command]
Decisions: [key choices made, with reasoning]
Known issues: [deferred items, with why]
Ready for: {next agent or "SDLC lead resume"}
```

SDLC lead reads this, verifies files exist with content, runs the test command, then continues.

**Why:** "check file exists with >50 lines" is too weak. Completion manifests give structured verification.

## Post-HANDOFF automated gates (v0.15.0)

After every specialist HANDOFF returns and before accepting the work, the orchestrator runs three automated gates via `./scripts/validators/run-handoff-gates.sh`:

```bash
run-handoff-gates.sh \
  --scope <assigned-dir> [--scope <dir2> ...] \
  --manifest <manifest-path> \
  [--coverage validate-<name>.sh]
```

Three gates, any failure aborts the rest:

| Gate | Script | What it checks |
|------|--------|----------------|
| 1. Scope | `validate-scope.sh` | `git status --porcelain` confined to assigned dir(s) + `docs/work/**` + `docs/reviews/**` |
| 2. Manifest | `validate-completion-manifest.sh` | Required sections + completion phrase |
| 3. Coverage | domain validator | Coverage fact (architecture / api / erd / owasp / inventory) |

**HANDOFF type → `--coverage` mapping:**

| HANDOFF type | `--coverage` arg |
|--------------|------------------|
| api-designer | `validate-api-coverage.sh` |
| db-architect | `validate-erd-coverage.sh` |
| architecture synthesis | `validate-architecture.sh` |
| security-auditor --deep | `validate-owasp.sh` |
| onboard --deep | `validate-inventory.sh` |
| code/refactor | omit |

Any gate failure returns the HANDOFF with REVISE status + the specific gap. No orchestrator judgment required.

## Ralph Wiggum Loop (deep verification)

Used by `/sdlc onboard --deep` and `/security --deep`. Canonical protocol: `agents/shared/RALPH_WIGGUM_LOOP.md`.

```mermaid
flowchart TD
    Inv[1. INVENTORY: enumerate every unit]
    Inv --> Disc[2. DISCOVER: produce one artifact per row]
    Disc --> Verify[3. VERIFY: validator confirms 100% coverage]
    Verify --> Check{Coverage = 100%?}
    Check -->|yes| Done([Loop closed])
    Check -->|no| Gap[4. GAP: re-discover ONLY uncovered rows]
    Gap --> Iter{Iterations >= 3?}
    Iter -->|no| Verify
    Iter -->|yes| Escalate[5. ESCALATE: waiver / lower bar / specialist / manual]
```

Replaces confidence-score self-evaluation with coverage-percentage facts.

- `/sdlc onboard --deep` — inventory is `docs/onboard/INVENTORY.md`. Validator: `validate-phase-gate.sh onboard-deep`.
- `/security --deep` — inventory is the OWASP tracker + semgrep rule-file coverage + 9 attack-chain patterns. Validator: `validate-phase-gate.sh security-deep`.

Three sub-skills trigger the individual onboard-deep steps: `/onboard-inventory` (D1), `/onboard-verify` (D3), `/onboard-gap-fill` (D4).

## Mode 3: Feature Addition

```mermaid
flowchart TD
    Start([User: /sdlc feature 'add payment processing']) --> DI[Feature Discovery Interview - 7 questions]
    DI --> Step1[Step 1: Impact Analysis - SDLC lead inline]
    Step1 --> Impact[Write docs/FEATURE_IMPACT.md]
    Impact --> Step2[Step 2: Design]
    Step2 --> Specialist[HANDOFF: db-architect / api-designer / ux-engineer per impact]
    Specialist --> UC[SDLC lead appends use cases to docs/testing/USE_CASES.md]
    UC --> AcceptanceTest[HANDOFF test-engineer: write acceptance test FIRST]
    AcceptanceTest --> Failing[Test FAILS - feature not built yet]
    Failing --> Step3[Step 3: Implement]
    Step3 --> Build[Developer builds feature]
    Build --> Passing[Test now PASSES]
    Passing --> Step4[Step 4: Review]
    Step4 --> P0Gate[Gate: feature test + all P0 tests pass]
    P0Gate --> Reviews[HANDOFF code-reviewer + security-auditor if sensitive]
    Reviews --> Step5[Step 5: PR + Merge]
    Step5 --> Merge[task git-expert: PR -> review -> merge]
```

## Mode 4: Improve

```mermaid
flowchart TD
    Start([User: /sdlc improve 'ux']) --> DI[Improvement Discovery Interview]
    DI --> Step1[Step 1: Context Check - read AGENTS.md + docs + recent git]
    Step1 --> Step15[Step 1.5: Discovery Audit on running app]
    Step15 --> Pre[PRODUCE docs/audits/discovery-pre-improve.md]
    Pre --> Step2[Step 2: Targeted Audits]
    Step2 --> Fan{Audit focus}
    Fan -->|UX| UX[HANDOFF ux-engineer]
    Fan -->|quality| CR[HANDOFF code-reviewer]
    Fan -->|perf| Perf[HANDOFF performance-engineer]
    Fan -->|security| Sec[HANDOFF security-auditor]
    UX --> Step3
    CR --> Step3
    Perf --> Step3
    Sec --> Step3[Step 3: Consolidate + Plan]
    Step3 --> Plan[SDLC lead writes IMPROVEMENT_PLAN.md with regression-test column]
    Plan --> Step4[Step 4: Implement Fixes]
    Step4 --> PerFix[Per fix: implement -> regression test -> verify]
    PerFix --> Step5[Step 5: Verify]
    Step5 --> Rerun[Re-run discovery audit]
    Rerun --> Compare[Compare before/after findings]
    Compare --> AllP0[All P0 tests still pass - no regressions]
    AllP0 --> Step6[Step 6: PR + Merge]
    Step6 --> Done[task git-expert: PR with before/after metrics]
```
