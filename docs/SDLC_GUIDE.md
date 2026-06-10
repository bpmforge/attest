# SDLC Workflow Guide

The SDLC workflow provides structured project management through four operating modes, each producing specific engineering artifacts. All work follows strict git branching discipline — `main` is always production-ready.

## Quick Start

```
/sdlc init myproject "A web API for managing inventory"
/sdlc onboard
/sdlc feature "OAuth refresh token support"
/sdlc improve
/sdlc improve "ux"
```

## Four Operating Modes

| Command | Mode | When to use |
|---------|------|-------------|
| `/guide` | **Concierge** | Not sure which command — describe the goal in plain English |
| `/sdlc init <name> "<desc>"` | New Project | Starting from scratch |
| `/sdlc init <name> "<desc>" --game` | New Game | Game projects (GDD, vertical-slice gate, game-dev cluster) |
| `/sdlc onboard` | Understand Codebase | First time in an unfamiliar repo |
| `/sdlc feature "<description>"` | Add Feature | Adding to a working system |
| `/sdlc improve ["<focus>"]` | Audit & Improve | Improving an existing system |

---

## Git Branching Model (All Modes)

`main` is production. **Nothing goes directly to `main`.** Every mode creates a typed branch first and ends with a PR:

| Mode | Branch | Merges when |
|------|--------|-------------|
| `init` phases 0–3.5 | `sdlc/setup` | Phase 3.5 gate passes → PR |
| `init` phase 4 features | `feat/[slug]` | All reviews pass → squash merge |
| `onboard` | `docs/onboard` | Onboarding complete → PR |
| `feature` | `feat/[slug]` | All reviews pass → squash merge |
| `improve` | `improve/[slug]` | All items verified → PR |
| `hotfix/*` | `hotfix/[slug]` | P0 fix merged; forward-merge to active branches |

**Draft PRs:** open a draft PR on the first push. Mark ready only when the runtime gate passes.

**Merge gate requires:** CI pipeline green AND every RUNTIME_*.md with PASS verdict.

**Hotfix branches:** cut from the latest semver tag (not `main`). After merge, increment the PATCH version, create a signed tag, and forward-merge to every active `feat/*` and `sdlc/*` branch to keep them current. Triggers a PATCH release.

**Git checkpoints:** commit after every document step (not just at phase end). Every artifact produced = one commit on the working branch.

Branch protection on `main` is configured automatically during `/sdlc init` — no direct pushes, require PR review, require CI.

---

## Mode 1: New Project (`/sdlc init`)

Phases 0–5, discovery-driven from a blank repo.

### Phase 0: Ideation — WHY are we building this?

**Deliverables:**
- `docs/VISION.md` — Problem, target users, success metrics
- `docs/COMPETITIVE_ANALYSIS.md` — What exists, gaps, differentiation

**Gate:** File existence only.

**Exit criteria:** Clear problem statement, target users identified, competitive gap defined.

---

### Phase 1: Planning — WHAT are we building?

**Deliverables:**
- `docs/SCOPE.md` — In scope, out of scope, MVP boundary
- `docs/RISKS.md` — Technical, business, timeline risks + mitigations
- `docs/CONSTRAINTS.md` — Budget, timeline, team, tech constraints
- `docs/USER_PERSONAS.md` — Who uses this, goals, pain points

**Gate:** File existence.

**Exit criteria:** Clear boundaries, risks identified with mitigations, all 4 docs present.

---

### Phase 2: Requirements — HOW should it behave?

**Deliverables:**
- `docs/SRS.md` — Functional & non-functional requirements (IEEE 830 format)
- `docs/USER_STORIES.md` — Stories with Given/When/Then acceptance criteria
- `docs/USE_CASES.md` — UC-NNN entries with actors, preconditions, acceptance criteria
- `docs/REQUIREMENTS_MATRIX.md` — FR-NNN rows with UC link, test column, status

**Gate validators:** `validate-use-cases.sh`, `validate-user-stories.sh`, `validate-requirements-matrix.sh`

**Exit criteria:** Every FR has acceptance criteria, every NFR has a measurable metric, every UC has acceptance criteria. REQUIREMENTS_MATRIX.md test column populated.

**Human Approval Gate A fires here.** Irreversible design decisions begin in Phase 3. User must explicitly approve before Phase 3 starts.

---

### Phase 3: Design — HOW do we build it?

