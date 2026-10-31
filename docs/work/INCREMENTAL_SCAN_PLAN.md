# Incremental Scanning Plan — attest + RepoPulse

**Status:** proposed · **Date:** 2026-10-31 · **Owner:** Bradford · **Audience:** any coding model picking up a work package (WP) below.
**Problem (as reported):** every time something is added, every scan path re-walks the whole codebase from scratch — once per scanner, once per re-run — even when a full result already exists and only a few files moved. Time and tokens are spent re-deriving what we already know.
**Goal:** every scan path (a) knows whether a prior full result exists, (b) scans only what changed since it, (c) merges with the prior result so the output is still a whole-tree answer, (d) can be forced to run full with one flag/button, and (e) falls back to full automatically when incremental is unsafe.

The plan was built the way attest tells its own agents to work: an **inventory** of every scan path (Ralph Wiggum loop — every row must end with a WP or an explicit "leave as is"), then a **challenge** of every claim with `file:line` evidence (§6). Anything I could not verify is marked UNVERIFIED and has a verification step in its WP instead of an assumption.

---

## 0. How to use this document (for the executing model)

1. Pick the lowest-numbered WP in §4 (attest) or §5 (RepoPulse) that is not done and whose `depends on` is done. One WP per session/branch.
2. Read only the files the WP names. Every WP lists exact paths and the lines where the current behaviour lives.
3. Implement, then run the WP's **Acceptance** block verbatim. A WP is not done until every acceptance line passes.
4. Project gates still apply: attest → `npm test && npm run agents:check` (and `npm run build:claude` when an agent `.md` changed — attest-claude is generated from this repo); RepoPulse → `pnpm lint && pnpm typecheck && pnpm test`, one ticket per branch, respect `plan.json` write scopes and CLAUDE.md laws 4 (no clone; C1a tarball only) and 7 (forge calls through the budgeted client).
5. Do not widen scope. If a WP turns out to need a design decision listed in §7, stop and ask — do not pick one silently.

---

## 1. The shared design: a scan ledger + delta + merge

Both products get the same four mechanisms, implemented in each product's own idiom:

| Mechanism | What it is | attest form | RepoPulse form |
|---|---|---|---|
| **Ledger** | A record of the last successful *full* run per scanner: commit SHA (or tree hash), tool/rule versions, data version, path/id of the result | `docs/work/scan/ledger.json` (per project, git-ignored or committed — §7 D1) | `security.scan_runs` already has `commit_sha`, `tool_versions`, `status`, `partial` — add `scope` and `base_run_id` columns |
| **Delta** | The set of files changed since the ledger entry | `git diff --name-only --diff-filter=ACMRD <ledger_sha>...HEAD` plus working-tree changes | Forge compare API `<base_sha>...<head_sha>` (files list), capped; fall back to full above the cap |
| **Merge** | Prior findings for unchanged files carry forward; findings for changed files are replaced by the new scan; findings in deleted files are closed | collect.sh merges prior JSON + new JSON → one JSON whose `meta.scope="incremental"` | Finding store already dedups by key; incremental run re-sights carried-forward findings and closes findings whose file is in the delta but no longer reported |
| **Invalidation** | When incremental is NOT safe → run full | tool version changed, rulepack changed, no ledger, ledger SHA not an ancestor of HEAD, delta > cap, `--full` | tool_versions / data_version changed, no baseline run, compare API unavailable or > cap, `force=true` |

**Whole-tree scanners** (dead code, duplication, dependency graph, SBOM/CVE, module boundaries) cannot be made file-incremental honestly: a change in one file changes the answer for others. For those, the rule is **cache by input hash, not by file list**: skip when the inputs they depend on are unchanged (lockfile hash for dependency audit; tree hash for dead-code/dup), otherwise run full. That is still a large win because most "add one thing" iterations do not touch the lockfile, and the coverage-loop re-runs the same gate on an unchanged tree.

**Model (LLM) scanners** get the delta in their HANDOFF/prompt plus the prior report, with the instruction: review the changed files and their direct importers; for unchanged files, carry forward the prior report's findings after re-checking that the cited `file:line` still exists (one grep each); do not re-read the rest of the tree. This is where the token savings are — the deterministic scanners are mostly a time saving.

**Full scan stays one flag away everywhere**: `--full` (attest scripts), "Full rescan" checkbox / `force: true` (RepoPulse), and full is *forced* at the release gate and on the scheduled weekly pass so nothing can drift unseen (§7 D3 decides the cadence).

---

## 2. Inventory — attest (`~/Code/attest`)

Status key: **FULL-ALWAYS** = re-walks the whole tree every invocation · **RANGE** = already diff-scoped · **GROWING** = range-scoped but the range grows with every re-run · **CACHED** = already skips unchanged work · **UNVERIFIED** = I did not read enough to be sure.

| ID | Scan path | Entry point (evidence) | Today | Cost class | WP |
|---|---|---|---|---|---|
| A1 | `/security` coordinator Wave 1 | `agents/security-auditor.md:138` — `collect.sh --root . --only semgrep,secrets,deps` with no `--base/--head` | FULL-ALWAYS | time (semgrep 1–15 min) + npm audit network | WP-A1, WP-A2 |
| A2 | `/review-code` coordinator Step 0 | `agents/code-reviewer.md:15` — `collect.sh --root . --only deadcode,dup,complexity` | FULL-ALWAYS | time (knip/jscpd whole tree) | WP-A1, WP-A2 |
| A3 | OWASP web checker — "one context window per category", A01–A10 | `agents/security/owasp-web-checker.md:3`; no changed-file scoping anywhere in the file | FULL-ALWAYS | **tokens** — 10 sessions × whole-tree reads | WP-A4 |
| A4 | Code-health model specialists (error-handling, type-safety, pattern-consistency, anti-slop) | `agents/code-review/error-handling-auditor.md:104-121`, `type-safety-checker.md:102-114`, `anti-slop-auditor.md:103-116` — every pass is `grep -rn ... src/` over the whole tree | FULL-ALWAYS | **tokens** — grep output of the whole tree read into each session | WP-A4 |
| A5 | threat-modeler, performance-engineer, ux-engineer in integration review | prompts in `scripts/conductor/integration-review.mjs:143-166` give the file list but the agents' own methodologies read the tree | FULL-ALWAYS (agent side) | tokens | WP-A4 |
| A6 | Fix-verify re-scan | `scripts/fix-verify.mjs:13,92` runs `scripts/semgrep-full-audit.sh` on every `verify`; `semgrep-full-audit.sh:16` already has `--baseline REF` but fix-verify never passes it | FULL-ALWAYS, repeated up to 6–12× per fix loop | time | WP-A3 |
| A7 | Integration review (`integration-review.mjs`) | `:84-93` always `merge-base(main, HEAD)...HEAD`; no "last reviewed" watermark (grep for watermark/lastReviewed: none) | GROWING — after each fix the *whole branch* is re-reviewed by every reviewer | **tokens** (measured 0.5–1.4M input/reviewer in `TOKEN_OPTIMIZATION_PLAN.md:11-13`) | WP-A5 |
| A8 | Conductor per-ticket scan | `scripts/conductor/conductor.mjs:1066-1072` — `collect.sh --base <merge-base> --head <branch> --only semgrep,secrets` | RANGE ✅ | — | none (keep) |
| A9 | Handoff runtime gate | `scripts/validators/run-handoff-gates.sh:264-275` — build + lint full, file-size uses `--since` | build/lint FULL (lint could be changed-files) | time | WP-A6 (lint only) |
| A10 | Phase gate + coverage loop | `validate-phase-gate.sh` chains `validate-code-health`, `validate-dead-code`, `validate-deps`, `validate-module-boundaries`, `validate-mermaid`, `validate-doc-render-health`, `validate-no-ascii-art`, …; none of those is range-aware (grep `--since/--changed/git diff`: only file-size, no-reinvent, contract-conformance, tracker-fresh, release-readiness); `run-coverage-loop.sh` re-runs the whole chain up to 3× | FULL-ALWAYS, repeated | time + `npm audit` network each iteration | WP-A6 |
| A11 | `/sdlc improve` "whole app" audits | `agents/sdlc-improve-mode.md:290-292` asks the user "re-run fresh or build on existing findings?" — ad hoc, no ledger | FULL by default | tokens | WP-A7 |
| A12 | `/sdlc onboard` inventory / app-cartographer | not read in this pass | UNVERIFIED | tokens | WP-A7 (verify step) |
| A13 | code-search MCP index | `agents/code-review/pattern-consistency-checker.md:98-100` — "mtime-gated: cheap, skips unchanged files" | CACHED ✅ | — | none |
| A14 | attest-claude sibling | generated from this repo by `scripts/build-target-claude.mjs` (`package.json:23`) | inherits all of the above | — | regenerate after every agent-file WP |
| A15 | Token plan items already written but **todo**: B2 (verify once per tree hash), B5 (validators before model sessions), E2 (overlap review with next ticket) | `docs/work/TOKEN_OPTIMIZATION_PLAN.md:106,109,135` | todo | — | B2 ⊂ WP-A6; B5 ⊂ WP-A5 |

