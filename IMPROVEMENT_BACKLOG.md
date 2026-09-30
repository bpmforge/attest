# attest — Improvement Backlog

Generated: 2026-05-19
Source: Expert system audit + gap analysis
Updated: 2026-07-08 — added **Group H** (9 open findings) from a live Mode-1 engagement field report
(`issues/field-report-mode1-sdlc-run-2026-07.md`). Groups A–G (original audit) remain all-closed.
Updated: 2026-07-27 — added **Group J** (7 findings) from the library-grounding build session;
J-items 1-3 shipped in v2.34.0-v2.36.0, 4-7 open.
Updated: 2026-07-27 — added **Group I** (5 proposals) from the a downstream project delegation field report
(held privately, not in this repo): 118 delegations, 24% correction rate,
0 escapes to `main`, all caught by a human lead re-verifying by hand under schedule pressure.

---

## Group A — Agent Content Quality

### A1. Add Cost Optimization Agent ✅ DONE 2026-06-11 (v1.12.0)
- `agents/cost-engineer.md` + `skills/cost` + `references/cloud-cost-checklist.md`; wired into guide routing + improve-mode on-demand roster.
- Create `agents/cost-engineer.md` (~400 lines)
- Create `skills/cost/SKILL.md`
- Create `references/cloud-cost-checklist.md`
- Scope: AWS/GCP/Azure spend analysis, right-sizing, reserved capacity
- Wire into sdlc-lead mode routing: `"optimize costs" → cost-engineer`
- Add to Mode 4 (improve) specialist roster
- **Why:** Cloud costs invisible in current system; teams lose 20-40% on compute

### A2. Deepen frontend-design Agent ✅ DONE 2026-06-11 (v1.12.0)
- Mode 3 extended: architecture choice via references/design-system-tradeoffs.md decision matrix (ADR-recorded), Design-System Governance (naming contract, breaking-change policy, ownership, migration paths), Component Library Patterns (composition>configuration, cva variants, story-per-component, index-only exports), Token Generation & Sync (one-direction rule).
- File: `agents/frontend-design.md` (expand from 372 → ~600 lines)
- Add: "Design-System Governance" section (token naming, breaking-change policy, migration paths)
- Add: "Component Library Patterns" section (Storybook, CSF format, composition rules)
- Add: "Token Generation" section (Figma plugins, Tokens Studio, automated sync)
- Add: Decision matrix — Tailwind vs Storybook vs custom component library
- **Why:** Teams reinvent design-system architecture per project

### A3. Wire researcher to fact persistence ✅ DONE 2026-06-11 (v1.12.0)
- Fact Bank integration in researcher.md: fact_store per claim (verified MCP signature), source-type credibility ladder (0.9 docs → 0.4 forum), staleAfterDays for perishables, fact_query-before-search, contradiction handling (store both + surface, never silently pick).
- File: `agents/researcher.md`
- Add: "Fact Bank Integration" — source type tags (official_docs / engineering_blog / academic / news / forum), confidence decay
- Add: "Source Evaluation Rules" — per-domain credibility (RFC > blog > HN > Reddit)
- Add: "Contradiction Handling" — detect conflicting findings, escalate to user
- Wire `mcp__memory__fact_store` into researcher workflow
- **Why:** Research findings lost between sessions; each query starts fresh

### A4. Normalize Orchestrator Phase Names ✅ CLOSED 2026-06-11 — superseded
- v1.0 micro-agent rearchitecture normalized specialists to the uniform phase1.md→phaseN.md disk-checkpoint pattern; security-auditor differs because it is now a wave coordinator (by design).
- Files: `agents/test-engineer.md`, `agents/security-auditor.md`, `agents/performance-engineer.md`, `agents/sre-engineer.md`
- Target: Phase 1 (understand) → Phase 2 (research/scan) → Phase 3 (analyze/design) → Phase 4 (execute/document) → Phase 5 (verify) → Phase 6 (report)
- Currently inconsistent: understand→research→plan vs. understand→automated-scan→owasp
- **Why:** Users can't predict what a specialist does

### A5. Standardize Confidence Scoring ✅ CLOSED 2026-06-11 — superseded
- FINDING_SCHEMA.md + FINDINGS_SCHEMA.md standardize tool-anchored confidence across all finding-producing specialists; GATE_SCORING_PROTOCOL.md carries the 1-10 scale for gate decisions.
- Create `references/confidence-scale.md` with unified 1-10 scale
- 1-3: speculative | 4-6: verified, needs more | 7-8: high confidence | 9-10: automated verification
- Update all agents that report findings
- **Why:** Findings incomparable across specialists; can't prioritize backlog

---

## Group B — Missing Specialist Agents

### B1. Add Accessibility & Compliance Agent ✅ DONE 2026-06-11 (v1.12.0)
- `agents/a11y-compliance.md` + `skills/a11y` + `references/wcag-audit-checklist.md` (incl. WCAG 2.2 new criteria) + `validate-wcag-coverage.sh` (wired into UI-bearing phase-4 gate; tested 3 directions).
- Create `agents/a11y-compliance.md` (~600 lines)
- Create `skills/a11y/SKILL.md`
- Create `references/wcag-audit-checklist.md`
- Create `scripts/validators/validate-wcag-coverage.sh`
- Scope: WCAG 2.1 AA/AAA, ATAG 2.0, EN 301 549 (EU mandate), axe/wave/lighthouse tooling
- Wire into Mode 4 roster; call after UX design, before frontend-design
- **Why:** WCAG non-compliance is legal liability; no systematic approach currently

### B2. Add Data Governance Agent ✅ DONE 2026-06-11 (v1.12.0)
- `agents/data-steward.md` + `skills/data-governance` + `references/data-classification-checklist.md` + `validate-data-governance.sh` (wired into phase-3 gate; tested 5 cases incl. likely-PII-without-governance-doc and indefinite-retention).
- Create `agents/data-steward.md` (~600 lines)
- Create `skills/data-governance/SKILL.md`
- Create `references/data-classification-checklist.md`
- Create `scripts/validators/validate-data-governance.sh`
- Scope: PII classification, GDPR/CCPA/PIPEDA, data-retention, encryption, access-control mapping
- Wire into Mode 1 Phase 3 + Phase 4; Mode 4 roster
- **Why:** PII/GDPR handling entirely absent from current system

### B3. Add Load Testing & Reliability Agent ✅ DONE 2026-06-11 (v1.12.0)
- `agents/reliability-engineer.md` + `skills/reliability` + `references/load-test-checklist.md` + `validate-resilience-patterns.sh` (wired into phase-3 gate; tested 4 cases incl. retry-without-budget).
- Create `agents/reliability-engineer.md` (~500 lines)
- Create `skills/reliability/SKILL.md`
- Create `references/load-test-checklist.md`
- Create `scripts/validators/validate-resilience-patterns.sh`
- Scope: load testing strategy, chaos engineering, circuit breaker, bulkhead, retry, degradation scenarios
- Distinct from performance-engineer (optimization); this is "what breaks under stress?"
- Wire into Mode 1 Phase 3 (design NFR mapping); Mode 4 roster
- **Why:** perf-engineer focuses on optimization not degradation

### B4. Add Analytics & Instrumentation Agent ✅ DONE 2026-06-11 (v1.12.0)
- `agents/analytics-architect.md` + `skills/analytics` + `references/observability-checklist.md`; output contract keyed to validate-observability.sh checks.
- Create `agents/analytics-architect.md` (~450 lines)
- Create `skills/analytics/SKILL.md`
- Create `references/observability-checklist.md`
- Scope: telemetry design, RED/USE/four golden signals, observability spec, dashboard patterns
- Distinct from sre-engineer (deployment); this is "what do we measure?"
- Wire into Mode 1 Phase 3; call after SRE phase
- **Why:** Telemetry design ad-hoc; teams can't correlate signals

---

## Group C — Missing Validators

### C1. Add Reverse Test Coverage Validator ✅ DONE 2026-06-11 (v1.11.0)
- Already mostly covered by `validate-tests-mapping.sh` (forward P0/P1 coverage + orphan-test warning + results verdicts); added the missing phantom-UC check (tests referencing UC-IDs absent from USE_CASES.md = hard gap). Wired into phase-4 gate.
- Create `scripts/validators/validate-tests-reverse-coverage.sh`
- Logic: enumerate test files → extract UC-NNN from describe/suite names → cross-check USE_CASES.md
- Fail if: test exists for non-existent UC, or test has no UC context
- Report: orphaned tests (no UC), orphaned UCs (no test)
- Wire into Phase 4 and Phase 5 gates

