/**
 * test-wiring-ledger.ts — Pass 12 chapter module for scripts/test.ts (T22.7).
 *
 * check-wiring-ledger.mjs's job: every validator and shared protocol must be
 * reachable (deterministic chain, npm test, or a documented prose-trigger),
 * not just shipped. Two things exercised here:
 *   1. The live repo itself is clean (0 orphan validators, 0 orphan shared
 *      protocols) -- this is the actual T22.7 deliverable: confirms all 8
 *      validators that were unchained from validate-phase-gate.sh/
 *      run-handoff-gates.sh (validate-autonomy-wiring, validate-book-structure,
 *      validate-doc-catalog, validate-doc-counts, validate-handoff-discipline,
 *      validate-loop-readiness, validate-no-reinvent, validate-persistence-block)
 *      carry a real prose-trigger (mostly agents/git-expert.md's merge-gate
 *      conditions), and that HANDOFF_QUICK_REF.md / LOCAL_LLM_PRIMER.md (the
 *      "steward decision on dead includes" the ticket names) are correctly
 *      resolved reachable via MODEL_ADAPTER.md's two-hop model-tier routing
 *      table, not actually dead.
 *   2. RED (planted, per the ticket's acceptance criterion): a fixture repo
 *      with one wired validator/protocol and one genuinely unreferenced one
 *      of each -- the orphan of each must be flagged, the wired one must not.
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
        `wiring-ledger — live repo: ${live.validatorsChecked} validators, 0 orphans (all chained, npm-test-referenced, or prose-triggered)`,
      );
    else
      fail(
        "wiring-ledger — live repo validators",
        `orphans: ${live.orphanValidators.join(", ")}`,
      );

    if (live.clean && live.orphanShared.length === 0)
      ok(
        `wiring-ledger — live repo: ${live.sharedChecked} shared protocols, 0 orphans (HANDOFF_QUICK_REF/LOCAL_LLM_PRIMER resolve via MODEL_ADAPTER.md's two-hop chain)`,
      );
    else
      fail(
        "wiring-ledger — live repo shared protocols",
        `orphans: ${live.orphanShared.join(", ")}`,
      );

    // -- 2. RED (planted): a fixture orphan validator/protocol must fail ----
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("wiring-ledger", `unexpected failure: ${message}`);
  }
}
