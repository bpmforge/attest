chore(release): v3.16.0 — test-impact selection

Per ticket, run only the tests a change can break instead of the whole suite;
full runs move to the integration review and the release gate.

- scripts/test/map.mjs: impact map (test file -> repo files it transitively
  imports; TS/JS, Python, Go, Rust; path literals for spawn-style harnesses;
  declared covers in a committed .sdlc/test-covers.json), incremental refresh.
- scripts/test/select.mjs: runner-native selection (vitest / jest / playwright
  / go list -deps / cargo metadata / pytest-testmon) ∪ map ∪ always (P0),
  failed-last-run and rolling (7 days) sets; forced full on no ledger, global
  inputs (lockfiles, manifests, runner configs, CI, .sdlc), > 400 files or 20
  chained impact runs.
- validate-tests.sh --scope auto|impact|full with a Scope: line and a test
  ledger; handoff gates, phase gate, coverage loop and conductor (--test-scope)
  default to impact; integration review forces full; release readiness refuses
  a release without a green full run on HEAD.
- test-impact shared block: the changed function is the unit of test work,
  new tests declare covers, FIX_BACKLOG rows carry Test: <file>::<name> and
  close only against the ledger.
- Telemetry rows source:"tests" and a ## Tests section in telemetry-report.
- Fixed: validate-tests.sh aborted before writing its report on a red suite;
  scripts/test/*.mjs did nothing when run through a symlink.
- Claude target: scripts/test/** copied; install.sh links it, doctor checks it.

On attest itself: a one-file change now runs 14 of 101 test files.
Upgrade: ./install.sh --update && doctor.sh
