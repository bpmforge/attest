/**
 * test-edit-tasks.ts — Pass 61 (Group K2). The gateguard A/B machinery: scoring, statistics, the runner driven
 * by a scripted stub agent (free), and — for EVERY shipped task — RED as shipped / GREEN with its solution.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";

export async function testEditTasks(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const imp = (p: string) => import(pathToFileURL(path.join(root, p)).href);
  const run = await imp("scripts/lib/edit-task-run.mjs");
  const stats = await imp("scripts/lib/edit-task-stats.mjs");
  const check = (label: string, cond: boolean, why = "assertion false") => (cond ? ok(label) : fail(label, why));

  // ---- arms / env: ungated arms must carry NO gateguard flags; D differs from B only by the neutral flag
  const e = (a: string) => run.armEnv(a, { workdir: "/w", gateLog: "/g", traceLog: "/t" });
  check("K2 arm A and C env carry no gateguard flags", !("EXPERTS_GATEGUARD" in e("A")) && !("EXPERTS_GATEGUARD" in e("C")));
  check("K2 arm B gates with a log; arm D adds only the neutral flag",
    e("B").EXPERTS_GATEGUARD === "1" && e("B").EXPERTS_GATEGUARD_LOG === "/g" && !e("B").EXPERTS_GATEGUARD_NEUTRAL && e("D").EXPERTS_GATEGUARD_NEUTRAL === "1");
  check("K2 only arm C's prompt differs", run.promptFor({ prompt: "P" }, "A") === "P" && run.promptFor({ prompt: "P" }, "B") === "P" && run.promptFor({ prompt: "P" }, "C").includes("list every file that imports"));
  check("K2 seeded shuffle is deterministic and a permutation",
    JSON.stringify(run.shuffled([1, 2, 3, 4, 5, 6], "s")) === JSON.stringify(run.shuffled([1, 2, 3, 4, 5, 6], "s")) && run.shuffled([1, 2, 3, 4, 5, 6], "s").slice().sort().join() === "1,2,3,4,5,6");

  // ---- neutral message really carries no fact request (arm D's whole point)
  const { gateguardCheck } = await imp("scripts/lib/hook-guards.mjs");
  const neutral = gateguardCheck(new Map(), "s", "/p/a.ts", true, { EXPERTS_GATEGUARD: "1", EXPERTS_GATEGUARD_NEUTRAL: "1" }) ?? "";
  check("K2 arm D deny has no fact request", /GATEGUARD/.test(neutral) && !/import|facts|verbatim/i.test(neutral));

  // ---- scoring
  const denyRow = { ts: 100, file: "src/x.mjs" };
  const withFacts = run.scoreRun({ arm: "B", gateRows: [denyRow], traceRows: [{ seq: 1, ts: 110, tool: "grep" }, { seq: 2, ts: 120, tool: "edit", file: "src/x.mjs" }] });
  const noFacts = run.scoreRun({ arm: "D", gateRows: [denyRow], traceRows: [{ seq: 1, ts: 110, tool: "edit", file: "src/x.mjs" }] });
  check("K2 factsGiven true when a search sits between deny and the retry", withFacts.fired && withFacts.factsGiven === true);
  check("K2 factsGiven false on a bare retry", noFacts.factsGiven === false);
  check("K2 never-fired run is flagged fired=false (discard-if-never-fired needs it)", run.scoreRun({ arm: "B" }).fired === false);
  check("K2 peeking at the hidden test is flagged gamed", run.scoreRun({ arm: "A", traceRows: [{ seq: 1, tool: "bash", cmd: "cat /x/hidden/test.mjs" }], hiddenMarkers: ["hidden/test.mjs"] }).gamed === true);
  check("K2 a bash write path is flagged (ungated route around the gate)", run.scoreRun({ arm: "B", traceRows: [{ seq: 1, tool: "bash", cmd: "sed -i s/a/b/ src/x.mjs" }] }).bashWrite === true);

  // ---- statistics (dataset builder: A/B/C/D rows for tasks given as [passesA, passesB] out of 5)
  const build = (multi: Array<[number, number]>, iso: Array<[number, number]>, reuse: Array<[number, number]>, mod: (r: any) => any = (r) => r) => {
    const rows: any[] = [];
    const add = (kind: string, prefix: string, specs: Array<[number, number]>) => specs.forEach(([a, b], t) => {
      const id = `${prefix}${t}`;
      const mk = (arm: string, passes: number) => Array.from({ length: 5 }, (_, i) => ({ task: id, kind, arm, run: i, pass: i < passes, fired: arm === "B" || arm === "D", traced: true, edited: true, durationMs: 1000, gamed: false, infra: false }));
      rows.push(...mk("A", a), ...mk("B", b), ...mk("C", a), ...mk("D", a));
    });
    add("multi-module", "m", multi); add("isolated", "i", iso); add("reuse-trap", "r", reuse);
    return rows.map(mod);
  };
  const rep = (n: number, v: [number, number]) => Array.from({ length: n }, () => v);
  const win = build(rep(8, [1, 5]), rep(4, [4, 4]), rep(4, [3, 3]));
  check("K2 sign test: 8/8 positive tasks is significant, 4/8 is not",
    stats.signTest(Array(8).fill(0.2)).p < 0.02 && stats.signTest([0.2, 0.2, 0.2, 0.2, -0.2, -0.2, -0.2, -0.2]).p > 0.9);
  check("K2 bootstrap CI is deterministic for a seed", JSON.stringify(stats.bootstrapCI([0.1, 0.3, 0.2, 0.4])) === JSON.stringify(stats.bootstrapCI([0.1, 0.3, 0.2, 0.4])));
  check("K2 flip rule: a clear multi-module win with no isolated loss and no overhead FLIPS", stats.evaluate(win).verdict === "FLIP", stats.evaluate(win).note ?? "");
  check("K2 flip rule: no lift => STAY_OPT_IN", stats.evaluate(build(rep(8, [3, 3]), rep(4, [4, 4]), rep(4, [3, 3]))).verdict === "STAY_OPT_IN");
  check("K2 flip rule: >25% paired overhead blocks the flip", stats.evaluate(build(rep(8, [1, 5]), rep(4, [4, 4]), rep(4, [3, 3]), (r) => (r.arm === "B" ? { ...r, durationMs: 2000 } : r))).verdict === "STAY_OPT_IN");
  check("K2 flip rule: an isolated-task loss beyond the margin blocks the flip", stats.evaluate(build(rep(8, [1, 5]), rep(4, [5, 3]), rep(4, [3, 3]))).verdict === "STAY_OPT_IN");
  const nz = stats.evaluate(build([[1, 5], [1, 5], [4, 2], [4, 2], [2, 3], [3, 3], [3, 3], [3, 3]], rep(4, [4, 4]), rep(4, [3, 3])));
  check("K2 flip rule: positive mean but CI spanning zero does NOT flip", nz.itt.multi.mean > 0 && nz.itt.multi.lo <= 0 && nz.verdict === "STAY_OPT_IN", `mean=${nz.itt.multi.mean} lo=${nz.itt.multi.lo} verdict=${nz.verdict}`);
  const weak = stats.evaluate(build([[1, 2], [1, 2], [1, 2], [2, 2], [2, 2], [2, 2]], rep(6, [4, 4]), rep(4, [3, 3])));
  check("K2 flip rule: a bootstrap CI above zero is NOT enough without the sign test (3 of 6 tasks up)", weak.itt.multi.lo > 0 && weak.itt.multi.sign.p > 0.05 && weak.verdict === "STAY_OPT_IN", `lo=${weak.itt.multi.lo} p=${weak.itt.multi.sign.p} v=${weak.verdict}`);

  // INVALID: the experiment must never read as "the gate does not help" when it did not measure the gate
  check("K2 INVALID when the gate never fired on arm B (plugin not loaded)", stats.evaluate(build(rep(8, [1, 5]), rep(4, [4, 4]), rep(4, [3, 3]), (r) => ({ ...r, fired: false }))).verdict === "INVALID");
  check("K2 INVALID when traces are missing", stats.evaluate(build(rep(8, [1, 5]), rep(4, [4, 4]), rep(4, [3, 3]), (r) => ({ ...r, traced: false }))).verdict === "INVALID");
  check("K2 INVALID when >20% of runs are infrastructure failures (dead model server)", stats.evaluate(build(rep(8, [1, 5]), rep(4, [4, 4]), rep(4, [3, 3]), (r) => (r.run < 2 ? { ...r, infra: true, pass: false } : r))).verdict === "INVALID");
  check("K2 INVALID when arms C/D are missing", stats.evaluate(win.filter((r: any) => r.arm === "A" || r.arm === "B")).verdict === "INVALID");
  check("K2 INVALID when every run was gamed", stats.evaluate(win.map((r: any) => ({ ...r, gamed: true }))).verdict === "INVALID");
  check("K2 INSUFFICIENT with too few runs per cell (never a silent pass)", stats.evaluate(win.filter((r: any) => r.run < 3)).verdict === "INSUFFICIENT");
  check("K2 INSUFFICIENT with too few tasks", stats.evaluate(build(rep(6, [1, 5]), rep(4, [4, 4]), rep(4, [3, 3]))).verdict === "INSUFFICIENT");
  check("K2 gamed runs do not count toward a cell's minimum", stats.evaluate(win.map((r: any) => (r.task === "m0" && r.arm === "B" && r.run < 2 ? { ...r, gamed: true } : r))).verdict === "INSUFFICIENT");
  let dupThrew = false;
  try { stats.evaluate([...win, win[0]]); } catch { dupThrew = true; }
  check("K2 duplicate result rows are rejected (a re-run must resume, not append)", dupThrew);
  const gr = stats.taskRates([{ task: "t", kind: "k", arm: "A", pass: true, gamed: true }, { task: "t", kind: "k", arm: "A", pass: false, gamed: false }], "A").get("t");
  check("K2 a gamed run is excluded from the pass rate (not just counted)", gr.n === 1 && gr.rate === 0);
  const inf = stats.taskRates([{ task: "t", kind: "k", arm: "A", pass: false, infra: true }, { task: "t", kind: "k", arm: "A", pass: true }], "A").get("t");
  check("K2 an infrastructure failure is not scored as a task FAIL", inf.n === 1 && inf.rate === 1);
  const eo = stats.taskRates([{ task: "t", kind: "k", arm: "A", pass: false, edited: false }, { task: "t", kind: "k", arm: "A", pass: true, edited: true }], "A", { editedOnly: true }).get("t");
  check("K2 edited-only conditions every arm on 'attempted a write'", eo.n === 1 && eo.rate === 1);

  // ---- hardening helpers
  check("K2 stripExperts removes every inherited EXPERTS_* var", !Object.keys(run.stripExperts({ EXPERTS_GATEGUARD_NEUTRAL: "1", EXPERTS_X: "y", PATH: "/bin" })).some((k) => k.startsWith("EXPERTS_")) && run.stripExperts({ PATH: "/bin" }).PATH === "/bin");
  check("K2 scanTamper flags process.exit / node:assert / assert monkey-patching in agent code",
    run.scanTamper([{ path: "a", text: "process.exit(0)" }, { path: "b", text: "import a from 'node:assert'" }, { path: "c", text: "assert.equal = () => {}" }, { path: "d", text: "export const x = 1" }]).join() === "a,b,c");
  const tap = run.parseTap("TAP version 13\n# tests 3\n# pass 3\n# fail 0\n");
  check("K2 hiddenVerdict demands the declared number of tests all passing", run.hiddenVerdict(tap, 3) === true && run.hiddenVerdict(tap, 4) === false && run.hiddenVerdict({ tests: 3, pass: 2, fail: 1 }, 3) === false && run.hiddenVerdict({ tests: NaN, pass: NaN, fail: NaN }, 1) === false);
  check("K2 countDeclaredTests counts test()/it() declarations", run.countDeclaredTests('test("a", ()=>{});\n  it("b", ()=>{});\n// test(no)\n') === 2);
  check("K2 hidden markers cover the task dir, hidden test, solution overlay and task.json", ["/t/x", "hidden/test.mjs", "/solution", "task.json"].every((m) => run.hiddenMarkersFor("/t/x").includes(m)));

  // ---- runner end-to-end with the stub agent on a synthetic task (free)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edit-tasks-"));
  try {
    const td = path.join(tmp, "tasks", "s01");
    fs.mkdirSync(path.join(td, "repo/src"), { recursive: true });
    fs.mkdirSync(path.join(td, "solution/src"), { recursive: true });
    fs.mkdirSync(path.join(td, "hidden"), { recursive: true });
    fs.writeFileSync(path.join(td, "task.json"), JSON.stringify({ id: "s01", kind: "isolated", hazard: "none", prompt: "make x return 2" }));
    fs.writeFileSync(path.join(td, "repo/src/x.mjs"), "export const x = () => 1;\n");
    fs.writeFileSync(path.join(td, "solution/src/x.mjs"), "export const x = () => 2;\n");
    fs.writeFileSync(path.join(td, "hidden/test.mjs"),
      'import test from "node:test"; import assert from "node:assert"; import { pathToFileURL } from "node:url";\n' +
      'test("x", async () => { const m = await import(pathToFileURL(process.env.WORKDIR + "/src/x.mjs").href); assert.equal(m.x(), 2); });\n');
    const runner = path.join(root, "scripts/run-edit-tasks.mjs");
    const go = (mode: string, extra: string[] = []) => {
      const out = path.join(tmp, `res-${mode}.jsonl`);
      const r = spawnSync("node", [runner, "--tasks-dir", path.join(tmp, "tasks"), "--runs", "1", "--out", out, "--agent-cmd", `STUB_MODE=${mode} node ${path.join(root, "scripts/edit-task-stub.mjs")}`, ...extra], { encoding: "utf8", timeout: 60000 });
      return { r, rows: fs.existsSync(out) ? fs.readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [] };
    };
    const solve = go("solve");
    check("K2 runner: stub that applies the solution passes the hidden test in all 4 arms", solve.rows.length === 4 && solve.rows.every((r: any) => r.pass), solve.r.stderr.slice(0, 200));
    check("K2 runner: gated arms log a deny and factsGiven; ungated arms log none",
      solve.rows.filter((r: any) => r.arm === "B").every((r: any) => r.fired && r.factsGiven) && solve.rows.filter((r: any) => r.arm === "A").every((r: any) => !r.fired));
    const noop = go("noop");
    check("K2 runner: a stub that does nothing FAILS the hidden test (the test can fail)", noop.rows.length === 4 && noop.rows.every((r: any) => !r.pass));
    const peek = go("peek");
    check("K2 runner: peeking at hidden/ is recorded as gamed", peek.rows.every((r: any) => r.gamed));
    const again = go("solve");
    check("K2 runner resumes: re-running the same plan adds no duplicate rows", again.rows.length === 4, `rows=${again.rows.length}`);
    const infraOut = path.join(tmp, "res-infra.jsonl");
    spawnSync("node", [runner, "--tasks-dir", path.join(tmp, "tasks"), "--runs", "1", "--out", infraOut, "--agent-cmd", "exit 3"], { encoding: "utf8", timeout: 60000 });
    const infraRows = fs.readFileSync(infraOut, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    check("K2 runner: a non-zero agent exit is recorded as infra, not as a task failure", infraRows.every((r: any) => r.infra === true));
    const stale = fs.mkdtempSync(path.join(tmp, "oc-"));
    fs.mkdirSync(path.join(stale, "plugins"), { recursive: true });
    fs.writeFileSync(path.join(stale, "plugins", "expert-hooks.ts"), "// stale install\n");
    const pre = spawnSync("node", [runner, "--tasks-dir", path.join(tmp, "tasks"), "--runs", "1", "--yes", "--out", path.join(tmp, "pre.jsonl")], { encoding: "utf8", env: { ...process.env, EVAL_MODEL: "x/y", OPENCODE_CONFIG_DIR: stale } });
    check("K2 runner preflight: a stale installed plugin aborts real runs (exit 3, no rows)", pre.status === 3 && /PREFLIGHT FAILED/.test(pre.stderr) && !fs.existsSync(path.join(tmp, "pre.jsonl")));
    const refuse = spawnSync("node", [runner, "--tasks-dir", path.join(tmp, "tasks"), "--runs", "1"], { encoding: "utf8", env: { ...process.env, EVAL_MODEL: "x/y" } });
    check("K2 runner: refuses to spend model budget without --yes", refuse.status === 2 && /refusing to spend/.test(refuse.stderr));
    const dry = spawnSync("node", [runner, "--tasks-dir", path.join(tmp, "tasks"), "--runs", "2", "--dry-run"], { encoding: "utf8" });
    check("K2 runner: --dry-run plans without running", dry.status === 0 && /1 tasks x 4 arms x 2 runs = 8/.test(dry.stdout));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ---- every shipped task: RED as shipped, GREEN with its solution, prompt never leaks the hazard
  const tasksDir = path.join(root, "evals/edit-tasks");
  const ids = fs.readdirSync(tasksDir, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(tasksDir, d.name, "task.json"))).map((d) => d.name).sort();
  check("K2 task set meets the pre-registered minimum (>=16 tasks, >=6 multi-module, >=4 isolated, >=4 reuse)",
    (() => { const ks = ids.map((i) => JSON.parse(fs.readFileSync(path.join(tasksDir, i, "task.json"), "utf8")).kind); return ids.length >= 16 && ks.filter((k) => k === "multi-module").length >= 6 && ks.filter((k) => k === "isolated").length >= 4 && ks.filter((k) => k === "reuse-trap").length >= 4; })(),
    `have ${ids.length}: ${ids.join(",")}`);
  for (const id of ids) {
    const td = path.join(tasksDir, id);
    const red = spawnSync("node", ["--test", path.join(td, "hidden/test.mjs")], { env: { ...process.env, WORKDIR: path.join(td, "repo") }, encoding: "utf8", timeout: 60000 });
    const work = fs.mkdtempSync(path.join(os.tmpdir(), `sol-${id}-`));
    try {
      fs.cpSync(path.join(td, "repo"), work, { recursive: true });
      fs.cpSync(path.join(td, "solution"), work, { recursive: true });
      const green = spawnSync("node", ["--test", path.join(td, "hidden/test.mjs")], { env: { ...process.env, WORKDIR: work }, encoding: "utf8", timeout: 60000 });
      check(`K2 task ${id}: hidden test FAILS as shipped and PASSES with its solution`, red.status !== 0 && green.status === 0, `red=${red.status} green=${green.status}`);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
    const jsFiles = ["repo", "solution"].flatMap((d) => (fs.existsSync(path.join(td, d)) ? (fs.readdirSync(path.join(td, d), { recursive: true }) as string[]).map((f) => path.join(td, d, String(f))) : []))
      .filter((f) => /\.(m?js|cjs|ts)$/.test(f) && fs.statSync(f).isFile()).map((f) => ({ path: f, text: fs.readFileSync(f, "utf8") }));
    check(`K2 task ${id}: shipped repo/ and solution/ code is clean under the tamper scan`, run.scanTamper(jsFiles).length === 0, run.scanTamper(jsFiles).join(","));
    const t = JSON.parse(fs.readFileSync(path.join(td, "task.json"), "utf8"));
    // A prompt may name the thing it changes, but must not hint at the hazard: no callers/importers/helpers/data-file talk.
    const hint = String(t.prompt).match(/\b(callers?|importers?|imports?|depends? on|other (files?|modules?)|re-?exports?|barrel|data file|schema|existing (helper|function|util\w*)|already (has|have|exists?)|reuse|check (the )?(other|all))\b/i);
    check(`K2 task ${id}: prompt does not hint at the hazard`, !hint, `hint: ${hint?.[0]}`);
    check(`K2 task ${id}: no test files in the agent-visible repo/`, !fs.readdirSync(path.join(td, "repo"), { recursive: true }).some((f) => /\.test\.|(^|\/)tests?\//.test(String(f))));
  }
}
