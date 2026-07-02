# Local LLM Guide

**How to get the most out of bpm-opencode-experts with local models.**

---

## Which model to use

| Model | Context | Best for | Notes |
|-------|---------|----------|-------|
| `qwen/qwen3-coder-next` | 32k | Everything — best default | Best instruction following of local models. Use this first. |
| `qwen3.6-35b-a3b` | 32k | Code + analysis | Strong but crashes under load; restart LM Studio if 400 errors |
| `google/gemma-4-e4b` | 32k | Diagnostics, analysis | 0.90 avg on multi-cause diagnostic tasks; slower but thorough |
| `nvidia/nemotron-3-super` | 128k | Long sessions, full SDLC | Needs all other models unloaded; 31s cold start; M5 Max only |
| Anything < 7B | < 16k | Nothing in this system | Too small — skip |

**Recommended setup:** qwen3-coder-next as default, gemma-4-e4b for dedicated security/diagnostic sessions.

---

## Session setup (do this every session)

1. **Load the primer** — paste `agents/shared/LOCAL_LLM_PRIMER.md` as your first message, or add it to your OpenCode system prompt override. It costs ~600 tokens but prevents the most common failures.

2. **One task per session** — local models degrade after long conversations. Keep each session to ONE specialist task or ONE SDLC phase. Use HANDOFF blocks to start fresh sessions for each specialist.

3. **Check your context budget** — before starting any heavy task, estimate: agent file (~8-15k tokens) + conversation so far + your task = total. Keep total under 80% of your model's context window.

---

## Compact agent variants (tier=small)

On a 32k local model, install the compact agent variants — same behavior contract,
~250 fewer instruction tokens per agent:

```bash
./install.sh --compact          # overlay the slimmed agents
```

They're generated from the full agents (`dist/compact-agents/`) with boilerplate
reduced to pointers. `scripts/detect-model-context.sh` writes your tier and the
`has_task_tool`/`mcp_in_subagents` capability flags to `docs/work/.model-context`;
`agents/shared/MODEL_ADAPTER.md` defines per-tier behavior and
`EXECUTOR_SELECTION.md` how delegation is chosen.

## Context limits by task type

| Task | Tokens needed | Model minimum |
|------|--------------|---------------|
| Quick research (QUICK LOOKUP) | 8k | Any 32k model |
| Coding task (bounded HANDOFF) | 12-18k | Any 32k model |
| Full SDLC Phase 0-2 | 15-20k | Any 32k model |
| Full SDLC Phase 3 (design) | 20-28k | 32k model (tight) |
| Full SDLC Phase 4 (implementation) | 20-28k | 32k model (tight) |
| Security --deep (with OWASP) | 28-35k | 60k+ model recommended |
| Performance review (full) | 18-25k | 32k model |
| Full SDLC end-to-end | 40k+ | 128k+ (nemotron-super) |

**For Phase 3 and Phase 4:** these are the tightest. Load the phase file, do one or two HANDOFFs, then restart the session if context feels full. The `docs/work/sdlc-state.md` file lets you resume exactly where you left off.

---

## When things go wrong

### Model ignores SDLC-TASK and runs Phase 1 instead
- Cause: model weighted heavily toward "Phase 1" from training
- Fix: restart session, paste the LOCAL_LLM_PRIMER first, then paste the HANDOFF prompt
- The primer's Rule 1 overrides Phase 1 behavior

### Model uses `---` instead of `════` in HANDOFF blocks
- Cause: document hygiene rule conflicting (now fixed in agents, but older sessions may have it)
- Fix: explicitly remind the model: "Use ════ delimiters for all HANDOFF blocks, not ---"
- Or add to your session primer: "HANDOFF blocks MUST use ════ as delimiter"

### Model adds trailing content after the completion phrase
- Cause: model wants to be helpful; "stop" instruction fades from attention
- Fix: after the model responds, copy only the content before the trailing text
- Long term: add explicit message after getting the response: "stop — I have what I need"

### Model crashes (400 errors from LM Studio)
- Cause: model ran out of VRAM or crashed internally
- Fix: restart LM Studio, reload the model, retry with a shorter context (restart session)
- Prevention: keep sessions short (one task per session), avoid loading 3+ large files at once

### Research loses findings from Q1 by synthesis time
- Cause: context window filled up with tool results
- Fix: after each research question, explicitly check `docs/work/research/<date>/` for the checkpoint file
- If missing, ask the model: "Write the Q1 findings to docs/work/research/today/q1-<topic>.md"
- The checkpoint writing should happen automatically — if it doesn't, it means the model's context was already full

### SDLC session seems to restart from scratch each time
- Cause: model not reading `docs/work/sdlc-state.md` at session start
- Fix: always start sessions with: "Read docs/work/sdlc-state.md and tell me where we are"
- The state file is the authoritative record of what's done and what's next

### The run pauses / stops mid-task and needs a manual "continue"

