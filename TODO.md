# bpm-opencode-experts — Audit Remediation TODO

**Source audit:** [`docs/AUDIT_2026-05-04.md`](docs/AUDIT_2026-05-04.md)
**Started:** 2026-05-04
**Owner:** Claude (in-session) — checkpointed via git commits per wave

Track every wave to completion. Each wave is independently shippable. Mark `[x]` only when the acceptance criteria pass.

---

## Wave A — Mermaid hygiene [risk: low]

**Goal:** Eliminate the ASCII-chart leakage by removing Unicode box-drawing from agent prompts and adding a Mermaid-only rule to all SDLC modes. Add a generalized validator so it can't recur.

### Tasks

- [x] **A1.** Strip `═══` banner separators from `agents/sdlc-init-mode.md` (81 stripped).
- [x] **A2.** Strip banners from `agents/sdlc-onboard-mode.md` (33 stripped — Unicode + ASCII).
- [x] **A3.** Strip banners from `agents/sdlc-feature-mode.md` (18 stripped).
- [x] **A4.** Strip banners from `agents/sdlc-improve-mode.md` (36 stripped).
- [x] **A5.** Strip banners from `agents/shared/SCOPE_BOUNDARY.md` (3 stripped).
- [x] **A6.** Strip banners from `docs/USERGUIDE.md` (3 stripped).
- [x] **A7.** Added Document Hygiene section with Mermaid-only rule to all 4 SDLC mode files + `sdlc-lead.md`.
- [x] **A8.** Existing `validate-architecture.sh` Mermaid logic kept as-is (works correctly). New validator below covers the broader scope.
- [x] **A9.** Created `scripts/validators/validate-no-ascii-art.sh` — scans every `docs/*.md` for Unicode box-drawing chars + 40+ char ASCII banners; skips Mermaid blocks; excludes `AUDIT_*.md`.
- [x] **A10.** Wired `validate-no-ascii-art.sh` into `validate-phase-gate.sh` for `phase-3` and `onboard-deep`.
- [x] **A11.** Validator runs clean against this repo (215 violations found and fixed in `docs/AGENT_PROCESS_FLOW.md` via Mermaid rewrite; 0 remain).
- [x] **A12.** CHANGELOG.md updated with v0.17.0 entry.
- [x] **A13.** Committed and pushed to Gitea + GitHub (see progress table for SHA).
- [x] **A14.** BONUS: Rewrote `docs/AGENT_PROCESS_FLOW.md` (419 lines of ASCII tree art) as Mermaid `flowchart TD` blocks. Mode 1/3/4 + Ralph Wiggum loop all rendered as proper diagrams.
- [x] **A15.** Stripped 12 banners from `agents/shared/HANDOFF_TEMPLATES.md` to align canonical templates with new convention.
- [x] **A16.** Stripped 3 banners each from `RALPH_WIGGUM_LOOP.md` + `FIX_VERIFY_LOOP.md`.

### Acceptance
- 0 box-drawing characters in `agents/*.md` and `docs/*.md` (excluding scripts).
- `validate-no-ascii-art.sh` runs clean against this repo's own `docs/`.
- Mermaid rule visible in every SDLC mode file's header.

---

## Wave B — Operational gates [risk: medium]

**Goal:** Add validators that EXECUTE the project's own toolchain. Phase-5 release gate must mean "system actually built and tested," not "agent wrote PASS in markdown."

### Tasks

