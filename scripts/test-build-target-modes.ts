/**
 * test-build-target-modes.ts — chapter module for scripts/test.ts.
 *
 * build-target-claude.mjs must carry each source file's permission bits into
 * the generated copy. writeFileSync only applies a mode when it CREATES a
 * file, so a recreated target came out 0644 and attest-claude's scripts/*.mjs
 * flipped between 644 and 755 across regens (seen on stack-coherence.mjs).
 *
 * Seam: the CLI's `--out <dir>`. Build into a temp dir, then:
 *   1. every generated file's executable bits equal its source's
 *   2. stripping +x from one generated file makes --check report mode drift
 *   3. --write over the existing (now 0644) file restores the source mode
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

const PROBE = "scripts/stack-coherence.mjs";

export function testBuildTargetModes(root: string, ok: OK, fail: FAIL): void {
  const build = path.join(root, "scripts/build-target-claude.mjs");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "build-target-modes-"));
  const run = (mode: string) =>
    spawnSync("node", [build, mode, "--out", out], { encoding: "utf8" });
  const xbits = (p: string) => fs.statSync(p).mode & 0o111;

  try {
    const w = run("--write");
    if (w.status !== 0) {
      fail("build --write into temp dir", `exit ${w.status}\n${w.stderr}`);
      return;
    }

    const manifest = fs
      .readFileSync(path.join(out, "GENERATED_FILES.txt"), "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"));
    const mismatched = manifest.filter((rel) => {
      const src = path.join(root, rel);
      return fs.existsSync(src) && xbits(src) !== xbits(path.join(out, rel));
    });
    if (mismatched.length) {
      fail(
        "generated files keep their source's executable bit",
        mismatched.slice(0, 5).join(", "),
      );
    } else {
      ok(
        `generated files keep their source's executable bit (${manifest.length} checked)`,
      );
    }

    if (!xbits(path.join(root, PROBE))) {
      fail(
        "probe source is executable",
        `${PROBE} lost +x in the canonical repo`,
      );
      return;
    }
    const dest = path.join(out, PROBE);
    fs.chmodSync(dest, 0o644);
    const c = run("--check");
    if (/stack-coherence\.mjs \(mode 644, source 755\)/.test(c.stdout)) {
      ok("--check reports a generated file whose mode drifted from source");
    } else {
      fail("--check reports mode drift", c.stdout.slice(0, 800));
    }

    run("--write");
    if (xbits(dest) === 0o111) {
      ok("--write restores the source mode on an existing 0644 target");
    } else {
      fail(
        "--write restores mode",
        `mode is ${(fs.statSync(dest).mode & 0o777).toString(8)}`,
      );
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}
