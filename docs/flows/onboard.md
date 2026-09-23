# Onboarding Flow — `/sdlc onboard`

_Mode 2: reverse-engineer an existing codebase into architecture, diagrams, a health assessment and an onboarding guide._

Source of truth: `agents/sdlc-onboard-mode.md` (coordinator), `agents/sdlc/onboard/*.md` (specialists), `commands/sdlc-onboard.md`.

## Depth levels

| Flag | Runs | Time | Use when |
|------|------|------|----------|
| `--quick` | Steps 0–7 | ~15–20 min | Exploratory orientation — no inventory verification |
| (default) | Steps 0–7 + lightweight inventory (ROUTE, TABLE) | ~30–40 min | Standard onboard; catches undocumented routes and tables |
| `--deep` | Steps 0–7 + full Ralph Wiggum loop (ROUTE, TABLE, SERVICE, FLOW, ENTRY) | ~45–90 min | Contract bids, due diligence, security-sensitive takeovers |

## Overall flow

```mermaid
flowchart TD
    Start(["/sdlc onboard [--quick or --deep]"]) --> S0["Step 0 - inline: docs/onboard branch, SDLC_TRACKER, git history, code index"]
    S0 --> S1["Step 1 - landscape-mapper: LANDSCAPE.md"]
    S1 --> S2["Step 2+2b - entry-point-tracer: entry-points.md + sequences/"]
    S2 --> S3["Step 3 - db-architect: diagrams/erd.md"]
    S3 --> S4["Step 4 - component-mapper: c2-containers.md + c3-components.md"]
    S4 --> S5["Step 5 - inline: PATTERNS.md"]
    S5 --> S6["Step 6 - health-coordinator: HEALTH_ASSESSMENT + USE_CASES + TEST_PLAN"]
    S6 --> S6b{"Step 6b - challenger on LANDSCAPE and HEALTH_ASSESSMENT"}
    S6b -->|CONTRADICTED| Fix[Revise the claim at its source, re-challenge]
    Fix --> S6b
    S6b -->|zero CONTRADICTED| S7["Step 7 - inline: ARCHITECTURE.md + ONBOARDING.md + DECISION_LOG.md"]
    S7 --> Depth{Depth flag}
    Depth -->|--quick| Done([Onboard complete])
    Depth -->|default| Light[Lightweight inventory loop]
    Depth -->|--deep| Deep[Ralph Wiggum deep loop]
    Light --> Done
    Deep --> Done
```

Every specialist step is a HANDOFF (see [protocols.md](protocols.md)). After each return the coordinator checks the file exists with real content and flips the tracker row to `DONE`. If `docs/sdlc/SDLC_TRACKER.md` already exists, the run resumes from the first row that isn't `DONE`.

## Step-by-step detail

| Step | Who | Reads | Produces |
|------|-----|-------|----------|
| 0 | Coordinator + `git-expert --inspect` | git log, repo | branch `docs/onboard`, `docs/sdlc/SDLC_TRACKER.md`, `docs/git/HISTORY_INSPECTION_<date>.md`, `code_index()` if the code-search MCP is present |
| 1 | `landscape-mapper` | history inspection, README, CLAUDE.md | `docs/LANDSCAPE.md` (stack, metrics, structure, hot files, recent focus, UI detection) |
| 2+2b | `entry-point-tracer` | LANDSCAPE.md | `docs/diagrams/entry-points.md`, `docs/diagrams/sequences/{auth,write-operation,read-operation,async-flows,error-flows}.md` |
| 3 | `db-architect` (`/dba`) | schemas, models, migrations | `docs/diagrams/erd.md` (Mermaid `erDiagram`) |
| 4 | `component-mapper` | LANDSCAPE.md, entry-points.md | `docs/diagrams/c2-containers.md`, `docs/diagrams/c3-components.md` |
| 5 | Coordinator | source | `docs/PATTERNS.md` (error handling, state, data access, testing, naming) |
| 6 | `health-coordinator` | LANDSCAPE.md, entry-points.md | `docs/HEALTH_ASSESSMENT.md`, `docs/testing/USE_CASES.md`, `docs/testing/TEST_PLAN.md` |
| 6b | `challenger` ×2 | LANDSCAPE.md, HEALTH_ASSESSMENT.md | `docs/reviews/CHALLENGE_REPORT_{landscape,health}_<date>.md` |
| 7 | Coordinator | everything above | `docs/ARCHITECTURE.md` (C1, C2, C3, ≥3 sequences, data flow, deployment), `docs/ONBOARDING.md`, `docs/DECISION_LOG.md` |

## Step 6 — health assessment fan-out

`health-coordinator` is itself an orchestrator. Running it inline does **not** mean doing its reviews inline — each review is still a HANDOFF to the owning expert.

