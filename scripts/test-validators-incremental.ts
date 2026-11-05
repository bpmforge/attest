/**
 * test-validators-incremental.ts -- chapter module for scripts/test.ts (M-A6 / WP-A6).
 *
 * Changed-only walks + tree-hash result cache for the validators:
 *   - validate-deps.sh: second run on an unchanged tree prints `cached: true`
 *     and exits identically; touching package-lock.json invalidates;
 *     --no-cache / VALIDATE_NO_CACHE=1 bypass.
 *   - validate-lint.sh --since <sha>: only changed files are linted/reported.
 *   - validate-mermaid.sh: three runs on unchanged docs cost exactly ONE real
 *     mmdc invocation (stubbed via a PATH shim that appends to a counter file).
 *   - validate-tests.sh --scope (WP-T3, TEST_IMPACT_PLAN.md): on a 10-test-file vitest
 *     fixture (stub vitest bin that records the file args it got) a one-file change
 *     runs < 25 % of the test files, a lockfile change runs full, a green --scope full
 *     writes the ledger baseline, a red selected test changes nothing else.
 */

import { execFileSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export async function testValidatorsIncremental(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const V = path.join(root, "scripts/validators");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vinc-"));
  const fx = path.join(tmp, "repo");
  const bin = path.join(tmp, "bin");
  const counters = path.join(tmp, "counters");
  fs.mkdirSync(fx);
  fs.mkdirSync(bin);
  fs.mkdirSync(counters);

  const write = (rel: string, content: string) => {
    const full = path.join(fx, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  const git = (...a: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", ...a],
      { cwd: fx, encoding: "utf8" },
    ).trim();
  const count = (name: string) => {
    const f = path.join(counters, name);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).length : 0;
  };

  // Stub tools: every real invocation appends a line to a counter file.
  fs.writeFileSync(path.join(bin, "mmdc"), `#!/bin/sh\necho x >> "${counters}/mmdc"\nexit 0\n`, { mode: 0o755 });
  write("audit.sh", `#!/bin/sh\necho x >> "${counters}/audit"\necho '{}'\nexit 0\n`);
  write("lint.sh", `#!/bin/sh\necho "linting: $*"\nexit 1\n`);
  write("package.json", '{"name":"fx","version":"1.0.0"}\n');
  write("package-lock.json", '{"lockfileVersion":3}\n');
  write(".sdlc/sdlc.json", JSON.stringify({ deps: "sh ./audit.sh", lint: "sh ./lint.sh {files}", typecheck: "sh -c true" }));
  write("src/old.ts", "export const a = 1;\n");
  write("docs/a.md", "# A\n\n```mermaid\nflowchart TD\n  A[Start] --> B[End]\n```\n");
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD");

  const env = { ...process.env, EXPERTS_TELEMETRY: "0", PATH: `${bin}:${process.env.PATH}`, VALIDATE_SINCE: "", VALIDATE_NO_CACHE: "" };
  const run = (script: string, args: string[] = [], extra: Record<string, string> = {}) => {
    const r = spawnSync("/bin/bash", [path.join(V, script), fx, ...args], {
      encoding: "utf8",
      env: { ...env, ...extra },
    });
    return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
  };
  const check = (label: string, cond: boolean, why: string) => (cond ? ok(label) : fail(label, why));

  try {
    // -- deps: cache hit / invalidation / bypass ---------------------------
    const d1 = run("validate-deps.sh");
    const d2 = run("validate-deps.sh");
    check("deps: first run is a real run", count("audit") === 1 && !d1.err.includes("cached: true"), `audit=${count("audit")}`);
    check(
      "deps: second run prints `cached: true`, replays identical exit + JSON, no re-audit",
      d2.err.includes("cached: true") && d2.code === d1.code && d2.out === d1.out && count("audit") === 1,
      `err=${d2.err.slice(0, 120)} audit=${count("audit")}`,
    );
    write("package-lock.json", '{"lockfileVersion":3,"touched":true}\n');
    const d3 = run("validate-deps.sh");
    check("deps: touching package-lock.json invalidates the cache", !d3.err.includes("cached: true") && count("audit") === 2, `audit=${count("audit")}`);
    const d4 = run("validate-deps.sh", ["--no-cache"]);
    const d5 = run("validate-deps.sh", [], { VALIDATE_NO_CACHE: "1" });
    check("deps: --no-cache and VALIDATE_NO_CACHE=1 bypass the cache", count("audit") === 4 && !d4.err.includes("cached: true") && !d5.err.includes("cached: true"), `audit=${count("audit")}`);
    git("checkout", "--", "package-lock.json");

    // -- mermaid: 3 runs, 1 real mmdc ---------------------------------------
    const m = [run("validate-mermaid.sh"), run("validate-mermaid.sh"), run("validate-mermaid.sh")];
    check("mermaid: three runs on unchanged docs cost exactly 1 mmdc invocation", count("mmdc") === 1, `mmdc=${count("mmdc")}`);
    check(
      "mermaid: runs 2+3 are cached and identical to run 1",
      m[1].err.includes("cached: true") && m[2].err.includes("cached: true") && m[1].out === m[0].out && m[2].code === m[0].code,
      m[1].err.slice(0, 120),
    );
    run("validate-mermaid.sh", ["--no-cache"]);
    check("mermaid: --no-cache forces a real mmdc run", count("mmdc") === 2, `mmdc=${count("mmdc")}`);
    write("docs/a.md", "# A\n\n```mermaid\nflowchart TD\n  A[Start] --> C[Other]\n```\n");
    run("validate-mermaid.sh");
    check("mermaid: editing a doc invalidates the cache", count("mmdc") === 3, `mmdc=${count("mmdc")}`);

    // -- lint --since: only changed files ------------------------------------
    write("src/new.ts", "export const b = 2;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "add new");
    const l = run("validate-lint.sh", ["--since", base]);
    let scope: string[] = [];
    try {
      scope = JSON.parse(l.out.trim().split("\n").pop() ?? "{}").scope.files;
    } catch {
      /* assertion below reports it */
    }
    check("validate-lint.sh --since lists only changed files in its JSON scope", JSON.stringify(scope) === '["src/new.ts"]', JSON.stringify(scope));
    check(
      "validate-lint.sh --since passes only changed files to the linter (items name new.ts, never old.ts)",
      l.out.includes("src/new.ts") === true && !l.out.includes("old.ts") && l.code === 1 && /rc=1 for: sh \.\/lint\.sh src\/new\.ts/.test(l.out),
      l.out.slice(0, 300),
    );
    const lNone = run("validate-lint.sh", ["--since", "HEAD"]);
    check("validate-lint.sh --since HEAD (nothing changed) skips lint and exits 0", lNone.code === 0 && lNone.err.includes("skipped"), lNone.err.slice(0, 200));
    const lAll = run("validate-lint.sh");
    check("validate-lint.sh without --since keeps the whole-tree command", lAll.out.includes("{files}") && !lAll.out.includes(`"scope"`), lAll.out.slice(0, 300));

    // -- validate-tests.sh --scope: impact selection on a 10-test vitest fixture ------
    const vt = path.join(tmp, "vt");
    const vtLog = path.join(tmp, "vitest-calls.log");
    fs.mkdirSync(vt);
    const vw = (rel: string, content: string) => {
      const full = path.join(vt, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, rel.startsWith("node_modules/.bin/") ? { mode: 0o755 } : undefined);
    };
    const vg = (...a: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: vt, encoding: "utf8" }).trim();
    const mods = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"];
    const testFiles = [...mods.map((m) => `tests/${m}.test.ts`), "tests/m3b.test.ts", "tests/m4b.test.ts"];
    vw(".gitignore", "node_modules/\ndocs/work/test/\ntest-results.json\n");
    vw("package.json", '{"name":"vt","private":true,"scripts":{"test":"vitest run"},"devDependencies":{"vitest":"^2"}}\n');
    vw("package-lock.json", '{"lockfileVersion":3}\n');
    vw("vitest.config.ts", "export default {};\n");
    for (const m of mods) {
      vw(`src/${m}.ts`, `export const ${m} = 1;\n`);
      vw(`tests/${m}.test.ts`, `import { test } from 'vitest';\nimport { ${m} } from '../src/${m}';\ntest('${m}', () => ${m});\n`);
    }
    for (const m of ["m3", "m4"]) vw(`tests/${m}b.test.ts`, `import { test } from 'vitest';\nimport { ${m} } from '../src/${m}';\ntest('${m}b', () => ${m});\n`);
    // stub vitest: logs every call as one JSON line, answers `list`, writes a vitest-shaped JSON report for
    // `run --reporter=json --outputFile=<f> <files>` (a file named in $STUB_FAIL is reported + exits red)
    vw("node_modules/.bin/vitest", `#!/usr/bin/env node
const fs = require("fs"), path = require("path");
const a = process.argv.slice(2);
fs.appendFileSync(process.env.VT_LOG, JSON.stringify(a) + "\\n");
if (a[0] === "list") process.exit(0);
const files = a.slice(1).filter((x) => !x.startsWith("--"));
const outArg = a.find((x) => x.startsWith("--outputFile="));
const all = files.length ? files : fs.readdirSync("tests").map((f) => "tests/" + f);
const bad = (process.env.STUB_FAIL || "").split(",").filter(Boolean);
const testResults = all.map((f) => ({ name: path.resolve(f), status: bad.includes(f) ? "failed" : "passed", startTime: 0, endTime: 5, assertionResults: [] }));
const failed = testResults.filter((t) => t.status === "failed").length;
if (outArg) fs.writeFileSync(outArg.slice(13), JSON.stringify({ numPassedTests: testResults.length - failed, numFailedTests: failed, numTotalTests: testResults.length, success: !failed, testResults }));
process.exit(failed ? 1 : 0);
`);
    vg("init", "-q", "-b", "main");
    vg("add", "-A");
    vg("commit", "-q", "-m", "base");
    const vEnv = (extra: Record<string, string> = {}) => ({ ...env, VT_LOG: vtLog, STUB_FAIL: "", TEST_SCOPE: "", ...extra });
    const vrun = (args: string[] = [], extra: Record<string, string> = {}) => {
      const r = spawnSync("/bin/bash", [path.join(V, "validate-tests.sh"), vt, ...args], { encoding: "utf8", env: vEnv(extra), timeout: 120_000 });
      return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
    };
    const calls = (): string[][] =>
      fs.existsSync(vtLog) ? fs.readFileSync(vtLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((c: string[]) => c[0] !== "list") : [];
    const vledger = () => JSON.parse(fs.readFileSync(path.join(vt, "docs/work/test/ledger.json"), "utf8"));
    const ranFiles = (c: string[]) => c.slice(1).filter((x) => !x.startsWith("--"));
    const head0 = vg("rev-parse", "HEAD");

    // 1. green --scope full: runs the project command, writes the ledger baseline
    const f1 = vrun(["--scope", "full"]);
    check("validate-tests --scope full: green run, `Scope: full — requested` line, whole suite (project command, no file args)",
      f1.code === 0 && /^Scope: full — requested \(--scope full\)$/m.test(f1.err) && calls().length === 1 && ranFiles(calls()[0]).length === 0, `${f1.code} ${f1.err.slice(0, 300)} calls=${JSON.stringify(calls())}`);
    const L1 = vledger();
    check("validate-tests --scope full (green): ledger full record = HEAD, chain 0, every test file has a pass row",
      L1.full?.sha === head0 && L1.chain === 0 && testFiles.every((t) => L1.files[t]?.result === "pass"), JSON.stringify(L1).slice(0, 300));
    const report = fs.readdirSync(path.join(vt, "docs/reviews")).filter((f) => /^RUNTIME_tests_.*\.md$/.test(f));
    check("validate-tests: RUNTIME_tests_<date>.md still written with a PASS verdict and the Scope line",
      report.length === 1 && /\*\*Verdict:\*\* PASS/.test(fs.readFileSync(path.join(vt, "docs/reviews", report[0]), "utf8")) && /Scope: full/.test(fs.readFileSync(path.join(vt, "docs/reviews", report[0]), "utf8")), report.join(","));
    check("validate-tests: stdout stays the validator JSON envelope", /"validator":"validate-tests","gaps":0/.test(f1.out), f1.out.slice(0, 200));

    // 2. one-file change: impact, < 25 % of the test files, touching tests included
    fs.writeFileSync(path.join(vt, "src/m3.ts"), "export const m3 = 2;\n");
    vg("add", "-A"); vg("commit", "-q", "-m", "change m3");
    const head1 = vg("rev-parse", "HEAD");
    fs.writeFileSync(vtLog, "");
    const f2 = vrun();
    const c2 = calls();
    const ran2 = c2.flatMap(ranFiles).sort();
    check(`validate-tests (auto): one-file change prints \`Scope: impact — 2 of 10 (8 unaffected, 0 always, 0 rolling); last full <date> @ <sha7>\``,
      f2.code === 0 && new RegExp(`^Scope: impact — 2 of 10 \\(8 unaffected, 0 always, 0 rolling\\); last full \\d{4}-\\d{2}-\\d{2} @ ${head0.slice(0, 7)}$`, "m").test(f2.err), f2.err.slice(0, 400));
    check("validate-tests (auto): a one-file change runs < 25 % of the test files and includes the touching tests",
      c2.length === 1 && ran2.length / testFiles.length < 0.25 && JSON.stringify(ran2) === JSON.stringify(["tests/m3.test.ts", "tests/m3b.test.ts"]), JSON.stringify(c2));
    check("validate-tests (impact): vitest got `run`, the json reporter and only the selected files", c2[0]?.[0] === "run" && c2[0].includes("--reporter=json"), JSON.stringify(c2[0]));
    const L2 = vledger();
    check("validate-tests (impact): chain +1, full record untouched, per-file rows for the files that ran",
      L2.chain === 1 && L2.full.sha === head0 && L2.files["tests/m3.test.ts"].sha === head1 && L2.files["tests/m3b.test.ts"].result === "pass" && L2.files["tests/m1.test.ts"].sha === head0, JSON.stringify(L2).slice(0, 400));
    check("validate-tests (impact): test-results.json (mapping contract) is the vitest-shape report of what ran",
      JSON.parse(fs.readFileSync(path.join(vt, "test-results.json"), "utf8")).testResults?.length === 2);
    const f2b = vrun(["--scope", "impact"]);
    check("validate-tests --scope impact: same selection as auto", f2b.code === 0 && /^Scope: impact — 2 of 10 /m.test(f2b.err) && calls().length === 2, f2b.err.slice(0, 200));

    // 3. a red selected test: gap, nothing re-run, nothing else changes
    fs.writeFileSync(path.join(vt, "src/m4.ts"), "export const m4 = 2;\n");
    vg("add", "-A"); vg("commit", "-q", "-m", "change m4");
    fs.writeFileSync(vtLog, "");
    const chainBefore = vledger().chain;
    const f3 = vrun([], { STUB_FAIL: "tests/m4b.test.ts" });
    const L3 = vledger();
    check("validate-tests (impact): a failing selected test fails the validator with tests-failed and is NOT re-run",
      f3.code === 1 && /"category":"tests-failed"/.test(f3.out) && calls().length === 1, `${f3.code} ${f3.out.slice(0, 200)} calls=${calls().length}`);
    check("validate-tests (impact, red): ledger records the failure per file, chain +1, baseline unchanged",
      L3.files["tests/m4b.test.ts"].result === "fail" && L3.files["tests/m4.test.ts"].result === "pass" && L3.chain === chainBefore + 1 && L3.full.sha === head0, JSON.stringify(L3).slice(0, 300));
    fs.writeFileSync(vtLog, "");
    const f3b = vrun();
    check("validate-tests: the next run re-selects the failed-last-run file (green again)",
      f3b.code === 0 && calls().flatMap(ranFiles).includes("tests/m4b.test.ts") && vledger().files["tests/m4b.test.ts"].result === "pass", f3b.err.slice(0, 300));

    // 4. lockfile change -> full (project command, whole suite), green -> new baseline, chain reset
    fs.writeFileSync(path.join(vt, "package-lock.json"), '{"lockfileVersion":3,"bumped":true}\n');
    vg("add", "-A"); vg("commit", "-q", "-m", "bump lock");
    const head3 = vg("rev-parse", "HEAD");
    fs.writeFileSync(vtLog, "");
    const f4 = vrun();
    check("validate-tests (auto): a lockfile change runs the full suite (`Scope: full — global-input:package-lock.json`)",
      f4.code === 0 && /^Scope: full — global-input:package-lock\.json$/m.test(f4.err) && calls().length === 1 && ranFiles(calls()[0]).length === 0, `${f4.err.slice(0, 300)} ${JSON.stringify(calls())}`);
    const L4 = vledger();
    check("validate-tests: a green auto-escalated full run becomes the new baseline and resets the chain", L4.full.sha === head3 && L4.chain === 0, JSON.stringify(L4).slice(0, 200));
    const f5 = vrun([], { TEST_SCOPE: "full" });
    check("validate-tests: TEST_SCOPE=full env is honoured; --scope bogus is a usage error",
      /^Scope: full — requested/m.test(f5.err) && vrun(["--scope", "bogus"]).code === 2, f5.err.slice(0, 200));

    // 5. callers: phase gate passes --test-scope, coverage loop defaults iterations 2-3 to impact, phase-5 is always full
    fs.writeFileSync(path.join(vt, "src/m6.ts"), "export const m6 = 2;\n");
    vg("add", "-A"); vg("commit", "-q", "-m", "change m6");
    const gate = (args: string[], extra: Record<string, string> = {}, script = "validate-phase-gate.sh") => {
      fs.writeFileSync(vtLog, "");
      const r = spawnSync("/bin/bash", [path.join(V, script), ...args], { encoding: "utf8", env: vEnv(extra), timeout: 120_000 });
      return { code: r.status ?? -1, out: r.stdout + r.stderr, calls: calls() };
    };
    const g1 = gate(["phase-4", vt, "--test-scope", "impact"], { TEST_SCOPE: "full" });
    check("validate-phase-gate.sh phase-4 --test-scope impact: validate-tests.sh gets --scope impact (explicit beats TEST_SCOPE=full)",
      g1.calls.length === 1 && JSON.stringify(g1.calls[0].filter((x) => !x.startsWith("--"))) === JSON.stringify(["run", "tests/m6.test.ts"]), JSON.stringify(g1.calls));
    const g2 = gate(["phase-4", vt], { TEST_SCOPE: "full" });
    check("validate-phase-gate.sh phase-4 without --test-scope: validate-tests.sh keeps its own default (TEST_SCOPE=full honoured)",
      g2.calls.length === 1 && ranFiles(g2.calls[0]).length === 0, JSON.stringify(g2.calls));
    const g5 = gate(["phase-5", vt, "--test-scope", "impact"]);
    check("validate-phase-gate.sh phase-5: always the full suite, even when --test-scope impact is asked",
      g5.calls.length === 1 && ranFiles(g5.calls[0]).length === 0, JSON.stringify(g5.calls));
    const bogus = spawnSync("/bin/bash", [path.join(V, "validate-phase-gate.sh"), "phase-4", vt, "--test-scope", "bogus"], { encoding: "utf8", env: vEnv() });
    check("validate-phase-gate.sh: an unknown --test-scope is a usage error (exit 2)", bogus.status === 2, String(bogus.status));
    // coverage loop: TEST_SCOPE=full in the env stands in for "whatever the phase gate defaults to"
    for (const f of fs.readdirSync(path.join(vt, "docs/work")).filter((n) => n.startsWith("COVERAGE_LOOP_"))) fs.rmSync(path.join(vt, "docs/work", f));
    const cl1 = gate(["phase-4", vt], { TEST_SCOPE: "full" }, "run-coverage-loop.sh");
    // iteration 1 was a green full run (new baseline); the gap-fill between iterations changes one file
    fs.writeFileSync(path.join(vt, "src/m7.ts"), "export const m7 = 2;\n");
    vg("add", "-A"); vg("commit", "-q", "-m", "change m7");
    const cl2 = gate(["phase-4", vt], { TEST_SCOPE: "full" }, "run-coverage-loop.sh");
    check("run-coverage-loop.sh: iteration 1 keeps the phase gate's default (full via env), iteration 2 defaults to impact",
      cl1.calls.length === 1 && ranFiles(cl1.calls[0]).length === 0 && cl2.calls.length === 1 && JSON.stringify(ranFiles(cl2.calls[0])) === '["tests/m7.test.ts"]',
      `${JSON.stringify(cl1.calls)} ${JSON.stringify(cl2.calls)}`);
    const cl3 = gate(["phase-4", vt, "--test-scope", "full"], {}, "run-coverage-loop.sh");
    check("run-coverage-loop.sh --test-scope full overrides the iteration-2+ impact default",
      cl3.calls.length === 1 && ranFiles(cl3.calls[0]).length === 0, JSON.stringify(cl3.calls));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
