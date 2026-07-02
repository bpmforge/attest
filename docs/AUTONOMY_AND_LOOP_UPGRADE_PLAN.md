# Autonomy & Loop Upgrade Plan — kill the pauses, upgrade the loops

**Status:** design + build plan (2026-07-01).
**Audience:** an implementation agent (can be a lower-tier model). Self-contained: every
task names its files, edits, validators, and acceptance criteria. Execute waves in order.
**Companions:** `agents/shared/MICRO_LOOP.md`, `MODEL_ADAPTER.md`, `RALPH_WIGGUM_LOOP.md`,
`FIX_VERIFY_LOOP.md`, `EXECUTOR_SELECTION.md`, `docs/LOOP_ENGINEERING_PLAYBOOK.md`,
and the Jarvis twin plan `ai-assistant-agent/docs/coverage-tracker/SMALL_CONTEXT_MEMORY_PLAN.md`
(waves M6/M7 there are the code-side versions of wave O2 here).

---

## 1. The two pause problems (diagnosis first)

Runs "pause and need continue" for **two unrelated reasons**. Fixing one won't fix the other.

### 1a. By-design pauses (protocol-level — we wrote them)

The expert system is deliberately human-in-the-loop. Verified pause points:

| Site | What it does |
|---|---|
| `agents/sdlc-lead.md:534, 583` | HUMAN GATE A (Phase 2→3) and B (Phase 3.5→4): "Wait for user to type 'yes'" |
| `agents/sdlc-lead.md:606`, `agents/shared/PHASE_ROUTING_PROTOCOL.md:113` | Inter-phase check-in after EVERY gate: "Do not auto-continue" |
| `agents/shared/EXECUTOR_SELECTION.md:32` (Executor C) | HANDOFF printed as text; user must open a session, paste, return |
| `agents/shared/RALPH_WIGGUM_LOOP.md:245`, `FIX_VERIFY_LOOP.md:156` | Loop exhaustion: "No 4th iteration without explicit user direction" |
| `agents/sdlc-improve-mode.md:649, 674` | Backlog approval: "Do not execute yet — get approval first" |
| `agents/sdlc-init-phases-0-2.md:74` etc. | "Do NOT auto-advance" per phase file |
| `agents/shared/MODEL_ADAPTER.md:49, 54` | Small tier: one HANDOFF per session, restart after 3 — the restart is a user action |

There is **no autonomy mode** in the opencode agents today; unattended operation is
deferred to the unbuilt Foreman runtime. Wave O1 adds an autonomy level NOW, as protocol
rules, with Foreman's planned semantics (auto-with-approval-log; destructive ops always pause).

### 1b. Accidental pauses (runtime-level — opencode + LM Studio bugs)

Verified against opencode issues/docs (2026-07-01):

| Cause | Evidence | Class |
|---|---|---|
| **Announce-then-stop**: model says "I'll now edit X", ends turn with no tool call → opencode legitimately ends the loop | community-wide; canonical fix is the GPT-4.1 "persistence" prompt block (+20% SWE-bench, OpenAI cookbook) | model behavior |
| **qwen3.6-35b-a3b emits XML/naked tool calls as text** mid-run → parsed as final text → loop ends | anomalyco/opencode **#24316** (open; names this exact model) | parse bug |
| **LM Studio sends `tool_calls: []` in every response** → SDK waits forever | **#4255** (disputed-fixed) | provider bug |
| **`finish_reason:"stop"` even when tool calls exist** → loop exits after one tool call | **#14972** (FIXED via PR #14973) — old opencode builds only | fixed: upgrade |
| **max_tokens hardcoded 32000 for LM Studio** (config `limit.output` ignored) | **#20078** (open) — our 45k rule is silently clamped | clamp |
| **LM Studio itself silently caps generation ~9.5–16k tokens** on qwen3.6 thinking models, `finish_reason:"stop"`, no error → thinking eats the cap, turn ends mid-plan | lmstudio-bug-tracker **#1829** (open); bare llama.cpp has no cap | clamp |
| **5-min default request `timeout`** + chunk stalls on long local generations | opencode.ai/docs/config (`timeout` default 300000ms, `chunkTimeout`) | config |
| **`steps` agent option**, if ever set: agent is FORCED to stop text-only when hit | opencode.ai/docs/agents (default unlimited) | config |

