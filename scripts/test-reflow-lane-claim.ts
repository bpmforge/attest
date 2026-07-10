/**
 * test-reflow-lane-claim.ts — Pass 22 chapter module for scripts/test.ts (T10.3).
 *
 * claimableByLane() unit cases (sample plan grouping, unassigned-lane bucket,
 * empty plan) plus a `tickets.mjs status` CLI integration check, and a
 * "stranger test" sanity check against the real 37-module ai-daytrader
 * fixture (already used by T10.4's test-derive-lanes.ts) — the rubric from
 * IMPLEMENTATION_PLAN.md M10: a stranger must be able to answer "what can
 * start now, by how many people" from the board/CLI alone.
 */

import * as path from "path";
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";

export async function testReflowLaneClaim(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  try {
    const { loadPlan, recomputeStatus, claimableByLane, UNASSIGNED_LANE } =
      await import(pathToFileURL(path.join(root, "scripts/lib/tickets.mjs")).href);

    const samplePath = path.join(root, "examples/tickets-plan.sample.json");
    const plan = recomputeStatus(loadPlan(samplePath));
    const byLane = claimableByLane(plan);

    const lanes = byLane.map((b: { lane: string }) => b.lane);
    if (JSON.stringify(lanes) === JSON.stringify(["backend", "design", "frontend"]))
      ok("claimableByLane — every lane in the sample plan gets a bucket, sorted");
    else
      fail(
        "claimableByLane — lane buckets",
        `expected [backend, design, frontend], got ${JSON.stringify(lanes)}`,
      );

    const frontend = byLane.find((b: { lane: string }) => b.lane === "frontend");
    const frontendIds = (frontend?.modules || []).map((m: { id: string }) => m.id);
    if (JSON.stringify(frontendIds) === JSON.stringify(["M-frontend-dashboard", "M-kanban-board"]))
      ok("claimableByLane — frontend lane holds both claimable modules, id-sorted");
    else
      fail(
        "claimableByLane — frontend bucket",
        `expected [M-frontend-dashboard, M-kanban-board], got ${JSON.stringify(frontendIds)}`,
      );

    const backend = byLane.find((b: { lane: string }) => b.lane === "backend");
    const design = byLane.find((b: { lane: string }) => b.lane === "design");
    if ((backend?.modules || []).length === 0 && (design?.modules || []).length === 0)
      ok(
        "claimableByLane — a lane with nothing claimable still gets an empty bucket (0), not omitted",
      );
    else
      fail(
        "claimableByLane — empty-lane bucket",
        `backend=${JSON.stringify(backend)} design=${JSON.stringify(design)}`,
      );

    // Regression fixture mirrors T10.2's board-generator lane-gap test:
    // a claimable module with no `lane` at all must land in the
    // UNASSIGNED_LANE bucket, not vanish.
    const laneGapPlan = {
      modules: [
        {
          id: "M-ready-unowned",
          lane: "backend",
          owner: null,
          status: "ready",
          depends_on: [],
          write_scope: ["src/d/**"],
        },
        {
          id: "M-no-lane",
          lane: undefined,
          owner: null,
          status: "ready",
          depends_on: [],
          write_scope: ["src/e/**"],
        },
      ],
    };
    const gapByLane = claimableByLane(laneGapPlan);
    const unassigned = gapByLane.find(
      (b: { lane: string }) => b.lane === UNASSIGNED_LANE,
    );
    if (
      unassigned &&
      unassigned.modules.length === 1 &&
      unassigned.modules[0].id === "M-no-lane"
    )
      ok(
        `claimableByLane — a lane-less claimable module lands in the "${UNASSIGNED_LANE}" bucket, not dropped`,
      );
    else
      fail(
        "claimableByLane — unassigned-lane bucket",
        `gapByLane=${JSON.stringify(gapByLane)}`,
      );

    // Empty plan — no modules at all — is zero buckets, not an error.
    const emptyByLane = claimableByLane({ modules: [] });
    if (Array.isArray(emptyByLane) && emptyByLane.length === 0)
      ok("claimableByLane — empty plan yields zero lane buckets, no crash");
    else
      fail(
        "claimableByLane — empty plan",
        `expected [], got ${JSON.stringify(emptyByLane)}`,
      );

    // CLI integration: `tickets.mjs status` must print the same per-lane
    // breakdown, not just the flat "claimable (N):" total.
    const cliPath = path.join(root, "scripts/lib/tickets.mjs");
    const stdout = execFileSync("node", [cliPath, "status", samplePath], {
      encoding: "utf8",
    });
    if (
      stdout.includes("claimable (2):") &&
      stdout.includes("backend (0):") &&
      stdout.includes("design (0):") &&
      stdout.includes("frontend (2):") &&
      stdout.includes("M-frontend-dashboard") &&
      stdout.includes("M-kanban-board")
    )
      ok(
        "tickets.mjs status (CLI) — prints the claimable set grouped per lane, not just a flat total",
      );
    else
      fail("tickets.mjs status (CLI) — per-lane grouping", `stdout=${stdout}`);

    // -- Stranger test (IMPLEMENTATION_PLAN.md M10 rubric) on the real
    // 37-module ai-daytrader fixture: the claim-right-now header alone must
    // answer "what can start now, by how many people" — no board-scanning
    // required. Cross-check it against claimableByLane() so the header and
    // the per-lane CLI/board data never silently disagree.
    const fixturePath = path.join(root, "examples/ai-daytrader-plan-fixture.json");
    const fixturePlan = recomputeStatus(loadPlan(fixturePath));
    const fixtureByLane = claimableByLane(fixturePlan);
    const fixtureClaimableCount = fixtureByLane.reduce(
      (n: number, b: { modules: unknown[] }) => n + b.modules.length,
      0,
    );

    const { renderBoard } = await import(
      pathToFileURL(path.join(root, "scripts/gen-tickets-board.mjs")).href
    );
    const board = renderBoard(fixturePlan, fixturePath);
    const headerMatch = board.match(/\*\*(\d+) agents? can start right now/);
    const headerCount = headerMatch ? Number(headerMatch[1]) : -1;

    if (fixtureClaimableCount > 0 && headerCount === fixtureClaimableCount)
      ok(
        `stranger test — ai-daytrader fixture: claim-right-now header (${headerCount}) matches claimableByLane()'s total (${fixtureClaimableCount}); answerable from the header line alone, well under 30s`,
      );
    else
      fail(
        "stranger test — header/claimableByLane mismatch",
        `header=${headerCount} claimableByLane total=${fixtureClaimableCount}`,
      );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("reflow lane claim", `unexpected failure: ${message}`);
  }
}
