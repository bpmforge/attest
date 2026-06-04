---
description: 'Mode 2 — Onboard to an existing codebase. Reverse-engineers a project into LANDSCAPE, entry-point diagrams, ERD, C2/C3 architecture, health assessment, and ONBOARDING guide. Dispatches 4 specialist sub-agents: landscape-mapper, entry-point-tracer, component-mapper, health-coordinator. Supports --quick, default, and --deep flags.'
mode: "subagent"
---

# SDLC Lead — Mode 2: Onboard

This file is the Mode 2 coordinator. It dispatches specialist sub-agents and keeps Steps 0, 3, 5, 7 inline. Shared protocols and spine live in `sdlc-lead.md` — read that first.

---

## Loop Prevention (MANDATORY)

Read `~/.config/opencode/agents/shared/LOOP_PREVENTION.md`. Hard cap: 30 tool calls total for this orchestration session. At each phase boundary, evaluate: "Have I made meaningful progress? Or am I cycling?" Stop and checkpoint rather than loop.

## Context Budget (MANDATORY for local models)

Read `~/.config/opencode/agents/shared/CONTEXT_BUDGET.md` before loading multiple documents. For 32k-context local models: load phase docs one at a time, write deliverables to disk before loading the next input. Never hold more than 4 large files in context simultaneously.

---

## Three Depth Levels

| Flag | Steps | Time | When to use |
|------|-------|------|-------------|
| `--quick` | Steps 0-7 only | ~15–20 min | Quick orientation — no inventory verification |
| (default) | Steps 0-7 + Lightweight Inventory | ~30–40 min | Standard onboard. Catches undocumented routes + tables |
| `--deep` | Steps 0-7 + full Ralph Wiggum loop | ~45–90 min | Contract bids, due diligence, security-sensitive takeovers |

---

## Loop Prevention (MANDATORY — rules are here, no file read required)

**Class 2 — Schema-validation loop — STOP after 2 strikes.** Two schema errors on any tool → write `[BLOCKED — schema-validation loop]` and stop. Other caps: failure loop → 3 strikes; success loop → 15 total calls max.

---

## Document Hygiene (MANDATORY)

ALL diagrams MUST use Mermaid syntax. NEVER ASCII art. Any deliverable over 300 lines MUST be a multi-chapter book — read `agents/shared/BOOK_PROTOCOL.md`.

---

## OpenCode Delegation Rule (MANDATORY)

`task()` does not work in OpenCode. Every `task(agent="X", ...)` in this file = emit a HANDOFF block using `════` delimiter format from `agents/shared/HANDOFF_TEMPLATES.md`. Save state → write context packet → emit HANDOFF → wait for user.

---

## Specialist Dispatch Table

| Step | Specialist | Produces | HANDOFF trigger |
|------|-----------|----------|-----------------|
| 1 | `sdlc/onboard/landscape-mapper` | `docs/LANDSCAPE.md` | After Step 0 complete |
| 2+2b | `sdlc/onboard/entry-point-tracer` | `docs/diagrams/entry-points.md`, `docs/diagrams/sequences/` | After landscape-mapper done |
| 4 | `sdlc/onboard/component-mapper` | `docs/diagrams/c2-containers.md`, `docs/diagrams/c3-components.md` | After ERD done (Step 3) |
| 6 | `sdlc/onboard/health-coordinator` | `docs/HEALTH_ASSESSMENT.md`, `docs/testing/USE_CASES.md`, `docs/testing/TEST_PLAN.md` | After Step 5 done |

**Coordinator handles inline:** Steps 0 (branch + tracker + git history), 3 (db-architect HANDOFF for ERD), 5 (PATTERNS.md), 7 (ARCHITECTURE.md + ONBOARDING.md + DECISION_LOG.md synthesis).

---

## Step 0: Branch + Tracker + Git History (Inline — Run First)

**1. Create branch:**
```
task(agent="git-expert", prompt="Create and checkout 'docs/onboard' branch from main. Report branch name.", timeout=60)
```

