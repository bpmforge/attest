/**
 * test-handoff-intake.ts -- chapter module for scripts/test.ts.
 *
 * Guards the HANDOFF-intake contract, which failed in the field on gpt-5-mini
 * (2026-07): given a pointer-delivered handoff ("open /review-code, it reads
 * docs/work/HANDOFF_code-reviewer.md"), the specialist produced no files and
 * asked the user to run the skill it was already running.
 *
 * Two root causes, one check each:
 *   1. Bounded Task Mode triggers only on a prompt that STARTS WITH
 *      `SDLC-TASK for`, so pointer delivery never matched and coordinators fell
 *      through to Orchestrator Mode -- whose job is to emit handoffs. Every
 *      handoff-receiving agent must therefore carry the HANDOFF intake block.
 *   2. User-addressed delivery text ("USER: open a new session, type /<skill>,
 *      paste everything below") sat INSIDE the ════ delimiters -- inside the
 *      body the specialist reads as its task -- so weaker models relayed it back.
 *
 * Both are asserted through the real validator against red/green fixtures (not
 * a reimplementation of its regexes), plus a propagation assertion that the
 * canonical block reached every receiving agent including cluster subdirs.
 *
 * Run on real /bin/bash (not $BASH) per the T27.7 lesson.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface RunResult {
  exitCode: number;
  stdout: string;
}

function runValidator(script: string, fixtureDir: string): RunResult {
  try {
    const stdout = execFileSync("/bin/bash", [script, fixtureDir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, EXPERTS_TELEMETRY: "0" },
    });
    return { exitCode: 0, stdout };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string };
    return { exitCode: e.status ?? 1, stdout: e.stdout ?? "" };
  }
}

/** Every .md under agents/ except the shared/ reference tree. */
function collectAgents(dir: string, skipShared = true): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (skipShared && e.name === "shared") continue;
      out.push(...collectAgents(path.join(dir, e.name), false));
    } else if (e.name.endsWith(".md")) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

export async function testHandoffIntake(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const validatorScript = path.join(
    root,
    "scripts/validators/validate-handoff-discipline.sh",
  );
  const fixturesDir = path.join(
    root,
    "evals/fixtures/validators/handoff-intake",
  );

  // -- 1/4. RED: both defects planted in one coordinator are both flagged ----
  const red = runValidator(validatorScript, path.join(fixturesDir, "red"));
  const redFlagsUserLine = red.stdout.includes(
    '"category":"user-line-in-handoff-body"',
  );
  const redFlagsMissingIntake = red.stdout.includes(
    '"category":"missing-handoff-intake"',
  );
  if (red.exitCode !== 0 && redFlagsUserLine && redFlagsMissingIntake) {
    ok(
      "validate-handoff-discipline -- RED: a USER: line inside the ════ body and a missing HANDOFF intake block are both flagged",
    );
  } else {
    fail(
      "validate-handoff-discipline -- RED (handoff intake)",
      `expected exit!=0 with both categories, got exit=${red.exitCode} userLine=${redFlagsUserLine} missingIntake=${redFlagsMissingIntake}`,
    );
  }

  // -- 2/4. GREEN: intake block present + delivery text above the delimiter --
  const green = runValidator(validatorScript, path.join(fixturesDir, "green"));
  if (green.exitCode === 0 && green.stdout.includes('"gaps":0')) {
    ok(
      "validate-handoff-discipline -- GREEN: intake block present and the paste pointer kept above the opening delimiter passes clean",
    );
  } else {
    fail(
      "validate-handoff-discipline -- GREEN (handoff intake)",
      `expected exit=0 and 0 gaps, got exit=${green.exitCode} stdout=${green.stdout.slice(0, 500)}`,
    );
  }

  // -- 3/4. Propagation: every receiving agent carries the canonical block ---
  // build-agents.mjs originally walked only top-level agents/*.md, so cluster
  // agents (code-review/, security/, performance/, game/, sdlc/onboard/) kept
  // stale text while --fix reported "in sync". Assert coverage AND freshness.
  const agentsDir = path.join(root, "agents");
  const receivers = collectAgents(agentsDir).filter((f) =>
    fs.readFileSync(f, "utf8").includes("SDLC-TASK for"),
  );
  const missingBlock = receivers.filter(
    (f) => !fs.readFileSync(f, "utf8").includes("## HANDOFF intake (MANDATORY"),
  );
  // A line only present in the current canonical block -- catches the
  // "block reached the file but at a stale revision" case specifically.
  const staleBlock = receivers.filter(
    (f) => !fs.readFileSync(f, "utf8").includes("relative to the project root"),
  );
  if (
    receivers.length > 0 &&
    missingBlock.length === 0 &&
    staleBlock.length === 0
  ) {
    ok(
      `HANDOFF intake block -- present and current in all ${receivers.length} handoff-receiving agents, cluster subdirectories included`,
    );
  } else {
    fail(
      "HANDOFF intake block -- propagation",
      `receivers=${receivers.length} missing=${missingBlock.length} stale=${staleBlock.length}` +
        (missingBlock.length
          ? ` missingFiles=${missingBlock
              .slice(0, 5)
              .map((f) => path.relative(root, f))
              .join(",")}`
          : "") +
        (staleBlock.length
          ? ` staleFiles=${staleBlock
              .slice(0, 5)
              .map((f) => path.relative(root, f))
              .join(",")}`
          : ""),
    );
  }

  // -- 4/4. Emitter side: the printed pointer starts with the trigger --------
  // The receiving-side block is a backstop; the primary fix is that the user
  // pastes a line beginning with `SDLC-TASK for`, which the existing trigger
  // already matches. Assert the canonical templates actually instruct that.
  const emitters = [
    "agents/shared/HANDOFF_TEMPLATES.md",
    "agents/shared/HANDOFF_QUICK_REF.md",
  ];
  const badEmitters = emitters.filter((rel) => {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    return !/SDLC-TASK for <agent[^>]*>: read docs\/work\/HANDOFF_/.test(text);
  });
  if (badEmitters.length === 0) {
    ok(
      "HANDOFF emitters -- HANDOFF_TEMPLATES and HANDOFF_QUICK_REF both print a paste line starting with the SDLC-TASK trigger",
    );
  } else {
    fail(
      "HANDOFF emitters -- paste line",
      `these do not instruct a trigger-prefixed paste line: ${badEmitters.join(", ")}`,
    );
  }
}