### C2. Add API Contract ↔ Implementation Validator ✅ DONE 2026-06-11 (v1.11.0)
- `validate-api-consistency.sh`: openapi.yaml paths×methods vs grep-detected routes (Express/Fastify/Flask/FastAPI/Go/NestJS), param normalization ({id}==:id==<id>), spec-only + code-only gaps, dynamic-route warnings. Schema conformance deferred to contract tests by design. Wired into phase-4 + phase-5 gates.
- Create `scripts/validators/validate-api-consistency.sh`
- Logic: parse OpenAPI.yaml → compare to actual routes → check response schema match
- Report: spec-only endpoints (not implemented), code-only routes (undocumented), schema mismatches
- Wire into Phase 4 (after implementation) and Phase 5 (release gate)
- **Why:** OpenAPI drifts from code; users follow a spec that's wrong

### C3. Add Module Boundary Transitivity Validator ✅ DONE 2026-06-11 (v1.10.0)
- `validate-module-boundaries-transitive.sh`: hard gaps for undeclared/contradictory table rows; transitive-cone WARN report for architect/challenger confirmation (plain layering is not an error). Wired into phase-3 gate.
- Create `scripts/validators/validate-module-boundaries-transitive.sh`
- Logic: build dependency graph from MODULE_DESIGN.md → compute transitive closure → flag violations
- Current validator only catches direct violations, not A→B→C(forbidden)

### C4. Add Circular Dependency Detector at Phase 3 ✅ DONE 2026-06-11 (v1.10.0)
- `validate-circular-deps.sh`: DFS cycle detection on the MODULE_DESIGN.md allowed-import table. Wired into phase-3 gate; tested against planted cycle.
- Create `scripts/validators/validate-circular-deps.sh`
- Wire into Phase 3 gate so cycles are caught at design, not implementation
- Simple graph cycle detection on MODULE_DESIGN.md dependency rules

### C5. Add Observability Spec Validator ✅ DONE 2026-06-11 (v1.10.0)
- `validate-observability.sh`: logging/metrics-methodology/tracing/alerting-conditions/dashboards content checks on OBSERVABILITY.md or INFRASTRUCTURE.md. Wired into phase-3 gate.
- Create `scripts/validators/validate-observability.sh`
- Required sections: logging strategy, metrics (RED/USE), distributed tracing, alerting, dashboards
- Wire into Phase 3 gate

---

## Group D — Architecture & Structure

### D1. Normalize HANDOFF Format ✅ CLOSED 2026-06-11 — done by HANDOFF_TEMPLATES.md
- `agents/shared/HANDOFF_TEMPLATES.md` is the canonical single-source template set; mode files reference it.
- Create `agents/shared/HANDOFF_FORMAT.md` as canonical template
- Target:
  ```
  HANDOFF → [agent-name]
  CONTEXT: [required reads]
  YOUR TASK: [bounded work]
  PRODUCE: [files]
  Completion phrase: "[agent] done — [summary]"
  ```
- Update all mode files (init/onboard/feature/improve) to follow template

### D2. Add Phase-File Recovery Mechanism ✅ DONE 2026-06-11 (v1.10.0)
- `scripts/recover-phase-state.sh <agent> <slug>` (+ `--list`): commits phase files to git, prints a resume packet. BOUNDED_TASK_CONTRACT Rule 8 documents recovery.
- Create `scripts/recover-phase-state.sh <agent> <slug>`
- Auto-commit phase files to git after each phase completes (before returning to orchestrator)
- Update `agents/shared/BOUNDED_TASK_CONTRACT.md` with recovery section

### D3. Add Lite Mode for Local LLMs ✅ CLOSED 2026-06-11 — done by different means
- 24 compact agent variants (dist/compact-agents, install --compact) + tier detection + CONTEXT_BUDGET cover the 32k case.
- security-auditor (2K lines) and sdlc-init-mode (2.2K lines) exceed 32-64K token limits
- Add `--lite` flag to: test-engineer, security-auditor, performance-engineer, code-reviewer
- Lite mode: Phase 1→3→6 only (skip research and detailed report phases), ~40% context reduction

### D4. Add Agent Failure Recovery Protocol ✅ DONE 2026-06-11 (v1.10.0)
- BOUNDED_TASK_CONTRACT Rule 8: 3-failures-escalate cap (matches Ralph Wiggum + run-plan G5), phase files committed even on failure, [PARTIAL] completion phrase, RESUME packet semantics.
- Update `agents/shared/BOUNDED_TASK_CONTRACT.md`
- Define: 3 failures → escalate to user (no auto-retry)
- Define: intermediate phase files committed to git even on failure
- Define: user can resume manually or swap agent

---

## Group E — Documentation & Guidance

### E1. Create Multi-Cloud SRE Patterns Guide ✅ DONE 2026-06-11 (v1.10.0)
- `references/sre-cloud-patterns.md`: AWS/GCP/Azure/on-prem equivalence table + cloud-invariant patterns + on-prem divergences.
- Create `references/sre-cloud-patterns.md` (~300 lines)
- Current SRE agent is AWS-centric; add GCP/Azure/on-prem equivalents
- Per cloud: CI/CD, secrets management, logging centralization, monitoring, alerting, runbook structure

### E2. Add Design-System Architecture Decision Guide ✅ DONE 2026-06-11 (v1.10.0)
- `references/design-system-tradeoffs.md`: 3 architectures, decision matrix, invariant rules.
- Create `references/design-system-tradeoffs.md` (~150 lines)
- Decision matrix: team size, time budget, customization needs
- Compare Tailwind vs Storybook+Figma vs custom component library with trade-offs

### E3. Add Research Tool Usage Guide ✅ CLOSED 2026-06-11 — done by RESEARCH_TOOLS.md
- `agents/shared/RESEARCH_TOOLS.md` covers tier selection and per-tool usage.
- Create `references/research-tool-guide.md` (~150 lines)
- Flowchart for tier selection: web_search_pullmd → web_research_pullmd → web_research
- Performance/cost expectations per tier; example workflows per question type

### E4. Add Phase Completion Checklists ✅ DONE 2026-06-11 (v1.10.0)
- `references/phase-completion-checklist.md`: per-phase automated gate + human-judgment items.
- Create `references/phase-completion-checklist.md` (~200 lines)
- Per phase: 5-10 narrative human-judgment items + validator items
- Helps teams know when to advance to the next phase

---

## Group F — Validator Hygiene

### F1. Standardize Validator Exit Codes ✅ DONE 2026-06-11 (v1.10.0)
- `_lib.sh` standardizes 0/1/2 + JSON envelope (42/45 adopted); the 2 standalone validators (mermaid, book-structure) use the same exit semantics + JSON and now emit telemetry rows.
- Audit all 40+ validators in `scripts/validators/`
- Enforce: 0=pass, 1=failures found (fix required), 2=escalate (manual review needed)
- Update `_lib.sh` with documented exit code semantics

### F2. Enforce JSON Output from All Validators ✅ DONE 2026-06-11 (v1.10.0)
- All validators emit a JSON envelope (via _lib.sh or natively).
- Audit all validators for consistent JSON envelope
- Enforce: `{passed: bool, findings: [...], summary: string, exit_code: int}`

### F3. Add Validator Performance Guide ✅ DONE 2026-06-11 (v1.10.0)
- `references/validator-performance.md`: runtime classes, rerun-safety, scoping guidance; telemetry-report for observed numbers.
- Create `references/validator-performance.md`
- Per validator: runtime estimate, I/O cost, safe to rerun repeatedly

---

## Group G — Quick Wins

### G1. Wire validate-user-stories.sh into Phase 2 Gate [TINY] ✅ DONE
- File: `scripts/validators/validate-phase-gate.sh`
- Already wired at line 68 — no fix needed (verified 2026-05-19)

### G2. Document 3-Iteration Ralph Wiggum Cap [TINY] ✅ DONE
- File: `agents/shared/RALPH_WIGGUM_LOOP.md`
- Added "Hard cap: 3 iterations" section with escalation block, WHY explanation, agent behavior at cap (2026-05-19)

### G3. Add --dry-run Flag to All Validators ✅ CLOSED 2026-06-11 — obsolete
- Validators are read-only reporters (only side effect is an optional telemetry row, EXPERTS_TELEMETRY=0 to disable); there is nothing to dry-run.
- Report findings without writing files
- ~5-10 lines per validator

### G4. Create Agent Quick-Reference Cards [SMALL] ✅ DONE
- Created `docs/AGENT_REFERENCE.md` (2026-05-19)
- Covers all 19 agents: What/When to use/Modes/Output, organized by role group
- Users shouldn't need to read 2K-line files to know what an agent does

---