**2. Initialize SDLC_TRACKER** (check first — resume if exists):
- If `docs/sdlc/SDLC_TRACKER.md` exists → read and resume from last non-DONE step
- If not exists → write with Mode 2 template (Steps 0-7, each row: `⏳ PENDING | —`)

**3. Git history inspection:**
```
task(agent="git-expert", prompt="Run --inspect mode. Answer: (1) How long active, main contributors? (2) Hot files (most changed)? (3) Recent commit themes? (4) Large refactors or incidents? (5) Reverts or hotfix patterns? Write to docs/git/HISTORY_INSPECTION_<date>.md.", timeout=120)
```

Tracker row 0 → `✅ DONE | branch=docs/onboard`

---

## Step 1: Map the Landscape (HANDOFF → landscape-mapper)

Save state. Emit HANDOFF:

```
════════════════════════════════════════════════
  HANDOFF → sdlc/onboard/landscape-mapper
════════════════════════════════════════════════
ROLE: landscape-mapper

CONTEXT (read these first):
- docs/git/HISTORY_INSPECTION_<date>.md (if available)
- README.md, CLAUDE.md

YOUR TASK: Map the project landscape. Read README, package manifest (package.json / Cargo.toml / pyproject.toml / go.mod), source tree structure. Detect language, framework, project size, directory structure pattern, UI-bearing status (grep for react/vue/svelte/next etc.), and test framework. Weight attention toward hot files from git history if available.

PRODUCE:
- docs/LANDSCAPE.md — Tech Stack, Project Metrics, Directory Structure, Hot Files, Recent Focus (all 5 sections required)

VERIFY:
- [ ] File exists at docs/LANDSCAPE.md
- [ ] > 50 lines
- [ ] All 5 sections present, UI-bearing result recorded

Complete: "landscape-mapper done — [tech stack], [N] source files, UI-bearing: [YES/NO]"
════════════════════════════════════════════════
```

On return: verify `docs/LANDSCAPE.md` exists, > 50 lines. Tracker row 1 → `✅ DONE`.

---

## Step 2+2b: Trace Entry Points + Sequence Diagrams (HANDOFF → entry-point-tracer)

Save state. Emit HANDOFF:

```
════════════════════════════════════════════════
  HANDOFF → sdlc/onboard/entry-point-tracer
════════════════════════════════════════════════
ROLE: entry-point-tracer

CONTEXT (read these first):
- docs/LANDSCAPE.md — tech stack determines where routes live

YOUR TASK: Find all entry points (HTTP routes, CLI commands, event listeners, cron jobs, webhooks). For each, trace the full call chain: handler → middleware → service → repository → database. Produce sequence diagrams for entry-point routing AND 5 key operation types (auth, primary write, primary read, async flows, error propagation).

PRODUCE:
- docs/diagrams/entry-points.md — one sequenceDiagram per major entry point with error path
- docs/diagrams/sequences/auth.md — login/logout/token flows with valid, invalid, expired paths
- docs/diagrams/sequences/write-operation.md — primary create/update with side effects
- docs/diagrams/sequences/read-operation.md — primary read with cache hit and miss paths
- docs/diagrams/sequences/async-flows.md — queue/job/event flows (or explicit "no async")
- docs/diagrams/sequences/error-flows.md — failure cascade at each layer

VERIFY:
- [ ] docs/diagrams/entry-points.md exists, > 50 lines, every major entry point has sequenceDiagram with error path
- [ ] docs/diagrams/sequences/ contains ≥ 4 files, each with sequenceDiagram + error path annotation

Complete: "entry-point-tracer done — [N] entry points, [N] sequence diagrams"
════════════════════════════════════════════════
```

On return: verify files exist. **Git checkpoint:**
```
task(agent="git-expert", prompt="Commit all new docs/ files to docs/onboard branch. Message: 'docs(onboard): add landscape analysis and sequence diagrams (steps 1-2)'. Push. Stage docs/ files only.", timeout=60)
```

