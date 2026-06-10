# BPM OpenCode Experts

Expert agent system for [OpenCode](https://opencode.ai) — 33 primary expert agents + 30 cluster specialists (security, code-review, performance, onboarding, game dev), 25 skills, a 4-mode SDLC workflow, full git lifecycle management, and 40 automated validators that enforce quality gates at every phase. Works with cloud frontier models and small local models (32k LM Studio/Ollama) via tier detection, compact agent variants, and capability-probed delegation.

Sibling project: [`claude-experts`](https://github.com/bpmforge/claude-experts) — same experts for Claude Code.

## Install

```bash
git clone https://github.com/bpmforge/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh
```

Common flags: `--project` (install into `.opencode/` instead of global), `--compact` (overlay compact agent variants for 32k local models), `--link` (symlink for dev), `--semgrep`, `--pullmd`, `--no-playwright-search`, `--uninstall`. Requires macOS, Linux, or WSL2.

**Verify the install:**

```bash
~/.config/opencode/scripts/doctor.sh
```

Checks structure, runtime deps, config permissions, model backend, tier detection, and agent discovery — `Status: HEALTHY` means everything works. Re-run it any time something feels broken.

**Update:** `git pull && ./install.sh` (idempotent — re-running is always safe), then `doctor.sh` again.

## First command

```
/sdlc init my-project "short description"
```

Or plain English — the SDLC lead detects intent and routes automatically:

| You say | Runs |
|---------|------|
| "build a new app" | `/sdlc init` |
| "understand this codebase" | `/sdlc onboard` |
| "add X feature" | `/sdlc feature` |
| "review / audit / find gaps / make it better" | `/sdlc improve` |

## Docs

- [docs/SETUP.md) — **start here**: prerequisites, embedding models, env vars, troubleshooting
- [docs/USERGUIDE.md](docs/USERGUIDE.md](docs/USERGUIDE.md) — how to invoke each expert
- [docs/FEATURES.md](docs/FEATURES.md) — full agent, skill, validator, and protocol catalog
- [docs/SDLC_GUIDE.md](docs/SDLC_GUIDE.md) — SDLC workflow, phases, git model, and traceability chain
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — adding agents or skills
- [CHANGELOG.md](CHANGELOG.md) — release notes

## License

See `LICENSE`.
