# Eval Suite — golden tasks for the expert system itself

Capability is measured by benchmarks; regressions are caught by evals, not
vibes (ARCHITECTURE_EVOLUTION_PLAN.md §4.11). Each fixture is a tiny repo with
PLANTED defects and a known architecture; the suite asserts the pipeline finds
what it is supposed to find. A protocol edit's effect on output quality is now
measurable — including "is model X good enough for this phase?" with data.

## Run it

```bash
npm run evals                 # deterministic mode — scanners only, no LLM, CI-able
node scripts/run-evals.mjs --agent            # + drive real agents via `opencode run`
node scripts/run-evals.mjs --fixture ts-dead-dup --agent --keep
EVAL_AGENT_TIMEOUT_MS=1200000 node scripts/run-evals.mjs --agent   # slow local tiers
```

Results land in `docs/work/EVAL_RESULTS.json`, stamped with the model tier from
`docs/work/.model-context` (run `scripts/detect-model-context.sh` first to make
per-tier comparisons meaningful). Exit 0 = all non-skipped checks pass.
Missing tools → SKIP, never FAIL.

## Fixtures

| Fixture | Domain | Planted defects | Deterministic checks | Agent checks |
|---------|--------|-----------------|----------------------|--------------|
| `flask-sqli` | parcel-locker API | SQLi via f-string; hardcoded private key | semgrep ×2 | security-auditor finds both |
| `ts-dead-dup` | seedling nursery tracker | copy-paste duplicate pair; dead module + stub; N+1 loop | validate-dead-code.sh ×2, jscpd ×1 | code-reviewer finds the N+1 |
| `node-onboard` | birdhouse registry | none — known architecture (3 entry points) | — | entry-point-tracer finds all 3 |

Fixture domains are deliberately silly and distinct so they never collide with
real project domains (same G7 logic as `exemplars/`).

## When to run

- **Per release** (release-manager checklist): deterministic mode must be green
  before tagging; agent mode per tier you care about.
- **After editing a protocol/agent prompt** that touches security, code-review,
  performance, or onboarding behavior: run the affected fixture in agent mode
  and compare against the previous EVAL_RESULTS.json.
- **When evaluating a new local model**: load it, run
  `scripts/detect-model-context.sh`, then agent mode — the tier-stamped result
  answers "good enough for phase N?" with data.

## Tiered comparison — lift / gap / cost

Deterministic mode answers "is the pipeline still green?"; the tiered comparison
answers ch. 06's economic question: **did the agent scaffold actually help, how
far is this model from frontier, and is the lift worth the inference cost?** Each
fixture carries a `horizon` (short / medium / long) so the gap can be read by
task length — it widens as tasks get longer.

Run the suite once per **cell**, labeled. Pin the model for the cell with
`EVAL_MODEL=<provider>/<model>` (passed straight to `opencode run -m`), so each
cell runs the model you intend rather than whatever opencode defaults to:

```bash
# frontier cell
EVAL_MODEL=openai/gpt-5.5 node scripts/run-evals.mjs --agent --label frontier
# local-model-with-scaffold cell
EVAL_MODEL=lmstudio/qwen/qwen3-coder-next node scripts/run-evals.mjs --agent --label local
# (when a bare/no-scaffold harness exists) same model, no agent loop
node scripts/run-evals.mjs --agent --label local-bare
```

`EVAL_MODEL` also stamps `summary.model`, so the report names the real model.
(`scripts/detect-model-context.sh` still sets the tier label in
`docs/work/.model-context` for the deterministic-only path.)

Each labeled run is archived to `docs/work/eval-runs/<label>.json` (with
per-result `horizon` and a `costEst` of agent duration + estimated output
tokens). Then diff the cells:

```bash
node scripts/eval-compare.mjs --frontier frontier --local local-qwen14b \
                              --bare local-qwen14b-bare   # --bare optional
```

It writes `docs/work/EVAL_COMPARE.md` — a per-horizon pass-rate matrix with:

