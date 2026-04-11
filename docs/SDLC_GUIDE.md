# SDLC Workflow Guide

The SDLC workflow provides structured project management through four operating modes, each producing specific engineering artifacts. All work follows strict git branching discipline — `main` is always production-ready.

## Quick Start

```
/sdlc init myproject "A web API for managing inventory"
/sdlc onboard
/sdlc feature "OAuth refresh token support"
/sdlc improve
/sdlc improve "ux"
```

## Four Operating Modes

| Command | Mode | When to use |
|---------|------|-------------|
| `/sdlc init <name> "<desc>"` | New Project | Starting from scratch |
| `/sdlc onboard` | Understand Codebase | First time in an unfamiliar repo |
| `/sdlc feature "<description>"` | Add Feature | Adding to a working system |
| `/sdlc improve ["<focus>"]` | Audit & Improve | Improving an existing system |

---

## Git Branching Model (All Modes)

`main` is production. **Nothing goes directly to `main`.** Every mode creates a typed branch first and ends with a PR:

| Mode | Branch | Merges when |
|------|--------|-------------|
| `init` phases 0–3 | `sdlc/setup` | Phase 3 gate passes → PR |
| `init` phase 4 features | `feat/[slug]` | All reviews pass → squash merge |
| `onboard` | `docs/onboard` | Onboarding complete → PR |
| `feature` | `feat/[slug]` | All reviews pass → squash merge |
| `improve` | `improve/[slug]` | All items verified → PR |

Branch protection on `main` is configured automatically during `/sdlc init` — no direct pushes, require PR review, require CI.

---

## Mode 1: New Project (`/sdlc init`)

Phases 0–5, discovery-driven from a blank repo.

### Phase 0: Ideation — WHY are we building this?

**Deliverables:**
- `docs/VISION.md` — Problem, target users, success metrics
- `docs/COMPETITIVE_ANALYSIS.md` — What exists, gaps, differentiation

**Exit criteria:** Clear problem statement, target users identified, competitive gap defined

---

### Phase 1: Planning — WHAT are we building?

**Deliverables:**
- `docs/SCOPE.md` — In scope, out of scope, MVP boundary
- `docs/RISKS.md` — Technical, business, timeline risks + mitigations
- `docs/CONSTRAINTS.md` — Budget, timeline, team, tech constraints
- `docs/USER_PERSONAS.md` — Who uses this, goals, pain points

**Exit criteria:** Clear boundaries, risks identified with mitigations, all 4 docs present

---

### Phase 2: Requirements — HOW should it behave?

**Deliverables:**
- `docs/SRS.md` — Functional & non-functional requirements (IEEE 830 format)
- `docs/USER_STORIES.md` — Stories with Given/When/Then acceptance criteria

**Exit criteria:** Every FR has acceptance criteria, every NFR has a measurable metric

---

### Phase 3: Design — HOW do we build it?

**Deliverables:**
- `docs/ARCHITECTURE.md` — C4 diagrams, ADRs, service boundaries
- `docs/TECH_STACK.md` — Language, frameworks, libraries + justification
- `docs/DATABASE.md` — ERD, schema DDL, indexes, migrations
- `docs/API_DESIGN.md` — Endpoint contracts, RBAC, examples
- `docs/THREAT_MODEL.md` — STRIDE threats + mitigations
- `docs/design/` — UX spec, style guide, design principles (if UI-bearing)

**Delegate to:**
- `/dba` — Database schema from requirements
- `/api-design` — API contracts from user stories
- `/security` — Threat model from architecture
- `/ux --design` — Component architecture (if UI-bearing)

**Exit criteria:** All components documented, data flows diagrammed, modular structure defined

**After Phase 3 gate passes:** `sdlc/setup` branch is merged to `main` via PR. Phase 4 feature branches cut from updated `main`.

---

### Phase 4: Implementation — BUILD it

**Delegate to:**
- `/test-expert` — Test strategy BEFORE coding
- `/dba` — Database migrations
- `/containers` — Container setup
- `/devops` — CI/CD pipeline
- `/security` — Security audit during development
- `/review-code` — Code quality review

**Exit criteria:** All components implemented, tests passing, security audit clean

---

### Phase 5: Review — DID it work?

**Delegate ALL reviews:**
- `/security` — Full OWASP audit
- `/perf` — Performance vs NFR targets
- `/review-code` — Full codebase quality review
- `/test-expert` — Coverage analysis
- `/ux --audit` — Accessibility audit (if UI-bearing)
- `/containers` — Image optimization + CVE scan

