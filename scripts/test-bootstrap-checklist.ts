/**
 * test-bootstrap-checklist.ts — chapter module for scripts/test.ts (T29.4).
 *
 * T29.4 adds a Bootstrap & Empty-State checklist (t=0 questions: how does
 * the first privileged user exist, is the system usable on an empty DB,
 * what's gated on state alone, what does a zero-role user see) plus three
 * new checks to validate-security-controls.sh (Phase-3 gate):
 *   - the checklist is answered with real, non-placeholder content
 *   - a self-referential permission gate (a role that can only be granted
 *     by itself, 1-hop OR a 2-hop mutual cycle: role A's grant requires
 *     role B, role B's grant requires role A) is flagged unless a real
 *     bootstrap-mechanism escape is documented
 *   - RBAC cardinality: a many-to-many role schema whose enforcement says
 *     "highest role wins" instead of "union of grants" is flagged
 * and one new check to validate-release-readiness.sh (Phase-5 gate): a
 * fresh-environment bootstrap dry-run report must exist, show a READY/PASS
 * verdict, and explicitly state no manual SQL was required.
 *
 * This chapter exercises the red/green fixtures under
 * evals/fixtures/validators/validate-security-controls/ (also covered by
 * check-validator-fixtures.mjs's generic harness -- this module additionally
 * asserts the SPECIFIC gap categories fired, not just exit code) plus two
 * inline fixtures the generic harness doesn't cover: a 2-hop mutual grant
 * cycle (the edge case a direct 1-hop-only check would miss) in both a
 * broken (no escape) and fixed (documented CLI bootstrap) form, and the
 * validate-release-readiness.sh bootstrap-dry-run check in isolation.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

type GapItem = { category: string; detail: string };
type ValidatorResult = { exitCode: number; gaps: GapItem[]; raw: string };

function runValidator(
  root: string,
  scriptName: string,
  targetDir: string,
): ValidatorResult {
  const scriptPath = path.join(root, "scripts/validators", scriptName);
  try {
    const out = execFileSync("bash", [scriptPath, targetDir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(out.trim().split("\n").pop() || "{}");
    return { exitCode: 0, gaps: parsed.items || [], raw: out };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string };
    const stdout = e.stdout || "";
    let gaps: GapItem[] = [];
    try {
      const lastLine = stdout.trim().split("\n").pop() || "{}";
      gaps = JSON.parse(lastLine).items || [];
    } catch {
      // ignore parse failure -- caller sees empty gaps + non-zero exit
    }
    return { exitCode: e.status ?? 1, gaps, raw: stdout };
  }
}

function mkTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t29-4-bootstrap-"));
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  return dir;
}

const THREAT_MODEL_MIN = `# Threat Model

| ID | STRIDE | Component | Severity | Description |
|----|--------|-----------|----------|--------------|
| T-01 | Elevation of Privilege | Auth | HIGH | role-grant abuse |

## Mitigations

| Threat ID | Mitigation |
|-----------|------------|
| T-01 | see SECURITY_CONTROLS.md |
`;

export async function testBootstrapChecklist(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  // -- 1. Checked-in RED fixture: exact gap categories fire ------------------
  try {
    const redDir = path.join(
      root,
      "evals/fixtures/validators/validate-security-controls/red",
    );
    const r = runValidator(root, "validate-security-controls.sh", redDir);
    const cats = r.gaps.map((g) => g.category);
    if (
      r.exitCode !== 0 &&
      cats.includes("self-referential-permission-gate") &&
      cats.includes("rbac-highest-role-wins")
    ) {
      ok(
        "bootstrap checklist — RED fixture: self-referential-permission-gate + rbac-highest-role-wins both flagged",
      );
    } else {
      fail(
        "bootstrap checklist — RED fixture",
        `exit=${r.exitCode} categories=${JSON.stringify(cats)}`,
      );
    }
  } catch (err: unknown) {
    fail(
      "bootstrap checklist — RED fixture",
      err instanceof Error ? err.message : String(err),
    );
  }

  // -- 2. Checked-in GREEN fixture: clean -------------------------------------
  try {
    const greenDir = path.join(
      root,
      "evals/fixtures/validators/validate-security-controls/green",
    );
    const r = runValidator(root, "validate-security-controls.sh", greenDir);
    if (r.exitCode === 0 && r.gaps.length === 0)
      ok("bootstrap checklist — GREEN fixture: clean (0 gaps)");
    else
      fail(
        "bootstrap checklist — GREEN fixture",
        `exit=${r.exitCode} gaps=${JSON.stringify(r.gaps)}`,
      );
  } catch (err: unknown) {
    fail(
      "bootstrap checklist — GREEN fixture",
      err instanceof Error ? err.message : String(err),
    );
  }

  // -- 3. Missing Bootstrap & Empty-State section entirely --------------------
  {
    const dir = mkTempProject();
    try {
      fs.writeFileSync(
        path.join(dir, "docs/THREAT_MODEL.md"),
        THREAT_MODEL_MIN,
      );
      fs.writeFileSync(
        path.join(dir, "docs/SECURITY_CONTROLS.md"),
        "# Security Controls\n\n| Threat ID | Control |\n|---|---|\n| T-01 | covered |\n",
      );
      const r = runValidator(root, "validate-security-controls.sh", dir);
      const cats = r.gaps.map((g) => g.category);
      if (r.exitCode !== 0 && cats.includes("missing-bootstrap-checklist"))
        ok(
          "bootstrap checklist — missing '## Bootstrap & Empty-State' section is flagged (missing-bootstrap-checklist)",
        );
      else
        fail(
          "bootstrap checklist — missing section",
          `exit=${r.exitCode} categories=${JSON.stringify(cats)}`,
        );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // -- 4. 2-hop mutual grant cycle (edge case a 1-hop-only check would miss) --
  // Role A's grant requires role B, role B's grant requires role A -- neither
  // can ever be bootstrapped, but neither role is granted "by itself".
  {
    const dir = mkTempProject();
    try {
      fs.writeFileSync(
        path.join(dir, "docs/THREAT_MODEL.md"),
        THREAT_MODEL_MIN,
      );
      fs.writeFileSync(
        path.join(dir, "docs/SECURITY_CONTROLS.md"),
        `# Security Controls

| Threat ID | Control |
|---|---|
| T-01 | covered |

## Role-Based Access Control

Only a Reviewer may grant the Approver role, and only an Approver may grant the Reviewer role. There is no other path to either role.

## Bootstrap & Empty-State

- **First privileged user:** Not defined.
- **Zero-seed usable:** No.
- **State-gated capabilities:** None.
- **Zero-role user view:** 403 error.
- **Bootstrap mechanism:** None.
`,
      );
      const r = runValidator(root, "validate-security-controls.sh", dir);
      const cats = r.gaps.map((g) => g.category);
      if (r.exitCode !== 0 && cats.includes("self-referential-permission-gate"))
        ok(
          "bootstrap checklist — 2-hop mutual grant cycle (Reviewer<->Approver) with no bootstrap escape is flagged",
        );
      else
        fail(
          "bootstrap checklist — 2-hop mutual grant cycle (broken)",
          `exit=${r.exitCode} categories=${JSON.stringify(cats)}`,
        );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // -- 5. Same 2-hop cycle, but WITH a documented bootstrap escape -----------
  {
    const dir = mkTempProject();
    try {
      fs.writeFileSync(
        path.join(dir, "docs/THREAT_MODEL.md"),
        THREAT_MODEL_MIN,
      );
      fs.writeFileSync(
        path.join(dir, "docs/SECURITY_CONTROLS.md"),
        `# Security Controls

| Threat ID | Control |
|---|---|
| T-01 | covered |

## Role-Based Access Control

Only a Reviewer may grant the Approver role, and only an Approver may grant the Reviewer role. There is no other direct path to either role.

## Bootstrap & Empty-State

- **First privileged user:** A one-time CLI seed command (\`seed:first-reviewer\`) creates the first Reviewer directly, bypassing the normal grant flow.
- **Zero-seed usable:** No — an operator runs the bootstrap CLI command once after provisioning.
- **State-gated capabilities:** None.
- **Zero-role user view:** Shows an "access pending" screen.
- **Bootstrap mechanism:** A one-time CLI seed command creates the first Reviewer; no manual SQL is required.
`,
      );
      const r = runValidator(root, "validate-security-controls.sh", dir);
      const cats = r.gaps.map((g) => g.category);
      if (
        r.exitCode === 0 &&
        !cats.includes("self-referential-permission-gate")
      )
        ok(
          "bootstrap checklist — 2-hop mutual grant cycle with a documented CLI bootstrap escape is NOT flagged",
        );
      else
        fail(
          "bootstrap checklist — 2-hop mutual grant cycle (fixed)",
          `exit=${r.exitCode} categories=${JSON.stringify(cats)}`,
        );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // -- 6. validate-release-readiness.sh: bootstrap dry-run checks -------------
  {
    const dir = mkTempProject();
    fs.mkdirSync(path.join(dir, "docs/reviews"), { recursive: true });
    try {
      const r = runValidator(root, "validate-release-readiness.sh", dir);
      const cats = r.gaps.map((g) => g.category);
      if (cats.includes("missing-bootstrap-dryrun"))
        ok(
          "release-readiness — no BOOTSTRAP_DRYRUN_*.md present: flagged (missing-bootstrap-dryrun)",
        );
      else
        fail(
          "release-readiness — missing bootstrap dry-run",
          `categories=${JSON.stringify(cats)}`,
        );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  {
    const dir = mkTempProject();
    fs.mkdirSync(path.join(dir, "docs/reviews"), { recursive: true });
    try {
      fs.writeFileSync(
        path.join(dir, "docs/reviews/BOOTSTRAP_DRYRUN_2026-07-09.md"),
        "# Bootstrap Dry-Run\n\nVerdict: BLOCKED\n\nFresh environment never reached a usable state -- signup endpoint 500s on an empty database.\n",
      );
      const r = runValidator(root, "validate-release-readiness.sh", dir);
      const cats = r.gaps.map((g) => g.category);
      if (cats.includes("bootstrap-dryrun-blocked"))
        ok(
          "release-readiness — BOOTSTRAP_DRYRUN with BLOCKED verdict: flagged (bootstrap-dryrun-blocked)",
        );
      else
        fail(
          "release-readiness — blocked bootstrap dry-run",
          `categories=${JSON.stringify(cats)}`,
        );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  {
    const dir = mkTempProject();
    fs.mkdirSync(path.join(dir, "docs/reviews"), { recursive: true });
    try {
      fs.writeFileSync(
        path.join(dir, "docs/reviews/BOOTSTRAP_DRYRUN_2026-07-09.md"),
        "# Bootstrap Dry-Run\n\nVerdict: READY\n\nProvisioned a brand-new environment from an empty database and reached a usable state end to end.\n",
      );
      const r = runValidator(root, "validate-release-readiness.sh", dir);
      const cats = r.gaps.map((g) => g.category);
      if (cats.includes("bootstrap-dryrun-no-manual-sql-claim"))
        ok(
          "release-readiness — READY verdict but no explicit 'no manual SQL' claim: flagged (bootstrap-dryrun-no-manual-sql-claim)",
        );
      else
        fail(
          "release-readiness — missing no-manual-SQL claim",
          `categories=${JSON.stringify(cats)}`,
        );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  {
    const dir = mkTempProject();
    fs.mkdirSync(path.join(dir, "docs/reviews"), { recursive: true });
    try {
      fs.writeFileSync(
        path.join(dir, "docs/reviews/BOOTSTRAP_DRYRUN_2026-07-09.md"),
        "# Bootstrap Dry-Run\n\nVerdict: READY\n\nProvisioned a brand-new environment from an empty database; reached a usable state with no manual SQL required at any step.\n",
      );
      const r = runValidator(root, "validate-release-readiness.sh", dir);
      const cats = r.gaps.map((g) => g.category);
      if (
        !cats.includes("bootstrap-dryrun-no-manual-sql-claim") &&
        !cats.includes("bootstrap-dryrun-blocked") &&
        !cats.includes("missing-bootstrap-dryrun")
      )
        ok(
          "release-readiness — READY verdict + explicit 'no manual SQL' claim: none of the bootstrap-dryrun gap categories fire",
        );
      else
        fail(
          "release-readiness — well-formed bootstrap dry-run",
          `categories=${JSON.stringify(cats)}`,
        );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
