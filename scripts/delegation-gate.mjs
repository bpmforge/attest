#!/usr/bin/env node
/**
 * delegation-gate.mjs — three checks on a branch's diff that tests cannot make.
 *
 * Each closes a failure observed on the record in a downstream project, and each
 * shares the same machinery: compare HEAD against the merge-base, because all
 * three questions are about what CHANGED, not about what is there.
 *
 *   --coverage   Test coverage went DOWN. A round claimed new tests while silently
 *                deleting 300+ lines of existing ones. Nothing detects "quietly
 *                removed correct existing behaviour" — a passing suite is fully
 *                consistent with a smaller suite.
 *
 *   --patterns   A file-placement pattern with zero precedent in the tree. A round
 *                introduced a `__tests__/` layout existing nowhere else; the lead
 *                caught it with `find -type d -iname __tests__` returning zero hits
 *                on main. Warn, never fail — novelty is sometimes intentional, it
 *                just must be deliberate rather than accidental.
 *
 *   --citations  A REJECT verdict citing a defect that is not there. A code-reviewer
 *                fabricated one over a wiring omission independently confirmed
 *                present, verbatim, at every commit — costing three implementation
 *                rounds and two review rounds on one ticket. An AI reviewer can be as
 *                confidently wrong as an AI implementer, so more review layers do not
 *                help; the citations have to resolve.
 *
 *   node delegation-gate.mjs --coverage [--base=origin/main]
 *   node delegation-gate.mjs --patterns
 *   node delegation-gate.mjs --citations=docs/work/REVIEW_T-123.md
 *   node delegation-gate.mjs --grounding=docs/work/REVIEW_T-123.md
 *   node delegation-gate.mjs --all
 */
import { readFileSync, existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const ROOT = (() => {
  const r = opt("root", process.cwd());
  return isAbsolute(r) ? r : join(process.cwd(), r);
})();

const sh = (cmd, fallback = "") => {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return fallback;
  }
};

/** Where this branch left the trunk. Everything below is measured from there. */
function mergeBase() {
  const explicit = opt("base");
  if (explicit) return sh(`git merge-base ${explicit} HEAD`) || explicit;
  for (const ref of ["origin/main", "origin/master", "main", "master"]) {
    const b = sh(`git merge-base ${ref} HEAD`);
    if (b) return b;
  }
  return null;
}