**Deliverables:**
- `docs/ARCHITECTURE.md` — C4 diagrams, ADRs, service boundaries (orchestrator synthesis)
- `docs/PARALLELIZATION_MAP.md` — Module inventory + Phase 4 wave plan (orchestrator synthesis)
- `docs/TECH_STACK.md` — Language, frameworks, libraries + justification
- `docs/DATABASE.md` — ERD, schema DDL, indexes, migrations
- `docs/API_DESIGN.md` — Endpoint contracts, RBAC, examples
- `docs/api/openapi.yaml` — Machine-readable OpenAPI 3.0 spec
- `docs/THREAT_MODEL.md` — STRIDE threats + mitigations
- `docs/design/` — UX spec, style guide, design principles (if UI-bearing)

**Delegate to:**
- `/dba` — Database schema from requirements
- `/api-design` — API contracts from user stories
- `/security` — Threat model from architecture
- `/ux --design` — Component architecture (if UI-bearing)

**Modular-parallel architecture (mandatory):** every module must be independently buildable — owns its directory tree (`src/<module>/`), exposes a frozen contract (OpenAPI path group, gRPC service, event schema, or public interface file), has zero direct imports from another module's internals, and is listed in `PARALLELIZATION_MAP.md` with explicit dependencies. Shared code (`src/shared/`) is built in its own wave, never concurrently.

**Contract-first ordering:** API contracts + event schemas are frozen at the end of Phase 3 before any Phase 4 implementation starts.

**Gate validators:** `validate-module-design.sh`, `validate-infrastructure.sh`, `validate-architecture.sh`, `validate-api-coverage.sh`, `validate-sequence-coverage.sh`, `validate-erd-coverage.sh`, `validate-no-ascii-art.sh`, `validate-c3-coverage.sh`, `validate-entry-points.sh`, `validate-tech-stack.sh`, `validate-adrs.sh`, `validate-security-controls.sh`, `validate-ux-spec.sh` (UI-bearing only)

**Exit criteria:** All components documented, data flows diagrammed, modular structure defined, `PARALLELIZATION_MAP.md` Module Inventory populated for every module in ARCHITECTURE.md § Implementation View.

---

### Phase 3.5: Test Design — WHAT does passing look like?

Sits between Design and Implementation. Produces the test infrastructure that Phase 4 will fill in.

**Deliverables:**
- `docs/TEST_DESIGN.md` — Five sections:
  1. Unit Tests — target files, coverage thresholds, mocking strategy
  2. Integration Tests — service boundaries, contract checks, DB fixtures
  3. E2E Scenarios — UC-NNN → test file mapping, user flows, happy/sad paths
  4. Security Tests — auth flows, injection probes, RBAC coverage
  5. Test Infrastructure — framework choices, shared fixtures, CI matrix
- `e2e/playwright.config.ts` — Playwright configuration
- `e2e/auth.setup.ts` — Authentication setup for authenticated test runs
- `e2e/fixtures.ts` — Shared test fixtures
- `e2e/global-setup.ts` — Global test environment setup
- `.github/workflows/e2e.yml` (or equivalent CI workflow)

**Gate validator:** `validate-test-design.sh` — **non-blocking**. Gaps are escalated to the user but do not hard-block Phase 4. Fix any gaps before Phase 4 if possible; document accepted gaps in a waiver.

**Human Approval Gate B fires here.** Implementation (Phase 4) is irreversible. User must explicitly approve before Phase 4 begins.

**After Phase 3.5 gate passes:** `sdlc/setup` branch is merged to `main` via PR. Phase 4 feature branches cut from updated `main`.

---

### UC-Level Test Traceability Chain

Every functional requirement traces from spec to verified test result:

```
FR-NNN (SRS.md)
  → UC-NNN (USE_CASES.md — actors, preconditions, acceptance criteria)
    → REQUIREMENTS_MATRIX.md (test column + current status)
      → TEST_DESIGN.md (E2E Scenarios section — scenario list for UC-NNN)
        → e2e/use-cases/UC-NNN-*.spec.ts (describe "UC-NNN: <name>")
          → test-results.json (CI output)
            → validate-tests-mapping.sh (UC-level PASS/FAIL verdict per UC)
```

`validate-tests-mapping.sh` reads `test-results.json` and the UC list from REQUIREMENTS_MATRIX.md. It exits non-zero if any UC has no corresponding passing spec, producing a per-UC verdict table in its output.

