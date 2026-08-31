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
      pathToFileURL(path.join(root, "scripts/lib/reconciliation-matrix.mjs"))
        .href
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
      ok(
        "user-stories — extractStoryIds finds US-NN and EN.N headings, skips Epic/Summary",
      );
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
    const warns = tickets.storyCoverageWarnings(planCovered, [
      "US-01",
      "US-02",
    ]);
    if (warns.length === 1 && warns[0].id === "US-02")
      ok("tickets — storyCoverageWarnings flags the unmapped story only");
    else
      fail(
        "tickets — storyCoverageWarnings",
        `expected exactly US-02 uncovered, got: ${JSON.stringify(warns)}`,
      );
    if (tickets.storyCoverageWarnings(planCovered, ["US-01"]).length === 0)
      ok(
        "tickets — storyCoverageWarnings clean when every known story is covered",
      );
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
    const closure1 = tickets.requirementClosure(allDoneOneOrphan, [
      "US-01",
      "US-02",
    ]);
    const us02 = closure1.stories.find((s: { id: string }) => s.id === "US-02");
    if (
      closure1.openCount === 1 &&
      us02?.status === "open" &&
      closure1.closedCount === 1
    )
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
      modules: [
        {
          id: "M-a",
          kind: "module",
          status: "in_progress",
          stories: ["US-01"],
        },
      ],
    };
    const closure2 = tickets.requirementClosure(partial, ["US-01"]);
    if (
      closure2.stories[0].status === "open" &&
      /in_progress/.test(closure2.stories[0].reason)
    )
      ok(
        "tickets — requirementClosure: story mapped to a non-done module stays OPEN",
      );
    else
      fail(
        "tickets — requirementClosure incomplete module",
        `expected open with an in_progress reason, got: ${JSON.stringify(closure2)}`,
      );

    // A story whose every referencing module is done is CLOSED.
    const done = {
      modules: [
        { id: "M-a", kind: "module", status: "done", stories: ["US-01"] },
      ],
    };
    const closure3 = tickets.requirementClosure(done, ["US-01"]);
    if (closure3.stories[0].status === "closed" && closure3.openCount === 0)
      ok(
        "tickets — requirementClosure: story whose only module is done is CLOSED",
      );
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
      ok(
        "reconciliation-matrix — parseReconciliationMatrix reads id + verdict per row",
      );
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
      ok(
        "reconciliation-matrix — reconciliationGaps clean when the only known story is DONE",
      );
    else
      fail(
        "reconciliation-matrix — reconciliationGaps clean",
        "expected no gaps for a DONE-only story set",
      );
    // -- P-A12 (T1-12 §14, law L9): requirement ledger + assembly tickets +
    // named long-tail wave — the machinery behind validate-requirement-
    // closure.sh's checks 3-5. Ledger parsing lives in reconciliation-matrix
    // .mjs (same Phase-4→5 question, same gap idiom); assembly/long-tail
    // checks in tickets-seams.mjs via the tickets.mjs barrel.
    {
      const ledger = {
        source: "docs/SRS.md",
        requirements: [
          {
            id: "US-01",
            tickets: ["M-checkout"],
            proof: "tests/checkout.e2e.ts",
          },
          { id: "US-02", tickets: ["M-ghost"], proof: "" },
        ],
      };
      const plan = {
        modules: [
          {
            id: "M-checkout",
            kind: "module",
            title: "Checkout",
            lane: "backend",
            owner: null,
            status: "done",
            write_scope: ["src/checkout/**"],
            depends_on: [],
            acceptance: ["works"],
          },
        ],
      };
      const { requirementLedgerGaps } = await import(
        pathToFileURL(path.join(root, "scripts/lib/reconciliation-matrix.mjs"))
          .href
      );
      const lg = requirementLedgerGaps(
        ledger,
        ["US-01", "US-02", "US-03"],
        plan,
      );
      const reasons = lg
        .map((g: { id: string; reason: string }) => `${g.id}:${g.reason}`)
        .join(" | ");
      if (
        lg.length === 3 &&
        /US-02:.*not a module in the plan/.test(reasons) &&
        /US-02:.*no proving test/.test(reasons) &&
        /US-03:.*missing from the ledger/.test(reasons)
      )
        ok(
          "requirement-ledger — ghost ticket, missing proof and an un-derived requirement are all gaps",
        );
      else fail("requirement-ledger — gaps", reasons || "(none)");
      if (requirementLedgerGaps(ledger, ["US-01"], plan).length === 0)
        ok(
          "requirement-ledger — a fully-recorded requirement (tickets + proof) is clean",
        );
      else
        fail(
          "requirement-ledger — clean case",
          JSON.stringify(requirementLedgerGaps(ledger, ["US-01"], plan)),
        );
      if (
        requirementLedgerGaps({}, ["US-01"]).length === 1 &&
        /no requirements\[\] array/.test(
          requirementLedgerGaps({}, ["US-01"])[0].reason,
        )
      )
        ok(
          "requirement-ledger — a ledger with no requirements[] is one structural gap, not a crash",
        );
      else
        fail(
          "requirement-ledger — structural",
          JSON.stringify(requirementLedgerGaps({}, ["US-01"])),
        );

      // assemblyCoverageGaps: a shared deliverable (seam) with no first-class
      // assembly ticket is the built-but-never-mounted defect class.
      const seamed = (extra: Record<string, unknown>[] = []) => ({
        modules: [
          {
            id: "M-a",
            kind: "module",
            title: "A",
            lane: "a",
            owner: null,
            status: "done",
            write_scope: ["src/a/**"],
            depends_on: [],
            acceptance: ["a"],
          },
          {
            id: "M-b",
            kind: "module",
            title: "B",
            lane: "b",
            owner: null,
            status: "done",
            write_scope: ["src/b/**"],
            depends_on: ["M-a"],
            acceptance: ["b"],
          },
          ...extra,
        ],
        seams: [
          {
            contract: "docs/design/api/x.md",
            producer_module: "M-a",
            consumer_modules: ["M-b"],
            wiring_evidence: "e2e: b renders a's data",
          },
        ],
      });
      const noAssembly = tickets.assemblyCoverageGaps(seamed());
      const withAssembly = tickets.assemblyCoverageGaps(
        seamed([
          {
            id: "M-asm",
            kind: "module",
            title: "Assemble",
            lane: "int",
            owner: null,
            status: "ready",
            write_scope: ["tests/e2e/**"],
            depends_on: ["M-a", "M-b"],
            acceptance: ["e2e: b renders a's data"],
            assembly_for: "docs/design/api/x.md",
          },
        ]),
      );
      if (
        noAssembly.length === 1 &&
        /no assembly ticket/.test(noAssembly[0].msg) &&
        withAssembly.length === 0
      )
        ok(
          "assembly — a seam with no assembly_for ticket is a gap; acceptance carrying the wiring evidence is clean",
        );
      else
        fail(
          "assembly — coverage",
          `no=${JSON.stringify(noAssembly)} with=${JSON.stringify(withAssembly)}`,
        );
      const wrongAcceptance = seamed([
        {
          id: "M-asm",
          kind: "module",
          title: "Assemble",
          lane: "int",
          owner: null,
          status: "ready",
          write_scope: ["tests/e2e/**"],
          depends_on: ["M-a", "M-b"],
          acceptance: ["looks about done"],
          assembly_for: "docs/design/api/x.md",
        },
      ]);
      if (
        tickets
          .assemblyCoverageGaps(wrongAcceptance)
          .some((g: { msg: string }) =>
            /does not carry the seam's wiring evidence/.test(g.msg),
          )
      )
        ok(
          "assembly — an assembly ticket whose acceptance drops the wiring evidence is a gap",
        );
      else
        fail(
          "assembly — wiring evidence in acceptance",
          JSON.stringify(tickets.assemblyCoverageGaps(wrongAcceptance)),
        );

      // longTailWaveGaps: the wave must be NAMED at decomposition time.
      const bare = seamed();
      const waved = {
        ...seamed(),
        waves: [{ name: "long-tail", modules: ["M-b"] }],
      };
      const tagged = seamed([
        {
          id: "M-lt",
          kind: "module",
          title: "Long tail",
          lane: "qa",
          owner: null,
          status: "ready",
          write_scope: ["tests/lt/**"],
          depends_on: [],
          acceptance: ["error-path covered"],
          wave: "long-tail",
        },
      ]);
      if (
        tickets.longTailWaveGaps(bare).length === 1 &&
        /no named long-tail wave/.test(tickets.longTailWaveGaps(bare)[0].msg) &&
        tickets.longTailWaveGaps(waved).length === 0 &&
        tickets.longTailWaveGaps(tagged).length === 0 &&
        tickets.longTailWaveGaps({ modules: [] }).length === 0
      )
        ok(
          "long-tail — a decomposed board with no named long-tail wave fails; waves[] entry or wave-tagged module passes; empty board skips",
        );
      else
        fail(
          "long-tail — wave naming",
          `bare=${JSON.stringify(tickets.longTailWaveGaps(bare))} waved=${JSON.stringify(tickets.longTailWaveGaps(waved))} tagged=${JSON.stringify(tickets.longTailWaveGaps(tagged))}`,
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("requirement-closure", `import/exec failed: ${message}`);
  }
}