## Group H — Field-Report Findings (live Mode-1 run, 2026-07) — OPEN

> **Source:** `issues/field-report-mode1-sdlc-run-2026-07.md` — a multi-week Mode-1 SDLC engagement on a
> regulated full-stack platform where an external dev team joined mid-flight and stress-tested the
> system's decisions and artifacts. Unlike Groups A–G (original audit, all closed), these are OPEN and
> come from **observed real failures/near-misses**. Each maps to a field-report finding (A-1…C-3).
> Theme: the system's *verification* is excellent; the gaps are in **breadth of what's proactively
> checked** and in **self-enforcing the process it already prescribes.**

### H1. Two-layer completion invariant + code↔requirement reconciliation gate [MEDIUM] — HIGH — (field-report A-1, A-6.3)
- **Problem:** the orchestrator closed the build-task layer as waves shipped, but the requirement-story
  layer was never transitioned — status rolled up "implementation complete" while ~half the requirements
  were unbuilt. Discovered only by a mid-flight code↔story audit.
- **Files to touch:**
  - `scripts/validators/validate-phase-gate.sh` (+ any phase-4/5 gate script): a phase may not report
    complete while requirement-stories tied to it are open. Compare *requirement* closure, not task closure.
  - `agents/sdlc-lead.md` + `agents/sdlc-init-phase-5.md`: add a mandatory **code↔requirement
    reconciliation** HANDOFF (test-engineer or code-reviewer) at Phase 4→5 that greps the codebase
    against the requirement list and emits DONE / PARTIAL / OUTSTANDING per requirement.
  - Status-artifact generation (see H7): derive "% done" from the requirement layer only.
- **Acceptance:** phase-gate fails if a phase's requirement-stories are open; a reconciliation matrix
  artifact (per-requirement verdict) is a required Phase-5 input.
- **Why:** "wave done" silently masked "requirements unbuilt" — the single most consequential tracking
  failure of the engagement.

### H2. Bulk scope-cut = enumerate + per-item confirm, not a label sweep [SMALL] — HIGH — (field-report A-2)
- **Problem:** a broad verbal deferral ("defer all the X-related work") was applied as a bulk relabel;
  a genuinely MVP-critical, only-incidentally-related item got deferred and was later found to be a
  launch blocker.
- **Files to touch:** `agents/sdlc-lead.md` (decision-handling) + `agents/sdlc-improve-mode.md`. Add a
  rule: a scope/deferral instruction affecting >1 item MUST enumerate the affected items and get
  per-item (or per-cluster) confirmation, explicitly flagging any that look MVP-load-bearing, before
  relabeling. Reuse the discovery "present the list, confirm the classification" pattern.
- **Acceptance:** a bulk scope change produces a written affected-items list with a load-bearing flag
  column, confirmed before any label mutation.
- **Why:** the orchestrator optimized for executing the instruction over pressure-testing it.

### H3. Clean-tree precondition + post-merge scope-attribution check [SMALL] — MEDIUM — (field-report A-3)
- **Problem:** uncommitted feature-branch changes in the working tree were carried into a *different*
  (docs) PR when the orchestrator branched while the prior unit's work was still uncommitted — reviewed
  code reached `main` inside a docs PR, outside its own gate-merge.
