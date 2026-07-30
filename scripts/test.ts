#!/usr/bin/env node
/**
 * test.ts — comprehensive validation for attest. Pass 1-3 are
 * inline (tools/skills/agents); every later pass is a chapter module in its
 * own scripts/test-*.ts file (see CODE_BOOK_PROTOCOL.md) imported above and
 * invoked below, each with its own rationale in its own header.
 *
 * Run:  node --experimental-strip-types scripts/test.ts
 */

import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { testGateReceipts } from "./test-gate-receipts.ts";
import { testTicketLifecycle } from "./test-ticket-lifecycle.ts";
import { testBoardGenerator } from "./test-board-generator.ts";
import { testBash32Compat } from "./test-bash32-compat.ts";
import { testDeriveLanes } from "./test-derive-lanes.ts";
import { testAutonomyLedger } from "./test-autonomy-ledger.ts";
import { testEvalsHarness } from "./test-evals-harness.ts";
import { testSkillAgentRefs } from "./test-skill-agent-refs.ts";
import { testTicketsGraph } from "./test-tickets-graph.ts";
import { testChallengerGate } from "./test-challenger-gate.ts";
import { testTruthfulCompletion } from "./test-truthful-completion.ts";
import { testOuterLoopReceipts } from "./test-outer-loop-receipts.ts";
import { testWiringLedger } from "./test-wiring-ledger.ts";
import { testChallengerGateCorrelation } from "./test-challenger-gate-correlation.ts";
import { testAwkWordBoundary } from "./test-awk-word-boundary.ts";
import { testLoadBearingDenominators } from "./test-load-bearing-denominators.ts";
import { testDocRenderHealth } from "./test-doc-render-health.ts";
import { testAdrExternalRationale } from "./test-adr-external-rationale.ts";
import { testCloseReceipt } from "./test-close-receipt.ts";
import { testRefuseNextWork } from "./test-refuse-next-work.ts";
import { testBootstrapChecklist } from "./test-bootstrap-checklist.ts";
import { testBootstrapChecklistRegressions } from "./test-bootstrap-checklist-regressions.ts";
import { testReflowLaneClaim } from "./test-reflow-lane-claim.ts";
import { testWatchdogBudget } from "./test-watchdog-budget.ts";
import { testSkillsParity } from "./test-skills-parity.ts";
import { testTicketHygiene } from "./test-ticket-hygiene.ts";
import { testFixVerify } from "./test-fix-verify.ts";
import { testReflowAudit } from "./test-reflow-audit.ts";
import { testRunPlanBudgets } from "./test-run-plan-budgets.ts";
import { testModelTierLint } from "./test-model-tier-lint.ts";
import { testSessionModelReceipt } from "./test-session-model-receipt.ts";
import { testVendorProvenance } from "./test-vendor-provenance.ts";
import { testSyncModelLimits } from "./test-sync-model-limits.ts";
import { testTuiSessionHygiene } from "./test-tui-session-hygiene.ts";
import { testHandoffIntake } from "./test-handoff-intake.ts";
import { testCheckTools } from "./test-check-tools.ts";
import { testApiSurface } from "./test-api-surface.ts";
import { testVerifyReceipt } from "./test-verify-receipt.ts";
import {
  testDelegationGate,
  testDelegationMetrics,
  testInvariants,
  testFindingGrounding,
} from "./test-delegation-gate.ts";
import { testResumeAnchor } from "./test-resume-anchor.ts";
import { testVerifyHandoff } from "./test-verify-handoff.ts";
import { testSetupDevServer } from "./test-setup-dev-server.ts";
import { testMermaidBashDivergence } from "./test-mermaid-bash-divergence.ts";
import { testRequirementClosure } from "./test-requirement-closure.ts";
import { testModelRoleRouting } from "./test-model-role-routing.ts";
import { testStatusReport } from "./test-status-report.ts";
import { testTrackerIntegrity } from "./test-tracker-integrity.ts";
import { testPullmdMigration } from "./test-pullmd-migration.ts";
import { testJiraAdapter } from "./test-jira-adapter.ts";
import { testMemoryWriteback } from "./test-memory-writeback.ts";
import { testFigmaAdapter } from "./test-figma-adapter.ts";
import { testQaVnvStructure } from "./test-qa-vnv-structure.ts";
import { testAgentReachability } from "./test-agent-reachability.ts";
import { testToolPreflight } from "./test-tool-preflight.ts";
import { testSdlcModeClarity } from "./test-sdlc-mode-clarity.ts";
import {
  testHandoffDone,
  testFileToolUpsert,
  testGateLevelsDocumented,
} from "./test-handoff-done.ts";
import { testVerifyVerdicts } from "./test-verify-verdicts.ts";
import {
  testGateOutputContract,
  testPluginExportContract,
} from "./test-gate-output-contract.ts";
import { testLocalOnlyGit } from "./test-local-only-git.ts";
import {
  testRetryBudgets,
  testClaimVsEvidence,
} from "./test-retry-and-claims.ts";

