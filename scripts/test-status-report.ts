/**
 * test-status-report.ts — Pass 36 chapter module for scripts/test.ts (T29.3,
 * H7/C-1).
 *
 * computeStatusReport()/renderStatusMarkdown()/checkStatusFreshness()
 * (scripts/lib/status-report.mjs) — status derives % from BOTH the task
 * layer (module closure) and the T29.2 requirement (story) layer, never
 * paints a phase green with an open story, and flags an artifact stale when
 * its embedded numbers mismatch a live recompute or predate the plan's own
 * last work event. The ticket's own acceptance fixture (tasks=100%/
 * stories=50% renders half-done; a stale artifact is flagged) is exercised
 * directly below.
 */

import { pathToFileURL } from "url";
import * as path from "path";
import * as fs from "fs";
import { spawnSync } from "child_process";

export async function testStatusReport(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  try {
    const {
      computeStatusReport,
      renderStatusMarkdown,
      checkStatusFreshness,
      lastWorkEvent,
    } = await import(
      pathToFileURL(path.join(root, "scripts/lib/status-report.mjs")).href
    );

    // -- acceptance fixture: tasks=100%/stories=50% renders half-done ------
    const halfDonePlan = {
      modules: [
        {
          id: "M-a",
          kind: "module",
          status: "done",
          write_scope: ["src/a/**"],
          depends_on: [],
          acceptance: ["a"],
          stories: ["US-01"],
        },
        {
          id: "M-b",
          kind: "module",
          status: "done",
          write_scope: ["src/b/**"],
          depends_on: [],
          acceptance: ["b"],
        },
      ],
    };
    const report = computeStatusReport(halfDonePlan, ["US-01", "US-02"]);
    if (report.tasks.percent === 100 && report.stories.percent === 50 && report.phase === "built-not-done")
      ok("status-report — tasks=100%/stories=50% computes phase 'built-not-done' (half-done, not complete)");
    else
      fail(
        "status-report — half-done acceptance fixture",
        `expected tasks=100/stories=50/phase=built-not-done, got: ${JSON.stringify(report)}`,
      );

    const markdown = renderStatusMarkdown(report, {
      planPath: "plan.json",
      generatedAt: "2026-07-13T00:00:00.000Z",
    });
    if (
      /BUILT — FEATURES INCOMPLETE/.test(markdown) &&
      !/✅ COMPLETE/.test(markdown) &&
      /2\/2 tasks done \(100%\)/.test(markdown) &&
      /1\/2 stories closed \(50%\)/.test(markdown)
    )
      ok("status-report — rendered markdown shows label math for both layers and never paints COMPLETE with an open story");
    else
      fail("status-report — rendered markdown", `unexpected render:\n${markdown}`);

    // -- never green: 100% tasks, ANY open story is never 'complete' -------
    const oneOpenPlan = {
      modules: [{ id: "M-a", kind: "module", status: "done", stories: ["US-01"] }],
    };
    const oneOpen = computeStatusReport(oneOpenPlan, ["US-01", "US-02"]);
    if (oneOpen.tasks.percent === 100 && oneOpen.phase !== "complete")
      ok("status-report — 100% tasks with one open story never grades 'complete'");
    else
      fail(
        "status-report — never-green rule",
        `expected phase != complete at 100% tasks with an open story, got: ${JSON.stringify(oneOpen)}`,
      );

    // -- fully closed: both layers 100% -> complete -------------------------
    const bothDonePlan = {
      modules: [{ id: "M-a", kind: "module", status: "done", stories: ["US-01"] }],
    };
    const bothDone = computeStatusReport(bothDonePlan, ["US-01"]);
    if (bothDone.phase === "complete")
      ok("status-report — both layers 100% grades 'complete'");
    else
      fail("status-report — complete case", `expected complete, got: ${JSON.stringify(bothDone)}`);

    // -- backward compatible: no stories[] adopted anywhere -> task-only ---
    const noStoriesPlan = {
      modules: [{ id: "M-a", kind: "module", status: "done" }],
    };
    const noStories = computeStatusReport(noStoriesPlan, []);
    if (noStories.hasStories === false && noStories.phase === "complete")
      ok("status-report — project with no stories[] layer grades on task closure alone (backward compatible)");
    else
      fail(
        "status-report — no-stories backward compatibility",
        `expected hasStories=false/phase=complete, got: ${JSON.stringify(noStories)}`,
      );

    // -- lastWorkEvent: latest history[]/claimed_at timestamp across modules
    const historyPlan = {
      modules: [
        { id: "M-a", kind: "module", status: "done", history: [{ ts: "2026-07-01T00:00:00Z" }, { ts: "2026-07-10T00:00:00Z" }] },
        { id: "M-b", kind: "module", status: "ready", claimed_at: "2026-07-05T00:00:00Z" },
      ],
    };
    if (lastWorkEvent(historyPlan) === "2026-07-10T00:00:00Z")
      ok("status-report — lastWorkEvent returns the latest history[]/claimed_at timestamp across all modules");
    else
      fail("status-report — lastWorkEvent", `expected 2026-07-10T00:00:00Z, got: ${lastWorkEvent(historyPlan)}`);

    // -- staleness: a stale artifact is flagged (numbers mismatch) ---------
    const staleMarkdown = renderStatusMarkdown(computeStatusReport(halfDonePlan, ["US-01", "US-02"]), {
      planPath: "plan.json",
      generatedAt: "2026-07-13T00:00:00.000Z",
    });
    // Live state has moved on since staleMarkdown was generated: US-02
    // (open in the snapshot) is now also closed by a real work event.
    const laterPlan = {
      modules: [
        { id: "M-a", kind: "module", status: "done", stories: ["US-01"] },
        { id: "M-c", kind: "module", status: "done", stories: ["US-02"] },
      ],
    };
    const freshness1 = checkStatusFreshness(staleMarkdown, laterPlan, ["US-01", "US-02"]);
    if (freshness1.stale && freshness1.reasons.some((r: string) => /mismatch a live query/.test(r)))
      ok("status-report — checkStatusFreshness flags stale when live numbers mismatch the embedded snapshot");
    else
      fail("status-report — staleness via mismatch", `expected stale with a mismatch reason, got: ${JSON.stringify(freshness1)}`);

    // -- staleness: numbers older than the plan's last work event ----------
    const workEventPlan = {
      modules: [
        { id: "M-a", kind: "module", status: "done", stories: ["US-01"], history: [{ ts: "2026-07-13T05:00:00Z" }] },
      ],
    };
    const freshMarkdown = renderStatusMarkdown(computeStatusReport(workEventPlan, ["US-01"]), {
      planPath: "plan.json",
      generatedAt: "2026-07-13T00:00:00.000Z", // predates the history[] event above
    });
    const freshness2 = checkStatusFreshness(freshMarkdown, workEventPlan, ["US-01"]);
    if (freshness2.stale && freshness2.reasons.some((r: string) => /after this artifact was generated/.test(r)))
      ok("status-report — checkStatusFreshness flags stale when the plan has a work event after generatedAt");
    else
      fail("status-report — staleness via last-work-event", `expected stale with a last-work-event reason, got: ${JSON.stringify(freshness2)}`);

    // -- freshness: a just-generated, unchanged artifact is NOT stale ------
    const cleanReport = computeStatusReport(bothDonePlan, ["US-01"]);
    const cleanMarkdown = renderStatusMarkdown(cleanReport, { planPath: "plan.json", generatedAt: "2026-07-13T23:59:59.000Z" });
    const freshness3 = checkStatusFreshness(cleanMarkdown, bothDonePlan, ["US-01"]);
    if (!freshness3.stale)
      ok("status-report — an artifact regenerated from the current plan state is not flagged stale");
    else
      fail("status-report — clean freshness", `expected not stale, got: ${JSON.stringify(freshness3)}`);

    // -- staleness: no embedded meta at all -> treated as stale -------------
    const freshness4 = checkStatusFreshness("# Status\n\nno meta here\n", bothDonePlan, ["US-01"]);
    if (freshness4.stale && freshness4.reasons.some((r: string) => /no embedded/.test(r)))
      ok("status-report — an artifact with no embedded meta is treated as stale, not silently trusted");
    else
      fail("status-report — missing-meta staleness", `expected stale, got: ${JSON.stringify(freshness4)}`);
    // -- validate-status-freshness.sh: the real CLI wrapper, red/green -----
    const scriptPath = path.join(root, "scripts/validators/validate-status-freshness.sh");
    function runValidator(fixtureDir: string): { exitCode: number; stderr: string } {
      const result = spawnSync("bash", [scriptPath, fixtureDir], { encoding: "utf8" });
      return { exitCode: result.status ?? 1, stderr: result.stderr ?? "" };
    }
    function mkFixture(name: string): string {
      const dir = fs.mkdtempSync(path.join(fs.realpathSync(root), `.tmp-status-freshness-${name}-`));
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, "docs/work"), { recursive: true });
      return dir;
    }
    const genScript = path.join(root, "scripts/gen-status-report.mjs");

    // GREEN: a STATUS.md just regenerated from the live plan is fresh.
    {
      const dir = mkFixture("green");
      const planPath = path.join(dir, "docs/work/plan.json");
      fs.writeFileSync(
        planPath,
        JSON.stringify({ modules: [{ id: "M-a", kind: "module", status: "done", write_scope: ["src/**"], depends_on: [], acceptance: ["a"] }] }),
      );
      const gen = spawnSync("node", [genScript, planPath, "", path.join(dir, "docs/work/STATUS.md")], { encoding: "utf8" });
      if (gen.status !== 0) fail("validate-status-freshness — GREEN fixture setup", `gen-status-report.mjs failed: ${gen.stderr}`);
      const result = runValidator(dir);
      if (result.exitCode === 0)
        ok("validate-status-freshness — GREEN: a freshly generated STATUS.md passes clean (exit 0)");
      else
        fail("validate-status-freshness — GREEN fixture", `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // RED: a plan mutated after generation (new work event, numbers drift)
    // must fail the validator (acceptance criterion: "a stale artifact is
    // flagged").
    {
      const dir = mkFixture("red");
      const planPath = path.join(dir, "docs/work/plan.json");
      fs.writeFileSync(
        planPath,
        JSON.stringify({ modules: [{ id: "M-a", kind: "module", status: "ready", write_scope: ["src/**"], depends_on: [], acceptance: ["a"] }] }),
      );
      const gen = spawnSync("node", [genScript, planPath, "", path.join(dir, "docs/work/STATUS.md")], { encoding: "utf8" });
      if (gen.status !== 0) fail("validate-status-freshness — RED fixture setup", `gen-status-report.mjs failed: ${gen.stderr}`);
      // Work happens on the plan (module closes with a history event) but
      // STATUS.md is never regenerated -- the exact staleness this check exists for.
      fs.writeFileSync(
        planPath,
        JSON.stringify({
          modules: [{
            id: "M-a", kind: "module", status: "done", write_scope: ["src/**"], depends_on: [], acceptance: ["a"],
            history: [{ ts: "2099-01-01T00:00:00Z", actor: "x", from: "ready", to: "done" }],
          }],
        }),
      );
      const result = runValidator(dir);
      if (result.exitCode !== 0 && /status-stale/.test(result.stderr))
        ok("validate-status-freshness — RED: a plan with a work event after generation fails the validator (exit != 0), flagged 'status-stale'");
      else
        fail("validate-status-freshness — RED fixture", `expected exit != 0 with a status-stale gap, got exitCode=${result.exitCode} stderr=${result.stderr}`);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("status-report", `import/exec failed: ${message}`);
  }
}
