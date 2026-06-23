# Entry Points

This document traces every entry point in the bpm-opencode-experts repository — HTTP routes, CLI commands, tools, and agents.

---

## CLI Commands (package.json scripts)

These are the primary entry points exposed via `npm run <command>`:

### `npm test`
- **Script**: `scripts/test.ts`
- **Description**: Comprehensive validation for bpm-opencode-experts
- **Passes**:
  - Tools: Dynamically import each .ts tool, verify runtime shape
  - Skills: Parse YAML frontmatter, check required fields + cross-refs
  - Agents: Verify content length + required structural sections

### `npm run check`
- **Script**: `npm test`
- **Description**: Alias for test command

### `npm run agents:check`
- **Script**: `scripts/build-agents.mjs --check`
- **Description**: Validate agent block sections are in sync with canonical templates

### `npm run agents:fix`
- **Script**: `scripts/build-agents.mjs --fix`
- **Description**: Rewrite drifted agent sections to canonical text

### `npm run agents:compact`
- **Script**: `scripts/build-agents.mjs --compact`
- **Description**: Generate compact agent variants for small models

### `npm run build:claude`
- **Script**: `scripts/build-target-claude.mjs --write`
- **Description**: Generate claude-experts copies from canonical bpm-opencode-experts source

### `npm run build:claude:check`
- **Script**: `scripts/build-target-claude.mjs --check`
- **Description**: Verify generated claude-experts files match canonical source

### `npm run evals`
- **Script**: `scripts/run-evals.mjs`
- **Description**: Golden-task eval suite for the expert system itself

### `npm run evals:agent`
- **Script**: `scripts/run-evals.mjs --agent`
- **Description**: Run evals with agent execution mode

### `npm run evals:compare`
- **Script**: `scripts/eval-compare.mjs`
- **Description**: Tiered lift/gap/cost analysis over labeled eval runs

### `npm run evals:status`
- **Script**: `scripts/eval-status.mjs`
- **Description**: Live fan-out tracker for in-flight eval runs

### `npm run telemetry:report`
- **Script**: `scripts/telemetry-report.mjs`
- **Description**: Analyze docs/work/telemetry.jsonl

---

## Tools (tools/*.ts)

These are the opencode plugin tools available during agent execution:

### `bash`
- **File**: `tools/bash.ts`
- **Description**: Execute a shell command
- **Args**:
  - `command`: Shell command to execute (required)
  - `workdir`: Working directory (optional, defaults to project root)
  - `timeout`: Timeout in seconds (optional, defaults to 60)

### `run`
- **File**: `tools/run.ts`
- **Description**: Run a command and capture its output
- **Args**:
  - `command`: Shell command to execute (required)
  - `workdir`: Working directory (optional)
  - `timeout`: Timeout in seconds (optional)

### `write`
- **File**: `tools/write.ts`
- **Description**: Write content to a file
- **Args**:
  - `filePath`: Absolute path to file (required)
  - `content`: Content to write (required)

### `edit`
- **Description**: Edit a file with exact string replacement
- **Args**: (inherited from opencode plugin)

### `read`
- **Description**: Read a file or directory
- **Args**: (inherited from opencode plugin)

### `append`
- **File**: `tools/append.ts`
- **Description**: Append content to a file

### `update`
- **File**: `tools/update.ts`
- **Description**: Update content to a file

### `file-info`
- **File**: `tools/file-info.ts`
- **Description**: Get file metadata (size, lines, extension)

### `grep-mcp`
- **File**: `tools/grep-mcp.ts`
- **Description**: Enhanced grep with options for context, line numbers, and file filtering

### `loop-detector`
- **File**: `tools/loop-detector.ts`
- **Description**: Detect and prevent infinite loops in LLM operations

### `semgrep-rule`
- **File**: `tools/semgrep-rule.ts`
- **Description**: Write and test a single Semgrep pattern

### `semgrep-scan`
- **File**: `tools/semgrep-scan.ts`
- **Description**: Run Semgrep security scan on codebase

### `deploy`
- **File**: `tools/deploy.ts`
- **Description**: Build and deploy containerized app using Docker or Podman

### `test-runner`
- **File**: `tools/test-runner.ts`
- **Description**: Run tests with better error handling and summary

### `log-parser`
- **File**: `tools/log-parser.ts`
- **Description**: Parse and analyze logs

### `pomodoro`
- **File**: `tools/pomodoro.ts`
- **Description**: Timer tool to prevent burnout using Pomodoro technique