const root = path.resolve(import.meta.dirname, "..");
let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  ✓ ${label}`);
  passed++;
}
function fail(label: string, reason: string) {
  console.error(`  ✗ ${label} — ${reason}`);
  failed++;
}

// ---------------------------------------------------------------------------
// Pass 1: Tools — runtime import + shape validation
// ---------------------------------------------------------------------------
console.log("\n[Pass 1] Tools — runtime shape validation");

const toolsDir = path.join(root, "tools");
const toolFiles = fs
  .readdirSync(toolsDir)
  .filter((f) => f.endsWith(".ts") && f !== "CUSTOM_TOOLS_GUIDE.md");

for (const file of toolFiles) {
  const filePath = path.join(toolsDir, file);
  try {
    const mod = await import(pathToFileURL(filePath).href);
    const t = mod.default;

    if (!t || typeof t !== "object") {
      fail(`tools/${file}`, "default export is not an object");
      continue;
    }
    if (typeof t.description !== "string" || t.description.trim() === "") {
      fail(`tools/${file}`, "missing or empty description");
      continue;
    }
    if (typeof t.execute !== "function") {
      fail(`tools/${file}`, "execute is not a function");
      continue;
    }
    if (t.args === undefined || t.args === null) {
      fail(`tools/${file}`, "args is missing (should be a zod schema object)");
      continue;
    }
    ok(`tools/${file} — desc="${t.description.slice(0, 50)}..."`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`tools/${file}`, `import failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Pass 2: Skills — frontmatter + cross-reference validation
// ---------------------------------------------------------------------------
console.log("\n[Pass 2] Skills — frontmatter + cross-reference validation");

const skillsDir = path.join(root, "skills");
const agentsDir = path.join(root, "agents");

// Build set of known agent names (filename without .md)
const knownAgents = new Set(
  fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, "")),
);

/**
 * Minimal YAML frontmatter parser.
 * Returns { fields, body } where fields are the key: value pairs
 * between the first two --- lines.
 */
