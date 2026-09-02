/**
 * test-session-model-receipt.ts -- Pass 30 chapter module for scripts/test.ts
 * (T30.2, M30 model-tier guard, G1 -- session model receipt).
 *
 * plugins/expert-hooks.ts logs the resolved provider/model + tier at session
 * start (docs/work/session-receipts.jsonl + a console first line). The
 * plugin factory itself needs a live opencode/Bun runtime to invoke, so this
 * exercises the pure pieces directly, same shape as Pass 29's
 * test-model-tier-lint.ts against scripts/lib/model-tiers.mjs:
 *   1. resolveTierForReceipt() against the live models.json registry
 *      (mirrors scripts/lib/model-tiers.mjs's resolveTier() -- same cases).
 *   2. logSessionReceipt() against a fixture project root: writes exactly
 *      one JSONL row with model+tier, and only once per session (a second
 *      call for the same info.sessionID via the plugin's own dedup Set is
 *      exercised at the event-handler level, not here -- this checks the
 *      row shape the file gets when the handler does call it).
 */

import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

export async function testSessionModelReceipt(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  // Imported from scripts/lib/, not from the plugin: a file in plugins/ must
  // export ONLY its Plugin, because OpenCode's loader calls every export as a
  // plugin factory. Exporting these helpers from there took the whole plugin
  // down with "glob.replace is not a function".
  const mod = await import(
    pathToFileURL(path.join(root, "scripts/lib/session-receipt.mjs")).href
  );
  const { resolveTierForReceipt, logSessionReceipt } = mod;
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "models.json"), "utf8"),
  );

  // -- 1. tier resolution mirrors scripts/lib/model-tiers.mjs ---------------
  const cases: Array<[string, string, string | null]> = [
    ["local — lmstudio/*", "lmstudio/qwen3.6-35b-a3b", "local"],
    ["cheap — *haiku*", "anthropic/claude-haiku-4-5", "cheap"],
    ["frontier — *opus*", "anthropic/claude-opus-4-8", "frontier"],
    ["frontier — *sonnet*", "github-copilot/claude-sonnet-5", "frontier"],
    ["no match — unknown model", "unknown/foo-bar", null],
  ];
  for (const [label, modelId, expected] of cases) {
    const got = resolveTierForReceipt(modelId, config);
    if (got === expected)
      ok(`session-model-receipt — ${label} (-> ${expected ?? "null"})`);
    else
      fail(
        `session-model-receipt — ${label}`,
        `resolveTierForReceipt("${modelId}") expected ${expected}, got ${got}`,
      );
  }

  // -- 2. logSessionReceipt() writes one row with model+tier ---------------
  function mkFixtureRoot(name: string): string {
    const dir = fs.mkdtempSync(
      path.join(fs.realpathSync(root), `.tmp-session-receipt-${name}-`),
    );
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "models.json"),
      JSON.stringify(config, null, 2),
    );
    return dir;
  }

  function readReceipts(dir: string): any[] {
    const file = path.join(dir, "docs", "work", "session-receipts.jsonl");
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  // Frontier-tier model: row must carry tier="frontier" (the exact fact the
  // opus-4.8 misconfig incident needed and didn't have).
  {
    const dir = mkFixtureRoot("frontier");
    logSessionReceipt(dir, {
      sessionID: "sess-frontier-1",
      mode: "build",
      providerID: "anthropic",
      modelID: "claude-opus-4-8",
      time: { created: 1752400000000 },
    });
    const rows = readReceipts(dir);
    if (
      rows.length === 1 &&
      rows[0].model === "anthropic/claude-opus-4-8" &&
      rows[0].tier === "frontier" &&
      rows[0].session === "sess-frontier-1"
    )
      ok(
        "session-model-receipt — logSessionReceipt() records frontier tier + model + session",
      );
    else
      fail("session-model-receipt — frontier row shape", JSON.stringify(rows));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Unrecognized model: tier resolves to null (unclassified), not a crash --
  // matches the design's "unrecognized model id -> null, not an error."
  {
    const dir = mkFixtureRoot("unclassified");
    logSessionReceipt(dir, {
      sessionID: "sess-unclassified-1",
      mode: "build",
      providerID: "unknown",
      modelID: "foo-bar",
      time: { created: 1752400000000 },
    });
    const rows = readReceipts(dir);
    if (rows.length === 1 && rows[0].tier === null)
      ok(
        "session-model-receipt — unrecognized model resolves tier=null, still receipted",
      );
    else
      fail(
        "session-model-receipt — unclassified row shape",
        JSON.stringify(rows),
      );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // No project-level models.json at all: still receipts, tier=null, no throw.
  {
    const dir = fs.mkdtempSync(
      path.join(fs.realpathSync(root), ".tmp-session-receipt-nomodels-"),
    );
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    logSessionReceipt(dir, {
      sessionID: "sess-nomodels-1",
      mode: "build",
      providerID: "lmstudio",
      modelID: "qwen3.6-35b-a3b",
      time: { created: 1752400000000 },
    });
    const rows = readReceipts(dir);
    if (rows.length === 1 && rows[0].tier === null)
      ok(
        "session-model-receipt — missing project models.json degrades to tier=null, doesn't throw",
      );
    else
      fail(
        "session-model-receipt — no-models.json row shape",
        JSON.stringify(rows),
      );
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
