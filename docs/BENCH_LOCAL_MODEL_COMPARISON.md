# Local model head-to-head — design & results

**Question:** at a fixed memory budget, is it better to run *more parameters at
lower precision* or *fewer parameters at higher precision*?

**Contenders** (deliberately memory-matched, same box, same runtime):

| | `qwen/qwen3.5-9b` | `ternary-bonsai-27b-mlx` |
|---|---|---|
| params | 9B dense | 27B |
| quant | 4-bit (MLX) | 2-bit ternary (MLX) |
| weights on disk | 5.7 GB | 8.1 GB |
| arch | `Qwen3_5ForConditionalGeneration` | `Qwen3_5ForConditionalGeneration` |

Same architecture family and same tokenizer lineage, so the comparison isolates
**params × precision** rather than confounding it with a template or arch change.

Harness: `scripts/bench-model-compare.mjs`. Raw data:
`docs/work/BENCH_MODEL_COMPARE.json`.

---

## Why these axes

A local model earns a slot in this system only if it clears three independent
bars. A model can ace any one of them and still be useless:

| Axis | Bar | Why it is separate |
|---|---|---|
| **Speed** | finishes a phase before you lose the thread | a 27B that is 2× slower needs to be meaningfully better to be worth it |
| **Tool calling** | drives tools without derailing | this is a *trained skill, not a scale effect* — see below |
| **Output quality** | produces work worth reading | accuracy, detail, level of work |
| **Memory** | leaves room to be co-resident | weights are static; KV cache is not |

The tool-calling axis is separated from quality on the explicit authority of
`docs/bridging-the-frontier-gap/03-local-model-and-runtime-playbook.md`:

> Param count is a poor predictor of tool-calling skill. Docker's 21-model
> evaluation: **Qwen3-8B = 0.933 F1; Llama-3.3-70B = 0.607.**

If tool calling scaled with size, one axis would do. It does not, so it gets its own.

---

## Design

### Tier A — speed (direct API, no agent scaffold)

Streamed against LM Studio, measuring **TTFT** and **generation tok/s** at three
prompt sizes (20 / 1223 / 6023 prompt tokens). No agent scaffold, so this
measures the model rather than our prompts. Median of N repeats.

Three sizes because prefill and decode scale differently: a slower-generating
model can still win wall-clock if it needs fewer tokens to get there, and
long-context prefill is where the two diverge most.

### Tier B — tool calling (direct API)

Six scenarios × N repeats, scoring **tool selection** and **argument
extraction separately** — "right tool, mangled args" is a different defect with a
different fix than "ungrammatical garbage". Outcomes are typed:
`PASS / WRONG_TOOL / WRONG_ARGS / BAD_JSON / NO_CALL / SPURIOUS_CALL / HARD_FAIL`.

Scenarios: single obvious call; select among 4 similar tools; numeric + enum
argument extraction; exact-path extraction; chaining off a prior tool *result*;
and a **negative control** where answering from knowledge is correct and any tool
call is a defect. Over-calling is a real failure mode that an all-positive
battery hides completely.

### Tier C — agentic quality (via `opencode run`)

Run against `evals/fixtures/` repos that carry **planted defects**, so accuracy
is ground-truthed rather than vibed:

| Task | Fixture | Objective ground truth |
|---|---|---|
| `cashbox-fix` | `lemonade-cashbox` | 6 failing tests → does `node --test` go green? |
| `security-audit` | `flask-sqli` | are the planted SQLi **and** hardcoded key both reported? |

Wall-clock and **tool-invocation count** are recorded per run — the latter
separates "did real work" from "produced confident prose". Detail and
level-of-work are then scored from a **blind packet**
(`docs/work/BENCH_BLIND_PACKET.md`) with models anonymized as A/B, so rubric
scoring is not anchored by knowing which model produced which transcript.

### Grading rubric (fixed BEFORE results were seen)

Objective score comes from the fixture (tests green / defects found). The three
subjective dimensions the brief calls for are scored 1–5 against these anchors,
from the blind packet. Anchors are written down in advance so scoring is not
retrofitted to whichever model happened to win.

