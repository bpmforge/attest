# Token & Overhead Optimization Plan

**Date:** 2026-10-21 · **Status:** shipped in v3.14.0 on `improve/token-optimization` (Group L in `IMPROVEMENT_BACKLOG.md`): everything except C4 (core/full agent split — needs per-agent surgery), B2/B5 (verify now runs once via B1; validator links in the summary), E2 (overlapped integration review), C5 (compact as install default) · **Owner:** Bradford Matthews

**Update 2026-10-31:** section F (incremental scanning, F0-F7) and D1b-D1d are done on `main`; open: X2 (cache gate), X5 (C4/C5), B2, E2 and the Mac verification list at the end of section F.

attest is powerful but spends far too many tokens per job and carries too much
process overhead — a security audit and a code-health audit for every small
update. This plan is built from measurements, not impressions, and every item
names the file it changes and how to tell it worked.

---

## 1. What the telemetry says

Source: `docs/work/telemetry.jsonl`, 3,141 completed assistant messages (plugin
rows) across 109 sessions, June–September 2026.

| Measurement | Value |
|---|---|
| Total input tokens (incl. cache reads) | **214.4M** |
| Total output tokens | 1.05M |
| **Input share** | **99.5%** |
| Baseline context on the FIRST message of a session (median) | coding-agent 38.7k · sdlc-lead 41.3k · researcher 41.7k · test-engineer 39.9k · security-auditor 36.0k · code-reviewer 35.7k · `build` 33.1k |
| Turns per session (median / max) | coding-agent 48 / **602** · test-engineer 13 / **516** · security-auditor 15 / 153 · code-reviewer 16 / 51 |
| Largest single session | coding-agent, `lmstudio/ternary-bonsai-27b-mlx`, 602 turns, **46.6M input tokens**, one ticket |
| Prefix-cache hit rate, local models (2,700 msgs) | **0%** (`cache_read` = 0) |
| Prefix-cache hit rate, `openai/gpt-5.5` (104 msgs) | 90% |
| One reviewer session on gpt-5.5 | `build` 1.10–1.40M · `code-reviewer` 0.50–0.98M · `security-auditor` 0.44–0.63M input tokens |

**The cost model is `baseline × turns × sessions-per-ticket`.** Output is noise.
Every item below attacks one of the three factors.

**Measured later (2026-10-31, incremental-scan audit):** **79.7M of the 214M input
tokens (37%) were spent on turns that produced <= 20 output tokens.** The largest
session (602 turns, 46.6M input) emitted exactly 16 output tokens on every turn from
turn ~75 while input grew ~63 tokens/turn: a degenerate repeat loop nothing stopped,
and 35% of all turns are <= 20 tokens. The turn cap defaulted to off outside the
conductor and `tools/loop-detector.ts` is model-invoked, so a stuck model never called
it. That makes "turns" a mechanism problem, not a prompt problem: see D1b-D1d (harness
stall guard, anchor cadence, compaction trigger). The second repeated cost is
re-auditing an unchanged tree: see section F.

### Where the process adds sessions

Per ticket, the unattended conductor (`scripts/conductor/conductor.mjs`) ran:

1. Round 1 — coder session.
2. Round 2 — `code-reviewer` + every reviewer the diff *triggered*. The triggers
   (`scripts/lib/review-triggers.mjs`) were documented as "biased toward firing":
   any path containing `session`, `token`, `middleware/`, `security` recruited
   security; `store/`, `cache`, `db` recruited perf; any `.css`/`.tsx` recruited
   ux. Sequential (`for … await`).
3. Fix loop — up to 3 iterations; the runtime-repair path re-ran **every**
   reviewer on the whole tree after any change.
4. Round 3 — a full coder-agent session (~40k baseline) whose prompt said, in
   full: run `verify`, paste the output and exit code, *do not use judgement*.
   The conductor then re-ran `verify` itself to check the model's claim, and
   `close()` ran it a third time.

