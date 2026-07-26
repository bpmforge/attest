# bpm-opencode-experts — Improvement Backlog

Generated: 2026-05-19
Source: Expert system audit + gap analysis
Updated: 2026-07-08 — added **Group H** (9 open findings) from a live Mode-1 engagement field report
(`issues/field-report-mode1-sdlc-run-2026-07.md`). Groups A–G (original audit) remain all-closed.

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

### I1. Harness calibration gate — prove the instrument before trusting the reading
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

