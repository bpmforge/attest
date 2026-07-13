/**
 * test-tui-session-hygiene.ts -- Pass 33 chapter module for scripts/test.ts
 * (T30.10, LOCAL_CONTEXT_INTEGRITY_DESIGN P3 -- TUI session-hygiene protocol).
 *
 * Covers the ticket's acceptance bullets directly:
 *   1. "security-wave HANDOFF fixture routes via task/subprocess with
 *      disk-written scan output" -- the green fixture below.
 *   2. "protocol text carries the 70% rule" -- grep assertion against
 *      TUI_SESSION_HYGIENE.md.
 *   3. "a planted inline-dispatch of a scan specialist is flagged by the
 *      handoff-discipline validator" -- the red fixture below, run through
 *      the real validator script (not a reimplementation of its regex).
 *
 * Run on real /bin/bash (not $BASH) per the T27.7 lesson.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface RunResult {
  exitCode: number;
  stdout: string;
}

function runValidator(script: string, fixtureDir: string): RunResult {
  try {
    const stdout = execFileSync("/bin/bash", [script, fixtureDir], {
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

export async function testTuiSessionHygiene(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const validatorScript = path.join(
    root,
    "scripts/validators/validate-handoff-discipline.sh",
  );
  const fixturesDir = path.join(
    root,
    "evals/fixtures/validators/validate-handoff-discipline",
  );

  // -- 1/3. RED: planted inline-dispatch of a scan specialist is flagged --
  const red = runValidator(validatorScript, path.join(fixturesDir, "red"));
  if (
    red.exitCode !== 0 &&
    red.stdout.includes('"category":"scan-inline-dispatch"')
  ) {
    ok(
      "validate-handoff-discipline -- RED: planted inline-dispatch of a scan specialist is flagged (scan-inline-dispatch), not silently passed",
    );
  } else {
    fail(
      "validate-handoff-discipline -- RED",
      `expected exit!=0 and category "scan-inline-dispatch", got exit=${red.exitCode} stdout=${red.stdout.slice(0, 500)}`,
    );
  }

  // -- 2/3. GREEN: a security-wave HANDOFF routed via task/subprocess with --
  // disk-written scan output is not falsely flagged.
  const green = runValidator(
    validatorScript,
    path.join(fixturesDir, "green"),
  );
  if (green.exitCode === 0 && green.stdout.includes('"gaps":0')) {
    ok(
      "validate-handoff-discipline -- GREEN: security-wave HANDOFF routed via task/subprocess with disk-written scan output passes clean",
    );
  } else {
    fail(
      "validate-handoff-discipline -- GREEN",
      `expected exit=0 and 0 gaps, got exit=${green.exitCode} stdout=${green.stdout.slice(0, 500)}`,
    );
  }

  // -- 3/3. Protocol text carries the 70% rule ------------------------------
  const protocolPath = path.join(root, "agents/shared/TUI_SESSION_HYGIENE.md");
  if (!fs.existsSync(protocolPath)) {
    fail(
      "TUI_SESSION_HYGIENE.md -- exists",
      `not found at ${protocolPath}`,
    );
  } else {
    const text = fs.readFileSync(protocolPath, "utf8");
    const has70 = /\b70%/.test(text);
    const hasThinOrchestrator = /Thin orchestrator/i.test(text);
    const hasFreshContext = /fresh.context dispatch/i.test(text);
    const hasDiskRule = /Scan output goes to disk/i.test(text);
    if (has70 && hasThinOrchestrator && hasFreshContext && hasDiskRule) {
      ok(
        "TUI_SESSION_HYGIENE.md -- carries all four rules: thin-orchestrator, mandatory fresh-context dispatch, scan-output-to-disk, and the 70% checkpoint-and-resume threshold",
      );
    } else {
      fail(
        "TUI_SESSION_HYGIENE.md -- rule coverage",
        `70%=${has70} thinOrchestrator=${hasThinOrchestrator} freshContext=${hasFreshContext} diskRule=${hasDiskRule}`,
      );
    }
  }

  // -- EXECUTOR_SELECTION.md gains a TUI mode note ---------------------------
  const executorSelectionPath = path.join(
    root,
    "agents/shared/EXECUTOR_SELECTION.md",
  );
  const executorSelectionText = fs.readFileSync(executorSelectionPath, "utf8");
  if (/##\s*TUI mode/i.test(executorSelectionText)) {
    ok("EXECUTOR_SELECTION.md -- carries a \"TUI mode\" note");
  } else {
    fail(
      "EXECUTOR_SELECTION.md -- TUI mode note",
      "no \"## TUI mode\" section found",
    );
  }
}
