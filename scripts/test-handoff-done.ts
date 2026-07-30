// Pass 48 — unwinnable gates: handoff-done.sh's RED conditions an agent cannot
// clear, and the file tools that refused to create a file.
//
// WHY: two field traces from the same 2026-07 run (new-project bootstrap from a
// a different project’s session) both ended in a permanent stall, not a wrong answer:
//
//   1. sdlc-lead: "the available update tool only overwrites existing files;
//      all four required new handoff/state files failed with 'File does not
//      exist'." The custom update/append tools guarded on existence, so the
//      first write into a not-yet-created docs/work/ dead-ended, and the
//      failure-loop rule (correctly) stopped the agent.
//   2. researcher: deliverables written and committed, completion phrase
//      withheld forever — handoff-done.sh was RED for three reasons the agent
//      was powerless to fix: a VERIFY_REPORT its fence-less HANDOFF could not
//      produce, uncommitted files belonging to other agents outside its
//      WRITE-SCOPE, and no upstream in a repo with no remote at all.
//
// An unwinnable gate is worse than a missing one: it converts finished work
// into a stall. These passes pin the fix in both directions — the impossible
// conditions warn, and every genuinely-blocking condition still fails.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

type Ok = (msg: string) => void;
type Fail = (msg: string, detail: string) => void;

const DOC_HANDOFF = `SDLC-TASK for researcher:

WRITE-SCOPE (exclusive):
- docs/research/
- docs/work/TASKS_researcher-feasibility.md

PRODUCE
- \`docs/research/FEASIBILITY.md\`
- \`docs/work/TASKS_researcher-feasibility.md\`

When done, print "RESEARCH COMPLETE".
`;

const CODE_HANDOFF = `SDLC-TASK for code:

WRITE-SCOPE (exclusive):
- src/

PRODUCE
- \`src/index.ts\`

When done, print "CODE COMPLETE".
`;