function parseFrontmatter(content: string): {
  fields: Record<string, string>;
  body: string;
} {
  const lines = content.split("\n");
  if (lines[0].trim() !== "---") return { fields: {}, body: content };

  const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (closeIdx === -1) return { fields: {}, body: content };

  const yamlLines = lines.slice(1, closeIdx);
  const body = lines.slice(closeIdx + 1).join("\n");

  const fields: Record<string, string> = {};
  for (const line of yamlLines) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (m) {
      // strip surrounding quotes if present
      fields[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return { fields, body };
}

/**
 * Extract agent names referenced in backtick strings inside the content.
 *
 * T22.5: this used to filter on `knownAgents.has(m[1])` INSIDE extraction,
 * which made the downstream "missing agent" check inert by construction —
 * nothing extracted could ever be missing, since only already-known names
 * were ever pushed into the result. A skill referencing a typo'd or deleted
 * agent name silently passed.
 *
 * The fix narrows the pattern instead of removing the filter: only treat a
 * backtick string as a claimed agent reference when it's immediately
 * followed by the word "agent" (`the `X` agent`, `routes to `X` agent`) —
 * this repo's dominant, deliberate convention for naming an agent in prose
 * (verified against every skill file: 31 real matches, all this shape).
 * Without that anchor, any backtick'd lowercase-hyphenated technical term
 * (`phase-0`, `write_scope`, `playwright-mcp`, ...) would false-positive as
 * a "missing agent" the moment extraction stops pre-filtering.
 */
function extractAgentRefs(content: string): string[] {
  const refs: string[] = [];
  const pattern = /`([a-z][\w-]+)`\s+agent\b/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    refs.push(m[1]);
  }
  return [...new Set(refs)];
}

const skillDirs = fs
  .readdirSync(skillsDir)
  .filter((d) => fs.statSync(path.join(skillsDir, d)).isDirectory());

for (const skillName of skillDirs) {
  const skillFile = path.join(skillsDir, skillName, "SKILL.md");
  const label = `skills/${skillName}/SKILL.md`;

  if (!fs.existsSync(skillFile)) {
    fail(label, "SKILL.md missing");
    continue;
  }

  const content = fs.readFileSync(skillFile, "utf8");
  const { fields, body } = parseFrontmatter(content);

  // Required frontmatter fields
  if (!fields.name || fields.name.trim() === "") {
    fail(label, "frontmatter missing 'name' field");
    continue;
  }
  if (!fields.description || fields.description.trim() === "") {
    fail(label, "frontmatter missing 'description' field");
    continue;
  }

  // Minimum body length
  if (body.trim().length < 50) {
    fail(label, "skill body is too short (< 50 chars)");
    continue;
  }

  // Cross-reference: agent names in backticks must exist
  const agentRefs = extractAgentRefs(content);
  const missing = agentRefs.filter((a) => !knownAgents.has(a));
  if (missing.length > 0) {
    fail(label, `references non-existent agent(s): ${missing.join(", ")}`);
    continue;
  }

  const refNote = agentRefs.length ? ` (refs: ${agentRefs.join(", ")})` : "";
  ok(`${label} — name=${fields.name}${refNote}`);
}

// ---------------------------------------------------------------------------
// Pass 2b: Skill→agent negative test (T22.5) — extracted to
// test-skill-agent-refs.ts to keep this barrel file under the size cap.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 2b] Skill agent refs — RED/GREEN for the missing-agent check",
);
await testSkillAgentRefs(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 3: Agents — content length + key structural sections
// ---------------------------------------------------------------------------
console.log("\n[Pass 3] Agents — content + structural sections");

const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));

for (const file of agentFiles) {
  const content = fs.readFileSync(path.join(agentsDir, file), "utf8");
  const label = `agents/${file}`;

  if (content.trim().length < 200) {
    fail(label, `too short (${content.length} bytes)`);
    continue;
  }

  // Every agent should describe what it does in the first 1500 chars
  // (some agents have long frontmatter that pushes the body past 500 chars)
  const intro = content.slice(0, 1500).toLowerCase();
  if (
    !intro.includes("you are") &&
    !intro.includes("expert") &&
    !intro.includes("agent")
  ) {
    fail(label, "intro does not establish agent role/identity");
    continue;
  }

  ok(`${label} (${content.length} bytes)`);
}

