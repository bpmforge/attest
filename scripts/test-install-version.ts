/**
 * test-install-version.ts — chapter module for scripts/test.ts.
 *
 * install.sh printed the literal "attest v1.6.0" in its banner for every
 * release from 1.6.0 to 3.11.0, so every client saw the wrong version. The
 * version now comes from package.json. This guards both halves: --version
 * matches package.json, and no banner line carries a literal version again.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export function testInstallVersion(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const script = path.join(root, "install.sh");

  try {
    const out = execFileSync("bash", [script, "--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (out === `attest v${pkg.version}`) {
      ok(`install.sh --version reports package.json (v${pkg.version})`);
    } else {
      fail("install.sh --version", `printed "${out}", package.json says ${pkg.version}`);
    }
  } catch (err: unknown) {
    fail("install.sh --version", String((err as Error).message).slice(0, 200));
  }

  const literal = fs
    .readFileSync(script, "utf8")
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /echo\s+"attest v\d+\.\d+\.\d+/.test(line));
  if (literal.length === 0) {
    ok("install.sh — no echo line hard-codes an attest version");
  } else {
    fail(
      "install.sh — hard-coded version",
      literal.map(({ line, n }) => `${n}: ${line.trim()}`).join(" | "),
    );
  }
}
