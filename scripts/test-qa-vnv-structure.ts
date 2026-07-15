/**
 * test-qa-vnv-structure.ts — chapter module for scripts/test.ts.
 *
 * Guards the qa-vnv-engineer guardrail from silently regressing. The v2.14/2.15
 * process review found the expert was defined but (a) routed nowhere, so the
 * SDLC pipeline never invoked it, and (b) its evidence gate ran on the honor
 * system, not in the deterministic gate chain. v2.16 closed both. This test
 * makes those fixes permanent: if a future edit drops the routing, unwires the
 * gate, or guts the expert's required sections, CI fails instead of quietly
 * shipping a guardrail that no longer fires.
 *
 * Three independent things must stay true:
 *   1. The expert file has its load-bearing sections (contract, watchdog, gate,
 *      report format, independence, cardinal rule).
 *   2. The expert is ROUTED — dispatched by a HANDOFF in sdlc-init-phase-5.md.
 *   3. The evidence gate is ENFORCED — validate-qa-evidence.sh is in phase-5
 *      GATE_VALIDATORS, and the validator script exists.
 */

import * as fs from "fs";
import * as path from "path";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

export function testQaVnvStructure(root: string, ok: OK, fail: FAIL) {
  console.log(
    "\n[Pass 43] qa-vnv-engineer guardrail — structure + routing + enforced gate",
  );

  const read = (rel: string): string | null => {
    const p = path.join(root, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };

  // -- 1. Expert file has its load-bearing sections ------------------------
  const agent = read("agents/qa-vnv-engineer.md");
  if (!agent) {
    fail("qa-vnv agent exists", "agents/qa-vnv-engineer.md is missing");
  } else {
    const required: Array<[string, RegExp]> = [
      ["cardinal rule (measure, don't eyeball)", /measure,?\s*don'?t eyeball/i],
      ["independence / maker≠checker", /independen|self-certif/i],
      ["runtime error watchdog", /error watchdog/i],
      ["watchdog captures pageerror", /pageerror/i],
      ["watchdog captures failed requests", /requestfailed/i],
      ["watchdog captures HTTP 4xx/5xx", /4xx|5xx|http.?4|http.?5/i],
      ["Input Contract section", /##\s*Input Contract/i],
      ["Pre-Completion Gate section", /##\s*Pre-?Completion Gate/i],
      ["produces a VNV report", /VNV_REPORT/],
      ["invokes the evidence gate", /validate-qa-evidence\.sh/],
      ["points at the technique reference", /QA_VNV_TESTING\.md/],
    ];
    for (const [label, rx] of required) {
      if (rx.test(agent)) ok(`agent: ${label}`);
      else fail(`agent: ${label}`, `qa-vnv-engineer.md is missing: ${label}`);
    }
  }

  // -- 2. The expert is ROUTED (dispatched by a phase-5 handoff) -----------
  const phase5 = read("agents/sdlc-init-phase-5.md");
  if (!phase5) {
    fail("phase-5 file exists", "agents/sdlc-init-phase-5.md is missing");
  } else if (
    /HANDOFF[^\n]*qa-vnv|SDLC-TASK for qa-vnv-engineer/i.test(phase5)
  ) {
    ok("routing: qa-vnv-engineer is dispatched by a phase-5 HANDOFF");
  } else {
    fail(
      "routing: qa-vnv-engineer dispatched in phase-5",
      "sdlc-init-phase-5.md has no HANDOFF to qa-vnv-engineer — the expert would never be invoked by /sdlc",
    );
  }

  // -- 3. The evidence gate is ENFORCED (in the deterministic chain) -------
  const phaseGate = read("scripts/validators/validate-phase-gate.sh");
  if (!phaseGate) {
    fail(
      "phase-gate file exists",
      "scripts/validators/validate-phase-gate.sh is missing",
    );
  } else if (/validate-qa-evidence\.sh/.test(phaseGate)) {
    ok("enforcement: validate-qa-evidence.sh is in a deterministic gate list");
  } else {
    fail(
      "enforcement: validate-qa-evidence.sh in gate chain",
      "validate-qa-evidence.sh is not in validate-phase-gate.sh — the gate is honor-system only",
    );
  }

  const validator = path.join(
    root,
    "scripts/validators/validate-qa-evidence.sh",
  );
  if (fs.existsSync(validator)) {
    ok("enforcement: validate-qa-evidence.sh script exists");
  } else {
    fail(
      "enforcement: validator script exists",
      "scripts/validators/validate-qa-evidence.sh is missing",
    );
  }
}