Attended Mode 3 (`/sdlc feature`) step 6 fans out code-review + security +
perf + ux per feature, by having the **user open N OpenCode sessions by hand**.
The `code-reviewer` coordinator dispatches 7 specialist sessions + a
synthesizer; `security-auditor` dispatches 8 + an attack-chainer. Six of those
fifteen specialists exist to invoke a CLI (semgrep, trufflehog, npm audit, knip,
jscpd, lizard) and reformat its output.

### Prompt weight

- 63 agent files carry an identical 4,026-byte HANDOFF-intake block (managed by
  `scripts/build-agents.mjs`; `.compact.md` variants exist at 1,779 bytes).
- `BOUNDED_TASK_CONTRACT.md` (22.8KB) is referenced by 100 agents,
  `LOOP_PREVENTION.md` (15.4KB) by 75, `ANTI_SLOP_RULES.md` (27.5KB) by 12,
  `HANDOFF_TEMPLATES.md` (44.2KB) by 24 — including bounded-task sessions that
  never *emit* a HANDOFF.
- `coding-agent.md` is 49.3KB; with its 8 shared files and 2 references fully
  read it is ~166KB ≈ 41k tokens before the first line of work.
- `CONTEXT_BUDGET.md` asks the model to stop loading at 40–60% of its window.
  The 602-turn session shows a rule is not a mechanism.

---

## 2. The design: two review tiers

| | **Ticket tier** — every ticket / commit | **Integration tier** — once per branch, before PR to `main`; again at release |
|---|---|---|
| Deterministic (no model) | scope · manifest · build · lint · tests · `collect.sh --only semgrep,secrets` on the ticket diff · file size | `collect.sh` full tree: semgrep, secrets, deps, dead code, duplication, complexity · `validate-code-health` · module boundaries · smoke |
| Model sessions | **one** lean diff-scoped reviewer; a specialist only when the board declares it, a HIGH-signal pattern lands on an ADDED line, or the scanner finds something | code-review · security · perf (· ux when UI moved) — **in parallel**, over `main...branch`, reading the scanner JSON instead of re-running tools |
| Re-review after a fix | only the reviewer that blocked, on the delta | any code change invalidates all approvals (unchanged rule, now paid once per branch) |

Nothing that recruited security on a *semantic* signal has been removed. The
file-name heuristic has moved to the boundary where the whole tree is what is
being judged, and the scanner — which actually reads the code — fills the gap
per ticket at zero tokens.

---

## 3. Items

Sizing: S < ½ day · M 1–2 days · L > 2 days. "Done when" is the check, not the intent.

### A. Review tiers (sessions-per-ticket)

| # | Item | Size | Status | Files | Done when |
|---|---|---|---|---|---|
| A1 | `triggeredReviewers()` gains `tier: ticket \| full \| integration`; `ticket` recruits on declared + `highRe` only; `integration` recruits every auditor (ux on UI paths) | S | **done** | `scripts/lib/review-triggers.mjs` | hardening test "review tiers" passes; a diff touching only `src/auth/session.ts` with an innocuous line recruits `code-reviewer` alone at ticket tier |
| A2 | Conductor `--review-tier` (default `ticket`), logged per ticket | S | **done** | `scripts/conductor/conductor.mjs` | `round2.reviewers` rows carry `tier` |
| A3 | Per-ticket deterministic scan (`--ticket-scan on`): `collect.sh --only semgrep,secrets` on `main...branch`; a hit recruits `security` and hands it `docs/work/scan/ticket_<id>.json` | S | **done** | `conductor.mjs` `scanTicketDiff()` | `round2.scan` row per ticket; reviewer prompt names the findings file |
| A4 | `integration-review.mjs`: once-per-branch audit over `base...head`, scanner first, every auditor in parallel, `INTEGRATION_*` documents + summary, exit 0 only when all APPROVED | M | **done** (needs field run) | `scripts/conductor/integration-review.mjs` | run on a real branch produces `docs/reviews/INTEGRATION_SUMMARY_*.md`; blocking verdict exits 1 |
| A5 | Wire A4 into the merge boundary: conductor `--integration-review auto` (PR boundary under `--no-merge`, end-of-run in merge mode, docs committed); `validate-release-readiness.sh` condition 13 requires an APPROVED `INTEGRATION_SUMMARY` whose `Head-SHA` covers HEAD | M | **done** | `scripts/validators/validate-release-readiness.sh`, `agents/git-expert.md`, `skills/autopilot/SKILL.md` | release gate red without a fresh integration summary |
| A6 | Mode 3 step 6 / Phase 5 Round 1 attended fan-outs run through `integration-review.mjs --names feature:<slug> \| final`; manual HANDOFFs are the fallback via `handoff-emit.sh` | M | **done** | `agents/sdlc-feature-mode.md`, `agents/sdlc-init-phase-5.md`, `agents/sdlc/PARALLEL_WAVE_PROTOCOL.md` | the user never dispatches a review session by hand |