What is **already right** and must not regress: A8 (range-scoped ticket scan), A13 (mtime-gated index), `collect.sh` range mode (`scripts/scan/collect.sh:57-66`), `semgrep-full-audit.sh --baseline`, `fix-verify.mjs` fingerprinting (`:17-27`) — WP-A1 builds on these rather than replacing them.

---

## 3. Inventory — RepoPulse (`~/Code/repopulse`)

| ID | Scan path | Entry point (evidence) | Today | Cost class | WP |
|---|---|---|---|---|---|
| R1 | "Run scans now" → one job **per enabled scanner**, each takes its **own tarball + extract** of the same SHA | `apps/api/src/routes/runs/index.ts:169-210` enqueues `mode:'history'` per key; `apps/api/src/workers/scan-processor.ts:287-293` routes to the weekly runners; `apps/api/src/workers/index.ts:466-999` — 14 runners, each calling `providerForRepo` + `snapshotForScan` (`semgrep` :485, `code_health_tools` :525, `dependency_cve` :571, `container_image` :622, `anti_slop` :656, `architecture_register` :863, …); `packages/security/src/snapshot/fetch.ts` has no cache (grep cache/etag/reuse: none) | FULL-ALWAYS × N scanners | forge rate-limit budget (N tarballs), disk, time | WP-R2 |
| R2 | No "already have this result" check before a full run | only the PR pattern scanners check `headAlreadyScanned` (`packages/security/src/scanners/pr/run.ts:177-199`, keyed on `pr_synced`); weekly/manual runners have no equivalent (grep `alreadyScanned|same commit` in workers: none) | FULL-ALWAYS | everything | WP-R1 |
| R3 | Weekly sweep re-runs full semgrep / code-health / CVE / image / anti-slop even when head SHA, tool versions and data version are unchanged | `workers/index.ts:485-560` — the only skip is `no_head_sha` | FULL-ALWAYS | forge budget, CPU, LLM tokens (anti_slop) | WP-R1 |
| R4 | Semgrep | `packages/security/src/scanners/semgrep/run-modes.ts:20-32` — FULL weekly over snapshot, INCREMENTAL on `pr_synced` over changed files; manual = full | partly RANGE ✅ (PR only) | — | WP-R3 (manual/weekly incremental) |
| R5 | Code-health tools (ruff, biome, shellcheck, hadolint, actionlint, cppcheck, checkov, iacrender) | `packages/security/src/scanners/code-health/run.ts:15,237-320` — snapshot only, `fullSweep` closes stale findings; adapters in `code-health/adapters/*.ts` are per-file tools | FULL-ALWAYS | time, forge | WP-R3 |
| R6 | Dependency/CVE | `scanners/dependency/run.ts:284-296` — SBOM upserted per (workspace, repo, commit); regenerated from a fresh tarball on every run even when manifests/lockfiles unchanged; advisory-data refresh (`scan-db-sync.sh`) does not re-match the stored SBOM | FULL-ALWAYS | forge, time | WP-R4 |
| R7 | Container image | `scanners/image/run.ts:165` — snapshot per run | FULL-ALWAYS | forge | WP-R4 (gate by Dockerfile/compose hash) |
| R8 | OWASP web/LLM checklists | `scanners/owasp/run.ts:29-30,57` — "runs one checklist over a diff — changed files of a PR, or a scheduled surface" | RANGE ✅ | — | none; verify the "scheduled surface" is a delta not the whole tree (WP-R3 step 0) |
| R9 | AI passes (ai-pass-sources) | `apps/api/src/workers/ai-pass-sources.ts:91-110` — walks ONLY named paths; its own snapshot | scoped by user; own tarball | forge | WP-R2 (share snapshot) |
| R10 | Secrets history | `scanners/secrets/history.ts:68` — 12-month window each run; whether already-swept commits are skipped was not read | UNVERIFIED | forge (patch fetches) | WP-R5 (verify, then resume-from-last-sha) |
| R11 | Registers (supply-chain, architecture, knowledge, test-gap) | SQL over stored facts except `architecture_register` which snapshots (`adapters/architecture/run.ts:77`) | mostly cheap | — | WP-R4 (architecture gated by tree hash) |

What is **already right**: R4 PR incremental, R8 diff-based checklists, `headAlreadyScanned` for PR scanners, finding dedup keys, `scan_runs` carrying `tool_versions`. WP-R1 generalises `headAlreadyScanned`; WP-R3 generalises `runSemgrepIncremental`.

---

## 4. Work packages — attest

Sizes: S ≤ ½ day, M ≤ 2 days, L > 2 days for a competent coding model. Order is dependency order.

### WP-A1 — `collect.sh`: ledger + `--mode auto|full|diff` + merge  (M)
**Depends on:** none. **Files:** `scripts/scan/collect.sh` (only).
**Change:**
1. New args: `--mode auto|full|diff` (default `auto`), `--full` (alias for `--mode full`), `--ledger <path>` (default `docs/work/scan/ledger.json`), `--expand-importers on|off` (default off; see §7 D2).
2. Ledger format (one object per scanner key): `{ "semgrep": { "head_sha": "...", "tree_hash": "...", "tool_version": "opengrep 1.x", "rules_hash": "<sha256 of .semgrep/** + RULEPACKS_DIR listing>", "json": "docs/work/scan/scan_2026-10-31.json", "scope": "tree", "date": "..." }, "secrets": {...}, "deps": { "lockfile_hash": "..." }, "deadcode": { "tree_hash": "..." }, "dup": { "tree_hash": "..." }, "complexity": {...} }`.
3. `auto` resolution, per scanner: if `--base/--head` given → existing range behaviour (unchanged). Else if ledger entry exists AND `git merge-base --is-ancestor <head_sha> HEAD` AND tool_version/rules_hash unchanged → **diff**: changed files = `git diff --name-only --diff-filter=ACMRD <head_sha> HEAD` ∪ `git status --porcelain` paths; if count > `SCAN_DIFF_CAP` (default 400) → full. Else → full.
4. For `deps`: skip (status `"cached"`, copy prior findings) when `sha256(package-lock.json|pnpm-lock.yaml|yarn.lock|poetry.lock|Cargo.lock|go.sum|requirements*.txt)` equals ledger; `--full` always runs. For `deadcode`/`dup`: skip when `git rev-parse HEAD^{tree}` equals ledger AND working tree clean; otherwise run full (they are whole-tree properties).
5. Merge for `semgrep`, `secrets`, `complexity` in diff mode: load prior JSON; drop prior findings whose `path` ∈ changed-or-deleted set; append new findings; write result with `meta.scope="incremental"`, `meta.base_full_sha`, `meta.changed_files`, `meta.carried_forward=<n>`. Totals line (stderr) must print `scope=incremental base=<sha7> changed=<n>`.
6. After any successful run (full or incremental), update the ledger entry. Incremental runs update `head_sha` but keep `base_full_sha`; after `SCAN_MAX_INCREMENTAL` (default 20) chained increments, `auto` forces full once (drift guard).
7. `--help` documents all of it.
**Acceptance:**
- `bash scripts/scan/collect.sh --root <fixture> --full` then touch one file → `bash scripts/scan/collect.sh --root <fixture>` prints `scope=incremental changed=1` and the JSON has `meta.scope=="incremental"` and `semgrep.findings` for untouched files identical to the full run (write `scripts/test-collect-incremental.ts` with a tmp git fixture; add to `scripts/test.ts` runner).
- Changing `.semgrep/` contents forces full (`scope=tree`) on the next auto run.
- `--base/--head` path behaves exactly as before (existing conductor test `scripts/test-conductor-suite.ts` still green).
- Missing tools still emit `status:"skipped"`; `jq -e .` valid on every output.

