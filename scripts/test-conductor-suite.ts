/**
 * test-conductor-suite.ts — Pass 53 chapter module for scripts/test.ts.
 *
 * WHY THIS EXISTS. `scripts/conductor/conductor.test.mjs` and
 * `resume.test.mjs` were written as standalone `node --test` files and never
 * wired into the Pass-N suite — originally because they fell outside the
 * authoring ticket's `scripts/conductor/**` write scope. The consequence was
 * not theoretical: v3.1.0 and v3.1.1 both shipped with ALL FOUR conductor
 * tests failing while `npm test` reported a clean 607, because nothing in the
 * suite ran them. The conductor's own E2E test had in fact been failing
 * identically since v2.30.0. A test that no harness executes is not a test;
 * it is a file that resembles one.
 *
 * So this Pass runs them as a subprocess and reports their TAP result. It
 * deliberately shells out to `node --test` rather than re-implementing the
 * fixtures here: those tests build real git repos, real worktrees and real
 * merges, and duplicating that setup is exactly the kind of second copy that
 * drifts from the original and then lies about it.
 *
 * Runtime is ~6s for six tests — real git and real validators, not stubs.
 */

import * as path from "path";
import { spawnSync } from "child_process";

const SUITES = [
  "scripts/conductor/conductor.test.mjs",
  "scripts/conductor/resume.test.mjs",
];

export function testConductorSuite(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  // Pin the TAP reporter. node --test picks `spec` on a TTY and `tap`
  // otherwise, and the two print different summaries (`ℹ pass 6` vs
  // `# pass 6`) — parsing whichever happened to be chosen would make this
  // Pass's own result depend on where it was run from.
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=tap", ...SUITES.map((s) => path.join(root, s))],
    { cwd: root, encoding: "utf8", timeout: 300_000 },
  );

  const out = `${result.stdout || ""}${result.stderr || ""}`;

  if (result.error) {
    fail(
      "conductor suite: node --test runs",
      `could not spawn node --test: ${result.error.message}`,
    );
    return;
  }

  // `node --test` emits a TAP summary; parse the counts rather than trusting
  // the exit code alone, so "ran nothing successfully" can never read as a
  // pass. A suite that matched zero tests exits 0 too.
  const passCount = Number(/^# pass (\d+)$/m.exec(out)?.[1] ?? NaN);
  const failCount = Number(/^# fail (\d+)$/m.exec(out)?.[1] ?? NaN);

  if (!Number.isFinite(passCount) || !Number.isFinite(failCount)) {
    fail(
      "conductor suite: node --test reports a TAP summary",
      `could not parse '# pass'/'# fail' from node --test output (exit ${result.status}). Last lines:\n${out.trim().split("\n").slice(-15).join("\n")}`,
    );
    return;
  }

  if (passCount === 0) {
    fail(
      "conductor suite: the conductor tests actually run",
      "node --test matched zero passing tests — an empty run must never read as a green suite",
    );
    return;
  }

  if (failCount > 0) {
    // Surface the failing test names, not just the count: this Pass exists
    // because a silent RED went unnoticed for three releases.
    const failing = out
      .split("\n")
      .filter((l) => /^not ok \d+ - /.test(l.trim()))
      .map((l) => `  ${l.trim()}`)
      .join("\n");
    fail(
      "conductor suite: conductor.test.mjs + resume.test.mjs are green",
      `${failCount} conductor test(s) failing (${passCount} passing):\n${failing || out.trim().split("\n").slice(-20).join("\n")}`,
    );
    return;
  }

  ok(
    `conductor suite: conductor.test.mjs + resume.test.mjs green (${passCount} tests, real git worktrees + validators)`,
  );
}
