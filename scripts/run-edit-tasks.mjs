#!/usr/bin/env node
/**
 * run-edit-tasks.mjs — gateguard A/B runner (Group K2). See evals/edit-tasks/README.md and
 * docs/work/GROUP_K_DESIGN.md. Each (task × arm × run) copies the task repo to a temp workdir, runs the agent
 * command there with the arm's env, then runs the HIDDEN test (outside the workdir) and scores the run.
 *
 *   node scripts/run-edit-tasks.mjs --dry-run
 *   EVAL_MODEL=provider/model node scripts/run-edit-tasks.mjs --yes --runs 5        # REAL runs: spends model budget
 *   node scripts/run-edit-tasks.mjs --agent-cmd 'node scripts/edit-task-stub.mjs'   # scripted stub: free, proves the pipeline
 *
 * Agent command sees env: EDIT_WORKDIR EDIT_PROMPT EDIT_MODEL EDIT_TASKDIR (+ the arm's EXPERTS_* flags).
 * A run is spent only with --yes (or a custom --agent-cmd): the default agent is a paid model.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ARMS, armEnv, promptFor, scoreRun, shuffled } from "./lib/edit-task-run.mjs";

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

const plan = shuffled(tasks.flatMap((t) => arms.flatMap((arm) => Array.from({ length: runs }, (_, run) => ({ t, arm, run })))), seed);
console.log(`${tasks.length} tasks x ${arms.length} arms x ${runs} runs = ${plan.length} agent runs (${customCmd ? "custom agent-cmd" : "PAID model: " + (process.env.EVAL_MODEL ?? "EVAL_MODEL unset")})`);
if (flag("dry-run")) { for (const p of plan.slice(0, 12)) console.log(`  ${p.t.id} arm=${p.arm} run=${p.run}`); process.exit(0); }
if (!customCmd && !flag("yes")) { console.error("refusing to spend model budget without --yes (or use --agent-cmd for a stub)"); process.exit(2); }
if (!customCmd && !process.env.EVAL_MODEL) { console.error("EVAL_MODEL is required for real runs"); process.exit(2); }

mkdirSync(join(outFile, ".."), { recursive: true });
const logDir = outFile.replace(/\.jsonl$/, "") + "-logs";
mkdirSync(logDir, { recursive: true });
const readJsonl = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

for (const { t, arm, run } of plan) {
  const workdir = mkdtempSync(join(tmpdir(), `edit-${t.id}-`));
  cpSync(join(t.dir, "repo"), workdir, { recursive: true });
  const tag = `${t.id}-${arm}-${run}`;
  const gateLog = join(logDir, `${tag}.gate.jsonl`), traceLog = join(logDir, `${tag}.trace.jsonl`);
  for (const f of [gateLog, traceLog]) rmSync(f, { force: true });
  const env = { ...process.env, ...armEnv(arm, { workdir, gateLog, traceLog }), EDIT_WORKDIR: workdir, EDIT_TASKDIR: t.dir, EDIT_PROMPT: promptFor(t, arm), EDIT_MODEL: process.env.EVAL_MODEL ?? "" };
  if (!["B", "D"].includes(arm)) { delete env.EXPERTS_GATEGUARD; delete env.EXPERTS_GATEGUARD_LOG; delete env.EXPERTS_GATEGUARD_NEUTRAL; }
  const t0 = Date.now();
  const agent = spawnSync("sh", ["-c", agentCmd], { env, cwd: workdir, timeout, encoding: "utf8" });
  const durationMs = Date.now() - t0;
  const hidden = spawnSync("node", ["--test", join(t.dir, "hidden", "test.mjs")], { env: { ...process.env, WORKDIR: workdir }, encoding: "utf8", timeout: 60000 });
  const score = scoreRun({ arm, gateRows: readJsonl(gateLog), traceRows: readJsonl(traceLog), hiddenMarkers: [join(t.dir, "hidden"), "hidden/test.mjs"] });
  const row = { task: t.id, kind: t.kind, arm, run, pass: hidden.status === 0, durationMs, agentExit: agent.status, timedOut: agent.error?.code === "ETIMEDOUT", ...score };
  appendFileSync(outFile, JSON.stringify(row) + "\n");
  console.log(`${row.pass ? "PASS" : "FAIL"} ${tag} denies=${row.denies} gamed=${row.gamed} ${durationMs}ms`);
  if (!flag("keep")) rmSync(workdir, { recursive: true, force: true });
}
console.log(`results: ${outFile}\nanalyze: node scripts/analyze-edit-tasks.mjs ${outFile}`);