### WP-A2 — coordinators use `auto`, offer `--full`  (S)
**Depends on:** WP-A1. **Files:** `agents/security-auditor.md:138` and the Modes table (`:235-250`); `agents/code-reviewer.md:15`; `skills/security/SKILL.md`, `skills/review-code/SKILL.md` (flag docs); `README.md:116` one sentence.
**Change:** the Step-1 bash line becomes `collect.sh --root . --only ... ` (auto) and both coordinators gain a `--full` flag → `collect.sh --full`. The coordinator's announce block states which scope ran (read from the totals line) and the final report's Coverage section states `Scope: full | incremental since <sha7> (<n> changed files, <m> findings carried forward)`. Then `npm run agents:check && npm run build:claude`.
**Acceptance:** `npm run agents:check` green; `grep -n "collect.sh" agents/security-auditor.md agents/code-reviewer.md` shows no bare full-tree call without the documented `--full` alternative; `dist/`/attest-claude regenerated (`npm run build:claude:check` green).

### WP-A3 — `fix-verify.mjs verify` re-scans only what can have changed  (M)
**Depends on:** none (independent of A1). **Files:** `scripts/fix-verify.mjs` (`:85-110` the semgrep source branch), `scripts/semgrep-full-audit.sh` (accept `--paths <file>` list — new), `scripts/test-fix-verify.ts`.
**Change:** on `verify semgrep`: target set = `{ files cited in baseline findings } ∪ { git diff --name-only <baseline_sha>..HEAD } ∪ { dirty files }` (baseline must record `head_sha` at snapshot time — add it). Run the audit on that set only; for every other file, copy baseline findings forward unchanged. Classification (CLOSED/OPEN/NEW/REGRESSED) is computed on the merged set exactly as today. `--full` flag restores the current behaviour; `auto` also goes full when the target set exceeds `FIXVERIFY_DIFF_CAP` (default 300 files) or when the baseline lacks `head_sha`.
**Acceptance:** `scripts/test-fix-verify.ts` gains: (1) fix one finding → CLOSED and untouched findings still OPEN with identical fingerprints; (2) a fix that introduces a new finding in a changed file → NEW; (3) verify runtime logs the file count scanned (`scanned_files: n`) and n < total on the fixture. Existing fix-verify tests green.