---

### Phase 4: Implementation — BUILD it

**Execution mode — sdlc-lead asks the user per-wave before emitting HANDOFFs:**

- **Sequential (default)** — modules built one agent at a time, verify each before the next. Safer, easier to recover from failure.
- **Parallel (opt-in per wave) — three rounds per wave: code → review → runtime.** Round 1 emits N `coding-agent` HANDOFFs (one per module) in a single message. Round 2 emits N `code-reviewer` HANDOFFs producing `docs/reviews/CODE_REVIEW_<module>_<date>.md`. Round 3 emits N runtime-validation HANDOFFs producing `docs/reviews/RUNTIME_<module>_<date>.md`. Every module must be green in all three rounds before Wave N+1 starts. A Round 3 FAIL blocks only the failing module; peers keep their PASS verdicts.

Write-scope isolation is enforced in every parallel-wave HANDOFF: each agent's assigned module directory is exclusive; cross-module changes must be flagged as deferred, not edited. `src/shared/` writes always run in their own wave, never concurrently.

**Delegate to:**
- `/code` — Implementation from design docs (coding-agent: doc-driven, API-verified, anti-slop enforced, write-scope isolated)
- `/dba` — Database migrations
- `/containers` — Container setup
- `/devops` — CI/CD pipeline
- `/security` — Security audit during development
- `/review-code` — Code quality review

**Tech stack constraint:** `docs/TECH_STACK.md` defines allowed libraries and frameworks. The coding-agent enforces this — it flags any deviation rather than silently introducing new technology.

**Gate validators:** `validate-build.sh`, `validate-lint.sh`, `validate-tests.sh`, `validate-tests-mapping.sh`, `validate-e2e-setup.sh`, `validate-migrations.sh`, `validate-iac.sh`, `validate-module-boundaries.sh`, `validate-code-health.sh`, `validate-design-system.sh` (UI-bearing only)

**Exit criteria:** All components implemented, tests passing, security audit clean, every wave verified before advancing, all UC-level test mapping rows green.

---

### Phase 5: Review — DID it work?

Structured as five sequential rounds. Each round must complete before the next begins.

**Round 1 — Review fan-out (parallel)**

Emit all review HANDOFFs in a single message. Each reviewer produces findings only — no self-fixes.

| Reviewer | Always? | Condition |
|----------|---------|-----------|
| `/review-code` | Yes | — |
| `/security` | Yes | — |
| `/perf` | Yes | — |
| `/ux` | If UI-bearing | Project has a UI layer |

**Round 2 — Fix-Verify loop (up to 3 iterations)**

sdlc-lead synthesizes all Round 1 findings into `FIX_BACKLOG_RELEASE_<date>.md`. Each iteration: remediation HANDOFF (coding-agent) → targeted re-verification HANDOFF. Every CRITICAL/HIGH row must reach PASS or be waived (`WAIVERS_RELEASE_<date>.md`) before Round 3. After 3 failed cycles: escalation prompt (waive / redesign / defer / change specialist).

**Round 3 — Audit fan-out (parallel, non-blocking)**

| Auditor | Output |
|---------|--------|
| `/review-code --debt` | Tech debt register for post-launch backlog |
| `/test-expert` | Coverage analysis |
| `/containers` | Image optimization + CVE scan |

**Round 4 — Release gate (blocking)**

`./scripts/validators/validate-release-readiness.sh` must exit 0. Required conditions:

- Fix-Verify loop closed (FIX_BACKLOG has no open CRITICAL/HIGH rows, or all waivers signed)
- Every Round 1 review verdict is READY / APPROVED / RELEASE-READY
- All RUNTIME_*.md verdicts are PASS
- Test suite P0+P1 green
- No CRITICAL CVE in container images
- CI pipeline green on merge branch

Any blocker stops release and surfaces to the user.

**Round 5 — Release**

`/git-expert --release` — semver bump, changelog entry, signed tag, push to all remotes.

**Gate validators:** `validate-build.sh`, `validate-lint.sh`, `validate-tests.sh`, `validate-deps.sh`, `validate-smoke.sh`, `validate-fix-backlog-closed.sh`, `validate-code-health.sh`, `validate-module-boundaries.sh`, `validate-release-readiness.sh`

**Exit criteria:** Release Gate all green, `validate-release-readiness.sh` exits 0.

---

