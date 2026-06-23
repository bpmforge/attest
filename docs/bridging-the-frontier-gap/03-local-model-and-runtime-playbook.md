# 03 — Local-Model & Runtime Playbook

[🏠 Index](README.md) · [← system map](02-system-map-and-backlog.md) · [next: memory →](05-memory-architecture.md)

Which local/open models actually deliver agentic (tool-calling, multi-step coding) behavior, and the runtime config that makes or breaks them. **The runtime breaks tool-calling more often than the model does** — most "the model can't tool-call" reports are template/parser bugs.

> **Param count is a poor predictor of tool-calling skill.** Docker's 21-model evaluation (Jun 30 2025, 3,570 tests): **Qwen3-8B = 0.933 F1; Llama-3.3-70B = 0.607.** Tool-calling is a *trained skill*, not a scale effect. (Quantization Q4 vs F16 had little impact.)

---

## 1. Model picks by tier (for agentic / tool-calling use)

| Tier | Pick | Why |
|---|---|---|
| **Best local agentic coder (fits a workstation)** | **Devstral Small 2 (24B)** — ~68% SWE-bench, runs on RTX 4090 / 32GB Mac | purpose-built to drive SWE agents (multi-file edits, codebase exploration) |
| **Fast MoE coder alternative** | **Qwen3-Coder-30B-A3B ("Flash")** | strong agentic coding, low active params |
| **Best general local tool-caller** | **Qwen3-14B (~0.971 F1, GPT-4-level tool selection)**; **Qwen3-8B** for speed (~0.933) | top of the Docker eval |
| **Tool-calling-first by design** | **Nemotron 3 Nano 30B-A3B** (NVIDIA) | tool-use is the design goal, not an afterthought; single-GPU |
| **General agentic small model** | **gpt-oss-20b** (OpenAI, Apache 2.0, 3.6B active) | strongest small *general* agentic/tool model; web/Python built-in |
| **Edge / embedded** | **IBM Granite 4.x** | strong FC at small sizes, native llama.cpp tool support |
| **Local GLM (= "ZLM")** | **GLM-4.5-Air (106B/12B)**, quantized | the practical local GLM; built for Claude-Code-style agentic coding |
| **Avoid for tool-heavy loops** | **Llama 4** (SWE-bench Lite ~8%), **Gemma 3** (weak tool use — no FC tokens; Gemma 4 fixes it), small **DeepSeek-R1 distills** (stale Jan-2025 weights + template bugs) | — |

**Critical caveat — the "agentic disconnect":** BFCL / leaderboard rank ≠ real agentic reliability. timetoact's KAMI benchmark found small Qwen3 models that beat Qwen2.5-72B on BFCL scored *far below* it on realistic CSV/DB extraction. **Validate on your own workload, not a leaderboard.** This is also exactly why our **validators / runtime gates** matter more than picking a model by benchmark.

---

## 2. Runtime gotchas that silently break tool calls

These are the difference between "this local model can't do agents" and "it works great" — verified against llama.cpp issues/PRs.

1. **Runtime reliability ranking for tool use:** **vLLM** (most complete; `--enable-auto-tool-choice --tool-call-parser <name>`) ≈ **SGLang** > **llama.cpp** (good *only if* a late-2025 build + `--jinja` + the model's native template) > **Ollama** ≈ **LM Studio** (recurring open parser bugs).

2. **llama.cpp `--jinja` is mandatory** for OpenAI-style tool calling — and:
   - Enabling `--jinja` **silently disables GBNF grammar** (use `response_format` JSON instead).
   - Native tool handlers exist only for Llama 3.x, Hermes 2/3, Qwen 2.5, Mistral Nemo, Functionary, Granite 4.x — others hit a less-reliable generic path.
   - Override buggy official templates with `--chat-template-file`. Avoid aggressive KV-cache quant (`-ctk q4_0`) — it degrades tool calling.

3. **Qwen3-Coder XML-vs-JSON mismatch — the #1 breakage of 2025.** Qwen3-Coder emits `<function=…><parameter=…>` XML, not OpenAI JSON; JSON-expecting agents get empty/malformed `tool_calls`. (LM Studio bug #825; Unsloth shipped a chat-template fix Aug 2025 — re-download GGUFs.)

4. **GLM-4.5/4.6, MiniMax-M2, Kimi-K2, Qwen3-Coder needed deep llama.cpp surgery.** **PR #16932 (merged Nov 18 2025)** generalized XML-style tool-call parsing for exactly these models. **Rule: use a llama.cpp build from ~late-Nov 2025 or newer for them.**

5. **Strip thinking before re-feeding history.** Reasoning models emit empty `{}` tool args after 2–3 multi-turn rounds when prior `<think>` blocks are dropped inconsistently; `--jinja` + llama-server strips Qwen3 thinking while llama-cli keeps it. **Best practice: strip `<think>` before re-feeding** — which also feeds Lever 4 (don't carry the model's noisy/error-laden reasoning forward).

6. **Ollama lacks native Jinja templates** (issue open since Apr 2025) → community GGUFs silently fall back to ChatML and mangle tool calls (e.g. DeepSeek R1-0528 reports "does not support tools").

**Checklist:** vLLM/SGLang with the model's *named* parser for production; on llama.cpp use a late-2025+ build with `--jinja` + native template (override buggy ones); strip thinking across turns; re-download GGUFs after template fixes; avoid heavy KV-quant; never rely on grammar + jinja together.

---

## 3. How this plugs into our system

- **Foreman / MODEL_ADAPTER routing:** use **Qwen3-14B / Devstral Small 2 / Nemotron Nano** as the local **executor** tier; route **planning + final verification** to a stronger tier (Lever 1 + 5). A local model is a *reliable bounded-task worker inside deterministic orchestration*, not the orchestrator.
- **`maker_model` / `verifier_model`:** prefer a **different family** for the verifier (cross-family beats self — chapter 01 Lever 1). E.g. Qwen maker → a different-family verifier.
- **Ship this chapter as `references/local-agentic-models.md`** (backlog B8) so agents read the model+runtime guidance at runtime.

> Confidence: 2025 model facts and the Docker eval are well-sourced (✅). 2026 point-releases (GLM-5.x, Qwen3.5, Gemma 4, Nemotron 3, DeepSeek V4) are real but move weekly — re-verify exact benchmark numbers against official pages before relying on them. See [chapter 04](04-sources.md).

---

[🏠 Index](README.md)