**Accuracy** — is what it says *true*?
- 1 confidently wrong; claims fixes/findings that are not there
- 3 broadly right with at least one material error or unverified claim
- 5 every claim checks out against the code; no invention

**Detail** — is there enough to act on?
- 1 bare assertion ("fixed the bug", "found issues")
- 3 names files/symbols but leaves the reader to re-derive the reasoning
- 5 file + line + mechanism + why it matters, specific enough to review without rereading the source

**Level of work** — how much of the job did it actually do?
- 1 narrated intent, changed nothing (tool_invocations ≈ 0)
- 3 did part of the task, or did it and stopped short of verifying
- 5 drove the task to a verified end state and checked its own work

**Anti-gaming note:** length is not detail and confidence is not accuracy. A long
report that restates the prompt scores 1 on detail. This matters more than usual
for 2-bit models, which tend to stay fluent while losing grounding — fluency is
exactly the failure mode a rubric like this has to resist.

### Memory

`weights_mb` (static, from `lms ps`) and **`peak_rss_mb` sampled during
generation** — weights plus KV cache. The second is the number that decides
whether two models can be co-resident. Sampling only attributes cleanly with one
model loaded, so the harness unloads everything else first (`soloLoad`).

---

## Validity rules

Inherited from `evals/README.md`, plus two learned here:

1. **A harness fault is not a model score.** A run that exits in <5s having
   invoked no tools is reported as `INVOCATION_ERROR`, never as 0. This was not
   theoretical: the first tier-C run scored both models 0/6 in ~1s because
   `opencode run -m` needs a **provider-qualified** id (`lmstudio/<model>`) while
   the LM Studio API takes the bare id. Two namespaces, same model. Without this
   guard the report would have confidently stated both models failed every task.
2. **Timeouts are not failures.** `TIMEOUT` is a distinct outcome and never folds
   into a pass rate.
3. **One model loaded at a time**, or RSS attribution is meaningless.
4. **`temperature: 0`** throughout, so differences are the model, not sampling.

---

## Reproduce

```bash
# fast axes
node scripts/bench-model-compare.mjs \
  --models qwen/qwen3.5-9b,ternary-bonsai-27b-mlx --tier A,B --repeats 3

# agentic tier (slow; --keep retains the worktrees for inspection)
node scripts/bench-model-compare.mjs \
  --models qwen/qwen3.5-9b,ternary-bonsai-27b-mlx --tier C --keep
```

Both models must be registered in `~/.config/opencode/opencode.json` under the
`lmstudio` provider for tier C to resolve.

---

## Results

