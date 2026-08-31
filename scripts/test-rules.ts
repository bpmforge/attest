/**
 * test-rules.ts — chapter module for scripts/test.ts (P-A3, T1-03).
 *
 * The `rules/` primitive: glob-scoped context rules with
 * description/globs/alwaysApply frontmatter, loaded by
 * scripts/lib/rules.mjs. The Cursor-derived lesson (design doc §15.1) is
 * "load rules by glob, not always" — so the load-bearing behaviors are (a)
 * an alwaysApply rule is always selected, (b) a glob-scoped rule is
 * selected ONLY when a working-set file matches, and (c) a malformed rule
 * is rejected by the linter rather than silently skipped by the loader —
 * the loader skipping it while the linter misses it would be a rule that
 * appears to exist but never fires.
 *
 * Exercised here:
 *   1. Frontmatter parsing — valid dash-list globs, inline globs, quoted
 *      description, boolean alwaysApply.
 *   2. Malformed frontmatter — missing block, missing description,
 *      non-boolean alwaysApply, non-alwaysApply rule with no globs.
 *   3. globToRegExp semantics — `**` crosses `/`, `*` does not.
 *   4. selectRules() — alwaysApply ∪ glob-matched, nothing else.
 *   5. The repo's own rules/ dir lints clean and every shipped rule is
 *      reachable (alwaysApply or ≥1 glob).
 *   6. The validator's red/green fixtures fire correctly through the
 *      actual validate-rules.sh script (RED exits 1, GREEN exits 0).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

export async function testRules(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  try {
    const { parseRuleFrontmatter, selectRules, lintRules, globToRegExp } =
      await import(
        pathToFileURL(path.join(root, "scripts/lib/rules.mjs")).href
      );

    // -- 1. valid frontmatter ---------------------------------------------
    {
      const { frontmatter, errors } = parseRuleFrontmatter(
        '---\ndescription: \'Scoped rule\'\nglobs:\n  - "src/**/*.ts"\n  - "lib/*.mjs"\nalwaysApply: false\n---\nbody\n',
      );
      if (
        errors.length === 0 &&
        frontmatter.description === "Scoped rule" &&
        frontmatter.globs.length === 2 &&
        frontmatter.alwaysApply === false
      )
        ok(
          "rules — parses description/globs(dash-list)/alwaysApply frontmatter",
        );
      else
        fail(
          "rules — valid frontmatter parse",
          `errors=${JSON.stringify(errors)} fm=${JSON.stringify(frontmatter)}`,
        );
    }
    {
      const { frontmatter, errors } = parseRuleFrontmatter(
        '---\ndescription: inline\nglobs: "a/*.md, b/**/*.sh"\nalwaysApply: true\n---\n',
      );
      if (
        errors.length === 0 &&
        frontmatter.globs.join("|") === "a/*.md|b/**/*.sh" &&
        frontmatter.alwaysApply === true
      )
        ok("rules — parses inline comma-separated globs + alwaysApply: true");
      else
        fail(
          "rules — inline globs parse",
          `errors=${JSON.stringify(errors)} globs=${JSON.stringify(frontmatter?.globs)}`,
        );
    }

    // -- 2. malformed frontmatter is rejected ------------------------------
    {
      const noBlock = parseRuleFrontmatter(
        "# just a heading\nno frontmatter\n",
      );
      const noDesc = parseRuleFrontmatter(
        '---\nglobs: "x/*.ts"\nalwaysApply: false\n---\n',
      );
      const badBool = parseRuleFrontmatter(
        '---\ndescription: d\nglobs: "x/*.ts"\nalwaysApply: maybe\n---\n',
      );
      const noGlobs = parseRuleFrontmatter(
        "---\ndescription: d\nalwaysApply: false\n---\n",
      );
      if (
        noBlock.errors.length > 0 &&
        noDesc.errors.some((e: string) => e.includes("description")) &&
        badBool.errors.some((e: string) => e.includes("alwaysApply")) &&
        noGlobs.errors.some((e: string) => e.includes("globs"))
      )
        ok(
          "rules — rejects missing block / missing description / non-boolean alwaysApply / unreachable no-glob rule",
        );
      else
        fail(
          "rules — malformed frontmatter rejection",
          `noBlock=${noBlock.errors.length} noDesc=${JSON.stringify(noDesc.errors)} badBool=${JSON.stringify(badBool.errors)} noGlobs=${JSON.stringify(noGlobs.errors)}`,
        );
    }

    // -- 3. glob semantics --------------------------------------------------
    {
      const deep = globToRegExp("scripts/validators/**/*.sh");
      const shallow = globToRegExp("agents/*.md");
      if (
        deep.test("scripts/validators/validate-tests.sh") &&
        deep.test("scripts/validators/sub/dir/x.sh") &&
        !deep.test("scripts/lib/x.sh") &&
        shallow.test("agents/challenger.md") &&
        !shallow.test("agents/shared/GAUNTLET_LOOP.md")
      )
        ok("rules — glob semantics: ** crosses /, * stays within a segment");
      else fail("rules — glob semantics", "globToRegExp mismatch");
    }

    // -- 4. selectRules(): alwaysApply ∪ glob-matched ----------------------
    {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-test-"));
      const rulesDir = path.join(dir, "rules");
      fs.mkdirSync(rulesDir);
      fs.writeFileSync(
        path.join(rulesDir, "always.md"),
        "---\ndescription: always\nalwaysApply: true\n---\n",
      );
      fs.writeFileSync(
        path.join(rulesDir, "ts-only.md"),
        '---\ndescription: ts\nglobs: "src/**/*.ts"\nalwaysApply: false\n---\n',
      );
      fs.writeFileSync(
        path.join(rulesDir, "sh-only.md"),
        '---\ndescription: sh\nglobs: "scripts/**/*.sh"\nalwaysApply: false\n---\n',
      );
      const sel = selectRules(["src/app/main.ts", "README.md"], rulesDir);
      const names = sel
        .map((r: { file: string }) => path.basename(r.file))
        .sort();
      const none = selectRules(["README.md"], rulesDir).map(
        (r: { file: string }) => path.basename(r.file),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      if (
        JSON.stringify(names) === JSON.stringify(["always.md", "ts-only.md"]) &&
        JSON.stringify(none) === JSON.stringify(["always.md"])
      )
        ok(
          "rules — selectRules(): alwaysApply always selected, glob rule only on match, unmatched rule excluded",
        );
      else
        fail(
          "rules — selectRules()",
          `matched=${JSON.stringify(names)} unmatchedSet=${JSON.stringify(none)}`,
        );
    }

    // -- 5. the repo's own rules/ dir is clean and reachable ---------------
    {
      const gaps = lintRules(path.join(root, "rules"));
      const shipped = fs
        .readdirSync(path.join(root, "rules"))
        .filter((f) => f.endsWith(".md") && f !== "README.md");
      if (gaps.length === 0 && shipped.length >= 2)
        ok(
          `rules — repo rules/ lints clean (${shipped.length} rule files, 0 gaps)`,
        );
      else
        fail(
          "rules — repo rules/ lint",
          `gaps=${JSON.stringify(gaps)} shipped=${shipped.length}`,
        );
    }

    // -- 6. validator red/green fixtures through the real script -----------
    {
      const script = path.join(root, "scripts/validators/validate-rules.sh");
      const fx = path.join(root, "evals/fixtures/validators/validate-rules");
      const run = (target: string): number => {
        try {
          execFileSync("bash", [script, target], { stdio: "pipe" });
          return 0;
        } catch (e: unknown) {
          return (e as { status?: number }).status ?? 1;
        }
      };
      const red = run(path.join(fx, "red"));
      const green = run(path.join(fx, "green"));
      if (red === 1 && green === 0)
        ok(
          "rules — validate-rules.sh: red fixture exits 1, green fixture exits 0",
        );
      else
        fail(
          "rules — validate-rules.sh fixtures",
          `red exit=${red} (want 1), green exit=${green} (want 0)`,
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("rules", `unexpected failure: ${message}`);
  }
}
