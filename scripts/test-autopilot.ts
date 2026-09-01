/**
 * test-autopilot.ts — chapter module for scripts/test.ts.
 *
 * Guards the /autopilot skill (feat/autopilot, 2026-08-31): the orchestrator
 * entry point that lets opencode assess what's left, decide the path forward,
 * drive the EXISTING loops (conductor / run-until-done / run-plan) to
 * completion, and heal or park stuck units. The skill is doctrine-as-prose,
 * so this pins three independent things:
 *
 *   1. skills/autopilot/SKILL.md exists with valid frontmatter and carries
 *      its load-bearing content — the five contract stages (ASSESS / DECIDE /
 *      DRIVE / HEAL / EXIT), the story-denominated assessment ("a drained
 *      board proves nothing"), done-is-a-predicate, the heal ladder in order
 *      (narrowed retry → split → tier escalation → park with evidence), the
 *      byte-identical no-progress HALT, the mandatory iteration cap using
 *      existing tier ceilings (6 metered / 12 local), and that it DRIVES the
 *      existing machinery by path instead of inventing new loops.
 *   2. It is REGISTERED everywhere its siblings (/goal, /wave) are:
 *      docs/FEATURES.md skill table, README.md routing table, and
 *      build-target-claude.mjs's KNOWN_MISSING_IN_CLAUDE (skills/ is
 *      per-target hand-maintained; the attest-claude port is the tracked
 *      follow-up, same pattern as wave/goal — test-skills-parity.ts asserts
 *      that set matches the live pair exactly).
 *   3. Self-test (planted RED): the phrase checks are not tautological — a
 *      gutted copy of the skill (HEAL ladder + halt rule stripped) must fail
 *      at least the checks that guard it.
 */

import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

const REQUIRED: Array<[string, RegExp]> = [
  // the five contract stages, as headings
  ["stage: ASSESS", /^## ASSESS/m],
  ["stage: DECIDE", /^## DECIDE/m],
  ["stage: DRIVE", /^## DRIVE/m],
  ["stage: HEAL", /^## HEAL/m],
  ["stage: EXIT", /^## EXIT/m],
  // assessment denominator is the SRS/stories, not the ticket list
  ["drained board proves nothing", /drained board proves nothing/i],
  [
    "story-denominated reporting",
    /closed\/total STORIES, not done\/total tickets/i,
  ],
  // doneness discipline
  ["done is a predicate, never a feeling", /predicate, never a feeling/i],
  ["every next action carries an exit predicate", /exit predicate/i],
  // drives the EXISTING machinery, by path
  ["drives the conductor", /scripts\/conductor\/conductor\.mjs/],
  ["drives run-until-done", /scripts\/run-until-done\.sh/],
  ["drives run-plan", /scripts\/run-plan\.mjs/],
  // the heal ladder, in order, and its discipline
  [
    "heal ladder rung 1: narrowed retry",
    /1\.\s+\*\*Retry with narrowed scope\*\*/,
  ],
  ["heal ladder rung 2: split", /2\.\s+\*\*Split\*\*/],
  ["heal ladder rung 3: tier escalation", /3\.\s+\*\*Escalate model tier\*\*/],
  [
    "heal ladder rung 4: park with evidence",
    /4\.\s+\*\*Park with evidence for a human\*\*/,
  ],
  ["never silently loop", /never silently loop/i],
  ["a park is not a landing", /park is not a landing/i],
  // the /goal no-progress rule
  [
    "byte-identical gap set = no-progress HALT",
    /byte-identical[\s\S]{0,120}HALT/i,
  ],
  // budget discipline — existing caps only
  ["iteration cap is mandatory", /Iteration cap is mandatory/i],
  ["existing tier ceilings, not invented", /6 metered \/ 12 local/],
  // exit shape
  ["assembly-gate-style exit predicate", /assembly-gate-style predicate/i],
  ["halt leaves stuck evidence", /AUTOPILOT_HALT\.md/],
];

export async function testAutopilot(
  root: string,
  ok: OK,
  fail: FAIL,
): Promise<void> {
  console.log(
    "\n[Pass 56] Autopilot — orchestrator skill content + registration, planted red",
  );

  const read = (rel: string): string | null => {
    const p = path.join(root, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };

  // -- 1. Skill exists, frontmatter valid, load-bearing content ------------
  const skill = read("skills/autopilot/SKILL.md");
  if (!skill) {
    fail("autopilot skill exists", "skills/autopilot/SKILL.md is missing");
    return;
  }
  const fm = skill.match(/^---\n([\s\S]*?)\n---/);
  if (
    fm &&
    /^name:\s*autopilot\s*$/m.test(fm[1]) &&
    /^description:/m.test(fm[1])
  )
    ok("autopilot skill: frontmatter has name: autopilot + description");
  else
    fail(
      "autopilot skill: frontmatter",
      "missing/invalid name or description in frontmatter",
    );

  let contentGaps = 0;
  for (const [label, re] of REQUIRED) {
    if (re.test(skill)) ok(`autopilot content: ${label}`);
    else {
      fail(`autopilot content: ${label}`, `pattern not found: ${re}`);
      contentGaps++;
    }
  }

  // -- 2. Registered everywhere its siblings are ---------------------------
  const features = read("docs/FEATURES.md") ?? "";
  if (/^\|\s*`\/autopilot`\s*\|/m.test(features))
    ok(
      "autopilot registered: docs/FEATURES.md skill table has a /autopilot row",
    );
  else
    fail(
      "autopilot registered: docs/FEATURES.md",
      "no `/autopilot` row in the skill table (siblings /goal and /wave have one)",
    );

  const readme = read("README.md") ?? "";
  if (/`\/autopilot`/.test(readme))
    ok("autopilot registered: README.md routing table names /autopilot");
  else
    fail(
      "autopilot registered: README.md",
      "README routing table has no /autopilot entry",
    );

  try {
    const { KNOWN_MISSING_IN_CLAUDE } = await import(
      pathToFileURL(path.join(root, "scripts/build-target-claude.mjs")).href
    );
    if (KNOWN_MISSING_IN_CLAUDE.has("autopilot"))
      ok(
        "autopilot registered: KNOWN_MISSING_IN_CLAUDE tracks the attest-claude port (wave/goal pattern)",
      );
    else
      fail(
        "autopilot registered: KNOWN_MISSING_IN_CLAUDE",
        "'autopilot' not in the set — skills-parity will flag an uncited gap",
      );
  } catch (e) {
    fail(
      "autopilot registered: KNOWN_MISSING_IN_CLAUDE",
      `could not import build-target-claude.mjs: ${e}`,
    );
  }

  // -- 3. Planted RED: gutted skill must fail the checks that guard HEAL ---
  const gutted = skill
    .replace(/^## HEAL[\s\S]*?(?=^## EXIT)/m, "")
    .replace(/byte-identical/gi, "");
  const failsOnGutted = REQUIRED.filter(([, re]) => !re.test(gutted)).length;
  if (contentGaps === 0 && failsOnGutted >= 5)
    ok(
      `autopilot planted red: gutting the HEAL ladder + halt rule fails ${failsOnGutted} check(s) — the phrase checks are not tautological`,
    );
  else if (contentGaps === 0)
    fail(
      "autopilot planted red",
      `gutted copy only failed ${failsOnGutted} check(s) — checks may be tautological`,
    );
}
