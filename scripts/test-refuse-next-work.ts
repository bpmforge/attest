/**
 * test-refuse-next-work.ts — Pass 18 chapter module for scripts/test.ts (T26.3).
 *
 * "Close-before-next-claim" protocol wiring, refuse-to-select-next-work half:
 *   1. openTicketFor()/`tickets.mjs open-for` — an actor with an open
 *      (claimed/in_progress) ticket is refused; one with none (or only an
 *      in_review ticket — already "closed" per T26.1) is not.
 *   2. `tickets.mjs claim` (both via the CLI and a DIRECT library import —
 *      the direct-import case is a regression test: an earlier version only
 *      wired the hygiene check into the CLI's `claim` handler, so importing
 *      `claim()` from the library bypassed it entirely) refuses to hand out
 *      a NEW ticket while the ticket graph itself is unhygienic (write-scope
 *      collision). `start` is proven NOT blocked by the same condition, since
 *      it only ever advances a ticket the actor already owns.
 *
 * The receipt-gate half (accept()'s manifest-receipt enforcement) lives in
 * test-close-receipt.ts (Pass 17) — split out to keep both files under the
 * file-size cap, matching test-gate-receipts.ts's precedent.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

export async function testRefuseNextWork(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const tickets = await import(
    pathToFileURL(path.join(root, "scripts/lib/tickets.mjs")).href
  );
  const LIB = path.join(root, "scripts/lib/tickets.mjs");

  function makeFixturePlan(modules: unknown[]): string {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "refuse-next-work-fixture-"),
    );
    const planPath = path.join(dir, "plan.json");
    fs.writeFileSync(planPath, JSON.stringify({ goal: "test", modules }));
    fs.writeFileSync(path.join(dir, "manifest.md"), "# Manifest\n");
    return planPath;
  }

  function oneModule(overrides: Record<string, unknown> = {}) {
    return {
      id: "M-a",
      kind: "module",
      title: "A",
      lane: "test",
      owner: null,
      status: "ready",
      write_scope: ["src/a/**"],
      depends_on: [],
      acceptance: ["works"],
      verify: "true",
      manifest: "manifest.md",
      ...overrides,
    };
  }

  function runCli(args: string[]): {
    exitCode: number;
    stdout: string;
    stderr: string;
  } {
    try {
      const stdout = execFileSync("node", [LIB, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { exitCode: 0, stdout, stderr: "" };
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return {
        exitCode: e.status ?? 1,
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
      };
    }
  }

  try {
    // -- RED (regression, independent review): the T26.3 hygiene refusal
    // must fire on a DIRECT library import of claim(), not just through the
    // `tickets.mjs` CLI -- an earlier version only wired the check into the
    // CLI's `claim` handler, so importing the library directly bypassed it.
    {
      const planPath = makeFixturePlan([
        oneModule({ id: "M-a", write_scope: ["src/shared/**"] }),
        oneModule({ id: "M-b", write_scope: ["src/shared/**"] }),
      ]);
      const plan = tickets.loadPlan(planPath);
      const c1 = tickets.claim(plan, "M-a", "actor-one");
      const c2 = tickets.claim(plan, "M-b", "actor-two");
      if (
        c1.ok &&
        !c2.ok &&
        /hygiene is red/i.test(c2.error) &&
        plan.modules[1].status === "ready" &&
        plan.modules[1].owner === null
      )
        ok(
          "refuse-next-work — RED: claim() itself (direct import, not just the CLI) refuses on a red hygiene check",
        );
      else
        fail(
          "refuse-next-work — claim() must refuse on red hygiene even when called directly (not via CLI)",
          JSON.stringify({ c1, c2, moduleB: plan.modules[1] }),
        );
    }

    // -- openTicketFor()/`open-for` — an actor with an open (claimed/
    // in_progress) ticket is refused; a different actor is not.
    {
      const planPath = makeFixturePlan([
        oneModule({ id: "M-a" }),
        oneModule({ id: "M-b", write_scope: ["src/b/**"] }),
      ]);
      const plan = tickets.loadPlan(planPath);
      tickets.claim(plan, "M-a", "user");
      const openForOwner = tickets.openTicketFor(plan, "user");
      const openForOther = tickets.openTicketFor(plan, "someone-else");
      if (openForOwner?.id === "M-a" && openForOther === null)
        ok(
          "refuse-next-work — openTicketFor(): flags the owner's open ticket, clears an unrelated actor",
        );
      else
        fail(
          "refuse-next-work — openTicketFor() semantics",
          JSON.stringify({ openForOwner, openForOther }),
        );

      // CLI: `open-for` mirrors the same semantics via subprocess -- persist
      // the in-memory claim() mutation to disk first, since the CLI reads
      // plan.json fresh from disk rather than sharing this process's `plan`.
      tickets.savePlan(planPath, plan);
      const cliOwner = runCli(["open-for", planPath, "user"]);
      const cliOther = runCli(["open-for", planPath, "someone-else"]);
      if (cliOwner.exitCode !== 0 && cliOther.exitCode === 0)
        ok(
          "refuse-next-work — `tickets.mjs open-for`: refuses for the owner of an open ticket, clear for a different actor",
        );
      else
        fail(
          "refuse-next-work — `open-for` CLI semantics",
          JSON.stringify({ cliOwner, cliOther }),
        );
    }

    // -- an actor whose ticket has been CLOSED (in_review, via a receipt) is
    // no longer "open" -- WIP=1 unblocks.
    {
      const planPath = makeFixturePlan([oneModule()]);
      const plan = tickets.loadPlan(planPath);
      tickets.claim(plan, "M-a", "user");
      tickets.start(plan, "M-a", "user");
      tickets.close(plan, "M-a", "user", {
        branch: "feat/m-a",
        commits: ["abc123"],
        cwd: path.dirname(planPath),
      });
      const open = tickets.openTicketFor(plan, "user");
      if (open === null && plan.modules[0].status === "in_review")
        ok(
          "refuse-next-work — openTicketFor(): an in_review ticket (closed via receipt) no longer counts as open",
        );
      else
        fail(
          "refuse-next-work — in_review should not count as an open ticket",
          JSON.stringify({ open, status: plan.modules[0].status }),
        );
    }

    // -- `tickets.mjs claim` refuses a NEW claim while the ticket graph
    // itself is unhygienic (write-scope collision between an active module
    // and the one being claimed); `start` on the actor's OWN already-claimed
    // ticket is NOT blocked by the same condition.
    {
      const planPath = makeFixturePlan([
        oneModule({ id: "M-a", write_scope: ["src/shared/**"] }),
        oneModule({ id: "M-b", write_scope: ["src/shared/**"] }),
      ]);
      const claimA = runCli(["claim", planPath, "M-a", "actor-one"]);
      const claimB = runCli(["claim", planPath, "M-b", "actor-two"]);
      if (
        claimA.exitCode === 0 &&
        claimB.exitCode !== 0 &&
        /hygiene is red/.test(claimB.stderr)
      )
        ok(
          "refuse-next-work — `tickets.mjs claim` refuses a new claim while the ticket graph is unhygienic (write-scope collision)",
        );
      else
        fail(
          "refuse-next-work — claim should refuse on a red hygiene check",
          JSON.stringify({ claimA, claimB }),
        );

      const startA = runCli(["start", planPath, "M-a", "actor-one"]);
      if (startA.exitCode === 0 && /start receipt: M-a/.test(startA.stdout))
        ok(
          "refuse-next-work — `tickets.mjs start` is NOT blocked by an unrelated colliding module (only `claim` gates on hygiene)",
        );
      else
        fail(
          "refuse-next-work — start() should not be blocked by unrelated hygiene issues",
          JSON.stringify(startA),
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("refuse-next-work", `unexpected failure: ${message}`);
  }
}
