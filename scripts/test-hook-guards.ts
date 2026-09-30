/**
 * test-hook-guards.ts — Pass 58 chapter module for scripts/test.ts (Group K).
 * Pure predicates in scripts/lib/hook-guards.mjs + a wiring check that the
 * plugin actually calls them (a guard nothing invokes protects nothing).
 */

import * as fs from "fs";
import * as path from "path";
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
}
