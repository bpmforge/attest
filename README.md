# BPM OpenCode Experts

An expert system for [OpenCode](https://opencode.ai) that brings structured software development workflows, specialist agents, and deep research capabilities to any LLM backend.

Works with Claude, OpenAI, Google Gemini, local models (Ollama, LM Studio), and 75+ other providers supported by OpenCode.

## What's Included

### 11 Expert Agents
Specialized AI agents with deep domain expertise:

| Agent | Slash Command | Domain |
|-------|--------------|--------|
| SDLC Lead | `/sdlc` | Program management, SDLC orchestration, architecture |
| Security Auditor | `/security` | OWASP assessments, threat modeling, vulnerability scanning |
| Researcher | `/research` | Structured investigation, source evaluation, comparison |
| Test Engineer | `/test-expert` | Playwright, vitest/jest, test strategy, coverage |
| Database Architect | `/dba` | Schema design, migrations, query optimization |
| UX Engineer | `/ux` | User workflows, component architecture, WCAG accessibility |
| SRE Engineer | `/devops` | Runbooks, CI/CD, monitoring, incident response |
| Container Expert | `/containers` | Docker/Podman, compose, networking, debugging |
| Code Reviewer | `/review-code` | Code quality, patterns, tech debt, consistency |
| Performance Engineer | `/perf` | Profiling, benchmarks, bottleneck optimization |
| API Designer | `/api-design` | REST/GraphQL, contracts, versioning, documentation |

### SDLC Workflow
Full software development lifecycle management:

- **`/sdlc init <name> "<description>"`** — Start a new project with proper phases (Ideation → Planning → Requirements → Design → Implementation → Review)
- **`/sdlc onboard`** — Reverse-engineer an existing codebase, produce architecture docs
- **`/sdlc feature "<description>"`** — Add a feature with impact analysis, design, implementation
- **`/sdlc status`** — Check current progress
- **`/sdlc gate`** — Validate phase exit criteria

### Deep Research
Structured investigation with evidence-based findings:

- **`/research "<topic>"`** — Multi-source research with citations
- **`/research --compare "A vs B"`** — Technology comparison
- **`/research --deep "<topic>"`** — Comprehensive analysis with competitive landscape

### Multi-Pass Code Review
- **`/review`** — Full code quality review with severity levels
- **`/review-code`** — Patterns, maintainability, tech debt analysis

### Additional Skills
- **`/gate`** — SDLC phase gate management
- **`/simplify`** — Review changed code for reuse and efficiency

### Persistent Memory (MemPalace MCP)

Local LLMs have no memory between sessions. [MemPalace](https://github.com/milla-jovovich/mempalace) fixes this — verbatim conversation recall via ChromaDB, plus a temporal knowledge graph. **96.6% LongMemEval R@5 in raw mode, entirely offline.**

Install with one script:

```bash
./scripts/install-mempalace.sh
```

After install, every expert agent gets its own wing + diary. The `researcher` remembers prior findings, `security-auditor` remembers prior vulnerabilities, `sdlc-lead` remembers prior phase decisions — all persistent across sessions, fully local.

See `examples/AGENTS.md` for the full usage protocol (when to call `mempalace_status`, `mempalace_search`, `mempalace_kg_query`, etc.).

### Reference Documents
Supporting documents that agents load at runtime:
- OWASP Top 10 checklist
- Severity assessment matrix
- Security report template
- REST API design checklist
- Playwright test configuration guide
- Engineering artifacts reference

## Installation

### Option 1: Copy into your OpenCode config (recommended)

```bash
# Clone the repo
git clone https://github.com/user/bpm-opencode-experts.git

# Copy agents, skills, commands, and references into your OpenCode config
cp -r bpm-opencode-experts/agents/ ~/.config/opencode/agents/
cp -r bpm-opencode-experts/skills/ ~/.config/opencode/skills/
cp -r bpm-opencode-experts/commands/ ~/.config/opencode/commands/
cp -r bpm-opencode-experts/references/ ~/.config/opencode/references/

# Or for project-level installation:
cp -r bpm-opencode-experts/agents/ .opencode/agents/
cp -r bpm-opencode-experts/skills/ .opencode/skills/
cp -r bpm-opencode-experts/commands/ .opencode/commands/
cp -r bpm-opencode-experts/references/ .opencode/references/
```

### Option 2: Use the install script

```bash
git clone https://github.com/user/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh           # Installs globally to ~/.config/opencode/
./install.sh --project # Installs to current project's .opencode/
```

### Option 3: Symlink (for development)

```bash
git clone https://github.com/user/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh --link    # Symlinks so updates are instant
```

## Configuration

After installation, add the AGENTS.md rules to your project (optional but recommended):

```bash
cp bpm-opencode-experts/examples/AGENTS.md ./AGENTS.md
```

This gives your OpenCode instance the same behavioral rules the experts expect.

## How It Works

### Agent System
Each agent is a markdown file with structured instructions that define:
- **Who they are** — Role, expertise, thinking approach
- **How they work** — Step-by-step methodology (Understand → Research → Plan → Execute → Verify → Report)
- **What they produce** — Specific deliverables and formats
- **When to delegate** — Which other experts to involve

### Skills (Slash Commands)
Skills are quick-access commands that load the appropriate agent with context:
- `/sdlc init myproject "A web app for..."` → Loads SDLC Lead agent
- `/security` → Loads Security Auditor agent
- `/dba --design` → Loads Database Architect agent

### Cross-Expert Coordination
Experts recommend other experts when they find issues outside their domain:
- Security finds untested auth → recommends `/test-expert`
- DBA designs schema → recommends `/security` for access review
- Code reviewer finds performance issue → recommends `/perf`

### Interoperability with Claude Code
Work started in Claude Code can continue in OpenCode and vice versa:
- SDLC documents follow the same format (docs/sdlc/phase-X/)
- Agent methodologies are identical
- Reference documents are shared

## LLM Compatibility

Tested with:
- **Cloud:** Claude (Anthropic), GPT-4 (OpenAI), Gemini (Google)
- **Local:** Ollama (llama3, codellama), LM Studio (qwen, gemma)
- **Other:** Any OpenAI-compatible endpoint

**Note:** Complex agents (SDLC Lead, Researcher) work best with larger models (70B+ local or cloud models). Simpler agents (Code Reviewer, Container Expert) work well with smaller models.

## Project Structure

```
bpm-opencode-experts/
  agents/             ← Expert agent definitions (markdown)
    sdlc-lead.md
    security-auditor.md
    researcher.md
    test-engineer.md
    db-architect.md
    ux-engineer.md
    sre-engineer.md
    container-ops.md
    code-reviewer.md
    performance-engineer.md
    api-designer.md
  skills/             ← Slash command skill definitions (markdown)
    sdlc.md
    security-audit.md
    research.md
    test-expert.md
    db-architect.md
    ux-expert.md
    devops.md
    container-expert.md
    code-review.md
    perf.md
    api-design.md
    gate.md
    review.md
    simplify.md
  commands/           ← Quick-access command shortcuts
    sdlc-init.md
    sdlc-onboard.md
    sdlc-feature.md
    sdlc-status.md
  references/         ← Supporting documents agents load at runtime
    owasp-checklist.md
    severity-matrix.md
    report-template.md
    rest-api-checklist.md
    playwright-config.md
    engineering-artifacts.md
  examples/           ← Example configurations
    AGENTS.md         ← Project rules template
    opencode.json     ← Example OpenCode config
  docs/               ← Documentation
    EXPERT_GUIDE.md   ← How each expert works
    SDLC_GUIDE.md     ← Full SDLC workflow guide
    CONTRIBUTING.md   ← How to add new experts
  install.sh          ← Installation script
  uninstall.sh        ← Removal script
```

## Adding New Experts

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for the full guide. Quick summary:

1. Create `agents/my-expert.md` with the agent definition
2. Create `skills/my-expert.md` with the slash command trigger
3. Add any reference documents to `references/`
4. Update this README
5. Submit a PR

## License

Apache 2.0 — Use freely, modify, distribute.

## Credits

Built by BPM. Expert methodologies developed through extensive use with Claude Code and adapted for the OpenCode ecosystem.