```mermaid
flowchart TD
    HC[health-coordinator] --> CR1["code-reviewer: CODE_REVIEW_date.md"]
    HC --> CR2["code-reviewer: TECH_DEBT_date.md"]
    HC --> CR3["code-reviewer: PATTERNS_date.md"]
    HC --> SEC["security-auditor: SECURITY_SCAN_date.md"]
    HC --> TE["test-engineer: COVERAGE_date.md"]
    HC --> PERF["performance-engineer: PERF_SCAN_date.md"]
    HC --> UXQ{UI-bearing?}
    UXQ -->|yes| UX["ux-engineer: UX_AUDIT_date.md"]
    UXQ -->|no| Skip[SKIPPED]
    HC --> UC[Writes USE_CASES.md while reviews run]
    UC --> TP["test-engineer: TEST_PLAN.md"]
    CR1 --> Synth[Synthesize HEALTH_ASSESSMENT.md]
    CR2 --> Synth
    CR3 --> Synth
    SEC --> Synth
    TE --> Synth
    PERF --> Synth
    UX --> Synth
    Skip --> Synth
    TP --> Synth
```

All review outputs land in `docs/reviews/`. HEALTH_ASSESSMENT.md carries a 1–10 score per dimension, a severity table, the top 3 issues with file:line, and a fix priority order.

## Lightweight inventory (default mode)

```mermaid
flowchart TD
    Start[After Step 7] --> Inv["researcher: docs/onboard/INVENTORY.md - ROUTE and TABLE rows only"]
    Inv --> Gate["run-coverage-loop.sh onboard-deep"]
    Gate --> Exit{Exit code}
    Exit -->|0| Done([Done])
    Exit -->|1 gaps| GapFill[One gap-fill HANDOFF per uncovered row]
    GapFill --> Iter{3 iterations reached?}
    Iter -->|no| Gate
    Iter -->|yes| Rec[Escalate and recommend re-running with --deep]
    Exit -->|2 escalate| Esc[Escalate per RALPH_WIGGUM_LOOP.md]
```

## Deep mode — Ralph Wiggum loop

```mermaid
flowchart TD
    D1["D1 INVENTORY - researcher: all 5 categories in INVENTORY.md"] --> W1
    subgraph W1 [D2 DISCOVER - wave 1, parallel]
        R[ROUTE rows - api-designer]
        T[TABLE rows - db-architect]
        S[SERVICE rows - researcher]
    end
    W1 --> W2
    subgraph W2 [D2 DISCOVER - wave 2, parallel]
        F[FLOW rows - researcher, one sequence each]
        E[ENTRY rows - researcher]
    end
    W2 --> D3["D3 VERIFY - run-coverage-loop.sh onboard-deep"]
    D3 --> OK{All rows covered?}
    OK -->|yes| Closed([Loop closed])
    OK -->|no| D4[D4 GAP - one HANDOFF per uncovered row]
    D4 --> Cap{3 iterations?}
    Cap -->|no| D3
    Cap -->|yes| Esc[Escalate: waiver, lower bar, specialist, or manual]
```

The `onboard-deep` gate chains `validate-inventory.sh`, `validate-architecture.sh`, `validate-erd-coverage.sh`, `validate-sequence-coverage.sh`, `validate-no-ascii-art.sh`, `validate-mermaid.sh` and `validate-doc-render-health.sh`. Always call it through `run-coverage-loop.sh`: that wrapper counts iterations and enforces the cap, while the bare gate does not.

Sub-skills run individual deep steps: `/onboard-inventory` (D1), `/onboard-verify` (D3), `/onboard-gap-fill` (D4).

## Known gaps (as of 2026-09-23)

These are behavior mismatches in the agents and validators, recorded here and not yet fixed:

1. **Default mode can't close on most repos.** The lightweight inventory writes only ROUTE and TABLE rows. The gate it runs, `validate-inventory.sh`, re-derives SERVICE rows from the top-level `src/` subdirectories (and similar source roots) and reports `inventory-missing-service` for each one it doesn't find. On any project with source subdirectories, default mode spends its 3 iterations and then recommends `--deep`.
2. **Onboard sequence diagrams aren't counted by the gate.** Step 2b writes `docs/diagrams/sequences/*.md`. `validate-sequence-coverage.sh` only accepts `docs/sequences/<UC-id>*.md`, or a UC-headed `sequenceDiagram` in ARCHITECTURE.md. Step 7 has to embed the sequences in ARCHITECTURE.md under UC-id headings for them to count.
3. **The three parallel code-reviewer HANDOFFs share one file.** In Step 6, health-coordinator writes HANDOFFs 1–3 to the same `docs/work/HANDOFF_code-reviewer.md`. When they're dispatched in parallel through a paste-based executor, each write overwrites the one before it.
