# BPM OpenCode Experts

Expert agent system for [OpenCode](https://opencode.ai). **14 specialist agents, 20 skill triggers**, curated reference docs, custom tools, and a full SDLC workflow — all driven by whichever LLM backend you configure (Claude, OpenAI, Gemini, Ollama, LM Studio, 75+ providers).

Sibling project: [`claude-experts`](https://github.com/bpmforge/claude-experts) — same experts for Claude Code.

## Quick start

```bash
git clone https://github.com/bpmforge/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh                  # symlinks into ~/.config/opencode/
```

Verify with `/sdlc init my-project "short description"` inside an OpenCode session. Or just describe what you want — the SDLC lead will detect your intent and route to the right mode.

Uninstall with `./uninstall.sh`.

## Agents (14)

| Agent | Skill | What it does |
|---|---|---|
| **sdlc-lead** | `/sdlc` | Orchestrates the full lifecycle — new project, onboard, add feature, improve. Smart routing from natural language. |
| **coding-agent** | `/code` | Doc-driven implementation engineer. Reads SDLC design docs first, verifies every API via Context7, enforces anti-slop rules (no over-engineering, no hallucinated APIs, no defensive bloat). |
| **researcher** | `/research` | Competitive analysis, tech feasibility, evidence-based investigation. |
| **test-engineer** | `/test-expert` | E2E tests, unit tests, test strategy, discovery audits, USE_CASES + TEST_PLAN. |
| **code-reviewer** | `/review-code` | 7-dimension code health audit, tech debt, pattern drift. |
| **security-auditor** | `/security` | OWASP top 10, STRIDE threats, secret scanning, dependency CVEs. |
| **frontend-design** | `/frontend` | **NEW** — Visual polish: typography, color, spacing, motion. Makes UI look intentional. |
| **ux-engineer** | `/ux` | WCAG 2.2 accessibility, user workflows, component architecture. |
| **db-architect** | `/dba` | Schema design, ERDs, migrations, indexes, query optimization. |
| **api-designer** | `/api-design` | REST/GraphQL contracts, versioning, pagination, error formats. |
| **performance-engineer** | `/perf` | Profiling, O(n²) detection, N+1 queries, latency analysis. |
| **container-ops** | `/containers` | Dockerfiles, compose, multi-stage builds, image optimization. |
| **sre-engineer** | `/devops` | CI/CD, monitoring, runbooks, incident response, deployment. |
| **git-expert** | `/git` | Repo bootstrap, branching, commits, PRs, releases, history forensics. |

## Additional Skills (7)

| Skill | What it does |
|---|---|
| `/code` | **NEW** — Invoke coding-agent to implement from SDLC design docs. Verifies APIs via Context7, enforces anti-slop rules, produces a Completion Manifest with tech stack compliance. |
| `/review` | Multi-agent parallel review (code-reviewer + security-auditor + performance-engineer). |
| `/gate` | Phase gate check — validates exit criteria before advancing SDLC phases. |
| `/simplify` | Quick code review of recent changes — spot reuse, quality gaps, over-engineering. |
| `/explore` | **NEW** — Codebase archaeology: trace a feature end-to-end, map blast radius with file:line references. |
| `/steward` | **NEW** — Audit CLAUDE.md / AGENTS.md alignment with code, capture session learnings. |
| `/design-options` | **NEW** — Generate 2-3 architecture alternatives with trade-off matrix before committing. |

## SDLC Workflow (4 modes)

| Mode | Command | When to use |
|---|---|---|
| **Init** | `/sdlc init <name> "<desc>"` | Starting a new project from scratch |
| **Onboard** | `/sdlc onboard` | Understanding an existing codebase |
| **Feature** | `/sdlc feature "<desc>"` | Adding a feature to existing code |
| **Improve** | `/sdlc improve ["<scope>"]` | Improving existing code — frontend, backend, feature, design, or all |

Or just describe what you want and the SDLC lead figures out the right mode:
- "I want to build an app" → Init
- "What does this code do?" → Onboard
- "Add payment processing" → Feature
- "Make the frontend better" → Improve (frontend scope)

## Key features

- **Smart routing** — describe what you want in plain English, the system picks the right mode
- **Adaptive questioning** — agents learn from research and audits, then ask deeper follow-up questions they couldn't have asked upfront
- **Test-first at every phase** — USE_CASES.md + TEST_PLAN.md in Phase 2, E2E tests in Phase 4, TDD for features
- **Design compliance** — every code-writing agent reads TECH_STACK.md and ARCHITECTURE.md before writing code; will never introduce technologies the architect didn't choose
- **API verification** — agents check Context7 MCP or node_modules before using any library API; never guesses from training data
- **Vision-driven improvement** — Mode 4 asks "what should this BECOME?", researches how best products achieve that vision, then plans the gap
- **Completion manifests** — every specialist returns structured results the orchestrator can verify
- **Context packets** — specialists get focused context files instead of re-exploring the codebase

## What's in this repo

| Path | Purpose |
|---|---|
| `agents/` | 14 specialist agent definitions |
| `skills/` | 20 skill triggers (14 agent-backed + 6 standalone) |
| `references/` | Canonical checklists the agents read at runtime |
| `tools/` | Custom TypeScript tools (bash, grep-mcp, semgrep, playwright, etc.) |
| `commands/` | Slash command definitions (SDLC subcommands) |
| `hooks/` | Event hooks (session start, pre-tool, etc.) |
| `scripts/` | Helper scripts (deploy, semgrep audits, validate tools) |
| `.semgrep/` | Custom security rulesets — 98 rules across 6 languages (auto-loaded) |
| `examples/` | Example `AGENTS.md` + `opencode.json` |
| `docs/` | Full documentation (see below) |

## Documentation

- **[CHANGELOG.md](CHANGELOG.md)** — What changed in every release
- **[docs/FEATURES.md](docs/FEATURES.md)** — What each agent, skill, and reference does
- **[docs/USERGUIDE.md](docs/USERGUIDE.md)** — How to invoke and use each expert
- **[docs/AGENT_PROCESS_FLOW.md](docs/AGENT_PROCESS_FLOW.md)** — Step-by-step agent orchestration for all 4 modes
- **[docs/EXPERT_GUIDE.md](docs/EXPERT_GUIDE.md)** — Deep dive on the expert system architecture
- **[docs/SDLC_GUIDE.md](docs/SDLC_GUIDE.md)** — Full SDLC workflow (init → onboard → feature → improve)
- **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)** — How to add or upgrade an agent

## License

See `LICENSE` (or ask the maintainer). Interoperable with Claude Code and OpenCode — use freely.
