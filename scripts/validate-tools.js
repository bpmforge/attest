#!/usr/bin/env node
/**
 * validate-tools.js
 * Checks that every .ts file in tools/ has a valid tool export.
 * Runs without needing @opencode-ai/plugin installed.
 */
const fs = require("fs");
const path = require("path");

const toolsDir = path.join(__dirname, "..", "tools");
const files = fs
  .readdirSync(toolsDir)
  .filter((f) => f.endsWith(".ts") && f !== "CUSTOM_TOOLS_GUIDE.md");

let passed = 0;
let failed = 0;

for (const file of files) {
  const content = fs.readFileSync(path.join(toolsDir, file), "utf8");
  // Each tool must: import tool, export default tool(...)
  const hasImport = content.includes("@opencode-ai/plugin");
  const hasExport = content.includes("export default tool(");

  if (hasImport && hasExport) {
    console.log(`  ✓ ${file}`);
    passed++;
  } else {
    console.error(
      `  ✗ ${file} — missing ${!hasImport ? "import" : "export default tool()"}`,
    );
    failed++;
  }
}

// Validate agents all have content
const agentsDir = path.join(__dirname, "..", "agents");
const agents = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
for (const agent of agents) {
  const content = fs.readFileSync(path.join(agentsDir, agent), "utf8");
  if (content.trim().length < 100) {
    console.error(
      `  ✗ agents/${agent} — suspiciously short (${content.length} bytes)`,
    );
    failed++;
  } else {
    console.log(`  ✓ agents/${agent}`);
    passed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
