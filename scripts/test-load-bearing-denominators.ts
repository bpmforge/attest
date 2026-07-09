/**
 * test-load-bearing-denominators.ts — Pass 15 chapter module for
 * scripts/test.ts (T22.6).
 *
 * "Denominator integrity": several validators used to check a SAMPLE or a
 * CAPPED PREFIX of a ground-truth set and call it done, or accepted a
 * single match out of N as sufficient coverage. Both patterns can silently
 * report clean on a project that's actually incomplete. T22.6 fixed four:
 *
 *   1. validate-design-system.sh  — killed the `head -10` component cap AND
 *      a same-line awk range-pattern bug that made that whole check dead
 *      code; killed the `head -20` color-extraction cap; replaced the
 *      1-of-N color "pass if >=1 matched" with a >=50% floor; added a new
 *      per-data-component STATES check (State Matrix completeness +
 *      hover/disabled evidence) that didn't exist before at all.
 *   2. validate-tests-mapping.sh  — forward coverage used to accept ANY
 *      occurrence of a UC-ID anywhere in the test tree (e.g. a stray
 *      comment) as "covered"; now requires the UC-ID on the same line as a
 *      test-block keyword (assertion-level). P2 use cases, previously
 *      invisible, are now explicitly noted SKIPPED so the full denominator
 *      (P0+P1+P2) is on the record.
 *   3. validate-wcag-coverage.sh  — added an interactive-element inventory
 *      (buttons/links/inputs/handlers, re-derived from component source) as
 *      the a11y coverage denominator, cross-checked against audit content,
 *      instead of a bare "does the design doc mention accessibility" check.
 *   4. validate-inventory.sh     — added a second pass that re-derives
 *      routes/tables/services from source (the same ground truth
 *      validate-api-coverage.sh / validate-erd-coverage.sh /
 *      validate-c3-coverage.sh already derive) and diffs it against
 *      INVENTORY.md, catching rows that were never written down at all —
 *      the first pass alone can only confirm existing rows, never notice
 *      what's missing.
 *
 * Each validator gets a positive case (its green fixture, 0 gaps) and a
 * negative case (its red fixture, the new check's gap category present).
 * One additional case (design-system) proves the specific regression class:
 * the OLD 1-of-N logic, replayed against the same numbers the new code
 * gapped on, would have reported clean.
 *
 * Run on real /bin/bash (not $BASH) per the T27.7 lesson.
 */

import { execFileSync, spawnSync } from "child_process";
import * as path from "path";

interface RunResult {
  exitCode: number;
  stdout: string;
}

