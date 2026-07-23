---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Model Adapter — Adaptive Behavior by Context Tier

Agents read `docs/work/.model-context` at session start to adapt behavior.
Run `bash scripts/detect-model-context.sh` once per project to populate it.

---

## How to detect your model tier

```
bash(command="cat docs/work/.model-context 2>/dev/null || bash scripts/detect-model-context.sh")
```

The file contains:
```
type=local|cloud
provider=lmstudio|anthropic|google|openai|ollama
model=<model-id>
context=<tokens>
tier=small|medium|large
```

---

## Behavior by tier

### tier=small (local, 32k context)

> **Compact agent variants:** `dist/compact-agents/` holds generated copies of every
> primary agent with boilerplate sections reduced to pointer one-liners
> (`scripts/build-agents.mjs --compact`, or `npm run agents:compact`). In a
> tier=small-only environment, install them with `./install.sh --compact` — same
> behavior contract, ~250 fewer instruction tokens per agent.

Context budget is tight. Every token counts.

> **Local model + runtime:** read `references/local-agentic-models.md` before relying on this model for tool-calling — most "can't tool-call" failures are runtime/template bugs (llama.cpp `--jinja`, Qwen3-Coder XML, strip `<think>`), and the right local executor picks (Qwen3-14B / Devstral / Nemotron Nano) are listed there. Param count is a poor predictor of tool-calling skill.

| Behavior | Rule |
|----------|------|
| Phase files | Load ONE phase file at a time. Never load sdlc-init-phase-3 AND sdlc-init-phase-4 simultaneously. |
| Research | Cap at 10 tool calls. Write checkpoint after EVERY source. Synthesis reads from disk. |
| Specialist sessions | One HANDOFF per session. Restart after each specialist returns. |
| HANDOFF_QUICK_REF | Read this instead of full HANDOFF_TEMPLATES (saves 3,900 tokens). |
| Write immediately | Any output > 200 tokens → `write()` to disk before continuing. |
| Reason in NL, format last (B6) | Reason in natural language; emit structured output (JSON / tool-call / schema) ONLY at the final boundary. Forcing schema onto the *reasoning* costs small/open models up to −27 pts ("format tax"). For local runtimes, constrain only the final call (grammar/JSON-schema), never the chain-of-thought. |
| Prune error turns (B2) | After a failed attempt, drop the failed turn(s) from working context before retrying — a model's own errors in context raise its next-error rate, and this is NOT fixed by scale. Reconstruct from disk state, not the error-laden transcript. |
| Persistence (MANDATORY) | Read `agents/shared/PERSISTENCE.md`. Never end your turn after *announcing* an action — perform it. If you can't call a tool, print `BLOCKED: <reason>`; never emit a plan as your final message when execution was requested. Small models announce-then-stop most; this is the source fix for it. |
| Evidence before guess (MICRO_LOOP 2a) | If you can't verify a claim from what you've already seen, LOOK — up to 4 grep / read-specific-lines / run-the-named-validator actions per criterion. Cite what you found. Don't guess; evidence actions don't count as revise iterations. One-shot recall loses to agentic exploration on weak models. |
| Edit format (MANDATORY) | Edit existing files >~100 lines via **SEARCH/REPLACE blocks or unified diff**, never a whole-file rewrite (weak models silently drop lines — Aider lazy-omission). Whole-file only for NEW files. Failed/imprecise match → ONE retry citing the exact mismatch, then whole-file fallback **recorded in the Completion Manifest**. Pairs with B2: the failed-edit turn is pruned. |
| Session length | After 3 HANDOFFs returned, save state and suggest user restart session. |
| OWASP --deep | Warn user: requires 60k+ context. Recommend medium or large tier model. |
| Security --deep | Load OWASP_METHODOLOGY.md only if context budget shows > 15k tokens available. |

### tier=medium (local, 60k-128k context)

More headroom. Most features work without restriction.

| Behavior | Rule |
|----------|------|
| Phase files | Can load two phase files if needed (e.g., Phase 3 + Phase 4 for overview). |
| Research | Standard caps apply. Checkpoint writing still recommended. |
| Security --deep | Fully supported. Load OWASP_METHODOLOGY.md freely. |
| HANDOFF format | Full HANDOFF_TEMPLATES available (no need for quick ref). |
| Session length | Can handle 6-8 HANDOFFs before session restart needed. |

