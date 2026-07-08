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
import * as fs from "fs";
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

  // Regression (independent review, 2026-07-08): the harness originally
  // treated red and green as interchangeable — `!hasRed && !hasGreen`, so a
  // green-only fixture (no red) silently reported OK instead of FAIL, even
  // though proving the validator can actually go red is the harness's whole
  // point. Temporarily hide validate-use-cases' red/ dir and confirm the
  // fixed harness now reports FAIL, not clean.
  {
    const redDir = path.join(
      root,
      "evals/fixtures/validators/validate-use-cases/red",
    );
    const hiddenDir = `${redDir}.__test-hidden`;
    fs.renameSync(redDir, hiddenDir);
    try {
      let harnessResult: {
        failures: number;
        results: Array<{ validator: string; status: string }>;
      };
      try {
        const out = execFileSync(
          "node",
          [path.join(root, "scripts/check-validator-fixtures.mjs"), "--json"],
          { encoding: "utf8", cwd: root },
        );
        harnessResult = JSON.parse(out);
      } catch (err: unknown) {
        // Non-zero exit is the expected outcome (failures > 0) — the JSON
        // summary is still on stdout.
        const e = err as { stdout?: string };
        harnessResult = JSON.parse(e.stdout ?? "{}");
      }
      const entry = harnessResult.results?.find(
        (r) => r.validator === "validate-use-cases.sh",
      );
      if (harnessResult.failures > 0 && entry?.status === "FAIL")
        ok(
          "check-validator-fixtures.mjs — green-only fixture (no red) is flagged FAIL, not silently passed",
        );
      else
        fail(
          "check-validator-fixtures.mjs — green-only fixture",
          `expected a FAIL entry for validate-use-cases.sh, got ${JSON.stringify(entry)}`,
        );
    } finally {
      fs.renameSync(hiddenDir, redDir);
    }
  }
}
