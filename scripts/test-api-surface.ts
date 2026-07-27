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
import { execFileSync } from "child_process";

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

export function testApiSurface(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const script = path.join(root, "scripts/api-surface.mjs");
  if (!fs.existsSync(script)) {
    fail("api-surface — script present", `${script} not found`);
    return;
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
