/**
 * test-tickets-graph.ts — Pass 4 chapter module for scripts/test.ts (T1/T9).
 *
 * Extracted from the barrel file to keep it under the 400-line cap after
 * Pass 7/8 landed. Module-contract graph logic: validatePlan(),
 * recomputeStatus(), claimable(), writeScopeCollisions(),
 * crossLaneCollisions() against examples/tickets-plan.sample.json.
 */

import { pathToFileURL } from "url";
import * as path from "path";

export async function testTicketsGraph(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  try {
    const tickets = await import(
      pathToFileURL(path.join(root, "scripts/lib/tickets.mjs")).href
    );
    const samplePath = path.join(root, "examples/tickets-plan.sample.json");
    const plan = tickets.loadPlan(samplePath);

    const v = tickets.validatePlan(plan);
    if (v.ok) ok("tickets — sample plan validates");
    else fail("tickets — sample plan validates", v.errors.join("; "));

    tickets.recomputeStatus(plan);
    const claim = tickets
      .claimable(plan)
      .map((m: { id: string }) => m.id)
      .sort();
    const expected = ["M-frontend-dashboard", "M-kanban-board"];
    if (JSON.stringify(claim) === JSON.stringify(expected))
      ok(`tickets — recomputeStatus yields claimable ${expected.join(", ")}`);
    else
      fail(
        "tickets — claimable set",
        `expected ${expected.join(",")} got ${claim.join(",")}`,
      );

    // negative: a cycle must be caught
    const cyc = tickets.loadPlan(samplePath);
    cyc.modules.find(
      (m: { id: string }) => m.id === "M-db-backend",
    ).depends_on = ["M-frontend-dashboard"];
    if (!tickets.validatePlan(cyc).ok) ok("tickets — cycle detected");
    else fail("tickets — cycle detected", "cyclic plan validated as ok");

    // negative: overlapping write-scope on active modules IN THE SAME LANE must be flagged
    const col = tickets.loadPlan(samplePath);
    const dash = col.modules.find(
      (m: { id: string }) => m.id === "M-frontend-dashboard",
    );
    const kan = col.modules.find(
      (m: { id: string }) => m.id === "M-kanban-board",
    );
    dash.status = "in_progress";
    kan.status = "in_progress";
    kan.write_scope = ["src/dashboard/shared/**"];
    if (tickets.writeScopeCollisions(col).length > 0)
      ok("tickets — same-lane write-scope collision flagged");
    else
      fail("tickets — same-lane write-scope collision", "overlap not flagged");

    // negative (T10.1): missing lane must be a validation error
    const noLane = tickets.loadPlan(samplePath);
    delete noLane.modules.find((m: { id: string }) => m.id === "M-db-backend")
      .lane;
    const noLaneResult = tickets.validatePlan(noLane);
    if (
      !noLaneResult.ok &&
      noLaneResult.errors.some((e: string) => e.includes("missing string lane"))
    )
      ok("tickets — missing lane flagged");
    else
      fail(
        "tickets — missing lane flagged",
        "plan with no lane validated as ok",
      );

    // negative (T10.1): write-scope overlap ACROSS lanes must be a validation error,
    // unconditional on status — construct two done/blocked modules in different
    // lanes with overlapping scope; no module is active, so writeScopeCollisions()
    // would miss this on purpose, but validatePlan() must still catch it.
    const crossLane = tickets.loadPlan(samplePath);
    const designSystem = crossLane.modules.find(
      (m: { id: string }) => m.id === "M-design-system",
    );
    designSystem.write_scope = ["src/db/migrations/**"]; // overlaps db-backend's src/db/** — different lanes, both status "done"
    const crossLaneResult = tickets.validatePlan(crossLane);
    if (
      !crossLaneResult.ok &&
      crossLaneResult.errors.some((e: string) =>
        e.includes("write-scope collision across lanes"),
      )
    )
      ok(
        "tickets — cross-lane write-scope collision flagged regardless of status",
      );
    else
      fail(
        "tickets — cross-lane write-scope collision",
        "overlap between different-lane 'done' modules was not flagged",
      );
    // and writeScopeCollisions() must NOT also report it (same-lane only, no double-reporting)
    if (tickets.writeScopeCollisions(crossLane).length === 0)
      ok("tickets — writeScopeCollisions() correctly ignores cross-lane pairs");
    else
      fail(
        "tickets — writeScopeCollisions() cross-lane isolation",
        "writeScopeCollisions() reported a cross-lane pair it should leave to crossLaneCollisions()",
      );

    // positive (T10.1): crossLaneCollisions() is directly callable and empty on the clean sample
    if (tickets.crossLaneCollisions(plan).length === 0)
      ok("tickets — crossLaneCollisions() clean on the valid sample plan");
    else
      fail(
        "tickets — crossLaneCollisions() clean on sample",
        `unexpected collisions: ${JSON.stringify(tickets.crossLaneCollisions(plan))}`,
      );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("tickets", `import/exec failed: ${message}`);
  }
}
