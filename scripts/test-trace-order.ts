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
  const imp2 = (p: string) => import(pathToFileURL(path.join(root, p)).href);
  const { gradeTrace } = await imp2("scripts/lib/trace-order.mjs");
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

  // ---- gaps found by mutation audit: `after`, predicates, threshold, sort, chain, validation, session
  const av = gradeTrace(spec, fx("after-violation.json"));
  check("K4 `after` is enforced: impl written before the RED run fails 'after run_red'",
    av.steps.find((s: any) => s.id === "write_impl").detected === false && /after 'run_red'/.test(av.steps.find((s: any) => s.id === "write_impl").reason ?? ""));
  const eq = gradeTrace({ id: "e", steps: [{ id: "a", match: { tool: ["x"] } }, { id: "b", match: { tool: ["y"] }, after: "a" }] }, [{ seq: 1, tool: "x" }, { seq: 1, tool: "y" }]);
  check("K4 equal seq without a shared group is NOT 'after' (boundary is strict)", eq.steps[1].detected === false);
  const pred = (m: any, ev: any) => gradeTrace({ id: "p", steps: [{ id: "s", match: m }] }, [ev]).steps[0].detected;
  check("K4 predicate out: 'passed' output does not satisfy out:/fail/", pred({ tool: ["bash"], out: "fail" }, { seq: 1, tool: "bash", out: "1 passed" }) === false);
  check("K4 predicate cmd: other command does not match", pred({ tool: ["bash"], cmd: "pytest" }, { seq: 1, tool: "bash", cmd: "ls" }) === false);
  check("K4 predicate file: other file does not match", pred({ tool: ["write"], file: "test" }, { seq: 1, tool: "write", file: "src/a.py" }) === false);
  check("K4 tool and regex matching are case-insensitive", pred({ tool: ["bash"], cmd: "pytest" }, { seq: 1, tool: "Bash", cmd: "PYTEST -q" }) === true);
  const three = { id: "t", steps: [{ id: "a", match: { tool: ["x"] } }, { id: "b", match: { tool: ["y"] } }, { id: "c", match: { tool: ["never"] } }] };
  check("K4 threshold decides recommendHook (2/3 vs 0.5 and 0.9)",
    gradeTrace({ ...three, threshold: 0.5 }, [{ seq: 1, tool: "x" }, { seq: 2, tool: "y" }]).recommendHook === false &&
    gradeTrace({ ...three, threshold: 0.9 }, [{ seq: 1, tool: "x" }, { seq: 2, tool: "y" }]).recommendHook === true);
  const shuffled = [...fx("compliant.json")].reverse();
  check("K4 unsorted input is ordered by seq before grading", gradeTrace(spec, shuffled).complianceRate === 1);
  const chain = gradeTrace({ id: "c", steps: [
    { id: "c", match: { tool: ["c"] }, after: "b" }, { id: "b", match: { tool: ["b"] }, after: "a" },
    { id: "a", match: { tool: ["a"] }, after: "z" }, { id: "z", match: { tool: ["never"] } } ] },
    [{ seq: 1, tool: "a" }, { seq: 2, tool: "b" }, { seq: 3, tool: "c" }]);
  check("K4 demotion runs to a fixed point (a 3-deep chain all falls)", chain.steps.slice(0, 3).every((s: any) => s.detected === false));
  const mixed = [{ seq: 1, session: "s1", tool: "x" }, { seq: 2, session: "s2", tool: "y" }];
  const sp = { id: "s", steps: [{ id: "a", match: { tool: ["x"] } }, { id: "b", match: { tool: ["y"] }, after: "a" }] };
  check("K4 session option grades one session (interleaved capture)", gradeTrace(sp, mixed).steps[1].detected === true && gradeTrace(sp, mixed, { session: "s2" }).steps[0].detected === false);
  const throws = (spec: any) => { try { gradeTrace(spec, []); return false; } catch { return true; } };
  check("K4 spec validation: unknown before id, bad regex, cycle, duplicate id, string tool all throw",
    throws({ id: "v", steps: [{ id: "a", match: {}, before: "zz" }] }) && throws({ id: "v", steps: [{ id: "a", match: { cmd: "([" } }] }) &&
    throws({ id: "v", steps: [{ id: "a", match: {}, after: "b" }, { id: "b", match: {}, after: "a" }] }) &&
    throws({ id: "v", steps: [{ id: "a", match: {} }, { id: "a", match: {} }] }) && throws({ id: "v", steps: [{ id: "a", match: { tool: "bash" } }] }));

  // ---- Claude Code hook rows: real output of attest-claude/hooks/trace-tool-call.sh (ts + group, no seq)
  const { loadTrace } = await imp2("scripts/lib/trace-order.mjs");
  const claude = loadTrace(fs.readFileSync(path.join(root, "evals/fixtures/trace-order/claude-hook.jsonl"), "utf8"));
  check("K4 loadTrace assigns seq by timestamp when the source has none", claude.map((r: any) => r.seq).join() === "1,2,3,4" && claude[0].file === "src/fib.py");
  const swapped = loadTrace('{"ts":200,"tool":"b"}\n{"ts":100,"tool":"a"}\n{"ts":100,"tool":"a2"}');
  check("K4 loadTrace orders by timestamp (concurrent appends land out of order), file order breaks ties", swapped.map((r: any) => r.tool).join() === "a,a2,b" && swapped.map((r: any) => r.seq).join() === "1,2,3");
  check("K4 loadTrace keeps opencode rows' own seq untouched", loadTrace('{"seq":7,"tool":"x"}\n{"seq":3,"tool":"y"}').map((r: any) => r.seq).join() === "7,3");
  const tsSpec = { id: "par", steps: [{ id: "write_test", match: { tool: ["write"], file: "test" }, before: "write_impl" }, { id: "write_impl", match: { tool: ["write"], notFile: "test" } }] };
  check("K4 a Claude trace with parallel writes (impl logged first, same message) does not falsely fail 'before'", gradeTrace(tsSpec, claude, { session: "cc1" }).steps[0].detected === true);
  check("K4 the same trace WITHOUT its group WOULD falsely fail (the tie rule is what saves it)", gradeTrace(tsSpec, claude.map(({ group, ...r }: any) => r), { session: "cc1" }).steps[0].detected === false);
  check("K4 a second session in the same log is not mixed in", gradeTrace({ id: "x", steps: [{ id: "s", match: { tool: ["bash"], cmd: "^ls" } }] }, claude, { session: "cc1" }).steps[0].detected === false);

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
    check("K4 trace rows keep a bounded output (no file contents)", rows[1].out.length <= 205 && rows[1].file === "src/a.ts");
    await hooks["tool.execute.after"]({ tool: "bash", sessionID: "s", callID: "c5", args: { command: "pytest" } }, { title: "", output: "x".repeat(1000) + " FAILED 2", metadata: {} });
    const tailRow = JSON.parse(fs.readFileSync(log, "utf8").trim().split("\n").at(-1)!);
    await hooks["tool.execute.after"]({ tool: "bash", sessionID: "s", callID: "c6", args: { command: "x".repeat(2000) + " --final-flag" } }, { title: "", output: "", metadata: {} });
    const cmdRow = JSON.parse(fs.readFileSync(log, "utf8").trim().split("\n").at(-1)!);
    check("K4 a long command keeps its TAIL (where the path or flag that matters may sit) and stays bounded", /--final-flag$/.test(cmdRow.cmd) && cmdRow.cmd.length <= 605);
    check("K4 long output keeps its TAIL (the failure summary), not only the head", /FAILED 2$/.test(tailRow.out) && tailRow.out.length <= 205);
    delete process.env.EXPERTS_TRACE_LOG;
    await hooks["tool.execute.after"]({ tool: "bash", sessionID: "s", callID: "c3", args: { command: "ls" } }, { title: "", output: "", metadata: {} });
    check("K4 tracing is off unless EXPERTS_TRACE_LOG is set", fs.readFileSync(log, "utf8").trim().split("\n").length === 4);
    process.env.EXPERTS_TRACE_LOG = path.join(tmp, "no", "such", "dir", "t.jsonl");
    let threw = false;
    try { await hooks["tool.execute.after"]({ tool: "bash", sessionID: "s", callID: "c4", args: { command: "ls" } }, { title: "", output: "", metadata: {} }); } catch { threw = true; }
    check("K4 a tracing failure never breaks the tool call", threw === false);
    process.env.EXPERTS_TRACE_LOG = log;
    // round-trip: captured rows are gradeable
    const r = gradeTrace({ id: "t", steps: [{ id: "red", match: { tool: ["bash"], cmd: "pytest", out: "fail" } }] }, rows);
    check("K4 captured trace grades against a predicate spec", r.complianceRate === 1);
  } finally {
    delete process.env.EXPERTS_TRACE_LOG;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