- [ ] **B1.** Create `scripts/validators/validate-build.sh` — auto-detects build command (`npm run build`, `pnpm build`, `cargo build`, `go build ./...`, `python -m build`, etc.), runs it, captures exit code + stderr summary. Writes `docs/reviews/RUNTIME_build_<date>.md`. Exits non-zero on build failure.
- [ ] **B2.** Create `scripts/validators/validate-tests.sh` — auto-detects test runner (`npm test`, `pytest`, `cargo test`, `go test ./...`), runs full suite, parses pass/fail count, writes `docs/reviews/RUNTIME_tests_<date>.md`. Fails if any test fails or count is 0.
- [ ] **B3.** Create `scripts/validators/validate-lint.sh` — auto-detects linter + typechecker (`eslint`, `tsc --noEmit`, `ruff`, `mypy`, `cargo clippy`, `go vet`), runs both, writes summary. Fails on errors (warnings allowed).
- [ ] **B4.** Create `scripts/validators/validate-smoke.sh` — auto-detects start command, boots server in background, waits for port, hits one known route (configurable via `.sdlc/smoke.json` if it exists, else heuristic: `/health`, `/`, `/api/health`), asserts 200. Writes `docs/reviews/RUNTIME_smoke_<date>.md`.
- [ ] **B5.** Create `scripts/validators/validate-deps.sh` — runs `npm audit --json` (or `osv-scanner`, `cargo audit`, `pip-audit` based on stack), parses CRITICAL/HIGH count. Fails if any unwaived CRITICAL.
- [ ] **B6.** Add `.sdlc/sdlc.json` config schema (project-root config file with overrides for non-standard build/test/lint commands and smoke routes). Document in `docs/SDLC_GUIDE.md`.
- [ ] **B7.** Update `validate-phase-gate.sh`:
  - phase-4: chain `validate-build.sh` + `validate-lint.sh` + `validate-tests.sh` (per-module if module flag passed)
  - phase-5: chain B1–B5 + existing release checks
- [ ] **B8.** Update `agents/sdlc-init-mode.md` Phase 4 + Phase 5 to call the new validators (remove the "handled inline" wording).
- [ ] **B9.** Update `agents/sdlc-feature-mode.md` Step 5 to call B1–B4 instead of relying on agent-written `RUNTIME_*.md`.
- [ ] **B10.** Test the validators against this repo (`npm test` works) and at least one TS project + one Python project.
- [ ] **B11.** Update CHANGELOG.md.
- [ ] **B12.** Commit + push.

### Acceptance
- 5 new validators exist, are executable (`chmod +x`), follow `_lib.sh` JSON envelope contract.
- Running `./scripts/validators/validate-phase-gate.sh phase-5` against a deliberately-broken project (failing test) exits non-zero.
- Phase-5 gate references real exit codes, not just grep.

---

## Wave B+ — Completeness gates [risk: medium]

**Goal:** Close the missing coverage dimensions identified in Finding 6. Every "all X are documented" check is enforceable by script.

### Tasks

- [ ] **C1.** Create `scripts/validators/validate-c3-coverage.sh` — enumerate `src/` subdirectories (depth 1, excluding `node_modules`, `__tests__`, etc.). Each subdir must appear in C3 component diagram in `ARCHITECTURE.md` or `docs/diagrams/c3-components.md`.
- [ ] **C2.** Create `scripts/validators/validate-entry-points.sh` — enumerate entry points: `package.json`'s `bin`, `main`, `scripts.start`, `scripts.dev`; Python `__main__.py`, `setup.py` console_scripts; Go `main.go` files; Cron/scheduler decorators. Verify each appears in `docs/ONBOARDING.md` or `docs/diagrams/entry-points.md`.
- [ ] **C3.** Create `scripts/validators/validate-use-cases.sh` — parse `docs/USE_CASES.md` markdown table. Every row must have non-empty: ID, Persona, Trigger, Main Flow, Success Criteria, Priority (P0/P1/P2). Cross-check: every entry point from C2 has at least one use case.
- [ ] **C4.** Create `scripts/validators/validate-user-stories.sh` — every story in `docs/USER_STORIES.md` has acceptance criteria block (`Given/When/Then` or numbered list ≥ 3 items). Cross-check: every persona in `USER_PERSONAS.md` has at least one story.
- [ ] **C5.** Create `scripts/validators/validate-tech-stack.sh` — read `package.json` (or `Cargo.toml`/`go.mod`/`requirements.txt`) dependencies. Every direct dependency must appear in `docs/TECH_STACK.md`. Reverse: TECH_STACK shouldn't reference packages not installed.
- [ ] **C6.** Create `scripts/validators/validate-tests-mapping.sh` — every test file in `tests/` or `__tests__/` references a use case ID (e.g., `// UC-01` comment or describe-block name). Reverse: every P0/P1 use case has at least one test referencing it.
- [ ] **C7.** Create `scripts/validators/validate-fix-backlog-closed.sh` — parse `docs/reviews/FIX_BACKLOG_*.md`. Every CRITICAL/HIGH row must have status `VERIFIED` or `WAIVED-WITH-JUSTIFICATION`. Open rows fail the gate.
- [ ] **C8.** Create `scripts/validators/validate-adrs.sh` — every architectural decision claimed in `ARCHITECTURE.md` or `docs/DECISION_LOG.md` has a corresponding `docs/adrs/ADR-NNN-*.md` file with status `proposed|accepted|deprecated|superseded`.
- [ ] **C9.** Create `scripts/validators/validate-migrations.sh` — every migration file (`migrations/`, `prisma/migrations/`, `db/migrations/`) has a date-ordered companion entry in `docs/DATABASE.md` migration log. Schema-state matches migration tail.
- [ ] **C10.** Update `validate-phase-gate.sh` to call the new validators in appropriate phases:
  - phase-2 → C3 + C4
  - phase-3 → C1 + C2 + C5 + C8
  - phase-4 → C6 + C9
  - phase-5 → C7
  - onboard-deep → C1 + C2 + C3 + C5
