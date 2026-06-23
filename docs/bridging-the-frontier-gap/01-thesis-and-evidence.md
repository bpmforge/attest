# 01 — Thesis & Verified Evidence

[🏠 Index](README.md) · [← index](README.md) · [next: system map →](02-system-map-and-backlog.md)

All claims below are primary-sourced and survived an adversarial Challenger pass. Caveats are baked in, not hidden. Full citations in [chapter 04](04-sources.md).

---

## 1. Internalized vs externalizable — the axis that defines the work

Frontier reliability comes from two kinds of thing:

- **[internalized]** — a property of the model itself (scale, RL-trained reasoning, long-context coherence): cannot be copied by wrapping a weaker model.
- **[externalizable]** — a scaffold (verifier, memory, plan, tools, checkpoints, loop structure) a weaker model can be wrapped in to *approximate* the behavior.

The proof this axis is real: Anthropic's "Harness design for long-running application development" (Mar 2026) iteratively removed harness pieces to find what was "load-bearing" and reported **sprint decomposition + context resets were load-bearing for Sonnet 4.5 but redundant by Opus 4.6.** A scaffold the strong model internalized is the scaffold the weak model still needs. **Corollary: for a weak local model, treat the whole scaffold stack as load-bearing — assume nothing is optional.**

What is **[internalized]** (cannot be wrapped around a weak model): raw long-context coherence without "context rot," efficient per-step reasoning, RL-trained planning/backtracking (OpenAI Deep Research is *trained* to plan/backtrack, not scaffolded into it), resistance to self-conditioning at scale, high single-step accuracy. Frontier models (Fable 5 / Mythos-class — a tier Anthropic states "sits above our Opus class," 1M context, always-on adaptive thinking) lead on exactly these.

Everything else is **[externalizable]** — and that is our entire opportunity.

---

## 2. Why long tasks fail — the mechanism (so we fix the right thing)

- **Execution, not reasoning, is the long-horizon bottleneck.** Even given the plan and the knowledge, models fail to *carry out* long step sequences. ("Illusion of Diminishing Returns," arXiv 2509.09677, ICLR 2026.)
- **Step-accuracy compounds exponentially.** Above ~70% per-step accuracy, tiny gains yield large task-length gains — and tiny losses collapse long tasks. Short benchmarks hide this. (same)
- **Self-conditioning** *(CONFIRMED verbatim)*: "models become more likely to make mistakes when the context contains their errors from prior turns," and **"self-conditioning does not reduce by just scaling the model size."** "Thinking mitigates self-conditioning… enables execution of much longer tasks in a single turn." (same)
  - **Honest nuance:** "scale doesn't fix self-conditioning" ≠ "scale doesn't help long horizons" — larger models still execute *more total turns*. Don't conflate.
- **Drift is measurable and worse for small models.** 7B/8B open models drift ~20–25× more than GPT-4.1 from their instructions; periodic goal reminders cut it. ("Drift No More?", arXiv 2510.07777.)
- **The multi-turn cliff.** Small models lose 40+ points going single-turn → multi-turn (e.g. Qwen3-4B ~80% → ~35% on BFCL) — they compound their own errors. → keep horizons short, externalize state.

**Design consequence:** the levers that matter are the ones that (a) keep per-step accuracy high (tool-grounding, external verification), (b) stop error accumulation (prune error turns, checkpoint/revert, re-ground to goal), and (c) keep the horizon short (decompose, externalize memory).

---

## 3. The eight externalizable levers (ranked, with evidence + caveats)

### Lever 1 — External, *isolated / cross-family* verifier (top lever)
A model grading **itself** is the weakest link: intrinsic self-correction "cannot self-correct reasoning yet" without external feedback and can *degrade* performance (Huang et al., arXiv 2310.01798); a 64.5% self-correction "blind spot" — models fix others' errors but not their own (Self-Correction Bench, 2507.02778); self-refinement amplifies self-bias and **open models over-rate themselves most** (arXiv 2402.11436).
- **CHALLENGER CORRECTION:** it is **NOT** true that the verifier advantage is "largest when the generator is weak." The 37-model study (2512.02304) finds **cross-family verification becomes *more* valuable as models get *stronger***, and self-verification can backfire via *similarity bias* (a verifier accepts its own bad answer). "Mind the Gap" (2412.02674) finds the gen–verify gap *scales up* with FLOPs.
- **What we may assert:** an **external / cross-family** verifier reliably beats self-grading (period). For a small model specifically, the durable win is **Lever 2** (offload verification to tools), not "weakness makes self-verification better."
- *Maps to our G1 maker/verifier split — keep it, and make the verifier a **different family/instance**, never the maker.*

