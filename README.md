# attest

Expert agent system for [OpenCode](https://opencode.ai) — 39 primary expert agents + 32 cluster specialists (security, code-review, performance, onboarding, game dev), 41 skills, a 4-mode SDLC workflow, full git lifecycle management, and 71 automated validators that enforce quality gates at every phase. Works with cloud frontier models and small local models (32k LM Studio/Ollama) via tier detection, compact agent variants, and capability-probed delegation.

**Not sure which command to run? Just describe your goal:** `/guide` is the front door — it routes any plain-English goal ("securely check all my source and help fix the issues", "this codebase is unfamiliar", "harden before launch") to the right expert and drives the workflow, always offering the next step.

Sibling project: [`attest-claude`](https://github.com/bpmforge/attest-claude) — same experts for Claude Code, generated from this repo.

## Install

**Starting from a fresh machine?** You need `git` to clone this, so that one step
is on you — everything after it the installer offers to install for you (Node,
`jq`, compilers, MCP servers).

```bash
# fresh WSL / Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y git curl ca-certificates

# Fedora / RHEL:  sudo dnf install -y git curl ca-certificates
# Arch:           sudo pacman -S --noconfirm git curl ca-certificates
# Alpine:         sudo apk add git curl ca-certificates
# macOS:          git ships with the Xcode command line tools (xcode-select --install)
```

Then:

```bash
git clone https://github.com/bpmforge/attest.git
cd attest
./install.sh
```

That gives you **`main`** — the newest state, which can contain work landed since the last release.

**To install a specific release instead** (pick the version from [Releases](https://github.com/bpmforge/attest/releases)):

```bash
git clone --branch v3.1.25 --depth 1 https://github.com/bpmforge/attest.git
cd attest
./install.sh
```

Or, in a clone you already have:

```bash
git fetch --tags
git checkout v3.1.25   # prints a "detached HEAD" notice — that is expected
./install.sh
```

**`main` vs a tag:** `main` moves with every push; a tag (`v3.1.25`) always points at the same commit. Use a tag when you want a fixed, CI-verified state; use `main` for the newest work. The "detached HEAD" notice on checkout is normal and installing works fine — you only need a branch if you intend to edit: `git checkout -b my-fix v3.1.25`. Go back to the latest with `git checkout main && git pull`.

`install.sh` records what it installed to `experts-version` in the install directory, so you can always tell which one is active.

Common flags: `--project` (install into `.opencode/` instead of global), `--compact` (overlay compact agent variants for 32k local models), `--tools` (install the optional code-analysis tools — semgrep, knip, vulture, mmdc, …), `--link` (symlink for dev), `--semgrep`, `--pullmd`, `--no-playwright-search`, `--uninstall`. Requires macOS, Linux, or WSL2. **Use opencode ≥ v1.2.11** — older builds stop after every tool call on OpenAI-compatible/local endpoints (the `finish_reason:"stop"` bug, fixed in PR #14973); `doctor.sh` warns on older versions.

**Verify the install:**

```bash
~/.config/opencode/scripts/doctor.sh        # structure, deps, config, model backend, agent discovery
~/.config/opencode/scripts/check-tools.sh   # which optional analysis tools are present (add: --install)
```

`Status: HEALTHY` means everything works. Re-run any time something feels broken.

## Update

One command, from your existing checkout:

```bash
./install.sh --update
```

It fetches releases, moves this checkout to the newest one, reinstalls, and tells you what it moved from and to. Works whether you're on `main` or pinned to an older tag, and it's safe to run when you're already current. Follow with `doctor.sh`.

It stops without changing anything if you have uncommitted edits to tracked files, and shows you which — so it can't quietly discard your work. (Untracked files are left alone.)

Prefer to track `main` by hand? `git pull && ./install.sh` still works — but note `git pull` is a silent no-op if you're on a tag, which is exactly the trap `--update` avoids.

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
- **9-dimension code health** including a dead-code/stub/unused-export detector.
- **Deterministic scaffolding** — `run-plan.mjs` (DAG runner for decomposed tasks), `fix-verify.mjs` (re-verify gate), `mermaid-fix.mjs` + render-validated diagrams. Scripts own control flow and verification; models do the judgment work — which keeps heavy jobs reliable on small local models.
- **Unattended Phase 4** — the conductor (`scripts/conductor/`) works a `plan.json` board on its own: claim → code in an isolated worktree → review on a *different model* → runtime verification → merge → next. Reviewers are triggered by what the diff touches (auth pulls in security, queries pull in perf), every landed ticket carries its own review documents, a failed one goes back to `ready` with its evidence preserved, and five startup gates refuse a bad board before a single model call. See [docs/UNATTENDED_EXECUTION.md](docs/UNATTENDED_EXECUTION.md). Planning stays interactive — the Discovery Interview is NEVER-AUTO.
- **Any LLM** — tier detection, compact agent variants (`dist/compact-agents/`, install with `--compact`), capability-probed delegation (`agents/shared/EXECUTOR_SELECTION.md` — HANDOFF, never a naive spawn), a **plan-strong/execute-cheap tier split** (`MODEL_ADAPTER.md` Rule 5), checkpoint/revert recovery (`CHECKPOINT_REVERT.md`), and a local-model picks + runtime-gotchas playbook (`references/local-agentic-models.md`).
- **Eval suite** — `npm run evals` runs the pipeline against fixture repos with planted defects (`evals/`). `EVAL_MODEL=<provider/model>` pins a model per run and `npm run evals:compare` produces a **tiered frontier-vs-local lift / gap / cost** report (outcome-based scoring, sandboxed agent runs); `npm run evals:status` shows live sub-agent fan-out. Protocol changes and model choices are measured, not vibed.
- **Telemetry** — every completed assistant message logs real token/cost actuals to `docs/work/telemetry.jsonl` (plugin hook; counts only, never content; `EXPERTS_TELEMETRY=0` to disable). `npm run telemetry:report` turns the data into tuned tier budgets, timeouts, and escalation thresholds.

## Docs

- [docs/SETUP.md](docs/SETUP.md) — **start here**: prerequisites, embedding models, env vars, troubleshooting
- [docs/USERGUIDE.md](docs/USERGUIDE.md) — how to invoke each expert
- [docs/FEATURES.md](docs/FEATURES.md) — full agent, skill, validator, and protocol catalog
- [docs/SDLC_GUIDE.md](docs/SDLC_GUIDE.md) — SDLC workflow, phases, git model, and traceability chain
- [docs/UNATTENDED_EXECUTION.md](docs/UNATTENDED_EXECUTION.md) — running Phase 4 coding tickets unattended: the conductor, its startup gates, diff-triggered reviewers, Jira mirroring, and what to check before pointing it at a large board
- [docs/LOCAL_LLM_GUIDE.md](docs/LOCAL_LLM_GUIDE.md) — running on local models (tiers, compact variants)
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — adding agents or skills (and the single-source build for attest-claude)
- [Releases](https://github.com/bpmforge/attest/releases) — release notes for each version (the per-release detail lives in the annotated tag; `CHANGELOG.md` covers 1.x–2.12 only)

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Bradford Matthews.
