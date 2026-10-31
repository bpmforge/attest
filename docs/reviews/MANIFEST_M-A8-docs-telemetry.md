# Completion Manifest — M-A8-docs-telemetry (WP-A8)

Branch `feat/M-A8-docs-telemetry` off main `7b16c1d`.

## Files modified
- `docs/work/TOKEN_OPTIMIZATION_PLAN.md`: header update line; section 1 gains the measured fact (79.7M of 214M input tokens, 37%, on turns of <= 20 output tokens); D1b marked merged (`3584e38`), new rows D1c (X6, `4271016`) and D1d (X3, `e1fd5a2`); new section F with rows F0 (V1) and F1-F7 (A1-A7) with merge shas and test counts, an honest not-done table (X2 waiting on v2 `cached_tokens`, X5 in progress, B2, E2) and the collected VERIFY ON MAC list.
- `docs/SDLC_GUIDE.md` (the /security + /review-code paragraph): per-branch audits are incremental by default (ledger, `--full`); release requires a full-scope integration review.
- `CHANGELOG.md`: one `## [3.15.0] — Unreleased` block at the top.
- `scripts/telemetry-report.mjs`: `## Scan & review scope` section (also `sections.scan_review_scope` in `--json`).

## Decisions
- Version: the newest CHANGELOG entry is 3.13.3, but `package.json` is already 3.14.2 (3.14.x was never written into the changelog; token plan says shipped in v3.14.0). The block is `3.15.0 — Unreleased`, the next minor after the shipped version. Rename to 3.14.0 if the literal "next after the latest entry" is wanted.
- A6 timing (5.21 s -> 2.62 s) comes from the ticket brief; the M-A6 manifest is not tracked. It is a 49.7% reduction, so the row says "just short of" the plan's >= 50% target rather than "met".
- Scan & review scope section reads `docs/work/scan/*.json` (files with no `meta.scope`, such as `ledger.json`, are skipped), `docs/reviews/INTEGRATION_SUMMARY_*.md` (`Scope: full|delta`, `reviewers reused: a, b`) and `docs/work/.integration-reviewed.json` (per-reviewer `reused`). Every read is best-effort; with none present nothing is printed. The existing early exit when `telemetry.jsonl` is missing is unchanged, so the section needs a telemetry file to be reached.
- No telemetry-report test exists, so none was added (out of scope).

## Verification
- `node scripts/telemetry-report.mjs ../../docs/work/telemetry.jsonl | head -3` runs on the real 8,553-row file; no Scan section when no scan/review data exists (this repo has none).
- Manual run on a temp dir with a scan JSON, ledger.json, a delta summary and a watermark: section printed `scans 1 | incremental=1 | changed_files=2 carried_forward=5`, `integration reviews 1 | delta=1 | reviewers reused=2`, `watermark: tracked=2 reused=1`; `--json` carries `scan_review_scope`. Manual run: `node scripts/telemetry-report.mjs | grep -A8 'Scan & review scope'`.
- `npm test`: 1273 passed, 3 failed. Baseline on main is 1274 passed / 2 failed; the third failure is `validate-vendor-provenance` RED, which fails in any worktree (documented in the M-A5 and M-X1 manifests). The other two are the known attest-claude mode drift / mode 700 pair. No docs-only change touches them.

## Not done / Mac
See the VERIFY ON MAC list at the end of section F of the token plan.
