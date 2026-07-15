/**
 * test-sdlc-mode-clarity.ts — chapter module for scripts/test.ts.
 *
 * Guards the v2.21 mode-clarity fixes. Field report (Gemini on the SDLC,
 * 2026-07-15): an INCOMPLETE SDLC or an improvement ask performed much worse
 * than a fresh design — because `init` was the only fully-specified path, weak
 * models collapsed everything into fresh design. Two contracts fix that, and
 * this test keeps them wired:
 *
 *   1. sdlc-lead's `partial` route must invoke the Resume Protocol —
 *      gate-verify claimed-complete phases (validate-phase-gate), per-artifact
 *      disposition (LOCKED / REPAIR / PRODUCE), additive-never-regenerate.
 *   2. sdlc-improve-mode must carry the "Improve ≠ Redesign" contract —
 *      existing system is the baseline; deliverables are findings/backlog/fixes,
 *      not regenerated design docs.
 */

import * as fs from "fs";
import * as path from "path";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

export function testSdlcModeClarity(root: string, ok: OK, fail: FAIL) {
  console.log(
    "\n[Pass 46] SDLC mode clarity — resume protocol wired + improve≠redesign contract",
  );

  const read = (rel: string): string | null => {
    const p = path.join(root, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };

  // -- 1. Resume protocol exists with its load-bearing rules ----------------
  const proto = read("agents/shared/SDLC_RESUME_PROTOCOL.md");
  if (!proto) {
    fail(
      "resume protocol exists",
      "agents/shared/SDLC_RESUME_PROTOCOL.md missing",
    );
  } else {
    const rules: Array<[string, RegExp]> = [
      ["gate-verifies completed phases", /validate-phase-gate/],
      ["LOCKED disposition", /\bLOCKED\b/],
      ["REPAIR disposition", /\bREPAIR\b/],
      ["PRODUCE disposition", /\bPRODUCE\b/],
      [
        "additive-never-regenerate rule",
        /[Aa]dditive.*never regenerat|never regenerat/i,
      ],
      ["never-trust-the-claim rule", /never trust the\s+claim/i],
    ];
    for (const [label, rx] of rules) {
      if (rx.test(proto)) ok(`protocol: ${label}`);
      else
        fail(`protocol: ${label}`, `SDLC_RESUME_PROTOCOL.md missing: ${label}`);
    }
  }

  // -- 2. sdlc-lead's partial route invokes it -------------------------------
  const lead = read("agents/sdlc-lead.md");
  if (!lead) {
    fail("sdlc-lead exists", "agents/sdlc-lead.md missing");
  } else {
    // The partial row must reference the protocol AND the gate verification —
    // a bare "skip complete phases" one-liner is the regression this catches.
    const partialLine = lead
      .split("\n")
      .find((l) => /\|\s*`partial`\s*\|/.test(l));
    if (!partialLine) {
      fail(
        "lead: partial route present",
        "no `partial` routing row in sdlc-lead.md",
      );
    } else {
      if (/SDLC_RESUME_PROTOCOL/.test(partialLine))
        ok("lead: partial route invokes the Resume Protocol");
      else
        fail(
          "lead: partial route invokes the Resume Protocol",
          "`partial` row does not reference SDLC_RESUME_PROTOCOL.md — resume is underspecified again",
        );
      if (/validate-phase-gate/.test(partialLine))
        ok("lead: partial route gate-verifies claimed-complete phases");
      else
        fail(
          "lead: partial route gate-verifies",
          "`partial` row does not mention validate-phase-gate — resumes would trust unvalidated docs",
        );
      if (/LOCKED/.test(partialLine) && /REPAIR/.test(partialLine))
        ok("lead: partial route carries the disposition vocabulary");
      else
        fail(
          "lead: partial disposition vocabulary",
          "`partial` row lost the LOCKED/REPAIR disposition summary",
        );
    }
  }

  // -- 3. improve-mode carries the Improve ≠ Redesign contract ---------------
  const improve = read("agents/sdlc-improve-mode.md");
  if (!improve) {
    fail("improve-mode exists", "agents/sdlc-improve-mode.md missing");
  } else {
    if (/##\s*Improve\s*[≠!=]+\s*Redesign/i.test(improve))
      ok("improve-mode: Improve ≠ Redesign contract present");
    else
      fail(
        "improve-mode: Improve ≠ Redesign contract",
        "sdlc-improve-mode.md has no 'Improve ≠ Redesign' section — weak models will slide into fresh design",
      );
    if (/BASELINE, not a draft to replace/i.test(improve))
      ok("improve-mode: baseline rule present");
    else
      fail(
        "improve-mode: baseline rule",
        "the 'existing system is the BASELINE' rule is missing",
      );
    if (/[Rr]egenerating an existing doc is forbidden/.test(improve))
      ok("improve-mode: doc-regeneration guard present");
    else
      fail(
        "improve-mode: doc-regeneration guard",
        "the 'regenerating an existing doc is forbidden unless…' rule is missing",
      );
  }
}
