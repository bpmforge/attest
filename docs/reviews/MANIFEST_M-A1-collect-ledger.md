# MANIFEST — M-A1-collect-ledger (WP-A1)

Branch `feat/M-A1-collect-ledger`. Spec: `docs/work/INCREMENTAL_SCAN_PLAN.md` §1, §2 A1/A2, §4 WP-A1, §7 (D1a, D2a, D3b).

## What changed

- `scripts/scan/collect.sh` (extended, not rewritten; range mode and output shape kept)
  - New args: `--mode auto|full|diff` (default auto), `--full`, `--ledger <path>` (default `docs/work/scan/ledger.json`), `--expand-importers on|off` (default off; `on` is an accepted, documented no-op recorded as `meta.expand_importers="requested-noop"`, D2a). `--help` documents all of it.
  - Ledger entry per scanner: `{head_sha, tree_hash, tool_version, rules_hash, json, scope, date, increments, base_full_sha}` plus `lockfile_hash` (deps) and `dirty_files` (file-level scanners; so a file that was dirty at the last run and later reverted is re-scanned).
  - auto resolution per scanner (semgrep/secrets/complexity): diff when entry exists AND `git merge-base --is-ancestor` AND tool_version and rules_hash unchanged AND prior JSON still holds the result (`at_sha` stamp) AND changed count <= `SCAN_DIFF_CAP` (400) AND not the `SCAN_MAX_INCREMENTAL`-th (20) chained increment (D3b). Otherwise full; the reason is in `meta.resolution`.
  - Changed set = `git diff --no-renames --name-only --diff-filter=ACMRD <ledger_sha> HEAD` + `git status --porcelain -uall` paths + the ledger's prior dirty files (scan output/ledger excluded).
  - Merge: drop prior findings whose path is changed-or-deleted, append new; `meta.scope="incremental"`, `meta.base_full_sha`, `meta.changed_files`, `meta.carried_forward`; per-scanner `scope/carried_forward/base_full_sha/changed`.
  - deps: `status:"cached"` (prior findings copied, `cached_from`) when lockfile hash unchanged and `audited_on` is today (UTC). deadcode/dup: cached only when `HEAD^{tree}` unchanged AND working tree clean (tree_hash is not recorded when the tree was dirty). `--full` runs everything.
  - Ledger updated after every successful non-range run; range mode never reads or writes it.
  - stderr totals: `scope=incremental base=<sha7> changed=<n> semgrep=...`; `scope=tree` / `scope=range` otherwise (note: now prefixed `scope=`; only humans/logs read this line, the conductor parses the JSON).
  - Bug fixed on the way: a scanner that exits 0 with empty output (e.g. `npm` missing) left an empty JSON file and shifted the `jq -s` slice indices, mislabelling later scanners. Empty/invalid scanner files are now replaced with `{"status":"error"}`.
- `scripts/test-collect-incremental.ts` (new, 38 assertions, ~15 s, tmp git fixture, stub semgrep/npm/knip on PATH) and registered in `scripts/test.ts` (Pass 54).
- `.gitignore`: no edit needed. `docs/work/scan/` (line 88) already ignores the ledger and every `docs/work/scan/*.json` (verified with `git check-ignore -v`).

## Design decisions / limits (for reviewers)

- Overall `meta.scope` is `incremental` only if every file-level scanner that ran was diff; if any (e.g. semgrep after a `.semgrep/` change) went full, it is `tree` (per-scanner scopes are in each scanner block and `meta.resolution`).
- "Every 20th increment forces full": the 20th chained increment is replaced by a full run (19 increments, then full; counter resets). `--mode diff` bypasses the cap and counter.
- trufflehog and radon always scan the whole tree (never diff) because mixing their output with the grep battery / path-scoped runs would be inconsistent; reason `trufflehog-tree-only` / `radon-tree-only`.
- deps cache daily rule (WP-A6 style): ledger stores `deps.audited_on: YYYY-MM-DD` (UTC); cached only when lockfile hash is equal AND `audited_on` == today, so an unchanged lockfile is re-audited at most once per day and new advisories are picked up. `--full` always runs. Tests: "deps cached again on the same day", "deps re-audited when ledger audited_on is yesterday".
- `rules_hash` covers `.semgrep/**` and `$RULEPACKS_DIR` content, not remote `--config auto` registry rules (unhashable).
- Only trusted when `--root` is the git toplevel (otherwise always full, no ledger).

## Acceptance checklist (evidence: `node --experimental-strip-types` via `npm test`, Pass 54)

| Acceptance line | Evidence |
|---|---|
| accepts `--mode`, `--full`, `--ledger`, `--expand-importers`; ledger default git-ignored | `--help` output; `git check-ignore -v docs/work/scan/ledger.json` -> `.gitignore:88:docs/work/scan/`; tests "--expand-importers accepted", "invalid --mode exits 2", "ledger is git-ignored" |
| auto: ancestor + tool/rules unchanged -> diff over ACMRD + dirty, cap 400, no ledger -> full | tests "auto run prints scope=incremental base=<sha7> changed=1", "no ledger -> full", "ledger sha not an ancestor -> full", "uncommitted edit is picked up", "reverted file is re-scanned" |
| deps cached on same lockfile and same UTC day; deadcode/dup cached on same tree + clean; `--full` runs all | tests "deps cached when lockfile unchanged" (npm stub called once), "deadcode cached ... clean", "deadcode re-run on a dirty tree", "deps re-run when lockfile hash changes", "--mode full re-runs deps and deadcode" |
| diff merge + meta fields + totals line | tests "meta.scope == incremental", "meta.changed_files / base_full_sha / carried_forward set", "deleted file's carried findings are dropped", "changed file's stale finding replaced" |
| every 20th increment forces full; ledger updated every run | test "SCAN_MAX_INCREMENTAL-th increment forces full and resets the counter" (run with N=2); ledger assertions in test 1 |
| test proves untouched-file findings identical, `.semgrep/` change forces full, range unchanged | tests "findings for untouched a.js/d.js identical to the full run", "incremental == fresh full run", "changing .semgrep/ forces a full run (scope=tree, rules-changed)", "--base/--head still scans only the range", "range mode does not touch the ledger"; conductor suite still green (95 tests) |
| missing tools -> `status:"skipped"`, valid JSON | tests "scanners that are not installed still emit status skipped", "output passes jq -e ." |

Caveat: no real semgrep/lizard is installed in this environment, so semgrep merge behaviour is proven with a stub that emits real semgrep JSON shape; the secrets grep battery is exercised for real.

## Test counts (`timeout 170 npm test`)

- Baseline (before): 1078 passed, 4 failed
- After: 1116 passed, 4 failed (+38 new; the same 4 pre-existing failures: session-model-receipt unclassified row, validate-vendor-provenance RED, `--check reports mode drift`, `--write restores mode`)
