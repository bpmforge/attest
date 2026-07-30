// Pass 50 — local-only git: the forge is optional, and an impossible gate row is
// never a blocker.
//
// WHY: nothing in the git or SDLC path had ANY notion of a repo without a remote.
// Grepping agents/ and skills/ for local-only|no remote|offline returned nothing
// outside semgrep's offline cache. Three consequences, all of them the
// unwinnable-gate shape this repo keeps paying for:
//
//   * `git-expert --init` said "configure remotes (default: gitea primary +
//     github mirror) → push to all remotes" unconditionally, so a local-only run
//     either invents a URL or errors. A field HANDOFF had already been
//     hand-patched around it ("report any unavailable remote details rather than
//     fabricating them") — the gap was known and never fixed in the agent.
//   * The Phase 4 wave gate and the merge checklist both require "CI checks
//     green" on a PR. With no forge there is no PR and no CI, so the row cannot
//     be satisfied — an agent either stalls or fakes a ✓.
//   * The lead's own --init HANDOFF hard-coded the two remotes AND branch
//     protection, a forge feature that cannot exist locally.
//
// These are content assertions: the rule has to be present where the agent reads
// it, at the ONE detection point, with no per-mode forks to drift apart.

import * as fs from "node:fs";
import * as path from "node:path";

type Ok = (msg: string) => void;
type Fail = (msg: string, detail: string) => void;

export function testLocalOnlyGit(root: string, ok: Ok, fail: Fail) {
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

  // -- 1/5. One detection point, and it covers every forge-assuming step. ----
  {
    const g = read("agents/git-expert.md");
    const needed: Array<[string, RegExp]> = [
      [
        "the `git remote` empty-output detection",
        /git remote\b[\s\S]{0,120}empty output → LOCAL-ONLY/i,
      ],
      ["skipped-and-reported, not attempted", /SKIPPED \(local-only\)/],
      ["remotes + push", /configure remotes, push to all remotes/],
      [
        "the draft-PR rule is exempted",
        /"draft PR is not optional" rule does not apply/,
      ],
      [
        "branch protection is a forge feature",
        /branch protection[\s\S]{0,200}cannot exist locally/i,
      ],
      ["hooks are the local substitute", /commitlint \+ lefthook\/husky/],
      ["CI has a local substitute", /no CI exists/],
      [
        "--release skips the forge releases",
        /tag locally; skip the pushes and forge releases/,
      ],
      ["--sync refuses outright", /nothing to sync — this repo has no remotes/],
      ["never fabricate a remote", /Never fabricate/],
    ];
    const missing = needed
      .filter(([, re]) => !re.test(g))
      .map(([label]) => label);
    if (missing.length === 0) {
      ok(
        "local-only: git-expert carries one detection point covering every forge-assuming step",
      );
    } else {
      fail(
        "local-only: git-expert carries one detection point covering every forge-assuming step",
        `missing: ${missing.join("; ")}`,
      );
    }
  }

  // -- 1b. Precedence, found by challenging the fix rather than the old text:
  //    two ABSOLUTE instructions sat elsewhere in the same file and would have
  //    overridden the table above — the forge-CLI probe ran before any remote
  //    check, and the draft-PR rule said flatly "This is not optional".
  {
    const g = read("agents/git-expert.md");
    const probeConditioned =
      /Check tool availability — \*\*only if `git remote` printed something/.test(
        g,
      ) && /If \[3\] found remotes/.test(g);
    const draftConditioned =
      /This is not optional \*\*where a forge exists\*\*/.test(g) &&
      /Do not read "not optional" as license to invent a remote/.test(g);
    if (probeConditioned && draftConditioned) {
      ok(
        "local-only: the forge-CLI probe and the absolute draft-PR rule are both conditioned, so neither overrides the rule",
      );
    } else {
      fail(
        "local-only: the forge-CLI probe and the absolute draft-PR rule are both conditioned, so neither overrides the rule",
        `probe=${probeConditioned} draftPR=${draftConditioned}`,
      );
    }
  }

  // -- 2/5. --init must not promise remotes unconditionally. ----------------
  {
    const g = read("agents/git-expert.md");
    const initLine = g
      .split("\n")
      .find((l) => l.includes("Bootstrap a new repo. Steps:"));
    if (
      initLine &&
      /only if the user has them/i.test(initLine) &&
      /Local-only repos/.test(initLine)
    ) {
      ok(
        "local-only: --init conditions the remote/push steps and points at the rule",
      );
    } else {
      fail(
        "local-only: --init conditions the remote/push steps and points at the rule",
        `--init step line: ${initLine ?? "(not found)"}`,
      );
    }
  }

  // -- 3/5. The Phase 4 wave gate rows in BOTH phase files. -----------------
  for (const f of [
    "agents/sdlc-init-phase-4.md",
    "agents/sdlc-init-phases-3-4.md",
  ]) {
    const s = read(f);
    const hasRow = /Every module PR has CI checks green/.test(s);
    const hasEscape =
      /local-only repo[\s\S]{0,300}no PR and no CI exist[\s\S]{0,200}N\/A/.test(
        s,
      ) && /impossible row is never a blocker and never an unearned/.test(s);
    if (hasRow && hasEscape) {
      ok(
        `local-only: ${path.basename(f)} CI gate row is N/A with a substitute, not a blocker`,
      );
    } else {
      fail(
        `local-only: ${path.basename(f)} CI gate row is N/A with a substitute, not a blocker`,
        `row=${hasRow} escape=${hasEscape}`,
      );
    }
  }

  // -- 4/5. The merge-gate checklist row. -----------------------------------
  {
    const c = read("references/git-workflow-checklist.md");
    if (
      /CI pipeline green[\s\S]{0,400}Local-only repo[\s\S]{0,300}N\/A \(local-only\)/.test(
        c,
      ) &&
      /never treat an impossible row as a blocker/.test(c)
    ) {
      ok(
        "local-only: the merge-gate CI row has a local substitute and cannot block",
      );
    } else {
      fail(
        "local-only: the merge-gate CI row has a local substitute and cannot block",
        "the CI pipeline green row has no local-only branch",
      );
    }
  }

  // -- 5/5. The lead's own --init HANDOFF must not hard-code remotes. -------
  {
    const p = read("agents/sdlc-init-phases-0-2.md");
    const bad =
      /configure remotes \(gitea primary \+ github mirror by default\)/.test(p);
    const good =
      /configure remotes ONLY if this project has them/.test(p) &&
      /empty means local-only/.test(p) &&
      /never invent a URL/.test(p);
    if (!bad && good) {
      ok(
        "local-only: the lead's --init HANDOFF conditions remotes and branch protection",
      );
    } else {
      fail(
        "local-only: the lead's --init HANDOFF conditions remotes and branch protection",
        `hard-coded=${bad} conditioned=${good}`,
      );
    }
  }
}
