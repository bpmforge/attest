#!/usr/bin/env node
/**
 * add-orchestrator.mjs
 * Inserts the orchestrator / --phase mode block into each agent.
 * Each agent gets a customised block with its actual phase names.
 * Insert point: just before "## Progress Announcements"
 */
import { readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const ANCHOR = "\n## Progress Announcements (Mandatory)"

// Per-agent config: agent file, self-name for task() calls, ordered phases
const AGENTS = [
  {
    file: "agents/db-architect.md",
    self: "db-architect",
    label: "schema / migration / query work",
    phases: [
      { n: 1, name: "understand-data",   desc: "read schema, models, migrations, access patterns" },
      { n: 2, name: "research",          desc: "look up best practices for this DB engine and workload" },
      { n: 3, name: "plan",              desc: "produce change plan with risk assessment" },
      { n: 4, name: "design-implement",  desc: "write schema, migrations, indexes, query patterns" },
      { n: 5, name: "verify",            desc: "check migrations reversible, no N+1, indexes correct" },
      { n: 6, name: "report",            desc: "write DATABASE.md / findings report" },
    ],
  },
  {
    file: "agents/test-engineer.md",
    self: "test-engineer",
    label: "test strategy / test writing",
    phases: [
      { n: 1, name: "understand-codebase", desc: "read entry points, existing tests, coverage config" },
      { n: 2, name: "research",            desc: "look up framework-specific testing patterns" },
      { n: 3, name: "plan-approach",       desc: "produce test plan: what to test, frameworks, structure" },
      { n: 4, name: "write-tests",         desc: "generate test files following the plan" },
      { n: 5, name: "verify",              desc: "run tests, check coverage meets targets" },
      { n: 6, name: "report",              desc: "write coverage report and test strategy doc" },
    ],
  },
  {
    file: "agents/sre-engineer.md",
    self: "sre-engineer",
    label: "CI/CD / runbook / infrastructure work",
    phases: [
      { n: 1, name: "understand-system", desc: "read deploy config, CI files, infrastructure docs" },
      { n: 2, name: "research",          desc: "look up best practices for this stack and cloud" },
      { n: 3, name: "plan",              desc: "produce change plan with rollback strategy" },
      { n: 4, name: "execute",           desc: "write pipelines, runbooks, config, IaC" },
      { n: 5, name: "verify",            desc: "check pipelines valid, runbooks complete, alerts wired" },
      { n: 6, name: "report",            desc: "write ops report and handoff docs" },
    ],
  },
  {
    file: "agents/container-ops.md",
    self: "container-ops",
    label: "container / compose / image work",
    phases: [
      { n: 1, name: "understand-state",  desc: "read Dockerfiles, compose files, existing images" },
      { n: 2, name: "research",          desc: "look up base image options, security advisories" },
      { n: 3, name: "plan",              desc: "produce change plan with layer optimisation notes" },
      { n: 4, name: "execute",           desc: "write/update Dockerfiles, compose, scripts" },
      { n: 5, name: "verify",            desc: "build and smoke-test images, check layer sizes" },
      { n: 6, name: "report",            desc: "write container ops report" },
    ],
  },
  {
    file: "agents/performance-engineer.md",
    self: "performance-engineer",
    label: "performance profiling / optimisation",
    phases: [
      { n: 1, name: "understand-problem", desc: "read code, identify suspected bottleneck, establish baseline" },
      { n: 2, name: "profile",            desc: "run benchmarks / flamegraph / query explain" },
      { n: 3, name: "identify-hotspot",   desc: "pinpoint the single highest-leverage fix" },
      { n: 4, name: "fix",                desc: "implement the fix with before/after measurement" },
      { n: 5, name: "verify-fix",         desc: "confirm improvement, no regressions" },
      { n: 6, name: "document",           desc: "write perf report with before/after numbers" },
    ],
  },
  {
    file: "agents/api-designer.md",
    self: "api-designer",
    label: "API design / contract work",
    phases: [
      { n: 1, name: "understand-context", desc: "read user stories, existing endpoints, data models" },
      { n: 2, name: "research",           desc: "look up REST/GraphQL conventions for this domain" },
      { n: 3, name: "design-api",         desc: "design endpoints, request/response shapes, versioning" },
      { n: 4, name: "document-api",       desc: "write OpenAPI spec or endpoint contracts" },
      { n: 5, name: "verify-design",      desc: "check all user stories covered, no breaking changes" },
      { n: 6, name: "write-docs",         desc: "write API_DESIGN.md" },
    ],
  },
  // Security auditor has 4 orchestration units (sub-phases grouped)
  {
    file: "agents/security-auditor.md",
    self: "security-auditor",
    label: "security audit",
    phases: [
      { n: 1, name: "understand-target",  desc: "read entry points, auth, data flows, framework" },
      { n: 2, name: "automated-scan",     desc: "run Semgrep, dependency audit, secret scan" },
      { n: 3, name: "owasp-manual",       desc: "manual OWASP Top 10 + STRIDE per component" },
      { n: 4, name: "verify-report",      desc: "cross-check findings, deduplicate, write report" },
    ],
  },
  // Code-reviewer is mode-based — orchestrate per mode, not per internal phase
  {
    file: "agents/code-reviewer.md",
    self: "code-reviewer",
    label: "code review (--review / --debt / --consolidate / --patterns)",
    phases: [
      { n: 1, name: "understand-codebase",  desc: "read patterns, conventions, 3-5 key files" },
      { n: 2, name: "tooling",              desc: "run linter, complexity tools if available" },
      { n: 3, name: "review-passes",        desc: "7 dimension passes: complexity, DRY, error handling, types, patterns, naming, comments" },
      { n: 4, name: "report",               desc: "write Health Dashboard with findings, confidence gate, reader simulation" },
    ],
  },
]

function buildBlock(agent) {
  const phaseList = agent.phases
    .map(p => `  ${p.n}. **${p.name}** — ${p.desc}`)
    .join("\n")

  const examplePhase = agent.phases[0]
  const lastPhase = agent.phases[agent.phases.length - 1]

  return `
## Execution Modes

### Orchestrator Mode (default)

When invoked **without** a \`--phase:\` prefix, run as orchestrator for ${agent.label}:

**Immediately announce your plan** before doing any work:
\`\`\`
Starting ${agent.label}. Plan: ${agent.phases.length} phases
${phaseList}
\`\`\`

Then for each phase, call:
\`\`\`
task(agent="${agent.self}", prompt="--phase: [N] [name]
Context file: docs/work/${agent.self}/<task-slug>/phase[N-1].md  (omit for phase 1)
Output file:  docs/work/${agent.self}/<task-slug>/phase[N].md
[Any extra scoping context from the original prompt]", timeout=120)
\`\`\`

After each sub-task returns, print:
\`\`\`
✓ Phase N complete: [1-sentence finding]
\`\`\`
Then immediately start phase N+1.

**File path rule:** use a slug from the original task (e.g. \`auth-schema\`, \`api-review\`) so phase files don't collide across concurrent tasks. Create \`docs/work/${agent.self}/<slug>/\` if it doesn't exist.

After all phases complete, synthesize the final deliverable from the phase output files.

---

### Phase Mode (\`--phase: N name\`)

When your prompt starts with \`--phase:\`:

1. Extract the phase number and name from \`--phase: N name\`
2. Read the **Context file** path from the prompt (skip for phase 1)
3. Execute ONLY that phase — follow the Phase N instructions below
4. Write your findings to the **Output file** path from the prompt
5. Return exactly: \`✓ Phase N (${agent.self}): [1-sentence summary] | Confidence: [1-10]\`

**DO NOT** run other phases. **DO NOT** spawn sub-tasks. This mode must complete in under 90 seconds.

---

`
}

let patched = 0
let skipped = 0

for (const agent of AGENTS) {
  const filePath = join(root, agent.file)
  const content = readFileSync(filePath, "utf8")

  if (content.includes("### Orchestrator Mode (default)")) {
    console.log(`  ↷  ${agent.file} — already has orchestrator block, skipping`)
    skipped++
    continue
  }

  const idx = content.indexOf(ANCHOR)
  if (idx === -1) {
    console.error(`  ✗  ${agent.file} — ANCHOR not found, skipping`)
    skipped++
    continue
  }

  const block = buildBlock(agent)
  const updated = content.slice(0, idx) + block + content.slice(idx)
  writeFileSync(filePath, updated)
  console.log(`  ✓  ${agent.file} — inserted orchestrator block (${agent.phases.length} phases)`)
  patched++
}

console.log(`\n${patched} patched, ${skipped} skipped`)
