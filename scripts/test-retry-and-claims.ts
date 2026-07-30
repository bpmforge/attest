// Pass 51 — retry budgets (C) and claim-vs-evidence (D).
//
// WHY, both from the same 2026-07 field report (downstream project):
//
// C: one 3-strike counter cannot tell "I typed the command wrong" from "the code
//    is wrong", so the cheapest failure exhausts the budget for the real one. A
//    fence ran `pnpm biome check scripts/conductor` against a config excluding
//    `scripts/`; the agent burned its attempts on an invocation defect it could
//    not fix and stopped with the implementation finished and unreported. The
//    lead's own words: "A Biome invocation mistake should not consume a code-fix
//    attempt."
//
// D: the manifest validator checked that cited evidence EXISTS. It did not check
//    that the evidence agrees with the claim. Three escapes, each caught by hand:
//    a report claiming `tsc --noEmit` clean when a re-run showed 2 errors; a
//    report whose unit-suite output "was never pasted -- only integration"; and a
//    "blocked on DB permissions" claim that was fabricated (the integration tests
//    then ran clean with zero manual setup). The last is the inverse failure —
//    a false RED that looks like caution and costs a full round-trip.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

type Ok = (msg: string) => void;
type Fail = (msg: string, detail: string) => void;

export function testRetryBudgets(root: string, ok: Ok, fail: Fail) {
  const lp = fs.readFileSync(
    path.join(root, "agents/shared/LOOP_PREVENTION.md"),
    "utf8",
  );

  const needed: Array<[string, RegExp]> = [
    [
      "four named counters",
      /tooling_retries[\s\S]{0,400}environment_retries[\s\S]{0,400}code_remediation_retries[\s\S]{0,400}review_retries/,
    ],
    [
      "a global cap so counters don't become unlimited retries",
      /Global cap: 8 attempts total per HANDOFF/,
    ],
    [
      "classification read off evidence, not judged",
      /Classification is read off evidence, never judged/,
    ],
    [
      "the harness verdict is the tooling signal",
      /matched nothing \(path\/config defect/,
    ],
    [
      "pre-existing failures cost nothing",
      /BASELINE_RED[\s\S]{0,120}costs nothing/,
    ],
    [
      "unclassifiable defaults to the expensive counter",
      /charges `code_remediation` \*and\* the\s*\n?global cap/,
    ],
    [
      "the relabelling abuse is named",
      /relabelling a code failure as "tooling" to buy/,
    ],
    [
      "exhaustion says WHICH counter ran out",
      /say \*\*which counter ran out\*\*/,
    ],
    [
      "the STOP trigger references the counters",
      /any single retry counter exhausted, or the 8-attempt global cap/,
    ],
    [
      "the ledger tracks them between attempts",
      /Retry budgets: tooling <n>\/2/,
    ],
  ];
  const missing = needed.filter(([, re]) => !re.test(lp)).map(([l]) => l);
  if (missing.length === 0) {
    ok(
      "C: LOOP_PREVENTION splits the retry budget four ways, evidence-classified, under a global cap",
    );
  } else {
    fail(
      "C: LOOP_PREVENTION splits the retry budget four ways, evidence-classified, under a global cap",
      `missing: ${missing.join("; ")}`,
    );
  }
}

export function testClaimVsEvidence(root: string, ok: Ok, fail: Fail) {
  const validator = path.join(
    root,
    "scripts/validators/validate-completion-manifest.sh",
  );
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "claim-evidence-"));
  fs.mkdirSync(path.join(fixture, "docs", "work"), { recursive: true });
  fs.writeFileSync(path.join(fixture, "docs/work/out.ts"), "x\n");

  const setReport = (body: string) =>
    fs.writeFileSync(path.join(fixture, "docs/work/VERIFY_REPORT.md"), body);

  const manifest = (verifyLine: string, name = "m.md") => {
    fs.writeFileSync(
      path.join(fixture, name),
      [
        "# Completion Manifest",
        "## Files produced",
        "- `docs/work/out.ts`",
        "## Decisions",
        "- none",
        "## Known issues",
        "- none",
        "## Verify result",
        `- ${verifyLine}`,
        "## Memory written",
        "- None",
        "Maker: coding-agent",
        "Verifier: code-reviewer",
      ].join("\n") + "\n",
    );
    return name;
  };

  const run = (m: string) =>
    spawnSync("bash", [validator, m, "."], { cwd: fixture, encoding: "utf8" })
      .stdout ?? "";

  try {
    // -- D1. A pass claim against a RED artifact. The artifact wins. --------
    setReport(
      "## Command 1\nnpx vitest run\n**VERIFY: RED — exit 1 from: npx vitest run**\n",
    );
    const contradiction = run(
      manifest(
        "npx vitest run: all tests pass. Evidence: `docs/work/VERIFY_REPORT.md`",
      ),
    );
    if (/claim-contradicts-evidence/.test(contradiction)) {
      ok("D1: a pass claim whose cited artifact says RED is a gap");
    } else {
      fail(
        "D1: a pass claim whose cited artifact says RED is a gap",
        contradiction,
      );
    }

    // -- D2. A named check claimed as passing that appears nowhere in the
    //    evidence — the "unit suite was never pasted" escape.
    setReport("## Command 1\nnpx vitest run\n**VERIFY: ALL GREEN (1/1)**\n");
    const unevidenced = run(
      manifest(
        "vitest green and tsc clean. Evidence: `docs/work/VERIFY_REPORT.md`",
      ),
    );
    if (
      /claim-not-in-evidence.*tsc/.test(unevidenced) &&
      !/claim-not-in-evidence.*vitest/.test(unevidenced)
    ) {
      ok(
        "D2: a check claimed as passing but absent from the evidence is a gap; one actually present is not",
      );
    } else {
      fail(
        "D2: a check claimed as passing but absent from the evidence is a gap; one actually present is not",
        unevidenced,
      );
    }

    // -- D3. GREEN evidence + honest claim → no claim gaps at all. ----------
    const clean = run(
      manifest(
        "npx vitest run: all pass. Evidence: `docs/work/VERIFY_REPORT.md`",
      ),
    );
    if (!/claim-contradicts-evidence|claim-not-in-evidence/.test(clean)) {
      ok("D3: an honest claim backed by GREEN evidence raises no claim gap");
    } else {
      fail(
        "D3: an honest claim backed by GREEN evidence raises no claim gap",
        clean,
      );
    }

    // -- D4. BASELINE_RED is NOT a contradiction. The failures are real but
    //    pre-existing, so claiming the work verified is correct (v2.44.0).
    setReport(
      "## Command 1\nnpx vitest run\n**VERIFY: BASELINE_RED — 10 failing signature(s), 0 new**\n",
    );
    const preexisting = run(
      manifest(
        "npx vitest run: passing; 10 pre-existing failures reported. Evidence: `docs/work/VERIFY_REPORT.md`",
      ),
    );
    if (!/claim-contradicts-evidence/.test(preexisting)) {
      ok(
        "D4: BASELINE_RED evidence does not contradict a pass claim — the failures are not this work's",
      );
    } else {
      fail(
        "D4: BASELINE_RED evidence does not contradict a pass claim — the failures are not this work's",
        preexisting,
      );
    }

    // -- D5. The fabricated blocker: BLOCKED with nothing to point at. -----
    setReport("**VERIFY: RED — exit 1 from: x**\n");
    const bare = run(
      manifest(
        "BLOCKED: the database permissions are not set up",
        "blocked-bare.md",
      ),
    );
    const evidenced = run(
      manifest(
        "BLOCKED: connection refused — see `docs/work/VERIFY_REPORT.md`",
        "blocked-ok.md",
      ),
    );
    if (
      /blocked-without-evidence/.test(bare) &&
      !/blocked-without-evidence/.test(evidenced)
    ) {
      ok(
        "D5: a BLOCKED claim with no artifact and no quoted error is a gap; one with either is not",
      );
    } else {
      fail(
        "D5: a BLOCKED claim with no artifact and no quoted error is a gap; one with either is not",
        `bare:\n${bare}\nevidenced:\n${evidenced}`,
      );
    }

    // -- D6. Reading a cited artifact must obey the same traversal refusal as
    //    check 1. These checks OPEN the file, so an escaping citation being
    //    merely "not found" would be a read primitive.
    const v = fs.readFileSync(validator, "utf8");
    if (
      /verify-artifact-escapes-root/.test(v) &&
      /resolve_in_root "\$p"\)" == "ok"/.test(v)
    ) {
      ok(
        "D6: cited artifacts are resolved inside ROOT before being read, not just stat'd",
      );
    } else {
      fail(
        "D6: cited artifacts are resolved inside ROOT before being read, not just stat'd",
        "the verify-artifact path does not route through resolve_in_root",
      );
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}
