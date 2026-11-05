# MANIFEST — M-T2-test-select (WP-T2)

Branch `feat/test-impact-map-select`, commit b5bed19. Spec: `docs/work/TEST_IMPACT_PLAN.md` §2.3, §5 T2, §6 (defaults: rolling_days 7, P0 always-set derived from the UC map, pytest without testmon -> static map).

## What changed

- `scripts/test/select.mjs [--root] [--base/--head] [--full] [--json out] [--ticket-scope globs]... [--index]`. Changed set = `--base..--head` (range mode, no ledger needed), else `<ledger full sha>..HEAD` + dirty/untracked + files dirty at the last recorded run; `--ticket-scope` globs (comma/space separated, repeatable) expand over the repo and count as changed. The map is refreshed first (incremental); the previous map's `covers` are also consulted so a deleted source still selects its former importers.
- Output: `{scope, reason, total, selected[], skipped, changed, base, head, always, rolling, failed, mapped, native, unmapped, last_full, scope_line, by_runner, why}`; stderr prints the plan's `Scope:` line. `by_runner[r] = {mode:"files"|"args", files, args, union, cwd, native, projects?}` (`projects[]` only when a runner spans several project dirs).
- by_runner modes: vitest `files` (`vitest list --filesOnly --changed <ref>`), jest `files` (`--listTests --findRelatedTests <changed>`), playwright `files` (`test --list --only-changed=<ref> --reporter=json`), node / pytest-without-testmon `files` (static map), pytest + testmon `args` `["--testmon"]` with `union:false` (run it AND `pytest <files>` for the policy extras), go `args` (`./pkg` dirs, `union:true`, from `go list -deps` reverse import closure incl. test imports), cargo `args` (`-p crate…`, `union:true`, `cargo metadata --no-deps --offline`: owning crates + workspace dependents). With `union:true` args are the complete selection and `files` informational. A missing/failing native command falls back to `files` from the map (`native: "map (<runner> failed: …)"`).
- Union: map covers ∩ changed, changed test files, always (`test.always` globs replace the default; default = tests with a P0 uc), last-run fail/skip/flaky, rolling (> `test.rolling_days`; effective last run = later of the file's record and the last green full date, so a ledger without per-file rows does not select everything).
- Forced full (reason string): `full-flag`, `no-ledger`, `ledger-not-ancestor`, `bad-range`, `no-tests-found` (nothing discovered -> default command), `global-input:<path>`, `changed>N`, `chain>=20`. Global inputs: lockfiles, package.json/pyproject/setup.*/Cargo.toml/go.mod/go.work/go.sum, tsconfig*/jsconfig, babel config, vitest/jest/playwright/vite config + setup, conftest.py, pytest.ini/tox.ini, requirements*.txt, `fixtures/ __fixtures__/ setup/ __mocks__/` dirs, `.github/`, `.circleci/`, `.gitlab-ci.yml`, `.sdlc/sdlc.json`, `test.global_inputs`.
- `_lib_sdlc_config.sh`: `sdlc_test_key <key> <default>` (key with or without `test.`; root from `SDLC_ROOT`, else `ROOT`, else `$PWD`); jq with python3 fallback; absent file/key prints the default. Because `test` is already the test-command string, the canonical keys are flat dotted (`"test.always"` …); a nested `{"test":{…}}` object is also read (selector and helper agree).
- `docs/SDLC_GUIDE.md`: "Test scope" paragraph beside the integration-tier paragraph.
- `scripts/test-test-impact.ts` registered as Pass 56 (72 assertions, ~5 s, shared with T1).

## Limits / decisions (for reviewers)

- go uses `go list -deps -e -f` over `./...` and keeps module-local packages; the reverse closure follows production imports, and a package is selected when its own test imports (TestImports/XTestImports) hit the closure. Single go.mod per project dir assumed (nested modules get one `projects[]` entry each via the map's project field).
- "every 20th impact run": implemented as `chain >= 20` (override `TEST_MAX_CHAIN`), per the ticket text; scan's collect.sh uses the 20th-increment variant.
- vitest/jest/playwright natives run only when `node_modules/.bin/<tool>` exists at/above the project dir; tests use stubs for their argument forms. By hand on a scratch repo with real vitest 2 / jest 29 / Playwright 1.49: vitest `list --filesOnly --changed` and jest `--listTests --findRelatedTests` return file lists; Playwright `--only-changed` only reported directly edited specs (no transitive follow), so playwright selection relies on the map union. `vitest list` has no `related` form, hence `--changed <ref>`.
- Changed files outside the import graph that are not docs (data, SQL, env) are counted in `unmapped` but select nothing by themselves (plan §3 residual risk: always set, rolling window, forced full at integration/release).
- `--ticket-scope` that matches a global input (e.g. a package.json inside the scope) forces full by design.

## Acceptance checklist (evidence: Pass 56)

| Acceptance line | Evidence |
|---|---|
| select.mjs range or ledger-derived -> {scope, reason, tests, skipped}; runner-native + map fallback | "--base/--head selects by the committed range", "ledger mode diffs <full sha>..HEAD", vitest/playwright/jest stub tests (ledger sha passed as ref, results unioned, failing native -> map), go args test, cargo args tests, pytest testmon args test |
| union with test.always (default P0), failures/skips, covers, rolling | "changing the util selects exactly its transitive importers + the P0 always-set, not the unrelated tests", "test.always globs replace the P0 default", "last-run failures are always selected", "last-run skips and flaky tests are selected", "rolling adds only the file not run for > 7 days" |
| forced full: no/non-ancestor ledger, > max_changed, global inputs, 20th run, --full | "no ledger -> full", "ledger sha that is not an ancestor", "more than test.max_changed", lockfile / vitest.config / .github / fixtures / setup / go.mod / Cargo.toml / conftest.py / test.global_inputs tests, "chain of 20 … forces full", "chain 19 is still impact", "--full" |
| _lib_sdlc_config.sh test.* keys with defaults; each rule tested; npm test green | "sdlc_test_key reads test.* keys with defaults", "falls back to the default when .sdlc/sdlc.json is absent"; `npm test` 1385 passed / 0 failed |

Not done here (later tickets): `validate-tests.sh --scope` (T3) consuming `by_runner`, writing the ledger on green runs, agent text (T4).
