#!/usr/bin/env node
/**
 * test.ts — comprehensive validation for bpm-opencode-experts
 *
 * Three passes:
 *   1. Tools    — dynamically import each .ts tool, verify runtime shape
 *   2. Skills   — parse YAML frontmatter, check required fields + cross-refs
 *   3. Agents   — verify content length + required structural sections
 *
 * Run:  node --experimental-strip-types scripts/test.ts
 */

import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { testGateReceipts } from "./test-gate-receipts.ts";
import { testTicketLifecycle } from "./test-ticket-lifecycle.ts";
import { testBoardGenerator } from "./test-board-generator.ts";
import { testBash32Compat } from "./test-bash32-compat.ts";
import { testDeriveLanes } from "./test-derive-lanes.ts";
import { testAutonomyLedger } from "./test-autonomy-ledger.ts";
import { testEvalsHarness } from "./test-evals-harness.ts";
import { testSkillAgentRefs } from "./test-skill-agent-refs.ts";
import { testTicketsGraph } from "./test-tickets-graph.ts";
import { testChallengerGate } from "./test-challenger-gate.ts";
import { testTruthfulCompletion } from "./test-truthful-completion.ts";
import { testOuterLoopReceipts } from "./test-outer-loop-receipts.ts";
import { testWiringLedger } from "./test-wiring-ledger.ts";
import { testChallengerGateCorrelation } from "./test-challenger-gate-correlation.ts";
import { testAwkWordBoundary } from "./test-awk-word-boundary.ts";
import { testLoadBearingDenominators } from "./test-load-bearing-denominators.ts";
import { testDocRenderHealth } from "./test-doc-render-health.ts";

const root = path.resolve(import.meta.dirname, "..");
let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  ✓ ${label}`);
  passed++;
}
function fail(label: string, reason: string) {
  console.error(`  ✗ ${label} — ${reason}`);
  failed++;
}

// ---------------------------------------------------------------------------
// Pass 1: Tools — runtime import + shape validation
// ---------------------------------------------------------------------------
console.log("\n[Pass 1] Tools — runtime shape validation");

const toolsDir = path.join(root, "tools");
const toolFiles = fs
  .readdirSync(toolsDir)
  .filter((f) => f.endsWith(".ts") && f !== "CUSTOM_TOOLS_GUIDE.md");

for (const file of toolFiles) {
  const filePath = path.join(toolsDir, file);
  try {
    const mod = await import(pathToFileURL(filePath).href);
    const t = mod.default;

    if (!t || typeof t !== "object") {
      fail(`tools/${file}`, "default export is not an object");
      continue;
    }
    if (typeof t.description !== "string" || t.description.trim() === "") {
      fail(`tools/${file}`, "missing or empty description");
      continue;
    }
    if (typeof t.execute !== "function") {
      fail(`tools/${file}`, "execute is not a function");
      continue;
    }
    if (t.args === undefined || t.args === null) {
      fail(`tools/${file}`, "args is missing (should be a zod schema object)");
      continue;
    }
    ok(`tools/${file} — desc="${t.description.slice(0, 50)}..."`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`tools/${file}`, `import failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Pass 2: Skills — frontmatter + cross-reference validation
// ---------------------------------------------------------------------------
console.log("\n[Pass 2] Skills — frontmatter + cross-reference validation");

const skillsDir = path.join(root, "skills");
const agentsDir = path.join(root, "agents");

// Build set of known agent names (filename without .md)
const knownAgents = new Set(
  fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, "")),
);

/**
 * Minimal YAML frontmatter parser.
 * Returns { fields, body } where fields are the key: value pairs
 * between the first two --- lines.
 */