**Exit criteria:** No CRITICAL/HIGH findings, performance meets NFRs

---

## Mode 2: Onboard (`/sdlc onboard`)

Understand a codebase you've never seen. Creates `docs/onboard` branch. Produces documentation that makes the next person's onboarding 10x faster. All docs committed via PR to `main`.

**Produces:**
- `docs/LANDSCAPE.md` — Tech stack, project size, directory structure, UI detection
- `docs/ARCHITECTURE.md` — High-level architecture with C4 diagrams
- `docs/diagrams/entry-points.md` — Sequence diagrams for every route/entry point
- `docs/diagrams/sequence-*.md` — Key operation flows
- `docs/db/SCHEMA.md` — Inferred or documented schema
- `docs/security/THREAT_SURFACE.md` — Attack surface overview
- `docs/ONBOARDING.md` — How to run, test, add features
- `docs/git/HISTORY_INSPECTION_<date>.md` — Git history analysis (hot files, patterns)
- `docs/design/UX_AUDIT.md` — UX audit (if UI-bearing)

---

## Mode 3: Add Feature (`/sdlc feature`)

Add a feature to a working system without breaking it. Creates `feat/[slug]` branch. Ends with a PR merged to `main`.

**Steps:**
1. Discovery interview — understand the feature before touching code
2. Impact analysis — what does this touch? what's the blast radius?
3. Design — sequence diagram, DB changes, API changes, test plan
4. Implement — branch-first, tests first, code review + security check before PR
5. Verify — security audit, performance check, accessibility pass (if UI)
6. Document — update ARCHITECTURE.md, API docs, UX_SPEC.md

---

## Mode 4: Audit & Improve (`/sdlc improve`)

Improve an existing system without adding new features. Improvements are **discovered through audits**, not spec'd upfront.

```
/sdlc improve              # full multi-dimension audit
/sdlc improve "ux"         # UX only
/sdlc improve "performance"
/sdlc improve "security"
/sdlc improve "code-quality"
```

Creates `improve/[slug]` branch. All audit findings and implementation committed there. Ends with a PR to `main`.

### How it works

1. **Discovery interview** — what's driving this? which dimensions matter? what's off-limits?
2. **Audit plan** — sdlc-lead selects specialists based on your answers, confirms with you before running
3. **Targeted audits** — each specialist runs as a HANDOFF, produces a findings report
4. **Improvement backlog** — sdlc-lead synthesizes all findings into a ranked backlog with S/M/L sizing and verification criteria
5. **Prioritization** — you pick which items to execute
6. **Execute** — sized appropriately:
   - **S (Small):** implement directly → verify with targeted specialist re-check
   - **M (Medium):** brief design note → implement → verify
   - **L (Large):** spawns a full Mode 3 sub-workflow

### Specialists available per dimension

| Focus | Specialist | What they find |
|-------|-----------|----------------|
| `ux` | `ux-engineer` | Friction, accessibility gaps, design inconsistencies, confusing flows |
| `code-quality` | `code-reviewer` | Complexity hotspots, duplication, error handling gaps, naming |
| `performance` | `performance-engineer` | N+1 queries, missing caching, O(n²) patterns, payload bloat |
| `security` | `security-auditor` | OWASP top 10, auth gaps, injection, sensitive data exposure |
| `database` | `db-architect` | Missing indexes, normalization issues, schema debt, N+1 in ORM |

All findings include severity (Critical/High/Medium/Low), effort estimate (S/M/L), and a clear "done" definition.

---

## Gate Management

Before advancing any phase or milestone, sdlc-lead runs a confidence-based gate:

- Score **< 5** on any dimension → automatic fail, surface the gap
- Score **5–6** → revise that dimension (max 3 passes)
- Score **≥ 7** → pass

If a gate fails, the agent tells you exactly what's missing. Use `/sdlc status` to see current gate state.

---

## Interoperability

Work started in Claude Code continues seamlessly in OpenCode:
- Same document structure (`docs/`)
- Same artifact formats (Mermaid diagrams, IEEE 830 SRS)
- Same expert methodologies
- Same gate criteria

---

## Tips

- **Don't skip phases** — each phase prevents expensive rework later
- **Let experts do expert work** — sdlc-lead delegates, it doesn't design schemas
- **Mermaid diagrams everywhere** — not ASCII art; renderable, version-controllable
- **Modular architecture** — feature-sliced, interface-driven, dependency-injected
- **main is sacred** — work on branches, merge via PRs; the workflow enforces this automatically