### WP-A4 — model specialists get the delta and carry findings forward  (M)
**Depends on:** WP-A1 (for the `changed_files` list in the scan JSON). **Files:** `agents/shared/blocks/` — add one canonical block `DELTA_REVIEW.md` (≤ 1.5 KB) and include it from: `agents/security/owasp-web-checker.md`, `agents/security/threat-modeler.md`, `agents/code-review/error-handling-auditor.md`, `type-safety-checker.md`, `pattern-consistency-checker.md`, `anti-slop-auditor.md`, `agents/performance-engineer.md`, `agents/ux-engineer.md`; `scripts/build-agents.mjs` if blocks are assembled there (follow the existing `handoff-intake` block pattern, `agents/shared/blocks/`).
**Block content (the contract):**
```
## Delta review (MANDATORY when the HANDOFF names a prior report or the scan JSON has meta.scope=="incremental")
1. Read meta.changed_files from the scan JSON (or `git diff --name-only <base>...HEAD`). That list ∪ their direct importers (`code_search`/grep for the module name, ≤1 hop) is YOUR READ SCOPE. Do not glob or grep the whole tree.
2. For every finding in the prior report whose file is NOT in scope: re-cite it unchanged after one `grep -n` confirming the cited line still exists; if it does not, mark it CLOSED (moved/removed) — never silently drop it.
3. For files in scope: run your full methodology on those files only.
4. Header of your report: `Scope: incremental — <n> files reviewed, <m> findings carried forward from <prior report path>`. If no prior report exists → `Scope: full`.
5. OWASP categories (owasp-web-checker only): skip a category's session when none of the changed files matches its surface patterns AND the prior OWASP_TRACKER row is DONE with confidence ≥ 7; write the row through with `carried-forward` in the evidence column.
```
Also: `integration-review.mjs` prompt (`:143-166`) and the coordinators' HANDOFF templates must pass `Prior report: <path>` when one exists for the same branch/slug (see WP-A5 for how it is found).
**Acceptance:** `npm run agents:check` green; a dry run (`node scripts/run-evals.mjs --agent owasp-web-checker` fixture or the existing `evals/`) shows the report header `Scope: incremental`; `validate-owasp.sh` still passes on a tracker whose rows say `carried-forward`; token telemetry (`npm run telemetry:report`) for a second `/security` on an unchanged tree shows ≥ 60 % fewer input tokens than the first (record both numbers in the WP's PR).

### WP-A5 — `integration-review.mjs`: review watermark + delta re-review  (M)
**Depends on:** WP-A1, WP-A4. **Files:** `scripts/conductor/integration-review.mjs`, `scripts/lib/runtime-verdict.mjs` (read prior verdict), `agents/sdlc-feature-mode.md:565` (doc), `scripts/conductor/README.md`.
**Change:**
1. Watermark file `docs/work/.integration-reviewed.json`: `{ "<branch>": { "<reviewer>": { "head_sha": "...", "doc": "docs/reviews/...", "verdict": "APPROVED|CHANGES REQUESTED" } } }`, written after every reviewer finishes.
2. New flags `--since auto|full|<sha>` (default `auto`). `auto`: if a watermark exists for this branch+reviewer and is an ancestor of HEAD → diff range = `<watermark_sha>...HEAD`, prompt says `DELTA REVIEW: prior report <doc> (verdict X) covers <base>..<wm>; review only this delta and carry forward per DELTA_REVIEW`; collect.sh is called with `--base <wm> --head HEAD` and the prior scan JSON is passed for merge. Else → today's behaviour (`merge-base(main)`), i.e. full branch.
3. `--full` forces full and clears the watermark. Empty delta for a reviewer → reuse prior verdict, log `integration.review.reused`, no session spawned.
4. (B5 from the token plan) run `validate-code-health.sh`, `validate-dead-code.sh`, `validate-deps.sh` once before the model sessions and link their exit codes in `INTEGRATION_SUMMARY_*.md`.
5. `validate-release-readiness.sh` requires a **full** review (`--since full`) — release never rides on a chain of deltas (§7 D3).
**Acceptance:** new `scripts/test-integration-review.ts` with a tmp repo: first run (dry) logs `scope: full`; commit one file, second run logs `scope: delta <wm7>..<head7>` and only the reviewers whose trigger rules fire on the delta spawn; `--full` logs full again; `validate-release-readiness.sh` fails when the latest summary says `Scope: delta`. Existing conductor tests green.

### WP-A6 — validators: changed-only where honest, tree-hash cache where not  (M)
**Depends on:** none. **Files:** `scripts/validators/_lib.sh` (add `validator_changed_files` and `validator_cache_key`), `validate-lint.sh`, `validate-code-health.sh`, `validate-mermaid.sh`, `validate-doc-render-health.sh`, `validate-no-ascii-art.sh`, `validate-dead-code.sh`, `validate-deps.sh`, `validate-module-boundaries.sh`, `run-coverage-loop.sh`, `run-handoff-gates.sh`, `scripts/validators/README.md`.
**Change:**
1. `_lib.sh`: `validator_changed_files [--since <ref>]` → prints changed+dirty files (reads `--since` arg or `VALIDATE_SINCE` env; empty = all). `validator_cache_key` → `sha256(tree-hash + dirty-file hashes + validator script hash + args)`; `validator_cached_result <key>` / `validator_store_result <key> <exit> <json>` under `docs/work/.validator-cache/` (git-ignored).
2. Per-file validators (`lint`, `code-health`, `mermaid`, `doc-render-health`, `no-ascii-art`): honour `--since`/`VALIDATE_SINCE` → walk only changed files of the right type; no flag → unchanged behaviour. Whole-tree validators (`dead-code`, `deps`, `module-boundaries*`, `circular-deps`): wrap in the cache — identical key → replay stored exit code + JSON with a `cached: true` note on stderr. `--no-cache` bypass.
3. `run-coverage-loop.sh`: export `VALIDATE_SINCE=$(git merge-base main HEAD)` for feature/improve phases and rely on the cache for init phases; iterations 2 and 3 therefore re-run only validators whose inputs changed. `run-handoff-gates.sh --runtime`: pass `--since "$TRACKER_SINCE"` to `validate-lint.sh` as it already does for file-size (`:275`).
4. This also delivers token-plan **B2** (verify once per tree hash) if `conductor.mjs runVerifyDirect` uses the same `validator_cache_key` — do it in the same WP only if ≤ 30 lines; otherwise open B2 separately.
**Acceptance:** `scripts/test-validators-incremental.ts`: on a fixture, `validate-deps.sh` second run prints `cached: true` and exits identically; touching `package-lock.json` invalidates; `validate-lint.sh --since <sha>` lists only changed files in its JSON `items`; full chain `validate-phase-gate.sh feature` wall-clock on an unchanged tree drops ≥ 50 % between iteration 1 and 2 (print both in the PR). All `scripts/test-*.ts` green.

### WP-A7 — `/sdlc improve` and `/sdlc onboard`: use the ledger instead of asking  (S, after a verify step)
**Depends on:** WP-A1, WP-A4. **Files:** `agents/sdlc-improve-mode.md:268-300`, `agents/sdlc-onboard-mode.md`, `agents/app-cartographer.md`, `skills/onboard-inventory/SKILL.md`.
**Step 0 (verify, 15 min):** read the onboard inventory flow and record in the PR whether it re-walks the tree when `docs/onboard/INVENTORY.md` exists (A12 is UNVERIFIED).
**Change:** replace the "re-run fresh or build on existing?" question with: if `docs/work/scan/ledger.json` + prior audit reports exist and `git diff --stat <ledger_sha>..HEAD` is non-empty → default to delta audits (DELTA_REVIEW block) and state the scope; `--full` flag overrides. Onboard: when `INVENTORY.md` exists, re-inventory only changed directories (`git diff --name-only --dirstat`) and mark unchanged rows `carried-forward`.
**Acceptance:** `npm run agents:check`; the improve-mode state file (`docs/work/sdlc-state.md`) records `Scope: delta since <sha7>` or `full`; `validate-improve-coverage.sh` accepts `carried-forward` rows.

### WP-A8 — docs + telemetry  (S)
**Depends on:** all above. **Files:** `docs/work/TOKEN_OPTIMIZATION_PLAN.md` (add section F "Incremental scanning" with rows F1–F7 = WP-A1…A7 and their measured before/after), `docs/SDLC_GUIDE.md:185`, `CHANGELOG.md`, `scripts/telemetry-report.mjs` (report `scope` from scan JSON meta and review headers so savings are visible).
**Acceptance:** telemetry report prints a `scan scope` breakdown; CHANGELOG entry; `npm test` green.

---

## 5. Work packages — RepoPulse

All WPs respect CLAUDE.md: no clone (C1a tarball only, bracketed, deleted), forge calls via the budgeted client, every table workspace-scoped, framework never branches on `scanner.key` (`packages/security/src/framework/types.ts:5-10`) — the new behaviour must be **registry metadata + injected maps**, like `historyRunners`/`weeklyRunners`.

### WP-R1 — "Up to date" short-circuit for weekly and manual runs  (M)
**Depends on:** none. **Files:** `packages/shared/src/db/schema/security/index.ts:49-80` (migration: add `scope text not null default 'full'` ∈ {full, incremental, skipped}, `base_run_id bigint null`, `data_version text null`), `apps/api/src/workers/scan-processor.ts` (`runSweep` and the `history` branch :287+), new `packages/security/src/framework/up-to-date.ts`, `apps/api/src/routes/runs/index.ts:137-210` (accept `force: boolean` in the body), `apps/web` run-scans dialog (a "Full rescan" checkbox; the coverage table shows `scope`), `scan-processor.ts:72-100` `NOTHING_SCANNED` gains `up_to_date: 'Nothing changed since the last successful run at this commit with these tool versions, so nothing was re-scanned. Use "Full rescan" to force it.'`.
**Logic (`isUpToDate`)**: given `(workspaceId, repoId, scannerKey, headSha, toolVersions, dataVersion)` → true iff a `scan_runs` row exists with same workspace/repo/scanner/commit, `status='succeeded'`, `partial=false`, `tool_versions` deep-equal, `data_version` equal (null = ignore). Scanners declare `dataVersion()` in their registry metadata (e.g. dependency_cve → OSV/KEV/EPSS data stamp from `scan-db-sync`; semgrep → rulepack version) — framework reads metadata, never the key. The `ScanJobData` gains `force?: boolean`; `force` bypasses the check. `runSweep` writes a `scan_runs` row with `status='succeeded', scope='skipped', finding_count=<previous count>, base_run_id=<previous run>` so the UI can say "up to date as of …" instead of "never ran".
**Acceptance:** vitest in `apps/api/src/workers/scan-processor.test.ts`: (1) second weekly job for same sha/tool versions → runner NOT called, a `skipped` row written; (2) `force:true` → runner called; (3) changed `tool_versions` → runner called; (4) tenancy test: a succeeded run in another workspace never counts. Route test: `POST /runs` with `{force:true}` propagates to job data. `pnpm lint && pnpm typecheck && pnpm test` green.

### WP-R2 — One snapshot per (repo, sha) per batch  (M–L; needs §7 D4 decision first)
**Depends on:** WP-R1. **Files:** `packages/security/src/snapshot/index.ts`/`snapshot.ts`, new `packages/security/src/snapshot/shared.ts`, `apps/api/src/routes/runs/index.ts` (enqueue one `batch` job instead of N), `apps/api/src/workers/scan-processor.ts` (new `mode:'batch'`), `apps/api/src/workers/index.ts` (batch runner that iterates the enabled snapshot-input scanners inside ONE `snapshotForScan` bracket), `docs/ARCHITECTURE.md` §4i and `docs/CONSTRAINTS.md` C1a wording.
**Design:** a *batch* is one scan for C1a purposes: one tarball fetch (one forge budget hit instead of 14), one extract, scanners run sequentially (or bounded-parallel, read-only dir) inside the bracket, directory deleted in `finally` as today; the hourly sweeper rule is unchanged. Per-scanner `scan_runs` rows are still written (one per scanner) so coverage/UI do not change. Scanners whose `inputs !== 'snapshot'` keep their own path. `up_to_date` (WP-R1) is evaluated per scanner *before* the batch decides whether a snapshot is needed at all — if every scanner is up to date, no tarball is fetched.
**Acceptance:** worker test with a fake provider: "Run scans now" on a repo with 5 snapshot scanners → provider `fetchTarball` called exactly once; 5 `scan_runs` rows; a scanner that throws does not prevent the others (NFR-15) and the directory is gone after the batch (assert on `SNAPSHOT_ROOT`). Forge budget counter (`packages/forge` budgeter) shows 1 tarball charge. ARCHITECTURE/CONSTRAINTS updated in the same PR.

### WP-R3 — Incremental mode for per-file snapshot scanners (code-health first, then generalise)  (L)
**Depends on:** WP-R1. **Files:** `packages/security/src/scanners/code-health/run.ts`, `packages/security/src/scanners/semgrep/run-modes.ts` (reuse `runSemgrepIncremental`'s file-fetch path for manual/weekly), `packages/forge` — verify `ForgeProvider` exposes a compare/changed-files call (`compareCommits(base, head)` → files, capped); if not, add it to the port + GitHub/Gitea/GitLab providers behind the budgeted client, `packages/security/src/framework/types.ts` (new optional scanner metadata `incremental?: { maxChangedFiles: number }`), `packages/insights` `persistFindings` (a `carryForward(baseRunId, unchangedPaths)` helper that re-sights prior findings and closes findings in deleted files).
**Step 0 (verify):** confirm `owasp` "scheduled surface" (R8) is a delta, and read `anti_slop` runner (`workers/index.ts:656`) to classify it per-file vs whole-tree; record in PR.
**Logic:** before a full run, find `baseRun` = last `succeeded, partial=false, scope∈{full,incremental}` run for this scanner with same tool/data versions; `delta = compareCommits(baseRun.commit_sha, headSha)`; if delta unavailable or `delta.files.length > maxChangedFiles` → full (today's path). Else fetch the changed files individually (as `runSemgrepIncremental` does — no tarball), run the per-file adapters over them, then `carryForward(baseRun.id, unchangedPaths)` + persist new findings; `scan_runs.scope='incremental', base_run_id=baseRun.id`. Chain limit: after N incremental runs (default 10) or 30 days since last full → full (drift guard). Whole-tree properties inside code-health (e.g. complexity across files is still per-file; anything cross-file stays in full mode) are declared per adapter via metadata, never by key.
**Acceptance:** vitest: fixture with 3 files, base full run with findings in A,B,C; change B only → incremental run fetches only B; A and C findings re-sighted (same ids, new `last_seen`), B findings replaced, finding in a deleted file D closed; delta > cap → full path taken and `scope='full'`. Semgrep manual run with a baseline → `filesScanned` < tree size. UI coverage chip shows "incremental since <sha7> · last full <date>".

### WP-R4 — Input-hash gating for whole-tree scanners  (M)
**Depends on:** WP-R1 (uses `data_version`). **Files:** `scanners/dependency/run.ts`, `scanners/image/run.ts`, `adapters/architecture/run.ts`, `packages/security/src/sync/*` (expose the advisory data stamp), new `packages/security/src/framework/input-hash.ts`.
**Logic:** `dependency_cve`: manifest/lockfile set hash via the forge *contents* API for the known manifest paths (cheap, no tarball) → if equal to the base run's hash and `data_version` equal → up to date; if only `data_version` changed (new OSV/KEV/EPSS data) → **re-match the stored SBOM** (`security.sboms` row for that commit) against the new data with no snapshot at all — this is the common nightly case; if manifests changed → full. `container_image`: hash of Dockerfile*/compose*/`.dockerignore` + base-image digest → same pattern. `architecture_register`: tree hash from the forge commit object (`tree.sha`) — unchanged → skip.
**Acceptance:** tests for the three gates (unchanged → skipped row; data_version change → SBOM re-matched, no `fetchTarball`; manifest change → full). `scan-db-sync.sh` writes the data stamp the gate reads; `docs/RUNBOOK.md` notes it.

### WP-R5 — Secrets history: resume from last swept commit  (S after verify)
**Depends on:** none. **Files:** `packages/security/src/scanners/secrets/history.ts:60-110`.
**Step 0:** read how commits already covered by a `scan_runs` row are treated (R10 is UNVERIFIED). If they are already skipped → close this WP as "no change" with the evidence line. If not → filter the 12-month window to commits without a succeeded row for `scanner_key='secrets'`, and keep `force` as the override.
**Acceptance:** test: second sweep over an unchanged history fetches zero patches.

### WP-R6 — Surface it: UI + docs + STATUS  (S)
**Depends on:** WP-R1…R4. **Files:** `apps/web` Security tab coverage table (scope column, "last full" tooltip, "Full rescan" control), `docs/SECURITY_SUITE.md`/`docs/design/*` scanner section, `docs/RUNNING.md`, `docs/STATUS.md`, `e2e/code-health.spec.ts` or a new `e2e/scan-scope.spec.ts`.
**Acceptance:** Playwright: after two "Run scans now" presses with no new commit, the table shows "Up to date" rows and the second press did not create tarball traffic (assert on the budget counter endpoint or logs); a11y spec still green.

---

## 6. Challenge report (CHALLENGER_PROTOCOL — every claim cited; verdicts CONFIRMED / CONTRADICTED / UNVERIFIABLE)

| # | Claim in this plan | Evidence | Verdict | Consequence for the plan |
|---|---|---|---|---|
| C1 | attest `/security` and `/review-code` always scan the whole tree | `agents/security-auditor.md:138`, `agents/code-reviewer.md:15` — no `--base/--head`; no agent or script reads a prior `docs/work/scan/*.json` (grep "prior scan|previous scan|existing scan": 0 hits) | CONFIRMED | WP-A1/A2 stand |
| C2 | `collect.sh` already supports range mode, so incremental is an extension not a rewrite | `scripts/scan/collect.sh:57-66` | CONFIRMED | WP-A1 reuses `EXISTING[]` targets path |
| C3 | fix-verify re-runs the full semgrep audit on every verify although a `--baseline` exists | `scripts/fix-verify.mjs:13,92`; `scripts/semgrep-full-audit.sh:16` | CONFIRMED | WP-A3 stands. **Counter-point:** `--baseline REF` reports only *new* findings since REF, which would break CLOSED/OPEN classification — that is why WP-A3 scans *cited ∪ changed* files instead of using `--baseline` |
| C4 | integration review re-reviews the whole branch on every re-run | `scripts/conductor/integration-review.mjs:84-93` (base = merge-base with `main`), no watermark anywhere in `scripts/conductor/*.mjs` | CONFIRMED | WP-A5 stands. **Counter-point (design, from `TOKEN_OPTIMIZATION_PLAN.md:77`):** the plan itself says "any code change invalidates all approvals … now paid once per branch". A delta review after a fix is a *weaker* guarantee than full re-approval. Mitigation: full forced at release (WP-A5 step 5) and `--full` on demand; reviewer verdict on a delta is explicitly labelled `Scope: delta` so a human can see it |
| C5 | Per-ticket conductor scan is already diff-scoped | `scripts/conductor/conductor.mjs:1066-1072` | CONFIRMED | No WP — do not touch |
| C6 | Model specialists grep the whole tree every session | `error-handling-auditor.md:104-121`, `type-safety-checker.md:102-114`, `anti-slop-auditor.md:103-116` | CONFIRMED | WP-A4 stands. **Risk:** instructing a small model to "carry forward" can produce fabricated re-citations; hence the one-grep-per-carried-finding rule and `delegation-gate.mjs --citations` (`code-reviewer.md:47`) still runs on the output |
| C7 | Phase-gate validators are whole-tree and re-run up to 3× by the coverage loop | `validate-phase-gate.sh` chain (36 validators, ≥ 20 code-walking); only 6 validators mention `--since/git diff`; `RALPH_WIGGUM_LOOP.md` cap = 3 | CONFIRMED | WP-A6 stands. **Counter-point:** these are mostly fast shell scripts; the real repeat costs are `npm audit`/`knip`/`jscpd`/`mmdc`. Cache those first (deps, dead-code, mermaid) if time is short |
| C8 | Incremental semgrep is safe file-by-file | Opengrep/Semgrep OSS rules are intra-file (cross-file taint is a Pro feature) | CONFIRMED for OSS rules; UNVERIFIABLE for any Pro/custom cross-file rule in `bpm-rulepacks` | WP-A1 `--expand-importers` option + periodic forced full (drift guard) cover the gap; §7 D2 |
| C9 | RepoPulse "Run scans now" fetches one tarball per scanner at the same SHA | `routes/runs/index.ts:169-210` (one job per key), `scan-processor.ts:287-293`, `workers/index.ts:485-999` (each runner calls `snapshotForScan`), `snapshot/fetch.ts` (no cache) | CONFIRMED | WP-R2 stands. **Counter-point:** C1a says source exists "for the length of one scan" (`snapshot/snapshot.ts:8-11`). A shared batch snapshot stretches "one scan" to "one batch" — a policy call (§7 D4), not a bug fix |
| C10 | No up-to-date check for weekly/manual runs | only `headAlreadyScanned` for PR pattern scanners (`pr/run.ts:177-199`) | CONFIRMED | WP-R1 generalises it |
| C11 | Semgrep incremental exists only for `pr_synced` | `semgrep/run-modes.ts:20-32` | CONFIRMED | WP-R3 reuses it |
| C12 | Code-health is "a property of a codebase", so per-PR runs were rejected | `workers/index.ts:521-524` comment, `code-health/run.ts:15` | CONFIRMED as the original rationale | **Nuance:** that argues against *per-PR* runs (noise), not against *incremental* weekly/manual runs that merge into the whole-tree answer. WP-R3 keeps the whole-tree result; only the work is incremental. `fullSweep` (`run.ts:315-320`) closing logic must be restricted to the delta in incremental mode — called out in WP-R3 acceptance (deleted-file case) |
| C13 | OWASP checklists are diff-based | `owasp/run.ts:29-30,57,96` | CONFIRMED for PR; "scheduled surface" UNVERIFIED | WP-R3 step 0 |
| C14 | Secrets history re-sweeps 12 months every run | `secrets/history.ts:68`; skip logic not read | UNVERIFIABLE | WP-R5 starts with a verify step |
| C15 | Token numbers (0.5–1.4 M/reviewer, 214 M total) justify prioritising the model-side WPs (A4, A5) over the shell-side ones | `docs/work/TOKEN_OPTIMIZATION_PLAN.md:11-29` ("the cost model is baseline × turns × sessions") | CONFIRMED | Priority order in §8 |

Nothing in this challenge was CONTRADICTED. Two design counter-points (C4, C9) are real trade-offs and are routed to §7 for a human decision rather than decided here.

---

## 7. Decisions needed from Bradford before the WPs that depend on them

| ID | Decision | Options | Blocks |
|---|---|---|---|
| D1 | Where does attest's ledger live, and is it committed? | (a) `docs/work/scan/ledger.json`, git-ignored (per machine, simplest) · (b) committed (shared across machines/CI; merge conflicts possible) · (c) `.sdlc/` like `deps-waivers.txt` | WP-A1 |
| D2 | Importer expansion for incremental SAST | (a) off by default (fastest; relies on the forced-full drift guard) · (b) on by default, 1 hop via `code_search` | WP-A1, WP-A4 |
| D3 | When is full forced in attest? | (a) release gate only · (b) release gate + every Nth incremental (default 20) · (c) + weekly cron | WP-A1, WP-A5 |
| D4 | RepoPulse shared batch snapshot vs C1a wording | (a) amend C1a: "for the length of one scan **batch**", one tarball per Run-scans press · (b) keep per-scanner snapshots and only add the up-to-date check (WP-R1) — fewer fetches only when nothing changed | WP-R2 |
| D5 | Default scope for RepoPulse manual runs | (a) incremental when a baseline exists, "Full rescan" checkbox · (b) full by default, "Quick (changed only)" checkbox | WP-R1 UI, WP-R3 |

**DECIDED 2026-10-31 (Bradford):** D1(a) ledger at `docs/work/scan/ledger.json`, git-ignored · D2(a) importer expansion off by default · D3(b) full forced at the release gate and every 20th incremental · D4(a) amend C1a to "one scan batch", one tarball per Run-scans press · D5(a) incremental by default when a baseline exists, "Full rescan" checkbox. No WP is blocked.

---

## 8. Order of execution and expected payoff

| Order | WP | Why first | Expected effect |
|---|---|---|---|
| 1 | WP-R1 | smallest change, largest RepoPulse win: every repeat press/weekly on an unchanged repo becomes a DB lookup | N× tarball fetches → 0 on unchanged repos |
| 2 | WP-A1 + WP-A2 | foundation for all attest WPs; immediate time win on `/security`, `/review-code` | semgrep/secrets/complexity over changed files only; deps/dead-code skipped on unchanged inputs |
| 3 | WP-A4 | the token win | OWASP 10 sessions → only categories touched; specialists read the delta |
| 4 | WP-A5 | the growing-branch token win | re-review after a fix = delta only |
| 5 | WP-R2 (after D4) | one tarball per batch | forge budget ÷ ~14 on first runs |
| 6 | WP-A3, WP-A6 | repeated-loop time wins | fix-verify and coverage-loop iterations no longer re-walk the tree |
| 7 | WP-R3, WP-R4 | the deeper RepoPulse incremental work | per-file scanners incremental; whole-tree scanners hash-gated; SBOM re-matched without a snapshot |
| 8 | WP-R5, WP-A7, WP-A8, WP-R6 | verify-then-fix and surfacing | visible scope everywhere; telemetry proves the savings |

**Measure before and after** (put the numbers in each PR): attest — `npm run telemetry:report` input tokens for a second `/security --deep` on an unchanged tree; wall-clock of `validate-phase-gate.sh feature` iteration 2. RepoPulse — forge budget consumed by two consecutive "Run scans now" presses; `scan_runs.scope` distribution after one week.

---

## 10. Beyond scanning — other time/token sinks found while investigating (added 2026-10-31)

Evidence source for attest: `node scripts/telemetry-report.mjs` over `docs/work/telemetry.jsonl` (3,141 assistant turns, 109 sessions). Ranked by measured spend.

| ID | Finding | Evidence | Fix (WP) | Size |
|---|---|---|---|---|
| X1 | **37 % of all input tokens (79.7 M of 214 M) were spent on turns that produced ≤ 20 output tokens.** The largest session (`ses_0610c84d…`, coding-agent on ternary-bonsai, 602 turns, 46.6 M input) emitted **exactly 16 output tokens on every turn from turn ~75 to 602** while input grew 63 tokens/turn — a degenerate repeat loop that nothing stopped. 2 sessions show ≥ 10 consecutive identical tiny outputs; 35 % of all turns are ≤ 20 tokens. The plugin has a turn cap (`plugins/expert-hooks.ts:155-200`, `EXPERTS_MAX_TURNS`, default **0 = off** outside the conductor) but no repeat-output guard (grep identical/repeat/stuck: none). `tools/loop-detector.ts` is model-invoked, so a stuck model never calls it. | **WP-X1 — harness-level stall guard** in `expert-hooks.ts`: track a rolling hash of the last K assistant outputs per session; on K=4 identical (or ≤ 20-token) consecutive outputs inject one `STALL DETECTED` directive, on K=6 abort the session with `BLOCKED: repeat-output stall` and write a telemetry row `source:"stall"`. Default `EXPERTS_MAX_TURNS` to 150 when unset (conductor keeps its own). Acceptance: replay the fixture session through the hook in `scripts/test-hook-guards.ts` → aborted at turn ≤ 81, not 602. | S — **highest payoff in the whole document** |
| X2 | Local models report `cache_read=0` on 2,700 messages (`TOKEN_OPTIMIZATION_PLAN.md:25`); `probe-prefix-cache.mjs:93-97` already distinguishes "server does not report" from "no reuse", but nothing enforces the result. Every turn at 65–100 k input re-prefills if KV cache is off. | **WP-X2**: `doctor.sh` runs the probe against the configured local endpoint and prints the VERDICT; `conductor.mjs` refuses to start a local-model run (or warns loudly) when the verdict is OFF; `docs/LOCAL_LLM_GUIDE.md` "check this first" gets the LM Studio `cache_prompt` steps. | S |
| X3 | Context grows monotonically to 90–160 k (`in_p95` 94–160 k for coding-agent/test-engineer on local models) with 24 KB tool-output cap but no mid-session compaction trigger based on size; compaction only happens when opencode decides. | **WP-X3**: in `expert-hooks.ts`, when `tokens_in` exceeds `EXPERTS_COMPACT_AT` (default 60 % of the model's context from `models.json`) inject the resume-anchor compaction directive proactively; measure `in_p95` before/after in telemetry. | M |
| X4 | `validate-mermaid` ran **3,579 times** (1,334 gapped) vs ≤ 70 for most validators; 505 runs on 2026-07-31 alone — it is called per deliverable by BOOK_PROTOCOL (`agents/shared/BOOK_PROTOCOL.md:174`) and twice per phase gate, and it shells out to `mmdc` (`validate-mermaid.sh:266`). | Covered by **WP-A6** cache (key includes the `.md` file hashes) — call it out explicitly in that WP's acceptance: 3 consecutive runs on unchanged docs → 1 real `mmdc` invocation. | — |
| X5 | Agent prompt weight: 101 agent files, 1.86 MB total; largest 94 KB (`sdlc-init-phases-3-4.md`), coordinators 44–59 KB; 66 agents embed the 56-line HANDOFF-intake block; compact variants exist for 50 agents (`dist/compact-agents`, 1.2 MB) but are opt-in (`--compact`). Baseline per session 36–41 k tokens. Token plan **C4 (core/full split)** and **C5 (compact default)** are still `todo` (`TOKEN_OPTIMIZATION_PLAN.md:118-119`). | Execute **C4/C5** as written there — no new design needed. Target from that plan: median first-message baseline < 12 k. | L (already specified) |
| X6 | `resume-anchor.ts` injects up to 3,600 chars (~900 tokens) on **every request** (`:58-64`) — over a 600-turn session that is ~0.5 M tokens of the same text. | **WP-X6**: inject the full anchor only on turn 1, after compaction, and every Nth turn (default 10); otherwise a 1-line pointer. Keep Pass 33d's "never tail-truncated" assertion. | S |
| X7 | RepoPulse Tier-2 calls send **one user message containing checklist + diff** (`packages/analysis/src/t2/client.ts:411`), so there is no stable prefix for a local server's KV cache and no `cache_control` for Anthropic (grep: none). The same checklist is re-sent for every chunk of every dimension. | **WP-X7**: split into a static system/first block (checklist, schema, rules — identical across chunks of a dimension, marked `cache_control: ephemeral` on Anthropic/Bedrock/Vertex) and a per-chunk user block (PR context + diff). Record `cache_read_input_tokens` in the usage row (claude-cli already sums it, `providers/claude-cli.ts:223`) and surface a cache-hit % on the Models settings page. | M |
| X8 | RepoPulse re-review on a new push reviews the **whole PR diff** again (`scheduling/index.ts:15-20` keys on headSha by design, nothing narrows the diff to the new commits). | **WP-X8**: when a prior review exists for the same PR at an earlier head, review only files/hunks changed between the two heads (forge compare), carry forward prior findings whose quoted lines still exist in the new diff, close the rest; `scope='incremental'` on the review run. Same merge discipline as WP-R3. | M |
| X9 | RepoPulse manual "Run scans now" with nothing changed still enqueues 14 jobs and 14 `scan_runs` rows before anything is skipped (pre-WP-R1). | Already covered by **WP-R1**; add: the route itself calls `isUpToDate` and returns `up_to_date: [...]` so the UI can say so instantly without a round-trip through the queue. | — |

Priority within §10: X1 (one afternoon, ~⅓ of all historical spend), X2, X7, X8, X6, X3, then X5 (C4/C5).

## 11. Work packages for §10 + OpenCode v1/v2 compatibility (added 2026-10-31, all APPROVED for execution)

**OpenCode context (verified 2026-10-31 against the official v1→v2 migration guide):** V1 plugin implementations do **not** run in V2; V2 plugins are `import { Plugin } from '@opencode/plugin'; export default Plugin.define({ id, async setup(ctx) {...} })` with domain hooks — `tool.execute.before/after` → `ctx.tool.hook('execute.before'|'execute.after')`, `chat.message` → `ctx.session.hook('prompt')`, `chat.params`/`experimental.chat.system.transform` → `ctx.session.hook('context')`, `experimental.session.compacting` → `ctx.session.hook('compaction')`, `event` → `ctx.event.subscribe()`; the V1 `tool()` helper is gone — custom tools register via `ctx.tool.transform(editor => editor.add({name, description, input (JSON Schema), execute}))`. Config renames: `agent`/`mode` maps → `agents`; agent frontmatter `prompt`→`system`, `disable`→`disabled`, `permission`→`permissions`, `maxSteps`→`steps` (a file using any V2 field is read as V2 and V1 fields are ignored — never mix); `plugin`→`plugins` (dirs `.opencode/plugins/`, local plugins must be directories), `command`→`commands`, `skills` → one ordered array, `mcp` → `mcp.servers` (`enabled`→`disabled`), `permission`→`permissions` (array of `{action,resource,effect}`; `bash`→`shell`, `task`→`subagent`), `compaction.preserve_recent_tokens`→`compaction.keep.tokens`; `tui.json`→`cli.json`. Agent dirs `agent/`, `agents/`, `mode/` are all still discovered. **Not confirmed by the docs and must be verified in WP-V1 step 0:** `opencode run --agent/--model/--dir` flags, and whether V2 reports `cached_tokens` in usage. Sources: https://opencode.ai/v2/docs/migrate-v1/ · https://kimaki.dev/blog/opencode-v2-migration

### WP-V1 — attest runs on OpenCode v1 **and** v2  (L, do first — everything in `plugins/`, `tools/`, agent frontmatter depends on it)
**Files:** `install.sh`, `scripts/doctor.sh`, `scripts/detect-model-context.sh`, `plugins/expert-hooks.ts`, `plugins/resume-anchor.ts`, new `plugins-v2/expert-hooks/index.ts`, `plugins-v2/resume-anchor/index.ts`, `tools/*.ts` (18 files), `scripts/build-agents.mjs`, `agents/**/*.md` (frontmatter only), `scripts/conductor/conductor.mjs` + `integration-review.mjs` (the `opencode run` invocations), `docs/UNATTENDED_EXECUTION.md`, `README.md` install section.
**Change:**
0. *Verify first* (record in the PR): install v2 in a scratch dir, run `opencode run --help` and confirm `--agent`, `--model`, `--dir` (or their replacements); run one call and check whether usage includes `cached_tokens`. Adjust steps 4–5 to what you find.
1. `install.sh`/`doctor.sh`: detect `opencode --version` major → `OPENCODE_MAJOR`; write it to `experts-version` beside the attest version. Refuse unknown majors with a clear message.
2. Plugins: keep `plugins/*.ts` as the V1 implementation; add `plugins-v2/<name>/index.ts` (directories, per V2 rule) using `Plugin.define` and the hook mapping above, sharing logic via `plugins/lib/*.ts` pure modules (turn cap, tool-output truncation, stall guard from WP-X1, resume-anchor text builder) so both shells are thin. `install.sh` installs exactly one set by major. Tests: `scripts/test-hook-guards.ts` runs the shared lib against fixture events for both shells.
3. Tools: move each `tools/*.ts` body into `plugins/lib/tools/<name>.ts` exporting `{name, description, inputSchema (JSON Schema), execute}`; V1 shell re-wraps with `tool()`; V2 shell registers them in `ctx.tool.transform`. 
4. Agents: `build-agents.mjs` gains `--target opencode-v1|opencode-v2` and emits frontmatter per target (`disable`→`disabled`, `prompt`→`system`, `permission`→`permissions`, `maxSteps`→`steps`; `mode: primary|subagent` is kept). Source files stay V1-shaped; `install.sh` builds the right dist. The reference docs with `disable: true` (`RALPH_WIGGUM_LOOP.md`, `CHALLENGER_PROTOCOL.md`, …) must become `disabled: true` under v2 or they will load as agents.
5. Conductor/integration-review: wrap the `opencode run …` argv in one `opencodeRunArgs(major, {prompt, agent, model, dir})` helper (`scripts/lib/opencode-cli.mjs`) and use the verified flags.
6. `opencode.json` templates/examples in `docs/` and `install.sh` (if any are written): emit V2 keys under v2 (`agents`, `plugins`, `commands`, `mcp.servers`, `permissions` array, `compaction.keep.tokens`).
**Acceptance:** `npm test` green; `npm run agents:check` green for both targets; `scripts/test-install-version.ts` covers both majors; `doctor.sh` prints `OpenCode vN detected · plugins: <set>`; a smoke `opencode run` of `/guide` works on each major (document the two version strings used).

### WP-X1 — harness stall guard  (S, highest payoff)
**Files:** `plugins/lib/stall-guard.ts` (new, pure), wired from both plugin shells (V1 `tool.execute.before` + the assistant-message event; V2 `ctx.session.hook('prompt')` + `ctx.event.subscribe()`), `scripts/test-hook-guards.ts`, `scripts/telemetry-report.mjs` (new `stall` section), `docs/work/TOKEN_OPTIMIZATION_PLAN.md` (row D1b).
**Logic:** per session keep the last K assistant outputs' hashes + token counts. `K_WARN=4` identical hashes **or** 4 consecutive outputs ≤ 20 tokens with no file write in between → inject once: `STALL DETECTED: your last 4 replies were identical/empty. Re-read the HANDOFF and the task ledger; take ONE concrete tool action or print BLOCKED: <reason>.` `K_ABORT=6` → abort the session (throw from the hook / mark session blocked), write `telemetry.jsonl` row `{source:"stall", session, turns, tokens_in_wasted}`, print `BLOCKED: repeat-output stall after N turns`. Default `EXPERTS_MAX_TURNS=150` when unset and not under the conductor (which sets its own). Env: `EXPERTS_STALL_WARN`, `EXPERTS_STALL_ABORT`, `0` disables.
**Acceptance:** replay of session `ses_0610c84ddffedep2fRsJnm41Ax` (extract its 602 rows from `docs/work/telemetry.jsonl` into a fixture) through the guard aborts at turn ≤ 81; a normal fixture (varying outputs) never triggers; `telemetry-report.mjs` prints stalls detected and tokens saved.

### WP-X2 — prefix-cache enforcement for local models  (S)
**Files:** `scripts/doctor.sh`, `scripts/probe-prefix-cache.mjs`, `scripts/conductor/conductor.mjs` (startup gates, near G4/G4b), `docs/LOCAL_LLM_GUIDE.md`.
**Change:** `doctor.sh` runs the probe against every `lmstudio/*`/`ollama/*` endpoint in `models.json` and prints the VERDICT line; conductor adds gate **G7**: when the coder or reviewer model is local and the probe verdict is OFF → refuse (`--cache-gate warn` downgrades). Under v2 (WP-V1 step 0) read `cached_tokens` if reported and log `cache_read` properly.
**Acceptance:** `scripts/test-conductor-suite.ts` covers G7 block/warn with a stubbed probe; doctor output shows the verdict on a machine with LM Studio.

### WP-X3 — proactive compaction trigger  (M)
**Files:** `plugins/lib/compaction-trigger.ts`, both shells (V1 `experimental.session.compacting` + message event; V2 `ctx.session.hook('compaction')`), `models.json` (per-model `context_window` where missing), `scripts/sync-model-limits.mjs`.
**Change:** when the last `tokens_in` > `EXPERTS_COMPACT_AT` (default 0.6 × context window) inject the resume-anchor's post-compaction directive and request compaction (v2: set `compaction.keep.tokens` guidance in docs; v1: the experimental hook). Never trigger twice within 10 turns.
**Acceptance:** fixture session with rising `tokens_in` triggers at the threshold once; telemetry `in_p95` for local coding-agent sessions recorded before/after in the PR.

### WP-X6 — resume anchor every Nth turn  (S)
**Files:** `plugins/lib/resume-anchor-text.ts` (extract builder), `plugins/resume-anchor.ts`, `plugins-v2/resume-anchor/index.ts`, `scripts/test-resume-anchor*.ts`.
**Change:** full anchor on turn 1, on the first turn after a compaction, and every `EXPERTS_ANCHOR_EVERY` (default 10) turns; otherwise a ≤ 200-char pointer (`Task ledger: docs/work/TASKS_<x>.md · HANDOFF: <path> · THE LOOP applies`). Keep the never-tail-truncated assertion for the full anchor.
**Acceptance:** fixture of 50 turns → full anchor injected 5–6 times, pointer otherwise; existing anchor tests green.

### WP-X7 — RepoPulse: cacheable prompt prefix + cache telemetry  (M)
**Files:** `packages/analysis/src/t2/client.ts` (`:383-413`), `packages/analysis/src/chunker/prompt.ts`, `packages/analysis/src/providers/claude-cli.ts`, `bedrock*.ts`/vertex providers, `packages/analysis/src/gateway/types.ts` (usage gains `cacheReadTokens`), the usage/egress rows, Settings → Models page (`apps/web`), `docs/design/ANALYSIS_TIERS.md`.
**Change:** build every T2/T3 request as `[static block: checklist + schema + rules] + [dynamic block: PR context + diff chunk]`; send the static block as `system` (OpenAI-compatible/LM Studio) or as the first content block with `cache_control: {type:'ephemeral'}` (Anthropic/Bedrock/Vertex). Record cache-read tokens per call; show `cache hit %` per model on the Models page. Guard: the static block must be byte-identical across chunks of one dimension (test asserts hash equality).
**Acceptance:** vitest asserts message shape per provider and static-block hash equality across chunks; live LM Studio integration test (existing `t2/live.integration.test.ts`, skipped without infra) shows warm-call latency < 60 % of cold for the same dimension.

### WP-X8 — RepoPulse: incremental re-review on a new push  (M)
**Files:** `packages/analysis/src/scheduling/index.ts`, `apps/api/src/workers/ai-pass-processor.ts` (or wherever the review job assembles the diff), `packages/forge` (`compareCommits` from WP-R3 — do WP-R3's port change first or in this WP), `packages/insights` carry-forward helper (shared with WP-R3), `docs/design/ANALYSIS_TIERS.md`.
**Change:** when a review for the same PR exists at an earlier head (same dimension, same prompt version), diff = files/hunks changed between the two heads; review only those chunks; carry forward prior findings whose quoted lines still appear in the new full diff, close the others; mark the run `scope='incremental', base_run_id`. Full review when no prior, prompt version changed, or compare unavailable.
**Acceptance:** vitest: PR with 10 files reviewed at head A; push touching 1 file → exactly that file's chunks go to the gateway; 9 files' findings carried forward with new `last_seen`; a finding whose quoted line vanished is closed. UI shows "incremental since <sha7>".

### WP-X9 — RepoPulse: instant up-to-date answer from the run route  (S, with WP-R1)
Covered in WP-R1 acceptance: `POST /runs` returns `up_to_date: [...]` computed synchronously via `isUpToDate` before enqueueing; UI shows it without polling.

### WP-X5 — attest C4/C5 core/full agent split  (L, unchanged from TOKEN_OPTIMIZATION_PLAN rows C4/C5; execute as written there after WP-V1 so the split is emitted per target)

### Model routing (DECIDED 2026-10-31)
`models.json` roles updated: coder → Claude Sonnet 5.5 (Haiku is no longer a coding model), reviewer → Claude Opus 5.5, challenger → GPT-5.5, advisor → Opus 5.5. Conductor gate G4 (coder ≠ reviewer) is satisfied. **G4b resolves these ids against the local OpenCode install at startup** — if the provider's exact id differs (e.g. `github-copilot/claude-sonnet-5.5` vs `claude-sonnet-5-5`), fix the string in `models.json`; run once with `--model-gate warn` to see what resolves.

## 9. Ralph coverage check for this plan

Every inventory row (A1–A15, R1–R11) maps to a WP or an explicit "keep": A1,A2→A1/A2 · A3,A4,A5→A4 · A6→A3 · A7→A5 · A8 keep · A9,A10,A15(B2)→A6 · A11,A12→A7 · A13 keep · A14→regen step in A2/A4/A7 · A15(B5)→A5 · R1→R2 · R2,R3→R1 · R4,R5→R3 · R6,R7,R11→R4 · R8 keep (+verify in R3) · R9→R2 · R10→R5. Coverage 26/26 rows. UNVERIFIED rows (A12, R8-scheduled, R10) each carry a verification step inside their WP rather than an assumption.
