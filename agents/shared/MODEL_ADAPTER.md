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

| Behavior | Rule |
|----------|------|
| Phase files | Load ONE phase file at a time. Never load sdlc-init-phase-3 AND sdlc-init-phase-4 simultaneously. |
| Research | Cap at 10 tool calls. Write checkpoint after EVERY source. Synthesis reads from disk. |
| Specialist sessions | One HANDOFF per session. Restart after each specialist returns. |
| HANDOFF_QUICK_REF | Read this instead of full HANDOFF_TEMPLATES (saves 3,900 tokens). |
| Write immediately | Any output > 200 tokens → `write()` to disk before continuing. |
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

| Behavior | Rule |
|----------|------|
| Phase files | Load the full phase file or multiple phase files. No need for phase splitting. |
| Research | Use all passes. No hard cap pressure — quality over token savings. |
| Security --deep | Always supported. OWASP_METHODOLOGY.md loads freely. |
| Specialist sessions | HANDOFF blocks — executor per `EXECUTOR_SELECTION.md` (Task tool if `has_task_tool=true`). |
| HANDOFF_TEMPLATES | Read full templates for richest HANDOFF format. |
| Session length | Sessions can run indefinitely — no context pressure restart. |
| LOCAL_LLM_PRIMER | Not needed. Skip it. |
| Write-to-disk | Still good practice (disk is durable across sessions), but not mandatory for context. |

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