### `simplify-file`
- **File**: `tools/simplify-file.ts`
- **Description**: Simplify code with rewrite detection

### `playwright-test`
- **File**: `tools/playwright-test.ts`
- **Description**: Run Playwright end-to-end browser tests

### `playwright-web`
- **File**: `tools/playwright-web.ts`
- **Description**: Browser for web research via playwright-cli

---

## Agent Entry Points (agents/*.md)

Each agent file serves as an entry point when invoked:

### sdcl-lead
- **File**: `agents/sdlc-lead.md`
- **Description**: SDLC orchestrator — new projects, codebase onboarding, feature addition, audit and improvement
- **Commands**:
  - `/sdlc init <project-name> "<description>"` — Initialize SDLC in current project
  - `/sdlc run [--phase N]` — Generate phase documents
  - `/sdlc status` — Show current progress
  - `/sdlc validate` — Validate documents
  - `/sdlc feature "<description>"` — Add a feature to existing system
  - `/sdlc improve ["<focus>"]` — Audit and improve an existing system

### code-reviewer
- **File**: `agents/code-reviewer.md`
- **Description**: Code-health audit — complexity, duplication, error handling
- **Commands**:
  - `/review-code --review` — Full code pass
  - `/review-code --debt` — Tech-debt catalog
  - `/review-code --consolidate` — DRY + error-handling consolidation
  - `/review-code --patterns` — Cross-codebase consistency

### security-auditor
- **File**: `agents/security-auditor.md`
- **Description**: OWASP audit, threat modeling, CVE/dependency scanning
- **Commands**:
  - `/security --quick` — Default quick scan (~10 min)
  - `/security --deep` — Exhaustive Ralph Wiggum scan (~45-90 min)

### test-engineer
- **File**: `agents/test-engineer.md`
- **Description**: Write or review Playwright e2e, vitest/jest unit/integration tests

### db-architect
- **File**: `agents/db-architect.md`
- **Description**: Schema design, migrations, query optimization
- **Commands**:
  - `/dba` — Schema design and query optimization

### sre-engineer
- **File**: `agents/sre-engineer.md`
- **Description**: CI/CD pipelines, runbooks, monitoring, incident response
- **Commands**:
  - `/devops` — DevOps/SRE support

### container-ops
- **File**: `agents/container-ops.md`
- **Description**: Podman/Docker builds, Dockerfiles, compose, networking
- **Commands**:
  - `/containers` — Container build/run failures and tuning

### performance-engineer
- **File**: `agents/performance-engineer.md`
- **Description**: Profile and optimize bottlenecks
- **Commands**:
  - `/perf` — Performance profiling and optimization

### ux-engineer
- **File**: `agents/ux-engineer.md`
- **Description**: Design direction, UX workflows, component architecture
- **Commands**:
  - `/ux` — UX design and accessibility auditing

### api-designer
- **File**: `agents/api-designer.md`
- **Description**: REST/GraphQL endpoints, contracts, versioning
- **Commands**:
  - `/api-design` — API design support

### researcher
- **File**: `agents/researcher.md`
- **Description**: Deep research before decisions — tech comparisons, competitive landscape
- **Commands**:
  - `/research` — Research analyst support

### cost-engineer
- **File**: `agents/cost-engineer.md`
- **Description**: Cloud and LLM spend analysis — audit, right-size, unit economics
- **Commands**:
  - `/cost` — Cost engineering support

### analytics-architect
- **File**: `agents/analytics-architect.md`
- **Description**: Telemetry and instrumentation design — RED/USE/golden signals
- **Commands**:
  - `/analytics` — Analytics architecture support

### a11y-compliance
- **File**: `agents/a11y-compliance.md`
- **Description**: Accessibility & compliance audit — WCAG 2.2 AA/AAA
- **Commands**:
  - `/a11y` — Accessibility audit

### reliability-engineer
- **File**: `agents/reliability-engineer.md`
- **Description**: Load testing & resilience — failure-mode matrices, k6/Locust
- **Commands**:
  - `/reliability` — Reliability engineering support

### architecture-designer
- **File**: `agents/architecture-designer.md`
- **Description**: Module design and infrastructure topology

### ui-verifier
- **File**: `agents/ui-verifier.md`
- **Description**: Live browser verification using playwright-mcp
- **Commands**:
  - `/ui-verifier` — UI verification support

