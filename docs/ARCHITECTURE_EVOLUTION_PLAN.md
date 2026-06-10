# Architecture Evolution Plan — claude-experts ↔ bpm-opencode-experts

**Date:** 2026-06-09
**Scope:** Both repos (`claude-experts`, `bpm-opencode-experts`) and the shared expert-agent architecture.
**Status:** Analysis complete; improvements proposed, not yet implemented.
**Companion docs:** `IMPROVEMENT_BACKLOG.md` (28 tracked content items — this plan does not duplicate them), `docs/SYSTEM_REVIEW_2026-06-01.md`.

---

## Part 1 — How the two systems are the same

The core is genuinely shared:

- **`agents/` trees are byte-identical** (all 36 agent files, all micro-agent clusters, all METHODOLOGY files) except two files — `HANDOFF_TEMPLATES.md` and `RALPH_WIGGUM_LOOP.md` — plus two OpenCode-only additions (`MODEL_ADAPTER.md`, `LOCAL_LLM_PRIMER.md`).
- **All 14 `references/` docs are identical.** All 43 validators are identical.
- **Same architecture in both:** skills as entry points → orchestrator agents → file-based HANDOFF delegation → gate scoring → checkpoint files on disk.

The file-based design is the right backbone for any-LLM portability: state lives on disk, not in one model's context. What differs is only the runtime shell:

| Layer | claude-experts | bpm-opencode-experts |
|---|---|---|
| Install target | `~/.claude/` | `~/.config/opencode/` |
| Automation | shell `hooks/` (9 scripts) | `plugins/expert-hooks.ts` (1 TS dispatcher) |
| Delegation | native Task tool | `tools/task.ts` subprocess OR manual HANDOFF paste |
| Tooling | native tools + MCPs | 18 custom `tools/*.ts` |
| Commands | skills only | skills + `commands/` dispatch files |
| Model adaptation | none (assumes Claude 200k) | `MODEL_ADAPTER.md` + `detect-model-context.sh` tiers |

---

## Part 2 — Confirmed defects (verified, with citations)

### D1. CRITICAL — claude-experts agents reference OpenCode paths
27 of 38 agent files (133 occurrences) instruct the model to read
`~/.config/opencode/agents/shared/...` (e.g. `claude-experts/agents/db-architect.md:14`),
but `claude-experts/install.sh` installs to `~/.claude/` and performs **no path rewriting**.
Every shared-protocol read fails on a Claude-only machine. It only works on a machine
where both systems are installed. This proves the "sync" was done by copying OpenCode
files into claude-experts wholesale.

### D2. Silent tier misdetection in the local-LLM layer
`scripts/detect-model-context.sh`:
- Infers context window by **regex on the model name** (`qwen|gemma → 32768`, line 97); never queries the server for the actual context length.
- If LM Studio is unreachable, **silently** writes `tier=small, context=32000` (lines 58–64) — a cloud-capable session gets crippled to 32k with no warning.
- Ollama is mentioned in docs but has zero detection support.
- Hardcoded, already-stale cloud defaults: `claude-sonnet-4-5` (line 27), `gemini-2.0-flash` (line 37), `gpt-4o` (line 47).
- Hardcoded `http://127.0.0.1:1234` default (line 54); pullmd hardcoded to `localhost:33000` (install.sh:529, 670).
- Provider selection is implicit env-var priority (Anthropic > Google > OpenAI > local) with no explicit override.

### D3. Tier thresholds duplicated across 4+ files
The 32k/60k/100k tier table lives independently in `detect-model-context.sh:111-114`,
`MODEL_ADAPTER.md:27/42/54`, `CONTEXT_BUDGET.md:22-26`, and `docs/LOCAL_LLM_GUIDE.md:32-42`.
Context numbers appear 60+ times across the repo. One model update = four edits; they will drift.

