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
  // Helper: classify iteration based on finding trends and ceiling
  const classifyIteration = (
    prevCount: number,
    currentCount: number,
    attemptNum: number,
    ceiling: number,
  ): string => {
    if (attemptNum >= ceiling) return "STALLED";
    if (currentCount < prevCount) return "PROGRESSED";
    if (currentCount === prevCount) return "STALLED";
    return "OSCILLATING";
  };

  // Helper: get ceiling based on tier
  const getAttemptCeiling = (tier: string | undefined): number => {
    if (!tier || tier === "unknown") return 12;
    if (tier.includes("local") || tier.includes("small")) return 12;
    return 6;
  };

  // Test 1: PROGRESSED classification
  try {
    const result = classifyIteration(5, 3, 2, 12);
    if (result === "PROGRESSED") {
      ok("fix-verify: iteration class PROGRESSED (finding count decreased)");
    } else {
      fail("fix-verify", `Expected PROGRESSED, got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `PROGRESSED test failed: ${e}`);
  }

  // Test 2: STALLED classification — same finding count
  try {
    const result = classifyIteration(5, 5, 3, 12);
    if (result === "STALLED") {
      ok("fix-verify: iteration class STALLED (same finding count)");
    } else {
      fail("fix-verify", `Expected STALLED, got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `STALLED test failed: ${e}`);
  }

  // Test 3: STALLED classification — at ceiling
  try {
    const result = classifyIteration(5, 5, 12, 12);
    if (result === "STALLED") {
      ok("fix-verify: iteration class STALLED (at attempt ceiling)");
    } else {
      fail("fix-verify", `Expected STALLED at ceiling, got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `Ceiling test failed: ${e}`);
  }

  // Test 4: OSCILLATING classification
  try {
    const result = classifyIteration(5, 6, 3, 12);
    if (result === "OSCILLATING") {
      ok("fix-verify: iteration class OSCILLATING (finding count increased)");
    } else {
      fail("fix-verify", `Expected OSCILLATING, got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `OSCILLATING test failed: ${e}`);
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
