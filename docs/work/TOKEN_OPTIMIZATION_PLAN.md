# Token & Overhead Optimization Plan

**Date:** 2026-10-21 · **Status:** A1–A5, B1, B3, B4, C2, C3, D1, E1, E3 shipped on `improve/token-optimization` (tracked as Group L in `IMPROVEMENT_BACKLOG.md`); the rest open · **Owner:** Bradford Matthews

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
| A6 | Mode 3 step 6 / Phase 5 Round 1 attended fan-outs run through `run-plan.mjs` (or `integration-review.mjs`) instead of "open N sessions" | M | todo | `agents/sdlc-feature-mode.md`, `agents/sdlc-init-phase-5.md`, `agents/sdlc/PARALLEL_WAVE_PROTOCOL.md` | the user never dispatches a review session by hand |

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
| C1 | Measure the floor: one no-op `opencode run --agent build` and read `tokens_in` of the first message; attribute to global instructions, 20 custom tool schemas, AGENTS.md | S | todo | — | a number per component in this file |
| C2 | Rule cards: ≤2KB `agents/shared/cards/{BOUNDED_TASK,LOOP_PREVENTION,ANTI_SLOP}_CARD.md`; the long forms become on-demand references | S | **done** (cards written) | `agents/shared/cards/` | cards exist, carry `disable: true`, each ≤2KB |
| C3 | Bounded-task sections of the heavy agents read the cards, not the long forms (`coding-agent`, `code-reviewer`, `security-auditor`, `test-engineer`, `performance-engineer`, +9 more via the shared sentence); the canonical `handoff-intake` and `loop-prevention` blocks point at the cards across all 98 agents; `HANDOFF_TEMPLATES.md` is never loaded inside a HANDOFF | M | **done** (cards + blocks; the baseline number is C1's job) | `agents/*.md` | `agents:check` green; first-message `tokens_in` for coding-agent < 20k |
| C4 | Core/full split: `agent.md` (≤8KB: identity, output contract, write-scope, completion phrase, cards) + `agent.full.md` loaded only in direct/interactive mode | L | todo | all 63 agents, `scripts/build-agents.mjs` | median first-message baseline < 12k |
| C5 | Compact variants become the default for conductor sessions (`--compact` overlay already exists) | S | todo | `conductor.mjs`, `install.sh` | conductor sessions start from `dist/compact-agents/` |

### D. Turns per session (turns)

| # | Item | Size | Status | Files | Done when |
|---|---|---|---|---|---|
| D1 | Turn cap as a mechanism: `EXPERTS_MAX_TURNS` enforced in `plugins/expert-hooks.ts` — after N completed assistant turns every tool call is refused except writes under `docs/work/` and `docs/reviews/`, with an instruction to update the ledger, write a partial manifest, print `BLOCKED`. Conductor `--max-turns N` sets it per session | S | **done** | `plugins/expert-hooks.ts`, `conductor.mjs` | a stubbed session over the cap gets the `TURN BUDGET REACHED` error; telemetry shows no session > N turns when set |
| D2 | Conductor default `--max-turns 80` once D1 has a field run; resume-from-ledger on a `BLOCKED: turn budget` session reuses the worktree (not a fresh attempt) | S | todo | `conductor.mjs` | a capped session continues from its ledger without re-doing work |
| D3 | Local prefix cache: `cache_read` is 0 on 2,700 local messages. Two possibilities — KV reuse is off, or LM Studio's OpenAI-compatible `usage` simply never reports `cached_tokens` even when it reuses. Verify with a 2-turn probe (second-turn latency vs. prompt length); if reuse is on, the telemetry is under-reporting and the local numbers in §1 are an upper bound | S | todo | `scripts/sync-model-limits.mjs`, `docs/LOCAL_LLM_GUIDE.md` | local sessions report non-zero `cache_read` |
| D4 | Compress tool results before they enter context (CONTEXT_BUDGET rule 3) mechanically: `tool.execute.after` truncates read/grep/bash output above N KB with a "…tail omitted, re-read with offset" note | M | todo | `plugins/expert-hooks.ts` | avg context growth per turn drops |

### E. Parallelism (wall clock, and the human overhead)

| # | Item | Size | Status | Files | Done when |
|---|---|---|---|---|---|
| E1 | Round 2 reviewers run concurrently (`--parallel-reviews auto`: on for hosted providers, off for `lmstudio/ollama/…` single-GPU) | S | **done** | `conductor.mjs` `runReviewRound()` | `round2.parallel` row; verdict order preserved |
| E2 | Integration review for branch N runs while the coder works ticket N+1 (read-only on a merged ref) | M | todo | `conductor.mjs` main loop | overlap visible in receipts |
| E3 | Security `--deep` Wave 1 (tool runners) is `collect.sh` + one triage session; Wave 2 model checkers run in parallel | S | **done** | `agents/security-auditor.md` | wave 1 spends 0 tokens |

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
