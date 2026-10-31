# Completion Manifest — M-A4-delta-review-block (WP-A4)

## Files produced
- agents/shared/blocks/delta-review.md (body 1132 B, under the 1.5 KB cap) and delta-review.compact.md

## Files modified
- 8 agents: owasp-web-checker, threat-modeler, error-handling-auditor, type-safety-checker, pattern-consistency-checker, anti-slop-auditor, performance-engineer, ux-engineer. The block section sits after Loop Prevention (before Execution; before Code search in pattern-consistency; before Context Budget in the two coordinators).
- scripts/build-agents.mjs: `delta-review` registered in BLOCKS, so --check/--fix/--compact keep every copy in sync.
- scripts/conductor/integration-review.mjs: prompt gains `Prior report: <path>` when a prior doc for the same reviewer and naming scheme exists (newest date first; the sha range is wildcarded in the integration scheme). The rest of the prompt is unchanged.
- scripts/validators/validate-owasp.sh: `carried-forward` counts as DONE; the confidence >= 7 check still applies.
- dist/compact-agents/** regenerated via `npm run agents:compact`.

## Decisions made
- C6 mitigation: rule 2 requires one `grep -n` on the cited line per carried-forward finding. A line that is gone is marked CLOSED, and a line that was not grepped is never re-cited. delegation-gate.mjs --citations is unchanged and still runs on the output.
- No new test file: evals/ and scripts/test-*.ts are outside this ticket's write scope.

## Verify result
- `npm run agents:check` is green for v1 and for opencode-v2 (ATTEST_TARGET=opencode-v2 and --target opencode-v2), 101 agents each. `npm run build:claude` ran; it reports regenerated files in the sibling Claude target.
- validate-owasp manual check on a copy of the green fixture:
  - A03 with status `carried-forward` and 8/10 passes. It failed before the change with `not-done`.
  - A04 with 6/10 and `carried-forward` still raises `low-confidence`.
- `npm test`: 1213 passed, 5 failed. The 5 are pre-existing: skills-parity, validate-vendor-provenance RED, v2 --compact, mode drift, mode restore. The first 4 reproduced on a clean baseline run. The v2 --compact one was not reproduced because the baseline run was cut off; its fixture root contains the tracked dist/compact-agents, so it should fail on baseline too.

## Known issues / deferred
- UNMET, Mac only: the token-telemetry acceptance line (second /security on an unchanged tree uses >= 60% fewer input tokens). Run `npm run telemetry:report` there and record both numbers in the PR.
- UNMET: the `run-evals` dry run showing a `Scope: incremental` header was not run. It needs a live model session.
- Coordinator HANDOFF templates still need the `Prior report:` line; that is left to WP-A5.

## Memory written
none

## Ready for: WP-A5 / WP-A7