function parseFrontmatter(content: string): {
  fields: Record<string, string>;
  body: string;
} {
  const lines = content.split("\n");
  if (lines[0].trim() !== "---") return { fields: {}, body: content };

  const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (closeIdx === -1) return { fields: {}, body: content };

  const yamlLines = lines.slice(1, closeIdx);
  const body = lines.slice(closeIdx + 1).join("\n");

  const fields: Record<string, string> = {};
  for (const line of yamlLines) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (m) {
      // strip surrounding quotes if present
      fields[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return { fields, body };
}

/**
 * Extract agent names referenced in backtick strings inside the content.
 *
 * T22.5: this used to filter on `knownAgents.has(m[1])` INSIDE extraction,
 * which made the downstream "missing agent" check inert by construction —
 * nothing extracted could ever be missing, since only already-known names
 * were ever pushed into the result. A skill referencing a typo'd or deleted
 * agent name silently passed.
 *
 * The fix narrows the pattern instead of removing the filter: only treat a
 * backtick string as a claimed agent reference when it's immediately
 * followed by the word "agent" (`the `X` agent`, `routes to `X` agent`) —
 * this repo's dominant, deliberate convention for naming an agent in prose
 * (verified against every skill file: 31 real matches, all this shape).
 * Without that anchor, any backtick'd lowercase-hyphenated technical term
 * (`phase-0`, `write_scope`, `playwright-mcp`, ...) would false-positive as
 * a "missing agent" the moment extraction stops pre-filtering.
 */
function extractAgentRefs(content: string): string[] {
  const refs: string[] = [];
  const pattern = /`([a-z][\w-]+)`\s+agent\b/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    refs.push(m[1]);
  }
  return [...new Set(refs)];
}

const skillDirs = fs
  .readdirSync(skillsDir)
  .filter((d) => fs.statSync(path.join(skillsDir, d)).isDirectory());

for (const skillName of skillDirs) {
  const skillFile = path.join(skillsDir, skillName, "SKILL.md");
  const label = `skills/${skillName}/SKILL.md`;

  if (!fs.existsSync(skillFile)) {
    fail(label, "SKILL.md missing");
    continue;
  }

  const content = fs.readFileSync(skillFile, "utf8");
  const { fields, body } = parseFrontmatter(content);

  // Required frontmatter fields
  if (!fields.name || fields.name.trim() === "") {
    fail(label, "frontmatter missing 'name' field");
    continue;
  }
  if (!fields.description || fields.description.trim() === "") {
    fail(label, "frontmatter missing 'description' field");
    continue;
  }

  // Minimum body length
  if (body.trim().length < 50) {
    fail(label, "skill body is too short (< 50 chars)");
    continue;
  }

  // Cross-reference: agent names in backticks must exist
  const agentRefs = extractAgentRefs(content);
  const missing = agentRefs.filter((a) => !knownAgents.has(a));
  if (missing.length > 0) {
    fail(label, `references non-existent agent(s): ${missing.join(", ")}`);
    continue;
  }

  const refNote = agentRefs.length ? ` (refs: ${agentRefs.join(", ")})` : "";
  ok(`${label} — name=${fields.name}${refNote}`);
}

// ---------------------------------------------------------------------------
// Pass 2b: Skill→agent negative test (T22.5) — extracted to
// test-skill-agent-refs.ts to keep this barrel file under the size cap.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 2b] Skill agent refs — RED/GREEN for the missing-agent check",
);
await testSkillAgentRefs(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 3: Agents — content length + key structural sections
// ---------------------------------------------------------------------------
console.log("\n[Pass 3] Agents — content + structural sections");

const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));

for (const file of agentFiles) {
  const content = fs.readFileSync(path.join(agentsDir, file), "utf8");
  const label = `agents/${file}`;

  if (content.trim().length < 200) {
    fail(label, `too short (${content.length} bytes)`);
    continue;
  }

  // Every agent should describe what it does in the first 1500 chars
  // (some agents have long frontmatter that pushes the body past 500 chars)
  const intro = content.slice(0, 1500).toLowerCase();
  if (
    !intro.includes("you are") &&
    !intro.includes("expert") &&
    !intro.includes("agent")
  ) {
    fail(label, "intro does not establish agent role/identity");
    continue;
  }

  ok(`${label} (${content.length} bytes)`);
}

