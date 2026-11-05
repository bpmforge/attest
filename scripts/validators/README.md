# Validators

Shell scripts that enforce SDLC deliverable completeness without orchestrator judgment. Each validator:

- Takes an optional `<project-root>` argument (defaults to `pwd`)
- Emits a gap list to stderr (human-readable)
- Emits a JSON envelope to stdout (machine-readable)
- Exits `0` if clean, `1` if gaps found, `2` if the validator itself errored

## Contract

```bash
./validate-<name>.sh [project-root]
```

Stdout JSON schema:
```json
{
  "validator": "validate-architecture",
  "gaps": 2,
  "exit": 1,
  "items": [
    {"category": "missing-diagram", "detail": "C3 component diagram not found"},
    {"category": "placeholder", "detail": "ARCHITECTURE.md contains PLACEHOLDER markers"}
  ]
}
```

## Validators

| Script | Checks |
|--------|--------|
| `validate-architecture.sh` | 6 diagram types present, Mermaid syntax valid, HLA overview, no placeholders |
| `validate-owasp.sh` | All 10 OWASP categories present, confidence >= 7, status DONE, `ATTACK_CHAINS_<date>.md` (or legacy `attack-chains.md`) present |
| `validate-api-coverage.sh` | Every route in source has a row in API_DESIGN.md AND openapi.yaml. JSON-Schema contract mode (no HTTP API: MCP servers, native messaging, CLIs): every backticked name in an API_DESIGN.md table's Tool/Endpoint/Operation/Command/Method/RPC column has a `docs/api/schemas/*.json` file with a matching `.`-separated basename segment (case-insensitive, `-`/`_` ignored), and every schema parses. Selected by `api_contract_mode` in `_lib.sh`: no openapi.yaml + ≥1 schema + a "no HTTP API" / "JSON Schema contracts" line in DESIGN_CONTEXT.md or API_DESIGN.md |
| `validate-erd-coverage.sh` | Every table/model has an ERD entry; erDiagram mermaid block present |
| `validate-sequence-coverage.sh` | Every P0 use case has a sequence diagram |
| `validate-inventory.sh` | Every row in INVENTORY.md has a corresponding artifact |
| `validate-scope.sh` | Git writes stay inside assigned directory (post-HANDOFF gate) |
| `validate-completion-manifest.sh` | HANDOFF manifest has required sections + completion phrase |
| `validate-phase-gate.sh` | Orchestrator that runs all validators for a given phase |

## Orchestrator usage

```bash
# Phase gates
./validate-phase-gate.sh phase-3        # Design phase
./validate-phase-gate.sh onboard-deep   # Deep onboard mode
./validate-phase-gate.sh security-deep  # Deep security mode
./validate-phase-gate.sh phase-5        # Release gate
```

## Incremental scans and the result cache (M-A6)

Opt-in per validator via `validator_parse_flags` in `_lib.sh`:

- `--since <ref>` / `VALIDATE_SINCE=<ref>` -- per-file validators (`validate-lint`,
  `validate-code-health`, `validate-mermaid`, `validate-doc-render-health`,
  `validate-no-ascii-art`) walk only files changed since `<ref>` (merge-base
  semantics, plus dirty and untracked files). No flag = whole tree, unchanged.
  The envelope gains `"scope":{"since":...,"files":[...]}` listing what was
  examined. `validator_changed_files` returns 0 (output may be empty = nothing
  changed) when scoped and 3 when there is no usable scope (= all files).
  `validate-lint` substitutes the file list for a `{files}` token or a trailing
  `.` on `eslint`/`ruff check`/`biome check|lint`; other commands run unchanged
  and read `$VALIDATE_CHANGED_FILES`. It skips lint + typecheck when no lintable
  file changed.
- Whole-tree validators (`validate-dead-code`, `validate-deps`,
  `validate-module-boundaries`, `validate-module-boundaries-transitive`,
  `validate-circular-deps`, and `validate-mermaid`) are wrapped in a result cache
  under `docs/work/.validator-cache/` (git-ignored). Key = sha256 of `HEAD^{tree}`
  + hash of every dirty/untracked file + the validator script + `_lib.sh` + args.
  A hit prints `cached: true (key ...)` on stderr and replays the stored stdout
  and exit code. `--no-cache` / `VALIDATE_NO_CACHE=1` bypasses. Skipped when
  `$ROOT` is not a git top level. Validator outputs (`docs/reviews/RUNTIME_*`,
  `docs/work/telemetry.jsonl`, `docs/work/gates/`, coverage-loop files) are not
  counted as dirty inputs. `validate-deps` also keys on the UTC date, since the
  advisory database moves without the tree.
- `run-coverage-loop.sh` exports `VALIDATE_SINCE=$(git merge-base main HEAD)` for
  `feature`/`improve`; `run-handoff-gates.sh --runtime` passes
  `--since "$TRACKER_SINCE"` to `validate-lint.sh`.

