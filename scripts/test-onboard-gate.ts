/**
 * test-onboard-gate.ts — chapter module for scripts/test.ts.
 *
 * The default `/sdlc onboard` pass (Steps 0-7 + a ROUTE/TABLE-only inventory)
 * runs `run-coverage-loop.sh onboard-deep`, and on any repo with source
 * subdirectories that gate could never pass. Reproduced against a project
 * built exactly as the onboard mode file instructs, four independent causes:
 *
 *   1. validate-inventory re-derived SERVICE rows from src/ subdirectories —
 *      rows the lightweight pass is documented never to write. Fixed by a
 *      declared `Scope: ROUTE, TABLE` line the validator honors (and
 *      announces); no Scope line (every --deep inventory) stays fully strict.
 *   2. validate-sequence-coverage only read docs/sequences/<UC-id>*.md and
 *      ARCHITECTURE.md; onboard writes docs/diagrams/sequences/<flow>.md.
 *      Fixed additively: a UC-id heading above a sequenceDiagram there counts.
 *   3. validate-erd-coverage never looked at docs/diagrams/erd.md, where
 *      onboard Step 3 writes the ERD. Fixed additively.
 *   4. Step 7 never asked for the `## HLA Overview` validate-architecture
 *      requires — an agent-text fix in sdlc-onboard-mode.md, not tested here.
 *
 * This chapter builds that project in a temp dir and asserts: the corrected
 * output passes the whole onboard-deep gate; removing the Scope line brings
 * back inventory-missing-service (deep mode not weakened); a diagrams/
 * sequence with no UC-id heading still fails (the new path is not a free
 * pass); and the ERD is found at the onboard path.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runValidator } from "./test-bootstrap-checklist.ts";

function write(dir: string, rel: string, body: string): void {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

const FENCE = "```";

/** A project exactly as a corrected default onboard leaves it. */
function buildOnboardedProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onboard-gate-"));
  write(dir, "package.json", '{"name":"shop","version":"1.0.0"}\n');
  write(
    dir,
    "src/routes/orders.js",
    "router.get('/api/orders', h);\nrouter.post('/api/orders', h);\n",
  );
  write(dir, "src/routes/auth.js", "router.post('/api/login', h);\n");
  write(
    dir,
    "src/models/schema.sql",
    "CREATE TABLE users (id INTEGER PRIMARY KEY);\nCREATE TABLE orders (id INTEGER PRIMARY KEY);\n",
  );
  write(dir, "src/services/billing.js", "module.exports = {};\n");
  write(
    dir,
    "docs/testing/USE_CASES.md",
    "| ID | Name | Priority |\n|----|------|----------|\n| UC-01 | User login | P0 |\n| UC-02 | Place order | P0 |\n",
  );
  write(
    dir,
    "docs/diagrams/sequences/auth.md",
    `# Auth\n\n## UC-01: User login\n\n${FENCE}mermaid\nsequenceDiagram\n    U->>A: POST /api/login\n${FENCE}\n`,
  );
  write(
    dir,
    "docs/diagrams/sequences/write-operation.md",
    `# Write\n\n## UC-02: Place order\n\n${FENCE}mermaid\nsequenceDiagram\n    U->>A: POST /api/orders\n${FENCE}\n`,
  );
  write(
    dir,
    "docs/diagrams/erd.md",
    `# ERD\n\n${FENCE}mermaid\nerDiagram\n    users ||--o{ orders : places\n${FENCE}\n`,
  );
  write(
    dir,
    "docs/API_DESIGN.md",
    "| Method | Path |\n|---|---|\n| GET | /api/orders |\n| POST | /api/orders |\n| POST | /api/login |\n",
  );
  write(
    dir,
    "docs/onboard/INVENTORY.md",
    [
      "# Inventory",
      "",
      "Scope: ROUTE, TABLE",
      "",
      "| ID | Category | Description | Artifact | Status |",
      "|----|----------|-------------|----------|--------|",
      "| R-01 | ROUTE | GET /api/orders | /api/orders | DONE |",
      "| R-02 | ROUTE | POST /api/orders | /api/orders | DONE |",
      "| R-03 | ROUTE | POST /api/login | /api/login | DONE |",
      "| T-01 | TABLE | users | users | DONE |",
      "| T-02 | TABLE | orders | orders | DONE |",
      "",
    ].join("\n"),
  );
  write(
    dir,
    "docs/ARCHITECTURE.md",
    [
      "# Architecture",
      "",
      "## HLA Overview",
      "",
      "Express API over SQL: routes call services, services use users and orders.",
      "",
      "## 1. System Context (C1)",
      "",
      `${FENCE}mermaid\nflowchart LR\n    Customer --> Shop\n${FENCE}`,
      "",
      "## 2. Container Diagram (C2)",
      "",
      "See diagrams/c2-containers.md.",
      "",
      "## 3. Component Diagram (C3)",
      "",
      `${FENCE}mermaid\nflowchart TD\n    routes --> services\n${FENCE}`,
      "",
      "## 4. Sequence Diagrams",
      "",
      "See diagrams/sequences/.",
      "",
      "## 5. Data Flow Diagram",
      "",
      `${FENCE}mermaid\nflowchart LR\n    Client --> API\n${FENCE}`,
      "",
      "## 6. Deployment Diagram",
      "",
      `${FENCE}mermaid\nflowchart LR\n    App --> DB\n${FENCE}`,
      "",
    ].join("\n"),
  );
  write(dir, "docs/ONBOARDING.md", "# Onboarding\n");
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

