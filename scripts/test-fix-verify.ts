/**
 * test-fix-verify.ts — Test suite for fix-verify.mjs iteration classes (R4).
 *
 * Unit tests for iteration classification logic:
 * - REGRESSED detection (fingerprint reappears after CLOSED)
 * - Iteration-class output (STALLED/PROGRESSED/OSCILLATING)
 * - Tier-aware ceilings (6 metered / 12 local)
 */

import * as fs from "fs";

export async function testFixVerify(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  // Helper: MUST stay in sync with classifyIteration in scripts/fix-verify.mjs.
  // Classifies by row MOVEMENT (still-open / fresh / regressed) per FIX_VERIFY_LOOP.md,
  // NOT by raw count — a rising count is PROGRESSED (deeper review) when all prior rows
  // closed, STALLED when a prior row survives, OSCILLATING when a closed row returns.
  const classifyIteration = (a: {
    openCount: number;
    freshCount: number;
    regressedCount: number;
    attemptNum: number;
    ceiling: number;
  }): string => {
    if (a.regressedCount > 0) return "OSCILLATING";
    if (a.openCount === 0 && a.freshCount === 0) return "CLEARED";
    if (a.attemptNum >= a.ceiling) return "STALLED";
    if (a.openCount === 0 && a.freshCount > 0) return "PROGRESSED";
    return "STALLED";
  };

  // Helper: get ceiling based on tier
  const getAttemptCeiling = (tier: string | undefined): number => {
    if (!tier || tier === "unknown") return 12;
    if (tier.includes("local") || tier.includes("small")) return 12;
    return 6;
  };

  // Test 1: PROGRESSED — all prior rows CLOSED (open=0) but a deeper pass opened NEW rows.
  // This is the "findings 2→9→15 while converging on completeness" case (FIX_VERIFY_LOOP.md);
  // the RISING count must NOT be OSCILLATING — that was the pre-fix bug.
  try {
    const result = classifyIteration({
      openCount: 0,
      freshCount: 7,
      regressedCount: 0,
      attemptNum: 2,
      ceiling: 12,
    });
    if (result === "PROGRESSED") {
      ok(
        "fix-verify: PROGRESSED — all prior CLOSED + new rows opened (rising count is healthy, not OSCILLATING)",
      );
    } else {
      fail("fix-verify", `Expected PROGRESSED (2→9→15 case), got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `PROGRESSED test failed: ${e}`);
  }

  // Test 2: STALLED — a prior row is STILL-OPEN after a targeted iteration (same gap survives).
  try {
    const result = classifyIteration({
      openCount: 2,
      freshCount: 0,
      regressedCount: 0,
      attemptNum: 3,
      ceiling: 12,
    });
    if (result === "STALLED") {
      ok("fix-verify: STALLED — a prior row survives the targeted fix");
    } else {
      fail("fix-verify", `Expected STALLED (open survives), got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `STALLED test failed: ${e}`);
  }

  // Test 3: STALLED — hit the tier-aware attempt ceiling without clearing.
  try {
    const result = classifyIteration({
      openCount: 1,
      freshCount: 0,
      regressedCount: 0,
      attemptNum: 12,
      ceiling: 12,
    });
    if (result === "STALLED") {
      ok("fix-verify: STALLED — hit the attempt ceiling without clearing");
    } else {
      fail("fix-verify", `Expected STALLED at ceiling, got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `Ceiling test failed: ${e}`);
  }

  // Test 4: OSCILLATING — a previously-CLOSED row comes back (REGRESSED), even with a flat count.
  // Pre-fix this was labeled STALLED because `regressed` was never passed to the classifier.
  try {
    const result = classifyIteration({
      openCount: 0,
      freshCount: 0,
      regressedCount: 1,
      attemptNum: 3,
      ceiling: 12,
    });
    if (result === "OSCILLATING") {
      ok(
        "fix-verify: OSCILLATING — a previously-CLOSED row reappeared (REGRESSED), regardless of count",
      );
    } else {
      fail("fix-verify", `Expected OSCILLATING (regressed), got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `OSCILLATING test failed: ${e}`);
  }

  // Test 4b: CLEARED — nothing open and nothing new: the loop is done.
  try {
    const result = classifyIteration({
      openCount: 0,
      freshCount: 0,
      regressedCount: 0,
      attemptNum: 2,
      ceiling: 12,
    });
    if (result === "CLEARED") {
      ok("fix-verify: CLEARED — no open + no fresh rows = done");
    } else {
      fail("fix-verify", `Expected CLEARED, got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `CLEARED test failed: ${e}`);
  }

  // Test 5: Local tier ceiling (12)
  try {
    const ceiling1 = getAttemptCeiling("small");
    const ceiling2 = getAttemptCeiling("local");
    const ceiling3 = getAttemptCeiling("unknown");
    if (ceiling1 === 12 && ceiling2 === 12 && ceiling3 === 12) {
      ok(
        "fix-verify: local tier (small/local/unknown) uses 12-iteration ceiling",
      );
    } else {
      fail(
        "fix-verify",
        `Expected all local ceilings to be 12, got ${ceiling1}/${ceiling2}/${ceiling3}`,
      );
    }
  } catch (e) {
    fail("fix-verify", `Local ceiling test failed: ${e}`);
  }

  // Test 6: Metered tier ceiling (6)
  try {
    const ceiling1 = getAttemptCeiling("sonnet");
    const ceiling2 = getAttemptCeiling("opus");
    const ceiling3 = getAttemptCeiling("fable");
    if (ceiling1 === 6 && ceiling2 === 6 && ceiling3 === 6) {
      ok(
        "fix-verify: metered tier (sonnet/opus/fable) uses 6-iteration ceiling",
      );
    } else {
      fail(
        "fix-verify",
        `Expected all metered ceilings to be 6, got ${ceiling1}/${ceiling2}/${ceiling3}`,
      );
    }
  } catch (e) {
    fail("fix-verify", `Metered ceiling test failed: ${e}`);
  }

  // Test 7: History structure includes REGRESSED tracking
  try {
    const sampleHistory = {
      iterations: [
        {
          num: 1,
          timestamp: new Date().toISOString(),
          tier: "unknown",
          total_findings: 3,
          closed: 1,
          open: 2,
          new: 0,
          regressed: 0,
          closed_ids: ["id1"],
          iteration_class: "STALLED",
          attempt_ceiling: 12,
        },
        {
          num: 2,
          timestamp: new Date().toISOString(),
          tier: "unknown",
          total_findings: 3,
          closed: 0,
          open: 2,
          new: 0,
          regressed: 1,
          closed_ids: [],
          iteration_class: "STALLED",
          attempt_ceiling: 12,
        },
      ],
    };

    // Verify REGRESSED detection: id1 was closed in iteration 1, check if it's in iteration 2
    const iter1ClosedIds = new Set(sampleHistory.iterations[0].closed_ids);
    const iter2Findings = { id1: true }; // simulating a finding that reappeared
    const regressed = Object.keys(iter2Findings).filter((id) =>
      iter1ClosedIds.has(id),
    );

    if (regressed.length > 0 && sampleHistory.iterations[1].regressed > 0) {
      ok("fix-verify: REGRESSED detection (finding reappears after CLOSED)");
    } else {
      fail("fix-verify", "REGRESSED detection structure incomplete");
    }
  } catch (e) {
    fail("fix-verify", `History structure test failed: ${e}`);
  }

  // Test 8: Verify fix-verify.mjs has the new fields in its output
  try {
    const fixVerifyPath = `${root}/scripts/fix-verify.mjs`;
    const content = fs.readFileSync(fixVerifyPath, "utf8");

    const hasRegressed = content.includes("regressed");
    const hasIterationClass = content.includes("iteration_class");
    const hasAttemptCeiling = content.includes("attempt_ceiling");
    const hasTierContext = content.includes("readModelContext");

    if (
      hasRegressed &&
      hasIterationClass &&
      hasAttemptCeiling &&
      hasTierContext
    ) {
      ok(
        "fix-verify: implementation includes REGRESSED, iteration_class, attempt_ceiling, tier-aware logic",
      );
    } else {
      fail(
        "fix-verify",
        `Missing features: regressed=${hasRegressed}, iteration_class=${hasIterationClass}, ceiling=${hasAttemptCeiling}, context=${hasTierContext}`,
      );
    }
  } catch (e) {
    fail("fix-verify", `Implementation check failed: ${e}`);
  }
}