### D4. Protocol contradictions that bite small models
- **Quality-stop vs hard cap:** `LOOP_PREVENTION.md:109-152` (Class 3) says stop on quality, never arbitrary caps. `RALPH_WIGGUM_LOOP.md:128-147` mandates a hard 3-iteration cap. Neither defines what happens when a 32k model exhausts context mid-iteration-3.
- **Phase-3 synthesis overflow:** merging ~6 artifacts ≈ 18k input tokens. On a 32k model with ~8k agent instructions, ~5k remains for the synthesis itself — guaranteed truncation. `MODEL_ADAPTER.md:39` warns only about `security --deep`, not this.
- **JSON gate fragility:** gate scoring requires parsing validator JSON while `LOOP_PREVENTION.md:75` itself warns local models emit broken JSON. No plain-text fallback exists, so a Qwen/Gemma run can two-strike out of the loop on iteration 1.

### D5. Skill drift — true forks, not renames
Seven skill pairs (`git-expert`/`git`, `security-audit`/`security`, `db-architect`/`dba`,
`container-expert`/`containers`, `researcher`/`research`, `ux-expert`/`ux`,
`code-review`/`review-code`) differ in **both** trigger names and content —
claude-experts kept structured YAML args; opencode rewrote as narrative.
Five opencode skills (`design-options`, `explore`, `frontend`, `simplify`, `steward`)
have never been back-ported (since April 2026). claude-experts-only: `memory`.

### D6. Documentation/version skew
- Both READMEs claim 36–38 validators; actual count is 43 in both repos.
- claude-experts README: 25 skills claimed, 22 actual. opencode README: 24 claimed, 26 actual.
- opencode CHANGELOG has a 1.0.4 entry; claude-experts stops at 1.0.3 — agent *content* is synced (byte-identical) but version metadata is not.

### D7. No sync tooling
The dual-repo sync rule is purely manual. D1 proves manual sync produces corruption, not just lag.

---

## Part 3 — Architecture improvements (round 1)

### A. Single source of truth + build step ⭐ (kills the whole defect class)
One canonical repo of agent/skill/protocol source with:
- A path placeholder (`{{EXPERTS_HOME}}`) instead of literal install paths.
- A per-target manifest: skill-name mapping, frontmatter shape (Claude: `name/description/tools/model`; OpenCode: `mode/description`), which files each runtime receives.
- A small build script that emits the Claude Code target and the OpenCode target.

The 98%-identical agent trees prove the content is already shareable — only the shell differs. This permanently eliminates path-leakage (D1), version skew (D6), and skill drift (D5).

### B. Capability probing instead of name matching
- Query LM Studio `/api/v0/models` — it reports `max_context_length` per model. Use that first.
- Fall back to a user-editable `model-tiers.json`; name-regex only as last resort.
- Detection failure must be **loud** (`tier=unknown` → warn user), never a silent 32k default.
- Add Ollama (`localhost:11434/api/tags`); make server endpoints config values.

### C. One canonical tier table
A single `model-tiers.json` read by the detection script and referenced as the
authority by `MODEL_ADAPTER.md` / `CONTEXT_BUDGET.md` (or those sections generated from it).

### D. Protocol precedence + tier gates
- State explicitly: CONTEXT_BUDGET overrides Ralph Wiggum iteration counts. Budget-forced stop mid-iteration → write gap list to disk, emit escalation block early.
- Tier-gate heavy steps: phase-3 multi-file synthesis and any 5+ file merge require `tier>=medium`, or auto-decompose into pairwise merges on `tier=small`.

### E. Dual-format validator output
Every validator emits a plain-text gap list alongside JSON. Protocol rule: if JSON
parse fails, read the text list. Single change that makes gate scoring survivable on local models.

### F. HANDOFF as universal primitive with pluggable executors
The handoff document format is already runtime-neutral — formalize it. Executors:
- Claude Code → Task tool runs it automatically.
- OpenCode + capable model → `tools/task.ts` subprocess.
- Small local model → manual copy-paste.
Same artifact, three execution strategies, declared in one place — replacing the
contradictory "task() is banned" / "task() exists" statements in forked protocol files.

