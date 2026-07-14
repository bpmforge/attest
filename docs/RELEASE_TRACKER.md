# Release tracker — bpm-opencode-experts (FIRST in the release order)

**Shipped:** v2.0.0 (2026-07-12) — field-lessons fold, M28 conductor ref impl, exact parity.
**Target:** **v2.1.0 "v2 stream complete"** — every opencode-experts-related amplifier ticket
done+merged, local-model work finished, conductor adapted to the module schema. Shipwright
stays paused until this ships (founder decision 2026-07-12). Alignment: `docs/ALIGNMENT_MATRIX.md`.

## R1 — Amplifier M26–M31 stream (the bulk; AUTOMATED)
The 42-ticket go-forward stream (T26 lifecycle, T27 gate integrity, T28 conductor, T29 field
lessons, T30 advisor/tier-guard, T31 self-audit). State 2026-07-12: 12 done / 17 ready / 13 blocked.
- **Automation (RUNNING):** `bpm-agent-amplifier/scripts/conductor.mjs` under
  `supervise-conductor.sh`, scoped `--match "T2[6-9]|T3[01]"` — one `claude -p` executor per
  ticket, limit sleep-to-resume, tickets land in **review**, halts if this repo's suite goes RED.
- **Human loop:** morning queue — review PRs (`gh pr list`), merge, then
  `node scripts/launch-executor.mjs --close-merged` on the amplifier board; blocked tickets
  unblock as their deps merge (re-run staleness check).
- Exit: all T26–T31 non-waived tickets done; waivers signed in the board.

## R2 — Autonomy O2 + O3 (local-model autonomy proof)
From AUTONOMY_AND_LOOP_UPGRADE_PLAN: **O2 loop upgrades** (fold the v2 tier-aware budgets into
run-until-done/run-plan runtime behavior, not just protocol text) and **O3 prove** (live numbers
on local hardware per O3_PROVE_RUNBOOK — qwen3.6/gemma-QAT runs demonstrating soft-gates +
12-iteration convergence loops + escalation ledger). This is the "works better with local models"
finish line: measured, not asserted.

## R3 — Conductor adaptation to module tickets (T28.x completion)
`scripts/conductor/` (field-proven, plan.json product boards) adapted to THIS repo's schema:
claim/close via `tickets.mjs` verbs (not raw status flips) · gates via `run-handoff-gates.sh` ·
per-role models.json honored · finding-ledger classes at the review step. Acceptance: conductor
runs a 3-ticket fixture board end-to-end with red fixtures proving spoofed manifest/self-accept/
promise-token all refused.

## R4 — Finding-ledger classes scripted (close the protocol→script gap)
`fix-verify.mjs` today prints CLOSED/STILL-OPEN/NEW. Add: **REGRESSED** detection (fingerprint
reappears after CLOSED), per-row attempt counters, and iteration-class output
(STALLED/PROGRESSED/OSCILLATING) so FIX_VERIFY step-5 budgets are computed, not judged.
Tier-aware ceilings read from `.model-context` tier. Tests: fixture sequences for each class.

## Test truth (release gate for v2.1.0)
1. `npm test` — full suite (283 at v2.0.0; grows with R3/R4) — 0 failures.
2. `node scripts/check-validator-fixtures.mjs` — every chained validator red/green fixtured.
3. `npm run evals` — eval harness green on the fixture set.
4. **O3 evidence** — local-model run artifacts committed (the prove-runbook outputs).
5. `npm run build:claude:check` — 0 drift; skills-parity exact.

## Release steps (repeatable)
`npm test` green → `npm version 2.1.0` → `npm run build:claude` → commit both repos →
tag `v2.1.0` both → push `origin`+`github` `--tags` both → `gh release create` both →
re-run Shipwright `scripts/import-content.mjs` (SW-R1) so the product ships the same library.

