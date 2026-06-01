# BPM OpenCode Experts — Comprehensive System Review

**Date:** 2026-06-01  
**Version reviewed:** v0.11.1  
**Reviewer:** Claude Code (automated + manual walkthrough)  
**Scope:** Full system — plugin, tools, agents, skills, validators, install

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Architecture](#2-component-architecture)
3. [Plugin Hook System (expert-hooks.ts)](#3-plugin-hook-system)
4. [Tool System](#4-tool-system)
5. [Agent System](#5-agent-system)
6. [SDLC Workflow](#6-sdlc-workflow)
7. [HANDOFF Delegation Protocol](#7-handoff-delegation-protocol)
8. [Validation Gate System](#8-validation-gate-system)
9. [Installation Flow](#9-installation-flow)
10. [Code Health Findings](#10-code-health-findings)
11. [Security Findings](#11-security-findings)
12. [Performance Findings](#12-performance-findings)
13. [Improvement Recommendations](#13-improvement-recommendations)

---

## 1. System Overview

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

## 2. Component Architecture

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

## 3. Plugin Hook System

The `plugins/expert-hooks.ts` file is the runtime safety net. It intercepts every tool call OpenCode makes, before and after execution.

### 3.1 Before-Execution Hook

Runs before every `bash`, `run`, `write`, or `edit` tool call.

```mermaid
sequenceDiagram
    participant LLM as LLM (any model)
    participant OC as OpenCode Runtime
    participant HB as expert-hooks.ts<br/>tool.execute.before
    participant T as Tool (bash/run/write/edit)

    LLM->>OC: Call tool(name, args)
    OC->>HB: before(input, output)
    
    alt tool is "bash" or "run"
        HB->>HB: Check DANGEROUS_BASH patterns<br/>(8 regex rules)
        alt pattern matches
            HB-->>OC: throw Error("BLOCKED: ...")
            OC-->>LLM: Tool error — blocked
        end
    end
    
    alt tool is "write" or "edit"
        HB->>HB: Extract filePath from args
        HB->>HB: Check BLOCKED_FILE_PATTERNS<br/>(.env, .key, .pem, credentials.json, SSH keys)
        alt pattern matches
            HB-->>OC: throw Error("BLOCKED: ...")
            OC-->>LLM: Tool error — blocked
        end
    end
    
    HB-->>OC: (no throw = pass through)
    OC->>T: Execute tool(args)
    T-->>OC: result
    OC-->>LLM: tool result
```

### 3.2 After-Execution Hook (Write/Edit quality checks)

Runs after every `write` or `edit` call completes, in parallel.

```mermaid
sequenceDiagram
    participant OC as OpenCode Runtime
    participant HA as expert-hooks.ts<br/>tool.execute.after
    participant FMT as Formatter<br/>(prettier/black/gofmt/rustfmt)
    participant LINT as Linter<br/>(eslint/ruff)
    participant TSC as Type Checker<br/>(tsc --noEmit)
    participant SS as Secret Scanner<br/>(8 regex patterns)

    OC->>HA: after(input, _output)
    HA->>HA: Check: is write/edit tool?
    HA->>HA: Extract filePath
    HA->>HA: Check SKIP_EXTENSIONS<br/>(images, binaries, lock files)
    
    alt extension not skipped
        HA->>HA: Promise.allSettled([...])
        
        par Format
            HA->>FMT: format(filePath, ext)
            Note over FMT: Best-effort, failure = console.warn
        and Lint
            HA->>LINT: lint(filePath, ext)
            Note over LINT: eslint for TS/JS, ruff for Python
        and Type Check
            HA->>TSC: tsc --noEmit (TS/TSX only)
        and Secret Scan
            HA->>SS: cat filePath -> test 8 patterns
            Note over SS: AWS keys, API keys, passwords,<br/>bearer tokens, DB connection strings,<br/>PEM keys, auth tokens
        end
        
        Note over HA: All run concurrently,<br/>failures logged, never blocking
    end
    
    HA-->>OC: (hook complete)
```

### 3.3 Blocklist Reference

**Dangerous Bash Commands:**

| Pattern | Blocks |
|---------|--------|
| `rm -rf /` variants | Filesystem wipe |
| `DROP TABLE` | Database destruction |
| `DELETE FROM` without `WHERE` | Mass row deletion |
| `git push --force` | Remote history rewrite |
| `git reset --hard` | Uncommitted work loss |
| `npm publish` | Unintended registry publish |
| `curl/wget \| bash` | Remote code execution |

**Blocked File Paths:**

| Pattern | Blocks |
|---------|--------|
| `.env`, `.env.*` | Environment secrets |
| `credentials.json`, `secrets.json` | Credential files |
| `*.key`, `*.pem`, `*.p12`, `*.pfx` | Private keys |
| `id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa` | SSH private keys |

**Secret Patterns Detected:**

| Pattern | Detects |
|---------|---------|
| `api[_-]?key\s*[:=]\s*["'][A-Za-z0-9_-]{16,}` | API keys |
| `AKIA[0-9A-Z]{16}` | AWS Access Key IDs |
| `aws[_-]?secret[_-]?access[_-]?key` | AWS Secret Access Keys |
| `-----BEGIN ... PRIVATE KEY-----` | PEM private keys |
| `password\s*[:=]\s*["'][^"']{4,}` | Hardcoded passwords |
| `bearer\|token\s*[:=]\s*["'][A-Za-z0-9_-.]{20,}` | Bearer/auth tokens |
| `postgres://user:pass@host` | DB connection strings |
| `SECRET\|TOKEN\|PRIVATE_KEY\s*=\s*["'][A-Za-z0-9]{16,}` | Generic secrets |

---

## 4. Tool System

### 4.1 Tool Catalog

| Tool | File | Lines | Purpose |
|------|------|-------|---------|
| `bash` | `bash.ts` | 67 | Execute arbitrary shell commands with timeout |
| `run` | `run.ts` | 65 | Alias of bash — execute shell commands |
| `semgrep-scan` | `semgrep-scan.ts` | 65 | Run Semgrep security scans on codebase |
| `task` | `task.ts` | 238 | Delegate to specialist agents via `opencode run --agent` |
| `loop-detector` | `loop-detector.ts` | 176 | Detect and break infinite loops in agent behavior |
| `log-parser` | `log-parser.ts` | 183 | Parse and structure log output from tools |
| `playwright-web` | `playwright-web.ts` | 106 | Browser automation for web research |
| `playwright-test` | `playwright-test.ts` | 63 | Run Playwright E2E tests |
| `deploy` | `deploy.ts` | 102 | Execute deployment operations |
| `grep-mcp` | `grep-mcp.ts` | 115 | Search file contents with regex |
| `pomodoro` | `pomodoro.ts` | 168 | Time-box tasks with Pomodoro timer |
| `write` | `write.ts` | 22 | Write content to a file |
| `append` | `append.ts` | 30 | Append content to a file |
| `update` | `update.ts` | 22 | Update/replace file content |
| `file-info` | `file-info.ts` | 42 | Get file metadata |
| `simplify-file` | `simplify-file.ts` | 81 | Simplify/compress a file's content |
| `semgrep-rule` | `semgrep-rule.ts` | 67 | Create custom Semgrep rules |
| `test-runner` | `test-runner.ts` | 183 | Run test suites and parse results |

### 4.2 Shell Command Execution Flow

Both `bash.ts` and `run.ts` follow the same pattern:

```mermaid
sequenceDiagram
    participant LLM as LLM
    participant BT as bash.ts / run.ts
    participant Guard as Expert Hook (before)
    participant OS as OS Process

    LLM->>Guard: bash({command: "ls -la", workdir?, timeout?})
    Guard->>Guard: Check DANGEROUS_BASH patterns
    
    alt command is safe
        Guard->>BT: execute(args, context)
        BT->>BT: Validate args.command present
        
        alt args.command missing
            BT-->>LLM: "[LOOP STOP] bash called without command..."
        end
        
        BT->>OS: spawn(command, {cwd, shell:true})
        
        par stdout collection
            OS-->>BT: data chunks -> output string
        and stderr collection
            OS-->>BT: stderr chunks -> errorOutput
        and timeout
            BT->>BT: setTimeout(timeout*1000)
        end
        
        alt process completes (exit 0)
            BT-->>LLM: output string
        else non-zero exit
            BT-->>LLM: Error("exit code N: stderr")
        else timeout
            BT->>OS: proc.kill("SIGTERM")
            BT-->>LLM: Error("timed out after Ns")
        end
    else command blocked
        Guard-->>LLM: Error("BLOCKED: reason")
    end
```

### 4.3 Task Delegation Flow (task.ts)

The `task.ts` tool spawns a sub-agent by running `opencode run --agent <type>`.

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead (LLM)
    participant TT as task.ts
    participant OC as opencode subprocess
    participant SA as Specialist Agent

    LEAD->>TT: task({agent, prompt, timeout})
    TT->>TT: context.metadata({title: "task: agent — starting..."})
    TT->>OC: spawn("opencode run --agent agent --format json prompt")
    
    loop Every 5 seconds (heartbeat)
        TT->>TT: update metadata title with elapsed time + last snippet
    end
    
    loop stdout data events
        OC-->>TT: JSON event lines
        TT->>TT: processLine() — parse assistant messages
        TT->>TT: extract lastSnippet for real-time progress
    end
    
    OC->>SA: Load agent prompt file from ~/.config/opencode/agents/
    SA->>SA: Execute multi-phase workflow
    SA-->>OC: JSON event stream (messages, tool calls, results)
    OC-->>TT: exit 0 or non-zero
    
    alt exit 0
        TT->>TT: extractText(raw) — parse assistant content from JSON stream
        TT-->>LEAD: Plain text summary of findings
    else timeout
        TT->>OC: proc.kill("SIGTERM")
        TT-->>LEAD: "[task: TIMEOUT] Partial output: ..."
    else spawn error
        TT-->>LEAD: "[task: spawn error] Could not start opencode: ..."
    end
```

> **Note:** `task.ts` is available as a tool, but the SDLC lead's prompt explicitly instructs it NOT to use `task()` because it was found to timeout in production for multi-phase agents. Delegation instead uses HANDOFF blocks — see Section 7.

---

## 5. Agent System

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

## 6. SDLC Workflow

The SDLC Lead orchestrates four distinct modes based on user intent.

### 6.1 Mode Routing

```mermaid
flowchart TD
    Start([User types command or natural language])
    Start --> Detect{Detect intent}
    
    Detect -->|"build new app / start project"| M1["Mode 1: /sdlc init"]
    Detect -->|"understand this codebase / onboard"| M2["Mode 2: /sdlc onboard"]
    Detect -->|"add X feature / build X"| M3["Mode 3: /sdlc feature"]
    Detect -->|"improve / audit / review / find gaps"| M4["Mode 4: /sdlc improve"]
    Detect -->|"single file/function review"| Direct["Direct to specialist<br/>/review-code or /security"]
    
    M1 --> State{Check SDLC state<br/>detect-sdlc-state.sh}
    State -->|fresh| Interview["Discovery Interview<br/>7 questions"]
    State -->|partial| Resume["Resume from<br/>lowest incomplete phase"]
    State -->|brownfield| Onboard["Recommend /sdlc onboard first"]
    State -->|complete| Improve["Offer /sdlc improve or /sdlc feature"]
    
    Interview --> Confirm[User confirms summary]
    Confirm --> Phase0["Phase 0: Ideation<br/>VISION.md, COMPETITIVE_ANALYSIS.md"]
    Phase0 --> Gate0{Gate 0 pass?}
    Gate0 -->|yes| Phase1["Phase 1: Planning<br/>SCOPE, RISKS, CONSTRAINTS, PERSONAS"]
    Gate0 -->|no| Phase0
    Phase1 --> Gate1{Gate 1 pass?}
    Gate1 --> Phase2["Phase 2: Requirements<br/>SRS, USER_STORIES, USE_CASES"]
    Phase2 --> GateA{Human Gate A<br/>Requirements locked}
    GateA -->|approved| Phase3["Phase 3: Design<br/>ARCHITECTURE, API, DB, SECURITY..."]
    Phase3 --> Gate3{Gate 3 pass?}
    Gate3 --> Phase35["Phase 3.5: Test Design<br/>TEST_DESIGN.md"]
    Phase35 --> GateB{Human Gate B<br/>Contracts frozen}
    GateB -->|approved| Phase4["Phase 4: Implementation<br/>coding-agent waves"]
    Phase4 --> Gate4{Gate 4 pass?}
    Gate4 --> Phase5["Phase 5: Release<br/>FIX_BACKLOG closed, reviews APPROVED"]
    Phase5 --> Done([Ship])
```

### 6.2 Mode 4 (Audit and Improve) Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant LEAD as sdlc-lead
    participant REV as code-reviewer
    participant SEC as security-auditor
    participant PERF as performance-engineer
    participant UX as ux-engineer
    participant COD as coding-agent
    participant GIT as git-expert

    U->>LEAD: /sdlc improve ["focus"]
    LEAD->>LEAD: Read sdlc-improve-mode.md
    LEAD->>U: Discovery Interview (scope, vision, tolerance)
    U-->>LEAD: Answers
    LEAD->>LEAD: Write docs/IMPROVE_CONTEXT.md
    LEAD->>U: Confirm summary

    Note over LEAD: Step 2 — Parallel Audit Fan-Out

    par Audit wave (all in parallel)
        LEAD->>U: HANDOFF #1 -> code-reviewer
        U->>REV: Open new session, /review-code
        REV->>REV: 4-pass review (security, perf, correctness, style)
        REV-->>U: docs/improve/CODE_HEALTH_REPORT.md
        U-->>LEAD: code-reviewer done
    and
        LEAD->>U: HANDOFF #2 -> security-auditor
        U->>SEC: Open new session, /security
        SEC->>SEC: 5-phase audit (understand, scan, owasp, verify, chains)
        SEC-->>U: docs/improve/SECURITY_REPORT.md
        U-->>LEAD: security-auditor done
    and
        LEAD->>U: HANDOFF #3 -> performance-engineer
        U->>PERF: Open new session, /perf
        PERF->>PERF: Profile, benchmark, bottleneck analysis
        PERF-->>U: docs/improve/PERF_REPORT.md
        U-->>LEAD: performance-engineer done
    and
        LEAD->>U: HANDOFF #4 -> ux-engineer (optional)
        U->>UX: Open new session, /ux
        UX->>UX: UX audit, WCAG check, workflow analysis
        UX-->>U: docs/improve/UX_REPORT.md
        U-->>LEAD: ux-engineer done
    end

    LEAD->>LEAD: Synthesize all reports
    LEAD->>LEAD: Write docs/improve/IMPROVEMENT_BACKLOG.md
    LEAD->>U: Present ranked backlog (CRITICAL/HIGH/MEDIUM/LOW)
    U-->>LEAD: Approve priorities

    Note over LEAD: Step 5 — Fix Execution Waves

    loop For each approved priority tier
        LEAD->>U: HANDOFF -> coding-agent (fix wave)
        U->>COD: Open session, /code
        COD->>COD: Fix items from FIX_BACKLOG at cited file:line
        COD-->>U: FIX_SUMMARY_*.md
        U-->>LEAD: coding-agent done

        LEAD->>U: HANDOFF -> specialist (re-verify)
        U->>REV: Targeted re-verification
        REV-->>U: VERIFY_*.md (PASS/FAIL per row)
        U-->>LEAD: code-reviewer done
    end

    LEAD->>U: HANDOFF -> git-expert
    U->>GIT: PR to main
    GIT-->>U: PR created
```

---

## 7. HANDOFF Delegation Protocol

Since `task()` does not work in OpenCode, all agent delegation uses explicit HANDOFF blocks.

### 7.1 HANDOFF Lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant LEAD as sdlc-lead
    participant DISK as Filesystem
    participant SPEC as Specialist Agent
    participant VAL as Validators

    LEAD->>DISK: Write docs/work/sdlc-state.md<br/>(mode, phase, awaiting agent, next step)
    LEAD->>DISK: Write docs/work/context-for-agent.md<br/>(full context packet)
    LEAD->>U: Emit HANDOFF block with ════ delimiters
    Note over U: User opens new OpenCode session,<br/>types /skill, pastes HANDOFF body

    U->>SPEC: "SDLC-TASK for agent-name: ..."
    SPEC->>DISK: Read BOUNDED_TASK_CONTRACT.md
    SPEC->>DISK: Read context-for-agent.md
    SPEC->>DISK: Execute multi-phase workflow
    SPEC->>DISK: Write files within WRITE-SCOPE only
    SPEC->>DISK: Write Completion Manifest
    SPEC-->>U: Print verbatim completion phrase

    U->>LEAD: "[agent] done"
    LEAD->>DISK: Read docs/work/sdlc-state.md (confirm which agent)
    LEAD->>VAL: run-handoff-gates.sh --scope --manifest [--coverage]
    
    VAL->>VAL: Gate 1: git status within WRITE-SCOPE
    VAL->>VAL: Gate 2: Completion Manifest schema valid
    VAL->>VAL: Gate 3: Coverage validator (optional)
    
    alt All gates pass
        VAL-->>LEAD: exit 0
        LEAD->>LEAD: Score 1-10
        alt Score >= 7
            LEAD->>DISK: Append DELEGATION_LOG.md DONE
            LEAD->>LEAD: Continue to next step
        else Score 5-6
            LEAD->>U: Request revision (up to 3x)
        else Score < 5
            LEAD->>U: Auto-fail — specific corrections needed
        end
    else Gate fails
        VAL-->>LEAD: exit 1 + JSON gap list
        LEAD->>U: Return gaps to specialist for REVISE
    end
```

### 7.2 HANDOFF Block Format

```mermaid
flowchart LR
    A["════════════════\nHANDOFF #N -> agent\nUSER: copy below\n════════════════"] --> B["SDLC-TASK for agent-name:\n\nROLE: ...\n\nCONTEXT:\n- BOUNDED_TASK_CONTRACT.md\n- context-for-agent.md\n- relevant source files\n\nWRITE-SCOPE:\n- dir/ only\n\nYOUR TASK:\n2-4 sentence description\n\nPRODUCE:\n- exact output files\n\nWhen done print exactly:\n'agent done — ...'"] --> C["════════════════\nEND HANDOFF #N\n════════════════"]
```

---

## 8. Validation Gate System

### 8.1 Phase Gate Structure

```mermaid
flowchart TD
    subgraph Gates["Phase Gate Chain"]
        P0["Phase 0 Gate<br/>File existence only<br/>VISION.md, COMPETITIVE_ANALYSIS.md"]
        P1["Phase 1 Gate<br/>File existence + prereq: phase-0<br/>SCOPE, RISKS, CONSTRAINTS, PERSONAS"]
        P2["Phase 2 Gate<br/>use-cases + user-stories + traceability<br/>prereq: phase-1"]
        P3["Phase 3 Gate<br/>architecture + api-coverage + sequence-coverage<br/>+ erd-coverage + c3-coverage + entry-points<br/>+ tech-stack + adrs + security-controls<br/>prereq: phase-2"]
        P35["Phase 3.5 Gate<br/>validate-test-design<br/>prereq: phase-3"]
        P4["Phase 4 Gate<br/>build + lint + tests + tests-mapping + migrations<br/>prereq: phase-3.5"]
        P5["Phase 5 Gate (Release)<br/>FIX_BACKLOG closed + reviews APPROVED<br/>+ RUNTIME PASS<br/>prereq: phase-4"]
    end

    P0 -->|"✅ lock file written"| P1
    P1 -->|"✅ lock file written"| P2
    P2 -->|"✅ lock file written"| P3
    P3 -->|"✅ lock file written"| P35
    P35 -->|"✅ lock file written"| GateB{Human Gate B}
    GateB -->|"user approves"| P4
    P4 -->|"✅ lock file written"| P5
    P5 -->|"✅ all pass"| Ship([Ship])

    subgraph Standalone["Standalone Gates"]
        OD["onboard-deep<br/>inventory + architecture<br/>+ erd-coverage + sequence-coverage"]
        SD["security-deep<br/>owasp + attack-chains"]
    end
```

### 8.2 Coverage Loop Protocol

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant CL as run-coverage-loop.sh
    participant VAL as Specific Validator
    participant SPEC as Specialist Agent

    LEAD->>CL: run-coverage-loop.sh phase-N
    
    loop Max 3 iterations
        CL->>VAL: Run phase-N validators
        VAL-->>CL: exit 0 (clean) or exit 1 (gaps) or exit 2 (exhausted)
        
        alt exit 0 — clean
            CL-->>LEAD: All rows covered
            LEAD->>LEAD: Mark tracker DONE, advance
            Note over LEAD: Loop ends
        else exit 1 — gaps remain (iter < 3)
            CL-->>LEAD: docs/work/COVERAGE_LOOP_phase_date.md
            LEAD->>LEAD: Read gap list
            LEAD->>SPEC: HANDOFF — fill specific gaps
            SPEC-->>LEAD: Gaps filled
        else exit 2 — 3 iterations exhausted
            CL-->>LEAD: Escalation block
            LEAD->>LEAD: Read RALPH_WIGGUM_LOOP.md
            LEAD->>LEAD: Offer: waiver / lower-bar / specialist / manual
        end
    end
```

---

## 9. Installation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant IS as install.sh
    participant GH as GitHub / Gitea
    participant FS as ~/.config/opencode/
    participant NPM as npm
    participant SEMP as semgrep (optional)

    U->>GH: git clone bpm-opencode-experts
    U->>IS: ./install.sh [--project] [--link] [--semgrep] [--pullmd]
    
    IS->>IS: Platform check (macOS/Linux/WSL only)
    IS->>IS: Parse flags: MODE, METHOD, INSTALL_SEMGREP
    
    alt MODE = global (default)
        IS->>FS: Create ~/.config/opencode/{agents,skills,tools,commands,references,scripts,plugins}/
        IS->>FS: Copy / symlink agents/*.md
        IS->>FS: Copy / symlink skills/**
        IS->>FS: Copy / symlink tools/*.ts
        IS->>FS: Copy / symlink plugins/expert-hooks.ts
        IS->>FS: Copy / symlink references/*.md
        IS->>FS: Copy / symlink scripts/
    else MODE = project
        IS->>FS: Create .opencode/ in current directory
        IS->>FS: Copy / symlink to .opencode/
    end
    
    IS->>FS: Register plugin in opencode.json
    IS->>NPM: npm install (for plugin dependencies)
    
    alt INSTALL_SEMGREP = true
        IS->>SEMP: Install semgrep binary
        IS->>SEMP: Clone community rules (trailofbits, elttam, gitlab, 0xdea)
        IS->>FS: Copy 186 custom rules to ~/.config/opencode/.semgrep/
    end
    
    IS->>IS: Run validate-tools.js (verify all tools have valid exports)
    IS-->>U: Installation complete
```

---

## 10. Code Health Findings

*The following findings are based on automated code health review of all tools, plugin, and scripts.*

### CRITICAL

**C-001: expert-hooks.ts `before` hook reads `output.args` instead of `input.args` — dangerous command blocking never fires**

`plugins/expert-hooks.ts:132-133`:

```typescript
"tool.execute.before": async (input, output) => {
  const command: string = output.args?.command ?? "";
```

The hook signature is `(input, output)`. For `.before`, `output` is the pending result (not yet available). The tool arguments are on `input.args`, not `output.args`. This means `output.args?.command` is always `undefined`, the `?? ""` fallback always wins, and **no bash command is ever checked against DANGEROUS_BASH**. The `.after` hook correctly reads `input.args` (lines 163-164). The security blocklist is completely inoperative.

- **Fix:** Change line 133 to `const command: string = input.args?.command ?? "";`

**C-002: pomodoro.ts uses Deno API in a Node.js runtime — tool is completely broken**

`tools/pomodoro.ts:120,136,146,149` — All state persistence functions call `Deno.readTextFile`, `Deno.writeTextFile`, `Deno.statSync`, `Deno.mkdirSync`. OpenCode runs on Node.js, not Deno. Every invocation of `start`, `stop`, `status`, or `reset` throws `ReferenceError: Deno is not defined`.

- **Fix:** Replace `Deno.*` calls with `fs/promises` (same pattern as `loop-detector.ts`).

**C-003: simplify-file.ts calls `spawn` without importing it — ReferenceError at runtime**

`tools/simplify-file.ts:48-63` — `attemptSimplification` calls `spawn()` but the file only imports `{ tool }` and `fs from "fs/promises"`. Any call throws `ReferenceError: spawn is not defined`.

- **Fix:** Add `import { spawn } from "child_process"` at top.

**C-004: simplify-file.ts description is wrong — `instructions` arg is completely ignored**

The description says the tool simplifies code per `instructions`. The actual implementation ignores `instructions` entirely and runs `sed -i s/  / /g` (whitespace collapse only). The tool description is misleading to the LLM calling it.

### HIGH

**H-001: bash.ts and run.ts are near-identical duplicates**

`tools/bash.ts` (67 lines) and `tools/run.ts` (65 lines) implement the same subprocess execution logic with identical `spawn` patterns, `stdout/stderr` collection, timeout handling, and error reporting. The only difference is the tool description string and the loop-stop return message text.

- `bash.ts:28-65` and `run.ts:28-64` — identical logic
- **Risk:** Bug fixes applied to one tool are not applied to the other. Already diverged in error message phrasing.
- **Fix:** Extract shared spawn logic into `tools/_lib/spawn.ts`, import from both tools.

**H-002: grep-mcp.ts uses `-L` flag incorrectly — wrong semantics for recursive/non-recursive**

`tools/grep-mcp.ts:80-83` — When `recursive: false`, the code pushes `-L` (print files NOT matching) instead of simply omitting `-r`. When `recursive: true`, no `-r` flag is added, so `grep` doesn't recurse into directories. Both cases are wrong.

- **Fix:** When `recursive:true`, push `-r`; when `recursive:false`, push nothing.

**H-003: log-parser.ts filter enum inconsistencies**

`tools/log-parser.ts:10-11` — The filter enum is `["_trace", "debug", "info", "warn", "error", "fatal"]` with `.default("all")`. Two bugs: (1) `"all"` is not in the enum, causing schema validation issues; (2) `"_trace"` has a stray leading underscore — `parseLogLine` produces `"trace"` (no underscore), so the filter never matches.

- **Fix:** Change `"_trace"` to `"trace"`; add `"all"` to the enum or change default to `"info"`.

**H-004: `require()` inside ESM execute functions — 4 tools affected**

`tools/semgrep-scan.ts:28`, `tools/semgrep-rule.ts:28`, `tools/playwright-test.ts:24`, `tools/test-runner.ts:65,68` all use `require()` inside execute functions in a package declared `"type": "module"`. This is non-standard and fragile.

- **Fix:** Move all `require()` calls to top-level ESM `import` statements.

**H-005: deploy.ts has a dead ternary that always selects "docker"**

`tools/deploy.ts:23` — `const toolName = process.platform === "darwin" ? "docker" : "docker"` — both branches are identical. The description says "Docker or Podman" but Podman is never selected.

**H-006: validate-tools.js only checks for string presence, not actual syntax or exports**

`scripts/validate-tools.js` validates tool files by checking if the string `"@opencode-ai/plugin"` and `"export default tool("` exist in the file. It doesn't parse the TypeScript or verify the tool actually exports a valid schema. Tools `pomodoro.ts` and `simplify-file.ts` (both broken at runtime) pass this validation.

- **Fix:** Add TypeScript syntax parsing or at minimum exclude commented-out exports.

### MEDIUM

**M-001: Implicit `any` type for `$` parameter in expert-hooks.ts**

`plugins/expert-hooks.ts:181` — `async function formatFile(filePath: string, ext: string, $: any)` — the `$` shell runner is typed as `any`, defeating TypeScript checking for all hook utilities.

- **Fix:** Import and use the correct type from `@opencode-ai/plugin`.

**M-002: task.ts default timeout (180s) too short for multi-phase agents**

`tools/task.ts:55` — 180s default is too short for security auditor, code reviewer, and other multi-phase agents that need 600-900s.

**M-003: loop-detector.ts mkdir race condition**

`tools/loop-detector.ts:131` — `void fs.mkdir(loopDir, { recursive: true })` fires without awaiting. If `saveLoopState` runs before the directory exists, `writeFile` throws `ENOENT`. State is silently lost on first write in a new directory.

- **Fix:** Await mkdir inside `saveLoopState`, or make `getLoopStateFilePath` async.

**M-004: task.ts always resolves on non-zero exit — errors invisible to caller**

`tools/task.ts:171-187` — Subprocess exits with code ≠ 0 produce `resolve()` not `reject()`, with an `[task: exit N]` string prefix. The calling LLM has no reliable error signal. Inconsistent with `bash.ts`/`run.ts` which reject on failure.

**M-005: test-runner.ts always resolves — test failures invisible to callers**

`tools/test-runner.ts:16-61` — Regardless of exit code, the tool resolves. Test failures are only detectable by parsing the embedded `Exit Code: N` string. Inconsistent with `playwright-test.ts` which rejects on failure.

**M-006: agents/templates/ and agents/shared/ not validated**

`scripts/validate-tools.js` validates only `agents/*.md` (top-level). Files in `agents/templates/`, `agents/shared/`, `agents/security/`, `agents/code-review/`, `agents/performance/` are not checked.

**M-007: pomodoro.ts `status` uses `args.duration` not stored `durationMinutes`**

`tools/pomodoro.ts:35,40-41` — Status calculation uses the current call's `args.duration` argument. If a different duration is passed to `status` than was used at `start`, progress percentage is wrong.

### LOW

**L-001: SKIP_EXTENSIONS missing common binary types**

`expert-hooks.ts:93` — Misses `.db`, `.sqlite`, `.bin`, `.exe`, `.jar`, `.class`, `.wasm`, `.mp4`, `.mp3`, `.pdf`.

**L-002: secretScan reads file via `cat` subprocess instead of `fs.readFile`**

`expert-hooks.ts:248` — Spawning `cat` adds ~5-15ms per write vs `fs.promises.readFile` (~0.1ms).

**L-003: No `tsconfig.json` in project root**

No TypeScript config for the project's own tools. Editor type-checking and `tsc` runs are ad hoc.

**L-004: `file_path` defensive lookup in expert-hooks.ts is dead code**

`expert-hooks.ts:146` — `output.args?.filePath ?? output.args?.file_path` — no tool in the project uses `file_path` (snake_case). The defensive lookup is unnecessary.

**L-005: semgrep-scan.ts path concatenation breaks on paths with spaces**

`tools/semgrep-scan.ts:13-25` — Command built via string concatenation with `shell: true`. Paths containing spaces (e.g., `/my project/src`) cause shell word-splitting failures.

**L-006: log-parser.ts `errorCount()` sort key is always 0**

`tools/log-parser.ts:191-194` — `generateSummary` sorts `errorMessages` by `errorCount()` which returns 0 for any message not matching `(\d+)\s+(errors?|failures?)/i`. Individual error log lines never match, so all sort keys are 0 — output is unordered.

**L-007: validate-tools.js dead filter guard**

`scripts/validate-tools.js:12` — `f !== "CUSTOM_TOOLS_GUIDE.md"` is dead code — the `.endsWith(".ts")` filter already excludes `.md` files.

---

## 11. Security Findings

*Based on automated security audit across plugin, tools, and install scripts.*

### CRITICAL

**S-CRIT-1: `tool.execute.before` only checks `bash` and `run` — 6 other shell-exec tools bypass all blocklist checks (OWASP A01, A03)**

`plugins/expert-hooks.ts:131-134` — The dangerous command check fires only when `input.tool === "bash" || input.tool === "run"`. Six other tools spawn shell commands with `shell: true` and are never intercepted:

| Tool | Shell command construction | Injection vector |
|------|--------------------------|-----------------|
| `semgrep-scan.ts` | `cmd = command + config + paths.join(" ")` | Any of `command`, `config`, `paths` |
| `semgrep-rule.ts` | String interpolation: `semgrep -e "${expression}"` | Close quote, inject second command |
| `playwright-web.ts` | `playwright-cli ${args.command.trim()}` | Any shell metachar in command |
| `playwright-test.ts` | `spawn(cmd + " " + paths, {shell:true})` | Both user-controlled |
| `grep-mcp.ts` | `grep ... <pattern> <path>` via `exec(cmd)` | Pattern with `$(cmd)` or metachar path |

Example: calling `semgrep-rule` with an expression payload that closes the double-quote and appends an injected command executes arbitrary shell code.

- **Fix:** Route ALL tool calls through DANGEROUS_BASH check regardless of tool name, or better: eliminate `shell: true` from all tools except `bash`/`run`.

**S-CRIT-2: `append.ts` and `update.ts` are not in `WRITE_TOOLS` — `.env`/credential file protection is bypassable (OWASP A01)**

`plugins/expert-hooks.ts:117` — `WRITE_TOOLS = new Set(["write", "edit"])`. The `append` and `update` tools write arbitrary file paths via `fs.appendFile`/`fs.writeFile` with no path check. An LLM can append to `~/.ssh/authorized_keys`, `~/.bashrc`, or any `.env` file using these tools with no hook intervention. `bash`/`run` with redirect operators also bypass the file pattern check entirely.

- **Fix:** Add `"append"` and `"update"` to `WRITE_TOOLS`. Add redirect-operator detection to the bash/run command check.

### HIGH

**S-H01: `rm -rf / --no-preserve-root` passes the rm regex (OWASP A05)**

`plugins/expert-hooks.ts:26` — The regex anchor is `\/\s*$` (end of string). Adding any trailing argument — the most destructive form being `--no-preserve-root` — breaks the anchor match. GNU `rm` requires `--no-preserve-root` to actually wipe `/`; the blocklist blocks the harmless form and permits the destructive one. Also unblocked: `rm -rf /*`, `rm -rf ~`, `rm -rf $HOME`.

- **Fix:** Drop the `$` anchor; add `~/` and `$HOME` as dangerous target patterns.

**S-H02: Only `| bash` is blocked — `| sh`, `| python`, `| node` are not (OWASP A05)**

`plugins/expert-hooks.ts:46` — Pattern only matches `| bash`. Unblocked: pipe to `sh`, `zsh`, `python3`, `node`, `perl`. Also unblocked: download-then-execute sequences (download script to `/tmp` then execute separately).

- **Fix:** Extend the pipe-to-interpreter pattern to cover all common shells and interpreters.

**S-H03: No path containment in write/append/update/grep tools (OWASP A01)**

`tools/write.ts`, `tools/append.ts`, `tools/update.ts`, `tools/grep-mcp.ts` — all accept absolute paths with no restriction to the project sandbox. `grep-mcp` can read any filesystem path. `write.ts`/`append.ts` can write to SSH authorized_keys for persistence.

- **Fix:** Validate that `filePath` is within `context.directory` using `path.resolve()` and prefix check.

**S-H04: Command injection in `semgrep-rule.ts` via unquoted expression interpolation (OWASP A03)**

`tools/semgrep-rule.ts` — The Semgrep expression argument is interpolated directly into a shell string. A crafted expression value can close the quote boundary and inject a second shell command.

- **Fix:** Use argv array with `shell: false`: `spawn("semgrep", ["-e", args.expression, "--lang", args.language, ...paths])`.

### MEDIUM

**S-M01: Secret scanner is post-write, advisory-only, misses modern token formats (OWASP A09)**

`plugins/expert-hooks.ts` — `secretScan` runs after the file is already written (`.after` hook), emits `console.warn` only (no blocking), and misses: GitHub PATs (`ghp_`, `gho_`, `ghs_`), OpenAI keys (`sk-` 51-char), Stripe keys (`sk_live_`, `sk_test_`), Slack tokens (`xoxb-`, `xoxp-`), GCP service accounts, JWT tokens (`eyJ` prefix), bare env assignments without surrounding quotes.

- **Fix:** Move critical patterns (PEM keys, AWS AKIA) to `tool.execute.before` with blocking. Expand patterns for modern token formats.

**S-M02: Repo-local eslint/tsc/prettier execute `eslint.config.js` from malicious cloned repos (OWASP A05)**

`tool.execute.after` auto-invokes `eslint`, `tsc`, and `prettier` using project-local configs. A malicious repo's `eslint.config.js` can `require()` arbitrary Node modules. Writing any file in a malicious cloned project triggers code execution via the post-write toolchain.

**S-M03: `grep-mcp.ts` unquoted pattern/path in `exec(cmd)` (OWASP A03)**

`tools/grep-mcp.ts` — pattern and path are appended with `.join(" ")` and passed to `exec()` (shell-interpreted). A pattern containing shell command substitution executes arbitrary code.

- **Fix:** Switch to `spawn("grep", argsArray, {shell: false})` with each element as a separate argv entry.

### LOW / INFO

**S-L01: `chmod 777` on pullmd data directory in install.sh (OWASP A05)**

`install.sh:~507` — World-writable data directory for SQLite containing conversation history. Should be `chmod 700`.

**S-L02: Semgrep community rule repos not pinned to commit hashes (OWASP A08)**

`install.sh` clones external repos at HEAD with no commit pin. `update-semgrep-rules.sh --bump` provides opt-in pinning but is not enforced at install time.

**S-L03: LaunchAgent/systemd unit installed without confirmation prompt (OWASP A05)**

The `--pullmd` flag installs a macOS LaunchAgent or systemd service without a `[Y/n]` prompt before creating the persistence mechanism.

**S-L04: Log injection via ANSI escape sequences in console.warn (OWASP A09)**

`lintFile` and `typeCheckFile` write up to 2000 characters of raw tool stdout to `console.warn` without stripping ANSI escape codes.

---

## 12. Performance Findings

### CRITICAL

**P-C01: `await Promise.allSettled` in `tool.execute.after` blocks every write/edit for 800ms–3s**

`plugins/expert-hooks.ts:171-176` — The `tool.execute.after` hook is awaited by OpenCode (confirmed via `@opencode-ai/plugin` type signature). This means every write or edit CANNOT return to the LLM until ALL four checks complete:

- `formatFile` — prettier cold-start: ~300-600ms
- `lintFile` — eslint cold-start: ~300-800ms
- `typeCheckFile` — tsc cold-start: **800ms–3s**
- `secretScan` — cat subprocess + 8 regexes: ~30ms

Wall-clock cost per write = `max(tsc, eslint, prettier)` = **800ms–3s per write**. On a code-gen session with 50 file writes, this is 40–150 seconds of pure overhead. The comment "failures inform the LLM but never block the workflow" is wrong — latency blocks regardless.

Note: `tsc --noEmit --pretty false ${filePath}` (line 229) passes a single file to tsc but TypeScript still type-checks the full project (follows all imports), paying the full cold-start cost every time.

- **Fix:** Drop the `await` — make the hook fire-and-forget. Results reported via `console.warn` asynchronously. Alternatively add a debounce gate to only run on the last write in a burst.

**P-C02: No timeout on hook subprocess calls — a hung eslint/tsc hangs the write indefinitely**

`plugins/expert-hooks.ts:181-243` — `formatFile`, `lintFile`, `typeCheckFile`, and `secretScan` have zero timeout wrappers. If eslint hangs on a circular import or tsc deadlocks on a type error in a dependency, the write tool never returns a result.

- **Fix:** Wrap each check in `Promise.race([check, timeout(5000)])`.

### HIGH

**P-H01: `secretScan` spawns `cat` subprocess; no file-size guard; `.json`/`.map` not excluded**

`plugins/expert-hooks.ts:248` — `$\`cat ${filePath}\`` forks a subprocess for file reading (~20-50ms) vs `fs.readFile` (~0.1ms). No file-size guard: a 5MB `package-lock.json` or `.min.js` loads entirely into memory with 8 regexes applied. `.json` and `.map` files are not in `SKIP_EXTENSIONS`.

- **Fix:** Use `fs.readFile(filePath, 'utf8')`. Add `stat.size > 500_000` guard. Add `.json`, `.map`, `.snap` to SKIP_EXTENSIONS.

**P-H02: `validate-phase-gate.sh` runs each sub-validator twice**

`scripts/validators/validate-phase-gate.sh:178-193` — Each sub-validator executes twice: once to let stderr pass through, then again to capture JSON. For a phase-4 gate with 9 validators, this is 18 subprocess launches. Validators like `validate-code-health.sh` are expensive (multi-pass find+grep).

- **Fix:** Capture both stdout and stderr in a single run using a temp file.

**P-H03: `validate-code-health.sh` calls `find_source_files` 9 times**

`scripts/validators/validate-code-health.sh:76,97,120,133,156,166,177,197,216` — Full directory traversal called once per check (9 checks = 9 `find` processes over the same tree).

- **Fix:** Capture file list once: `SRCFILES=$(find_source_files)` and reuse via process substitution.

**P-H04: `validate-module-boundaries.sh` is O(N² × F) — grep per module pair per file**

`scripts/validators/validate-module-boundaries.sh:69-143` — Structure: for each module × for each file × for each other module → 1 grep subprocess. With 10 modules × 50 files × 10 = 5,000 grep calls.

- **Fix:** Pre-build alternation pattern and run one grep per source file against all other-module names simultaneously.

### MEDIUM

**P-M01: bash.ts / run.ts / task.ts accumulate unlimited output in memory**

`tools/bash.ts:34-41`, `tools/run.ts:34-41`, `tools/task.ts:78-79` — Output accumulated via `output += data.toString()` with no max-size limit. A command producing multi-GB output (e.g., `find / -name "*"`) will fill memory until timeout (60s). `task.ts` maintains three concurrent growable buffers.

- **Fix:** Add `MAX_OUTPUT_BYTES = 5 * 1024 * 1024` guard with truncation.

**P-M02: log-parser.ts calls `parseLogLine` twice per line; recompiles regex per line**

`tools/log-parser.ts:28,43,150` — Each line is parsed twice (filter pass + summary pass). The filter pattern regex is re-created via `new RegExp()` inside the filter callback on every line.

- **Fix:** Compile the regex once before the loop; parse each line once into a results array.

### LOW

**P-L01: Plugin startup is clean — all patterns compiled at module load time**

`plugins/expert-hooks.ts:24-117` — `DANGEROUS_BASH`, `BLOCKED_FILE_PATTERNS`, `SECRET_PATTERNS`, `SKIP_EXTENSIONS`, `WRITE_TOOLS` are all initialized once. Set lookup is O(1). No startup cost concern.

**P-L02: 36 validators each source `_lib.sh` separately**

Each validator sources `_lib.sh` at startup. Negligible for individual runs but adds up in CI chains.

---

## 13. Improvement Recommendations

### Priority 0 — Regressions (fix immediately — existing features are broken)

| ID | File | Fix | Effort |
|----|------|-----|--------|
| R-1 | `plugins/expert-hooks.ts:133` | Change `output.args?.command` → `input.args?.command` — dangerous command blocking never fires | 1 line |
| R-2 | `tools/pomodoro.ts` | Replace all `Deno.*` calls with `fs/promises` equivalents — tool crashes on every invocation | 30 min |
| R-3 | `tools/simplify-file.ts` | Add `import { spawn } from "child_process"` — tool crashes on every invocation | 1 line |

### Priority 1 — Critical Security (fix before exposing to untrusted content)

| ID | Action | Impact |
|----|--------|--------|
| S-1 | Extend `tool.execute.before` to check ALL tools, not just `bash`/`run` | Closes 6 shell-exec bypass routes |
| S-2 | Add `"append"` and `"update"` to `WRITE_TOOLS` | `.env`/credential protection now covers all write paths |
| S-3 | Broaden rm regex: drop `$` anchor, add `~/` and `$HOME` patterns | Blocks `rm -rf / --no-preserve-root` and home-dir wipes |
| S-4 | Extend pipe-to-interpreter pattern to cover `sh`, `python`, `node`, `perl` | Blocks non-bash interpreter injection |
| S-5 | Rewrite `semgrep-rule.ts` and `grep-mcp.ts` to use argv arrays with `shell: false` | Eliminates injection in most critical tools |

### Priority 2 — Performance (high user-visible impact)

| ID | Action | Impact |
|----|--------|--------|
| P-1 | Drop `await` from `tool.execute.after` — make fire-and-forget | Removes 800ms–3s block on every write |
| P-2 | Add 5s timeout to each hook check via `Promise.race` | Prevents infinite hangs on stuck linters |
| P-3 | Replace `cat` subprocess in `secretScan` with `fs.readFile` + file-size guard | ~30-50ms savings per write; prevents OOM |
| P-4 | Fix `validate-phase-gate.sh` to run each sub-validator once | 2× validator speed |
| P-5 | Fix `validate-code-health.sh` to call `find_source_files` once | 9× find reduction |

### Priority 3 — Code Health (1-4 hours each)

| ID | Action | Impact |
|----|--------|--------|
| C-1 | Fix `grep-mcp.ts` recursion flags: `recursive:true` → push `-r`; false → push nothing | Correct grep semantics |
| C-2 | Fix `log-parser.ts` enum: `"_trace"` → `"trace"`, add `"all"` | Correct filter behavior |
| C-3 | Add ESM imports to `semgrep-scan.ts`, `semgrep-rule.ts`, `playwright-test.ts`, `test-runner.ts` | Fix CJS/ESM inconsistency |
| C-4 | Fix `loop-detector.ts` mkdir race — await inside `saveLoopState` | Prevents first-write data loss |
| C-5 | Extract shared spawn logic from `bash.ts` + `run.ts` into shared helper | Eliminates duplication |
| C-6 | Add `tsconfig.json` to project root | Proper TypeScript tooling for contributors |
| C-7 | Add max-output-bytes guard to `bash.ts`, `run.ts`, `task.ts` | Prevents OOM from runaway output |

### Priority 4 — Security Hardening (days)

| ID | Action | Impact |
|----|--------|--------|
| SH-1 | Add path containment check to all file-touching tools | Prevents arbitrary filesystem r/w |
| SH-2 | Add modern token patterns (GitHub PAT, OpenAI, Stripe, Slack, JWT) to `SECRET_PATTERNS` | Better secret coverage |
| SH-3 | Move PEM/AKIA patterns to `tool.execute.before` with blocking (not just warn) | Pre-write secret interception |
| SH-4 | Pin semgrep community rule repos to commit hashes in `install.sh` | Supply chain hardening |
| SH-5 | Fix `chmod 777` on pullmd data directory → `chmod 700` | Multi-user security |
| SH-6 | Write integration tests for blocklist patterns (including bypass attempts) | Regression-free maintenance |

---

## Appendix A: Agent File Sizes

| Agent | Lines | Notes |
|-------|-------|-------|
| sdlc-init-phases-3-4.md | 1,661 | Largest — consider splitting |
| sdlc-improve-mode.md | 1,020 | Complex Mode 4 workflow |
| sdlc-onboard-mode.md | 1,087 | Deep onboard with Ralph Wiggum loop |
| sdlc-init-phase-3.md | 870 | Design phase detail |
| sdlc-lead.md | 681 | Orchestrator spine |
| git-expert.md | 488 | Full git lifecycle |
| db-architect.md | 482 | Schema + migration workflows |
| api-designer.md | 477 | REST/GraphQL contracts |
| researcher.md | 547 | Multi-phase research protocol |
| test-engineer.md | 774 | Test strategy + Playwright |
| sre-engineer.md | 541 | CI/CD + ops runbooks |
| container-ops.md | 470 | Docker/Podman workflows |
| sdlc-init-phase-4.md | 809 | Implementation wave protocol |
| sdlc-feature-mode.md | 578 | Feature addition workflow |
| coding-agent.md | 314 | Doc-driven implementation |
| architecture-designer.md | 347 | Module + infra design |
| security-auditor.md | 385 | 5-phase security audit |
| frontend-design.md | 372 | Visual implementation |
| ux-engineer.md | 352 | UX + WCAG workflows |
| code-reviewer.md | 215 | Code health audit |
| performance-engineer.md | 237 | Profiling + benchmarks |

## Appendix B: Validator Catalog

| Validator | Phase | What it checks |
|-----------|-------|---------------|
| validate-phase-gate.sh | All | Chains all validators for a phase |
| run-handoff-gates.sh | Handoff | Scope + manifest + coverage |
| run-coverage-loop.sh | All | Iterative coverage enforcement |
| validate-adrs.sh | 3 | Architecture Decision Records |
| validate-api-coverage.sh | 3 | All endpoints in openapi.yaml |
| validate-architecture.sh | 3 | 6 diagram types in ARCHITECTURE.md |
| validate-build.sh | 4 | Build succeeds |
| validate-c3-coverage.sh | 3 | C4 C3 component diagrams |
| validate-code-health.sh | 4 | lint + complexity checks |
| validate-completion-manifest.sh | Handoff | Manifest has all 6 required sections |
| validate-deps.sh | 4 | No pinned-major-version drift |
| validate-design-system.sh | 3.5 | Design tokens, component library |
| validate-e2e-setup.sh | 3.5 | Playwright infrastructure |
| validate-entry-points.sh | 3 | All entry points documented |
| validate-erd-coverage.sh | 3 | All tables in ERD |
| validate-fix-backlog-closed.sh | 5 | No open CRITICAL/HIGH in backlog |
| validate-iac.sh | 3 | Infrastructure as Code artifacts |
| validate-infrastructure.sh | 3 | INFRASTRUCTURE.md topology |
| validate-inventory.sh | Onboard | Full component inventory |
| validate-lint.sh | 4 | Linter passes at zero warnings |
| validate-migrations.sh | 4 | All schema changes in migrations |
| validate-module-boundaries.sh | 3 | No cross-boundary imports |
| validate-module-design.sh | 3 | MODULE_DESIGN.md completeness |
| validate-no-ascii-art.sh | All | No Unicode box-drawing characters |
| validate-owasp.sh | Security | All OWASP Top 10 categories addressed |
| validate-phase-gate.sh | All | Master gate orchestrator |
| validate-release-readiness.sh | 5 | All Phase 5 criteria met |
| validate-requirements-matrix.sh | 2 | Requirements traceability |
| validate-scope.sh | Handoff | Git writes within WRITE-SCOPE |
| validate-security-controls.sh | 3 | SECURITY_CONTROLS.md completeness |
| validate-sequence-coverage.sh | 3 | Sequence diagrams for all flows |
| validate-smoke.sh | 5 | Runtime smoke test passes |
| validate-tech-stack.sh | 3 | TECH_STACK.md present + valid |
| validate-test-design.sh | 3.5 | TEST_DESIGN.md covers P0 use cases |
| validate-tests-mapping.sh | 4 | Tests trace to user stories |
| validate-tests.sh | 4 | Full test suite passes |
| validate-use-cases.sh | 2 | Use cases complete + traceable |
| validate-user-stories.sh | 2 | User stories have acceptance criteria |
| validate-ux-spec.sh | 3 | UX spec completeness |
