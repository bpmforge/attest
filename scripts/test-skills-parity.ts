/**
 * test-skills-parity.ts — Pass 24 chapter module for scripts/test.ts (T22.12).
 *
 * `skills/` is per-target hand-maintained content (build-target-claude.mjs
 * never generates it), so the "author skills in both repos" invariant had
 * no validator — drift between bpm-opencode-experts and claude-experts
 * skills/ was silent. `skillsParity()` diffs skill IDENTITY (the SKILL.md
 * `name:`/`trigger:` frontmatter, not directory name — the two repos use
 * different directory-naming conventions for the same skill, e.g. opencode
 * `skills/git/` (`name: git-expert`) vs claude-experts `skills/git-expert/`
 * (`trigger: /git-expert`)) across the two repos, with a small cited
 * exceptions list for genuinely one-sided skills.
 *
 * Exercised here:
 *   1. Live repo pair: the resolver must correctly match every renamed pair
 *      (git/git-expert, dba/db-architect, containers/container-expert,
 *      review-code/code-review, research/researcher, security/security-audit,
 *      ux/ux-expert) with zero false positives, and the exceptions list must
 *      cover every documented one-sided skill. This does NOT assert the live
 *      pair is drift-free by assertion — it asserts the live result equals
 *      KNOWN_MISSING_IN_CLAUDE exactly. That set was emptied at v2.0.0 when
 *      the four then-open gaps (design-options, explore, simplify, steward)
 *      were ported, so the expectation today is zero missing on both sides.
 *      A new uncited gap therefore fails here, which is the point.
 *   2. RED (planted, per the ticket's acceptance criterion): a fixture skill
 *      present in only one repo must be flagged missing on the other side.
 *   3. GREEN: a skill present in both repos under a renamed directory (same
 *      resolved identity) must NOT be flagged; a same-name skill whose
 *      description text differs must warn (contentDrift) but not fail.
 */

import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

export async function testSkillsParity(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  try {
    const { skillsParity, KNOWN_MISSING_IN_CLAUDE } = await import(
      pathToFileURL(path.join(root, "scripts/build-target-claude.mjs")).href
    );

    // -- 1. live repo pair: resolver correctness + documented residual -----
    const claudeRoot = path.join(root, "..", "claude-experts");
    if (fs.existsSync(claudeRoot)) {
      const live = skillsParity(root, claudeRoot);
      const expectedMissingInClaude = [...KNOWN_MISSING_IN_CLAUDE].sort();
      if (
        JSON.stringify(live.missingInClaude) ===
          JSON.stringify(expectedMissingInClaude) &&
        live.missingInOpencode.length === 0
      )
        ok(
          `skills-parity — live repo pair: name/trigger resolver matches every renamed skill (0 false positives), exceptions cover every documented one-sided skill; ${expectedMissingInClaude.length} tracked gap(s) — matches KNOWN_MISSING_IN_CLAUDE exactly`,
        );
      else
        fail(
          "skills-parity — live repo pair",
          `missingInClaude=${JSON.stringify(live.missingInClaude)} missingInOpencode=${JSON.stringify(live.missingInOpencode)}`,
        );
    } else {
      // Soft-skip: CI's `npm test` step runs before the claude-experts
      // sibling checkout (ci.yml checks it out later, only for
      // `build:claude:check`), so this path is legitimately absent there.
      // The RED/GREEN fixtures below still exercise the resolver itself.
      ok(
        `skills-parity — live repo pair: skipped, claude-experts sibling not found at ${claudeRoot} (expected in CI's npm-test step; covered separately by build:claude:check)`,
      );
    }

    // -- 2. RED (planted): a fixture skill present in one repo only --------
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-skills-parity-"),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      const ocSkills = path.join(dir, "opencode", "skills");
      const clSkills = path.join(dir, "claude", "skills");
      fs.mkdirSync(path.join(ocSkills, "only-in-opencode"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(clSkills, "only-in-claude"), { recursive: true });
      fs.writeFileSync(
        path.join(ocSkills, "only-in-opencode", "SKILL.md"),
        "---\nname: only-in-opencode\ndescription: 'fixture, opencode side only'\n---\nbody\n",
      );
      fs.writeFileSync(
        path.join(clSkills, "only-in-claude", "SKILL.md"),
        "---\nname: Only In Claude\ntrigger: /only-in-claude\ndescription: 'fixture, claude side only'\n---\nbody\n",
      );

      const red = skillsParity(
        path.join(dir, "opencode"),
        path.join(dir, "claude"),
        new Set(),
      );
      if (
        red.missingInClaude.includes("only-in-opencode") &&
        red.missingInOpencode.includes("only-in-claude")
      )
        ok(
          "skills-parity — RED: a skill present in only one repo is flagged on the other side",
        );
      else
        fail(
          "skills-parity — RED: one-sided fixture skill",
          `missingInClaude=${JSON.stringify(red.missingInClaude)} missingInOpencode=${JSON.stringify(red.missingInOpencode)}`,
        );

      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 3. GREEN: renamed-directory match + description drift is a warning, not a failure --
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-skills-parity-"),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      const ocSkills = path.join(dir, "opencode", "skills");
      const clSkills = path.join(dir, "claude", "skills");
      // same identity, different directory names (mirrors git/git-expert)
      fs.mkdirSync(path.join(ocSkills, "widget"), { recursive: true });
      fs.mkdirSync(path.join(clSkills, "widget-expert"), { recursive: true });
      fs.writeFileSync(
        path.join(ocSkills, "widget", "SKILL.md"),
        "---\nname: widget-expert\ndescription: 'builds widgets'\n---\nbody\n",
      );
      fs.writeFileSync(
        path.join(clSkills, "widget-expert", "SKILL.md"),
        "---\nname: Widget Expert\ntrigger: /widget-expert\ndescription: 'assembles widgets'\n---\nbody\n",
      );

      const green = skillsParity(
        path.join(dir, "opencode"),
        path.join(dir, "claude"),
        new Set(),
      );
      if (
        green.missingInClaude.length === 0 &&
        green.missingInOpencode.length === 0 &&
        green.contentDrift.includes("widget-expert")
      )
        ok(
          "skills-parity — GREEN: renamed-directory pair resolves to the same identity (not flagged missing); differing description text warns (contentDrift) without failing",
        );
      else
        fail(
          "skills-parity — GREEN: renamed-directory pair",
          `missingInClaude=${JSON.stringify(green.missingInClaude)} missingInOpencode=${JSON.stringify(green.missingInOpencode)} contentDrift=${JSON.stringify(green.contentDrift)}`,
        );

      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("skills-parity", `unexpected failure: ${message}`);
  }
}