---

## Part 4 — LLM-native process design (round 2)

**Premise:** a frontier LLM gets its reliability from a handful of mechanisms —
massive compressed knowledge, retrieval grounding, chain-of-thought, verifier-guided
training, sampling tricks, bounded working memory with external storage. Every one of
those mechanisms has a **process analog** that can be implemented with files, scripts,
and orchestration — letting a 32k local model approximate behaviors it cannot do
natively. The expert system already does some of this by accident (HANDOFFs ≈
externalized chain-of-thought). Do it on purpose:

### 4.1 Externalized chain-of-thought → Task DAG runner
**How frontier models work:** long internal reasoning chains; each step conditions the next.
Small models can't sustain long chains — they lose the plot mid-stream.

**Process analog:** never ask a small model to hold a plan. A deterministic **runner
script** (bash/TS) walks an explicit task DAG; the model only does leaf work.

- A planning pass emits `docs/work/plan.json`: nodes with `{id, agent, inputs[], output, depends_on[], max_tokens_est}`. Planning is a *small structured output* — feasible even on small models, or done once by a cloud model.
- The runner (`scripts/run-plan.sh`) walks the DAG: for each ready node, spawn `opencode run --agent <x>` (or emit a manual HANDOFF on tier=small), check the output artifact exists + passes its validator, mark done in `plan-journal.json`, continue.
- **Deterministic control flow, probabilistic leaf work.** The model never orchestrates; the script does. Resume = re-run the runner; completed nodes skip (journal). This is exactly how modern agent harnesses (and this analysis itself) get reliability.

This supersedes "the orchestrator agent must remember where it is" — the single
biggest failure mode for local models running multi-phase SDLC.

### 4.2 Knowledge cutoff → freshness gates ("never answer from weights what you can look up")
**How frontier models work:** pretraining compresses knowledge, but it's frozen at a
cutoff; agentic training teaches retrieval-before-assertion.

**Process analog:** make retrieval a *gate*, not a suggestion.

- A **perishable-knowledge registry** (`references/FRESHNESS.json`): each entry = file + TTL + refresh command. Examples: semgrep rules (30d, `update-semgrep-rules.sh` — already exists, generalize it), model tier table (30d, probe script), OWASP version pins (90d), library API notes (per-project, Context7).
- Session-start hook checks TTLs and warns: "model-tiers.json is 47 days stale — run `scripts/refresh.sh model-tiers`."
- Hard gate in coding agents (extends the existing pre-code-check): any artifact that names a library version, API signature, or model ID must cite a retrieval performed *this session* (Context7 lookup, registry query, `/v1/models` probe, web search). Validators reject artifacts whose claims have no retrieval citation.

### 4.3 In-context learning → exemplar library
**How frontier models work:** few-shot examples in context outperform instructions alone;
the effect is *much* stronger for small models.

**Process analog:** an `exemplars/` directory with one gold-standard instance of every
artifact type (ERD, sequence diagram, OWASP finding, completion manifest, ADR, gap
report). Every HANDOFF packet embeds or links exactly one matching exemplar
("produce output shaped like this"). Cheap to build: harvest the best past outputs.
Maintain like code — when a better one is produced, replace it. For small models this
is worth more than any added prose instruction; the instructions can actually
*shrink* (saving instruction-budget tokens) because the exemplar carries the format.

### 4.4 Verifier-guided training (RLHF) → generator/verifier split, everywhere
**How frontier models work:** trained against reward models/verifiers; generation and
judgment are separate capabilities, and judging is easier than generating.

