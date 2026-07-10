/**
 * test-watchdog-budget.ts — chapter module for scripts/test.ts (T31.5).
 *
 * run-until-done.sh's outer --max-seconds wall-clock cap is only checked
 * BETWEEN sessions, so a single stalled `opencode run` invocation could hang
 * an overnight run forever. T31.5 adds a per-session watchdog:
 *   - --max-session-seconds: hard task budget per session, breached whether
 *     the session is still producing output or not.
 *   - --heartbeat-seconds: stall detection, breached when the session's
 *     combined stdout+stderr stops growing.
 * A breach kills the session (SIGTERM then SIGKILL) and checkpoints the
 * event as a JSON line in docs/work/watchdog-events.jsonl, then the loop
 * continues to the next session instead of hanging -- this module proves
 * both breach paths actually fire (via a real hung/slow-drip stub process,
 * not a mock) and that a normal fast session is never falsely killed.
 *
 * Run on real /bin/bash (not $BASH) per the T27.7 lesson.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

export async function testWatchdogBudget(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const runUntilDone = path.join(root, "scripts/run-until-done.sh");

  function run(
    args: string[],
    env: NodeJS.ProcessEnv,
    cwd: string,
  ): { exitCode: number; stdout: string } {
    try {
      const stdout = execFileSync("/bin/bash", [runUntilDone, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...env },
        cwd,
        timeout: 30_000,
      });
      return { exitCode: 0, stdout };
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string };
      return { exitCode: e.status ?? 1, stdout: e.stdout ?? "" };
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

  function watchdogEvents(dir: string): Array<Record<string, unknown>> {
    const p = path.join(dir, "docs/work/watchdog-events.jsonl");
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  // Stub that increments a counter and, from the 2nd invocation on, completes
  // fast and cleanly (mirrors the existing self-test's DONE shape so
  // is_complete()'s drift-check gate is satisfied, not just the token).
  function completesFastFromSecondCall(dir: string, statePath: string): string {
    const stubPath = path.join(dir, "stub.sh");
    const countPath = path.join(dir, "count");
    fs.writeFileSync(
      stubPath,
      [
        "#!/usr/bin/env bash",
        `c="${countPath}"; n=$(( $(cat "$c" 2>/dev/null || echo 0) + 1 )); echo $n > "$c"`,
        "if (( n >= 2 )); then",
        `  cat > "${dir}/docs/work/gates/phase-9-receipt.json" <<'RECEIPT'`,
        '{"phase":"phase-9","timestamp":"2026-01-01T00:00:00Z","mode":"real","inputTreeHash":"wd","validators":[],"filesChecked":[]}',
        "RECEIPT",
        `  cat > "${statePath}" <<'STATEEOF'`,
        "# STATE",
        "",
        "## Done",
        "- phase-9 done -- watchdog test stub",
        "STATEEOF",
        "  echo 'done: <promise>COMPLETE</promise>'",
        "  exit 0",
        "fi",
      ].join("\n"),
    );
    fs.chmodSync(stubPath, 0o755);
    return stubPath;
  }

  try {
    // -- 1. STALL: session 1 prints once then hangs (no more output ever) --
    {
      const dir = mkTmp("wd-stall");
      const statePath = path.join(dir, "STATE.md");
      fs.writeFileSync(statePath, "# STATE\n");
      const stub = completesFastFromSecondCall(dir, statePath);
      const hungStub = path.join(dir, "hung.sh");
      const sleepPidPath = path.join(dir, "sleep-pid");
      fs.writeFileSync(
        hungStub,
        [
          "#!/usr/bin/env bash",
          `c="${dir}/count"; n=$(( $(cat "$c" 2>/dev/null || echo 0) + 1 )); echo $n > "$c"`,
          "if (( n == 1 )); then",
          "  echo 'starting session 1'",
          // Backgrounded (not `exec sleep`) so it is a genuine CHILD of this
          // script -- a plain `kill $pid` on the parent does not reach it;
          // this is what the orphan-leak check below verifies got fixed.
          "  sleep 300 &",
          `  echo $! > "${sleepPidPath}"`,
          "  wait",
          "else",
          `  exec "${stub}"`,
          "fi",
        ].join("\n"),
      );
      fs.chmodSync(hungStub, 0o755);

      const started = Date.now();
      const r = run(
        [
          "--prompt",
          "wd-stall-test",
          "--state",
          statePath,
          "--root",
          dir,
          "--max-sessions",
          "3",
          "--max-seconds",
          "60",
          "--max-session-seconds",
          "20",
          "--heartbeat-seconds",
          "2",
        ],
        { RUN_CMD: hungStub, POLL_SECONDS: "1" },
        dir,
      );
      const elapsedMs = Date.now() - started;
      const events = watchdogEvents(dir);
      if (
        r.exitCode === 0 &&
        r.stdout.includes("self-test") === false &&
        events.some((e) => e.reason === "stall") &&
        elapsedMs < 20_000
      ) {
        ok(
          `run-until-done — STALL: hung session (no output growth) is killed within heartbeat window and the run completes on the next session (${elapsedMs}ms, not the full 300s sleep)`,
        );
      } else {
        fail(
          "run-until-done — stall kill",
          `exit=${r.exitCode} elapsedMs=${elapsedMs} events=${JSON.stringify(events)} stdout=${r.stdout.slice(-400)}`,
        );
      }

      // REGRESSION: a plain `kill $pid` does not reach a backgrounded pipeline's
      // own children -- the first implementation of this watchdog orphaned the
      // stalled session's `sleep 300` child instead of reclaiming it (confirmed
      // live via `pgrep -fl` before the kill_tree() fix). Assert the recorded
      // child pid is actually gone, not just that run-until-done moved on.
      if (fs.existsSync(sleepPidPath)) {
        const sleepPid = parseInt(
          fs.readFileSync(sleepPidPath, "utf8").trim(),
          10,
        );
        let alive = true;
        try {
          process.kill(sleepPid, 0);
        } catch {
          alive = false;
        }
        if (!alive) {
          ok(
            `run-until-done — STALL: the killed session's child process (sleep, pid ${sleepPid}) does not survive as an orphan`,
          );
        } else {
          fail(
            "run-until-done — orphaned child after stall kill",
            `pid ${sleepPid} is still alive after the session was killed`,
          );
          process.kill(sleepPid, "SIGKILL");
        }
      } else {
        fail(
          "run-until-done — orphan check",
          "sleep-pid file was never written by the stub",
        );
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 2. BUDGET: session 1 keeps producing output (never "stalls") but --
    //    runs past --max-session-seconds -- proves the budget cap fires
    //    independently of heartbeat/stall detection.
    {
      const dir = mkTmp("wd-budget");
      const statePath = path.join(dir, "STATE.md");
      fs.writeFileSync(statePath, "# STATE\n");
      const stub = completesFastFromSecondCall(dir, statePath);
      const chattyStub = path.join(dir, "chatty.sh");
      fs.writeFileSync(
        chattyStub,
        [
          "#!/usr/bin/env bash",
          `c="${dir}/count"; n=$(( $(cat "$c" 2>/dev/null || echo 0) + 1 )); echo $n > "$c"`,
          "if (( n == 1 )); then",
          '  for i in $(seq 1 60); do echo "tick $i"; sleep 0.5; done',
          "else",
          `  exec "${stub}"`,
          "fi",
        ].join("\n"),
      );
      fs.chmodSync(chattyStub, 0o755);

      const started = Date.now();
      const r = run(
        [
          "--prompt",
          "wd-budget-test",
          "--state",
          statePath,
          "--root",
          dir,
          "--max-sessions",
          "3",
          "--max-seconds",
          "60",
          "--max-session-seconds",
          "2",
          "--heartbeat-seconds",
          "30",
        ],
        { RUN_CMD: chattyStub, POLL_SECONDS: "1" },
        dir,
      );
      const elapsedMs = Date.now() - started;
      const events = watchdogEvents(dir);
      if (
        r.exitCode === 0 &&
        events.some((e) => e.reason === "budget") &&
        elapsedMs < 20_000
      ) {
        ok(
          `run-until-done — BUDGET: a still-producing-output session is killed once it exceeds --max-session-seconds (${elapsedMs}ms, not the full ~30s of output)`,
        );
      } else {
        fail(
          "run-until-done — budget kill",
          `exit=${r.exitCode} elapsedMs=${elapsedMs} events=${JSON.stringify(events)} stdout=${r.stdout.slice(-400)}`,
        );
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 3. GREEN: a normal fast session under tight budgets is never killed --
    {
      const dir = mkTmp("wd-green");
      const statePath = path.join(dir, "STATE.md");
      fs.writeFileSync(statePath, "# STATE\n");
      const stub = completesFastFromSecondCall(dir, statePath);

      const r = run(
        [
          "--prompt",
          "wd-green-test",
          "--state",
          statePath,
          "--root",
          dir,
          "--max-sessions",
          "3",
          "--max-seconds",
          "30",
          "--max-session-seconds",
          "10",
          "--heartbeat-seconds",
          "10",
        ],
        { RUN_CMD: stub, POLL_SECONDS: "1" },
        dir,
      );
      const events = watchdogEvents(dir);
      if (r.exitCode === 0 && events.length === 0) {
        ok(
          "run-until-done — GREEN: normal fast-completing sessions are never watchdog-killed (no false positives)",
        );
      } else {
        fail(
          "run-until-done — false-positive check",
          `exit=${r.exitCode} events=${JSON.stringify(events)}`,
        );
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("watchdog-budget", `unexpected failure: ${message}`);
  }
}
