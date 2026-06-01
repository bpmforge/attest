[🏠 Index](README.md)  |  [← Tool System](04-tools.md)  |  [SDLC Workflow →](06-sdlc-workflow.md)

---

# 5. Agent System

### 5.1 Agent Catalog

| Agent | Skill | Domain | Mode |
|-------|-------|--------|------|
| `sdlc-lead` | `/sdlc` | Orchestrator — routes, tracks, delegates | primary |
| `coding-agent` | `/code` | Doc-driven implementation, anti-slop rules | primary |
| `security-auditor` | `/security` | OWASP, threat modeling, CVE, Semgrep | primary |
| `code-reviewer` | `/review-code` | Code health, complexity, duplication, tech debt | primary |
| `performance-engineer` | `/perf` | Profiling, benchmarks, bottleneck diagnosis | primary |
| `test-engineer` | `/test-expert` | Playwright, vitest, test strategy, coverage | primary |
| `db-architect` | `/dba` | Schema design, migrations, query optimization | primary |
| `api-designer` | `/api-design` | REST/GraphQL contracts, OpenAPI | primary |
| `ux-engineer` | `/ux` | UX workflows, WCAG, component architecture | primary |
| `frontend-design` | `/frontend` | Visual implementation, typography, design systems | primary |
| `sre-engineer` | `/devops` | CI/CD, runbooks, monitoring, deployment | primary |
| `container-ops` | `/containers` | Podman/Docker, compose, image debugging | primary |
| `git-expert` | `/git-expert` | Branching, commits, releases, forensics | primary |
| `researcher` | `/research` | Web research, tech comparisons, feasibility | primary |
| `architecture-designer` | `/arch` | Module structure, plugin points, infra topology | primary |

### 5.2 Shared Protocol Files

| File | Purpose |
|------|---------|
| `HANDOFF_TEMPLATES.md` | Canonical HANDOFF block format (4 templates) |
| `LOOP_PREVENTION.md` | Hard caps on tool loops (3 classes: failure, schema, success) |
| `BOUNDED_TASK_CONTRACT.md` | 6 rules governing every HANDOFF specialist |
| `SCOPE_BOUNDARY.md` | Stay-in-lane rules — which agent does what |
| `FIX_VERIFY_LOOP.md` | Protocol for fix → verify → confirm cycles |
| `RALPH_WIGGUM_LOOP.md` | Deep-mode exhaustive inventory loop |
| `ANTI_SLOP_RULES.md` | Anti-overengineering rules for coding-agent |
| `RESEARCH_TOOLS.md` | Web research tool usage guide |
| `CONTEXT_BUDGET.md` | Context window management for small LLMs |
| `LOCAL_LLM_PRIMER.md` | Tips for local LLM quirks (Qwen, Gemma, etc.) |
| `MODEL_ADAPTER.md` | Per-model behavior adaptations |
| `SESSION_PRIMER.md` | Session startup checklist |
| `HANDOFF_QUICK_REF.md` | Quick reference for HANDOFF format |

### 5.3 Agent Hierarchy

```mermaid
graph TD
    User([User])
    User -->|"skill command"| LEAD["sdlc-lead<br/>Orchestrator"]

    LEAD -->|HANDOFF| COD[coding-agent]
    LEAD -->|HANDOFF| SEC[security-auditor]
    LEAD -->|HANDOFF| REV[code-reviewer]
    LEAD -->|HANDOFF| PERF[performance-engineer]
    LEAD -->|HANDOFF| TEST[test-engineer]
    LEAD -->|HANDOFF| DBA[db-architect]
    LEAD -->|HANDOFF| API[api-designer]
    LEAD -->|HANDOFF| UX[ux-engineer]
    LEAD -->|HANDOFF| FRONT[frontend-design]
    LEAD -->|HANDOFF| SRE[sre-engineer]
    LEAD -->|HANDOFF| CONT[container-ops]
    LEAD -->|HANDOFF| GIT[git-expert]
    LEAD -->|HANDOFF| RES[researcher]
    LEAD -->|HANDOFF| ARCH[architecture-designer]

    subgraph SDLC_Modes["SDLC Mode Files (loaded by sdlc-lead)"]
        M1["sdlc-init-mode.md<br/>Mode 1: New Project"]
        M2["sdlc-onboard-mode.md<br/>Mode 2: Onboard"]
        M3["sdlc-feature-mode.md<br/>Mode 3: Feature"]
        M4["sdlc-improve-mode.md<br/>Mode 4: Improve"]
        M3a[sdlc-init-phases-0-2.md]
        M3b[sdlc-init-phase-3.md]
        M3c[sdlc-init-phase-4.md]
        M3d[sdlc-init-phase-5.md]
        M3e[sdlc-init-phases-3-4.md]
    end

    LEAD --> SDLC_Modes
```

---

---

[🏠 Index](README.md)  |  [← Tool System](04-tools.md)  |  [SDLC Workflow →](06-sdlc-workflow.md)
