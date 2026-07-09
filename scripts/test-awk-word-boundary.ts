/**
 * test-awk-word-boundary.ts — Pass 13 chapter module for scripts/test.ts (T22.19).
 *
 * `\b` word-boundary is a no-op on stock macOS system awk (onetrueawk
 * 20200816): `/usr/bin/awk '/\bx\b/'` silently matches nothing, while
 * `awk '/x/'` matches. Three sites relied on `\b` inside `awk '...'` blocks
 * and therefore never actually fired on this machine:
 *   1. validate-code-health.sh R-02 (try/catch inside a loop)
 *   2. validate-code-health.sh H-01 (functions >50 lines)
 *   3. validate-fix-backlog-closed.sh (WAIVED row missing a justification)
 *
 * This module has two parts:
 *   a. Direct reproduction of the ORIGINAL \b patterns against real
 *      /usr/bin/awk, proving the silent-no-match bug is real (not inferred
 *      from reading the regex).
 *   b. The fixed validators, run through real /bin/bash with PATH forced
 *      to prefer /usr/bin (so `awk` resolves to the actual stock system
 *      awk, not a possibly-shadowing gawk/mawk on $PATH -- the T27.7
 *      lesson: verify against the real system tool, not $AWK/$BASH).
 *      Each site gets a positive case (the fix now fires) and a negative
 *      case (an adjacent substring, including an underscore-joined
 *      identifier, does NOT false-positive).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

export async function testAwkWordBoundary(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const codeHealthScript = path.join(
    root,
    "scripts/validators/validate-code-health.sh",
  );
  const fixBacklogScript = path.join(
    root,
    "scripts/validators/validate-fix-backlog-closed.sh",
  );

  // Force PATH to prefer /usr/bin so `awk` inside the validator scripts
  // resolves to the real stock system awk, not a shadowing gawk/mawk.
  const stockEnv = { ...process.env, PATH: `/usr/bin:${process.env.PATH}` };

  function makeFixtureDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "awk-boundary-fixture-"));
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
        env: stockEnv,
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

  function runAwkOnStock(program: string, input: string): string {
    return execFileSync("/usr/bin/awk", [program], {
      input,
      encoding: "utf8",
    });
  }

  try {
    // -- (a) Direct reproduction: the three ORIGINAL \b patterns silently
    // match nothing on real /usr/bin/awk, even on input that should match
    // under correct \b semantics.
    {
      const out = runAwkOnStock(
        "/\\b(for|while|forEach|map|reduce|filter)\\b.*\\{/",
        "for (const x of xs) {\n",
      );
      if (out === "")
        ok(
          "awk \\b repro — R-02 loop-keyword pattern silently matches nothing on real /usr/bin/awk (bug confirmed)",
        );
      else
        fail(
          "awk \\b repro — R-02 loop-keyword pattern",
          `expected no output, got: ${JSON.stringify(out)}`,
        );
    }
    {
      const out = runAwkOnStock("/\\btry\\b[[:space:]]*\\{/", "  try {\n");
      if (out === "")
        ok(
          "awk \\b repro — R-02 try-keyword pattern silently matches nothing on real /usr/bin/awk (bug confirmed)",
        );
      else
        fail(
          "awk \\b repro — R-02 try-keyword pattern",
          `expected no output, got: ${JSON.stringify(out)}`,
        );
    }
    {
      const out = runAwkOnStock(
        "/\\b(function|=>[[:space:]]*\\{|async[[:space:]]+function)\\b/",
        "function foo() {\n",
      );
      if (out === "")
        ok(
          "awk \\b repro — H-01 function-keyword pattern silently matches nothing on real /usr/bin/awk (bug confirmed)",
        );
      else
        fail(
          "awk \\b repro — H-01 function-keyword pattern",
          `expected no output, got: ${JSON.stringify(out)}`,
        );
    }
    {
      const out = runAwkOnStock(
        "/WAIVED/ && /\\b(CRITICAL|HIGH)\\b/",
        "| WAIVED | HIGH | no justification |\n",
      );
      if (out === "")
        ok(
          "awk \\b repro — waived-justification severity pattern silently matches nothing on real /usr/bin/awk (bug confirmed)",
        );
      else
        fail(
          "awk \\b repro — waived-justification severity pattern",
          `expected no output, got: ${JSON.stringify(out)}`,
        );
    }

    // -- (b) Site 1/2: validate-code-health.sh R-02 + H-01, fixed, on real
    // /bin/bash + stock awk.
    {
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "src/loop.ts": [
          "export function run(items: number[]) {",
          "  for (const item of items) {",
          "    try {",
          "      handle(item);",
          "    } catch (err) {",
          "      report(err);",
          "    }",
          "  }",
          "}",
          "function handle(item: number) { return item; }",
          "function report(err: unknown) { return err; }",
          "",
        ].join("\n"),
      });
      const r = runOnStockBash(codeHealthScript, [dir]);
      if (r.exitCode === 1 && r.stdout.includes("R-02-try-in-loop"))
        ok(
          "awk \\b fix — R-02 try/catch-in-loop fires on real /bin/bash + stock awk",
        );
      else
        fail(
          "awk \\b fix — R-02 try/catch-in-loop",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
    {
      // Negative: for_loop/my_function are underscore-joined identifiers
      // that contain the flagged keywords as substrings only. A naive
      // [[:punct:]]-based boundary fix would wrongly treat "_" as a
      // boundary char (POSIX [:punct:] does not exclude "_", but \b does
      // treat "_" as a word char) and false-positive here.
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "src/underscores.ts": [
          "export function safe(items: number[]) {",
          "  for_loop_helper(items);",
          "  my_function(items);",
          "  return items;",
          "}",
          "function for_loop_helper(items: number[]) { return items; }",
          "function my_function(items: number[]) { return items; }",
          "",
        ].join("\n"),
      });
      const r = runOnStockBash(codeHealthScript, [dir]);
      if (r.exitCode === 0 && !r.stdout.includes("R-02-try-in-loop"))
        ok(
          "awk \\b fix — R-02 does not false-positive on for_loop_helper/my_function (underscore identifiers)",
        );
      else
        fail(
          "awk \\b fix — R-02 underscore false-positive guard",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
    {
      const dir = makeFixtureDir();
      const body = Array.from(
        { length: 60 },
        (_, i) => `  doStuff(${i});`,
      ).join("\n");
      writeFiles(dir, {
        "src/long.ts": `export function tooLong() {\n${body}\n}\n`,
      });
      const r = runOnStockBash(codeHealthScript, [dir]);
      if (r.exitCode === 1 && r.stdout.includes("H-01-function-too-long"))
        ok(
          "awk \\b fix — H-01 functions >50 lines fires on real /bin/bash + stock awk",
        );
      else
        fail(
          "awk \\b fix — H-01 functions >50 lines",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
    {
      // Negative: myfunction/functional/my_function must not be mistaken
      // for the whole word "function".
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "src/mixed.ts": [
          "export const myfunction = () => {};",
          "export const functional = 1;",
          "export const my_function = 2;",
          "",
        ].join("\n"),
      });
      const r = runOnStockBash(codeHealthScript, [dir]);
      if (r.exitCode === 0 && !r.stdout.includes("H-01-function-too-long"))
        ok(
          "awk \\b fix — H-01 does not false-positive on myfunction/functional/my_function",
        );
      else
        fail(
          "awk \\b fix — H-01 false-positive guard",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- Site 3: validate-fix-backlog-closed.sh waived-justification check,
    // fixed, on real /bin/bash + stock awk.
    {
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "docs/reviews/FIX_BACKLOG_release.md": [
          "# Fix Backlog",
          "",
          "| ID | Severity | Status |",
          "|----|----------|--------|",
          "| F-1 | HIGH | WAIVED |",
          "",
        ].join("\n"),
      });
      const r = runOnStockBash(fixBacklogScript, [dir]);
      if (r.exitCode === 1 && r.stdout.includes("waived-no-justification"))
        ok(
          "awk \\b fix — waived-no-justification fires on real /bin/bash + stock awk",
        );
      else
        fail(
          "awk \\b fix — waived-no-justification",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
    {
      // Negative: HIGH_RISK_NOTE / HIGHLIGHTED are substrings of HIGH, not
      // the whole word, and must not trip the CRITICAL/HIGH severity check.
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "docs/reviews/FIX_BACKLOG_release.md": [
          "# Fix Backlog",
          "",
          "| ID | Severity | Description | Status |",
          "|----|----------|--------------|--------|",
          "| F-1 | LOW | HIGH_RISK_NOTE: item is HIGHLIGHTED but not that severity | WAIVED |",
          "",
        ].join("\n"),
      });
      const r = runOnStockBash(fixBacklogScript, [dir]);
      if (r.exitCode === 0 && !r.stdout.includes("waived-no-justification"))
        ok(
          "awk \\b fix — waived-no-justification does not false-positive on HIGH_RISK_NOTE/HIGHLIGHTED substrings",
        );
      else
        fail(
          "awk \\b fix — waived-no-justification false-positive guard",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
    {
      // Positive: a real WAIVED row with a real justification cell passes
      // clean (proves the fix isn't just always-gap).
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "docs/reviews/FIX_BACKLOG_release.md": [
          "# Fix Backlog",
          "",
          "| ID | Severity | Status | Justification |",
          "|----|----------|--------|----------------|",
          "| F-1 | HIGH | WAIVED | Accepted by security lead, tracked in SEC-42 |",
          "",
        ].join("\n"),
      });
      const r = runOnStockBash(fixBacklogScript, [dir]);
      if (r.exitCode === 0)
        ok("awk \\b fix — a genuinely justified WAIVED row passes clean");
      else
        fail(
          "awk \\b fix — genuinely justified WAIVED row",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("awk word-boundary (T22.19)", `unexpected failure: ${message}`);
  }
}
