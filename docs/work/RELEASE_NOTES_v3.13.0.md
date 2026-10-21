chore(release): v3.13.0 — token budget by design: review tiers, script-run runtime gate, once-per-branch audit, HANDOFF emitter

Measured over 3,141 logged messages (docs/work/TOKEN_OPTIMIZATION_PLAN.md):
99.5% of all tokens were INPUT, every session started at ~40k tokens, one
ticket's coding session ran 602 turns (46M tokens), and each ticket paid for
5–10 sessions — several of them doing a script's job. This release attacks
all three factors of baseline × turns × sessions-per-ticket, and moves the
broad security / code-health / perf audits from "every little update" to the
branch boundary where the whole tree is what is being judged.

Conductor (scripts/conductor/conductor.mjs)
- --review-tier ticket|full|integration (default ticket). Per ticket: one lean
  code-reviewer plus a specialist only when the board declares it, a HIGH-signal
  pattern lands on an ADDED line, or the deterministic scan finds something.
  Path-name heuristics ("session", "token", "store/", any .css) no longer
  recruit per ticket. `full` restores the old breadth.
- --ticket-scan on: scripts/scan/collect.sh --only semgrep,secrets over the
  ticket diff before Round 2 (zero model tokens); a hit recruits security with
  the findings file.
- --parallel-reviews auto: Round 2 reviewers run concurrently on hosted
  providers; sequential stays for local single-GPU servers.
- --runtime-mode script (default): Round 3 runs build/lint/tests/smoke (+ an
  optional ticket `runtime` command) from outside the session and writes
  RUNTIME_<id>.md from the exit codes; a model is spent only on FAIL, for the
  "Why it failed" diagnosis, and cannot change the verdict. The ticket's
  `verify` is the close gate and runs once, in close() (was three times).
  `agent` keeps the model-written round.
- --integration-review auto: the once-per-branch audit. Under --no-merge it
  runs in the worktree before the push and its INTEGRATION_* documents ride
  the branch; in merge mode it runs once at the end of the run over everything
  landed and commits the summary to main.
- --max-turns 120 by default; a budget-stopped coder session is continued in
  the SAME worktree from its TASKS ledger (--turn-continuations 2).
- agents.prompt-size receipt at startup; names --compact above 32KB.

New scripts
- scripts/scan/collect.sh — semgrep/opengrep, secrets (trufflehog or grep
  battery; values never copied), deps (npm/pip/cargo/go), dead code
  (knip/vulture), duplication (jscpd), complexity (lizard/radon) → one JSON;
  --base/--head range mode; missing tools recorded as skipped.
- scripts/conductor/integration-review.mjs — scanners once, then code-health
  (full orchestrator), security, perf, ux (if UI) CONCURRENTLY over
  base...head; --names integration|final|feature:<slug>; exit 0 only when
  every verdict is APPROVED.
- scripts/handoff-emit.sh — lints a written HANDOFF_<agent>.md (intake
  trigger, paired ════, PRODUCE, completion phrase, "Then stop", no USER:
  lines inside, no template prose or <placeholders>, balanced fences, ≤220
  lines) and prints the NEXT HANDOFF pointer as a tool result. Fixes the
  field report "the handoff prints wrong / repeats three times": a pointer
  typed into a markdown-rendered TUI reply collapses, and "emit the block"
  wording had the body echoed in prose on top of the file, the packet and the
  ledger.
- scripts/probe-prefix-cache.mjs — is the local server reusing the prompt
  prefix? cold/warm/other timing + cached_tokens → VERDICT + fix.

Plugin (plugins/expert-hooks.ts)
- EXPERTS_MAX_TURNS: after N completed assistant turns every tool call is
  refused except writes under docs/work/ and docs/reviews/, so the ledger and
  a partial manifest still land. Independent of EXPERTS_TELEMETRY.
- EXPERTS_TOOL_OUTPUT_MAX (default 24000 chars): read/grep/glob/list/bash
  results keep head + tail with an omission marker and a re-query hint.

Gates
- validate-release-readiness.sh condition 13: the latest INTEGRATION_SUMMARY
  must be APPROVED and fresh (no non-document changes after its Head-SHA).

Agents and prompts
- security-auditor Wave 1 = collect.sh + ONE triage session (was three
  tool-wrapping sessions); code-reviewer runs collect.sh in Step 0 and its
  tool-backed specialists triage the JSON; both are integration-tier reviews.
- Rule cards agents/shared/cards/{BOUNDED_TASK,LOOP_PREVENTION,ANTI_SLOP}_CARD.md
  (≤2KB each); the canonical handoff-intake and loop-prevention blocks and 14
  agents read the cards; long forms on demand.
- HANDOFF_TEMPLATES / HANDOFF_QUICK_REF / sdlc-lead / the SDLC mode files:
  write file → handoff-emit.sh → one-line reply → turn ends; packet = detail,
  HANDOFF = contract, ledger = checkboxes; loop tripwire; ~60 lines of
  orchestrator-facing prose moved out of the template block.
- Mode 3 step 6 and Phase 5 Round 1 default to one integration-review.mjs
  command instead of "open N sessions".

Not in this release
- L11 core/full agent split (the remaining baseline lever) — needs per-agent
  surgery; tracked in IMPROVEMENT_BACKLOG.md Group L.

Upgrade notes
- Defaults changed: review tier `ticket`, runtime mode `script`, max-turns 120,
  tool output bounded at 24000 chars, integration review `auto`. To get the
  3.12 behaviour: --review-tier full --runtime-mode agent --max-turns 0
  --integration-review off and EXPERTS_TOOL_OUTPUT_MAX=0.
- Run ./install.sh so handoff-emit.sh, collect.sh and the updated agents land
  in ~/.config/opencode; run doctor.sh after.
- validate-release-readiness.sh now requires an integration summary: run
  `node scripts/conductor/integration-review.mjs --root . --base main --head HEAD --names final`
  before the Phase 5 release gate.

Tests: conductor 17/17, hardening 32/32 (+3 new), handoff-emit 5/5, harness
passes 1-3/10/12/33/33b/36/48/51/54/57/58 205/205, agents:check in sync
across 98 agents.
