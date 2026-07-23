/**
 * test-resume-anchor.ts -- chapter module for scripts/test.ts.
 *
 * Guards plugins/resume-anchor.ts, which keeps a long session oriented across
 * opencode autocompaction (field report, gpt-5-mini 2026-07: on a long review or
 * coding run the agent lost the thread after a compact — redoing finished work
 * and forgetting what it still owed).
 *
 * These are FUNCTIONAL tests: they import the plugin and invoke its hooks
 * against fixture directories, so they check the anchor's actual content — most
 * importantly that PRODUCE files are marked done/MISSING by real filesystem
 * state, which is the line that tells a confused model what work remains.
 *
 * The end-to-end proof (that the anchor reaches the model) was run separately on
 * github-copilot/gpt-5-mini: asked with tools forbidden, it named the missing
 * PRODUCE file and the exact completion phrase, both of which appear nowhere but
 * the injected anchor.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ResumeAnchor } from "../plugins/resume-anchor.ts";

type Hooks = {
  "experimental.chat.system.transform"?: (
    i: unknown,
    o: { system: string[] },
  ) => Promise<void>;
  "experimental.session.compacting"?: (
    i: unknown,
    o: { context: string[]; prompt?: string },
  ) => Promise<void>;
};

/** A project with one active HANDOFF: alpha produced, beta still owed. */
function makeFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "resume-anchor-"));
  fs.mkdirSync(path.join(root, "docs/work"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/reviews"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs/work/HANDOFF_code-reviewer.md"),
    [
      "SDLC-TASK for code-reviewer:",
      "",
      "PRODUCE exactly these files (nothing else):",
      "- docs/reviews/CODE_REVIEW_alpha.md   -- findings for alpha",
      "- docs/reviews/CODE_REVIEW_beta.md    -- findings for beta",
      "",
      'Print exactly: "code-reviewer done -- ZEBRA-77"',
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "docs/work/STATE.md"),
    "# STATE\n\n## In flight\n- reviewing module beta\n\n## Next\n- finish CODE_REVIEW_beta.md\n",
  );
  // alpha exists, beta deliberately does not
  fs.writeFileSync(
    path.join(root, "docs/reviews/CODE_REVIEW_alpha.md"),
    "# alpha\n",
  );
  return root;
}

async function anchorFor(root: string): Promise<string> {
  const prev = process.cwd();
  process.chdir(root);
  try {
    const hooks = (await ResumeAnchor({} as never)) as Hooks;
    const out = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]?.({}, out);
    return out.system.join("\n");
  } finally {
    process.chdir(prev);
  }
}

export async function testResumeAnchor(
  _root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const fixture = makeFixture();
  try {
    const anchor = await anchorFor(fixture);

    // -- 1/5. The done/missing split is the whole point. --------------------
    const marksBetaMissing =
      /\[MISSING\]\s*docs\/reviews\/CODE_REVIEW_beta\.md/.test(anchor);
    const marksAlphaDone =
      /\[done\]\s*docs\/reviews\/CODE_REVIEW_alpha\.md/.test(anchor);
    if (marksBetaMissing && marksAlphaDone) {
      ok(
        "resume-anchor -- PRODUCE status is computed from the filesystem: alpha [done], beta [MISSING]",
      );
    } else {
      fail(
        "resume-anchor -- PRODUCE status",
        `alphaDone=${marksAlphaDone} betaMissing=${marksBetaMissing} in:\n${anchor}`,
      );
    }

    // -- 2/5. Completion phrase must survive verbatim. ----------------------
    if (anchor.includes("code-reviewer done -- ZEBRA-77")) {
      ok(
        "resume-anchor -- carries the exact completion phrase from the active HANDOFF",
      );
    } else {
      fail("resume-anchor -- completion phrase", `not found in:\n${anchor}`);
    }

    // -- 3/5. Points at the HANDOFF and the next step. ----------------------
    const hasHandoff = /docs\/work\/HANDOFF_code-reviewer\.md/.test(anchor);
    const hasNext = /finish CODE_REVIEW_beta\.md/.test(anchor);
    if (hasHandoff && hasNext) {
      ok(
        "resume-anchor -- names the active HANDOFF path and STATE.md's single Next step",
      );
    } else {
      fail(
        "resume-anchor -- pointers",
        `handoff=${hasHandoff} next=${hasNext}`,
      );
    }

    // -- 3b/5. Parallel fan-out must NOT assert one agent's phrase. --------
    // /review writes three HANDOFFs into one docs/work/. Newest-by-mtime would
    // hand a /security session the performance-engineer's completion phrase,
    // stated confidently — worse than no anchor at all.
    fs.writeFileSync(
      path.join(fixture, "docs/work/HANDOFF_security-auditor.md"),
      [
        "SDLC-TASK for security-auditor:",
        "",
        "PRODUCE exactly these files (nothing else):",
        "- docs/security/SECURITY_AUDIT.md   -- findings",
        "",
        'Print exactly: "security-auditor done -- OTTER-99"',
        "",
      ].join("\n"),
    );
    const multi = await anchorFor(fixture);
    const listsBoth =
      /HANDOFF_code-reviewer\.md/.test(multi) &&
      /HANDOFF_security-auditor\.md/.test(multi);
    const assertsNoPhrase =
      !multi.includes("ZEBRA-77") && !multi.includes("OTTER-99");
    if (listsBoth && assertsNoPhrase) {
      ok(
        "resume-anchor -- with multiple HANDOFFs it lists them and asserts NO phrase/PRODUCE (never hands one agent another's contract)",
      );
    } else {
      fail(
        "resume-anchor -- parallel fan-out",
        `listsBoth=${listsBoth} assertsNoPhrase=${assertsNoPhrase} in:\n${multi}`,
      );
    }
    fs.rmSync(path.join(fixture, "docs/work/HANDOFF_security-auditor.md"));

    // -- 4/5. Silent on projects with no SDLC state. ------------------------
    // This rides on every request, so it must cost nothing when irrelevant.
    const empty = fs.mkdtempSync(
      path.join(os.tmpdir(), "resume-anchor-empty-"),
    );
    const emptyAnchor = await anchorFor(empty);
    fs.rmSync(empty, { recursive: true, force: true });
    if (emptyAnchor === "") {
      ok(
        "resume-anchor -- emits nothing on a project with no HANDOFF/STATE (no per-request tax)",
      );
    } else {
      fail(
        "resume-anchor -- empty project",
        `expected no anchor, got:\n${emptyAnchor}`,
      );
    }

    // -- 5/5. Compaction hook appends, never replaces the default prompt. ---
    // Replacing opencode's summarizer wholesale swaps a known-good default for
    // an untested one; we only add must-survive pointers.
    const prev = process.cwd();
    process.chdir(fixture);
    let ctx: { context: string[]; prompt?: string };
    try {
      const hooks = (await ResumeAnchor({} as never)) as Hooks;
      ctx = { context: [] };
      await hooks["experimental.session.compacting"]?.({}, ctx);
    } finally {
      process.chdir(prev);
    }
    const appended = ctx.context.length === 1;
    const leavesPrompt = ctx.prompt === undefined;
    const namesPhrase = ctx.context.join("").includes("ZEBRA-77");
    if (appended && leavesPrompt && namesPhrase) {
      ok(
        "resume-anchor -- compaction hook appends must-survive context and leaves the default prompt alone",
      );
    } else {
      fail(
        "resume-anchor -- compaction hook",
        `appended=${appended} leavesDefaultPrompt=${leavesPrompt} namesPhrase=${namesPhrase}`,
      );
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}