### tier=large (cloud: Claude 200k, Gemini 1M, GPT-4 128k)

Context is not a constraint. Focus on quality.

> **Capability floor — context size is not capability.** The tier is detected from
> the CONTEXT WINDOW, so cloud "mini/flash/haiku-class" models (gpt-5-mini,
> gemini-flash, haiku) land in tier=large while behaving like small-tier models on
> the failure modes that matter. Field basis (2026-07): gpt-5-mini on tier=large
> replaced a 335-line test file with a 20-line stub (Aider lazy-omission — the
> exact failure the small-tier edit-format rule exists to prevent) and reported
> green over red gates. When the executing model is a mini/flash/haiku-class
> model, apply the small-tier **behavior** rules regardless of tier: Edit format
> (SEARCH/REPLACE, never whole-file rewrite of existing files), Persistence,
> Prune error turns (B2), and Evidence before guess. Context-budget rules
> (phase-file splitting, session restarts) stay large-tier — the window really is
> big; it's the *discipline* that isn't.

| Behavior | Rule |
|----------|------|
| Phase files | Load the full phase file or multiple phase files. No need for phase splitting. |
| Research | Use all passes. No hard cap pressure — quality over token savings. |
| Security --deep | Always supported. OWASP_METHODOLOGY.md loads freely. |
| Specialist sessions | HANDOFF blocks — executor per `EXECUTOR_SELECTION.md` (interactive → emit for the user; auto → Task tool / subprocess). |
| HANDOFF_TEMPLATES | Read full templates for richest HANDOFF format. |
| Session length | Sessions can run indefinitely — no context pressure restart. |
| LOCAL_LLM_PRIMER | Not needed. Skip it. |
| Write-to-disk | Still good practice (disk is durable across sessions), but not mandatory for context. |

---

## Escalation Ledger Integration — Hop Emission

When `detect-model-context.sh` runs, it records a **hop** (model-decision event) to the escalation ledger located at `~/.claude-memory/<projectId>/memory.db`. This ledger powers M7's escalation guidance and weekly reports.

**How it works:**
1. `detect-model-context.sh` detects the model and provider (cloud or local)
2. Before exiting, it calls the `log-hop.mjs` CLI shim with the detected model details
3. The shim writes a `Hop` record to the SQLite ledger (same DB as the memory-MCP server)
4. The hop includes: task fingerprint, detected model, gate result ('pass' for successful detection), lane ('proc'), and ISO timestamp

**Prerequisites:**
- Node.js must be on PATH (the shim skips gracefully if unavailable)
- The escalation-ledger package must be built: run `npm run build` in `bpm-agent-amplifier/` to generate `packages/escalation-ledger/dist/`
- Both repos must be sibling directories (bpm-opencode-experts and bpm-agent-amplifier)

**Failure behavior:**
- If the ledger write fails (DB locked, missing package, etc.), the shim exits silently with code 0
- Model detection never blocks on ledger operations — failures are logged to stderr but do not break the session

**Querying hops:**
After running `bash scripts/detect-model-context.sh`, the ledger will contain a record:
```sql
SELECT * FROM escalation_hops 
WHERE lane = 'proc' AND task_fp LIKE 'session/detect-model-context-%' 
ORDER BY ts DESC LIMIT 1;
```

Periodic reports are generated via the `@bpm/escalation-ledger` package:
```js
import { weeklyReport } from '@bpm/escalation-ledger';
console.log(weeklyReport()); // Markdown table of escalation trends
```

---

## KV-cache & context hygiene (all tiers; MANDATORY small)

Near-free throughput wins that every 2026 harness applies:

- **Stable prefix.** Build prompts and HANDOFFs with the **static protocol text first, per-task
  content last** — byte-stable prefixes hit the local runtime's KV cache (a large local-throughput
  win; a changed early byte invalidates the whole cache). Never interleave volatile task data into
  the boilerplate.
- **Prune stale tool results.** In long sessions keep only *recent* tool results verbatim; replace
  older ones with a one-line conclusion — `[pruned: <what it showed>]`. This extends B2 (prune the
  failed-attempt turns) from errors to *stale successes* — old file dumps and search output that no
  longer inform the next step just burn context and cache.

