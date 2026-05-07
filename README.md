# BPM OpenCode Experts

Expert agent system for [OpenCode](https://opencode.ai) — 15 specialist agents, 24 skills, a 4-mode SDLC workflow, full git lifecycle management, and 36 automated validators that enforce quality gates at every phase.

Sibling project: [`claude-experts`](https://github.com/bpmforge/claude-experts) — same experts for Claude Code.

## Install

```bash
git clone https://github.com/bpmforge/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh
```

Common flags: `--project` (install into `.opencode/` instead of global), `--link` (symlink for dev), `--semgrep`, `--pullmd`, `--no-playwright-search`, `--uninstall`. Requires macOS, Linux, or WSL2.

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

- [docs/USERGUIDE.md](docs/USERGUIDE.md) — how to invoke each expert
- [docs/FEATURES.md](docs/FEATURES.md) — full agent, skill, validator, and protocol catalog
- [docs/SDLC_GUIDE.md](docs/SDLC_GUIDE.md) — SDLC workflow, phases, git model, and traceability chain
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — adding agents or skills
- [CHANGELOG.md](CHANGELOG.md) — release notes

## License

See `LICENSE`.
