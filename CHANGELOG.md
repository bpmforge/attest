# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versioning follows [Semantic Versioning](https://semver.org/).

## [1.0.1] — 2026-06-02

### Fixed
- `install.sh`: replaced with correct claude-experts installer (v1.0.0 had accidentally shipped the bpm-opencode-experts version)
- `README.md`: was showing bpm-opencode-experts content; corrected to claude-experts

### Changed
- **`claude-memory` renamed → `bpm-memory-mcp`** — LLM-agnostic naming, matches `bpm-*` convention. Repo: `github.com/bpmforge/bpm-memory-mcp`
- `master` branch renamed to `main`
- `install.sh`: interactive y/n prompts when run with no flags — each optional MCP can be accepted or skipped individually. `--yes` / `-y` for non-interactive use.
- `install.sh`: bpm-memory-mcp and bpm-code-search-mcp now auto-clone + build (previously only printed manual instructions)
- `install.sh`: new flags `--no-memory`, `--no-code-search`, `--no-playwright-mcp`

---

## [1.0.0] — 2026-06-01

v1 micro-agent architecture — coordinator/specialist pattern across all major domains, Challenger quality layer, memory and code-search MCPs, playwright-mcp browser testing, full documentation overhaul.

### Added

**Agents (47 total, +31 from v0.24.0)**

*Security micro-agents (`agents/security/`, 9 new):*
- `owasp-web-checker`, `owasp-llm-checker`, `cloud-security-checker`, `iac-security-checker`, `secrets-scanner`, `dependency-auditor`, `semgrep-runner`, `threat-modeler`, `attack-chainer`
- Methodology docs: `OWASP_METHODOLOGY.md`, `OWASP_LLM_METHODOLOGY.md`, `CLOUD_METHODOLOGY.md`, `IaC_METHODOLOGY.md`, `FINDING_SCHEMA.md`

*Code-review micro-agents (`agents/code-review/`, 7 new):*
- `complexity-analyzer`, `duplication-detector`, `error-handling-auditor`, `type-safety-checker`, `pattern-consistency-checker`, `anti-slop-auditor`, `code-health-synthesizer`

*Performance micro-agents (`agents/performance/`, 6 new):*
- `static-perf-analyzer`, `profiler-agent`, `db-query-analyzer`, `bundle-analyzer`, `concurrency-checker`, `perf-synthesizer`

*SDLC onboard specialists (`agents/sdlc/onboard/`, 4 new):*
- `landscape-mapper`, `entry-point-tracer`, `component-mapper`, `health-coordinator`

*New primary agents:*
- **`challenger`** — adversarial quality layer; FATAL/MAJOR/MINOR/NITPICK challenge grades; rebuttal cycle (DEFENDED/CONCEDED/DEFERRED); automatically gates Phase 2→3 and 3→4
- **`ui-verifier`** — live browser verification via `playwright-mcp`; accessibility-tree primary signal (no vision required); 4 modes: `--smoke`, `--use-cases`, `--flow`, `--regression`; produces `UI_VERIFICATION_REPORT.md`

**Skills (25 total, +1)**
- `/ui-verify` — triggers `ui-verifier` for live browser verification

**Shared protocols (`agents/shared/`, 7 new):**
- `CHALLENGER_PROTOCOL.md` — full challenge/rebuttal specification
- `GATE_SCORING_PROTOCOL.md` — HANDOFF resume scoring (1–10, asymmetric threshold ≥7 pass)
- `PHASE_ROUTING_PROTOCOL.md` — routing table, escape hatches, two-track gate system
- `PARALLEL_WAVE_PROTOCOL.md` (`agents/sdlc/`) — 3-round parallel coding protocol (code → review+fix → runtime)
- `MEMORY_PRIMER.md` — 3-call memory workflow (session_restore → memory_store → session_save)
- `BROWSER_TESTING.md` — playwright-mcp tool reference and patterns for agents
- `SESSION_PRIMER.md` updated — Rule 7 added (memory discipline on session start/end)

**MCPs (3 new):**
- **`bpm-code-search-mcp`** — semantic code search + structural symbol index. 6 tools: `code_index`, `code_search`, `code_symbols`, `code_outline`, `code_references`, `code_index_status`. 10 languages. FTS5 BM25 fallback.
- **`bpm-memory-mcp`** — cross-session project memory. `session_restore` on start, `memory_store` on discovery, `session_save` at gate pass. Flat-file fallback to `docs/work/SESSION_NOTES.md`.
- **`playwright-mcp`** (`@playwright/mcp`) — LLM-agnostic browser automation, no vision required, CI-compatible.

**Docs:**
- `docs/MCP_GUIDE.md` — all 6 MCPs with install commands, tool tables, troubleshooting
- `docs/EXPERT_REVIEW_PROCESS.md` — Phase 2b Challenger chapter
- `docs/FEATURES.md` — full v1 catalog (47 agents, 25 skills, 17 shared protocols, 3 new MCPs)
- `docs/USERGUIDE.md` — browser automation backbone and memory/code-search backbone sections

### Changed

**Coordinators refactored to thin dispatchers:**
- `sdlc-onboard-mode` — 1089→392 lines; 4 steps now HANDOFF to onboard specialists
- `sdlc-lead` — smart routing and gate scoring extracted to shared protocols; memory restore (Step 2b) and `session_save` (inter-phase check-in) added
- `test-engineer` — Playwright infra templates extracted to `agents/test/E2E_INFRASTRUCTURE.md`
- `security-auditor` — coordinator pattern; dispatches 9 micro-agents via HANDOFF
- `code-reviewer` — coordinator pattern; dispatches 7 code-review micro-agents
- `performance-engineer` — coordinator pattern; dispatches 6 performance micro-agents

**install.sh:**
- Step 8: `bpm-memory-mcp` MCP registration (`--no-playwright-search` parity)
- Step 9: `playwright-mcp` registration (`--no-playwright-mcp` flag to skip)
- Micro-agent subdirectory symlinking now covers all clusters: `security/`, `code-review/`, `performance/`, `sdlc/onboard/`, `test/`

### Removed / Archived
- `docs/STRICT_REFACTOR_PLAN.md` → `docs/releases/v0.15.0-strict-refactor-plan.md`
- `.code-search/` added to `.gitignore`

---

## [0.24.0] — 2026-05-07

Full-lifecycle quality enforcement — traceability chain from requirements to passing tests, production Playwright infrastructure, complete git workflow with SDLC branch topology, 27 new validators, Phase 3.5 test design gate, Phase 5 5-round release structure, and git checkpoints at every document-producing step.

### Added

**Agents**
- **`architecture-designer`** — new specialist agent that derives module boundaries from business domains (not technical layers). Enforces hexagonal/FSD/DDD patterns. Produces `MODULE_DESIGN.md` (8 required sections incl. dependency rules, feature recipe, enforcement config) and `INFRASTRUCTURE.md` (topology-only, 5 sections). Validated by `validate-module-design.sh` and `validate-infrastructure.sh`.

**Validators (27 new, 36 total)**

| New validator | Checks |
|---|---|
| `validate-module-design.sh` | MODULE_DESIGN.md: pattern+justification, no technical-layer naming, circular dep detection, enforcement config |
| `validate-infrastructure.sh` | INFRASTRUCTURE.md: env matrix, compute, data, networking+Mermaid, ops concerns; rejects IaC code |
| `validate-security-controls.sh` | SECURITY_CONTROLS.md: every HIGH/CRITICAL threat has a control; DB/API/ARCH have security sections |
| `validate-test-design.sh` | TEST_DESIGN.md: 5 mandatory sections (Unit, Integration, E2E, Security, Test Infrastructure), P0 UCs covered |
| `validate-iac.sh` | IaC scaffolding: entry/variables/outputs/per-env configs, `terraform validate`, no hardcoded secrets |
| `validate-module-boundaries.sh` | Cross-module internal imports in TS/JS/Python/Go; enforces dep rules from MODULE_DESIGN.md |
| `validate-code-health.sh` | 9 anti-slop patterns: catch-all blocks, try-in-loop, what-comments, emoji-comments, >50L functions, >250L files, TODO/FIXME, debug prints, magic numbers |
| `validate-ux-spec.sh` | UX_SPEC.md: component library chosen (not TBD), ≥5 inventory items, P0 UCs covered, WCAG 4 pillars, responsive strategy |
| `validate-design-system.sh` | Token file, component files match UX_SPEC inventory, DESIGN_SYSTEM.md, no hardcoded hex |
| `validate-release-readiness.sh` | 10-condition release gate: FIX_BACKLOG clean, 4 review verdicts, coverage gaps, container CVEs, tech debt catalogued, all RUNTIME PASS |
| `validate-requirements-matrix.sh` | REQUIREMENTS_MATRIX.md: P0 UC rows have Test + Status columns; cross-references USE_CASES.md |
| `validate-e2e-setup.sh` | Playwright config has JSON reporter, retries, screenshot, baseURL; auth fixture; POM/fixtures dir; CI workflow has E2E step |
| `validate-adrs.sh` | Every ADR-NNN reference has a file with valid status |
| `validate-completion-manifest.sh` | HANDOFF manifest schema + completion phrase present |
| `validate-migrations.sh` | Migration files have both up and down; reversible |
| `validate-deps.sh` | npm audit / pip-audit / cargo audit; subtracts waivers |
| `validate-build.sh` | Runs project build, captures exit code |
| `validate-lint.sh` | Runs linter + typecheck |
| `validate-fix-backlog-closed.sh` | CRITICAL/HIGH rows VERIFIED/FIXED/WAIVED before phase-5 |
| `validate-smoke.sh` | Boots server, hits configured routes, asserts 200 |
| `validate-no-ascii-art.sh` | No Unicode box-drawing or ASCII banners in docs |
| `validate-scope.sh` | Post-HANDOFF git-scope enforcement |
| `validate-c3-coverage.sh` | Every source module in C3 component diagram |
| `validate-entry-points.sh` | Every entry point documented |
| `validate-tech-stack.sh` | All deps appear in TECH_STACK.md |
| `validate-use-cases.sh` | UC-IDs, required fields, priority, Source: traceability |
| `validate-user-stories.sh` | Given/When/Then acceptance criteria, traceability to UC/FR |

`validate-tests-mapping.sh` extended: now parses jest/vitest/pytest JSON results files and produces UC-level PASS/FAIL verdict table. `validate-tests.sh` extended: Playwright fast-path with `--reporter=json,html,list` to produce `test-results.json`.

**Shared protocols**
- **`ANTI_SLOP_RULES.md`** — canonical 20-rule AI slop catalog (R-01..R-20) across error handling, abstraction, defensive bloat, comment/style, structural patterns. Used by `code-reviewer` (8th scored dimension, threshold ≥8) and `coding-agent`.

