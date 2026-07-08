/**
 * test-derive-lanes.ts — Pass 4d chapter module for scripts/test.ts (T10.4).
 *
 * Unit cases for deriveLane()'s parent-directory-basename rule, plus an
 * integration check against examples/ai-daytrader-plan-fixture.json — a
 * real 37-module plan.json copied from ai-daytrader's own
 * docs/learning-system/plan.json (a checked-in fixture, not a live read of
 * that repo, so this test stays reproducible if that repo moves). Proves
 * the derivation + validatePlan() + gen-tickets-board.mjs pipeline works
 * end-to-end on real, non-synthetic, real-scale data, not just a 3-module
 * toy plan.
 */

import * as path from "path";
import { pathToFileURL } from "url";

export async function testDeriveLanes(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  try {
    const { deriveLane, deriveLanes } = await import(
      pathToFileURL(path.join(root, "scripts/lib/derive-lanes.mjs")).href
    );

    const cases: Array<[string, string[], string]> = [
      [
        "glob path names its own directory",
        ["src/ai_daytrader/learning/ledger/**"],
        "ledger",
      ],
      [
        "concrete file uses parent dir basename",
        ["src/ai_daytrader/learning/pit/bars.py"],
        "pit",
      ],
      [
        "docs path",
        ["docs/learning-system/GATE1_REPORT.md"],
        "learning-system",
      ],
      ["scripts path", ["scripts/backtest_run.py"], "scripts"],
      [
        "single-segment path has no parent — falls back to itself",
        ["README.md"],
        "README.md",
      ],
      ["empty write_scope — falls back to misc", [], "misc"],
    ];
    for (const [label, writeScope, expected] of cases) {
      const got = deriveLane(writeScope);
      if (got === expected) ok(`derive-lanes — ${label} (-> "${expected}")`);
      else
        fail(`derive-lanes — ${label}`, `expected "${expected}", got "${got}"`);
    }

    // Only the FIRST write_scope entry is used, even when later entries
    // point elsewhere — documented behavior, not an oversight.
    const multiEntry = deriveLane([
      "src/a/research/extract.py",
      "src/a/ledger/reports.py",
    ]);
    if (multiEntry === "research")
      ok("derive-lanes — multi-entry write_scope uses only the first entry");
    else
      fail(
        "derive-lanes — multi-entry write_scope",
        `expected "research", got "${multiEntry}"`,
      );

    // deriveLanes(): fills missing lanes, leaves existing ones alone unless overwrite.
    const plan = {
      modules: [
        { id: "M-a", lane: "hand-picked", write_scope: ["src/x/pit/a.py"] },
        { id: "M-b", write_scope: ["src/x/risk/b.py"] },
      ],
    };
    deriveLanes(plan);
    if (
      plan.modules[0].lane === "hand-picked" &&
      plan.modules[1].lane === "risk"
    )
      ok("derive-lanes — deriveLanes() fills only missing lanes by default");
    else
      fail(
        "derive-lanes — deriveLanes() default behavior",
        `modules=${JSON.stringify(plan.modules)}`,
      );

    deriveLanes(plan, { overwrite: true });
    if (plan.modules[0].lane === "pit")
      ok(
        "derive-lanes — deriveLanes({overwrite:true}) replaces an existing lane",
      );
    else
      fail(
        "derive-lanes — deriveLanes() overwrite behavior",
        `modules=${JSON.stringify(plan.modules)}`,
      );

    // -- Integration: the real ai-daytrader fixture (37 modules) --
    const { loadPlan, validatePlan } = await import(
      pathToFileURL(path.join(root, "scripts/lib/tickets.mjs")).href
    );
    const { renderBoard } = await import(
      pathToFileURL(path.join(root, "scripts/gen-tickets-board.mjs")).href
    );
    const fixturePath = path.join(
      root,
      "examples/ai-daytrader-plan-fixture.json",
    );
    const fixturePlan = loadPlan(fixturePath);

    if ((fixturePlan.modules || []).length === 37)
      ok("derive-lanes — ai-daytrader fixture has the expected 37 modules");
    else
      fail(
        "derive-lanes — ai-daytrader fixture module count",
        `expected 37, got ${(fixturePlan.modules || []).length}`,
      );

    const allLaned = (fixturePlan.modules || []).every(
      (m: { lane?: string }) => !!m.lane,
    );
    if (allLaned)
      ok("derive-lanes — every ai-daytrader fixture module has a lane");
    else
      fail(
        "derive-lanes — ai-daytrader fixture lane coverage",
        "some module is missing lane",
      );

    const v = validatePlan(fixturePlan);
    if (v.ok)
      ok(
        "derive-lanes — ai-daytrader fixture validates cleanly (no cross-lane collisions)",
      );
    else
      fail(
        "derive-lanes — ai-daytrader fixture validatePlan()",
        `errors=${v.errors.join("; ")}`,
      );

    const board = renderBoard(fixturePlan, fixturePath);
    if (
      board.includes("agents can start right now") &&
      board.includes("### pit") &&
      board.includes("### research")
    )
      ok(
        "derive-lanes — ai-daytrader fixture renders a real lane-column board (gen-tickets-board.mjs)",
      );
    else
      fail(
        "derive-lanes — ai-daytrader fixture board render",
        `board head=${board.slice(0, 300)}`,
      );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("derive-lanes", `unexpected failure: ${message}`);
  }
}
