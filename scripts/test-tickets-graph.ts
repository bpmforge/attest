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

    // negative: manifest/verify are consumed by close() as a PATH and a
    // COMMAND. Neither was type-checked, so a board could validate clean and
    // then crash the lifecycle — resolve(cwd, <object>) throws
    // ERR_INVALID_ARG_TYPE, surfacing as a stack trace instead of a refusal
    // naming the ticket. An SDLC-generated board did exactly this on
    // 2026-07-31, describing the manifest as {files, exports, tests}: a
    // reasonable reading of the word, and unusable as a path.
    {
      const bad = tickets.loadPlan(samplePath);
      bad.modules[0].manifest = { files: ["a.js"], exports: ["a"] };
      const r = tickets.validatePlan(bad);
      if (
        !r.ok &&
        r.errors.some((e: string) =>
          /manifest must be a non-empty string/.test(e),
        )
      )
        ok(
          "tickets — an object manifest is rejected, not passed through to close()",
        );
      else
        fail(
          "tickets — object manifest must be rejected",
          `ok=${r.ok} errors=${r.errors.join("; ").slice(0, 200)}`,
        );
    }
    {
      const bad = tickets.loadPlan(samplePath);
      bad.modules[0].verify = ["npm test", "npm run lint"];
      const r = tickets.validatePlan(bad);
      if (
        !r.ok &&
        r.errors.some((e: string) =>
          /verify must be a non-empty string/.test(e),
        )
      )
        ok(
          "tickets — an array verify is rejected (close() runs it as one command)",
        );
      else
        fail(
          "tickets — array verify must be rejected",
          `ok=${r.ok} errors=${r.errors.join("; ").slice(0, 200)}`,
        );
    }
    {
      // ...and a board that simply omits them still validates: the schema makes
      // manifest "required for close", not required to exist, and close()
      // already refuses clearly when it is absent. Requiring it here would
      // invalidate every legitimately mid-draft board.
      const draft = tickets.loadPlan(samplePath);
      delete draft.modules[0].manifest;
      delete draft.modules[0].verify;
      if (tickets.validatePlan(draft).ok)
        ok(
          "tickets — a mid-draft board omitting manifest/verify still validates",
        );
      else
        fail(
          "tickets — omitted manifest/verify must not be an error",
          tickets.validatePlan(draft).errors.join("; ").slice(0, 200),
        );
    }

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

    // scopeCoverageWarnings (Shipwright field run 2026-07-12): acceptance
    // naming a path in the module's OWN area that its globs can't cover is the
    // defect class that blocked three live tickets. Advisory, not an error.
    const scopeGap = {
      modules: [
        {
          id: "M-a",
          kind: "module",
          title: "a",
          lane: "l1",
          status: "ready",
          owner: null,
          depends_on: [],
          write_scope: ["src/events/api/**"],
          acceptance: [
            "creates src/events/migrations/001_init.sql", // own area (src/), uncovered -> WARN
            "reads docs/DATABASE.md", // docs/ -> skipped
            "uses packages/other/src/x.ts", // other module's area -> skipped
            "updates src/events/api/routes.ts", // covered -> clean
          ],
        },
      ],
    };
    const warns = tickets.scopeCoverageWarnings(scopeGap);
    if (
      warns.length === 1 &&
      warns[0].path === "src/events/migrations/001_init.sql"
    )
      ok(
        "tickets — scopeCoverageWarnings flags own-area uncovered path only (docs/, other-area, covered all skipped)",
      );
    else
      fail(
        "tickets — scopeCoverageWarnings",
        `expected exactly the migrations path, got: ${JSON.stringify(warns)}`,
      );
    if (tickets.scopeCoverageWarnings(plan).length === 0)
      ok("tickets — scopeCoverageWarnings clean on the valid sample plan");
    else
      fail(
        "tickets — scopeCoverageWarnings on sample",
        `unexpected warnings: ${JSON.stringify(tickets.scopeCoverageWarnings(plan))}`,
      );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("tickets", `import/exec failed: ${message}`);
  }
}