**SDLC phases**
- **Phase 3.5 (Test Design)** — new gate between Design and Implementation. `test-engineer` produces `TEST_DESIGN.md` (5 sections: Unit, Integration, E2E Scenarios, Security, Test Infrastructure) and E2E config files. Non-blocking style (gaps escalate, don't hard-block). Validated by `validate-test-design.sh`.
- **Human Approval Gate A** (Phase 2→3) and **Gate B** (Phase 3.5→4) — explicit user sign-off before irreversible design and implementation work begins.

### Changed

**Code review — 8 dimensions**
- `code-reviewer.md`: anti-slop is now the 8th scored dimension (threshold ≥8, not 7). Progress Summary table, confidence loop table, Health Dashboard mirror, mode descriptions, and verdict rubric all updated to 8 dimensions.
- All HANDOFF prompts across all modes updated from "7-dimension review" to "8-dimension review".

**Phase 5 restructured as 5 rounds**
- Round 1: Reviews fan-out (code, security, perf, UX — always parallel)
- Round 2: Fix-Verify loop (up to 3 iterations with remediation + targeted re-verify)
- Round 3: Audit fan-out (tech-debt + coverage + container — parallel-safe with Round 2)
- Round 4: Release gate via `run-coverage-loop.sh phase-5` (must exit 0)
- Round 5: Release via `git-expert --release`

**Parallel execution — improve-mode**
- `sdlc-improve-mode.md` Step 2: `[S]equential / [P]arallel` audit fan-out selection before specialist HANDOFFs (mirrors Phase 5 Round 1 pattern).

**Git workflow**
- `references/git-workflow-checklist.md`: SDLC Branch Topology section (complete branch map, decision table, merge strategy per type, commit cadence, draft-PR-first rule), Hotfix Flow section (13-step P0/security fix pattern, forward-merge, automatic PATCH release).
- `agents/git-expert.md`: CI pipeline green added as explicit merge gate (alongside RUNTIME_*.md PASS); draft-PR-on-first-push rule; SDLC Branch Awareness quick-reference table.
- Phase 4 Step 8: split into 8a (branch + push + draft PR immediately), 8b (atomic commits after coding-agent), 8c (merge gate after all conditions met).
- `sdlc-feature-mode.md` Step 3.1: create draft PR on first push (not after code is done).

**Git checkpoints everywhere**
- Phase 3: 6 new checkpoints after each specialist gate (MODULE_DESIGN, DATABASE, API+OpenAPI, THREAT_MODEL, SECURITY_CONTROLS, INFRASTRUCTURE). Session crash no longer loses validated design artifacts.
- Phase 5: checkpoints after Round 1 reviews, after each Fix-Verify iteration, after Round 3 audits. Review documents are now tracked in git on the feature branch.
- Improve-mode: checkpoints after each audit, after backlog synthesis, after each item fix+verify.
- Onboard-mode: 2 intermediate checkpoints (steps 1-2, steps 3-4) before the final PR commit.

**UC-level test traceability**
- `validate-requirements-matrix.sh`: new validator checks REQUIREMENTS_MATRIX.md coverage.
- `validate-tests-mapping.sh`: extended with jest/vitest/pytest JSON parsing for per-UC PASS/FAIL verdicts.
- Test-engineer HANDOFF: `describe("UC-NNN: <name>")` and `it("AC-N: <criterion>")` naming convention enforced.

**Playwright E2E infrastructure**
- `test-engineer.md`: full Playwright infrastructure section — `playwright.config.ts` template (JSON reporter, retries, screenshot, storageState auth project), `auth.setup.ts`, Page Object Model base class, `test.extend()` custom fixtures with auto-cleanup, `global-setup.ts` DB reset, GitHub Actions/Gitea CI workflow, sharding, soft assertions, network mocking, Cypress equivalent patterns.
- `validate-e2e-setup.sh`: gates that playwright.config.ts has JSON reporter (required for UC-level verdicts), auth fixture, POM directory, CI E2E step.
- Phase 4 test-strategy HANDOFF: requires E2E infrastructure files as deliverables (not just TEST_STRATEGY.md).
- `validate-test-design.sh`: requires `## Test Infrastructure` section with framework, JSON reporter path, auth strategy.

**Canonical rules — six**
- `BOUNDED_TASK_CONTRACT.md`: "five canonical rules" updated to "six canonical rules" throughout all agent files and HANDOFF_TEMPLATES.md. Rule 6 (Pre-Completion Self-Check) is now properly counted.

### Phase gate changes

| Gate | New validators added |
|------|---------------------|
| phase-2 | `validate-requirements-matrix.sh` |
| phase-3 | `validate-module-design.sh`, `validate-infrastructure.sh`, `validate-security-controls.sh`, `validate-ux-spec.sh` (UI-bearing) |
| phase-3.5 | `validate-test-design.sh` (non-blocking) |
| phase-4 | `validate-iac.sh`, `validate-module-boundaries.sh`, `validate-code-health.sh`, `validate-e2e-setup.sh`, `validate-design-system.sh` (UI-bearing) |
| phase-5 | `validate-code-health.sh`, `validate-module-boundaries.sh`, `validate-release-readiness.sh` |

---

## [0.23.0] — 2026-05-04

Tiered research architecture — researcher now uses a mandatory tool selection gate and a 4-tier fallback chain that starts with fast pullmd-backed tools and escalates to Playwright only when needed. Synced from playwright-search v0.2.0 and claude-experts v0.18.0.

### Changed

- **`agents/researcher.md`** — tool table expanded from 3 to 5 tools with explicit tier labels (1–4). Mandatory **Tool Selection Gate** added: must use `playwright-search_web_search_pullmd` (tier 1) before `playwright-search_web_research_pullmd` (tier 2) before `playwright-search_web_research` (tier 3). Escalation trigger from tier 2 to tier 3 is explicit: < 2 useful sources returned. Fallback chain rewritten to reflect the new order (pullmd SERP first, Playwright on escalation only). Standard and escalation pattern examples updated.

### Tier order (mandatory)

| Tier | Tool | Trigger to escalate |
|------|------|---------------------|
| 1 | `playwright-search_web_search_pullmd` | Always start here |
| 2 | `playwright-search_web_research_pullmd` | When full content needed |
| 3 | `playwright-search_web_research` | Tier 2 returned < 2 useful sources |
| 4 | `playwright-search_web_fetch` | Single known URL |

## [0.22.0] — 2026-05-04

Wave E of the audit remediation — template extraction. Conservative size reduction by extracting two large embedded templates (the ARCHITECTURE.md template from sdlc-init-mode and the OWASP_TRACKER template from security-auditor) into their own files in `agents/templates/`. Mode files reference the templates by path instead of inlining 100+ line markdown blocks.

### Added

- **`agents/templates/ARCHITECTURE_template.md`** (~115 lines) — the canonical ARCHITECTURE.md template with all 6 mandatory diagram types as Mermaid blocks. Was inline in `sdlc-init-mode.md` Phase 3.
- **`agents/templates/OWASP_TRACKER_template.md`** (~332 lines) — the canonical OWASP audit tracker (10 categories + Semgrep Triage Summary + Pass Progress + Attack Chain Analysis + Final Gate). Was inline in `security-auditor.md` initialization.

### Changed

- **`agents/sdlc-init-mode.md`** — 1868 → 1765 lines (~103 lines saved). Phase 3 now references the template via "read `agents/templates/ARCHITECTURE_template.md`" instead of inlining 117 lines of markdown.
- **`agents/security-auditor.md`** — 2227 → 1900 lines (~327 lines saved). Tracker initialization now reads from the template file instead of inlining 332 lines of markdown.
- **`install.sh`** — already copies `agents/` recursively, so `agents/templates/*` lands at `~/.config/opencode/agents/templates/*` automatically. No script change needed.

### Why this matters and what was deferred

The audit's Finding 4 identified that monolithic agent prompts cause attention degradation and exceed local-LLM effective context. Two largest offenders were `sdlc-init-mode.md` (1868) and `security-auditor.md` (2227). Extracting embedded template blocks (which the agent reads, then COPIES into deliverables) is a safe size reduction — the templates aren't behavioral instructions, they're document scaffolds.

**Deferred to a future wave:** full per-phase split of `sdlc-init-mode.md` (Phase 0 / 1 / 2 / 3 / 4 / 5 each in its own file with a thin router). That work requires careful end-to-end testing on a sandbox project and changes to how sdlc-lead loads the right phase based on `docs/work/sdlc-state.md`. The conservative template-extraction approach in this wave delivers ~440 lines of immediate savings without regression risk; the deeper restructure can be tackled separately when a sandbox project is ready for E2E validation.

## [0.21.0] — 2026-05-04

Wave D of the audit remediation — default-onboard Ralph. The default `/sdlc onboard` (no flag) now includes a lightweight inventory pass that catches the two highest-value coverage gaps — undocumented routes and undocumented tables — without going to the full 45–90 min Ralph Wiggum 5-category loop. Three depth levels are now distinct:

| Flag | Inventory categories | Time | Use case |
|------|----------------------|------|----------|
| `--quick` | none (7-step only) | ~10–15 min | Quick exploratory orientation |
| (default) | ROUTE + TABLE | ~25–35 min | Standard onboard — default for most users |
| `--deep` | ROUTE / TABLE / SERVICE / FLOW / ENTRY | ~45–90 min | Contract bid / due diligence / security takeover |

### Changed

- **`agents/sdlc-onboard-mode.md`** — added a "Three depth levels" table at the top, plus a new "Lightweight Inventory" section between the 7-step flow and the existing Ralph Wiggum Deep Mode section. The lightweight section issues ONE HANDOFF to researcher to enumerate ROUTE + TABLE rows only, then runs `run-coverage-loop.sh onboard-deep` (the existing onboard-deep validator chain — SERVICE/FLOW/ENTRY validators warn-skip when no rows of those types exist).
- **`commands/sdlc-onboard.md`** — help text rewritten to document all three flags clearly. Default behavior is now described as the standard onboard (was: alias for `--quick`).

### Why this matters

The audit's Finding 2 noted that Ralph was opt-in only — default `/sdlc onboard` ran 7 steps once with no inventory verification. Users reported that "ralph wiggum and such are always being run" was the desired default. This wave bridges quick (no inventory) and deep (full inventory) with a sensible middle that catches the most common gaps in 25–35 min instead of 45–90.

`--quick` is preserved for users who want the original minimal flow.

## [0.20.0] — 2026-05-04

Wave C of the audit remediation — universal Ralph Wiggum coverage loop. The 3-iteration validator-loop with escalation is no longer reserved for `--deep` modes. Every phase gate in every mode now iterates to coverage, with explicit escalation when 3 iterations don't close the gap list.

### Added

- **`scripts/validators/run-coverage-loop.sh`** — wrapper around `validate-phase-gate.sh` with iteration tracking and escalation. Reads/writes `docs/work/COVERAGE_LOOP_<phase>_<date>.md` (markdown table of iteration → gap count → status). Exit codes:
  - `0` = clean (advance to next phase)
  - `1` = gaps remain, iteration < 3 (orchestrator emits one gap-fill HANDOFF per uncovered row, re-runs)
  - `2` = 3 iterations exhausted (orchestrator emits the escalation block from `RALPH_WIGGUM_LOOP.md`)
- **Two-Track Gate System** documented in `agents/sdlc-lead.md`. Replaces the old "Confidence-based gates" section.
  - **Track 1 (objective)** — coverage loop for any artifact a validator can check. Default for everything except narrative.
  - **Track 2 (subjective)** — confidence 1-10 self-rating for narratives only (VISION, summaries, research reports). Used sparingly; if a validator could be written, write the validator.

### Changed

- **`agents/shared/RALPH_WIGGUM_LOOP.md`** — promoted from "deep-mode-only protocol" to "universal coverage-loop spec." Header now lists every mode that uses the loop (init Phase 3 + 4, onboard default + deep, feature Step 5, improve audit-coverage matrix, security default + deep).
- **`agents/sdlc-init-mode.md`** —
  - Phase 0 gate language clarified to call out Track 2 (narrative confidence loop) for VISION + COMPETITIVE_ANALYSIS.
  - Phase 4 Round 3 gate now calls `run-coverage-loop.sh phase-4` (was: `validate-phase-gate.sh phase-4`). Iteration + escalation handled by the wrapper.

### Why this matters

The audit's Finding 6 sub-issue: "Validators report gaps once; nothing forces re-iteration outside `--deep`." The orchestrator was making subjective "is this good enough?" calls when validators had already returned objective gap lists. The universal loop closes that judgment gap.

Now every mode that has validatable deliverables iterates until clean OR escalates after 3 tries. The escalation block forces a deliberate user choice (waive / lower bar / change specialist / fill manually) instead of letting work drift to "DONE" with gaps still open.

## [0.19.0] — 2026-05-04

Wave B+ of the audit remediation — completeness gates. Nine new validators close the missing coverage dimensions identified in the audit. Every "all X are documented" check is now enforceable by script.

### Added

- **`scripts/validators/validate-c3-coverage.sh`** — every top-level `src/` (or `app/`, `server/`, `internal/`, `pkg/`, `packages/`, `services/`, `modules/`) subdirectory must appear in the C3 component diagram in `ARCHITECTURE.md` or `docs/diagrams/c3-components.md`.
- **`scripts/validators/validate-entry-points.sh`** — enumerates entry points from source: `package.json` `bin`/`main`/`scripts.start`, `__main__.py` files, Go `main.go` files, Rust `src/main.rs` and `src/bin/*.rs`, common server entry files. Each must be referenced in `ONBOARDING.md`, `docs/diagrams/entry-points.md`, or `ARCHITECTURE.md`.
- **`scripts/validators/validate-use-cases.sh`** — parses `USE_CASES.md` and verifies each row (table-form OR section-form) has non-empty Persona, Trigger, Main Flow, Success Criteria, and a valid Priority (P0/P1/P2). Catches stub rows.
- **`scripts/validators/validate-user-stories.sh`** — every story in `USER_STORIES.md` must have acceptance criteria (Given/When/Then OR ≥3 numbered steps OR explicit "Acceptance Criteria" heading). Cross-checks: every persona in `USER_PERSONAS.md` has at least one story.
- **`scripts/validators/validate-tech-stack.sh`** — reads dependencies from `package.json` (deps + devDeps + peerDeps), `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod` (direct only). Every direct dep must appear in `TECH_STACK.md`.
- **`scripts/validators/validate-tests-mapping.sh`** — bidirectional UC ↔ test coverage. Forward: every P0/P1 use case in `USE_CASES.md` must have a test file referencing its UC-NN ID (in filename or content). Reverse: warns on test files that don't reference any UC-ID.
- **`scripts/validators/validate-fix-backlog-closed.sh`** — before phase-5 release, every CRITICAL or HIGH row in any `FIX_BACKLOG_*.md` must have status `VERIFIED`, `FIXED`, `RESOLVED`, `CLOSED`, `WAIVED`, or `WAIVED-WITH-JUSTIFICATION`. Open statuses (`OPEN`, `PENDING`, `IN-PROGRESS`, `REOPENED`, `NEW`, `TODO`) fail the gate. Waived rows must have a non-empty justification.
- **`scripts/validators/validate-adrs.sh`** — every `ADR-NNN` reference in `ARCHITECTURE.md` or `DECISION_LOG.md` must have a corresponding `docs/adrs/ADR-NNN-*.md` file with a recognized status (`proposed`, `accepted`, `deprecated`, `superseded`, `rejected`).
- **`scripts/validators/validate-migrations.sh`** — every migration file in `migrations/`, `prisma/migrations/`, `db/migrations/`, `alembic/versions/`, or `src/migrations/` must be referenced (by basename) in `docs/DATABASE.md` or `docs/MIGRATIONS.md`.

### Changed

- **`scripts/validators/validate-phase-gate.sh`** — completeness validators wired into the appropriate phases:
  - `phase-2` adds: `validate-use-cases.sh`, `validate-user-stories.sh`
  - `phase-3` adds: `validate-c3-coverage.sh`, `validate-entry-points.sh`, `validate-tech-stack.sh`, `validate-adrs.sh`
  - `phase-4` adds: `validate-tests-mapping.sh`, `validate-migrations.sh`
  - `phase-5` adds: `validate-fix-backlog-closed.sh`
- **`agents/shared/RALPH_WIGGUM_LOOP.md`** — expanded the validator catalog table to list all 17 validators (architecture, coverage, completeness, operational) so mode authors can pick the right one.

### Why this matters

The audit's Finding 6 identified that completeness checking existed but was partial. Six high-value coverage dimensions had no validator: C3 components, entry points, use case structure, user-story acceptance criteria, tech-stack ↔ deps, ADR existence, and migration-doc consistency. Plus two phase-5 gaps: fix-backlog closure, tests ↔ use-case mapping.

All nine are now scripts. Each enumerates the source-of-truth (manifest file, source dir, or source-doc) and verifies every item has its corresponding artifact. No subjective confidence score; either every item has an entry or it does not.

Combined with the universal Ralph loop in Wave C, validators that find gaps will trigger automatic gap-fill HANDOFFs (capped at 3 iterations) instead of waiting for orchestrator judgment.

## [0.18.0] — 2026-05-04

Wave B of the audit remediation — operational gates. Phase-4 and phase-5 release gates no longer trust agent self-report. Five new validators auto-detect the project's stack (node / python / rust / go) and actually EXECUTE the build, lint, typecheck, test, smoke, and dependency-audit steps. Every gate produces a `docs/reviews/RUNTIME_<kind>_<date>.md` report with verdict and tail output.

### Added

- **`scripts/validators/validate-build.sh`** — runs the project's build command (npm run build / python -m build / cargo build / go build), captures exit code + tail output. Override via `.sdlc/sdlc.json` "build" key.
- **`scripts/validators/validate-tests.sh`** — runs the test suite, parses pass/fail counts where the runner format is recognizable (vitest, jest, pytest, cargo test, go test). Tests are mandatory — missing test config is a gap.
- **`scripts/validators/validate-lint.sh`** — runs lint AND typecheck, both must exit clean. Tool-specific config-file checks (tsc requires tsconfig.json, eslint requires eslint config, mypy requires mypy.ini or pyproject.toml). Missing config = warn + skip; configured + broken = gap.
- **`scripts/validators/validate-smoke.sh`** — boots the server in background, waits for `wait_url` to respond, hits configured routes, asserts 200/204. Requires `.sdlc/sdlc.json` "smoke" config; skips clean if absent.
- **`scripts/validators/validate-deps.sh`** — runs `npm audit` / `pip-audit` / `cargo audit` / `govulncheck`, counts high+critical advisories, subtracts waivers from `.sdlc/deps-waivers.txt`. Fails on any unwaived high/critical.
- **`scripts/validators/_lib_sdlc_config.sh`** — shared helpers: stack detection, `.sdlc/sdlc.json` reader (supports jq, python3, sed fallback), `command_runnable()` with prerequisite checks (tsc → tsconfig.json, eslint → eslint config, etc.), `write_runtime_report()`.
- **`.sdlc/sdlc.json` schema documentation** in `docs/SDLC_GUIDE.md` with per-stack defaults table, smoke config example, and waivers explanation.

### Changed

- **`scripts/validators/validate-phase-gate.sh`** —
  - phase-4 gate now chains `validate-build.sh + validate-lint.sh + validate-tests.sh` (was: empty, "handled inline").
  - phase-5 gate now chains all 5 operational validators in addition to the existing FIX_BACKLOG / review-verdict / RUNTIME doc checks.
- **`agents/sdlc-feature-mode.md`** — Step 5 runtime gate now documents the validator scripts directly. Coding-agent is still used for feature-specific smoke (happy path of the feature + 1-2 regression paths) but build/lint/test/deps are run by validator scripts, not by agent self-report.
- **`agents/sdlc-init-mode.md`** — Phase 4 Round 3 gate adds explicit `validate-phase-gate.sh phase-4` invocation as the operational backstop. Per-module `RUNTIME_<module>_<date>.md` agent reports remain (for feature-specific assertions) but the orchestrator no longer accepts them as the sole evidence.

### Why this matters

The audit found that phase-5 release gate was performative: it grepped for the literal string "PASS" in agent-written `RUNTIME_*.md` files. An agent could write `verdict: PASS` without ever running anything, and the gate would exit 0. Five new validators replace the grep-for-PASS with actual exit-code checks. A green release gate now means the system actually built, linted, typechecked, tested, smoked, and audited dependencies — not that someone wrote PASS in markdown.

Graceful skipping ensures the validators don't break projects that don't have every tool configured. Each validator checks both "is the command configured" and "are its prerequisites met" (e.g., `tsc` needs `tsconfig.json`). Missing configuration warns and skips clean; broken configuration gaps and fails. Tests are the one mandatory step.

## [0.17.0] — 2026-05-04

Document hygiene + Wave A of the audit remediation. SDLC mode files no longer use Unicode box-drawing banners as visual separators around HANDOFF blocks — those banners were leaking into deliverables generated by smaller models (verified: `docs/USERGUIDE.md` already had stray banners; `docs/AGENT_PROCESS_FLOW.md` was 419 lines of ASCII tree art). All deliverable docs are now Mermaid-only; a new `validate-no-ascii-art.sh` enforces the rule across every `docs/*.md` and is wired into the phase-3 and onboard-deep gates.

### Added

- **`scripts/validators/validate-no-ascii-art.sh`** — scans markdown for Unicode box-drawing characters (`═`, `║`, `┌`, `└`, `─`, `┐`, `┘`, `╔`, `╗`, `╚`, `╝`, `╠`, `╣`, `╦`, `╩`, `╬`, `┏`, `┓`, `┗`, `┛`, `━`, `┃`, `├`, `┤`, `┬`, `┴`, `┼`, etc.) and 40+ char `=` banner lines. Skips Mermaid blocks. Excludes `AUDIT_*.md` (which intentionally references the patterns it bans). Wired into `validate-phase-gate.sh` for `phase-3` and `onboard-deep`.
- **`docs/AUDIT_2026-05-04.md`** — full audit report covering 6 findings (ASCII leakage, Ralph opt-in, performative gates, prompt bloat, code-review verification, completeness gaps).
- **`TODO.md`** — actionable wave plan tracking remediation across A → E.
- **Document hygiene section** in all four SDLC mode files (`sdlc-init-mode.md`, `sdlc-onboard-mode.md`, `sdlc-feature-mode.md`, `sdlc-improve-mode.md`) and `sdlc-lead.md`. Standard rule: "ALL diagrams MUST use Mermaid syntax — NEVER ASCII art or Unicode box-drawing characters."

### Changed

- **`agents/sdlc-init-mode.md`** — 81 Unicode `═══` banner separators replaced with `---`.
- **`agents/sdlc-onboard-mode.md`** — 33 Unicode + ASCII banners replaced.
- **`agents/sdlc-feature-mode.md`** — 18 banners replaced.
- **`agents/sdlc-improve-mode.md`** — 36 banners replaced.
- **`agents/shared/SCOPE_BOUNDARY.md`** — 3 banners replaced.
- **`agents/shared/HANDOFF_TEMPLATES.md`** — 12 ASCII `===` banners replaced with `---` to align with the new convention. Templates remain functionally identical.
- **`agents/shared/RALPH_WIGGUM_LOOP.md`** + **`agents/shared/FIX_VERIFY_LOOP.md`** — 3 banners each replaced.
- **`docs/USERGUIDE.md`** — 3 banners replaced (already-leaked instance).
- **`docs/AGENT_PROCESS_FLOW.md`** — full rewrite of all ASCII tree diagrams as Mermaid `flowchart TD` blocks. Mode 1 phases 0-5, Mode 3, Mode 4, and the Ralph Wiggum loop are all Mermaid now. 419 lines → ~250 lines, more readable, renderable in any markdown viewer.

### Why this matters

Local LLMs (Qwen3-coder, Gemma-3-27b) imitate in-prompt visual style. When a mode file surrounds every HANDOFF with `═══...═══` banner separators, the model treats banners as the project's style — and copies them into deliverables like `ARCHITECTURE.md`, `HEALTH_ASSESSMENT.md`, and `USE_CASES.md`. The audit found 192 banner lines across agent prompts AND already-leaked banners in `docs/USERGUIDE.md` (the repo's own user-facing documentation). Removing the in-prompt examples is the load-bearing fix; the validator prevents recurrence.