## Status log
- **2026-07-14 — v2.4.0 RELEASED** (both repos): loop/gate correctness + coding-agent hygiene (from a 2-audit review of the per-ticket loop vs the completed upgrade plan). (1) Challenger wired into the coding wave (phase-4/feature Round 2b + validate-challenger-gate.sh in phase-4 gate) — was only at design/release gates. (2) Fixed fix-verify.mjs iteration classifier (movement-based per doc: OSCILLATING=regressed, PROGRESSED=all-closed+new, STALLED=survives, CLEARED) — it was count-based + never got `regressed`; test encoded the bug, now fixed + new cases. (3) Loop tier-aware/class-driven not flat-3 (6/12 ceiling); O2.5 contract-conformance in re-verify. (4) coding-agent told about memory MCP + validate-tech-stack now an enforced handoff gate + pre-code anchored (Context7/anti-slop/research/tests-alongside/strict-handoff already present). 401 tests green.
- **2026-07-14 — v2.3.0 RELEASED** (both repos): (1) handoff delivery is now a DOCUMENT the specialist reads (`docs/work/HANDOFF_<agent>.md`) + a pointer to the user (open /skill, read the doc), not a pasted block — reworked HANDOFF_TEMPLATES/EXECUTOR_SELECTION/sdlc-lead + 59 per-handoff headers. (2) Delegation-discipline hardening from a full audit: SDLC lead never does specialist work inline — feature/improve inline-exploration → HANDOFF to app-cartographer; onboard health-coordinator inline guard (sub-checks stay HANDOFFs, only synthesize HEALTH_ASSESSMENT from reports); anti-inline guards on post-code review/security (phase-4/5/feature); allow-list reconciled. Audit verdict: rule now UNIVERSAL across init/feature/improve/onboard. 400 tests green.
- **2026-07-14 — v2.2.2 RELEASED** (both repos): fixed SDLC orchestrators calling specialists DIRECTLY (Executor B subprocess / A Task-tool) in interactive opencode instead of emitting a HANDOFF block telling the user which agent to open + what to submit. Root cause: executor selection keyed on has_task_tool/opencode_cli + T30.10 preferred subprocess in the TUI. Fix: EXECUTOR_SELECTION.md reworked so **autonomy is primary** — interactive → always Executor C (HANDOFF for the user); A/B programmatic dispatch is auto-only. Aligned 14 agent/protocol files. (Grep validator gate evaluated but rejected — too false-positive-prone; the reworked source-of-truth doc is the guard.) 400 tests green.
- **2026-07-14 — v2.2.1 RELEASED** (both repos): upgrade migration for the v2.2.0 pullmd removal. `scripts/migrate-remove-pullmd.sh` (wired into install.sh, auto-heals on upgrade) removes the stale `mcp.pullmd` entry from opencode.json (with backup), stops/removes the pullmd containers, `--purge` deletes the clone. Idempotent no-op on fresh installs. Pass 39 test, 400 tests green. Healed this machine's live config.
- **2026-07-14 — v2.2.0 RELEASED** (both repos): removed the external **pullmd** Docker dependency — web research now runs on our own in-house **bpm-pull** (playwright-search v0.3.0, zero-dep fetch→extract→markdown + Playwright fallback; verified live with the external service down). Stripped ~370 lines from install.sh, the pullmd MCP from opencode.json, and all defunct pullmd_read_url/read_url/get_share tool refs from the research docs. **Retained external by design: Context7, playwright-mcp, Semgrep.** Remaining: mempalace → in-house bpm-memory-mcp (deferred). 398 tests green.
- **2026-07-13 — v2.1.0 RELEASED** (both repos: tags `v2.1.0` ancestors of main, GitHub releases live). Driven via the supervised sonnet auto-loop (13 waves, ~35 clean PRs, zero garbage) from 36%→43/45. Five of six modules complete (M26/M27/M28/M29/M30); **M31 partial**: T31.2 **waived** (Jarvis-dependency, deferred v2.1.x), T31.8 **O3 step-1 pause-census proven live** on LM Studio qwen3-coder-next @127.0.0.1 (interactive=1/auto=1/never-auto=1; also found+fixed a false-green in `pause-census.mjs`), O3 steps 2 (2h soak) + 3 (eval triad) deferred v2.1.x. User docs re-synced (41 skills / 71 validators, `/vault` documented, catalog +vendor-provenance/+GUIDE_CAPTURE). 398 tests green. **Remaining release step (deferred): SW-R1 Shipwright `import-content.mjs` resync — belongs to Shipwright's resume flow (paused repo has uncommitted work; don't resync into it prematurely).**
- 2026-07-12 — v2.0.0 released; amplifier auto-conductor launched on R1; tracker created.
