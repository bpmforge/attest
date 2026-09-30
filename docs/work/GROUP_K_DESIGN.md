# Group K — ECC intake: design (2026-09-29)

Source: affaan-m/ECC (MIT). Backlog: `IMPROVEMENT_BACKLOG.md` Group K. This doc applies K3's
own framework to K's items: machine-decidable done-criterion, must-NOT-do boundaries, retry
cap, escalation. Nothing here goes default-on without an eval that was pre-registered.

## Global boundaries (apply to every item)
- No merge on a red suite (`npm test` = 0 failed). No hand-edits to generated files (`GENERATED_FILES.txt`); `npm run build:claude` then commit both repos.
- No edits to the user's `~/.claude/settings.json` or global hooks. Installers print, never write.
- Branch per item; commit per wave; push `gitea` AND `github` (no `origin` remote in these repos).
- Every new gate ships with a red fixture and is proven RED by breaking the subject (law L3).
- A test that greps source text does not count as wiring proof. Call the real entry point.
- Retry cap: 2 fix-and-recheck cycles per item; then stop and escalate.
- Stop and ask the user for: model/`claude -p` spend (K2 runs, K4 runs), any external dependency (AgentShield), any change to global config.

## Found while closing K1/K2 (already fixed, `fix/expert-hooks-args`)
opencode 1.4.0 passes call args in `output.args` for `tool.execute.before`; the plugin read
`input.args`, so the dangerous-bash, secret-file, K1 and K2 guards never fired. The Pass 58
"wiring" test grepped source text and passed. Now calls the real hook (RED on old plugin).
Lesson generalises: enforcement code needs a test that drives the real hook signature.

## K1 config-protection — DONE
- Done: Pass 58 drives the real plugin hook: existing `tsconfig.json` edit blocked; new config file and ordinary source allowed; bypass env honoured.
- NOT: block creating configs; block non-config files; write to user settings.
- Open: Claude-side registration is manual (install.sh prints the entry).

## K2 gateguard — opt-in until A/B passes (pre-registered below)
### A/B pre-registration (fixed BEFORE any run)
- **Design guarantees:** the gate can only change behaviour if (a) it fires, (b) the model sees the deny, (c) the model retries with facts. Each run logs `gate_denied` count and whether a retry followed. **A run where the gate never fired in the gated arm is discarded, not scored** — otherwise both arms are the same treatment (the −0.4% failure).
- **Tasks:** ≥10 edit tasks, each a tiny repo + a HIDDEN behavioural test the agent cannot see. ≥4 multi-module (edit must respect an importer / data schema), ≥3 single-file isolated (the gate is expected to be pure tax here), ≥3 "trap" (an existing helper exists; new-file-vs-reuse). Fixtures under `evals/edit-tasks/`.
- **Arms:** same model, same prompt, `EXPERTS_GATEGUARD=0|1`. ≥3 runs per task per arm (variance; ECC used n=2 single runs).
- **Metrics:** primary = hidden-test pass rate. Secondary = turns, tokens/cost, wall time. Grading of any non-test quality is blind to arm (outputs stripped of gate text) and by reading the diff, not sampling.
- **Flip rule (default-on only if ALL hold):** gated pass-rate ≥ ungated + 10 points on multi-module tasks; gated not worse on isolated tasks by >5 points; median cost/turn overhead ≤ 25%. Otherwise stays opt-in; result recorded either way.
- **Confound to check first:** a gated model may just be "made to read more". Include a third arm `EXPERTS_GATEGUARD=0` + a prompt line "list importers before editing" — if that matches the gate, ship the prompt line, not the hook.
- **Escalate:** run budget/model choice (LM Studio is currently hung; frontier runs cost money).

## K3 loop-design-check → loop skills
- Done: a validator (`validate-loop-spec.sh`) fails on a loop spec missing any of: machine-decidable done-criterion, must-NOT-do boundaries, retry cap + escalation, layered goal, reconciliation-over-assertion; RED fixture (loop spec with "make it good") + GREEN fixture; wired into the gate chain that reads autopilot/goal/wave specs; skills cite it.
- NOT: rewrite the loop skills wholesale; block existing specs without a grandfather list; count prose mentions as satisfying the criteria (check structure).
- Wiring proof: run the gate chain entry point on the fixtures.

## K4 skill-comply → evals
- Done: deterministic core only — spec→trace ordering checker (`scripts/lib/trace-order.mjs`) with fixtures of a compliant and a non-compliant trace; unit-tested RED/GREEN. LLM scenario generation/classification is a later wave gated on budget.
- NOT: run `claude -p` at scale without approval; port ECC's Python verbatim; claim compliance rates from <3 scenarios/level.
- Escalate: spend for the LLM half.

## K5 rationalization warn-only check
- Done: a pure `scanRationalization(text)` returning matches, used by a warn-only path; every pattern graded by reading its hits on a real corpus (own past transcripts / docs) — patterns with false positives dropped, not tuned around.
- NOT: block on a hit (regex false-positives; ECC never blocks either).

## K6 mine, don't adopt
- Done: per item a verdict (adopt / mine / skip) that cites a **diff of ECC's full file vs the attest counterpart**, not a description. Items: pr-test-analyzer, spec-miner, config-surface scan (AgentShield-style), click-path-audit, inherit-legacy-style, rust/ts/python reviewers.
- NOT: adopt an external dependency without asking; copy text without MIT attribution.

## Challenge protocol
`challenger` runs on this doc BEFORE execution (claims verified against ECC source in the scratchpad clone and attest files), and again on each shipped wave's diff. A HIGH/CRITICAL finding blocks the wave.
