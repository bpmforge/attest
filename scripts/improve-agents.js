#!/usr/bin/env node
/**
 * improve-agents.js
 * Applies three improvements to all 11 OpenCode expert agents:
 * 1. Add "How You Execute" micro-loop section after "How You Think"
 * 2. Collapse Task Decomposition + Reasoning Loop + Mandatory Output + Diagram Requirements
 *    into a single "Execution Standards" section (saves ~50 lines/agent)
 * 3. Fix "→ `/skill`" slash references to plain agent names
 */
const fs = require("fs");
const path = require("path");

const AGENTS_DIR = path.join(__dirname, "..", "agents");

// Skill → agent name mapping
const SKILL_TO_AGENT = {
  "/security": "security-auditor",
  "/perf": "performance-engineer",
  "/test-expert": "test-engineer",
  "/review-code": "code-reviewer",
  "/dba": "db-architect",
  "/devops": "sre-engineer",
  "/ux": "ux-engineer",
  "/api-design": "api-designer",
  "/containers": "container-ops",
  "/sdlc": "sdlc-lead",
  "/research": "researcher",
};

// The micro-loop section to insert after "## How You Think"
const MICRO_LOOP_SECTION = `
## How You Execute
Work in micro-steps — one unit at a time, never the whole thing at once:
1. Pick ONE target: one file, one module, one component, one endpoint
2. Apply ONE type of analysis to it (not all types at once)
3. Write findings to disk immediately — do not accumulate in memory
4. Verify what you wrote before moving to the next target

Never analyze two targets before writing output from the first.
When you catch yourself about to scan an entire codebase in one pass — stop, narrow scope first.

`;

// The consolidated Execution Standards section
// Takes the per-agent output path as a parameter
function makeExecutionStandards(outputPath) {
  return `## Execution Standards

**Micro-loop** — see "How You Execute" above. One target, one analysis type, write, verify, next.

**Task tracking:** Before starting, list numbered subtasks: \`[1] Description — PENDING\`.
Update to IN_PROGRESS then DONE after verifying each output.

**Confidence loop:** After completing all phases, rate confidence 1-10 per subtask.
If any scores below 7, do one focused re-pass on that subtask. Max 3 revision passes.

**Always write output to files:**
- Write reports to: \`${outputPath}\`
- NEVER output findings as text only — write to a file, then summarize to the user
- Include a summary section at the top of every report

**Diagrams:** ALL diagrams MUST use Mermaid syntax — NEVER ASCII art or box-drawing characters.
Use: graph TB/LR, sequenceDiagram, erDiagram, stateDiagram-v2, classDiagram as appropriate.

`;
}

// Per-agent output paths (from current Mandatory Output sections)
const OUTPUT_PATHS = {
  "api-designer.md": "docs/API_DESIGN.md",
  "code-reviewer.md": "docs/reviews/CODE_REVIEW_<date>.md",
  "container-ops.md": "docs/ops/CONTAINER_REPORT.md",
  "db-architect.md": "docs/DATABASE.md",
  "performance-engineer.md": "docs/PERFORMANCE_REPORT.md",
  "sre-engineer.md": "docs/ops/",
  "test-engineer.md": "docs/TEST_STRATEGY.md",
  "ux-engineer.md": "docs/UX_REVIEW.md",
  // Special agents (not using the boilerplate replacement)
  "security-auditor.md": "docs/security/SECURITY_AUDIT_<date>.md",
  "researcher.md": "docs/research/RESEARCH_<topic>_<date>.md",
};

// Patterns for slash references in Recommend sections
// Matches: → `/skill` or -> `/skill` or → `/skill --args`
function fixSlashRefs(content) {
  // Replace patterns like → `/security` or → `/dba --design` etc.
  return content
    .replace(/→ `(\/[\w-]+)(?:\s+[^`]*)?\`/g, (match, skill) => {
      const base = skill; // e.g. "/security"
      const agent = SKILL_TO_AGENT[base];
      if (agent) return `→ ${agent}`;
      return match; // leave unchanged if not in our map
    })
    .replace(/-> `(\/[\w-]+)(?:\s+[^`]*)?\`/g, (match, skill) => {
      const base = skill;
      const agent = SKILL_TO_AGENT[base];
      if (agent) return `→ ${agent}`;
      return match;
    });
}

// Insert micro-loop section after "## How You Think" block
function insertMicroLoop(content) {
  // Find the end of the "## How You Think" section
  // The section ends when the next ## heading starts
  const howYouThinkMatch = content.match(/## How You Think\n/);
  if (!howYouThinkMatch) return content;

  const howYouThinkStart = howYouThinkMatch.index;
  // Find the next ## heading after How You Think
  const afterSection = content.indexOf("\n## ", howYouThinkStart + 20);
  if (afterSection === -1) return content;

  // Insert before the next ## heading
  return (
    content.slice(0, afterSection + 1) +
    MICRO_LOOP_SECTION +
    content.slice(afterSection + 1)
  );
}

// Replace the 4 boilerplate sections with consolidated Execution Standards
// Targets: ## Task Decomposition ... ## Reasoning Loop ... ## Mandatory Output ... ## Diagram Requirements ... (to end or next non-boilerplate ## section)
function replaceBoilerplate(content, outputPath) {
  // Find where ## Task Decomposition starts (top-level ##, not ###)
  const taskDecompMatch = content.match(/\n## Task Decomposition\n/);
  if (!taskDecompMatch) {
    // Some agents don't have it — skip
    return content;
  }

  const boilerplateStart = taskDecompMatch.index;

  // Find where ## Diagram Requirements section ends
  // It either ends at the next ## section or at end of file
  const diagReqMatch = content.indexOf(
    "\n## Diagram Requirements\n",
    boilerplateStart,
  );
  if (diagReqMatch === -1) {
    // No Diagram Requirements — just replace from Task Decomposition to end
    return (
      content.slice(0, boilerplateStart) +
      "\n" +
      makeExecutionStandards(outputPath)
    );
  }

  // Find end of Diagram Requirements section
  const afterDiagReq = content.indexOf("\n## ", diagReqMatch + 25);
  const boilerplateEnd = afterDiagReq === -1 ? content.length : afterDiagReq;

  return (
    content.slice(0, boilerplateStart) +
    "\n" +
    makeExecutionStandards(outputPath) +
    content.slice(boilerplateEnd)
  );
}

// Process agents with full boilerplate at bottom
const BOILERPLATE_AGENTS = [
  "api-designer.md",
  "code-reviewer.md",
  "container-ops.md",
  "db-architect.md",
  "performance-engineer.md",
  "sre-engineer.md",
  "test-engineer.md",
  "ux-engineer.md",
];

let passed = 0;
let failed = 0;

const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));

for (const file of files) {
  const filePath = path.join(AGENTS_DIR, file);
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  // 1. Insert micro-loop after How You Think (all agents)
  content = insertMicroLoop(content);

  // 2. Replace boilerplate sections (only for agents that have them)
  if (BOILERPLATE_AGENTS.includes(file)) {
    const outputPath = OUTPUT_PATHS[file] || "docs/REPORT.md";
    content = replaceBoilerplate(content, outputPath);
  }

  // 3. Fix slash references (all agents)
  content = fixSlashRefs(content);

  if (content !== original) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`  ✓ ${file} — updated`);
    passed++;
  } else {
    console.log(`  - ${file} — no changes`);
  }
}

console.log(`\n${passed} updated, ${failed} failed`);
