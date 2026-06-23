# 06 — Economics, Evaluation & the Distillation Alternative

[🏠 Index](README.md) · [← memory](05-memory-architecture.md) · [next: sources →](04-sources.md)

Three questions the rest of the book implies but doesn't answer: **does the scaffold pay for itself, how do we know it works on *our* workload, and is scaffolding even the right lever?**

---

## 1. The economics of scaffolding (the crux of "cheaper models")

Every externalizable lever costs *more inference*: an external verifier ≈ a second model call per step; re-grounding + reason-then-format add tokens; memory retrieval + sleep-time consolidation add calls; tool-offloaded verification adds tool round-trips. **The whole point of a cheap/local model is cost — so the scaffold must not cost more than the gap it closes.**

The decision is a per-task trade, not a blanket one:

| Regime | Use |
|---|---|
| **Bounded, repeated, latency-tolerant, runs on owned hardware** (most of Foreman's per-phase work) | **Local model + full scaffold.** Marginal inference is ~free (your GPU), the scaffold buys reliability, and tool-offloaded verification (a 1B+tools beating an 8B) is the cheapest accuracy you can buy. |
| **One-shot, long-horizon, or needs frontier judgment** (planning, final verify, novel design) | **Escalate to a frontier API.** Scaffolding a weak model up to this is more total tokens *and* still won't reach frontier long-horizon reliability (chapter 01 boundary). Pay for the strong model where it's load-bearing. |
| **High-volume, narrow, repeated** | Consider **distillation** (§3) — amortize a one-time tuning cost into a permanently cheaper per-call model. |

**Rules of thumb (illustrative, validate on your bill):**
- A scaffold that adds *N* extra model calls per task only pays off if it lifts success enough to avoid *N* failed-and-retried frontier escalations. For owned-hardware local inference the bar is low (marginal cost ≈ electricity); for paid API verifiers the bar is real — prefer **a tool or a cheaper-tier verifier** over a second frontier call.
- **The cheapest reliability is a deterministic gate** (validator/test), not a model. This is *why* our validators-own-the-gate design is also the most economical: a `validate-*.sh` costs ~0 vs a verifier model call.
- Sleep-time consolidation is **idle-time** compute — schedule it when the box is otherwise free, so it's effectively free.

**Design consequence:** the local executor + deterministic gates + escalate-for-planning/final-verify split (chapter 02, B5) is also the *cost-optimal* shape, not just the reliability-optimal one.

---

## 2. Evaluation — "does it work on *our* workload?"

The single most important caveat from the model research (the **"agentic disconnect"**): **leaderboard rank ≠ real agentic reliability.** Small models that beat a 72B on BFCL scored far below it on realistic CSV/DB extraction. So every claim in this book must be re-checked against *our* tasks before we trust it.

We already own the harness — extend it, don't invent:

- **`scripts/run-evals.mjs` + `evals/`** (eval fixtures) is the place. Add a **tiered eval**: run each fixture against (a) a frontier model, (b) a local model *bare*, (c) the local model *+ scaffold* (verifier + re-ground + tools + memory). The delta (c−b) measures *the scaffold's lift*; the gap (a−c) measures *what's left*.
- **Measure per-horizon**, not just pass/fail — short vs medium vs long task buckets, because the gap widens with horizon (self-conditioning). A scaffold that helps at 5 steps may be neutral at 50.
- **Track cost alongside accuracy** — record tokens/calls per eval so §1's trade is data, not a guess.
- **Telemetry already exists** (`telemetry.jsonl`, `telemetry-report.mjs`) — wire scaffold-on/off + cost into it so the "is it worth it" question is answered continuously, not once.

Without this, we'd be trusting the techniques on faith — the exact perception drift we built the anti-drift system to prevent.

### First measured run (2026-06-23)

The harness is built and **run for real** (`EVAL_MODEL` pins the model per cell; `eval-compare.mjs` scores the gap). Frontier `openai/gpt-5.5` vs local `lmstudio/qwen/qwen3-coder-next`, on the same agent scaffold, across all three horizons:

| Horizon | frontier | local | gap |
|---|---|---|---|
| short (`flask-sqli` → security-auditor) | 100% | 100% | **0%** |
| medium (`ts-dead-dup` → code-reviewer) | 100% | 100% | **0%** |
| long (`node-onboard` → entry-point-tracer) | 100% | 100% | **0%** |

Cost: frontier 723s / ~726 tok, local 1021s / ~1681 tok (≈1.4× wall-time, ≈2.3× tokens — free on owned hardware). Fixture health 5/5 both (planted defects confirmed present).

**The methodology lesson is as important as the result.** The *first* run reported a −12% gap (frontier "losing") — an artifact of a coordinator agent (`code-reviewer`, which fans out to sub-agents) exceeding a flat 900s budget and being logged as FAIL. Three validity fixes turned the anecdote into a measurement: (1) **agent-only scoring** — deterministic semgrep checks are a fixture-health gate, not part of the model gap; (2) **outcome classes** — `TIMEOUT`/`ERROR` are "incomplete", never `FAIL`, never folded into the rate; (3) **per-check budgets** sized to the agent (coordinator 40m, single 15m). Only then did the true 0% gap appear.

**The honest boundary holds.** These are *bounded* tasks (find the planted defect, trace the entry points) — exactly where the book predicts scaffolding closes the gap. This is **not** evidence that a local 30B equals frontier on open-ended long-horizon reliability. Still missing for a complete picture: the **bare cell** (no scaffold) to populate `lift`, and **N× repeats** for statistical confidence (both flagged in the harness).

---

## 3. Distillation — the *complementary* lever (not just scaffolding)

The whole book is scaffold-based (wrap the model). There is a second, orthogonal way to lift a small model: **task-narrowed fine-tuning / distillation** — bake the capability into weights.

- Evidence (directional, vendor-flagged): a fine-tuned **0.6–4B can beat a prompted 120B on the *narrow* task**; agent-distillation (NeurIPS 2025 spotlight) distills a teacher's trajectories into a small student; **MemLoRA** distills memory extract/update/retrieve logic into LoRA adapters for **local, private** deployment.
- **Trade-off:** distillation is a *one-time cost* that yields a *permanently cheaper, narrower* model; scaffolding is *zero-setup* but *per-call cost* and *general*. They compose: distill the high-volume narrow steps (e.g. our validators' fix-suggestions, a router, a tool-call formatter), scaffold the rest.
- **Honest scope:** distillation makes a small model *better at a narrow task*, not *generally frontier*. Same boundary as chapter 01.
- **Where it could fit us:** a distilled router/classifier (intent → expert), a distilled tool-call formatter (kills the Qwen3-Coder XML/format-tax problem at the weights), or a distilled "fix-from-validator-output" model. **Not on the immediate backlog** — flagged as a future lever once the scaffold backlog (B1–B8) is in and the eval harness (§2) can prove a tuning run's worth.

---

[🏠 Index](README.md)
