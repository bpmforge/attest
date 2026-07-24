// Pass 33f — verify-handoff.sh: the mechanical verify-loop evidence harness.
//
// WHY: small models cannot reliably self-report verify compliance (2026-07
// field traces: errors relabeled "non-blocking", head-truncation hiding the
// "Found 57 errors" summary line, pass-by-proxy, counts below baseline shipped
// anyway). The harness makes those failures mechanical instead of forbidden;
// this pass proves each enforcement actually fires.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

type Ok = (msg: string) => void;
type Fail = (msg: string, detail: string) => void;

export async function testVerifyHandoff(root: string, ok: Ok, fail: Fail) {
  const script = path.join(root, "scripts", "verify-handoff.sh");
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "verify-handoff-"));
  fs.mkdirSync(path.join(fixture, "docs", "work"), { recursive: true });

  const run = (args: string[]) =>
    spawnSync("bash", [script, ...args], {
      cwd: fixture,
      encoding: "utf8",
    });
  const report = () =>
    fs.readFileSync(
      path.join(fixture, "docs", "work", "VERIFY_REPORT.md"),
      "utf8",
    );

  try {
    // -- 1/6. Green run stores a baseline and reports ALL GREEN. ------------
    fs.writeFileSync(
      path.join(fixture, "packet.md"),
      "# packet\n\n```verify\n" +
        'echo "Tests 5 passed (5)"\n' +
        'for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do echo "noise $i"; done; echo "Found 0 errors"\n' +
        "```\n",
    );
    const green = run(["packet.md", "--baseline"]);
    if (
      green.status === 0 &&
      /VERIFY: ALL GREEN \(2\/2\)/.test(green.stdout) &&
      fs.existsSync(path.join(fixture, "docs", "work", "verify-baseline.txt"))
    ) {
      ok(
        "verify-handoff -- green run: ALL GREEN verdict, exit 0, baseline stored",
      );
    } else {
      fail(
        "verify-handoff -- green run",
        `status=${green.status} stdout:\n${green.stdout}\n${green.stderr}`,
      );
    }

    // -- 2/6. The report keeps the TAIL (summary line), drops the head. -----
    // The observed field failure was `| sed -n '1,240p'` cutting off the
    // final "Found N errors" line — the one line that IS the evidence.
    const rep = report();
    if (rep.includes("Found 0 errors") && !/noise 2$/m.test(rep)) {
      ok(
        "verify-handoff -- report keeps the output TAIL (summary line), never the head",
      );
    } else {
      fail("verify-handoff -- tail preservation", rep.slice(-800));
    }

    // -- 3/6. A non-zero exit code is a RED verdict, exit 1, code in report.
    fs.writeFileSync(
      path.join(fixture, "red.md"),
      "```verify\necho fine\nbash -c 'echo \"error TS2339\"; exit 2'\n```\n",
    );
    fs.unlinkSync(path.join(fixture, "docs", "work", "verify-baseline.txt"));
    const red = run(["red.md"]);
    if (
      red.status === 1 &&
      /VERIFY: RED — exit 2 from:/.test(red.stdout) &&
      /Exit code: \*\*2\*\*/.test(report())
    ) {
      ok(
        "verify-handoff -- red command: RED verdict names command + exit code, exit 1",
      );
    } else {
      fail(
        "verify-handoff -- red command",
        `status=${red.status} stdout:\n${red.stdout}`,
      );
    }

    // -- 4/6. Pass-count below stored baseline is RED even with exit 0. -----
    // (The v2.27.0 field trace shipped a net loss of 26 tests with green
    // exits — deletion detection must be mechanical, not self-scored.)
    fs.writeFileSync(
      path.join(fixture, "docs", "work", "verify-baseline.txt"),
      "50\n",
    );
    const regress = run(["-c", 'echo "Tests 3 passed"']);
    if (
      regress.status === 1 &&
      /pass-count regressed: 3 < baseline 50/.test(regress.stdout)
    ) {
      ok(
        "verify-handoff -- pass-count below baseline is RED even when every exit code is 0",
      );
    } else {
      fail(
        "verify-handoff -- baseline regression",
        `status=${regress.status} stdout:\n${regress.stdout}`,
      );
    }

    // -- 5/6. No ```verify fence → usage error (exit 2), with a fix hint. ---
    fs.writeFileSync(path.join(fixture, "bare.md"), "# no fence here\n");
    const bare = run(["bare.md"]);
    if (bare.status === 2 && /no ```verify fence/.test(bare.stderr)) {
      ok(
        "verify-handoff -- missing fence is a usage error (exit 2) with an add-a-fence hint",
      );
    } else {
      fail(
        "verify-handoff -- missing fence",
        `status=${bare.status} stderr:\n${bare.stderr}`,
      );
    }

    // -- 6/6. Never-mask audit: the script itself contains no exit-code
    // suppression on the command execution path (the exact pattern it exists
    // to prevent), and runs commands verbatim via bash -c.
    const src = fs.readFileSync(script, "utf8");
    const runsVerbatim = /bash -c "\$cmd"/.test(src);
    const noSuppression = !/bash -c "\$cmd".*\|\|\s*true/.test(src);
    if (runsVerbatim && noSuppression) {
      ok(
        "verify-handoff -- runs each command verbatim via bash -c, no || true on the run path",
      );
    } else {
      fail(
        "verify-handoff -- verbatim/no-suppression audit",
        `runsVerbatim=${runsVerbatim} noSuppression=${noSuppression}`,
      );
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }

  // ==== auto-baseline + done-gate (git-backed fixture) ======================
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-done-"));
  const git = (args: string[]) =>
    spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  const sh = (scriptPath: string, args: string[]) =>
    spawnSync("bash", [scriptPath, ...args], { cwd: repo, encoding: "utf8" });
  const doneScript = path.join(root, "scripts", "handoff-done.sh");

  try {
    fs.mkdirSync(path.join(repo, "docs", "work"), { recursive: true });
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "src", "thing.ts"),
      "export const x = 1;\n",
    );
    const packet = path.join("docs", "work", "packet.md");
    fs.writeFileSync(
      path.join(repo, packet),
      "# packet\n\nPRODUCE exactly these files (nothing else):\n" +
        "- src/thing.ts -- the widget\n\n" +
        '```verify\necho "Tests 4 passed"\n```\n\n' +
        'Reply in chat with only: "task-234 done — see docs/work/packet.md"\n',
    );
    git(["init", "-q", "-b", "main"]);
    git(["config", "user.email", "t@t"]);
    git(["config", "user.name", "t"]);
    git(["add", "-A"]);
    git(["commit", "-qm", "init"]);

    // -- 7. Auto-baseline: clean pre-change tree, no --baseline flag given. --
    const auto = sh(script, [packet]);
    const baselineStored = fs.existsSync(
      path.join(repo, "docs", "work", "verify-baseline.txt"),
    );
    if (
      auto.status === 0 &&
      /storing baseline automatically/.test(auto.stdout) &&
      baselineStored
    ) {
      ok(
        "verify-handoff -- auto-baseline: clean pre-change tree stores the baseline without the flag",
      );
    } else {
      fail(
        "verify-handoff -- auto-baseline",
        `status=${auto.status} stored=${baselineStored} stdout:\n${auto.stdout}`,
      );
    }

    // -- 8. Done-gate GREEN: verify GREEN + committed + PRODUCE exists;
    //       extracts the completion phrase from the packet.
    const green = sh(doneScript, [packet, "--no-push-check"]);
    if (
      green.status === 0 &&
      /DONE-CHECK: GREEN/.test(green.stdout) &&
      /task-234 done — see docs\/work\/packet\.md/.test(green.stdout)
    ) {
      ok(
        "handoff-done -- GREEN on verified+committed state, completion phrase extracted for copy",
      );
    } else {
      fail(
        "handoff-done -- green path",
        `status=${green.status} stdout:\n${green.stdout}`,
      );
    }

    // -- 9. Done-gate RED on stale report + uncommitted source change. ------
    // (The fix-after-verify-without-rerun failure: an edit after the last
    // harness run makes the report worthless, and the tree is dirty.)
    fs.writeFileSync(
      path.join(repo, "src", "thing.ts"),
      "export const x = 2; // edited after verify\n",
    );
    const stale = sh(doneScript, [packet, "--no-push-check"]);
    if (
      stale.status === 1 &&
      /changed AFTER the verify run/.test(stale.stdout) &&
      /uncommitted changes outside docs\/work/.test(stale.stdout) &&
      /Do NOT print the completion phrase/.test(stale.stdout)
    ) {
      ok(
        "handoff-done -- RED on edit-after-verify (stale report) + uncommitted work; forbids the phrase",
      );
    } else {
      fail(
        "handoff-done -- stale/dirty path",
        `status=${stale.status} stdout:\n${stale.stdout}`,
      );
    }

    // -- 10. Done-gate RED when a PRODUCE file is missing / report absent. --
    git(["checkout", "-q", "--", "."]);
    fs.writeFileSync(
      path.join(repo, packet),
      "# packet\n\nPRODUCE exactly these files (nothing else):\n" +
        "- src/thing.ts -- the widget\n" +
        "- src/missing-widget.ts -- never written\n\n" +
        '```verify\necho "Tests 4 passed"\n```\n',
    );
    fs.rmSync(path.join(repo, "docs", "work", "VERIFY_REPORT.md"));
    const missing = sh(doneScript, [packet, "--no-push-check"]);
    if (
      missing.status === 1 &&
      /no verify report/.test(missing.stdout) &&
      /PRODUCE missing: src\/missing-widget\.ts/.test(missing.stdout)
    ) {
      ok(
        "handoff-done -- RED names the missing verify report and each missing PRODUCE file",
      );
    } else {
      fail(
        "handoff-done -- missing artifacts",
        `status=${missing.status} stdout:\n${missing.stdout}`,
      );
    }
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}
