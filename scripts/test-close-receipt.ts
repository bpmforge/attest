/**
 * test-close-receipt.ts — Pass 17 chapter module for scripts/test.ts (T26.3).
 *
 * "Close-before-next-claim" protocol wiring, receipt-gate half:
 *   1. accept() refuses in_review -> done unless the module's Completion
 *      Manifest has the close() receipt pasted verbatim into it (not just a
 *      self-asserted "<id> done -- ..." phrase) — the planted acceptance
 *      test: "a HANDOFF completing without a close receipt must be rejected
 *      by the gate." Exercised both at the tickets.mjs library level AND
 *      through the real validate-close-receipt.sh script against its actual
 *      evals/fixtures/validators/validate-close-receipt/{red,green} fixture
 *      directories, so the rejection is proven to fire, not just documented.
 *   2. A hand-typed receipt that matches the header shape but not the
 *      recorded branch/commits/actor evidence must not fool accept() —
 *      defeats the obvious bypasses an independent reviewer tried first
 *      (wrong commit, and a fabricated `actor:` line with otherwise-correct
 *      evidence — the second one was a real gap found and closed here).
 *   3. start() returns a paste-able "start receipt" (Stage 0 of the /reflow
 *      claim HANDOFF template).
 *
 * The refuse-to-select-next-work half (openTicketFor/`open-for`, claim's
 * hygiene refusal) lives in test-refuse-next-work.ts (Pass 18) — split out
 * to keep both files under the file-size cap, matching test-gate-receipts.ts's
 * precedent.
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

    // -- RED (regression, independent review): a hand-typed receipt with the
    // CORRECT branch/commits but a fabricated `actor:` line must not fool
    // accept() -- misattributing whose work this is is exactly the kind of
    // fake the receipt is supposed to make impossible.
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
      const fakeActor =
        "── close receipt: M-a ──\n" +
        "actor: someone-else\n" + // real branch/commits, fabricated actor
        "branch: feat/m-a\n" +
        "commits: abc123\n" +
        "verify: true (exit 0)\n" +
        "manifest: manifest.md\n" +
        "timestamp: 2026-01-01T00:00:00Z\n" +
        "status: in_review — awaiting accept() by a reviewer other than 'user'\n";
      fs.writeFileSync(
        manifestPath,
        `# Manifest\n\nM-a done -- fake actor.\n\n${fakeActor}`,
      );
      const r = tickets.accept(plan, "M-a", "reviewer2", {
        cwd: path.dirname(planPath),
      });
      if (cl.ok && !r.ok && /pasted receipt actor/i.test(r.error))
        ok(
          "close receipt — RED: accept refuses a hand-typed receipt with the right evidence but a fabricated actor",
        );
      else
        fail(
          "close receipt — accept must reject a receipt whose actor doesn't match the ticket owner",
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("close receipt", `unexpected failure: ${message}`);
  }
}