Net: on this stack, a thinking model has ~10–16k real output tokens per turn regardless of
config. Long thinking → truncation → no tool call → pause. Wave O0 attacks all of these.

---

## 2. Wave O0 — Kill the accidental pauses (config + plugins + one prompt block)

### O0.1 Provider + timeout config hardening  [S]
**Do:** in `examples/opencode.json` (and README/LOCAL_LLM_GUIDE guidance):
- LM Studio provider options: `"timeout": false` (or ≥1200000) and a generous
  `chunkTimeout` (≥120000) — M2 Max thinking turns exceed the 300s default.
- Add a comment block documenting the two output clamps (#20078 opencode 32k hardcode,
  #1829 LM Studio ~10–16k silent cap): **plan token budgets assuming ≤10k real output
  per turn** on qwen3.6-thinking via LM Studio; for long unattended runs prefer bare
  `llama-server` (no cap observed).
- Verify no `steps`/`maxSteps` is set anywhere (`grep -rn "steps\|maxSteps" examples/ agents/`).
- Doc note: minimum opencode version — the finish_reason continuation fix (#14972/PR
  #14973) landed ~v1.2.11; older builds stop after every tool call on OpenAI-compatible
  endpoints. Add a version check line to the doctor/install docs.
**Files:** `examples/opencode.json`, `docs/LOCAL_LLM_GUIDE.md`, README install section.
**Accept:** config carries timeout/chunkTimeout + clamp comments; guide has a
"pause troubleshooting" section listing the 8 causes above.

### O0.2 Auto-resume + todo-reminder plugins  [S]
**Why:** community plugins already detect and fix the exact failure modes we hit.
**Do:** add to `examples/opencode.json` `"plugin"` array + document in LOCAL_LLM_GUIDE:
- **`opencode-auto-resume`** (Mte90): detects stream stalls (≥48s busy-no-output), raw-text
  tool calls (`<function=…>` — the #24316 qwen failure), hallucination loops; sends
  "continue" with backoff, `maxRetries: 3`.
- **`opencode-todo-reminder`**: on `session.idle`, if pending/in_progress todos remain,
  injects a reminder; `maxAutoSubmitsPerTodo: 3`.
Both have bounded-retry guards — document the guard values so runaway loops can't happen.
Note the upstream gap: `session.idle` fires *after* the loop breaks (feature request
#16626 `session.stopping` would make it silent) — injected continues appear as user turns;
that's cosmetic on local, but **NOT free on metered cloud providers**: on GitHub Copilot
every injected user turn bills as a premium request (#8700 — synthetic user messages burn
premium requests). Rule: enable auto-continue plugins for LOCAL providers; on
Copilot/Vertex/API providers keep them off or set minimal retry caps, and rely on the
O0.3 persistence block instead (prompt-side, costs nothing per pause).
Provider scope note for the docs: the pause classes are NOT all local-only —
announce-then-stop reproduces on Copilot (opencode #2660, Claude Sonnet 4; GitHub
community #184524), the finish_reason bug (#14972) hit Gemini/LiteLLM paths, and
Vertex/Gemini has its own tool-call flavor (`MALFORMED_FUNCTION_CALL` returned
frequently → silent turn end). Only the token clamps (#20078, LM Studio #1829) and
chunk-stall timeouts are local-specific. O0.3 + O1 apply to every provider.
**Files:** `examples/opencode.json`, `docs/LOCAL_LLM_GUIDE.md`.
**Accept:** fresh install per README yields a session that auto-resumes a planted
announce-then-stop (manual smoke: ask a small model to "plan then do" a 2-step task).

### O0.3 Persistence block — the anti-announce-then-stop rule  [S-M]
**Why:** the canonical prompt-side fix; OpenAI measured the persistence reminder at ~+20%
SWE-bench for agentic runs. Attacks the failure at the source; plugins are the backstop.
**Do:** new `agents/shared/PERSISTENCE.md` (short — ~15 lines), included from
MODEL_ADAPTER (all tiers; small tier makes it MANDATORY):
```
## Persistence (do not end your turn early)
- You are an agent: keep going until the task is completely handled before ending
  your turn. Never end your turn after ANNOUNCING an action — perform it.
- If you cannot call a tool, say exactly why in one line (BLOCKED: <reason>);
  never emit a plan as your final message when execution was requested.
- Before ending your turn, check: (1) completion phrase emitted or BLOCKED stated;
  (2) tracker/todos updated; (3) no step of your own plan left silently undone.
- Do not stop because the response is getting long — finish the step, then stop.
```
Reference it from: `MODEL_ADAPTER.md` (small-tier rules), `BOUNDED_TASK_CONTRACT.md`
(pairs with "Stop means stop" — persistence governs *before* the phrase, stop-means-stop
governs *after*), and the agent template used by executor-capable agents.
**Validator:** new `scripts/validators/validate-persistence-block.sh` — every agent with
executor/coding duty (grep for task()/HANDOFF-emitting agents, same discovery as
validate-handoff-discipline.sh) must reference PERSISTENCE.md or contain the rule. Wire
into the git-expert merge gate for branches touching `agents/**` (same pattern as the
handoff-discipline validator).
**Accept:** validator green on repo; planted violation (agent md without the block) fails.

---

## 3. Wave O1 — Autonomy levels (make the by-design pauses opt-out)

### O1.1 `agents/shared/AUTONOMY_PROTOCOL.md`  [M]
**Do:** new shared protocol defining three levels + a source of truth:
- **Source of truth:** `docs/work/.model-context` gains an `autonomy:` key
  (`interactive` | `auto`), settable also by an `AGENTS.md`/`CLAUDE.md` line
  `autonomy: auto`. Default **interactive** (today's behavior — zero change unless opted in).
- **`interactive`** — every existing pause behaves as written.
- **`auto`** — at each *gated* pause point the agent: (1) picks the documented default
  action, (2) appends one line to `docs/work/APPROVALS.md`
  (`| when | gate | default taken | what user would have been asked |`), (3) continues.
  The approvals file is the audit trail — Foreman's approval-queue semantics, implemented
  as prose + a ledger, today.
- **NEVER-AUTO list** (pause even in auto — enumerate explicitly): destructive ops
  (migrations flagged DANGEROUS, data deletion), merges to main / releases / deploys,
  tech-stack additions (coding-agent:89), security fixes that change behavior
  (security-auditor:206), scope-boundary blocks, and anything BOUNDED_TASK Rule-9
  escalates after 3 failures **when no documented default exists**.
- Loop-exhaustion defaults for auto mode: Ralph 3-cap → option C (route to specialist)
  if one is named, else record waiver + continue; Fix-Verify 3-cap → option C defer
  (log to FIX_BACKLOG as deferred) — both logged to APPROVALS.md.
**Accept:** protocol file exists, referenced from PHASE_ROUTING_PROTOCOL and sdlc-lead;
NEVER-AUTO list is a single enumerated table (validators can grep it).

### O1.2 Gate every pause site on the autonomy level  [M]
**Do:** edit each verified pause site to the pattern *"If autonomy=auto per
AUTONOMY_PROTOCOL: take the default, log to APPROVALS.md, continue. Otherwise: <existing
text>"*. Sites (exhaustive list from the 2026-07-01 audit):
- `agents/sdlc-lead.md:534` (Gate A), `:583` (Gate B), `:606` (inter-phase), `:54`, `:351/:428`
  (discovery interview stays interactive-only — it IS user input; mark NEVER-AUTO),
- `agents/shared/PHASE_ROUTING_PROTOCOL.md:113`,
- `agents/shared/RALPH_WIGGUM_LOOP.md:164, 226, 245`,
- `agents/shared/FIX_VERIFY_LOOP.md:156`,
- `agents/sdlc-improve-mode.md:649, 674, 919, 922, 1043` (auto default: execute
  CRITICAL+HIGH backlog items, defer the rest),
- `agents/sdlc-init-phases-0-2.md:74, 131, 242, 324, 326`,
  `agents/sdlc-init-phases-3-4.md:833, 863, 874` (auto default for wave-mode question:
  sequential unless plan.json modules are collision-free),
- `agents/sdlc-init-phases-3-4.md:1264, 1310` (auto default: fix-then-proceed),
- `agents/sdlc-feature-mode.md:125, 133, 543`, `agents/sdlc-onboard-mode.md:46`.
Line numbers are as of the audit — locate by the quoted phrases, not the numbers.
**Validator:** new `scripts/validators/validate-autonomy-wiring.sh`: any line in
`agents/**` matching `wait for (the )?user|do not auto-continue|get approval first`
must have an autonomy reference within ±5 lines OR be inside a NEVER-AUTO-marked block.
Wire into merge gate for `agents/**` branches. (Same discovery/enforcement style as
validate-handoff-discipline.sh — that validator's lesson: prose-only rules drift.)
**Accept:** validator green; a full `/sdlc init` dry run with `autonomy: auto` reaches
Phase 5 with zero user prompts except NEVER-AUTO items, and APPROVALS.md lists every
gate that was auto-taken.

### O1.3 Executor selection: stop preferring the paste-pause  [S-M]
**Why:** Executor C (manual paste) is the biggest structural pause. B (subprocess
`opencode run --agent`) removes it whenever the CLI exists.
**Do:** in `EXECUTOR_SELECTION.md`: the detect script (`.model-context` writer) also
records `opencode_cli: true/false` (`command -v opencode`). Selection order becomes
A → B (whenever `opencode_cli` and not already inside a subprocess-spawned session) → C.
In **auto** mode, C is treated as an error: degrade to D (inline methodology) and log it —
auto mode must never emit a paste-and-wait block. Add the `--dir <workcopy>` isolation
rule from the eval harness lesson (agents launched via B must get an explicit dir).
**Accept:** matrix in EXECUTOR_SELECTION covers (has_task_tool × opencode_cli × autonomy);
auto+no-task-tool+cli → B; auto+nothing → D.

### O1.4 Session-restart pauses → scripted outer loop  [M]
**Why:** small-tier "one HANDOFF per session, restart after 3" makes the *user* the outer
loop. A Ralph-style wrapper makes the restart free (fresh context each pass — which is
also the B2-friendly behavior; this is now first-party in 2026 harnesses: Claude Code
`/goal`, Codex ralph loops).
**Do:** new `scripts/run-until-done.sh`: while-loop over `opencode run` against a plan/
state file; exits when the completion promise (`<promise>COMPLETE</promise>` — reuse the
BOUNDED_TASK completion-phrase convention) appears in the final message or in
`docs/work/STATE.md`; hard caps: `--max-sessions` (default 12) + wall-clock; every session
gets the resume preamble (`/sdlc resume` semantics: rehydrate from STATE.md). Journals to
`docs/work/run-until-done.log`. Complements run-plan.mjs (which owns DAG plans); this owns
"keep an SDLC mode going across session restarts".
**Accept:** self-test mode (`--self-test` with a stub command, like loop-learn.mjs);
docs section in LOOP_ENGINEERING_PLAYBOOK.

---

## 4. Wave O2 — Loop upgrades (protocol-side twins of Jarvis M6/M7 + 2026 patterns)

### O2.1 Evidence sub-loop in MICRO_LOOP  [S]
**Why:** the loop has only *negative* guards (2-strike schema kill, 4-call challenger
cap) — no positive "go look" rule. One-shot retrieval loses to agentic exploration
(SWE-Explore, arXiv 2606.07297).
**Do:** add step **3a. EVIDENCE** to `MICRO_LOOP.md` between PRODUCE and SELF-VERIFY:
*"If you cannot verify a claim about the code/artifact from what you have seen, do not
guess — LOOK: up to 4 evidence actions (grep / read specific lines / run the named
validator or test) per criterion. Cite what you found. An evidence action does not count
as a revise iteration."* Budget composes with the existing ≤2-revise cap.
**Accept:** MICRO_LOOP renumbered cleanly; MODEL_ADAPTER small-tier references it.

### O2.2 Edit-format discipline  [S]
**Why:** absent today; weak models degrade badly on whole-file rewrites (lazy omission —
Aider benchmarks). Twin of Jarvis M6.3.
**Do:** add to `MODEL_ADAPTER.md` (all tiers; MANDATORY small) + `coding-agent.md`:
existing files are edited via **SEARCH/REPLACE blocks or unified diff** — never a
whole-file rewrite when the file exceeds ~100 lines; whole-file only for NEW files.
On a failed/imprecise match: ONE retry citing the exact mismatch, then whole-file
fallback recorded in the manifest. Pairs with B2: the failed edit turn is pruned.
**Accept:** rule present in both files; validate-handoff-discipline-style grep validator
optional (defer if noisy).

### O2.3 Lint-on-edit inner rule  [S]
**Why:** lint is phase-gate-only today; SWE-agent showed per-edit feedback is a
model-sized lever. Twin of Jarvis M6.4.
**Do:** `coding-agent.md` + `MICRO_LOOP.md` step 3: after each file edit, immediately run
the cheapest project check on the touched files (`tsc --noEmit` / `py_compile` / linter
if configured); fix once with the error; then proceed. Never batch edits across files
before the first check on small tier.
**Accept:** rule in both files, referenced from BOUNDED_TASK code rules.

### O2.4 Automatic tier escalation in run-plan  [M]
**Why:** run-plan only *prints advice* to bump `tier_needed` manually; B5 says
re-planning belongs on the strong tier. Twin of Jarvis M6.2 (escalate the 5%).
**Do:** `scripts/run-plan.mjs` flag `--auto-escalate`: when a node fails after
`--max-retries`, if `node.tier_needed < highest configured tier`, bump one tier, retry
once, journal `{node, fromTier, toTier, outcome}`; still exit 2 if the escalated attempt
fails. Cap total escalations per run (default 5). Also append the outcome as a
loop-learn lesson payload (existing pattern) so playbooks learn which node types need
the strong tier from the start.
**Accept:** `--self-test` covers escalate-success + escalate-fail + cap paths; docs in
LOOP_ENGINEERING_PLAYBOOK; default OFF.

### O2.5 Runtime OpenAPI conformance validator  [M-L]
**Why:** RUNTIME gate boots + smokes but never asserts live endpoints against the frozen
`openapi.yaml`. Fully deterministic; the strongest possible gate. Twin of Jarvis M7.2.
**Do:** new `scripts/validators/validate-contract-conformance.sh` (+ small .mjs helper):
requires the app already booted by the RUNTIME step (take base URL as arg); parse
openapi.yaml paths×methods (yq or node helper); probe each non-destructive endpoint with
minimal valid params from the spec's examples/defaults; assert status class + required
response fields. Output the standard validator gap-list JSON. Wire into phase-5 chain in
`validate-phase-gate.sh` + FIX_VERIFY re-verify (SKIP with reason when no openapi.yaml
or no base URL).
**Accept:** green on a fixture with a compliant app; planted drift (spec route missing
from app) produces a gap row; SKIP paths clean.

### O2.6 Stable-prefix + tool-result pruning guidance  [S]
**Why:** KV-cache reuse is near-unmentioned; 2026 harnesses all do backward tool-result
pruning. Twins of Jarvis M7.7 + the compaction patterns.
**Do:** `MODEL_ADAPTER.md` additions: (1) construct prompts/HANDOFFs with static protocol
text first, per-task content last — byte-stable prefixes hit the local runtime's KV
cache; (2) long sessions: keep only recent tool results verbatim; replace older ones with
one-line conclusions (`[pruned: <what it showed>]`) — extends B2 from error turns to
stale successes.
**Accept:** both bullets in MODEL_ADAPTER; LOCAL_LLM_GUIDE cross-references.

### O2.7 Context packets get a relevance rule  [S]
**Do:** `sdlc-lead.md` context-packet instructions (~:253): packets are built by
relevance to the specialist's criterion (name the files + line ranges + WHY each is
included), never by recency or "everything from the last phase"; cap stays ≤200 tokens.
One-line addition; keeps the deliberate no-repo-map design.

---

## 5. Wave O3 — Prove it

1. **Pause census:** instrumented `/sdlc init` fixture run in `autonomy: interactive`
   vs `auto` (same goal). Metric: user-input events. Target: auto ≤ NEVER-AUTO count;
   interactive unchanged from today.
2. **Accidental-pause soak:** long qwen3.6 session with O0 config + plugins; count
   auto-resumes fired vs manual continues needed. Target: zero manual continues in a
   2h session (auto-resume may fire; that's it working).
3. **Eval harness:** re-run the isolated triad (frontier / local-scaffolded / local-bare,
   `EVAL_MODEL` + `--dir` isolation) with O2 rules active — confirm no regression, record
   wall-time delta from O0 timeout fixes + O2.6 prefix rule.
4. Lessons → `loop-learn.mjs` → LESSONS.md, per the existing meta-learning path.

---

## 6. Execution notes for the implementing agent

- Repo: `~/Code/bpm-opencode-experts`, branch `main` (docs+agents edits; follow repo
  convention — read `AGENTS.md` first). **This repo is CANONICAL**: after any change to
  `agents/**` or `references/**`, run `npm run build:claude`; if it reports changed files,
  commit + tag `claude-experts` too. Push BOTH repos to BOTH remotes (origin=Gitea,
  github). Never hand-edit generated files in claude-experts.
- Line numbers cited above are from the 2026-07-01 audit — **locate by quoted phrase**,
  they will drift.
- Validators: copy the discovery/enforcement style of
  `scripts/validators/validate-handoff-discipline.sh` (the proven pattern: prose rules
  drift; validators hold). Every new validator: `--help`, exit 0/1, gap-list JSON, wired
  into `validate-phase-gate.sh` or the git-expert merge gate as stated per task.
- Scripts: dependency-free node (match `loop-learn.mjs`/`run-plan.mjs` style), each with
  `--self-test`.
- Keep protocol additions SHORT — these files are loaded into small-model context;
  every line costs tokens (MODEL_ADAPTER small-tier budget rules apply to us too).
- One task per session/context; tick the checklist; commit per task with explicit paths.

## 7. Checklist

- [ ] O0.1 timeout/clamp config + pause-troubleshooting docs
- [ ] O0.2 auto-resume + todo-reminder plugins
- [ ] O0.3 PERSISTENCE.md + validator
- [ ] O1.1 AUTONOMY_PROTOCOL.md (+ NEVER-AUTO table)
- [ ] O1.2 gate all pause sites + validate-autonomy-wiring.sh
- [ ] O1.3 executor order A→B→C, auto-mode C→D
- [ ] O1.4 run-until-done.sh outer loop
- [ ] O2.1 evidence sub-loop in MICRO_LOOP
- [ ] O2.2 edit-format discipline
- [ ] O2.3 lint-on-edit rule
- [ ] O2.4 run-plan --auto-escalate
- [ ] O2.5 contract-conformance validator
- [ ] O2.6 stable-prefix + tool-result pruning
- [ ] O2.7 context-packet relevance rule
- [ ] O3 pause census + soak + eval re-run

Dependencies: O1.2 needs O1.1 · O1.3/O1.4 need O1.1 (autonomy flag) · O3 last.
O0 is independent and highest immediate relief — ship it first.
