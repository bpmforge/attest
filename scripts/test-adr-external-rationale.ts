/**
 * test-adr-external-rationale.ts — Pass 17 chapter module for scripts/test.ts
 * (T29.5).
 *
 * Covers three additions:
 *   1. validate-adrs.sh: a hard-to-reverse choice (datastore/auth-model/
 *      core-framework/vendoring-strategy — extensible, not exhaustive)
 *      asserted in ARCHITECTURE.md/TECH_STACK.md must be backed by a
 *      referenced ADR whose own content documents that category.
 *   2. validate-challenger-gate.sh: an ADR/design doc asserting an
 *      unverified external rationale ("**External rationale (needs
 *      verification):**") is treated as a source requiring a matching
 *      challenge report — same T22.20 per-source Artifact correlation, not
 *      a parallel mechanism. This is the ticket's planted acceptance test:
 *      "a design doc asserting an unverified external rationale is
 *      flagged."
 *   3. Bypass guards: a "soft" internal reason must NOT trigger the gate
 *      (it's an honest, non-rigorous reason — fine to have); a challenge
 *      report that only declares a RESEARCH_*.md Artifact must NOT satisfy
 *      an ADR's marker (the researcher path must terminate in a challenge
 *      report naming the ADR itself, per references/adr-template.md).
 *
 * Run on real /bin/bash (not $BASH) per the T27.7 lesson.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

export async function testAdrExternalRationale(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const adrsValidator = path.join(root, "scripts/validators/validate-adrs.sh");
  const challengerValidator = path.join(
    root,
    "scripts/validators/validate-challenger-gate.sh",
  );

  function run(
    script: string,
    dir: string,
  ): { exitCode: number; stdout: string } {
    try {
      const stdout = execFileSync("/bin/bash", [script, dir], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { exitCode: 0, stdout };
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string };
      return { exitCode: e.status ?? 1, stdout: e.stdout ?? "" };
    }
  }

  function makeFixtureDir(prefix: string): string {
    const dir = fs.mkdtempSync(
      path.join(fs.realpathSync(root), `.tmp-${prefix}-`),
    );
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function writeFiles(dir: string, files: Record<string, string>) {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  }

  const EXTERNAL_MARKER = "**External rationale (needs verification):**";

  try {
    // -- 1. validate-adrs.sh: hard-choice-needs-ADR, RED (no ADR ref at all) --
    {
      const dir = makeFixtureDir("adr-hardchoice-red");
      writeFiles(dir, {
        "docs/ARCHITECTURE.md":
          "# Architecture\n\nWe chose PostgreSQL as our datastore for its JSON support.\n",
      });
      const r = run(adrsValidator, dir);
      if (
        r.exitCode === 1 &&
        r.stdout.includes("missing-adr-for-hard-choice") &&
        r.stdout.includes("datastore")
      )
        ok(
          "adr-external-rationale — validate-adrs: a datastore decision with no ADR reference is flagged",
        );
      else
        fail(
          "adr-external-rationale — validate-adrs hard-choice RED",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 2. validate-adrs.sh: hard-choice-needs-ADR, GREEN (referenced ADR
    // whose own content documents the category) --
    {
      const dir = makeFixtureDir("adr-hardchoice-green");
      writeFiles(dir, {
        "docs/ARCHITECTURE.md":
          "# Architecture\n\nWe chose PostgreSQL as our datastore for its JSON support (ADR-001).\n",
        "docs/adrs/ADR-001-datastore.md":
          "# ADR-001: PostgreSQL as datastore\n\n**Status:** Accepted — 2026-07-09\n\n## Decision\nUse PostgreSQL as the datastore.\n",
      });
      const r = run(adrsValidator, dir);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok(
          "adr-external-rationale — validate-adrs: a datastore decision backed by a matching ADR passes clean",
        );
      else
        fail(
          "adr-external-rationale — validate-adrs hard-choice GREEN",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 3. validate-adrs.sh: a referenced ADR that does NOT actually
    // discuss the category (e.g. an unrelated ADR-001 reused by mistake)
    // must still gate red — "any ADR reference" is not enough, it has to be
    // ABOUT the asserted category. --
    {
      const dir = makeFixtureDir("adr-hardchoice-wrongtopic");
      writeFiles(dir, {
        "docs/ARCHITECTURE.md":
          "# Architecture\n\nWe chose PostgreSQL as our datastore for its JSON support (ADR-001).\n",
        "docs/adrs/ADR-001-unrelated.md":
          "# ADR-001: Logging format\n\n**Status:** Accepted — 2026-07-09\n\n## Decision\nUse structured JSON logging.\n",
      });
      const r = run(adrsValidator, dir);
      if (r.exitCode === 1 && r.stdout.includes("missing-adr-for-hard-choice"))
        ok(
          "adr-external-rationale — validate-adrs: an ADR reference that doesn't actually cover the category still gates red",
        );
      else
        fail(
          "adr-external-rationale — validate-adrs wrong-topic ADR",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 4. PLANTED ACCEPTANCE TEST: a design doc (ADR) asserting an
    // unverified external rationale is flagged by validate-challenger-gate.sh. --
    {
      const dir = makeFixtureDir("ext-rationale-red");
      writeFiles(dir, {
        "docs/adrs/ADR-002-vendoring.md": [
          "# ADR-002: Vendor all third-party dependencies",
          "",
          "**Status:** Accepted — 2026-07-09",
          "",
          "## Deciding factors",
          `- ${EXTERNAL_MARKER} legal says the client's supply-chain policy`,
          "  requires full vendoring for this contract.",
          "",
        ].join("\n"),
      });
      const r = run(challengerValidator, dir);
      if (
        r.exitCode === 1 &&
        r.stdout.includes("unverified-external-rationale") &&
        r.stdout.includes("ADR-002-vendoring.md")
      )
        ok(
          "adr-external-rationale — PLANTED ACCEPTANCE TEST: an ADR asserting an unverified external rationale is flagged",
        );
      else
        fail(
          "adr-external-rationale — planted acceptance test",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 500)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 5. Same ADR, but with a matching CHALLENGE_REPORT declaring the
    // ADR's own path as Artifact, CONTRADICTED: 0 -- must pass clean. --
    {
      const dir = makeFixtureDir("ext-rationale-green");
      writeFiles(dir, {
        "docs/adrs/ADR-002-vendoring.md": [
          "# ADR-002: Vendor all third-party dependencies",
          "",
          "**Status:** Accepted — 2026-07-09",
          "",
          "## Deciding factors",
          `- ${EXTERNAL_MARKER} legal says the client's supply-chain policy`,
          "  requires full vendoring for this contract.",
          "",
        ].join("\n"),
        "docs/reviews/CHALLENGE_REPORT_adr002_2026-07-09.md": [
          "# Challenge Report — ADR-002",
          "",
          "**Date:** 2026-07-09 | **Artifact:** docs/adrs/ADR-002-vendoring.md | **Challenger:** challenger agent",
          "",
          "## Summary",
          "- Claims reviewed: 1",
          "- CONFIRMED: 1",
          "- CONTRADICTED: 0",
          "- UNVERIFIABLE: 0",
          "- Action required: NO",
          "",
        ].join("\n"),
      });
      const r = run(challengerValidator, dir);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok(
          "adr-external-rationale — a properly-verified external rationale (matching clean CHALLENGE_REPORT) passes clean",
        );
      else
        fail(
          "adr-external-rationale — verified external rationale GREEN",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 6. BYPASS GUARD: a "soft" internal reason (stakeholder preference,
    // prior-employer habit) must NOT trigger the gate -- soft-but-honest is
    // fine, only an unverified EXTERNAL claim needs verification. --
    {
      const dir = makeFixtureDir("soft-tag-no-trigger");
      writeFiles(dir, {
        "docs/adrs/ADR-003-session-auth.md": [
          "# ADR-003: Session cookies over JWT",
          "",
          "**Status:** Accepted — 2026-07-09",
          "",
          "## Deciding factors",
          "- **Internal — soft:** the team already knows Postgres sessions,",
          "  prior-employer habit — not rigorous, but an honest reason.",
          "- **Internal — rigorous:** revocation must complete within one",
          "  request (NFR-SEC-2).",
          "",
        ].join("\n"),
      });
      const r = run(challengerValidator, dir);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok(
          "adr-external-rationale — BYPASS GUARD: an honestly-tagged soft internal reason does not trigger the gate",
        );
      else
        fail(
          "adr-external-rationale — soft-tag false-positive guard",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 7. BYPASS ATTEMPT: a challenge report exists and is clean, but its
    // Artifact field names only a researcher RESEARCH_*.md file, not the ADR
    // itself. Per T22.20 correlation this must NOT satisfy the ADR's marker
    // -- confirms the "researcher verification" path can't be used to dodge
    // detection by challenging a proxy artifact instead of the ADR. --
    {
      const dir = makeFixtureDir("ext-rationale-research-bypass");
      writeFiles(dir, {
        "docs/adrs/ADR-002-vendoring.md": [
          "# ADR-002: Vendor all third-party dependencies",
          "",
          "**Status:** Accepted — 2026-07-09",
          "",
          "## Deciding factors",
          `- ${EXTERNAL_MARKER} legal says the client's supply-chain policy`,
          "  requires full vendoring for this contract.",
          "",
        ].join("\n"),
        "docs/research/RESEARCH_vendoring_2026-07-09.md":
          "# Research: vendoring supply-chain mandate\n\nFindings...\n",
        "docs/reviews/CHALLENGE_REPORT_research_vendoring_2026-07-09.md": [
          "# Challenge Report — RESEARCH_vendoring",
          "",
          "**Date:** 2026-07-09 | **Artifact:** docs/research/RESEARCH_vendoring_2026-07-09.md | **Challenger:** challenger agent",
          "",
          "## Summary",
          "- Claims reviewed: 1",
          "- CONFIRMED: 1",
          "- CONTRADICTED: 0",
          "- UNVERIFIABLE: 0",
          "- Action required: NO",
          "",
        ].join("\n"),
      });
      const r = run(challengerValidator, dir);
      if (
        r.exitCode === 1 &&
        r.stdout.includes("unverified-external-rationale") &&
        r.stdout.includes("ADR-002-vendoring.md")
      )
        ok(
          "adr-external-rationale — BYPASS GUARD: a challenge report naming only the RESEARCH_*.md proxy does not satisfy the ADR's marker",
        );
      else
        fail(
          "adr-external-rationale — researcher-proxy bypass guard",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 500)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 8. BYPASS ATTEMPT: rephrasing the marker (missing the trailing
    // colon, or paraphrased prose) must NOT be silently treated as verified
    // -- but it also must not be silently ignored forever: a near-miss
    // marker simply doesn't trigger the gate at all (documented behavior --
    // the marker is a literal string per the template), so this fixture
    // confirms a genuinely-different phrasing ("this is externally
    // mandated") without the exact marker text does NOT get flagged --
    // proving detection is precise, not proving it's a bypass of a real
    // marker (the template instructs authors to use the exact string; a
    // paraphrase never enters gated territory in the first place, which is
    // a documented non-goal, not a hole -- see references/adr-template.md
    // rule 3). --
    {
      const dir = makeFixtureDir("ext-rationale-paraphrase");
      writeFiles(dir, {
        "docs/adrs/ADR-004-paraphrase.md": [
          "# ADR-004: Something externally mandated",
          "",
          "**Status:** Accepted — 2026-07-09",
          "",
          "## Deciding factors",
          "- This is externally mandated by a client contract (no exact marker used).",
          "",
        ].join("\n"),
      });
      const r = run(challengerValidator, dir);
      if (r.exitCode === 0 && r.stdout.includes('"gaps":0'))
        ok(
          "adr-external-rationale — a paraphrased (non-literal-marker) claim does not trigger the gate — documented non-goal, not a hole (see references/adr-template.md rule 3)",
        );
      else
        fail(
          "adr-external-rationale — paraphrase non-detection sanity check",
          `exit=${r.exitCode} stdout=${r.stdout.slice(0, 400)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("adr-external-rationale", `unexpected failure: ${message}`);
  }
}
