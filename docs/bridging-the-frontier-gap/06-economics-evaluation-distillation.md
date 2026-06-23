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

### Measured runs (2026-06-23) — including a methodology failure worth recording

The harness was run for real (`EVAL_MODEL` pins the model per cell; `eval-compare.mjs` scores the gap), and the path to a *trustworthy* number ran through three corrections — two methodological, one a real isolation bug. All three matter more than the headline.

**Correction 1 — validity (outcome classes + agent-only scoring).** The first run reported a −12% gap (frontier "losing"), an artifact of a coordinator agent (`code-reviewer`) exceeding a flat 900s budget and being logged as `FAIL`. Fixed by: agent-only scoring (deterministic semgrep checks are a fixture-health gate, not the model gap); outcome classes (`TIMEOUT`/`ERROR` are "incomplete", never `FAIL`); per-check budgets sized to the agent.

**Correction 2 — isolation (the big one). The earlier "0% gap" numbers were INVALID.** opencode resolves its project root to the **launch directory (this repo)**, not the `cwd` passed to the runner — so the agents were reading and editing the **main repo, not the fixture copies**. It surfaced when a `--bare` agent *fixed the canonical `lemonade-cashbox` fixture in place* (and committed audit docs into the repo on earlier runs). Fix: pass `opencode run --dir <workcopy>` (verified — the agent then only sees the sandbox), plus a runner guard that aborts if the repo HEAD moves **or any tracked file changes** during a run. Any agent result produced before this fix cannot be trusted.

**The first trustworthy result.** A new outcome-based fixture, `lemonade-cashbox` — six money-helper bugs whose `node:test` suite must be made green (scored by re-running the suite, `verify_cmd`, not by matching the agent's chatter). Isolated triad, frontier `gpt-5.5` / local-scaffolded / local-bare `qwen3-coder-next`:

| task | frontier | local | local-bare | lift | gap |
|---|---|---|---|---|---|
| fix 6 bugs → suite green | ✅ ~67s | ✅ ~58s | ✅ ~62s | **0%** | **0%** |

Isolation confirmed: the canonical fixture stayed RED and git-clean, and each cell started from a properly-red copy.

**What it means — the ceiling effect is real, not an artifact.** Even bare local-30B one-shot-fixed all six bugs in ~60s; the scaffold and the frontier model added nothing measurable, and cost barely differed. The reason: a failing test points *directly* at each bug, so a competent coder model fixes it without needing a verify-iterate loop. The task is multi-step but still **bounded and oracle-guided** — exactly where the thesis predicts no gap. This is now a *trustworthy* statement of the bounded-task result.

**Conclusion: the harness is correct; bounded oracle-guided tasks simply don't discriminate** — not even a harder fix-the-tests one. To measure real lift/gap we need tasks genuinely **beyond bare-local's one-shot reach**: many more defects, multi-file/non-local diagnosis, *no* per-bug test oracle, or true long-horizon chains where one early error compounds. Those are expensive to author and run (and may hit local-hardware limits), so the honest next move is to build the *scaffold levers* (B5/B7/B8) and bring harder fixtures online only when there's a specific lever whose value needs proving. N× repeats remain pending.

---

## 3. Distillation — the *complementary* lever (not just scaffolding)

The whole book is scaffold-based (wrap the model). There is a second, orthogonal way to lift a small model: **task-narrowed fine-tuning / distillation** — bake the capability into weights.

- Evidence (directional, vendor-flagged): a fine-tuned **0.6–4B can beat a prompted 120B on the *narrow* task**; agent-distillation (NeurIPS 2025 spotlight) distills a teacher's trajectories into a small student; **MemLoRA** distills memory extract/update/retrieve logic into LoRA adapters for **local, private** deployment.
- **Trade-off:** distillation is a *one-time cost* that yields a *permanently cheaper, narrower* model; scaffolding is *zero-setup* but *per-call cost* and *general*. They compose: distill the high-volume narrow steps (e.g. our validators' fix-suggestions, a router, a tool-call formatter), scaffold the rest.
- **Honest scope:** distillation makes a small model *better at a narrow task*, not *generally frontier*. Same boundary as chapter 01.
- **Where it could fit us:** a distilled router/classifier (intent → expert), a distilled tool-call formatter (kills the Qwen3-Coder XML/format-tax problem at the weights), or a distilled "fix-from-validator-output" model. **Not on the immediate backlog** — flagged as a future lever once the scaffold backlog (B1–B8) is in and the eval harness (§2) can prove a tuning run's worth.

---

[🏠 Index](README.md)