### end-user-simulator
- **File**: `agents/end-user-simulatormd`
- **Description**: Play vertical slice via browser/input automation
- **Commands**:
  - `/end-user-simulator` — Playtest evaluation

### challenger
- **File**: `agents/challenger.md`
- **Description**: Gate enforcement for challenging cases

### data-steward
- **File**: `agents/data-steward.md`
- **Description**: PII classification, GDPR/CCPA/PIPEDA, retention schedules
- **Commands**:
  - `/data-governance` — Data governance support

### git-expert
- **File**: `agents/git-expert.md`
- **Description**: Senior git & forge expert — repo bootstrap, feature branches
- **Commands**:
  - `/git-expert --init` — Bootstrap repo + remotes + hooks
  - `/git-expert --feature` — Branch + atomic commits + draft PR
  - `/git-expert --release` — Semver + changelog + signed tag

### release-manager
- **File**: `agents/release-manager.md`
- **Description**:Release management and changelog generation

### changelog-writer
- **File**: `agents/changelog-writer.md`
- **Description**: Automated changelog generation

### migration-planner
- **File**: `agents/migration-planner.md`
- **Description**: Migration planning and execution

### documentation-gap-finder
- **File**: `agents/documentation-gap-finder.md`
- **Description**: Find and fix documentation gaps

### llm-integration-engineer
- **File**: `agents/llm-integration-engineer.md`
- **Description**: LLM integration patterns and security

### frontend-design
- **File**: `agents/frontend-design.md`
- **Description**: Frontend design — visual polish, typography, color systems

### onbord-inventory
- **File**: `agents/onboard-inventory.md`
- **Description**: Ralph Wiggum deep-onboard Step D1 — enumerate every unit

### onboard-gap-fill
- **File**: `agents/onboard-gap-fill.md`
- **Description**: Ralph Wiggum deep-onboard Step D4 — re-run focused HANDOFFs

### onboard-verify
- **File**: `agents/onboard-verify.md`
- **Description**: Ralph Wiggum deep-onboard Step D3 — run all onboard validators

### guide
- **File**: `agents/guide.md`
- **Description**: Expert-system concierge / front door
- **Commands**:
  - `/guide` — Route to correct expert based on user intent

---

## Tool-based Entry Points (scripts/*.mjs/ts)

These scripts expose command-line interfaces:

### `scripts/test.ts`
- CLI entry point for validation
- Usage: `node --experimental-strip-types scripts/test.ts`

### `scripts/build-agents.mjs`
- CLI entry point for agent building
- Usage: `node scripts/build-agents.mjs --check | --fix | --compact`

### `scripts/build-target-claude.mjs`
- CLI entry point for claude-experts sync
- Usage: `node scripts/build-target-claude.mjs --check [--out <path>] | --write [--out <path>]`

### `scripts/run-evals.mjs`
- CLI entry point for eval suite
- Usage: `node scripts/run-evals.mjs [--fixture <name>] [--agent] [--json] [--keep]`

### `scripts/eval-compare.mjs`
- CLI entry point for eval comparison
- Usage: `node scripts/eval-compare.mjs [--frontier L] [--local L] [--bare L] [--json] [--self-test]`

### `scripts/eval-status.mjs`
- CLI entry point for eval status
- Usage: `node scripts/eval-status.mjs [--since-min <n>]`

### `scripts/telemetry-report.mjs`
- CLI entry point for telemetry analysis
- Usage: `node scripts/telemetry-report.mjs [path/to/telemetry.jsonl] [--json] [--days N]`

### `scripts/run-plan.mjs`
- CLI entry point for DAG runner
- Usage: `node scripts/run-plan.mjs [plan.json] [--dry-run] [--node <id>] [--max-retries <n>] [--cmd <template>] [--auto-replan] [--parallel <n>]`

---

## Plugin Hooks (plugins/expert-hooks.ts)

These are event-based entry points registered with the opencode plugin:

### `tool.execute.before`
- Triggered before any tool execution
- Blocks dangerous bash commands and credential file writes

### `tool.execute.after`
- Triggered after write/edit operations
- Runs format → lint → type-check → secret-scan

### `event`
- Triggered on assistant message completion
- Telemetry logging to docs/work/telemetry.jsonl

---

## Summary Statistics

| Category | Count |
|----------|-------|
| npm scripts | 10 |
| Tools | 16 |
| Agents | 37+ |
| CLI scripts | 8 |
| Plugin hooks | 3 |

---

*This document was automatically generated from codebase exploration.*