export function testOnboardGate(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const dir = buildOnboardedProject();
  try {
    // 1. The whole chained gate passes on corrected default-onboard output.
    const gate = path.join(root, "scripts/validators/validate-phase-gate.sh");
    try {
      execFileSync("bash", [gate, "onboard-deep", dir], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      ok(
        "onboard gate — default-onboard output passes onboard-deep end to end",
      );
    } catch (err: unknown) {
      const out = (err as { stdout?: string }).stdout || "";
      fail(
        "onboard gate — default-onboard output",
        out.trim().split("\n").pop() || "non-zero exit",
      );
    }

    // 2. Scope line removed (a deep inventory) -> SERVICE re-derivation is back.
    const inv = path.join(dir, "docs/onboard/INVENTORY.md");
    const scoped = fs.readFileSync(inv, "utf8");
    fs.writeFileSync(inv, scoped.replace("Scope: ROUTE, TABLE\n", ""));
    const deep = runValidator(root, "validate-inventory.sh", dir);
    const deepCats = deep.gaps.map((g) => g.category);
    if (
      deep.exitCode !== 0 &&
      deepCats.filter((c) => c === "inventory-missing-service").length === 3
    ) {
      ok(
        "onboard gate — no Scope line: 3 unlisted src/ services still flagged (deep not weakened)",
      );
    } else {
      fail(
        "onboard gate — deep strictness",
        `exit=${deep.exitCode} categories=${JSON.stringify(deepCats)}`,
      );
    }
    fs.writeFileSync(inv, scoped);

    // 3. A diagrams/ sequence without a UC-id heading does not count.
    const seq = path.join(dir, "docs/diagrams/sequences/write-operation.md");
    const seqBody = fs.readFileSync(seq, "utf8");
    fs.writeFileSync(
      seq,
      seqBody.replace("## UC-02: Place order", "## Place order"),
    );
    const s = runValidator(root, "validate-sequence-coverage.sh", dir);
    const missing = s.gaps
      .filter((g) => g.category === "missing-sequence")
      .map((g) => g.detail);
    if (
      s.exitCode !== 0 &&
      missing.length === 1 &&
      missing[0].includes("UC-02")
    ) {
      ok(
        "onboard gate — diagrams/sequences needs a UC-id heading: UC-02 flagged, UC-01 counted",
      );
    } else {
      fail(
        "onboard gate — sequence heading rule",
        `exit=${s.exitCode} missing=${JSON.stringify(missing)}`,
      );
    }
    fs.writeFileSync(seq, seqBody);

    // 4. The ERD is found at the path onboard Step 3 writes.
    const e = runValidator(root, "validate-erd-coverage.sh", dir);
    if (
      !e.gaps.some(
        (g) => g.category === "no-mermaid-erd" || g.category === "missing-file",
      )
    ) {
      ok("onboard gate — ERD found at docs/diagrams/erd.md");
    } else {
      fail(
        "onboard gate — ERD path",
        JSON.stringify(e.gaps.map((g) => g.category)),
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
