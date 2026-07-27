/**
 * test-delegation-gate.ts — chapter module for scripts/test.ts.
 *
 * Three checks a passing test suite structurally cannot make. The fixtures
 * reproduce the observed failure shapes rather than convenient ones — in
 * particular the coverage case, where the first implementation passed: the branch
 * added a new test file while deleting cases from an existing one, so the NET
 * total was unchanged and only per-file shrinkage exposes it.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

const git = (cwd: string, ...a: string[]) =>
  execFileSync("git", a, { cwd, stdio: ["ignore", "pipe", "pipe"] });

function run(script: string, cwd: string, args: string[]): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync("node", [script, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e: any) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

export function testDelegationGate(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const script = path.join(root, "scripts/delegation-gate.mjs");
  if (!fs.existsSync(script)) {
    fail("delegation-gate — script present", `${script} not found`);
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "delegation-gate-"));
  try {
    const p = path.join(tmp, "p");
    fs.mkdirSync(path.join(p, "src"), { recursive: true });
    fs.writeFileSync(path.join(p, "src/a.test.js"), 'it("a",()=>{});\nit("b",()=>{});\nit("c",()=>{});\n');
    fs.writeFileSync(path.join(p, "src/a.js"), "x\n");
    git(p, "init", "-qb", "main");
    git(p, "config", "user.email", "t@t");
    git(p, "config", "user.name", "t");
    git(p, "add", "-A");
    git(p, "commit", "-qm", "base");
    git(p, "checkout", "-qb", "feat");

    // Observed shape: one test file loses cases while a new one is added, so the
    // net total is unchanged. A net-only check passes this; that was the first bug.
    fs.writeFileSync(path.join(p, "src/a.test.js"), 'it("a",()=>{});\nit("new",()=>{});\n');
    fs.mkdirSync(path.join(p, "src/__tests__"), { recursive: true });
    fs.writeFileSync(path.join(p, "src/__tests__/b.test.js"), 'it("z",()=>{});\n');
    git(p, "add", "-A");
    git(p, "commit", "-qm", "add tests");

    const cov = run(script, p, ["--coverage", "--base=main"]);
    if (cov.code === 1 && /lost cases/.test(cov.out))
      ok("delegation-gate — RED: an existing test file losing cases is caught even when the net total holds");
    else fail("delegation-gate — RED coverage shrink", `exit=${cov.code} out=${cov.out.trim()}`);

    const pat = run(script, p, ["--patterns", "--base=main"]);
    if (pat.code === 0 && /__tests__/.test(pat.out))
      ok("delegation-gate — WARN: a directory name with no precedent is surfaced, advisory not fatal");
    else fail("delegation-gate — pattern novelty", `exit=${pat.code} out=${pat.out.trim()}`);

    git(p, "commit", "-q", "--allow-empty", "-m", "chore: dedupe\n\nCoverage-removed: b and c duplicated b.test.js");
    const covOk = run(script, p, ["--coverage", "--base=main"]);
    if (covOk.code === 0)
      ok("delegation-gate — GREEN: a declared Coverage-removed: justification clears the shrink");
    else fail("delegation-gate — GREEN justified removal", `exit=${covOk.code} out=${covOk.out.trim()}`);

    // A verdict is only evidence if the code it names exists.
    fs.writeFileSync(path.join(p, "R_ok.md"), "VERDICT: REJECT\n- src/a.js:1 — missing wiring.\n");
    fs.writeFileSync(path.join(p, "R_bad.md"), "VERDICT: REJECT\n- src/a.js:9000 — missing.\n- src/nope.js:12 — missing.\n");
    fs.writeFileSync(path.join(p, "R_vague.md"), "VERDICT: REJECT — wiring omitted somewhere.\n");

    const cOk = run(script, p, ["--citations=R_ok.md"]);
    const cBad = run(script, p, ["--citations=R_bad.md"]);
    const cVague = run(script, p, ["--citations=R_vague.md"]);
    if (cOk.code === 0 && cBad.code === 1 && /UNRESOLVABLE/.test(cBad.out) && cVague.code === 1)
      ok("delegation-gate — citations: resolvable passes; fabricated line/file and citation-free verdicts both fail");
    else
      fail(
        "delegation-gate — citations",
        `ok=${cOk.code} bad=${cBad.code} vague=${cVague.code}`,
      );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
/**
 * Appended to test-delegation-gate.ts — delegation-metrics shares its subject
 * (the delegation loop) and its evidence base.
 *
 * The properties worth pinning: PENDING rows must not be counted as successes
 * (that silently flatters the rate), and a missing model column must say so
 * rather than reporting a split it cannot produce.
 */
export function testDelegationMetrics(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const script = path.join(root, "scripts/delegation-metrics.mjs");
  if (!fs.existsSync(script)) {
    fail("delegation-metrics — script present", `${script} not found`);
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "delegation-metrics-"));
  try {
    const log = path.join(tmp, "log.md");
    fs.writeFileSync(
      log,
      "| Ticket | Agent | Model | Outcome |\n|---|---|---|---|\n" +
        "| T-1 | coding-agent | Haiku 4.5 | DONE |\n" +
        "| T-2 | coding-agent | Haiku 4.5 | REDO |\n" +
        "| T-3 | coding-agent | Sonnet 5 | DONE |\n" +
        "| T-4 | coding-agent | Sonnet 5 | PENDING |\n",
    );
    const r = run(script, tmp, [`--log=${log}`, "--json"]);
    const j = JSON.parse(r.out);
    // 3 scored (PENDING excluded), 1 correction => 33.3%. Counting PENDING as a
    // pass would report 25% and flatter the number.
    if (j.scored === 3 && j.corrections === 1 && j.excluded === 1 && j.byModel["Haiku 4.5"].corrections === 1)
      ok("delegation-metrics — in-flight rows excluded from the denominator, not counted as passes");
    else fail("delegation-metrics — denominator", JSON.stringify({ scored: j.scored, excluded: j.excluded }));

    const noModel = path.join(tmp, "nm.md");
    fs.writeFileSync(noModel, "| Ticket | Agent | Outcome |\n|---|---|---|\n| T-1 | coding-agent | DONE |\n");
    const r2 = run(script, tmp, [`--log=${noModel}`]);
    if (r2.code === 0 && /No model column/.test(r2.out))
      ok("delegation-metrics — a log with no model column says so instead of reporting an empty split");
    else fail("delegation-metrics — missing model column", `exit=${r2.code} out=${r2.out.trim()}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
