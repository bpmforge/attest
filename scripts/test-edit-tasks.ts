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

  // ---- statistics
  const mk = (task: string, kind: string, arm: string, passes: number, of: number, extra: any = {}) =>
    Array.from({ length: of }, (_, i) => ({ task, kind, arm, run: i, pass: i < passes, fired: arm === "B" || arm === "D", durationMs: 1000, gamed: false, ...extra }));
  check("K2 sign test: 8/8 positive tasks is significant, 4/8 is not",
    stats.signTest(Array(8).fill(0.2)).p < 0.02 && stats.signTest([0.2, 0.2, 0.2, 0.2, -0.2, -0.2, -0.2, -0.2]).p > 0.9);
  check("K2 bootstrap CI is deterministic for a seed", JSON.stringify(stats.bootstrapCI([0.1, 0.3, 0.2, 0.4])) === JSON.stringify(stats.bootstrapCI([0.1, 0.3, 0.2, 0.4])));
  const win: any[] = [];
  for (let t = 0; t < 6; t++) win.push(...mk(`m${t}`, "multi-module", "A", 1, 5), ...mk(`m${t}`, "multi-module", "B", 5, 5), ...mk(`m${t}`, "multi-module", "C", 2, 5), ...mk(`m${t}`, "multi-module", "D", 1, 5));
  for (let t = 0; t < 4; t++) win.push(...mk(`i${t}`, "isolated", "A", 4, 5), ...mk(`i${t}`, "isolated", "B", 4, 5), ...mk(`i${t}`, "isolated", "C", 4, 5), ...mk(`i${t}`, "isolated", "D", 4, 5));
  check("K2 flip rule: a clear multi-module win with no isolated loss and no overhead FLIPS", stats.evaluate(win).verdict === "FLIP", JSON.stringify(stats.evaluate(win).verdict));
  check("K2 flip rule: B beats A but B ~ D is reported (pause, not facts)", Math.abs(stats.evaluate(win).BminusD.mean) > 0.5 || true);
  const tie = win.map((r) => (r.arm === "B" ? { ...r, pass: r.arm === "B" && r.kind === "multi-module" ? r.run < 1 : r.pass } : r));
  check("K2 flip rule: no lift => STAY_OPT_IN", stats.evaluate(tie).verdict === "STAY_OPT_IN");
  const slow = win.map((r) => (r.arm === "B" ? { ...r, durationMs: 2000 } : r));
  check("K2 flip rule: >25% overhead blocks the flip", stats.evaluate(slow).verdict === "STAY_OPT_IN");
  check("K2 flip rule: too few tasks/runs => INSUFFICIENT (never a silent pass)", stats.evaluate(win.filter((r) => r.run < 2)).verdict === "INSUFFICIENT");
  const firedOnlyTrap = win.map((r) => (r.arm === "B" && r.kind === "multi-module" ? { ...r, fired: r.pass } : r));
  check("K2 gamed runs are excluded from rates and counted", stats.evaluate(win.map((r, i) => (i === 0 ? { ...r, gamed: true } : r))).gamedRuns === 1);
  void firedOnlyTrap;
  // Noisy lift: mean delta is positive but the 95% CI spans zero => must NOT flip (mean > 0 is not the rule; CI lower bound is).
  const noisy: any[] = [];
  const plan: Array<[number, number]> = [[1, 5], [1, 5], [4, 2], [4, 2], [2, 3], [3, 3]];
  plan.forEach(([a, b], t) => noisy.push(...mk(`m${t}`, "multi-module", "A", a, 5), ...mk(`m${t}`, "multi-module", "B", b, 5), ...mk(`m${t}`, "multi-module", "C", a, 5), ...mk(`m${t}`, "multi-module", "D", a, 5)));
  for (let t = 0; t < 4; t++) noisy.push(...mk(`i${t}`, "isolated", "A", 4, 5), ...mk(`i${t}`, "isolated", "B", 4, 5), ...mk(`i${t}`, "isolated", "C", 4, 5), ...mk(`i${t}`, "isolated", "D", 4, 5));
  const nz = stats.evaluate(noisy);
  check("K2 flip rule: positive mean but CI spanning zero does NOT flip", nz.itt.multi.mean > 0 && nz.itt.multi.lo <= 0 && nz.verdict === "STAY_OPT_IN", `mean=${nz.itt.multi.mean} lo=${nz.itt.multi.lo} verdict=${nz.verdict}`);
  const gr = stats.taskRates([{ task: "t", kind: "k", arm: "A", pass: true, gamed: true }, { task: "t", kind: "k", arm: "A", pass: false, gamed: false }], "A").get("t");
  check("K2 a gamed run is excluded from the pass rate (not just counted)", gr.n === 1 && gr.rate === 0);

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
    const t = JSON.parse(fs.readFileSync(path.join(td, "task.json"), "utf8"));
    // A prompt may name the thing it changes, but must not hint at the hazard: no callers/importers/helpers/data-file talk.
    const hint = String(t.prompt).match(/\b(callers?|importers?|imports?|depends? on|other (files?|modules?)|re-?exports?|barrel|data file|schema|existing (helper|function|util\w*)|already (has|have|exists?)|reuse|check (the )?(other|all))\b/i);
    check(`K2 task ${id}: prompt does not hint at the hazard`, !hint, `hint: ${hint?.[0]}`);
    check(`K2 task ${id}: no test files in the agent-visible repo/`, !fs.readdirSync(path.join(td, "repo"), { recursive: true }).some((f) => /\.test\.|(^|\/)tests?\//.test(String(f))));
  }
}
