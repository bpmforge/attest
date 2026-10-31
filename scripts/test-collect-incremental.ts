/**
 * test-collect-incremental.ts — WP-A1 (INCREMENTAL_SCAN_PLAN.md) for scripts/test.ts.
 *
 * scripts/scan/collect.sh keeps a ledger and, on the next run, scans only the
 * files changed since the last full result, merging the prior findings for
 * untouched files. Fixtures are tmp git repos (deleted afterwards). semgrep, npm
 * and knip are replaced by tiny stubs on PATH so the merge behaviour is exact and
 * network-free; the secrets grep battery (no external tool) is exercised for real.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

export async function testCollectIncremental(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const collect = path.join(root, "scripts/scan/collect.sh");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "collect-incr-"));
  const fx = path.join(tmp, "repo");
  const stubs = path.join(tmp, "stubs");
  const log = path.join(tmp, "stub.log");
  fs.mkdirSync(fx, { recursive: true });
  fs.mkdirSync(stubs, { recursive: true });
  fs.writeFileSync(log, "");

  const check = (cond: boolean, label: string, detail = "") =>
    cond ? ok(label) : fail(label, detail || "assertion false");

  try {
    // ---- stubs -----------------------------------------------------------
    const stub = (name: string, body: string) => {
      fs.writeFileSync(path.join(stubs, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
    };
    stub(
      "semgrep",
      `if [[ "$1" == "--version" ]]; then echo "1.0.0-stub"; exit 0; fi
echo semgrep >> "$STUB_LOG"
shift; targets=()
while [[ $# -gt 0 ]]; do case "$1" in --config) shift 2;; --json|--quiet|--metrics=off) shift;; *) targets+=("$1"); shift;; esac; done
grep -rnH --exclude-dir=.git --exclude-dir=docs --exclude-dir=.semgrep -- "VULN" "\${targets[@]}" 2>/dev/null \\
 | while IFS=: read -r f l rest; do jq -nc --arg p "\${f#./}" --argjson l "$l" '{check_id:"stub.vuln",path:$p,start:{line:$l},extra:{severity:"ERROR",message:"stub"}}'; done \\
 | jq -s '{results:.,errors:[]}'`,
    );
    stub(
      "npm",
      `echo npm >> "$STUB_LOG"; echo '{"metadata":{"vulnerabilities":{}},"vulnerabilities":{}}'`,
    );
    stub(
      "knip",
      `if [[ "$1" == "--version" ]]; then echo "5.0.0-stub"; exit 0; fi
echo knip >> "$STUB_LOG"; echo '{"files":[],"issues":[]}'`,
    );

    const baseEnv = {
      ...process.env,
      PATH: `${stubs}${path.delimiter}${process.env.PATH ?? ""}`,
      STUB_LOG: log,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    } as NodeJS.ProcessEnv;

    const git = (...args: string[]) => {
      const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
        cwd: fx, env: baseEnv, encoding: "utf8",
      });
      if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    };
    const write = (rel: string, content: string) => {
      const p = path.join(fx, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    };
    const commit = (msg: string) => { git("add", "-A"); git("commit", "-q", "-m", msg); };

    type Run = { out: any; err: string; status: number | null; rawOut: string };
    const run = (args: string[], env: NodeJS.ProcessEnv = {}, pathOverride?: string): Run => {
      const e = { ...baseEnv, ...env } as NodeJS.ProcessEnv;
      if (pathOverride !== undefined) e.PATH = pathOverride;
      const r = spawnSync("bash", [collect, "--root", fx, ...args], { env: e, encoding: "utf8", timeout: 120_000 });
      let out: any = null;
      try { out = JSON.parse(fs.readFileSync(path.resolve(fx, r.stdout.trim()), "utf8")); } catch { /* reported by caller */ }
      return { out, err: r.stderr || "", status: r.status, rawOut: r.stdout.trim() };
    };
    const stubCalls = (n: string) => fs.readFileSync(log, "utf8").split("\n").filter((l) => l === n).length;
    const sorted = (a: any[]) => a.map((x) => JSON.stringify(x)).sort();
    const byPath = (a: any[], p: string) => sorted((a ?? []).filter((f) => f.path === p));
    const ledgerPath = path.join(fx, "docs/work/scan/ledger.json");
    const readLedger = () => JSON.parse(fs.readFileSync(ledgerPath, "utf8"));

    // ---- fixture ---------------------------------------------------------
    git("init", "-q", "-b", "main");
    write(".gitignore", "docs/work/scan/\nnode_modules/\n");
    write("a.js", "// VULN a\nconst a = 1;\n");
    write("b.js", 'const k = "AKIAABCDEFGHIJKLMNOP";\n// VULN b\n');
    write("c.js", "const c = 3;\n");
    write("d.js", 'const t = "AKIAZZZZZZZZZZZZZZZZ";\n');
    write("package.json", '{"name":"fx","version":"1.0.0"}\n');
    write("package-lock.json", '{"name":"fx","lockfileVersion":3}\n');
    write(".semgrep/r.yml", "rules: []\n");
    commit("init");

    // ---- 1. full run: scope=tree, ledger written --------------------------
    const full1 = run(["--full"]);
    check(full1.status === 0 && full1.out !== null, "collect-incr: --full run succeeds with valid JSON", full1.err);
    check(/scope=tree/.test(full1.err) && full1.out?.meta?.scope === "tree", "collect-incr: --full reports scope=tree", full1.err);
    check(full1.out?.semgrep?.findings?.length === 2, "collect-incr: full semgrep finds both VULN files", JSON.stringify(full1.out?.semgrep));
    check(full1.out?.secrets?.findings?.length === 2, "collect-incr: full secrets battery finds both planted keys", JSON.stringify(full1.out?.secrets));
    const L1 = fs.existsSync(ledgerPath) ? readLedger() : {};
    check(
      !!L1.semgrep?.head_sha && !!L1.semgrep?.tool_version && !!L1.semgrep?.rules_hash && L1.semgrep?.increments === 0 && !!L1.secrets && !!L1.deps?.lockfile_hash,
      "collect-incr: ledger written with head_sha/tool_version/rules_hash/increments",
      JSON.stringify(L1),
    );
    check(
      spawnSync("git", ["check-ignore", "-q", "docs/work/scan/ledger.json"], { cwd: root }).status === 0,
      "collect-incr: docs/work/scan/ledger.json is git-ignored in the repo",
    );

    // ---- 2. touch one file + commit -> incremental ------------------------
    write("b.js", 'const k = "AKIAABCDEFGHIJKLMNOP";\n// padding\n// VULN b moved\n');
    commit("touch b");
    const inc1 = run([]);
    check(/scope=incremental base=[0-9a-f]{7} changed=1\b/.test(inc1.err), "collect-incr: auto run prints scope=incremental base=<sha7> changed=1", inc1.err);
    check(inc1.out?.meta?.scope === "incremental", "collect-incr: meta.scope == incremental", JSON.stringify(inc1.out?.meta));
    check(
      JSON.stringify(inc1.out?.meta?.changed_files) === '["b.js"]' && inc1.out?.meta?.base_full_sha === L1.semgrep.head_sha && inc1.out?.meta?.carried_forward >= 2,
      "collect-incr: meta.changed_files / base_full_sha / carried_forward set",
      JSON.stringify(inc1.out?.meta),
    );
    check(
      JSON.stringify(byPath(inc1.out?.semgrep?.findings, "a.js")) === JSON.stringify(byPath(full1.out?.semgrep?.findings, "a.js")) &&
        byPath(inc1.out?.semgrep?.findings, "a.js").length === 1,
      "collect-incr: semgrep findings for untouched a.js identical to the full run",
    );
    check(
      JSON.stringify(byPath(inc1.out?.secrets?.findings, "d.js")) === JSON.stringify(byPath(full1.out?.secrets?.findings, "d.js")) &&
        byPath(inc1.out?.secrets?.findings, "d.js").length === 1,
      "collect-incr: secrets findings for untouched d.js identical to the full run",
    );
    check(
      (inc1.out?.semgrep?.findings ?? []).some((f: any) => f.path === "b.js" && f.line === 3) &&
        !(inc1.out?.semgrep?.findings ?? []).some((f: any) => f.path === "b.js" && f.line === 2),
      "collect-incr: changed file's stale finding replaced by the new one",
    );
    // Oracle: a from-scratch full run (own ledger/out so the chain above is untouched) must equal the merged result.
    const oracle = run(["--full", "--ledger", path.join(tmp, "oracle-ledger.json"), "--out", path.join(tmp, "oracle.json")]);
    check(
      JSON.stringify(sorted(inc1.out?.semgrep?.findings ?? [])) === JSON.stringify(sorted(oracle.out?.semgrep?.findings ?? [])) &&
        JSON.stringify(sorted(inc1.out?.secrets?.findings ?? [])) === JSON.stringify(sorted(oracle.out?.secrets?.findings ?? [])),
      "collect-incr: incremental semgrep+secrets == fresh full run (whole-tree answer preserved)",
    );
    check(
      inc1.out?.deps?.status === "cached" && inc1.out?.deps?.cached_from && stubCalls("npm") === 2,
      "collect-incr: deps cached when lockfile unchanged (npm audit not re-run)",
      `deps=${inc1.out?.deps?.status} npm calls=${stubCalls("npm")}`,
    );

    // ---- 3. deletion -> prior findings closed -----------------------------
    fs.rmSync(path.join(fx, "d.js"));
    commit("delete d");
    const inc2 = run([]);
    check(
      inc2.out?.meta?.scope === "incremental" && !(inc2.out?.secrets?.findings ?? []).some((f: any) => f.path === "d.js") && inc2.out?.secrets?.findings?.length === 1,
      "collect-incr: deleted file's carried findings are dropped",
      JSON.stringify(inc2.out?.secrets),
    );

    // ---- 4. dirty file is scanned, and re-scanned after it is reverted ----
    write("a.js", "// VULN a\n// VULN a2\n");
    const inc3 = run([]);
    check(
      (inc3.out?.meta?.changed_files ?? []).includes("a.js") && byPath(inc3.out?.semgrep?.findings, "a.js").length === 2,
      "collect-incr: uncommitted edit is picked up (dirty files included)",
      JSON.stringify(inc3.out?.meta?.changed_files),
    );
    git("checkout", "--", "a.js");
    const inc4 = run([]);
    check(
      byPath(inc4.out?.semgrep?.findings, "a.js").length === 1,
      "collect-incr: reverted file is re-scanned (ledger remembers prior dirty files)",
      JSON.stringify(byPath(inc4.out?.semgrep?.findings, "a.js")),
    );

    // ---- 5. whole-tree scanners: cache on tree hash + clean tree ----------
    const kBefore = stubCalls("knip");
    const dc1 = run([]); // tree clean, HEAD unchanged since inc4 (which ran deadcode on a clean tree)
    check(
      dc1.out?.deadcode?.status === "cached" && stubCalls("knip") === kBefore,
      "collect-incr: deadcode cached when tree hash unchanged and tree clean",
      `deadcode=${dc1.out?.deadcode?.status}`,
    );
    write("c.js", "const c = 4;\n");
    const dc2 = run([]);
    check(dc2.out?.deadcode?.status === "ok" && stubCalls("knip") === kBefore + 1, "collect-incr: deadcode re-run on a dirty tree", `deadcode=${dc2.out?.deadcode?.status}`);
    git("checkout", "--", "c.js");
    check(dc2.out?.dup?.status === "skipped" || dc2.out?.dup?.status === "ok" || dc2.out?.dup?.status === "cached", "collect-incr: dup output well-formed");
    const nBefore = stubCalls("npm");
    write("package-lock.json", '{"name":"fx","lockfileVersion":3,"x":1}\n');
    commit("lock change");
    const dp = run([]);
    check(dp.out?.deps?.status === "ok" && stubCalls("npm") === nBefore + 1, "collect-incr: deps re-run when lockfile hash changes", `deps=${dp.out?.deps?.status}`);

    // Daily rule: unchanged lockfile but audited_on of yesterday -> deps re-audited.
    const hit = run([]);
    check(hit.out?.deps?.status === "cached" && stubCalls("npm") === nBefore + 1, "collect-incr: deps cached again on the same day (audited_on == today)", `deps=${hit.out?.deps?.status}`);
    const lg = readLedger();
    const today = lg.deps.audited_on;
    lg.deps.audited_on = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    fs.writeFileSync(ledgerPath, JSON.stringify(lg));
    const stale = run([]);
    check(
      stale.out?.deps?.status === "ok" && stubCalls("npm") === nBefore + 2 && readLedger().deps.audited_on === today,
      "collect-incr: deps re-audited when ledger audited_on is yesterday (unchanged lockfile)",
      `deps=${stale.out?.deps?.status} audited_on=${readLedger().deps.audited_on}`,
    );

    // ---- 6. .semgrep change forces a full semgrep run ----------------------
    write(".semgrep/r.yml", "rules: [] # changed\n");
    commit("rules");
    const sgBefore = stubCalls("semgrep");
    const rc = run([]);
    check(
      /scope=tree/.test(rc.err) && rc.out?.meta?.scope === "tree" && rc.out?.semgrep?.scope === "tree" && /rules-changed/.test(rc.out?.meta?.resolution?.semgrep ?? ""),
      "collect-incr: changing .semgrep/ forces a full run (scope=tree, rules-changed)",
      `${rc.err} ${JSON.stringify(rc.out?.meta?.resolution)}`,
    );
    check(stubCalls("semgrep") === sgBefore + 1, "collect-incr: forced-full semgrep actually ran once");

    // ---- 7. every Nth increment forces full --------------------------------
    run(["--full"]);
    write("c.js", "const c = 5;\n"); commit("c5");
    const n1 = run([], { SCAN_MAX_INCREMENTAL: "2" });
    write("c.js", "const c = 6;\n"); commit("c6");
    const n2 = run([], { SCAN_MAX_INCREMENTAL: "2" });
    check(n1.out?.meta?.scope === "incremental", "collect-incr: first chained increment stays incremental", n1.err);
    check(
      n2.out?.meta?.scope === "tree" && /max-increments/.test(n2.out?.meta?.resolution?.semgrep ?? "") && readLedger().semgrep.increments === 0,
      "collect-incr: SCAN_MAX_INCREMENTAL-th increment forces full and resets the counter",
      JSON.stringify(n2.out?.meta?.resolution),
    );

    // ---- 8. no ledger / non-ancestor / explicit full -----------------------
    const nl = run(["--ledger", path.join(tmp, "fresh-ledger.json")]);
    check(nl.out?.meta?.scope === "tree" && /no-ledger/.test(nl.out?.meta?.resolution?.semgrep ?? ""), "collect-incr: no ledger -> full");
    const firstSha = git("rev-list", "--max-parents=0", "HEAD");
    git("reset", "-q", "--hard", firstSha);
    const na = run([]);
    check(na.out?.meta?.scope === "tree" && /not-ancestor/.test(na.out?.meta?.resolution?.secrets ?? ""), "collect-incr: ledger sha not an ancestor of HEAD -> full", JSON.stringify(na.out?.meta?.resolution));
    const kb = stubCalls("knip"), nb = stubCalls("npm");
    const ff = run(["--mode", "full"]);
    check(stubCalls("knip") === kb + 1 && stubCalls("npm") === nb + 1 && ff.out?.deps?.status === "ok", "collect-incr: --mode full re-runs deps and deadcode");
    const bad = spawnSync("bash", [collect, "--root", fx, "--mode", "bogus"], { env: baseEnv, encoding: "utf8" });
    check(bad.status === 2, "collect-incr: invalid --mode exits 2");
    const ex = run(["--expand-importers", "off"]);
    check(ex.status === 0 && ex.out !== null, "collect-incr: --expand-importers accepted");

    // ---- 9. --base/--head range mode unchanged, ledger untouched -----------
    write("e.js", "// VULN e\n");
    commit("add e");
    const ledgerBefore = fs.readFileSync(ledgerPath, "utf8");
    const rg = run(["--base", firstSha, "--head", "HEAD", "--out", path.join(tmp, "range.json")]);
    check(
      rg.out?.meta?.scope === "range" && /scope=range/.test(rg.err) && rg.out?.semgrep?.scope === "range" &&
        JSON.stringify(rg.out?.meta?.changed_files) === '["e.js"]' && rg.out?.semgrep?.findings?.length === 1 && rg.out?.semgrep?.findings?.[0]?.path === "e.js",
      "collect-incr: --base/--head still scans only the range and reports scope=range",
      `${rg.err} ${JSON.stringify(rg.out?.meta)}`,
    );
    check(fs.readFileSync(ledgerPath, "utf8") === ledgerBefore, "collect-incr: range mode does not touch the ledger");
    check(rg.out?.deps?.status !== "cached" && rg.out?.semgrep?.at_sha === undefined, "collect-incr: range mode output shape has no ledger stamps / caching");

    // ---- 10. missing tools: skipped + valid JSON ---------------------------
    const farm = path.join(tmp, "farm");
    fs.mkdirSync(farm);
    for (const c of ["bash","jq","git","node","grep","sed","awk","cut","sort","tr","find","wc","date","mktemp","mkdir","cp","mv","cat","head","tail","timeout","sha256sum","shasum","dirname","rm","uniq","xargs","tee","env","ls"]) {
      const w = spawnSync("sh", ["-c", `command -v ${c}`], { encoding: "utf8" }).stdout.trim();
      if (w.startsWith("/")) { try { fs.symlinkSync(w, path.join(farm, c)); } catch { /* ignore */ } }
    }
    const bare = run(["--full", "--out", path.join(tmp, "bare.json"), "--ledger", path.join(tmp, "bare-ledger.json")], {}, farm);
    check(
      bare.status === 0 && bare.out?.semgrep?.status === "skipped" && bare.out?.complexity?.status === "skipped" && bare.out?.secrets?.status === "ok" && bare.out?.dup?.status === "skipped" && bare.out?.deadcode?.status === "skipped",
      "collect-incr: scanners that are not installed still emit status skipped",
      `${bare.err} ${bare.status} ${JSON.stringify(Object.entries(bare.out ?? {}).map(([k, v]: any) => [k, v?.status]))}`,
    );
    const jqv = spawnSync("jq", ["-e", "."], { input: fs.readFileSync(path.join(tmp, "bare.json")), encoding: "utf8" });
    check(jqv.status === 0, "collect-incr: output passes jq -e .");
    const bareInc = run(["--ledger", path.join(tmp, "bare-ledger.json"), "--out", path.join(tmp, "bare2.json")], {}, farm);
    check(bareInc.status === 0 && bareInc.out?.semgrep?.status === "skipped" && bareInc.out?.secrets?.status === "ok", "collect-incr: tool-less auto run still valid", bareInc.err);
  } catch (e) {
    fail("collect-incr: test crashed", String((e as Error).message ?? e));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
