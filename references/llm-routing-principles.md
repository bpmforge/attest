# LLM Routing Principles

**Audience:** agent system designers, engineers picking models for specific workloads, reviewers evaluating routing decisions.
**Scope:** applies to any LLM backend — local (LM Studio, Ollama, vLLM) or hosted (Claude, GPT, Gemini, Grok). The failure modes are the same; only frequency and severity change.

Read this before:

- Adding a new model to a routing config
- Designing a new specialist agent
- Wiring an LLM into a production pipeline
- Reviewing code that depends on an LLM's output being truthful or structurally correct

---

## The 7 Principles

### 1. Models do what they were trained to, and prompts do not override that

Some failure modes are baked into training — confidence inflation, defensive try-catch reflexes, phantom tool-result citation, scope creep beyond the ask. A carefully written system prompt can dampen these behaviors but cannot erase them. Every model family has its own catalog of reflexes.

**Rule:** If a model demonstrably does X despite prompt guidance, assume it will do X in production. Route around it, or audit the output.

### 2. Architecture does the lifting, prompts support it

Behaviors that matter for correctness or safety need a load-bearing pipeline component, not just a prompt paragraph:

- **Synthesis injection** — when a tool loop would otherwise run unbounded, force a final no-tool call that produces an answer from what was gathered
- **Manifest cross-check** — verify that files, facts, or results an agent claims it produced actually exist
- **Structured delegation** — explicit "PRODUCE EXACTLY these deliverables, no more" framing with a parser that rejects anything extra

**Rule:** If a behavior matters, encode it in the pipeline. Claude Code hooks, OpenAI structured output, strict tool schemas, and post-response verifiers all qualify.

### 3. Quantization and temperature are regularizers, not just speed knobs

Lower-precision weights and lower temperatures suppress some training reflexes — including the defensive-programming ones. Higher precision and higher temperature surface them more often. The same model can produce materially different output at different settings with the same prompt.

**Rule:** Treat quantization or temperature changes as behavior changes. Re-benchmark on the target workload before promoting a new configuration.

### 4. Specialist ≠ Researcher. Never assume skill transfer across roles

A model that excels as a researcher (calibrated, cites sources, qualifies uncertainty) can simultaneously be a poor specialist (fabricates deliverables, writes defensive code, pads output). A model that writes clean specialist code can be a poor researcher (narrates its own reasoning instead of the evidence). These are distinct capabilities.

**Rule:** Benchmark per role. Do not extrapolate from one role's performance to another.

### 5. Test the loop, not the response

One-shot evaluations systematically under-measure:

- **Phantom claims** — only visible under structured delegation across multiple turns
- **Confidence inflation** — only visible across iterations, especially when the model is asked to self-assess
- **Defend-heavy challenge response** — only visible under adversarial probing
- **Synthesis collapse** — only visible when tool loops are capped

**Rule:** Every production behavior you depend on needs a dedicated scenario. Writing prose well does not imply writing structured output well does not imply honest self-assessment does not imply graceful failure recovery.

### 6. Honesty-penalty beats honesty-prompt

When a model can fabricate a deliverable (file, fact, citation) and the fabrication looks plausible, the prompt instruction "do not fabricate" is not sufficient. You must verify the claim against reality — cross-check claimed files against actual code blocks, claimed citations against actual source fetches, claimed test results against actual test execution.

**Rule:** For any behavior where fabrication is possible, build detection. Prompt the right behavior, but code the detection of the wrong behavior.

### 7. Vision changes the routing equation for visual tasks

If your input is a screenshot, a diagram, a PDF page, or a chart, routing to a vision-capable model is often a clean win over OCR + text pipeline. The output quality is higher and the surface area is smaller.

**Rule:** Tag tasks whose native input is visual and route them to vision-capable endpoints. Gate on capability, not provider.

---

## Role → Capability Requirements

Describe the role in terms of capabilities, not model names. Then test candidate models against those capabilities.