const isTest = (p) => /(\.|_|\/)(test|spec)\.[jt]sx?$|(^|\/)(tests?|__tests__|spec)\//i.test(p);
const TEST_CASE = /^\s*(?:it|test)\s*(?:\.\w+)?\s*\(|^\s*#\[test\]|^\s*def test_|^\s*func Test\w+\(/gm;

function countCases(ref, file) {
  const body = sh(`git show ${ref}:${file}`, null);
  if (body === null) return 0;
  return (body.match(TEST_CASE) ?? []).length;
}

// ── coverage delta ─────────────────────────────────────────────────────────
function coverage(base) {
  const changed = sh(`git diff --name-only ${base} HEAD`).split("\n").filter(Boolean).filter(isTest);
  if (!changed.length) {
    console.log("delegation-gate: no test files changed on this branch");
    return 0;
  }

  let before = 0;
  let after = 0;
  const shrunk = [];
  for (const f of changed) {
    const b = countCases(base, f);
    const a = countCases("HEAD", f);
    before += b;
    after += a;
    if (a < b) shrunk.push({ f, b, a });
  }

  console.log(`Test cases in changed test files: ${before} → ${after} (${changed.length} file(s))`);
  for (const s of shrunk) console.log(`  ${s.f}: ${s.b} → ${s.a}`);

  // Per-FILE shrinkage, not just the net total. The observed failure added one new
  // test file while deleting cases from an existing one — the totals matched, and a
  // net check waved it through. "Existing coverage was removed" is the claim; new
  // tests elsewhere do not answer it.
  if (!shrunk.length && after >= before) {
    console.log("delegation-gate: no test file lost cases, and the total did not decrease");
    return 0;
  }

  // An intentional removal is fine; an undeclared one is the failure. The
  // justification must be in the commit trail, where it is reviewable.
  const log = sh(`git log ${base}..HEAD --format=%B`);
  if (/Coverage-removed:/i.test(log)) {
    console.log("delegation-gate: coverage shrank, and a Coverage-removed: justification is present");
    return 0;
  }
  const detail = shrunk.length
    ? `${shrunk.length} existing test file(s) lost cases: ` +
      shrunk.map((s) => `${s.f} (${s.b}→${s.a})`).join(", ")
    : `total test cases decreased ${before} → ${after}`;
  console.error(
    `delegation-gate: ${detail}, with no justification.\n` +
      `  A passing suite is entirely consistent with a smaller suite — this is the case\n` +
      `  tests structurally cannot see, and new tests elsewhere do not answer it.\n` +
      `  If the removal is deliberate, add a "Coverage-removed: <why>" line to a commit message.`,
  );
  return 1;
}

// ── pattern novelty ────────────────────────────────────────────────────────
function patterns(base) {
  const added = sh(`git diff --name-only --diff-filter=A ${base} HEAD`).split("\n").filter(Boolean);
  if (!added.length) {
    console.log("delegation-gate: no new files on this branch");
    return 0;
  }

  // Directory segments the branch introduces, checked against the whole base tree.
  const baseTree = new Set(
    sh(`git ls-tree -r --name-only ${base}`)
      .split("\n")
      .filter(Boolean)
      .flatMap((p) => p.split("/").slice(0, -1)),
  );

  const novel = new Map();
  for (const f of added) {
    for (const seg of f.split("/").slice(0, -1)) {
      if (!baseTree.has(seg)) {
        if (!novel.has(seg)) novel.set(seg, []);
        novel.get(seg).push(f);
      }
    }
  }

  if (!novel.size) {
    console.log(`delegation-gate: ${added.length} new file(s), no novel directory names`);
    return 0;
  }
  console.log(`delegation-gate: ${novel.size} directory name(s) with no precedent in the base tree:`);
  for (const [seg, files] of novel) {
    console.log(`  ${seg}/ — ${files.length} file(s), e.g. ${files[0]}`);
  }
  console.log(
    "\nNot a failure. Novelty is sometimes right — but a layout that exists nowhere else\n" +
      "should be a decision someone made, not one that arrived with a ticket.",
  );
  return 0; // advisory by design
}

// ── reviewer citations ─────────────────────────────────────────────────────
function citations(file, ref) {
  const path = isAbsolute(file) ? file : join(ROOT, file);
  if (!existsSync(path)) {
    console.error(`delegation-gate: no such review file: ${file}`);
    return 2;
  }
  const text = readFileSync(path, "utf8");

  // `path/to/file.ts:123` — the form a reviewer must use to be checkable.
  const cites = [
    ...new Set(
      [...text.matchAll(/([\w./-]+\.[a-zA-Z]{1,5}):(\d+)/g)].map((m) => `${m[1]}:${m[2]}`),
    ),
  ];
  if (!cites.length) {
    console.error(
      `delegation-gate: ${file} contains no file:line citations.\n` +
        `  A verdict that names no location cannot be checked, which is how a fabricated\n` +
        `  one survives. Cite the code you are rejecting.`,
    );
    return 1;
  }

  const bad = [];
  for (const c of cites) {
    const [f, lineNo] = c.split(":");
    const body = sh(`git show ${ref}:${f}`, null);
    if (body === null) {
      bad.push(`${c} — file does not exist at ${ref.slice(0, 8)}`);
      continue;
    }
    const lines = body.split("\n");
    if (Number(lineNo) > lines.length) {
      bad.push(`${c} — file has only ${lines.length} lines at ${ref.slice(0, 8)}`);
    }
  }

  console.log(`delegation-gate: ${cites.length} citation(s) checked against ${ref.slice(0, 8)}`);
  if (!bad.length) {
    console.log("  all resolve");
    return 0;
  }
  for (const b of bad) console.error(`  UNRESOLVABLE: ${b}`);
  console.error(
    `\n${bad.length} citation(s) do not resolve. A verdict resting on them is not\n` +
      `evidence — an AI reviewer can be as confidently wrong as an AI implementer.`,
  );
  return 1;
}


// ── finding grounding ──────────────────────────────────────────────────────
// Two ways a reviewer raises a finding that should never have been raised.
// Field trace 2026-07 (downstream project), both from one review:
//
//   F. A requirement asserted by ANALOGY. The reviewer claimed setPinned needed a
//      system-snapshot guard at 90% confidence. The lead read the SRS: FR-VER-07
//      (delete) explicitly forbids deleting system snapshots; FR-VER-06 (pin) has
//      no such clause, and pinning destroys nothing. "The reviewer's 90%-confidence
//      claim is an analogy from delete's guard, not a grounded requirement." Two
//      findings dropped — the second only existed to test the first.
//
//   G. A METHODOLOGY artifact demanded of the project. The reviewer flagged
//      `scripts/validators/validate-tech-stack.sh` as missing; that project "genuinely
//      has no scripts/validators/ directory at all". Our own scaffolding is not the
//      reviewed project's deliverable.
//
// Neither is caught by --citations: F cites nothing to resolve, and G is a claim
// about a file's ABSENCE, which has no line number to check.
const REQ_ID = /\b(?:FR|NFR|US|AC|REQ)-[A-Z0-9]{2,}(?:-\d+)?\b/g;
// Requirement-INVOKING language, deliberately not a bare "must" — reviews say
// "must be awaited" about plain code all day. These phrasings claim the spec.
const REQ_LANGUAGE =
  /\b(requirement|SRS|SHALL|acceptance criteri|per the spec|the spec (?:says|requires)|user stor(?:y|ies))\b/i;
// Directories that belong to the expert system, not to a reviewed project.
const METHODOLOGY_DIR = /^(scripts\/validators|agents|references|exemplars|docs\/work)\//;
const ABSENCE = /\b(missing|absent|does not exist|doesn't exist|not present|should (?:exist|be (?:created|added)))\b/i;

function grounding(file) {
  const p = isAbsolute(file) ? file : join(ROOT, file);
  if (!existsSync(p)) {
    console.error(`delegation-gate: no such review file: ${file}`);
    return 2;
  }
  const text = readFileSync(p, "utf8");
  let rc = 0;

  // -- F1. Every requirement ID invoked must exist in the requirement docs. --
  const ids = [...new Set(text.match(REQ_ID) ?? [])];
  const reqDocs = [
    "docs/SRS.md",
    "docs/sdlc/SRS.md",
    "docs/USER_STORIES.md",
    "docs/sdlc/USER_STORIES.md",
    "SRS.md",
  ]
    .map((d) => join(ROOT, d))
    .filter((d) => existsSync(d));
  const corpus = reqDocs.map((d) => readFileSync(d, "utf8")).join("\n");

  if (ids.length && !reqDocs.length) {
    console.log(
      `delegation-gate: review invokes ${ids.length} requirement ID(s) but no SRS/USER_STORIES\n` +
        `  was found to check them against — grounding UNVERIFIED, not confirmed.`,
    );
  } else if (ids.length) {
    const missing = ids.filter((id) => !corpus.includes(id));
    console.log(
      `delegation-gate: ${ids.length} requirement ID(s) checked against ${reqDocs.length} requirement doc(s)`,
    );
    if (missing.length) {
      for (const m of missing) console.error(`  NOT IN REQUIREMENTS: ${m}`);
      console.error(
        `\n${missing.length} requirement ID(s) appear nowhere in the requirement docs. A finding\n` +
          `resting on a requirement that does not exist is confabulated, however confident\n` +
          `the confidence score.`,
      );
      rc = 1;
    } else {
      console.log("  all resolve");
    }
  }

  // -- F2. Arguing FROM requirements while citing none at all. --------------
  if (!ids.length && REQ_LANGUAGE.test(text)) {
    const hit = (text.match(REQ_LANGUAGE) ?? [])[0];
    console.error(
      `delegation-gate: this review argues from requirements (matched "${hit}") but cites no\n` +
        `  requirement ID anywhere. That is the shape of a requirement inferred by analogy\n` +
        `  from a neighbouring rule — cite the FR/NFR/US that says it, or drop the claim.`,
    );
    rc = 1;
  }

  // -- G. Methodology artifacts demanded of the reviewed project. -----------
  const paths = [...new Set([...text.matchAll(/`([\w./-]+\.[a-zA-Z]{1,5})`/g)].map((m) => m[1]))];
  // Test the METHODOLOGY prefix itself (e.g. "scripts/validators"), not just the
  // top level: the traced project had no "scripts/validators/" while plausibly
  // having a "scripts/", and a top-level-only check would have missed it.
  const mismatched = paths.filter((x) => {
    const m = x.match(METHODOLOGY_DIR);
    return m ? !existsSync(join(ROOT, m[1])) : false;
  });
  if (mismatched.length && ABSENCE.test(text)) {
    console.log(
      `\nMETHODOLOGY/PROJECT MISMATCH — ${mismatched.length} path(s) belong to the expert system,\n` +
        `  not to this project, and the directory they live in does not exist here:`,
    );
    for (const m of mismatched) console.log(`    ${m}`);
    console.log(
      "  Our own scaffolding is not the reviewed project's deliverable. Drop these findings;\n" +
        "  they are a generic-methodology artifact, not a defect in the work under review.",
    );
    // Advisory: the correct resolution is "no action needed", so this names the
    // class rather than blocking a review that is otherwise sound.
  }

  return rc;
}

// ── entry ──────────────────────────────────────────────────────────────────
if (!sh("git rev-parse --git-dir")) {
  console.error(`delegation-gate: ${ROOT} is not a git repository`);
  process.exit(2);
}

const cite = opt("citations");
const ground = opt("grounding");
const wantAll = argv.includes("--all");
let rc = 0;

if (cite) {
  rc |= citations(cite, opt("ref", "HEAD"));
} else if (ground) {
  rc |= grounding(ground);
} else if (wantAll || argv.includes("--coverage") || argv.includes("--patterns")) {
  const base = mergeBase();
  if (!base) {
    console.error("delegation-gate: could not determine a merge-base — pass --base=<ref>");
    process.exit(2);
  }
  if (wantAll || argv.includes("--coverage")) rc |= coverage(base);
  if (wantAll || argv.includes("--patterns")) rc |= patterns(base);
} else {
  console.error(
    "delegation-gate: pass --coverage, --patterns, --citations=<file>, --grounding=<file>, or --all",
  );
  process.exit(2);
}
process.exit(rc ? 1 : 0);
