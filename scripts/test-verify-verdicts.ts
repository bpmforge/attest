// Pass 49 — wrong-verdict channels in verify-handoff.sh (group A).
//
// WHY: the harness exists so a verdict cannot be narrated away. Three field
// traces (2026-07, downstream project) showed the verdict itself could be wrong:
//
//   V-01  `biome check scripts/conductor` → "No files were processed in the
//         specified paths / These paths were provided but ignored" → RED, and
//         the specialist stalled: "I cannot proceed to commit/push/manifest/
//         done-gate honestly until the verify fence is green." The biome config
//         excludes that path; the defect was in the fence, not the code. The
//         inverse is worse — `jest --passWithNoTests` exits 0 having tested
//         nothing, and that read as a pass.
//   V-03  "baseline regression recorded by harness: current 115 vs stored 125 —
//         REGRESSION", while the agent proved "10/118 baseline failures already
//         exist on main before my change". A summed count cannot separate a
//         pre-existing failure from a new one.
//   V-04  No baseline stored → no regression check ran at all, and the verdict
//         still said ALL GREEN.
//
// Each row below pins one channel in BOTH directions: the wrong verdict is gone,
// and the check cannot be tripped by output that is legitimately green.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

type Ok = (msg: string) => void;
type Fail = (msg: string, detail: string) => void;

// A realistic vitest failure block. "5 passed" keeps the pass-count non-zero, so
// this is a genuine failure and not a matched-nothing run.
const FAIL_A =
  'echo " FAIL  src/a.test.ts > suite > does a thing"; echo "Tests  1 failed | 5 passed (6)"; exit 1';
const FAIL_A_AND_C =
  'echo " FAIL  src/a.test.ts > suite > does a thing"; echo " FAIL  src/c.test.ts > suite > new breakage"; echo "Tests  2 failed | 5 passed (7)"; exit 1';

