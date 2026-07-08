/**
 * test-outer-loop-receipts.ts — Pass 11 chapter module for scripts/test.ts (T27.4).
 *
 * Outer-loop completion must be receipts, not a promise token an agent can
 * emit regardless of gate state. Two pieces exercised here:
 *   1. validate-state-drift.sh — STATE.md's Done claims cross-checked against
 *      docs/work/gates/<phase>-receipt.json (T27.1).
 *   2. run-until-done.sh's is_complete() — the promise token is a request to
 *      evaluate completion, not proof; end-to-end through the real script
 *      with a stubbed RUN_CMD, exercising both the ticket's named red cases:
 *      (a) token + red gate (claimed phase, no receipt) -> loop keeps going;
 *      (b) --self-test's own scenario -> token + clean receipt -> completes.
 *
 * Run on real /bin/bash (not $BASH) per the T27.7 lesson.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

export async function testOuterLoopReceipts(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  function run(
    script: string,
    args: string[],
    env?: NodeJS.ProcessEnv,
  ): { exitCode: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync("/bin/bash", [script, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: env ? { ...process.env, ...env } : process.env,
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

  function mkTmp(label: string): string {
    const dir = fs.mkdtempSync(
      path.join(fs.realpathSync(root), `.tmp-${label}-`),
    );
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "docs/work/gates"), { recursive: true });
    return dir;
  }

  try {
    // -- 1. validate-state-drift.sh -------------------------------------------
    const driftValidator = path.join(
      root,
      "scripts/validators/validate-state-drift.sh",
    );

    {
      // no STATE.md at all -- nothing to check, clean.
      const dir = mkTmp("drift-nostate");
      const r = run(driftValidator, [dir]);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok("validate-state-drift — no STATE.md is clean (nothing to check)");
      else
        fail(
          "validate-state-drift — no STATE.md",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    {
      // STATE.md claims nothing gated (no phase-N mention) -- clean, not a gap.
      const dir = mkTmp("drift-ungated");
      fs.writeFileSync(
        path.join(dir, "docs/work/STATE.md"),
        "# STATE\n\n## Done\n- ran an audit, wrote a report\n",
      );
      const r = run(driftValidator, [dir]);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok(
          "validate-state-drift — Done section with no phase-N claim is clean (legitimately ungated task)",
        );
      else
        fail(
          "validate-state-drift — ungated Done section",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    {
      // RED: STATE.md claims phase-4 done, no receipt -> gap.
      const dir = mkTmp("drift-red");
      fs.writeFileSync(
        path.join(dir, "docs/work/STATE.md"),
        "# STATE\n\n## Done\n- phase-4 done -- shipped stuff\n",
      );
      const r = run(driftValidator, [dir]);
      if (
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":1') &&
        r.stdout.includes("state-claims-phase-done-no-receipt")
      )
        ok(
          "validate-state-drift — RED: Done claims phase-4 with no receipt is flagged",
        );
      else
        fail(
          "validate-state-drift — red fixture",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    {
      // GREEN: STATE.md claims phase-4 done, real receipt exists -> clean.
      const dir = mkTmp("drift-green");
      fs.writeFileSync(
        path.join(dir, "docs/work/STATE.md"),
        "# STATE\n\n## Done\n- phase-4 done -- shipped stuff\n",
      );
      fs.writeFileSync(
        path.join(dir, "docs/work/gates/phase-4-receipt.json"),
        '{"phase":"phase-4","timestamp":"2026-01-01T00:00:00Z","mode":"real","inputTreeHash":"abc","validators":[],"filesChecked":[]}\n',
      );
      const r = run(driftValidator, [dir]);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok(
          "validate-state-drift — GREEN: Done claim backed by a real receipt is clean",
        );
      else
        fail(
          "validate-state-drift — green fixture",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 2. run-until-done.sh's is_complete() gate, end-to-end -----------------
    const runUntilDone = path.join(root, "scripts/run-until-done.sh");

    {
      // --self-test's own scenario: promise token backed by a real receipt +
      // matching STATE.md Done line, written by the stub on session 3 --
      // proves the self-test exercises the drift-check gate, not the vacuous
      // "nothing claimed" no-op path.
      const r = run(runUntilDone, ["--self-test"]);
      if (r.exitCode === 0 && r.stdout.includes("self-test PASS"))
        ok(
          "run-until-done --self-test — completes on session 3 through a clean drift-check",
        );
      else
        fail(
          "run-until-done --self-test",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
    }

    {
      // RED (ticket's named case): agent emits the promise token with a
      // claimed-but-unreceipted phase -- the loop must NOT stop; it should
      // run out the session cap instead of falsely reporting complete.
      const dir = mkTmp("loop-red");
      const statePath = path.join(dir, "STATE.md");
      fs.writeFileSync(statePath, "# STATE\n");
      const stubPath = path.join(dir, "stub_red.sh");
      const countPath = path.join(dir, "count");
      fs.writeFileSync(
        stubPath,
        [
          "#!/usr/bin/env bash",
          `c="${countPath}"; n=$(( $(cat "$c" 2>/dev/null || echo 0) + 1 )); echo $n > "$c"`,
          "if (( n >= 2 )); then",
          `  cat > "${statePath}" <<'STATEEOF'`,
          "# STATE — red case",
          "",
          "## Done",
          "- phase-4 done -- claimed but no receipt written",
          "STATEEOF",
          "  echo 'done: <promise>COMPLETE</promise>'",
          "else",
          '  echo "still working (pass $n)"',
          "fi",
          "",
        ].join("\n"),
      );
      fs.chmodSync(stubPath, 0o755);

      const r = run(
        runUntilDone,
        [
          "--prompt",
          "red-case-test",
          "--state",
          statePath,
          "--root",
          dir,
          "--max-sessions",
          "3",
          "--max-seconds",
          "30",
        ],
        { RUN_CMD: stubPath },
      );
      const sessionsRun = parseInt(
        fs.readFileSync(countPath, "utf8").trim(),
        10,
      );
      if (r.exitCode === 1 && sessionsRun === 3)
        ok(
          "run-until-done — RED: promise token with an unreceipted phase claim keeps looping to the session cap, never falsely completes",
        );
      else
        fail(
          "run-until-done — red case (token + drift)",
          `exit=${r.exitCode} sessionsRun=${sessionsRun} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("outer-loop-receipts", `unexpected failure: ${message}`);
  }
}