### B. Deterministic steps stay deterministic (sessions-per-ticket)

| # | Item | Size | Status | Files | Done when |
|---|---|---|---|---|---|
| B1 | Round 3 `--runtime-mode script` (default): run verify + `validate-build.sh` + `validate-lint.sh` from outside, write `RUNTIME_<id>.md` from exit codes; model session **only on FAIL** with a ~2k-token diagnosis prompt on the lean `build` agent; `agent` mode kept | M | **done** | `conductor.mjs` `runRuntimeRoundScript()` | hardening tests "script runtime mode" ×2 pass; a PASS ticket logs no `session.start role=runtime` |
| B2 | Verify once per candidate tree: cache `runVerifyDirect` by `git rev-parse HEAD^{tree}` so round 3, the override check and `close()` share one run | S | todo | `conductor.mjs`, `scripts/lib/tickets.mjs` | `verify` appears once per candidate in the receipts |
| B3 | `scripts/scan/collect.sh`: semgrep/opengrep, secrets (trufflehog or grep battery), deps (npm/pip/cargo/go), dead code (knip/vulture), duplication (jscpd), complexity (lizard/radon) → one JSON; range-scoped with `--base/--head`; missing tools recorded as `skipped` | M | **done** | `scripts/scan/collect.sh` | smoke-tested tree + range + `--only`; secrets finding reported as path:line, value never copied |
| B4 | Coordinators read the JSON instead of dispatching tool specialists: security → semgrep-runner, secrets-scanner, dependency-auditor become "read `collect.sh` output"; code-review → dead-code, duplication, complexity likewise. Security 8+1 → 3–4 sessions; code health 7+1 → 3–4 | M | **done** (dispatch tables) | `agents/security-auditor.md`, `agents/code-reviewer.md` | an audit's session count in telemetry drops by ≥5 |
| B5 | Validators that already exist (`validate-code-health`, `validate-dead-code`, `validate-deps`) are run by the integration tier before any model session, and their output is linked from the summary | S | todo | `integration-review.mjs` | summary lists validator exit codes |

### C. Baseline prompt (baseline)

