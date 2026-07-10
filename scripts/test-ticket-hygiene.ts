/**
 * test-ticket-hygiene.ts — Pass 25 chapter module for scripts/test.ts (T26.2).
 *
 * validate-ticket-hygiene.sh / scripts/lib/ticket-hygiene.mjs: does the
 * ticket LIFECYCLE hygiene audit actually fire on each of its 5 gap
 * categories (incomplete-evidence, wip-violation, stale-claim,
 * tracker-drift, scope-violation/evidence-commit-not-found), and only when
 * warranted? Unit-level coverage per check (deterministic `nowMs` injected
 * so staleness assertions never bit-rot against real wall-clock time), plus
 * an end-to-end run of the real script against its own committed
 * evals/fixtures/validators/validate-ticket-hygiene/{red,green} fixtures.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

const DAY_MS = 86400000;

export async function testTicketHygiene(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const hygiene = await import(
    pathToFileURL(path.join(root, "scripts/lib/ticket-hygiene.mjs")).href
  );
  const VALIDATOR = path.join(
    root,
    "scripts/validators/validate-ticket-hygiene.sh",
  );
  const IMPL_COMMIT = "80a9df70def0ccd7e5a80bbf3936e499aa45d695"; // adds ticket-hygiene.mjs + validate-ticket-hygiene.sh only

  function oneModule(overrides: Record<string, unknown> = {}) {
    return {
      id: "M-a",
      kind: "module",
      title: "A",
      lane: "test",
      owner: "alice",
      status: "in_progress",
      write_scope: ["src/a/**"],
      depends_on: [],
      acceptance: ["works"],
      ...overrides,
    };
  }

  try {
    // -- check 1: incomplete-evidence -----------------------------------
    {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hygiene-evidence-"));
      const manifestPath = path.join(dir, "manifest.md");
      fs.writeFileSync(manifestPath, "# Manifest\n");
      const doneGood = oneModule({
        status: "done",
        manifest: "manifest.md",
        evidence: { branch: "feat/x", commits: ["abc123"] },
        history: [
          {
            ts: "2026-01-01T00:00:00Z",
            actor: "alice",
            from: "in_review",
            to: "done",
            note: null,
          },
        ],
      });
      const goodGaps = hygiene.checkCompleteEvidence([doneGood], dir);
      const doneBad = oneModule({
        id: "M-b",
        status: "done",
        manifest: "no-such.md",
      });
      const badGaps = hygiene.checkCompleteEvidence([doneBad], dir);
      if (
        goodGaps.length === 0 &&
        badGaps.length === 3 &&
        badGaps.every((g: [string, string]) => g[0] === "incomplete-evidence")
      )
        ok(
          "ticket-hygiene — checkCompleteEvidence: clean when complete, 3 gaps (manifest/evidence/history) when missing",
        );
      else
        fail(
          "ticket-hygiene — checkCompleteEvidence",
          JSON.stringify({ goodGaps, badGaps }),
        );
    }

    // -- check 2: wip-violation -------------------------------------------
    {
      const sameOwner = [
        oneModule({ id: "M-a", owner: "bob", status: "claimed" }),
        oneModule({ id: "M-b", owner: "bob", status: "in_progress" }),
      ];
      const diffOwner = [
        oneModule({ id: "M-a", owner: "bob", status: "claimed" }),
        oneModule({ id: "M-b", owner: "carol", status: "in_progress" }),
      ];
      const wipGaps = hygiene.checkOwnerWip(sameOwner);
      const cleanGaps = hygiene.checkOwnerWip(diffOwner);
      if (
        wipGaps.length === 1 &&
        wipGaps[0][0] === "wip-violation" &&
        cleanGaps.length === 0
      )
        ok(
          "ticket-hygiene — checkOwnerWip: flags one owner holding 2 open tickets, clean across different owners",
        );
      else
        fail(
          "ticket-hygiene — checkOwnerWip",
          JSON.stringify({ wipGaps, cleanGaps }),
        );
    }

    // -- check 3: stale-claim (deterministic nowMs, no wall-clock bit-rot) -
    {
      const nowMs = Date.parse("2026-07-10T00:00:00.000Z");
      const stale = oneModule({
        claimed_at: new Date(nowMs - 10 * DAY_MS).toISOString(),
      });
      const fresh = oneModule({
        id: "M-b",
        claimed_at: new Date(nowMs - 1 * DAY_MS).toISOString(),
      });
      const staleGaps = hygiene.checkStaleClaims([stale], nowMs);
      const freshGaps = hygiene.checkStaleClaims([fresh], nowMs);
      if (
        staleGaps.length === 1 &&
        staleGaps[0][0] === "stale-claim" &&
        freshGaps.length === 0
      )
        ok(
          "ticket-hygiene — checkStaleClaims: flags a 10d-old open claim, clean at 1d",
        );
      else
        fail(
          "ticket-hygiene — checkStaleClaims",
          JSON.stringify({ staleGaps, freshGaps }),
        );
    }

    // -- check 4: tracker-drift (TICKETS.md table + STATE.md Done section) -
    {
      const modules = [oneModule({ id: "M-a", status: "in_progress" })];
      const ticketsMdMismatch =
        "# Tickets\n\n## Full table\n\n| ID | Module | Status | Owner | Blocked by | Write-scope |\n|----|--------|--------|-------|------------|-------------|\n| M-a | A | done | alice | — | src/a/** |\n";
      const ticketsMdMatch = ticketsMdMismatch.replace(
        "| done |",
        "| in_progress |",
      );
      const stateMdMismatch =
        "# STATE\n\n## Done\n- M-a — shipped\n\n## Next\n- n/a\n";
      const tGaps = hygiene.checkTrackerDrift(modules, ticketsMdMismatch, null);
      const tClean = hygiene.checkTrackerDrift(modules, ticketsMdMatch, null);
      const sGaps = hygiene.checkTrackerDrift(modules, null, stateMdMismatch);
      if (
        tGaps.length === 1 &&
        tGaps[0][0] === "tracker-drift" &&
        tClean.length === 0 &&
        sGaps.length === 1 &&
        sGaps[0][0] === "tracker-drift"
      )
        ok(
          "ticket-hygiene — checkTrackerDrift: TICKETS.md and STATE.md mismatches both flagged, clean when consistent",
        );
      else
        fail(
          "ticket-hygiene — checkTrackerDrift",
          JSON.stringify({ tGaps, tClean, sGaps }),
        );
    }

    // -- check 5: scope-violation / evidence-commit-not-found (real git) --
    {
      const outOfScope = oneModule({
        write_scope: ["totally/unrelated/**"],
        evidence: { branch: "x", commits: [IMPL_COMMIT] },
      });
      const notFound = oneModule({
        id: "M-b",
        write_scope: ["src/a/**"],
        evidence: {
          branch: "x",
          commits: ["0000000000000000000000000000000000dead"],
        },
      });
      const inScope = oneModule({
        id: "M-c",
        write_scope: [
          "scripts/lib/ticket-hygiene.mjs",
          "scripts/validators/validate-ticket-hygiene.sh",
        ],
        evidence: { branch: "x", commits: [IMPL_COMMIT] },
      });
      const scopeGaps = hygiene.checkEvidenceScope([outOfScope], root);
      const notFoundGaps = hygiene.checkEvidenceScope([notFound], root);
      const cleanGaps = hygiene.checkEvidenceScope([inScope], root);
      if (
        scopeGaps.length === 2 &&
        scopeGaps.every((g: [string, string]) => g[0] === "scope-violation") &&
        notFoundGaps.length === 1 &&
        notFoundGaps[0][0] === "evidence-commit-not-found" &&
        cleanGaps.length === 0
      )
        ok(
          "ticket-hygiene — checkEvidenceScope: flags files outside write_scope + a nonexistent commit, clean when the commit's files match write_scope",
        );
      else
        fail(
          "ticket-hygiene — checkEvidenceScope",
          JSON.stringify({ scopeGaps, notFoundGaps, cleanGaps }),
        );
    }

    // -- GREEN: the real validate-ticket-hygiene.sh exits 0 against its own
    // green fixture, and non-zero against its red fixture (kitchen sink --
    // one instance of all 5 categories) -- proves the gate fires through the
    // actual gate-sweep entry point, not just the library functions.
    {
      const redDir = path.join(
        root,
        "evals/fixtures/validators/validate-ticket-hygiene/red",
      );
      const greenDir = path.join(
        root,
        "evals/fixtures/validators/validate-ticket-hygiene/green",
      );
      const run = (dir: string) => {
        try {
          execFileSync("/bin/bash", [VALIDATOR, dir], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          });
          return { exitCode: 0, stdout: "" };
        } catch (err: unknown) {
          const e = err as { status?: number; stdout?: string };
          return { exitCode: e.status ?? 1, stdout: e.stdout ?? "" };
        }
      };
      const redResult = run(redDir);
      const greenResult = run(greenDir);
      const categories = [
        "incomplete-evidence",
        "wip-violation",
        "stale-claim",
        "tracker-drift",
        "scope-violation",
        "evidence-commit-not-found",
      ];
      const allFired = categories.every((c) =>
        redResult.stdout.includes(`"${c}"`),
      );
      if (redResult.exitCode !== 0 && allFired && greenResult.exitCode === 0)
        ok(
          "ticket-hygiene — validate-ticket-hygiene.sh: red fixture trips all 5 gap categories (exit != 0), green fixture passes (exit 0)",
        );
      else
        fail(
          "ticket-hygiene — validate-ticket-hygiene.sh fixture behavior",
          JSON.stringify({
            redExit: redResult.exitCode,
            allFired,
            greenExit: greenResult.exitCode,
          }),
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("ticket-hygiene", `unexpected failure: ${message}`);
  }
}
