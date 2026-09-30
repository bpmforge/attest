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

  // K2 gateguard
  const off = new Set<string>();
  check("K2 off by default", gateguardCheck(off, "s", "/p/a.ts", true, {}) === null && off.size === 0);
  const st = new Set<string>();
  const env = { EXPERTS_GATEGUARD: "1" };
  check("K2 first edit denied with fact request", /importe?r|import/i.test(gateguardCheck(st, "s", "/p/a.ts", true, env) ?? ""));
  check("K2 retry allowed", gateguardCheck(st, "s", "/p/a.ts", true, env) === null);
  check("K2 next file gated separately", gateguardCheck(st, "s", "/p/b.ts", true, env) !== null);
  check("K2 new session re-gates", gateguardCheck(st, "s2", "/p/a.ts", true, env) !== null);
  check("K2 create gate asks for callers", /call/i.test(gateguardCheck(new Set(), "s", "/p/n.ts", false, env) ?? ""));

  // wiring
  const plugin = fs.readFileSync(path.join(root, "plugins/expert-hooks.ts"), "utf8");
  check(
    "plugin imports and invokes both guards",
    /configProtectionCheck\(/.test(plugin) && /gateguardCheck\(/.test(plugin) && /hook-guards\.mjs/.test(plugin),
  );
}