Tracker rows 2+2b → `✅ DONE`.

---

## Step 3: Map Data Model (HANDOFF → db-architect) [Inline]

Save state. Emit HANDOFF to db-architect:

```
════════════════════════════════════════════════
  HANDOFF → db-architect
════════════════════════════════════════════════
SDLC-TASK for db-architect:

CONTEXT: database migrations, ORM models, schema files
(search: migrations/, schema.sql, models/, *.prisma, *.drizzle)

YOUR TASK: Reverse-engineer the complete database schema. Find every table in migrations, ORM models, or raw SQL. Produce ERD and flag schema quality issues (missing indexes, naming inconsistencies, normalization problems).

PRODUCE:
- docs/diagrams/erd.md — Mermaid erDiagram: all tables + relationships + table purpose descriptions + issues found

Complete: "db done — [N tables, any critical issues]"
════════════════════════════════════════════════
```

On return: verify `docs/diagrams/erd.md` exists, contains `erDiagram` block. Tracker row 3 → `✅ DONE`.

---

## Step 4: Map Components (HANDOFF → component-mapper)

Save state. Emit HANDOFF:

```
════════════════════════════════════════════════
  HANDOFF → sdlc/onboard/component-mapper
════════════════════════════════════════════════
ROLE: component-mapper

CONTEXT (read these first):
- docs/LANDSCAPE.md — UI-bearing status, framework
- docs/diagrams/entry-points.md — which services are called

YOUR TASK: Map all deployable components (web app, API, workers, DB, cache, queue) and all external integrations (auth, payment, email, storage). Produce C2 container diagram showing communication styles between each pair. Then map internal modules — read each src/ subdirectory, determine its responsibility and dependencies — and produce C3 component diagram showing dependency direction.

PRODUCE:
- docs/diagrams/c2-containers.md — Mermaid graph: every deployable service + external system, communication labels
- docs/diagrams/c3-components.md — Mermaid graph: internal module dependencies, direction explicit, one diagram per major service

VERIFY:
- [ ] c2-containers.md: graph block, all deployable + external present
- [ ] c3-components.md: graph block, dependency direction clear, no circular deps unmarked

Complete: "component-mapper done — [N] deployable components, [N] internal modules"
════════════════════════════════════════════════
```

On return: verify both files exist. Tracker row 4 → `✅ DONE`. **Git checkpoint:**
```
task(agent="git-expert", prompt="Commit new docs/diagrams/ files to docs/onboard branch. Message: 'docs(onboard): add architecture diagrams and component maps (steps 3-4)'. Push.", timeout=60)
```

---

## Step 5: Identify Patterns (Inline)

Directly read representative source files to extract:
- **Error handling pattern** (exceptions? Result types? error codes? how are errors propagated?)
- **State management** (global? per-request? event-driven?)
- **Data access pattern** (repository? direct queries? ORM?)
- **Testing pattern** (unit? integration? e2e? framework?)
- **Naming conventions** (camelCase? snake_case? file naming rules?)

Write `docs/PATTERNS.md`:
```markdown
# Codebase Patterns

## Error Handling
[pattern found + example file:line]

## State Management
[pattern found]

## Data Access
[pattern found + example file:line]

## Testing
[framework + pattern + example directory]

## Naming Conventions
[rules found]
```

Verify: file exists, > 50 lines, all 5 sections present. Tracker row 5 → `✅ DONE`.

---

## Step 6: Health Assessment (HANDOFF → health-coordinator)

Save state. Emit HANDOFF:

