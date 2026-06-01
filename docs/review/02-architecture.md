[🏠 Index](README.md)  |  [← System Overview](01-overview.md)  |  [Plugin Hook System →](03-plugin-hooks.md)

---

# 2. Component Architecture

```mermaid
graph TB
    subgraph User["User"]
        U["OpenCode CLI / Editor"]
    end

    subgraph Plugin["OpenCode Plugin Layer"]
        EH["expert-hooks.ts<br/>tool.execute.before<br/>tool.execute.after"]
    end

    subgraph Tools["Custom Tools (18)"]
        BASH[bash.ts]
        RUN[run.ts]
        SEMP[semgrep-scan.ts]
        TASK[task.ts]
        LOOP[loop-detector.ts]
        LOG[log-parser.ts]
        PWB[playwright-web.ts]
        PWT[playwright-test.ts]
        DEP[deploy.ts]
        GRP[grep-mcp.ts]
        POM[pomodoro.ts]
        OTH["write, append, update,<br/>file-info, simplify-file,<br/>semgrep-rule, task"]
    end

    subgraph Agents["Agent System (15 agents + 6 SDLC mode files)"]
        LEAD["sdlc-lead.md<br/>Orchestrator"]
        subgraph Specialists["Specialist Agents"]
            SEC[security-auditor]
            CODE[coding-agent]
            REV[code-reviewer]
            PERF[performance-engineer]
            TEST[test-engineer]
            DBA[db-architect]
            API[api-designer]
            UX[ux-engineer]
            SRE[sre-engineer]
            CONT[container-ops]
            GIT[git-expert]
            RES[researcher]
            ARCH[architecture-designer]
            FRONT[frontend-design]
        end
        subgraph SharedProto["Shared Protocols"]
            HT[HANDOFF_TEMPLATES.md]
            LP[LOOP_PREVENTION.md]
            BTC[BOUNDED_TASK_CONTRACT.md]
            SB[SCOPE_BOUNDARY.md]
            FVL[FIX_VERIFY_LOOP.md]
        end
    end

    subgraph Skills["Skills (24)"]
        SDLC["/sdlc"]
        SECURITY["/security"]
        REVIEW["/review-code"]
        PERF2["/perf"]
        TEST2["/test-expert"]
        OTHER2["/code /research /dba /ux<br/>/devops /containers /git<br/>/api-design /arch /frontend"]
    end

    subgraph Validators["Validation Gate System (36 scripts)"]
        PG[validate-phase-gate.sh]
        HG[run-handoff-gates.sh]
        CL[run-coverage-loop.sh]
        VLIST["validate-architecture<br/>validate-owasp<br/>validate-api-coverage<br/>validate-erd-coverage<br/>validate-tests<br/>validate-security-controls<br/>... 30 more"]
    end

    U -->|"invokes skill"| Skills
    Skills -->|"loads agent prompt"| Agents
    U -->|"LLM calls tool"| EH
    EH -->|"passes through"| Tools
    Tools -->|"spawns"| Validators
    LEAD -->|"reads"| SharedProto
    LEAD -->|"writes HANDOFF block"| Specialists
```

### Directory Structure

| Directory | Purpose |
|-----------|---------|
| `agents/` | Agent prompt files (`.md`) — one per specialist |
| `agents/shared/` | Shared protocol files (HANDOFF, LOOP_PREVENTION, etc.) |
| `agents/security/` | OWASP deep-mode methodology |
| `agents/code-review/` | Code review methodology |
| `agents/performance/` | Performance engineering methodology |
| `agents/templates/` | SDLC document templates |
| `skills/` | Slash command definitions (24 skills) |
| `commands/` | Alternative command files for SDLC workflow |
| `tools/` | Custom TypeScript tool implementations (18 tools) |
| `plugins/` | OpenCode plugin (`expert-hooks.ts`) |
| `references/` | Curated reference checklists (OWASP, REST, git, etc.) |
| `scripts/` | Shell scripts (validators, install helpers, detect SDLC state) |
| `scripts/validators/` | 36 phase gate validators |
| `docs/` | Project documentation |

---

---

[🏠 Index](README.md)  |  [← System Overview](01-overview.md)  |  [Plugin Hook System →](03-plugin-hooks.md)
