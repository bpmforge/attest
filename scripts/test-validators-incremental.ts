/**
 * test-validators-incremental.ts -- chapter module for scripts/test.ts (M-A6 / WP-A6).
 *
 * Changed-only walks + tree-hash result cache for the validators:
 *   - validate-deps.sh: second run on an unchanged tree prints `cached: true`
 *     and exits identically; touching package-lock.json invalidates;
 *     --no-cache / VALIDATE_NO_CACHE=1 bypass.
 *   - validate-lint.sh --since <sha>: only changed files are linted/reported.
 *   - validate-mermaid.sh: three runs on unchanged docs cost exactly ONE real
 *     mmdc invocation (stubbed via a PATH shim that appends to a counter file).
 */

import { execFileSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export async function testValidatorsIncremental(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const V = path.join(root, "scripts/validators");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vinc-"));
  const fx = path.join(tmp, "repo");
  const bin = path.join(tmp, "bin");
  const counters = path.join(tmp, "counters");
  fs.mkdirSync(fx);
  fs.mkdirSync(bin);
  fs.mkdirSync(counters);

  const write = (rel: string, content: string) => {
    const full = path.join(fx, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  const git = (...a: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", ...a],
      { cwd: fx, encoding: "utf8" },
    ).trim();
  const count = (name: string) => {
    const f = path.join(counters, name);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).length : 0;
  };

  // Stub tools: every real invocation appends a line to a counter file.
  fs.writeFileSync(path.join(bin, "mmdc"), `#!/bin/sh\necho x >> "${counters}/mmdc"\nexit 0\n`, { mode: 0o755 });
  write("audit.sh", `#!/bin/sh\necho x >> "${counters}/audit"\necho '{}'\nexit 0\n`);
  write("lint.sh", `#!/bin/sh\necho "linting: $*"\nexit 1\n`);
  write("package.json", '{"name":"fx","version":"1.0.0"}\n');
  write("package-lock.json", '{"lockfileVersion":3}\n');
  write(".sdlc/sdlc.json", JSON.stringify({ deps: "sh ./audit.sh", lint: "sh ./lint.sh {files}", typecheck: "sh -c true" }));
  write("src/old.ts", "export const a = 1;\n");
  write("docs/a.md", "# A\n\n```mermaid\nflowchart TD\n  A[Start] --> B[End]\n```\n");
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD");

  const env = { ...process.env, EXPERTS_TELEMETRY: "0", PATH: `${bin}:${process.env.PATH}`, VALIDATE_SINCE: "", VALIDATE_NO_CACHE: "" };
  const run = (script: string, args: string[] = [], extra: Record<string, string> = {}) => {
    const r = spawnSync("/bin/bash", [path.join(V, script), fx, ...args], {
      encoding: "utf8",
      env: { ...env, ...extra },
    });
    return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
  };
  const check = (label: string, cond: boolean, why: string) => (cond ? ok(label) : fail(label, why));

  try {
    // -- deps: cache hit / invalidation / bypass ---------------------------
    const d1 = run("validate-deps.sh");
    const d2 = run("validate-deps.sh");
    check("deps: first run is a real run", count("audit") === 1 && !d1.err.includes("cached: true"), `audit=${count("audit")}`);
    check(
      "deps: second run prints `cached: true`, replays identical exit + JSON, no re-audit",
      d2.err.includes("cached: true") && d2.code === d1.code && d2.out === d1.out && count("audit") === 1,
      `err=${d2.err.slice(0, 120)} audit=${count("audit")}`,
    );
    write("package-lock.json", '{"lockfileVersion":3,"touched":true}\n');
    const d3 = run("validate-deps.sh");
    check("deps: touching package-lock.json invalidates the cache", !d3.err.includes("cached: true") && count("audit") === 2, `audit=${count("audit")}`);
    const d4 = run("validate-deps.sh", ["--no-cache"]);
    const d5 = run("validate-deps.sh", [], { VALIDATE_NO_CACHE: "1" });
    check("deps: --no-cache and VALIDATE_NO_CACHE=1 bypass the cache", count("audit") === 4 && !d4.err.includes("cached: true") && !d5.err.includes("cached: true"), `audit=${count("audit")}`);
    git("checkout", "--", "package-lock.json");

    // -- mermaid: 3 runs, 1 real mmdc ---------------------------------------
    const m = [run("validate-mermaid.sh"), run("validate-mermaid.sh"), run("validate-mermaid.sh")];
    check("mermaid: three runs on unchanged docs cost exactly 1 mmdc invocation", count("mmdc") === 1, `mmdc=${count("mmdc")}`);
    check(
      "mermaid: runs 2+3 are cached and identical to run 1",
      m[1].err.includes("cached: true") && m[2].err.includes("cached: true") && m[1].out === m[0].out && m[2].code === m[0].code,
      m[1].err.slice(0, 120),
    );
    run("validate-mermaid.sh", ["--no-cache"]);
    check("mermaid: --no-cache forces a real mmdc run", count("mmdc") === 2, `mmdc=${count("mmdc")}`);
    write("docs/a.md", "# A\n\n```mermaid\nflowchart TD\n  A[Start] --> C[Other]\n```\n");
    run("validate-mermaid.sh");
    check("mermaid: editing a doc invalidates the cache", count("mmdc") === 3, `mmdc=${count("mmdc")}`);

    // -- lint --since: only changed files ------------------------------------
    write("src/new.ts", "export const b = 2;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "add new");
    const l = run("validate-lint.sh", ["--since", base]);
    let scope: string[] = [];
    try {
      scope = JSON.parse(l.out.trim().split("\n").pop() ?? "{}").scope.files;
    } catch {
      /* assertion below reports it */
    }
    check("validate-lint.sh --since lists only changed files in its JSON scope", JSON.stringify(scope) === '["src/new.ts"]', JSON.stringify(scope));
    check(
      "validate-lint.sh --since passes only changed files to the linter (items name new.ts, never old.ts)",
      l.out.includes("src/new.ts") === true && !l.out.includes("old.ts") && l.code === 1 && /rc=1 for: sh \.\/lint\.sh src\/new\.ts/.test(l.out),
      l.out.slice(0, 300),
    );
    const lNone = run("validate-lint.sh", ["--since", "HEAD"]);
    check("validate-lint.sh --since HEAD (nothing changed) skips lint and exits 0", lNone.code === 0 && lNone.err.includes("skipped"), lNone.err.slice(0, 200));
    const lAll = run("validate-lint.sh");
    check("validate-lint.sh without --since keeps the whole-tree command", lAll.out.includes("{files}") && !lAll.out.includes(`"scope"`), lAll.out.slice(0, 300));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
