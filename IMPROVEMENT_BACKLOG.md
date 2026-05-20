# bpm-opencode-experts — Improvement Backlog

Generated: 2026-05-19
Source: Expert system audit + gap analysis

---

## Group A — Agent Content Quality

### A1. Add Cost Optimization Agent [MEDIUM effort, HIGH priority]
- Create `agents/cost-engineer.md` (~400 lines)
- Create `skills/cost/SKILL.md`
- Create `references/cloud-cost-checklist.md`
- Scope: AWS/GCP/Azure spend analysis, right-sizing, reserved capacity
- Wire into sdlc-lead mode routing: `"optimize costs" → cost-engineer`
- Add to Mode 4 (improve) specialist roster
- **Why:** Cloud costs invisible in current system; teams lose 20-40% on compute

### A2. Deepen frontend-design Agent [MEDIUM effort, MEDIUM priority]
- File: `agents/frontend-design.md` (expand from 372 → ~600 lines)
- Add: "Design-System Governance" section (token naming, breaking-change policy, migration paths)
- Add: "Component Library Patterns" section (Storybook, CSF format, composition rules)
- Add: "Token Generation" section (Figma plugins, Tokens Studio, automated sync)
- Add: Decision matrix — Tailwind vs Storybook vs custom component library
- **Why:** Teams reinvent design-system architecture per project

### A3. Wire researcher to fact persistence [MEDIUM effort, MEDIUM priority]
- File: `agents/researcher.md`
- Add: "Fact Bank Integration" — source type tags (official_docs / engineering_blog / academic / news / forum), confidence decay
- Add: "Source Evaluation Rules" — per-domain credibility (RFC > blog > HN > Reddit)
- Add: "Contradiction Handling" — detect conflicting findings, escalate to user
- Wire `mcp__memory__fact_store` into researcher workflow
- **Why:** Research findings lost between sessions; each query starts fresh

### A4. Normalize Orchestrator Phase Names [MEDIUM effort, MEDIUM priority]
- Files: `agents/test-engineer.md`, `agents/security-auditor.md`, `agents/performance-engineer.md`, `agents/sre-engineer.md`
- Target: Phase 1 (understand) → Phase 2 (research/scan) → Phase 3 (analyze/design) → Phase 4 (execute/document) → Phase 5 (verify) → Phase 6 (report)
- Currently inconsistent: understand→research→plan vs. understand→automated-scan→owasp
- **Why:** Users can't predict what a specialist does

### A5. Standardize Confidence Scoring [SMALL effort, MEDIUM priority]
- Create `references/confidence-scale.md` with unified 1-10 scale
- 1-3: speculative | 4-6: verified, needs more | 7-8: high confidence | 9-10: automated verification
- Update all agents that report findings
- **Why:** Findings incomparable across specialists; can't prioritize backlog

---

## Group B — Missing Specialist Agents

### B1. Add Accessibility & Compliance Agent [LARGE effort, HIGH priority]
- Create `agents/a11y-compliance.md` (~600 lines)
- Create `skills/a11y/SKILL.md`
- Create `references/wcag-audit-checklist.md`
- Create `scripts/validators/validate-wcag-coverage.sh`
- Scope: WCAG 2.1 AA/AAA, ATAG 2.0, EN 301 549 (EU mandate), axe/wave/lighthouse tooling
- Wire into Mode 4 roster; call after UX design, before frontend-design
- **Why:** WCAG non-compliance is legal liability; no systematic approach currently

### B2. Add Data Governance Agent [LARGE effort, HIGH priority]
- Create `agents/data-steward.md` (~600 lines)
- Create `skills/data-governance/SKILL.md`
- Create `references/data-classification-checklist.md`
- Create `scripts/validators/validate-data-governance.sh`
- Scope: PII classification, GDPR/CCPA/PIPEDA, data-retention, encryption, access-control mapping
- Wire into Mode 1 Phase 3 + Phase 4; Mode 4 roster
- **Why:** PII/GDPR handling entirely absent from current system

### B3. Add Load Testing & Reliability Agent [MEDIUM-LARGE effort, MEDIUM priority]
- Create `agents/reliability-engineer.md` (~500 lines)
- Create `skills/reliability/SKILL.md`
- Create `references/load-test-checklist.md`
- Create `scripts/validators/validate-resilience-patterns.sh`
- Scope: load testing strategy, chaos engineering, circuit breaker, bulkhead, retry, degradation scenarios
- Distinct from performance-engineer (optimization); this is "what breaks under stress?"
- Wire into Mode 1 Phase 3 (design NFR mapping); Mode 4 roster
- **Why:** perf-engineer focuses on optimization not degradation

### B4. Add Analytics & Instrumentation Agent [MEDIUM effort, MEDIUM priority]
- Create `agents/analytics-architect.md` (~450 lines)
- Create `skills/analytics/SKILL.md`
- Create `references/observability-checklist.md`
- Scope: telemetry design, RED/USE/four golden signals, observability spec, dashboard patterns
- Distinct from sre-engineer (deployment); this is "what do we measure?"
- Wire into Mode 1 Phase 3; call after SRE phase
- **Why:** Telemetry design ad-hoc; teams can't correlate signals

---

## Group C — Missing Validators

