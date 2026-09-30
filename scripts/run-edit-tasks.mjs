#!/usr/bin/env node
/**
 * run-edit-tasks.mjs — gateguard A/B runner (Group K2). See evals/edit-tasks/README.md and
 * docs/work/GROUP_K_DESIGN.md. Each (task × arm × run) copies the task repo to a temp workdir, runs the agent
 * command there with the arm's env, then runs the HIDDEN test (outside the workdir) and scores the run.
 *
 *   node scripts/run-edit-tasks.mjs --dry-run
 *   EVAL_MODEL=provider/model node scripts/run-edit-tasks.mjs --yes --runs 5        # REAL runs: spends model budget
 *   node scripts/run-edit-tasks.mjs --agent-cmd 'node "$EDIT_REPO_ROOT/scripts/edit-task-stub.mjs"'   # scripted stub: free
 *
 * Agent command sees env: EDIT_WORKDIR EDIT_PROMPT EDIT_MODEL EDIT_REPO_ROOT (+ the arm's EXPERTS_* flags; EDIT_TASKDIR only
 * for a custom --agent-cmd, never for a real model: the task dir holds the answer key).
 * A run is spent only with --yes (or a custom --agent-cmd): the default agent is a paid model.
 * Results resume: a (task, arm, run) already in --out is skipped, never duplicated.
 * Real runs need the INSTALLED opencode plugin to match plugins/expert-hooks.ts (preflight) — re-run install.sh first.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, appendFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ARMS, armEnv, countDeclaredTests, hiddenMarkersFor, hiddenVerdict, parseTap, promptFor, scanTamper, scoreRun, shuffled, stripExperts } from "./lib/edit-task-run.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const flag = (n) => args.includes(`--${n}`);
const HERE = resolve(new URL(".", import.meta.url).pathname, "..");
const tasksDir = resolve(opt("tasks-dir", join(HERE, "evals", "edit-tasks")));
const outFile = resolve(opt("out", join(HERE, "docs", "work", "edit-task-results.jsonl")));
const arms = opt("arms", ARMS.join(",")).split(",");
const runs = Number(opt("runs", 5));
const seed = opt("seed", "k2");
const timeout = Number(opt("timeout", 900000));
const customCmd = opt("agent-cmd", null);
const agentCmd = customCmd ?? 'opencode run --dir "$EDIT_WORKDIR" -m "$EDIT_MODEL" "$EDIT_PROMPT"';

const only = opt("task", null);
const tasks = readdirSync(tasksDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(tasksDir, d.name, "task.json")) && (!only || d.name === only))
  .map((d) => ({ dir: join(tasksDir, d.name), ...JSON.parse(readFileSync(join(tasksDir, d.name, "task.json"), "utf8")) }));

const readJsonl = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const done = new Set(readJsonl(outFile).map((r) => `${r.task}|${r.arm}|${r.run}`));
const all = shuffled(tasks.flatMap((t) => arms.flatMap((arm) => Array.from({ length: runs }, (_, run) => ({ t, arm, run })))), seed);
const plan = all.filter(({ t, arm, run }) => !done.has(`${t.id}|${arm}|${run}`));
console.log(`${tasks.length} tasks x ${arms.length} arms x ${runs} runs = ${all.length} agent runs, ${plan.length} to do (${all.length - plan.length} already in ${outFile}) — ${customCmd ? "custom agent-cmd" : "PAID model: " + (process.env.EVAL_MODEL ?? "EVAL_MODEL unset")}`);
if (flag("dry-run")) { for (const p of plan.slice(0, 12)) console.log(`  ${p.t.id} arm=${p.arm} run=${p.run}`); process.exit(0); }
if (!customCmd && !flag("yes")) { console.error("refusing to spend model budget without --yes (or use --agent-cmd for a stub)"); process.exit(2); }
if (!customCmd && !process.env.EVAL_MODEL) { console.error("EVAL_MODEL is required for real runs"); process.exit(2); }

// Preflight (real runs): the plugin opencode LOADS is the installed one, not this checkout. A stale install means the gate
// never fires and arm B silently becomes arm A — the exact mistake this experiment cannot afford.
if (!customCmd && !flag("skip-preflight")) {
  const cfg = process.env.OPENCODE_CONFIG_DIR ?? join(homedir(), ".config", "opencode");
  const installed = join(cfg, "plugins", "expert-hooks.ts");
  const repoCopy = readFileSync(join(HERE, "plugins", "expert-hooks.ts"), "utf8");
  if (!existsSync(installed) || readFileSync(installed, "utf8") !== repoCopy || !existsSync(join(cfg, "scripts", "lib", "hook-guards.mjs")) || !existsSync(join(cfg, "scripts", "lib", "trace-order.mjs"))) {
    console.error(`PREFLIGHT FAILED: the opencode plugin installed at ${installed} differs from plugins/expert-hooks.ts (or its scripts/lib deps are missing).\nRe-run install.sh, then retry. (--skip-preflight overrides; the analysis will report INVALID if the gate never fires.)`);
    process.exit(3);
  }
}

mkdirSync(join(outFile, ".."), { recursive: true });
const logDir = outFile.replace(/\.jsonl$/, "") + "-logs";
mkdirSync(logDir, { recursive: true });
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

for (const { t, arm, run } of plan) {
  const workdir = mkdtempSync(join(tmpdir(), "edit-"));
  cpSync(join(t.dir, "repo"), workdir, { recursive: true });
  // Opaque log names: the agent's env must not reveal the arm or the task.
  const opaque = createHash("sha256").update(`${seed}|${t.id}|${arm}|${run}`).digest("hex").slice(0, 12);
  const gateLog = join(logDir, `${opaque}.gate.jsonl`), traceLog = join(logDir, `${opaque}.trace.jsonl`);
  for (const f of [gateLog, traceLog]) rmSync(f, { force: true });
  const env = { ...stripExperts(process.env), ...armEnv(arm, { workdir, gateLog, traceLog }), EDIT_WORKDIR: workdir, EDIT_REPO_ROOT: HERE, EDIT_PROMPT: promptFor(t, arm), EDIT_MODEL: process.env.EVAL_MODEL ?? "" };
  if (customCmd) env.EDIT_TASKDIR = t.dir;
  const t0 = Date.now();
  const agent = spawnSync("sh", ["-c", agentCmd], { env, cwd: workdir, timeout, encoding: "utf8" });
  const durationMs = Date.now() - t0;
  const timedOut = agent.error?.code === "ETIMEDOUT";
  const infra = timedOut || agent.status !== 0; // a dead model server must never read as "the agent failed the task"

  // Hidden test: TAP so we can require the declared number of tests to have run and passed (process.exit(0) in agent code otherwise fakes green).
  const hiddenFile = join(t.dir, "hidden", "test.mjs");
  const expected = countDeclaredTests(readFileSync(hiddenFile, "utf8"));
  const hidden = spawnSync("node", ["--test", "--test-reporter=tap", hiddenFile], { env: { ...process.env, WORKDIR: workdir }, encoding: "utf8", timeout: 60000 });
  const passed = hidden.status === 0 && hiddenVerdict(parseTap(hidden.stdout), expected);
  const tamper = scanTamper(walk(workdir).filter((f) => /\.(m?js|cjs|ts)$/.test(f) && statSync(f).size < 2e5).map((f) => ({ path: f.slice(workdir.length), text: readFileSync(f, "utf8") })));

  const score = scoreRun({ arm, gateRows: readJsonl(gateLog), traceRows: readJsonl(traceLog), hiddenMarkers: hiddenMarkersFor(t.dir) });
  if (tamper.length) score.gamed = true;
  const row = { task: t.id, kind: t.kind, arm, run, pass: passed && !score.gamed, durationMs, agentExit: agent.status, timedOut, infra, tamper, ...score };
  appendFileSync(outFile, JSON.stringify(row) + "\n");
  console.log(`${row.pass ? "PASS" : "FAIL"} ${t.id}/${arm}/${run} denies=${row.denies} gamed=${row.gamed} infra=${infra} ${durationMs}ms`);
  if (!flag("keep")) rmSync(workdir, { recursive: true, force: true });
}
console.log(`results: ${outFile}\nanalyze: node scripts/analyze-edit-tasks.mjs ${outFile}`);
