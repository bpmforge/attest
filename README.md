# BPM OpenCode Experts

Expert agent system for [OpenCode](https://opencode.ai) — 39 primary expert agents + 31 cluster specialists (security, code-review, performance, onboarding, game dev), 38 skills, a 4-mode SDLC workflow, full git lifecycle management, and 55 automated validators that enforce quality gates at every phase. Works with cloud frontier models and small local models (32k LM Studio/Ollama) via tier detection, compact agent variants, and capability-probed delegation.

**Not sure which command to run? Just describe your goal:** `/guide` is the front door — it routes any plain-English goal ("securely check all my source and help fix the issues", "this codebase is unfamiliar", "harden before launch") to the right expert and drives the workflow, always offering the next step.

Sibling project: [`claude-experts`](https://github.com/bpmforge/claude-experts) — same experts for Claude Code, generated from this repo.

## Install

```bash
git clone https://github.com/bpmforge/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh
```

Common flags: `--project` (install into `.opencode/` instead of global), `--compact` (overlay compact agent variants for 32k local models), `--tools` (install the optional code-analysis tools — semgrep, knip, vulture, mmdc, …), `--link` (symlink for dev), `--semgrep`, `--pullmd`, `--no-playwright-search`, `--uninstall`. Requires macOS, Linux, or WSL2.

**Verify the install:**

```bash
~/.config/opencode/scripts/doctor.sh        # structure, deps, config, model backend, agent discovery
~/.config/opencode/scripts/check-tools.sh   # which optional analysis tools are present (add: --install)
```

`Status: HEALTHY` means everything works. Re-run any time something feels broken.

**Update:** `git pull && ./install.sh` (idempotent — re-running is always safe), then `doctor.sh` again.

## First command

Two ways to start:

```
/guide                                       # describe any goal in plain English
/sdlc init my-project "short description"     # or go straight to a workflow
```

Plain English routes automatically — `/guide` (or the SDLC lead) detects intent:

| You say | Runs |
|---------|------|
| "I don't know where to start / what can this do?" | `/guide` |
| "build a new app" | `/sdlc init` |
| "build a game" | `/sdlc init --game` |
| "understand this codebase" | `/sdlc onboard` |
| "add X feature" | `/sdlc feature` |
| "review / audit / find gaps / make it better" | `/sdlc improve` |
| "securely check my source and help fix it" | `/security --fix` |
| "is there code nothing uses?" | `/review-code` (dead-code dimension) |

## Highlights

- **`/guide` concierge** — front door that routes any goal to the right expert.
- **Security find-and-fix** — `/security` audits all source; `/security --fix` drives a verified remediation loop (fix → re-scan to confirm closed, never the model's say-so).
- **8-dimension code health** including a dead-code/stub/unused-export detector.
- **Deterministic scaffolding** — `run-plan.mjs` (DAG runner for decomposed tasks), `fix-verify.mjs` (re-verify gate), `mermaid-fix.mjs` + render-validated diagrams. Scripts own control flow and verification; models do the judgment work — which keeps heavy jobs reliable on small local models.
- **Any LLM** — tier detection, compact agent variants (`dist/compact-agents/`, install with `--compact`), capability-probed delegation (`agents/shared/EXECUTOR_SELECTION.md` — HANDOFF, never a naive spawn), a **plan-strong/execute-cheap tier split** (`MODEL_ADAPTER.md` Rule 5), checkpoint/revert recovery (`CHECKPOINT_REVERT.md`), and a local-model picks + runtime-gotchas playbook (`references/local-agentic-models.md`).
- **Eval suite** — `npm run evals` runs the pipeline against fixture repos with planted defects (`evals/`). `EVAL_MODEL=<provider/model>` pins a model per run and `npm run evals:compare` produces a **tiered frontier-vs-local lift / gap / cost** report (outcome-based scoring, sandboxed agent runs); `npm run evals:status` shows live sub-agent fan-out. Protocol changes and model choices are measured, not vibed.
- **Telemetry** — every completed assistant message logs real token/cost actuals to `docs/work/telemetry.jsonl` (plugin hook; counts only, never content; `EXPERTS_TELEMETRY=0` to disable). `npm run telemetry:report` turns the data into tuned tier budgets, timeouts, and escalation thresholds.

## Docs

- [docs/SETUP.md](docs/SETUP.md) — **start here**: prerequisites, embedding models, env vars, troubleshooting
- [docs/USERGUIDE.md](docs/USERGUIDE.md) — how to invoke each expert
- [docs/FEATURES.md](docs/FEATURES.md) — full agent, skill, validator, and protocol catalog
- [docs/SDLC_GUIDE.md](docs/SDLC_GUIDE.md) — SDLC workflow, phases, git model, and traceability chain
- [docs/LOCAL_LLM_GUIDE.md](docs/LOCAL_LLM_GUIDE.md) — running on local models (tiers, compact variants)
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — adding agents or skills (and the single-source build for claude-experts)
- [CHANGELOG.md](CHANGELOG.md) — release notes

## License

See `LICENSE`.
