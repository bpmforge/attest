/**
 * test-truthful-completion.ts — Pass 10 chapter module for scripts/test.ts (T27.2).
 *
 * Three pieces exercised here:
 *   1. validate-completion-manifest.sh v2 — Files-produced/Verify-result stat
 *      checks + Maker/Verifier identity check, against real fixtures.
 *   2. validate-tickets.sh — now chained into phase-4's GATE_VALIDATORS, so
 *      check-validator-fixtures.mjs (Pass 7) already exercises its red/green
 *      fixtures automatically; this adds a direct test for clarity.
 *   3. run-handoff-gates.sh's new Tracker gate — end-to-end through a real
 *      throwaway git repo (validate-tracker-fresh.sh is git-diff based, so
 *      this can't be faked with static fixture files alone).
 *
 * Run on real /bin/bash (not $BASH) per the T27.7 lesson.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFileSync, spawnSync } from "child_process";

export async function testTruthfulCompletion(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  function run(
    script: string,
    args: string[],
  ): { exitCode: number; stdout: string; stderr: string } {
    // spawnSync, not execFileSync: these validators print their JSON receipt to
    // stdout and their human progress/skip NOTES to stderr, and execFileSync
    // surfaces stderr only on a THROW. The previous shape hardcoded
    // `stderr: ""` on success, so any assertion about why a validator passed
    // was silently unassertable — you could only inspect a failing run.
    const r = spawnSync("/bin/bash", [script, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      exitCode: r.status ?? 1,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
    };
  }

  try {
    // -- 1. validate-completion-manifest.sh v2 -------------------------------
    const manifestValidator = path.join(
      root,
      "scripts/validators/validate-completion-manifest.sh",
    );
    const manifestFixtures = path.join(
      root,
      "evals/fixtures/validators/validate-completion-manifest",
    );

    {
      const r = run(manifestValidator, [
        path.join(manifestFixtures, "red/manifest.md"),
        path.join(manifestFixtures, "red"),
      ]);
      const hasAll =
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":4') &&
        r.stdout.includes("file-not-found") &&
        r.stdout.includes("verify-no-artifact") &&
        r.stdout.includes("maker-verifier-same") &&
        r.stdout.includes("no-tracker-line");
      if (hasAll)
        ok(
          "completion-manifest v2 — red fixture flags file-not-found + verify-no-artifact + maker-verifier-same + no-tracker-line",
        );
      else
        fail(
          "completion-manifest v2 — red fixture",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 500)}`,
        );
    }

    {
      const r = run(manifestValidator, [
        path.join(manifestFixtures, "green/manifest.md"),
        path.join(manifestFixtures, "green"),
      ]);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok("completion-manifest v2 — green fixture clean (0 gaps)");
      else
        fail(
          "completion-manifest v2 — green fixture",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
    }

    // -- regression (independent review, 2026-07-08): a "Files produced"
    // section with pure prose and no backtick-quoted path at all used to
    // evade the stat check entirely -- nothing was extracted, so nothing
    // was checked, so it silently passed with zero gaps despite being
    // exactly the unverifiable claim v2 exists to catch.
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-manifest-noartifact-"),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, "docs/reviews"), { recursive: true });
      fs.writeFileSync(path.join(dir, "docs/reviews/VERIFY.md"), "5 passed\n");
      const manifestPath = path.join(dir, "manifest.md");
      fs.writeFileSync(
        manifestPath,
        [
          "# Completion Manifest",
          "",
          "## Files produced",
          "I wrote some TypeScript files, they're great.",
          "",
          "## Decisions made",
          "- used real.ts",
          "",
          "## Known issues",
          "- none",
          "",
          "## Memory written",
          "- None — nothing durable",
          "",
          "## Verify result",
          "See `docs/reviews/VERIFY.md`",
          "",
          "Maker: coding-agent",
          "Verifier: alice",
          "Tracker updated: docs/work/DELEGATION_LOG.md",
          "",
          "coding-agent done -- shipped stuff",
          "",
        ].join("\n"),
      );
      const r = run(manifestValidator, [manifestPath, dir]);
      if (
        r.exitCode === 1 &&
        r.stdout.includes('"gaps":1') &&
        r.stdout.includes("files-no-artifact")
      )
        ok(
          "completion-manifest v2 — a 'Files produced' section with no backtick-quoted path is rejected, not silently accepted",
        );
      else
        fail(
          "completion-manifest v2 — files-no-artifact",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- red case (Shipwright field run 2026-07-12, W1-07 escape class): a
    // manifest citing (a) a symlink inside root pointing OUTSIDE it, or (b) a
    // `../` traversal path, used to pass the bare `-e` stat (it follows
    // symlinks and resolves traversal) -- letting a session "prove" files it
    // never produced or probe paths outside the worktree. Both must be
    // flagged file-escapes-root; the legit in-root file stays accepted.
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-manifest-symlink-"),
      );
      const outside = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-manifest-outside-"),
      );
      try {
        fs.mkdirSync(path.join(dir, "docs/reviews"), { recursive: true });
        fs.mkdirSync(path.join(dir, "src"), { recursive: true });
        fs.writeFileSync(
          path.join(dir, "docs/reviews/VERIFY.md"),
          "5 passed\n",
        );
        fs.writeFileSync(path.join(dir, "src/real.ts"), "export {};\n");
        fs.writeFileSync(path.join(outside, "secret.txt"), "TOP SECRET\n");
        fs.symlinkSync(
          path.join(outside, "secret.txt"),
          path.join(dir, "src/leak.ts"),
        );
        const manifestPath = path.join(dir, "manifest.md");
        fs.writeFileSync(
          manifestPath,
          [
            "# Completion Manifest",
            "",
            "## Files produced",
            "- `src/real.ts`",
            "- `src/leak.ts`",
            "- `../escape/anything.txt`",
            "",
            "## Decisions made",
            "- used real.ts",
            "",
            "## Known issues",
            "- none",
            "",
            "## Memory written",
            "- None — nothing durable",
            "",
            "## Verify result",
            "See `docs/reviews/VERIFY.md`",
            "",
            "Maker: coding-agent",
            "Verifier: alice",
            "Tracker updated: docs/work/DELEGATION_LOG.md",
            "",
            "coding-agent done -- shipped stuff",
            "",
          ].join("\n"),
        );
        const r = run(manifestValidator, [manifestPath, dir]);
        const escapes = (r.stdout.match(/file-escapes-root/g) ?? []).length;
        const legitFlagged = /src\/real\.ts[^"]*(escapes|not-found)/.test(
          r.stdout,
        );
        if (r.exitCode === 1 && escapes === 2 && !legitFlagged)
          ok(
            "completion-manifest v2 — symlink escape + ../ traversal flagged file-escapes-root; legit in-root file accepted",
          );
        else
          fail(
            "completion-manifest v2 — symlink/traversal escape",
            `exit=${r.exitCode} escapes=${escapes} stdout=${r.stdout.slice(0, 400)}`,
          );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
      }
    }

    // -- 2. validate-tickets.sh (now chained into phase-4) -------------------
    const ticketsValidator = path.join(
      root,
      "scripts/validators/validate-tickets.sh",
    );
    const ticketsFixtures = path.join(
      root,
      "evals/fixtures/validators/validate-tickets",
    );

    {
      const r = run(ticketsValidator, [path.join(ticketsFixtures, "red")]);
      if (
        r.exitCode === 1 &&
        r.stdout.includes("ticket-invariant") &&
        r.stdout.includes("missing string lane")
      )
        ok("validate-tickets — red fixture flags missing lane");
      else
        fail(
          "validate-tickets — red fixture",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
    }

    {
      const r = run(ticketsValidator, [path.join(ticketsFixtures, "green")]);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok("validate-tickets — green fixture clean");
      else
        fail(
          "validate-tickets — green fixture",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
        );
    }

    // A board whose modules are all MISSING `kind` must not read as "no module
    // tickets". The detector grepped the raw file for `"kind": "module"`, so the
    // single most common agent malformation — omitting `kind` — hid every ticket
    // from the validator whose job is to catch it, and run-until-done.sh's
    // completion gate green-lit a board the conductor cannot execute. Found by
    // scripts/e2e-sdlc-path.mjs on 2026-07-31: 4 modules, 16 real schema errors,
    // reported "nothing to check". Ground truth is a non-empty modules[].
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-tickets-kindless-"),
      );
      try {
        fs.mkdirSync(path.join(dir, "docs/work"), { recursive: true });
        fs.writeFileSync(
          path.join(dir, "docs/work/plan.json"),
          JSON.stringify(
            {
              goal: "kindless board",
              modules: [
                {
                  id: "parse",
                  name: "Parser",
                  write_scope: ["src/parse.js"],
                  depends_on: [],
                  acceptance: ["parses"],
                },
              ],
            },
            null,
            2,
          ),
        );
        // Match unquoted: the gap text reaches stdout inside the JSON receipt,
        // where the inner quotes are backslash-escaped.
        const r = run(ticketsValidator, [dir]);
        if (r.exitCode === 1 && /kind must be/.test(r.stdout))
          ok(
            "validate-tickets — a modules[] board with no `kind` is checked, not skipped",
          );
        else
          fail(
            "validate-tickets — kindless modules[] must not vacuously pass",
            `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
          );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    // The other side of that change: a plan with genuinely no modules[] layer
    // is still legitimately out of scope, and must stay silent rather than
    // becoming a new false positive for every node-only task-decomposer plan.
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-tickets-nomodules-"),
      );
      try {
        fs.mkdirSync(path.join(dir, "docs/work"), { recursive: true });
        fs.writeFileSync(
          path.join(dir, "docs/work/plan.json"),
          JSON.stringify(
            { goal: "node-only plan", nodes: [{ id: "n1" }] },
            null,
            2,
          ),
        );
        // The skip NOTE goes to stderr (progress stream); stdout carries only
        // the JSON receipt. Assert on both: clean receipt, and the reason.
        const r = run(ticketsValidator, [dir]);
        if (
          r.exitCode === 0 &&
          r.stdout.includes('"gaps":0') &&
          `${r.stdout}${r.stderr}`.includes("no modules[] layer")
        )
          ok("validate-tickets — a node-only plan is still out of scope");
        else
          fail(
            "validate-tickets — node-only plan should stay out of scope",
            `exit=${r.exitCode} stdout=${r.stdout.slice(0, 300)}`,
          );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    // -- 3. run-handoff-gates.sh Tracker gate, end-to-end through a real git repo
    const handoffGates = path.join(
      root,
      "scripts/validators/run-handoff-gates.sh",
    );

    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-handoff-gates-"),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, "src/auth"), { recursive: true });
      fs.mkdirSync(path.join(dir, "docs/reviews"), { recursive: true });
      fs.mkdirSync(path.join(dir, "docs/work"), { recursive: true });
      fs.writeFileSync(path.join(dir, "src/auth/.gitkeep"), "");
      fs.writeFileSync(path.join(dir, "docs/reviews/.gitkeep"), "");
      fs.writeFileSync(path.join(dir, "docs/work/.gitkeep"), "");
      execFileSync("git", ["init", "-q"], { cwd: dir });
      // Set a repo-local identity so the commit works on a fresh CI runner that
      // has no global git user configured (otherwise: "Author identity unknown").
      execFileSync("git", ["config", "user.email", "test@example.com"], {
        cwd: dir,
      });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
      execFileSync("git", ["add", "-A"], { cwd: dir });
      execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });

      fs.writeFileSync(path.join(dir, "src/auth/login.ts"), "export {};\n");
      const manifestPath = "docs/reviews/MANIFEST_auth.md";
      fs.writeFileSync(
        path.join(dir, manifestPath),
        [
          "# Completion Manifest",
          "",
          "## Files produced",
          "- `src/auth/login.ts` — login handler",
          "",
          "## Decisions made",
          "- used jwt",
          "",
          "## Known issues",
          "- none",
          "",
          "## Memory written",
          "- None — nothing durable",
          "",
          "## Verify result",
          "See `docs/reviews/MANIFEST_auth.md` — this file itself as a stand-in artifact",
          "",
          "Maker: coding-agent",
          "Verifier: alice",
          "Tracker updated: docs/work/DELEGATION_LOG.md",
          "",
          "coding-agent done -- shipped login.ts",
          "",
        ].join("\n"),
      );

      // No tracker file touched yet -> Tracker gate must fail
      const before = run(handoffGates, [
        "--scope",
        "src/auth",
        "--manifest",
        manifestPath,
        "--root",
        dir,
      ]);
      const beforeGood =
        before.exitCode === 1 &&
        before.stdout.includes('"gaps":1') &&
        before.stdout.includes('"category":"tracker"');
      if (beforeGood)
        ok(
          "run-handoff-gates — Tracker gate fails when work changed but no tracker file touched",
        );
      else
        fail(
          "run-handoff-gates — Tracker gate (before)",
          `exit=${before.exitCode} stdout=${before.stdout.slice(0, 400)}`,
        );

      // Touch the declared tracker -> all gates clean
      fs.writeFileSync(
        path.join(dir, "docs/work/DELEGATION_LOG.md"),
        "| ts | agent | task | DONE | 8/10 | note |\n",
      );
      const after = run(handoffGates, [
        "--scope",
        "src/auth",
        "--manifest",
        manifestPath,
        "--root",
        dir,
      ]);
      if (after.exitCode === 0 && after.stdout.includes('"gaps":0'))
        ok(
          "run-handoff-gates — all gates (scope/manifest/tracker) clean once tracker is touched",
        );
      else
        fail(
          "run-handoff-gates — Tracker gate (after)",
          `exit=${after.exitCode} stdout=${after.stdout.slice(0, 400)}`,
        );

      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- validate-tracker-fresh --since: the SDLC-shaped case ---------------
    // Per-step mode compares the tree to HEAD, which assumes the tree is ONE
    // step's footprint. In an SDLC run it is not: handoffs share docs/work/
    // and docs/reviews/, a git-expert checkpoint COMMITS the tracker, and
    // other steps' deliverables stay dirty. The tracker then leaves
    // `git diff HEAD` while the work does not, so the gate failed on a
    // tracker that was updated and committed minutes earlier — unclearable,
    // because the dirty files belonged to other steps (coreweave, 2026-08-04:
    // 114 dirty files, gate red all day). --since counts the branch's commits
    // too. These three cases pin the fix in both directions.
    {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-since-"));
      const git = (...args: string[]) =>
        execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
      git("init", "-qb", "main");
      git("config", "user.email", "t@t");
      git("config", "user.name", "t");
      fs.writeFileSync(path.join(dir, "README.md"), "x\n");
      git("add", "-A");
      git("commit", "-qm", "init");
      git("checkout", "-qb", "sdlc/setup");
      fs.mkdirSync(path.join(dir, "docs", "work"), { recursive: true });

      const base = () => git("merge-base", "HEAD", "main").trim();
      const run = () =>
        spawnSync(
          "/bin/bash",
          [
            path.join(root, "scripts/validators/validate-tracker-fresh.sh"),
            "--since",
            base(),
            dir,
          ],
          { encoding: "utf8" },
        );

      // 1. Dirty work, no tracker anywhere -> must still FAIL (the check's
      //    whole point; --since must not become a blanket pass).
      fs.writeFileSync(path.join(dir, "docs", "SRS.md"), "spec\n");
      const noTracker = run();
      // 2. Commit the work AND a tracker -> clean tree, nothing to track.
      fs.writeFileSync(
        path.join(dir, "docs", "work", "DELEGATION_LOG.md"),
        "log\n",
      );
      git("add", "-A");
      git("commit", "-qm", "work + record it");
      const committed = run();
      // 3. The coreweave shape and the actual regression: the tracker is
      //    COMMITTED (so absent from `git diff HEAD`) while other steps'
      //    deliverables sit dirty. Per-step mode called this "no tracker
      //    updated" and no edit could clear it. Must PASS.
      fs.writeFileSync(path.join(dir, "docs", "UNRELATED.md"), "junk\n");
      fs.writeFileSync(path.join(dir, "docs", "OTHER.md"), "more\n");
      const dirtyUnrelated = run();

      if (
        noTracker.status === 1 &&
        noTracker.stdout.includes("tracker-stale") &&
        committed.status === 0 &&
        dirtyUnrelated.status === 0
      )
        ok(
          "tracker-fresh --since: still fails on dirty work with no tracker, and stops false-failing when the tracker is committed while other steps\u2019 files sit dirty",
        );
      else
        fail(
          "tracker-fresh --since",
          `noTracker=${noTracker.status} committed=${committed.status} dirtyUnrelated=${dirtyUnrelated.status}`,
        );

      fs.rmSync(dir, { recursive: true, force: true });
    }
    // -- sdlc-hygiene.sh: silted docs/work -> clean, without losing a file --
    // The failure it heals: 88 of 99 untracked files were per-run scaffolding
    // no handoff owns, with the audit trail (manifests, review reports, gate
    // receipt) buried untracked in the same pile. The script must ignore the
    // ephemeral, COMMIT the durable, and never remove anything from disk.
    {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdlc-hygiene-"));
      const git = (...args: string[]) =>
        execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
      const W = (rel: string, body: string) => {
        const f = path.join(dir, rel);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, body);
      };
      git("init", "-qb", "main");
      git("config", "user.email", "t@t");
      git("config", "user.name", "t");
      // tracked scaffolding + a durable tracker
      for (const i of [1, 2, 3]) {
        W(`docs/work/HANDOFF_agent${i}.md`, "h\n");
        W(`docs/work/TASKS_agent${i}.md`, "t\n");
        W(`docs/work/context-for-agent${i}.md`, "c\n");
      }
      W("docs/work/sdlc-state.md", "s\n");
      W("docs/work/telemetry.jsonl", "{}\n");
      W("docs/work/DELEGATION_LOG.md", "d\n");
      git("add", "-A");
      git("commit", "-qm", "initial run");
      // untracked: more scaffolding + the audit trail
      W("docs/work/HANDOFF_agent9.md", "h\n");
      W("docs/reviews/MANIFEST_thing.md", "m\n");
      W("docs/work/gates/phase-2-receipt.json", "{}\n");

      const script = path.join(root, "scripts/sdlc-hygiene.sh");
      const count = () =>
        execFileSync("find", [path.join(dir, "docs"), "-type", "f"], {
          encoding: "utf8",
        })
          .split("\n")
          .filter(Boolean).length;

      const filesBefore = count();
      const dry = spawnSync("/bin/bash", [script, dir], { encoding: "utf8" });
      const untouched = !fs.existsSync(path.join(dir, ".gitignore"));
      const applied = spawnSync("/bin/bash", [script, dir, "--commit"], {
        encoding: "utf8",
      });
      const filesAfter = count();
      const dirty = git("status", "--porcelain").trim();
      const tracked = git("ls-files").split("\n").filter(Boolean);
      const scaffoldTracked = tracked.filter((f) =>
        /HANDOFF_|TASKS_|context-for-|sdlc-state|telemetry\.jsonl/.test(f),
      );
      const rerun = spawnSync("/bin/bash", [script, dir], { encoding: "utf8" });

      if (
        dry.status === 1 &&
        untouched &&
        applied.status === 0 &&
        filesAfter === filesBefore &&
        dirty === "" &&
        scaffoldTracked.length === 0 &&
        tracked.includes("docs/reviews/MANIFEST_thing.md") &&
        tracked.includes("docs/work/gates/phase-2-receipt.json") &&
        tracked.includes("docs/work/DELEGATION_LOG.md") &&
        rerun.status === 0
      )
        ok(
          "sdlc-hygiene: dry run changes nothing, --commit untracks scaffolding while keeping every file on disk, commits the audit trail, and re-runs clean",
        );
      else
        fail(
          "sdlc-hygiene",
          `dry=${dry.status} untouched=${untouched} applied=${applied.status} files=${filesBefore}->${filesAfter} dirty="${dirty}" scaffoldTracked=${scaffoldTracked.length} rerun=${rerun.status}`,
        );

      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- sdlc-hygiene must NOT touch a project's own ignore choices ---------
    // Caught by sweeping real repos: attest ignores `docs/reviews/` wholesale
    // yet deliberately TRACKS docs/reviews/SECURITY_FINDINGS.md, and KPrust
    // has its own `.playwright-cli/` rule. Matching the project's full ignore
    // set would untrack both -- discarding a deliberate choice while claiming
    // to tidy SDLC scaffolding. The script may only act on rules it owns.
    {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hygiene-scope-"));
      const git = (...args: string[]) =>
        execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
      const W = (rel: string, body: string) => {
        const f = path.join(dir, rel);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, body);
      };
      git("init", "-qb", "main");
      git("config", "user.email", "t@t");
      git("config", "user.name", "t");
      // The project's OWN broad rule, plus a file it tracks in spite of it.
      W(".gitignore", "docs/reviews/\n.playwright-cli/\n");
      W("docs/reviews/SECURITY_FINDINGS.md", "kept on purpose\n");
      W(".playwright-cli/page.yml", "also kept\n");
      // ...and genuine SDLC scaffolding, which this script DOES own.
      W("docs/work/HANDOFF_a.md", "h\n");
      git("add", "-A", "-f");
      git("commit", "-qm", "init");

      const r = spawnSync(
        "/bin/bash",
        [path.join(root, "scripts/sdlc-hygiene.sh"), dir, "--apply"],
        { encoding: "utf8" },
      );
      const tracked = git("ls-files").split("\n").filter(Boolean);

      if (
        r.status === 0 &&
        tracked.includes("docs/reviews/SECURITY_FINDINGS.md") &&
        tracked.includes(".playwright-cli/page.yml") &&
        !tracked.includes("docs/work/HANDOFF_a.md")
      )
        ok(
          "sdlc-hygiene: untracks its own scaffolding while leaving files the project deliberately tracks under its own broad ignore rules",
        );
      else
        fail(
          "sdlc-hygiene scope",
          `status=${r.status} tracked=${JSON.stringify(tracked)}`,
        );

      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("truthful-completion", `unexpected failure: ${message}`);
  }
}