The canonical `validate-architecture.sh` enforces real Mermaid fences but only on `ARCHITECTURE.md`. The new `validate-no-ascii-art.sh` generalizes that backstop to every deliverable.

## [0.16.0] — 2026-04-27

Research-tooling overhaul + universal loop-prevention. The legacy DDG-only `web-search.ts` / `web-fetch.ts` tools are deleted in favor of the new **playwright-search MCP** (auto-installed by `install.sh`), giving every agent in the project free, multi-engine web research with paragraph-level relevance ranking. Use-case testing surfaced three distinct loop classes that were causing real failures with local LLMs (LM Studio + Qwen3-coder); all three are now blocked by a shared `LOOP_PREVENTION.md` referenced from every agent prompt.

### Added

- **`agents/shared/LOOP_PREVENTION.md`** — single source of truth for loop-prevention rules. Covers three failure classes:
  - **Failure loop** — same tool error 3+ times → 3-strikes STOP
  - **Schema-validation loop** — model emits malformed tool args (e.g. `glob({pattern: undefined})`), gets a Zod error, retries identical broken call → never retry the same broken call; switch tool or surface
  - **Success loop** — every call succeeds but the model never stops fetching (re-fetches same URLs, keeps wanting "one more source") → hard caps: 15 total / 4 per work-unit / 1 per URL / diminishing-returns check
  - Universal STOP triggers + a required template for surfacing partial results to the user. Every agent must apply these.
