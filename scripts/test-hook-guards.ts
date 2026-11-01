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

  // compaction trigger (WP-X3): pure trigger + handler with fixture assistant messages
  const ct = await load("plugins/lib/compaction-trigger.ts");
  const cfgModels = { models: { "lmstudio/qwen-test": { context_window: 100000 }, "lmstudio/glob-*": { context_window: 40000 }, "x/zero": { context_window: 0 } } };
  const mkTrig = (env: Record<string, string>, cfg: any = cfgModels) => ct.createCompactionTrigger({ thresholdFor: ct.createThresholdResolver({ env, root: () => "/p", loadConfig: () => cfg }) });
  const ramp = (trig: any, model: string, from: number, step: number, n: number, sid = "s") => {
    const fires: number[] = [];
    for (let t = 1; t <= n; t++) { const r = trig.observe({ sessionID: sid, model, tokensIn: from + step * (t - 1), turn: t }); if (r.action === "compact") fires.push(t); }
    return fires;
  };
  check("lib compaction: default threshold is 0.6 x context_window (exact id and glob key), unknown model -> null", ct.resolveThreshold("lmstudio/qwen-test", {}, cfgModels) === 60000 && ct.resolveThreshold("lmstudio/glob-7b", {}, cfgModels) === 24000 && ct.resolveThreshold("other/m", {}, cfgModels) === null && ct.resolveThreshold("x/zero", {}, cfgModels) === null && ct.resolveThreshold("a/b", {}, null) === null);
  const t1 = mkTrig({});
  const f1 = ramp(t1, "lmstudio/qwen-test", 40000, 2500, 15);
  check(`lib compaction: rising tokens_in fires exactly once, at the first turn reaching the threshold (turn ${f1[0]})`, f1.length === 1 && f1[0] === 9);
  const t2 = mkTrig({});
  const r2 = ramp(t2, "lmstudio/qwen-test", 70000, 1000, 25);
  check("lib compaction: still above the threshold -> no second fire within 10 turns; re-fires at turn 11 (gap = 10)", r2.length === 3 && r2[0] === 1 && r2[1] === 11 && r2[2] === 21);
  const t3 = mkTrig({});
  const a3 = t3.observe({ sessionID: "s", model: "lmstudio/qwen-test", tokensIn: 61000, turn: 1 });
  t3.noteCompaction("s", 4);
  const b3 = t3.observe({ sessionID: "s", model: "lmstudio/qwen-test", tokensIn: 62000, turn: 8 });
  const c3 = t3.observe({ sessionID: "s", model: "lmstudio/qwen-test", tokensIn: 62000, turn: 14 });
  check("lib compaction: an observed compaction resets the gap (turn 8 blocked, turn 14 fires) and sessions are independent", a3.action === "compact" && b3.action === "none" && /within 10 turns/.test(b3.reason) && c3.action === "compact" && t3.observe({ sessionID: "other", model: "lmstudio/qwen-test", tokensIn: 61000, turn: 2 }).action === "compact");
  const t4 = mkTrig({});
  const u1 = t4.observe({ sessionID: "s", model: "mystery/model", tokensIn: 900000, turn: 1 });
  const u2 = t4.observe({ sessionID: "s", model: "mystery/model", tokensIn: 900000, turn: 2 });
  check("lib compaction: unknown model + no env never fires; the disabled notice is flagged once", u1.action === "none" && u1.threshold === null && u1.disabledFirst === true && u2.action === "none" && !u2.disabledFirst);
  check("lib compaction: EXPERTS_COMPACT_AT=0.5 is a fraction of the window (50000), =50000 is absolute", ramp(mkTrig({ EXPERTS_COMPACT_AT: "0.5" }), "lmstudio/qwen-test", 49000, 500, 5)[0] === 3 && ct.resolveThreshold("lmstudio/qwen-test", { EXPERTS_COMPACT_AT: "0.5" }, cfgModels) === 50000 && ct.resolveThreshold("lmstudio/qwen-test", { EXPERTS_COMPACT_AT: "50000" }, cfgModels) === 50000);
  check("lib compaction: absolute EXPERTS_COMPACT_AT works with no known window; a fraction without a window, 0 and 'off' disable; garbage falls back to the default", ct.resolveThreshold("mystery/m", { EXPERTS_COMPACT_AT: "50000" }, null) === 50000 && ct.resolveThreshold("mystery/m", { EXPERTS_COMPACT_AT: "0.5" }, null) === null && ct.resolveThreshold("lmstudio/qwen-test", { EXPERTS_COMPACT_AT: "0" }, cfgModels) === null && ct.resolveThreshold("lmstudio/qwen-test", { EXPERTS_COMPACT_AT: "off" }, cfgModels) === null && ct.resolveThreshold("lmstudio/qwen-test", { EXPERTS_COMPACT_AT: "lots" }, cfgModels) === 60000);

  const ctmp = fs.mkdtempSync(path.join(os.tmpdir(), "compact-trig-"));
  try {
    const warns: string[] = []; const reqs: string[] = [];
    const mkMsg = (id: string, input: number, extra: any = {}) => ({ id, role: "assistant", sessionID: "cs", providerID: "lmstudio", modelID: "qwen-test", path: { root: ctmp }, time: { created: 1, completed: 2 }, tokens: { input, output: 5, cache: { read: 0, write: 0 } }, ...extra });
    const h = ct.createCompactionHandler({ trigger: mkTrig({ EXPERTS_COMPACT_AT: "50000" }), warn: (m: string) => warns.push(m), request: async (s: string, p: string, m: string) => { reqs.push(`${s}|${p}|${m}`); }, env: {}, cwd: () => ctmp });
    await h.onAssistantMessage(mkMsg("a1", 30000));
    await h.onAssistantMessage(mkMsg("a2", 51000));
    await h.onAssistantMessage(mkMsg("a2", 52000)); // duplicate delivery of one message id
    await h.onAssistantMessage(mkMsg("a3", 53000, { time: { created: 1 } })); // incomplete
    await h.onAssistantMessage(mkMsg("a4", 54000));
    const rows = fs.existsSync(path.join(ctmp, "docs/work/telemetry.jsonl")) ? fs.readFileSync(path.join(ctmp, "docs/work/telemetry.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
    check("lib compaction handler: one fire -> one summarize request, one CONTEXT SIZE directive with the compaction text, one telemetry row", reqs.length === 1 && reqs[0] === "cs|lmstudio|qwen-test" && warns.length === 1 && /CONTEXT SIZE: .*51000 tokens.*threshold 50000.*requested a compaction/s.test(warns[0]) && /YOU ARE WRITING A SUMMARY DOCUMENT/.test(warns[0]) && rows.length === 1 && rows[0].source === "compaction-trigger" && rows[0].session === "cs" && rows[0].turn === 2 && rows[0].tokens_in === 51000 && rows[0].threshold === 50000);
    const warns2: string[] = [];
    const h2 = ct.createCompactionHandler({ trigger: mkTrig({ EXPERTS_COMPACT_AT: "50000" }), warn: (m: string) => warns2.push(m), request: async () => { throw new Error("nope"); }, env: { EXPERTS_TELEMETRY: "0" }, cwd: () => ctmp });
    await h2.onAssistantMessage(mkMsg("b1", 80000, { sessionID: "cs2" }));
    check("lib compaction handler: a failing summarize request falls back to the /compact directive; EXPERTS_TELEMETRY=0 writes no row", warns2.length === 1 && /Run \/compact now/.test(warns2[0]) && fs.readFileSync(path.join(ctmp, "docs/work/telemetry.jsonl"), "utf8").trim().split("\n").length === 1);
    const warns3: string[] = [];
    const h3 = ct.createCompactionHandler({ trigger: mkTrig({ EXPERTS_COMPACT_AT: "50000" }), warn: (m: string) => warns3.push(m), env: { EXPERTS_TELEMETRY: "0" }, cwd: () => ctmp });
    await h3.onAssistantMessage(mkMsg("c1", 60000, { sessionID: "cs3" }));
    h3.onCompacted("cs3");
    await h3.onAssistantMessage(mkMsg("c2", 60000, { sessionID: "cs3" }));
    check("lib compaction handler: no request fn -> directive-only; a session.compacted event suppresses the next fire (gap reset)", warns3.length === 1 && /Run \/compact now/.test(warns3[0]));
    const w4: string[] = [];
    const h4 = ct.createCompactionHandler({ trigger: mkTrig({}), warn: (m: string) => w4.push(m), env: { EXPERTS_TELEMETRY: "0" }, cwd: () => ctmp });
    await h4.onAssistantMessage(mkMsg("d1", 500000, { modelID: "unknown-model" }));
    await h4.onAssistantMessage(mkMsg("d2", 500000, { modelID: "unknown-model" }));
    check("lib compaction handler: unknown model + no env -> never compacts, one 'disabled' notice only", w4.length === 1 && /trigger disabled for lmstudio\/unknown-model/.test(w4[0]) && !/CONTEXT SIZE/.test(w4[0]));
  } finally {
    fs.rmSync(ctmp, { recursive: true, force: true });
  }
  const wireSrc = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
  check("compaction trigger is wired in both expert-hooks shells (message handler + compaction event); v1 binds client.session.summarize, v2 binds ctx.session.compact",
    ["plugins/expert-hooks.ts", "plugins-v2/expert-hooks/index.ts"].every((f) => /createCompactionHandler/.test(wireSrc(f)) && /compaction\.onAssistantMessage/.test(wireSrc(f))) &&
    /session\.compacted/.test(wireSrc("plugins/expert-hooks.ts")) && /session\.summarize/.test(wireSrc("plugins/expert-hooks.ts")) &&
    /session\.compaction\.ended/.test(wireSrc("plugins-v2/expert-hooks/index.ts")) && /ctx\.session\.compact\(/.test(wireSrc("plugins-v2/expert-hooks/index.ts")) && /compaction\.keep\.tokens/.test(wireSrc("plugins-v2/expert-hooks/index.ts")));

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
      // Type-checking against the real v2 package is scripts/test-plugins-v2-types.ts; stripping types here proves they parse under node.
      (nodeModule as any).stripTypeScriptTypes(src);
    } catch (e: any) { parsed = false; fail(`${f} is valid TypeScript`, String(e.message).slice(0, 200)); }
    if (parsed) check(`${f} parses and default-exports Plugin.define({ id, setup })`, /import \{ Plugin \} from "@opencode\/plugin"/.test(src) && /export default Plugin\.define\(\{\s*id: "attest\./.test(src) && /async setup\(ctx/.test(src));
  }
  check("v2 expert-hooks wires tool hooks, event subscription and tool.transform",
    ["ctx.tool.hook(\"execute.before\"", "ctx.tool.hook(\"execute.after\"", "ctx.event.subscribe(", "ctx.tool.transform("].every((n) => fs.readFileSync(path.join(root, "plugins-v2/expert-hooks/index.ts"), "utf8").includes(n)));
  check("v2 resume-anchor wires session context + generate + compaction hooks", ["ctx.session.hook(\"context\"", "ctx.session.hook(\"generate\"", "ctx.session.hook(\"compaction\""].every((n) => fs.readFileSync(path.join(root, "plugins-v2/resume-anchor/index.ts"), "utf8").includes(n)));
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
