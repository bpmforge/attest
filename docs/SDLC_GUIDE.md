# SDLC Workflow Guide

The SDLC (Software Development Lifecycle) workflow provides structured project management through 6 phases, each producing specific engineering artifacts.

## Quick Start

```
/sdlc init myproject "A web API for managing inventory"
```

This creates the document structure and walks through each phase.

## Phases

### Phase 0: Ideation — WHY are we building this?

**Deliverables:**
- `docs/sdlc/phase-0-ideation/VISION.md` — Problem, target users, success metrics
- Optional: `COMPETITIVE_ANALYSIS.md` — What exists, gaps, differentiation

**Use `/research` for:** Competitive landscape, technology feasibility

**Exit criteria:** Clear problem statement, target users identified, competitive gap defined

---

### Phase 1: Planning — WHAT are we building?

**Deliverables:**
- `docs/sdlc/phase-1-planning/SCOPE.md` — In scope, out of scope, MVP boundary
- `docs/sdlc/phase-1-planning/RISKS.md` — Technical, business, timeline risks + mitigations
- `docs/sdlc/phase-1-planning/CONSTRAINTS.md` — Budget, timeline, team, tech constraints
- `docs/sdlc/phase-1-planning/USER_PERSONAS.md` — Who uses this, goals, pain points

**Exit criteria:** Clear boundaries, risks identified with mitigations, all 4 docs present

---

### Phase 2: Requirements — HOW should it behave?

**Deliverables:**
- `docs/sdlc/phase-2-requirements/SRS.md` — Functional & non-functional requirements (IEEE 830 format)
- `docs/sdlc/phase-2-requirements/USER_STORIES.md` — Stories with Given/When/Then acceptance criteria

**Use `/ux` for:** User workflow design
**Use `/research` for:** Technology feasibility questions

**Exit criteria:** Every FR has acceptance criteria, every NFR has a measurable metric

---

### Phase 3: Design — HOW do we build it?

**Deliverables:**
- `docs/sdlc/phase-3-design/ARCHITECTURE.md` — C4 diagrams, ADRs, service boundaries
- `docs/sdlc/phase-3-design/TECH_STACK.md` — Language, frameworks, libraries + justification
- `docs/sdlc/phase-3-design/DATABASE.md` — ERD, schema DDL, indexes, migrations
- `docs/sdlc/phase-3-design/API_DESIGN.md` — Endpoint contracts, RBAC, examples
- `docs/sdlc/phase-3-design/THREAT_MODEL.md` — STRIDE threats + mitigations

**Delegate to:**
- `/dba --design` — Database schema from requirements
- `/api-design` — API contracts from user stories
- `/security --threat-model` — Threat model from architecture
- `/ux --components` — Component architecture

**Exit criteria:** All components documented, data flows diagrammed, modular structure defined

---

### Phase 4: Implementation — BUILD it

**Delegate to:**
- `/test-expert --strategy` — Test strategy BEFORE coding
- `/dba --migrate` — Database migrations
- `/containers --compose` — Container setup
- `/devops --cicd` — CI/CD pipeline
- `/security --owasp` — Security audit during development
- `/review-code` — Code quality review

**Exit criteria:** All components implemented, tests passing, security audit clean

---

### Phase 5: Review — DID it work?

**Delegate ALL reviews:**
- `/security` — Full OWASP audit
- `/perf --benchmark` — Performance vs NFR targets
- `/review-code` — Full codebase quality review
- `/test-expert --coverage` — Coverage analysis
- `/ux --audit` — Accessibility audit

**Exit criteria:** No CRITICAL/HIGH findings, performance meets NFRs

---

## Gate Management

Before advancing to the next phase, run `/gate check`:

```
/gate check
```

The gate validates:
1. All required deliverables exist
2. Each file has substantial content (>50 lines)
3. Phase-specific checks pass

If a gate fails, it tells you exactly what's missing.

## Interoperability

Work started in Claude Code continues seamlessly in OpenCode:
- Same document structure (`docs/sdlc/phase-X/`)
- Same artifact formats (Mermaid diagrams, IEEE 830 SRS)
- Same expert methodologies
- Same gate criteria

## Tips

- **Don't skip phases** — Each phase prevents expensive rework later
- **Let experts do expert work** — The SDLC Lead delegates, it doesn't design schemas
- **Mermaid diagrams everywhere** — Not ASCII art. Renderable, version-controllable diagrams
- **Modular architecture** — Feature-sliced, interface-driven, dependency-injected
