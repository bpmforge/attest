/**
 * test-bootstrap-checklist-regressions.ts — chapter module for
 * scripts/test.ts (T29.4 follow-up).
 *
 * Regression cases for four real gaps an independent review (2026-07-09)
 * found in validate-security-controls.sh's Bootstrap & Empty-State checks
 * (see scripts/test-bootstrap-checklist.ts for the original 9 cases; split
 * into a second chapter module to stay under the 400-line file-size cap):
 *
 *   1. `bootstrap_escape_ok()` keyword-matched "seed" even when the SAME
 *      field confessed the seed script was unsafe to re-run ("do not run
 *      this twice ... corrupt the role table") -- fixed with danger-cue
 *      detection that rejects an admittedly-unsafe mechanism.
 *   2. The RBAC negation-cue list missed "rejected ... in favor of"
 *      phrasing, false-positiving a design that explicitly explains why it
 *      avoided the highest-role-wins anti-pattern -- cue list expanded.
 *   3. Circular-gate detection only checked 1-hop (direct self-reference)
 *      and 2-hop (mutual pair) cycles; a 3+-hop chain (Alpha->Beta->Gamma->
 *      Alpha) went undetected -- replaced with general N-hop cycle
 *      detection (DFS, white/gray/black coloring, over the grant-
 *      dependency graph built from every "only X may grant Y" statement).
 *   4. The three new checks were appended AFTER the pre-existing "no
 *      THREAT_MODEL.md -> validator_exit" early return in
 *      validate-security-controls.sh, making them unreachable on exactly
 *      the kind of early-stage project (design exists, threat model
 *      doesn't yet) this ticket targets -- checks reordered to run first.
 */

import * as fs from "fs";
import * as path from "path";
import {
  runValidator,
  mkTempProject,
  THREAT_MODEL_MIN,
} from "./test-bootstrap-checklist.ts";

export async function testBootstrapChecklistRegressions(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  // -- 1. REGRESSION (independent review, 2026-07-09, finding #1): an
  // admittedly-unsafe seed script must NOT be accepted as a valid escape --
  // "do not run this twice, it will create duplicate admins and corrupt the
  // role table" keyword-matched "seed" and passed clean before the fix.
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

Only an admin may grant the admin role to another user.

## Bootstrap & Empty-State

- **First privileged user:** A seed script creates the first admin.
- **Zero-seed usable:** No.
- **State-gated capabilities:** None.
- **Zero-role user view:** 403 error.
- **Bootstrap mechanism:** A seed script creates the first admin — do not run this twice, it will create duplicate admins and corrupt the role table.
`,
      );
      const r = runValidator(root, "validate-security-controls.sh", dir);
      const cats = r.gaps.map((g) => g.category);
      if (r.exitCode !== 0 && cats.includes("self-referential-permission-gate"))
        ok(
          "bootstrap checklist — REGRESSION: a bootstrap mechanism that confesses it is unsafe to re-run ('do not run this twice ... corrupt') is still flagged, not accepted as an escape",
        );
      else
        fail(
          "bootstrap checklist — REGRESSION: unsafe seed script disclosure",
          `exit=${r.exitCode} categories=${JSON.stringify(cats)}`,
        );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // -- 2. REGRESSION (independent review, 2026-07-09, finding #2): a design
  // that explicitly explains WHY it avoided the highest-role-wins anti-
  // pattern ("rejected ... in favor of") must not itself be flagged.
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

Users may hold multiple roles (many-to-many user-role relationship). We explicitly rejected a highest role wins approach in favor of computing the union of grants across all roles.

## Bootstrap & Empty-State

- **First privileged user:** Automatic first-user-is-admin.
- **Zero-seed usable:** Yes.
- **State-gated capabilities:** None.
- **Zero-role user view:** Access-pending screen.
- **Bootstrap mechanism:** Automatic first-user grant, idempotent.
`,
      );
      const r = runValidator(root, "validate-security-controls.sh", dir);
      const cats = r.gaps.map((g) => g.category);
      if (r.exitCode === 0 && !cats.includes("rbac-highest-role-wins"))
        ok(
          "bootstrap checklist — REGRESSION: 'we rejected highest-role-wins in favor of union of grants' does not false-positive as committing the anti-pattern",
        );
      else
        fail(
          "bootstrap checklist — REGRESSION: RBAC negation phrasing (rejected/in favor of)",
          `exit=${r.exitCode} categories=${JSON.stringify(cats)}`,
        );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // -- 3. REGRESSION (independent review, 2026-07-09, finding #3): a 3-hop
  // circular authority chain (Alpha->Beta->Gamma->Alpha, no mutual 2-hop
  // pair anywhere) must be caught by the general N-hop cycle detector.
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

Only an Alpha may grant the Beta role. Only a Beta may grant the Gamma role. Only a Gamma may grant the Alpha role.

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
          "bootstrap checklist — REGRESSION: a 3-hop circular authority chain (Alpha->Beta->Gamma->Alpha) is caught by general N-hop cycle detection",
        );
      else
        fail(
          "bootstrap checklist — REGRESSION: 3-hop circular chain",
          `exit=${r.exitCode} categories=${JSON.stringify(cats)}`,
        );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // -- 4. REGRESSION (independent review, 2026-07-09, finding #4): the
  // Bootstrap/self-referential/RBAC checks must fire even when
  // THREAT_MODEL.md does not exist yet -- they used to be appended after an
  // early `validator_exit` on missing THREAT_MODEL.md, making them
  // unreachable on exactly the kind of early-stage project this ticket
  // targets.
  {
    const dir = mkTempProject();
    try {
      // Deliberately no docs/THREAT_MODEL.md.
      fs.writeFileSync(
        path.join(dir, "docs/SECURITY_CONTROLS.md"),
        `# Security Controls

## Role-Based Access Control

Only an admin may grant the admin role to another user.

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
          "bootstrap checklist — REGRESSION: self-referential-permission-gate still fires with no docs/THREAT_MODEL.md present (checks reordered before the early exit)",
        );
      else
        fail(
          "bootstrap checklist — REGRESSION: checks unreachable without THREAT_MODEL.md",
          `exit=${r.exitCode} categories=${JSON.stringify(cats)}`,
        );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