Two unrelated causes — fix the right one:

**A. Accidental pauses (runtime/provider bugs).** The turn ends with no tool call even though work remains. Eight verified causes:

| Cause | Fix |
|---|---|
| Announce-then-stop (model says "I'll edit X" then ends) | The `PERSISTENCE.md` rule (prompt-side) + `opencode-auto-resume` plugin. Reproduces on Copilot too, not just local. |
| qwen3.6 emits `<function=…>` tool calls as **text** → parsed as final (opencode #24316) | `opencode-auto-resume` detects raw-text tool calls and resends |
| LM Studio sends `tool_calls: []` every response (#4255) | upgrade LM Studio; auto-resume backstops |
| `finish_reason:"stop"` even with tool calls present (#14972) | upgrade opencode ≥ ~v1.2.11 (PR #14973) |
| max_tokens hardcoded 32000 for LM Studio (#20078) — our 45k rule is clamped | budget ≤10k real output/turn; prefer bare `llama-server` |
| LM Studio silently caps ~10–16k tokens on qwen3.6 thinking (#1829) | same — short turns; long thinking eats the cap |
| 5-min default request timeout + chunk stalls | `timeout: false` + `chunkTimeout: 120000` (see `examples/opencode.json`) |
| `steps`/`maxSteps` agent option set | leave unset (default unlimited) — verified none in our configs |

**Plugins** (`examples/opencode.json` `plugin` array, bounded-retry guards, `maxRetries: 3`): `opencode-auto-resume` (stream-stall / raw-text-tool-call / hallucination-loop → sends "continue"), `opencode-todo-reminder` (idle with pending todos → reminder). **Enable for LOCAL only** — on metered cloud (Copilot #8700, Vertex) each injected continue bills as a premium request; there, rely on `PERSISTENCE.md` instead.

**B. By-design pauses (we wrote them):** human gates (Phase 2→3, 3.5→4), backlog approval, inter-phase check-ins, Executor-C paste-and-wait. These are intentional in `interactive` mode. To make them opt-out, set `autonomy: auto` (see `agents/shared/AUTONOMY_PROTOCOL.md`, wave O1) — destructive ops, merges/releases, and tech-stack additions still pause.

---

## Agent-by-agent context tips

### sdlc-lead + `/sdlc init`
- Session 1: Run discovery interview → load `sdlc-init-phase-3.md` for Phases 0-2
- Session 2 (Phase 3): Load `sdlc-init-phase-3.md` → emit 4-6 HANDOFFs sequentially
- Session 3 (Phase 4): Load `sdlc-init-phase-4.md` → emit parallel coding wave HANDOFFs
- Never load all phase files at once

### researcher
- QUICK LOOKUP and COMPARISON: fine in any 32k session
- DEEP DIVE with 4+ questions: watch your context. After each Q, the checkpoint file should be written. If not, force it before moving to the next Q.

### security-auditor `--deep`
- Needs 60k+ context (loads OWASP_METHODOLOGY.md at ~18k tokens)
- Best on nemotron-3-super or cloud model
- On 32k: use `--quick` instead; flag the need for --deep in the docs

### code-reviewer
- Runs 4 phases sequentially, writes output between phases
- Fine on 32k if the codebase being reviewed is small (< 10 files)
- For large codebases: review one module per session

### performance-engineer
- Heaviest specialist at 53k chars (~13k tokens as system prompt)
- Leaves ~19k tokens for actual work on a 32k model
- Limit profiling to one service or one hot path per session

---

## Vs cloud models

| Capability | Local (qwen/gemma) | Claude / Gemini |
|------------|-------------------|-----------------|
| Context window | 32k-60k | 200k-1M |
| Instruction following | Good with structural cues | Excellent without cues |
| HANDOFF format compliance | Needs primer + structural fixes | Works out of the box |
| Research depth | 2-4 sources per Q, surface facts | 4-6 sources, primary sources |
| Completion phrase adherence | Occasionally adds trailing text | Near-perfect |
| Cost | Free, private, offline | API cost, sends data to cloud |
| Speed | 15-60 tok/s | 50-200 tok/s |
| Best use | Private codebases, offline work, cost-sensitive | Complex multi-phase projects |

**Bottom line:** local models work well for bounded specialist tasks and short research. For a full 5-phase SDLC init from scratch, cloud models or nemotron-3-super (128k) are more reliable.

---

## Recommended session workflow for local models

```
1. Open OpenCode
2. Select agent (e.g., /code)
3. First message: paste LOCAL_LLM_PRIMER.md content
4. Second message: paste the SDLC-TASK HANDOFF block
5. Wait for response
6. If model drifts (Phase 1, wrong format): say "Stop. Re-read Rule 1 from the primer. You received SDLC-TASK for <agent>. Execute ONLY the 5 steps."
7. When done: copy the Completion Manifest + phrase. Back in sdlc-lead session, confirm done.
```
