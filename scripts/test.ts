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
 * Matches patterns like `sdlc-lead`, `code-reviewer`, etc. that look like agent filenames.
 */
function extractAgentRefs(content: string): string[] {
  const refs: string[] = [];
  const pattern = /`([a-z][\w-]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    // Only treat it as an agent ref if it looks like an agent name
    if (knownAgents.has(m[1])) {
      refs.push(m[1]);
    }
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
// Pass 4: Tickets — module-contract graph logic (T1/T9)
// ---------------------------------------------------------------------------
console.log("\n[Pass 4] Tickets — module-contract graph logic");
try {
  const tickets = await import(
    pathToFileURL(path.join(root, "scripts/lib/tickets.mjs")).href
  );
  const samplePath = path.join(root, "examples/tickets-plan.sample.json");
  const plan = tickets.loadPlan(samplePath);

  const v = tickets.validatePlan(plan);
  if (v.ok) ok("tickets — sample plan validates");
  else fail("tickets — sample plan validates", v.errors.join("; "));

  tickets.recomputeStatus(plan);
  const claim = tickets
    .claimable(plan)
    .map((m: { id: string }) => m.id)
    .sort();
  const expected = ["M-frontend-dashboard", "M-kanban-board"];
  if (JSON.stringify(claim) === JSON.stringify(expected))
    ok(`tickets — recomputeStatus yields claimable ${expected.join(", ")}`);
  else
    fail(
      "tickets — claimable set",
      `expected ${expected.join(",")} got ${claim.join(",")}`,
    );

  // negative: a cycle must be caught
  const cyc = tickets.loadPlan(samplePath);
  cyc.modules.find((m: { id: string }) => m.id === "M-db-backend").depends_on =
    ["M-frontend-dashboard"];
  if (!tickets.validatePlan(cyc).ok) ok("tickets — cycle detected");
  else fail("tickets — cycle detected", "cyclic plan validated as ok");

  // negative: overlapping write-scope on active modules IN THE SAME LANE must be flagged
  const col = tickets.loadPlan(samplePath);
  const dash = col.modules.find(
    (m: { id: string }) => m.id === "M-frontend-dashboard",
  );
  const kan = col.modules.find(
    (m: { id: string }) => m.id === "M-kanban-board",
  );
  dash.status = "in_progress";
  kan.status = "in_progress";
  kan.write_scope = ["src/dashboard/shared/**"];
  if (tickets.writeScopeCollisions(col).length > 0)
    ok("tickets — same-lane write-scope collision flagged");
  else fail("tickets — same-lane write-scope collision", "overlap not flagged");

  // negative (T10.1): missing lane must be a validation error
  const noLane = tickets.loadPlan(samplePath);
  delete noLane.modules.find((m: { id: string }) => m.id === "M-db-backend")
    .lane;
  const noLaneResult = tickets.validatePlan(noLane);
  if (
    !noLaneResult.ok &&
    noLaneResult.errors.some((e: string) => e.includes("missing string lane"))
  )
    ok("tickets — missing lane flagged");
  else
    fail("tickets — missing lane flagged", "plan with no lane validated as ok");

  // negative (T10.1): write-scope overlap ACROSS lanes must be a validation error,
  // unconditional on status — construct two done/blocked modules in different
  // lanes with overlapping scope; no module is active, so writeScopeCollisions()
  // would miss this on purpose, but validatePlan() must still catch it.
  const crossLane = tickets.loadPlan(samplePath);
  const designSystem = crossLane.modules.find(
    (m: { id: string }) => m.id === "M-design-system",
  );
  designSystem.write_scope = ["src/db/migrations/**"]; // overlaps db-backend's src/db/** — different lanes, both status "done"
  const crossLaneResult = tickets.validatePlan(crossLane);
  if (
    !crossLaneResult.ok &&
    crossLaneResult.errors.some((e: string) =>
      e.includes("write-scope collision across lanes"),
    )
  )
    ok(
      "tickets — cross-lane write-scope collision flagged regardless of status",
    );
  else
    fail(
      "tickets — cross-lane write-scope collision",
      "overlap between different-lane 'done' modules was not flagged",
    );
  // and writeScopeCollisions() must NOT also report it (same-lane only, no double-reporting)
  if (tickets.writeScopeCollisions(crossLane).length === 0)
    ok("tickets — writeScopeCollisions() correctly ignores cross-lane pairs");
  else
    fail(
      "tickets — writeScopeCollisions() cross-lane isolation",
      "writeScopeCollisions() reported a cross-lane pair it should leave to crossLaneCollisions()",
    );

  // positive (T10.1): crossLaneCollisions() is directly callable and empty on the clean sample
  if (tickets.crossLaneCollisions(plan).length === 0)
    ok("tickets — crossLaneCollisions() clean on the valid sample plan");
  else
    fail(
      "tickets — crossLaneCollisions() clean on sample",
      `unexpected collisions: ${JSON.stringify(tickets.crossLaneCollisions(plan))}`,
    );
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  fail("tickets", `import/exec failed: ${message}`);
}

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
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
