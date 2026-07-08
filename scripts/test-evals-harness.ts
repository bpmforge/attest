/**
 * test-evals-harness.ts — chapter module for scripts/test.ts (T22.5).
 *
 * Wires two previously-separate checks into `npm test`/`check` so a
 * regression can't ship without someone remembering to run a second
 * command:
 *   1. run-evals.mjs's deterministic mode (golden-task fixtures —
 *      flask-sqli, ts-dead-dup, etc.) — missing scanner tools SKIP, they
 *      don't fail, so this stays CI-safe without semgrep/jscpd installed.
 *   2. check-validator-fixtures.mjs — the red/green fixture harness for
 *      chained validators (evals/fixtures/validators/<name>/{red,green}/),
 *      enforcing that a chained validator either has fixtures or is on the
 *      grandfather list (which may only shrink).
 */

import { execFileSync } from "child_process";
import * as path from "path";

export async function testEvalsHarness(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  try {
    const evalsOut = execFileSync(
      "node",
      [path.join(root, "scripts/run-evals.mjs"), "--json"],
      { encoding: "utf8", cwd: root },
    );
    const evalsResult = JSON.parse(evalsOut);
    if (evalsResult.fail === 0)
      ok(
        `run-evals.mjs — deterministic mode: ${evalsResult.pass} passed, ${evalsResult.skip} skipped, 0 failed`,
      );
    else
      fail(
        "run-evals.mjs — deterministic mode",
        `${evalsResult.fail} failed: ${JSON.stringify(
          (evalsResult.results || []).filter(
            (r: { status: string }) => r.status === "FAIL",
          ),
        )}`,
      );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("run-evals.mjs — deterministic mode", `failed to run: ${message}`);
  }

  try {
    const harnessOut = execFileSync(
      "node",
      [path.join(root, "scripts/check-validator-fixtures.mjs"), "--json"],
      { encoding: "utf8", cwd: root },
    );
    const harnessResult = JSON.parse(harnessOut);
    if (harnessResult.failures === 0)
      ok(
        `check-validator-fixtures.mjs — red/green harness: ${harnessResult.fixturedCount} fixtured, ${harnessResult.grandfatheredCount} grandfathered, 0 failures`,
      );
    else
      fail(
        "check-validator-fixtures.mjs — red/green harness",
        `${harnessResult.failures} failure(s): ${JSON.stringify(
          harnessResult.results.filter(
            (r: { status: string }) => r.status === "FAIL",
          ),
        )}`,
      );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail(
      "check-validator-fixtures.mjs — red/green harness",
      `failed to run: ${message}`,
    );
  }
}
