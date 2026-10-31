# MANIFEST — M-A7-improve-onboard-ledger (WP-A7)

Branch `feat/M-A7-improve-onboard-ledger`. Spec: `docs/work/INCREMENTAL_SCAN_PLAN.md` §2 A11/A12, §4 WP-A7.

## Step 0 verdict (A12): onboard DID re-walk everything

Evidence (pre-change line numbers):
- `agents/sdlc-onboard-mode.md:431` — Lightweight Inventory issues ONE researcher HANDOFF "find every route handler and every database table"; no check for an existing `docs/onboard/INVENTORY.md`, no sha, no `git diff` (grep for `git diff|git log|ledger|Inventory-SHA` finds nothing relevant; only the unrelated task ledger at :34-43).
- `agents/sdlc-onboard-mode.md:467` — Step D1 (`--deep`) "**replacing** any lightweight inventory": full 5-category re-walk every time.
- `agents/sdlc-onboard-mode.md:129-131` — the only resume logic is the SDLC_TRACKER (resume from last non-DONE step), not an inventory delta.
- `skills/onboard-inventory/SKILL.md:17-19` — always HANDOFF to researcher "one row per unit"; no incremental path (0 `git diff` occurrences).
- `agents/app-cartographer.md:72,91,113` — never reads INVENTORY.md; it crawls a LIVE app (page graph / accessibility tree, stable `E-*` IDs kept across resume at :91). Its input is the running app, not the git tree, so a git delta does not apply; left unchanged.
- A11 confirmed: `agents/sdlc-improve-mode.md:290-292` asked "re-run those audits fresh, or build on existing findings?". Step 2 audit set: five core audits + on-demand specialists (table at ~:385); coverage = `validate-improve-coverage.sh` (every `docs/improve/*_AUDIT.md` non-empty and referenced by `IMPROVEMENT_BACKLOG.md`, plus severities). `delta-review.md` contract (HANDOFF names a prior report -> read changed files + 1-hop importers, re-cite after one grep, header `Scope: incremental ...`).

## Changes

- `agents/sdlc-improve-mode.md`: Step 1 question replaced by a deterministic rule (`--full` -> full; no ledger or no prior reports -> full; ledger sha not an ancestor -> full; empty `git diff --stat <ledger_sha>..HEAD` and clean status -> `Scope: unchanged since <sha7>`, no re-dispatch, reuse prior reports, go to Step 3; else `Scope: delta since <sha7>`). `docs/work/sdlc-state.md` records `Scope:`. Step 2 "Delta rule": every audit HANDOFF carries `Prior report: <path>` + `Changed since: <sha7>`, specialists apply Delta review. `--full` documented in the invocation table. Whole-app scope semantics untouched.
- `agents/sdlc-onboard-mode.md`: new "Incremental Inventory" section (Inventory-SHA header, touched top-level dirs from `git diff --name-only <sha>..HEAD` + status, researcher HANDOFF extra lines `Prior inventory:` / `Changed directories:`, untouched rows `carried-forward`, IDs never reused, `--full` and `--deep`-over-lightweight force full); wired into Lightweight Inventory and Step D1; `--full` modifier row in the depth table; `Inventory-SHA:` line required in the header.
- `skills/onboard-inventory/SKILL.md`: `--full`, "Incremental refresh" section, Status values, header line.
- `agents/app-cartographer.md`: no change (see Step 0).
- `scripts/validators/validate-improve-coverage.sh`: an audit marked `carried-forward` (first 20 lines of the report, or its backlog line) is covered once the backlog references it; empty-audit, no-backlog, unreferenced and severity checks unchanged.
- `dist/compact-agents/sdlc-{improve,onboard}-mode.md` regenerated via `npm run agents:compact`.

## Verification

- `npm run agents:check`: green (101 agents); `ATTEST_TARGET=opencode-v2 npm run agents:check`: green.
- `npm run build:claude` run to a temp `--out`, built OK (401 generated files differ from the absent sibling as expected); temp output removed.
- `npm test`: 1239 passed, 4 failed, IDENTICAL to baseline on main (pre-existing: skills-parity live pair, validate-vendor-provenance RED, --check reports mode drift, --write restores mode).
- Validator manual check (fixtures are out of scope: `evals/fixtures/validators/GRANDFATHERED.json:17` lists this validator, so no fixture harness covers it): temp repo with `SEC_AUDIT.md` (header `Scope: carried-forward`) + `UX_AUDIT.md`, backlog references both -> exit 0, `[ok] carried-forward: SEC_AUDIT.md`; backlog omitting `SEC_AUDIT.md` -> exit 1 `unsynthesized-audit`.

## Limits

- Ledger base = `.semgrep.head_sha`, else first scanner `head_sha` (per-scanner shas differ; one is enough for the ancestor/diff test, and specialists re-verify with grep).
- The ledger is git-ignored runtime state; it is absent in this repo, so the rule could not be exercised end to end here (prompt-level change only).
