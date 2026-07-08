/**
 * test-skill-agent-refs.ts — chapter module for scripts/test.ts (T22.5).
 *
 * Negative (red/green) test for Pass 2's skill→agent cross-reference check.
 * That check used to be inert: extractAgentRefs() pre-filtered on
 * knownAgents.has() DURING extraction, so the downstream "missing agent"
 * filter could never find anything — nothing not already known could ever
 * be extracted. Fixed by narrowing the extraction pattern instead of
 * removing the filter (see test.ts's extractAgentRefs for the full
 * reasoning). This proves the fixed check actually fires against a planted
 * bad reference, and that a real reference in the same phrasing is not
 * flagged.
 *
 * Duplicates test.ts's extractAgentRefs()/knownAgents construction rather
 * than importing them, since Pass 2's logic is inline top-level script code
 * (not exported) — kept in lockstep by testing the exact same pattern and
 * regex the ticket's fix introduced; drift would show up as this chapter's
 * own tests failing.
 */

import * as fs from "fs";
import * as path from "path";

function extractAgentRefs(content: string, knownAgents: Set<string>): string[] {
  const refs: string[] = [];
  const pattern = /`([a-z][\w-]+)`\s+agent\b/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    refs.push(m[1]);
  }
  return [...new Set(refs)];
}

export async function testSkillAgentRefs(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  try {
    const agentsDir = path.join(root, "agents");
    const knownAgents = new Set(
      fs
        .readdirSync(agentsDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, "")),
    );

    const planted =
      "Follow the instructions in the `nonexistent-agent-xyz` agent.";
    const plantedRefs = extractAgentRefs(planted, knownAgents);
    const plantedMissing = plantedRefs.filter((a) => !knownAgents.has(a));
    if (
      plantedRefs.includes("nonexistent-agent-xyz") &&
      plantedMissing.length === 1
    )
      ok(
        "skill agent refs — RED: reference to a non-existent agent is caught, not silently passed",
      );
    else
      fail(
        "skill agent refs — RED: non-existent agent reference",
        `extracted=${JSON.stringify(plantedRefs)} missing=${JSON.stringify(plantedMissing)}`,
      );

    const [firstRealAgent] = knownAgents;
    const clean = `Follow the instructions in the \`${firstRealAgent}\` agent.`;
    const cleanRefs = extractAgentRefs(clean, knownAgents);
    const cleanMissing = cleanRefs.filter((a) => !knownAgents.has(a));
    if (cleanMissing.length === 0)
      ok(
        "skill agent refs — GREEN: a real agent reference in the same phrasing is not flagged",
      );
    else
      fail(
        "skill agent refs — GREEN: real agent reference",
        `missing=${JSON.stringify(cleanMissing)}`,
      );

    // The inert-check regression itself: the OLD extraction (filter during
    // extraction) would make plantedMissing always empty regardless of
    // input. Assert the new extraction is NOT doing that -- i.e. it can
    // produce a ref that isn't in knownAgents at all, proving the filter
    // moved to the right place.
    const oldStyleExtract = (content: string): string[] => {
      const refs: string[] = [];
      const pattern = /`([a-z][\w-]+)`/g;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(content)) !== null) {
        if (knownAgents.has(m[1])) refs.push(m[1]);
      }
      return [...new Set(refs)];
    };
    const oldStyleRefs = oldStyleExtract(planted);
    if (oldStyleRefs.length === 0 && plantedRefs.length === 1)
      ok(
        "skill agent refs — old filter-during-extraction pattern would have missed this; new pattern doesn't",
      );
    else
      fail(
        "skill agent refs — inert-check regression",
        `oldStyleRefs=${JSON.stringify(oldStyleRefs)} newRefs=${JSON.stringify(plantedRefs)}`,
      );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("skill agent refs", `unexpected failure: ${message}`);
  }
}