export async function testHandoffDone(root: string, ok: Ok, fail: Fail) {
  const script = path.join(root, "scripts", "handoff-done.sh");
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-done-"));
  const write = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(fixture, rel)), { recursive: true });
    fs.writeFileSync(path.join(fixture, rel), body);
  };
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
  const run = (...args: string[]) =>
    spawnSync("bash", [script, ...args], { cwd: fixture, encoding: "utf8" });

  try {
    git("init", "-q", ".");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");

    write("docs/work/HANDOFF_researcher.md", DOC_HANDOFF);
    write("docs/research/FEASIBILITY.md", "findings\n");
    write("docs/work/TASKS_researcher-feasibility.md", "- [x] done\n");
    write("README.md", "# fixture\n");
    git("add", "-A");
    git("commit", "-qm", "init");
    // Another agent's uncommitted edit, outside researcher's WRITE-SCOPE.
    fs.appendFileSync(path.join(fixture, "README.md"), "lead's edit\n");

    // -- 1/7. The researcher trace: doc-only HANDOFF, no remote, someone
    //         else's dirty file. Every blocker was outside the agent's reach,
    //         so all three must warn and the gate must go GREEN.
    const green = run("docs/work/HANDOFF_researcher.md");
    if (
      green.status === 0 &&
      /GREEN — print the completion phrase/.test(green.stdout) &&
      /RESEARCH COMPLETE/.test(green.stdout) &&
      /\[warn\].*no verify report/.test(green.stdout) &&
      /\[warn\].*this HANDOFF does not own/.test(green.stdout) &&
      /\[warn\].*no git remote configured/.test(green.stdout)
    ) {
      ok(
        "handoff-done: doc-only HANDOFF with no remote and out-of-scope dirt is GREEN",
      );
    } else {
      fail(
        "handoff-done: doc-only HANDOFF with no remote and out-of-scope dirt is GREEN",
        `exit ${green.status}; stdout: ${green.stdout}`,
      );
    }

    // -- 2/9. The escape hatch must not become a bypass: a HANDOFF that ships
    //         source with no ```verify fence fails ON the missing fence, once
    //         the repo has something a fence could actually run.
    write("docs/work/HANDOFF_code.md", CODE_HANDOFF);
    write("src/index.ts", "export const a = 1\n");
    write("package.json", '{"name":"fixture","scripts":{"test":"true"}}\n');
    const noFence = run("docs/work/HANDOFF_code.md", "--no-push-check");
    if (
      noFence.status === 1 &&
      /\[FAIL\].*ships source files.*no ```verify fence/.test(noFence.stdout)
    ) {
      ok("handoff-done: source PRODUCE without a verify fence is RED");
    } else {
      fail(
        "handoff-done: source PRODUCE without a verify fence is RED",
        `exit ${noFence.status}; stdout: ${noFence.stdout}`,
      );
    }

    // -- 3/7. Dirt INSIDE the WRITE-SCOPE is still the agent's to commit.
    git("add", "-A");
    git("commit", "-qm", "src");
    fs.appendFileSync(
      path.join(fixture, "src/index.ts"),
      "export const b = 2\n",
    );
    const mineDirty = run("docs/work/HANDOFF_code.md", "--no-push-check");
    if (
      mineDirty.status === 1 &&
      /\[FAIL\].*uncommitted changes to files this HANDOFF owns/.test(
        mineDirty.stdout,
      )
    ) {
      ok("handoff-done: uncommitted in-scope file is RED");
    } else {
      fail(
        "handoff-done: uncommitted in-scope file is RED",
        `exit ${mineDirty.status}; stdout: ${mineDirty.stdout}`,
      );
    }
    spawnSync("git", ["checkout", "-q", "--", "src/index.ts"], {
      cwd: fixture,
    });

    // -- 4/7. A remote that exists but has no upstream is a real push failure.
    git("remote", "add", "origin", path.join(fixture, "nonexistent.git"));
    const noUpstream = run("docs/work/HANDOFF_researcher.md");
    if (
      noUpstream.status === 1 &&
      /\[FAIL\].*no upstream set/.test(noUpstream.stdout)
    ) {
      ok("handoff-done: remote configured but no upstream is still RED");
    } else {
      fail(
        "handoff-done: remote configured but no upstream is still RED",
        `exit ${noUpstream.status}; stdout: ${noUpstream.stdout}`,
      );
    }
    git("remote", "remove", "origin");

    // -- 5/7. Neither WRITE-SCOPE nor PRODUCE parseable: nothing can be
    //         attributed, so dirt degrades to warn rather than the old FAIL.
    //         A false RED stalls the pipeline; a false GREEN here still leaves
    //         the verify and PRODUCE checks standing.
    write(
      "docs/work/HANDOFF_noscope.md",
      'SDLC-TASK for researcher:\n\nDo the thing.\n\nWhen done, print "RESEARCH COMPLETE".\n',
    );
    fs.appendFileSync(path.join(fixture, "README.md"), "another lead edit\n");
    const noScope = run("docs/work/HANDOFF_noscope.md");
    if (
      noScope.status === 0 &&
      /\[warn\].*no WRITE-SCOPE or PRODUCE list parsed/.test(noScope.stdout)
    ) {
      ok("handoff-done: unattributable dirt warns instead of failing");
    } else {
      fail(
        "handoff-done: unattributable dirt warns instead of failing",
        `exit ${noScope.status}; stdout: ${noScope.stdout}`,
      );
    }
    git("add", "-A");
    git("commit", "-qm", "readme");

    // -- 6/7. A RED verify report is untouched by any of the above.
    write(
      "docs/work/VERIFY_REPORT.md",
      "VERIFY: RED — exit 1 from: npx vitest run\n",
    );
    const redReport = run("docs/work/HANDOFF_researcher.md");
    if (
      redReport.status === 1 &&
      /\[FAIL\].*verify report is RED/.test(redReport.stdout)
    ) {
      ok("handoff-done: RED verify report still blocks");
    } else {
      fail(
        "handoff-done: RED verify report still blocks",
        `exit ${redReport.status}; stdout: ${redReport.stdout}`,
      );
    }

    // -- 6b. The verdict must NAME its blockers, not merely count them.
    //         Observed 2026-07-30: a specialist read a gate carrying 1 [FAIL]
    //         and 4 [warn] lines and reported the two warnings as its blockers
    //         ("lacks a verify fence and changes are uncommitted/unpushed"),
    //         when both were warnings and the single blocker was its own
    //         uncommitted deliverable.
    {
      // Leaves shared fixture state untouched — a later case owns VERIFY_REPORT.md.
      fs.writeFileSync(path.join(fixture, "docs/research/NEW.md"), "x\n");
      const named = run("docs/work/HANDOFF_researcher.md");
      const tail = named.stdout.slice(named.stdout.indexOf("DONE-CHECK: RED"));
      if (
        /Warnings above are NOT blockers/.test(tail) &&
        /uncommitted changes to files this HANDOFF owns/.test(tail) &&
        !/no git remote configured/.test(tail)
      ) {
        ok(
          "done-gate: the RED verdict names its blocking items and excludes the warnings",
        );
      } else {
        fail(
          "done-gate: the RED verdict names its blocking items and excludes the warnings",
          tail || named.stdout,
        );
      }
      fs.rmSync(path.join(fixture, "docs/research/NEW.md"), { force: true });
    }

    // -- 7/9. A path with a space must still be attributed. If the porcelain
    //         parse mangles it, an uncommitted in-scope file silently becomes a
    //         warn — a false GREEN in exactly the direction check 3 guards.
    write(
      "docs/work/HANDOFF_spaced.md",
      "SDLC-TASK for researcher:\n\nWRITE-SCOPE (exclusive):\n" +
        "- `docs/research/`\n\nPRODUCE\n" +
        "- `docs/research/my findings.md`\n\n" +
        'When done, print "RESEARCH COMPLETE".\n',
    );
    write("docs/research/my findings.md", "notes\n");
    const spaced = run("docs/work/HANDOFF_spaced.md");
    if (
      spaced.status === 1 &&
      /\[FAIL\].*uncommitted changes to files this HANDOFF owns/.test(
        spaced.stdout,
      )
    ) {
      ok(
        "handoff-done: an uncommitted in-scope path containing a space is RED",
      );
    } else {
      fail(
        "handoff-done: an uncommitted in-scope path containing a space is RED",
        `exit ${spaced.status}; stdout: ${spaced.stdout}`,
      );
    }
    git("add", "-A");
    git("commit", "-qm", "spaced");

    // -- 8/9. A repo with no runnable verify target cannot be fenced, so the
    //         missing-fence FAIL would be the same unwinnable gate one size
    //         smaller. It warns until something is runnable.
    fs.rmSync(path.join(fixture, "package.json"));
    fs.rmSync(path.join(fixture, "docs/work/VERIFY_REPORT.md"));
    const noTarget = run("docs/work/HANDOFF_code.md", "--no-push-check");
    if (/\[warn\].*no runnable verify target yet/.test(noTarget.stdout)) {
      ok(
        "handoff-done: missing fence warns when the repo has nothing runnable",
      );
    } else {
      fail(
        "handoff-done: missing fence warns when the repo has nothing runnable",
        `exit ${noTarget.status}; stdout: ${noTarget.stdout}`,
      );
    }
    write("package.json", '{"name":"fixture","scripts":{"test":"true"}}\n');

    // -- 9/9. A missing PRODUCE file is still RED — the check that backstops
    //         the softened WRITE-SCOPE and verify-fence rules.
    fs.rmSync(path.join(fixture, "docs/research/FEASIBILITY.md"));
    const missing = run("docs/work/HANDOFF_researcher.md");
    if (
      missing.status === 1 &&
      /\[FAIL\].*PRODUCE missing: docs\/research\/FEASIBILITY\.md/.test(
        missing.stdout,
      )
    ) {
      ok("handoff-done: missing PRODUCE file is RED");
    } else {
      fail(
        "handoff-done: missing PRODUCE file is RED",
        `exit ${missing.status}; stdout: ${missing.stdout}`,
      );
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

export async function testFileToolUpsert(root: string, ok: Ok, fail: Fail) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "file-tools-"));
  const load = async (name: string) =>
    (await import(path.join(root, "tools", `${name}.ts`))).default;

  try {
    const [write, update, append] = await Promise.all(
      ["write", "update", "append"].map(load),
    );

    // The exact shape of the trace: first write into a directory that does not
    // exist yet. All three tools must create the parent chain, not ENOENT.
    for (const [name, t] of [
      ["write", write],
      ["update", update],
      ["append", append],
    ] as const) {
      const p = path.join(fixture, name, "docs", "work", "HANDOFF_x.md");
      const res = await t.execute({ filePath: p, content: "packet\n" });
      if (!/^ERROR/.test(res) && fs.existsSync(p)) {
        ok(`${name}: creates a new file and its missing parent directories`);
      } else {
        fail(
          `${name}: creates a new file and its missing parent directories`,
          `returned: ${res}`,
        );
      }
    }

    // Create-vs-overwrite stays visible, so a typo'd path is still diagnosable
    // — that was the point of update's old existence guard.
    const p = path.join(fixture, "state.md");
    const created = await update.execute({ filePath: p, content: "a" });
    const updated = await update.execute({ filePath: p, content: "bb" });
    if (/Created \(did not exist\)/.test(created) && /^Updated/.test(updated)) {
      ok("update: reports create vs overwrite distinctly");
    } else {
      fail(
        "update: reports create vs overwrite distinctly",
        `create: ${created}; overwrite: ${updated}`,
      );
    }

    // Append must still append, not overwrite, once the file exists.
    const a = path.join(fixture, "log.md");
    await append.execute({ filePath: a, content: "x" });
    await append.execute({ filePath: a, content: "y" });
    if (fs.readFileSync(a, "utf8") === "xy") {
      ok("append: appends rather than overwrites an existing file");
    } else {
      fail(
        "append: appends rather than overwrites an existing file",
        `content: ${JSON.stringify(fs.readFileSync(a, "utf8"))}`,
      );
    }

    // No silent success on a missing argument — a local model omitting content
    // must get told, not get an empty file.
    const bad = await update.execute({ filePath: p });
    if (/^ERROR: 'content'/.test(bad)) {
      ok("update: missing content argument is an explicit error");
    } else {
      fail(
        "update: missing content argument is an explicit error",
        `returned: ${bad}`,
      );
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}