| Role | Core capabilities to test |
|---|---|
| **coding-agent** | Produces exactly the requested files. Does not scope-creep. Does not fabricate deliverables. Passes anti-slop audit. Honors framework idioms. |
| **code-reviewer** | Identifies the 6 anti-slop patterns. Gives calibrated feedback. Does not defend its own claims under challenge. |
| **test-engineer** | Writes tests alongside code. Reports real pass/fail, not optimistic coverage. Handles framework-specific patterns (vitest, jest, pytest). |
| **researcher** | Cites sources inline. Qualifies uncertainty. Revises claims when challenged with evidence. Does not peg confidence at a single value regardless of topic. |
| **orchestrator** | Produces clean structured routing decisions. Does not drift into free-form narrative. Honors output schema. |
| **chat / conversation** | Coherent multi-turn context handling. Does not fabricate factual claims. Adapts tone to user register. |
| **sdlc-lead** (planning) | Decomposition quality. Gate-honest (distinguishes "done" from "approximately done"). User-facing tone. |
| **security-auditor** | Zero-tolerance for fabrication — a missed vulnerability is a breach. Usually routes to the strongest available model. |

For each role, pick the model that passes the capability tests on your own representative fixtures, then put it in the routing config. Do not rely on leaderboard scores — benchmark your own workload.

---

## Anti-patterns to avoid

### "Primary model for everything"

Symptom: one model runs every role.
Problem: every model has role-specific blind spots.
Fix: explicit per-role routing with tested fallbacks.

### "Prompt fixes the model"

Symptom: a model fails a behavior test, so you add a system-prompt paragraph telling it to stop.
Problem: training-induced reflexes persist. Prompts nudge, not enforce.
Fix: pipeline-level detection + fallback routing.

### "Confidence score is a signal"

Symptom: surface the model's self-reported confidence to users or downstream gates.
Problem: many models peg confidence at a single value regardless of topic coverage; others cap themselves far below true accuracy.
Fix: score the OUTPUT, not the claim about the output. A response with verifiable citations beats a response with a high self-reported confidence.

### "Bigger model = better fit"

Symptom: route every role to the largest available model.
Problem: larger models can over-qualify, over-narrate, or over-hedge on tasks that need crisp commitments. Role fit is not monotonic in parameter count.
Fix: benchmark per role, then route.

### "Configuration preserves behavior"

Symptom: assume quantization, temperature, or system prompt changes are transparent.
Problem: each of those is a behavior change. Reflexes that were suppressed at one setting surface at another.
Fix: re-benchmark any time you change configuration.

### "Tool description IS the API contract"

Symptom: models call tools with fabricated parameters because the description had ambiguity.
Problem: any LLM will confabulate parameters if the tool schema allows it.
Fix: strict schemas, required-parameter enforcement, post-call verification that the tool actually did what was requested.

---

## Applicability across providers

Every principle above applies to local LLMs, to hosted frontier models, and to the APIs in between. Failure rates are lower on frontier-trained models but the failure MODES are identical.

| Failure mode | Where it appears |
|---|---|
| Phantom deliverables | Any model under structured delegation when verification is missing |
| Confidence inflation | Any model asked to self-assess without calibration anchors |
| Defend-heavy challenge response | Any model under adversarial probe without explicit revision permission |
| Synthesis loop collapse | Any model given tools without a cap-and-synthesize fallback |
| Scope creep despite "PRODUCE EXACTLY" | Any model when the delegation frame is weak |
| Anti-slop reflexes | Any model trained on public code corpora |

**Rule:** The same prompts, the same verifiers, the same tool schemas, and the same routing tables apply. Frontier models fail in the same ways as smaller ones, just less often. Design the pipeline to catch the remainder.

---

## Production gates to add

Reference implementations exist in this agent system or its siblings:

| Gate | Purpose |
|---|---|
| Completion manifest + cross-check | Detect phantom deliverables before the next specialist runs |
| Anti-slop audit checklist | Catch training-era defensive-programming reflexes at review time (see `references/anti-slop-audit.md`) |
| Calibration + evidence rules in research prompts | Force citation tags and honest confidence bounds |
| Tool-failure synthesis injection | Rescue tool loops that would otherwise return empty |
| `avoid_for_facts` routing flag | Refuse bluffer-class models from fact-extraction roles |
| `avoid_for_specialist` routing flag | Refuse phantom-class models from delegated execution roles |

---

## Reading list for new contributors

1. This document.
2. `references/anti-slop-audit.md` — the 6 specific code-quality anti-patterns.
3. `agents/coding-agent.md` §"Manifest Honesty" — how to produce trustworthy specialist output.
4. `agents/code-reviewer.md` — how to gate production merges.

Apply the principles here BEFORE picking a model. The cost of a wrong routing choice is a degraded or corrupted pipeline far from the source; the cost of re-running a targeted benchmark on a candidate is an hour.
