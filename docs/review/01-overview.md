[🏠 Index](README.md)  |  [Component Architecture →](02-architecture.md)

---

# 1. System Overview

BPM OpenCode Experts is an expert agent system for [OpenCode](https://opencode.ai). It extends the OpenCode AI coding assistant with:

- **15 specialist agents** (markdown prompt files) covering the full software engineering lifecycle
- **24 skills** (slash commands that invoke agent workflows)
- **18 custom tools** (TypeScript plugins that extend OpenCode's tool palette)
- **1 OpenCode plugin** (`expert-hooks.ts`) that intercepts every tool call for safety and quality enforcement
- **36 shell validators** that enforce quality gates at each SDLC phase
- **4-mode SDLC orchestration** (new project, onboard existing, add feature, audit and improve)
- **186 custom Semgrep rules** across 11 languages for security scanning

The system is LLM-agnostic — it works with Claude, OpenAI, Gemini, and any local LLM (Ollama, LM Studio, 75+ providers via OpenCode).

---

---

[🏠 Index](README.md)  |  [Component Architecture →](02-architecture.md)
