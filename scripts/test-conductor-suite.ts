/**
 * test-conductor-suite.ts — Pass 53 chapter module for scripts/test.ts.
 *
 * WHY THIS EXISTS. `scripts/conductor/conductor.test.mjs` and
 * `resume.test.mjs` were written as standalone `node --test` files and never
 * wired into the Pass-N suite — originally because they fell outside the
 * authoring ticket's `scripts/conductor/**` write scope. The consequence was
 * not theoretical: v3.1.0 and v3.1.1 both shipped with ALL FOUR conductor
 * tests failing while `npm test` reported a clean 607, because nothing in the
 * suite ran them. The conductor's own E2E test had in fact been failing
 * identically since v2.30.0. A test that no harness executes is not a test;
 * it is a file that resembles one.
 *
 * So this Pass runs them as a subprocess and reports their TAP result. It
 * deliberately shells out to `node --test` rather than re-implementing the
 * fixtures here: those tests build real git repos, real worktrees and real
 * merges, and duplicating that setup is exactly the kind of second copy that
 * drifts from the original and then lies about it.
 *
 * Runtime is ~40s — real git, real worktrees and real validators, not stubs.
 */

import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { spawnSync } from "child_process";

/**
 * WP-T3 (TEST_IMPACT_PLAN.md): conductor Round 3 runs `validate-tests.sh --scope impact` by default and
 * `--scope full` under `--test-scope full` (bad values are a usage error). One real conductor run per
 * value on a one-ticket fixture (stub `opencode`, real worktree, real validators); the RUNTIME_<id>.md
 * the deterministic round writes names the exact command it ran.
 */
function testRound3TestScope(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const conductor = path.join(root, "scripts/conductor/conductor.mjs");
  const gates = path.join(root, "scripts/validators/run-handoff-gates.sh");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-testscope-"));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  } as NodeJS.ProcessEnv;
  const check = (cond: boolean, label: string, detail = "") => (cond ? ok(label) : fail(label, detail || "assertion false"));
  try {
    const stub = path.join(tmp, "opencode-stub.sh");
    fs.writeFileSync(stub, `#!/usr/bin/env bash
[[ "\${1:-}" == "models" ]] && { printf '%s\\n' fixture/coder-model fixture/reviewer-model; exit 0; }
[[ "\${1:-}" == "run" ]] || exit 0
PROMPT="$2"; shift 2
DIR=""
while [[ $# -gt 0 ]]; do case "$1" in --dir) DIR="$2"; shift 2 ;; *) shift ;; esac; done
mkdir -p "$DIR/a" "$DIR/docs/reviews"
if grep -qF 'Review the work already committed' <<<"$PROMPT"; then
  printf '# Code review — TICK-1\\n\\n- a/hello.txt:1 reviewed\\n\\nVERDICT: APPROVED\\n' > "$DIR/docs/reviews/CODE_REVIEW_TICK-1.md"
  exit 0
fi
echo hello > "$DIR/a/hello.txt"
cat > "$DIR/docs/reviews/MANIFEST_TICK-1.md" <<EOF
# Completion Manifest — TICK-1

Maker: conductor
Verifier: conductor-review
Tracker updated: CHANGELOG.md

## Files produced
- \\\`a/hello.txt\\\`

## Decisions
- kept it simple

## Known issues
- none

## Verify result
- \\\`a/hello.txt\\\` written and present

## Memory written
- None — nothing durable

TICK-1 done -- wrote a/hello.txt.
EOF
exit 0
`, { mode: 0o755 });

    const makeTarget = (name: string) => {
      const target = path.join(tmp, name);
      fs.mkdirSync(path.join(target, "docs/reviews"), { recursive: true });
      fs.mkdirSync(path.join(target, "docs/work"), { recursive: true });
      fs.writeFileSync(path.join(target, "docs/reviews/.gitkeep"), "");
      fs.writeFileSync(path.join(target, ".gitignore"), "docs/work/\n.conductor-worktrees/\n");
      fs.writeFileSync(path.join(target, "models.json"), JSON.stringify({ roles: { coder: "fixture/coder-model", reviewer: "fixture/reviewer-model" } }));
      fs.writeFileSync(path.join(target, "plan.json"), JSON.stringify({
        goal: "test-scope fixture",
        modules: [{
          id: "TICK-1", kind: "module", title: "Ticket one", lane: "lane-a", owner: null, status: "ready",
          write_scope: ["a/**"], depends_on: [], acceptance: ["writes a/hello.txt"],
          verify: `bash ${gates} --scope a --manifest docs/reviews/MANIFEST_TICK-1.md --root .`, manifest: "docs/reviews/MANIFEST_TICK-1.md",
        }],
      }, null, 2));
      for (const a of [["init", "-q", "-b", "main"], ["add", "-A"], ["commit", "-q", "-m", "fixture"]]) {
        const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...a], { cwd: target, env, encoding: "utf8" });
        if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
      }
      return target;
    };
    const runtimeDoc = (target: string) => {
      const dir = path.join(target, "docs/reviews");
      const f = fs.readdirSync(dir).find((n) => /^RUNTIME_TICK-1.*\.md$/.test(n));
      return f ? fs.readFileSync(path.join(dir, f), "utf8") : "";
    };
    const conduct = (target: string, extra: string[]) =>
      spawnSync(process.execPath, [conductor, "--root", target, "--rounds", "3", "--max-attempts", "1", "--no-push", ...extra], {
        cwd: target, env: { ...env, OPENCODE_BIN: stub }, encoding: "utf8", timeout: 170_000,
      });
    const testsRow = (doc: string) => doc.split("\n").find((l) => l.startsWith("| tests |")) ?? "";

    const dflt = conduct(makeTarget("default"), []);
    const docDefault = runtimeDoc(path.join(tmp, "default"));
    check(/validate-tests\.sh <worktree> --scope impact/.test(testsRow(docDefault)),
      "conductor Round 3: validate-tests.sh runs with --scope impact by default", `${testsRow(docDefault)} | exit ${dflt.status} ${(dflt.stderr || "").slice(-300)}`);
    const fullRun = conduct(makeTarget("full"), ["--test-scope", "full"]);
    check(/validate-tests\.sh <worktree> --scope full/.test(testsRow(runtimeDoc(path.join(tmp, "full")))),
      "conductor Round 3: --test-scope full runs validate-tests.sh --scope full", `${testsRow(runtimeDoc(path.join(tmp, "full")))} | exit ${fullRun.status} ${(fullRun.stderr || "").slice(-300)}`);
    const bad = spawnSync(process.execPath, [conductor, "--root", tmp, "--test-scope", "sometimes"], { encoding: "utf8", timeout: 30_000 });
    check(bad.status === 2 && /--test-scope must be impact\|auto\|full/.test(bad.stderr), "conductor: --test-scope rejects unknown values with exit 2", `${bad.status} ${bad.stderr}`);
  } catch (e) {
    fail("conductor Round 3 --test-scope fixture ran", String((e as Error)?.stack || e));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * DISCOVERED, NOT LISTED.
 *
 * This Pass began as a hardcoded list of two files, and the list is how the
 * problem recurs: on 2026-09-08 a sweep found SIX more `*.test.mjs` suites
 * that no harness had ever run — the entire JIRA board driver's unit, parity
 * and integration tests (jira-tickets*.test.mjs, 11 tests over a 342-line
 * driver), plus annotate, img-gate and log-hop. All six were green when found,
 * so nothing was broken; they were simply unprotected, which is the state
 * conductor.test.mjs was in while it stayed RED across three releases.
 *
 * A list has to be updated by whoever adds a suite, and the failure is silent
 * when they don't. Discovery cannot be forgotten: any `*.test.mjs` added
 * anywhere under scripts/ is run from the moment it exists.
 */
function discoverSuites(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".test.mjs")) found.push(path.relative(root, full));
    }
  };
  walk(path.join(root, "scripts"));
  return found.sort();
}

