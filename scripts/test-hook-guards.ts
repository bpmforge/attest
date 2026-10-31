/**
 * test-hook-guards.ts — Pass 58 chapter module for scripts/test.ts (Group K).
 * Pure predicates in scripts/lib/hook-guards.mjs + a wiring check that the
 * plugin actually calls them (a guard nothing invokes protects nothing).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as nodeModule from "node:module";
import { pathToFileURL } from "url";

export async function testHookGuards(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const mod = await import(
    pathToFileURL(path.join(root, "scripts/lib/hook-guards.mjs")).href
  );
  const { configProtectionCheck, gateguardCheck } = mod;
  const check = (label: string, cond: boolean) =>
    cond ? ok(label) : fail(label, "assertion false");

  // K1 config-protection
  check("K1 blocks edit of existing eslint config", !!configProtectionCheck("/p/eslint.config.js", true, {}));
  check("K1 blocks existing tsconfig.json", !!configProtectionCheck("/p/tsconfig.json", true, {}));
  check("K1 allows creating a new config", configProtectionCheck("/p/eslint.config.js", false, {}) === null);
  check("K1 allows ordinary source", configProtectionCheck("/p/src/a.ts", true, {}) === null);
  check("K1 bypass env allows", configProtectionCheck("/p/tsconfig.json", true, { EXPERTS_ALLOW_CONFIG_EDIT: "1" }) === null);

  // K1 hardening (found by challenge): aliases, case, Windows paths, vendored trees
  check("K1 vendored config (node_modules) is not blocked", configProtectionCheck("/p/node_modules/x/tsconfig.json", true, {}) === null);
  check("K1 fixture-dir config is not blocked", configProtectionCheck("/p/test/fixtures/.eslintrc", true, {}) === null);
  check("K1 uppercase basename is still protected (case-insensitive FS)", !!configProtectionCheck("/p/TSCONFIG.JSON", true, {}));
  check("K1 Windows path is protected", !!configProtectionCheck("C:\\proj\\tsconfig.json", true, {}));
  check("K1 a symlink alias resolving to tsconfig.json is blocked", !!configProtectionCheck("/p/link.json", true, {}, { realPath: "/p/tsconfig.json" }));

  // K2 gateguard
  const off = new Map<string, number>();
  check("K2 off by default", gateguardCheck(off, "s", "/p/a.ts", true, {}) === null && off.size === 0);
  const st = new Map<string, number>();
  const env = { EXPERTS_GATEGUARD: "1" };
  check("K2 first edit denied with fact request", /importe?r|import/i.test(gateguardCheck(st, "s", "/p/a.ts", true, env) ?? ""));
  check("K2 retry allowed", gateguardCheck(st, "s", "/p/a.ts", true, env) === null);
  check("K2 next file gated separately", gateguardCheck(st, "s", "/p/b.ts", true, env) !== null);
  check("K2 new session re-gates", gateguardCheck(st, "s2", "/p/a.ts", true, env) !== null);
  // TTL + deny log (the A/B's fired-or-discard rule needs the log)
  const ttl = new Map<string, number>();
  const logs: any[] = [];
  gateguardCheck(ttl, "s", "/p/t.ts", true, env, { now: 1000, log: (r: any) => logs.push(r) });
  check("K2 deny is logged", logs.length === 1 && logs[0].event === "gate_denied" && logs[0].file === "/p/t.ts");
  check("K2 retry inside TTL allowed, not logged", gateguardCheck(ttl, "s", "/p/t.ts", true, env, { now: 2000, log: (r: any) => logs.push(r) }) === null && logs.length === 1);
  check("K2 gate re-arms after the TTL", gateguardCheck(ttl, "s", "/p/t.ts", true, env, { now: 1000 + 31 * 60 * 1000 }) !== null);
  check("K2 a throwing log sink still yields the fact request", /GATEGUARD/.test(gateguardCheck(new Map(), "s", "/p/l.ts", true, env, { log: () => { throw new Error("ENOENT"); } }) ?? ""));
  const rel = new Map<string, number>();
  gateguardCheck(rel, "s", "rel/a.ts", true, env);
  check("K2 relative and absolute forms of one path share a key", gateguardCheck(rel, "s", path.resolve("rel/a.ts"), true, env) === null);
  check("K2 create gate asks for callers", /call/i.test(gateguardCheck(new Map(), "s", "/p/n.ts", false, env) ?? ""));

  // wiring: call the REAL plugin hook the way opencode does (args in output.args).
  // A source-text grep here passed while every guard was a silent no-op.
  const { ExpertHooks } = await import(pathToFileURL(path.join(root, "plugins/expert-hooks.ts")).href);
  const hooks = await ExpertHooks({ $: (() => ({ quiet: () => ({ nothrow: async () => ({}) }) })) as any } as any);
  const before = hooks["tool.execute.before"];
  const run = async (tool: string, args: any, env: Record<string, string> = {}, sid = "sess") => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      await before({ tool, sessionID: sid, callID: "c" }, { args });
      return null;
    } catch (e: any) {
      return String(e.message);
    } finally {
      for (const k of Object.keys(env)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  };
  const tmp = fs.mkdtempSync(path.join(root, ".tmp-hg-"));
  try {
    const cfg = path.join(tmp, "tsconfig.json");
    fs.writeFileSync(cfg, "{}");
    check("wiring: plugin blocks edit of existing tsconfig", /BLOCKED/.test((await run("edit", { filePath: cfg })) ?? ""));
    check("wiring: plugin blocks rm -rf / via output.args", /BLOCKED/.test((await run("bash", { command: "rm -rf /" })) ?? ""));
    check("wiring: plugin blocks .env write", /BLOCKED/.test((await run("write", { filePath: path.join(tmp, ".env") })) ?? ""));
    const src = path.join(tmp, "a.ts");
    fs.writeFileSync(src, "x");
    check("wiring: multiedit of existing tsconfig blocked", /BLOCKED/.test((await run("multiedit", { filePath: cfg })) ?? ""));
    check("wiring: ordinary edit allowed (gateguard off)", (await run("edit", { filePath: src })) === null);
    check("wiring: gateguard on denies first edit, allows retry", /GATEGUARD/.test((await run("edit", { filePath: src }, { EXPERTS_GATEGUARD: "1" })) ?? "") && (await run("edit", { filePath: src }, { EXPERTS_GATEGUARD: "1" })) === null);
    // per-session keying and the deny log, through the REAL hook
    const glog = path.join(tmp, "gate.jsonl");
    const G = { EXPERTS_GATEGUARD: "1", EXPERTS_GATEGUARD_LOG: glog };
    const other = path.join(tmp, "b.ts");
    fs.writeFileSync(other, "y");
    await run("edit", { filePath: other }, G, "sA");
    check("wiring: gateguard re-gates a DIFFERENT session on the same file (sessionID is wired)", /GATEGUARD/.test((await run("edit", { filePath: other }, G, "sB")) ?? ""));
    await run("write", { filePath: path.join(tmp, "brand-new.ts") }, G, "sA");
    const rows = fs.readFileSync(glog, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    check("wiring: EXPERTS_GATEGUARD_LOG gets one row per deny", rows.length === 3 && rows.every((r) => r.event === "gate_denied"));
    check("wiring: a create is distinguished from an edit (exists flag)", rows.at(-1).exists === false && rows[0].exists === true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  await testPluginLib(root, ok, fail);
}

// ─── WP-V1: shared plugin lib (plugins/lib/*.ts) exercised directly ──────────────────────────
// Both shells (v1 plugins/*.ts, v2 plugins-v2/<name>/index.ts) call exactly these functions, so
// testing them with fixture events covers the behaviour of both.
async function testPluginLib(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const check = (label: string, cond: boolean) => (cond ? ok(label) : fail(label, "assertion false"));
  const load = (rel: string, q = "") => import(pathToFileURL(path.join(root, rel)).href + q);
  const cap = await load("plugins/lib/turn-cap.ts");
  const out = await load("plugins/lib/tool-output.ts");
  const tel = await load("plugins/lib/telemetry.ts");
  const guards = await load("plugins/lib/guards.ts");

  // turn cap
  check("lib turn-cap: parseMaxTurns reads EXPERTS_MAX_TURNS, unset/garbage -> 0", cap.parseMaxTurns({ EXPERTS_MAX_TURNS: "3" }) === 3 && cap.parseMaxTurns({}) === 0 && cap.parseMaxTurns({ EXPERTS_MAX_TURNS: "x" }) === 0);
  check("lib turn-cap: below the cap nothing is refused", cap.turnCapDecision({ turns: 2, max: 3, tool: "read" }) === null);
  check("lib turn-cap: at the cap a read is refused with the budget message", /TURN BUDGET REACHED.*limit 3/.test(cap.turnCapDecision({ turns: 3, max: 3, tool: "read" }) ?? ""));
  check("lib turn-cap: at the cap a ledger write (docs/work, docs/reviews) is still allowed", cap.turnCapDecision({ turns: 9, max: 3, tool: "write", filePath: "/p/docs/work/TASKS_x.md" }) === null && cap.turnCapDecision({ turns: 9, max: 3, tool: "edit", filePath: "docs/reviews/M.md" }) === null);
  check("lib turn-cap: at the cap a source write and a bash call are refused", !!cap.turnCapDecision({ turns: 3, max: 3, tool: "edit", filePath: "/p/src/a.ts" }) && !!cap.turnCapDecision({ turns: 3, max: 3, tool: "bash", filePath: "" }));
  check("lib turn-cap: max 0 never refuses", cap.turnCapDecision({ turns: 999, max: 0, tool: "bash" }) === null);
  const tc = cap.createTurnCounter(2);
  check("lib turn-cap: counter counts each completed message once, ignores incomplete", tc.record("s", "m1", 1) === 1 && tc.record("s", "m1", 1) === null && tc.record("s", "m2", 0) === null && tc.record("s", "m2", 1) === 2 && tc.get("s") === 2 && tc.get("other") === 0);
  check("lib turn-cap: a disabled (max 0) counter never counts", cap.createTurnCounter(0).record("s", "m", 1) === null);

  // tool-output truncation: head / tail / omission marker
  const big = "H".repeat(650) + "M".repeat(98_000) + "T".repeat(350);
  const cut = out.truncateToolOutput("grep", big, 1000);
  check("lib tool-output: head 65% + tail 25% kept, middle replaced by a marker with the omitted count and a re-query hint",
    !!cut && cut.text.startsWith("H".repeat(650)) && cut.text.endsWith("T".repeat(250)) && !cut.text.includes("MMMMMMMMMM") &&
    /\[… 98,100 chars omitted by expert-hooks \(EXPERTS_TOOL_OUTPUT_MAX=1000\) — narrow the pattern/.test(cut.text) && cut.originalLength === big.length);
  check("lib tool-output: per-tool hints (read/bash)", /offset\/limit/.test(out.truncateToolOutput("read", big, 1000)?.text ?? "") && /head\/tail\/grep/.test(out.truncateToolOutput("bash", big, 1000)?.text ?? ""));
  check("lib tool-output: within budget, non-compressible tool, max 0, non-string -> untouched", out.truncateToolOutput("read", "short", 1000) === null && out.truncateToolOutput("write", big, 1000) === null && out.truncateToolOutput("read", big, 0) === null && out.truncateToolOutput("read", undefined, 1000) === null);
  check("lib tool-output: EXPERTS_TOOL_OUTPUT_MAX default 24000, 0 disables", out.parseToolOutputMax({}) === 24000 && out.parseToolOutputMax({ EXPERTS_TOOL_OUTPUT_MAX: "0" }) === 0 && out.parseToolOutputMax({ EXPERTS_TOOL_OUTPUT_MAX: "500" }) === 500);

  // telemetry row writer + the shared assistant-message handler (fixture events)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-lib-"));
  try {
    const info = (id: string, completed?: number, extra: any = {}) => ({
      id, role: "assistant", sessionID: "ses1", providerID: "p", modelID: "m", mode: "coder", path: { root: tmp },
      time: { created: 1000, completed }, tokens: { input: 10, output: 2, reasoning: 1, cache: { read: 4, write: 5 } }, cost: 0.5, finish: "stop", ...extra,
    });
    const row = tel.buildTelemetryRow(info("a", 2000));
    check("lib telemetry: row carries ACTUALS only (tokens, cache, cost, duration), never content",
      row.tokens_in === 10 && row.cache_read === 4 && row.cache_write === 5 && row.duration_ms === 1000 && row.source === "plugin" && row.model === "p/m" && !("text" in row) && !("content" in row));
    tel.logTelemetry(tmp, { x: 1 });
    check("lib telemetry: logTelemetry appends a JSONL row under docs/work/telemetry.jsonl", fs.readFileSync(path.join(tmp, "docs/work/telemetry.jsonl"), "utf8").trim() === '{"x":1}');
    fs.writeFileSync(path.join(tmp, "blocker"), "x");
    check("lib telemetry: logTelemetry swallows write errors", (() => { try { tel.logTelemetry(path.join(tmp, "blocker"), { a: 1 }); return true; } catch { return false; } })());
    check("lib telemetry: output-cap and stream-failure warnings are named", tel.streamWarnings(info("b", 2, { finish: "length" })).some((w: string) => /OUTPUT CAP/.test(w)) && tel.streamWarnings(info("b", 2, { finish: "error" })).some((w: string) => /stream did not complete/.test(w)) && tel.streamWarnings(info("b", 2)).length === 0);

    const warns: string[] = [];
    const receipts: string[] = [];
    const counter = cap.createTurnCounter(2);
    const handle = tel.createAssistantMessageHandler({
      turns: counter, maxTurns: 2, turnCapMessage: cap.turnCapMessage, logSessionReceipt: (_r: string, i: any) => receipts.push(i.id),
      env: {}, warn: (m: string) => warns.push(m),
    });
    handle(info("m1")); // partial: receipt only
    handle(info("m1", 2000));
    handle(info("m1", 2000)); // duplicate update
    handle(info("m2", 3000));
    handle({ ...info("u1", 4000), role: "user" });
    const rows = fs.readFileSync(path.join(tmp, "docs/work/telemetry.jsonl"), "utf8").trim().split("\n").slice(1);
    check("lib handler: one telemetry row per completed assistant message, none for partial/duplicate/user updates", rows.length === 2 && JSON.parse(rows[0]).message === "m1" && JSON.parse(rows[1]).message === "m2");
    check("lib handler: session receipt fires once per session", receipts.length === 1 && receipts[0] === "m1");
    check("lib handler: the turn-budget warning fires exactly when the cap is reached", warns.filter((w) => /TURN BUDGET REACHED/.test(w)).length === 1 && counter.get("ses1") === 2);

    const off: string[] = [];
    const c2 = cap.createTurnCounter(1);
    const quiet = tel.createAssistantMessageHandler({ turns: c2, maxTurns: 1, turnCapMessage: cap.turnCapMessage, logSessionReceipt: () => {}, env: { EXPERTS_TELEMETRY: "0" }, warn: (m: string) => off.push(m), cwd: () => path.join(tmp, "quiet") });
    quiet(info("q1", 5000));
    check("lib handler: EXPERTS_TELEMETRY=0 stops the log but the turn budget still counts", c2.get("ses1") === 1 && off.length === 1 && !fs.existsSync(path.join(tmp, "quiet")));

    // guards: the pre-tool check both shells delegate to
    const blocked = (o: any) => { try { guards.beforeToolCheck({ sessionID: "s", gated: new Map(), turns: 0, maxTurns: 0, env: {}, ...o }); return null; } catch (e: any) { return String(e.message); } };
    check("lib guards: rm -rf / and .env writes are BLOCKED", /BLOCKED/.test(blocked({ tool: "bash", args: { command: "rm -rf /" } }) ?? "") && /BLOCKED/.test(blocked({ tool: "write", args: { filePath: path.join(tmp, ".env") } }) ?? ""));
    check("lib guards: ordinary bash and write are allowed", blocked({ tool: "bash", args: { command: "ls" } }) === null && blocked({ tool: "write", args: { filePath: path.join(tmp, "a.txt") } }) === null);
    check("lib guards: turn cap is enforced ahead of every other check", /TURN BUDGET/.test(blocked({ tool: "read", args: {}, turns: 5, maxTurns: 5 }) ?? ""));

    // resume-anchor builder: pure, version = line 1 only, never tail-truncated
    const proj = path.join(tmp, "proj");
    fs.mkdirSync(path.join(proj, "docs/work/coder/t1"), { recursive: true });
    fs.writeFileSync(path.join(proj, "docs/work/HANDOFF_x.md"), 'PRODUCE\n- `docs/reviews/OUT.md`\nPrint exactly: "DONE X"\n');
    fs.writeFileSync(path.join(proj, "docs/work/TASKS_x.md"), "- [x] a\n- [ ] b\n");
    fs.writeFileSync(path.join(proj, "docs/work/coder/t1/phase1.md"), "x");
    const cfg = path.join(tmp, "cfg");
    fs.mkdirSync(cfg);
    fs.writeFileSync(path.join(cfg, "experts-version"), "9.9.9\nopencode-major=2\n");
    const savedCfg = process.env.OPENCODE_CONFIG_DIR;
    process.env.OPENCODE_CONFIG_DIR = cfg;
    let anchor: string | null = null;
    let compaction = "";
    try {
      const at = await load("plugins/lib/resume-anchor-text.ts", "?fresh-" + Date.now());
      anchor = at.buildAnchor(proj);
      compaction = at.compactionContext(anchor);
      check("lib anchor: not an SDLC project -> no anchor at all", at.buildAnchor(path.join(tmp, "empty")) === null);
    } finally {
      if (savedCfg === undefined) delete process.env.OPENCODE_CONFIG_DIR; else process.env.OPENCODE_CONFIG_DIR = savedCfg;
    }
    check("lib anchor: experts-version is read from line 1 only (two-line stamp)", !!anchor && anchor.includes("experts v9.9.9 —") && !anchor.includes("opencode-major"));
    check("lib anchor: names the owed PRODUCE file, completion phrase and ledger", !!anchor && /\[MISSING\] docs\/reviews\/OUT\.md/.test(anchor) && anchor.includes('"DONE X"') && /Task ledger docs\/work\/TASKS_x\.md: 1\/2 done/.test(anchor));
    check("lib anchor: never tail-truncated — the directive tail is intact and there is no ellipsis cap", !!anchor && !anchor.endsWith("…") && anchor.endsWith("a confirm-request, or a which-step question.") && anchor.length <= 3600);
    check("lib anchor: compaction context ends with the on-disk anchor, and works without one", compaction.includes("RESUME NOW") && compaction.endsWith(anchor ?? "?") && !(await load("plugins/lib/resume-anchor-text.ts")).compactionContext(null).includes("Current on-disk state"));

    // WP-X6 anchor cadence: full on turn 1, first turn after a compaction, then every Nth turn (gap from last full); pointer otherwise
    {
      const at = await load("plugins/lib/resume-anchor-text.ts", "?x6-" + Date.now());
      const isFull = (t: string | null) => !!t && t.startsWith("## RESUME ANCHOR");
      const run = (every: number, compactAfter: number[] = []) => {
        const ss = at.createAnchorSessions(every);
        const fulls: number[] = [];
        const outs: (string | null)[] = [];
        for (let t = 1; t <= 50; t++) {
          const o = at.anchorForRequest(proj, ss.next("ses"), ss.every);
          outs.push(o);
          if (isFull(o)) fulls.push(t);
          if (compactAfter.includes(t)) ss.markCompacted("ses");
        }
        return { fulls, outs };
      };
      const a = run(10);
      check("lib anchor cadence: 50 turns, every 10 -> full exactly on turns 1,11,21,31,41 (turn 1, then each 10 turns after the last full)", a.fulls.join(",") === "1,11,21,31,41");
      const ptr = a.outs[1] ?? "";
      check("lib anchor cadence: other turns get the <=200-char pointer naming ledger + HANDOFF + THE LOOP", a.outs.every((o, i) => a.fulls.includes(i + 1) || (!!o && o === ptr)) && ptr.length <= 200 && ptr === "Task ledger: docs/work/TASKS_x.md · HANDOFF: docs/work/HANDOFF_x.md · THE LOOP applies (full anchor every 10 turns)");
      check("lib anchor cadence: every full injection keeps the never-tail-truncated directive", a.fulls.every((t) => { const o = a.outs[t - 1]!; return o.endsWith("a confirm-request, or a which-step question.") && o.length <= 3600; }));
      const c = run(10, [23]);
      check("lib anchor cadence: compaction at turn 23 forces full at 24 and resets the cadence (next fulls 34, 44)", c.fulls.join(",") === "1,11,21,24,34,44");
      check("lib anchor cadence: EVERY=1 -> 50 full; EVERY=0 -> always full (documented back-compat)", run(1).fulls.length === 50 && run(0).fulls.length === 50);
      check("lib anchor cadence: parseAnchorEvery — unset/garbage/negative -> 10, '0' -> 0, '5' -> 5", at.parseAnchorEvery({}) === 10 && at.parseAnchorEvery({ EXPERTS_ANCHOR_EVERY: "x" }) === 10 && at.parseAnchorEvery({ EXPERTS_ANCHOR_EVERY: "-3" }) === 10 && at.parseAnchorEvery({ EXPERTS_ANCHOR_EVERY: "0" }) === 0 && at.parseAnchorEvery({ EXPERTS_ANCHOR_EVERY: "5" }) === 5);
      check("lib anchor cadence: pure shouldInjectFull rule", at.shouldInjectFull({ turn: 1, lastFullTurn: 0, compactedSinceLastFull: false, every: 10 }) && !at.shouldInjectFull({ turn: 10, lastFullTurn: 1, compactedSinceLastFull: false, every: 10 }) && at.shouldInjectFull({ turn: 11, lastFullTurn: 1, compactedSinceLastFull: false, every: 10 }) && at.shouldInjectFull({ turn: 5, lastFullTurn: 1, compactedSinceLastFull: true, every: 10 }));
      const ss2 = at.createAnchorSessions(10);
      ss2.next("A"); ss2.next("B");
      ss2.markCompacted("A");
      check("lib anchor cadence: state is per sessionID (compaction of A does not force B full)", ss2.next("A") === true && ss2.next("B") === false);
      check("lib anchor cadence: no SDLC state -> no pointer either", at.buildPointer(path.join(tmp, "empty"), 10) === null);
    }

    // shell shim ($-compatible, used by the v2 shell when ctx has no `$`)
    const { shellShim } = await load("plugins/lib/shell-shim.ts");
    const echoed = await shellShim`echo ${"a b"}`.quiet().text();
    const failed = await shellShim`false`.quiet().nothrow();
    check("lib shell-shim: interpolations stay single argv entries; nothrow() yields exitCode", echoed.trim() === "a b" && failed.exitCode === 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // shells: v1 exports ONLY its Plugin; v2 shells are valid TypeScript that default-export Plugin.define
  for (const [f, name] of [["plugins/expert-hooks.ts", "ExpertHooks"], ["plugins/resume-anchor.ts", "ResumeAnchor"]]) {
    const m = await load(f);
    check(`${f} exports ONLY its Plugin (OpenCode's loader calls every export)`, Object.keys(m).length === 1 && typeof m[name] === "function");
  }
  for (const f of ["plugins-v2/expert-hooks/index.ts", "plugins-v2/resume-anchor/index.ts"]) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    let parsed = true;
    try {
      // The v2 package is not installed, so these cannot be imported or type-checked here; stripping types proves they parse.
      (nodeModule as any).stripTypeScriptTypes(src);
    } catch (e: any) { parsed = false; fail(`${f} is valid TypeScript`, String(e.message).slice(0, 200)); }
    if (parsed) check(`${f} parses and default-exports Plugin.define({ id, setup })`, /import \{ Plugin \} from "@opencode\/plugin"/.test(src) && /export default Plugin\.define\(\{\s*id: "attest\./.test(src) && /async setup\(ctx/.test(src));
  }
  check("v2 expert-hooks wires tool hooks, session prompt hook, event subscription and tool.transform",
    ["ctx.tool.hook(\"execute.before\"", "ctx.tool.hook(\"execute.after\"", "ctx.session.hook(\"prompt\"", "ctx.event.subscribe(", "ctx.tool.transform("].every((n) => fs.readFileSync(path.join(root, "plugins-v2/expert-hooks/index.ts"), "utf8").includes(n)));
  check("v2 resume-anchor wires session context + compaction hooks", ["ctx.session.hook(\"context\"", "ctx.session.hook(\"compaction\""].every((n) => fs.readFileSync(path.join(root, "plugins-v2/resume-anchor/index.ts"), "utf8").includes(n)));
  const libFiles = (function walk(d: string): string[] { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])); })(path.join(root, "plugins/lib"));
  const leaks = libFiles.filter((f) => /@opencode(-ai)?\//.test(fs.readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "")));
  check("plugins/lib imports nothing from opencode (pure, shared by both majors)", leaks.length === 0);

  // tools: v1 shells re-wrap the lib; zod args and JSON Schema must agree
  const { allTools } = await load("plugins/lib/tools/index.ts");
  const toolFiles = fs.readdirSync(path.join(root, "tools")).filter((f) => f.endsWith(".ts"));
  check(`plugins/lib/tools registers every tools/*.ts (${toolFiles.length})`, allTools.length === toolFiles.length);
  for (const f of toolFiles) {
    const v1 = (await load(`tools/${f}`)).default;
    const lib = allTools.find((t: any) => `${t.name}.ts` === f);
    const same = !!lib && v1.description === lib.description && JSON.stringify(Object.keys(v1.args).sort()) === JSON.stringify(Object.keys(lib.inputSchema.properties ?? {}).sort()) && typeof lib.execute === "function" && lib.inputSchema.type === "object";
    check(`tools/${f}: v1 zod args == lib JSON Schema properties, same description`, same);
  }
}
