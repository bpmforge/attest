#!/usr/bin/env node
/**
 * run-compliance.mjs — does the model follow a rule, and does it survive pressure? (Group K4; adapted from ECC skill-comply, MIT)
 * See evals/compliance/README.md. Per (rule × level × run): copy the rule's starter repo, run the agent with trace capture
 * on, grade the trace against the rule's predicate spec (scripts/lib/trace-order.mjs), then summarise per level.
 *
 *   node scripts/run-compliance.mjs --dry-run
 *   EVAL_MODEL=provider/model node scripts/run-compliance.mjs --yes --runs 5       # REAL runs (paid model / local box time)
 *   node scripts/run-compliance.mjs --agent-cmd 'STUB_MODE=pressure node "$EDIT_REPO_ROOT/scripts/compliance-stub.mjs"'   # free
 * Results resume (a (rule,level,run) already in --out is skipped). Real runs need the INSTALLED plugin to match the repo.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gradeTrace, loadTrace } from "./lib/trace-order.mjs";
import { installedPluginProblem, shuffled, stripExperts } from "./lib/edit-task-run.mjs";
import { LEVELS, summarize } from "./lib/compliance-stats.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const flag = (n) => args.includes(`--${n}`);
const HERE = resolve(new URL(".", import.meta.url).pathname, "..");
const rulesDir = resolve(opt("rules-dir", join(HERE, "evals", "compliance")));
const outFile = resolve(opt("out", join(HERE, "docs", "work", "compliance-results.jsonl")));
const runs = Number(opt("runs", 3));
const seed = opt("seed", "k4");
const timeout = Number(opt("timeout", 600000));
const levels = opt("levels", LEVELS.join(",")).split(",");
const only = opt("rule", null);
const customCmd = opt("agent-cmd", null);

const rules = readdirSync(rulesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(rulesDir, d.name, "rule.json")) && (!only || d.name === only))
  .map((d) => { const dir = join(rulesDir, d.name); return { dir, ...JSON.parse(readFileSync(join(dir, "rule.json"), "utf8")) }; });
const scenario = (rule, level) => JSON.parse(readFileSync(join(rule.dir, "scenarios", `${level}.json`), "utf8"));
const agentFor = (rule) => customCmd ?? `opencode run --dir "$EDIT_WORKDIR" -m "$EDIT_MODEL" ${rule.agent ? `--agent ${rule.agent} ` : ""}"$EDIT_PROMPT"`;

const readJsonl = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const done = new Set(readJsonl(outFile).map((r) => `${r.rule}|${r.level}|${r.run}`));
const all = shuffled(rules.flatMap((r) => levels.flatMap((level) => Array.from({ length: runs }, (_, run) => ({ r, level, run })))), seed);
const plan = all.filter(({ r, level, run }) => !done.has(`${r.id}|${level}|${run}`));
console.log(`${rules.length} rules x ${levels.length} levels x ${runs} runs = ${all.length} agent runs, ${plan.length} to do — ${customCmd ? "custom agent-cmd" : "model: " + (process.env.EVAL_MODEL ?? "EVAL_MODEL unset")}`);
if (flag("dry-run")) { for (const p of plan.slice(0, 12)) console.log(`  ${p.r.id} level=${p.level} run=${p.run}`); process.exit(0); }
if (!customCmd && !flag("yes")) { console.error("refusing to spend model time without --yes (or use --agent-cmd for a stub)"); process.exit(2); }
if (!customCmd && !process.env.EVAL_MODEL) { console.error("EVAL_MODEL is required for real runs"); process.exit(2); }
if (!customCmd && !flag("skip-preflight")) {
  const problem = installedPluginProblem(HERE);
  if (problem) { console.error(`PREFLIGHT FAILED: ${problem}.\nRe-run install.sh, then retry.`); process.exit(3); }
}

mkdirSync(join(outFile, ".."), { recursive: true });
const logDir = outFile.replace(/\.jsonl$/, "") + "-logs";
mkdirSync(logDir, { recursive: true });

for (const { r, level, run } of plan) {
  const workdir = mkdtempSync(join(tmpdir(), "comply-"));
  cpSync(join(r.dir, "repo"), workdir, { recursive: true });
  const opaque = createHash("sha256").update(`${seed}|${r.id}|${level}|${run}`).digest("hex").slice(0, 12);
  const traceLog = join(logDir, `${opaque}.trace.jsonl`);
  rmSync(traceLog, { force: true });
  const env = { ...stripExperts(process.env), EXPERTS_TRACE_LOG: traceLog, EDIT_WORKDIR: workdir, EDIT_REPO_ROOT: HERE, EDIT_PROMPT: scenario(r, level).prompt, EDIT_MODEL: process.env.EVAL_MODEL ?? "" };
  const t0 = Date.now();
  const agent = spawnSync("sh", ["-c", agentFor(r)], { env, cwd: workdir, timeout, encoding: "utf8" });
  const durationMs = Date.now() - t0;
  const infra = agent.error?.code === "ETIMEDOUT" || agent.status !== 0;
  const trace = existsSync(traceLog) ? loadTrace(readFileSync(traceLog, "utf8")) : [];
  const g = trace.length ? gradeTrace(r.spec, trace) : null;
  const row = { rule: r.id, level, run, rate: g?.complianceRate ?? 0, steps: g?.steps.map((s) => ({ id: s.id, detected: s.detected, reason: s.reason })) ?? [], infra, traced: trace.length > 0, tools: [...new Set(trace.map((t) => t.tool))].sort(), durationMs };
  appendFileSync(outFile, JSON.stringify(row) + "\n");
  console.log(`${r.id}/${level}/${run} compliance=${row.rate.toFixed(2)} traced=${row.traced} infra=${infra} ${durationMs}ms`);
  rmSync(workdir, { recursive: true, force: true });
}

const ruleIndex = Object.fromEntries(rules.map((r) => [r.id, r]));
const s = summarize(readJsonl(outFile), ruleIndex);
const f = (x) => (Number.isFinite(x) ? x.toFixed(2) : "n/a");
console.log("\nrule              level        n  compliance  fully-compliant");
for (const [id, v] of Object.entries(s)) {
  for (const lv of LEVELS) console.log(`${id.padEnd(17)} ${lv.padEnd(11)} ${String(v.levels[lv].n).padStart(2)}  ${f(v.levels[lv].rate).padStart(10)}  ${v.levels[lv].fullyCompliant}/${v.levels[lv].n}`);
  console.log(`  -> ${v.verdict}; pressure drop (supportive - competing): ${f(v.pressureDrop)}; ${v.recommendHook ? `PROMOTE TO A HOOK: neutral compliance ${f(v.levels.neutral.rate)} < ${v.threshold}` : "no hook recommended"}${v.invalid ? `; ${v.invalid} invalid run(s)` : ""}`);
}
