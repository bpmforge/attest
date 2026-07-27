/**
 * test-api-surface.ts — chapter module for scripts/test.ts.
 *
 * `api-surface.mjs --check` is a gate, so it needs red/green fixtures like every
 * other validator here. The two cases below are the ones that were verified by
 * hand against real packages while the script was written; encoding them keeps a
 * later refactor of `augmentations()` from silently breaking the parse.
 *
 * Both failures the gate exists to catch look identical to a passing build:
 *
 *   1. A dependency shipping no JavaScript. Verified against `@antv/x6-plugin-*`
 *      at 3.0.0, which contain only `index.css` after X6 v3 folded the plugins
 *      into core. The paired GREEN case is the one that made the naive check
 *      wrong: a genuinely CSS-only package (tw-animate-css) pulled in with
 *      `@import` must NOT be reported, or the gate tells people to delete a
 *      working dependency.
 *
 *   2. Augmented members called with nothing importing the package that declares
 *      them. Verified by deleting the `@testing-library/jest-dom` import from a
 *      real vitest setup file: the gate names the missing registration in one
 *      line where `tsc` emits 134 errors.
 *
 * The fixture packages mirror the real shapes rather than copying them — the
 * augmentation members are inherited through `extends` from a second file, which
 * is the layout a member-parser that only reads the augmentation site misses.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";

/**
 * Every `scripts/*.mjs` a skill tells the reader to run must actually reach the
 * Claude target, or the instruction is unrunnable there.
 *
 * `build-target-claude.mjs` copies scripts from an explicit six-entry allowlist
 * (`COPY_FILES`) plus `scripts/validators/*.sh` — NOT the whole directory. A new
 * script therefore ships to opencode via install.sh but silently never reaches
 * claude-experts. Caught when `--write` into a throwaway target produced a skill
 * referencing `api-surface.mjs` and no such file; nothing in the suite noticed,
 * because skills-parity compares skills and the build compares only what it
 * already knows to copy.
 */
async function testSkillScriptsShip(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const { COPY_FILES, COPY_GLOBS, SKILL_PARITY_EXCEPTIONS, KNOWN_MISSING_IN_CLAUDE } =
    await import(
      pathToFileURL(path.join(root, "scripts/build-target-claude.mjs")).href
    );
  // Only skills that actually reach claude-experts impose a requirement on their
  // scripts. `reflow` and `steward` are opencode-only (documented exceptions and
  // tracked gaps), so the scripts they call need never be generated — they ship
  // to opencode through install.sh, which copies scripts/ wholesale.
  const opencodeOnly = (skill: string) =>
    SKILL_PARITY_EXCEPTIONS.has(skill) || KNOWN_MISSING_IN_CLAUDE.has(skill);
  const shipped = (rel: string) =>
    COPY_FILES.includes(rel) ||
    COPY_GLOBS.some(
      ([dir, ext]: [string, string]) =>
        rel.startsWith(`${dir}/`) && rel.endsWith(ext),
    );

  const skillsDir = path.join(root, "skills");
  const missing: string[] = [];
  let referenced = 0;

  for (const skill of fs.readdirSync(skillsDir)) {
    const file = path.join(skillsDir, skill, "SKILL.md");
    if (!fs.existsSync(file) || opencodeOnly(skill)) continue;
    for (const m of fs
      .readFileSync(file, "utf8")
      .matchAll(/\bscripts\/([\w.-]+\.(?:mjs|sh))/g)) {
      const rel = `scripts/${m[1]}`;
      if (!fs.existsSync(path.join(root, rel))) continue; // illustrative path, not ours
      referenced++;
      if (!shipped(rel)) missing.push(`${skill} -> ${rel}`);
    }
  }

  if (!missing.length)
    ok(
      `skill-scripts-ship — every repo script referenced by a claude-bound skill (${referenced} reference(s)) is in COPY_FILES/COPY_GLOBS`,
    );
  else
    fail(
      "skill-scripts-ship",
      `referenced by a skill but never generated into claude-experts: ${missing.join(", ")}`,
    );
}

/** Minimal installed-package tree: package.json plus the given files. */
function pkg(
  modules: string,
  name: string,
  files: Record<string, string>,
  version = "1.0.0",
): void {
  const dir = path.join(modules, ...name.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name, version }),
  );
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
}