- **`agents/shared/RESEARCH_TOOLS.md`** — single-source reference doc agents Read at runtime. Documents the playwright-search MCP tool surface, per-agent when-to-use guidance, query tips.
- **playwright-search MCP auto-install in `install.sh`** — clones from GitHub to `~/.local/share/playwright-search` (override via `PLAYWRIGHT_SEARCH_DIR`), runs `npm install && npm run build`, merges the MCP into `opencode.json` via `jq`. Skip with `--no-playwright-search`. Idempotent.
- **Iterative-loop research workflow** in `agents/researcher.md` — explicit pass-1-broad / pass-2+-refined pattern with a "Learned so far / Still missing" ledger between passes. New Step 2.5 question-completion gate blocks synthesis until every decomposed question reaches DONE; report template requires `#### Qn:` subsections per question.
- **Cross-agent research surface** — `web_research / web_search / web_fetch` (via `playwright-search_*` MCP tool names) made available to and documented in 11 agents that benefit from web lookups before deciding: coding-agent, api-designer, security-auditor, db-architect, performance-engineer, container-ops, frontend-design, ux-engineer, sre-engineer, test-engineer, code-reviewer.

### Removed

- **`tools/web-search.ts` and `tools/web-fetch.ts`** — replaced by playwright-search MCP. The legacy tools were DDG-only with no captcha awareness, and their hyphenated names were being picked over the MCP-prefixed equivalents by smaller models. The replacements are multi-engine, captcha-aware, paragraph-ranked, and cached.
- **`install.sh` playwright-npm install step** — previously installed `playwright` into the opencode node_modules for the deleted `web-fetch.ts`. `@playwright/cli` is still installed (for `tools/playwright-web.ts`).

### Changed

- **`tools/CUSTOM_TOOLS_GUIDE.md`** — Web Research section rewritten to point at the MCP tools.
- **`examples/opencode.json`** — adds the `playwright-search` MCP entry alongside `context7` and `mempalace`.
- **`README.md`** — new "Install flags" table (`--no-playwright-search`, `PLAYWRIGHT_SEARCH_DIR=...`) and "What others need" subsection. Recipients get one-command install with the MCP wired in automatically.

## [0.15.0] — 2026-04-24

Strict-refactor release. Replaces large monolithic prompts + manual enforcement with small targeted prompts + automated validators. sdlc-lead.md drops from 4986 lines to 386 (router only); modes and shared protocols live in their own files. Introduces the Ralph Wiggum inventory loop for exhaustive verification (inventory -> discover -> verify -> gap -> repeat, 3-iteration cap) and the `--quick` / `--deep` depth flags for onboarding and security. Nine bash validators automate completeness checks that previously required orchestrator judgment, plus a three-gate post-HANDOFF runner that proves every delegated task stayed in scope and produced a valid manifest.

### Added

- **`scripts/validators/`** — nine bash validators + shared `_lib.sh`:
  - `validate-architecture.sh` — 6 diagram types, Mermaid syntax, HLA overview, no placeholders
  - `validate-owasp.sh` — all 10 OWASP categories present, confidence >= 7, attack-chains.md present
  - `validate-api-coverage.sh` — every route in source has a row in API_DESIGN.md AND openapi.yaml (Express/Fastify/Next app router/FastAPI/Flask/Go net-http detection)
  - `validate-erd-coverage.sh` — every table/model in source has an ERD entry (Prisma/TypeORM/Sequelize/Knex/SQLAlchemy/Django/raw SQL detection)
  - `validate-sequence-coverage.sh` — every P0 use case in USE_CASES.md has a sequence diagram
  - `validate-inventory.sh` — every row in INVENTORY.md has a corresponding artifact
  - `validate-scope.sh` — post-HANDOFF git-scope enforcement (`git status --porcelain` confined to assigned directories)
  - `validate-completion-manifest.sh` — HANDOFF manifest schema + completion phrase
  - `validate-phase-gate.sh` — orchestrator that chains the right validators for a given phase (phase-0..5, onboard-deep, security-deep)
  - `run-handoff-gates.sh` — three-gate orchestrator (scope + manifest + coverage) with any-failure-aborts semantics
  - Every validator emits a JSON envelope to stdout, a human-readable gap list to stderr, and exits 0 / 1 / 2. Bash 3.2 compatible (macOS default).

- **`agents/shared/`** — canonical shared protocols:
  - `BOUNDED_TASK_CONTRACT.md` (71 lines) — single source of truth for scope rules every specialist follows in Bounded Task Mode. Enables delete-duplicates-from-every-specialist follow-up.
  - `HANDOFF_TEMPLATES.md` (201 lines) — canonical HANDOFF block templates (standard, remediation, re-verification, parallel-wave) + context-packet template + post-HANDOFF gate documentation.
  - `FIX_VERIFY_LOOP.md` (152 lines) — canonical five-step pipeline (parallel fan-out -> FIX_BACKLOG -> remediation -> re-verification -> gate), severity matrix, merge gate, escalation block. Extracted from sdlc-lead.md.
  - `RALPH_WIGGUM_LOOP.md` — canonical inventory-driven deep-verification loop reused by onboard-deep and security-deep.

- **Four mode files** extracted from the sdlc-lead monolith:
  - `agents/sdlc-init-mode.md` (1850 lines) — Mode 1 new project, Phases 0-5
  - `agents/sdlc-onboard-mode.md` (823 lines) — Mode 2 onboard, 7-step + Ralph Wiggum deep section
  - `agents/sdlc-feature-mode.md` (483 lines) — Mode 3 add feature
  - `agents/sdlc-improve-mode.md` (890 lines) — Mode 4 audit & improve

- **Ralph Wiggum Deep Mode for `/sdlc onboard --deep`** — step D1-D5 flow appended to sdlc-onboard-mode.md with inventory producer HANDOFF, parallel DISCOVER waves per category, validator-driven VERIFY, focused one-row gap-fill HANDOFFs, and 3-iteration cap.

- **Depth Modes for `/security`** — new Depth Modes section in security-auditor.md. `--quick` (default) runs phases 1-3 once; `--deep` runs the Ralph Wiggum loop over every OWASP category, every custom semgrep rule file, and iteratively over 9 attack-chain patterns until a full pass finds no new chains. Gate: `validate-phase-gate.sh security-deep` exit 0.

- **Three new onboard sub-skills** (thin triggers):
  - `/onboard-inventory` — trigger for step D1
  - `/onboard-verify` — trigger for step D3 (runs `validate-phase-gate.sh onboard-deep`)
  - `/onboard-gap-fill` — trigger for step D4 (focused per-row HANDOFFs)

- **Platform support block** in README.md and install.sh preflight refusing native Windows and pointing to WSL2.

- **`docs/STRICT_REFACTOR_PLAN.md`** — durable record of the 5-wave plan.

### Changed

- **`agents/sdlc-lead.md`: 4986 lines -> 386 lines.** Router + shared protocols only. Modes extracted to `sdlc-<mode>-mode.md`. Resume protocol step 2 rewritten to call `run-handoff-gates.sh` with a HANDOFF-type -> coverage-validator mapping table. No behavioral regression — same flow, just delegated.

- **`commands/sdlc-onboard.md`** — gains `--quick` / `--deep` flags with guidance on when to pick deep.

- **`skills/gate/SKILL.md`** — rewritten from confidence-score self-evaluation to call `validate-phase-gate.sh <phase>`. Output is the validator's JSON gap list, not a subjective rating.

- **`skills/security/SKILL.md`** — depth-flag matrix + guidance on when deep makes sense.

- **Gate verdict mechanism** — every phase advance now blocked by `validate-phase-gate.sh <phase>` exit code. Confidence-score loops remain ONLY for artifacts validators cannot check (narratives, summaries, research reports).

### Fixed

- **bash 3.2 parser bugs** in validator scripts — triple-backticks inside `[[ ]]` comparisons and double-quoted strings mis-parse on macOS. Fix: bind to variables via `printf '%s' '...'` first. Also stripped em-dashes and box-drawing unicode from code bodies (kept in output via format strings).

---

## [0.14.0] — 2026-04-23

Structured Fix-Verify Loop across every review stage. Parallel review fan-out, unified FIX_BACKLOG, dedicated remediation + re-verification HANDOFF templates, hard 3-iteration cap with escalation, canonical severity→action matrix, and expanded git-expert merge enforcement. Closes the gap where review findings had no structured path back into code and where reviews ran sequentially instead of concurrently.

### Added

- **Fix-Verify Loop Protocol (shared, near the top of `sdlc-lead.md`).** Canonical five-step pipeline — **parallel fan-out → synthesize FIX_BACKLOG → remediation HANDOFF → targeted re-verification HANDOFF → gate**. Referenced by Mode 3 Step 4, Mode 1 Phase 4 Parallel Wave Round 2, and Mode 1 Phase 5. Single source of truth for how findings turn into code changes.

- **Severity → Action matrix (canonical).** `CRITICAL` / `HIGH` block merge to `main` and require fix-this-session (or a signed waiver). `MEDIUM` is tracked as tech debt — merge-OK. `LOW` is informational. Waivers are recorded in `docs/reviews/WAIVERS_<feature>_<date>.md` with compensating control + review date; sdlc-lead never waives, only the user does.

- **Auto-trigger rules for security + perf + ux.** sdlc-lead decides which reviews to run based on the impact analysis: security runs when auth/session/authorization/user-input/file-upload/SQL/crypto/external-API-with-credentials surfaces are touched; performance runs when NFR-tracked paths, DB queries, loops, caching, or background jobs are touched; ux runs on any UI file. code-review always runs. Removes the human judgment call and the recurring "forgot to run /security" miss.

- **Unified `FIX_BACKLOG_<feature>_<date>.md`.** Orchestrator-written synthesis of every review's findings into one table with severity, file:line, finding, recommended fix, and an observable **Verify criterion** (passing test, metric threshold, grep that returns nothing). Deduplicates cases where two reviewers flagged the same file:line.

- **Remediation HANDOFF template.** Dedicated template that hands the FIX_BACKLOG to coding-agent with rules: fix only CRITICAL+HIGH rows, minimum change at cited file:line, stop and report if a fix needs a design change. Produces `FIX_SUMMARY_<feature>_<iteration>_<date>.md`.

- **Targeted Re-verification HANDOFF template.** code-reviewer (or the original specialist for domain-specific checks) verifies ONLY the findings in the backlog — does not re-scan for new issues. Produces `VERIFY_<feature>_<iteration>_<date>.md` with per-row PASS/FAIL/INCONCLUSIVE and evidence. Targeted verification saves tokens vs. re-running a full 7-dimension review.

- **Hard 3-iteration cap + escalation block.** If the 3rd verification still has any FAIL, sdlc-lead STOPS the loop and emits a four-option escalation prompt: (A) sign a waiver, (B) redesign, (C) defer to tech debt, (D) change specialist. No 4th iteration without explicit user direction.

- **Phase 5 Release Gate.** New explicit gate block emitted before `--release`: 10 required conditions including FIX_BACKLOG closed, every review verdict READY/APPROVED/RELEASE-READY, runtime PASS, test suite P0+P1 green, no CRITICAL CVE in containers. Any `[✗]` stops release and reports blockers.

### Changed

- **Mode 3 Step 4 rewritten as parallel fan-out.** code-review + security + perf + ux (when triggered) emit together in ONE message → user opens N concurrent OpenCode sessions → sdlc-lead synthesizes FIX_BACKLOG → Fix-Verify loop → merge. Previously ran sequentially with each review in its own section; Step 4's conditional "if security-sensitive / if perf-sensitive" blocks are gone.

