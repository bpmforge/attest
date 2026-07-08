/**
 * test-challenger-gate.ts — Pass 9 chapter module for scripts/test.ts (T27.3).
 *
 * validate-challenger-gate.sh: any FIX_BACKLOG/review/security report with a
 * HIGH or CRITICAL finding requires a matching docs/reviews/CHALLENGE_REPORT_*.md
 * with zero unresolved CONTRADICTED verdicts. Run on real /bin/bash (not
 * $BASH) per the T27.7 lesson.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

export async function testChallengerGate(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const validator = path.join(
    root,
    "scripts/validators/validate-challenger-gate.sh",
  );
  const fixturesDir = path.join(
    root,
    "evals/fixtures/validators/validate-challenger-gate",
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
      path.join(fs.realpathSync(root), ".tmp-challenger-gate-"),
    );
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "docs/reviews"), { recursive: true });
    return dir;
  }

  try {
    // -- green fixture: CRITICAL finding + matching challenge report, 0 CONTRADICTED
    {
      const r = run(path.join(fixturesDir, "green"));
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok("challenger-gate — green fixture clean (0 gaps)");
      else
        fail(
          "challenger-gate — green fixture clean",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
    }

    // -- red fixture: CRITICAL finding, no challenge report at all
    {
      const r = run(path.join(fixturesDir, "red"));
      if (
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":1') &&
        r.stdout.includes("missing-challenge-report")
      )
        ok("challenger-gate — red fixture flags missing-challenge-report");
      else
        fail(
          "challenger-gate — red fixture",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
    }

    // -- no HIGH/CRITICAL anywhere -> clean, no report required
    {
      const dir = makeFixtureDir();
      fs.writeFileSync(
        path.join(dir, "docs/reviews/FIX_BACKLOG_release.md"),
        "| ID | Severity | Status |\n|----|----------|--------|\n| F1 | LOW | OPEN |\n",
      );
      const r = run(dir);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok(
          "challenger-gate — no HIGH/CRITICAL findings needs no challenge report",
        );
      else
        fail(
          "challenger-gate — no HIGH/CRITICAL findings",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- a challenge report exists but still shows CONTRADICTED > 0 -> gap
    {
      const dir = makeFixtureDir();
      fs.writeFileSync(
        path.join(dir, "docs/reviews/FIX_BACKLOG_release.md"),
        "| ID | Severity | Status |\n|----|----------|--------|\n| F1 | HIGH | OPEN |\n",
      );
      fs.writeFileSync(
        path.join(dir, "docs/reviews/CHALLENGE_REPORT_backlog_2026-07-08.md"),
        [
          "# Challenge Report",
          "",
          "## Summary",
          "- Claims reviewed: 2",
          "- CONFIRMED: 1",
          "- CONTRADICTED: 1",
          "- UNVERIFIABLE: 0",
          "- Action required: YES",
          "",
        ].join("\n"),
      );
      const r = run(dir);
      if (
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":1') &&
        r.stdout.includes("unresolved-contradicted")
      )
        ok(
          "challenger-gate — a challenge report with CONTRADICTED > 0 is flagged unresolved",
        );
      else
        fail(
          "challenger-gate — unresolved CONTRADICTED",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("challenger-gate", `unexpected failure: ${message}`);
  }
}
