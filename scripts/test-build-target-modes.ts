/**
 * test-build-target-modes.ts — chapter module for scripts/test.ts.
 *
 * build-target-claude.mjs must carry each source file's permission bits into
 * the generated copy. writeFileSync only applies a mode when it CREATES a
 * file, so a recreated target came out 0644 and attest-claude's scripts/*.mjs
 * flipped between 644 and 755 across regens (seen on stack-coherence.mjs).
 *
 * Seam: the CLI's `--out <dir>`. Build into a temp dir, then:
 *   1. every generated file's executable bits equal its source's
 *   2. stripping +x from one generated file makes --check report mode drift
 *   3. --write over the existing (now 0644) file restores the source mode
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

const PROBE = "scripts/stack-coherence.mjs";

export function testBuildTargetModes(root: string, ok: OK, fail: FAIL): void {
  testAgentTargets(root, ok, fail);
  const build = path.join(root, "scripts/build-target-claude.mjs");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "build-target-modes-"));
  const run = (mode: string) =>
    spawnSync("node", [build, mode, "--out", out], { encoding: "utf8" });
  const xbits = (p: string) => fs.statSync(p).mode & 0o111;

  try {
    const w = run("--write");
    if (w.status !== 0) {
      fail("build --write into temp dir", `exit ${w.status}\n${w.stderr}`);
      return;
    }

    const manifest = fs
      .readFileSync(path.join(out, "GENERATED_FILES.txt"), "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"));
    const mismatched = manifest.filter((rel) => {
      const src = path.join(root, rel);
      return fs.existsSync(src) && xbits(src) !== xbits(path.join(out, rel));
    });
    if (mismatched.length) {
      fail(
        "generated files keep their source's executable bit",
        mismatched.slice(0, 5).join(", "),
      );
    } else {
      ok(
        `generated files keep their source's executable bit (${manifest.length} checked)`,
      );
    }

    if (!xbits(path.join(root, PROBE))) {
      fail(
        "probe source is executable",
        `${PROBE} lost +x in the canonical repo`,
      );
      return;
    }
    const dest = path.join(out, PROBE);
    fs.chmodSync(dest, 0o644);
    const c = run("--check");
    if (/stack-coherence\.mjs \(mode 644, source 755\)/.test(c.stdout)) {
      ok("--check reports a generated file whose mode drifted from source");
    } else {
      fail("--check reports mode drift", c.stdout.slice(0, 800));
    }

    run("--write");
    if (xbits(dest) === 0o111) {
      ok("--write restores the source mode on an existing 0644 target");
    } else {
      fail(
        "--write restores mode",
        `mode is ${(fs.statSync(dest).mode & 0o777).toString(8)}`,
      );
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}

// ─── WP-V1: build-agents.mjs --target opencode-v1|opencode-v2 ────────────────────────────────
// Sources stay V1-shaped; v2 output renames disable->disabled, prompt->system, permission->permissions,
// maxSteps->steps and keeps mode. A reference doc left `disable: true` would LOAD AS AN AGENT under v2.
function testAgentTargets(root: string, ok: OK, fail: FAIL): void {
  const script = path.join(root, "scripts/build-agents.mjs");
  const run = (args: string[], env: Record<string, string> = {}) =>
    spawnSync("node", [script, ...args], { encoding: "utf8", env: { ...process.env, ATTEST_TARGET: "", ...env } });
  const check = (label: string, cond: boolean, why = "assertion false") => (cond ? ok(label) : fail(label, why));

  for (const t of ["opencode-v1", "opencode-v2"]) {
    const r = run(["--check", "--target", t]);
    check(`build-agents --check --target ${t} passes`, r.status === 0, `exit ${r.status}: ${r.stdout}${r.stderr}`.slice(0, 300));
  }
  check("build-agents default target (and ATTEST_TARGET) is selectable", run(["--check"]).status === 0 && /v2 frontmatter transform verified/.test(run(["--check"], { ATTEST_TARGET: "opencode-v2" }).stdout));
  check("build-agents refuses an unknown target", run(["--check", "--target", "opencode-v9"]).status === 2);

  // Real transform, in a scratch copy of two files (never touches dist/ in the repo).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agents-v2-"));
  try {
    const fixtureRoot = path.join(tmp, "repo");
    fs.mkdirSync(path.join(fixtureRoot, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, "agents", "shared", "blocks"), { recursive: true });
    fs.copyFileSync(script, path.join(fixtureRoot, "scripts/build-agents.mjs"));
    for (const b of ["handoff-intake", "loop-prevention", "context-budget", "research-tools", "code-search", "delta-review", "test-impact"])
      for (const v of ["", ".compact"]) fs.writeFileSync(path.join(fixtureRoot, `agents/shared/blocks/${b}${v}.md`), `---\ndisable: true\n---\n\n## x\n`);
    fs.writeFileSync(path.join(fixtureRoot, "agents/a.md"), "---\ndescription: An agent\nmode: subagent\nprompt: p\nmaxSteps: 7\npermission:\n  bash: deny\n  prompt: keep-nested\n---\nBody mentions\ndisable: true\n");
    fs.writeFileSync(path.join(fixtureRoot, "agents/shared/REF.md"), "---\ndisable: true\ndescription: Reference doc\n---\n# ref\n");
    const b = spawnSync("node", [path.join(fixtureRoot, "scripts/build-agents.mjs"), "--build", "--target", "opencode-v2"], { encoding: "utf8" });
    const out = (f: string) => fs.readFileSync(path.join(fixtureRoot, "dist/agents-v2", f), "utf8");
    if (b.status !== 0) { fail("build-agents --build --target opencode-v2", `exit ${b.status}: ${b.stdout}${b.stderr}`.slice(0, 300)); return; }
    const a = out("a.md");
    check("v2 frontmatter: prompt->system, maxSteps->steps, permission->permissions, mode kept", /^system: p$/m.test(a) && /^steps: 7$/m.test(a) && /^permissions:$/m.test(a) && /^mode: subagent$/m.test(a) && !/^(prompt|maxSteps|permission):/m.test(a));
    check("v2 frontmatter: indented nested keys and the body are untouched", /^  prompt: keep-nested$/m.test(a) && /^Body mentions\ndisable: true$/m.test(a));
    check("v2: a reference doc with `disable: true` comes out `disabled: true` (so it never loads as an agent)", /^disabled: true$/m.test(out("shared/REF.md")) && !/^disable:/m.test(out("shared/REF.md")));
    check("v1 source files are untouched by the v2 build", /^disable: true$/m.test(fs.readFileSync(path.join(fixtureRoot, "agents/shared/REF.md"), "utf8")));
    const c = spawnSync("node", [path.join(fixtureRoot, "scripts/build-agents.mjs"), "--compact", "--target", "opencode-v2"], { encoding: "utf8" });
    check("v2 --compact writes to dist/compact-agents-v2 (v1 dir untouched)", c.status === 0 && !fs.existsSync(path.join(fixtureRoot, "dist/compact-agents")) );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // The real tree: every source `disable:` has a `disabled:` twin in the v2 output, none left over.
  const probe = spawnSync("node", ["-e", `
    const fs=require('fs'),p=require('path');
    const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p.join(d,e.name)):e.name.endsWith('.md')?[p.join(d,e.name)]:[]);
    const fm=f=>fs.readFileSync(f,'utf8').split('\\n---')[0];
    const n=walk('agents').filter(f=>/^disable:/m.test(fm(f))).length;
    // reference docs WITHOUT disable: (v1 sources, untouched) that the v2 emit must still disable: frontmatter under shared/ or metadata.type: protocol
    const extra=walk('agents').filter(f=>{const h=fm(f);return h.startsWith('---\\n')&&!/^disable:/m.test(h)&&(f.split(p.sep).includes('shared')||/^\\s+type:\\s*protocol\\s*$/m.test(h));}).length;
    console.log(n+' '+extra);`], { cwd: root, encoding: "utf8" });
  const real = fs.mkdtempSync(path.join(os.tmpdir(), "agents-v2-real-"));
  try {
    // Build the real tree into a scratch repo layout by symlinking agents/ (read-only use).
    fs.mkdirSync(path.join(real, "scripts"));
    fs.copyFileSync(script, path.join(real, "scripts/build-agents.mjs"));
    fs.symlinkSync(path.join(root, "agents"), path.join(real, "agents"));
    const b = spawnSync("node", [path.join(real, "scripts/build-agents.mjs"), "--build", "--target", "opencode-v2"], { encoding: "utf8" });
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".md") ? [path.join(d, e.name)] : []));
    const outs = b.status === 0 ? walk(path.join(real, "dist/agents-v2")) : [];
    const head = (f: string) => fs.readFileSync(f, "utf8").split("\n---")[0];
    const disabledN = outs.filter((f) => /^disabled:/m.test(head(f))).length;
    const leftover = outs.filter((f) => /^(disable|prompt|permission|maxSteps):/m.test(head(f)));
    const [srcDisable, injected] = probe.stdout.trim().split(" ").map(Number);
    check(`real tree under v2: ${srcDisable} source docs with disable: + ${injected} protocol docs without it (verified on opencode 2.2.5: they registered as agents) -> ${disabledN} disabled:, 0 v1 keys left`, b.status === 0 && disabledN === srcDisable + injected && injected > 0 && disabledN > 0 && leftover.length === 0, `${b.stderr}${leftover.slice(0, 3).join(",")}`);
  } finally {
    fs.rmSync(real, { recursive: true, force: true });
  }
}
