/**
 * test-autonomy-ledger.ts — Pass 7 chapter module for scripts/test.ts (T27.5).
 *
 * validate-autonomy-ledger.sh checks docs/work/APPROVALS.md: well-formed
 * rows, known pause_site_id (cross-referenced against the G-ids and NA-ids
 * tables in AUTONOMY_PROTOCOL.md), and the NEVER-AUTO tripwire (an NA-id row
 * must be human-signed, not "auto" or an agent name). Run on real /bin/bash
 * (not $BASH) per the T27.7 lesson: a homebrew bash on the dev machine can
 * mask a bash-3.2 regression that stock macOS bash would hit.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

export async function testAutonomyLedger(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const validator = path.join(
    root,
    "scripts/validators/validate-autonomy-ledger.sh",
  );
  const fixturesDir = path.join(
    root,
    "evals/fixtures/validators/validate-autonomy-ledger",
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

  try {
    // -- green fixture: well-formed rows, NA-3 human-signed -> clean
    {
      const r = run(path.join(fixturesDir, "green"));
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok("autonomy-ledger — green fixture clean (0 gaps)");
      else
        fail(
          "autonomy-ledger — green fixture clean",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
    }

    // -- red fixture: NA-3 signed by "Claude", unknown id NA-99, an empty
    // default_taken cell, and a pipe-shifted row -> 4 gaps, all categories
    {
      const r = run(path.join(fixturesDir, "red"));
      const hasAll =
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":4') &&
        r.stdout.includes("never-auto-not-signed") &&
        r.stdout.includes("unknown-pause-site") &&
        r.stdout.includes("malformed-row");
      if (hasAll)
        ok(
          "autonomy-ledger — red fixture flags never-auto-not-signed + unknown-pause-site + malformed-row (x2)",
        );
      else
        fail(
          "autonomy-ledger — red fixture",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
    }

    // -- regression (independent review, 2026-07-08): a literal '|' inside
    // an earlier free-text column used to shift every cell after it, so a
    // NEVER-AUTO row genuinely self-signed by "agent" read as if signed_by
    // was an unrelated earlier cell's text and slipped through clean. This
    // is the exact tripwire-defeat scenario the validator exists to catch.
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-autonomy-ledger-"),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, "docs/work"), { recursive: true });
      fs.mkdirSync(path.join(dir, "agents/shared"), { recursive: true });
      fs.copyFileSync(
        path.join(root, "agents/shared/AUTONOMY_PROTOCOL.md"),
        path.join(dir, "agents/shared/AUTONOMY_PROTOCOL.md"),
      );
      fs.writeFileSync(
        path.join(dir, "docs/work/APPROVALS.md"),
        [
          "| timestamp | pause_site_id | default_taken | signed_by | what the user would have been asked |",
          "|---|---|---|---|---|",
          "| 2026-07-08T10:00:00Z | NA-3 | Ran migration A | B fallback | agent | Approve? |",
          "",
        ].join("\n"),
      );
      const r = run(dir);
      if (
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":1') &&
        r.stdout.includes("malformed-row")
      )
        ok(
          "autonomy-ledger — a literal '|' in an earlier column is rejected as malformed, not silently mis-parsed",
        );
      else
        fail(
          "autonomy-ledger — pipe-shifted row",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- missing APPROVALS.md entirely -> clean exit, not a gap (most
    // projects never run in auto mode; absence isn't itself a violation)
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-autonomy-ledger-"),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const r = run(dir);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok("autonomy-ledger — missing APPROVALS.md is clean, not a gap");
      else
        fail(
          "autonomy-ledger — missing APPROVALS.md",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- NA-* row signed by a real human other than "auto"/blocklist -> clean
    // (proves the tripwire doesn't false-positive on the legitimate case)
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-autonomy-ledger-"),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, "docs/work"), { recursive: true });
      fs.mkdirSync(path.join(dir, "agents/shared"), { recursive: true });
      fs.copyFileSync(
        path.join(root, "agents/shared/AUTONOMY_PROTOCOL.md"),
        path.join(dir, "agents/shared/AUTONOMY_PROTOCOL.md"),
      );
      fs.writeFileSync(
        path.join(dir, "docs/work/APPROVALS.md"),
        [
          "| timestamp | pause_site_id | default_taken | signed_by | what the user would have been asked |",
          "|---|---|---|---|---|",
          "| 2026-07-08T11:00:00Z | NA-2 | Ran the DANGEROUS migration | jdoe | Approve destructive migration? |",
          "",
        ].join("\n"),
      );
      const r = run(dir);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok("autonomy-ledger — NA-* row signed by a real human is clean");
      else
        fail(
          "autonomy-ledger — NA-* row signed by a real human",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("autonomy-ledger", `unexpected failure: ${message}`);
  }
}