- **Files to touch:** `agents/sdlc-lead.md` + `agents/shared/` git-discipline protocol. (1) Before
  `git checkout -b` for a new work unit, assert `git status` is clean (or only the new unit's files);
  a dirty tree from a prior unit must be committed/stashed to its own branch first. (2) After any PR
  merge, `git show --stat` — flag if a PR touched files outside its declared scope (docs PR that
  changed `src/`).
- **Acceptance:** starting a work unit on a dirty tree is blocked/flagged; a scope-mismatched merge is
  flagged.
- **Why:** the system's own "one unit = one branch = one PR" rule wasn't self-enforced at context-switch.

### H4. ADR for load-bearing tech choices + verify asserted rationale [MEDIUM] — HIGH — (field-report A-5)
- **Problem:** the two most-challenged choices (primary datastore; "vendor the component library")
  rested on thin/incorrect recorded rationale — a stakeholder's deployment convenience, a prior-employer
  habit, and (for the library) a supply-chain reason that **cited the wrong library**. Presented in
  design docs as settled; only pressure-tested when an external reviewer arrived.
- **Files to touch:**
  - `agents/architecture-designer.md` (or the Phase-3 design agent) + `agents/sdlc-init-phase-3.md`:
    require a short **ADR** for any load-bearing/hard-to-reverse choice (datastore, auth model, core
    framework, vendoring strategy) — alternatives considered, actual deciding factors, and an explicit
    tag when a factor is "stakeholder/deployment preference" or "prior-art habit" rather than an
    engineering constraint.
  - Wire the existing **Challenger/veracity** capability (`skills/challenge`, `agents/` challenger) to
    run over **architecture-decision rationales**, not just findings — verify claims like "X for
    supply-chain reasons" or "compliance forces engine Y" against the actual advisory/requirement
    (researcher/security-auditor HANDOFF) before they enter a design doc.
  - `references/` add an ADR template + "soft-reason" tagging guidance.
- **Acceptance:** load-bearing choices have an ADR with alternatives + tagged soft-reasons; asserted
  external rationales are Challenger-verified before doc entry.
- **Why:** unexamined/incorrect rationale went into frozen design docs and drove weeks of build.

### H5. Tracker Data Model design step + tracker-integrity validator + continuous phase→story linking [MEDIUM-LARGE] — HIGH — (field-report A-6, IN-DEPTH)
- **Problem (5 sub-parts):** phases were modeled as tracking-*stories* under one umbrella epic with **no
  parent/child link** to their work (A-6.1) → **no native "% of phase done" rollups**, retrofitted by
  scripting 150+ links mid-project (A-6.2); task-layer vs requirement-layer completion diverged (A-6.3,
  = H1); **labels were the only source of truth for scope but unenforced**, so unlabeled stories were
  invisible to scope math and undercounted MVP (A-6.4); template/scaffolding strays polluted counts and
  presented a confusing second epic (A-6.5). Root cause: the tracker is treated as a place to *emit*
  work items, not a **data model to design**.
- **Files to touch:**
  - `agents/sdlc-lead.md` + `agents/sdlc-init-phases-0-2.md`/`sdlc-init-phase-3.md`: add a **"Tracker
    Data Model" design step** at the Phase 2→3 boundary (when the backlog is generated). It records, as
    a short spec: the layer map (what = epic/story/task here + why); the **phase→work linkage
    mechanism** (structural — parent/child link or epic-per-phase — strongly preferred over label-only,
    so rollups are native and completion can't silently diverge); the **single source of truth for scope
    + completion** (if labels, they are mandatory on every item); and stray handling.
  - **Backlog generator** (whatever emits the tracker items): apply required scope labels to *every*
    item; do not leave sample/template items in the project (or tag them out of scope math from the
    start); link each story to its phase on creation.
  - New **`scripts/validators/validate-tracker-integrity.sh`** (runnable any session + at each phase
    gate): every work item has required scope labels; every requirement-story is linked to its phase; no
    orphan/stray items counted in scope math; epic/story/task layering matches the recorded model.
  - Continuous, **idempotent phase→story linking** helper (link-on-create + re-runnable sweep for
    stragglers) so structure stays true as the backlog grows.
- **Acceptance:** a Tracker Data Model spec exists before build; the integrity validator passes at every
  phase gate; no unlabeled work items; every requirement structurally linked to its phase; zero strays
  in scope math.
- **Why:** every Mode-1 engagement generates a backlog; without designing the work-item model it drifts
  the same way every time (incoherent rollups, label-invisible scope, diverging completion, mid-project
  archaeology). This is the deepest process finding — see field report A-6 for the full write-up.

### H6. Bootstrap & Empty-State checklist [MEDIUM] — HIGH — (field-report B-1)
- **Problem:** an RBAC model shipped where creating the *first* project required a role only an existing
  role-holder could grant — the app was **unusable on an empty DB** without manual SQL or disabling the
  auth check. Passed design + build + review; a joining dev hit it on first deploy. A sweep then found a
  second empty-state gap (a role-gated field unsettable when no user held that role).
- **Files to touch:**
  - `agents/architecture-designer.md` + `agents/security-auditor.md` + `references/`: add a **"Bootstrap
    & Empty-State" checklist** — How does the *first* privileged user/record come to exist? Can the app
    be used on an empty DB with zero seed? What is gated on state that only that gate can create? What
    does a zero-role/zero-data user *see* (graceful vs dead-end)? Is there a seed, and does it cover the
    bootstrap identity?
  - Make it a **Phase-3 design-gate item** and a **Phase-5 pre-launch check** ("fresh-deploy dry run:
    brand-new environment reaches a usable state with no manual SQL").
  - Add to the security-auditor threat catalog: *bootstrap-authority* + *self-referential permission
    gates* as standard elevation/availability checks.
- **Acceptance:** design gate includes an answered empty-state checklist; a fresh-deploy dry-run is a
  Phase-5 gate; security catalog covers self-referential gates.
- **Why:** designers/reviewers reason about steady state; nobody's job was t=0. Recurring, un-hunted class.

### H7. Status artifacts derive % live + "built vs done" distinction + freshness check [SMALL] — HIGH — (field-report C-1)
- **Problem:** a published status page showed all phases green / "ready for QA" while MVP was ~half
  built; a landing page's status table was stale the *other* way (understated, months old). Both
  misinformed stakeholders. Root: status written once, not re-derived; "phase built" (scaffolding)
  conflated with "phase done" (features complete).
- **Files to touch:** the status/dashboard artifact template + `skills/steward` (or the publish flow).
  Status artifacts must lead with the **requirement-completion metric derived live** from the tracker,
  visually distinguish **"platform/foundation built" vs "features complete,"** never paint a phase
  green while its requirement-stories are open, and carry a **freshness check** (a status artifact older
  than the last work event, or whose numbers don't match a live query, is flagged stale).
- **Acceptance:** status artifact shows live requirement %, a built-vs-done split, and fails a freshness
  check when stale.
- **Why:** stakeholder-facing misinformation in both directions.

### H8. Publish render-health gate + markdown-table + diagram-syntax linters [SMALL] — MEDIUM — (field-report C-2, C-3)
- **Problem:** on the published doc mirror, a diagram silently failed to render (unsafe char in a node
  label) and fell back to raw text; a large table rendered "half table, half raw text" (a blank line
  split one table into an orphan fragment with no header); a long-lived tracker's tables corrupted from
  append-only edits. All shipped unnoticed until a human glanced.
- **Files to touch:**
  - Publish/steward flow (`skills/steward`, publish scripts): **render-health check** after publish —
    every diagram produced an image (not a raw code block); every source table rendered as a real table
    (no orphaned pipe-text). (Built ad-hoc during the engagement; generalize it.)
  - New/extended doc-hygiene validators: **markdown-table orphan-fragment detector** (a data row
    preceded by a blank line with no header/separator) + **diagram-syntax linter** (unsafe chars in node
    labels — e.g. backticks, the exact bug hit here). Consider auto-append helpers for high-churn logs.
- **Acceptance:** publish fails/flags on a raw-mermaid fallback or orphan table; the linters catch the
  two specific bug classes.
- **Why:** "it committed" was treated as "it rendered"; silent artifact breakage.

### H9. [REINFORCE] Make "re-ran tests myself: <counts>" a required gate-score field [SMALL] — HIGH — (field-report D-1)
- **Not a gap — a win to codify.** Verify-don't-trust (independently re-running a returning specialist's
  tests + reading findings against source) caught nearly every serious defect this engagement (an
  imprecise "no route exists" claim; a vendored-library default-value trap; confirmed security invariants
  were genuine controls not happy-paths).
- **Files to touch:** `agents/shared/GATE_SCORING_PROTOCOL.md` + `agents/sdlc-lead.md`: make the gate
  score require an explicit **"re-ran independently: <what, counts, exit codes>"** field; a score
  asserted without it is incomplete. Reinforce "cite file:line, not recollection" (D-4) and "distinguish
  platform-built vs product-done" (D-5) as standing laws.
- **Acceptance:** gate scores without a re-ran-myself evidence field are rejected by the protocol.
- **Why:** codifies the single highest-value discipline so it can't quietly lapse.

---

## Execution Order

| Phase | Weeks | Tasks |
|-------|-------|-------|
| 1 — Quick wins + foundations | 1-2 | G1, G2, G4, A5, F1, F2 |
| 2 — Core validators + architecture | 2-4 | C1-C5, D1, E3 |
| 3 — Agent improvements + docs | 4-6 | A1-A4, E1, E2, E4 |
| 4 — New specialist agents | 6-10 | B1, B2, B3, B4 |
| 5 — Local LLM + recovery | ongoing | D2, D3, D4, F3 |

---

## Summary

- **Original audit backlog (Groups A–G):** 28 tasks — **ALL 28 CLOSED as of 2026-06-11**
  (v1.10.0–v1.12.0; see per-item notes).
- **Group H — Field-Report Findings (live Mode-1 run, 2026-07):** **9 tasks, all OPEN.** Source:
  `issues/field-report-mode1-sdlc-run-2026-07.md`. These come from observed real
  failures/near-misses on a live engagement, not the original audit.
  - **High priority:** H1 (completion invariant), H4 (ADR/rationale verification), H5 (tracker data
    model — in-depth), H6 (bootstrap/empty-state), H7 (live status artifacts), H9 (reinforce
    verify-don't-trust).
  - **Medium/Small:** H2 (scope-cut confirm), H3 (clean-tree/git hygiene), H8 (render-health + doc linters).
  - **Sizing:** Tiny 0 · Small 5 (H2, H3, H7, H8, H9) · Medium 3 (H1, H4, H6) · Medium-Large 1 (H5).
- **Suggested sequencing for Group H:** H9 first (trivial, codifies the win) → H1 + H7 (completion +
  honest status, tightly linked) → H5 (tracker data model — the structural root behind H1) → H6
  (empty-state checklist) → H4 (ADR + rationale verification) → H2, H3, H8 (process/hygiene guards).
- **Theme (Group H):** the system's *verification instincts are excellent* (see field-report §D — nearly
  every serious defect was caught by verify-don't-trust or a specialist review). The gaps are in
  **breadth of what's proactively checked** (empty-state, requirement-vs-task completion, decision
  rationale, tracker integrity, doc/render health) and in **self-enforcing the process the system already
  prescribes** (clean-tree branching, per-item scope confirmation). Closing Group H turns "caught it
  because someone looked" into "caught it because the system always looks."

### (historical) original-audit summary
- **Total tasks:** 28 — **ALL 28 CLOSED as of 2026-06-11** (v1.10.0–v1.12.0; see per-item notes).
- **Tiny:** 2 | **Small:** 11 | **Medium:** 9 | **Medium-Large:** 1 | **Large:** 2 | **Architecture:** 4
- **High priority:** A1, B1, B2, C2
- Groups B, C, E can run in parallel once foundations are done

---

## Group I — Measurement & Dispatch Integrity

From `issues/field-report-local-model-eval-2026-07.md` (local-model evaluation,
2026-07-25/26). Eight faults, every one manufacturing an apparent MODEL
deficiency. These are process changes; a prompt edit would have fixed none of them.

### I1. Harness calibration gate — prove the instrument before trusting the reading ✅ DONE 2026-07-26
- **Rule:** any harness that produces a number about a model MUST first demonstrate,
  on a known-good and a known-bad input, that it can tell them apart. Ship the
  calibration as a `--self-test` and run it before any grading run.
- Precedent that worked: the real-world hidden suite was validated 25/25 against a
  reference implementation *before* any model was graded, so a buggy suite could not
  manufacture a fake model failure.
- Would have caught faults 2, 3, 4, 5, 7 — each of which returned a plausible-looking
  zero on real input and was never checked against a case known to be non-zero.
- **Why:** a detector that matches nothing looks exactly like a model that did nothing.
- Effort: S per harness. Add to `evals/README.md` validity rules.

### I2. Falsifiable claims — every finding carries a concrete failure case ⬅ highest quality lift
- **Rule:** a claimed requirements conflict, ambiguity, or review finding MUST cite
  the specific IDs it relates AND a concrete input where they disagree. No concrete
  case → the claim is dropped, not softened.
- **Why:** confabulated analysis is longer, better formatted and more confident than
  real analysis (§4 of the field report: 23.9 KB with ≥2 invented conflicts vs 9.1 KB
  with 0). Volume currently reads as rigor. An invented conflict cannot produce a
  concrete disagreeing input — that is what makes this checkable rather than advisory.
- Mirrors what security findings already do with preconditions/yields; extends that
  discipline to requirements and code-review output.
- Model-agnostic: raises output quality for every tier, not just local.
- Effort: S (guidance) + S (validator check for an "Open Questions" section).

### I3. Comparative claims require N≥3 or carry an explicit unreplicated label
- **Rule:** `eval-compare.mjs` must refuse to compute lift/gap from N=1 cells, and any
  single-sample result must be rendered as `unreplicated`, never as a rate.
- **Why:** two N=1 conclusions reversed on repeat this engagement; run-to-run variance
  exceeded the between-model difference both times.
- Effort: S.

### I4. Select models on pipeline work, not token throughput
- **Rule:** the model table in `LOCAL_LLM_GUIDE.md` ranks on *measured end-to-end phase
  work*. tok/s may be listed but must be marked non-predictive.
- **Why:** measured anti-correlation — the 9B is ~1.9× faster per token and ~2× slower
  at the actual job. Cost is driven by tool round-trips, retries and output volume.
- Effort: S. Depends on I1/I3 for trustworthy numbers.

### I5. Proof of execution at dispatch ✅ DONE 2026-07-26 (dbf5f5a)
- `tools/task.ts` requires the BOUNDED_TASK_CONTRACT Rule 3 completion phrase before
  treating output as a result; absent → NOT RUN. Subagent fallback detected explicitly.
  Documented in `EXECUTOR_SELECTION.md`.
- **Why:** "ran and found nothing" and "never ran" were the same observable (exit 0 +
  plausible prose), so a dispatch that silently did nothing could satisfy a gate.

### I6. Local-tier runtime rules ✅ DONE 2026-07-26
- `references/local-agentic-models.md` §4: SEARCH BEFORE FETCH (never hand-construct a
  documentation URL), dispatch only `mode:primary`, never point a single-shot session
  at an orchestrator, and the suspect-the-harness checklist.

### I7. Link verification needs three outcomes ✅ DONE 2026-07-26
- live (2xx/3xx) / **blocked** (403/429, unverifiable) / dead (404/410/000). Only dead
  is evidence of fabrication. Collapsing blocked into dead scored three real npm
  packages as invented citations.

### I8. Rule-interaction matrix at Phase 2 ✅ DONE 2026-07-26
- `references/phase-completion-checklist.md` Phase 2: enumerate every PAIR of rules touching
  the same entity/state and state whether one can make the other unreachable. Record pairs
  checked, not just problems found — an unlisted pair is an unchecked pair.
- **Why:** the seeded structural flaw (reservation expiry vs loan duration) was missed by
  BOTH models, which between them produced 17 ambiguity findings. Both analysed rules
  individually — which is exactly what "identify ambiguities" invites. The defect lives in
  the PAIR, so per-rule diligence cannot surface it at any capability level. This is a
  process fix, not a model fix: enumerate the pairs and it becomes unmissable.

---

## Group I — Delegation-loop integrity (a downstream project field report, 2026-07-27)

Source: a private downstream field report (not in this repo). Every item below closes a
failure observed on the record, not a hypothetical. The through-line: the lead's manual
re-verification is the only thing standing between a 24% correction rate and shipped
defects, and schedule pressure falls on exactly that discipline.

### I1. Untrusted verify receipts ✅ DONE 2026-07-27 (v2.39.0)
- `scripts/verify-receipt.mjs` (`--init` / `--ticket=` / `--check`) + coding-agent **Law 2b**. Commands come from a committed `.sdlc/verify.json`; the wrapper writes exit codes + SHA; the agent cites the file and never authors a field in it. Staleness is "no material change since", not exact-SHA — committing the receipt moves HEAD and must not invalidate it. 5 fixtures.

<details><summary>original proposal</summary>

- Project declares verify commands once (`.sdlc/verify.json`); a wrapper runs them and
  writes `docs/work/receipts/<ticket>-<sha>.json` with command, exit code, output tail, SHA.
- Validator asserts receipt SHA == pushed commit and every exit code is 0.
- **Why:** false "tsc/biome clean" claims appear in 4 of the 5 named tickets — the single
  most repeated failure. `validate-completion-manifest.sh` explicitly declines this case
  (receipt-CHECK, not re-run) for sound injection/reproducibility reasons; this closes it
  without executing any prose.
</details>

### I2. Test-coverage delta gate ✅ DONE 2026-07-27 (v2.40.0)
- `delegation-gate.mjs --coverage`. Per-FILE shrinkage, not just the net total — the observed failure added a new test file while deleting cases from an existing one, so the totals matched and a net-only check passed it. `Coverage-removed:` in a commit message clears an intentional removal.
- Count test files + cases at merge-base vs HEAD; net-negative fails absent an explicit
  `Coverage-removed:` justification.
- **Why:** T-164 r1 silently deleted 300+ lines of coverage while claiming coverage
  added. `validate-no-reinvent.sh` sees ≥90% single-file rewrites, not the across-diff case.

### I3. Pattern-novelty gate ✅ DONE 2026-07-27 (v2.40.0)
- `delegation-gate.mjs --patterns`. Directory names introduced with zero precedent in the base tree; advisory, never fatal. Mechanizes the `find -type d -iname __tests__` the lead ran by hand.
- Flag new directory names / file-placement patterns with zero occurrences on base.
- **Why:** T-235 introduced a `__tests__/` layout existing nowhere else; the lead
  caught it with `find -type d -iname __tests__` returning zero hits on `main`.

### I4. Reviewer-citation gate ✅ DONE 2026-07-27 (v2.40.0)
- `delegation-gate.mjs --citations=<file>` + code-reviewer wiring. Fails on a line past EOF, a path absent at the reviewed commit, and a verdict with no `file:line` at all.
- A REJECT verdict must cite `file:line`; resolve each citation at the reviewed SHA and
  fail the verdict when a citation does not exist or contradicts the file there.
- **Why:** T-234's code-reviewer fabricated a REJECT over a wiring omission
  independently confirmed present, verbatim, at every commit. No current analogue in the
  system; more AI review layers cannot fix an AI reviewer being confidently wrong.

### I5. Publish the reliability metric from a mechanical source ✅ DONE 2026-07-27 (v2.41.0)
- `delegation-metrics.mjs` derives it from the log. In-flight rows are excluded from the denominator rather than counted as passes, and a rate over fewer than 10 samples is labelled not-yet-meaningful instead of ranked on.
- Derive DONE/REDO counts from the delegation log, not a hand tally (M22: no coverage
  claim whose denominator came from the claimant).
- **Why:** turns "I don't trust AI-authored code" into a trending number; makes drift
  visible before it is a crisis.

**Order:** I1 alone if only one ships. Then I4 (highest cost per occurrence), then I2/I3
(cheap). I5 is reporting, not a gate.

---

## Group J — Version currency + expert-system defects (build session, 2026-07-27)

Trigger: a downstream project reported agents writing third-party library code from
training data. The instruction already existed (coding-agent Law 2) and was still
insufficient — see `references/library-adoption-protocol.md`. Investigating it surfaced
six further defects in this repo.

**Principle established:** *the registry decides what installs; docs decide how to call it;
the installed tree decides what you compile against. No source answers more than one, and
training data answers none.*

### J1. Version currency is npm-only ✅ DONE 2026-07-27 (v2.37.0)
- `--outdated`: cargo / go / pypi / npm adapters, ecosystem detected from the manifest present. 0.x treated as pre-stable (minor is the breaking position) — without that, 9 breaking-version-behind Rust crates in vulnforge read as current. Offline `--selftest` pins the parsers and the semver rule.
`api-surface.mjs` reads `package.json` / `node_modules`. Kryptkeeper is Go; vulnforge,
KPrust and RetroForge are Rust. For those, nothing in the system checks whether a
dependency is current — the "never rely on training data for versions" rule shipped in
v2.36.0 is unenforceable there.
- Add registry adapters: crates.io (`/api/v1/crates/<n>` → `max_stable_version`),
  PyPI (`/pypi/<n>/json` → `info.version`), Go proxy (`/<mod>/@latest` → `Version`).
- Ecosystem detected from the manifest present; `--outdated` reports declared vs latest
  and flags majors behind.
- **Why:** the principle above is currently true only for TypeScript projects.

### J2. Attribute the correction rate by model and agent role ✅ DONE 2026-07-27 (v2.41.0)
- Same script: `--json` and a printed split by model and by agent. A log with no model column says so explicitly rather than printing an empty split — recording the column is the prerequisite, and the aggregate cannot substitute for it.
The downstream project logs 24% correction rounds across 118 delegations but cannot say
which models produce them. One session showed Haiku 4.5, GPT-5 and Sonnet 5 in use, with
the coding-agent on Haiku 4.5 during a round that had false `tsc` claims — one data point,
not a finding.
- Extend the delegation log with `model` + `agent`; report the rate split by both.
- **Why:** if one tier carries most of the corrections, the fix is a tier change, not more
  gates. Cheapest possible experiment, plausibly the largest throughput win. Extends I5.

### J3. Declared-invariant gate ✅ DONE 2026-07-27 (v2.42.0)
- `scripts/validators/validate-invariants.sh` + coding-agent **Law 3b**. `.sdlc/invariants.json` declares require/forbid patterns per glob with a mandatory `why`. Testing caught a live inversion: records were tab-delimited, bash treats tab as IFS-whitespace, and an empty `require` shifted `forbid` into its slot — reporting forbidden patterns as missing requirements and passing real violations.
A route bypassed the audited-transaction seam every other route uses **and passed its own
tests**. This is the class a human who knows the system catches and tooling currently does
not. ThreatForge already has the shape (`check-standards.sh` errors on a local
`getAuthUser`); generalize it: a project declares `files matching X must import Y`, one
validator enforces.

### J4. Bounded-review packager ✅ DONE 2026-07-27 (v2.42.0)
- `scripts/review-packet.mjs`. Diffstat, new-vs-modified split, novel directory names, the verification receipts covering the range, and three explicit questions. States plainly when no receipts exist rather than implying the range passed.
Given a commit range, emit a curated diff plus the delegation-log slice, sized for a 2-4
hour session. A senior reviewer estimated ~1 month of ramp-up to review the codebase cold,
which is why he is unavailable; a bounded packet is what makes opportunistic review
possible at all.

### J5. Project-mode installs cannot run script-backed skills ✅ DONE 2026-07-27 (v2.38.0)
- `install.sh` copies `scripts/` in project mode too; verified `.opencode/scripts/api-surface.mjs` lands (207 files). The version stamp and MCP setup stay global-only.
`install.sh --project` copies `skills/` and `references/` but never `scripts/` (that block
is gated on `MODE = global`). So `/api-ground`, `/steward` and `/reflow` are broken by
design in project mode. v2.34.0 fixed the *message* that named a non-existent path; the
structural gap remains. Either copy the scripts a skill references, or symlink the repo's.

### J6. `pre-code-check` skill lives outside the canonical repo ✅ DONE 2026-07-27 (v2.38.0)
- Ported to `skills/pre-code/` in both repos, rewritten to delegate library verification to `/api-ground` instead of duplicating it. Orphan removed from `~/.claude/skills/`.
It exists only in `~/.claude/skills/pre-code-check/`, outside this repo and outside
`npm run build:claude` — a dual-repo violation by this program's own rules. It is also the
skill closest in intent to `/api-ground`; decide whether to absorb or port it.

### J7. Twelve perpetual skill content-drift warnings ✅ DONE 2026-07-27 (v2.38.0)
- All 12 synced opencode→claude through the build's own `transform()`, so runtime wording stays correct. `build:claude:check` now reports **0** content-drift warnings — the warning is a signal again.
`build:claude` reports description drift for a11y, analytics, containers, cost,
data-governance, gate, onboard-gap-fill, onboard-inventory, onboard-verify, reliability,
review, security on every run. A warning that always fires is not a signal. Reconcile the
descriptions or record cited exceptions, as `SKILL_PARITY_EXCEPTIONS` already does.

### Shipped this session (v2.34.0 → v2.36.0)
`/api-ground` + `api-surface.mjs` (`--scan` / `--package=` / `--check` / `--family=`) ·
`references/library-adoption-protocol.md`, `library-api-grounding.md`, `antv-x6-v3.md` ·
registry verification wired into library **pick** (phase-3 TECH_STACK), **research**
(researcher version claims) and **code** (coding-agent Law 2) · `skill-scripts-ship` gate ·
installer path fix · a pre-existing `steward` defect (it instructed readers to run a script
that was never generated into attest-claude).

**Order:** J1 (makes the shipped principle true everywhere) → J2 (cheap, high leverage) →
J5 (structural, blocks adoption of everything script-backed) → J3 → J4 → J6/J7 (hygiene).

---

## Group P — Pipeline Throughput Program (A-wave, filed 2026-08-31)

Filed from the founder-approved **Pipeline Throughput Enhancement** program in the Dokima repo
(`shipwright/docs/work/EXECUTION_PLAN.md` §3 — "Board Two — attest policy wave"); design references
(T1-xx, §12/§13/§14, §16.2) point into `shipwright/docs/work/PIPELINE_THROUGHPUT_ENHANCEMENT.md`.
Dokima's board holds a **GATE-P1** marker that closes when this group merges. The hard constraint is
**policy-before-executor**: wave-level review must be legalized in DoD language (P-A2) before any
executor implements a wave gate — Dokima's P3 wave waits on it by design.

**Ordering:** P-A2 (DoD legalization) and P-A8 (LLM-review-advisory policy) gate the Dokima executor's
P3 wave — do them early. P-A13 and P-A14 are cheap wiring with the evidence already on disk — good
first tickets. Everything here is OPEN; after any merge, `npm run build:claude`, commit both repos,
push both remotes (sync law).

### P-A1. Rewrite `sdlc-init-phase-4.md` Round 2 → three-level model; per-ticket experts = high-risk only — (T1-01)
- **Why:** Round 2 today fans out review HANDOFFs per module inside every wave
  (`agents/sdlc-init-phase-4.md:89,129`); the design's three-level model (T1-01, design doc §5) moves
  the expensive expert assurance to the wave level and reserves per-ticket expert review for
  high-risk tickets only.
- **Files:** `agents/sdlc-init-phase-4.md` · `agents/sdlc/PARALLEL_WAVE_PROTOCOL.md`
- **Acceptance:**
  - [ ] Round 2 text states the three levels (L1 deterministic per-ticket / L2 wave integration / L3 merge train) and names which experts are per-ticket (high-risk only) vs per-wave
  - [ ] `grep -n "high-risk" agents/sdlc-init-phase-4.md` hits in the Round 2 section
  - [ ] PARALLEL_WAVE_PROTOCOL's wave-gate section agrees (no contradictory "always parallel review per module" language survives)
- **Verify:** `npm test && npm run agents:check`

### P-A2. DoD language: wave-level review legalized (the OPT-09/OPT-12 gate) — (T1-02)
- **Why:** T1-02 is "the gate that legalizes OPT-09/OPT-12" — per-ticket and per-wave assurance must
  agree in Definition-of-Done language, or every wave-level optimization reads as a skipped mandatory
  step. This ticket plus P-A8 is what GATE-P1 (Dokima P3) actually waits on.
- **Files:** `agents/sdlc-init-phase-4.md` · `agents/sdlc/PARALLEL_WAVE_PROTOCOL.md` · `agents/shared/GATE_SCORING_PROTOCOL.md` · `agents/shared/BOUNDED_TASK_CONTRACT.md`
- **Acceptance:**
  - [ ] DoD/gate wording states explicitly that a ticket may close on the L1 deterministic gate when a wave-level L2 review covers it, and names the conditions (high-risk still per-ticket)
  - [ ] No file retains wording that makes per-ticket expert review unconditional
  - [ ] `grep -rn "wave-level" agents/sdlc-init-phase-4.md agents/sdlc/PARALLEL_WAVE_PROTOCOL.md` hits in both
- **Verify:** `npm test && npm run agents:check`

### P-A3. `rules/` primitive: `description`/`globs`/`alwaysApply` + loader + validator — (T1-03)
- **Why:** Cursor-derived lesson (design doc §15.1): "load rules by glob, not always — too many
  always-apply brings context bloat to every chat." attest's shared protocol set is always-on and
  growing; a `rules/` primitive with frontmatter lets content load only when its globs match.
- **Files:** `rules/` (new) · `scripts/lib/rules.mjs` loader (new) · `scripts/validators/validate-rules.sh` (new) · red fixture under `evals/fixtures/validators/validate-rules/` (new)
- **Acceptance:**
  - [ ] Loader resolves `description`/`globs`/`alwaysApply` frontmatter and selects rules for a given file list
  - [ ] Validator rejects a rule file with missing/malformed frontmatter; red fixture proves it (RED before GREEN)
  - [ ] `node scripts/check-validator-fixtures.mjs` passes with the new validator fixtured, not grandfathered
  - [ ] Unit tests added to the `scripts/test-*.ts` suite; `npm test` count increases
- **Verify:** `npm test && npm run agents:check && bash scripts/validators/validate-rules.sh --help`

### P-A4. Replace `review-triggers.mjs` regexes with path + semantic-risk classification (regexes demoted to scanner triggers) — (T1-04, OPT-08)
- **Why:** `scripts/lib/review-triggers.mjs:32` recruits the security expert off the bare word
  `validate` (even in comments) and `:37` recruits perf off `.map(`/`.filter(`/`for (` — i.e. off
  nearly any JS diff. Design doc §15.1: "stop paying for false triggers." Classification should be
  path + semantic-risk based; the regexes remain useful only as cheap scanner triggers.
- **Files:** `scripts/lib/review-triggers.mjs` · `scripts/conductor/conductor.mjs` (imports it at `:62`) · `scripts/conductor/conductor.test.mjs`
- **Acceptance:**
  - [ ] A diff containing only `.map(` on a non-DB file no longer recruits perf; a comment containing `validate` no longer recruits security (both as test cases)
  - [ ] Path/risk classification documented in the module header; regexes retained but marked scanner-tier
  - [ ] `conductor.test.mjs` covers both the old false-positive cases (now negative) and true-positive cases (still recruit)
- **Verify:** `npm test && npm run agents:check`

### P-A5. New skill `wave` — compose, run, and synthesize a Level-2 integration gate — (T1-05)
- **Why:** T1-05: the wave integration gate (design doc §5 Level 2) needs a first-class entry point —
  compose the wave's review set, run it concurrently, synthesize findings into one report. Also
  carries the "summaries, not transcripts" lesson (§15.1): the orchestrator ingests finding sets,
  never subagent transcripts.
- **Files:** `skills/wave/SKILL.md` (new) · wiring per the existing skill pattern (see `skills/gauntlet/`, `skills/challenge/`) · `scripts/test-skills-parity.ts` (list update if names are enumerated)
- **Acceptance:**
  - [ ] `skills/wave/SKILL.md` exists and follows the house SKILL format (frontmatter parity with opencode target)
  - [ ] Skill composes reviewers for a wave, runs them, and produces a single synthesized wave-gate report artifact
  - [ ] `npm run agents:check` and the skills-parity test pass with the new skill
- **Verify:** `npm test && npm run agents:check`

### P-A6. New skill `goal` — bounded objective loop with measurable exit — (T1-06)
- **Why:** T1-06: the system has ticket loops (Ralph Wiggum, fix-verify) but no bounded
  objective-level loop with a measurable exit condition — "keep going until metric X or budget Y" is
  currently prose, not a primitive.
- **Files:** `skills/goal/SKILL.md` (new) · wiring per the existing skill pattern · `scripts/test-skills-parity.ts` (list update if names are enumerated)
- **Acceptance:**
  - [ ] `skills/goal/SKILL.md` exists, house format; requires a measurable exit condition and an iteration/budget cap up front, refuses an unmeasurable objective
  - [ ] Loop semantics reference the existing caps (`agents/shared/RALPH_WIGGUM_LOOP.md` hard cap, `agents/shared/FIX_VERIFY_LOOP.md` classification) rather than inventing new ones
  - [ ] `npm run agents:check` and the skills-parity test pass with the new skill
- **Verify:** `npm test && npm run agents:check`

### P-A7. Model diversity + consensus weighting added to challenger/gauntlet (not a replacement) — (T1-07)
- **Why:** T1-07: blindness and maker≠verifier already ship in v3.5.0; this adds concurrent
  multi-model review, 2+-model consensus weighting, and an Act On / Consider / Noted / Dismissed
  agreement map to the existing challenger/gauntlet layer. Explicitly NOT a replacement of
  `/gauntlet` or `/challenge`.
- **Files:** `agents/challenger.md` · `agents/gauntlet-lead.md` · `agents/shared/CHALLENGER_PROTOCOL.md` · `agents/shared/GAUNTLET_LOOP.md` · `skills/challenge/SKILL.md` · `skills/gauntlet/SKILL.md`
- **Acceptance:**
  - [ ] Protocol defines the consensus tiers (Act On / Consider / Noted / Dismissed) and how 2+-model agreement maps a finding into them
  - [ ] Existing single-model challenge/gauntlet flows remain valid (fallback documented, nothing removed)
  - [ ] `grep -rn "consensus" agents/shared/CHALLENGER_PROTOCOL.md agents/shared/GAUNTLET_LOOP.md` hits in both
- **Verify:** `npm test && npm run agents:check`

### P-A8. Policy: LLM review advisory, deterministic validators gate — (T1-07b)
- **Why:** T1-07b: align attest policy with what Dokima's `conductor.config.json` already does and
  what the field evidence showed (`CONDUCTOR_FIELD_REPORT.md:76-88` — review-as-gate failed both
  directions, 75% false blocks; program law L2). A model verdict may file findings and demand
  checks; it never blocks a merge alone.
- **Files:** `agents/shared/GATE_SCORING_PROTOCOL.md` · `agents/code-reviewer.md` · `agents/sdlc-init-phase-4.md` · `agents/sdlc/PARALLEL_WAVE_PROTOCOL.md`
- **Acceptance:**
  - [ ] The policy statement "LLM review is advisory; deterministic validators own the gate" appears in GATE_SCORING_PROTOCOL.md and is referenced from the Phase-4 gate text
  - [ ] No surviving text lets a reviewer verdict alone block a merge absent a failing deterministic check (a REJECT files findings + demands checks instead)
  - [ ] `grep -rn "advisory" agents/shared/GATE_SCORING_PROTOCOL.md` hits
- **Verify:** `npm test && npm run agents:check`

### P-A9. Runtime verdict contract: PASS / FAIL_CANDIDATE / BLOCKED_BASELINE_* / BLOCKED_INFRASTRUCTURE; nonzero verify ⇒ FAIL always — (T1-08)
- **Why:** T1-08: `scripts/lib/runtime-verdict.mjs` already grounds Round-3 PASS/FAIL, but the
  contract is binary — infrastructure failures, pre-existing baseline breakage, and genuine
  candidate failures all collapse into FAIL, so failure accounting (program law L6) can't budget
  them separately. Extend the contract to the five structured states; a nonzero configured verify
  command always produces FAIL regardless of prose.
- **Files:** `scripts/lib/runtime-verdict.mjs` · `scripts/test-verify-verdicts.ts` · `agents/sdlc-init-phase-4.md` (Round-3 wording)
- **Acceptance:**
  - [ ] Parser recognizes all five states; unknown/ungrounded states resolve per the existing grounded-FAIL rules
  - [ ] A verdict document claiming PASS over a nonzero verify exit is classified FAIL (test case)
  - [ ] `scripts/test-verify-verdicts.ts` covers each state at least once; `npm test` count increases
- **Verify:** `npm test && npm run agents:check`

### P-A10. `task-decomposer` emits seam records; interface-contract rule enforced by validator — (T1-09)
- **Why:** T1-09: `agents/task-decomposer.md:218` admits its interface-contract rule "is a manual
  check — nothing in `tickets.mjs` enforces it today." Emit seam records (producer / consumers /
  wiring evidence — program law L8) at decomposition and add the validator that enforces
  exactly-one-interface-contract-module-per-shared-contract plus depends_on listing.
- **Files:** `agents/task-decomposer.md` · `scripts/lib/tickets.mjs` · `scripts/test-tickets-graph.ts` · new validator (e.g. `scripts/validators/validate-seams.sh` (new)) + red fixture under `evals/fixtures/validators/` (new)
- **Acceptance:**
  - [ ] Decomposer output schema includes seam records; the "is a manual check" sentence at `agents/task-decomposer.md:218` is gone, replaced by the validator reference
  - [ ] Validator fails a planted board with a shared contract and no interface-contract module (red fixture, RED before GREEN)
  - [ ] `node scripts/check-validator-fixtures.mjs` passes with the new validator fixtured
- **Verify:** `npm test && npm run agents:check`

### P-A11. Conductor-first Phase 4 — board+conductor present ⇒ dispatch through conductor; HANDOFF prose is the interactive fallback — (T1-11, design doc §12)
- **Why:** T1-11/§12: Phase 4 is human-mediated today — `agents/shared/HANDOFF_TEMPLATES.md:44,281`
  has the orchestrator write HANDOFF docs and *tell the user* to open each agent; program law L10
  says automation talks to processes and humans get bounded packets. When a board and a conductor
  are present (`scripts/conductor/conductor.mjs` exists and works), Phase 4 must dispatch through
  the conductor; HANDOFF prose remains the interactive fallback, not the default.
- **Files:** `agents/sdlc-init-phase-4.md` · `agents/shared/HANDOFF_TEMPLATES.md` · `agents/shared/PHASE_ROUTING_PROTOCOL.md` · `agents/sdlc-lead.md`
- **Acceptance:**
  - [ ] Phase-4 entry text checks for board + conductor first and routes dispatch through `scripts/conductor/conductor.mjs` when both are present
  - [ ] HANDOFF templates carry an explicit "interactive fallback" framing (the docs-based flow is not deleted)
  - [ ] `grep -n "conductor" agents/sdlc-init-phase-4.md` hits in the dispatch section
- **Verify:** `npm test && npm run agents:check`

### P-A12. Decomposition emits requirement ledger, assembly tickets, long-tail wave — (T1-12, design doc §14)
- **Why:** T1-12/§14 (program law L9): tickets closed is *coded*, requirements → e2e on `main` is
  *done*. Decomposition must emit the requirement coverage ledger (§14.1, the real denominator),
  first-class assembly tickets (§14.2), and a named long-tail wave (§14.3) — not leave assembly as
  whatever remains.
- **Files:** `agents/task-decomposer.md` · `scripts/lib/reconciliation-matrix.mjs` · `scripts/validators/validate-requirement-closure.sh` · `scripts/lib/tickets.mjs` (board shape, if the ledger rides the board)
- **Acceptance:**
  - [ ] Decomposer output includes a requirement ledger keyed to SRS/brief requirements (re-derived, not copied from the node list — the existing denominator-discipline checklist item becomes an artifact)
  - [ ] A board with a shared deliverable and no assembly ticket, or no named long-tail wave, fails validation (planted case)
  - [ ] `validate-requirement-closure.sh` (or a successor) reads the ledger rather than re-deriving ad hoc
- **Verify:** `npm test && npm run agents:check`

### P-A13. Wire `delegation-gate.mjs --citations` into review intake (already written, unwired) — (T3-10)
- **Why:** T3-10 / program law L4 ("assume it exists and is unwired"): `scripts/delegation-gate.mjs`
  `--citations` exists and is tested (Group I4, v2.40.0), but the only wiring is prose —
  `agents/code-reviewer.md:45` tells the agent to run it on itself. Nothing mechanical in the
  review-intake path (`scripts/validators/run-handoff-gates.sh`) runs it, so a fabricated REJECT
  still reaches the orchestrator unchecked.
- **Files:** `scripts/validators/run-handoff-gates.sh` · `agents/code-reviewer.md` · `scripts/delegation-gate.mjs` (flag plumbing only, if needed)
- **Acceptance:**
  - [ ] A returning review HANDOFF with a REJECT verdict runs `delegation-gate.mjs --citations=<review-file>` mechanically in the handoff-gate chain; a review whose citations do not resolve fails intake
  - [ ] A planted review citing a line past EOF fails the chain (red case exercised)
  - [ ] Non-review HANDOFFs are unaffected (no new gate on unrelated intakes)
- **Verify:** `npm test && npm run agents:check && bash scripts/validators/run-handoff-gates.sh --help`

### P-A14. Fixture the two unproven HANDOFF gates; teach `check-validator-fixtures.mjs` to parse `run-handoff-gates.sh` — (design-doc audit, §16.2 #6)
- **Why:** §16.2 #6 / program law L3 (no check gates without a red fixture):
  `scripts/check-validator-fixtures.mjs:29` parses only `validate-phase-gate.sh`, so
  `scripts/validators/validate-scope.sh` and `scripts/validators/validate-tracker-fresh.sh` — which
  gate every HANDOFF via `run-handoff-gates.sh:144,224` — run with no red fixture and no
  grandfather entry. Two unproven gates on the hottest path in the system.
- **Files:** `scripts/check-validator-fixtures.mjs` · `evals/fixtures/validators/validate-scope/` (new) · `evals/fixtures/validators/validate-tracker-fresh/` (new) · `evals/fixtures/validators/GRANDFATHERED.json` (only if a delta is unavoidable — prefer real fixtures)
- **Acceptance:**
  - [ ] `check-validator-fixtures.mjs` enumerates validators from `run-handoff-gates.sh` as well as `validate-phase-gate.sh`
  - [ ] Both validators have a red fixture that fails on the planted defect and a green fixture that passes (RED before GREEN)
  - [ ] `node scripts/check-validator-fixtures.mjs` exits 0 with both fixtured and the grandfather delta not grown
- **Verify:** `npm test && npm run agents:check && node scripts/check-validator-fixtures.mjs`

### P-A15. attest CI runs the validator fixture check + a scheduled job — (design-doc audit, §16.2 #7)
- **Why:** §16.2 #7: `.github/workflows/ci.yml` is 4 steps (`npm ci`, `npm test`,
  `agents:check`, `build:claude:check`) — it runs no validator-fixture check and has no scheduled
  job, so the policy repo's own gates are local-only and a fixture rot would go unnoticed until a
  human types the command ("a check nobody runs decays into a check nobody can trust").
- **Files:** `.github/workflows/ci.yml`
- **Acceptance:**
  - [ ] CI runs `node scripts/check-validator-fixtures.mjs` on every push/PR
  - [ ] A `schedule:` trigger exists (e.g. weekly) running at minimum the fixture check + `npm test`
  - [ ] `grep -n "check-validator-fixtures\|schedule:" .github/workflows/ci.yml` hits both
- **Verify:** `npm test && npm run agents:check` (workflow syntax: `node -e "require('js-yaml')"` equivalent or actionlint if available; otherwise CI itself is the proof on push)

## Group K — ECC intake (affaan-m/ECC, MIT; reviewed 2026-09-29, challenged 3x)

Source: ~40 of ECC's 293 skills / 68 agents / hooks skimmed; then every mined item re-read in full by an
independent challenger. ~200 skills are domain filler — not taken. Design + verdict table:
`docs/work/GROUP_K_DESIGN.md` (rev 2). ECC's quality numbers are self-reported: nothing goes default-on without an eval.

### K1. config-protection hook ✅ DONE 2026-09-29
- Blocks edits (incl. `multiedit`) to EXISTING lint/type/test config; new files allowed; bypass `EXPERTS_ALLOW_CONFIG_EDIT=1`. `scripts/lib/hook-guards.mjs` + `plugins/expert-hooks.ts`; Claude `attest-claude/hooks/config-protection.sh`. Claude registration is manual (installer prints the entry).
- **Found while closing it:** opencode passes `tool.execute.before` args in `output.args`; the plugin read `input.args`, so the dangerous-bash, secret-file, K1 and K2 guards had NEVER fired. Fixed; Pass 58 drives the real hook (RED on the old plugin).

### K2. gateguard — SHIPPED OPT-IN (`EXPERTS_GATEGUARD=1`); default-on OPEN
- Deny log (`EXPERTS_GATEGUARD_LOG`), 30-min TTL, per-session key. Challenge found the treatment is "forced pause + fact request", not proven fact-forcing.
- [ ] Build `evals/edit-tasks/` + runner per the pre-registered design (4 arms, ≥16 tasks, ≥5 runs, ITT + fired-only, paired CI). **Runs need user approval (model spend).**

### K3. loop anti-tamper ✅ DONE 2026-09-29 (CHANGED from a validator)
- Challenge: attest already has `validate-loop-readiness.sh` + the goal intake gate; a "loop spec" validator was keyword-stuffable. The real gap — no clause forbidding weakening tests/config/acceptance — is now in goal/autopilot/wave Boundaries (Pass 59).

### K4. trace-order compliance — CORE DONE 2026-09-29; scenario generation OPEN
- `scripts/lib/trace-order.mjs`: predicate step detection (no LLM), ECC's demotion pass, parallel-call tie rule; opt-in `EXPERTS_TRACE_LOG` capture from the real `tool.execute.after` hook (Pass 60, REDs proven for tie rule + demotion + capture).
- [ ] Rule→spec authoring + a runner that replays scenarios (`claude -p`/opencode) — needs spend approval. [ ] Claude-side trace source (Claude Code hooks).

### K5. rationalization warn-only check — CUT
- Pass 51 already checks claims against run evidence (stronger than any text regex); ECC's 4 regexes have no measured precision; no named consumer. Revisit only with a consumer.

### K6. Mined from full-file reads (expected outcome was mostly SKIP — it was)
- ✅ silent-failure-hunter → error-handling-auditor (promise-form catch, lost cause, no timeout, no rollback; greps verified on planted code)
- ✅ type-design-analyzer → type-safety-checker (illegal states, encapsulation)
- ✅ security-scan → `agents/security/MCP_METHODOLOGY.md` MCP06 agent-config grep checklist (verified on planted config); AgentShield dependency NOT taken
- ✅ spec-miner → onboard Invariants (enforced/test anchors, caller cross-check, freshness, cap)
- ✅ pr-test-analyzer → `test-engineer --coverage --pr` (diff-scoped)
- SKIP: comment-analyzer (R-13/14/15), inherit-legacy-style (pre-code + pattern-consistency + `delegation-gate --patterns`)
- [ ] click-path-audit: static state-store side-effect map + 6 patterns (code-health/frontend lane) — not started
- [ ] rust/typescript/python reviewers + build-resolvers: UNVERIFIED — read in full before any verdict
