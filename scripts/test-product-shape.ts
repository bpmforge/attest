/**
 * test-product-shape.ts — chapter module for scripts/test.ts.
 *
 * Guards the P6 architecture doctrine ported from Dokima (2026-08-31):
 * canonical orchestration role names + the two-stack rule, the feature-map
 * planning artifact, and feature-grouped landing — including the lessons its
 * Challenger pass paid for (durable parks at the root board, a park is not a
 * landing, blocked is not closed, tests that fabricate state can miss a mode
 * that never fires in production). If a future edit drops a role name, guts
 * the landing rules, or unwires the protocol from the agents that must load
 * it, this fails instead of quietly shipping doctrine that no longer reaches
 * any session.
 *
 * Three independent things must stay true:
 *   1. PRODUCT_SHAPE_PROTOCOL.md carries its load-bearing content (five role
 *      names, two-stack rule, feature-map rules, one-merge-per-feature +
 *      park/blocked semantics, the Challenger lessons).
 *   2. The protocol is WIRED — positively referenced from the Phase-4
 *      orchestration corpus (PARALLEL_WAVE_PROTOCOL.md, sdlc-init-phase-4.md)
 *      and from planning (task-decomposer.md), so check-wiring-ledger's
 *      reachability holds through real instructions, not an allowlist.
 *   3. The planning contract demands the artifact — task-decomposer's
 *      Pre-Completion Gate requires docs/work/PRODUCT_MAP.md for modular
 *      plans (features, connects_to edges, gaps both directions, F-unmapped).
 */

import * as fs from "fs";
import * as path from "path";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

export function testProductShape(root: string, ok: OK, fail: FAIL) {
  console.log(
    "\n[Pass 55] Product shape — roles/two-stack, feature map, feature-grouped landing",
  );

  const read = (rel: string): string | null => {
    const p = path.join(root, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };

  // -- 1. Protocol file has its load-bearing content -----------------------
  const proto = read("agents/shared/PRODUCT_SHAPE_PROTOCOL.md");
  if (!proto) {
    fail(
      "product-shape protocol exists",
      "agents/shared/PRODUCT_SHAPE_PROTOCOL.md is missing",
    );
  } else {
    const required: Array<[string, RegExp]> = [
      // roles — all five canonical names, and the authority split
      ["role: GOAL", /\*\*GOAL\*\*/],
      ["role: ORCHESTRATOR", /\*\*ORCHESTRATOR\*\*/],
      ["role: BOTS", /\*\*BOTS\*\*/],
      ["role: REVIEW PANEL", /\*\*REVIEW PANEL\*\*/],
      ["role: HONESTY LOOPS", /\*\*HONESTY LOOPS\*\*/],
      [
        "GOAL exits on evidence, not an empty board",
        /drained board proves nothing/i,
      ],
      [
        "orchestrator decides sequence, never doneness",
        /sequence.*never.*doneness/is,
      ],
      ["two-stack rule present", /two-stack rule/i],
      [
        "capability lands in the product first",
        /lands\s+in the product first/i,
      ],
      // feature map
      ["features derived from cited stories", /US-.*FR-/s],
      [
        "same extractor as the ledger (one regex, one truth)",
        /one regex, one truth/i,
      ],
      ["seams become directed connects_to edges", /connects_to/],
      ["a connection is not an identity", /connection is not an identity/i],
      ["gaps reported in both directions", /BOTH directions/],
      ["F-unmapped is explicit and loud", /F-unmapped/],
      [
        "unmapped work reported, never dropped",
        /reported, never\s+(?:silently\s+)?dropped/i,
      ],
      // landing
      ["a done ticket parks instead of merging", /PARKS its branch/i],
      ["a feature lands as exactly one merge", /EXACTLY ONE merge/i],
      [
        "blocked is not closed / holds the feature",
        /blocked.*(is not|not).*closed/is,
      ],
      ["a feature never lands in pieces", /never lands in pieces/i],
      [
        "no hand-resolved conflicts on the synthetic branch",
        /no conflict is ever\s+hand-resolved/i,
      ],
      // Challenger lessons
      ["parks are durable at the root board", /durable.*root board/is],
      ["a park is not a landing", /park is not a landing/i],
      ["restart must not re-claim parked work", /NOT claimable/i],
      ["test through the real state-writer", /real state-writer/i],
      ["intra-feature depends_on deadlock named", /depends_on.*deadlock/is],
      ["honest fallback to per-ticket when tooling can't", /per-ticket/],
    ];
    for (const [label, rx] of required) {
      if (rx.test(proto)) ok(`protocol: ${label}`);
      else
        fail(
          `protocol: ${label}`,
          `PRODUCT_SHAPE_PROTOCOL.md is missing: ${label}`,
        );
    }
  }

  // -- 2. The protocol is WIRED into the corpus that loads it --------------
  const wiring: Array<[string, RegExp, string]> = [
    [
      "agents/sdlc/PARALLEL_WAVE_PROTOCOL.md",
      /PRODUCT_SHAPE_PROTOCOL\.md/,
      "the wave protocol never tells a session the canonical roles or the landing unit",
    ],
    [
      "agents/sdlc-init-phase-4.md",
      /PRODUCT_SHAPE_PROTOCOL\.md/,
      "Phase 4 would keep merging one PR per ticket with no pointer to the feature-landing discipline",
    ],
    [
      "agents/task-decomposer.md",
      /PRODUCT_SHAPE_PROTOCOL\.md/,
      "decomposition would emit a flat ticket list with no feature map",
    ],
  ];
  for (const [rel, rx, why] of wiring) {
    const text = read(rel);
    if (!text) fail(`wiring: ${rel} exists`, `${rel} is missing`);
    else if (rx.test(text))
      ok(`wiring: ${rel} references PRODUCT_SHAPE_PROTOCOL.md`);
    else fail(`wiring: ${rel} references PRODUCT_SHAPE_PROTOCOL.md`, why);
  }

  // -- 3. Planning contract demands the artifact ---------------------------
  const decomposer = read("agents/task-decomposer.md");
  if (decomposer) {
    if (/PRODUCT_MAP\.md/.test(decomposer)) {
      ok(
        "planning: task-decomposer emits docs/work/PRODUCT_MAP.md for modular plans",
      );
    } else {
      fail(
        "planning: task-decomposer emits PRODUCT_MAP.md",
        "task-decomposer.md never names the feature-map artifact",
      );
    }
    const gate = decomposer.match(/## Pre-Completion Gate[\s\S]*$/);
    if (gate && /PRODUCT_MAP\.md/.test(gate[0])) {
      ok(
        "planning: Pre-Completion Gate has a feature-map row (honor-system avoided)",
      );
    } else {
      fail(
        "planning: Pre-Completion Gate feature-map row",
        "the feature map is described but not gated — it would ship on the honor system",
      );
    }
  }
}