- **Mode 1 Phase 5 rewritten as parallel fan-out.** security-final + perf-final + code-review-final + ux-audit fan out together; tech-debt, coverage, and container-audit remain sequential post-review audits (they examine different concerns than the four blocking reviews). Phase 5 ends with the explicit Release Gate.

- **Mode 1 Phase 4 Parallel Wave Round 2 unified.** Round 2 now emits every triggered review (code + security + perf + ux per module), feeds findings into a per-module FIX_BACKLOG, and runs the Fix-Verify loop per module (3 iterations max). A module stuck after 3 cycles emits the escalation block for that module only; peer modules advance to Round 3 runtime.

- **git-expert merge rule expanded.** The merge-to-`main` refusal now requires three conditions (previously just one): (1) matching `RUNTIME_*.md` = PASS; (2) Fix-verify loop closed (empty backlog OR latest VERIFY all PASS OR signed waivers); (3) no open CRITICAL/HIGH in CODE_REVIEW/SECURITY/PERF/UX verdicts. Missing or failing any → abort and report exactly which condition blocks.

- **performance-engineer — findings-only for SDLC reviews.** Bounded Task Mode gains a new Strict Scope Rule: when the SDLC-TASK prompt asks you to review/audit/benchmark, produce findings with recommended fix + expected delta — do NOT self-optimize. Fixes flow through the Remediation HANDOFF so the change runs through code review like every other finding. Direct `/perf` invocation with an explicit "optimize X" prompt is unchanged.

## [0.13.0] — 2026-04-23

Runtime validation gate before every merge, per-component parallelism with full mini-lifecycle per module, and sub-component decomposition for Mode 3 features. Closes the gap where tests-green PRs were merging to `main` without a confirmed clean run, and where Phase 4 parallel waves only parallelized coding while reviews and runtime ran once at the end.

### Added

- **Runtime validation gate — MANDATORY before every merge.** Mode 3 Step 5 now includes a blocking runtime gate before `git-expert` is allowed to squash-merge. `coding-agent` runs: build → lint/typecheck → start → feature smoke → regression smoke, producing `docs/reviews/RUNTIME_<feature>_<date>.md` with verdict PASS or FAIL. FAIL blocks the merge — fix, re-review if non-trivial, re-run the gate. A green test suite and approved review are not proof the app boots; this gate exists because a merge without runtime confirmation is a P0 defect (missing env vars, broken migrations, import cycles, misconfigured services all surface only at runtime).

- **git-expert merge rule — matching `RUNTIME_*.md` required to squash to `main`.** New NEVER-rule in `git-expert.md`: any merge to `main`, any sub-component merge to its parent feature branch, and any Phase 4 wave module merge requires a matching `docs/reviews/RUNTIME_*.md` with verdict PASS. Missing, stale, or FAIL → abort and report. The merge-phase `task(git-expert, ...)` prompt in `sdlc-lead` now explicitly tells git-expert to verify this file before marking the PR ready.

