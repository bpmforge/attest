/**
 * test-memory-writeback.ts — chapter module for scripts/test.ts.
 *
 * Regression gate for the MEMORY_PRIMER M4 write-back audit. v2.5.0 swept the
 * inline-manifest agents but MISSED seven producer specialists (architecture-
 * designer, security-auditor, security/semgrep-runner, the four sdlc/onboard/*
 * specialists) because agent-file coverage was never gated — only the produced
 * manifest was. This test closes that: EVERY producer agent must document the
 * write-back (a `memory_store` call or a `## Memory written` manifest line), so
 * a future agent added without it fails CI instead of silently shipping.
 *
 * Orchestrators/coordinators that DELEGATE rather than produce durable findings
 * are exempt by design (they don't memory_store — their specialists do), as are
 * shared references, templates, schemas, and protocol docs (not agents).
 */

import * as fs from "fs";
import * as path from "path";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

// Orchestrators / concierge: dispatch specialists, don't memory_store themselves.
const EXEMPT_ORCHESTRATORS = new Set([
  "sdlc-lead",
  "sdlc-init-mode",
  "sdlc-feature-mode",
  "sdlc-improve-mode",
  "sdlc-onboard-mode",
  "sdlc-init-phases-0-2",
  "sdlc-init-phase-3",
  "sdlc-init-phases-3-4",
  "sdlc-init-phase-4",
  "sdlc-init-phase-5",
  "guide",
]);

// Non-agent files that live under agents/ (references, templates, schemas,
// protocols, shared blocks) — matched by path fragment or name pattern.
function isNonAgent(rel: string): boolean {
  if (rel.startsWith("shared/")) return true;
  // match templates/ and blocks/ whether at the path root or nested
  if (/(^|\/)(templates|blocks)\//.test(rel)) return true;
  return /(_SCHEMA|SCHEMA|_METHODOLOGY|METHODOLOGY|_PROTOCOL|PROTOCOL|_LOOP|_PRIMER|_ADAPTER|_RULES|_BUDGET|_TESTING|_INFRASTRUCTURE|_REF|CONTRACT|SELECTION|SCORING|CAPTURE|HYGIENE|BOUNDARY|E2E_INFRASTRUCTURE)/.test(
    rel,
  );
}

export function testMemoryWriteback(root: string, ok: OK, fail: FAIL) {
  console.log(
    "\n[Pass 41] Memory write-back — every producer agent documents M4",
  );

  const agentsDir = path.join(root, "agents");
  const files: string[] = [];
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".md")) files.push(full);
    }
  })(agentsDir);

  const missing: string[] = [];
  let checked = 0;
  for (const full of files) {
    const rel = path.relative(agentsDir, full);
    const base = path.basename(rel, ".md");
    if (isNonAgent(rel) || EXEMPT_ORCHESTRATORS.has(base)) continue;
    checked++;
    const body = fs.readFileSync(full, "utf8");
    // Accept either the manifest section heading or a direct memory_store call
    // (coding-agent documents it under "## Memory (cross-session)").
    if (!/memory_store/.test(body) && !/Memory written/.test(body)) {
      missing.push(rel);
    }
  }

  if (missing.length === 0) {
    ok(
      `every producer agent (${checked} checked) documents memory write-back (memory_store / ## Memory written)`,
    );
  } else {
    fail(
      "memory-writeback coverage",
      `${missing.length} producer agent(s) missing M4 write-back: ${missing.join(", ")}`,
    );
  }

  // Guard the exemption list itself: an exempt orchestrator that no longer
  // exists is stale config worth catching.
  const staleExempt = [...EXEMPT_ORCHESTRATORS].filter(
    (n) => !fs.existsSync(path.join(agentsDir, `${n}.md`)),
  );
  if (staleExempt.length === 0)
    ok("memory-writeback exemption list has no stale entries");
  else
    fail(
      "memory-writeback exemptions",
      `exempt agents no longer exist: ${staleExempt.join(", ")}`,
    );
}