**Process analog (extends existing gate scoring + challenger):**
- **Every** artifact gets a verification pass by a *fresh session* (fresh context = no self-justification bias) against a named rubric (ANTI_SLOP_RULES, FINDING_SCHEMA, phase checklist).
- **Asymmetric model assignment:** because verifying is cheaper than generating, run cheap local models as verifiers of cloud output (free tokens, catches slop) and a cloud model as the verifier of local output (catches incompetence). The current system only verifies in one direction.
- **Best-of-N for high-stakes artifacts:** on local models tokens are free — generate 3 candidates of the ARCHITECTURE.md decision section, have one verifier pick/merge the winner. This is rejection sampling, run as a process.

### 4.5 Bounded attention → explicit memory hierarchy with a carried state summary
**How frontier models work:** the context window is working memory; everything else
must be re-retrieved. Long-running frontier sessions survive via context compaction —
a rolling summary replaces raw history.

**Process analog:** formalize the storage tiers and the compaction step:

| Tier | Analog | Implementation |
|---|---|---|
| Context window | registers/working memory | CONTEXT_BUDGET ledger (exists) |
| `docs/work/` checkpoints | RAM | exists, ad hoc |
| memory MCP / fact store | disk | exists, underused (backlog A3) |
| Web/Context7/registries | network | freshness gates (4.2) |

The missing piece: a **`STATE.md` ≤500 tokens**, rewritten at every phase boundary,
that is the *only* thing carried between sessions — current phase, decisions made
(one line each), open gaps, next node id. Like recurrent state / compaction: each
session reads STATE.md + its one task packet, never the full history. Today, resuming
relies on `session_restore()` plus prose checkpoints of unbounded size; on 32k models
that's the difference between working and not.

### 4.6 Self-consistency sampling → vote on decisions, not artifacts
**How frontier models work:** sample multiple reasoning paths, majority-vote the answer —
large reliability gains at pure compute cost.

**Process analog:** for *decisions* (tech stack choice, severity rating, go/no-go
gates) on local models, run the same focused question 3 times in fresh sessions and
take the majority. Local tokens are free; this converts unreliable single-shot
judgment into reliable judgment. Don't do this for long artifacts (merging is harder
than regenerating) — only for short, comparable outputs. Add to GATE_SCORING_PROTOCOL
as a tier=small option.

### 4.7 Curriculum + cascades → difficulty-routed escalation ladder
**How frontier models work:** curriculum learning trains easy→hard; inference systems
use cascades (cheap model first, escalate on low confidence — same idea as
speculative decoding: small model drafts, big model verifies/repairs).

**Process analog:**
- A 10-line **task triage** step classifies each DAG node: `trivial | standard | hard`. Trivial (rename, changelog entry, format fix) → small local model. Standard → medium local. Hard (cross-file synthesis, security judgment, novel design) → cloud.
- **Escalation ladder:** local attempt → verifier fails it twice → automatically re-emit the same HANDOFF tagged for the next tier up. The HANDOFF format makes this trivial — same packet, different executor.
- **Draft-then-repair:** for big artifacts, have the local model produce the full draft and the cloud model do one repair pass. Cloud cost drops ~80% vs cloud-from-scratch, quality lands near cloud-native. This should be the *default* hybrid mode, not an option.

### 4.8 Grounded generation → citation-density validator
**How frontier models work:** agentic training rewards claims grounded in observations
(tool results), penalizes assertions from priors.

**Process analog:** an "observation before assertion" rule with teeth — artifacts
that describe a codebase (LANDSCAPE, entry-points, HEALTH_ASSESSMENT, findings) must
cite `file:line` for every claim; a validator greps citation density (claims vs
citations ratio) and rejects below threshold. The security FINDING_SCHEMA already
requires this; extend it to all onboard/review artifacts. This is the single
strongest anti-hallucination lever for small models.

### 4.9 Distillation → playbook distillation loop
**How frontier models work:** big models teach small models; experience is compressed
into weights.

