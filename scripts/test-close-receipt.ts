/**
 * test-close-receipt.ts — Pass 16 chapter module for scripts/test.ts (T26.3).
 *
 * "Close-before-next-claim" protocol wiring:
 *   1. accept() refuses in_review -> done unless the module's Completion
 *      Manifest has the close() receipt pasted verbatim into it (not just a
 *      self-asserted "<id> done -- ..." phrase) — the planted acceptance
 *      test: "a HANDOFF completing without a close receipt must be rejected
 *      by the gate." Exercised both at the tickets.mjs library level AND
 *      through the real validate-close-receipt.sh script against its actual
 *      evals/fixtures/validators/validate-close-receipt/{red,green} fixture
 *      directories, so the rejection is proven to fire, not just documented.
 *   2. A hand-typed receipt that matches the header shape but not the
 *      recorded branch/commits evidence must not fool accept() (defeats the
 *      obvious bypass an independent reviewer would try first).
 *   3. start() returns a paste-able "start receipt" (Stage 0 of the /reflow
 *      claim HANDOFF template).
 *   4. openTicketFor()/`tickets.mjs open-for` — the refuse-to-select-
 *      next-work query: an actor with an open (claimed/in_progress) ticket
 *      is refused; one with none (or only an in_review ticket — already
 *      "closed" per T26.1) is not.
 *   5. `tickets.mjs claim` refuses when the ticket graph itself is
 *      unhygienic (write-scope collision) — the hygiene half of "refuse to
 *      select next work."
 *
 * Extracted to its own chapter module (rather than growing
 * test-ticket-lifecycle.ts further) to keep both files under the file-size
 * cap, matching test-gate-receipts.ts's precedent.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

export async function testCloseReceipt(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const tickets = await import(
    pathToFileURL(path.join(root, "scripts/lib/tickets.mjs")).href
  );
  const LIB = path.join(root, "scripts/lib/tickets.mjs");
  const VALIDATOR = path.join(
    root,
    "scripts/validators/validate-close-receipt.sh",
  );

  function makeFixturePlan(modules: unknown[]): string {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "close-receipt-fixture-"),
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

  function runValidator(dir: string): {
    exitCode: number;
    stdout: string;
    stderr: string;
  } {
    try {
      const stdout = execFileSync("/bin/bash", [VALIDATOR, dir], {
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
    // -- RED (planted acceptance test): a HANDOFF completing WITHOUT a close
    // receipt pasted into the manifest must be rejected by the gate.
    {
      const planPath = makeFixturePlan([oneModule()]);
      const plan = tickets.loadPlan(planPath);
      const manifestPath = path.join(path.dirname(planPath), "manifest.md");
      tickets.claim(plan, "M-a", "user");
      tickets.start(plan, "M-a", "user");
      const cl = tickets.close(plan, "M-a", "user", {
        branch: "feat/m-a",
        commits: ["abc123"],
        cwd: path.dirname(planPath),
      });
      // Simulate the pre-T26.3 self-asserted-only completion: no receipt pasted.
      fs.writeFileSync(
        manifestPath,
        "# Manifest\n\nM-a done -- self-asserted, no receipt.\n",
      );
      const r = tickets.accept(plan, "M-a", "reviewer2", {
        cwd: path.dirname(planPath),
      });
      if (
        cl.ok &&
        !r.ok &&
        /close-receipt check failed/i.test(r.error) &&
        plan.modules[0].status === "in_review"
      )
        ok(
          "close receipt — RED (planted): accept refuses a HANDOFF that completed without a pasted close receipt",
        );
      else
        fail(
          "close receipt — accept must reject completion without a pasted close receipt",
          JSON.stringify({
            cl: { ...cl, receipt: undefined },
            r,
            status: plan.modules[0].status,
          }),
        );
    }

    // -- RED: a hand-typed receipt matching the header shape but not the
    // recorded evidence (wrong commit) must not fool accept().
    {
      const planPath = makeFixturePlan([oneModule()]);
      const plan = tickets.loadPlan(planPath);
      const manifestPath = path.join(path.dirname(planPath), "manifest.md");
      tickets.claim(plan, "M-a", "user");
      tickets.start(plan, "M-a", "user");
      const cl = tickets.close(plan, "M-a", "user", {
        branch: "feat/m-a",
        commits: ["abc123"],
        cwd: path.dirname(planPath),
      });
      const fake =
        "── close receipt: M-a ──\n" +
        "actor: user\n" +
        "branch: feat/m-a\n" +
        "commits: totally-made-up\n" +
        "verify: true (exit 0)\n" +
        "manifest: manifest.md\n" +
        "timestamp: 2026-01-01T00:00:00Z\n" +
        "status: in_review — awaiting accept() by a reviewer other than 'user'\n";
      fs.writeFileSync(
        manifestPath,
        `# Manifest\n\nM-a done -- fake.\n\n${fake}`,
      );
      const r = tickets.accept(plan, "M-a", "reviewer2", {
        cwd: path.dirname(planPath),
      });
      if (cl.ok && !r.ok && /missing recorded commit/i.test(r.error))
        ok(
          "close receipt — RED: accept refuses a hand-typed receipt whose evidence doesn't match what close() recorded",
        );
      else
        fail(
          "close receipt — accept must reject a fabricated receipt with mismatched evidence",
          JSON.stringify({ cl: { ...cl, receipt: undefined }, r }),
        );
    }

    // -- GREEN: the real validate-close-receipt.sh script exits 0 against its
    // own green fixture, and non-zero against its red fixture -- proves the
    // planted rejection fires through the actual gate-sweep entry point, not
    // just the library function.
    {
      const redDir = path.join(
        root,
        "evals/fixtures/validators/validate-close-receipt/red",
      );
      const greenDir = path.join(
        root,
        "evals/fixtures/validators/validate-close-receipt/green",
      );
      const redResult = runValidator(redDir);
      const greenResult = runValidator(greenDir);
      if (redResult.exitCode !== 0 && greenResult.exitCode === 0)
        ok(
          "close receipt — validate-close-receipt.sh: red fixture fails (exit != 0), green fixture passes (exit 0)",
        );
      else
        fail(
          "close receipt — validate-close-receipt.sh fixture behavior",
          JSON.stringify({
            redExit: redResult.exitCode,
            greenExit: greenResult.exitCode,
          }),
        );
    }

    // -- GREEN: start() returns a paste-able start receipt (Stage 0).
    {
      const planPath = makeFixturePlan([oneModule()]);
      const plan = tickets.loadPlan(planPath);
      tickets.claim(plan, "M-a", "user");
      const s = tickets.start(plan, "M-a", "user");
      if (
        s.ok &&
        typeof s.receipt === "string" &&
        /^── start receipt: M-a ──/.test(s.receipt) &&
        /actor: user/.test(s.receipt) &&
        /status: claimed -> in_progress/.test(s.receipt)
      )
        ok(
          "close receipt — start() returns a paste-able start receipt (Stage 0)",
        );
      else fail("close receipt — start() receipt shape", JSON.stringify(s));
    }

    // -- refuse-to-select-next-work: openTicketFor()/`open-for` -----------
    // an actor with an open (claimed/in_progress) ticket is refused; a
    // different actor, or the same actor once the ticket is in_review
    // (closed via receipt), is not.
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
          "close receipt — openTicketFor(): flags the owner's open ticket, clears an unrelated actor",
        );
      else
        fail(
          "close receipt — openTicketFor() semantics",
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
          "close receipt — `tickets.mjs open-for`: refuses for the owner of an open ticket, clear for a different actor",
        );
      else
        fail(
          "close receipt — `open-for` CLI semantics",
          JSON.stringify({ cliOwner, cliOther }),
        );
    }

    // -- refuse-to-select-next-work: an actor whose ticket has been CLOSED
    // (in_review, via a receipt) is no longer "open" -- WIP=1 unblocks.
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
          "close receipt — openTicketFor(): an in_review ticket (closed via receipt) no longer counts as open",
        );
      else
        fail(
          "close receipt — in_review should not count as an open ticket",
          JSON.stringify({ open, status: plan.modules[0].status }),
        );
    }

    // -- refuse-to-select-next-work: `tickets.mjs claim` refuses a NEW claim
    // while the ticket graph itself is unhygienic (write-scope collision
    // between an active module and the one being claimed).
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
          "close receipt — `tickets.mjs claim` refuses a new claim while the ticket graph is unhygienic (write-scope collision)",
        );
      else
        fail(
          "close receipt — claim should refuse on a red hygiene check",
          JSON.stringify({ claimA, claimB }),
        );

      // `start` on the actor's OWN already-claimed ticket must NOT be blocked
      // by an unrelated colliding module elsewhere in the graph -- hygiene
      // gates SELECTING new work, not advancing work already claimed.
      const startA = runCli(["start", planPath, "M-a", "actor-one"]);
      if (startA.exitCode === 0 && /start receipt: M-a/.test(startA.stdout))
        ok(
          "close receipt — `tickets.mjs start` is NOT blocked by an unrelated colliding module (only `claim` gates on hygiene)",
        );
      else
        fail(
          "close receipt — start() should not be blocked by unrelated hygiene issues",
          JSON.stringify(startA),
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("close receipt", `unexpected failure: ${message}`);
  }
}
