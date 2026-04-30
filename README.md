# BPM OpenCode Experts

Expert agent system for [OpenCode](https://opencode.ai) — 14 specialist agents, 24 skills, a 4-mode SDLC workflow, an MCP-driven research backbone, and a lifecycle plugin that handles formatting / linting / type-checking / secret scanning automatically.

Sibling project: [`claude-experts`](https://github.com/bpmforge/claude-experts) — same experts for Claude Code.

## Install

```bash
git clone https://github.com/bpmforge/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh
```

Common flags: `--project` (install into `.opencode/` instead of global), `--link` (symlink for dev), `--semgrep` (auto-install Semgrep), `--pullmd` (add pullmd MCP for JS-heavy / Cloudflare / Reddit page extraction), `--no-playwright-search` (skip the search MCP), `--uninstall`. Requires macOS, Linux, or WSL2.

## First command

Inside an OpenCode session:

```
/sdlc init my-project "short description"
```

Or describe what you want in plain English — the SDLC lead detects intent and routes:

| You say | It runs |
|---------|---------|
| "build a new app" | `/sdlc init` |
| "understand this codebase" | `/sdlc onboard` |
| "add X feature" | `/sdlc feature` |
| "review / audit / find gaps / make it better" | `/sdlc improve` |

## Docs

- [docs/USERGUIDE.md](docs/USERGUIDE.md) — how to invoke and use each expert
- [docs/FEATURES.md](docs/FEATURES.md) — every agent, skill, command, plugin, validator, shared protocol
- [docs/SDLC_GUIDE.md](docs/SDLC_GUIDE.md) — full 4-mode SDLC workflow
- [docs/AGENT_PROCESS_FLOW.md](docs/AGENT_PROCESS_FLOW.md) — agent orchestration internals
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — how to add agents / skills
- [scripts/validators/README.md](scripts/validators/README.md) — validator contract
- [CHANGELOG.md](CHANGELOG.md) — release notes

## License

See `LICENSE`.