| # | Item | Size | Status | Files | Done when |
|---|---|---|---|---|---|
| C1 | Floor measured from telemetry: `build` min first message = **13.4k** tokens (harness + tools + short task); coding-agent 38.7k median = floor + ~25k agent/shared text. The conductor logs `agents.prompt-size` per role at startup | S | **done** | — | a number per component in this file |
| C2 | Rule cards: ≤2KB `agents/shared/cards/{BOUNDED_TASK,LOOP_PREVENTION,ANTI_SLOP}_CARD.md`; the long forms become on-demand references | S | **done** (cards written) | `agents/shared/cards/` | cards exist, carry `disable: true`, each ≤2KB |
| C3 | Bounded-task sections of the heavy agents read the cards, not the long forms (`coding-agent`, `code-reviewer`, `security-auditor`, `test-engineer`, `performance-engineer`, +9 more via the shared sentence); the canonical `handoff-intake` and `loop-prevention` blocks point at the cards across all 98 agents; `HANDOFF_TEMPLATES.md` is never loaded inside a HANDOFF | M | **done** (cards + blocks; the baseline number is C1's job) | `agents/*.md` | `agents:check` green; first-message `tokens_in` for coding-agent < 20k |
| C4 | Core/full split: `agent.md` (≤8KB: identity, output contract, write-scope, completion phrase, cards) + `agent.full.md` loaded only in direct/interactive mode | L | todo | all 63 agents, `scripts/build-agents.mjs` | median first-message baseline < 12k |
| C5 | Conductor logs each role's installed agent size at startup and names `--compact` when > 32KB; making compact the install default is deferred with C4 | S | partial | `conductor.mjs`, `install.sh` | conductor sessions start from `dist/compact-agents/` |

### D. Turns per session (turns)

| # | Item | Size | Status | Files | Done when |
|---|---|---|---|---|---|
| D1 | Turn cap as a mechanism: `EXPERTS_MAX_TURNS` enforced in `plugins/expert-hooks.ts` — after N completed assistant turns every tool call is refused except writes under `docs/work/` and `docs/reviews/`, with an instruction to update the ledger, write a partial manifest, print `BLOCKED`. Conductor `--max-turns N` sets it per session | S | **done** | `plugins/expert-hooks.ts`, `conductor.mjs` | a stubbed session over the cap gets the `TURN BUDGET REACHED` error; telemetry shows no session > N turns when set |
| D1b | Harness stall guard (WP-X1): `plugins/lib/stall-guard.ts` tracks per-session consecutive stalled assistant turns (sha256-identical normalized output, or <= 20 output tokens with no file write). Warn at 4 (injects `STALL DETECTED`, via the same `warn` channel as the turn-budget message), abort at 6 (refuses further tool calls except ledger writes, prints `BLOCKED: repeat-output stall after N turns`, logs a `source:"stall"` telemetry row). `EXPERTS_STALL_WARN` / `EXPERTS_STALL_ABORT` override, `0` disables. `EXPERTS_MAX_TURNS` now defaults to 150 when unset (conductor always sets its own). **Measured:** 79.7M of 214M input tokens (37%) went to turns producing <= 20 output tokens; session `ses_0610c84d…` ran 602 turns at exactly 16 output tokens from turn ~75 (46.6M input) | S | **done** (merged `3584e38`; suite 1241 passed, 2 pre-existing fails) | `plugins/lib/stall-guard.ts`, `plugins/lib/turn-cap.ts`, `plugins/lib/telemetry.ts`, both `expert-hooks` shells, `scripts/telemetry-report.mjs` | replaying that session's row pattern aborts at turn 80 (not 602); varying-output sessions never trigger; `telemetry-report.mjs` prints a `## Stalls` section |
| D1c | Resume-anchor cadence (WP-X6): the full resume anchor (<= 3,600 chars) is injected on turn 1, after a compaction, and every `EXPERTS_ANCHOR_EVERY` (default 10) requests per session; other turns get a <= 200-char pointer (task ledger + HANDOFF path). `0`/`1` = always full (old behaviour). Over 50 turns: 5 full anchors instead of 50 (6 with a compaction at turn 23) | S | **done** (merged `4271016`; suite 1223 passed, same pre-existing failures) | `plugins/lib/resume-anchor-text.ts`, `plugins/resume-anchor.ts`, `plugins-v2/resume-anchor/index.ts` | cadence tests: fulls at turns 1,11,21,31,41; compaction resets the cadence. **VERIFY ON MAC:** the hooks carry `sessionID` (else all requests share one `_` session) |
| D1d | Compaction trigger (WP-X3): `plugins/lib/compaction-trigger.ts` requests a compaction when a session's input tokens (input + cache read + write) reach `EXPERTS_COMPACT_AT` (absolute tokens, 0-1 fraction of the window, `0`/`off` disables) or, by default, 0.6 x `models.json` `context_window`; min gap 10 turns, logs `source:"compaction-trigger"`. v1 calls `client.session.summarize`, falls back to a `/compact` directive. Unknown model + no env = disabled. `sync-model-limits.mjs --write-models` records `context_window` | S | **done** (merged `e1fd5a2`; suite 1274 passed, 2 pre-existing fails) | `plugins/lib/compaction-trigger.ts`, both `expert-hooks` shells, `scripts/sync-model-limits.mjs` | rising-input fixture fires once at the threshold, not again within 10 turns, re-fires at 11. **No `context_window` values are committed (none sourced); the `in_p95` before/after is not yet measured (Mac)** |
| D2 | Conductor default `--max-turns 120`; a budget-stopped coder session is continued in the same worktree from its ledger (`--turn-continuations 2`) | S | **done** | `conductor.mjs` | a capped session continues from its ledger without re-doing work |
| D3 | `scripts/probe-prefix-cache.mjs` times cold/warm/other prefixes and reads `cached_tokens` when reported → VERDICT + server-specific fix; LOCAL_LLM_GUIDE "check this first" | S | **done** |
| D4 | `tool.execute.after` bounds read/grep/glob/list/bash results to `EXPERTS_TOOL_OUTPUT_MAX` chars (default 24000): head 65% + tail 25% + omission marker with a re-query hint | M | **done** |

### E. Parallelism (wall clock, and the human overhead)

| # | Item | Size | Status | Files | Done when |
|---|---|---|---|---|---|
| E1 | Round 2 reviewers run concurrently (`--parallel-reviews auto`: on for hosted providers, off for `lmstudio/ollama/…` single-GPU) | S | **done** | `conductor.mjs` `runReviewRound()` | `round2.parallel` row; verdict order preserved |
| E2 | Integration review for branch N runs while the coder works ticket N+1 (read-only on a merged ref) | M | todo | `conductor.mjs` main loop | overlap visible in receipts |
| E3 | Security `--deep` Wave 1 (tool runners) is `collect.sh` + one triage session; Wave 2 model checkers run in parallel | S | **done** | `agents/security-auditor.md` | wave 1 spends 0 tokens |

### F. Incremental scanning (2026-10-31)

Source: `docs/work/INCREMENTAL_SCAN_PLAN.md`; every row is one conductor ticket in `docs/work/plan-incremental-scan.json`, manifest in `docs/reviews/MANIFEST_<id>.md`. Principle: scan and review what changed since the last good run, carry the rest forward, and make a full pass the explicit exception (`--full`, a release, a missing or stale ledger). Suite counts are `npm test` passed totals; every ticket ended with only the pre-existing failures (vendor-provenance RED fixture, attest-claude mode drift x2, skills-parity in some runs; 4 on the 1078 baseline, 2 at 1274).

| # | Item | Size | Status | Files | Done when |
|---|---|---|---|---|---|
| F0 | WP-V1: attest runs on OpenCode v1 and v2: one `scripts/lib/opencode-cli.mjs` argv table (`V2_FLAGS`), pure shared lib in `plugins/lib/`, v1 shells in `plugins/`, v2 shells in `plugins-v2/`, `build-agents.mjs --target opencode-v1\|opencode-v2`, `install.sh` and `doctor.sh` detect the major (`OpenCode vN detected · plugins: <set>`) | M | **done** (merged `c774ec1`; suite 1078 -> 1159 passed, +81 assertions; 4 pre-existing fails) | `scripts/lib/opencode-cli.mjs`, `plugins/lib/**`, `plugins-v2/**`, `install.sh`, `scripts/doctor.sh`, `scripts/build-agents.mjs` | `agents:check` green for both targets (101 agents); install into a scratch HOME picks the right set per major. **Not met, Mac only:** `opencode run` smoke of `/guide` on each major, v2 flag verification, v2 `opencode.json` keys (step 6) |
| F1 | WP-A1: `collect.sh` ledger. `--mode auto\|full\|diff`, `--full`, `--ledger`; per-scanner ledger entry `{head_sha, tree_hash, tool_version, rules_hash, ...}` in git-ignored `docs/work/scan/ledger.json`. Ledger rules: a scanner runs diff only when its sha is an ancestor of HEAD, tool version and rules hash are unchanged, the prior JSON still holds the result, changed files <= 400 (`SCAN_DIFF_CAP`) and it is not the 20th chained increment (`SCAN_MAX_INCREMENTAL`, then full and reset); changed set = `git diff --diff-filter=ACMRD` + dirty files + the ledger's prior dirty files. Output carries `meta.scope`, `changed_files`, `carried_forward`, `base_full_sha`. deps are cached for an unchanged lockfile on the same UTC day; deadcode/dup only on an unchanged tree that is clean. trufflehog/radon always scan the tree | M | **done** (merged `bb2bded`; suite 1078 -> 1116 passed, +38 assertions in `test-collect-incremental.ts`) | `scripts/scan/collect.sh`, `scripts/test-collect-incremental.ts` | incremental == a fresh full run on the fixture; a `.semgrep/` change forces full; range mode untouched; also fixed an empty-scanner-output bug that shifted `jq -s` indices |
| F2 | WP-A2: `/security` and `/review-code` default to `collect.sh` auto mode, `--full` documented; coordinators read only the stderr totals line and report `Scope: full \| incremental since <sha7> (<n> changed, <m> carried)` | S | **done** (merged `5103c1e`; suite 1215 passed, 3 pre-existing fails) | `agents/security-auditor.md`, `agents/code-reviewer.md`, `skills/security/SKILL.md`, `skills/review-code/SKILL.md`, `README.md`, compact agents | `agents:check` green. **Mac:** regenerate the attest-claude sibling (`npm run build:claude`) |
| F3 | WP-A3: fix-verify delta. Snapshot records `head_sha`; verify scans only cited + changed + dirty files and carries other baseline findings forward byte-identical; `--full`, `FIXVERIFY_DIFF_CAP` (300); logs `scanned_files: <n> of <total>`; validators always whole-tree | S | **done** (merged `9807ada`; suite 1078 -> 1083 passed, +5 tests) | `scripts/fix-verify.mjs`, `scripts/semgrep-full-audit.sh` (`--paths`), `scripts/test-fix-verify.ts` | fixing one finding gives 1 CLOSED / 2 OPEN with unchanged ids / 0 NEW, `scanned_files: 3 of 6`; a baseline without `head_sha`, `--full`, or too many targets go full. Also fixed `semgrep-full-audit.sh` flag parsing (`--baseline`/`--paths` values were not consumed) |
| F4 | WP-A4: shared `delta-review` block (1,132 B) in 8 specialist agents and both coordinators: review only the diff since the prior report named in the HANDOFF, carry prior findings forward only after a `grep -n` of the cited line, mark vanished lines CLOSED. `integration-review.mjs` passes `Prior report: <path>`; `validate-owasp.sh` counts `carried-forward` as DONE (confidence >= 7 still enforced) | S | **done** (merged `6a9317a`; suite 1241 passed, 2 pre-existing fails) | `agents/shared/blocks/delta-review.md`, 8 agents, `scripts/build-agents.mjs`, `scripts/conductor/integration-review.mjs`, `scripts/validators/validate-owasp.sh` | `agents:check` green for v1 and v2. **Unmet, Mac only:** the token-telemetry acceptance (second `/security` on an unchanged tree uses >= 60% fewer input tokens: record both `npm run telemetry:report` numbers) and a `run-evals` dry run showing a `Scope: incremental` header |
| F5 | WP-A5: integration-review watermark. `docs/work/.integration-reviewed.json` (`{branch:{reviewer:{head_sha,doc,verdict,date}}}`), `--since auto\|full\|<sha>` (default auto, `--full` alias): per reviewer full, delta, or reused (empty delta, or the trigger rule does not fire on it, e.g. ux on a non-UI commit; a prior CHANGES REQUESTED stays blocking). **Release rule:** the summary says `Scope: full` or `Scope: delta ...`; `validate-release-readiness.sh` condition 13 fails with `integration-review-delta-scope` / `final-review-delta-scope` unless the newest summary and final docs are full scope, so release never rides on a chain of deltas. Also delivers B5 (validators run before model sessions, exit codes in the summary) | M | **done** (merged `ae8377d`; suite 1274 passed, 2 pre-existing fails; `test-integration-review.ts` 21 checks) | `scripts/conductor/integration-review.mjs`, `scripts/validators/validate-release-readiness.sh`, `scripts/test-integration-review.ts` | first run is full and writes the watermark; one commit gives a delta with 3 spawns (ux reused); no change gives 4 reuses and 0 spawns; `--since full` clears the watermark. **Known:** a same-day delta summary can shadow a full one by file name, so rerun `--since full` before a release; the watermark file is git-ignored |
| F6 | WP-A6: validators incremental. `_lib.sh` `validator_changed_files` + `validator_cache_key`; per-file validators honour `--since`/`VALIDATE_SINCE`; whole-tree validators (dead-code, deps, module-boundaries, circular-deps, mermaid) cache by `HEAD^{tree}` + dirty hashes + script hash + args under git-ignored `docs/work/.validator-cache/` (`--no-cache` bypasses); `run-coverage-loop.sh` exports `VALIDATE_SINCE`, `run-handoff-gates.sh --runtime` passes `--since` to `validate-lint.sh`. Delivers B2 for validators | M | **done** (merged `c1c5d1a`; suite 1216 passed, 2 pre-existing fails). **Measured:** cacheable validator chain on an unchanged tree **5.21 s -> 2.62 s** (49.7% less, i.e. just short of the plan's >= 50% target; the figure comes from the M-A6 session, whose manifest is not tracked) | `scripts/validators/_lib.sh`, 12 validators, `scripts/validators/run-coverage-loop.sh`, `scripts/test-validators-incremental.ts` | second `validate-deps.sh` run prints `cached: true` with the same exit code; touching `package-lock.json` invalidates; `validate-lint.sh --since` lists only changed files. B2 for `conductor.mjs runVerifyDirect` is still open |
| F7 | WP-A7: `/sdlc improve` and `/sdlc onboard` use the ledger instead of asking. Improve: a deterministic rule (`--full`, no ledger or no prior reports, non-ancestor sha: full; empty diff and clean tree: `Scope: unchanged since <sha7>` with no re-dispatch; else `Scope: delta since <sha7>`) recorded in `docs/work/sdlc-state.md`. Onboard (confirmed to re-walk everything before: `sdlc-onboard-mode.md:431,467`): Incremental Inventory re-inventories only changed top-level dirs, untouched rows `carried-forward`, `Inventory-SHA` header. `validate-improve-coverage.sh` accepts `carried-forward` audits once the backlog references them | S | **done** (merged `a3eeffd`; suite 1239 passed at ticket time (4 pre-existing fails, identical to baseline), 1274 passed with 2 pre-existing fails after the wave merged; prompt-level change, gate-checked) | `agents/sdlc-improve-mode.md`, `agents/sdlc-onboard-mode.md`, `skills/onboard-inventory/SKILL.md`, `scripts/validators/validate-improve-coverage.sh` | `agents:check` green (v1 and v2); validator hand-checked on a temp repo (covered when referenced, `unsynthesized-audit` when not). `app-cartographer` unchanged (it crawls a live app, not the git tree). The ledger rule was not run end to end (ledger is git-ignored runtime state) |

**Not done yet (honest list):**

| # | Item | Status |
|---|---|---|
| X2 | Cache gate (WP-X2): decide cache-dependent behaviour from reported `cached_tokens` | **unblocked** — verified on OpenCode 2.2.5: the v2 step events carry `tokens.cache.read/write` (a provider `cached_tokens` of 700 arrived as `cache.read: 700`, and `tokens.input` is the NON-cached remainder: 300 of 1000). The gate itself is still to be built |
| X5 | Core/full agent split (C4) and compact as install default (C5) | **in progress** (branch `feat/M-X5-core-full-split`) |
| B2 | Verify once per candidate tree in the conductor | todo (validators got the cache in F6; `runVerifyDirect` did not) |
| E2 | Overlap integration review with the next ticket | todo |

**VERIFY ON MAC.** Items 1 and 2 were verified on 2026-11-01 against `@opencode/plugin` 2.2.5 and a real `opencode` 2.2.5 binary (a fake OpenAI-compatible provider drove real tool calls, a title request and a compaction); see `docs/reviews/MANIFEST_V1b-opencode-v2-contracts.md`. The only items that need a Mac are the real-model smoke (item 1) and the LM Studio prefix-cache probe (item 4); items 5 and 6 are unrelated to OpenCode v2 and unchanged.

1. **opencode v2 — VERIFIED, real-model smoke left.** `opencode run` flags: `--model provider/model#variant`, `--agent`, `--format default|json`, `--session/-s`, `--continue/-c`, `--fork`, `--file/-f`, `--title`, `--thinking`, `--auto`; **no `--dir`** (cwd is the project), so `V2_FLAGS` lost `dir` and gained `auto`. v2 reports cached tokens (`tokens.cache.read`). `opencode.json` v2 keys: `mcp.servers.<name>` with `disabled` (not `enabled`), `permissions` array of `{action, resource, effect}` (`bash` becomes `shell`, `task` becomes `subagent`; `external_directory`, `edit`, `read` keep their names), `compaction.keep.tokens` and `compaction.buffer`; `install.sh` now writes them and no longer warns. Plugin directories with `plugins/lib/` and `scripts/lib/` beside them load (both `loading plugin` lines present, no error). **Left for the Mac:** one `/guide` run on a real model with both version strings recorded.
2. **v2 payloads — VERIFIED.** `plugins-v2/**` type-checks strictly against the real package (`npm test`). Text for the stall guard comes from `session.text.ended` (`session.message.content.updated` is replay-only; `session.usage.updated` is ephemeral with no message id); `session.compacted` is `session.compaction.ended`; the compaction request is `ctx.session.compact({ sessionID })` (no `summarize`, no `ctx.client`); the tool event is one mutable object (`execute.before` `{ tool, sessionID, agent, messageID, id, input }`, `execute.after` adds `status` and `result` / `error`); the hooks carry `sessionID`. Also found: the built-in shell tool is `shell` with a `path` file argument, and plugin tools must set `options.codemode:false` to be callable.
3. attest-claude: regenerate the sibling (`npm run build:claude`) and re-run `agents:compact` for the agents edited since the last regeneration; the sibling is not mounted on the Linux device.
4. `context_window` sync: `node scripts/sync-model-limits.mjs --config <opencode.json> --write --write-models`, otherwise set `EXPERTS_COMPACT_AT`; then compare `in_p95` in `npm run telemetry:report` for local coding-agent about a week after enabling, and run `scripts/probe-prefix-cache.mjs` against LM Studio. (The mid-loop compaction request itself is verified: `ctx.session.compact` produced a real summarizer request on 2.2.5.)
5. Token-telemetry acceptance of F4 (>= 60% fewer input tokens on a second `/security`), recorded from `npm run telemetry:report` (its new `## Scan & review scope` section shows the scan and review scope mix).
6. bash-3.2 run: the new shell code (`collect.sh`, `_lib.sh` cache helpers, validators) on the macOS system bash.

---

---

## 4. Expected effect

Per ticket on a hosted model today: coder + code-reviewer + 1–3 triggered
specialists + up to 3 fix re-reviews of **all** reviewers + runtime session ≈
5–10 sessions at 35–41k baseline each. After A+B: coder + 1 lean reviewer
(+ security only when the scanner or a high-signal line says so) + scripts ≈
2 sessions; runtime is 0 model tokens on a PASS. With C2–C4 the baseline drops
~4×. Roughly an order of magnitude on the per-ticket path. The broad audits cost
about what one ticket's review costs today, once per branch, in parallel.

How to verify: `npm run telemetry:report` before/after on the same board;
compare `sessions per landed ticket`, `input tokens per landed ticket`, and the
per-agent first-message baseline from §1.

---

## 5. Safety argument (what did NOT get weaker)

- A high-signal added line (`child_process`, `eval(`, `jwt.sign`, `req.body`, raw
  SQL, `dangerouslySetInnerHTML`) still recruits a human-grade security review
  on the ticket.
- A semgrep ERROR or a secret pattern in the ticket diff recruits it too — and
  that is a stronger signal than a filename.
- Every branch still gets the full security / code-health / perf audit before
  it can reach `main`; it is simply no longer repeated per ticket.
- The runtime verdict is now *only* the machine's exit codes; the model can add
  a diagnosis but cannot flip the verdict (the script re-asserts the verdict
  line after the diagnosis session).
- The turn cap cannot be switched off by `EXPERTS_TELEMETRY=0`, and leaves the
  ledger/manifest writable so a capped session ends with its state on disk.
