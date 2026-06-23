# 04 — Sources & Confidence

[🏠 Index](README.md) · [← economics & eval](06-economics-evaluation-distillation.md)

Every load-bearing claim with its primary source and a confidence flag. Compiled from 4 parallel research sweeps + an independent Challenger pass (9 claims re-verified against primary sources) + a Ralph coverage check.

**Flags:** ✅ primary-verified (page/PDF fetched or quoted) · ⚠️ snippet/secondary (search-index summary, not page-verified) · 🏷️ vendor blog (incentive caveat).

---

## Frontier reliability & the internalized/externalizable axis
- ✅ Anthropic, "Harness design for long-running application development" (Mar 24 2026) — the "load-bearing for Sonnet 4.5, redundant by Opus 4.6" finding; GAN generator/evaluator split; sprint contracts.
- ✅ Anthropic, "Effective context engineering for AI agents" (Sep 29 2025) — compaction, tool-result clearing, sub-agent context isolation, just-in-time retrieval, context rot.
- ✅ Anthropic, "Effective harnesses for long-running agents" (Nov 26 2025) — initializer agent, feature-list ground truth, git checkpointing, session-init routine.
- ✅ Anthropic news + platform.claude.com — **Claude Fable 5 / Mythos 5** (Jun 9 2026): "Mythos-class models are a tier of Claude models that sit above our Opus class"; Fable 5 = GA Mythos-class, 1M ctx, 128k output, always-on adaptive thinking. (Access later suspended per export directive — context only.)
- ⚠️ OpenAI o-series / Deep Research / Agents SDK / Responses API — second-hand (openai.com direct fetch blocked); trained planning/backtracking [internalized]; reasoning-trace persistence across tool calls [externalizable].

## Why long tasks fail
- ✅ "Illusion of Diminishing Returns" (arXiv **2509.09677**, ICLR 2026) — execution is the bottleneck; step-accuracy compounds; **self-conditioning, not fixed by scale; thinking mitigates** (all verbatim).
- ⚠️ METR time-horizon (arXiv 2503.14499) — 50%-task horizon doubling ~every 7 months (metr.org blog blocked; abstract only).
- ✅ "Drift No More?" (arXiv 2510.07777) — 7B/8B drift ~20–25× more than GPT-4.1; reminders cut drift.
- "Ord — exponential half-life of agent success" (arXiv 2505.05115) — ⚠️ per-model numbers not extractable.

## Verification & self-correction
- ✅ Huang et al., "LLMs cannot self-correct reasoning yet" (arXiv **2310.01798**, ICLR 2024).
- ✅ Self-Correction Bench (arXiv **2507.02778**) — 64.5% blind spot; smaller models near-zero own-error correction; "Wait" reduces it 89.3%.
- ✅ "When does verification pay off?" (arXiv **2512.02304**) — **cross-family verification grows more valuable as models get *stronger*; self-verification can backfire (similarity bias)** — the Challenger's C3 correction.
- ⚠️ "Mind the Gap" gen–verification gap (arXiv 2412.02674, ICLR 2025) — gap scales up with FLOPs.
- ✅ Pride & Prejudice self-bias (arXiv 2402.11436) — open models over-rate themselves most.
- ✅ T1 (arXiv **2504.04718**) — "a Llama-3.2 1B model under test-time scaling outperforms the significantly larger Llama-3.1 8B model" (MATH, tool-integrated).
- SCORE external verifier +14.6% (arXiv 2404.17140) — ⚠️ numbers secondary.