export function testConductorSuite(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  testRound3TestScope(root, ok, fail);

  // Pin the TAP reporter. node --test picks `spec` on a TTY and `tap`
  // otherwise, and the two print different summaries (`ℹ pass 6` vs
  // `# pass 6`) — parsing whichever happened to be chosen would make this
  // Pass's own result depend on where it was run from.
  const suites = discoverSuites(root);
  if (suites.length === 0) {
    fail(
      "conductor suite: node --test suites are discovered",
      "found no *.test.mjs under scripts/ — discovery is broken, which would make this Pass vacuously green",
    );
    return;
  }

  const result = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=tap", ...suites.map((s) => path.join(root, s))],
    { cwd: root, encoding: "utf8", timeout: 600_000 },
  );

  const out = `${result.stdout || ""}${result.stderr || ""}`;

  if (result.error) {
    fail(
      "conductor suite: node --test runs",
      `could not spawn node --test: ${result.error.message}`,
    );
    return;
  }

  // `node --test` emits a TAP summary; parse the counts rather than trusting
  // the exit code alone, so "ran nothing successfully" can never read as a
  // pass. A suite that matched zero tests exits 0 too.
  const passCount = Number(/^# pass (\d+)$/m.exec(out)?.[1] ?? NaN);
  const failCount = Number(/^# fail (\d+)$/m.exec(out)?.[1] ?? NaN);

  if (!Number.isFinite(passCount) || !Number.isFinite(failCount)) {
    fail(
      "conductor suite: node --test reports a TAP summary",
      `could not parse '# pass'/'# fail' from node --test output (exit ${result.status}). Last lines:\n${out.trim().split("\n").slice(-15).join("\n")}`,
    );
    return;
  }

  if (passCount === 0) {
    fail(
      "conductor suite: the conductor tests actually run",
      "node --test matched zero passing tests — an empty run must never read as a green suite",
    );
    return;
  }

  if (failCount > 0) {
    // Surface the failing test names, not just the count: this Pass exists
    // because a silent RED went unnoticed for three releases.
    const failing = out
      .split("\n")
      .filter((l) => /^not ok \d+ - /.test(l.trim()))
      .map((l) => `  ${l.trim()}`)
      .join("\n");
    fail(
      "conductor suite: every discovered node --test suite is green",
      `${failCount} conductor test(s) failing (${passCount} passing):\n${failing || out.trim().split("\n").slice(-20).join("\n")}`,
    );
    return;
  }

  ok(
    `conductor suite: ${suites.length} discovered node --test suite(s) green (${passCount} tests, real git worktrees + validators)`,
  );
}
