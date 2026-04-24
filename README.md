# BPM OpenCode Experts

Expert agent system for [OpenCode](https://opencode.ai). 14 specialist agents, 23 skills, 9 validators, a full SDLC workflow — driven by whichever LLM backend you configure (Claude, OpenAI, Gemini, Ollama, LM Studio, 75+ providers).

Sibling project: [`claude-experts`](https://github.com/bpmforge/claude-experts) — same experts for Claude Code.

## Install

```bash
git clone https://github.com/bpmforge/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh                  # symlinks into ~/.config/opencode/
```

Requires macOS, Linux, or Windows with WSL2. Uninstall with `./uninstall.sh`.

## First command

Inside an OpenCode session:

```
/sdlc init my-project "short description"
```

Or describe what you want in plain English — the SDLC lead detects intent and routes.

## Docs

- [docs/USERGUIDE.md](docs/USERGUIDE.md) — how to invoke and use each expert
- [docs/FEATURES.md](docs/FEATURES.md) — every agent, skill, validator, and shared protocol
- [docs/SDLC_GUIDE.md](docs/SDLC_GUIDE.md) — full SDLC workflow
- [docs/AGENT_PROCESS_FLOW.md](docs/AGENT_PROCESS_FLOW.md) — step-by-step agent orchestration
- [scripts/validators/README.md](scripts/validators/README.md) — validator contract
- [CHANGELOG.md](CHANGELOG.md) — release notes (current: v0.15.0 strict-refactor)

## License

See `LICENSE`.
