/**
 * test-truthful-completion.ts — Pass 10 chapter module for scripts/test.ts (T27.2).
 *
 * Three pieces exercised here:
 *   1. validate-completion-manifest.sh v2 — Files-produced/Verify-result stat
 *      checks + Maker/Verifier identity check, against real fixtures.
 *   2. validate-tickets.sh — now chained into phase-4's GATE_VALIDATORS, so
 *      check-validator-fixtures.mjs (Pass 7) already exercises its red/green
 *      fixtures automatically; this adds a direct test for clarity.
 *   3. run-handoff-gates.sh's new Tracker gate — end-to-end through a real
 *      throwaway git repo (validate-tracker-fresh.sh is git-diff based, so
 *      this can't be faked with static fixture files alone).
 *
 * Run on real /bin/bash (not $BASH) per the T27.7 lesson.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

export async function testTruthfulCompletion(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  function run(
    script: string,
    args: string[],
  ): { exitCode: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync("/bin/bash", [script, ...args], {
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
    // -- 1. validate-completion-manifest.sh v2 -------------------------------
    const manifestValidator = path.join(
      root,
      "scripts/validators/validate-completion-manifest.sh",
    );
    const manifestFixtures = path.join(
      root,
      "evals/fixtures/validators/validate-completion-manifest",
    );

    {
      const r = run(manifestValidator, [
        path.join(manifestFixtures, "red/manifest.md"),
        path.join(manifestFixtures, "red"),
      ]);
      const hasAll =
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":4') &&
        r.stdout.includes("file-not-found") &&
        r.stdout.includes("verify-no-artifact") &&
        r.stdout.includes("maker-verifier-same") &&
        r.stdout.includes("no-tracker-line");
      if (hasAll)
        ok(
          "completion-manifest v2 — red fixture flags file-not-found + verify-no-artifact + maker-verifier-same + no-tracker-line",
        );
      else
        fail(
          "completion-manifest v2 — red fixture",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 500)}`,
        );
    }

    {
      const r = run(manifestValidator, [
        path.join(manifestFixtures, "green/manifest.md"),
        path.join(manifestFixtures, "green"),
      ]);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok("completion-manifest v2 — green fixture clean (0 gaps)");
      else
        fail(
          "completion-manifest v2 — green fixture",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
    }

    // -- regression (independent review, 2026-07-08): a "Files produced"
    // section with pure prose and no backtick-quoted path at all used to
    // evade the stat check entirely -- nothing was extracted, so nothing
    // was checked, so it silently passed with zero gaps despite being
    // exactly the unverifiable claim v2 exists to catch.
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-manifest-noartifact-"),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, "docs/reviews"), { recursive: true });
      fs.writeFileSync(path.join(dir, "docs/reviews/VERIFY.md"), "5 passed\n");
      const manifestPath = path.join(dir, "manifest.md");
      fs.writeFileSync(
        manifestPath,
        [
          "# Completion Manifest",
          "",
          "## Files produced",
          "I wrote some TypeScript files, they're great.",
          "",
          "## Decisions made",
          "- used real.ts",
          "",
          "## Known issues",
          "- none",
          "",
          "## Verify result",
          "See `docs/reviews/VERIFY.md`",
          "",
          "Maker: coding-agent",
          "Verifier: alice",
          "Tracker updated: docs/work/DELEGATION_LOG.md",
          "",
          "coding-agent done -- shipped stuff",
          "",
        ].join("\n"),
      );
      const r = run(manifestValidator, [manifestPath, dir]);
      if (
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":1') &&
        r.stdout.includes("files-no-artifact")
      )
        ok(
          "completion-manifest v2 — a 'Files produced' section with no backtick-quoted path is rejected, not silently accepted",
        );
      else
        fail(
          "completion-manifest v2 — files-no-artifact",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 2. validate-tickets.sh (now chained into phase-4) -------------------
    const ticketsValidator = path.join(
      root,
      "scripts/validators/validate-tickets.sh",
    );
    const ticketsFixtures = path.join(
      root,
      "evals/fixtures/validators/validate-tickets",
    );

    {
      const r = run(ticketsValidator, [path.join(ticketsFixtures, "red")]);
      if (
        r.exitCode === 1 &&
        r.stdout.includes("ticket-invariant") &&
        r.stdout.includes("missing string lane")
      )
        ok("validate-tickets — red fixture flags missing lane");
      else
        fail(
          "validate-tickets — red fixture",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
    }

    {
      const r = run(ticketsValidator, [path.join(ticketsFixtures, "green")]);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok("validate-tickets — green fixture clean");
      else
        fail(
          "validate-tickets — green fixture",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
    }

    // -- 3. run-handoff-gates.sh Tracker gate, end-to-end through a real git repo
    const handoffGates = path.join(
      root,
      "scripts/validators/run-handoff-gates.sh",
    );

    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-handoff-gates-"),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, "src/auth"), { recursive: true });
      fs.mkdirSync(path.join(dir, "docs/reviews"), { recursive: true });
      fs.mkdirSync(path.join(dir, "docs/work"), { recursive: true });
      fs.writeFileSync(path.join(dir, "src/auth/.gitkeep"), "");
      fs.writeFileSync(path.join(dir, "docs/reviews/.gitkeep"), "");
      fs.writeFileSync(path.join(dir, "docs/work/.gitkeep"), "");
      execFileSync("git", ["init", "-q"], { cwd: dir });
      // Set a repo-local identity so the commit works on a fresh CI runner that
      // has no global git user configured (otherwise: "Author identity unknown").
      execFileSync("git", ["config", "user.email", "test@example.com"], {
        cwd: dir,
      });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
      execFileSync("git", ["add", "-A"], { cwd: dir });
      execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });

      fs.writeFileSync(path.join(dir, "src/auth/login.ts"), "export {};\n");
      const manifestPath = "docs/reviews/MANIFEST_auth.md";
      fs.writeFileSync(
        path.join(dir, manifestPath),
        [
          "# Completion Manifest",
          "",
          "## Files produced",
          "- `src/auth/login.ts` — login handler",
          "",
          "## Decisions made",
          "- used jwt",
          "",
          "## Known issues",
          "- none",
          "",
          "## Verify result",
          "See `docs/reviews/MANIFEST_auth.md` — this file itself as a stand-in artifact",
          "",
          "Maker: coding-agent",
          "Verifier: alice",
          "Tracker updated: docs/work/DELEGATION_LOG.md",
          "",
          "coding-agent done -- shipped login.ts",
          "",
        ].join("\n"),
      );

      // No tracker file touched yet -> Tracker gate must fail
      const before = run(handoffGates, [
        "--scope",
        "src/auth",
        "--manifest",
        manifestPath,
        "--root",
        dir,
      ]);
      const beforeGood =
        before.exitCode === 1 &&
        before.stdout.includes('"gaps":1') &&
        before.stdout.includes('"category":"tracker"');
      if (beforeGood)
        ok(
          "run-handoff-gates — Tracker gate fails when work changed but no tracker file touched",
        );
      else
        fail(
          "run-handoff-gates — Tracker gate (before)",
          `exit=${before.exitCode} stdout=${before.stdout.slice(0, 400)}`,
        );

      // Touch the declared tracker -> all gates clean
      fs.writeFileSync(
        path.join(dir, "docs/work/DELEGATION_LOG.md"),
        "| ts | agent | task | DONE | 8/10 | note |\n",
      );
      const after = run(handoffGates, [
        "--scope",
        "src/auth",
        "--manifest",
        manifestPath,
        "--root",
        dir,
      ]);
      if (after.exitCode === 0 && after.stdout.includes('"gaps":0'))
        ok(
          "run-handoff-gates — all gates (scope/manifest/tracker) clean once tracker is touched",
        );
      else
        fail(
          "run-handoff-gates — Tracker gate (after)",
          `exit=${after.exitCode} stdout=${after.stdout.slice(0, 400)}`,
        );

      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("truthful-completion", `unexpected failure: ${message}`);
  }
}
