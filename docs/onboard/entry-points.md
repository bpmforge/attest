# Entry Points

This document traces every entry point in the bpm-opencode-experts repository.

## CLI Commands

### npm test / npm check
- **File**: package.json:8
- **Handler**: scripts/test.ts (via `node --experimental-strip-types`)
- **Description**: Comprehensive validation for bpm-opencode-experts
  - Pass 1: Tools — dynamically import each .ts tool, verify runtime shape
  - Pass 2: Skills — parse YAML frontmatter, check required fields + cross-refs
  - Pass 3: Agents — verify content length + required structural sections

### npm run agents:check
- **File**: package.json:10
- **Handler**: scripts/build-agents.mjs --check
- **Description**: Check if agent block sections have drifted from canonical text
  - Scans agents/*.md files
  - Compares against agents/shared/blocks/
  - Exits 1 if drift detected

### npm run agents:fix
- **File**: package.json:11
- **Handler**: scripts/build-agents.mjs --fix
- **Description**: Rewrite drifted agent block sections to canonical text

### npm run agents:compact
- **File**: package.json:12
- **Handler**: scripts/build-agents.mjs --compact
- **Description**: Generate dist/compact-agents/ with boilerplate sections replaced by .compact.md variants

### npm run build:claude
- **File**: package.json:13
- **Handler**: scripts/build-target-claude.mjs --write
- **Description**: Generate claude-experts copies with path/text transformations

### npm run build:claude:check
- **File**: package.json:14
- **Handler**: scripts/build-target-claude.mjs --check
- **Description**: Compare generated output against target repo, exit 1 on drift

### npm run evals
- **File**: package.json:15
- **Handler**: scripts/run-evals.mjs (default deterministic mode)
- **Description**: Run golden-task eval suite against fixture repos with planted defects
  - Modes: deterministic (default), --agent, --bare

### npm run evals:agent
- **File**: package.json:16
- **Handler**: scripts/run-evals.mjs --agent
- **Description**: Run evals with agent mode (spawns opencode run against fixtures)

### npm run evals:compare
- **File**: package.json:17
- **Handler**: scripts/eval-compare.mjs
- **Description**: Compare eval results across labeled runs (gap/lift/cost analysis)
  - Flags: --frontier L, --local L, --bare L, --self-test

### npm run evals:status
- **File**: package.json:18
- **Handler**: scripts/eval-status.mjs [--since-min N]
- **Description**: Live fan-out tracker for in-flight eval runs
  - Shows live opencode processes, telemetry fan-out, completed cells

### npm run evals:compare:selftest
- **File**: package.json:19
- **Handler**: scripts/eval-compare.mjs --self-test
- **Description**: Run eval-compare self-test to validate logic

### npm run telemetry:report
- **File**: package.json:20
- **Handler**: scripts/telemetry-report.mjs [path] [--json] [--days N]
- **Description**: Analyze docs/work/telemetry.jsonl for per-agent/per-model stats

## Direct Node Scripts (not via npm)

### scripts/test.ts
- **File**: scripts/test.ts:1
- **Entry Point**: #!/usr/bin/env node (line 1)
- **Description**: Comprehensive validation for bpm-opencode-experts

### scripts/build-agents.mjs
- **File**: scripts/build-agents.mjs:1
- **Entry Point**: #!/usr/bin/env node (line 1)
- **Flags**: --check | --fix | --compact

### scripts/build-target-claude.mjs
- **File**: scripts/build-target-claude.mjs:1
- **Entry Point**: #!/usr/bin/env node (line 1)
- **Flags**: --check [--out PATH] | --write [--out PATH]

### scripts/run-evals.mjs
- **File**: scripts/run-evals.mjs:1
- **Entry Point**: #!/usr/bin/env node (line 1)
- **Flags**: [--fixture NAME] [--agent] [--bare] [--json] [--keep] [--label NAME] [--eval-model MODEL]

### scripts/eval-compare.mjs
- **File**: scripts/eval-compare.mjs:1
- **Entry Point**: #!/usr/bin/env node (line 1)
- **Flags**: [--frontier LABEL] [--local LABEL] [--bare LABEL] [--runs DIR] [--json] [--self-test]

### scripts/eval-status.mjs
- **File**: scripts/eval-status.mjs:1
- **Entry Point**: #!/usr/bin/env node (line 1)
- **Flags**: [--since-min N=20]

### scripts/telemetry-report.mjs
- **File**: scripts/telemetry-report.mjs:1
- **Entry Point**: #!/usr/bin/env node (line 1)
- **Flags**: [path] [--json] [--days N]

## Tools (Opencode Plugin Tools)

### tools/bash.ts
- **File**: tools/bash.ts:1
- **Export**: default tool
- **Description**: Execute shell command via spawn

### tools/run.ts
- **File**: tools/run.ts:1
- **Export**: default tool
- **Description**: Run command and capture output via spawn

### tools/test-runner.ts
- **File**: tools/test-runner.ts:1
- **Export**: default tool
- **Description**: Run vitest/jest tests

### tools/playwright-test.ts
- **File**: tools/playwright-test.ts:1
- **Export**: default tool
- **Description**: Run Playwright e2e tests

### tools/semgrep-scan.ts
- **File**: tools/semgrep-scan.ts:1
- **Export**: default tool
- **Description**: Run Semgrep security scan

### tools/semgrep-rule.ts
- **File**: tools/semgrep-rule.ts:1
- **Export**: default tool
- **Description**: Write and test single Semgrep pattern

### tools/deploy.ts
- **File**: tools/deploy.ts:1
- **Export**: default tool
- **Description**: Build and deploy containerized app

### tools/log-parser.ts
- **File**: tools/log-parser.ts:1
- **Export**: default tool
- **Description**: Parse and analyze logs

### tools/file-info.ts
- **File**: tools/file-info.ts:1
- **Export**: default tool
- **Description**: Get file metadata (size, lines, extension)

### tools/grep-mcp.ts
- **File**: tools/grep-mcp.ts:1
- **Export**: default tool
- **Description**: Enhanced grep with options

### tools/playwright-web.ts
- **File**: tools/playwright-web.ts:1
- **Export**: default tool
- **Description**: Browser for web research via playwright-cli

### tools/playwright-test.ts
- **File**: tools/playwright-test.ts:1
- **Export**: default tool
- **Description**: Run Playwright e2e tests

### tools/loop-detector.ts
- **File**: tools/loop-detector.ts:1
- **Export**: default tool
- **Description**: Detect and prevent infinite loops

### tools/pomodoro.ts
- **File**: tools/pomodoro.ts:1
- **Export**: default tool
- **Description**: Timer for Pomodoro technique

### tools/simplify-file.ts
- **File**: tools/simplify-file.ts:1
- **Export**: default tool
- **Description**: Simplify code with rewrite detection

### tools/update.ts
- **File**: tools/update.ts:1
- **Export**: default tool
- **Description**: Update content to a file

### tools/write.ts
- **File**: tools/write.ts:1
- **Export**: default tool
- **Description**: Write content to a file

### tools/append.ts
- **File**: tools/append.ts:1
- **Export**: default tool
- **Description**: Append content to a file

### tools/read.ts (not found in directory listing)

## Event Listeners

No event listeners (cron, queue consumers, message brokers) detected in codebase.
