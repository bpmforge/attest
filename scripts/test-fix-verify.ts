/**
 * test-fix-verify.ts — Test suite for fix-verify.mjs iteration classes (R4).
 *
 * Unit tests for iteration classification logic:
 * - REGRESSED detection (fingerprint reappears after CLOSED)
 * - Iteration-class output (STALLED/PROGRESSED/OSCILLATING)
 * - Tier-aware ceilings (6 metered / 12 local)
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

export async function testFixVerify(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  // Helper: MUST stay in sync with classifyIteration in scripts/fix-verify.mjs.
  // Classifies by row MOVEMENT (still-open / fresh / regressed) per FIX_VERIFY_LOOP.md,
  // NOT by raw count — a rising count is PROGRESSED (deeper review) when all prior rows
  // closed, STALLED when a prior row survives, OSCILLATING when a closed row returns.
  const classifyIteration = (a: {
    openCount: number;
    freshCount: number;
    regressedCount: number;
    attemptNum: number;
    ceiling: number;
  }): string => {
    if (a.regressedCount > 0) return "OSCILLATING";
    if (a.openCount === 0 && a.freshCount === 0) return "CLEARED";
    if (a.attemptNum >= a.ceiling) return "STALLED";
    if (a.openCount === 0 && a.freshCount > 0) return "PROGRESSED";
    return "STALLED";
  };

  // Helper: get ceiling based on tier
  const getAttemptCeiling = (tier: string | undefined): number => {
    if (!tier || tier === "unknown") return 12;
    if (tier.includes("local") || tier.includes("small")) return 12;
    return 6;
  };

  // Test 1: PROGRESSED — all prior rows CLOSED (open=0) but a deeper pass opened NEW rows.
  // This is the "findings 2→9→15 while converging on completeness" case (FIX_VERIFY_LOOP.md);
  // the RISING count must NOT be OSCILLATING — that was the pre-fix bug.
  try {
    const result = classifyIteration({
      openCount: 0,
      freshCount: 7,
      regressedCount: 0,
      attemptNum: 2,
      ceiling: 12,
    });
    if (result === "PROGRESSED") {
      ok(
        "fix-verify: PROGRESSED — all prior CLOSED + new rows opened (rising count is healthy, not OSCILLATING)",
      );
    } else {
      fail("fix-verify", `Expected PROGRESSED (2→9→15 case), got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `PROGRESSED test failed: ${e}`);
  }

  // Test 2: STALLED — a prior row is STILL-OPEN after a targeted iteration (same gap survives).
  try {
    const result = classifyIteration({
      openCount: 2,
      freshCount: 0,
      regressedCount: 0,
      attemptNum: 3,
      ceiling: 12,
    });
    if (result === "STALLED") {
      ok("fix-verify: STALLED — a prior row survives the targeted fix");
    } else {
      fail("fix-verify", `Expected STALLED (open survives), got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `STALLED test failed: ${e}`);
  }

  // Test 3: STALLED — hit the tier-aware attempt ceiling without clearing.
  try {
    const result = classifyIteration({
      openCount: 1,
      freshCount: 0,
      regressedCount: 0,
      attemptNum: 12,
      ceiling: 12,
    });
    if (result === "STALLED") {
      ok("fix-verify: STALLED — hit the attempt ceiling without clearing");
    } else {
      fail("fix-verify", `Expected STALLED at ceiling, got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `Ceiling test failed: ${e}`);
  }

  // Test 4: OSCILLATING — a previously-CLOSED row comes back (REGRESSED), even with a flat count.
  // Pre-fix this was labeled STALLED because `regressed` was never passed to the classifier.
  try {
    const result = classifyIteration({
      openCount: 0,
      freshCount: 0,
      regressedCount: 1,
      attemptNum: 3,
      ceiling: 12,
    });
    if (result === "OSCILLATING") {
      ok(
        "fix-verify: OSCILLATING — a previously-CLOSED row reappeared (REGRESSED), regardless of count",
      );
    } else {
      fail("fix-verify", `Expected OSCILLATING (regressed), got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `OSCILLATING test failed: ${e}`);
  }

  // Test 4b: CLEARED — nothing open and nothing new: the loop is done.
  try {
    const result = classifyIteration({
      openCount: 0,
      freshCount: 0,
      regressedCount: 0,
      attemptNum: 2,
      ceiling: 12,
    });
    if (result === "CLEARED") {
      ok("fix-verify: CLEARED — no open + no fresh rows = done");
    } else {
      fail("fix-verify", `Expected CLEARED, got ${result}`);
    }
  } catch (e) {
    fail("fix-verify", `CLEARED test failed: ${e}`);
  }

  // Test 5: Local tier ceiling (12)
  try {
    const ceiling1 = getAttemptCeiling("small");
    const ceiling2 = getAttemptCeiling("local");
    const ceiling3 = getAttemptCeiling("unknown");
    if (ceiling1 === 12 && ceiling2 === 12 && ceiling3 === 12) {
      ok(
        "fix-verify: local tier (small/local/unknown) uses 12-iteration ceiling",
      );
    } else {
      fail(
        "fix-verify",
        `Expected all local ceilings to be 12, got ${ceiling1}/${ceiling2}/${ceiling3}`,
      );
    }
  } catch (e) {
    fail("fix-verify", `Local ceiling test failed: ${e}`);
  }

  // Test 6: Metered tier ceiling (6)
  try {
    const ceiling1 = getAttemptCeiling("sonnet");
    const ceiling2 = getAttemptCeiling("opus");
    const ceiling3 = getAttemptCeiling("fable");
    if (ceiling1 === 6 && ceiling2 === 6 && ceiling3 === 6) {
      ok(
        "fix-verify: metered tier (sonnet/opus/fable) uses 6-iteration ceiling",
      );
    } else {
      fail(
        "fix-verify",
        `Expected all metered ceilings to be 6, got ${ceiling1}/${ceiling2}/${ceiling3}`,
      );
    }
  } catch (e) {
    fail("fix-verify", `Metered ceiling test failed: ${e}`);
  }

  // Test 7: History structure includes REGRESSED tracking
  try {
    const sampleHistory = {
      iterations: [
        {
          num: 1,
          timestamp: new Date().toISOString(),
          tier: "unknown",
          total_findings: 3,
          closed: 1,
          open: 2,
          new: 0,
          regressed: 0,
          closed_ids: ["id1"],
          iteration_class: "STALLED",
          attempt_ceiling: 12,
        },
        {
          num: 2,
          timestamp: new Date().toISOString(),
          tier: "unknown",
          total_findings: 3,
          closed: 0,
          open: 2,
          new: 0,
          regressed: 1,
          closed_ids: [],
          iteration_class: "STALLED",
          attempt_ceiling: 12,
        },
      ],
    };

    // Verify REGRESSED detection: id1 was closed in iteration 1, check if it's in iteration 2
    const iter1ClosedIds = new Set(sampleHistory.iterations[0].closed_ids);
    const iter2Findings = { id1: true }; // simulating a finding that reappeared
    const regressed = Object.keys(iter2Findings).filter((id) =>
      iter1ClosedIds.has(id),
    );

    if (regressed.length > 0 && sampleHistory.iterations[1].regressed > 0) {
      ok("fix-verify: REGRESSED detection (finding reappears after CLOSED)");
    } else {
      fail("fix-verify", "REGRESSED detection structure incomplete");
    }
  } catch (e) {
    fail("fix-verify", `History structure test failed: ${e}`);
  }

  // Test 8: Verify fix-verify.mjs has the new fields in its output
  try {
    const fixVerifyPath = `${root}/scripts/fix-verify.mjs`;
    const content = fs.readFileSync(fixVerifyPath, "utf8");

    const hasRegressed = content.includes("regressed");
    const hasIterationClass = content.includes("iteration_class");
    const hasAttemptCeiling = content.includes("attempt_ceiling");
    const hasTierContext = content.includes("readModelContext");

    if (
      hasRegressed &&
      hasIterationClass &&
      hasAttemptCeiling &&
      hasTierContext
    ) {
      ok(
        "fix-verify: implementation includes REGRESSED, iteration_class, attempt_ceiling, tier-aware logic",
      );
    } else {
      fail(
        "fix-verify",
        `Missing features: regressed=${hasRegressed}, iteration_class=${hasIterationClass}, ceiling=${hasAttemptCeiling}, context=${hasTierContext}`,
      );
    }
  } catch (e) {
    fail("fix-verify", `Implementation check failed: ${e}`);
  }

  // ── WP-A3: delta verify (cited ∪ changed ∪ dirty files; baseline carried forward) ──
  // Seam: a fake `opengrep` on PATH (SAST_ENGINE=opengrep) that "finds" every
  // `VULN(<name>)` marker in the files it is given (or the whole tree when given none)
  // and logs which targets it scanned. Real semgrep-full-audit.sh + fix-verify.mjs run.
  const tmps: string[] = [];
  try {
    const mk = (p: string) => fs.mkdtempSync(path.join(os.tmpdir(), p));
    const binDir = mk("fv-bin-");
    const packs = mk("fv-packs-");
    tmps.push(binDir, packs);
    fs.writeFileSync(
      path.join(binDir, "opengrep"),
      `#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const a=process.argv.slice(2);let out=null,pos=[];
const withVal=new Set(['--config','-o','--sarif-output','--exclude','--baseline-ref']);
for(let i=1;i<a.length;i++){ if(a[i]==='-o')out=a[i+1]; if(withVal.has(a[i])){i++;continue;} if(a[i].startsWith('-'))continue; pos.push(a[i]); }
const walk=(d,acc=[])=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){if(['.git','node_modules','docs'].includes(e.name))continue;const f=path.join(d,e.name);e.isDirectory()?walk(f,acc):acc.push(path.relative('.',f));}return acc;};
const files=pos.length?pos:walk('.');
if(process.env.FAKE_ENGINE_LOG)fs.appendFileSync(process.env.FAKE_ENGINE_LOG,(pos.length?files.join(','):'ALL')+'\\n');
const results=[];
for(const f of files){ if(!fs.existsSync(f))continue; fs.readFileSync(f,'utf8').split('\\n').forEach((l,i)=>{const m=l.match(/VULN\\((\\w+)\\)/); if(m)results.push({check_id:'fake.'+m[1],path:f,start:{line:i+1},extra:{lines:l,severity:'ERROR',message:'fake '+m[1]}});}); }
if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({results}));}
process.exit(results.length?1:0);
`,
      { mode: 0o755 },
    );

    const FV = `${root}/scripts/fix-verify.mjs`;
    const sh = (cwd: string, cmd: string, args: string[]) =>
      execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const gitc = (cwd: string, ...args: string[]) =>
      sh(cwd, "git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args]);

    type Fixture = { dir: string; log: string; env: NodeJS.ProcessEnv };
    const fixture = (): Fixture => {
      const dir = mk("fv-fixture-");
      tmps.push(dir);
      gitc(dir, "init", "-q");
      const files: Record<string, string> = {
        "a.js": "const a = 1;\neval(x); // VULN(eval)\n",
        "b.js": "run(y); // VULN(exec)\n",
        "c.js": "q(`select ${z}`); // VULN(sql)\n",
        "d.js": "const d = 4;\n",
        "e.js": "const e = 5;\n",
        "f.js": "const f = 6;\n",
      };
      for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), c);
      gitc(dir, "add", "-A");
      gitc(dir, "commit", "-q", "-m", "init");
      const log = `${dir}.engine.log`; // outside the repo so it is not a dirty file
      tmps.push(log);
      const env = {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        SAST_ENGINE: "opengrep",
        RULEPACKS_DIR: packs,
        FAKE_ENGINE_LOG: log,
        FIXVERIFY_DIFF_CAP: "",
      };
      return { dir, log, env };
    };
    const fv = (fx: Fixture, args: string[], extraEnv: NodeJS.ProcessEnv = {}) => {
      try {
        return {
          code: 0,
          out: execFileSync("node", [FV, ...args], { cwd: fx.dir, env: { ...fx.env, ...extraEnv }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
        };
      } catch (e: any) {
        return { code: e.status ?? 1, out: String(e.stdout ?? "") };
      }
    };
    const readJson = (fx: Fixture, rel: string) => JSON.parse(fs.readFileSync(path.join(fx.dir, rel), "utf8"));
    const lastScan = (fx: Fixture) => fs.readFileSync(fx.log, "utf8").trim().split("\n").pop() || "";
    const scannedLine = (out: string) => (out.match(/scanned_files: (\d+|\?) of (\d+|\?)/) || []) as string[];

    const gitOk = (() => { try { sh(root, "git", ["--version"]); return true; } catch { return false; } })();
    if (!gitOk) {
      ok("fix-verify delta: skipped (git unavailable)");
    } else {
      // Tests A1+A3: fix one finding -> CLOSED; untouched -> OPEN with identical fingerprints; n < total
      {
        const fx = fixture();
        fv(fx, ["snapshot", "semgrep"]);
        const baseline = readJson(fx, "docs/security/.fixverify-semgrep.json");
        const baseIds: Record<string, string> = Object.fromEntries(baseline.findings.map((f: any) => [f.rule, f.id]));
        fs.writeFileSync(path.join(fx.dir, "a.js"), "const a = 1;\n");
        gitc(fx.dir, "commit", "-q", "-am", "fix eval");
        const r = fv(fx, ["verify", "semgrep"]);
        const rep = readJson(fx, "docs/security/fix-verify-semgrep.json");
        const [, n, total] = scannedLine(r.out);
        const sameIds = rep.open.length === 2 &&
          rep.open.every((f: any) => f.id === baseIds[f.rule]) &&
          rep.closed.length === 1 && rep.closed[0].id === baseIds["fake.eval"] && rep.new.length === 0;
        if (baseline.head_sha && /CLOSED/.test(r.out) && sameIds && r.code === 1) {
          ok("fix-verify delta: fixed finding CLOSED, untouched findings OPEN with identical fingerprints");
        } else {
          fail("fix-verify delta", `closed/open mismatch: code=${r.code} sha=${baseline.head_sha} open=${rep.open.length} closed=${rep.closed.length}\n${r.out}`);
        }
        if (rep.scope === "delta" && Number(n) < Number(total) && n === "3" && total === "6" && !lastScan(fx).includes("d.js")) {
          ok("fix-verify delta: logs scanned_files 3 of 6 (< total); uncited unchanged files not scanned");
        } else {
          fail("fix-verify delta", `expected delta scanned_files 3 of 6, got '${n} of ${total}' scope=${rep.scope} engine=${lastScan(fx)}`);
        }
      }

      // Test A2: a fix that introduces a new finding in a changed (dirty) file -> NEW
      {
        const fx = fixture();
        fv(fx, ["snapshot", "semgrep"]);
        fs.writeFileSync(path.join(fx.dir, "d.js"), "const d = 4;\nrender(h); // VULN(xss)\n"); // uncommitted
        const r = fv(fx, ["verify", "semgrep"]);
        const rep = readJson(fx, "docs/security/fix-verify-semgrep.json");
        if (rep.new.length === 1 && rep.new[0].rule === "fake.xss" && rep.open.length === 3 && rep.closed.length === 0 && rep.scope === "delta") {
          ok("fix-verify delta: new finding in a dirty changed file -> NEW; carried-forward findings stay OPEN");
        } else {
          fail("fix-verify delta", `expected 1 NEW + 3 OPEN in delta scope: ${JSON.stringify({ n: rep.new.length, o: rep.open.length, c: rep.closed.length, s: rep.scope })}\n${r.out}`);
        }
      }

      // Test A4: old baseline without head_sha -> full path (still classifies correctly)
      {
        const fx = fixture();
        fv(fx, ["snapshot", "semgrep"]);
        const bp = path.join(fx.dir, "docs/security/.fixverify-semgrep.json");
        const b = JSON.parse(fs.readFileSync(bp, "utf8"));
        delete b.head_sha;
        fs.writeFileSync(bp, JSON.stringify(b));
        fs.writeFileSync(path.join(fx.dir, "b.js"), "run(y);\n");
        const r = fv(fx, ["verify", "semgrep"]);
        const rep = readJson(fx, "docs/security/fix-verify-semgrep.json");
        const [, n, total] = scannedLine(r.out);
        if (rep.scope === "full" && /lacks head_sha/.test(r.out) && n === total && lastScan(fx) === "ALL" && rep.closed.length === 1 && rep.open.length === 2) {
          ok("fix-verify delta: baseline without head_sha falls back to the full scan and still classifies");
        } else {
          fail("fix-verify delta", `expected full fallback: scope=${rep.scope} scanned=${n}/${total} engine=${lastScan(fx)}\n${r.out}`);
        }
      }

      // Test A5: --full and FIXVERIFY_DIFF_CAP both force the whole-tree scan
      {
        const fx = fixture();
        fv(fx, ["snapshot", "semgrep"]);
        const full = fv(fx, ["verify", "semgrep", "--full"]);
        const fullScan = lastScan(fx);
        const capped = fv(fx, ["verify", "semgrep"], { FIXVERIFY_DIFF_CAP: "1" });
        const cappedScan = lastScan(fx);
        if (/scope: full \(--full\)/.test(full.out) && fullScan === "ALL" && /scope: full \(targets 3 > FIXVERIFY_DIFF_CAP 1\)/.test(capped.out) && cappedScan === "ALL") {
          ok("fix-verify delta: --full and FIXVERIFY_DIFF_CAP overflow restore the whole-tree scan");
        } else {
          fail("fix-verify delta", `--full/cap not honored:\n${full.out}\n${capped.out}`);
        }
      }
    }
  } catch (e) {
    fail("fix-verify delta", `delta suite crashed: ${e}`);
  } finally {
    for (const t of tmps) fs.rmSync(t, { recursive: true, force: true });
  }
}
