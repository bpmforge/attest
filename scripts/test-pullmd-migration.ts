/**
 * test-pullmd-migration.ts — Pass 39 chapter module for scripts/test.ts.
 *
 * Covers scripts/migrate-remove-pullmd.sh (v2.2.1 upgrade migration): it must strip a stale
 * `mcp.pullmd` entry from an opencode.json while preserving every other MCP + setting, back up
 * the original, and be a clean no-op when there's no pullmd entry. Container/clone cleanup is
 * best-effort and machine-dependent, so these tests scope it out with PULLMD_DIR=/nonexistent
 * and only assert the deterministic config behavior.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

export async function testPullmdMigration(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const script = path.join(root, "scripts/migrate-remove-pullmd.sh");
  const run = (cfg: string) => {
    try {
      execFileSync("/bin/bash", [script, "--config", cfg], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PULLMD_DIR: "/nonexistent-pullmd-dir" },
      });
    } catch {
      /* best-effort container step may exit non-zero on some hosts; config work still ran */
    }
  };

  try {
    const dir = fs.mkdtempSync(
      path.join(fs.realpathSync(root), ".tmp-pullmd-mig-"),
    );
    try {
      // -- 1. strips pullmd, preserves everything else, writes a backup ------------------
      const cfg = path.join(dir, "opencode.json");
      fs.writeFileSync(
        cfg,
        JSON.stringify({
          mcp: {
            context7: { type: "local", command: ["npx"], enabled: true },
            "playwright-search": {
              type: "local",
              command: ["node"],
              enabled: true,
            },
            pullmd: {
              type: "remote",
              url: "http://localhost:33000/mcp",
              enabled: true,
            },
          },
          provider: { lmstudio: { baseURL: "http://127.0.0.1:1234/v1" } },
        }),
      );
      run(cfg);
      const after = JSON.parse(fs.readFileSync(cfg, "utf8"));
      const keys = Object.keys(after.mcp).sort();
      const backupExists = fs.existsSync(`${cfg}.pre-pullmd-removal.bak`);
      if (
        !("pullmd" in after.mcp) &&
        keys.length === 2 &&
        keys.includes("context7") &&
        keys.includes("playwright-search") &&
        after.provider?.lmstudio?.baseURL === "http://127.0.0.1:1234/v1" &&
        backupExists
      )
        ok(
          "pullmd-migration — strips mcp.pullmd, keeps context7 + playwright-search + provider, writes backup",
        );
      else
        fail(
          "pullmd-migration — config removal",
          `mcp keys after = ${JSON.stringify(keys)}, backup=${backupExists}, provider kept=${!!after.provider?.lmstudio}`,
        );

      // -- 2. idempotent / no-op when there is no pullmd entry ---------------------------
      const clean = path.join(dir, "clean.json");
      fs.writeFileSync(clean, JSON.stringify({ mcp: { context7: {} } }));
      run(clean);
      const cleanAfter = JSON.parse(fs.readFileSync(clean, "utf8"));
      const noBackup = !fs.existsSync(`${clean}.pre-pullmd-removal.bak`);
      if (
        Object.keys(cleanAfter.mcp).length === 1 &&
        "context7" in cleanAfter.mcp &&
        noBackup
      )
        ok(
          "pullmd-migration — no pullmd entry is a clean no-op (no backup churn, config untouched)",
        );
      else
        fail(
          "pullmd-migration — no-op path",
          `mcp=${JSON.stringify(Object.keys(cleanAfter.mcp))} noBackup=${noBackup}`,
        );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("pullmd-migration", `unexpected failure: ${message}`);
  }
}