### Lever 2 — Tool-offloaded verification (the real small-model win)
Offloading verification of numerics/facts/APIs to tools (code exec, tests, calculators, doc lookups) is the most on-point lever for local models: **T1 (arXiv 2504.04718, CONFIRMED): "a Llama-3.2 1B model under test-time scaling outperforms the significantly larger Llama-3.1 8B model"** on MATH, via tool-integrated verification. SCORE (2404.17140): +14.6% with a strong external verifier; a weak self-verifier produces too many false positives.
- **Scope honestly:** T1's result is on MATH via a code interpreter — not a general claim. But the *principle* (don't let a weak model judge what a tool can decide) is exactly our validators-own-the-gate philosophy and our G-E (verify APIs or BLOCK).

### Lever 3 — Goal-state re-grounding *each step* (disproportionately helps weak models)
**ReflAct (arXiv 2505.15182, EMNLP 2025, CONFIRMED Table 2):** reflecting on **state-vs-goal** each step (not just "what's my next action") lifts **Llama-3.1-8B from 29.1% → 60.5% (+31.4) on ALFWorld**, while the 70B gains only +2.3. Grounding *substitutes for capacity the weak model lacks.* (Caveat: the paper's headline 93.3% is GPT-4o, not the 8B.)
- *New for us: our micro-loop has a static CRITERION; add an explicit per-step "restate current-state vs goal" reflection.*

### Lever 4 — Prune the model's own error turns from context
Direct consequence of self-conditioning (§2): keep failed attempts *out* of the working context. Compaction / tool-result clearing / fresh context resets with file handoffs (Anthropic context-engineering, Sep–Nov 2025) are the mechanism. **This is a technique we do not have.**

### Lever 5 — Externally-supplied plan → weak model executes bounded steps
Self-decomposition *hurts* weak models — they fail the *chaining glue* (dropping intermediate results): classic least-to-most gives small models 19.6% vs 96% large. But a **plan supplied by a stronger model/template** helps: "weaker models materially improve when given structured plans from stronger models"; Speculative Thinking (32B guides 1.5B): +6–14 pts. Below ~3B, models can't internalize long reasoning but **can apply externally-provided shorter guidance** (arXiv 2510.13935).
- **Rule:** plan with the strong tier, execute bounded individually-checkable steps with the cheap tier — but **don't over-decompose** (granularity must be bounded; "blindly increasing decomposition granularity accumulates errors," 2510.17922).

### Lever 6 — Reason in natural language, format only the final tool-call
The "format tax": forcing JSON/schema on the *reasoning* costs up to **−27 points**, worst on small/open models. Reason in NL, then constrain *only* the final tool-call emission (grammar-constrained decoding ~2.5× strict-format on sub-2B). (Format Tax 2604.03616; JSONSchemaBench 2501.10868.) **New for us (coding/agent rule).**

### Lever 7 — Graph + bi-temporal external memory + sleep-time consolidation
External structured memory externalizes "what was decided/learned/done/failed" so a small model doesn't re-derive or forget it. **Zep/Graphiti (arXiv 2501.13956):** a bi-temporal knowledge graph (every edge carries when-it-was-true *and* when-we-learned-it, so it records **supersession** instead of overwriting) — **gpt-4o-mini on it beat a large-model long-context baseline using ~70× fewer tokens** on LongMemEval. mem0's ADD/UPDATE/DELETE/NOOP write loop cuts bloat (~90% token savings). Letta's "sleep-time compute" runs episodic→semantic consolidation as a *background* pass.
- **CHALLENGER CAVEAT (C7):** the strongest wins use **gpt-4o-mini (small *frontier API* model)**, and one study found memory scaffolds "never help" at very-long horizons. So: graph memory is a strong, well-evidenced **token-efficiency + cross-session-coherence** win on bounded tasks — **not** proof a local model reaches frontier long-horizon reliability.

### Lever 8 — Checkpoint / revert + hard loop guards
Git checkpoint per known-good state + revert on failure; max-turns, wall-time kill, fingerprint-based repetition detection (stop after N identical (tool,args)), bounded retry budgets with backoff+jitter. (Anthropic harness; LangGraph checkpointer; practitioner consensus.) Limitation: can't undo external side-effects already performed. **We have no-progress kill (G2); checkpoint/revert + error-pruning are gaps.**

---

## 4. Practitioner convergence (independent of the papers)

The 2026 "loop engineering" movement (Osmani, Cherny, Steinberger) independently lands on the same two things: **separate the actor from the checker**, and **persist state to a file**. Cherny (Claude Code): *a separate, faster model checks the completion condition each turn — not the model that wrote the code.* Osmani: loop = **Find → Act → Verify → Remember**, "because the model forgets everything between runs, but the repo doesn't." This is exactly Levers 1, 4, and 7 — and exactly our G1 + disk-state + memory design.

---

[🏠 Index](README.md)