## Mode 2: Onboard (`/sdlc onboard [--quick | --deep]`)

Understand a codebase you've never seen. Creates `docs/onboard` branch. Produces documentation that makes the next person's onboarding 10x faster. All docs committed via PR to `main`.

**Depth flags:**

| Flag | Scope | Time |
|------|-------|------|
| `--quick` (default) | Single-pass high-level docs | ~15 min |
| `--deep` | Ralph Wiggum inventory loop — every route / table / service / P0 flow / entry point as an inventory row, one artifact per row, iterates until validators exit clean | ~45-90 min |

**Produces (quick mode):**
- `docs/LANDSCAPE.md` — Tech stack, project size, directory structure, UI detection
- `docs/ARCHITECTURE.md` — High-level architecture with C4 diagrams
- `docs/diagrams/entry-points.md` — Sequence diagrams for every route/entry point
- `docs/diagrams/sequence-*.md` — Key operation flows
- `docs/db/SCHEMA.md` — Inferred or documented schema
- `docs/security/THREAT_SURFACE.md` — Attack surface overview
- `docs/ONBOARDING.md` — How to run, test, add features
- `docs/git/HISTORY_INSPECTION_<date>.md` — Git history analysis (hot files, patterns)
- `docs/design/UX_AUDIT.md` — UX audit (if UI-bearing)

**Deep mode additionally produces:**
- `docs/onboard/INVENTORY.md` — Every unit of the codebase as a row (ROUTE / TABLE / SERVICE / FLOW / ENTRY); status tracked per row
- One artifact per inventory row (API_DESIGN row, ERD node, C3 section, sequence diagram, entry-point doc)
- Passing validator: `./scripts/validators/validate-phase-gate.sh onboard-deep` exits 0

**Deep-mode sub-skills:**

| Skill | Step | Purpose |
|-------|------|---------|
| `/onboard-inventory` | D1 | Enumerate units into `docs/onboard/INVENTORY.md` |
| `/onboard-verify`    | D3 | Run all onboard validators, report gaps |
| `/onboard-gap-fill`  | D4 | Emit focused HANDOFFs for uncovered rows only |

Canonical protocol: `agents/shared/RALPH_WIGGUM_LOOP.md` (inventory → discover → verify → gap → repeat, 3-iteration cap).

---

## Mode 3: Add Feature (`/sdlc feature`)

Add a feature to a working system without breaking it. Creates `feat/[slug]` branch. Ends with a runtime-validated PR squash-merged to `main`.

**Steps:**
1. Discovery interview — understand the feature before touching code
2. Impact analysis — what does this touch? what's the blast radius?
3. **Sub-component decomposition** — Atomic (linear flow) or Split? Split features produce `docs/features/<slug>/COMPONENT_DAG.md` with sub-components, dependencies, waves, and frozen contracts. Each sub-component cuts `feat/<slug>/<sub-slug>` from the parent branch and runs the full Mode-3 lifecycle (Steps 4–9) on its own branch.
4. Design — sequence diagram, DB changes, API changes, test plan
5. Implement — branch-first, tests first, code written against design
6. **Parallel review fan-out** — code-review (always) + security (if auth/input/data/crypto) + perf (if NFR-tracked / DB / loops / caching / jobs) + ux (if UI) emit together in ONE message; user opens N concurrent OpenCode sessions; reviewers produce findings only (no self-fixes).
7. **Fix-Verify loop** — sdlc-lead synthesizes `FIX_BACKLOG_<feature>_<date>.md` from every review. CRITICAL/HIGH rows get a remediation HANDOFF (coding-agent) → targeted re-verification HANDOFF → iterate up to 3 times. After 3 failed cycles → escalation prompt (waive / redesign / defer / change specialist).
8. Document — update ARCHITECTURE.md, API docs, UX_SPEC.md
9. **Runtime validation gate (BLOCKING before merge)** — build → lint/typecheck → start → feature smoke → regression smoke. Produces `docs/reviews/RUNTIME_<feature>_<date>.md`. Verdict must be PASS or the merge aborts. In split features, each sub-component produces its own `RUNTIME_<slug>_<sub-slug>_<date>.md`; the parent merges to `main` only when every sub-component is PASS.
10. Merge — `git-expert` verifies RUNTIME = PASS, FIX_BACKLOG closed (or waivers signed), no open CRITICAL/HIGH review verdicts, CI pipeline green, then marks the PR ready and squash-merges. Branch deleted after merge.

