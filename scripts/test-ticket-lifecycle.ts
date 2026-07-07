/**
 * test-ticket-lifecycle.ts — Pass 4b chapter module for scripts/test.ts (T26.1).
 *
 * Red/green fixtures for the enforced ticket lifecycle in tickets.mjs:
 * claim/start/comment/close/accept/release. This is the root-cause fix for
 * the 2026-07-07 ticket-hygiene incident — an executor worked tickets
 * without ever claiming, commenting, or closing them, then self-declared
 * "done" with no audit trail. These fixtures prove the specific gaps that
 * allowed that are now refused: a direct ready->done jump, closing without
 * a manifest or a passing verify gate, and a second concurrent claim by the
 * same actor (WIP=1). Extracted to its own chapter module to keep test.ts
 * under the file-size cap, matching test-gate-receipts.ts's precedent.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";

export async function testTicketLifecycle(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const tickets = await import(
    pathToFileURL(path.join(root, "scripts/lib/tickets.mjs")).href
  );

  function makeFixturePlan(modules: unknown[]): string {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ticket-lifecycle-fixture-"),
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

  try {
    // -- GREEN: full lifecycle claim -> start -> close -> accept
    {
      const planPath = makeFixturePlan([oneModule()]);
      const plan = tickets.loadPlan(planPath);

      const c1 = tickets.claim(plan, "M-a", "user");
      const s1 = tickets.start(plan, "M-a", "user");
      const cl1 = tickets.close(plan, "M-a", "user", {
        branch: "feat/m-a",
        commits: ["abc123"],
        cwd: path.dirname(planPath),
      });
      const a1 = tickets.accept(plan, "M-a", "reviewer2");

      if (
        c1.ok &&
        s1.ok &&
        cl1.ok &&
        typeof cl1.receipt === "string" &&
        a1.ok &&
        plan.modules[0].status === "done" &&
        Array.isArray(plan.modules[0].history) &&
        plan.modules[0].history.length === 4 &&
        plan.modules[0].evidence?.branch === "feat/m-a"
      )
        ok(
          "ticket lifecycle — full claim->start->close->accept chain succeeds",
        );
      else
        fail(
          "ticket lifecycle — full chain",
          JSON.stringify({
            c1,
            s1,
            cl1: { ...cl1, receipt: undefined },
            a1,
            status: plan.modules[0].status,
          }),
        );
    }

    // -- RED: ready -> done jump (accept skipping claim/start/close)
    {
      const planPath = makeFixturePlan([oneModule()]);
      const plan = tickets.loadPlan(planPath);
      const r = tickets.accept(plan, "M-a", "user");
      if (!r.ok && plan.modules[0].status === "ready")
        ok("ticket lifecycle — RED: ready->done jump refused");
      else
        fail(
          "ticket lifecycle — ready->done jump should be refused",
          JSON.stringify(r),
        );
    }

    // -- RED: close without a manifest file on disk
    {
      const planPath = makeFixturePlan([
        oneModule({ manifest: "does-not-exist.md" }),
      ]);
      const plan = tickets.loadPlan(planPath);
      tickets.claim(plan, "M-a", "user");
      tickets.start(plan, "M-a", "user");
      const r = tickets.close(plan, "M-a", "user", {
        branch: "feat/m-a",
        commits: ["abc123"],
        cwd: path.dirname(planPath),
      });
      if (!r.ok && /manifest/i.test(r.error))
        ok("ticket lifecycle — RED: close without a manifest refused");
      else
        fail(
          "ticket lifecycle — close-without-manifest should be refused",
          JSON.stringify(r),
        );
    }

    // -- RED: close with a verify command that exits non-zero
    {
      const planPath = makeFixturePlan([oneModule({ verify: "exit 1" })]);
      const plan = tickets.loadPlan(planPath);
      tickets.claim(plan, "M-a", "user");
      tickets.start(plan, "M-a", "user");
      const r = tickets.close(plan, "M-a", "user", {
        branch: "feat/m-a",
        commits: ["abc123"],
        cwd: path.dirname(planPath),
      });
      if (
        !r.ok &&
        /verify gate/i.test(r.error) &&
        plan.modules[0].status === "in_progress"
      )
        ok("ticket lifecycle — RED: close-with-failing-verify refused");
      else
        fail(
          "ticket lifecycle — close-with-failing-verify should be refused",
          JSON.stringify(r),
        );
    }

    // -- RED: close is not fooled by a caller-supplied verify override —
    // there is no such parameter; the ticket's OWN module.verify always runs.
    // Prove it: a module whose OWN verify fails cannot be closed by passing
    // any other data through the public close() signature.
    {
      const planPath = makeFixturePlan([oneModule({ verify: "exit 1" })]);
      const plan = tickets.loadPlan(planPath);
      tickets.claim(plan, "M-a", "user");
      tickets.start(plan, "M-a", "user");
      // @ts-expect-error -- deliberately probing for an override the API doesn't expose
      const r = tickets.close(plan, "M-a", "user", {
        branch: "feat/m-a",
        commits: ["abc123"],
        cwd: path.dirname(planPath),
        verify_cmd: "true", // not a real option — close() only ever reads module.verify
        verifyCmd: "true",
      });
      if (!r.ok)
        ok(
          "ticket lifecycle — RED: close ignores any caller-supplied verify override",
        );
      else
        fail(
          "ticket lifecycle — close must never accept a verify override",
          "close() succeeded despite the module's own verify command failing",
        );
    }

    // -- RED: second concurrent claim by the same actor (WIP=1, different ticket)
    {
      const planPath = makeFixturePlan([
        oneModule({ id: "M-a" }),
        oneModule({ id: "M-b", write_scope: ["src/b/**"] }),
      ]);
      const plan = tickets.loadPlan(planPath);
      tickets.claim(plan, "M-a", "user");
      const r = tickets.claim(plan, "M-b", "user");
      if (!r.ok && /WIP=1/.test(r.error))
        ok(
          "ticket lifecycle — RED: second concurrent claim by the same actor refused (WIP=1)",
        );
      else
        fail(
          "ticket lifecycle — WIP=1 should refuse a second concurrent claim",
          JSON.stringify(r),
        );
    }

    // -- accept refuses when the acceptor is the same actor who did the work
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
      const r = tickets.accept(plan, "M-a", "user");
      if (!r.ok && plan.modules[0].status === "in_review")
        ok(
          "ticket lifecycle — RED: accept refuses the same actor who owns the ticket",
        );
      else
        fail(
          "ticket lifecycle — accept-own-work should be refused",
          JSON.stringify(r),
        );
    }

    // -- release requires a non-empty reason, then returns to ready and clears owner
    {
      const planPath = makeFixturePlan([oneModule()]);
      const plan = tickets.loadPlan(planPath);
      tickets.claim(plan, "M-a", "user");
      const noReason = tickets.release(plan, "M-a", "user", "");
      const withReason = tickets.release(
        plan,
        "M-a",
        "user",
        "blocked on an external dependency",
      );
      if (
        !noReason.ok &&
        withReason.ok &&
        plan.modules[0].status === "ready" &&
        plan.modules[0].owner === null &&
        plan.modules[0].claimed_at === null
      )
        ok(
          "ticket lifecycle — release requires a reason, then clears owner/claimed_at",
        );
      else
        fail(
          "ticket lifecycle — release semantics",
          JSON.stringify({ noReason, withReason, module: plan.modules[0] }),
        );
    }

    // -- comment appends history at any state without changing status
    {
      const planPath = makeFixturePlan([oneModule()]);
      const plan = tickets.loadPlan(planPath);
      const r = tickets.comment(
        plan,
        "M-a",
        "user",
        "progress note, no state change",
      );
      if (
        r.ok &&
        plan.modules[0].status === "ready" &&
        plan.modules[0].history.length === 1
      )
        ok(
          "ticket lifecycle — comment appends history without changing status",
        );
      else
        fail(
          "ticket lifecycle — comment semantics",
          JSON.stringify({ r, module: plan.modules[0] }),
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("ticket lifecycle", `unexpected failure: ${message}`);
  }
}
