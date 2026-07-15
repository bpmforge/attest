/**
 * test-tool-preflight.ts — chapter module for scripts/test.ts.
 *
 * Guards the v2.19 tool-preflight fixes (the container-ops defect class applied
 * to scanner/profiler runners). Two invariants:
 *
 *   A. NO SCANNER MAY BE `|| true`'d INTO A FALSE CLEAN. A missing/failed scanner
 *      whose error is swallowed with `|| true` reports 0 findings — a broken gate
 *      reads as a passed one. This was a real bug (IaC_METHODOLOGY.md contradicted
 *      its own "never `|| true`" rule; OWASP had siblings). This check keeps it dead
 *      across the whole agent corpus.
 *
 *   B. The tool-runner agents whose JOB is an often-absent external tool must
 *      reference agents/shared/TOOL_PREFLIGHT.md (the detect/degrade/diagnose
 *      contract) — so the wiring can't silently regress.
 *
 * TOOL_PREFLIGHT.md itself is exempt from (A): it shows the anti-pattern as a
 * labelled "# WRONG" teaching example.
 */

import * as fs from "fs";
import * as path from "path";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

// A scanner/auditor name adjacent to a `|| true` on the same line = false clean.
const SCANNER_FALSE_CLEAN =
  /\b(checkov|trivy|semgrep|kics|trufflehog|syft|grype|bandit|gitleaks|osv-scanner|snyk|pip-audit|cargo audit|govulncheck|npm audit|lizard|jscpd)\b.*\|\|\s*true\b/;

// Runners whose whole job is an often-absent tool — must cite the contract.
const REQUIRED_PREFLIGHT = [
  "agents/performance/profiler-agent.md",
  "agents/security/cloud-security-checker.md",
  "agents/security/IaC_METHODOLOGY.md",
  "agents/code-review/duplication-detector.md",
  "agents/code-review/complexity-analyzer.md",
  "agents/security/dependency-auditor.md",
];

const EXEMPT_FROM_FALSE_CLEAN = new Set(["shared/TOOL_PREFLIGHT.md"]);

export function testToolPreflight(root: string, ok: OK, fail: FAIL) {
  console.log(
    "\n[Pass 45] Tool preflight — no `|| true` false-clean scans + runners cite the contract",
  );

  const agentsDir = path.join(root, "agents");
  if (!fs.existsSync(agentsDir)) {
    fail("agents dir exists", "agents/ is missing");
    return;
  }

  // -- A. No scanner || true false-clean anywhere in the agent corpus --------
  let falseCleans = 0;
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (!e.name.endsWith(".md")) continue;
      const rel = path.relative(agentsDir, full);
      if (EXEMPT_FROM_FALSE_CLEAN.has(rel)) continue;
      const lines = fs.readFileSync(full, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (SCANNER_FALSE_CLEAN.test(line)) {
          falseCleans++;
          fail(
            `no false-clean: ${rel}:${i + 1}`,
            `scanner piped to '|| true' — a missing/failed scan would read as a clean pass. Gate on 'command -v' and record SKIPPED instead (see TOOL_PREFLIGHT.md)`,
          );
        }
      });
    }
  })(agentsDir);
  if (falseCleans === 0)
    ok("no scanner is `|| true`'d into a false clean (whole corpus)");

  // -- B. Flagged runners reference the preflight contract -------------------
  for (const rel of REQUIRED_PREFLIGHT) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) {
      fail(`runner exists: ${rel}`, `${rel} is missing`);
      continue;
    }
    if (/TOOL_PREFLIGHT/.test(fs.readFileSync(p, "utf8"))) {
      ok(`cites TOOL_PREFLIGHT: ${path.basename(rel)}`);
    } else {
      fail(
        `cites TOOL_PREFLIGHT: ${rel}`,
        `${rel} runs an often-absent tool but does not reference TOOL_PREFLIGHT.md — detection/degrade contract not wired`,
      );
    }
  }
}