// ---------------------------------------------------------------------------
// Pass 4: Tickets — module-contract graph logic (T1/T9). Extracted to
// test-tickets-graph.ts to keep this barrel file under the size cap.
// ---------------------------------------------------------------------------
console.log("\n[Pass 4] Tickets — module-contract graph logic");
await testTicketsGraph(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 4b: Ticket lifecycle (T26.1) — claim/start/comment/close/accept/release
// red/green fixtures. Extracted to test-ticket-lifecycle.ts to keep this
// barrel file under the size cap.
// ---------------------------------------------------------------------------
console.log("\n[Pass 4b] Ticket lifecycle — claim/start/close/accept/release");
await testTicketLifecycle(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 4c: Board generator (T10.2) — lane-column board + claim-right-now
// header, snapshot-checked against the sample plan.
// ---------------------------------------------------------------------------
console.log("\n[Pass 4c] Board generator — lane-column board");
await testBoardGenerator(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 4d: Lane derivation (T10.4) — deriveLane() unit cases + the real
// ai-daytrader fixture (37 modules) end-to-end through validatePlan() and
// gen-tickets-board.mjs.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 4d] Lane derivation — deriveLane() + ai-daytrader fixture",
);
await testDeriveLanes(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 5: Gate receipts (T27.1) — red/green fixtures. Extracted to
// test-gate-receipts.ts to keep this barrel file under the size cap.
// ---------------------------------------------------------------------------
console.log("\n[Pass 5] Gate receipts — red/green fixtures");
await testGateReceipts(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 6: bash 3.2 compat (T27.7) — validators must run clean on stock macOS
// /bin/bash, not just whatever $BASH resolves to on the dev machine.
// ---------------------------------------------------------------------------
console.log("\n[Pass 6] bash 3.2 compat — stock /bin/bash fixtures");
await testBash32Compat(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 7: Evals harness (T22.5) — run-evals.mjs deterministic mode +
// chained-validator red/green fixture coverage.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 7] Evals harness — run-evals.mjs + validator fixture coverage",
);
await testEvalsHarness(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 8: Autonomy ledger (T27.5) — APPROVALS.md well-formed + NEVER-AUTO
// rows must be human-signed, cross-referenced against AUTONOMY_PROTOCOL.md.
// ---------------------------------------------------------------------------
console.log("\n[Pass 8] Autonomy ledger — NEVER-AUTO signing tripwire");
await testAutonomyLedger(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 9: Challenger gate (T27.3) — HIGH/CRITICAL findings require a
// matching CHALLENGE_REPORT with zero unresolved CONTRADICTED verdicts.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 9] Challenger gate — CHALLENGE_REPORT existence + CONTRADICTED tripwire",
);
await testChallengerGate(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 10: Truthful completion (T27.2) — manifest v2 stat checks +
// maker/verifier identity, validate-tickets.sh un-orphaned into phase-4,
// run-handoff-gates.sh's new Tracker gate end-to-end.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 10] Truthful completion — manifest v2 + tickets wiring + tracker gate",
);
await testTruthfulCompletion(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 11: Outer-loop receipts (T27.4) — run-until-done.sh's is_complete()
// checks validate-state-drift.sh, not just the promise token.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 11] Outer-loop receipts — state-drift gate + is_complete() red/green",
);
await testOuterLoopReceipts(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 12: Wiring ledger (T22.7) — every validator + shared protocol is
// reachable via a deterministic chain, npm test, or a documented prose-trigger.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 12] Wiring ledger — orphan validator/shared-protocol detection",
);
await testWiringLedger(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 13: Challenger gate slug/date correlation (T22.20) — a source report
// must be matched to its OWN clean challenge report via the declared
// "**Artifact:**" field; an unrelated clean challenge report elsewhere no
// longer satisfies the gate.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 13] Challenger gate correlation — per-source Artifact matching",
);
await testChallengerGateCorrelation(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 14: awk word-boundary (T22.19) — \b is a no-op on stock macOS system
// awk; validate-code-health.sh (R-02, H-01) and validate-fix-backlog-closed.sh
// (waived-justification) silently never fired. Direct repro + fixed-validator
// regression, run on real /bin/bash + stock /usr/bin/awk.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 14] awk word-boundary — \\b-in-awk repro + fixed-validator regression",
);
await testAwkWordBoundary(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 15: Load-bearing denominators (T22.6) — validate-design-system.sh
// (STATES + killed caps), validate-tests-mapping.sh (assertion-level + P2
// SKIPPED), validate-wcag-coverage.sh (interactive-element inventory), and
// validate-inventory.sh (second-pass source re-derivation) each used to
// check a sample/capped-prefix/1-of-N ground truth instead of the full set.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 15] Load-bearing denominators — design-system/tests-mapping/wcag-coverage/inventory completeness",
);
await testLoadBearingDenominators(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 16: Publish render-health (T29.9, H8/C-2/C-3) — mermaid backtick
// promoted to a hard-fail error (M013) and a new markdown-table
// orphan-fragment linter (validate-doc-render-health.sh), proving both
// confirmed-hit publish bug classes are caught, plus false-positive
// stress cases on clean content.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 16] Publish render-health — mermaid backtick (M013) + table orphan-fragment linter",
);
await testDocRenderHealth(root, ok, fail);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
