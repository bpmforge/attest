[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [SDLC Orchestrator →](02-sdlc-orchestrator.md)

---

# 5.1 Agent Overview

## Agent Catalog

| Agent file | Skill | Domain |
|-----------|-------|--------|
| `sdlc-lead.md` | `/sdlc` | Orchestrator — routes, tracks, delegates |
| `coding-agent.md` | `/code` | Doc-driven implementation, anti-slop rules |
| `security-auditor.md` | `/security` | OWASP, Semgrep, attack chains, CVE |
| `code-reviewer.md` | `/review-code` | Code health, complexity, tech debt |
| `performance-engineer.md` | `/perf` | Profiling, benchmarks, bottleneck diagnosis |
| `architecture-designer.md` | `/arch` | Module structure, plugin points, infra topology |
| `test-engineer.md` | `/test-expert` | Playwright, vitest, test strategy, coverage |
| `db-architect.md` | `/dba` | Schema design, migrations, query optimization |
| `api-designer.md` | `/api-design` | REST/GraphQL contracts, OpenAPI |
| `researcher.md` | `/research` | Web research, tech comparisons, feasibility |
| `ux-engineer.md` | `/ux` | UX workflows, WCAG, component architecture |
| `frontend-design.md` | `/frontend` | Visual implementation, tokens, design systems |
| `sre-engineer.md` | `/devops` | CI/CD, runbooks, monitoring, deployment |
| `container-ops.md` | `/containers` | Podman/Docker, compose, image debugging |
| `git-expert.md` | `/git-expert` | Branching, commits, releases, forensics |

## Shared Protocol Files

All agents load these from `agents/shared/` as needed:

| File | Purpose |
|------|---------|
| `HANDOFF_TEMPLATES.md` | Canonical HANDOFF block format (4 templates) |
| `LOOP_PREVENTION.md` | Hard caps on tool loops (failure, schema, success classes) |
| `BOUNDED_TASK_CONTRACT.md` | 6 rules for every HANDOFF specialist |
| `SCOPE_BOUNDARY.md` | Stay-in-lane rules — which agent owns what |
| `FIX_VERIFY_LOOP.md` | Protocol for fix → verify → confirm cycles |
| `RALPH_WIGGUM_LOOP.md` | Deep-mode exhaustive inventory loop |
| `ANTI_SLOP_RULES.md` | Anti-overengineering rules for coding-agent |
| `RESEARCH_TOOLS.md` | Web research tool usage guide |
| `BOOK_PROTOCOL.md` | Deliverables over 300 lines must be books |
| `CONTEXT_BUDGET.md` | Context window management for small LLMs |
| `SESSION_PRIMER.md` | Session startup checklist |

## Agent Hierarchy

```mermaid
graph TD
    U([User])
    U -->|"skill command"| LEAD["sdlc-lead (orchestrator)"]

    LEAD -->|HANDOFF| COD[coding-agent]
    LEAD -->|HANDOFF| SEC[security-auditor]
    LEAD -->|HANDOFF| REV[code-reviewer]
    LEAD -->|HANDOFF| PERF[performance-engineer]
    LEAD -->|HANDOFF| ARCH[architecture-designer]
    LEAD -->|HANDOFF| TEST[test-engineer]
    LEAD -->|HANDOFF| DBA[db-architect]
    LEAD -->|HANDOFF| API[api-designer]
    LEAD -->|HANDOFF| RES[researcher]
    LEAD -->|HANDOFF| UX[ux-engineer]
    LEAD -->|HANDOFF| FRONT[frontend-design]
    LEAD -->|HANDOFF| SRE[sre-engineer]
    LEAD -->|HANDOFF| CONT[container-ops]
    LEAD -->|HANDOFF| GIT[git-expert]

    subgraph Modes["SDLC Mode Files (loaded on demand)"]
        M1["sdlc-init-mode — Mode 1: New Project"]
        M2["sdlc-onboard-mode — Mode 2: Onboard"]
        M3["sdlc-feature-mode — Mode 3: Feature"]
        M4["sdlc-improve-mode — Mode 4: Improve"]
    end

    LEAD --> Modes
```

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [SDLC Orchestrator →](02-sdlc-orchestrator.md)
