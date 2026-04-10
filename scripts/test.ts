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
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
