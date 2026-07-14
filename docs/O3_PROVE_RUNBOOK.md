# O3 — Prove It (runbook)

Wave O3 of `AUTONOMY_AND_LOOP_UPGRADE_PLAN.md` is a **measurement pass**, not a build. The
harnesses ship deterministic (each has `--self-test`, no model needed); the *numbers* require a
live model backend, so those steps run on the hardware (LM Studio / qwen3.6 on the M-series box,
and `EVAL_MODEL` runs). Record results back into this file's "Results" table + `LESSONS.md`.

Harness self-tests (CI-safe, run anywhere):
```
node scripts/pause-census.mjs --self-test
node scripts/soak-monitor.mjs --self-test
```

---

## 1. Pause census — does `autonomy: auto` remove the by-design pauses?

Run the SAME goal twice, capturing each session transcript.

```
# interactive (today's behavior — baseline)
OPENCODE_AUTONOMY=interactive opencode run --agent sdlc-lead \
  "/sdlc init census-demo \"a small CRUD todo API\"" | tee docs/work/census-interactive.log

# auto (opt-in) — reset the workcopy first so it's the same starting goal
OPENCODE_AUTONOMY=auto opencode run --agent sdlc-lead \
  "/sdlc init census-demo \"a small CRUD todo API\"" | tee docs/work/census-auto.log
```

Analyze + assert the claim (NEVER-AUTO budget = the row count in `AUTONOMY_PROTOCOL.md`'s
NEVER-AUTO table for the sites this goal actually reaches — for `/sdlc init` that's the
Discovery interview = 1, unless a destructive/tech-stack site fires):

```
node scripts/pause-census.mjs \
  --interactive docs/work/census-interactive.log \
  --auto docs/work/census-auto.log \
  --approvals docs/work/APPROVALS.md \
  --never-auto 1
```

**Targets:** `auto_pauses ≤ never_auto_budget`; `interactive_pauses` unchanged from pre-O1 baseline;
`APPROVALS.md` lists every gate auto-taken. Exit 0 = claim holds.

## 2. Accidental-pause soak — do the O0 fixes hold on a long local run?

Prereqs: `examples/opencode.json` config (timeout/chunkTimeout + `plugin` array) installed;
LM Studio serving qwen3.6; ideally drive a multi-step job via `scripts/run-until-done.sh`.

```
RUN_CMD="opencode run" scripts/run-until-done.sh \
  --prompt "/sdlc feature \"add pagination to the list endpoint\"" \
  --agent sdlc-lead --max-sessions 12 --max-seconds 7200 \
  | tee docs/work/soak-session.log

node scripts/soak-monitor.mjs --log docs/work/soak-session.log \
  --run-log docs/work/run-until-done.log
```

**Target:** `manual-continues = 0` over a ~2h session (auto-resume firing is the fix working, not
a failure). Exit 1 if any manual continue was needed — investigate which pause class leaked
(cross-check the 8 causes in `LOCAL_LLM_GUIDE` § pause troubleshooting).

## 3. Eval re-run — no regression from the O2 loop rules; record the wall-time delta

Uses the existing isolated eval harness (`EVAL_MODEL` pin + `--dir` sandbox). Run the triad:

```
EVAL_MODEL=<frontier/model>            npm run evals -- --agent --label frontier
EVAL_MODEL=lmstudio/qwen/qwen3-coder   npm run evals -- --agent --label local
EVAL_MODEL=lmstudio/qwen/qwen3-coder   EXPERTS_MINIMAL=1 npm run evals -- --agent --label local-bare
npm run evals:compare -- --frontier frontier --local local
```

**Targets:** local-scaffolded ≥ its pre-O2 score (no regression from evidence/edit-format/lint rules);
record the **wall-time delta** attributable to O0 timeouts + O2.6 stable-prefix (expect faster or
equal). Note: E2E on the M2 Max can exceed 900s — run a smoke subset first.

## 4. Lessons → LESSONS.md

Feed anything learned back into the meta-learning path:
```
node scripts/loop-learn.mjs \
  --symptom "<what leaked / regressed>" \
  --root-cause "<why>" \
  --rule "<the durable fix>"
```

---

## Results (fill in after the live runs)

| # | Measurement | Target | Result | Date |
|---|-------------|--------|--------|------|
| 1 | Pause census (auto ≤ NEVER-AUTO) | auto ≤ 1, interactive unchanged | ✅ **HOLDS: interactive=1, auto=1, never-auto=1** — both `/sdlc init` runs (LM Studio `qwen/qwen3-coder-next` @127.0.0.1) paused exactly once at the NEVER-AUTO Discovery interview and nowhere else; `auto` added no pauses and correctly kept the never-auto gate. **Also found+fixed a false-green in the analyzer**: its `PAUSE` regex matched only protocol-directive phrasing, not the gate text the agent actually emits ("Proceed? (yes / describe any corrections)", "answer these questions so I can proceed") — it counted the real transcripts as 0/0 and exit-0'd by luck. Added emitted-gate phrasings + a real-phrasing self-test regression. Transcripts: `docs/work/census-{interactive,auto}.log`. | 2026-07-13 |
| 2 | Accidental-pause soak | manual continues = 0 / ~2h | _pending — ~2h local soak, dedicated window_ | — |
| 3 | Eval triad no-regression + wall-time | local ≥ pre-O2; Δt ≤ 0 | _pending — 3 eval runs, dedicated window_ | — |
