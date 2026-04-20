# LLM Routing Principles

**Audience:** agent system designers, humans picking models for specific workloads, reviewers evaluating routing decisions.
**Scope:** applies to local LLMs (LM Studio, Ollama) AND frontier online models (Claude, GPT, Gemini-API). The failure modes are the same — only the frequency and severity change.

This document is the consolidated lesson from the 2026-04-19 llm-benchmark program (5 runs across 7 models on 2 servers) plus observed behavior on Claude Opus and GPT in production agents. Read this before:
- Adding a new model to a routing config
- Designing a new specialist agent
- Wiring an LLM into a production pipeline
- Reviewing code that depends on an LLM's output being truthful or structurally correct

---

## The 7 Principles

### 1. Models do what they are trained to, and prompts do not override that

Observation: DONT_KNOW_PERMISSION, CONFIDENCE_CALIBRATION, and MANIFEST_HONESTY_CHECK were all deployed in the iterative system prompt. Gemma-4 still returned confidence 1.0 on every question, with zero gaps identified, across every V-run. Qwen3-Coder-30B still wrote phantom manifests. Nemotron-Super still fabricated bt-2 deliverables.

Online analog: Claude and GPT also have training-induced reflexes that prompts do not override — Claude's caveat-heavy hedging on factual claims, GPT's tendency to narrate its reasoning even when told not to. You can mitigate, not erase.

**Rule:** If a model demonstrably does X despite prompt guidance, assume it will do X in production. Route around it, or audit the output.

### 2. Architecture does the lifting, prompts support it

Three fixes moved real numbers in the benchmark; none were prompt-only:
- **Synthesis injection** (force a no-tool call after N rounds): took Context7 from 4/10 to 10/10 across every model
- **Manifest cross-check** (code-side detection of phantom deliverables): caught every phantom that the prompt failed to prevent
- **Structured delegation** ("PRODUCE EXACTLY these files"): eliminated scope creep across all models

**Rule:** If a behavior matters for safety or correctness, encode it in the pipeline (parser, verifier, gate), not just in the system prompt. Apply to online models too — Claude Code's hooks, OpenAI's structured output, tool schemas.

### 3. Quantization is a regularizer, not just a speed knob

Nemotron-Cascade-2 30B @4bit: zero coding anti-slop violations on a 6-file project.
Same model @8bit: six violations (try-catch×3, single-use-helpers×3).
Same weights, same prompts, same tasks. Higher precision surfaced more "defensive programming" reflexes the lower-precision version couldn't afford to express.

**Rule:** 4-bit is the right default for most production workloads unless a specific task demands higher precision. Test per-model — Qwen3.6 is quant-invariant; NC2 is not.

Applies to online models via temperature: a temp=0.0 Claude call is a different behavior than temp=0.7. Pick the lowest temperature that produces coherent output for your task.

### 4. Specialist ≠ Researcher. Never assume skill transfer across roles

Qwen3-Coder-Next 80B on .48: best researcher in the fleet (3 DEFEND / 4 QUALIFY / 2 REVISE — the most balanced calibration signal). Also the second-worst coding-agent: 9 anti-slop violations, phantom-manifest reflex on bt-2.

Same weights, opposite verdicts, depending on role.

**Rule:** Benchmark per role. A model that excels at one job will surprise you at the next. This includes online models — Claude Opus is a great researcher and a decent coder, but its code-review critiques skew wordy; GPT-4 variants differ by route. Route based on the role's specific test.

### 5. Test the loop, not the response

One-shot evaluations missed:
- **Phantom manifests** — only visible under structured delegation over multiple rounds
- **Confidence inflation** — only visible across iterations (Gemma stays at 1.0 forever unless you probe)
- **DEFEND bias** — only visible under adversarial challenge
- **Synthesis collapse** — only visible when tool loops hit a cap

**Rule:** Every production behavior you depend on needs a dedicated scenario. Writing prose well does not imply writing structured output well does not imply honest self-assessment does not imply graceful failure recovery. Each is a distinct capability test.

### 6. Honesty-penalty beats honesty-prompt

The prompt told three model families not to write phantom manifests. They did anyway. The code-side `-5` honesty penalty caught every instance and dropped their score from 11/15 to 6/15, surfacing the failure to the orchestrator.

**Rule:** For any behavior where fabrication is possible, build detection. Prompt the right behavior, but code the detection of the wrong behavior. This is the core pattern behind `lib/completionManifest.js::crossCheckManifest` and `references/anti-slop-audit.md` — both are detection, not prevention.

Applies to online models: Claude CAN hallucinate tool results, file paths, or API signatures. Verify what the agent claims to have done — `ls`, `grep`, `git diff` — don't trust the narration.

### 7. Vision changes the routing equation

Qwen3.6 35B vision pass rates: 8-10/10 across UI screenshots, form extraction, chart reading, architecture diagrams. No degradation across @4bit and @8bit.

**Rule:** If a task's input is visual (screenshot, diagram, PDF page), routing to a vision-capable model is free at the architecture level. Add a tool that encodes images as `image_url` payloads and gate it on `model.vision === true`. Applies to Claude (native vision) and GPT-4o (native vision) equally.

---

## Role → Model Routing Matrix

Matrix assumes a mixed fleet. Swap in your own candidates — the ROLE requirements are what matter.

