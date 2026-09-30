/**
 * test-trace-order.ts — Pass 60 (Group K4). Deterministic rule-compliance grading
 * (scripts/lib/trace-order.mjs, adapted from ECC skill-comply, MIT).
 */
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

export async function testTraceOrder(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const { gradeTrace } = await import(pathToFileURL(path.join(root, "scripts/lib/trace-order.mjs")).href);
  const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(root, "evals/fixtures/trace-order", n), "utf8"));
  const spec = fx("tdd-spec.json");
  const check = (label: string, cond: boolean, why = "assertion false") => (cond ? ok(label) : fail(label, why));

  const good = gradeTrace(spec, fx("compliant.json"));
  check("K4 compliant TDD trace grades 100%", good.complianceRate === 1 && !good.recommendHook, JSON.stringify(good.steps.map((s: any) => [s.id, s.detected, s.reason])));

  const bad = gradeTrace(spec, fx("noncompliant.json"));
  check("K4 impl-before-test trace fails and recommends hook promotion", bad.complianceRate < 0.5 && bad.recommendHook, `rate=${bad.complianceRate}`);
  check("K4 failure reason names the ordering violation", bad.steps.some((s: any) => /before 'write_impl'/.test(s.reason ?? "")));

  const par = gradeTrace(spec, fx("parallel.json"));
  check("K4 parallel calls (same group) are unordered: no false 'must occur before' violation",
    par.steps.find((s: any) => s.id === "write_test").detected === true, JSON.stringify(par.steps[0]));

  // demotion: b (declared first) passes on a's raw candidates; a then fails on its own prerequisite.
  const dspec = { id: "d", steps: [
    { id: "b", match: { tool: ["x"] }, after: "a" },
    { id: "a", match: { tool: ["y"] }, after: "c" },
    { id: "c", match: { tool: ["never"] } } ] };
  const dres = gradeTrace(dspec, [{ seq: 1, tool: "y" }, { seq: 2, tool: "x" }]);
  check("K4 a dependant cannot pass on a failed prerequisite (demotion pass)",
    dres.steps.find((s: any) => s.id === "b").detected === false && dres.steps.find((s: any) => s.id === "a").detected === false);

  // optional step never lowers the rate
  check("K4 optional step is excluded from the rate", good.steps.find((s: any) => s.id === "refactor").required === false && good.complianceRate === 1);

  // capture: drive the REAL tool.execute.after hook and read the log back.
  const { ExpertHooks } = await import(pathToFileURL(path.join(root, "plugins/expert-hooks.ts")).href);
  const hooks = await ExpertHooks({ $: (() => ({ quiet: () => ({ nothrow: async () => ({}) }) })) as any } as any);
  const tmp = fs.mkdtempSync(path.join(root, ".tmp-trace-"));
  const log = path.join(tmp, "trace.jsonl");
  try {
    process.env.EXPERTS_TRACE_LOG = log;
    await hooks["tool.execute.after"]({ tool: "bash", sessionID: "s", callID: "c1", args: { command: "pytest tests/" } }, { title: "", output: "1 failed", metadata: {} });
    await hooks["tool.execute.after"]({ tool: "read", sessionID: "s", callID: "c2", args: { filePath: "src/a.ts" } }, { title: "", output: "x".repeat(5000), metadata: {} });
    const rows = fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    check("K4 trace capture writes one ordered row per tool call", rows.length === 2 && rows[0].seq === 1 && rows[1].seq === 2 && rows[0].cmd === "pytest tests/" && rows[0].out === "1 failed");
    check("K4 trace rows keep only a short output head (no file contents)", rows[1].out.length === 200 && rows[1].file === "src/a.ts");
    delete process.env.EXPERTS_TRACE_LOG;
    await hooks["tool.execute.after"]({ tool: "bash", sessionID: "s", callID: "c3", args: { command: "ls" } }, { title: "", output: "", metadata: {} });
    check("K4 tracing is off unless EXPERTS_TRACE_LOG is set", fs.readFileSync(log, "utf8").trim().split("\n").length === 2);
    // round-trip: captured rows are gradeable
    const r = gradeTrace({ id: "t", steps: [{ id: "red", match: { tool: ["bash"], cmd: "pytest", out: "fail" } }] }, rows);
    check("K4 captured trace grades against a predicate spec", r.complianceRate === 1);
  } finally {
    delete process.env.EXPERTS_TRACE_LOG;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