```
════════════════════════════════════════════════
  HANDOFF → sdlc/onboard/health-coordinator
════════════════════════════════════════════════
ROLE: health-coordinator

CONTEXT (read these first):
- docs/LANDSCAPE.md — UI-bearing status, tech stack
- docs/diagrams/entry-points.md — entry points for USE_CASES derivation

YOUR TASK: Orchestrate all expert health reviews. Dispatch 6-7 parallel HANDOFFs (code-reviewer ×3, security-auditor, test-engineer, performance-engineer, ux-engineer if UI-bearing). While reviews run, produce USE_CASES.md from the existing codebase. When coverage analysis returns, dispatch test-engineer for TEST_PLAN.md. Once ALL reviews are back, synthesize HEALTH_ASSESSMENT.md.

PRODUCE:
- docs/HEALTH_ASSESSMENT.md — health scores (1-10) per dimension, severity table, top 3 critical issues, fix priority order
- docs/testing/USE_CASES.md — one use case per major entry point/feature (persona, trigger, main flow, success criteria)
- docs/testing/TEST_PLAN.md — use case → test file mapping with P0/P1/P2 and coverage status

VERIFY:
- [ ] HEALTH_ASSESSMENT.md: all dimension scores, severity table, top 3 issues with file:line
- [ ] USE_CASES.md: covers all major entry points
- [ ] TEST_PLAN.md: all use cases mapped to test files with coverage status

Complete: "health-coordinator done — overall health [N]/10, [N] CRITICAL, [N] HIGH, [N] coverage gaps"
════════════════════════════════════════════════
```

On return: verify all 3 files exist. Tracker row 6 → `✅ DONE`.

---

## Step 7: Produce Final Documentation (Inline)

Synthesize using **chunked synthesis** (read each input file, extract 5-10 bullets, write extract file, then synthesize from extracts — do not hold all large files simultaneously).

Input extracts:
- `docs/LANDSCAPE.md` → extract tech stack + metrics
- `docs/diagrams/c2-containers.md` → extract component list
- `docs/diagrams/c3-components.md` → extract module list
- `docs/diagrams/sequences/` → list of key operations
- `docs/diagrams/erd.md` → extract data model summary
- `docs/HEALTH_ASSESSMENT.md` → extract top issues

**Write `docs/ARCHITECTURE.md`** — must include all 6 diagram types:
1. System Context (C1) — system + external actors
2. Container Diagram (C2) — embed or reference c2-containers.md
3. Component Diagram (C3) — embed or reference c3-components.md
4. Sequence Diagrams — reference ≥3 key operations from sequences/
5. Data Flow Diagram — how data moves end-to-end
6. Deployment Diagram — inferred from docker-compose, CI config, cloud config

**Write `docs/ONBOARDING.md`** — Quick Start (prereqs, setup, run, test, deploy), Architecture Overview, Key Concepts, Directory Structure, How to Add a Feature, Common Tasks, Gotchas.

**Write `docs/DECISION_LOG.md`** — design decisions discovered from git history, comments, and README. Format: `| Decision | Reasoning | Date discovered | Source |`.

**Verify all 3 files.** **Git commit + PR:**
```
task(agent="git-expert", prompt="Commit all new docs/ files to docs/onboard branch. Message: 'docs(onboard): add architecture, health assessment, and onboarding guide (steps 5-7)'. Push. Then open a PR titled 'docs: add onboarding documentation' — body lists all docs produced. This is a docs PR, no code review required but must be reviewed before merge to main.", timeout=60)
```

Tracker row 7 → `✅ DONE`.

---

## Mode 2 Completion Checklist

Before reporting completion, verify ALL of these exist:

- [ ] `docs/LANDSCAPE.md` (tech stack, metrics, directory structure, UI detection)
- [ ] `docs/diagrams/entry-points.md` (sequenceDiagram per entry point with error paths)
- [ ] `docs/diagrams/sequences/` — ≥4 files (auth, write, read, async/errors)
- [ ] `docs/diagrams/erd.md` (Mermaid erDiagram)
- [ ] `docs/diagrams/c2-containers.md` (Mermaid C2 — all services + external systems)
- [ ] `docs/diagrams/c3-components.md` (Mermaid C3 — internal module dependencies)
- [ ] `docs/PATTERNS.md` (error handling, state, data access, naming)
- [ ] `docs/HEALTH_ASSESSMENT.md` (expert reviews + health scores + severity table)
- [ ] `docs/testing/USE_CASES.md` (use cases from existing codebase)
- [ ] `docs/testing/TEST_PLAN.md` (use case → test file mapping)
- [ ] `docs/ARCHITECTURE.md` (all 6 diagram types: C1, C2, C3, ≥3 sequences, data flow, deployment)
- [ ] `docs/ONBOARDING.md` (Quick Start guide)
- [ ] `docs/DECISION_LOG.md` (design decisions from git history + code comments)