## Loops, grounding, decomposition
- ✅ ReflAct (arXiv **2505.15182**, EMNLP 2025) — Table 2: Llama-3.1-8B 29.1%→60.5% (+31.4) ALFWorld vs 70B +2.3.
- ✅ Self-decomposition hurts small models / least-to-most 19.6% vs 96% (arXiv 2205.10625); over-decomposition (arXiv 2510.17922); sub-3B threshold (arXiv 2510.13935) — directions verified, magnitudes ⚠️.
- ✅ Format tax (arXiv 2604.03616), JSONSchemaBench (arXiv 2501.10868) — reason in NL, constrain only the final call.
- 🏷️/⚠️ "Loop engineering" — Osmani (addyosmani.com, Jun 2026), Cherny (separate faster model checks completion — theneuron.ai/thenewstack.io), Steinberger.

## Graph / agent memory
- ✅ Zep/Graphiti bi-temporal KG (arXiv **2501.13956**) — gpt-4o-mini beats large long-context baseline ~70× fewer tokens (LongMemEval).
- ✅ GraphRAG / ✅ LazyGraphRAG (Microsoft Research, Nov 2024); ✅ HippoRAG 2 (arXiv 2502.14802); GraphRAG-Bench (arXiv 2506.02404) — graphs win multi-hop, lose single-hop, ~2.3× latency.
- ✅ mem0 (arXiv 2504.19413) — ADD/UPDATE/DELETE/NOOP, ~90% token savings; 🏷️ mem0 2026 numbers (mem0.ai/research) unverified.
- ✅ A-MEM (arXiv 2502.12110, NeurIPS 2025); 🏷️ Letta sleep-time compute (letta.com/blog, 2025).
- ✅ CoALA taxonomy (arXiv 2309.02427); Memp procedural (arXiv 2508.06433).
- ✅ MCP refs: `mcp-memory-libsql`, `memory-graph`, Graphiti MCP (GitHub).
- ⚠️ Memory governance/poisoning (arXiv 2603.11768, 2604.16548) — add provenance/contradiction checks on writes.

## Local/open models & runtime
- ✅ GLM-4.5 "Agentic, Reasoning, Coding" (arXiv **2508.06471**); HF `zai-org` — **"ZLM" = GLM (Z.ai/Zhipu)**, informal shorthand.
- ✅ Docker, "Local LLM tool calling: a practical evaluation" (Jun 30 2025) — Qwen3-8B 0.933 > Llama-3.3-70B 0.607; param count poor predictor.
- ✅ llama.cpp PR **#16932** (Nov 18 2025) — generalized XML tool-call parsing (GLM-4.5/4.6, MiniMax-M2, Kimi-K2, Qwen3-Coder, …); issues #15012, #20837, LM Studio #825.
- ✅ Devstral Small 2 (24B, ~68% SWE-bench); ✅ gpt-oss (Apache 2.0); ✅ Qwen3-Coder-Next 70.6% (arXiv); ⚠️ 2026 point-releases (GLM-5.x, Qwen3.5, Gemma 4, Nemotron 3, DeepSeek V4) real but fast-moving — re-verify numbers.
- ⚠️ timetoact KAMI "agentic disconnect" (BFCL rank ≠ real reliability).

---

## The two claims the Challenger CORRECTED (kept here so we never re-drift)
1. **NOT** "verifier benefit is largest when the generator is weak" — the opposite holds for self-vs-cross verification (2512.02304). The small-model win is **tool-offloaded** verification, not weakness.
2. **NOT** "a local 7–14B model reaches frontier long-horizon agentic reliability via scaffolding" — the cleanest "small+memory ≥ big" result uses **gpt-4o-mini (small frontier API model)**, and local-open wins are all on **narrow/short** tasks. Claim only: **narrows the gap on bounded tasks.**

## Method honesty
4 research agents + 1 Challenger, run with our own micro-loop discipline (independent verification, cite-or-discard, Ralph coverage). Known limits: several 2026 figures are snippet-sourced; openai.com / metr.org / some HF pages were fetch-blocked; future-dated arXiv IDs (2602.x–2604.x) are plausible for mid-2026 but flagged where bodies couldn't be extracted. **Re-verify any ⚠️/🏷️ number before citing it externally.**

---

[🏠 Index](README.md)
