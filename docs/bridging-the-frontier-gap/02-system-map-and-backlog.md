# 02 — System Map & Implementation Backlog

[🏠 Index](README.md) · [← evidence](01-thesis-and-evidence.md) · [next: local playbook →](03-local-model-and-runtime-playbook.md)

How each evidence-backed lever maps to what we already have, what to upgrade, and what to build — then a prioritized backlog across **experts**, **Foreman**, and **bpm-memory-mcp**.

---

## 1. Lever → our system

| Lever | We have | Gap / action |
|---|---|---|
| 1. External/cross-family verifier | **G1** maker/verifier split; CHALLENGER_PROTOCOL | Make the verifier a **different family/instance** explicitly (e.g. local maker → different local or cheap-cloud verifier). Mostly done. |
| 2. Tool-offloaded verification | validators-own-the-gate; `fix-verify.mjs`; **G-E** verify-or-block | **Generalize** to a stated principle: "if a tool/test/validator can decide it, never let the model judge it." Already our DNA — make it explicit in MICRO_LOOP. |
| 3. Goal-state re-grounding per step | static CRITERION in MICRO_LOOP | **Upgrade:** add a per-step "restate current state vs the goal" reflection (ReflAct). New micro-loop sub-step. |
| 4. Prune own error turns | — | **NEW:** an error-turn-pruning rule + a context-hygiene step (drop failed attempts before the next try). |
| 5. Plan(strong) → execute(weak) bounded | maker/verifier; MODEL_ADAPTER tiers; task-decomposer | **Formalize** a planner-tier/executor-tier split with bounded granularity; route planning to the strong tier, execution to the cheap tier. |
| 6. Reason-in-NL, format only the call | — | **NEW:** coding/agent rule + (for local) constrain only the final tool-call, not the reasoning. |
| 7. Bi-temporal memory + sleep-time consolidation | bpm-memory-mcp **already has** graph (entities/relations) + Zettelkasten links + hybrid retrieval + supersession + taxonomy | **Activate, don't rebuild** (ch. 05): turn on the dormant bi-temporal model + add a sleep-time consolidation scheduler + auto-resolve contradictions. Smaller than first assumed. |
| 8. Checkpoint/revert + loop guards | **G2** no-progress kill; 3-iter caps | **NEW:** git checkpoint/revert to known-good (Foreman); error-pruning ties in. |
| — Deterministic orchestration in code | HANDOFF + validators (orchestrator is code, not the weak model) | ✅ Reinforce — research says weak models can't self-orchestrate; keep orchestration external/deterministic. |
| — Local model + runtime playbook | — | **NEW:** ch. 03 — which models + runtime config. |

**Reassuring headline:** our anti-drift work (loops, micro-loops, G1, G2, validators, refuse-to-loop, tracking gates) is *already the externalized-frontier-scaffold the literature prescribes* — now cited. The new work is additive, not a rebuild.

---

## 2. Prioritized backlog

Priority = (evidence strength) × (gap size) × (how much it helps the *weak/local* tier). Each item names its owner repo and its lever.

### P0 — highest leverage, well-evidenced, we don't have it

- **B1. Bi-temporal activation + sleep-time consolidation for `bpm-memory-mcp`** (Lever 7) — **see [chapter 05](05-memory-architecture.md) for the accurate current→target.**
  *Corrected after reading the actual system:* the graph (`entities`/`relations`), Zettelkasten links, hybrid retrieval (vector+BM25+graph-walk+RRF), supersession versioning, and typed taxonomy **already exist and are tested.** The real work is narrower: **B1a** activate the dormant bi-temporal model (formal ADD/UPDATE/DELETE/NOOP + `as-of <date>` queries on the existing `valid_from`/`valid_to`); **B1b** add a **sleep-time consolidation** scheduler (episodic→semantic distillation with `derived_from` provenance, rollback-able); **B1c** auto-resolve contradictions on store (auto-link + confidence drop); **B1d** improve KG population beyond regex.
  - *Honest scope:* token-efficiency + cross-session coherence on bounded tasks; not a frontier-long-horizon claim. Governance (provenance + write-time contradiction check) is mandatory before auto-writing at scale.

- **B2. Error-turn pruning / context-hygiene step** (Levers 4 + 8) — **experts + Foreman**.
  A micro-loop rule + a runtime behavior: after a failed attempt, **prune the failed turn(s) from the working context** before retrying (self-conditioning isn't fixed by scale). For Foreman: on retry, reconstruct context from disk state + the last known-good, not from the error-laden transcript.

- **B3. Tool-offloaded-verification principle, made explicit** (Lever 2) — **experts**.
  One MICRO_LOOP rule: *"if a validator/test/tool can decide a criterion, the model never judges it."* We mostly do this; stating it closes the "weak model self-grades" failure mode by default. Extend G-E's spirit beyond APIs to facts/numerics.

### P1 — strong evidence, an upgrade rather than net-new

- **B4. Goal-state re-grounding sub-step in MICRO_LOOP** (Lever 3) — **experts**.
  Add to the micro-loop: before each produce/verify cycle, restate *current state vs the goal* (ReflAct). Cheap, and the single biggest measured weak-model lift (+31.4 pts on 8B). For Foreman: re-inject the goal + current phase state each step (counters drift — 7B/8B drift ~20–25× more).

- **B5. Planner-tier / executor-tier split** (Lever 5) — **experts + MODEL_ADAPTER**.
  Formalize: route **planning/decomposition to the strong tier**, **bounded execution to the cheap tier**; cap granularity (don't over-decompose). Extends maker/verifier with a maker/**planner** role. Pairs with the local-model playbook (ch. 03).

- **B6. Reason-in-NL-then-format rule** (Lever 6) — **coding-agent + a local-runtime note**.
  Coding/agent rule: produce reasoning in natural language; emit structured output only at the final tool-call boundary (avoid the −27pt format tax). For local runtimes, constrain *only* the final call (grammar/JSON-schema), never the chain-of-thought.

### P2 — valuable, more build effort or Foreman-scoped

- **B7. Checkpoint/revert to known-good** (Lever 8) — **Foreman**.
  Git checkpoint per passed phase + revert-on-failure to the last known-good (recover instead of spiral). Ties to W0 reliability work already underway.

- **B8. Local-model + runtime playbook as an installable reference** (ch. 03) — **experts (`references/`)**.
  Ship ch. 03 as a `references/local-agentic-models.md` the agents can read: model picks per tier + runtime config (vLLM/SGLang vs llama.cpp `--jinja`, strip-thinking-across-turns, the Qwen3-Coder XML caveat).

---

## 3. What this does NOT change

- We are **not** rebuilding the anti-drift system — it's already the right shape and now has citations.
- We are **not** claiming local = frontier. The backlog's honest goal: **narrow the gap on bounded tasks, keep horizons short, externalize memory + verification + planning** — so a Qwen3-14B / Devstral-class local model becomes a *reliable bounded-task worker* inside Foreman's deterministic orchestration, escalating to a stronger tier for planning and final verification.

## 4. Suggested sequencing

1. **B3 + B4** (cheap MICRO_LOOP rules, immediate, experts) → one release.
2. **B2** (error-pruning, experts + Foreman) → one release.
3. **B1** (memory graph — the big one, bpm-memory-mcp) → its own multi-wave effort.
4. **B5, B6, B8** (planner split, format rule, local playbook) → batched.
5. **B7** (checkpoint/revert) folds into Foreman's reliability waves.

Each lands canonical-first (flows via build), Challenger-verified, tracker-updated, ff-merged + tagged (no release-state drift).

---

[🏠 Index](README.md)