## Test scope: `validate-tests.sh --scope auto|impact|full` (WP-T3)

`validate-tests.sh [root] [--scope auto|impact|full]` (default `auto`, or `$TEST_SCOPE`) runs
only the test files a change can break, using `scripts/test/` (impact map, selector, ledger;
`docs/work/TEST_IMPACT_PLAN.md`). It refreshes the map, asks `select.mjs --json`, and runs each
detected runner with just its selection: vitest / jest / playwright / node file arguments, go
package arguments, cargo `-p <crate>` (one run per crate), pytest file arguments (plus
`--testmon` when pytest-testmon is installed). `auto` and `impact` take the same decision
(impact unless the selector says full); `full` runs the project's own test command.

- One line on stderr and at the top of `RUNTIME_tests_<date>.md`:
  `Scope: impact — <n> of <total> (<unaffected> unaffected, <always> always, <rolling> rolling); last full <date> @ <sha7>`
  or `Scope: full — <reason>` (`requested (--scope full)`, `no-ledger`, `global-input:<file>`,
  `chain>=20`, `custom-test-command ...`, ...). The verdict line, pass/fail counts, the JSON
  envelope on stdout and `test-results.json` (what ran, for `validate-tests-mapping.sh`) are unchanged.
- Safety wins over the request: no/stale ledger, a global input changed (lockfile, manifest,
  runner config, fixtures/setup dirs, CI, `.sdlc/sdlc.json`), > `test.max_changed` changed files,
  every 20th impact run, or a custom `"test"` command in `.sdlc/sdlc.json` all run full.
- Every run records per-file results in `docs/work/test/ledger.json` (vitest/jest/playwright
  JSON reports, `pytest -rA`, `go test -json` per package, cargo per crate; otherwise the
  selected files get the run's overall result). Impact runs advance the chain; a **green full**
  run (requested or escalated) writes the baseline (`sha`, `date`) and resets it. A red selected
  test is reported (`tests-failed`) and recorded; nothing is re-run automatically, and the next
  run re-selects it.
- A full run covers every runner the map knows: when a Playwright config exists and the map also
  holds other tests, the Playwright half is followed by the project's test command.
- Callers: `run-handoff-gates.sh --runtime [--test-scope impact|auto|full]` (default `impact`; the
  existing `--scope` there is the git-writes scope dir); `validate-phase-gate.sh <phase> [root]
  [--test-scope ...]`; `run-coverage-loop.sh <phase> [root] [--test-scope ...]` (iteration 1 keeps
  the phase gate's default, iterations 2-3 default to `impact`). **phase-5 is always full**, and
  `validate-release-readiness.sh` refuses (gaps `no-full-test-run` / `full-test-run-stale` /
  `full-test-run-not-ancestor`) unless the ledger's last green full-run sha **is HEAD**: a release
  needs a green `validate-tests.sh --scope full` on the release commit. Projects with no test
  runner manifest skip the check. Conductor Round 3: `--test-scope`; `integration-review.mjs`
  always runs `validate-tests.sh --scope full`.

## Platform support

- macOS (bash 3.2.57+)
- Linux (bash 4+)
- Windows via WSL2

## Known limits

- Route discovery is best-effort across Express/Fastify/Next.js/FastAPI/Go. Custom frameworks will be missed.
- Table discovery covers Prisma, TypeORM, Sequelize, Knex, SQLAlchemy, Django, raw SQL. GORM structs detected via `gorm:` tag grep (imperfect).
- `validate-sequence-coverage.sh` looks for UC-NN identifiers above/in sequenceDiagram mermaid blocks. False negatives possible if the convention differs.
- Under `_lib.sh`'s `set -euo pipefail`, never make a decision with `producer | grep -q` (or `| head -1 | grep -q .`): grep exits early, the producer takes SIGPIPE once its output passes a pipe buffer, the pipeline returns 141 and the `if` reads "no match". Use `grep -q x <<< "$VAR"`, `grep -q x FILE`, or `find ... -print -quit`.

## Adding a validator

1. Create `validate-<name>.sh` in this directory
2. Source `_lib.sh` at the top
3. Call `validator_init "<name>"` first
4. Call `gap "<category>" "<detail>"` for every gap
5. Call `validator_exit` at the end
6. `chmod +x` the script
7. If it belongs to a phase gate, add it to the case statement in `validate-phase-gate.sh`

## Bash 3.2 gotchas

macOS ships with bash 3.2.57, which has quirks:

- Triple-backticks inside `[[ ... ]]` comparisons or double-quoted strings mis-parse. Workaround: bind the literal to a variable via `printf '%s' '...'` first, then compare via `"$var"`.
- UTF-8 box-drawing characters and em-dashes in double-quoted strings can cause `unexpected EOF` parse errors. Workaround: use ASCII in code; unicode in output is fine via `printf` format strings.
- Keep scripts `shellcheck` clean.
