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

function run(
  script: string,
  cwd: string,
  args: string[],
): { code: number; out: string } {
  try {
    return {
      code: 0,
      out: execFileSync("node", [script, ...args], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
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
    fs.writeFileSync(
      path.join(p, "src/a.test.js"),
      'it("a",()=>{});\nit("b",()=>{});\nit("c",()=>{});\n',
    );
    fs.writeFileSync(path.join(p, "src/a.js"), "x\n");
    git(p, "init", "-qb", "main");
    git(p, "config", "user.email", "t@t");
    git(p, "config", "user.name", "t");
    git(p, "add", "-A");
    git(p, "commit", "-qm", "base");
    git(p, "checkout", "-qb", "feat");

    // Observed shape: one test file loses cases while a new one is added, so the
    // net total is unchanged. A net-only check passes this; that was the first bug.
    fs.writeFileSync(
      path.join(p, "src/a.test.js"),
      'it("a",()=>{});\nit("new",()=>{});\n',
    );
    fs.mkdirSync(path.join(p, "src/__tests__"), { recursive: true });
    fs.writeFileSync(
      path.join(p, "src/__tests__/b.test.js"),
      'it("z",()=>{});\n',
    );
    git(p, "add", "-A");
    git(p, "commit", "-qm", "add tests");

    const cov = run(script, p, ["--coverage", "--base=main"]);
    if (cov.code === 1 && /lost cases/.test(cov.out))
      ok(
        "delegation-gate — RED: an existing test file losing cases is caught even when the net total holds",
      );
    else
      fail(
        "delegation-gate — RED coverage shrink",
        `exit=${cov.code} out=${cov.out.trim()}`,
      );

    const pat = run(script, p, ["--patterns", "--base=main"]);
    if (pat.code === 0 && /__tests__/.test(pat.out))
      ok(
        "delegation-gate — WARN: a directory name with no precedent is surfaced, advisory not fatal",
      );
    else
      fail(
        "delegation-gate — pattern novelty",
        `exit=${pat.code} out=${pat.out.trim()}`,
      );

    git(
      p,
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "chore: dedupe\n\nCoverage-removed: b and c duplicated b.test.js",
    );
    const covOk = run(script, p, ["--coverage", "--base=main"]);
    if (covOk.code === 0)
      ok(
        "delegation-gate — GREEN: a declared Coverage-removed: justification clears the shrink",
      );
    else
      fail(
        "delegation-gate — GREEN justified removal",
        `exit=${covOk.code} out=${covOk.out.trim()}`,
      );

    // A verdict is only evidence if the code it names exists.
    fs.writeFileSync(
      path.join(p, "R_ok.md"),
      "VERDICT: REJECT\n- src/a.js:1 — missing wiring.\n",
    );
    fs.writeFileSync(
      path.join(p, "R_bad.md"),
      "VERDICT: REJECT\n- src/a.js:9000 — missing.\n- src/nope.js:12 — missing.\n",
    );
    fs.writeFileSync(
      path.join(p, "R_vague.md"),
      "VERDICT: REJECT — wiring omitted somewhere.\n",
    );

    const cOk = run(script, p, ["--citations=R_ok.md"]);
    const cBad = run(script, p, ["--citations=R_bad.md"]);
    const cVague = run(script, p, ["--citations=R_vague.md"]);
    if (
      cOk.code === 0 &&
      cBad.code === 1 &&
      /UNRESOLVABLE/.test(cBad.out) &&
      cVague.code === 1
    )
      ok(
        "delegation-gate — citations: resolvable passes; fabricated line/file and citation-free verdicts both fail",
      );
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
 * Finding grounding — two ways a reviewer raises a finding that should never have
 * been raised, neither of which --citations can catch.
 *
 * F: a requirement asserted by ANALOGY. A reviewer claimed setPinned needed a
 *    system-snapshot guard at 90% confidence; the SRS gives delete that guard
 *    (FR-VER-07) and pin none (FR-VER-06), and pinning destroys nothing. Nothing
 *    to resolve, because the claim cited nothing.
 * G: a METHODOLOGY artifact demanded of the project — scripts/validators/
 *    validate-tech-stack.sh flagged missing in a project that has no such
 *    directory. A claim about a file's ABSENCE has no line number to check.
 */
export function testFindingGrounding(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const script = path.join(root, "scripts/delegation-gate.mjs");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "finding-grounding-"));
  const git = (...a: string[]) => {
    try {
      execFileSync("git", a, { cwd: tmp, stdio: "ignore" });
    } catch {
      /* fixture setup only */
    }
  };
  try {
    fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "scripts"), { recursive: true });
    git("init", "-q", ".");
    fs.writeFileSync(
      path.join(tmp, "docs/SRS.md"),
      "# SRS\n- FR-VER-06: Named snapshots MAY be pinned.\n- FR-VER-07: System-generated named snapshots SHALL NOT be deletable.\n",
    );
    fs.writeFileSync(path.join(tmp, "scripts/build.sh"), "x\n");

    const review = (body: string, name: string) => {
      fs.writeFileSync(path.join(tmp, name), body);
      return run(script, tmp, [`--grounding=${name}`]);
    };

    // F1 — a requirement ID that exists nowhere in the SRS.
    const ghost = review(
      "# Review\n\nFinding 1: setPinned must be guarded per FR-VER-99.\n",
      "ghost.md",
    );
    if (
      ghost.code === 1 &&
      /NOT IN REQUIREMENTS: FR-VER-99/.test(ghost.out)
    )
      ok(
        "finding-grounding — a requirement ID absent from the SRS fails the review",
      );
    else
      fail(
        "finding-grounding — ghost requirement ID",
        `code=${ghost.code} ${ghost.out}`,
      );

    // F2 — the downstream project case: argues from requirements, cites no ID at all.
    const analogy = review(
      "# Review\n\nFinding 1: setPinned is missing a system-snapshot guard (90% confidence).\n" +
        "The requirement for delete implies the same restriction should apply to pin.\n",
      "analogy.md",
    );
    if (
      analogy.code === 1 &&
      /cites no\s*\n?\s*requirement ID/.test(analogy.out)
    )
      ok(
        "finding-grounding — arguing from requirements while citing no requirement ID fails",
      );
    else
      fail(
        "finding-grounding — analogy claim",
        `code=${analogy.code} ${analogy.out}`,
      );

    // F-negative — a finding that cites a real requirement passes.
    const grounded = review(
      "# Review\n\nFinding 1: pin is allowed for named snapshots per FR-VER-06; no guard needed.\n",
      "grounded.md",
    );
    if (grounded.code === 0 && /all resolve/.test(grounded.out))
      ok("finding-grounding — a finding citing a real requirement passes");
    else
      fail(
        "finding-grounding — grounded claim",
        `code=${grounded.code} ${grounded.out}`,
      );

    // G — our own scaffolding demanded of the project. Note the fixture HAS a
    // scripts/ dir but no scripts/validators/, which is the shape that a
    // top-level-only check would have missed.
    const methodology = review(
      "# Review\n\nFinding 5: `scripts/validators/validate-tech-stack.sh` is missing per FR-VER-06.\n",
      "methodology.md",
    );
    if (
      /METHODOLOGY\/PROJECT MISMATCH/.test(methodology.out) &&
      methodology.code === 0
    )
      ok(
        "finding-grounding — a demanded methodology artifact is named as a mismatch, advisory not blocking",
      );
    else
      fail(
        "finding-grounding — methodology mismatch",
        `code=${methodology.code} ${methodology.out}`,
      );

    // G-negative — a real project path flagged missing is not a mismatch.
    const realPath = review(
      "# Review\n\nFinding 5: `src/auth/guard.ts` is missing per FR-VER-06.\n",
      "realpath.md",
    );
    if (!/METHODOLOGY\/PROJECT MISMATCH/.test(realPath.out))
      ok(
        "finding-grounding — a missing project file is a defect, not a methodology mismatch",
      );
    else fail("finding-grounding — real path misclassified", realPath.out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * delegation-metrics shares its subject (the delegation loop) and its evidence
 * base, so it lives in this chapter too.
 *
 * The properties worth pinning: PENDING rows must not be counted as successes
 * (that silently flatters the rate), a missing model column must say so rather
 * than reporting a split it cannot produce, and lead-absorbed rework must count
 * as a correction rather than as a clean delivery.
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
    if (
      j.scored === 3 &&
      j.corrections === 1 &&
      j.excluded === 1 &&
      j.byModel["Haiku 4.5"].corrections === 1
    )
      ok(
        "delegation-metrics — in-flight rows excluded from the denominator, not counted as passes",
      );
    else
      fail(
        "delegation-metrics — denominator",
        JSON.stringify({ scored: j.scored, excluded: j.excluded }),
      );

    // Lead-absorbed rework is a correction, and it used to log as DONE. Field
    // trace 2026-07: the lead closed specialist gaps itself three times ("both
    // small/mechanical — lead fixed directly") and logged DONE each time, so the
    // model producing the most rework scored the cleanest — backwards for a
    // metric meant to say when a tier change beats another gate. Counted as a
    // correction AND reported as its own subtotal, because "the specialist got
    // another attempt" and "the lead quietly finished it" need different fixes.
    const absorbed = path.join(tmp, "absorbed.md");
    fs.writeFileSync(
      absorbed,
      "| Ticket | Agent | Model | Outcome |\n|---|---|---|---|\n" +
        "| T-1 | coding-agent | Haiku 4.5 | DONE |\n" +
        "| T-2 | coding-agent | Haiku 4.5 | DONE-LEAD-FIXED |\n" +
        "| T-3 | coding-agent | Haiku 4.5 | LEAD-FIXED |\n" +
        "| T-4 | coding-agent | Haiku 4.5 | REDO |\n",
    );
    const a = JSON.parse(run(script, tmp, [`--log=${absorbed}`, "--json"]).out);
    // Under the old vocabulary this log read 1 correction of 4 (25%). The two
    // absorbed rows are rework, so it is 3 of 4 (75%), 2 of them lead-fixed.
    if (
      a.scored === 4 &&
      a.corrections === 3 &&
      a.leadFixed === 2 &&
      a.byModel["Haiku 4.5"].corrections === 3 &&
      a.byModel["Haiku 4.5"].leadFixed === 2
    )
      ok(
        "delegation-metrics — lead-absorbed rework counts as a correction, with its own subtotal",
      );
    else
      fail(
        "delegation-metrics — lead-absorbed rework counts as a correction, with its own subtotal",
        JSON.stringify({
          scored: a.scored,
          corrections: a.corrections,
          leadFixed: a.leadFixed,
        }),
      );

    // …and a plain DONE must NOT be swept up by the lead-fixed pattern.
    if (a.accepted === 1)
      ok("delegation-metrics — a clean DONE is still accepted, not relabelled");
    else
      fail(
        "delegation-metrics — a clean DONE is still accepted, not relabelled",
        `accepted=${a.accepted} (expected 1)`,
      );

    // The outcome column is self-reported, so a lead that absorbs work and
    // writes plain DONE evades the count. What catches it is that leads NARRATE
    // the absorption — these three notes are verbatim from the 2026-07 trace.
    // A specialist-voice note about ordinary work must not be swept up.
    const narrated = path.join(tmp, "narrated.md");
    fs.writeFileSync(
      narrated,
      "| timestamp | agent | task summary | outcome | score | re-ran independently | notes |\n" +
        "|---|---|---|---|---|---|---|\n" +
        "| t1 | coding-agent | typeahead | DONE | 8/10 | vitest 335 pass | both small/mechanical — lead fixed directly |\n" +
        "| t2 | coding-agent | description | DONE | 9/10 | vitest 1153 pass | clean; specialist fixed the failing test itself |\n" +
        "| t3 | researcher | feasibility | DONE | 8/10 | n/a | ~90% correct — I'll finish the small remaining gaps directly rather than risk another confused round-trip |\n" +
        "| t4 | coding-agent | autosave | DONE | 8/10 | vitest 311 pass | it's mechanical, I'll close these directly |\n",
    );
    const nz = JSON.parse(
      run(script, tmp, [`--log=${narrated}`, "--json"]).out,
    );
    if (nz.mislabelled === 3 && nz.accepted === 4)
      ok(
        "delegation-metrics — accepted rows whose notes narrate a lead fix are flagged; a specialist-voice note is not",
      );
    else
      fail(
        "delegation-metrics — accepted rows whose notes narrate a lead fix are flagged; a specialist-voice note is not",
        `mislabelled=${nz.mislabelled} (expected 3), accepted=${nz.accepted} (expected 4)`,
      );

    const noModel = path.join(tmp, "nm.md");
    fs.writeFileSync(
      noModel,
      "| Ticket | Agent | Outcome |\n|---|---|---|\n| T-1 | coding-agent | DONE |\n",
    );
    const r2 = run(script, tmp, [`--log=${noModel}`]);
    if (r2.code === 0 && /No model column/.test(r2.out))
      ok(
        "delegation-metrics — a log with no model column says so instead of reporting an empty split",
      );
    else
      fail(
        "delegation-metrics — missing model column",
        `exit=${r2.code} out=${r2.out.trim()}`,
      );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * validate-invariants.sh — declared cross-cutting rules.
 *
 * The regression pinned here is subtle and was live: records were TAB-delimited,
 * and bash treats tab as IFS-whitespace, so consecutive delimiters collapse. An
 * invariant with an empty `require` shifted its `forbid` into the require slot and
 * the check silently INVERTED — reporting a forbidden pattern as a missing
 * requirement, and passing files that actually violated it.
 */
export function testInvariants(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const script = path.join(root, "scripts/validators/validate-invariants.sh");
  if (!fs.existsSync(script)) {
    fail("validate-invariants — script present", `${script} not found`);
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "invariants-"));
  const sh = (cwd: string, args: string[]) => {
    try {
      return {
        code: 0,
        out: execFileSync("bash", [script, ...args], {
          cwd,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      };
    } catch (e: any) {
      return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  };
  try {
    const p = path.join(tmp, "p");
    fs.mkdirSync(path.join(p, ".sdlc"), { recursive: true });
    fs.mkdirSync(path.join(p, "src/api"), { recursive: true });
    fs.writeFileSync(
      path.join(p, ".sdlc/invariants.json"),
      JSON.stringify({
        invariants: [
          {
            name: "audited seam",
            files: "src/api/*.ts",
            require: "withAuditedTx",
            exclude: "health\\.ts",
            why: "ADR-014",
          },
          {
            name: "no local auth",
            files: "src/api/*.ts",
            forbid: "function getAuthUser",
            why: "import it",
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(p, "src/api/good.ts"),
      "withAuditedTx(() => {});\n",
    );
    fs.writeFileSync(
      path.join(p, "src/api/bad.ts"),
      "db.update();\nfunction getAuthUser(){}\n",
    );
    fs.writeFileSync(
      path.join(p, "src/api/health.ts"),
      'export const h = "ok";\n',
    );

    const red = sh(p, [p]);
    const missingReq = /bad\.ts: missing required 'withAuditedTx'/.test(
      red.out,
    );
    const hitForbid = /bad\.ts: contains forbidden 'function getAuthUser'/.test(
      red.out,
    );
    const excluded = !/health\.ts/.test(red.out);
    if (red.code === 1 && missingReq && hitForbid && excluded)
      ok(
        "validate-invariants — RED: require and forbid both fire on the right file; exclude honoured",
      );
    else
      fail(
        "validate-invariants — RED",
        `exit=${red.code} req=${missingReq} forbid=${hitForbid} excluded=${excluded}`,
      );

    fs.writeFileSync(
      path.join(p, "src/api/bad.ts"),
      "withAuditedTx(() => {});\n",
    );
    const green = sh(p, [p]);
    if (green.code === 0)
      ok("validate-invariants — GREEN: clean once the violation is fixed");
    else
      fail(
        "validate-invariants — GREEN",
        `exit=${green.code} out=${green.out.trim()}`,
      );

    const none = path.join(tmp, "none");
    fs.mkdirSync(none, { recursive: true });
    const noCfg = sh(none, [none]);
    if (noCfg.code === 0 && /nothing declared/.test(noCfg.out))
      ok("validate-invariants — no config is a notice, not a failure");
    else fail("validate-invariants — no config", `exit=${noCfg.code}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