- [ ] **C11.** Update `agents/shared/RALPH_WIGGUM_LOOP.md` with the expanded validator catalog.
- [ ] **C12.** Update CHANGELOG.md.
- [ ] **C13.** Commit + push.

### Acceptance
- 9 new completeness validators exist and pass against this repo (or report meaningful gaps).
- `validate-phase-gate.sh` chains them per phase.
- A deliberately-incomplete project (e.g., remove a use case) fails the appropriate gate.

---

## Wave C — Universal Ralph loop [risk: low–medium]

**Goal:** Lift the `--deep` 3-iteration validator-loop pattern out of onboard-only and apply it to every mode + phase advance. Default behavior: validators report gaps → orchestrator emits gap-fill HANDOFFs → re-run validators → max 3 iterations → escalate.

### Tasks

- [ ] **D1.** Create `scripts/validators/run-coverage-loop.sh` — wrapper script: takes a phase or mode + max-iterations + escalation-mode. Runs `validate-phase-gate.sh`. If exit non-zero, parses gap list, emits structured "gap-fill needed" report (markdown + JSON). Records iteration count to `docs/work/COVERAGE_LOOP_<date>.md`.
- [ ] **D2.** Update `agents/shared/RALPH_WIGGUM_LOOP.md` to be the universal coverage-loop spec, not deep-mode-only. Document:
  - 3-iteration default cap
  - Escalation block (waiver / lower-bar / specialist / manual)
  - Inventory format (already there)
  - Hooks for non-deep modes (lighter inventory)
- [ ] **D3.** Update `agents/sdlc-lead.md` to reference the universal loop. Replace the subjective 1-10 confidence loop in the `## Confidence-based gates` section with a two-track approach:
  - Validatable artifacts → coverage loop (objective)
  - Narrative artifacts → confidence loop (subjective)
- [ ] **D4.** Update `agents/sdlc-init-mode.md` Phase 3 and Phase 4 to call `run-coverage-loop.sh` instead of single-shot `validate-phase-gate.sh`.
- [ ] **D5.** Update `agents/sdlc-onboard-mode.md` Step 7 (default) to call `run-coverage-loop.sh onboard` (lighter than deep, but still iterates).
- [ ] **D6.** Update `agents/sdlc-feature-mode.md` Step 5 to use the loop.
- [ ] **D7.** Update `agents/sdlc-improve-mode.md` to use the loop on its audit-coverage matrix.
- [ ] **D8.** Update CHANGELOG.md.
- [ ] **D9.** Commit + push.

### Acceptance
- Every mode that has validatable deliverables iterates until clean or 3-iteration cap.
- Escalation block fires uniformly across modes.
- `docs/work/COVERAGE_LOOP_<date>.md` records iteration history per phase.

---

## Wave D — Default-onboard Ralph [risk: low]

**Goal:** Make the default `/sdlc onboard` (without `--deep`) include a lightweight inventory pass so structural completeness is verified by default. `--deep` remains the exhaustive 45-90min option.

### Tasks