| Role | Requires | Local recommendation | Online fallback | Avoid |
|---|---|---|---|---|
| **coding-agent** | Structural delegation, honest manifest, no slop, follows patterns | Qwen3.6 35B or NC2 30B @4bit | Claude Opus | Any model with phantom-reflex or training-era slop (Qwen3-Coder family) |
| **code-reviewer** | Calibrated critique, catches 6-rule slop, not wordy | Qwen3.6 35B or NC2 30B @4bit | Claude Sonnet | Models that defend their own claims under challenge |
| **test-engineer** | Writes tests alongside code, full coverage | Qwen3.6 35B | Claude Opus | Models that confuse "tests exist" with "tests pass" |
| **researcher** | Real calibration (QUALIFY/REVISE present), citations, gap-honest | Qwen3-Coder-Next 80B or NC2 30B | Claude Opus | Models that confidence-peg at 1.0 (Gemma) |
| **orchestrator** | Structured routing decisions, clean JSON output, no drift | Qwen3.6 35B or NC2 30B @4bit | Claude Sonnet | Narrative-heavy models |
| **chat / conversation** | Coherence, tone, doesn't fabricate facts | NC2 30B | Claude Sonnet | Models that bluff factual claims |
| **sdlc-lead** (planning) | Decomposition quality, gate-honesty, user-facing | NC2 30B (fast) | Claude Sonnet | — |
| **security-auditor** | Zero-tolerance for fabrication (missed CVE = breach) | none | Claude Opus | ALL local models — the cost of a miss is too high |

---

## Anti-patterns to avoid

### "Primary model for everything"
Symptom: you pick one model and run all roles through it.
Problem: the model has blind spots by role (see Qwen3-Coder-Next).
Fix: routing table, per-role selection, fallback chain.

### "Prompt fixes the model"
Symptom: a model fails a behavior test, so you add a system-prompt paragraph telling it to stop.
Problem: the training-induced reflex persists. Prompts nudge, not enforce.
Fix: pipeline-level detection + fallback routing.

### "Confidence score is a signal"
Symptom: you surface the model's self-reported confidence to users or downstream gates.
Problem: several models peg at 1.0 regardless of actual coverage. Others never exceed 0.85 even when fully correct.
Fix: score the OUTPUT, not the claim about the output. A response with citations beats a response with `confidence: 0.95`.

### "Bigger model = better routing"
Symptom: you route researcher to the 120B because "more parameters."
Problem: Nemotron-Super 120B qualifies everything and misses the direct answer. NC2 30B @4bit outperforms it on calibration.
Fix: role benchmark, then route.

### "Same model, same behavior"
Symptom: you assume a quantization change or prompt tweak preserves behavior.
Problem: NC2 @8bit writes defensive try-catch everywhere; @4bit doesn't. Same weights, different regularization pressure.
Fix: re-benchmark any time you change temperature, quantization, system prompt, or tool schema.

### "Tool description IS the API"
Symptom: models call a tool with made-up parameters because the description was ambiguous.
Problem: any local model AND Claude/GPT will confabulate parameters if the tool schema has holes. Observed 8-round search loops where the model never called the expected fetch_page because search-result handoff was unclear.
Fix: strict schemas, required-parameter enforcement, verify tool calls succeeded before continuing.

---

## Applicability to online models

Every principle above applies to Claude Opus, Claude Sonnet, GPT-5, GPT-5-mini, Gemini 2.5, Grok 4. The failure rates are lower (frontier training, more alignment work) but the failure MODES are identical:

| Failure mode | Local observation | Online analog |
|---|---|---|
| Phantom manifests | 3 of 7 model families | Rare, but Claude has been seen to claim file-writes it didn't actually perform when tool failures were silent |
| Confidence inflation | Gemma at 1.0 always | Claude hedges so much it can't commit; GPT often states things with more confidence than warranted |
| DEFEND-heavy challenge response | Gemma 9/0/0 | Claude will qualify; GPT will sometimes defend unless explicitly challenged |
| Synthesis loop collapse | Models hit MAX_ROUNDS | Claude Code has seen tool loops that need external stop conditions |
| Scope creep despite "PRODUCE EXACTLY" | 0 in V5 — prompt discipline works | Claude sometimes adds "you might also want" suggestions |
| Anti-slop reflexes | Qwen3-Coder family | Claude occasionally wraps try-catch on happy-path code |

**Rule:** The same prompts, the same verifiers, the same tool schemas, and the same routing tables apply. Assume Claude fails in the same ways as Gemma, just 1/100 as often. Design the pipeline to catch that 1%.

---

## Production gates to add (reference implementations)

| Gate | Source | Why |
|---|---|---|
| Manifest cross-check | `ai-assistant-agent/src/services/manifest-verifier.ts` | Detects phantom deliverables before the next specialist runs |
| Anti-slop audit | `references/anti-slop-audit.md` (this repo) | Catches training-era defensive-programming reflexes at review time |
| Calibration + evidence rules in research prompts | `ai-assistant-agent/src/agents/research-prompt-rules.ts` | Forces citation tags and honest confidence bounds |
| Tool-failure synthesis injection | `llm-benchmark/lib/toolFailureRunner.js::forceSynthesis` | Rescues tool loops that would otherwise return empty |
| `avoid_for_facts` flag | `llm-benchmark/lib/productionRecommendations.js` | Routing refuses bluffer-class models from fact-extraction roles |
| `avoid_for_specialist` flag | same | Routing refuses phantom-class models from delegated execution roles |

---

## Reading list for new contributors

1. This document.
2. `references/anti-slop-audit.md` — the 6 specific code-quality anti-patterns.
3. `agents/coding-agent.md` §"Manifest Honesty" — how to produce trustworthy specialist output.
4. `agents/code-reviewer.md` — how to gate production merges.
5. The llm-benchmark repo scenarios — each named after a specific failure mode observed in production agents.

Apply the principles here BEFORE picking a model. The cost of a wrong routing choice is a degraded or corrupted pipeline far from the source; the cost of re-running the benchmark on a new candidate is an hour.
