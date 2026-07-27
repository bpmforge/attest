# Field report — local-model evaluation, 2026-07-25/26

**Engagement:** benchmark `qwen/qwen3.5-9b` (4-bit) against `ternary-bonsai-27b-mlx`
(2-bit) across micro-benchmarks and then the real expert pipeline on a client brief.

**Artifacts:** `docs/BENCH_LOCAL_MODEL_COMPARISON.md`, `evals/realworld/tool-library/`,
`scripts/bench-{model-compare,mcp-grounding,realworld}.mjs`.

---

## 1. The finding that matters most

**Eight distinct faults were found. Every one made a model look WORSE than it was.
Not one ever made a model look better.**

That asymmetry is structural, not luck. Broken plumbing **fails closed** — no
output, no regex match, no permission, wrong agent, wrong directory, overwritten
results — and *failing closed is indistinguishable from "the model didn't do it."*

So the null result of any broken measurement is **"the local model is bad."** That
is the conclusion that ships, and it is the conclusion this system was at risk of
encoding into its own model-tier guidance.

| # | Fault | What it manufactured |
|---|---|---|
| 1 | `_FORCED_TOOL_LOGIT = 1e9` overflows fp16 → NaN → token 0 | "this model cannot tool-call at all" (was 0%, is 100%) |
| 2 | bare vs provider-qualified model id | "both models score 0/6" |
| 3 | tool counting from stdout (opencode writes tool lines to **stderr**) | "0 tool calls" on a run that made a verified 27-line fix |
| 4 | glyph set `[✱→]` missed `⚙` (MCP) | "neither model ever reaches for context7/web" — they made 8 calls |
| 5 | fixtures under `$TMPDIR` trip `external_directory` auto-reject | "the specialist produced nothing" — it was denied file access |
| 6 | `--agent <subagent>` silently falls back to default agent, exit 0 | "the model can't do requirements" — no specialist ran |
| 7 | link check scored `403` as dead | "4 fabricated citations" — 3 were real npm packages |
| 8 | results file overwritten instead of merged | an entire model's phase data silently lost |

**Rule:** when a local model looks bad, the prior should favour the harness.

## 2. N=1 is not a measurement

Two confident conclusions were drawn from single runs and **both reversed**:

- `cashbox-fix` flipped 6/6 → 0/6 for the *same model* across two N=1 runs. At N=5
  both models score 5/5. The sub-60s "failures" were early terminations, not
  reasoning failures.
- A single MCP-grounding run suggested tool round-trips *invert* the speed ranking.
  At N=3 it did not replicate.

Run-to-run variance exceeded the between-model difference in both cases.

## 3. Micro-benchmarks inverted the real ranking

| | 9B (4-bit) | 27B (2-bit) |
|---|---|---|
| raw generation | **~102 tok/s** | ~53 tok/s |
| MCP grounding suite, total | **316.6 s** | 433.3 s |
| **real pipeline, P2+P3** | 2176.7 s | **1080.8 s** |

The 9B is ~1.9× faster *per token* and ~2× slower *at the job*. Token throughput
was **anti-correlated** with wall-clock on real multi-phase work, because cost is
driven by tool round-trips, retries and output volume — not decode speed.

## 4. Volume is not rigor — and it survives review

Requirements phase, same brief:

| | 9B | 27B |
|---|---|---|
| SRS size | 23.9 KB | **9.1 KB** |
| ambiguity/conflict sections | 7 | **10** |
| **confabulated** (conflicts that do not exist) | **≥2** | 0 |

The 9B invented a Rule 1 ↔ Rule 10 "replenishment slot" conflict. The 27B produced
a third of the volume, more genuine findings, and independently flagged the £10
boundary question that a hidden acceptance test turns on.

**A reviewer skimming both would rate the 9B's SRS as more thorough.** Confabulated
analysis is longer, better formatted, and more confident than real analysis. Nothing
in the current process distinguishes them.

Neither model found the deliberately planted design flaw (a reservation expires in
3 days but cannot be collected while the tool is on loan, making the rule-5
reservation check near-dead logic).

## 5. Local-model runtime behaviours worth designing around

- **They construct documentation URLs from memory and fetch them.** 9 failed
  `WebFetch` calls on non-existent `nodejs.org` pages consumed most of a 13-minute
  research phase before the model fell back to search.
- **Availability ≠ use ≠ efficiency.** With ~80 tools exposed both models reached
  for context7/web unprompted and were 100% correct; they differed on economy
  (2 calls / 0 failures vs 3–5 calls / 1 failure).
- **2-bit quantization cost less than one engine constant did.** The 2-bit 27B beat
  the 4-bit 9B on every quality dimension measured, while a single fp16 overflow
  took tool calling from 0% to 100%.

---

## Process improvements → `IMPROVEMENT_BACKLOG.md` Group I

These are **process/design** changes, not prompt edits. A prompt edit would have
fixed none of the eight faults above.