- **Mode 3 Step 1.5 — Sub-component Decomposition.** After impact analysis, sdlc-lead asks whether the feature is Atomic (linear flow, as before) or Split. Split features produce `docs/features/<slug>/COMPONENT_DAG.md` (same format as Phase 4's `PARALLELIZATION_MAP.md`) with sub-components, directories, dependencies, wave numbers, and frozen contracts. Each sub-component cuts its own branch `feat/<slug>/<sub-slug>` from the parent `feat/<slug>`, runs the full Mode-3 lifecycle (Steps 2–5) in its own OpenCode session, produces `RUNTIME_<slug>_<sub-slug>_<date>.md`, and merges back to the parent when its runtime passes. The parent merges to `main` only when every sub-component is PASS.

- **Phase 4 Parallel Wave — three-round per-module pattern (code → review → runtime).** Parallel waves were previously coding-only with shared reviews at the end. Now each parallel wave runs three rounds, one message per round: Round 1 emits N `coding-agent` HANDOFFs (one per module), Round 2 emits N `code-reviewer` HANDOFFs producing `docs/reviews/CODE_REVIEW_<module>_<date>.md`, Round 3 emits N runtime-validation HANDOFFs producing `docs/reviews/RUNTIME_<module>_<date>.md`. The wave advances only after every module is green in all three rounds. A Round 3 FAIL blocks only the failing module — fix and re-run that module's HANDOFF while peers' PASS verdicts stay valid.

### Changed

- **SDLC_TRACKER Phase 4 Wave Execution table** — gained `Depends on waves` column and per-round status (code / review / runtime) plus per-module RUNTIME verdicts. A wave row is only ✅ DONE when all three rounds are green AND every per-module RUNTIME verdict is PASS.

- **Mode 3 merge prompt to git-expert** — no longer just "mark ready + squash." It now instructs git-expert to first confirm the RUNTIME report exists with PASS, abort if missing or FAIL, and report the merge SHA after success.

## [0.12.0] — 2026-04-22

Strict delegation policy for sdlc-lead, modular-parallel architecture requirements in Phase 3, and opt-in parallel wave execution in Phase 4. Closes the two remaining INLINE audit leaks where the orchestrator was doing specialist work directly.

### Added

- **`docs/PARALLELIZATION_MAP.md` — new Phase 3 deliverable** — Module Inventory table (every module has a row with directory, contract artifact, dependencies, wave number) plus a Waves section grouping independent modules. Phase 4 Execution Mode Selection reads this file as its first step. The Phase 3 gate refuses to pass if the map is missing or the Module Inventory has fewer rows than `ARCHITECTURE.md` lists modules.

- **Phase 4 Execution Mode Selection** — before emitting any Wave 1 HANDOFFs, sdlc-lead asks the user per-wave whether to run Sequential (default, safer) or Parallel (opt-in, faster). The choice is recorded in `docs/work/sdlc-state.md` and the Phase 4 Wave Execution table in the SDLC_TRACKER.

- **Parallel wave protocol** — when a wave is marked `[P]`, sdlc-lead emits one message containing every module's HANDOFF as separate blocks. Each HANDOFF names the module's directory as the exclusive write-scope and tells the agent that wave-peers are running concurrently. Wave N+1 does not start until every Wave-N agent prints its completion phrase, every output passes verification ≥ 7, and a write-scope collision check (`git status` for overlapping files) is clean.

- **Modular Design Requirements — items 6–8** — architecture MUST define service-boundary criteria (each module is independently buildable with a frozen contract), write-scope isolation (enforced during Phase 4, each module owns `src/<module>/` exclusively), and contract-first ordering (API/event contracts frozen in Phase 3 before any Phase 4 implementation starts — modules can then implement against mocks of each other).

- **Strict Scope Rules — 5-point policy across all 12 specialists** — added to the Bounded Task Mode section of `api-designer`, `db-architect`, `researcher`, `test-engineer`, `ux-engineer`, `security-auditor`, `code-reviewer`, `sre-engineer`, `performance-engineer`, `container-ops`, `coding-agent`, and `frontend-design`. Non-negotiable rules: write-scope isolation, no extra files beyond PRODUCE, verbatim completion phrase (for sdlc-lead's resume logic), no scope expansion (observations go to "Known issues / deferred", not silent fixes), stop means stop (no "anything else?" after completion phrase). Rules exist because sdlc-lead coordinates multiple specialists — including parallel waves — and depends on every specialist staying inside its lane.

- **Mode 1 SDLC_TRACKER — Synthesis Documents + Phase 4 Wave Execution sections** — tracker template now has explicit rows for the two orchestrator-written synthesis docs (ARCHITECTURE.md, PARALLELIZATION_MAP.md) and a Phase 4 Wave Execution table with wave number, modules, execution mode, status, and per-module verify scores.

### Changed

- **sdlc-lead becomes a strict master-tracker / documentation-master** — Rules list rewritten to make delegation non-negotiable. The only documents sdlc-lead writes directly are trackers (`SDLC_TRACKER.md`, `DELEGATION_LOG.md`, `docs/work/sdlc-state.md`), synthesis docs (`ARCHITECTURE.md`, `PARALLELIZATION_MAP.md`, `VISION.md`, use case catalogs, `DESIGN_CONTEXT.md`, improvement backlogs). Everything else is a HANDOFF, including discovery audits, navigating running apps, checking HTTP responses, writing code, designing schemas, running tests. The policy is enforced by explicit callout: *"If you catch yourself about to `Read` a source file to analyze it, STOP — that's a HANDOFF."*

- **`frontend-design` Bounded Task Mode brought to parity** — previously had 1 reference to Bounded Task Mode versus 3–4 in sibling specialists. Now includes the full "Skip all of the following" list, the expanded Execute-in-order procedure, and the new Strict Scope Rules section.

### Fixed

- **Phase 4 discovery audit — INLINE → HANDOFF (test-engineer/ux-engineer)** — previously sdlc-lead navigated every app route itself checking for console errors and 4xx/5xx responses, violating the strict-delegation policy. Now issued as a HANDOFF producing `docs/audits/discovery-<date>.md` with per-route status, severity, and a summary table.

- **Mode 4 Step 1.5 Discovery Audit — INLINE → HANDOFF (test-engineer/ux-engineer)** — same pattern in improvement mode before specialist audits start. Now a HANDOFF producing `docs/improve/DISCOVERY_PRE.md` with route findings and a "prioritize" recommendation scoping the Step 2 audits.

---

## [0.11.1] — 2026-04-14

### Fixed

- **Researcher timeout — moved from Tier 1 (task) to Tier 2 (HANDOFF)** — researcher runs multi-phase web research (5–15 min, 300–360 s timeouts) and was incorrectly delegated via `task()` alongside git-expert. This caused silent hangs and timeouts in SDLC flows. Researcher is now a Tier 2 HANDOFF agent, consistent with all other specialists. All 4 delegation sites updated: Phase 0 (competitive landscape), Phase 1 (technical feasibility), Phase 3 Step 1 (framework comparison), Mode 4 Step 2.5 (vision research). Each site now saves `sdlc-state.md` before the HANDOFF and specifies a clean completion phrase. The Research Findings Review Protocol updated to reference the HANDOFF pattern. `AGENT_PROCESS_FLOW.md` and `USERGUIDE.md` updated to reflect the change.

- **Tier 1 clarified** — Tier 1 (`task()`) is now git-expert only. Tier 2 (HANDOFF) is researcher + all 10 other specialists + coding-agent.

---

## [0.11.0] — 2026-04-14

New `coding-agent` specialist for doc-driven implementation, delegation tracking across all handoffs, and TECH_STACK.md enforcement throughout the SDLC.

### Added

- **`coding-agent` — new specialist agent** (`agents/coding-agent.md`) — Doc-driven implementation engineer invoked via HANDOFF from `sdlc-lead` for all code implementation work. Enforces Four Laws before writing any code: (1) read SDLC design docs first, (2) verify every library API via Context7 MCP (`resolve-library-id` + `get-library-docs`) — never writes from training-data assumptions, (3) match existing patterns in the target directory, (4) follow `docs/TECH_STACK.md` — flags any unlisted library rather than silently adopting it. Anti-slop rules enforced on every file: no try-catch outside system boundaries, no abstractions with <2 implementations, no single-use helpers, no what-comments, no unused imports, no scope creep. Self-audit checklist run before reporting done. Produces a Completion Manifest including files produced, API verifications, tech stack compliance, anti-slop audit result, test result, and deferred items.

- **`/code` skill** (`skills/code/SKILL.md`) — Thin trigger that invokes `coding-agent`. Usage: `/code` (will ask for design docs) or `/code <description>`. Requires design docs to exist — directs user to `/sdlc feature` if none found.

- **DELEGATION_LOG** — persistent append-only tracking file (`docs/work/DELEGATION_LOG.md`) written by `sdlc-lead` on every HANDOFF issued and returned. Columns: timestamp, agent, task summary, status (PENDING / DONE / REDO / FAILED), confidence score, notes. Provides a complete audit trail of what was delegated, to whom, and whether it passed the confidence gate.

- **Structured HANDOFF confidence loop** — "Resuming after a HANDOFF" section rewritten with a 6-step protocol: confirm state from `sdlc-state.md` → verify output files → score 1–10 → apply asymmetric threshold (≥7 pass, 5–6 revise up to 3×, <5 auto-fail) → update DELEGATION_LOG → continue or escalate. "Revise" means ask user to re-run the agent, not rewrite output yourself.

- **TECH_STACK.md enforcement in implementation** — coding-agent HANDOFF template in Mode 4 now includes `docs/TECH_STACK.md` in the CONTEXT block with explicit constraint: "Do not introduce any library, framework, or runtime not listed in TECH_STACK.md — flag deviations in the completion manifest instead of silently adopting them." Same constraint added to the Mode 1 Phase 4 IMPLEMENTATION CHECKPOINT.

### Changed

- `sdlc-lead`: Skill → Agent mapping table updated — `coding-agent` added as the agent for all general code implementation. `sre-engineer` annotated as CI/CD/ops only (NOT application code). CRITICAL warning block added to prevent inventing agent names.
- `sdlc-lead` Mode 4: Size M HANDOFF template updated to pass `docs/TECH_STACK.md` as a required context file and require tech stack compliance in the completion manifest.
- `sdlc-lead` IMPLEMENTATION CHECKPOINT: `docs/TECH_STACK.md` listed first among spec documents with "MANDATORY constraint" label.
- All docs updated: `README.md` (14 agents, 20 skills), `docs/FEATURES.md`, `docs/EXPERT_GUIDE.md`, `docs/USERGUIDE.md`, `docs/SDLC_GUIDE.md`, `docs/AGENT_PROCESS_FLOW.md`.

---

## [0.10.0] — 2026-04-13

Three targeted enhancements: attack chain analysis in the security auditor, OpenAPI 3.0 spec as an SDLC Phase 3 gate requirement, and semgrep custom rules correctly documented to the user's personal OpenCode store.

### Added

- **Attack chain analysis — `security-auditor` Phase 5b** — New phase runs after all individual findings are verified, before the report is written. Builds a pre-condition/post-condition inventory for every real finding, then tests every pair and triple for multi-step exploitability. Discovers vulnerabilities that exist only when findings are chained — e.g., MEDIUM info disclosure + MEDIUM IDOR = CRITICAL account takeover that neither finding describes alone. Nine classic chain patterns tested explicitly (XSS→session hijack, SSRF→pivot, path traversal→credential theft, auth bypass→privilege escalation, recon→targeted attack, weak crypto→forgery, race condition+business logic, CVE+reachability, misconfiguration→enumeration). Each chain documented as a `C-N` finding with step-by-step attack narrative, combined severity (auto-bumped above highest individual link when applicable), and a "break the chain" remediation priority. Chains written to `docs/security/attack-chains.md` and included as first-class findings in the final report. Reader simulation checklist updated to require chain section presence.

- **OpenAPI 3.0 spec — `sdlc-lead` Phase 3 deliverable** — `docs/api/openapi.yaml` is now a required Phase 3 artifact alongside `docs/API_DESIGN.md`. The api-designer HANDOFF prompt now mandates both files: `API_DESIGN.md` for human-readable narrative and `openapi.yaml` as a valid OpenAPI 3.0 spec with `components/schemas`, `components/securitySchemes`, reusable `$ref` error responses, and no inline schemas for reused types. Phase 3 gate blocks until the spec passes `swagger-cli validate` with 0 errors and every endpoint in `API_DESIGN.md` has a corresponding path entry. Git checkpoint and PR body updated to include the spec.

- **Custom Semgrep rules personal store documentation** — `security-auditor` preflight check (Phase 2, Step 1) now includes a check for `~/.config/opencode/.semgrep/custom-rules` (global install) or `.opencode/.semgrep/custom-rules` (project install). When missing, agent provides recovery instruction (re-run `install.sh`). Phase 2 Step 3 description and OWASP tracker template updated with accurate personal store paths.

### Changed

- `security-auditor` orchestrator plan updated from 4 phases to 5 (adds `attack-chain` between `verify-findings` and `write-report`).
- `sdlc-lead` Phase 3 deliverables list updated: `docs/API_DESIGN.md` now described as "human-readable contracts" and `docs/api/openapi.yaml` added as "machine-readable OpenAPI 3.0 spec (Swagger-compatible)".
- `docs/FEATURES.md` and `docs/USERGUIDE.md` updated for all three changes above.

## [0.9.0] — 2026-04-13

Semgrep security scanning deep upgrade: 98 custom gap-filler rules across 6 languages, offline/air-gapped scanning with registry pack caching, polyglot language detection, and auto-loading custom rulesets per detected language.

### Added

- **Custom gap-filler rulesets** (`.semgrep/custom-rules/`) — 98 hand-written Semgrep rules across 6 languages that fill OWASP Top 10 coverage gaps in registry packs with thin coverage:
  - `csharp-security.yml` (20 rules) — command injection (`Process.Start`), XSS (`Html.Raw`), LDAP injection, path traversal, SSRF (`HttpClient` + `WebRequest`), hardcoded secrets, CORS wildcard, weak hashing, sensitive logging, insecure cookies
  - `kotlin-security.yml` (16 rules) — SQL injection (JDBC + Android `rawQuery`), command injection, hardcoded secrets, deserialization, SSRF, WebView misconfig, path traversal, cleartext traffic, sensitive logging
  - `swift-security.yml` (17 rules) — weak hashes (MD5/SHA1), hardcoded keys, ECB mode, SQLite injection, WebView XSS, insecure HTTP, SSL bypass, keychain accessibility, path traversal, SSRF
  - `rust-security.yml` (15 rules) — SQL injection (`format!` macro), command injection, hardcoded secrets, `unwrap`/`expect`/`panic`/`todo` abuse, path traversal, SSRF, sensitive logging
  - `php-security.yml` (15 rules) — `unserialize` RCE, `include`/`require` LFI, file upload, type juggling, hash timing, session fixation, `preg /e` injection, `eval`, XXE, SSRF
  - `cpp-security.yml` (15 rules) — buffer overflow, format string, memory safety, command injection, crypto weakness, deprecated functions (targets `[c, cpp]`)

- **Offline / air-gapped scanning** — New `scripts/cache-registry-packs.sh` downloads all registry packs as local YAML files for fully offline scanning. Modes: `download`, `refresh`, `status`, `prune`.

- **`--offline` flag for `semgrep-full-audit.sh`** — Forces the audit to use only cached registry packs and local rules. No network calls. Requires prior `cache-registry-packs.sh` setup.

- **Auto-loading custom rules per language** — `semgrep-full-audit.sh` now detects which languages are present and automatically loads matching gap-filler rulesets from `.semgrep/custom-rules/`. Banner reports how many custom rulesets were loaded.

- **`--cache-packs` subcommand for `update-semgrep-rules.sh`** — Delegates to `cache-registry-packs.sh` for one-command registry pack caching.

- **`resolve_registry_pack()` function** — New function in `semgrep-full-audit.sh` that prefers local cache over live registry, handles 4 cases: cache hit, cache miss with network, cache miss offline (skip), and cache disabled (direct URL).

### Changed

- **Polyglot language detection** — `semgrep-full-audit.sh` language detection rewritten from single-language `elif` chain to `LANGS=()` array. Projects with multiple languages (e.g., TypeScript + Go + Python) now get ALL relevant packs, not just the first match.
- **Language detection expanded** — Added detection for C#/.NET, C/C++, Swift/iOS, Kotlin/Android, Scala alongside existing JS/TS, Python, Go, Rust, Java, Ruby, PHP.
- **`install.sh` now installs `.semgrep/` custom rules** — Custom rulesets are copied to `$DEST/.semgrep/` alongside scripts. Status summary reports custom rule count. Uninstall cleans up `.semgrep/` directory.
- **`uninstall.sh` updated** — Now removes `scripts/` and `.semgrep/` directories, notes about registry-cache cleanup.
- **Documentation updated across all references** — `semgrep-guide.md`, `semgrep-community-rules.md`, and `security-auditor.md` all document the custom rulesets, offline scanning, and dead registry packs.

## [0.8.0] — 2026-04-13

SDLC lead deep upgrade: persistent SDLC_TRACKER across all four modes, per-diagram confidence loops for ARCHITECTURE.md, strengthened SAD format template that rejects placeholders, and Phase 3 Architecture Diagram Pre-Gate that blocks advancement until every diagram row passes independently.

### Added

- **`SDLC_TRACKER.md` — persistent session tracker for all four SDLC modes** — Written at the start of each mode (Phase 0 for Mode 1, Step 0 for Modes 2/4, new Step 0 for Mode 3). Stored at `docs/sdlc/SDLC_TRACKER.md`. Survives context loss and session restarts. Status transitions: `⏳ PENDING` → `✅ DONE` / `🔄 RE-PASS` / `⚠️ BLOCKED`. Four mode-specific templates provided (Mode 1 phases 0-5, Mode 2 steps 0-7, Mode 3 steps 0-5, Mode 4 steps 1-6). Resume check: read tracker at start of each mode and skip `✅ DONE` rows — never re-run completed phases.

- **Architecture Diagram Inventory** — New section within the Mode 1 tracker template. One row per required diagram type: C1, C2, one C3 per major service, one sequence diagram per P0 use case, deployment, data flow. Gate CANNOT pass until every inventory row is `✅ DONE` with score ≥ 7.

- **Per-Diagram Confidence Loop** — New mandatory sub-loop in Phase 3. After writing EACH diagram, the agent rates completeness 1-10 against specific grounding criteria:
  - C1: all personas from USER_PERSONAS.md present as actors? all external systems from SRS §5.2 present?
  - C2: all services/runtimes from TECH_STACK.md present? communication styles on arrows?
  - C3 (one per service): real module names from feature-sliced structure? dependency arrows showing direction? no circular deps?
  - Sequence diagrams: one per P0 use case from USE_CASES.md (not a fixed minimum of 3). Each must have happy path + at least one error path. Participants named specifically — no "Service" generics.
  - Deployment: reflects DESIGN_CONTEXT.md infra choices — no invented infrastructure.
  - Data Flow: traces user request to persistence and back, shows where data transforms and where it's masked.
  - Score < 5 → surface to user immediately. Score 5-6 → revise up to 3 passes. Score ≥ 7 → mark tracker row `✅ DONE`.

- **Architecture Diagram Pre-Gate** — New mandatory check that runs BEFORE the standard Phase 3 gate loop. Reads `docs/sdlc/SDLC_TRACKER.md`, checks every diagram inventory row. If any row is NOT `✅ DONE`, write/revise that diagram following the per-diagram confidence loop before proceeding. Prints a `Diagram Inventory Completion Check` block showing DONE/BLOCKED status per diagram before the main gate runs.

- **HLA Overview section — written LAST** — New `## 0. HLA Overview` at the top of ARCHITECTURE.md. Written AFTER all diagrams pass their confidence loops so it's grounded in real design decisions, not a copy of the discovery interview. Three paragraphs: system partition metaphor, key architectural decisions (referencing ADR table), what a new engineer should read first.

- **Strengthened SAD Format template** — The `### SAD Format (4+1 Views)` template now:
  - Has a MANDATORY notice: no placeholder text in final documents — every section must be filled with real names from the project
  - C3 has one `#### 2.3.x [Service Name]` subsection per major service (not a single generic block)
  - Sequence diagrams section is `### 2.6 Sequence Diagrams — one per P0 Use Case` (derived from USE_CASES.md, not "minimum 3")
  - Each section has HTML comments listing the specific grounding criteria the diagram must meet
  - Goals & Constraints now requires specific targets from SRS.md (e.g., "P95 < 200ms") — not "performance, security, scalability"
  - Cross-Cutting Concerns now requires specific library names and file paths — not "use a logger"

- **Tracker writes wired into Confidence-Based Gates** — After every gate table is printed, the agent immediately calls `edit()` on the tracker to update the phase row status. `✅ DONE` on pass, `⚠️ BLOCKED` on automatic fail, `🔄 RE-PASS` on 5-6 score iteration.

- **Tracker init wired into Mode 2 Output Verification Protocol** — Every step verification log now includes a `Tracker:` line showing the row update applied after the step passes or fails.

- **Tracker init wired into Mode 4 Output Verification Protocol** — Same as Mode 2 — every step verification log includes a `Tracker:` line.

### Changed

- **ARCHITECTURE.md sequence diagram count: "minimum 3" → "one per P0 use case"** — The previous minimum-3 rule was a floor that led to arbitrary diagrams. Now explicitly derived from USE_CASES.md P0 entries so coverage is traceable to requirements.
- **Phase 3 Gate Loop: new pre-gate check added** — The standard gate deliverable rating loop now has a mandatory pre-step (Architecture Diagram Pre-Gate) that must clear before the standard loop runs.

## [0.7.0] — 2026-04-13

Performance engineer deep upgrade: persistent session tracker, pre-profiling static analysis pass with try/catch performance anti-patterns, coverage confidence loop, and mandatory full report template. Also fixes stale `mode: subagent` references across all docs.

### Added

- **`PERF_TRACKER.md` — persistent performance session tracker** (`cd5357b`) — Written at Phase 1, updated after every phase via `edit()`. Stored at `docs/performance/PERF_TRACKER.md`. Survives context loss and session restarts. Tracks: 7-row progress summary (status/confidence per phase), baseline metrics, static analysis findings, profiler results, hotspot log, before/after benchmark table (filled across phases 2, 4, 5). Status transitions: `⏳ PENDING` → `✅ DONE` / `🔄 RE-PASS` / `⚠️ BLOCKED`.

- **Phase 1b — Static Analysis Pass** (`cd5357b`) — New phase between "understand problem" and "profile". Runs 5 grep scans against all source files to detect performance anti-patterns statically, before any profiler runs. Source file inventory (`find . -type f ...`) runs first so the agent knows the full scope.

  Scan 1 — **O(n²) nested loops**: `.find()` / `.filter()` / `.some()` inside `for` / `forEach`.
  
  Scan 2 — **N+1 query patterns**: DB/fetch call inside a loop; suggests `findMany` + `Map` pre-build.
  
  Scan 3 — **try/catch performance anti-patterns** (four patterns, four languages):
  - Pattern A: `try/catch` inside tight loop → V8 cannot apply JIT optimizations (inlining, hidden class caching, escape analysis) → 5-20x slowdown. Fix: move try/catch outside loop or use `Promise.allSettled`.
  - Pattern B: Exception-driven control flow in hot paths (e.g. `try { JSON.parse } catch` called 10,000×/req) → 100-1000× slower than a guard check.
  - Pattern C: Individual `try/catch` per `await` → each `await` blocks on completion, preventing `Promise.allSettled` parallelism. Three 200ms calls = 600ms serial vs 200ms parallel.
  - Pattern D: Re-throw after logging → stack captured twice (on throw + on re-throw); noisy logs + perf cost.
  - Python: EAFP misuse — `try/except KeyError` in hot loop instead of `.get(default)`.
  - Go: `errors.New()` in hot loop → heap allocation per call; fix with sentinel error at init.
  - Rust: `unwrap()` panic path in tight loop → `filter_map` / `.ok()` avoids panic overhead.
  
  Scan 4 — **Blocking I/O in async paths**: `readFileSync`, `execSync`, `bcrypt.hashSync` etc. inside request handlers. Blocks Node.js event loop for all concurrent requests.
  
  Scan 5 — **Hot-path allocations**: `JSON.parse` per request on static data, object spread in tight loops, string concatenation loops instead of buffers.

- **Coverage confidence loop** (`eaed023`) — After all 5 scans, agent cross-checks grep coverage against the source file list with a 9-question checklist (all scans run? all hits read? all extensions covered? absence-of-findings suspicious?). Rates coverage 1-10. Re-passes with broader patterns if < 7 (max 3 attempts). Prints a mandatory `Phase 1b Coverage Verdict` block. Sets `⚠️ BLOCKED` and surfaces to user if still < 7 after 3 passes.

- **Verbatim code mandate on all findings** (`eaed023`) — Every finding in every scan now requires `read(filePath=..., offset=<line-5>, limit=20)` before the finding is recorded. Each finding's block has a `Verbatim code (lines N–M):` section with exact output from `read()`. Findings from grep output alone are explicitly prohibited.

- **Full mandatory report template — Phase 6** (`eaed023`) — Replaces the previous 5-bullet list. `docs/PERFORMANCE_REPORT.md` must be filled in completely (placeholder dashes = incomplete). Template sections: executive summary, baseline measurements table (P50/P95, data size, method), one `STATIC-NNN` block per finding (verbatim code + loop bound + specific impact reason + concrete fix code + profiler confirmation status), profiler results table (top hot functions with file:line and time%), fix applied (before/after verbatim code + rationale), final benchmark (P50/P95 before/after + improvement factor + regression column), regression check table, known remaining bottlenecks (S/M/L effort + P0/P1/P2 priority), data size thresholds, coverage verdict (per-scan file count + finding count + confidence), handoffs recommended (expert + finding + specific reason).

- **Confidence gate reads from `PERF_TRACKER.md`** (`cd5357b`) — Gate prints a 7-row confidence table derived from the tracker file, not from context memory. Phase 5 (verify-fix) uses raised threshold of 8/10 — a fix without before/after benchmark numbers is not considered verified.

- **Resume check at Phase 2** (`cd5357b`) — `read(filePath="docs/performance/PERF_TRACKER.md")` before profiling starts; skips `✅ DONE` phases, surfaces `⚠️ BLOCKED` to user before continuing.

### Changed

- **`performance-engineer` phase count: 6 → 7** — Phase 1b (static analysis) is a distinct new phase between understand and profile. Updated orchestrator plan announcement and tracker row count.
- **`performance-engineer` handoff boundary clarified** — try/catch-in-loop: performance-engineer owns the runtime cost; code-reviewer owns the swallowed-error / correctness angle. Both agents can flag the same instance for different reasons without duplicating findings.
- **`docs/FEATURES.md`** — performance-engineer entry expanded from 1 line to full capability description. All 13 agent entries updated from `mode: subagent` → `mode: primary` (reflects the v0.5.0 change that was not reflected in docs). Agent count header corrected from 12 → 13.
- **`docs/USERGUIDE.md`** — `/perf` section expanded: full 7-phase description, Phase 1b scan list, output file paths corrected (`docs/perf/` → `docs/PERFORMANCE_REPORT.md` + `docs/performance/PERF_TRACKER.md`), try/catch and performance handoff boundary documented.



Test-driven SDLC, visual design agent, smart routing, adaptive questioning, and design compliance enforcement. Based on lessons from a real 60-test QA track on Sibling.

### Added

- **`frontend-design` agent (#13)** + `/frontend` skill — Production-grade visual implementation: typography, color systems, spacing, motion. Three modes: `--implement` (turn UX specs into components), `--polish` (elevate existing generic UI), `--system` (build/refactor design tokens). Includes "AI slop" checklist to catch generic AI-generated look.
- **`/explore` skill** — Codebase archaeology: trace a feature end-to-end before modifying it. Maps entry points, call chains, data flow, blast radius with file:line references.
- **`/steward` skill** — Project intelligence lifecycle: audits CLAUDE.md/AGENTS.md alignment with actual code, captures session learnings, fixes doc drift. Three modes: `audit`, `capture`, full.
- **`/design-options` skill** — Multi-approach architecture decisions: generates 3 alternatives (minimal, clean, pragmatic) with 6-dimension trade-off matrix. Integrated into Mode 3 Step 2 and Mode 4 Step 2.5.
- **Smart Routing** — `/sdlc` without a mode keyword detects intent from natural language. "Make the frontend better" → Mode 4 with frontend scope. When ambiguous, asks ONE routing question (A/B/C/D).
- **Adaptive Questioning** — Agents learn from research and audits, then generate follow-up questions derived from what they discovered. Questions must reference something specific, affect the next step, and couldn't have been asked at start.
- **Design Compliance (MANDATORY)** — 8 code-writing agents now read TECH_STACK.md + ARCHITECTURE.md before writing code. Will NEVER introduce technologies the architect didn't choose. If they think a change is better, they flag it as a decision point.
- **API Verification (MANDATORY)** — 6 code-writing agents check Context7 MCP or node_modules before using any library API. Never guesses from training data. Prevents renamed functions, changed option shapes, moved import paths.
- **Completion Manifest protocol** — All 12 specialist agents produce structured return manifests: files produced/modified, decisions made, known issues, test results.
- **Context Packet protocol** — SDLC lead writes focused context files before every HANDOFF, front-loading specialists instead of having them re-explore the codebase.
- **USE_CASES.md + TEST_PLAN.md in all 4 modes** — Phase 2 (from requirements), Mode 2 Step 6c (from existing code), Mode 3 Step 2 (for new features), Mode 4 (per-fix regression tests).
- **E2E test writing in Phase 4** — MANDATORY test-engineer handoff writes actual E2E specs for all P0 use cases BEFORE code review starts.
- **Discovery audit** — SDLC lead walks all app pages/routes and collects errors (console, 4xx/5xx, visible error text, slow loads) before and after improvements.
- **Pre-review gate** — All P0 tests must pass before code-reviewer or security-auditor sees the code.
- **TDD in Mode 3** — Test-engineer writes failing acceptance test first, developer implements, test passes, then review.
- **Mode 4 Vision Research** — When user provides a desired state ("make it feel like Linear"), researcher studies how best products achieve that vision with the current stack. `/design-options` triggered when multiple paths exist.
- **Mode 4 Feature-scoped improvement** — `/sdlc improve "feature:payments"` traces that specific feature via `/explore`, then scopes all audits to just those files.
- **Mode 4 granular scoping** — "frontend", "backend", "feature:X", "design", or combinations.
- **`/sdlc status` enhanced** — Visual progress display with phase→deliverable mapping, test counts, gate blockers, handoff state.
- **`/sdlc gate` implemented** — Full gate check with quality scoring, test gates, failure handling rules.
- **Container-ops → SRE ordering** clarified in AGENT_PROCESS_FLOW.md.
- **Researcher progress announcements** standardized to `▶ Phase N:` format.

### Changed

- All agents use `mode: "primary"` (OpenCode 1.4.0 compatibility).
- Mode 4 discovery interview expanded: new Q3 "What should it BECOME?", granular scope options.
- Mode 3 Step 1 now uses `/explore` pattern for impact analysis.
- Mode 3 Step 2 uses `/design-options` for non-trivial features.
- HANDOFF return verification strengthened: checks completion manifest, surfaces test failures.

## [0.5.0] — 2026-04-10

Mode 4 (`/sdlc improve`), strict git branching discipline across all modes, HANDOFF block overhaul, and Bounded Task Mode on all specialist agents.

### Added

- **Mode 4 (`/sdlc improve ["<focus>"]`)** — New SDLC mode for discovery-driven improvement of existing systems. Runs targeted specialist audits (UX, code quality, performance, security, DB), synthesizes findings into a prioritized improvement backlog (S/M/L sizing), and executes approved items with the right ceremony for their size (S = direct + verify, M = design step first, L = spawn Mode 3 sub-workflow). Optional focus arg narrows scope: `"ux"`, `"performance"`, `"security"`, `"code-quality"`.
- **Git Discipline section (mandatory — all modes)** — New top-level section defining the branching model: `main` = production, no direct commits. Each mode now creates a typed branch before touching any file: `sdlc/setup` (Mode 1 phases 0–3), `docs/onboard` (Mode 2), `feat/[slug]` (Mode 3), `improve/[slug]` (Mode 4). Every mode ends with a PR — no work merges without one.
- **`sdlc/setup` branch for Mode 1** — Phases 0–3 design docs all commit to `sdlc/setup`, not `main`. After Phase 3 gate passes, the branch is merged to `main` via PR before Phase 4 implementation begins. Feature branches cut from updated `main`.
- **Mode 2 branch + PR** — `docs/onboard` branch created at Step 0. All onboarding docs committed there. PR opened at end — docs don't land on `main` without review.
- **Mode 3 explicit merge step** — After all reviews pass in Step 4, `git-expert` marks the draft PR as ready and squash-merges to `main`. Branch deleted after merge.
- **Mode 4 branch + PR** — `improve/[slug]` branch created at Step 1 before any audit work. All findings and implementation committed there. PR opened at wrap-up.
- **Bounded Task Mode on all 11 specialist agents** — `SDLC-TASK for [agent]:` prefix triggers a scoped execution mode: skip discovery, skip orchestrator phases, read only the files listed under CONTEXT, execute exactly the task in YOUR TASK, write exactly the files in PRODUCE, print the exact completion phrase, then stop. Prevents specialists from running full multi-phase workflows when invoked via HANDOFF.
- **SDLC-TASK HANDOFF format on all 33 delegation points** — Every specialist HANDOFF in `sdlc-lead` now uses the structured `SDLC-TASK for [agent]: CONTEXT / YOUR TASK / PRODUCE / completion phrase` format. Specialists execute bounded jobs without triggering their own orchestrator workflows.
- **Mode 4 Improvement Discovery Interview** — Structured interview determines which audits to run based on what's driving the improvement (user complaints, perf concerns, tech debt, security, etc.). Announces audit plan and waits for user confirmation before running any specialists.

### Changed

- **`sdlc-lead` description** updated to include Mode 4 (`/sdlc improve`).
- **`sdlc-lead` command table** updated from "Three Operating Modes" to "Four Operating Modes".
- **All Phase 0–3 git commits** now explicitly target `sdlc/setup` branch (not "current branch").
- **`sdlc-lead` Rules** — Three new rules: never commit to `main` directly, always create the mode's branch before starting, always open a PR before merging.
- **All specialist agents** changed from `mode: "subagent"` to `mode: "primary"` — fix for OpenCode 1.4.0 which hides `subagent`-mode agents from direct invocation. All 12 agents now visible in the UI.

---

## [0.4.0] — 2026-04-10

Multi-agent orchestration, real-time progress feedback, phase-splitting for long-running agents, full git and UX wiring throughout the SDLC, and a comprehensive test suite.

### Added

- **Researcher orchestrator + `--single` + `--plan` modes** — The `researcher` agent no longer runs as one silent multi-minute block. In orchestrator mode (default) it announces its plan, spawns a `--single` sub-task per question via the `task` tool, and reports each finding as it completes (`✓ Q1: ...`). `--single` researches exactly one question in 30–60 s. `--plan` returns a question list only.
- **Orchestrator + `--phase: N` mode on all 8 long-running agents** — `db-architect`, `test-engineer`, `sre-engineer`, `container-ops`, `performance-engineer`, `api-designer`, `security-auditor`, `code-reviewer` all gained the same two-mode pattern. Orchestrator announces a phase plan, spawns one sub-task per phase (each writes to `docs/work/<agent>/<slug>/phaseN.md`), reports `✓ Phase N: [finding]` after each. `--phase: N name` runs only that phase in under 90 s.
- **Progress announcements mandatory on all 10 agents** — Every agent now has a `## Progress Announcements` section requiring `▶ Phase N: [name]...` at start and `✓ Phase N complete: [summary]` at end of every phase. These surface in the `task` tool's UI label via `context.metadata`.
- **Real-time metadata on every assistant message** — `task.ts` fires `context.metadata` on every JSON event from stdout, not just on the 5 s heartbeat.
- **`scripts/test.ts`** — Comprehensive test suite replacing `validate-tools.js`. Three passes: (1) dynamically imports each `.ts` tool via Node 24 native TS, validates runtime shape; (2) parses skill frontmatter, validates name/description/agent cross-references; (3) checks agent content length and role/identity.
- **`scripts/add-orchestrator.mjs`** — Script to insert the orchestrator + phase-mode block into new agents.
- **`mode: "subagent"` frontmatter on all 11 specialist agents** — Correct classification for OpenCode native task tool when custom agent support ships. `sdlc-lead` gets `mode: "primary"`.
- **`sdlc-lead` Mode 2: git history inspection (Step 0)** — `git-expert --inspect` runs before any code is read; hot files and recent activity focus landscape mapping.
- **`sdlc-lead` Mode 2: UI detection** — Step 1 detects UI frameworks/directories, records `UI-bearing: YES/NO`.
- **`sdlc-lead` Mode 2: UX audit** — If UI-bearing, Step 6 calls `ux-engineer --audit`.
- **`sdlc-lead` Mode 2: docs commit** — Step 7 calls `git-expert` to commit all produced onboarding docs.
- **`sdlc-lead` Mode 1: git checkpoints after phases 0–3** — `git-expert` commits phase docs after each gate. Nothing advances uncommitted.
- **`sdlc-lead` Mode 3: UX review in implementation** — Step 3 calls `ux-engineer --review` after code review for UI features; CRITICAL/HIGH block the PR. Step 4 adds accessibility audit. Step 5 updates `UX_SPEC.md` and commits docs.
- **`sdlc-lead` Phase 3/4/5: explicit `task()` calls with timeouts** — All delegations now have concrete `task(agent=..., prompt=..., timeout=...)` blocks sized for orchestrator depth (480–720 s).

### Changed

- **`task.ts` max timeout 600 s → 900 s** — 6 phases × 120 s = 720 s; new cap provides headroom.
- **`task.ts` default timeout 120 s → 180 s**.
- **`tools/grep-mcp.ts`** — Fixed `require('child_process')` in ESM module; replaced with `import { exec as execCb }`.
- **`package.json`** — `"type": "module"`, test script uses `node --experimental-strip-types`.
- **`sdlc-lead` researcher calls include numbered questions** — All three research delegations provide explicit questions so orchestrator mode activates without a planning round-trip.

### Architecture note

The `task` tool spawns `opencode run --agent X --format json` as a subprocess — the correct workaround for the current OpenCode limitation where the built-in task tool only supports `general` and `explore` (custom agents not yet supported: [anomalyco/opencode#20059](https://github.com/anomalyco/opencode/issues/20059)). When OpenCode ships full custom agent support, switching to the native task tool will give proper child-session visibility in the TUI sidebar without needing `context.metadata` hacks.

---

## [0.3.0] — 2026-04-10

Major upgrade wave: new `git-expert` agent, three-mode `code-reviewer` rewrite, three-mode `ux-engineer` rewrite, deeper `security-auditor`, sdlc-lead discovery interviews, asymmetric confidence gates applied across every agent. Repository cleanup + new documentation.

### Added
- **`git-expert`** — New 6-mode agent (`--init`, `--feature`, `--release`, `--recover`, `--inspect`, `--sync`). Handles repo bootstrap, daily feature-branch flow with atomic commits and draft PRs, semver releases with Keep-a-Changelog, reflog-based recovery, history forensics (blame / pickaxe / bisect), and multi-remote sync (Gitea + GitHub). Includes secret-scanning, reflog backups before destructive ops, and explicit confirmation gates. Wired into `sdlc-lead` at Phase 0, Phase 4, Phase 5, and Mode 3.
- **`references/git-workflow-checklist.md`** — Canonical rules for conventional commits, SemVer 2.0, Keep-a-Changelog, language-aware `.gitignore` presets, recovery scenarios, report templates, and destructive-op confirmation templates.
- **`code-reviewer` four modes** — `--review` (7-dimension health pass), `--debt` (leverage-sorted tech-debt register), `--consolidate` (DRY + error-handling consolidation with Consolidation Catalog), `--patterns` (cross-codebase drift audit).
- **`references/code-health-checklist.md`** — 7 dimensions, silent-failure hunter, consolidation catalog, language thresholds, confidence scoring, report templates.
- **`ux-engineer` three modes** — `--design` (WCAG-aware component design), `--review` (Nielsen Norman heuristic pass), `--audit` (accessibility audit with live-environment methodology).
- **Discovery Interviews + Confidence Loops** on `sdlc-lead` — Mode 1 and Mode 3 now start with a mandatory interview protocol; every phase ends with a per-document confidence gate (asymmetric: < 5 = fail, 5-6 = revise max 3x, ≥ 7 = pass).
- **Inter-Phase Check-In + Research Findings Review protocols** — Prevents `sdlc-lead` from auto-advancing phases and forces it to reconcile research with prior decisions.
- **Semgrep deep upgrade** — Community rules integration, framework auto-detect, two-tier scans in `security-auditor`.
- **Skeleton-first security report format** — Rewritten to surface actionable intel first.
- **Verifier isolation + reader simulation + asymmetric gates** — Applied across all 12 agents.
- **MemPalace MCP integration** — Persistent memory for OpenCode workflows.
- Repository cleanup: `.gitignore`, `CHANGELOG.md`, shortened `README.md`, `docs/FEATURES.md`, `docs/USERGUIDE.md`.

### Changed
- **`sdlc-lead` Phase 0 now calls `git-expert --init` first** — so VISION.md is the first tracked artifact.
- **`sdlc-lead` Phase 4 calls `git-expert --feature`** per completed feature for branch + atomic commits + draft PR.
- **`sdlc-lead` Phase 5 calls `git-expert --release`** once reviews pass — semver bump + signed tag + GitHub/Gitea releases.
- Agent descriptions now use trigger-aware "pushy" language so they surface proactively.
- OpenCode-specific compatibility fixes and session-context tooling.

## [0.2.0] — 2026-04-09

End-of-day state after a major expert-depth push. 11 experts upgraded with real per-phase iteration loops, instinct patterns, deep threat modeling, verbatim code snippet enforcement, and a Mode 2 (`sdlc onboard`) overhaul with high-level architecture + operation sequence diagrams.

### Added
- **Real expert behavior** across all 11 agents — per-phase iteration, instinct patterns, deeper threat modeling.
- **Semgrep integration** in `security-auditor` — auto-install, auto-detect language, guided setup.
- **Context7 MCP** — Live library documentation lookup reference available to all agents.
- **Custom OpenCode tools** — `tools/` directory with 18 TypeScript tools (bash, grep-mcp, write, append, update, file-info, task, test-runner, playwright-test, playwright-web, semgrep-scan, semgrep-rule, simplify-file, pomodoro, run, log-parser, loop-detector, deploy).
- **Micro-loop pattern** applied to all 11 agents (Sibling lessons absorbed).
- **Detailed security + code review reports** — verbatim code quotes, concrete exploitation explanations, file:line anchors.
- **Mode 2 (`sdlc onboard`) overhaul** — high-level architecture pass, operation sequence diagrams, confidence loop.
- Local LLM compatibility fixes across all 11 agents.

### Changed
- Phase agents consolidated into a single `sdlc-lead` program manager with 3 operating modes (init, onboard, feature).
- Install script (`install.sh`) hardened: idempotent clean-reinstall, safely merges Context7 MCP into existing `opencode.json`, checks for Semgrep.
- Agent directory structure + frontmatter fixed for OpenCode compatibility.

## [0.1.0] — 2026-04-06

Initial public release of the BPM OpenCode Expert system.

### Added
- **11 specialist agents**: `sdlc-lead`, `security-auditor`, `researcher`, `test-engineer`, `db-architect`, `ux-engineer`, `sre-engineer`, `container-ops`, `code-reviewer`, `performance-engineer`, `api-designer`.
- **14 slash commands** triggering the agents: `/sdlc`, `/security`, `/research`, `/test-expert`, `/dba`, `/ux`, `/devops`, `/containers`, `/review-code`, `/perf`, `/api-design`, `/gate`, `/review`, `/simplify`.
- **6 reference documents** covering OWASP, engineering artifacts, REST APIs, Playwright, Semgrep, severity matrices.
- **Install scripts** for global (`~/.config/opencode/`) or project-level setup.
- **Full documentation**: expert guide, SDLC guide, contributing guide.
- **Interoperable** with the sibling `claude-experts` project for Claude Code — works with any LLM backend (Claude, OpenAI, Gemini, Ollama, LM Studio, 75+ providers).

[0.7.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.5.0...v0.6.0
[0.3.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bpmforge/bpm-opencode-experts/releases/tag/v0.1.0
