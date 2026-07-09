/**
 * test-wiring-ledger.ts — Pass 12 chapter module for scripts/test.ts (T22.7).
 *
 * check-wiring-ledger.mjs's job: every validator and shared protocol must be
 * reachable (deterministic chain, npm test, or a documented positive
 * prose-trigger), not just shipped. Exercised here:
 *   1. The live repo itself is clean (0 orphan validators, 0 orphan shared
 *      protocols, 1 documented exception) -- confirms all 8 validators that
 *      were unchained from validate-phase-gate.sh/run-handoff-gates.sh carry
 *      a real prose-trigger (mostly agents/git-expert.md's merge-gate
 *      conditions), that HANDOFF_QUICK_REF.md resolves via MODEL_ADAPTER.md's
 *      two-hop model-tier routing table, and that LOCAL_LLM_PRIMER.md is a
 *      documented exception (deliberately human-pasted, never agent-loaded
 *      by design -- not an accidental pass).
 *   2. RED (planted, per the ticket's acceptance criterion): a fixture repo
 *      with one wired validator/protocol and one genuinely unreferenced one
 *      of each -- the orphan of each must be flagged, the wired one must not.
 *   3. REGRESSION (independent review, 2026-07-08, two findings):
 *      (a) the corpus scan used to be non-recursive (only agents/*.md +
 *      agents/shared/*.md), silently missing ~35 real files in
 *      agents/security/, agents/code-review/, agents/game/,
 *      agents/performance/, agents/sdlc/, agents/test/, agents/templates/ --
 *      a validator/protocol referenced only from a nested specialist agent
 *      was incorrectly flagged orphan. (b) a bare substring/word-boundary
 *      match has no directionality -- MODEL_ADAPTER.md's
 *      "LOCAL_LLM_PRIMER | Not needed. Skip it." line matched the same
 *      regex as a real "read this" instruction, papering over a false
 *      reachability claim with an accidental pass.
 */

import * as fs from "fs";
import * as path from "path";
import { runWiringLedger } from "./check-wiring-ledger.mjs";

