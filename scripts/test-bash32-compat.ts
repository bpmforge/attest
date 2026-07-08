/**
 * test-bash32-compat.ts — Pass 6 chapter module for scripts/test.ts (T27.7).
 *
 * _lib.sh claims "Compatible with bash 3.2+ (macOS default) — no associative
 * arrays" but detect-sdlc-state.sh and validate-module-design.sh both used
 * `declare -A`, so they failed outright on stock macOS `/bin/bash` despite
 * that claim. These fixtures run both scripts through `/bin/bash` explicitly
 * (not `$BASH`, which may resolve to a homebrew bash 4/5 on some machines
 * and would silently pass even with the bug present) and assert clean exits
 * with no bash syntax-error output.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

export async function testBash32Compat(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const detectStateScript = path.join(root, "scripts/detect-sdlc-state.sh");
  const moduleDesignScript = path.join(
    root,
    "scripts/validators/validate-module-design.sh",
  );

  function makeFixtureDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "bash32-fixture-"));
  }

  function writeFiles(dir: string, files: Record<string, string>) {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  }

  function runOnStockBash(
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

  // A bash-version-syntax failure surfaces as a bash-emitted parse/option
  // error on stderr, distinct from this validator's own gap/pass output.
  function hasBashSyntaxError(stderr: string): boolean {
    return /invalid option|syntax error|declare: -A/i.test(stderr);
  }

  try {
    // -- detect-sdlc-state.sh: all four status paths, on real /bin/bash
    {
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "docs/VISION.md": "# Vision\ncontent",
        "docs/COMPETITIVE_ANALYSIS.md": "# Competitive\ncontent",
      });
      const r = runOnStockBash(detectStateScript, [dir]);
      if (
        r.exitCode === 1 &&
        !hasBashSyntaxError(r.stderr) &&
        r.stdout.includes('"status":"partial"')
      )
        ok(
          "bash 3.2 compat — detect-sdlc-state.sh partial-status path runs clean on /bin/bash",
        );
      else
        fail(
          "bash 3.2 compat — detect-sdlc-state.sh partial-status path",
          `exit=${r.exitCode} stderr=${r.stderr.slice(0, 200)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    {
      const dir = makeFixtureDir();
      const r = runOnStockBash(detectStateScript, [dir]);
      if (
        r.exitCode === 0 &&
        !hasBashSyntaxError(r.stderr) &&
        r.stdout.includes('"status":"fresh"')
      )
        ok(
          "bash 3.2 compat — detect-sdlc-state.sh fresh-status path runs clean on /bin/bash",
        );
      else
        fail(
          "bash 3.2 compat — detect-sdlc-state.sh fresh-status path",
          `exit=${r.exitCode} stderr=${r.stderr.slice(0, 200)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    {
      const dir = makeFixtureDir();
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      const r = runOnStockBash(detectStateScript, [dir]);
      if (
        r.exitCode === 2 &&
        !hasBashSyntaxError(r.stderr) &&
        r.stdout.includes('"status":"brownfield"')
      )
        ok(
          "bash 3.2 compat — detect-sdlc-state.sh brownfield-status path runs clean on /bin/bash",
        );
      else
        fail(
          "bash 3.2 compat — detect-sdlc-state.sh brownfield-status path",
          `exit=${r.exitCode} stderr=${r.stderr.slice(0, 200)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- validate-module-design.sh: dependency table with a real circular
    // dependency, exercised on real /bin/bash (this is the `dep_map`
    // associative-array site found incidentally while fixing detect-sdlc-state.sh).
    {
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "docs/MODULE_DESIGN.md": [
          "# Module Design",
          "",
          "## Module Inventory",
          "",
          "| Module | Purpose | Owner | Interface | Depends On |",
          "|--------|---------|-------|-----------|------------|",
          "| auth | login | team-a | REST | shared-types, users |",
          "| users | user data | team-b | REST | auth, shared-types |",
          "| shared-types | types | team-c | lib | — |",
          "",
          "## Plugin / Extension Points",
          "",
          "body",
          "",
          "## Dependency Rules",
          "",
          "body",
          "",
          "## New Feature Addition Recipe",
          "",
          "1. step",
          "2. step",
          "3. step",
          "",
          "## Enforcement Configuration",
          "",
          "body",
          "",
        ].join("\n"),
      });
      const r = runOnStockBash(moduleDesignScript, [dir]);
      if (
        !hasBashSyntaxError(r.stderr) &&
        r.stdout.includes("circular-dependency") &&
        /auth.*users|users.*auth/.test(r.stdout)
      )
        ok(
          "bash 3.2 compat — validate-module-design.sh circular-dependency check runs clean on /bin/bash",
        );
      else
        fail(
          "bash 3.2 compat — validate-module-design.sh circular-dependency check",
          `exit=${r.exitCode} stderr=${r.stderr.slice(0, 200)} stdout=${r.stdout.slice(0, 200)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- validate-module-design.sh: New Feature Addition Recipe heading
    // present but with NO numbered steps -- the step_count site (same
    // grep -c/-eq double-count bug as module_count, found by independent
    // review after the module_count fix landed: the heading existing
    // doesn't guarantee any numbered lines exist, so this path wasn't
    // actually guarded despite being read as safe).
    {
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "docs/MODULE_DESIGN.md": [
          "# Module Design",
          "",
          "## Module Inventory",
          "",
          "| Module | Purpose | Owner | Interface | Depends On |",
          "|--------|---------|-------|-----------|------------|",
          "| auth | login | team-a | REST | — |",
          "",
          "## Plugin / Extension Points",
          "",
          "body",
          "",
          "## Dependency Rules",
          "",
          "body",
          "",
          "## New Feature Addition Recipe",
          "",
          "Just prose here, no numbered list.",
          "",
          "## Enforcement Configuration",
          "",
          "body",
          "",
        ].join("\n"),
      });
      const r = runOnStockBash(moduleDesignScript, [dir]);
      if (
        !hasBashSyntaxError(r.stderr) &&
        r.stdout.includes("thin-feature-recipe")
      )
        ok(
          "bash 3.2 compat — validate-module-design.sh step_count (no numbered steps) runs clean and flags the gap",
        );
      else
        fail(
          "bash 3.2 compat — validate-module-design.sh step_count",
          `exit=${r.exitCode} stderr=${r.stderr.slice(0, 200)} stdout=${r.stdout.slice(0, 200)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- detect-sdlc-state.sh: "complete" status path (all phases present),
    // the one status branch the original Pass 6 didn't exercise.
    {
      const dir = makeFixtureDir();
      fs.mkdirSync(path.join(dir, "docs/testing"), { recursive: true });
      fs.mkdirSync(path.join(dir, "docs/reviews"), { recursive: true });
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      const docs = [
        "VISION",
        "COMPETITIVE_ANALYSIS",
        "SCOPE",
        "RISKS",
        "CONSTRAINTS",
        "USER_PERSONAS",
        "SRS",
        "USER_STORIES",
        "USE_CASES",
        "MODULE_DESIGN",
        "ARCHITECTURE",
        "API_DESIGN",
        "TECH_STACK",
        "THREAT_MODEL",
        "SECURITY_CONTROLS",
        "INFRASTRUCTURE",
      ];
      const files: Record<string, string> = {};
      for (const d of docs) files[`docs/${d}.md`] = `# ${d}\ncontent`;
      files["docs/testing/TEST_DESIGN.md"] = "# Test Design\ncontent";
      files["docs/reviews/FIX_BACKLOG_RELEASE.md"] =
        "# Fix Backlog Release\ncontent";
      writeFiles(dir, files);
      const r = runOnStockBash(detectStateScript, [dir]);
      if (
        r.exitCode === 3 &&
        !hasBashSyntaxError(r.stderr) &&
        r.stdout.includes('"status":"complete"')
      )
        ok(
          "bash 3.2 compat — detect-sdlc-state.sh complete-status path runs clean on /bin/bash",
        );
      else
        fail(
          "bash 3.2 compat — detect-sdlc-state.sh complete-status path",
          `exit=${r.exitCode} stderr=${r.stderr.slice(0, 200)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("bash 3.2 compat", `unexpected failure: ${message}`);
  }
}
