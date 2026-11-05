# MANIFEST — M-T5-test-impact-targets (WP-T5 + T6)

Worked directly on main (from 93e97ef). Spec: `docs/work/TEST_IMPACT_PLAN.md` §5 T5, T6. Not pushed.

## What changed

- `scripts/build-target-claude.mjs`: `COPY_GLOBS` gains `['scripts/test', '.mjs']` (common/resolve/map/ledger/select). The block and the four agents that include it were already generated through the `agents` / `dist/compact-agents` globs.
- **Per-target path:** no new rewrite needed. `agents/shared/blocks/test-impact.md` says `~/.config/opencode/scripts/test/map.mjs`; the existing `PATHS` rule `~/.config/opencode/` -> `~/.claude/` makes the generated `attest-claude/agents/test-engineer.md` (and coding-agent, sdlc-feature-mode, sdlc-improve-mode, compact copies) say `~/.claude/scripts/test/map.mjs`. The leak check stays at 0.
- attest-claude (per-target files): `install.sh` step 4a2 links `scripts/test/*.mjs` into `~/.claude/scripts/test/` (installed validators resolve `$(dirname "$0")/../test` and the agents call that path); `scripts/doctor.sh` checks the five files are present. `uninstall.sh` already removes every link into the checkout.
- **Bug found by the install smoke and fixed in `scripts/test/common.mjs`:** `select.mjs` / `map.mjs` / `ledger.mjs` compared `import.meta.url` with `process.argv[1]`, so through a symlink (how attest-claude installs them) `main()` never ran: exit 0, no output, and `validate-tests.sh` crashed reading a missing select.json. New `isMain()` compares real paths.
- T6: `validate-tests.sh` appends `{ts, source:"tests", scope, selected, total, ms, reason}` from its EXIT trap (so red runs and every exit path record; `EXPERTS_TELEMETRY=0` disables; same file and `date -u` timestamp format as the validator rows in `_lib.sh`). A full run records `selected = total`. Runs that skip before the scope decision (no runner manifest) record nothing. `telemetry-report.mjs` gains the `## Tests` section and `sections.tests` in `--json` (runs by scope, selected/total + ratio, mean/p50/p95/total wall time per scope, mean full run, estimated saved time, top full-run reasons).
- Docs: SDLC_GUIDE Test scope paragraph (flags, Scope line, declare, `Test:` rows, release rule, measure), UNATTENDED_EXECUTION (`--test-scope`, failed-set behaviour, telemetry), TOKEN_OPTIMIZATION_PLAN §G (G1 done), CHANGELOG `[Unreleased]` (Added: T1-T5 and T6; Fixed: set -e red-run abort, symlink entry point). `scripts/test-build-target-modes.ts` already carried the `test-impact` block in its fixture (T4); no change needed.

## Decisions / look here
- "Time saved" = sum over impact runs of max(0, mean full-run ms - run ms); absent (`null`, "not estimable") when the window has no full run, instead of inventing a baseline.
- The `set -e` red-run bug was already fixed inside validate-tests.sh in T3 (errexit off around all three run paths); T5 only documents it under Fixed.
- No existing telemetry-report test chapter existed; the new cases live in `scripts/test-test-impact.ts` (validator rows via a real `node --test` fixture, report via synthetic JSONL).

## Acceptance
| Line | Evidence |
|---|---|
| COPY_FILES/globs include scripts/test/**; build:claude:check green; block in generated agents | 5 files generated, `build:claude:check` green, `~/.claude/scripts/test/map.mjs declare` in attest-claude/agents/test-engineer.md |
| validate-tests.sh telemetry row; report Tests section | 10 new cases in test-test-impact.ts (row shape, full/impact/red/off, report json + text, impact-only, no rows) |
| Docs + CHANGELOG | SDLC_GUIDE, UNATTENDED_EXECUTION, TOKEN_OPTIMIZATION_PLAN §G, CHANGELOG [Unreleased] |
| Installed smoke | install.sh into a scratch HOME; `validate-tests.sh --scope full` through the installed symlinks wrote the ledger and a telemetry row |
