# Test Impact Plan — run the tests a change can break, not the whole suite

**Status:** proposed 2026-11-05 · **Owner:** Bradford · **Targets:** OpenCode v1, OpenCode v2 and the
Claude target (attest-claude) alike — everything below is shell/node scripts plus agent text, so one
source builds all three; the only per-target pieces are the agent blocks `build-agents.mjs` already
emits per target and the validator copies `build:claude` already generates.

## 1. Problem (verified in this repo)

| Where tests run | Today | Evidence |
|---|---|---|
| Per coding HANDOFF | full suite | `scripts/validators/run-handoff-gates.sh` gate 5 `--runtime` → `validate-build/lint` (tests are not run here yet, but `validate-tests.sh` is the only runner) |
| Per ticket (conductor Round 3) | full suite | `scripts/conductor/conductor.mjs:1337-1374` → `validate-tests.sh` |
| Per phase gate and every coverage-loop iteration (≤3) | full suite | `validate-phase-gate.sh:129,168` |
| `/sdlc feature` step 3 gate | "all feature tests" + "all existing P0 tests" = full | `agents/sdlc-feature-mode.md:553-558` |
| `validate-tests.sh` itself | `npm test` / `pytest` / `cargo test` / `go test ./...` / `npx playwright test` — no file list, no `--changed` | `scripts/validators/validate-tests.sh:85-140` |
| Test writing | test-engineer writes "one spec per P0 use case"; its changed-function audit (`:590-594`) is a report only | `agents/test-engineer.md` |
| Coverage map | none — `validate-tests-mapping.sh` maps use cases ↔ test files by UC-ID, not source ↔ tests | `scripts/validators/validate-tests-mapping.sh` |

Cost grows with the project: every "change a colour" ticket pays for the import-layer tests, and the
coverage loop pays it three times.

## 2. Design

Three artifacts and one policy, mirroring the scan ledger (`INCREMENTAL_SCAN_PLAN.md` §1):