Run 2026-07-25, M5 Max / 128 GB, macOS 26.5.2, LM Studio 0.4.20+1.
Both models required the fp16 tool-grammar patch (issue
[lmstudio-bug-tracker#2207](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/2207));
Bonsai is F16-scaled and could not tool-call at all before it.

### Speed & memory (tier A, N=3, temperature 0)

| | qwen3.5-9b (4-bit) | ternary-bonsai-27b (2-bit) |
|---|---|---|
| weights resident | **5 700 MB** | 8 126 MB |
| idle RSS | **7 010 MB** | 9 054 MB |
| peak RSS @6k ctx | **7 135 MB** | 9 845 MB |
| KV growth short→long | **+110 MB** | +775 MB |
| generation | **~101–104 tok/s** | ~53–58 tok/s |
| TTFT @6k (warm) | **204 ms** | 475 ms |
| TTFT @6k (cold) | **~1 658 ms** | ~6 596 ms |

> **TTFT caveat:** repeats reuse an identical prompt, so medians after the first
> run hit the KV cache and understate cold latency. Cold figures are from the
> first-touch N=2 pass and are the ones to trust for "open a new session".
> Generation tok/s is decode-bound and unaffected.

The 9B is ~1.9× faster per token, ~2 GB lighter, and its KV cache grows **7×
more slowly** — the last number is what decides co-residency with other models.

### Tool calling (tier B, N=3 × 6 scenarios)

**18/18 both.** Tool selection, numeric+enum argument extraction, exact-path
extraction, selection among 4 similar tools, chaining off a prior tool result,
and the negative control (no spurious call) — all clean, both models.

Param count did not predict tool-calling skill here, consistent with
`03-local-model-and-runtime-playbook.md`. What *did* predict it was the runtime:
before the fp16 patch, Bonsai scored 0.

### Agentic quality (tier C)

**`cashbox-fix` — fix 6 failing tests (N=5, bare/default agent):**

| | pass rate | median wall-clock |
|---|---|---|
| qwen3.5-9b | **5/5** | 166.0 s |
| ternary-bonsai-27b | **5/5** | **129.6 s** |

Neither model touched the test file. Accuracy does not discriminate — but the
27B finishes **~22% faster end-to-end while generating at half the token rate**,
because it needs fewer tokens to get there. tok/s alone ranks these backwards.

**`security-audit` — recall of 2 planted defects (N=3, `security-auditor` specialist):**

| | produced a report | both defects found | median wall-clock | report size |
|---|---|---|---|---|
| qwen3.5-9b | 2/3 | 2/2 when it reported | **287 s** | 2.4–4.6 KB |
| ternary-bonsai-27b | **3/3** | **2/2 every run** | 543 s | 5.7–9.9 KB |

### Rubric scores (blind-graded, anchors fixed in advance)

| | accuracy | detail | level of work |
|---|---|---|---|
| qwen3.5-9b | **3** | 3.5 | 3 |
| ternary-bonsai-27b | **4.5** | **5** | **4.5** |

- **Accuracy — 9B loses on a real defect, not on style.** One run recommended
  `WHERE locker = %s`; this fixture is **sqlite3** (line 34 uses `?`), so the
  suggested fix does not work. The 27B used `?` in all three runs. Offsetting
  the 27B: one report double-counts line 26 as two separate findings.
- **Detail — the 27B's extra volume is earned, not padding.** It reported
  no-auth on the `/release` POST, missing input validation, absent error
  handling, and no HTTPS enforcement. All verified real against the 40-line
  fixture; no invented line numbers. It also produced **attack-chain analysis**
  linking findings into exploit paths.
- **Level of work — 9B failed to produce a report in 1 of 3 runs.**

### Verdict

Neither dominates; the split is clean and depends on the job:

- **Interactive / latency-sensitive / co-resident with other models → the 9B.**
  2 GB lighter, 7× slower KV growth, 8× faster cold TTFT.
- **Unattended analysis where the artifact is read later → the 27B-at-2-bit.**
  More complete recall, correct remediations, attack chains, and it never failed
  to produce output. It costs ~1.9× the wall-clock on analysis work — but is
  *faster* end-to-end on bounded code-fixing.

**2-bit did not destroy quality.** The aggressively-quantized 27B beat the 4-bit
9B on every quality dimension measured. On this evidence, at a fixed memory
budget, more parameters at lower precision was the better trade for analysis
work — the opposite of the intuition that 2-bit is too lossy to be useful.

### Measurement notes (read before trusting any of this)

Four harness faults were caught, each of which had already produced a confident
wrong result before it was found:

1. **`opencode run` needs a provider-qualified id** (`lmstudio/<model>`) while
   the LM Studio API takes the bare id → both models scored 0/6 in ~1 s.
2. **Tool-progress lines go to stderr**, not stdout → `tool_invocations` read 0
   on a run that made a verified 27-line fix.
3. **Fixtures under `$TMPDIR` trip opencode's `external_directory` auto-reject**
   → specialist agents could not read their own working tree; scored as
   "model produced nothing".
4. **N=1 is not a measurement.** `cashbox-fix` flipped 6/6 → 0/6 for the *same
   model* across two single-sample runs (model pinning verified via session
   receipt). At N=5 both models score 5/5. The two sub-60 s "failures" were early
   terminations, not reasoning failures.

Every one of these would have read as "the local model is bad at X". On this
stack, suspect the harness before the model.