export async function testVerifyVerdicts(root: string, ok: Ok, fail: Fail) {
  const script = path.join(root, "scripts", "verify-handoff.sh");

  const mk = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "verify-verdict-"));
    fs.mkdirSync(path.join(d, "docs", "work"), { recursive: true });
    return d;
  };
  const run = (dir: string, args: string[]) =>
    spawnSync("bash", [script, ...args], { cwd: dir, encoding: "utf8" });
  const report = (dir: string) =>
    fs.readFileSync(path.join(dir, "docs", "work", "VERIFY_REPORT.md"), "utf8");
  const gitRepo = () => {
    const d = mk();
    const git = (...a: string[]) =>
      spawnSync("git", a, { cwd: d, encoding: "utf8" });
    git("init", "-q", ".");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    fs.writeFileSync(path.join(d, "seed.txt"), "seed\n");
    git("add", "-A");
    git("commit", "-qm", "seed");
    return { dir: d, git };
  };
  const dirs: string[] = [];
  const track = <T extends { dir: string } | string>(x: T): T => {
    dirs.push(typeof x === "string" ? x : (x as { dir: string }).dir);
    return x;
  };

  try {
    // -- V-01. Zero tests + exit 0 is NOT a pass. --------------------------
    {
      const d = track(mk());
      const r = run(d, ["-c", 'echo "No tests found, exiting with code 0"']);
      if (
        r.status === 1 &&
        /matched nothing \(path\/config defect, not a code defect\)/.test(
          r.stdout,
        )
      ) {
        ok(
          "V-01: a command that matched no tests and exited 0 is RED, not a pass",
        );
      } else {
        fail(
          "V-01: a command that matched no tests and exited 0 is RED, not a pass",
          `status=${r.status} stdout:\n${r.stdout}`,
        );
      }
    }

    // -- V-02. The biome case: named as a fence defect, not as "exit 1". ----
    {
      const d = track(mk());
      const r = run(d, [
        "-c",
        'echo "× No files were processed in the specified paths"; echo "These paths were provided but ignored: - scripts/conductor"; exit 1',
      ]);
      if (
        r.status === 1 &&
        /matched nothing \(path\/config defect/.test(r.stdout) &&
        !/RED — exit 1 from/.test(r.stdout) &&
        /\*\*Matched nothing\*\*/.test(report(d))
      ) {
        ok(
          "V-02: an excluded-path lint run is reported as a fence defect, not a code defect",
        );
      } else {
        fail(
          "V-02: an excluded-path lint run is reported as a fence defect, not a code defect",
          `status=${r.status} stdout:\n${r.stdout}`,
        );
      }
    }

    // -- V-01/V-02 GUARD (the landmine). An emptiness string somewhere in a
    //    run that DID test things must not flip a real GREEN. This is the
    //    monorepo shape: one package has no tests, a thousand pass elsewhere.
    {
      const d = track(mk());
      const r = run(d, [
        "-c",
        'echo "packages/foo: no test files"; echo "Tests  1000 passed (1000)"',
      ]);
      if (r.status === 0 && /VERIFY: ALL GREEN/.test(r.stdout)) {
        ok(
          "V-01 guard: an emptiness string in a run with passing tests stays GREEN",
        );
      } else {
        fail(
          "V-01 guard: an emptiness string in a run with passing tests stays GREEN",
          `status=${r.status} stdout:\n${r.stdout}`,
        );
      }
    }

    // -- V-04. No baseline means no regression check — the verdict says so. -
    {
      const d = track(mk());
      const r = run(d, ["-c", 'echo "Tests 5 passed"']);
      if (
        r.status === 0 &&
        /ALL GREEN \(1\/1\) — BASELINE NOT CHECKED/.test(r.stdout)
      ) {
        ok("V-04: ALL GREEN states that no regression check was performed");
      } else {
        fail(
          "V-04: ALL GREEN states that no regression check was performed",
          `status=${r.status} stdout:\n${r.stdout}`,
        );
      }
    }

    // -- V-03a. Every current failure is in the baseline → BASELINE_RED. ----
    //    The downstream project case: 10 failures that pre-date the branch, and the agent
    //    was told it had regressed.
    {
      const { dir, git } = track(gitRepo());
      run(dir, ["-c", FAIL_A, "--baseline"]);
      fs.writeFileSync(path.join(dir, "feature.txt"), "work\n");
      git("add", "-A");
      git("commit", "-qm", "feature work");
      const r = run(dir, ["-c", FAIL_A]);
      if (
        r.status === 3 &&
        /VERIFY: BASELINE_RED/.test(r.stdout) &&
        /1 failing signature\(s\), 0 new/.test(r.stdout) &&
        /pre-date this work/.test(report(dir))
      ) {
        ok(
          "V-03a: a failure set matching the baseline is BASELINE_RED, exit 3, not the agent's defect",
        );
      } else {
        fail(
          "V-03a: a failure set matching the baseline is BASELINE_RED, exit 3, not the agent's defect",
          `status=${r.status} stdout:\n${r.stdout}`,
        );
      }
    }

    // -- V-03b. A NEW failure keeps it RED and only the new one is named. ---
    {
      const { dir, git } = track(gitRepo());
      run(dir, ["-c", FAIL_A, "--baseline"]);
      fs.writeFileSync(path.join(dir, "feature.txt"), "work\n");
      git("add", "-A");
      git("commit", "-qm", "feature work");
      const r = run(dir, ["-c", FAIL_A_AND_C]);
      const rep = report(dir);
      if (
        r.status === 1 &&
        /VERIFY: RED/.test(r.stdout) &&
        !/BASELINE_RED/.test(r.stdout) &&
        /\*\*1 NEW failure\(s\)\*\*/.test(rep) &&
        /new breakage/.test(rep) &&
        !/does a thing[\s\S]*NEW failure/.test(
          rep.split("Attribution")[1] ?? "",
        )
      ) {
        ok(
          "V-03b: a new failure stays RED and only the NEW signature is named",
        );
      } else {
        fail(
          "V-03b: a new failure stays RED and only the NEW signature is named",
          `status=${r.status} stdout:\n${r.stdout}`,
        );
      }
    }

    // -- V-03c. Pre-existing failures must NOT excuse a pass-count drop.
    //    Found by challenging the fix rather than the original code: the first
    //    version of the BASELINE_RED branch ran before the count check, so
    //    deleting tests in a repo that already had failures downgraded to a
    //    warning and would have shipped.
    {
      const { dir, git } = track(gitRepo());
      run(dir, [
        "-c",
        'echo " FAIL  src/a.test.ts > suite > does a thing"; echo "Tests  1 failed | 50 passed (51)"; exit 1',
        "--baseline",
      ]);
      fs.writeFileSync(path.join(dir, "feature.txt"), "work\n");
      git("add", "-A");
      git("commit", "-qm", "feature work");
      // Same single failure as the baseline, but 47 tests have vanished.
      const r = run(dir, [
        "-c",
        'echo " FAIL  src/a.test.ts > suite > does a thing"; echo "Tests  1 failed | 3 passed (4)"; exit 1',
      ]);
      if (
        r.status === 1 &&
        !/BASELINE_RED/.test(r.stdout) &&
        /REGRESSION/.test(report(dir))
      ) {
        ok("V-03c: pre-existing failures do not mask a pass-count regression");
      } else {
        fail(
          "V-03c: pre-existing failures do not mask a pass-count regression",
          `status=${r.status} stdout:\n${r.stdout}\nreport:\n${report(dir)}`,
        );
      }
    }

    // -- Signature extraction must handle the vitest/jest glyphs, not just the
    //    ASCII word FAIL — multibyte class matching differs between greps.
    {
      const { dir, git } = track(gitRepo());
      const cmd =
        'echo " ✗ src/x.test.ts > renders the thing (12ms)"; echo "Tests  1 failed | 4 passed (5)"; exit 1';
      run(dir, ["-c", cmd, "--baseline"]);
      fs.writeFileSync(path.join(dir, "feature.txt"), "work\n");
      git("add", "-A");
      git("commit", "-qm", "feature work");
      const r = run(dir, ["-c", cmd]);
      if (r.status === 3 && /BASELINE_RED/.test(r.stdout)) {
        ok(
          "signatures: the ✗ glyph is extracted and matched, and timings are normalized away",
        );
      } else {
        fail(
          "signatures: the ✗ glyph is extracted and matched, and timings are normalized away",
          `status=${r.status} stdout:\n${r.stdout}`,
        );
      }
    }

    // -- Provenance guard: a baseline carrying signatures but no commit line
    //    (hand-edited, or written by a pre-v2 run) is not trusted for
    //    attribution inside a git repo — attribution is a claim about history.
    {
      const { dir } = track(gitRepo());
      fs.writeFileSync(
        path.join(dir, "docs", "work", "verify-baseline.txt"),
        "5\n# fail: FAIL src/a.test.ts > suite > does a thing\n",
      );
      const r = run(dir, ["-c", FAIL_A]);
      if (r.status === 1 && /Attribution: \*\*UNKNOWN\*\*/.test(report(dir))) {
        ok(
          "provenance: a baseline with no commit line yields UNKNOWN inside a repo, not a pass",
        );
      } else {
        fail(
          "provenance: a baseline with no commit line yields UNKNOWN inside a repo, not a pass",
          `status=${r.status} stdout:\n${r.stdout}\nreport:\n${report(dir)}`,
        );
      }
    }

    // -- V-05. Provenance: a baseline from an unrelated commit is not trusted.
    {
      const { dir, git } = track(gitRepo());
      run(dir, ["-c", FAIL_A, "--baseline"]);
      // Rewrite history so the recorded baseline commit is no longer an ancestor.
      fs.writeFileSync(path.join(dir, "seed.txt"), "rewritten\n");
      git("add", "-A");
      git("commit", "-q", "--amend", "-m", "rewritten seed");
      const r = run(dir, ["-c", FAIL_A]);
      if (r.status === 1 && /Attribution: \*\*UNKNOWN\*\*/.test(report(dir))) {
        ok(
          "V-05: a baseline whose commit is not an ancestor of HEAD yields UNKNOWN, not a free pass",
        );
      } else {
        fail(
          "V-05: a baseline whose commit is not an ancestor of HEAD yields UNKNOWN, not a free pass",
          `status=${r.status} stdout:\n${r.stdout}\nreport:\n${report(dir)}`,
        );
      }
    }

    // -- Backward compatibility. The v2 baseline carries digits inside its
    //    provenance comments; the count must come from line 1 alone. The old
    //    reader (`tr -cd '0-9'` over the whole file) would have concatenated
    //    every digit in the file into one absurd number.
    {
      const d = track(mk());
      fs.writeFileSync(
        path.join(d, "docs", "work", "verify-baseline.txt"),
        "50\n# verify-baseline v2\n# commit: 1234567890abcdef\n# ncmds: 9\n",
      );
      const r = run(d, ["-c", 'echo "Tests 3 passed"']);
      if (
        r.status === 1 &&
        /pass-count regressed: 3 < baseline 50/.test(r.stdout)
      ) {
        ok(
          "baseline reader: the count comes from line 1, so provenance digits cannot corrupt it",
        );
      } else {
        fail(
          "baseline reader: the count comes from line 1, so provenance digits cannot corrupt it",
          `status=${r.status} stdout:\n${r.stdout}`,
        );
      }
    }

    // -- The done-gate must agree with the harness, not override it. --------
    {
      const doneScript = path.join(root, "scripts", "handoff-done.sh");
      const d = track(mk());
      fs.writeFileSync(
        path.join(d, "docs", "work", "HANDOFF_x.md"),
        'SDLC-TASK for coding-agent:\n\nPRODUCE\n- `docs/work/notes.md`\n\nWhen done, print "DONE".\n',
      );
      fs.writeFileSync(path.join(d, "docs", "work", "notes.md"), "n\n");

      fs.writeFileSync(
        path.join(d, "docs", "work", "VERIFY_REPORT.md"),
        "**VERIFY: BASELINE_RED — 10 failing signature(s), 0 new**\n",
      );
      const base = spawnSync("bash", [doneScript, "docs/work/HANDOFF_x.md"], {
        cwd: d,
        encoding: "utf8",
      });

      fs.writeFileSync(
        path.join(d, "docs", "work", "VERIFY_REPORT.md"),
        "**VERIFY: ALL GREEN (1/1) — BASELINE NOT CHECKED (no baseline stored)**\n",
      );
      const unchecked = spawnSync(
        "bash",
        [doneScript, "docs/work/HANDOFF_x.md"],
        {
          cwd: d,
          encoding: "utf8",
        },
      );

      if (
        /\[warn\].*BASELINE_RED/.test(base.stdout) &&
        !/\[FAIL\].*verify report is RED/.test(base.stdout) &&
        /\[warn\].*no regression check/.test(unchecked.stdout)
      ) {
        ok(
          "done-gate: BASELINE_RED and an unchecked baseline both warn — the gate agrees with the harness",
        );
      } else {
        fail(
          "done-gate: BASELINE_RED and an unchecked baseline both warn — the gate agrees with the harness",
          `baseline_red:\n${base.stdout}\nunchecked:\n${unchecked.stdout}`,
        );
      }
    }
  } finally {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
}
