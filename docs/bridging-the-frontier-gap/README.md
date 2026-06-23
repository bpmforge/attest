# Bridging the Frontier Gap — making cheaper / local models operate closer to frontier

**Compiled 2026-06-23. Primary-sourced and adversarially verified (Challenger pass + Ralph coverage loop).**
**Deliverable:** verified research synthesis + a concrete, prioritized plan for our experts / Foreman / memory-MCP.

This is a **book** (per `BOOK_PROTOCOL.md`, >300 lines → chapter directory).

| Chapter | Summary |
|---|---|
| [01 — Thesis & verified evidence](01-thesis-and-evidence.md) | internalized vs externalizable; the 8 levers; the honest claim boundary |
| [02 — System map & implementation backlog](02-system-map-and-backlog.md) | every lever → what we have / upgrade / build, prioritized |
| [03 — Local-model & runtime playbook](03-local-model-and-runtime-playbook.md) | which models + runtime config for the actual fleet |
| [05 — Memory architecture](05-memory-architecture.md) | what `bpm-memory-mcp` actually is (mature!) → the real B1: *activate* bi-temporal + sleep-time consolidation, not "build a graph" |
| [06 — Economics, evaluation & distillation](06-economics-evaluation-distillation.md) | does the scaffold pay off, how to measure on our workload, and the distillation alternative |
| [04 — Sources & confidence](04-sources.md) | every citation with a verified/snippet/vendor flag |

---

## The thesis (one sentence)

> **A scaffold a frontier model has internalized is exactly the scaffold a weaker model still needs externally** — so our experts/loops/drift/memory system is the *externalized* version of what frontier models do in their weights, and the way to lift a cheap/local model is to give it more of that scaffold, not to wish it were bigger.

Evidence (verbatim, primary): Anthropic's harness blog (Mar 2026) found scaffolds that were **"load-bearing for Sonnet 4.5 became redundant by Opus 4.6."** That single finding *is* the internalized/externalizable axis.

## The honest claim boundary (what the Challenger forced us to get right)

- **WE MAY claim:** scaffolding + tool-offloaded verification + goal-state reflection + external memory **measurably narrows the gap on bounded, short-to-medium tasks** — sometimes lifting a small *local* model past a much larger one on that task (Docker: Qwen3-8B 0.933 > Llama-3.3-70B 0.607; ReflAct: Llama-3.1-8B +31.4 pts; T1: a 1B + tools > an 8B on MATH).
- **WE MUST NOT claim:** that a local 7–14B open-weight model reaches **frontier (Opus/GPT-class) long-horizon agentic reliability** via scaffolding. The cleanest "small + memory ≥ big" result (Letta, 74% LoCoMo) runs on **gpt-4o-mini — a small *frontier API* model, not a local open one.** And **self-conditioning** (errors compound and *scale does not fix it*) means per-step error still accumulates over long horizons regardless of scaffold.
- **The frame, therefore:** *"narrow the gap on bounded tasks, keep horizons short, and externalize everything you can"* — not *"local = frontier."*

## The map at a glance (full version in chapter 02)

| Externalizable lever (evidence-backed) | Our system today | Verdict |
|---|---|---|
| External **isolated/cross-family** verifier | G1 maker/verifier split | ✅ have — top lever |
| **Tool-offloaded** verification (facts/numerics/APIs) | validators, G-E | ✅ **done** — MICRO_LOOP B3 |
| No-progress / loop kill | G2 gap-checksum | ✅ have |
| Micro-steps + checkable exit + refuse-to-loop | micro-loops | ✅ have |
| **Prune the model's own error turns from context** | MODEL_ADAPTER small tier | ✅ **done** — B2 |
| **Goal-state re-grounding each step** (ReflAct) | MICRO_LOOP REVISE | ✅ **done** — B4 |
| **Externally-supplied plan → weak model executes bounded steps** | maker/verifier, tier routing | ⚠️ formalize (B5) |
| **Reason in NL, format only the final tool-call** (−27pt format tax) | MODEL_ADAPTER small tier | ✅ **done** — B6 |
| **Bi-temporal memory + sleep-time consolidation** | bpm-memory-mcp (graph + hybrid retrieval **already exist**; bi-temporal/consolidation **dormant**) | ⚠️ **activate** — ch. 05 (B1) |
| **Checkpoint / revert to known-good** | — | ❌ NEW (Foreman) |
| **Deterministic orchestration in code, not the model** | HANDOFF + validators | ✅ have — reinforce |
| **Local model + runtime playbook** | — | ❌ NEW (ch. 03) |

`✅ have` = our existing anti-drift work (G1, G2, micro-loops, validators) is already the right shape and is now *cited* as the externalized form of frontier behavior. `⚠️`/`❌` = the concrete additions this research surfaced.