/** Runs --check and returns { code, out }; the gate exits 1 on any problem. */
function check(script: string, root: string): { code: number; out: string } {
  try {
    const out = execFileSync("node", [script, "--check", `--root=${root}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e: any) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

export async function testApiSurface(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  await testSkillScriptsShip(root, ok, fail);

  const script = path.join(root, "scripts/api-surface.mjs");
  if (!fs.existsSync(script)) {
    fail("api-surface — script present", `${script} not found`);
    return;
  }

  // Offline: manifest parsers (npm/cargo/go) and the 0.x-is-breaking semver rule.
  // Network-dependent modes (--outdated, --family) are exercised by hand against
  // real projects, not here — a CI gate must not depend on three registries.
  try {
    execFileSync("node", [script, "--selftest"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    ok("api-surface — selftest: manifest parsers + 0.x-breaking semver rule");
  } catch (e: any) {
    fail("api-surface — selftest", `${e.stdout ?? ""}${e.stderr ?? ""}`.trim());
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "api-surface-"));
  try {
    // ── RED: a stub dependency nothing references ─────────────────────────
    {
      const proj = path.join(tmp, "red-stub");
      const modules = path.join(proj, "node_modules");
      fs.mkdirSync(path.join(proj, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(proj, "package.json"),
        JSON.stringify({ dependencies: { "@scope/dead-plugin": "^3.0.0" } }),
      );
      pkg(modules, "@scope/dead-plugin", { "es/index.css": ".x {}" }, "3.0.0");
      fs.writeFileSync(path.join(proj, "src/app.ts"), "export const x = 1;\n");

      const r = check(script, proj);
      if (r.code === 1 && /dead-plugin ships no JavaScript/.test(r.out))
        ok(
          "api-surface — RED: dependency shipping no JS and referenced nowhere is flagged",
        );
      else
        fail(
          "api-surface — RED stub dependency",
          `exit=${r.code} out=${r.out.trim()}`,
        );
    }

    // ── GREEN: same shape, but referenced from CSS ────────────────────────
    {
      const proj = path.join(tmp, "green-css");
      const modules = path.join(proj, "node_modules");
      fs.mkdirSync(path.join(proj, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(proj, "package.json"),
        JSON.stringify({ dependencies: { "css-only-lib": "^1.0.0" } }),
      );
      pkg(modules, "css-only-lib", { "index.css": ".y {}" });
      fs.writeFileSync(
        path.join(proj, "src/globals.css"),
        '@import "css-only-lib";\n',
      );

      const r = check(script, proj);
      if (r.code === 0)
        ok(
          "api-surface — GREEN: a CSS-only package used via @import is not reported as dead",
        );
      else
        fail(
          "api-surface — GREEN css-only dependency",
          `expected clean, got exit=${r.code} out=${r.out.trim()}`,
        );
    }

    // ── GREEN: asset package located with require.resolve ─────────────────
    // Found by running --check against Lodestone, which reaches its .wasm
    // grammars via `require.resolve("tree-sitter-wasms/package.json")`. An
    // import-shaped reference test misses that and calls a working dependency
    // dead, so the stub rule matches any mention of the name instead.
    {
      const proj = path.join(tmp, "green-asset");
      const modules = path.join(proj, "node_modules");
      fs.mkdirSync(path.join(proj, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(proj, "package.json"),
        JSON.stringify({ dependencies: { "wasm-grammars": "^1.0.0" } }),
      );
      pkg(modules, "wasm-grammars", { "out/lang.wasm": "\0asm" });
      fs.writeFileSync(
        path.join(proj, "src/load.ts"),
        'const dir = path.dirname(require.resolve("wasm-grammars/package.json"));\n',
      );

      const r = check(script, proj);
      if (r.code === 0)
        ok(
          "api-surface — GREEN: an asset package located via require.resolve is not reported as dead",
        );
      else
        fail(
          "api-surface — GREEN require.resolve asset package",
          `expected clean, got exit=${r.code} out=${r.out.trim()}`,
        );
    }

    // ── RED: augmented members called, package never imported ─────────────
    // Members are inherited via `extends` from a second file, so a parser that
    // only reads the augmentation site finds nothing and the gate stays silent.
    {
      const proj = path.join(tmp, "red-unregistered");
      const modules = path.join(proj, "node_modules");
      fs.mkdirSync(path.join(proj, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(proj, "package.json"),
        JSON.stringify({
          dependencies: { "matcher-lib": "^1.0.0", runner: "^1.0.0" },
        }),
      );
      pkg(modules, "matcher-lib", {
        "index.js": "module.exports = {};",
        "types/matchers.d.ts":
          "interface LibMatchers<R> {\n" +
          "  toBeGrounded(): R\n" +
          "  toHaveVersion(v: string): R\n" +
          "}\n",
        "types/runner.d.ts":
          "declare module 'runner' {\n  interface Assertion<T = any> extends LibMatchers<T> {}\n}\n",
      });
      pkg(modules, "runner", { "index.js": "module.exports = {};" });
      fs.writeFileSync(
        path.join(proj, "src/app.test.ts"),
        "expect(el).toBeGrounded();\nexpect(el).toHaveVersion('1');\n",
      );

      const r = check(script, proj);
      if (
        r.code === 1 &&
        /matcher-lib is never imported/.test(r.out) &&
        /toBeGrounded/.test(r.out)
      )
        ok(
          "api-surface — RED: members merged through an `extends` chain, called with no importer, are flagged",
        );
      else
        fail(
          "api-surface — RED unregistered augmentation",
          `exit=${r.code} out=${r.out.trim()}`,
        );
    }

    // ── GREEN: augmented member shadowing a built-in is not evidence ──────
    // Found running --check against Quarry: vitest augments `test` and
    // `timeout`, and `/re/.test(s)` + `AbortSignal.timeout(5000)` read as two
    // calls into an unregistered package. A gate that fails a build over
    // RegExp.prototype.test is worse than no gate.
    {
      const proj = path.join(tmp, "green-builtin-shadow");
      const modules = path.join(proj, "node_modules");
      fs.mkdirSync(path.join(proj, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(proj, "package.json"),
        JSON.stringify({ dependencies: { "runner-lib": "^1.0.0" } }),
      );
      pkg(modules, "runner-lib", {
        "index.js": "module.exports = {};",
        "types/aug.d.ts":
          "declare module 'host' {\n  interface Cfg {\n    test(name: string): void\n    timeout(ms: number): void\n  }\n}\n",
      });
      fs.writeFileSync(
        path.join(proj, "src/app.ts"),
        "if (/^a/.test(s)) fetch(u, { signal: AbortSignal.timeout(5000) });\n",
      );

      const r = check(script, proj);
      if (r.code === 0)
        ok(
          "api-surface — GREEN: members shadowing JS built-ins (test/timeout) are not counted as evidence",
        );
      else
        fail(
          "api-surface — GREEN builtin-shadowing member",
          `expected clean, got exit=${r.code} out=${r.out.trim()}`,
        );
    }

    // ── GREEN: identical, with the registering import present ─────────────
    {
      const proj = path.join(tmp, "green-registered");
      const modules = path.join(proj, "node_modules");
      fs.mkdirSync(path.join(proj, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(proj, "package.json"),
        JSON.stringify({ dependencies: { "matcher-lib": "^1.0.0" } }),
      );
      pkg(modules, "matcher-lib", {
        "index.js": "module.exports = {};",
        "types/matchers.d.ts":
          "interface LibMatchers<R> {\n  toBeGrounded(): R\n}\n",
        "types/runner.d.ts":
          "declare module 'runner' {\n  interface Assertion<T = any> extends LibMatchers<T> {}\n}\n",
      });
      // A bare side-effect import IS the registration for this package shape.
      fs.writeFileSync(
        path.join(proj, "src/setup.ts"),
        "import 'matcher-lib';\n",
      );
      fs.writeFileSync(
        path.join(proj, "src/app.test.ts"),
        "expect(el).toBeGrounded();\n",
      );

      const r = check(script, proj);
      if (r.code === 0)
        ok(
          "api-surface — GREEN: a bare side-effect import satisfies the registration check",
        );
      else
        fail(
          "api-surface — GREEN registered augmentation",
          `expected clean, got exit=${r.code} out=${r.out.trim()}`,
        );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
