/**
 * test-requirement-closure.ts — Pass 35 chapter module for scripts/test.ts (T29.2).
 *
 * Requirement (story) layer: extractStoryIds() heading parsing,
 * storyCoverageWarnings()/requirementClosure() (tickets-graph.mjs), and
 * parseReconciliationMatrix()/reconciliationGaps() (reconciliation-matrix.mjs) —
 * the machinery behind validate-tickets.sh's story-coverage warning and
 * validate-requirement-closure.sh's Phase 4->5 gate (red/green fixtures for
 * the validators themselves live under evals/fixtures/validators/ and run via
 * check-validator-fixtures.mjs, not here).
 */

import { pathToFileURL } from "url";
import * as path from "path";

export async function testRequirementClosure(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  try {
    const { extractStoryIds } = await import(
      pathToFileURL(path.join(root, "scripts/lib/user-stories.mjs")).href
    );
    const tickets = await import(
      pathToFileURL(path.join(root, "scripts/lib/tickets.mjs")).href
    );
    const { parseReconciliationMatrix, reconciliationGaps } = await import(
      pathToFileURL(path.join(root, "scripts/lib/reconciliation-matrix.mjs")).href
    );

    // -- extractStoryIds ----------------------------------------------------
    const md = [
      "## US-01 Checkout",
      "## US-02 Browse catalog",
      "## Epic E1 — Connect + Ingest (forge, ingest, auth) [MVP wave]",
      "### E1.1 Sign in with GitHub [MVP] — 3 pts",
      "## Summary",
    ].join("\n");
    const ids = extractStoryIds(md).map((s: { id: string }) => s.id);
    if (JSON.stringify(ids) === JSON.stringify(["US-01", "US-02", "E1.1"]))
      ok("user-stories — extractStoryIds finds US-NN and EN.N headings, skips Epic/Summary");
    else
      fail(
        "user-stories — extractStoryIds",
        `expected [US-01, US-02, E1.1], got ${JSON.stringify(ids)}`,
      );

    // -- storyCoverageWarnings (advisory) ------------------------------------
    const planCovered = {
      modules: [
        { id: "M-a", kind: "module", status: "done", stories: ["US-01"] },
        { id: "M-b", kind: "module", status: "in_progress" },
      ],
    };
    const warns = tickets.storyCoverageWarnings(planCovered, ["US-01", "US-02"]);
    if (warns.length === 1 && warns[0].id === "US-02")
      ok("tickets — storyCoverageWarnings flags the unmapped story only");
    else
      fail(
        "tickets — storyCoverageWarnings",
        `expected exactly US-02 uncovered, got: ${JSON.stringify(warns)}`,
      );
    if (tickets.storyCoverageWarnings(planCovered, ["US-01"]).length === 0)
      ok("tickets — storyCoverageWarnings clean when every known story is covered");
    else
      fail(
        "tickets — storyCoverageWarnings clean",
        "expected no warnings when all known stories are covered",
      );

    // -- requirementClosure: task closure != requirement closure -------------
    // The ticket's own acceptance criterion: every module done, one story
    // unmapped -> that story must still read OPEN.
    const allDoneOneOrphan = {
      modules: [
        { id: "M-a", kind: "module", status: "done", stories: ["US-01"] },
        { id: "M-b", kind: "module", status: "done" }, // doesn't claim US-02 at all
      ],
    };
    const closure1 = tickets.requirementClosure(allDoneOneOrphan, ["US-01", "US-02"]);
    const us02 = closure1.stories.find((s: { id: string }) => s.id === "US-02");
    if (closure1.openCount === 1 && us02?.status === "open" && closure1.closedCount === 1)
      ok(
        "tickets — requirementClosure: all modules done but an unmapped story stays OPEN (task closure != requirement closure)",
      );
    else
      fail(
        "tickets — requirementClosure orphan story",
        `expected 1 open (US-02) / 1 closed, got: ${JSON.stringify(closure1)}`,
      );

    // A story mapped to a module that ISN'T done is open too (partial task progress).
    const partial = {
      modules: [{ id: "M-a", kind: "module", status: "in_progress", stories: ["US-01"] }],
    };
    const closure2 = tickets.requirementClosure(partial, ["US-01"]);
    if (closure2.stories[0].status === "open" && /in_progress/.test(closure2.stories[0].reason))
      ok("tickets — requirementClosure: story mapped to a non-done module stays OPEN");
    else
      fail(
        "tickets — requirementClosure incomplete module",
        `expected open with an in_progress reason, got: ${JSON.stringify(closure2)}`,
      );

    // A story whose every referencing module is done is CLOSED.
    const done = {
      modules: [{ id: "M-a", kind: "module", status: "done", stories: ["US-01"] }],
    };
    const closure3 = tickets.requirementClosure(done, ["US-01"]);
    if (closure3.stories[0].status === "closed" && closure3.openCount === 0)
      ok("tickets — requirementClosure: story whose only module is done is CLOSED");
    else
      fail(
        "tickets — requirementClosure closed story",
        `expected closed, got: ${JSON.stringify(closure3)}`,
      );

    // -- reconciliation matrix parsing ---------------------------------------
    const matrix = [
      "# Requirement Reconciliation Matrix",
      "",
      "| Story | Title | Verdict | Evidence |",
      "|-------|-------|---------|----------|",
      "| US-01 | Checkout | DONE | src/checkout.test.ts |",
      "| US-02 | Browse catalog | OUTSTANDING | not started |",
    ].join("\n");
    const rows = parseReconciliationMatrix(matrix);
    if (
      rows.length === 2 &&
      rows[0].id === "US-01" &&
      rows[0].verdict === "DONE" &&
      rows[1].verdict === "OUTSTANDING"
    )
      ok("reconciliation-matrix — parseReconciliationMatrix reads id + verdict per row");
    else
      fail(
        "reconciliation-matrix — parseReconciliationMatrix",
        `unexpected rows: ${JSON.stringify(rows)}`,
      );

    const gaps = reconciliationGaps(matrix, ["US-01", "US-02", "US-03"]);
    const gapIds = gaps.map((g: { id: string }) => g.id).sort();
    if (JSON.stringify(gapIds) === JSON.stringify(["US-02", "US-03"]))
      ok(
        "reconciliation-matrix — reconciliationGaps flags OUTSTANDING (US-02) and a missing row (US-03)",
      );
    else
      fail(
        "reconciliation-matrix — reconciliationGaps",
        `expected [US-02, US-03], got ${JSON.stringify(gapIds)}`,
      );
    if (reconciliationGaps(matrix, ["US-01"]).length === 0)
      ok("reconciliation-matrix — reconciliationGaps clean when the only known story is DONE");
    else
      fail(
        "reconciliation-matrix — reconciliationGaps clean",
        "expected no gaps for a DONE-only story set",
      );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("requirement-closure", `import/exec failed: ${message}`);
  }
}
