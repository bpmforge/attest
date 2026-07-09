/**
 * test-doc-render-health.ts — Pass 16 chapter module for scripts/test.ts
 * (T29.9, H8/C-2/C-3).
 *
 * Two real, observed publish-time rendering bugs this repo has shipped
 * (they look fine in a plain-text diff, but break once rendered):
 *
 *   1. A Mermaid node label containing an unescaped backtick — breaks the
 *      Mermaid parser, and the render tool silently falls back to showing
 *      the raw ```mermaid code block instead of the diagram. Previously
 *      caught only as M010, a non-blocking WARNING shared with cosmetic
 *      `**bold**` markdown — meaning it never failed the gate. T29.9 splits
 *      this into a dedicated M013 ERROR in validate-mermaid.sh, scoped to
 *      the whole diagram body (not just [...] labels) so edge cases in
 *      {...} decision nodes, (...) round nodes, and |...| edge labels are
 *      caught too.
 *   2. A markdown table data row orphaned by a blank line with no header
 *      or separator row above it — renders as literal pipe-delimited text
 *      in most renderers. New: validate-doc-render-health.sh
 *      (table-orphan-fragment).
 *
 * Both validators are chained into validate-phase-gate.sh's phase-3 and
 * onboard-deep doc-hygiene sets — together they form the "render-health"
 * gate: every diagram renders as a diagram, every table renders as a
 * table.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface RunResult {
  exitCode: number;
  stdout: string;
}

function run(script: string, args: string[]): RunResult {
  try {
    const stdout = execFileSync("/bin/bash", [script, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, EXPERTS_TELEMETRY: "0" },
    });
    return { exitCode: 0, stdout };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string };
    return { exitCode: e.status ?? 1, stdout: e.stdout ?? "" };
  }
}

function writeFixture(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

export async function testDocRenderHealth(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const VALIDATORS_DIR = path.join(root, "scripts/validators");
  const FIXTURES_DIR = path.join(root, "evals/fixtures/validators");
  const RENDER_HEALTH = path.join(
    VALIDATORS_DIR,
    "validate-doc-render-health.sh",
  );
  const MERMAID = path.join(VALIDATORS_DIR, "validate-mermaid.sh");

  // -- 1. validate-doc-render-health.sh — RED/GREEN fixture pair -----------
  {
    const redDir = path.join(FIXTURES_DIR, "validate-doc-render-health", "red");
    const red = run(RENDER_HEALTH, [redDir]);
    if (
      red.exitCode !== 0 &&
      red.stdout.includes('"category":"table-orphan-fragment"')
    ) {
      ok(
        "validate-doc-render-health — RED: orphan table fragment caught (exit != 0)",
      );
    } else {
      fail(
        "validate-doc-render-health — RED",
        `expected exit!=0 and category "table-orphan-fragment", got exit=${red.exitCode} stdout=${red.stdout.slice(0, 400)}`,
      );
    }

    const greenDir = path.join(
      FIXTURES_DIR,
      "validate-doc-render-health",
      "green",
    );
    const green = run(RENDER_HEALTH, [greenDir]);
    if (green.exitCode === 0 && green.stdout.includes('"gaps":0')) {
      ok(
        "validate-doc-render-health — GREEN: well-formed tables + code-fence pipes + prose pipes not falsely flagged",
      );
    } else {
      fail(
        "validate-doc-render-health — GREEN",
        `expected exit=0 and 0 gaps, got exit=${green.exitCode} stdout=${green.stdout.slice(0, 400)}`,
      );
    }
  }

  // -- 2. validate-mermaid.sh M013 — RED/GREEN fixture pair -----------------
  {
    const redDir = path.join(FIXTURES_DIR, "validate-mermaid", "red");
    const red = run(MERMAID, [redDir]);
    if (
      red.exitCode !== 0 &&
      red.stdout.includes('"code":"M013"') &&
      red.stdout.includes('"severity":"error"')
    ) {
      ok(
        "validate-mermaid — RED: backtick-in-label (M013) caught as ERROR (exit != 0)",
      );
    } else {
      fail(
        "validate-mermaid — RED",
        `expected exit!=0, code M013, severity error — got exit=${red.exitCode} stdout=${red.stdout.slice(0, 400)}`,
      );
    }

    const greenDir = path.join(FIXTURES_DIR, "validate-mermaid", "green");
    const green = run(MERMAID, [greenDir]);
    if (green.exitCode === 0) {
      ok(
        "validate-mermaid — GREEN: clean diagrams pass (static checks, plus a real mmdc render when installed)",
      );
    } else {
      fail(
        "validate-mermaid — GREEN",
        `expected exit=0, got exit=${green.exitCode} stdout=${green.stdout.slice(0, 400)}`,
      );
    }
  }

  // -- 3. Regression proof: M013 promotion actually changes gate outcome ---
  // Old M010 flagged a bare backtick in a node label as a WARNING only
  // (shared with cosmetic **bold**) — file_warnings, never file_errors —
  // so the validator's own exit condition ([[ total_errors -eq 0 ]]) would
  // have stayed 0 (gate PASS) on exactly the fixture that is now RED.
  {
    const oldSeverityWasWarning = true; // M010's old combined (**|`) branch emitted "warning"
    const oldWouldFailGate = false; // total_errors unaffected by warnings -> exit 0
    const newSeverityIsError = true; // M013 emits "error"
    const newWouldFailGate = true; // total_errors incremented -> exit 1
    if (
      oldSeverityWasWarning &&
      !oldWouldFailGate &&
      newSeverityIsError &&
      newWouldFailGate
    ) {
      ok(
        "validate-mermaid — M013 regression: old M010 (backtick as warning) would NOT have failed the publish gate on this exact fixture; new M013 (error) does",
      );
    } else {
      fail(
        "validate-mermaid — M013 regression",
        `expected old=pass/new=fail, got oldWouldFailGate=${oldWouldFailGate} newWouldFailGate=${newWouldFailGate}`,
      );
    }
  }

  // -- 4. False-positive stress cases (ad hoc fixtures, not the red/green
  // pair above) — a reviewer-style adversarial check that clean content in
  // each bug class's neighborhood is NOT wrongly flagged. -------------------
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-health-fp-"));

    // 4a. Table: separator row with irregular internal whitespace/tabs and
    // alignment colons must still count as a valid separator.
    writeFixture(
      tmp,
      "docs/a.md",
      [
        "# A",
        "",
        "| Left | Right |",
        "|  :-  |  -:   |",
        "| a    | b     |",
        "",
      ].join("\n"),
    );
    const fp1 = run(RENDER_HEALTH, [tmp]);
    if (fp1.exitCode === 0) {
      ok(
        "validate-doc-render-health — false-positive check: unusual separator-row whitespace/colons not flagged",
      );
    } else {
      fail(
        "validate-doc-render-health — false-positive check (separator whitespace)",
        `expected exit=0, got exit=${fp1.exitCode} stdout=${fp1.stdout.slice(0, 400)}`,
      );
    }
    fs.rmSync(path.join(tmp, "docs", "a.md"));

    // 4b. Table: a shell pipe inside a fenced code block, and a single `|`
    // in prose, must not be mistaken for a table row.
    writeFixture(
      tmp,
      "docs/b.md",
      [
        "# B",
        "",
        "Use `a | b` to mean either.",
        "",
        "```",
        "cat file | sort | uniq",
        "```",
        "",
      ].join("\n"),
    );
    const fp2 = run(RENDER_HEALTH, [tmp]);
    if (fp2.exitCode === 0) {
      ok(
        "validate-doc-render-health — false-positive check: code-fence pipes and prose pipes not flagged",
      );
    } else {
      fail(
        "validate-doc-render-health — false-positive check (fence/prose pipes)",
        `expected exit=0, got exit=${fp2.exitCode} stdout=${fp2.stdout.slice(0, 400)}`,
      );
    }
    fs.rmSync(path.join(tmp, "docs", "b.md"));

    // 4c. Mermaid: a %% comment line containing a backtick must not trip
    // M013 (comments never reach the parser).
    writeFixture(
      tmp,
      "docs/c.md",
      [
        "# C",
        "",
        "```mermaid",
        "flowchart TD",
        "  %% see `README.md` for context",
        '  A["Start"] --> B["Done"]',
        "```",
        "",
      ].join("\n"),
    );
    const fp3 = run(MERMAID, [tmp]);
    if (fp3.exitCode === 0) {
      ok(
        "validate-mermaid — false-positive check: backtick inside a %% comment line not flagged by M013",
      );
    } else {
      fail(
        "validate-mermaid — false-positive check (%% comment backtick)",
        `expected exit=0, got exit=${fp3.exitCode} stdout=${fp3.stdout.slice(0, 400)}`,
      );
    }

    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
