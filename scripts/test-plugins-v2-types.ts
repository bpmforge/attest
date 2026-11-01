/**
 * test-plugins-v2-types.ts -- chapter module for scripts/test.ts (WP-V1b).
 *
 * 1. STRICT tsc over plugins-v2/** + plugins/lib/** against the REAL @opencode/plugin 2.2.5 types (plugins-v2/tsconfig.json).
 *    Before WP-V1b the v2 shells were `ctx: any` and unchecked; every "ASSUMPTION" lived in that gap.
 * 2. Functional: the two v2 shells are driven through a fake `ctx` that has exactly the verified v2 surface (no `client`,
 *    no `$`; one-event hooks; AsyncIterable event stream; ctx.session.compact; ctx.location) and the observable effects are
 *    asserted: truncation of result.content, guards, telemetry rows with cache_read, stall guard from session.text.ended,
 *    compaction request, anchor via system parts, 17 tools in one transform.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

type Ok = (label: string) => void;
type Fail = (label: string, reason: string) => void;

function makeQueue<T>() {
  const items: T[] = [];
  const waiters: Array<(r: IteratorResult<T>) => void> = [];
  let closed = false;
  return {
    push(v: T) { const w = waiters.shift(); if (w) w({ value: v, done: false }); else items.push(v); },
    close() { closed = true; for (const w of waiters.splice(0)) w({ value: undefined as never, done: true }); },
    iterable: { [Symbol.asyncIterator]: () => ({ next: () => (items.length ? Promise.resolve({ value: items.shift() as T, done: false }) : closed ? Promise.resolve({ value: undefined as never, done: true }) : new Promise<IteratorResult<T>>((r) => waiters.push(r))), return: () => { closed = true; return Promise.resolve({ value: undefined as never, done: true as const }); } }) } as AsyncIterable<T>,
  };
}
const tick = () => new Promise((r) => setTimeout(r, 25));

export async function testPluginsV2Types(root: string, ok: Ok, fail: Fail): Promise<void> {
  const check = (label: string, cond: boolean, detail = "") => (cond ? ok(label) : fail(label, detail));

  // ── 1. strict type-check against the real v2 types ──────────────────────────────
  const tsc = path.join(root, "node_modules", ".bin", "tsc");
  const r = spawnSync(tsc, ["-p", path.join(root, "plugins-v2", "tsconfig.json")], { encoding: "utf8", cwd: root });
  check("plugins-v2/** + plugins/lib/** pass `tsc --noEmit` (strict) against @opencode/plugin 2.2.5", r.status === 0, (r.stdout + r.stderr).slice(0, 1500));
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "plugins-v2", "tsconfig.json"), "utf8"));
  check("plugins-v2/tsconfig.json stays strict", cfg.compilerOptions.strict === true && cfg.compilerOptions.noImplicitAny !== false);
  const shells = ["plugins-v2/expert-hooks/index.ts", "plugins-v2/resume-anchor/index.ts"].map((f) => fs.readFileSync(path.join(root, f), "utf8"));
  check("v2 shells carry no ASSUMPTION / `ctx: any` leftovers", shells.every((s) => !/ASSUMPTION/.test(s) && !/ctx:\s*any/.test(s)));

  // ── 2. pure helpers ─────────────────────────────────────────────────────────────
  const lib = (f: string) => import(pathToFileURL(path.join(root, "plugins/lib", f)).href);
  const to = await lib("tool-output.ts");
  const big = "x".repeat(5000);
  const cs = to.truncateToolResultContent("read", big, 1000);
  check("truncateToolResultContent: string content is cut with the omission marker", cs && typeof cs.content === "string" && cs.content.includes("omitted by expert-hooks") && cs.originalLength === 5000);
  const ca = to.truncateToolResultContent("bash", [{ type: "text", text: big }, { type: "file", uri: "u", mime: "image/png" }], 1000);
  check("truncateToolResultContent: text parts cut, file parts kept", ca && Array.isArray(ca.content) && ca.content[0].type === "text" && ca.content[1].type === "file" && ca.content.length === 2);
  check("truncateToolResultContent: within budget / write tool / disabled -> null", to.truncateToolResultContent("read", "short", 1000) === null && to.truncateToolResultContent("write", big, 1000) === null && to.truncateToolResultContent("read", big, 0) === null);
  check("toolResultText: joins text parts, falls back to string output", to.toolResultText({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }) === "a\nb" && to.toolResultText({ output: "o" }) === "o" && to.toolResultText(undefined) === undefined);

  const ev2 = await lib("v2-events.ts");
  const ad = ev2.createStepAdapter(() => "/proj");
  const started = ad.stepStarted({ sessionID: "s1", assistantMessageID: "m1", agent: "guide", model: { id: "mm", providerID: "pp" }, started: 1000 });
  check("v2-events: step.started -> in-flight info (no completed), agent/model captured", started.time.completed === 0 && started.mode === "guide" && started.modelID === "mm");
  const ended = ad.stepEnded({ sessionID: "s1", assistantMessageID: "m1", finish: "tool-calls", cost: 0.5, tokens: { input: 10, output: 20, reasoning: 3, cache: { read: 700, write: 40 } } }, 4000);
  check("v2-events: step.ended -> completed info with duration, tokens.cache, finish", ended.time.created === 1000 && ended.time.completed === 4000 && ended.tokens.cache.read === 700 && ended.finish === "tool-calls" && ended.path.root === "/proj");
  const failed = ad.stepFailed({ sessionID: "s1", assistantMessageID: "m2", error: { type: "ProviderError", message: "boom" } }, 5000);
  check("v2-events: step.failed -> info.error {name,message}", failed.error?.name === "ProviderError" && failed.error?.message === "boom" && failed.tokens.cache.read === 0);

  // ── 3. the shells driven through a fake v2 ctx ──────────────────────────────────
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "attest-v2-shell-"));
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { EXPERTS_TOOL_OUTPUT_MAX: "1000", EXPERTS_MAX_TURNS: "3", EXPERTS_STALL_WARN: "2", EXPERTS_STALL_ABORT: "3", EXPERTS_COMPACT_AT: "500", EXPERTS_RESUME_ANCHOR: "1", EXPERTS_ANCHOR_EVERY: "1" });
    delete process.env.EXPERTS_TELEMETRY;
    const toolHooks: Record<string, (e: any) => any> = {};
    const sessionHooks: Record<string, (e: any) => any> = {};
    const q = makeQueue<any>();
    const compactCalls: any[] = [];
    let subscribed: any = null;
    let transformCb: ((e: any) => void) | null = null;
    const reg = (store: Record<string, any>) => async (name: string, cb: any) => { store[name] = cb; return { dispose: async () => { delete store[name]; } }; };
    const ctx: any = {
      location: { directory: tmp, project: { directory: tmp } },
      tool: { hook: reg(toolHooks), transform: async (cb: any) => { transformCb = cb; return { dispose: async () => {} }; } },
      session: { hook: reg(sessionHooks), compact: async (i: any) => { compactCalls.push(i); return {}; } },
      event: { subscribe: (o: any) => { subscribed = o; return q.iterable; } },
    };
    const warns: string[] = [];
    const origWarn = console.warn;
    console.warn = (...a: unknown[]) => { warns.push(a.join(" ")); };

    const eh = (await import(pathToFileURL(path.join(root, "plugins-v2/expert-hooks/index.ts")).href)).default;
    const ra = (await import(pathToFileURL(path.join(root, "plugins-v2/resume-anchor/index.ts")).href)).default;
    check("v2 plugins are Plugin.define objects with ids", eh.id === "attest.expert-hooks" && ra.id === "attest.resume-anchor" && typeof eh.setup === "function");
    const cleanupEh = await eh.setup(ctx);
    check("expert-hooks setup registers execute.before/after + one tool transform and returns a cleanup", typeof toolHooks["execute.before"] === "function" && typeof toolHooks["execute.after"] === "function" && transformCb !== null && typeof cleanupEh === "function");
    check("subscription asks for exactly the step/text/compaction events (and passes an AbortSignal)", Array.isArray(subscribed?.types) && subscribed.types.includes("session.step.ended") && subscribed.types.includes("session.text.ended") && !subscribed.types.includes("session.message.content.updated") && subscribed.signal instanceof AbortSignal);

    // 17 tools, one transform
    const added: any[] = [];
    transformCb!({ add: (t: any) => added.push(t) });
    check("ctx.tool.transform registers all 17 shared tools with JSON-schema input", added.length === 17 && added.every((t) => t.name && t.input?.type === "object" && typeof t.execute === "function"), `n=${added.length}`);
    const wr = added.find((t) => t.name === "write");
    const f = path.join(tmp, "sub", "w.txt");
    const wres = await wr.execute({ filePath: f, content: "hi" }, { signal: new AbortController().signal, progress: async () => {} });
    check("a registered tool runs and returns Tool.Result { content: string }", typeof wres.content === "string" && fs.readFileSync(f, "utf8") === "hi", JSON.stringify(wres));

    // guards (throw)
    const before = (tool: string, input: unknown) => toolHooks["execute.before"]({ tool, sessionID: "s1", agent: "a", messageID: "m", id: "c", input });
    let blocked = "";
    try { await before("bash", { command: "rm -rf /" }); } catch (e) { blocked = String((e as Error).message); }
    check("execute.before blocks a dangerous bash command (reads ev.input)", /BLOCKED/.test(blocked), blocked);
    blocked = "";
    try { await before("write", { filePath: path.join(tmp, ".env"), content: "A=1" }); } catch (e) { blocked = String((e as Error).message); }
    check("execute.before blocks a write to .env", /BLOCKED|\.env/.test(blocked), blocked);

    // truncation
    const ev: any = { tool: "read", sessionID: "s1", agent: "a", messageID: "m", id: "c", input: { filePath: "/x" }, status: "completed", result: { content: "y".repeat(4000) } };
    await toolHooks["execute.after"](ev);
    check("execute.after truncates string result.content and annotates metadata", ev.result.content.length < 1500 && ev.result.content.includes("omitted by expert-hooks") && ev.result.metadata.truncatedBy === "expert-hooks");
    const ev3: any = { tool: "read", sessionID: "s1", agent: "a", messageID: "m", id: "c", input: {}, status: "error", error: { message: "nope" } };
    await toolHooks["execute.after"](ev3);
    check("execute.after leaves a failed call alone", ev3.error.message === "nope");

    // events: step.started/ended/failed, text.ended
    const step = (n: number, tokens: any, extra: any = {}) => {
      q.push({ type: "session.step.started", created: 1000 * n, data: { sessionID: "s1", assistantMessageID: `m${n}`, agent: "guide", model: { id: "mm", providerID: "pp" }, started: 1000 * n } });
      q.push({ type: "session.text.ended", created: 1000 * n + 1, data: { sessionID: "s1", assistantMessageID: `m${n}`, ordinal: 0, text: extra.text ?? `distinct text ${n} ` + "z".repeat(100) } });
      q.push({ type: "session.step.ended", created: 1000 * n + 500, data: { sessionID: "s1", assistantMessageID: `m${n}`, finish: "tool-calls", cost: 0.01, tokens } });
    };
    step(1, { input: 100, output: 200, reasoning: 5, cache: { read: 900, write: 50 } });
    await tick(); await tick();
    const telem = path.join(tmp, "docs", "work", "telemetry.jsonl");
    const rows = fs.existsSync(telem) ? fs.readFileSync(telem, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    const plugin = rows.find((x) => x.source === "plugin");
    check("telemetry row from session.step.ended: agent, model, tokens_in, cache_read, cache_write", !!plugin && plugin.agent === "guide" && plugin.model === "pp/mm" && plugin.tokens_in === 100 && plugin.cache_read === 900 && plugin.cache_write === 50 && plugin.duration_ms === 500, JSON.stringify(rows));
    check("compaction trigger fed by step.ended tokens (input+cache >= EXPERTS_COMPACT_AT) calls ctx.session.compact({ sessionID })", compactCalls.length === 1 && compactCalls[0].sessionID === "s1" && rows.some((x) => x.source === "compaction-trigger"), JSON.stringify(compactCalls));
    step(2, { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } }, { text: "same" });
    step(3, { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } }, { text: "same" });
    await tick(); await tick();
    check("turn cap (EXPERTS_MAX_TURNS=3) counts step.ended turns: next non-ledger tool is refused", await (async () => { try { await before("read", { filePath: "/x" }); return false; } catch (e) { return /TURN BUDGET/.test(String((e as Error).message)); } })());
    check("turn cap still allows ledger writes", await (async () => { try { await before("write", { filePath: path.join(tmp, "docs", "work", "TASKS_x.md"), content: "x" }); return true; } catch { return false; } })());
    check("stall guard saw identical session.text.ended text (warning emitted)", warns.some((w) => /stall|repeat/i.test(w)), warns.join("\n").slice(0, 600));
    q.push({ type: "session.compaction.ended", created: 9, data: { sessionID: "s1", reason: "auto", text: "sum" } });
    await tick();
    check("session.compaction.ended is consumed without error", true);

    // resume-anchor
    const cleanupRa = await ra.setup(ctx);
    check("resume-anchor registers context + generate + compaction hooks (not title)", ["context", "generate", "compaction"].every((n) => typeof sessionHooks[n] === "function") && !sessionHooks["title"]);
    fs.mkdirSync(path.join(tmp, "docs", "work"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "docs", "work", "TASKS_demo.md"), "# Tasks\n- [ ] one\n");
    const req: any = { sessionID: "s9", system: [{ type: "text", text: "base" }], messages: [], options: {}, agent: "guide", tools: {}, model: {} };
    await sessionHooks["context"](req);
    check("context hook appends a SystemPart anchor built from ctx.location.directory (not process.cwd)", req.system.length === 2 && req.system[1].type === "text" && /TASKS_demo|resume|anchor/i.test(req.system[1].text), JSON.stringify(req.system).slice(0, 400));
    const creq: any = { sessionID: "s9", system: [{ type: "text", text: "base" }], messages: [], options: {}, agent: "guide", tools: {}, model: {} };
    await sessionHooks["compaction"](creq);
    check("compaction hook appends the pointers-to-preserve SystemPart and never sets `result`", creq.system.length === 2 && creq.result === undefined);
    process.env.EXPERTS_RESUME_ANCHOR = "0";
    const off: any = { sessionID: "s9", system: [], messages: [], options: {}, agent: "guide", tools: {}, model: {} };
    await sessionHooks["context"](off);
    check("EXPERTS_RESUME_ANCHOR=0 disables the anchor", off.system.length === 0);

    console.warn = origWarn;
    await cleanupEh();
    await cleanupRa();
    q.close();
    check("cleanups dispose the hooks", toolHooks["execute.before"] === undefined && sessionHooks["context"] === undefined);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
