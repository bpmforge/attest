/**
 * test-language-checklists.ts — Pass 62 (Group K6). references/language-review-checklists.md:
 * every grep form in the tables must actually find its planted defect (a checklist whose greps match nothing
 * is decoration), every section is populated, and the reviewers really point at the file.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

export function testLanguageChecklists(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const doc = fs.readFileSync(path.join(root, "references/language-review-checklists.md"), "utf8");
  const check = (label: string, cond: boolean, why = "assertion false") => (cond ? ok(label) : fail(label, why));

  for (const [lang, prefix, min] of [["Rust", "R", 8], ["TypeScript", "T", 8], ["Python", "P", 8], ["Go", "G", 7]] as const) {
    const rows = doc.split("\n").filter((l) => new RegExp(`^\\| ${prefix}\\d+ \\|`).test(l));
    check(`K6 checklist ${lang}: >=${min} checks, each with a machine form`, rows.length >= min && rows.every((r) => r.split("|").filter(Boolean).length >= 3), `${rows.length} rows`);
  }

  // planted defects, one per grep-bearing row
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "lang-chk-"));
  try {
    const w = (f: string, s: string) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); };
    w("src/a.rs", 'fn f() { let x = foo().unwrap(); panic!("no"); let _ = write(); }\nunsafe { *p = 1 }\nfn g() -> Result<(), Box<dyn std::error::Error>> { Ok(()) }\n#[allow(dead_code)]\nlet (tx, rx) = tokio::sync::mpsc::unbounded_channel();\n');
    w("src/a.ts", 'items.forEach(async (i) => { await save(i); });\nthrow "boom";\nconst c = JSON.parse(raw);\nconst m = require("x");\nconst k = process.env.KEY;\n');
    w("src/a.py", 'def f(x=[]):\n    pass\napp.add_middleware(CORSMiddleware, allow_origins=["*"])\n');
    w("src/a.go", 'return fmt.Errorf("load: %v", err)\n_ = doThing()\ngo func() { work() }()\n');
    w("tsconfig.json", '{ "compilerOptions": { "strict": true } }\n');
    const rows = doc.split("\n").filter((l) => /^\| [RTPG]\d+ \|/.test(l));
    let ran = 0;
    for (const row of rows) {
      const id = row.match(/^\| ([RTPG]\d+) \|/)![1];
      const span = [...row.matchAll(/`(grep [^`]+)`/g)].map((m) => m[1]).find(Boolean);
      if (!span) continue;
      const cmd = span.replace(/\\\|/g, "|");
      const r = spawnSync("bash", ["-c", cmd], { cwd: d, encoding: "utf8" });
      ran++;
      check(`K6 grep ${id} finds its planted defect`, r.status === 0 && r.stdout.trim().length > 0, `cmd=${cmd} status=${r.status} err=${r.stderr.slice(0, 80)}`);
    }
    check("K6 at least 14 grep forms were exercised", ran >= 14, `ran ${ran}`);
    // a grep must NOT fire on clean code (else it proves nothing)
    w("clean/a.py", "def f(x=None):\n    return x\n");
    const clean = spawnSync("bash", ["-c", "grep -rnE 'def [a-z_0-9]+\\(.*=[[:space:]]*(\\[\\]|\\{\\})' --include=*.py clean/"], { cwd: d, encoding: "utf8" });
    check("K6 a checklist grep stays silent on clean code", clean.status === 1);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }

  for (const f of ["agents/code-reviewer.md", "agents/code-review/METHODOLOGY.md", "agents/performance/concurrency-checker.md"]) {
    check(`K6 ${f} points at the language checklists`, fs.readFileSync(path.join(root, f), "utf8").includes("references/language-review-checklists.md"));
  }

  // click-path-audit reference (K6): six patterns, the store-map step, and it is wired into two agents.
  const cp = fs.readFileSync(path.join(root, "references/click-path-audit.md"), "utf8");
  check("K6 click-path-audit lists all six patterns and the side-effect-map step",
    [1, 2, 3, 4, 5, 6].every((n) => new RegExp(`^\\| ${n} \\|`, "m").test(cp)) && /Step 1 — map the state stores/.test(cp) && /RESETS/.test(cp));
  for (const f of ["agents/ui-verifier.md", "agents/frontend-design.md"]) {
    check(`K6 ${f} points at click-path-audit`, fs.readFileSync(path.join(root, f), "utf8").includes("references/click-path-audit.md"));
  }
}
