# BPM OpenCode Experts

Expert agent system for [OpenCode](https://opencode.ai). 12 specialist agents, 15 skill triggers, curated reference docs, custom tools, and a full SDLC workflow — all driven by whichever LLM backend you configure (Claude, OpenAI, Gemini, Ollama, LM Studio, 75+ providers).

Sibling project: [`claude-experts`](https://github.com/bpmforge/claude-experts) — same experts for Claude Code.

## Quick start

```bash
git clone https://github.com/bpmforge/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh                  # symlinks into ~/.config/opencode/
```

Verify with `/sdlc init my-project "short description"` inside an OpenCode session.

Uninstall with `./uninstall.sh`.

## What's in this repo

| Path | Purpose |
|---|---|
| `agents/` | 12 specialist agent definitions |
| `skills/` | 15 thin skill triggers that invoke agents |
| `references/` | Canonical checklists the agents read at runtime |
| `tools/` | Custom TypeScript tools (bash, grep-mcp, semgrep, playwright, etc.) |
| `commands/` | Slash command definitions (SDLC subcommands) |
| `hooks/` | Event hooks (session start, pre-tool, etc.) |
| `scripts/` | Helper scripts (deploy, semgrep audits, validate tools) |
| `examples/` | Example `AGENTS.md` + `opencode.json` |

## Documentation

- **[CHANGELOG.md](CHANGELOG.md)** — What changed in every release
- **[docs/FEATURES.md](docs/FEATURES.md)** — What each agent, skill, and reference does
- **[docs/USERGUIDE.md](docs/USERGUIDE.md)** — How to invoke and use each expert
- **[docs/EXPERT_GUIDE.md](docs/EXPERT_GUIDE.md)** — Deep dive on the expert system architecture
- **[docs/SDLC_GUIDE.md](docs/SDLC_GUIDE.md)** — Full SDLC workflow (init → onboard → feature)
- **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)** — How to add or upgrade an agent

## License

See `LICENSE` (or ask the maintainer). Interoperable with Claude Code and OpenCode — use freely.
