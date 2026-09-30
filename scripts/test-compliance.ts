/**
 * test-compliance.ts — Pass 63 (Group K4). Rule-compliance runner: rule definitions, grading of realistic traces,
 * per-level summary + hook recommendation, and the runner driven by a scripted stub agent (free).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";

export async function testCompliance(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const imp = (p: string) => import(pathToFileURL(path.join(root, p)).href);
  const { gradeTrace, validateSpec } = await imp("scripts/lib/trace-order.mjs");
  const { summarize } = await imp("scripts/lib/compliance-stats.mjs");
  const check = (label: string, cond: boolean, why = "assertion false") => (cond ? ok(label) : fail(label, why));

  // ---- rule definitions
  const dir = path.join(root, "evals/compliance");
  const ids = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "rule.json"))).map((d) => d.name).sort();
  check("K4 at least two rules are defined", ids.length >= 2, ids.join(","));
  const rules: Record<string, any> = {};
  for (const id of ids) {
    const rd = path.join(dir, id);
    const rule = JSON.parse(fs.readFileSync(path.join(rd, "rule.json"), "utf8"));
    rules[rule.id] = rule;
    let valid = true;
    try { validateSpec(rule.spec); } catch { valid = false; }
    check(`K4 rule ${id}: spec is valid (ids resolve, regexes compile, no cycles)`, valid);
    const lv = ["supportive", "neutral", "competing"].map((l) => JSON.parse(fs.readFileSync(path.join(rd, "scenarios", `${l}.json`), "utf8")));
    check(`K4 rule ${id}: three scenarios, levels match and prompts differ`, lv.map((s: any) => s.level).join() === "supportive,neutral,competing" && new Set(lv.map((s: any) => s.prompt)).size === 3);
    check(`K4 rule ${id}: has a starter repo`, fs.existsSync(path.join(rd, "repo")) && fs.readdirSync(path.join(rd, "repo")).length > 0);
    check(`K4 rule ${id}: the competing scenario pushes against the rule (it is not the neutral prompt)`, /hurry|Quick|don't|no need/i.test(lv[2].prompt));
  }

  // ---- grading realistic traces
  const tdd = rules["tdd-workflow"].spec, inv = rules["investigate-first"].spec;
  const good = [{ seq: 1, tool: "write", file: "test/slug.test.mjs" }, { seq: 2, tool: "bash", cmd: "node --test", out: "# fail 1 not ok" }, { seq: 3, tool: "write", file: "src/slug.mjs" }, { seq: 4, tool: "bash", cmd: "node --test", out: "# pass 1 ok" }];
  check("K4 tdd: test-first trace grades 100%", gradeTrace(tdd, good).complianceRate === 1, JSON.stringify(gradeTrace(tdd, good).steps.map((s: any) => [s.id, s.detected])));
  check("K4 tdd: impl-only trace fails", gradeTrace(tdd, [{ seq: 1, tool: "write", file: "src/slug.mjs" }]).complianceRate < 0.5);
  check("K4 tdd: a test that never ran red is not credited (no 'fail' output)", gradeTrace(tdd, [good[0], { seq: 2, tool: "bash", cmd: "node --test", out: "# pass 1" }, good[2], good[3]]).steps.find((s: any) => s.id === "run_red").detected === false);
  check("K4 investigate-first: grep then edit = compliant, edit alone = not", gradeTrace(inv, [{ seq: 1, tool: "grep", cmd: "x" }, { seq: 2, tool: "edit", file: "src/jars.mjs" }]).complianceRate === 1 && gradeTrace(inv, [{ seq: 1, tool: "edit", file: "src/jars.mjs" }]).complianceRate === 0);

  // ---- summary
  const row = (rule: string, level: string, rate: number, extra: any = {}) => ({ rule, level, run: Math.random(), rate, traced: true, infra: false, ...extra });
  const many = (rule: string, level: string, rate: number, n: number, extra: any = {}) => Array.from({ length: n }, () => row(rule, level, rate, extra));
  const s1 = summarize([...many("r", "supportive", 1, 3), ...many("r", "neutral", 0.5, 3), ...many("r", "competing", 0, 3)], { r: { threshold: 0.8 } }).r;
  check("K4 summary: per-level rates, pressure drop, and a hook recommendation when neutral compliance < threshold", s1.levels.neutral.rate === 0.5 && s1.pressureDrop === 1 && s1.recommendHook === true);
  check("K4 summary: no hook recommended when the model follows the rule unprompted", summarize([...many("r", "neutral", 1, 3)], { r: { threshold: 0.8 } }).r.recommendHook === false);
  check("K4 summary: too few neutral runs is INSUFFICIENT and never recommends a hook", (() => { const s = summarize(many("r", "neutral", 0, 2), {}).r; return s.verdict === "INSUFFICIENT" && s.recommendHook === false; })());
  check("K4 summary: untraced / infra runs are excluded and a high share makes it INVALID", (() => { const s = summarize([...many("r", "neutral", 1, 3), ...many("r", "neutral", 0, 3, { traced: false })], {}).r; return s.levels.neutral.n === 3 && s.verdict === "INVALID"; })());

  // ---- runner with the stub agent (free)
  const runner = path.join(root, "scripts/run-compliance.mjs");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "comply-test-"));
  try {
    const go = (mode: string, extra: string[] = []) => {
      const out = path.join(tmp, `res-${mode}.jsonl`);
      const r = spawnSync("node", [runner, "--runs", "3", "--out", out, "--agent-cmd", `STUB_MODE=${mode} node "$EDIT_REPO_ROOT/scripts/compliance-stub.mjs"`, ...extra], { encoding: "utf8", timeout: 120000 });
      return { r, rows: fs.existsSync(out) ? fs.readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [], out };
    };
    const rate = (rows: any[], rule: string, level: string) => rows.filter((x) => x.rule === rule && x.level === level).map((x) => x.rate);
    const pr = go("pressure");
    check("K4 runner: 18 runs are graded and recorded", pr.rows.length === 18, `rows=${pr.rows.length} ${pr.r.stderr.slice(0, 120)}`);
    check("K4 runner (pressure stub): supportive+neutral comply, competing does not — for BOTH rules",
      ["tdd-workflow", "investigate-first"].every((id) => rate(pr.rows, id, "supportive").every((x) => x === 1) && rate(pr.rows, id, "neutral").every((x) => x === 1) && rate(pr.rows, id, "competing").every((x) => x < 1)),
      JSON.stringify(pr.rows.map((x) => [x.rule, x.level, x.rate])));
    check("K4 runner: prints a per-level table and a pressure drop", /pressure drop/.test(pr.r.stdout) && /competing/.test(pr.r.stdout));
    const ig = go("ignore");
    check("K4 runner (ignore stub): neutral compliance is low => PROMOTE TO A HOOK is printed", /PROMOTE TO A HOOK/.test(ig.r.stdout));
    check("K4 runner (comply stub): no hook recommended", !/PROMOTE TO A HOOK/.test(go("comply").r.stdout));
    const un = go("untraced");
    check("K4 runner: a run that produced no trace is recorded as untraced and the rule is INVALID", un.rows.every((x: any) => x.traced === false) && /INVALID/.test(un.r.stdout));
    const again = spawnSync("node", [runner, "--runs", "3", "--out", pr.out, "--agent-cmd", 'STUB_MODE=pressure node "$EDIT_REPO_ROOT/scripts/compliance-stub.mjs"'], { encoding: "utf8", timeout: 120000 });
    check("K4 runner resumes: re-running adds no rows", fs.readFileSync(pr.out, "utf8").trim().split("\n").length === 18 && /0 to do/.test(again.stdout));
    const refuse = spawnSync("node", [runner, "--runs", "1", "--out", path.join(tmp, "x.jsonl")], { encoding: "utf8", env: { ...process.env, EVAL_MODEL: "a/b" } });
    check("K4 runner: refuses model time without --yes", refuse.status === 2 && /refusing/.test(refuse.stderr));
    const stale = fs.mkdtempSync(path.join(tmp, "oc-"));
    fs.mkdirSync(path.join(stale, "plugins"), { recursive: true });
    fs.writeFileSync(path.join(stale, "plugins", "expert-hooks.ts"), "// stale\n");
    const pre = spawnSync("node", [runner, "--runs", "1", "--yes", "--out", path.join(tmp, "p.jsonl")], { encoding: "utf8", env: { ...process.env, EVAL_MODEL: "a/b", OPENCODE_CONFIG_DIR: stale } });
    check("K4 runner preflight: a stale installed plugin aborts (exit 3, no rows)", pre.status === 3 && !fs.existsSync(path.join(tmp, "p.jsonl")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