### C1. Add Reverse Test Coverage Validator [MEDIUM effort, MEDIUM priority]
- Create `scripts/validators/validate-tests-reverse-coverage.sh`
- Logic: enumerate test files → extract UC-NNN from describe/suite names → cross-check USE_CASES.md
- Fail if: test exists for non-existent UC, or test has no UC context
- Report: orphaned tests (no UC), orphaned UCs (no test)
- Wire into Phase 4 and Phase 5 gates

### C2. Add API Contract ↔ Implementation Validator [MEDIUM effort, HIGH priority]
- Create `scripts/validators/validate-api-consistency.sh`
- Logic: parse OpenAPI.yaml → compare to actual routes → check response schema match
- Report: spec-only endpoints (not implemented), code-only routes (undocumented), schema mismatches
- Wire into Phase 4 (after implementation) and Phase 5 (release gate)
- **Why:** OpenAPI drifts from code; users follow a spec that's wrong

### C3. Add Module Boundary Transitivity Validator [MEDIUM effort, MEDIUM priority]
- Create `scripts/validators/validate-module-boundaries-transitive.sh`
- Logic: build dependency graph from MODULE_DESIGN.md → compute transitive closure → flag violations
- Current validator only catches direct violations, not A→B→C(forbidden)

### C4. Add Circular Dependency Detector at Phase 3 [SMALL effort, MEDIUM priority]
- Create `scripts/validators/validate-circular-deps.sh`
- Wire into Phase 3 gate so cycles are caught at design, not implementation
- Simple graph cycle detection on MODULE_DESIGN.md dependency rules

### C5. Add Observability Spec Validator [SMALL effort, SMALL priority]
- Create `scripts/validators/validate-observability.sh`
- Required sections: logging strategy, metrics (RED/USE), distributed tracing, alerting, dashboards
- Wire into Phase 3 gate

---

## Group D — Architecture & Structure

### D1. Normalize HANDOFF Format [MEDIUM effort, MEDIUM priority]
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

### D2. Add Phase-File Recovery Mechanism [SMALL effort, SMALL priority]
- Create `scripts/recover-phase-state.sh <agent> <slug>`
- Auto-commit phase files to git after each phase completes (before returning to orchestrator)
- Update `agents/shared/BOUNDED_TASK_CONTRACT.md` with recovery section

### D3. Add Lite Mode for Local LLMs [MEDIUM effort, MEDIUM priority]
- security-auditor (2K lines) and sdlc-init-mode (2.2K lines) exceed 32-64K token limits
- Add `--lite` flag to: test-engineer, security-auditor, performance-engineer, code-reviewer
- Lite mode: Phase 1→3→6 only (skip research and detailed report phases), ~40% context reduction

### D4. Add Agent Failure Recovery Protocol [SMALL effort, SMALL priority]
- Update `agents/shared/BOUNDED_TASK_CONTRACT.md`
- Define: 3 failures → escalate to user (no auto-retry)
- Define: intermediate phase files committed to git even on failure
- Define: user can resume manually or swap agent

---

## Group E — Documentation & Guidance

### E1. Create Multi-Cloud SRE Patterns Guide [SMALL effort, MEDIUM priority]
- Create `references/sre-cloud-patterns.md` (~300 lines)
- Current SRE agent is AWS-centric; add GCP/Azure/on-prem equivalents
- Per cloud: CI/CD, secrets management, logging centralization, monitoring, alerting, runbook structure

### E2. Add Design-System Architecture Decision Guide [SMALL effort, SMALL priority]
- Create `references/design-system-tradeoffs.md` (~150 lines)
- Decision matrix: team size, time budget, customization needs
- Compare Tailwind vs Storybook+Figma vs custom component library with trade-offs

### E3. Add Research Tool Usage Guide [SMALL effort, SMALL priority]
- Create `references/research-tool-guide.md` (~150 lines)
- Flowchart for tier selection: web_search_pullmd → web_research_pullmd → web_research
- Performance/cost expectations per tier; example workflows per question type

### E4. Add Phase Completion Checklists [SMALL effort, SMALL priority]
- Create `references/phase-completion-checklist.md` (~200 lines)
- Per phase: 5-10 narrative human-judgment items + validator items
- Helps teams know when to advance to the next phase

---

## Group F — Validator Hygiene

### F1. Standardize Validator Exit Codes [SMALL effort, SMALL priority]
- Audit all 40+ validators in `scripts/validators/`
- Enforce: 0=pass, 1=failures found (fix required), 2=escalate (manual review needed)
- Update `_lib.sh` with documented exit code semantics

### F2. Enforce JSON Output from All Validators [SMALL effort, SMALL priority]
- Audit all validators for consistent JSON envelope
- Enforce: `{passed: bool, findings: [...], summary: string, exit_code: int}`

### F3. Add Validator Performance Guide [SMALL effort, SMALL priority]
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

### G3. Add --dry-run Flag to All Validators [SMALL]
- Report findings without writing files
- ~5-10 lines per validator

### G4. Create Agent Quick-Reference Cards [SMALL] ✅ DONE
- Created `docs/AGENT_REFERENCE.md` (2026-05-19)
- Covers all 19 agents: What/When to use/Modes/Output, organized by role group
- Users shouldn't need to read 2K-line files to know what an agent does

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

- **Total tasks:** 28
- **Tiny:** 2 | **Small:** 11 | **Medium:** 9 | **Medium-Large:** 1 | **Large:** 2 | **Architecture:** 4
- **High priority:** A1, B1, B2, C2
- Groups B, C, E can run in parallel once foundations are done