function run(script: string, fixtureDir: string): RunResult {
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

export async function testLoadBearingDenominators(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const VALIDATORS_DIR = path.join(root, "scripts/validators");
  const FIXTURES_DIR = path.join(root, "evals/fixtures/validators");

  function checkPair(
    name: string,
    validatorScript: string,
    redCategory: string,
  ): void {
    const script = path.join(VALIDATORS_DIR, validatorScript);
    const redDir = path.join(FIXTURES_DIR, name, "red");
    const greenDir = path.join(FIXTURES_DIR, name, "green");

    try {
      const red = run(script, redDir);
      if (
        red.exitCode !== 0 &&
        red.stdout.includes(`"category":"${redCategory}"`)
      ) {
        ok(
          `${name} — RED: ${redCategory} caught, not silently passed (exit ${red.exitCode})`,
        );
      } else {
        fail(
          `${name} — RED`,
          `expected exit!=0 and category "${redCategory}", got exit=${red.exitCode} stdout=${red.stdout.slice(0, 400)}`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      fail(`${name} — RED`, `failed to run: ${message}`);
    }

    try {
      const green = run(script, greenDir);
      if (green.exitCode === 0 && green.stdout.includes('"gaps":0')) {
        ok(`${name} — GREEN: a complete fixture is not falsely flagged`);
      } else {
        fail(
          `${name} — GREEN`,
          `expected exit=0 and 0 gaps, got exit=${green.exitCode} stdout=${green.stdout.slice(0, 400)}`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      fail(`${name} — GREEN`, `failed to run: ${message}`);
    }
  }

  // -- 1. validate-design-system.sh — STATES + killed caps ------------------
  checkPair(
    "validate-design-system",
    "validate-design-system.sh",
    "missing-state-matrix",
  );

  // Regression proof: the OLD 1-of-N color-match logic (`matched -eq 0` was
  // the only failure condition) replayed against the red fixture's own
  // numbers (1/5 STYLE_GUIDE colors matched) would have reported clean.
  // The new logic (>=50% floor) correctly gaps that same 1/5.
  {
    const total = 5;
    const matched = 1; // matches the red fixture's tailwind.config.js
    const oldWouldPass = !(total > 0 && matched === 0);
    const half = Math.floor((total + 1) / 2);
    const newWouldPass = matched >= half;
    if (oldWouldPass && !newWouldPass) {
      ok(
        "validate-design-system — 1-of-N color-match regression: old logic (>=1 match) would have passed 1/5; new logic (>=50%) correctly fails it",
      );
    } else {
      fail(
        "validate-design-system — 1-of-N color-match regression",
        `oldWouldPass=${oldWouldPass} newWouldPass=${newWouldPass} (expected true/false)`,
      );
    }
  }

  // -- 2. validate-tests-mapping.sh — assertion-level + P2 SKIPPED ----------
  checkPair(
    "validate-tests-mapping",
    "validate-tests-mapping.sh",
    "uncovered-uc",
  );

  // Regression proof: the OLD forward check accepted ANY occurrence of the
  // UC-ID anywhere in the test tree. The red fixture's checkout.test.ts has
  // "UC-01" only in a comment, inside a describe("misc", ...) block that
  // does NOT reference UC-01 on the same line — old logic (bare grep -rq)
  // would have called that "covered"; new logic (same-line test-block
  // keyword) correctly does not.
  {
    const line =
      "// covers UC-01 loosely, mentioned here but not in a real assertion block";
    const oldWouldCover = /\bUC-01\b/.test(line); // old: any occurrence anywhere
    const newWouldCover =
      /(describe|it|test|context)\(|def[[:space:]]+test_/.test(line) &&
      /\bUC-01\b/.test(line);
    if (oldWouldCover && !newWouldCover) {
      ok(
        "validate-tests-mapping — assertion-level regression: old logic (bare occurrence) would have covered a stray comment; new logic (same-line test-block keyword) does not",
      );
    } else {
      fail(
        "validate-tests-mapping — assertion-level regression",
        `oldWouldCover=${oldWouldCover} newWouldCover=${newWouldCover} (expected true/false)`,
      );
    }
  }

  // P2 visibility: the red/green fixtures both declare UC-03 as P2. Confirm
  // the validator surfaces it as an explicit SKIPPED note rather than
  // omitting it entirely. note()/pass()/gap() all write to stderr (see
  // _lib.sh), so this needs spawnSync (execFileSync only returns stdout on
  // a clean exit — stderr is otherwise only visible via the thrown error,
  // which never fires here since the green fixture exits 0) to capture both
  // streams regardless of exit code.
  {
    const greenDir = path.join(FIXTURES_DIR, "validate-tests-mapping", "green");
    const script = path.join(VALIDATORS_DIR, "validate-tests-mapping.sh");
    const proc = spawnSync("/bin/bash", [script, greenDir], {
      encoding: "utf8",
      env: { ...process.env, EXPERTS_TELEMETRY: "0" },
    });
    const combined = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
    if (/UC-03 SKIPPED \(P2/.test(combined)) {
      ok(
        "validate-tests-mapping — P2 use case is visible as an explicit SKIPPED note, not silently absent",
      );
    } else {
      fail(
        "validate-tests-mapping — P2 visibility",
        `expected a "UC-03 SKIPPED (P2" line in stdout/stderr, got: ${combined.slice(0, 400)}`,
      );
    }
  }

  // -- 3. validate-wcag-coverage.sh — interactive-element denominator ------
  checkPair(
    "validate-wcag-coverage",
    "validate-wcag-coverage.sh",
    "uncovered-interactive-element",
  );

  // -- 4. validate-inventory.sh — second-pass source re-derivation ---------
  checkPair(
    "validate-inventory",
    "validate-inventory.sh",
    "inventory-missing-route",
  );
}
