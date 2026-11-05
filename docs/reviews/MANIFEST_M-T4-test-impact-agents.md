# MANIFEST — M-T4-test-impact-agents (WP-T4)

Branch `feat/test-impact-agents` (from main @ 3487259). Spec: `docs/work/TEST_IMPACT_PLAN.md` §4, §5 T4. Not pushed.

## What changed

Part A (scripts/test/**, commit b821bb6)
- `map.mjs declare` writes the committed `.sdlc/test-covers.json` (`{ "<test>": [src...] }`, sorted, de-duplicated) and merges into map.json; `build`/`refresh` always merge that file (covers ∪ declared); `declared` stays in map.json entries. A declared test that discovery cannot see yet becomes a `declared_only` entry while the file exists.
- Repo-path string literals in a test file (`'scripts/x.mjs'`, `` `scripts/tools/` ``) that resolve to an existing repo file or directory are covers; a directory expands to the non-test files beneath it (cap 500); a named file's own import closure is included. Literals are cached per file in the parse cache (old cache entries without `lits` are re-parsed once).
- Discovery: JS/TS files named `test-<chapter>.ts|js|mjs` count as node tests (the script-style chapter convention attest itself uses); without this `scripts/test-test-impact.ts` was not in the map at all.

Part B
- `agents/shared/blocks/test-impact.md` (+ `.compact.md`), registered in BLOCKS (`## Test impact (MANDATORY when you add or change code)`), synced into test-engineer, coding-agent (below the marker), sdlc-feature-mode, sdlc-improve-mode by `agents:fix`. dist/compact-agents regenerated.
- test-engineer: Diff-scoped audit rewritten so the audit feeds test writing (critical/important gaps get a test + declared covers now; only nice-to-have may be left, with reason).
- sdlc-feature-mode step 3 gate: impact selection + P0 always-set; full run stays with the integration review.
- `validate-fix-backlog-closed.sh`: a row closed (VERIFIED/FIXED/RESOLVED/CLOSED, no open marker) that carries `Test: <file>::<name>` needs `docs/work/test/ledger.json` with `files[<file>].result == "pass"`; missing ledger -> gap `test-ledger-missing` naming the row; otherwise `test-not-passed`. Rows without `Test:` unchanged. Tests in `scripts/test-awk-word-boundary.ts` (the chapter that already drives this validator).
- `skills/test-expert/SKILL.md`: one paragraph. `scripts/test-build-target-modes.ts` fixture block list updated.

## Decisions / look here
- Agents call `node ~/.config/opencode/scripts/test/map.mjs declare ...` (installed path, like the other attest scripts in the agents); T5 owns copying `scripts/test/**` to targets.
- `select.mjs --base X --head Y` (range mode) deliberately ignores the dirty tree; the dirty-change check uses the default ledger mode.
- The existing test "--full keeps only static covers once the declaration is dropped" now also removes the committed file.
- The "flaky" rule in the block says "never retried more than once"; the map-level `flaky` marker is the existing T1 field.

## Acceptance
| Line | Evidence |
|---|---|
| block <=1.5KB, registered, included by 4 agents, report lists | test-impact.md 1291 B; `agents:check` in sync |
| Test: rows + validator reads ledger | 6 new cases in test-awk-word-boundary.ts |
| step-3 gate wording | sdlc-feature-mode.md step 3 |
| agents:check v1 + v2, compact regenerated, fixture | both green; dist/compact-agents committed |
| .sdlc/test-covers.json persists; literals are covers | 5 new cases in test-test-impact.ts (declare file, clone build, literal covers, spawn select, unrelated change) |