---

## Mode 4: Audit & Improve (`/sdlc improve`)

Improve an existing system without adding new features. Improvements are **discovered through audits**, not spec'd upfront.

```
/sdlc improve              # full multi-dimension audit
/sdlc improve "ux"         # UX only
/sdlc improve "performance"
/sdlc improve "security"
/sdlc improve "code-quality"
```

Creates `improve/[slug]` branch. All audit findings and implementation committed there. Ends with a PR to `main`.

### How it works

1. **Discovery interview** — what's driving this? which dimensions matter? what's off-limits?
2. **Audit plan** — sdlc-lead selects specialists based on your answers, confirms with you before running
3. **Targeted audits** — each specialist runs as a HANDOFF, produces a findings report
4. **Improvement backlog** — sdlc-lead synthesizes all findings into a ranked backlog with S/M/L sizing and verification criteria
5. **Prioritization** — you pick which items to execute
6. **Execute** — sized appropriately:
   - **S (Small):** implement directly → verify with targeted specialist re-check
   - **M (Medium):** brief design note → implement → verify
   - **L (Large):** spawns a full Mode 3 sub-workflow

### Specialists available per dimension

| Focus | Specialist | What they find |
|-------|-----------|----------------|
| `ux` | `ux-engineer` | Friction, accessibility gaps, design inconsistencies, confusing flows |
| `code-quality` | `code-reviewer` | Complexity hotspots, duplication, error handling gaps, naming |
| `performance` | `performance-engineer` | N+1 queries, missing caching, O(n²) patterns, payload bloat |
| `security` | `security-auditor` | OWASP top 10, auth gaps, injection, sensitive data exposure |
| `database` | `db-architect` | Missing indexes, normalization issues, schema debt, N+1 in ORM |

All findings include severity (Critical/High/Medium/Low), effort estimate (S/M/L), and a clear "done" definition.

---

## Phase Gate Table

| Phase | Validators | Blocking? |
|-------|-----------|-----------|
| 0 | File existence (VISION.md, COMPETITIVE_ANALYSIS.md) | Yes |
| 1 | File existence (SCOPE.md, RISKS.md, CONSTRAINTS.md, USER_PERSONAS.md) | Yes |
| 2 | `validate-use-cases.sh`, `validate-user-stories.sh`, `validate-requirements-matrix.sh` | Yes |
| **Gate A** | Human approval required before Phase 3 | Hard block |
| 3 | `validate-module-design.sh`, `validate-infrastructure.sh`, `validate-architecture.sh`, `validate-api-coverage.sh`, `validate-sequence-coverage.sh`, `validate-erd-coverage.sh`, `validate-no-ascii-art.sh`, `validate-c3-coverage.sh`, `validate-entry-points.sh`, `validate-tech-stack.sh`, `validate-adrs.sh`, `validate-security-controls.sh`, `validate-ux-spec.sh`* | Yes |
| 3.5 | `validate-test-design.sh` | Non-blocking (gaps escalated) |
| **Gate B** | Human approval required before Phase 4 | Hard block |
| 4 | `validate-build.sh`, `validate-lint.sh`, `validate-tests.sh`, `validate-tests-mapping.sh`, `validate-e2e-setup.sh`, `validate-migrations.sh`, `validate-iac.sh`, `validate-module-boundaries.sh`, `validate-code-health.sh`, `validate-design-system.sh`* | Yes |
| 5 | `validate-build.sh`, `validate-lint.sh`, `validate-tests.sh`, `validate-deps.sh`, `validate-smoke.sh`, `validate-fix-backlog-closed.sh`, `validate-code-health.sh`, `validate-module-boundaries.sh`, `validate-release-readiness.sh` | Yes |

\* UI-bearing projects only.

Orchestrated via `./scripts/validators/validate-phase-gate.sh <phase>` — exit 0 = clean, 1 = gaps, 2 = validator error.

---

## Gate Management

**User-facing wrappers:**

- `/sdlc gate` — SDLC-aware: reads `docs/work/sdlc-state.md` and auto-picks the phase. Use during normal SDLC work.
- `/gate <phase-arg>` — direct: spot-check a specific phase. Same validator, no state lookup.
- `/gate approve` / `/gate bypass` — gate state changes; bypass writes a waiver to `docs/reviews/WAIVERS_<phase>_<date>.md` and only the user signs it.

