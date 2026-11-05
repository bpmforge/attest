/**
 * test-test-impact.ts — WP-T1 / WP-T2 (TEST_IMPACT_PLAN.md) for scripts/test.ts.
 *
 * scripts/test/map.mjs builds the impact map (test file -> transitive repo files it imports),
 * ledger.mjs keeps the last-green-full-run ledger, select.mjs picks the tests a change can break.
 * Fixtures are tiny tmp git repos per stack (node: vitest layout + jest layout, python, go, rust),
 * deleted afterwards. vitest / jest / playwright / python3 are replaced by stubs (node_modules/.bin,
 * PATH) so the arg forms and the union are exact and network-free (the real binaries were probed
 * separately); go list and cargo metadata run for real.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

type Obj = Record<string, any>;

export async function testTestImpact(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const tdir = path.join(root, "scripts/test");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "test-impact-"));
  const check = (cond: boolean, label: string, detail = "") =>
    cond ? ok(label) : fail(label, detail || "assertion false");
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  } as NodeJS.ProcessEnv;
  const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

  const gitIn = (cwd: string, ...args: string[]) => {
    const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const mkfx = (name: string, files: Record<string, string>) => {
    const dir = path.join(tmp, name);
    fs.mkdirSync(dir, { recursive: true });
    gitIn(dir, "init", "-q", "-b", "main");
    put(dir, ".gitignore", "node_modules/\ndocs/work/test/\ntarget/\n");
    for (const [f, c] of Object.entries(files)) put(dir, f, c);
    commit(dir, "init");
    return dir;
  };
  const put = (dir: string, rel: string, content: string) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  const commit = (dir: string, msg: string) => { gitIn(dir, "add", "-A"); gitIn(dir, "commit", "-q", "-m", msg); };
  const node = (script: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}) => {
    const r = spawnSync(process.execPath, [path.join(tdir, script), ...args], { env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 90_000 });
    let out: any = null;
    try { out = JSON.parse(r.stdout); } catch { /* caller reports */ }
    return { out, err: r.stderr, status: r.status, raw: r.stdout };
  };
  const refresh = (dir: string, ...a: string[]) => node("map.mjs", ["refresh", "--root", dir, ...a]);
  const select = (dir: string, a: string[] = [], e: NodeJS.ProcessEnv = {}) => node("select.mjs", ["--root", dir, ...a], e);
  const readMap = (dir: string): Obj => JSON.parse(fs.readFileSync(path.join(dir, "docs/work/test/map.json"), "utf8"));
  const ledgerFile = (dir: string) => path.join(dir, "docs/work/test/ledger.json");
  const readLedger = (dir: string): Obj => JSON.parse(fs.readFileSync(ledgerFile(dir), "utf8"));
  const recordFull = (dir: string, scope = "full", failing: string[] = []) => {
    refresh(dir);
    const results = Object.keys(readMap(dir).tests).map((f) => ({ file: f, result: failing.includes(f) ? "fail" : "pass", ms: 5, flaky: false }));
    const rf = path.join(tmp, `results-${path.basename(dir)}.json`);
    fs.writeFileSync(rf, JSON.stringify(results));
    return node("ledger.mjs", ["record", "--root", dir, "--scope", scope, "--results", rf]);
  };
  const stubBin = (dir: string, name: string, body: string) => {
    const p = path.join(dir, "node_modules/.bin", name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
  };

  try {
    // =============================================================== node: vitest layout
    const nv = mkfx("nv", {
      "package.json": '{"name":"nv","private":true,"workspaces":["packages/*"],"devDependencies":{"vitest":"^2"}}\n',
      "vitest.config.ts": "export default {};\n",
      "playwright.config.ts": "export default { testDir: 'e2e' };\n",
      "tsconfig.json": '{\n // paths with a star and a comment\n "compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["src/*"]},},\n}\n',
      "packages/lib/package.json": '{"name":"@nv/lib","main":"dist/index.js","source":"src/index.ts"}\n',
      "packages/lib/src/index.ts": "export const lib = 1;\n",
      "src/util.ts": "export const u = 1;\n",
      "src/a.ts": "import { u } from './util.js';\nexport const a = u;\n",
      "src/b.ts": "import { u } from '@/util';\nexport const b = u;\n",
      "src/other.ts": "export const o = 1;\n",
      "src/index.ts": "export * from './a';\n",
      "src/w.ts": "import { lib } from '@nv/lib';\nexport const w = lib;\n",
      "tests/a.test.ts": "import { test } from 'vitest';\nimport { a } from '../src/a';\ntest('a', () => a);\n",
      "tests/b.test.ts": "import { test } from 'vitest';\nimport { b } from '../src/b';\ntest('b', () => b);\n",
      "tests/deep.test.ts": "import { test } from 'vitest';\nimport * as all from '../src/index';\ntest('deep', () => all);\n",
      "tests/c.test.ts": "import { test } from 'vitest';\nimport { o } from '../src/other';\ntest('c', () => o);\n",
      "tests/w.test.ts": "import { test } from 'vitest';\nimport { w } from '../src/w';\ntest('w', () => w);\n",
      "tests/p0.test.ts": "import { describe } from 'vitest';\nimport { o } from '../src/other';\ndescribe('UC-01 login', () => o);\n",
      "tests/smoke.test.ts": "import { o } from '../src/other';\nvoid o;\n",
      "tests/db.test.ts": "import request from 'supertest';\nimport { o } from '../src/other';\nvoid [request, o];\n",
      "e2e/flow.spec.ts": "import { test } from '@playwright/test';\nimport { a } from '../src/a';\ntest('flow', () => a);\n",
      "docs/testing/USE_CASES.md": "| UC-01 | login | P0 |\n| UC-02 | export | P1 |\n",
    });
    const NV_ALL = ["tests/a.test.ts", "tests/b.test.ts", "tests/deep.test.ts", "tests/c.test.ts", "tests/w.test.ts", "tests/p0.test.ts", "tests/smoke.test.ts", "tests/db.test.ts", "e2e/flow.spec.ts"];

    const r1 = refresh(nv);
    check(r1.status === 0 && r1.out?.tests === NV_ALL.length && r1.out?.full === true, "test-impact: map build discovers every test file (vitest layout)", r1.err + r1.raw);
    const m1 = readMap(nv);
    const covers = (m: Obj, t: string): string[] => m.tests[t]?.covers ?? [];
    const importersOfUtil = ["tests/a.test.ts", "tests/b.test.ts", "tests/deep.test.ts", "e2e/flow.spec.ts"];
    check(importersOfUtil.every((t) => covers(m1, t).includes("src/util.ts")), "test-impact: covers[] of a shared util lists every transitive importer (relative, .js->.ts, tsconfig alias, re-export index)", JSON.stringify(importersOfUtil.map((t) => covers(m1, t))));
    check(!["tests/c.test.ts", "tests/w.test.ts", "tests/p0.test.ts", "tests/smoke.test.ts", "tests/db.test.ts"].some((t) => covers(m1, t).includes("src/util.ts")), "test-impact: tests unrelated to the util do not cover it");
    check(covers(m1, "tests/w.test.ts").includes("packages/lib/src/index.ts"), "test-impact: package.json workspace import resolves to the package's source entry", JSON.stringify(covers(m1, "tests/w.test.ts")));
    check(covers(m1, "tests/deep.test.ts").includes("src/a.ts") && covers(m1, "tests/deep.test.ts").includes("src/index.ts"), "test-impact: transitive closure goes through re-exporting index");
    check(m1.tests["tests/smoke.test.ts"].kind === "smoke" && m1.tests["tests/db.test.ts"].kind === "integration" && m1.tests["e2e/flow.spec.ts"].kind === "e2e" && m1.tests["tests/a.test.ts"].kind === "unit", "test-impact: kind = smoke / integration (db/http import) / e2e / unit", JSON.stringify(Object.fromEntries(Object.entries(m1.tests).map(([k, v]: any) => [k, v.kind]))));
    check(m1.tests["e2e/flow.spec.ts"].runner === "playwright" && m1.tests["tests/a.test.ts"].runner === "vitest", "test-impact: runner per test (playwright vs vitest)");
    check(JSON.stringify(m1.tests["tests/p0.test.ts"].uc) === '["UC-01"]' && m1.meta.uc_priority["UC-01"] === "P0", "test-impact: uc[] from describe(...UC-01...) and P0 from USE_CASES.md", JSON.stringify(m1.tests["tests/p0.test.ts"].uc));

    // ---- incremental refresh
    const r2 = refresh(nv);
    check(r2.out?.parsed === 0 && r2.out?.reused === r1.out?.parsed, "test-impact: second refresh re-parses nothing (all files reused by sha)", r2.raw);
    put(nv, "tests/c.test.ts", `${fs.readFileSync(path.join(nv, "tests/c.test.ts"), "utf8")}// touched\n`);
    const r3 = refresh(nv);
    check(r3.out?.parsed === 1, "test-impact: touching one test file re-parses exactly that file", r3.raw);
    put(nv, "src/util.ts", "import { x } from './extra';\nexport const u = x;\n");
    put(nv, "src/extra.ts", "export const x = 1;\n");
    const r4 = refresh(nv);
    const m4 = readMap(nv);
    check(r4.out?.parsed === 2 && importersOfUtil.every((t) => covers(m4, t).includes("src/extra.ts")), "test-impact: a new import in the util reaches every importer's covers[] without re-parsing the importers", r4.raw);
    const r5 = refresh(nv, "--full");
    check(r5.out?.parsed === r5.out?.files && r5.out?.reused === 0, "test-impact: --full re-parses everything", r5.raw);
    gitIn(nv, "checkout", "-q", "--", "tests/c.test.ts", "src/util.ts");
    fs.rmSync(path.join(nv, "src/extra.ts"));
    refresh(nv);

    // ---- declare / show
    const dcl = node("map.mjs", ["declare", "--root", nv, "tests/c.test.ts", "src/w.ts"]);
    const shown = node("map.mjs", ["show", "--root", nv, "tests/c.test.ts"]);
    check(dcl.status === 0 && shown.out?.covers?.includes("src/w.ts") && shown.out?.declared?.[0] === "src/w.ts", "test-impact: map.mjs declare records covers; show prints it", shown.raw);
    refresh(nv);
    check(readMap(nv).tests["tests/c.test.ts"].covers.includes("src/w.ts"), "test-impact: declared covers survive a refresh");
    check(node("map.mjs", ["declare", "--root", nv, "tests/c.test.ts"]).status === 2, "test-impact: declare without sources is a usage error");
    // remove the declaration again so the selection assertions below are exact
    // declarations are committed: .sdlc/test-covers.json, sorted and stable, and a fresh clone's build merges them
    const covFile = path.join(nv, ".sdlc/test-covers.json");
    node("map.mjs", ["declare", "--root", nv, "tests/a.test.ts", "src/other.ts", "src/b.ts"]);
    node("map.mjs", ["declare", "--root", nv, "tests/a.test.ts", "src/b.ts"]);
    const covJson = JSON.parse(fs.readFileSync(covFile, "utf8"));
    check(JSON.stringify(covJson) === JSON.stringify({ "tests/a.test.ts": ["src/b.ts", "src/other.ts"], "tests/c.test.ts": ["src/w.ts"] }), "test-impact: declare writes the committed .sdlc/test-covers.json (sorted, de-duplicated, stable)", JSON.stringify(covJson));
    commit(nv, "declare covers");
    const clone = path.join(tmp, "nv-clone");
    gitIn(tmp, "clone", "-q", nv, clone);
    const rc = refresh(clone);
    const mc = readMap(clone);
    check(rc.status === 0 && covers(mc, "tests/c.test.ts").includes("src/w.ts") && covers(mc, "tests/a.test.ts").includes("src/other.ts") && mc.tests["tests/c.test.ts"].declared?.[0] === "src/w.ts", "test-impact: a fresh build of a clone (no map.json) picks the committed declarations up and keeps `declared`", rc.err + JSON.stringify(covers(mc, "tests/c.test.ts")));
    // drop the declarations again so the selection assertions below are exact
    fs.rmSync(covFile);
    const mm = readMap(nv); delete mm.tests["tests/c.test.ts"].declared; delete mm.tests["tests/a.test.ts"].declared; fs.writeFileSync(path.join(nv, "docs/work/test/map.json"), JSON.stringify(mm));
    refresh(nv, "--full");
    check(!readMap(nv).tests["tests/c.test.ts"].covers.includes("src/w.ts") && !covers(readMap(nv), "tests/a.test.ts").includes("src/other.ts"), "test-impact: --full keeps only static covers once the declaration is dropped");
    gitIn(nv, "reset", "-q", "--hard", "HEAD~1");
    refresh(nv, "--full");

    // ---- spawn-based harness: string literals naming repo files / dirs are covers
    const spw = mkfx("sp", {
      "package.json": '{"name":"sp","private":true}\n',
      "scripts/x.mjs": "import { h } from './lib/h.mjs';\nconsole.log(h);\n",
      "scripts/lib/h.mjs": "export const h = 1;\n",
      "scripts/tools/a.mjs": "export const a = 1;\n",
      "scripts/tools/b.sh": "echo b\n",
      "scripts/other.mjs": "export const o = 1;\n",
      "scripts/harness.test.mjs": "import { spawnSync } from 'node:child_process';\nspawnSync('node', ['scripts/x.mjs']);\nspawnSync('bash', [`scripts/tools/`]);\nspawnSync('node', ['scripts/nope.mjs', 'not/a/path.txt']);\n",
    });
    refresh(spw);
    const msp = readMap(spw).tests["scripts/harness.test.mjs"];
    check(msp && ["scripts/x.mjs", "scripts/lib/h.mjs", "scripts/tools/a.mjs", "scripts/tools/b.sh"].every((f) => msp.covers.includes(f)) && !msp.covers.includes("scripts/other.mjs") && !msp.covers.includes("scripts/harness.test.mjs"), "test-impact: repo-path string literals (file, dir, import closure of the file) become covers; unrelated files and missing paths do not", JSON.stringify(msp?.covers));
    recordFull(spw);
    put(spw, "scripts/x.mjs", "console.log('changed');\n");
    check(same(select(spw).out?.selected ?? [], ["scripts/harness.test.mjs"]), "test-select: a harness that spawns `node scripts/x.mjs` is selected when x.mjs changes", select(spw).raw);
    gitIn(spw, "checkout", "-q", "--", "scripts/x.mjs");
    put(spw, "scripts/other.mjs", "export const o = 2;\n");
    check((select(spw).out?.selected ?? []).length === 0, "test-select: an unrelated script change selects nothing", select(spw).raw);
    gitIn(spw, "checkout", "-q", "--", "scripts/other.mjs");

    // ---- selector: ledger-driven
    const s0 = select(nv);
    check(s0.out?.scope === "full" && s0.out?.reason === "no-ledger" && s0.out?.selected.length === NV_ALL.length, "test-select: no ledger -> full", s0.raw);
    check(/^Scope: full — 9 of 9 test files \(no-ledger\)/.test(s0.err), "test-select: stderr carries the Scope: line", s0.err);
    const led = recordFull(nv);
    check(led.status === 0 && led.out?.chain === 0 && !!readLedger(nv).full?.sha && Object.keys(readLedger(nv).files).length === NV_ALL.length, "test-ledger: green full run recorded (sha, tree, runners, per-file results)", led.err + led.raw);
    check(readLedger(nv).full.tree === gitIn(nv, "rev-parse", "HEAD^{tree}") && readMap(nv).tests["tests/a.test.ts"].last_run?.result === "pass", "test-ledger: tree hash stored; last_run mirrored into map.json");
    const s1 = select(nv);
    check(s1.out?.scope === "impact" && s1.out?.selected.length === 1 && s1.out?.selected[0] === "tests/p0.test.ts" && s1.out?.always === 1, "test-select: clean tree after a full run -> impact with only the P0 always-set", s1.raw);

    put(nv, "src/util.ts", "export const u = 2;\n");
    const s2 = select(nv);
    check(s2.out?.scope === "impact" && same(s2.out.selected, [...importersOfUtil, "tests/p0.test.ts"]), "test-select: changing the util selects exactly its transitive importers + the P0 always-set, not the unrelated tests", JSON.stringify(s2.out?.selected));
    check(s2.out?.skipped === 4 && s2.out?.total === 9 && s2.out?.by_runner?.vitest?.mode === "files" && s2.out?.by_runner?.playwright?.files?.[0] === "e2e/flow.spec.ts", "test-select: skipped count and per-runner files mode (map fallback, runners absent)", JSON.stringify(s2.out?.by_runner));
    check(/^Scope: impact — 5 of 9 test files \(4 unaffected, 1 always, 0 rolling, 0 failed-last-run\); last full \d{4}-\d{2}-\d{2} @ [0-9a-f]{7}/.test(s2.err), "test-select: Scope line format", s2.err);
    const sj = select(nv, ["--json", "out/sel.json"]);
    check(sj.raw.trim() === path.join(nv, "out/sel.json") && JSON.parse(fs.readFileSync(path.join(nv, "out/sel.json"), "utf8")).scope === "impact", "test-select: --json writes the file and prints its path");
    // a deleted source file still selects the tests that imported it (previous map's covers)
    fs.rmSync(path.join(nv, "src/util.ts"));
    const s2d = select(nv);
    check(importersOfUtil.every((t) => s2d.out?.selected.includes(t)), "test-select: a deleted source file still selects its former importers", JSON.stringify(s2d.out?.selected));
    gitIn(nv, "checkout", "-q", "--", "src/util.ts");

    // ticket scope == treated as changed
    const st = select(nv, ["--ticket-scope", "src/util.ts"]);
    check(same(st.out?.selected ?? [], [...importersOfUtil, "tests/p0.test.ts"]), "test-select: --ticket-scope globs are treated as changed", JSON.stringify(st.out?.selected));
    const stg = select(nv, ["--ticket-scope", "packages/lib/src/**,nothing/**"]);
    check(same(stg.out?.selected ?? [], ["tests/w.test.ts", "tests/p0.test.ts"]), "test-select: ticket scope glob over a workspace package selects its importer", JSON.stringify(stg.out?.selected));
    // range mode: no ledger needed
    put(nv, "src/other.ts", "export const o = 5;\n"); commit(nv, "touch other");
    const sr = select(nv, ["--base", "HEAD~1", "--head", "HEAD"]);
    check(sr.out?.scope === "impact" && same(sr.out.selected, ["tests/c.test.ts", "tests/p0.test.ts", "tests/smoke.test.ts", "tests/db.test.ts"]), "test-select: --base/--head selects by the committed range", JSON.stringify(sr.out?.selected));
    // a committed change after the ledger sha is picked up in ledger mode (HEAD moved past full.sha)
    const sl = select(nv);
    check(sl.out?.scope === "impact" && sl.out.selected.includes("tests/c.test.ts") && sl.out.selected.includes("tests/smoke.test.ts"), "test-select: ledger mode diffs <full sha>..HEAD (committed) as well as dirty files", JSON.stringify(sl.out?.selected));

    // ---- forced full
    put(nv, "package-lock.json", '{"lockfileVersion":3}\n');
    const sg = select(nv);
    check(sg.out?.scope === "full" && /^global-input:package-lock\.json/.test(sg.out?.reason ?? "") && sg.out.selected.length === 9, "test-select: a lockfile change forces full", sg.raw);
    fs.rmSync(path.join(nv, "package-lock.json"));
    for (const g of ["vitest.config.ts", ".github/workflows/ci.yml", "tests/fixtures/data.json", "tests/setup/env.ts"]) {
      put(nv, g, "x\n");
      const sgx = select(nv);
      check(sgx.out?.scope === "full" && /^global-input:/.test(sgx.out?.reason ?? ""), `test-select: global input ${g} forces full`, sgx.out?.reason);
      if (g === "vitest.config.ts") gitIn(nv, "checkout", "-q", "--", g); else fs.rmSync(path.join(nv, g.split("/")[0] === "tests" ? `tests/${g.split("/")[1]}` : ".github"), { recursive: true, force: true });
    }
    const sf = select(nv, ["--full"]);
    check(sf.out?.scope === "full" && sf.out?.reason === "full-flag", "test-select: --full forces full");

    const L = readLedger(nv);
    L.chain = 20; fs.writeFileSync(ledgerFile(nv), JSON.stringify(L));
    const sc = select(nv);
    check(sc.out?.scope === "full" && /^chain>=20/.test(sc.out?.reason ?? ""), "test-select: chain of 20 impact runs forces full", sc.raw);
    L.chain = 19; fs.writeFileSync(ledgerFile(nv), JSON.stringify(L));
    check(select(nv).out?.scope === "impact", "test-select: chain 19 is still impact");
    const fa = recordFull(nv);
    check(fa.out?.chain === 0 && readLedger(nv).full.sha === gitIn(nv, "rev-parse", "HEAD"), "test-ledger: a green full run resets the chain and moves the baseline", fa.raw);
    const ri = node("ledger.mjs", ["record", "--root", nv, "--scope", "impact", "--results", path.join(tmp, "results-nv.json")]);
    check(ri.out?.chain === 1, "test-ledger: an impact run increments the chain", ri.raw);
    recordFull(nv);

    // not-an-ancestor ledger
    const L2 = readLedger(nv); const goodSha = L2.full.sha; L2.full.sha = "0123456789abcdef0123456789abcdef01234567"; fs.writeFileSync(ledgerFile(nv), JSON.stringify(L2));
    check(select(nv).out?.reason === "ledger-not-ancestor", "test-select: ledger sha that is not an ancestor of HEAD -> full");
    L2.full.sha = goodSha; fs.writeFileSync(ledgerFile(nv), JSON.stringify(L2));

    // red full run does not move the baseline
    const before = readLedger(nv).full.sha;
    put(nv, "src/other.ts", "export const o = 6;\n"); commit(nv, "o6");
    recordFull(nv, "full", ["tests/c.test.ts"]);
    check(readLedger(nv).full.sha === before && readLedger(nv).files["tests/c.test.ts"].result === "fail", "test-ledger: a red full run records results but keeps the previous baseline");
    const sfail = select(nv);
    check(sfail.out?.scope === "impact" && sfail.out.selected.includes("tests/c.test.ts") && sfail.out.failed === 1, "test-select: last-run failures are always selected", sfail.raw);
    recordFull(nv); // baseline at HEAD again, c green

    // rolling: files not run for > rolling_days join the selection
    const L3 = readLedger(nv);
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString(); const recent = new Date(Date.now() - 3 * 86_400_000).toISOString();
    L3.full.date = old;
    for (const f of Object.keys(L3.files)) L3.files[f].last_run = recent;
    L3.files["tests/w.test.ts"].last_run = old;
    fs.writeFileSync(ledgerFile(nv), JSON.stringify(L3));
    const sro = select(nv);
    check(sro.out?.scope === "impact" && same(sro.out.selected, ["tests/p0.test.ts", "tests/w.test.ts"]) && sro.out.rolling === 1, "test-select: rolling adds only the file not run for > 7 days", sro.raw);

    // skipped / flaky from the ledger
    const L4 = readLedger(nv); L4.full.date = recent; L4.files["tests/b.test.ts"].result = "skip"; L4.files["tests/db.test.ts"].flaky = true; fs.writeFileSync(ledgerFile(nv), JSON.stringify(L4));
    const sfl = select(nv);
    check(same(sfl.out?.selected ?? [], ["tests/p0.test.ts", "tests/b.test.ts", "tests/db.test.ts"]), "test-select: last-run skips and flaky tests are selected", JSON.stringify(sfl.out?.selected));
    recordFull(nv);

    // ---- config keys
    put(nv, ".sdlc/sdlc.json", '{"test":"npm test","test.always":["tests/c.test.ts"],"test.max_changed":2,"test.global_inputs":["db/*.sql"]}\n');
    commit(nv, "sdlc config");
    recordFull(nv);
    const sca = select(nv);
    check(same(sca.out?.selected ?? [], ["tests/c.test.ts"]) && sca.out.always === 1, "test-select: test.always globs replace the P0 default", sca.raw);
    put(nv, "db/schema.sql", "create table t(x int);\n");
    const sgi = select(nv);
    check(sgi.out?.scope === "full" && /^global-input:db\/schema\.sql/.test(sgi.out?.reason ?? ""), "test-select: test.global_inputs globs force full", sgi.out?.reason);
    fs.rmSync(path.join(nv, "db"), { recursive: true });
    put(nv, "src/a.ts", "export const a = 7;\n"); put(nv, "src/b.ts", "export const b = 7;\n"); put(nv, "src/w.ts", "export const w = 7;\n");
    const smc = select(nv);
    check(smc.out?.scope === "full" && smc.out?.reason === "changed>2", "test-select: more than test.max_changed changed files forces full", smc.out?.reason);
    gitIn(nv, "checkout", "-q", "--", "src");
    // bash helper reads the same keys
    const helper = spawnSync("bash", ["-c", `source "${root}/scripts/validators/_lib_sdlc_config.sh"; SDLC_ROOT="${nv}"; printf '%s|%s|%s|%s' "$(sdlc_test_key always X)" "$(sdlc_test_key rolling_days 7)" "$(sdlc_test_key test.max_changed 400)" "$(sdlc_test_key global_inputs '')"`], { encoding: "utf8" });
    check(helper.stdout === '["tests/c.test.ts"]|7|2|["db/*.sql"]', "test-select: sdlc_test_key reads test.* keys with defaults", helper.stdout + helper.stderr);
    const helper2 = spawnSync("bash", ["-c", `source "${root}/scripts/validators/_lib_sdlc_config.sh"; SDLC_ROOT="${tmp}/nonexistent"; printf '%s|%s' "$(sdlc_test_key rolling_days 7)" "$(sdlc_test_key always '')"`], { encoding: "utf8" });
    check(helper2.stdout === "7|", "test-select: sdlc_test_key falls back to the default when .sdlc/sdlc.json is absent", helper2.stdout);

    // ---- runner-native selection (stubs): vitest list / playwright list receive the ledger sha
    fs.rmSync(path.join(nv, ".sdlc"), { recursive: true }); commit(nv, "drop config"); recordFull(nv);
    const baseSha = readLedger(nv).full.sha;
    const calls = path.join(tmp, "nv-calls.log");
    stubBin(nv, "vitest", `echo "vitest $*" >> "${calls}"\nprintf 'tests/c.test.ts\\n'`);
    stubBin(nv, "playwright", `echo "playwright $*" >> "${calls}"\nprintf '{"config":{"rootDir":"%s/e2e"},"suites":[{"file":"flow.spec.ts"}]}' "$PWD"`);
    put(nv, "src/util.ts", "export const u = 3;\n");
    const sn = select(nv);
    const callLog = fs.existsSync(calls) ? fs.readFileSync(calls, "utf8") : "";
    check(callLog.includes(`vitest list --filesOnly --changed ${baseSha}`) && callLog.includes(`playwright test --list --only-changed=${baseSha} --reporter=json`), "test-select: vitest and playwright are queried natively with the ledger sha", callLog);
    check(sn.out?.selected.includes("tests/c.test.ts") && sn.out.why?.["tests/c.test.ts"]?.join() === "native" && sn.out.native >= 2 && sn.out.by_runner.vitest.native === "vitest", "test-select: native selection is unioned with the map and policy sets", JSON.stringify(sn.out?.why));
    stubBin(nv, "vitest", "echo boom >&2; exit 3");
    const snf = select(nv);
    check(snf.out?.by_runner?.vitest?.native?.startsWith("map (vitest failed") && same(snf.out.selected.filter((t: string) => t !== "tests/c.test.ts"), [...importersOfUtil, "tests/p0.test.ts"]), "test-select: a failing native command falls back to the map", JSON.stringify(snf.out?.by_runner?.vitest));
    fs.rmSync(path.join(nv, "node_modules"), { recursive: true });
    gitIn(nv, "checkout", "-q", "--", "src/util.ts");

    // ---- code-search index (optional input)
    const prevW0 = process.emitWarning; (process as any).emitWarning = () => {};
    const sqlite = (process as any).getBuiltinModule?.("node:sqlite");
    (process as any).emitWarning = prevW0;
    if (sqlite) {
      fs.mkdirSync(path.join(nv, ".code-search"), { recursive: true });
      const prevW = process.emitWarning; (process as any).emitWarning = () => {};
      const db = new (sqlite.DatabaseSync)(path.join(nv, ".code-search/index.db"));
      (process as any).emitWarning = prevW;
      db.exec("create table imports(file text, target text); insert into imports values ('tests/c.test.ts','src/b.ts')");
      db.close();
      const ri2 = refresh(nv);
      check(/^used: 1 edge/.test(ri2.out?.index ?? "") && readMap(nv).tests["tests/c.test.ts"].covers.includes("src/util.ts"), "test-impact: code-search index import edges are added when the index has an import table", ri2.raw);
      fs.rmSync(path.join(nv, ".code-search"), { recursive: true });
      const ri3 = refresh(nv);
      check(ri3.out?.index === "absent" && !readMap(nv).tests["tests/c.test.ts"].covers.includes("src/util.ts"), "test-impact: without an index the regex resolution alone is used");
    }

    // =============================================================== node: jest layout
    const nj = mkfx("nj", {
      "package.json": '{"name":"nj","devDependencies":{"jest":"^29"}}\n',
      "jest.config.js": "module.exports = {};\n",
      "src/util.js": "module.exports = { u: 1 };\n",
      "src/a.js": "const { u } = require('./util');\nmodule.exports = { a: u };\n",
      "src/b.js": "const a = require('./a');\nmodule.exports = { b: a };\n",
      "src/other.js": "module.exports = { o: 1 };\n",
      "tests/a.test.js": "const a = require('../src/a');\ntest('a', () => a);\n",
      "tests/b.test.js": "const b = require('../src/b');\ntest('b', () => b);\n",
      "tests/c.test.js": "const o = require('../src/other');\ntest('c', () => o);\n",
    });
    refresh(nj);
    const mj = readMap(nj);
    check(mj.tests["tests/a.test.js"]?.runner === "jest" && ["tests/a.test.js", "tests/b.test.js"].every((t) => covers(mj, t).includes("src/util.js")) && !covers(mj, "tests/c.test.js").includes("src/util.js"), "test-impact: jest layout — require() closure covers the util for both importers only", JSON.stringify(Object.fromEntries(Object.entries(mj.tests).map(([k, v]: any) => [k, v.covers]))));
    recordFull(nj);
    put(nj, "src/util.js", "module.exports = { u: 2 };\n");
    const sj0 = select(nj);
    check(same(sj0.out?.selected ?? [], ["tests/a.test.js", "tests/b.test.js"]) && sj0.out.by_runner.jest.mode === "files", "test-select: jest layout — util change selects its two importers (map fallback)", sj0.raw);
    const jcalls = path.join(tmp, "nj-calls.log");
    stubBin(nj, "jest", `echo "jest $*" >> "${jcalls}"\nprintf '%s\\n' "$PWD/tests/c.test.js"`);
    const sj1 = select(nj);
    const jlog = fs.existsSync(jcalls) ? fs.readFileSync(jcalls, "utf8") : "";
    check(jlog.includes("jest --listTests --findRelatedTests src/util.js") && sj1.out?.selected.includes("tests/c.test.js") && sj1.out.by_runner.jest.native === "jest", "test-select: jest --listTests --findRelatedTests <changed> result is unioned", jlog + JSON.stringify(sj1.out?.why));

    // =============================================================== python
    const py = mkfx("py", {
      "pyproject.toml": '[project]\nname = "x"\n',
      "pkg/__init__.py": "",
      "pkg/util.py": "def f():\n    return 1\n",
      "pkg/core.py": "from .util import f\n\ndef x():\n    return f()\n",
      "pkg/app.py": "from pkg import core\n\ndef run():\n    return core.x()\n",
      "pkg/other.py": "def o():\n    return 2\n",
      "tests/test_core.py": "from pkg.core import x\n\ndef test_core():\n    assert x() == 1\n",
      "tests/test_app.py": "import pkg.app\n\ndef test_app():\n    assert pkg.app.run() == 1\n",
      "tests/test_other.py": "from pkg.other import o\n\ndef test_other():\n    assert o() == 2\n",
      "tests/test_integration_db.py": "import sqlite3\nfrom pkg.other import o\n\ndef test_db():\n    assert o()\n",
      "tests/conftest.py": "",
    });
    refresh(py);
    const mp = readMap(py);
    check(["tests/test_core.py", "tests/test_app.py"].every((t) => covers(mp, t).includes("pkg/util.py")) && !covers(mp, "tests/test_other.py").includes("pkg/util.py") && covers(mp, "tests/test_core.py").includes("pkg/__init__.py"), "test-impact: python — relative + package imports give the transitive closure (util covered by core and app tests, not other)", JSON.stringify(mp.tests["tests/test_app.py"]?.covers));
    check(Object.keys(mp.tests).length === 4 && mp.tests["tests/test_integration_db.py"].kind === "integration" && mp.tests["tests/test_core.py"].runner === "pytest", "test-impact: python — test_*.py discovered (conftest.py is not a test), integration kind from sqlite3 import");
    recordFull(py);
    put(py, "pkg/util.py", "def f():\n    return 3\n");
    const sp = select(py);
    check(same(sp.out?.selected ?? [], ["tests/test_core.py", "tests/test_app.py"]) && sp.out.by_runner.pytest.mode === "files", "test-select: python — util change selects the two importers; pytest without testmon -> files (static map)", sp.raw);
    const stubs = path.join(tmp, "pystubs"); fs.mkdirSync(stubs, { recursive: true });
    fs.writeFileSync(path.join(stubs, "python3"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
    const spt = select(py, [], { PATH: `${stubs}${path.delimiter}${process.env.PATH ?? ""}` });
    check(spt.out?.by_runner?.pytest?.mode === "args" && JSON.stringify(spt.out.by_runner.pytest.args) === '["--testmon"]' && spt.out.by_runner.pytest.union === false && spt.out.by_runner.pytest.native === "pytest-testmon", "test-select: python — pytest-testmon installed -> args form (--testmon), union:false", JSON.stringify(spt.out?.by_runner?.pytest));
    put(py, "tests/conftest.py", "# changed\n");
    check(select(py).out?.reason === "global-input:tests/conftest.py", "test-select: python — conftest.py change forces full");

    // =============================================================== go
    const go = mkfx("go", {
      "go.mod": "module example.com/fx\n\ngo 1.21\n",
      "util/util.go": "package util\n\nfunc U() int { return 1 }\n",
      "util/util_test.go": 'package util\n\nimport "testing"\n\nfunc TestU(t *testing.T) { if U() != 1 { t.Fatal() } }\n',
      "svc/svc.go": 'package svc\n\nimport "example.com/fx/util"\n\nfunc S() int { return util.U() }\n',
      "svc/svc_test.go": 'package svc\n\nimport "testing"\n\nfunc TestS(t *testing.T) { if S() != 1 { t.Fatal() } }\n',
      "other/other.go": "package other\n\nfunc O() int { return 2 }\n",
      "other/other_test.go": 'package other\n\nimport "testing"\n\nfunc TestO(t *testing.T) { if O() != 2 { t.Fatal() } }\n',
    });
    refresh(go);
    const mg = readMap(go);
    check(covers(mg, "svc/svc_test.go").includes("util/util.go") && covers(mg, "util/util_test.go").includes("util/util.go") && !covers(mg, "other/other_test.go").includes("util/util.go") && mg.tests["svc/svc_test.go"].runner === "go", "test-impact: go — package imports resolve through go.mod; the importing package's tests cover the util", JSON.stringify(mg.tests["svc/svc_test.go"]?.covers));
    recordFull(go);
    put(go, "util/util.go", "package util\n\nfunc U() int { return 1 } // changed\n");
    const sgo = select(go);
    check(same(sgo.out?.selected ?? [], ["util/util_test.go", "svc/svc_test.go"]) && sgo.out.by_runner.go.mode === "args" && JSON.stringify(sgo.out.by_runner.go.args) === '["./svc","./util"]' && sgo.out.by_runner.go.native === "go list -deps", "test-select: go — reverse import closure of the changed package -> package args", sgo.raw);
    gitIn(go, "checkout", "-q", "--", "util");
    put(go, "other/other.go", "package other\n\nfunc O() int { return 2 } // changed\n");
    check(same(select(go).out?.selected ?? [], ["other/other_test.go"]), "test-select: go — a leaf package change selects only its own tests");
    gitIn(go, "checkout", "-q", "--", "other");
    put(go, "go.mod", "module example.com/fx\n\ngo 1.22\n");
    check(select(go).out?.reason === "global-input:go.mod", "test-select: go — go.mod change forces full");
    gitIn(go, "checkout", "-q", "--", "go.mod");

    // =============================================================== rust
    const rs = mkfx("rs", {
      "Cargo.toml": '[workspace]\nmembers = ["core", "app"]\nresolver = "2"\n',
      "core/Cargo.toml": '[package]\nname = "fx-core"\nversion = "0.1.0"\nedition = "2021"\n',
      "core/src/lib.rs": "pub mod util;\npub fn run() -> i32 { util::u() }\n",
      "core/src/util.rs": "pub fn u() -> i32 { 1 }\n\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn t() { assert_eq!(super::u(), 1); }\n}\n",
      "core/tests/it.rs": "use fx_core::util::u;\n\n#[test]\nfn it() { assert_eq!(u(), 1); }\n",
      "app/Cargo.toml": '[package]\nname = "fx-app"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nfx-core = { path = "../core" }\n',
      "app/src/lib.rs": "use fx_core::run;\npub fn go() -> i32 { run() }\n",
      "app/tests/app_it.rs": "use fx_app::go;\n\n#[test]\nfn app() { assert_eq!(go(), 1); }\n",
    });
    refresh(rs);
    const mr = readMap(rs);
    check(Object.keys(mr.tests).length === 3 && mr.tests["core/src/util.rs"]?.runner === "cargo" && covers(mr, "core/tests/it.rs").includes("core/src/util.rs") && ["core/src/util.rs", "core/src/lib.rs"].every((f) => covers(mr, "app/tests/app_it.rs").includes(f)), "test-impact: rust — tests/*.rs and #[cfg(test)] files found; use paths resolve across crates (Cargo path deps) and mod files", JSON.stringify(Object.fromEntries(Object.entries(mr.tests).map(([k, v]: any) => [k, v.covers]))));
    recordFull(rs);
    put(rs, "core/src/util.rs", `${fs.readFileSync(path.join(rs, "core/src/util.rs"), "utf8")}// changed\n`);
    const srs = select(rs);
    check(same(srs.out?.selected ?? [], ["core/src/util.rs", "core/tests/it.rs", "app/tests/app_it.rs"]) && JSON.stringify(srs.out.by_runner.cargo.args) === '["-p","fx-app","-p","fx-core"]' && srs.out.by_runner.cargo.mode === "args", "test-select: rust — change in core selects core's tests and the dependent crate (cargo metadata)", srs.raw);
    gitIn(rs, "checkout", "-q", "--", "core");
    put(rs, "app/src/lib.rs", "use fx_core::run;\npub fn go() -> i32 { run() } // changed\n");
    const sra = select(rs);
    check(same(sra.out?.selected ?? [], ["app/tests/app_it.rs"]) && JSON.stringify(sra.out.by_runner.cargo.args) === '["-p","fx-app"]', "test-select: rust — change in the dependent crate leaves the core crate's tests out", sra.raw);
    gitIn(rs, "checkout", "-q", "--", "app");
    put(rs, "core/Cargo.toml", `${fs.readFileSync(path.join(rs, "core/Cargo.toml"), "utf8")}# x\n`);
    check(select(rs).out?.reason === "global-input:core/Cargo.toml", "test-select: rust — Cargo.toml change forces full");

    // ---- WP-T6: validate-tests.sh telemetry rows + telemetry-report "Tests" section
    const tl = mkfx("tel", {
      "package.json": JSON.stringify({ name: "tel", type: "module", scripts: { test: "node --test" } }),
      "src/a.mjs": "export const a = () => 1;\n", "src/b.mjs": "export const b = () => 2;\n",
      "tests/a.test.mjs": "import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { a } from '../src/a.mjs';\ntest('a', () => assert.equal(a(), 1));\n",
      "tests/b.test.mjs": "import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { b } from '../src/b.mjs';\ntest('b', () => assert.equal(b(), 2));\n",
    });
    put(tl, ".gitignore", "node_modules/\ndocs/work/\ntest-results.json\n");
    commit(tl, "ignore work dir");
    const vt = path.join(root, "scripts/validators/validate-tests.sh");
    const runVt = (a: string[], e: NodeJS.ProcessEnv = {}) => spawnSync("bash", [vt, tl, ...a], { env: { ...env, ...e }, encoding: "utf8", timeout: 120_000 });
    const telRows = (): Obj[] => { try { return fs.readFileSync(path.join(tl, "docs/work/telemetry.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
    const rFull = runVt(["--scope", "full"]);
    const rows1 = telRows().filter((r) => r.source === "tests");
    check(rFull.status === 0 && rows1.length === 1 && rows1[0].scope === "full" && rows1[0].total === 2 && rows1[0].selected === 2 && Number.isInteger(rows1[0].ms) && rows1[0].ms >= 0 && /requested/.test(rows1[0].reason) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(rows1[0].ts) && Object.keys(rows1[0]).join() === "ts,source,scope,selected,total,ms,reason",
      "test-telemetry: a full validate-tests run appends {ts, source:tests, scope:full, selected=total, ms, reason}", `${JSON.stringify(rows1)} ${rFull.stderr.slice(-300)}`);
    put(tl, "src/a.mjs", "export const a = () => 1; // changed\n");
    const rImp = runVt(["--scope", "impact"]);
    const rows2 = telRows().filter((r) => r.source === "tests");
    check(rImp.status === 0 && rows2.length === 2 && rows2[1].scope === "impact" && rows2[1].selected === 1 && rows2[1].total === 2,
      "test-telemetry: an impact run records scope impact with selected < total", `${JSON.stringify(rows2)} ${rImp.stderr.slice(-300)}`);
    put(tl, "tests/a.test.mjs", "import { test } from 'node:test';\ntest('a', () => { throw new Error('red'); });\n");
    const rRed = runVt(["--scope", "impact"]);
    check(rRed.status !== 0 && telRows().filter((r) => r.source === "tests").length === 3, "test-telemetry: a red run still records its row (the EXIT trap, not the happy path)", rRed.stderr.slice(-300));
    const rOff = runVt(["--scope", "impact"], { EXPERTS_TELEMETRY: "0" });
    check(telRows().filter((r) => r.source === "tests").length === 3 && rOff.stdout.length > 0, "test-telemetry: EXPERTS_TELEMETRY=0 writes no tests row");

    const rep = path.join(root, "scripts/telemetry-report.mjs");
    const tj = path.join(tmp, "tel-report.jsonl");
    const mk = (scope: string, selected: number, total: number, ms: number, reason: string) => JSON.stringify({ ts: "2026-11-04T10:00:00Z", source: "tests", scope, selected, total, ms, reason });
    fs.writeFileSync(tj, [mk("full", 100, 100, 100000, "no-ledger"), mk("full", 100, 100, 80000, "requested (--scope full)"), mk("impact", 10, 100, 10000, "impact"), mk("impact", 30, 100, 40000, "impact"), "not json", JSON.stringify({ source: "validator", validator: "x", gaps: 0, exit: 0 })].join("\n") + "\n");
    const rj = spawnSync(process.execPath, [rep, tj, "--json"], { cwd: tmp, encoding: "utf8" });
    let tsec: Obj = {};
    try { tsec = JSON.parse(rj.stdout).sections.tests; } catch { /* reported below */ }
    const imp = (tsec.by_scope ?? []).find((x: Obj) => x.scope === "impact") ?? {};
    const ful = (tsec.by_scope ?? []).find((x: Obj) => x.scope === "full") ?? {};
    check(tsec.runs === 4 && imp.runs === 2 && imp.selected === 40 && imp.total === 200 && imp.selected_ratio === 0.2 && imp.ms_mean === 25000 && ful.runs === 2 && ful.selected_ratio === 1 && tsec.mean_full_ms === 90000,
      "telemetry-report: tests rows give runs by scope, selected/total ratio, wall time per scope, mean full run", JSON.stringify(tsec));
    check(tsec.saved_ms_est === (90000 - 10000) + (90000 - 40000), "telemetry-report: time saved = sum over impact runs of (mean full run - run time)", String(tsec.saved_ms_est));
    const rt = spawnSync(process.execPath, [rep, tj], { cwd: tmp, encoding: "utf8" });
    check(/## Tests/.test(rt.stdout) && /estimated time saved by impact runs: 130\.0s/.test(rt.stdout) && /mean full run: 90\.0s/.test(rt.stdout) && /selected\/total/.test(rt.stdout),
      "telemetry-report: text output has a Tests section with the saved-time estimate", rt.stdout.slice(0, 600));
    fs.writeFileSync(tj, `${mk("impact", 1, 50, 2000, "impact")}\n`);
    const ro = spawnSync(process.execPath, [rep, tj], { cwd: tmp, encoding: "utf8" });
    check(/no full run logged/.test(ro.stdout) && JSON.parse(spawnSync(process.execPath, [rep, tj, "--json"], { cwd: tmp, encoding: "utf8" }).stdout).sections.tests.saved_ms_est === null,
      "telemetry-report: impact-only data says time saved is not estimable (no invented baseline)", ro.stdout.slice(0, 400));
    fs.writeFileSync(tj, JSON.stringify({ source: "validator", validator: "x", gaps: 0, exit: 0 }) + "\n");
    check(!/## Tests/.test(spawnSync(process.execPath, [rep, tj], { cwd: tmp, encoding: "utf8" }).stdout), "telemetry-report: no tests rows, no Tests section");

    // ---- installed copies are symlinks (attest-claude install.sh): main() must still run through one
    const linkDir = path.join(tmp, "linked-test-tools");
    fs.mkdirSync(linkDir, { recursive: true });
    for (const f of fs.readdirSync(tdir).filter((n) => n.endsWith(".mjs"))) fs.symlinkSync(path.join(tdir, f), path.join(linkDir, f));
    const viaLink = spawnSync(process.execPath, [path.join(linkDir, "select.mjs"), "--root", tl, "--full"], { env, encoding: "utf8", timeout: 90_000 });
    let linkOut: Obj = {};
    try { linkOut = JSON.parse(viaLink.stdout); } catch { /* reported below */ }
    check(viaLink.status === 0 && linkOut.scope === "full" && Array.isArray(linkOut.selected),
      "test-tools: select.mjs run through a symlink (installed copy) still executes main()", `${viaLink.status} ${viaLink.stdout.slice(0, 200)} ${viaLink.stderr.slice(0, 200)}`);

    // ---- the repo itself: docs/work/test/ is git-ignored
    check(spawnSync("git", ["check-ignore", "-q", "docs/work/test/map.json"], { cwd: root }).status === 0 && spawnSync("git", ["check-ignore", "-q", "docs/work/test/ledger.json"], { cwd: root }).status === 0, "test-impact: docs/work/test/ (map + ledger) is git-ignored in the repo");
  } catch (e) {
    fail("test-impact: chapter threw", String((e as Error).stack ?? e));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
