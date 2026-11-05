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
    const v2 = cli.opencodeRunSpec(2, a);
    check("opencode-cli: v2 argv has NO --dir (verified 2.2.5): `run <prompt> --agent --model`, cwd = dir", JSON.stringify(v2.args) === JSON.stringify(["run", "do it", "--agent", "coder", "--model", "p/m"]) && v2.cwd === "/w" && !v2.args.includes("--dir"));
    check("opencode-cli: v2 unattended adds --auto (v2 only); v1 unattended argv is unchanged", JSON.stringify(cli.opencodeRunSpec(2, { ...a, unattended: true }).args) === JSON.stringify(["run", "do it", "--agent", "coder", "--model", "p/m", "--auto"]) && JSON.stringify(cli.opencodeRunArgs(1, { ...a, unattended: true })) === JSON.stringify(v1));
    check("opencode-cli: v1 spec has cwd undefined; no --format json is ever added", cli.opencodeRunSpec(1, a).cwd === undefined && !cli.opencodeRunSpec(2, { ...a, unattended: true }).args.includes("--format"));
    const src = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
    check("conductor + integration-review build `opencode run` argv ONLY via opencodeRunSpec() and spawn with its cwd", /opencodeRunSpec\(OPENCODE_MAJOR[^)]*unattended: true/.test(src("scripts/conductor/conductor.mjs")) && /opencodeRunSpec\(OPENCODE_MAJOR[^)]*unattended: true/.test(src("scripts/conductor/integration-review.mjs")) && /cwd: spec\.cwd/.test(src("scripts/conductor/conductor.mjs") + src("scripts/conductor/integration-review.mjs")) && !/\['run', prompt/.test(src("scripts/conductor/conductor.mjs") + src("scripts/conductor/integration-review.mjs")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * install.sh registers bpm-memory-mcp / bpm-code-search-mcp with the ABSOLUTE
 * Node matching the server repo's pin (.nvmrc / .node-version / engines). A
 * bare "node" meant whichever Node was on PATH when opencode started, and a
 * native addon built under Node 24 cannot load under Node 22 (doctor: "built
 * and registered but does not respond", 2026-11-05).
 */
export function testInstallMcpNodePin(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const check = (label: string, cond: boolean, why = "") => (cond ? ok(label) : fail(label, why));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "attest-mcp-node-"));
  try {
    // Extract just the helper functions from install.sh so they can be sourced alone.
    const src = fs.readFileSync(path.join(root, "install.sh"), "utf8");
    const start = src.indexOf("mcp_node_major() {");
    const end = src.indexOf("# ─────", start);
    check("install.sh defines the mcp_node_* helpers", start > 0 && end > start, "helpers not found");
    if (!(start > 0 && end > start)) return;
    const lib = path.join(tmp, "lib.sh");
    fs.writeFileSync(lib, src.slice(start, end));
    const major = process.versions.node.split(".")[0];
    const other = String(Number(major) + 1);
    // fake fnm install of the "other" major; the fake node reports that version
    const fnm = path.join(tmp, "fnm", "node-versions", `v${other}.1.0`, "installation", "bin");
    fs.mkdirSync(fnm, { recursive: true });
    fs.writeFileSync(path.join(fnm, "node"), `#!/bin/sh\n[ "$1" = "-v" ] && { echo v${other}.1.0; exit 0; }\n[ "$1" = "-p" ] && { echo ${other}; exit 0; }\n`, { mode: 0o755 });
    const pinned = path.join(tmp, "pinned"); fs.mkdirSync(pinned); fs.writeFileSync(path.join(pinned, ".nvmrc"), `${other}\n`);
    const engines = path.join(tmp, "engines"); fs.mkdirSync(engines); fs.writeFileSync(path.join(engines, "package.json"), JSON.stringify({ engines: { node: `>=${major}` } }));
    const unpinned = path.join(tmp, "unpinned"); fs.mkdirSync(unpinned);
    const run = (cmd: string) => spawnSync("bash", ["-c", `. "${lib}"; ${cmd}`], { encoding: "utf8", env: { ...process.env, FNM_DIR: path.join(tmp, "fnm"), NVM_DIR: path.join(tmp, "no-nvm"), HOME: tmp } });
    check("mcp_node_major reads .nvmrc / engines / nothing", run(`mcp_node_major "${pinned}"; echo; mcp_node_major "${engines}"; echo; mcp_node_major "${unpinned}"`).stdout === `${other}\n${major}\n`, "unexpected majors");
    check("mcp_node_for: pinned major not on PATH -> fnm install of that major", run(`mcp_node_for "${pinned}"`).stdout === path.join(fnm, "node"), run(`mcp_node_for "${pinned}"`).stdout);
    check("mcp_node_for: pin matching the current Node -> current node's execPath", fs.realpathSync(run(`mcp_node_for "${engines}"`).stdout.trim()) === fs.realpathSync(process.execPath), run(`mcp_node_for "${engines}"`).stdout);
    check("mcp_node_for: unpinned -> node on PATH; unknown pin warns and falls back", run(`mcp_node_for "${unpinned}"`).stdout.length > 0 && /pins Node 99/.test(run(`mkdir -p "${tmp}/p99"; echo 99 > "${tmp}/p99/.nvmrc"; mcp_node_for "${tmp}/p99"`).stderr), "fallback");
    // mcp_build: a server that answers initialize with a matching stamp is not rebuilt
    const srv = path.join(tmp, "srv"); fs.mkdirSync(path.join(srv, "src"), { recursive: true }); fs.mkdirSync(path.join(srv, "dist"));
    fs.writeFileSync(path.join(srv, "dist", "index.js"), `process.stdin.on('data',()=>{process.stdout.write(JSON.stringify({result:{serverInfo:{name:'x'}}})+'\\n');process.exit(0)})`);
    fs.writeFileSync(path.join(srv, "package-lock.json"), "{}");
    fs.writeFileSync(path.join(srv, "src", "index.ts"), "");
    fs.utimesSync(path.join(srv, "dist", "index.js"), new Date(), new Date(Date.now() + 5000));
    fs.writeFileSync(path.join(srv, ".attest-build-stamp"), run(`mcp_stamp "${srv}" "${process.execPath}"`).stdout);
    const r1 = run(`mcp_build "${srv}" "${process.execPath}" "${srv}/dist/index.js"`);
    check("mcp_build skips a server that answers initialize with an unchanged node+lock stamp", r1.status === 0 && !/Building/.test(r1.stdout), r1.stdout + r1.stderr);
    fs.writeFileSync(path.join(srv, ".attest-build-stamp"), "v0.0.0:0");
    const r2 = run(`mcp_build "${srv}" "${process.execPath}" "${srv}/dist/index.js"`);
    check("mcp_build rebuilds when the Node/lock stamp changed", /Building srv with/.test(r2.stdout), r2.stdout);
    const reg = src.slice(src.indexOf("# --- bpm-memory-mcp MCP Setup"));
    check("install.sh registers memory and code-search with the pinned node path (no bare \"node\")", !/command: \["node", \$path\]/.test(reg) && /\$MEMORY_NODE/.test(reg) && /\$CODE_SEARCH_NODE/.test(reg) && !/claude mcp add (memory|code-search) node /.test(reg), "bare node still registered");
    const doc = fs.readFileSync(path.join(root, "scripts/doctor.sh"), "utf8");
    check("doctor.sh probes with the registered binary and names a Node-pin mismatch", /\| "\$bin" "\$arg"/.test(doc) && /pins Node \$pin/.test(doc), "doctor probe");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
