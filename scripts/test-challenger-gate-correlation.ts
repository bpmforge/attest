/**
 * test-challenger-gate-correlation.ts — Pass 13 chapter module for
 * scripts/test.ts (T22.20).
 *
 * validate-challenger-gate.sh used to accept ANY clean CHALLENGE_REPORT as
 * satisfying ALL source reports (T27.3's pure existence check). T22.20
 * closes that: every source report with a HIGH/CRITICAL finding must be
 * individually matched to a challenge report that declares it via the
 * "**Artifact:** <path>" header field, compared by basename. These cases
 * cover the ticket's acceptance criterion plus the matching mechanism's
 * positive/negative edges. Run on real /bin/bash (not $BASH) per the
 * T27.7 lesson.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

export async function testChallengerGateCorrelation(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const validator = path.join(
    root,
    "scripts/validators/validate-challenger-gate.sh",
  );

  function run(dir: string): {
    exitCode: number;
    stdout: string;
    stderr: string;
  } {
    try {
      const stdout = execFileSync("/bin/bash", [validator, dir], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { exitCode: 0, stdout, stderr: "" };
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return {
        exitCode: e.status ?? 1,
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
      };
    }
  }

  function makeFixtureDir(): string {
    const dir = fs.mkdtempSync(
      path.join(fs.realpathSync(root), ".tmp-challenger-gate-corr-"),
    );
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "docs/reviews"), { recursive: true });
    return dir;
  }

  try {
    // -- regression (independent review, 2026-07-08, T22.20): a challenge
    // report has a parseable Summary with CONTRADICTED: 0 but no
    // "**Artifact:**" header field at all -- can't be correlated to any
    // source, so it must not silently satisfy the gate either.
    {
      const dir = makeFixtureDir();
      fs.writeFileSync(
        path.join(dir, "docs/reviews/FIX_BACKLOG_release.md"),
        "| ID | Severity | Status |\n|----|----------|--------|\n| F1 | CRITICAL | OPEN |\n",
      );
      fs.writeFileSync(
        path.join(dir, "docs/reviews/CHALLENGE_REPORT_no_artifact.md"),
        [
          "# Challenge Report",
          "",
          "## Summary",
          "- Claims reviewed: 1",
          "- CONFIRMED: 1",
          "- CONTRADICTED: 0",
          "- UNVERIFIABLE: 0",
          "- Action required: NO",
          "",
        ].join("\n"),
      );
      const r = run(dir);
      if (
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":2') &&
        r.stdout.includes("malformed-challenge-report") &&
        r.stdout.includes("missing-challenge-report")
      )
        ok(
          "challenger-gate-correlation — a challenge report with no Artifact field can't correlate to any source",
        );
      else
        fail(
          "challenger-gate-correlation — challenge report missing Artifact field",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- T22.20 acceptance criterion: an old, clean, UNRELATED challenge
    // report exists (declaring a different Artifact) while a brand-new
    // CRITICAL finding in a different report has never been challenged.
    // Reproduced live pre-fix: T27.3's pure existence check ("does at
    // least one CHALLENGE_REPORT exist anywhere") passed this scenario
    // clean, because it never looked at which source the old report
    // declared. Must gate red under the correlation fix.
    {
      const dir = makeFixtureDir();
      fs.mkdirSync(path.join(dir, "docs/security"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "docs/reviews/CHALLENGE_REPORT_old_topic_2026-06-01.md"),
        [
          "# Challenge Report — OLD_TOPIC",
          "",
          "**Date:** 2026-06-01 | **Artifact:** docs/reviews/OLD_TOPIC.md | **Challenger:** challenger agent",
          "",
          "## Summary",
          "- Claims reviewed: 1",
          "- CONFIRMED: 1",
          "- CONTRADICTED: 0",
          "- UNVERIFIABLE: 0",
          "- Action required: NO",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(dir, "docs/security/SECURITY_new.md"),
        "| ID | Severity | Finding | Status |\n|----|----------|---------|--------|\n| S1 | CRITICAL | SQL injection in search endpoint | OPEN |\n",
      );
      const r = run(dir);
      if (
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":1') &&
        r.stdout.includes("missing-challenge-report") &&
        r.stdout.includes("SECURITY_new.md")
      )
        ok(
          "challenger-gate-correlation — T22.20: an old unrelated clean challenge report does not satisfy a new unrelated CRITICAL finding",
        );
      else
        fail(
          "challenger-gate-correlation — T22.20 unrelated-challenge regression",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 500)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- T22.20 positive case: a challenge report that DOES declare the
    // matching source (cross-directory: source under docs/security/,
    // challenge report under docs/reviews/, matched by basename) with 0
    // CONTRADICTED is accepted.
    {
      const dir = makeFixtureDir();
      fs.mkdirSync(path.join(dir, "docs/security"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "docs/security/SECURITY_new.md"),
        "| ID | Severity | Finding | Status |\n|----|----------|---------|--------|\n| S1 | CRITICAL | SQL injection in search endpoint | OPEN |\n",
      );
      fs.writeFileSync(
        path.join(
          dir,
          "docs/reviews/CHALLENGE_REPORT_security_new_2026-07-09.md",
        ),
        [
          "# Challenge Report — SECURITY_new",
          "",
          "**Date:** 2026-07-09 | **Artifact:** docs/security/SECURITY_new.md | **Challenger:** challenger agent",
          "",
          "## Summary",
          "- Claims reviewed: 1",
          "- CONFIRMED: 1",
          "- CONTRADICTED: 0",
          "- UNVERIFIABLE: 0",
          "- Action required: NO",
          "",
        ].join("\n"),
      );
      const r = run(dir);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok(
          "challenger-gate-correlation — a challenge report that declares the matching Artifact satisfies its source",
        );
      else
        fail(
          "challenger-gate-correlation — matching Artifact satisfies source",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- T22.20 false-positive guard: a challenge report declares an
    // Artifact that is almost-but-not-quite the right filename (extra
    // "_v2" suffix) -- basename matching is exact-string, so this must
    // NOT match, and the real source must still gate red.
    {
      const dir = makeFixtureDir();
      fs.writeFileSync(
        path.join(dir, "docs/reviews/SECURITY_new.md"),
        "| ID | Severity | Finding | Status |\n|----|----------|---------|--------|\n| S1 | CRITICAL | SQL injection | OPEN |\n",
      );
      fs.writeFileSync(
        path.join(
          dir,
          "docs/reviews/CHALLENGE_REPORT_security_new_v2_2026-07-09.md",
        ),
        [
          "# Challenge Report — SECURITY_new_v2",
          "",
          "**Date:** 2026-07-09 | **Artifact:** docs/reviews/SECURITY_new_v2.md | **Challenger:** challenger agent",
          "",
          "## Summary",
          "- Claims reviewed: 1",
          "- CONFIRMED: 1",
          "- CONTRADICTED: 0",
          "- UNVERIFIABLE: 0",
          "- Action required: NO",
          "",
        ].join("\n"),
      );
      const r = run(dir);
      if (
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":1') &&
        r.stdout.includes("missing-challenge-report")
      )
        ok(
          "challenger-gate-correlation — a near-miss Artifact filename (SECURITY_new_v2.md) does not falsely match SECURITY_new.md",
        );
      else
        fail(
          "challenger-gate-correlation — near-miss Artifact filename",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- T22.20: a bare-filename Artifact declaration (no directory
    // prefix) still matches via basename comparison.
    {
      const dir = makeFixtureDir();
      fs.mkdirSync(path.join(dir, "docs/security"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "docs/security/SECURITY_new.md"),
        "| ID | Severity | Finding | Status |\n|----|----------|---------|--------|\n| S1 | CRITICAL | SQL injection | OPEN |\n",
      );
      fs.writeFileSync(
        path.join(
          dir,
          "docs/reviews/CHALLENGE_REPORT_security_new_2026-07-09.md",
        ),
        [
          "# Challenge Report — SECURITY_new",
          "",
          "**Date:** 2026-07-09 | **Artifact:** SECURITY_new.md | **Challenger:** challenger agent",
          "",
          "## Summary",
          "- Claims reviewed: 1",
          "- CONFIRMED: 1",
          "- CONTRADICTED: 0",
          "- UNVERIFIABLE: 0",
          "- Action required: NO",
          "",
        ].join("\n"),
      );
      const r = run(dir);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok(
          "challenger-gate-correlation — a bare-filename Artifact declaration matches via basename",
        );
      else
        fail(
          "challenger-gate-correlation — bare-filename Artifact match",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- T22.20 cross-directory collision guard: two DIFFERENT source
    // reports share the same basename in different directories
    // (docs/reviews/FINDINGS.md vs docs/security/FINDINGS.md). A challenge
    // report declaring the FULL path of only one of them must not also
    // satisfy the other -- a pure basename compare would incorrectly
    // conflate the two, which is the exact bug class this ticket exists to
    // close, one level down.
    {
      const dir = makeFixtureDir();
      fs.mkdirSync(path.join(dir, "docs/security"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "docs/reviews/FINDINGS.md"),
        "| ID | Severity | Finding | Status |\n|----|----------|---------|--------|\n| F1 | CRITICAL | Reviewed and challenged finding | OPEN |\n",
      );
      fs.writeFileSync(
        path.join(dir, "docs/security/FINDINGS.md"),
        "| ID | Severity | Finding | Status |\n|----|----------|---------|--------|\n| F2 | CRITICAL | Unrelated, never-challenged finding | OPEN |\n",
      );
      fs.writeFileSync(
        path.join(dir, "docs/reviews/CHALLENGE_REPORT_findings_2026-07-09.md"),
        [
          "# Challenge Report — FINDINGS (docs/reviews)",
          "",
          "**Date:** 2026-07-09 | **Artifact:** docs/reviews/FINDINGS.md | **Challenger:** challenger agent",
          "",
          "## Summary",
          "- Claims reviewed: 1",
          "- CONFIRMED: 1",
          "- CONTRADICTED: 0",
          "- UNVERIFIABLE: 0",
          "- Action required: NO",
          "",
        ].join("\n"),
      );
      const r = run(dir);
      if (
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":1') &&
        r.stdout.includes("missing-challenge-report") &&
        r.stdout.includes("docs/security/FINDINGS.md") &&
        !r.stdout.includes("docs/reviews/FINDINGS.md: contains a CRITICAL")
      )
        ok(
          "challenger-gate-correlation — a full-path Artifact match for docs/reviews/FINDINGS.md does not also satisfy the unrelated docs/security/FINDINGS.md",
        );
      else
        fail(
          "challenger-gate-correlation — cross-directory basename collision",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 600)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- T22.20 bare-filename ambiguity guard: two DIFFERENT source
    // reports share a basename in different directories, and the ONLY
    // challenge report declares a BARE filename (no directory component)
    // -- unlike the previous case, a bare declaration can't disambiguate
    // which of the two it actually challenged. Must satisfy NEITHER (fail
    // closed), not silently pick one. This is the residual hole a naive
    // "bare filename matches by basename" fallback would reopen.
    {
      const dir = makeFixtureDir();
      fs.mkdirSync(path.join(dir, "docs/security"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "docs/reviews/FINDINGS.md"),
        "| ID | Severity | Finding | Status |\n|----|----------|---------|--------|\n| F1 | CRITICAL | Reviewed and challenged finding | OPEN |\n",
      );
      fs.writeFileSync(
        path.join(dir, "docs/security/FINDINGS.md"),
        "| ID | Severity | Finding | Status |\n|----|----------|---------|--------|\n| F2 | CRITICAL | Unrelated, never-challenged finding | OPEN |\n",
      );
      fs.writeFileSync(
        path.join(
          dir,
          "docs/reviews/CHALLENGE_REPORT_findings_bare_2026-07-09.md",
        ),
        [
          "# Challenge Report — FINDINGS (bare filename)",
          "",
          "**Date:** 2026-07-09 | **Artifact:** FINDINGS.md | **Challenger:** challenger agent",
          "",
          "## Summary",
          "- Claims reviewed: 1",
          "- CONFIRMED: 1",
          "- CONTRADICTED: 0",
          "- UNVERIFIABLE: 0",
          "- Action required: NO",
          "",
        ].join("\n"),
      );
      const r = run(dir);
      if (
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":2') &&
        r.stdout.includes("docs/reviews/FINDINGS.md") &&
        r.stdout.includes("docs/security/FINDINGS.md")
      )
        ok(
          "challenger-gate-correlation — a bare-filename Artifact declaration that's ambiguous between two same-basename sources satisfies neither",
        );
      else
        fail(
          "challenger-gate-correlation — bare-filename ambiguity guard",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 600)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("challenger-gate-correlation", `unexpected failure: ${message}`);
  }
}
