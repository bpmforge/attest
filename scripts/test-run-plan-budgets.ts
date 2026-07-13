/**
 * test-run-plan-budgets.ts — chapter module for scripts/test.ts (T31.7).
 *
 * O2 runtime fold: run-plan.mjs's own `--self-test` (extended by T31.7)
 * exercises the tier-aware per-node retry budgets end-to-end against real
 * subprocess dispatches, no mocks:
 *   - escalate-success / escalate-fail / cap (O2.4, pre-existing)
 *   - stall-2-then-escalate: a node with no checkpoint growth escalates
 *     after 2 attempts, inside a generous --max-retries budget
 *   - PROGRESSED extension: a node whose checkpoint keeps growing extends
 *     past --max-retries up to the tier-aware ceiling
 *   - tier-aware ceiling hit while still PROGRESSED: a node forced onto the
 *     metered tier (6) via docs/work/.model-context stops at 6, not 12
 *
 * This module just runs the real script's --self-test and asserts every
 * scenario reported PASS -- same pattern as test-outer-loop-receipts.ts's
 * run-until-done.sh --self-test invocation, kept as one process so a
 * regression in any scenario fails the whole self-test string match.
 */

import * as path from "path";
import { execFileSync } from "child_process";

export async function testRunPlanBudgets(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const runPlan = path.join(root, "scripts/run-plan.mjs");

  try {
    const stdout = execFileSync("node", [runPlan, "--self-test"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    const expected = [
      "escalate-success",
      "escalate-fail",
      "cap",
      "stall-2-then-escalate",
      "progressed-extension",
      "tier-ceiling",
    ];
    const missing = expected.filter((s) => !stdout.includes(s));
    if (stdout.includes("run-plan self-test PASS") && missing.length === 0) {
      ok(
        "run-plan --self-test — escalate-success/fail/cap + stall-2-then-escalate + progressed-extension + tier-ceiling all PASS",
      );
    } else {
      fail(
        "run-plan --self-test",
        `missing scenarios: ${missing.join(", ") || "none"}; stdout=${stdout.slice(0, 800)}`,
      );
    }
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; message?: string };
    fail(
      "run-plan --self-test",
      `exit=${e.status ?? "?"} stdout=${(e.stdout ?? e.message ?? "").toString().slice(0, 800)}`,
    );
  }
}