export async function testWiringLedger(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  try {
    // -- 1. the live repo is clean -------------------------------------------
    const live = runWiringLedger(root);
    if (live.clean && live.orphanValidators.length === 0)
      ok(
        `wiring-ledger — live repo: ${live.validatorsChecked} validators, 0 orphans (all chained, npm-test-referenced, or positively prose-triggered)`,
      );
    else
      fail(
        "wiring-ledger — live repo validators",
        `orphans: ${live.orphanValidators.join(", ")}`,
      );

    if (
      live.clean &&
      live.orphanShared.length === 0 &&
      live.knownExceptions.includes("LOCAL_LLM_PRIMER")
    )
      ok(
        `wiring-ledger — live repo: ${live.sharedChecked} shared protocols (incl. agents/shared/blocks + includes), 0 orphans, 1 documented exception (LOCAL_LLM_PRIMER — human-pasted by design, never agent-loaded)`,
      );
    else
      fail(
        "wiring-ledger — live repo shared protocols",
        `orphans: ${live.orphanShared.join(", ")}, exceptions: ${live.knownExceptions.join(", ")}`,
      );

    // -- 2. RED (planted): a fixture orphan validator/protocol must fail ----
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-wiring-ledger-"),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, "scripts/validators"), { recursive: true });
      fs.mkdirSync(path.join(dir, "agents/shared"), { recursive: true });

      fs.writeFileSync(
        path.join(dir, "scripts/validators/validate-phase-gate.sh"),
        '# fake gate\nGATE_VALIDATORS=("validate-wired.sh")\n',
      );
      fs.writeFileSync(
        path.join(dir, "scripts/validators/run-handoff-gates.sh"),
        "# no mentions here\n",
      );
      fs.writeFileSync(
        path.join(dir, "scripts/validators/validate-wired.sh"),
        "#!/usr/bin/env bash\n",
      );
      fs.writeFileSync(
        path.join(dir, "scripts/validators/validate-orphan.sh"),
        "#!/usr/bin/env bash\n",
      );
      fs.writeFileSync(path.join(dir, "scripts/test.ts"), "");
      fs.writeFileSync(
        path.join(dir, "agents/root-agent.md"),
        "Run `bash scripts/validators/validate-phase-gate.sh` before merging.\n" +
          "Load agents/shared/WIRED_PROTOCOL.md for details.\n",
      );
      fs.writeFileSync(
        path.join(dir, "agents/shared/WIRED_PROTOCOL.md"),
        "wired protocol content\n",
      );
      fs.writeFileSync(
        path.join(dir, "agents/shared/ORPHAN_PROTOCOL.md"),
        "orphan protocol, never referenced anywhere\n",
      );

      const redResult = runWiringLedger(dir);
      const flagsOrphanValidator =
        redResult.orphanValidators.includes("validate-orphan.sh");
      const doesNotFlagWiredValidator =
        !redResult.orphanValidators.includes("validate-wired.sh") &&
        !redResult.orphanValidators.includes("validate-phase-gate.sh");
      const flagsOrphanShared =
        redResult.orphanShared.includes("ORPHAN_PROTOCOL.md");
      const doesNotFlagWiredShared =
        !redResult.orphanShared.includes("WIRED_PROTOCOL.md");

      if (
        !redResult.clean &&
        flagsOrphanValidator &&
        doesNotFlagWiredValidator &&
        flagsOrphanShared &&
        doesNotFlagWiredShared
      )
        ok(
          "wiring-ledger — RED: a genuinely unreferenced validator and shared protocol are both flagged; wired ones are not",
        );
      else
        fail(
          "wiring-ledger — red fixture",
          `result=${JSON.stringify(redResult)}`,
        );

      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 3a. REGRESSION: nested specialist directories must be scanned ------
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-wiring-nested-"),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, "scripts/validators"), { recursive: true });
      fs.mkdirSync(path.join(dir, "agents/security"), { recursive: true });
      fs.mkdirSync(path.join(dir, "agents/shared"), { recursive: true });

      fs.writeFileSync(
        path.join(dir, "scripts/validators/validate-phase-gate.sh"),
        "# empty gate\n",
      );
      fs.writeFileSync(
        path.join(dir, "scripts/validators/run-handoff-gates.sh"),
        "",
      );
      fs.writeFileSync(
        path.join(dir, "scripts/validators/validate-nested-only.sh"),
        "#!/usr/bin/env bash\n",
      );
      fs.writeFileSync(path.join(dir, "scripts/test.ts"), "");
      // only mentioned from a NESTED specialist agent, not a top-level one
      fs.writeFileSync(
        path.join(dir, "agents/security/secrets-scanner.md"),
        "Run `bash scripts/validators/validate-nested-only.sh` before reporting findings — exit 0 required.\n" +
          "Also load `agents/shared/NESTED_ONLY_PROTOCOL.md` for the finding schema.\n",
      );
      fs.writeFileSync(
        path.join(dir, "agents/shared/NESTED_ONLY_PROTOCOL.md"),
        "nested-only protocol content\n",
      );

      const nestedResult = runWiringLedger(dir);
      if (
        !nestedResult.orphanValidators.includes("validate-nested-only.sh") &&
        !nestedResult.orphanShared.includes("NESTED_ONLY_PROTOCOL.md")
      )
        ok(
          "wiring-ledger — REGRESSION: a validator/protocol referenced only from a nested specialist agent (agents/security/*.md) is correctly recognized, not flagged orphan",
        );
      else
        fail(
          "wiring-ledger — nested directory regression",
          `result=${JSON.stringify(nestedResult)}`,
        );

      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- 3b. REGRESSION: a negative ("skip it") mention must not count ------
    {
      const dir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-wiring-negative-"),
      );
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, "scripts/validators"), { recursive: true });
      fs.mkdirSync(path.join(dir, "agents/shared"), { recursive: true });

      fs.writeFileSync(
        path.join(dir, "scripts/validators/validate-phase-gate.sh"),
        "# empty gate\n",
      );
      fs.writeFileSync(
        path.join(dir, "scripts/validators/run-handoff-gates.sh"),
        "",
      );
      fs.writeFileSync(path.join(dir, "scripts/test.ts"), "");
      // NEGATIVE_ONLY_PROTOCOL is mentioned, but only via a "skip it" line —
      // the only real mention anywhere in the corpus. Must NOT count as reachable.
      fs.writeFileSync(
        path.join(dir, "agents/root-agent.md"),
        "| NEGATIVE_ONLY_PROTOCOL | Not needed. Skip it. |\n",
      );
      fs.writeFileSync(
        path.join(dir, "agents/shared/NEGATIVE_ONLY_PROTOCOL.md"),
        "content nobody positively references\n",
      );

      const negResult = runWiringLedger(dir);
      if (negResult.orphanShared.includes("NEGATIVE_ONLY_PROTOCOL.md"))
        ok(
          "wiring-ledger — REGRESSION: a 'Not needed. Skip it.' mention does not count as a positive reachability reference",
        );
      else
        fail(
          "wiring-ledger — negative-mention regression",
          `result=${JSON.stringify(negResult)}`,
        );

      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("wiring-ledger", `unexpected failure: ${message}`);
  }
}