`LOCAL_LLM_GUIDE.md` cross-references these for the local-runtime setup.

---

## Maker / Verifier split — independent verification

**Loop-engineering principle (Boris Cherny):** *"a model that wrote the code and is asked whether the code is correct consistently over-reports success."* The model that **verifies** an artifact must be a **different instance** from the model that **made** it — ideally a faster/cheaper tier so verification is cheap enough to always run. (Claude Code's `/goal` uses a separate small evaluator for exactly this reason.)

How the verifier is selected depends on runtime: **opencode** writes the flags below into `docs/work/.model-context` via `scripts/detect-model-context.sh`; **Claude Code** has no `.model-context` probe — instead dispatch the verify step as a Task subagent with a different (faster) `model`. Either way the rule is the same: the verifier is a different instance from the maker.

```
maker_model=<id>          # the model that produces artifacts
verifier_model=<id>       # a different, faster instance for scoring/re-verify
verifier_independent=true|false   # false ⇒ only one model available; use the fallback below
```

The detect script picks a verifier per provider (anthropic→haiku, google→flash-lite, openai→4o-mini, local→the classification tier e.g. nemotron-nano); override with `VERIFIER_MODEL` / `VERIFIER_MODEL_LOCAL`. When `verifier_independent=false`, apply Rule 4.

| Role | Who runs it | Model |
|------|-------------|-------|
| **PLANNER** | `task-decomposer` / the planning specialist that breaks the request into bounded nodes | **strong tier** (large; medium for well-scoped plans) |
| **MAKER** | the specialist / coding-agent that produces the artifact | task tier (per agent hint) |
| **VERIFIER** | the scorer / re-verifier that judges "is it actually done?" | a **different** instance — prefer the fast classification tier |

**Rules:**

1. **Deterministic first.** Bash validators and `fix-verify.mjs` are model-agnostic and always preferred. The verifier model only judges rows no script can check (see `FIX_VERIFY_LOOP.md` Step 4).
2. **Confidence scoring** (`GATE_SCORING_PROTOCOL.md` Step 3) runs on `verifier_model`, **never the maker session**.
3. **Model re-verify** (`FIX_VERIFY_LOOP.md` Step 4) runs on `verifier_model` in a **fresh session** — never the coding-agent that wrote the fix.
4. **Single-model fallback.** If no second model is available locally, run verification in a **separate session with cleared context** (the maker's chain-of-thought must not be in scope) and record `maker==verifier` in `DELEGATION_LOG.md` so the weaker guarantee is auditable.
5. **Plan strong, execute cheap (B5).** Route **planning/decomposition to the strong tier** and **bounded execution to the cheap tier** — planning is where a weak model's errors compound; bounded leaf jobs are where it is reliable. **Cap granularity:** small models over-decompose (deep trees → cascading errors), so a small-tier node is *one bounded job*, not a multi-phase sequence. When work needs re-planning, route it back to the **strong tier** (`task-decomposer` after_replan), not deeper local decomposition. See `task-decomposer.md` node-sizing + the local-model picks in `references/local-agentic-models.md`.

The maker → verifier handoff mirrors Cherny's "one Claude drafts, a second Claude reviews it as a staff engineer."

---

## Applying the adapter in sdlc-lead

After reading `.model-context`, announce the tier to the user and adjust:

```
Model tier: [small|medium|large] ([context]k context, [type]: [model])

For this session:
- [If small] Loading phase files one at a time. Session restart recommended after 3 HANDOFFs.
- [If medium] Most features available. OWASP --deep supported.  
- [If large] Full feature set. No context restrictions.
```

---

## What works the same on all tiers

- HANDOFF block format (════ delimiters) — identical regardless of model
- Executor per `EXECUTOR_SELECTION.md` — check `has_task_tool` before assuming manual handoffs
- SDLC-TASK trigger in specialist agents — works on all models
- Completion phrase + manifest — required on all models
- Research modes (QUICK/COMPARISON/DEEP/FACT CHECK) — available on all
- MCP tools (playwright-search, context7, mempalace) — available on all
- Validators (validate-*.sh) — run locally, model-agnostic
