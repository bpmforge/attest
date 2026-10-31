# MANIFEST: M-A3-fix-verify-delta (WP-A3)

Branch: feat/M-A3-fix-verify-delta. Spec: docs/work/INCREMENTAL_SCAN_PLAN.md section 4 WP-A3 and claim C3.

## Files changed
- scripts/fix-verify.mjs: snapshot records `head_sha`; verify (semgrep source) scans only cited + changed + dirty files and carries baseline findings forward; `--full`; `FIXVERIFY_DIFF_CAP` (default 300); log line `scanned_files: <n> of <total tracked files>`; report JSON gains `scope`, `scanned_files`, `total_files`.
- scripts/semgrep-full-audit.sh: new `--paths <file>` (newline-separated list, passed to the engine as explicit targets). Arg parsing changed from a `for` loop to a `while` loop so `--baseline REF` / `--paths FILE` consume their value (the old `shift; break` inside `for` was a no-op shift and stopped parsing further flags).
- scripts/test-fix-verify.ts: 5 new tests (see below).
- Validators (validate-*.sh) untouched; validator sources always use the whole-tree path (scope reason `validator`).

## Design
- Target set = files cited by baseline findings (path part of `file:line`) U `git diff --name-only <head_sha>..HEAD` U `git status --porcelain` (untracked included, rename sources included). Deduped, existing regular files only.
- Findings of files in the target set but no longer on disk (deleted/renamed) are NOT carried forward, so they classify CLOSED. Findings for files outside the target set are copied forward byte-identical (same id/fingerprint).
- CLOSED/OPEN/NEW/REGRESSED, history, tier ceilings and exit codes are unchanged code running on the merged set.
- Auto-full reasons (logged as `scope: full (<reason>)`): `--full`, baseline lacks `head_sha`, git delta unavailable (unknown sha / not a repo), targets > FIXVERIFY_DIFF_CAP. Snapshot is always whole-tree.
- Empty target set: engine not run, nothing stale read (results JSON is removed before every partial scan).
- Excluded from targets: `node_modules/` and `docs/security/` (the scan's own baseline/history/results/log outputs would otherwise always appear dirty). `--baseline REF` is deliberately not used (C3).

## Evidence
Test seam: a fake `opengrep` on PATH (`SAST_ENGINE=opengrep`, `RULEPACKS_DIR` tmp) that reports `VULN(name)` markers in the files it is given and logs its targets; real fix-verify.mjs + semgrep-full-audit.sh run against a 6-file temp git repo.
- Fix one finding: 1 CLOSED, 2 OPEN with ids identical to baseline, 0 NEW. PASS
- scanned_files: `3 of 6`; engine target list had no uncited/unchanged file. PASS
- New finding in a dirty changed file: 1 NEW (fake.xss), 3 OPEN carried, scope delta. PASS
- Baseline without head_sha: `scope: full (baseline lacks head_sha)`, 6 of 6, engine scanned whole tree, CLOSED/OPEN still correct. PASS
- `--full` and `FIXVERIFY_DIFF_CAP=1`: both go full. PASS

Full suite (`npm test`): baseline before change 1078 passed / 4 failed; after 1083 passed / 4 failed (+5 new tests, same pre-existing 4 failures, none added).

## Not covered / notes
- No real opengrep/semgrep exists in the dev environment; the real engine's handling of explicit file targets is standard CLI behavior but was exercised only through the fake.
- Cross-file (Pro/custom) rules are not re-evaluated for untouched files (plan C8); `--full` is the drift guard.
