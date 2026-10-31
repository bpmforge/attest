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
  check("lib turn-cap: parseMaxTurns reads EXPERTS_MAX_TURNS, unset -> default 150, 0/garbage -> 0", cap.parseMaxTurns({ EXPERTS_MAX_TURNS: "3" }) === 3 && cap.parseMaxTurns({}) === 150 && cap.parseMaxTurns({ EXPERTS_MAX_TURNS: "0" }) === 0 && cap.parseMaxTurns({ EXPERTS_MAX_TURNS: "x" }) === 0);
  check("lib turn-cap: below the cap nothing is refused", cap.turnCapDecision({ turns: 2, max: 3, tool: "read" }) === null);
  check("lib turn-cap: at the cap a read is refused with the budget message", /TURN BUDGET REACHED.*limit 3/.test(cap.turnCapDecision({ turns: 3, max: 3, tool: "read" }) ?? ""));
  check("lib turn-cap: at the cap a ledger write (docs/work, docs/reviews) is still allowed", cap.turnCapDecision({ turns: 9, max: 3, tool: "write", filePath: "/p/docs/work/TASKS_x.md" }) === null && cap.turnCapDecision({ turns: 9, max: 3, tool: "edit", filePath: "docs/reviews/M.md" }) === null);
  check("lib turn-cap: at the cap a source write and a bash call are refused", !!cap.turnCapDecision({ turns: 3, max: 3, tool: "edit", filePath: "/p/src/a.ts" }) && !!cap.turnCapDecision({ turns: 3, max: 3, tool: "bash", filePath: "" }));
  check("lib turn-cap: max 0 never refuses", cap.turnCapDecision({ turns: 999, max: 0, tool: "bash" }) === null);
  const tc = cap.createTurnCounter(2);
  check("lib turn-cap: counter counts each completed message once, ignores incomplete", tc.record("s", "m1", 1) === 1 && tc.record("s", "m1", 1) === null && tc.record("s", "m2", 0) === null && tc.record("s", "m2", 1) === 2 && tc.get("s") === 2 && tc.get("other") === 0);
  check("lib turn-cap: a disabled (max 0) counter never counts", cap.createTurnCounter(0).record("s", "m", 1) === null);

  // stall guard (WP-X1): replay of the real 602-turn session's row pattern + synthetic controls
  const sg = await load("plugins/lib/stall-guard.ts");
  const replay = (guard: any, rows: Array<{ id: string; out: number; tin: number; text?: string; wrote?: boolean }>, sid = "ses_0610c84d") => {
    let warnAt = 0, abortAt = 0, last: any = null;
    rows.forEach((r, i) => {
      last = guard.observe({ sessionID: sid, messageID: r.id, text: r.text, tokensOut: r.out, tokensIn: r.tin, wroteFile: !!r.wrote });
      if (last.action === "warn" && !warnAt) warnAt = i + 1;
      if (last.action === "abort" && !abortAt) abortAt = i + 1;
    });
    return { warnAt, abortAt, last };
  };
  // Row pattern of ses_0610c84ddffedep2fRsJnm41Ax (docs/work/telemetry.jsonl is git-ignored, so generated here):
  // ~74 normal turns (tokens_in 41k->61k, 139+ out), then 16 output tokens per turn, +63 input per turn, 602 turns.
  const fixture = Array.from({ length: 602 }, (_, i) => i < 74
    ? { id: `m${i}`, out: 139 + (i * 37) % 400, tin: 41280 + i * 270 }
    : { id: `m${i}`, out: 16, tin: 60990 + (i - 74) * 63 });
  const g1 = sg.createStallGuard({ env: {} });
  const rep = replay(g1, fixture);
  check(`lib stall: replay of the 602-turn fixture warns at turn ${rep.warnAt} and aborts at turn ${rep.abortAt} (<= 81, not 602)`, rep.warnAt === 78 && rep.abortAt === 80 && rep.abortAt <= 81);
  check("lib stall: abort fires once; the stall row data (turns, tokens_in wasted, reason) is populated", g1.isAborted("ses_0610c84d") && rep.last.action === "none" && g1.turns("ses_0610c84d") === 602);
  const g1b = sg.createStallGuard({ env: {} });
  const abortRes = fixture.slice(0, 80).map((r, i) => g1b.observe({ sessionID: "s", messageID: r.id, tokensOut: r.out, tokensIn: r.tin, wroteFile: false })).at(-1)!;
  check("lib stall: abort result carries consecutive=6, turns=80, tokensInWasted>0 and a reason", abortRes.action === "abort" && abortRes.consecutive === 6 && abortRes.turns === 80 && abortRes.tokensInWasted > 300000 && /6 consecutive/.test(abortRes.reason));
  const varying = Array.from({ length: 300 }, (_, i) => ({ id: `v${i}`, out: 150 + (i % 7) * 40, tin: 40000 + i * 100, text: `step ${i}: read file ${i % 13}` }));
  const rv = replay(sg.createStallGuard({ env: {} }), varying, "normal");
  check("lib stall: a varying-output fixture never warns or aborts", rv.warnAt === 0 && rv.abortAt === 0);
  const gw = sg.createStallGuard({ env: {} });
  const broken = [0, 1, 2].map((k) => [1, 2, 3].map((j) => ({ id: `b${k}${j}`, out: 16, tin: 50000 })).concat([{ id: `bw${k}`, out: 16, tin: 50000, wrote: true }])).flat();
  const rb = replay(gw, broken, "broken");
  check("lib stall: a tiny-output streak broken by a file write resets (3 tiny + write, repeated, never warns)", rb.warnAt === 0 && rb.abortAt === 0 && rb.last.consecutive === 0);
  const gs = sg.createStallGuard({ env: {} });
  const rs = replay(gs, [1, 2, 3].map((i) => ({ id: `p${i}`, out: 16, tin: 1 })).concat([{ id: "p4", out: 500, tin: 1 }, { id: "p5", out: 16, tin: 1 }, { id: "p6", out: 16, tin: 1 }, { id: "p7", out: 16, tin: 1 }]), "subst");
  check("lib stall: a substantive different output resets the streak", rs.warnAt === 0 && rs.last.consecutive === 3);
  const gi = sg.createStallGuard({ env: {} });
  const ri = replay(gi, Array.from({ length: 8 }, (_, i) => ({ id: `i${i}`, out: 300, tin: 10, text: i % 2 ? "  Same   REPLY\n" : "same reply" })), "ident");
  check("lib stall: identical normalized text (case/whitespace-insensitive) warns at 4 and aborts at 6 even with big outputs", ri.warnAt === 4 && ri.abortAt === 6);
  const rw1 = replay(sg.createStallGuard({ env: {} }), Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, out: 16, tin: 1 })), "once");
  const warnCount = (() => { const g = sg.createStallGuard({ env: { EXPERTS_STALL_ABORT: "0" } }); let n = 0; for (let i = 0; i < 12; i++) if (g.observe({ sessionID: "x", messageID: `o${i}`, tokensOut: 16, wroteFile: false }).action === "warn") n++; return n; })();
  check("lib stall: warn fires once per streak; EXPERTS_STALL_ABORT=0 never aborts", warnCount === 1 && rw1.abortAt === 6);
  const gOff = replay(sg.createStallGuard({ env: { EXPERTS_STALL_WARN: "0", EXPERTS_STALL_ABORT: "0" } }), fixture, "off");
  check("lib stall: EXPERTS_STALL_WARN=0 + EXPERTS_STALL_ABORT=0 disables the guard on the 602-turn fixture", gOff.warnAt === 0 && gOff.abortAt === 0);
  const gEnv = replay(sg.createStallGuard({ env: { EXPERTS_STALL_WARN: "2", EXPERTS_STALL_ABORT: "3" } }), fixture.slice(74, 90), "envs");
  check("lib stall: EXPERTS_STALL_WARN/ABORT override the 4/6 defaults", gEnv.warnAt === 2 && gEnv.abortAt === 3);
  const gSig = sg.createStallGuard({ env: {} });
  gSig.noteText("t1", "hello"); gSig.noteWrite("sx");
  const sig1 = gSig.signals("sx", "t1"); const sig2 = gSig.signals("sx", "t1");
  check("lib stall: shell signals (assistant text, file write) are consumed once", sig1.text === "hello" && sig1.wroteFile === true && sig2.text === undefined && sig2.wroteFile === false);
  check("lib stall: abort refuses tool calls but still allows docs/work and docs/reviews ledger writes",
    /BLOCKED: repeat-output stall after 80 turns/.test(sg.stallAbortDecision({ aborted: true, turns: 80, tool: "read" }) ?? "") && sg.stallAbortDecision({ aborted: true, turns: 80, tool: "write", filePath: "/p/docs/work/TASKS_x.md" }) === null && sg.stallAbortDecision({ aborted: false, turns: 80, tool: "read" }) === null && !!sg.stallAbortDecision({ aborted: true, turns: 80, tool: "edit", filePath: "/p/src/a.ts" }));
  check("lib stall: STALL DETECTED directive names the ledger and BLOCKED escape", /STALL DETECTED: your last 4 replies.*HANDOFF.*ONE concrete tool action.*BLOCKED/.test(sg.stallWarnMessage(4)));

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

    // stall guard through the shared handler (what both shells run): warn via the turn-cap channel, abort writes a telemetry row
    const sw: string[] = [];
    const sgd = await load("plugins/lib/stall-guard.ts");
    const sguard = sgd.createStallGuard({ env: {} });
    const stallRoot = path.join(tmp, "stallproj");
    const sh = tel.createAssistantMessageHandler({ turns: cap.createTurnCounter(0), maxTurns: 0, turnCapMessage: cap.turnCapMessage, logSessionReceipt: () => {}, stall: sguard, env: {}, warn: (m: string) => sw.push(m), cwd: () => stallRoot });
    for (let i = 0; i < 8; i++) sh({ ...info(`s${i}`, 9000 + i, { sessionID: "sesS", path: { root: stallRoot }, tokens: { input: 60000 + i * 63, output: 16, reasoning: 19, cache: { read: 0, write: 0 } } }) });
    const stallRows = fs.readFileSync(path.join(stallRoot, "docs/work/telemetry.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r: any) => r.source === "stall");
    check("lib handler: stall warn (once, at 4) and abort (at 6) reach warn(); abort prints BLOCKED", sw.filter((m) => /STALL DETECTED/.test(m)).length === 1 && sw.filter((m) => /BLOCKED: repeat-output stall after 6 turns/.test(m)).length === 1 && sguard.isAborted("sesS"));
    check("lib handler: exactly one source:stall telemetry row {session, turns, tokens_in_wasted, reason}", stallRows.length === 1 && stallRows[0].session === "sesS" && stallRows[0].turns === 6 && stallRows[0].tokens_in_wasted > 360000 && /consecutive/.test(stallRows[0].reason));
    const quietStall = path.join(tmp, "stallquiet");
    const sg2 = sgd.createStallGuard({ env: {} });
    const sh2 = tel.createAssistantMessageHandler({ turns: cap.createTurnCounter(0), maxTurns: 0, turnCapMessage: cap.turnCapMessage, logSessionReceipt: () => {}, stall: sg2, env: { EXPERTS_TELEMETRY: "0" }, warn: () => {}, cwd: () => quietStall });
    for (let i = 0; i < 7; i++) sh2({ ...info(`q${i}`, 9000 + i, { sessionID: "sesQ", tokens: { input: 1, output: 16, cache: {} } }) });
    check("lib handler: EXPERTS_TELEMETRY=0 still aborts a stalled session but writes no row", sg2.isAborted("sesQ") && !fs.existsSync(quietStall));

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
