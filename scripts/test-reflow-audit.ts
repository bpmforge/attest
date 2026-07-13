/**
 * test-reflow-audit.ts — Pass 27 chapter module for scripts/test.ts (T26.4).
 *
 * /reflow audit reconciliation mode: gradeModule() grades a single module
 * VERIFIED / UNVERIFIED / ORPHAN-CODE from manifest existence, a re-run of
 * `verify`, and evidence↔git-history cross-checks; auditPlan()/renderReport()
 * wire that into the full docs/work/RECONCILIATION.md report. Uses this
 * repo's OWN real git history (package.json's real commits) as fixture data
 * — no throwaway git repo needed, and no hardcoded commit hash to bit-rot:
 * the test discovers a real commit touching package.json at run time.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

export async function testReflowAudit(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const audit = await import(
    pathToFileURL(path.join(root, "scripts/lib/reflow-audit.mjs")).href
  );

  function baseModule(overrides: Record<string, unknown> = {}) {
    return {
      id: "M-a",
      kind: "module",
      title: "A",
      lane: "test",
      owner: "alice",
      status: "done",
      write_scope: ["package.json"],
      depends_on: [],
      acceptance: ["works"],
      ...overrides,
    };
  }

  try {
    // A real commit that really touched package.json — dynamically
    // discovered so this test never bit-rots against a pruned/rewritten
    // commit hash.
    const realCommit = execFileSync(
      "git",
      ["-C", root, "log", "--format=%H", "-1", "--", "package.json"],
      { encoding: "utf8" },
    ).trim();
    if (!/^[0-9a-f]{40}$/.test(realCommit)) {
      fail(
        "reflow-audit — setup",
        `could not discover a real commit touching package.json in ${root}`,
      );
      return;
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reflow-audit-"));
    const manifestPath = path.join(dir, "manifest.md");
    fs.writeFileSync(manifestPath, "# Manifest\n");

    // -- VERIFIED: manifest present, verify passes, evidence confirmed ----
    {
      const m = baseModule({
        manifest: "manifest.md",
        verify: "true",
        evidence: { branch: "feat/x", commits: [realCommit] },
      });
      const g = audit.gradeModule(m, { planDir: dir, repoRoot: root });
      if (g.grade === "VERIFIED")
        ok("reflow-audit — VERIFIED: manifest+verify+evidence all check out");
      else fail("reflow-audit — VERIFIED", JSON.stringify(g));
    }

    // -- VERIFIED even with verify NOT CONFIGURED (tri-state: absent -----
    // -- verify is N/A, not a failure, distinct from ran-and-failed) ------
    {
      const m = baseModule({
        manifest: "manifest.md",
        evidence: { branch: "feat/x", commits: [realCommit] },
      });
      const g = audit.gradeModule(m, { planDir: dir, repoRoot: root });
      if (g.grade === "VERIFIED" && g.checks.verifyState === "not-configured")
        ok(
          "reflow-audit — VERIFIED: verify not configured is N/A, not a block (tri-state)",
        );
      else
        fail(
          "reflow-audit — VERIFIED (no verify configured)",
          JSON.stringify(g),
        );
    }

    // -- ORPHAN-CODE: real code commits, no evidence ever recorded --------
    {
      const m = baseModule({ manifest: "manifest.md", verify: "true" });
      const g = audit.gradeModule(m, { planDir: dir, repoRoot: root });
      if (g.grade === "ORPHAN-CODE" && g.checks.codeCommitCount > 0)
        ok(
          "reflow-audit — ORPHAN-CODE: code exists for write_scope, no evidence recorded",
        );
      else fail("reflow-audit — ORPHAN-CODE", JSON.stringify(g));
    }

    // -- UNVERIFIED: evidence recorded but manifest missing ---------------
    {
      const m = baseModule({
        manifest: "no-such-manifest.md",
        verify: "true",
        evidence: { branch: "feat/x", commits: [realCommit] },
      });
      const g = audit.gradeModule(m, { planDir: dir, repoRoot: root });
      if (g.grade === "UNVERIFIED" && g.checks.manifestState === "missing")
        ok(
          "reflow-audit — UNVERIFIED: evidence recorded but manifest missing (not ORPHAN-CODE — evidence WAS recorded)",
        );
      else
        fail("reflow-audit — UNVERIFIED (manifest missing)", JSON.stringify(g));
    }

    // -- UNVERIFIED: verify gate re-run fails ------------------------------
    {
      const m = baseModule({
        manifest: "manifest.md",
        verify: "false",
        evidence: { branch: "feat/x", commits: [realCommit] },
      });
      const g = audit.gradeModule(m, { planDir: dir, repoRoot: root });
      if (g.grade === "UNVERIFIED" && g.checks.verifyState === "fail")
        ok("reflow-audit — UNVERIFIED: verify gate re-run fails");
      else fail("reflow-audit — UNVERIFIED (verify fails)", JSON.stringify(g));
    }

    // -- UNVERIFIED: evidence cites a commit that doesn't exist ------------
    {
      const m = baseModule({
        manifest: "manifest.md",
        verify: "true",
        evidence: {
          branch: "feat/x",
          commits: ["0000000000000000000000000000000000dead"],
        },
      });
      const g = audit.gradeModule(m, { planDir: dir, repoRoot: root });
      if (
        g.grade === "UNVERIFIED" &&
        g.checks.evidenceState === "commit-missing"
      )
        ok(
          "reflow-audit — UNVERIFIED: evidence cites a nonexistent commit (fabricated/unverifiable, not ORPHAN-CODE)",
        );
      else
        fail(
          "reflow-audit — UNVERIFIED (fabricated evidence)",
          JSON.stringify(g),
        );
    }

    // -- UNVERIFIED (skipped verify never fabricates a VERIFIED pass) -----
    {
      const m = baseModule({
        manifest: "manifest.md",
        verify: "true",
        evidence: { branch: "feat/x", commits: [realCommit] },
      });
      const g = audit.gradeModule(m, {
        planDir: dir,
        repoRoot: root,
        skipVerify: true,
      });
      if (g.grade === "UNVERIFIED" && g.checks.verifyState === "skipped")
        ok(
          "reflow-audit — UNVERIFIED: --skip-verify costs precision, never fabricates VERIFIED",
        );
      else fail("reflow-audit — skip-verify", JSON.stringify(g));
    }

    // -- UNVERIFIED: not-started ticket, nothing to verify -----------------
    {
      const m = baseModule({
        status: "ready",
        owner: null,
        write_scope: ["totally/fictional/path/nope.ts"],
      });
      const g = audit.gradeModule(m, { planDir: dir, repoRoot: root });
      if (g.grade === "UNVERIFIED" && g.checks.codeCommitCount === 0)
        ok(
          "reflow-audit — UNVERIFIED: not-started ticket is not misgraded ORPHAN-CODE",
        );
      else fail("reflow-audit — not-started", JSON.stringify(g));
    }

    // -- auditPlan: blocked modules excluded from grading, but counted -----
    {
      const plan = {
        modules: [
          baseModule({ id: "M-a", status: "blocked" }),
          baseModule({
            id: "M-b",
            manifest: "manifest.md",
            verify: "true",
            evidence: { branch: "x", commits: [realCommit] },
          }),
        ],
      };
      const { graded, blockedCount, totalModules } = audit.auditPlan(plan, {
        planDir: dir,
        repoRoot: root,
      });
      if (
        graded.length === 1 &&
        graded[0].id === "M-b" &&
        blockedCount === 1 &&
        totalModules === 2
      )
        ok(
          "reflow-audit — auditPlan: blocked module excluded from grading, still counted",
        );
      else
        fail(
          "reflow-audit — auditPlan blocked exclusion",
          JSON.stringify({ graded, blockedCount, totalModules }),
        );
    }

    // -- renderReport + CLI end-to-end ------------------------------------
    {
      const planPath = path.join(dir, "plan.json");
      fs.writeFileSync(
        planPath,
        JSON.stringify({
          modules: [
            baseModule({
              id: "M-verified",
              manifest: "manifest.md",
              verify: "true",
              evidence: { branch: "x", commits: [realCommit] },
            }),
            baseModule({
              id: "M-orphan",
              manifest: "manifest.md",
              verify: "true",
            }),
            baseModule({
              id: "M-unverified",
              manifest: "no-such.md",
              verify: "true",
              evidence: { branch: "x", commits: [realCommit] },
            }),
            baseModule({ id: "M-blocked", status: "blocked" }),
          ],
        }),
      );
      const outPath = path.join(dir, "RECONCILIATION.md");
      const stdout = execFileSync(
        "node",
        [
          path.join(root, "scripts/lib/reflow-audit.mjs"),
          planPath,
          "--repo",
          root,
          "--out",
          outPath,
        ],
        { encoding: "utf8" },
      );
      const report = fs.readFileSync(outPath, "utf8");
      const hasAllGrades =
        report.includes("**VERIFIED**: 1") &&
        report.includes("**UNVERIFIED**: 1") &&
        report.includes("**ORPHAN-CODE**: 1") &&
        report.includes("not graded (blocked)**: 1") &&
        report.includes("### M-verified") &&
        report.includes("### M-orphan") &&
        report.includes("### M-unverified") &&
        !report.includes("M-blocked");
      const stdoutMatches =
        stdout.includes("VERIFIED=1") &&
        stdout.includes("UNVERIFIED=1") &&
        stdout.includes("ORPHAN-CODE=1");
      if (hasAllGrades && stdoutMatches)
        ok(
          "reflow-audit — CLI end-to-end: writes RECONCILIATION.md with correct per-grade sections + summary counts",
        );
      else
        fail(
          "reflow-audit — CLI end-to-end",
          JSON.stringify({ hasAllGrades, stdoutMatches, stdout, report }),
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("reflow-audit", `unexpected failure: ${message}`);
  }
}
