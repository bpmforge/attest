/**
 * test-board-generator.ts — Pass 7 chapter module for scripts/test.ts (T10.2).
 *
 * Snapshot-style checks for gen-tickets-board.mjs's renderBoard(): the
 * lane-column grouping (Ready/In Progress/Blocked per lane) and the
 * "N agents can start right now" header, run against the repo's own
 * examples/tickets-plan.sample.json fixture plus a synthetic zero-claimable
 * fixture for the empty-state header text.
 */

import * as path from "path";
import { pathToFileURL } from "url";

export async function testBoardGenerator(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  try {
    const { renderBoard } = await import(
      pathToFileURL(path.join(root, "scripts/gen-tickets-board.mjs")).href
    );
    const { loadPlan, recomputeStatus } = await import(
      pathToFileURL(path.join(root, "scripts/lib/tickets.mjs")).href
    );

    const samplePath = path.join(root, "examples/tickets-plan.sample.json");
    const plan = recomputeStatus(loadPlan(samplePath));
    const board = renderBoard(plan, samplePath);

    if (
      board.includes(
        "**2 agents can start right now:** M-frontend-dashboard, M-kanban-board",
      )
    )
      ok(
        "board generator — claim-right-now header lists the correct claimable set on the sample plan",
      );
    else
      fail(
        "board generator — claim-right-now header",
        `header line not found or wrong; board head=${board.slice(0, 300)}`,
      );

    const hasLaneSections =
      board.includes("### backend") &&
      board.includes("### design") &&
      board.includes("### frontend");
    if (hasLaneSections)
      ok(
        "board generator — one section per lane present (backend/design/frontend)",
      );
    else
      fail(
        "board generator — lane sections",
        "expected ### backend/design/frontend headings",
      );

    // M-business-rules is in_progress, owned by coding-agent, lane backend —
    // must appear under backend's "In Progress" bucket with its owner shown.
    const backendSection = board.slice(
      board.indexOf("### backend"),
      board.indexOf("### design"),
    );
    if (
      backendSection.includes("**In Progress**") &&
      backendSection.includes("M-business-rules") &&
      backendSection.includes("owner: coding-agent")
    )
      ok(
        "board generator — in-progress ticket grouped under its lane with owner shown",
      );
    else
      fail(
        "board generator — in-progress grouping",
        `backend section=${backendSection.slice(0, 300)}`,
      );

    // frontend's two ready modules must land in frontend's Ready bucket, not backend's.
    const frontendSection = board.slice(board.indexOf("### frontend"));
    if (
      frontendSection.includes("**Ready**") &&
      frontendSection.includes("M-frontend-dashboard") &&
      frontendSection.includes("M-kanban-board") &&
      !backendSection.includes("M-frontend-dashboard")
    )
      ok(
        "board generator — ready tickets grouped under their own lane, not cross-leaked",
      );
    else
      fail(
        "board generator — ready grouping",
        `frontend section=${frontendSection.slice(0, 300)}`,
      );

    if (
      board.includes("```mermaid") &&
      board.includes("graph LR") &&
      board.includes("M-db-backend --> M-frontend-dashboard")
    )
      ok("board generator — mermaid dependency DAG still emitted");
    else
      fail(
        "board generator — mermaid DAG",
        "expected a mermaid graph LR block with the known edges",
      );

    // Zero-claimable fixture: every module done or in_progress, none ready+unowned.
    const zeroClaimPlan = {
      modules: [
        {
          id: "M-a",
          title: "A",
          lane: "backend",
          owner: "someone",
          status: "in_progress",
          depends_on: [],
          write_scope: ["src/a/**"],
        },
      ],
    };
    const zeroClaimBoard = renderBoard(zeroClaimPlan, "fixture.json");
    if (zeroClaimBoard.includes("**0 agents can start right now**"))
      ok("board generator — empty-state header when nothing is claimable");
    else
      fail(
        "board generator — empty-state header",
        `board head=${zeroClaimBoard.slice(0, 200)}`,
      );

    // Independent review (T10.2): a lane-less claimable module was silently
    // dropped from the lane board while still counted in the claim-header —
    // header said "2 agents", but only 1 showed up under any lane section.
    // Regression: every claimable module must appear under SOME lane
    // section, including one missing `lane` entirely (hand-edited/legacy
    // plan.json — validatePlan() would reject this, but renderBoard() has
    // no such gate and must not silently drop data it's handed).
    const laneGapPlan = {
      modules: [
        {
          id: "M-ready-unowned",
          title: "Has a lane",
          lane: "backend",
          owner: null,
          status: "ready",
          depends_on: [],
          write_scope: ["src/d/**"],
        },
        {
          id: "M-no-lane",
          title: "Missing a lane",
          lane: undefined,
          owner: null,
          status: "ready",
          depends_on: [],
          write_scope: ["src/e/**"],
        },
      ],
    };
    const laneGapBoard = renderBoard(laneGapPlan, "fixture.json");
    const readyEntriesInBoard = (
      laneGapBoard.match(/^-\s+\*\*M-[\w-]+\*\*.*_\(claimable\)_$/gm) || []
    ).length;
    if (
      laneGapBoard.includes(
        "**2 agents can start right now:** M-ready-unowned, M-no-lane",
      ) &&
      laneGapBoard.includes("M-no-lane") &&
      readyEntriesInBoard === 2
    )
      ok(
        "board generator — a lane-less claimable module still appears under a lane section, not silently dropped",
      );
    else
      fail(
        "board generator — lane-less module dropped from board",
        `readyEntriesInBoard=${readyEntriesInBoard} board=${laneGapBoard.slice(0, 500)}`,
      );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("board generator", `unexpected failure: ${message}`);
  }
}