**Post-HANDOFF gates** — after every specialist HANDOFF, `./scripts/validators/run-handoff-gates.sh` runs three gates in order: scope (git writes confined to assigned directory), manifest (required sections + completion phrase), coverage (domain-specific validator). Any failure returns REVISE to the specialist.

**Confidence gates** — used only for artifacts validators cannot check mechanically (narratives, research summaries):
- Score **< 5** on any dimension → automatic fail, surface the gap
- Score **5–6** → revise that dimension (max 3 passes)
- Score **≥ 7** → pass

If a gate fails, the agent tells you exactly what's missing. Use `/sdlc status` to see current gate state.

**Shared protocols** — every specialist reads these canonical files:
- `agents/shared/SCOPE_BOUNDARY.md` — stay-in-lane rule for direct-mode invocations; per-agent in-scope vs. refer-back table
- `agents/shared/BOUNDED_TASK_CONTRACT.md` — 5 scope rules (write-scope, no extras, verbatim completion, no expansion, stop-means-stop)
- `agents/shared/HANDOFF_TEMPLATES.md` — canonical HANDOFF block templates
- `agents/shared/FIX_VERIFY_LOOP.md` — review → FIX_BACKLOG → remediate → re-verify pipeline
- `agents/shared/RALPH_WIGGUM_LOOP.md` — inventory-driven deep-verification loop
- `agents/shared/LOOP_PREVENTION.md` — tool-selection cheat-sheet + 3 loop classes + BLOCKED template
- `agents/shared/RESEARCH_TOOLS.md` — research-tool surface and fallback chain

---

## Interoperability

Work started in Claude Code continues seamlessly in OpenCode:
- Same document structure (`docs/`)
- Same artifact formats (Mermaid diagrams, IEEE 830 SRS)
- Same expert methodologies
- Same gate criteria

---

## Tips

- **Don't skip phases** — each phase prevents expensive rework later
- **Let experts do expert work** — sdlc-lead delegates, it doesn't design schemas
- **Mermaid diagrams everywhere** — not ASCII art; renderable, version-controllable
- **Modular architecture** — feature-sliced, interface-driven, dependency-injected
- **main is sacred** — work on branches, merge via PRs; the workflow enforces this automatically
- **Draft PR on first push** — don't wait until code is done; open a draft immediately so CI runs early

---

## Project configuration: `.sdlc/sdlc.json`

Operational validators (`validate-build.sh`, `validate-tests.sh`, `validate-lint.sh`, `validate-smoke.sh`, `validate-deps.sh`) auto-detect commands from the project's stack (node / python / rust / go). Override any of them by adding `.sdlc/sdlc.json` at the project root:

```json
{
  "build":     "npm run build",
  "test":      "npm test -- --run",
  "lint":      "biome check .",
  "typecheck": "tsc --noEmit",
  "deps":      "npm audit --audit-level=high --json",
  "smoke": {
    "start":     "npm run dev",
    "wait_url":  "http://localhost:3000/api/health",
    "wait_secs": 30,
    "routes":    ["/", "/api/health", "/api/version"]
  }
}
```

**All keys optional.** Missing keys fall back to per-stack defaults:

| Stack | Build | Test | Lint | Typecheck | Deps |
|-------|-------|------|------|-----------|------|
| node | `npm run build` | `npm test` | `npm run lint` | `npx tsc --noEmit` | `npm audit --audit-level=high --json` |
| python | `python -m build` | `pytest` | `ruff check .` | `mypy .` | `pip-audit -f json` |
| rust | `cargo build --release` | `cargo test` | `cargo clippy -- -D warnings` | `cargo check` | `cargo audit --json` |
| go | `go build ./...` | `go test ./...` | `go vet ./...` | `go vet ./...` | `govulncheck ./...` |

**Smoke is opt-in:** if no `smoke` key is present, `validate-smoke.sh` skips clean. Configure it once your project has a HTTP surface.

**Waivers:** `.sdlc/deps-waivers.txt` (one CVE-ID or advisory ID per line) suppresses known-accepted advisories. Lines starting with `#` are comments.

**Graceful skipping:** if a build/lint/typecheck command isn't configured (no matching `npm` script, no `tsconfig.json`, no `eslint` config, etc.), the validator warns and skips — it does NOT fail the gate. Tests are the only command treated as mandatory; every project must have tests by phase 4.
