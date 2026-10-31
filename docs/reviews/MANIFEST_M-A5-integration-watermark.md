# Completion Manifest — M-A5-integration-watermark (WP-A5)

## Files produced
- scripts/test-integration-review.ts (21 checks; tmp git repo, fake `opencode` via OPENCODE_BIN)

## Files modified
- scripts/conductor/integration-review.mjs: watermark `docs/work/.integration-reviewed.json` (`{branch:{reviewer:{head_sha,doc,verdict,date}}}` plus `base_sha`, `scope`, `reused`), written after each reviewer that produced a verdict line and never under --dry-run; `--since auto|full|<sha>` (default auto, `--full` alias, `--branch` override); per-reviewer full / delta / reused plan; one `collect.sh --base <wm> --head HEAD` per distinct base; B5 validators (`validate-code-health`, `validate-dead-code`, `validate-deps`) run once before the sessions, exit codes in a `| Validator | Exit |` table, never gating (`--no-validators` skips); `Scope: full|delta …` line and a Scope column in the summary; log rows `integration.scope`, `integration.review.reused`, `integration.watermark.cleared`, `integration.validators`.
- scripts/validators/validate-release-readiness.sh: condition 13 gains gap `integration-review-delta-scope` (newest INTEGRATION_SUMMARY says `Scope: delta`) and `final-review-delta-scope` (the SECURITY/PERF/CODE_REVIEW *_FINAL_* docs it reads). Pass line when the scope is full. Summaries with no Scope line (older runs) are not affected.
- scripts/conductor/README.md and agents/sdlc-feature-mode.md (integration-review paragraph only): `--since` and the release rule.
- agents/security-auditor.md: `Prior report:` line in the Wave 2 owasp-web-checker and Wave 3 threat-modeler HANDOFF blocks.
- agents/code-reviewer.md: it has no specialist HANDOFF block (only the challenger one), so one sentence under the specialist table tells it to add `Prior report:` when it writes a specialist HANDOFF.
- scripts/test.ts (outside the ticket scope, one registration only): tests need explicit registration, so I added the import and `await testIntegrationReview(root, ok, fail);` as Pass 55 after Pass 54.

## Decisions made
- The `DELTA REVIEW:` line is the first body paragraph after `SDLC-TASK for <agent>:`, not a prefix before it, because the agents' HANDOFF intake keys on the prompt starting with `SDLC-TASK for`.
- A reviewer is "reused" when its delta is empty or its trigger rule does not fire on the delta (so ux is reused on a non-UI commit). Its watermark head_sha moves to HEAD; doc and verdict are kept. A prior CHANGES REQUESTED stays blocking when reused.
- With `--names final|feature:*` the delta doc has the same name as the prior one, so the prior is copied to `docs/work/.integration-prior/` and passed as `Prior report:` before the old file is removed.
- Summary scope is `delta` if any reviewer ran or was reused from a watermark (the conservative label for the release gate). The summary file is named by the earliest watermark range so a delta summary does not overwrite a full one.
- scripts/lib/runtime-verdict.mjs is unchanged: the prior verdict is read from the watermark entry (written from readVerdict at review time).

## Verify result
- test-integration-review.ts: 21/21. First run logs `scope: full` and writes the watermark; one commit gives `scope: delta <wm7>..<head7>` with 3 spawns (ux reused); no change gives 4 reuses, 0 spawns; `--since full` logs full and clears the watermark; a non-ancestor watermark falls back to full; the summary has the validator table, and validators run before the sessions; validate-release-readiness.sh fails on `Scope: delta` and passes the scope check on `Scope: full`.
- `npm test`: 1260 passed, 4 failed (baseline ~1241 passed with the same failures: skills-parity/attest-claude drift, validate-vendor-provenance in a worktree, `--check` mode drift, `--write` mode 700). scripts/test-conductor-suite.ts green. `npm run agents:check` green.

## Known issues / deferred
- dist/compact-agents/** was not regenerated (outside this ticket's file list); run `npm run agents:compact` for the three edited agent files.
- `docs/work/.integration-reviewed.json` is not git-ignored (.gitignore is out of scope). Commit it with the branch or ignore it per project; either way the watermark only matters when the sha is an ancestor of HEAD.
- FINAL docs written by the specialist agents say `Scope: incremental`, not `Scope: delta`; the release gate only refuses `delta`, as specified.
- `latest_matching` picks the summary by file name, so a delta summary can shadow a newer full one on the same day; the fix is to re-run with `--since full`.

## Memory written
none

## Ready for: WP-A6 / WP-A7