- [ ] **E1.** Define "lightweight inventory" scope: only ROUTE + TABLE categories (no SERVICE/FLOW/ENTRY) for default. Document in `RALPH_WIGGUM_LOOP.md`.
- [ ] **E2.** Update `agents/sdlc-onboard-mode.md`:
  - Default flow runs Steps 1-7 PLUS a lightweight inventory pass (D1-lite + D3-lite from deep-mode flow).
  - `--deep` remains the full Ralph loop with all 5 categories.
  - `--quick` flag added for the existing minimal pass (no inventory).
- [ ] **E3.** Update commands/sdlc-onboard.md help text.
- [ ] **E4.** Update `docs/SDLC_GUIDE.md` and `docs/USERGUIDE.md` to document the three onboard modes (`--quick`, default, `--deep`).
- [ ] **E5.** Update CHANGELOG.md.
- [ ] **E6.** Commit + push.

### Acceptance
- `/sdlc onboard` (no flag) produces `docs/onboard/INVENTORY.md` with ROUTE + TABLE rows and runs `validate-api-coverage.sh` + `validate-erd-coverage.sh`.
- `/sdlc onboard --quick` matches the v0.16 default behavior (no inventory).
- `/sdlc onboard --deep` matches v0.16 deep behavior (full Ralph).

---

## Wave E — Mode file split [risk: HIGH — regression-risky]

**Goal:** Split the remaining monolithic agent files. Reduce per-load token cost. Improve attention quality on local LLMs.

### Tasks

- [ ] **F1.** Map current sdlc-init-mode.md (1868 lines) sections by phase. Confirm each phase is self-contained.
- [ ] **F2.** Split into `agents/sdlc-init-phase-0.md` through `agents/sdlc-init-phase-5.md`. Each ≤ 400 lines.
- [ ] **F3.** Convert `agents/sdlc-init-mode.md` into a router (~150 lines) that loads the active phase file based on `docs/work/sdlc-state.md`.
- [ ] **F4.** Map current security-auditor.md (2227 lines). Identify natural splits: per-OWASP-category? per-mode (quick vs deep)? Document the chosen split.
- [ ] **F5.** Split `security-auditor.md` accordingly. Router stays as `security-auditor.md` (~300 lines).
- [ ] **F6.** Map current performance-engineer.md (1327 lines). Split if a clean boundary exists; otherwise leave (lower priority).
- [ ] **F7.** Update `sdlc-lead.md` agent reference table for any new sub-agent files.
- [ ] **F8.** Update `install.sh` to install all new files.
- [ ] **F9.** End-to-end smoke test: run `/sdlc init` on a sandbox project through Phase 0 + 1, confirm phase-loading works.
- [ ] **F10.** End-to-end smoke test: run `/security --quick` and `/security --deep` on a sandbox project, confirm the router loads the right sub-prompts.
- [ ] **F11.** Update CHANGELOG.md (likely v0.18.0 — minor bump given file restructure).
- [ ] **F12.** Commit + push.

### Acceptance
- No agent file > 600 lines (target).
- `sdlc-init-mode` and `security-auditor` are routers that load sub-files on demand.
- Smoke tests pass on at least one TS project.
- No functionality regressions vs v0.17.

---

## Cross-cutting

- [ ] **X1.** After each wave, run `npm test` (project's own test suite at `scripts/test.ts`) and report pass count.
- [ ] **X2.** After each wave, dual-push to Gitea + GitHub per the user's `~/.claude/CLAUDE.md` rule.
- [ ] **X3.** After Wave E, sync changes back into `claude-experts` repo per the Claude ↔ OpenCode sync rule (`memory/sync-claude-opencode.md`). Same agent/skill/MCP changes must apply there.
- [ ] **X4.** After all waves: run `/sdlc onboard --deep` against a sample TS project as end-to-end validation. Confirm Mermaid output, gate iteration, and operational checks all fire correctly.

---

## Progress tracking

| Wave | Status | Started | Completed | Commit SHA |
|------|--------|---------|-----------|------------|
| A — Mermaid hygiene | not started | | | |
| B — Operational gates | not started | | | |
| B+ — Completeness gates | not started | | | |
| C — Universal loop | not started | | | |
| D — Default Ralph | not started | | | |
| E — Mode file split | not started | | | |
