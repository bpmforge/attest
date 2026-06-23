# Local Agentic Models — picks & runtime playbook

Which local/open models actually deliver agentic (tool-calling, multi-step coding) behavior, and the runtime config that makes or breaks them. Read this when `MODEL_ADAPTER` detects a **local** tier, before committing to a model or blaming one for "can't tool-call."

> **The runtime breaks tool-calling more often than the model does.** Most "this local model can't tool-call" reports are template/parser bugs, not model limits.

> **Param count is a poor predictor.** Docker's 21-model eval (Jun 30 2025, 3,570 tests): **Qwen3-8B = 0.933 F1; Llama-3.3-70B = 0.607.** Tool-calling is a *trained skill*, not a scale effect (Q4 vs F16 barely mattered).

---

## 1. Model picks by tier (agentic / tool-calling use)

| Need | Pick | Why |
|---|---|---|
| Best local agentic coder (workstation) | **Devstral Small 2 (24B)** — ~68% SWE-bench, RTX 4090 / 32GB Mac | purpose-built to drive SWE agents (multi-file edits, codebase exploration) |
| Fast MoE coder alternative | **Qwen3-Coder-30B-A3B ("Flash")** | strong agentic coding, low active params |
| Best general local tool-caller | **Qwen3-14B (~0.971 F1)**; **Qwen3-8B** (~0.933) for speed | top of the Docker eval |
| Tool-calling-first by design | **Nemotron 3 Nano 30B-A3B** (NVIDIA) | tool-use is the design goal; single-GPU |
| General agentic small model | **gpt-oss-20b** (Apache 2.0, 3.6B active) | strongest small *general* agentic model |
| Edge / embedded | **IBM Granite 4.x** | strong FC at small sizes, native llama.cpp tool support |
| Local GLM ("ZLM") | **GLM-4.5-Air (106B/12B)**, quantized | practical local GLM for Claude-Code-style coding |
| **Avoid for tool-heavy loops** | **Llama 4** (SWE-bench Lite ~8%), **Gemma 3** (no FC tokens; Gemma 4 fixes it), small **DeepSeek-R1 distills** (stale weights + template bugs) | — |

**The "agentic disconnect":** BFCL / leaderboard rank ≠ real agentic reliability. timetoact's KAMI benchmark found small Qwen3 models that beat Qwen2.5-72B on BFCL but scored *far below* it on realistic CSV/DB extraction. **Validate on your own workload** (that is what `evals/` + the validators are for), not a leaderboard.

---

## 2. Runtime gotchas that silently break tool calls

1. **Runtime reliability ranking:** **vLLM** (`--enable-auto-tool-choice --tool-call-parser <name>`) ≈ **SGLang** > **llama.cpp** (only with a late-2025 build + `--jinja` + the model's native template) > **Ollama** ≈ **LM Studio** (recurring open parser bugs).
2. **llama.cpp `--jinja` is mandatory** for OpenAI-style tool calls — and: it **silently disables GBNF grammar** (use `response_format` JSON instead); native handlers exist only for Llama 3.x, Hermes 2/3, Qwen 2.5, Mistral Nemo, Functionary, Granite 4.x (others hit a weaker generic path); override buggy official templates with `--chat-template-file`; avoid aggressive KV-cache quant (`-ctk q4_0`).
3. **Qwen3-Coder XML-vs-JSON mismatch — the #1 breakage of 2025.** It emits `<function=…><parameter=…>` XML, not OpenAI JSON; JSON-expecting agents get empty/malformed `tool_calls`. (LM Studio #825; Unsloth chat-template fix Aug 2025 — **re-download GGUFs**.)
4. **GLM-4.5/4.6, MiniMax-M2, Kimi-K2, Qwen3-Coder** needed deep llama.cpp surgery — **PR #16932 (merged Nov 18 2025)** generalized their XML tool-call parsing. **Use a llama.cpp build from ~late-Nov 2025 or newer for them.**
5. **Strip `<think>` before re-feeding history.** Reasoning models emit empty `{}` tool args after 2–3 turns when prior thinking is dropped inconsistently (`--jinja`+llama-server strips it, llama-cli keeps it). Stripping also feeds the small-tier "prune error turns" rule (`MODEL_ADAPTER.md` B2/B4).
6. **Ollama lacks native Jinja templates** (open since Apr 2025) → GGUFs fall back to ChatML and mangle tool calls (e.g. DeepSeek R1-0528 "does not support tools").

**Checklist:** vLLM/SGLang with the model's *named* parser for production; on llama.cpp use a late-2025+ build with `--jinja` + native template (override buggy ones); strip thinking across turns; re-download GGUFs after template fixes; avoid heavy KV-quant; never rely on grammar + jinja together.

---

## 3. How this plugs into the expert system

- **Executor tier:** use **Qwen3-14B / Devstral Small 2 / Nemotron Nano** as the local **executor**; route **planning + final verification to a stronger tier** (`MODEL_ADAPTER.md` Rule 5 — plan strong, execute cheap). A local model is a *reliable bounded-task worker inside deterministic orchestration*, not the orchestrator.
- **maker/verifier:** prefer a **different family** for the verifier (cross-family beats self-verification). E.g. Qwen maker → a different-family verifier.
- **Don't trust the model — trust the gates.** The validators and `evals/` are what make a local model safe to rely on, regardless of its leaderboard rank.

> Caveat: 2025 facts + the Docker eval are well-sourced. 2026 point-releases (GLM-5.x, Qwen3.5, Gemma 4, Nemotron 3, DeepSeek V4) are real but move weekly — re-verify exact numbers against official pages before relying on them.