- **lift** = pass-rate(local scaffolded) − pass-rate(bare) — what the scaffold buys
- **gap** = pass-rate(frontier) − pass-rate(local scaffolded) — what's left to frontier
- **cost** per cell, so a scaffold that costs more inference than the gap it
  closes is visible (it's free on owned hardware — that's the whole local thesis).

Roles are optional: with no `--frontier`/`--local`/`--bare` it just prints the
side-by-side matrix of every labeled run. `node scripts/eval-compare.mjs
--self-test` verifies the lift/gap/cost math on synthetic data (no models needed,
CI-able).

## Watching an in-flight run (fan-out tracker)

Coordinator agents (e.g. `code-reviewer`) spawn a cluster of sub-agents, so the
parent's stdout goes quiet while they work — a long run can look stalled when
it's actually busy. `scripts/eval-status.mjs` renders the fan-out from the
breadcrumbs that *are* emitted (`telemetry.jsonl` + live `opencode run`
processes): which cell/agent is active, the per-session sub-agent tree with
message + token counts, and how long since the last sign of life (it warns when
a coordinator has gone quiet).

```bash
node scripts/eval-status.mjs            # one-shot snapshot
while sleep 5; do clear; node scripts/eval-status.mjs; done   # live view
```

> Coordinator agent-checks (e.g. `code-reviewer`, which fans out to sub-agents)
> can far exceed a single-agent check. The harness handles this on two fronts:
> a per-check `timeout_ms` budget (set in the expectation JSON, sized to the
> agent), and a distinct **`TIMEOUT`** outcome that is **never counted as
> `FAIL`** — see "Validity rules" below.

## Validity rules (what makes the comparison a measurement)

The comparison is only trustworthy if it isolates the model-dependent signal and
never confuses "ran out of budget" with "got it wrong". `eval-compare` enforces:

1. **Gap over agent checks only.** Each result is tagged `kind:"agent"` or
   `kind:"deterministic"`. Deterministic checks (semgrep/validators) pass
   regardless of model — they are a **fixture-health gate** (did the planted
   defects exist?), never part of the frontier-vs-local gap.
2. **Only decided outcomes count.** Statuses are `PASS / FAIL / TIMEOUT / ERROR
   / SKIP`. The gap is computed over `PASS+FAIL` only; `TIMEOUT`/`ERROR` show as
   `⧗` beside the cell and never fold into the rate. A clock-out can't flip the
   gap negative.
3. **No false zeros.** If either side has no decided agent check for a scope, the
   gap is `—` (unknown), not 0.

Per-check budgets live in the expectation JSON (`agent_checks[].timeout_ms`);
`EVAL_AGENT_TIMEOUT_MS` is the fallback for checks without one. Statistical
repeats (run each agent check N× → pass-rate) are the planned next step.

## Adding a fixture

1. `evals/fixtures/<name>/` — smallest possible repo that exhibits the defect.
   Mark every planted defect with a comment and in the fixture README so nobody
   "fixes" it. Pick an off-domain theme.
2. `evals/expectations/<name>.json`:
   - `checks[]` — deterministic: `{id, defect, requires: <tool>, cmd: [...],
     match: <regex over stdout+stderr>, min}`. `{REPO}` in `cmd` expands to the
     repo root. Calibrate by running the tool manually first.
   - `agent_checks[]` — `{id, agent, prompt, match_all: [regex...], timeout_ms?}`
     asserted case-insensitively against everything the agent produced (artifacts
     + final text). JS regex syntax — no inline `(?i)` flags. Set `timeout_ms`
     to the work: a single agent ~`900000` (15m); a coordinator that fans out to
     sub-agents (e.g. `code-reviewer`) ~`2400000` (40m). Omit to use
     `EVAL_AGENT_TIMEOUT_MS`.
3. Run `node scripts/run-evals.mjs --fixture <name>` until green, then prove it
   can fail (temporarily set `min: 999`, expect exit 1, revert).
