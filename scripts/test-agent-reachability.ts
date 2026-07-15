/**
 * test-agent-reachability.ts — chapter module for scripts/test.ts.
 *
 * The class-level Gap→Gate closure for the failure we hit with qa-vnv-engineer:
 * an expert was defined but referenced by NO other agent, so the SDLC pipeline
 * never dispatched it — a guardrail that never fires. The wiring-ledger already
 * proves every validator and shared protocol is reachable; there was no
 * equivalent for AGENTS. This is it.
 *
 * Invariant: every top-level primary agent (agents/*.md, mode: primary) must be
 * referenced by name in at least one OTHER agent file — a router handoff, a
 * coordinator, or a sibling's delegation list. References from agents/shared/
 * (reference docs / an agent's own companion doc) and from the agent's own file
 * do NOT count: qa-vnv-engineer was mentioned only by its own shared reference
 * doc while being dispatched nowhere, which is exactly the orphan state this
 * catches. (Verified: before v2.16 routed it, this check would have flagged it.)
 *
 * Scope note: nested cluster specialists (agents/code-review/*, agents/security/*,
 * agents/game/*, agents/test/*, agents/performance/*) are dispatched by their
 * cluster coordinator/synthesizer, not the top-level routers, so they are out of
 * scope here — this guards the top-level expert roster, where "defined but
 * forgotten" actually happens.
 *
 * Limitation (documented, matching the wiring-ledger's own tradeoff): this
 * catches the TOTAL-orphan case (referenced nowhere), not a weakly-wired agent
 * mentioned only in a "distinct from X" aside. Total-orphan is the real bug.
 */

import * as fs from "fs";
import * as path from "path";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

// Genuine entry-point agents invoked directly by the user/runtime that need no
// inbound reference from another agent. EMPTY today (every agent is cross-
// referenced). Add here ONLY with a one-line rationale if a future user-only
// agent legitimately has no inbound handoff. The stale-entry check below stops
// this list from rotting.
const ENTRY_POINT_ALLOWLIST = new Set<string>([
  // e.g. "some-user-only-agent",  // invoked solely via /slash, dispatched by nothing
]);

function isPrimaryAgent(content: string): boolean {
  return /^mode:\s*"?primary"?\s*$/m.test(content);
}

function referencedBy(
  name: string,
  files: Array<{ rel: string; text: string }>,
): string[] {
  // word-boundary match on the kebab-case agent name
  const rx = new RegExp(`(^|[^a-z0-9-])${name}([^a-z0-9-]|$)`);
  return files.filter((f) => rx.test(f.text)).map((f) => f.rel);
}

export function testAgentReachability(root: string, ok: OK, fail: FAIL) {
  console.log(
    "\n[Pass 44] Agent reachability — every top-level expert is dispatched, not orphaned",
  );

  const agentsDir = path.join(root, "agents");
  if (!fs.existsSync(agentsDir)) {
    fail("agents dir exists", "agents/ is missing");
    return;
  }

  // Top-level primary agents (the expert roster).
  const primary: string[] = [];
  for (const e of fs.readdirSync(agentsDir, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    const content = fs.readFileSync(path.join(agentsDir, e.name), "utf8");
    if (isPrimaryAgent(content)) primary.push(e.name.replace(/\.md$/, ""));
  }

  // All agent files EXCEPT those under agents/shared/ (reference docs don't count
  // as a dispatch path). Each file carries its repo-relative path + text.
  const agentFiles: Array<{ rel: string; text: string }> = [];
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(agentsDir, full);
      if (e.isDirectory()) {
        if (rel === "shared" || rel.startsWith(`shared${path.sep}`)) continue;
        walk(full);
      } else if (e.name.endsWith(".md")) {
        agentFiles.push({ rel, text: fs.readFileSync(full, "utf8") });
      }
    }
  })(agentsDir);

  let orphans = 0;
  for (const name of primary) {
    // exclude the agent's own file from the corpus for this check
    const others = agentFiles.filter((f) => f.rel !== `${name}.md`);
    const refs = referencedBy(name, others);

    if (ENTRY_POINT_ALLOWLIST.has(name)) {
      // Allowlisted entry point — exempt, but the allowlist may not rot.
      if (refs.length > 0) {
        fail(
          `allowlist not stale: ${name}`,
          `${name} is on ENTRY_POINT_ALLOWLIST but is now referenced by ${refs[0]} — remove it from the allowlist`,
        );
      } else {
        ok(`entry-point (allowlisted): ${name}`);
      }
      continue;
    }

    if (refs.length > 0) {
      ok(`dispatched: ${name} (referenced by ${refs.length} agent file(s))`);
    } else {
      orphans++;
      fail(
        `agent reachable: ${name}`,
        `${name} is a primary agent referenced by NO other agent file — it is dispatched nowhere, so the pipeline can never invoke it (route it via a HANDOFF, or add it to ENTRY_POINT_ALLOWLIST with a rationale if it is user-only)`,
      );
    }
  }

  if (orphans === 0)
    ok(`all ${primary.length} top-level primary agents are reachable`);
}
