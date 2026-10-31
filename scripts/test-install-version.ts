/**
 * test-install-version.ts — chapter module for scripts/test.ts.
 *
 * install.sh printed the literal "attest v1.6.0" in its banner for every
 * release from 1.6.0 to 3.11.0, so every client saw the wrong version. The
 * version now comes from package.json. This guards both halves: --version
 * matches package.json, and no banner line carries a literal version again.
 */

import { execFileSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as cli from "./lib/opencode-cli.mjs";

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

  testOpencodeMajors(root, ok, fail, pkg.version, script);
}

// ─── WP-V1: OpenCode v1 / v2 detection, the two-line experts-version stamp, and the argv helper ──
function testOpencodeMajors(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
  version: string,
  script: string,
): void {
  const check = (label: string, cond: boolean, why = "assertion false") => (cond ? ok(label) : fail(label, why));
  const plan = (env: Record<string, string>) => {
    const r = spawnSync("bash", [script, "--print-opencode-plan"], {
      encoding: "utf8",
      // PATH without any opencode so detection is driven by the override alone
      env: { ...process.env, OPENCODE_MAJOR: "", PATH: "/usr/bin:/bin", ...env },
    });
    return { status: r.status, out: `${r.stdout}`, err: `${r.stderr}` };
  };
  for (const major of ["1", "2"]) {
    const p = plan({ OPENCODE_MAJOR: major });
    check(
      `install.sh v${major}: prints "OpenCode v${major} detected", selects ${major === "2" ? "plugins-v2" : "plugins"}, stamp = version line + opencode-major=${major}`,
      p.status === 0 && p.out.includes(`OpenCode v${major} detected`) && p.out.includes(`plugins=${major === "2" ? "plugins-v2" : "plugins"}`) &&
        p.out.includes(`stamp-line-1=${version}`) && p.out.includes(`stamp-line-2=opencode-major=${major}`),
      p.out + p.err,
    );
  }
  const none = plan({});
  check("install.sh without opencode on PATH: warns and defaults to the v1 set", none.status === 0 && /opencode not found/.test(none.out) && none.out.includes("opencode-major=1"), none.out);
  const bad = plan({ OPENCODE_MAJOR: "3" });
  check("install.sh refuses an unknown major with a clear message and non-zero exit", bad.status !== 0 && /unsupported OpenCode major version '3'/.test(bad.err), bad.err);

  // detection from a real `opencode --version` (stub binary), v1 and v2 strings
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oc-major-"));
  try {
    for (const [verstr, want] of [["1.4.2", "1"], ["opencode v2.0.0-beta.3", "2"]]) {
      const bin = path.join(tmp, `bin-${want}`);
      fs.mkdirSync(bin);
      fs.writeFileSync(path.join(bin, "opencode"), `#!/bin/sh\necho "${verstr}"\n`, { mode: 0o755 });
      const r = spawnSync("bash", [script, "--print-opencode-plan"], { encoding: "utf8", env: { ...process.env, OPENCODE_MAJOR: "", PATH: `${bin}:/usr/bin:/bin` } });
      check(`install.sh parses \`opencode --version\` "${verstr}" -> v${want}`, r.status === 0 && r.stdout.includes(`opencode-major=${want}`), r.stdout + r.stderr);
    }

    // doctor.sh reports the same thing from the stamp
    const cfg = path.join(tmp, "cfg");
    fs.mkdirSync(cfg);
    fs.writeFileSync(path.join(cfg, "experts-version"), `${version}\nopencode-major=2\n`);
    const d = spawnSync("bash", [path.join(root, "scripts/doctor.sh"), cfg], { encoding: "utf8", env: { ...process.env, OPENCODE_MAJOR: "", PATH: "/usr/bin:/bin" } });
    check("doctor.sh prints `OpenCode vN detected · plugins: <set>` (from the stamp when opencode is absent)", /OpenCode v2 detected · plugins: plugins\/<name>\/index\.ts directories \(v2\)/.test(d.stdout), d.stdout.slice(0, 400));
    const du = spawnSync("bash", [path.join(root, "scripts/doctor.sh"), cfg], { encoding: "utf8", env: { ...process.env, OPENCODE_MAJOR: "7", PATH: "/usr/bin:/bin" } });
    check("doctor.sh flags an unsupported major as FAIL", /OpenCode v7 is not supported/.test(du.stdout));

    // the stamp stays readable by line-1 readers; stamped major readable by the argv helper
    check("opencode-cli: stampedOpencodeMajor reads line 2 of experts-version", cli.stampedOpencodeMajor(cfg) === 2 && cli.stampedOpencodeMajor(path.join(tmp, "nope")) === null);
    check("opencode-cli: parseOpencodeMajor handles plain, prefixed and pre-release strings", cli.parseOpencodeMajor("1.4.2") === 1 && cli.parseOpencodeMajor("opencode v2.0.0-beta.3") === 2 && cli.parseOpencodeMajor("garbage") === null);
    check("opencode-cli: OPENCODE_MAJOR env wins; absent binary + no stamp -> null",
      cli.detectOpencodeMajor({ env: { OPENCODE_MAJOR: "2" }, spawn: false }) === 2 &&
      cli.detectOpencodeMajor({ bin: path.join(tmp, "missing-bin"), env: {}, cfgDir: path.join(tmp, "nope") }) === null);
    check("opencode-cli: detectOpencodeMajor runs `<bin> --version`", cli.detectOpencodeMajor({ bin: path.join(tmp, "bin-2", "opencode"), env: {}, cfgDir: path.join(tmp, "nope") }) === 2);
    check("opencode-cli: spawn:false falls back to the install stamp", cli.detectOpencodeMajor({ bin: path.join(tmp, "bin-1", "opencode"), spawn: false, env: {}, cfgDir: cfg }) === 2);
    const a = { prompt: "do it", agent: "coder", model: "p/m", dir: "/w" };
    const v1 = ["run", "do it", "--dir", "/w", "--agent", "coder", "--model", "p/m"];
    check("opencode-cli: v1 argv is exactly today's (`run <prompt> --dir --agent [--model]`)", JSON.stringify(cli.opencodeRunArgs(1, a)) === JSON.stringify(v1) && JSON.stringify(cli.opencodeRunArgs(null, a)) === JSON.stringify(v1));
    check("opencode-cli: --agent/--model omitted when unset", JSON.stringify(cli.opencodeRunArgs(1, { prompt: "p", dir: "/w" })) === JSON.stringify(["run", "p", "--dir", "/w"]));
    check("opencode-cli: v2 argv routes through the single V2_FLAGS table (assumed == v1 until verified)", JSON.stringify(cli.opencodeRunArgs(2, a)) === JSON.stringify(["run", "do it", cli.V2_FLAGS.dir, "/w", cli.V2_FLAGS.agent, "coder", cli.V2_FLAGS.model, "p/m"]));
    const src = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
    check("conductor + integration-review build `opencode run` argv ONLY via opencodeRunArgs()", /opencodeRunArgs\(OPENCODE_MAJOR/.test(src("scripts/conductor/conductor.mjs")) && /opencodeRunArgs\(OPENCODE_MAJOR/.test(src("scripts/conductor/integration-review.mjs")) && !/\['run', prompt/.test(src("scripts/conductor/conductor.mjs") + src("scripts/conductor/integration-review.mjs")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