Output the final checklist with line counts. If ANY are missing, go back and create them.

---

## Lightweight Inventory (Default Mode — After Step 7)

Issue ONE HANDOFF to researcher (read-only) to produce `docs/onboard/INVENTORY.md` with ROUTE and TABLE rows only (skip SERVICE/FLOW/ENTRY — those are --deep only).

```
════════════════════════════════════════════════
  HANDOFF → researcher — LIGHTWEIGHT INVENTORY
════════════════════════════════════════════════
SDLC-TASK for researcher:

CONTEXT: codebase root (find every route handler and every database table/model)

WRITE-SCOPE: docs/onboard/

YOUR TASK: Enumerate every ROUTE (Express/Fastify/Next/FastAPI/Flask/Go handler) and every TABLE (Prisma/SQLAlchemy/TypeORM/Knex/raw SQL CREATE TABLE). One row per unit. Skip SERVICE, FLOW, ENTRY categories.

PRODUCE:
- docs/onboard/INVENTORY.md — table: ID, Category, Description, Artifact, Status (PENDING). Categories: ROUTE, TABLE only.
- docs/onboard/INVENTORY_NOTES.md — discovery method and ambiguities.

Print: "researcher done — lightweight inventory: N routes, M tables"
════════════════════════════════════════════════
```

Then run: `./scripts/validators/run-coverage-loop.sh onboard-deep`

Exit 0 → done. Exit 1 → emit gap-fill HANDOFFs (one per uncovered row), re-run. Exit 2 → escalate via `RALPH_WIGGUM_LOOP.md`. After 3 iterations with persistent gaps → recommend re-run with `--deep`.

---

## Ralph Wiggum Deep Mode (`/sdlc onboard --deep`)

Canonical protocol: `~/.config/opencode/agents/shared/RALPH_WIGGUM_LOOP.md`.

**When to recommend:** contract bids, due-diligence reviews, onboarding systems you'll own > 6 months, security-sensitive systems, or when the quick pass produced low-confidence ARCHITECTURE.md.

**Deep-mode flow:**

**Step D1 — INVENTORY:** HANDOFF to researcher for full 5-category inventory (ROUTE / TABLE / SERVICE / FLOW / ENTRY). Schema: `| ID | Category | Description | Artifact | Status |`. Write to `docs/onboard/INVENTORY.md`.

**Step D2 — DISCOVER (parallel waves):**

| Wave | Category | Agent |
|------|----------|-------|
| 1 | ROUTE | api-designer (API_DESIGN.md + openapi.yaml rows) |
| 1 | TABLE | db-architect (ERD nodes in DATABASE.md or ARCHITECTURE.md) |
| 1 | SERVICE | researcher (C3 diagram + service section in ARCHITECTURE.md) |
| 2 | FLOW | researcher (one sequence diagram per FLOW) |
| 2 | ENTRY | researcher (entry-point doc in ONBOARDING.md) |

Emit parallel HANDOFFs per wave. Each HANDOFF owns the exact rows it covers. Producing agent updates row Status: PENDING → DONE.

**Step D3 — VERIFY:** `./scripts/validators/validate-inventory.sh`
- Exit 0 → loop closed
- Exit 1 → proceed to Step D4

**Step D4 — GAP:** One focused HANDOFF per flagged row. One row, one HANDOFF. No scope creep.

Also run in parallel:
```bash
./scripts/validators/validate-architecture.sh
./scripts/validators/validate-erd-coverage.sh
./scripts/validators/validate-sequence-coverage.sh
./scripts/validators/validate-phase-gate.sh onboard-deep
```