// ---------------------------------------------------------------------------
// Pass 4: Tickets — module-contract graph logic (T1/T9). Extracted to
// test-tickets-graph.ts to keep this barrel file under the size cap.
// ---------------------------------------------------------------------------
console.log("\n[Pass 4] Tickets — module-contract graph logic");
await testTicketsGraph(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 4b: Ticket lifecycle (T26.1) — claim/start/comment/close/accept/release
// red/green fixtures. Extracted to test-ticket-lifecycle.ts to keep this
// barrel file under the size cap.
// ---------------------------------------------------------------------------
console.log("\n[Pass 4b] Ticket lifecycle — claim/start/close/accept/release");
await testTicketLifecycle(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 4c: Board generator (T10.2) — lane-column board + claim-right-now
// header, snapshot-checked against the sample plan.
// ---------------------------------------------------------------------------
console.log("\n[Pass 4c] Board generator — lane-column board");
await testBoardGenerator(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 4d: Lane derivation (T10.4) — deriveLane() unit cases + the real
// ai-daytrader fixture (37 modules) end-to-end through validatePlan() and
// gen-tickets-board.mjs.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 4d] Lane derivation — deriveLane() + ai-daytrader fixture",
);
await testDeriveLanes(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 5: Gate receipts (T27.1) — red/green fixtures. Extracted to
// test-gate-receipts.ts to keep this barrel file under the size cap.
// ---------------------------------------------------------------------------
console.log("\n[Pass 5] Gate receipts — red/green fixtures");
await testGateReceipts(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 6: bash 3.2 compat (T27.7) — validators must run clean on stock macOS
// /bin/bash, not just whatever $BASH resolves to on the dev machine.
// ---------------------------------------------------------------------------
console.log("\n[Pass 6] bash 3.2 compat — stock /bin/bash fixtures");
await testBash32Compat(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 7: Evals harness (T22.5) — run-evals.mjs deterministic mode +
// chained-validator red/green fixture coverage.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 7] Evals harness — run-evals.mjs + validator fixture coverage",
);
await testEvalsHarness(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 8: Autonomy ledger (T27.5) — APPROVALS.md well-formed + NEVER-AUTO
// rows must be human-signed, cross-referenced against AUTONOMY_PROTOCOL.md.
// ---------------------------------------------------------------------------
console.log("\n[Pass 8] Autonomy ledger — NEVER-AUTO signing tripwire");
await testAutonomyLedger(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 9: Challenger gate (T27.3) — HIGH/CRITICAL findings require a
// matching CHALLENGE_REPORT with zero unresolved CONTRADICTED verdicts.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 9] Challenger gate — CHALLENGE_REPORT existence + CONTRADICTED tripwire",
);
await testChallengerGate(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 10: Truthful completion (T27.2) — manifest v2 stat checks +
// maker/verifier identity, validate-tickets.sh un-orphaned into phase-4,
// run-handoff-gates.sh's new Tracker gate end-to-end.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 10] Truthful completion — manifest v2 + tickets wiring + tracker gate",
);
await testTruthfulCompletion(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 11: Outer-loop receipts (T27.4) — run-until-done.sh's is_complete()
// checks validate-state-drift.sh, not just the promise token.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 11] Outer-loop receipts — state-drift gate + is_complete() red/green",
);
await testOuterLoopReceipts(root, ok, fail);

// ---------------------------------------------------------------------------
// Pass 12: Wiring ledger (T22.7) — every validator + shared protocol is
// reachable via a deterministic chain, npm test, or a documented prose-trigger.
// ---------------------------------------------------------------------------
console.log(
  "\n[Pass 12] Wiring ledger — orphan validator/shared-protocol detection",
);
await testWiringLedger(root, ok, fail);

// Pass 13: Challenger gate correlation (T22.20) — a source report must match
// its OWN clean challenge report via "**Artifact:**", not an unrelated one.
console.log(
  "\n[Pass 13] Challenger gate correlation — per-source Artifact matching",
);
await testChallengerGateCorrelation(root, ok, fail);

// Pass 14: awk word-boundary (T22.19) — \b is a no-op on stock macOS awk;
// direct repro + fixed-validator regression on real /bin/bash + system awk.
console.log(
  "\n[Pass 14] awk word-boundary — \\b-in-awk repro + fixed-validator regression",
);
await testAwkWordBoundary(root, ok, fail);

// Pass 15: Load-bearing denominators (T22.6) — design-system/tests-mapping/
// wcag-coverage/inventory validators each used to check a sample/capped
// ground truth instead of the full set.
console.log(
  "\n[Pass 15] Load-bearing denominators — design-system/tests-mapping/wcag-coverage/inventory completeness",
);
await testLoadBearingDenominators(root, ok, fail);

// Pass 16: Publish render-health (T29.9) — mermaid backtick hard-fail (M013)
// + markdown-table orphan-fragment linter (validate-doc-render-health.sh).
console.log(
  "\n[Pass 16] Publish render-health — mermaid backtick (M013) + table orphan-fragment linter",
);
await testDocRenderHealth(root, ok, fail);

// Pass 17: ADR + external-rationale routing (T29.5) — hard-choice gate + Challenger correlation.
console.log("\n[Pass 17] ADR + external-rationale routing");
await testAdrExternalRationale(root, ok, fail);

// Pass 18: Close-before-next-claim (T26.3) — accept() refuses a HANDOFF that
// completed without a pasted close receipt (planted acceptance test).
console.log("\n[Pass 18] Close-before-next-claim — close-receipt gate");
await testCloseReceipt(root, ok, fail);

// Pass 19: Refuse-to-select-next-work (T26.3) — claim() refuses on red
// hygiene (CLI + direct import), openTicketFor()/`open-for` WIP query.
console.log("\n[Pass 19] Refuse-to-select-next-work — claim hygiene gate");
await testRefuseNextWork(root, ok, fail);

// Pass 20/21: Bootstrap & Empty-State checklist + regressions (T29.4).
console.log("\n[Pass 20] Bootstrap & Empty-State");
await testBootstrapChecklist(root, ok, fail);
console.log("\n[Pass 21] Bootstrap & Empty-State regressions");
await testBootstrapChecklistRegressions(root, ok, fail);

// Pass 22: run-until-done.sh task budget + watchdog (T31.5) — per-session
// --max-session-seconds / --heartbeat-seconds kill+checkpoint on a hung or
// over-budget session, loop continues rather than hanging overnight.
console.log(
  "\n[Pass 22] Watchdog + task budget — stall/budget kill, no false positives",
);
await testWatchdogBudget(root, ok, fail);

// Pass 23: Reflow lane claim (T10.3) — claimableByLane() + status CLI + stranger test.
console.log(
  "\n[Pass 23] Reflow lane claim — claimableByLane() + status CLI + stranger test",
);
await testReflowLaneClaim(root, ok, fail);

// Pass 24: Skills parity (T22.12) — build-target-claude.mjs's skillsParity()
// diffs skill IDENTITY (name/trigger, not directory) across attest
// and attest-claude skills/, cited exceptions for one-sided skills, red
// fixture proves a one-sided skill fails the check.
console.log(
  "\n[Pass 24] Skills parity — cross-repo skills/ identity diff, red/green fixtures",
);
await testSkillsParity(root, ok, fail);

// Pass 25: Ticket lifecycle hygiene (T26.2) — incomplete-evidence/wip/stale-claim/tracker-drift/scope.
console.log("\n[Pass 25] Ticket lifecycle hygiene");
await testTicketHygiene(root, ok, fail);

// Pass 26: Fix-verify iteration classes (R4) — REGRESSED detection, per-row counters, iteration classification.
console.log("\n[Pass 26] Fix-verify iteration classes");
await testFixVerify(root, ok, fail);

// Pass 27: /reflow audit reconciliation (T26.4) — grades every non-blocked
// module VERIFIED/UNVERIFIED/ORPHAN-CODE against real git history; the
// incident-recovery tool, not a phase-gate validator.
console.log("\n[Pass 27] Reflow audit — code↔ticket reconciliation grading");
await testReflowAudit(root, ok, fail);

// Pass 28: run-plan.mjs tier-aware retry budgets (O2 runtime fold, T31.7) —
// stall-2-then-escalate, PROGRESSED extension, tier-aware ceiling (6/12).
console.log("\n[Pass 28] Run-plan tier-aware retry budgets");
await testRunPlanBudgets(root, ok, fail);

// Pass 29: Model-tier registry + config-pin lint (T30.1, M30 model-tier
// guard) — tier resolution for every glob pattern in models.json's tiers
// registry, plus validate-model-pins.sh red/warn/green fixtures.
console.log(
  "\n[Pass 29] Model-tier registry — tier resolution + config-pin lint",
);
await testModelTierLint(root, ok, fail);

// Pass 30: Session-model receipt (T30.2, M30 model-tier guard, G1) —
// plugins/expert-hooks.ts resolves + receipts the model/tier actually
// running at session start, mirroring scripts/lib/model-tiers.mjs.
console.log("\n[Pass 30] Session-model receipt — G1 resolved model + tier");
await testSessionModelReceipt(root, ok, fail);

// Pass 31: Vendor provenance (T29.8, R-30, field lesson B-2) — vendored
// library code must be generated from the real upstream, not memory;
// dropped/renamed variants and undeclared vendoring are flagged.
console.log(
  "\n[Pass 31] Vendor provenance — library-shaped reimplementation (R-30)",
);
await testVendorProvenance(root, ok, fail);

// Pass 32: Context-limit sync (T30.8, LOCAL_CONTEXT_INTEGRITY_DESIGN P2) --
// scripts/lib/model-limits-sync.mjs's planSync() reconciles opencode's
// believed provider limit.* to LM Studio's actually-loaded context; floor
// rule REFUSEs sub-floor loads instead of writing an unconvergeable limit.
console.log("\n[Pass 32] Context-limit sync — planSync() against fixtures");
await testSyncModelLimits(root, ok, fail);

// Pass 33: TUI session-hygiene protocol (T30.10, LOCAL_CONTEXT_INTEGRITY_DESIGN
// P3) -- thin-orchestrator + mandatory fresh-context dispatch + scan-output-to-
// disk + 70% checkpoint-and-resume; validate-handoff-discipline.sh's new
// scan-inline-dispatch check red/green; EXECUTOR_SELECTION.md's TUI mode note.
console.log(
  "\n[Pass 33] TUI session-hygiene — scan-inline-dispatch red/green + protocol text",
);
await testTuiSessionHygiene(root, ok, fail);

// HANDOFF intake contract -- a pointer-delivered handoff must EXECUTE, not be
// handed back. Verified failure on gpt-5-mini (2026-07): coordinator produced
// zero files and asked the user to run the skill it was already running.
console.log(
  "\n[Pass 33b] HANDOFF intake — pointer-delivered handoffs execute (red/green + propagation)",
);
await testHandoffIntake(root, ok, fail);

// check-tools.sh bare-Linux install path (2026-07 field report). Static
// invariants only — CI cannot reproduce the bug (ubuntu-latest has a writable
// npm prefix + unzip). Behavioural proof: test-check-tools-container.sh.
console.log(
  "\n[Pass 33c] check-tools.sh — bare-Linux install path (never-sudo, real errors, OS-correct hints)",
);
await testCheckTools(root, ok, fail);

// Autocompaction orientation: the runtime re-injects position from disk every
// request, so a compacted turn is no worse off than an uncompacted one.
console.log(
  "\n[Pass 33d] resume-anchor — surviving autocompaction (disk-derived orientation)",
);
await testResumeAnchor(root, ok, fail);

// Remote dev-server provisioner: non-destructive config merge + never-sudo.
console.log(
  "\n[Pass 33e] setup-dev-server.sh — provision/refresh a remote LLM dev box",
);
await testSetupDevServer(root, ok, fail);

// Mechanical verify-loop evidence: small models cannot self-report verify
// compliance, so the harness runs the commands, keeps tails, compares the
// baseline, and writes the report itself.
console.log(
  "\n[Pass 33f] verify-handoff.sh — mechanical verify evidence harness",
);
await testVerifyHandoff(root, ok, fail);

// Pass 34: macOS-vs-Linux bash regex-engine divergence audit (T32.4) --
// validate-mermaid.sh's remaining [^...]-style bracket idioms: M001 was
// genuinely bash-version divergent (dead on bash 3.2, working on bash
// 5.x) and is now fixed; M004 was found dead identically on both engines
// (a related but distinct bug) and is also fixed; M005/M007/M010 audited
// and confirmed not to diverge.
console.log(
  "\n[Pass 34] Mermaid bash regex-engine divergence — M001/M004 bracket-idiom audit",
);
await testMermaidBashDivergence(root, ok, fail);

// Pass 35: Requirement-story layer + requirement-closure gate (T29.2, H1/A-6.3)
// -- extractStoryIds() heading parsing, storyCoverageWarnings()/
// requirementClosure() (tickets-graph.mjs), and parseReconciliationMatrix()/
// reconciliationGaps() (reconciliation-matrix.mjs): task closure (every
// module done) is independent of requirement closure (every story actually
// mapped and delivered) -- the ticket's own acceptance criterion.
console.log(
  "\n[Pass 35] Requirement-story layer — story coverage + requirement-closure gate",
);
await testRequirementClosure(root, ok, fail);

// Pass 36: models.json role→model routing (T28.2, M28 Conductor) --
// resolveRole()/checkMakerVerifierDistinct() (scripts/lib/model-tiers.mjs)
// and conductor.mjs's own G4 startup gate: a planted same-model
// coder/reviewer (or coder/challenger) config refuses the run by default
// (--role-gate block) and only warns-and-continues under --role-gate warn;
// the run log's conductor.start entry always carries the resolved per-role
// model map.
console.log(
  "\n[Pass 36] Model-role routing — maker/verifier distinctness + conductor G4 gate",
);
await testModelRoleRouting(root, ok, fail);

// Pass 37: Generated-project STATUS.md derivation + freshness (T29.3, H7/C-1)
// -- computeStatusReport()/renderStatusMarkdown()/checkStatusFreshness()
// (status-report.mjs): status derives % from BOTH the task layer and the
// T29.2 requirement (story) layer, never paints a phase green with an open
// story (tasks=100%/stories=50% renders half-done, the ticket's own
// acceptance fixture), and flags an artifact stale when its embedded
// numbers mismatch a live recompute or predate the plan's last work event.
console.log(
  "\n[Pass 37] Status report — built-vs-done split + freshness check",
);
await testStatusReport(root, ok, fail);

// Pass 38: Tracker Data Model + integrity validator (T29.6, M29 field
// lesson H5/A-6, external trackers) -- parseTrackerSpec()/
// validateTrackerSnapshot() (tracker-model.mjs) and sweepLinks()
// (tracker-link-sweep.mjs): a project generating its backlog into an
// external tracker (Jira/Linear/GitHub Projects/...) must record
// docs/TRACKER_DATA_MODEL.md BEFORE any docs/work/tracker-snapshot.json
// exists; once a snapshot exists, every non-stray item needs its required
// label, every story needs a structural phase link, and no untagged
// template/sample item silently pollutes scope math. Straggler links are
// idempotent, not a one-time retrofit.
console.log(
  "\n[Pass 38] Tracker Data Model — spec-before-backlog gate + snapshot integrity + idempotent link sweep",
);
await testTrackerIntegrity(root, ok, fail);

// Pass 39: migrate-remove-pullmd.sh (v2.2.1) — the upgrade migration must strip a stale
// mcp.pullmd entry while preserving everything else, back it up, and no-op cleanly otherwise.
console.log(
  "\n[Pass 39] pullmd removal migration — strips stale MCP entry, preserves the rest, no-op when absent",
);
await testPullmdMigration(root, ok, fail);

await testJiraAdapter(root, ok, fail);

testMemoryWriteback(root, ok, fail);

testQaVnvStructure(root, ok, fail);

testAgentReachability(root, ok, fail);

testToolPreflight(root, ok, fail);

testSdlcModeClarity(root, ok, fail);

await testFigmaAdapter(root, ok, fail);

// api-surface --check: red/green fixtures for both gate rules. The stub-dependency
// pair also pins the false positive that made the naive version wrong (a CSS-only
// package used via @import must not be reported as dead).
console.log("\n[Pass 44] api-surface — library API grounding gate");
await testApiSurface(root, ok, fail);

// verify-receipt: the agent must not author its own pass/fail.
console.log("\n[Pass 46] verify-receipt — untrusted verification receipts");
testVerifyReceipt(root, ok, fail);

// delegation-gate: three checks a passing test suite cannot make.
console.log(
  "\n[Pass 47] delegation-gate — coverage delta, pattern novelty, reviewer citations",
);
testDelegationGate(root, ok, fail);
testDelegationMetrics(root, ok, fail);
testInvariants(root, ok, fail);
testFindingGrounding(root, ok, fail);

// Unwinnable gates: a RED an agent cannot clear turns finished work into a
// permanent stall. Both halves of the 2026-07 a new-project trace are pinned here.
console.log(
  "\n[Pass 48] Unwinnable gates — handoff-done.sh RED conditions + file-tool upsert",
);
await testHandoffDone(root, ok, fail);
await testFileToolUpsert(root, ok, fail);
testGateLevelsDocumented(root, ok, fail);

// Wrong-verdict channels: the harness exists so a verdict cannot be narrated
// away, so a verdict that is itself wrong is the deepest defect class here.
console.log(
  "\n[Pass 49] Wrong-verdict channels — matched-nothing, failure attribution, unchecked baseline",
);
await testVerifyVerdicts(root, ok, fail);

// Local-only git: a repo with no forge is a supported setup, and a gate row that
// cannot be satisfied there must never read as a blocker or as an unearned pass.
console.log(
  "\n[Pass 50] Local-only git — forge-optional bootstrap + impossible gate rows",
);
testLocalOnlyGit(root, ok, fail);

// Retry budgets + claim-vs-evidence: a tooling mistake must not consume a
// code-fix attempt, and cited evidence must not say the opposite of the claim.
console.log(
  "\n[Pass 51] Retry budgets + claim-vs-evidence — four counters, and evidence that outranks prose",
);
testRetryBudgets(root, ok, fail);
testClaimVsEvidence(root, ok, fail);

// The gate-output contract: a harness state and the doc that reads it move together.
console.log(
  "\n[Pass 52] Gate-output contract — every emitted verdict state is documented",
);
testGateOutputContract(root, ok, fail);
testPluginExportContract(root, ok, fail);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