1. **Impact map** `docs/work/test/map.json` — `{ "<test file>": { "covers": [source files], "kind": "unit|integration|e2e|smoke", "uc": ["UC-03"], "last_run": {sha, result, ms} } }`. Built by `scripts/test/map.mjs` from (a) the runner's own graph where one exists, (b) static import resolution for TS/JS/Python/Go/Rust (reuse the code-search index when present, regex fallback), (c) the UC-ID mapping the validators already parse, (d) test-engineer declaring `covers` when it writes a test (see §4). Refreshed incrementally (mtime/sha per test file), never rebuilt from scratch unless `--full`.
2. **Test ledger** `docs/work/test/ledger.json` — last **green full run** (tree hash, sha, date, runner versions), per-test-file last result and last-run date, and the chain count of impact-scoped runs since the last full. Git-ignored like the scan ledger.
3. **Selector** `scripts/test/select.mjs` — input: a diff range (default: ledger full-run sha…HEAD ∪ dirty files; or `--base/--head`; or a ticket's `write_scope`). Output: `{ scope: "impact"|"full", reason, tests: [...], skipped: n }`.
   - **Runner-native selection first** (fast and exact): vitest `--changed <ref>` / `related <files>`; jest `--changedSince <ref>` / `--findRelatedTests`; Playwright `--only-changed <ref>`; Go `go list -deps` reverse closure → affected packages; Cargo `cargo metadata` → affected workspace crates; pytest via `pytest-testmon` when installed, else the static map.
   - **Union with**: the `always` set (`.sdlc/sdlc.json` `test.always` globs — smoke, contract, auth P0; default: every test mapped to a P0 use case), every test that failed or was skipped in the last run, tests whose `covers` intersects the change, tests not run for more than `test.rolling_days` (default 7) — this is what turns a sequence of impact runs into full coverage over time without ever paying for it all at once.
   - **Force full** when: no ledger / ledger sha not an ancestor; changed-file count > `test.max_changed` (400); any **global input** changed (lockfiles, `package.json`/`pyproject`/`Cargo.toml`/`go.mod`, test runner config, `conftest.py`, shared fixtures/setup dirs, CI config, `.sdlc/sdlc.json`); every 20th impact run; `--full`; the integration review and the release gate.
4. **Policy, by tier** (same two tiers as the scans):
   - per HANDOFF / per ticket / coverage-loop iterations 2–3 → `impact`;
   - once per branch (`integration-review.mjs`) and `validate-release-readiness.sh` → `full`, and a full run refreshes the ledger.

`validate-tests.sh` keeps its output contract (`RUNTIME_tests_<date>.md`, pass/fail counts, JSON for the UC verdicts) and adds a `Scope:` line: `Scope: impact — 23 of 412 test files (389 unaffected, 6 always, 2 rolling); last full 2026-11-03 @ 8e1c2f0`.

## 3. Why this is safe

- The runner-native selectors use the real module graph, so a shared utility change selects every test that imports it transitively. A test with no static link to the change (fixtures read at runtime, env-driven behaviour) is the residual risk, covered three ways: the `always` set, the rolling window, and the forced full run at integration and release. Same argument as the scan ledger's drift guard.
- Global-input changes always go full, so a dependency bump never rides an impact run.
- Nothing is deleted or skipped silently: the report names the count and the reason, and the ledger shows when every file last ran.

## 4. Writing tests and the backlog (test-engineer, coding-agent, FIX_BACKLOG)

- **Unit of work is the changed function, not the file.** test-engineer's existing audit (`git diff -U0` → changed/added functions, `:590-594`) becomes the *input* to test writing: for a feature or fix, write tests for the functions in the diff, record each new test's `covers` (the source files it imports/exercises) in `map.json`, and say in the HANDOFF report which changed functions are now covered, which were already covered (cite the test), and which were rated nice-to-have and left.
- **Backlog text**: `FIX_BACKLOG_*.md` rows that need a test get `Test: <file>::<name> (new|existing)`; `validate-fix-backlog-closed.sh` accepts a row as closed only when the named test passed in the latest run (it reads the ledger).
- **P0 gate stays**: `sdlc-feature-mode` step 3 becomes "the impact selection + the P0 always set must pass"; the full run moves to the integration review the mode already runs.
- **Flake guard**: a test that fails on an impact run and passes on re-run alone is marked `flaky` in the map and reported, not retried forever.

## 5. Work packages

| WP | What | Files | Size |
|---|---|---|---|
| T1 | `scripts/test/map.mjs` (impact map build + incremental refresh; TS/JS, Python, Go, Rust import resolution; UC-ID join; code-search index when available) + `scripts/test/ledger.mjs` | `scripts/test/**`, `scripts/test-test-impact.ts`, `.gitignore` | M |
| T2 | `scripts/test/select.mjs` with the runner-native selectors (vitest/jest/playwright/go/cargo/pytest-testmon) and the generic map fallback; `.sdlc/sdlc.json` keys `test.always`, `test.rolling_days`, `test.max_changed`, `test.global_inputs` | `scripts/test/**`, `scripts/validators/_lib_sdlc_config.sh`, docs | M |
| T3 | `validate-tests.sh --scope auto|impact|full` (default auto) using T2; `Scope:` line; ledger update on green full; JSON results still written; `run-handoff-gates.sh --runtime` runs tests at impact scope; `validate-phase-gate.sh` / `run-coverage-loop.sh` pass the scope; conductor Round 3 default impact with `--test-scope full` flag; `integration-review.mjs` and `validate-release-readiness.sh` force full | validators, conductor, integration-review | M |
| T4 | Agents: `agents/shared/blocks/test-impact.md` (+compact) included by test-engineer, coding-agent, sdlc-feature-mode, sdlc-improve-mode: changed-function unit, `covers` declaration, backlog `Test:` rows, the gate wording; `validate-fix-backlog-closed.sh` reads the ledger | agents, blocks, build-agents registry, validator | M |
| T5 | Targets: `agents:check` for v1 and v2; `build:claude` copies `scripts/test/**` (add to COPY_FILES) and the block; smoke on the installed attest-claude; docs (`SDLC_GUIDE.md`, `UNATTENDED_EXECUTION.md`, `TOKEN_OPTIMIZATION_PLAN.md` §G) | build-target-claude, docs | S |
| T6 | Measure: telemetry rows `source:"tests"` with scope, selected/total, wall time; `telemetry-report.mjs` section | plugin lib + report | S |

Order T1 → T2 → T3 → T4 → T5/T6. Acceptance for the whole plan: on this repo (attest's own `scripts/test.ts` harness) and on one target project per stack in `evals/` fixtures, a one-file change runs < 25 % of the suite with the touching tests included; a lockfile change runs full; the rolling window brings every test file through within `rolling_days`; both OpenCode targets and attest-claude pass `agents:check` / `build:claude:check`.

## 6. Open decisions

- D1 `rolling_days` default 7 vs 14 (shorter = more coverage per week, bigger impact runs).
- D2 Should the P0 always-set be derived from the UC map automatically (proposed) or declared only?
- D3 pytest without `pytest-testmon`: static map only (proposed) vs. require testmon in `install.sh --tools`.