**Process analog:** compress experience into *protocol files* instead:
- Cloud model writes plans, rubrics, and exemplars once; local models execute narrow steps against them.
- Periodically (per release), a cloud session reviews a sample of local outputs vs verifier verdicts, and **updates the rubrics/exemplars/agent prompts** — institutional learning accumulates in the repo. The steward skill is the natural host for this loop.
- This is what training does for weights; do it for the prompt corpus. Over time the system's effective capability rises without changing models.

### 4.10 Constrained decoding → schema enforcement at the API layer
**How frontier models work:** structured-output features constrain sampling to a grammar —
JSON validity is enforced by the decoder, not by politeness.

**Process analog:** stop asking local models to "respond in JSON" in prose. LM Studio
and Ollama both support JSON-schema-constrained output via the API (`response_format`
/ structured output). Wire `tools/task.ts` and the validators' consumers to pass the
schema and let the runtime guarantee validity. This *eliminates* the Class-2
schema-loop failure mode (D4) rather than mitigating it. Pair with E (dual-format
output) as the fallback for runtimes lacking schema support.

### 4.11 Eval-driven development → a golden-task suite for the system itself
**How frontier models work:** capability is measured by benchmarks; regressions are
caught by evals, not vibes.

**Process analog:** 3–5 tiny fixture repos (a flask API with a known SQLi, a TS
service with a known N+1, a repo with known architecture) + expected-artifact
assertions ("onboard must find both entry points; security --quick must find the
SQLi"). `scripts/run-evals.sh` executes the pipeline against fixtures per release,
per model tier. Today a protocol edit's effect on output quality is unknowable;
this makes it measurable — including answering "is qwen3.6 good enough for phase-2?"
with data instead of opinion.

### 4.12 Telemetry → tune budgets with data, not guesses
Log per-HANDOFF actuals (model, tier, tokens in/out, verifier verdict, retries) to
`docs/work/telemetry.jsonl` via the plugin hook. After a few weeks the tier tables,
`max_tokens_est` in plans, and the escalation thresholds get set from observed
distributions instead of hand-waved round numbers. (This mirrors how serving systems
tune themselves.)

---

## Part 5 — Priority order

| # | Item | Why first | Effort |
|---|---|---|---|
| 1 | D1 fix: path rewrite in claude-experts install.sh (tactical) | system is broken on Claude-only installs today | S |
| 2 | A: single-source build step | removes the defect class; prerequisite for everything staying fixed | M |
| 3 | B + C: capability probing + canonical tier table | local-model reliability floor | S–M |
| 4 | 4.10 + E: schema-constrained output + text fallback | kills the JSON failure mode | S |
| 5 | 4.1: DAG runner | biggest reliability jump for multi-phase work on local models | M–L |
| 6 | 4.5: STATE.md compaction + 4.3 exemplar library | cheap, immediate small-model gains | S |
| 7 | 4.7: triage + escalation ladder + draft-then-repair default | cost/quality optimum for hybrid cloud/local | M |
| 8 | D + D4 fixes: protocol precedence, tier gates | resolves contradictions | S |
| 9 | 4.4 / 4.6 / 4.8: bidirectional verify, decision voting, citation validator | quality hardening | M |
| 10 | 4.2: freshness registry | keeps knowledge current | S–M |
| 11 | 4.9 + 4.11 + 4.12: distillation loop, eval suite, telemetry | compounding long-term improvement | M–L |
| 12 | D5/D6: skill back-ports + README counts (fold into #2's manifest) | hygiene | S |

**Guiding rule for all of it:** anything environment-specific (paths, model names,
context sizes, endpoints) lives in exactly one probed/generated config file; every
`.md` the model reads references the config, never a literal. Deterministic scripts
own control flow; models own only leaf inferences; every inference is grounded
(retrieval or citation), exemplified (one gold sample), bounded (explicit budget),
and verified (fresh-session check against a named rubric). That is, mechanically,
what a frontier model does internally — implemented as process.
