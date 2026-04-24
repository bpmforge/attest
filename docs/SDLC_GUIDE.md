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
- `docs/ARCHITECTURE.md` — C4 diagrams, ADRs, service boundaries (orchestrator synthesis)
- `docs/PARALLELIZATION_MAP.md` — module inventory + Phase 4 wave plan (orchestrator synthesis)
- `docs/TECH_STACK.md` — Language, frameworks, libraries + justification
- `docs/DATABASE.md` — ERD, schema DDL, indexes, migrations
- `docs/API_DESIGN.md` — Endpoint contracts, RBAC, examples
- `docs/api/openapi.yaml` — Machine-readable OpenAPI 3.0 spec
- `docs/THREAT_MODEL.md` — STRIDE threats + mitigations
- `docs/design/` — UX spec, style guide, design principles (if UI-bearing)

**Delegate to:**
- `/dba` — Database schema from requirements
- `/api-design` — API contracts from user stories
- `/security` — Threat model from architecture
- `/ux --design` — Component architecture (if UI-bearing)

**Modular-parallel architecture (mandatory):** every module must be independently buildable — owns its directory tree (`src/<module>/`), exposes a frozen contract (OpenAPI path group, gRPC service, event schema, or public interface file), has zero direct imports from another module's internals, and is listed in `PARALLELIZATION_MAP.md` with explicit dependencies. Shared code (`src/shared/`) is built in its own wave, never concurrently.

**Contract-first ordering:** API contracts + event schemas are frozen at the end of Phase 3 before any Phase 4 implementation starts. This lets modules implement against mocks of each other without blocking.

**Exit criteria:** All components documented, data flows diagrammed, modular structure defined, `PARALLELIZATION_MAP.md` Module Inventory populated for every module in ARCHITECTURE.md § Implementation View.

**After Phase 3 gate passes:** `sdlc/setup` branch is merged to `main` via PR. Phase 4 feature branches cut from updated `main`.

---

### Phase 4: Implementation — BUILD it

**Execution mode — sdlc-lead asks the user per-wave before emitting HANDOFFs:**

- **Sequential (default)** — modules built one agent at a time, verify each before the next. Safer, easier to recover from failure.
- **Parallel (opt-in per wave) — three rounds per wave: code → review → runtime.** Round 1 emits N `coding-agent` HANDOFFs (one per module) in a single message. Round 2 emits N `code-reviewer` HANDOFFs producing `docs/reviews/CODE_REVIEW_<module>_<date>.md`. Round 3 emits N runtime-validation HANDOFFs producing `docs/reviews/RUNTIME_<module>_<date>.md`. Every module must be green in all three rounds before Wave N+1 starts. A Round 3 FAIL blocks only the failing module; peers keep their PASS verdicts.

Write-scope isolation is enforced in every parallel-wave HANDOFF: each agent's assigned module directory is exclusive; cross-module changes must be flagged as deferred, not edited. `src/shared/` writes always run in their own wave, never concurrently.

**Delegate to:**
- `/test-expert` — Test strategy BEFORE coding
- `/code` — Implementation from design docs (coding-agent: doc-driven, API-verified, anti-slop enforced, write-scope isolated)
- `/dba` — Database migrations
- `/containers` — Container setup
- `/devops` — CI/CD pipeline
- `/security` — Security audit during development
- `/review-code` — Code quality review

**Tech stack constraint:** `docs/TECH_STACK.md` defines allowed libraries and frameworks. The coding-agent enforces this — it flags any deviation rather than silently introducing new technology.

**Exit criteria:** All components implemented, tests passing, security audit clean, every wave verified before advancing.

---

### Phase 5: Review — DID it work?

Reviews run as a **parallel fan-out** via the Fix-Verify Loop Protocol. Findings synthesize into a unified `FIX_BACKLOG_RELEASE_<date>.md`; fixes flow through a dedicated remediation HANDOFF; targeted re-verification closes the loop; hard cap of 3 iterations with escalation if still failing.

**Blocking reviews (parallel fan-out, one message):**
- `/security` — Full OWASP audit (findings only; does NOT self-fix)
- `/perf` — Performance vs NFR targets (findings only; does NOT self-optimize)
- `/review-code` — Full codebase quality review
- `/ux` — Accessibility audit (if UI-bearing)

**Fix-Verify Loop (after fan-out):** sdlc-lead synthesizes FIX_BACKLOG → remediation HANDOFF (coding-agent) → targeted re-verification HANDOFF → repeat up to 3 iterations. Every CRITICAL/HIGH merge-blocking row must PASS or be waived (via `WAIVERS_RELEASE_<date>.md`) before the Release Gate.

**Post-review audits (sequential, non-blocking):**
- `/test-expert` — Coverage analysis
- `/review-code --debt` — Tech debt register for post-launch backlog
- `/containers` — Image optimization + CVE scan

**Release Gate (BLOCKING before `--release`):** 10 required conditions. Fix-verify loop closed, every review verdict READY/APPROVED/RELEASE-READY, runtime PASS, test suite P0+P1 green, no CRITICAL CVE in containers. Any blocker stops release and surfaces to the user.

**Exit criteria:** Release Gate all green.

---

## Mode 2: Onboard (`/sdlc onboard [--quick | --deep]`)

Understand a codebase you've never seen. Creates `docs/onboard` branch. Produces documentation that makes the next person's onboarding 10x faster. All docs committed via PR to `main`.

**Depth flags (v0.15.0):**

| Flag | Scope | Time |
|------|-------|------|
| `--quick` (default) | Single-pass high-level docs | ~15 min |
| `--deep` | Ralph Wiggum inventory loop — every route / table / service / P0 flow / entry point as an inventory row, one artifact per row, iterates until validators exit clean | ~45-90 min |

**Produces (quick mode):**
- `docs/LANDSCAPE.md` — Tech stack, project size, directory structure, UI detection
- `docs/ARCHITECTURE.md` — High-level architecture with C4 diagrams
- `docs/diagrams/entry-points.md` — Sequence diagrams for every route/entry point
- `docs/diagrams/sequence-*.md` — Key operation flows
- `docs/db/SCHEMA.md` — Inferred or documented schema
- `docs/security/THREAT_SURFACE.md` — Attack surface overview
- `docs/ONBOARDING.md` — How to run, test, add features
- `docs/git/HISTORY_INSPECTION_<date>.md` — Git history analysis (hot files, patterns)
- `docs/design/UX_AUDIT.md` — UX audit (if UI-bearing)

**Deep mode additionally produces:**
- `docs/onboard/INVENTORY.md` — Every unit of the codebase as a row (ROUTE / TABLE / SERVICE / FLOW / ENTRY); status tracked per row
- One artifact per inventory row (API_DESIGN row, ERD node, C3 section, sequence diagram, entry-point doc)
- Passing validator: `./scripts/validators/validate-phase-gate.sh onboard-deep` exits 0

**Deep-mode sub-skills** — thin triggers for the individual Ralph Wiggum steps:

| Skill | Step | Purpose |
|-------|------|---------|
| `/onboard-inventory` | D1 | Enumerate units into `docs/onboard/INVENTORY.md` |
| `/onboard-verify`    | D3 | Run all onboard validators, report gaps |
| `/onboard-gap-fill`  | D4 | Emit focused HANDOFFs for uncovered rows only |

Canonical protocol: `agents/shared/RALPH_WIGGUM_LOOP.md` (inventory → discover → verify → gap → repeat, 3-iteration cap).

---

## Mode 3: Add Feature (`/sdlc feature`)

Add a feature to a working system without breaking it. Creates `feat/[slug]` branch. Ends with a runtime-validated PR squash-merged to `main`.

**Steps:**
1. Discovery interview — understand the feature before touching code
2. Impact analysis — what does this touch? what's the blast radius?
3. **Sub-component decomposition** — Atomic (linear flow) or Split? Split features produce `docs/features/<slug>/COMPONENT_DAG.md` with sub-components, dependencies, waves, and frozen contracts. Each sub-component cuts `feat/<slug>/<sub-slug>` from the parent branch and runs the full Mode-3 lifecycle (Steps 4–9) on its own branch.
4. Design — sequence diagram, DB changes, API changes, test plan
5. Implement — branch-first, tests first, code written against design
6. **Parallel review fan-out** — code-review (always) + security (if auth/input/data/crypto) + perf (if NFR-tracked / DB / loops / caching / jobs) + ux (if UI) emit together in ONE message; user opens N concurrent OpenCode sessions; reviewers produce findings only (no self-fixes).
7. **Fix-Verify loop** — sdlc-lead synthesizes `FIX_BACKLOG_<feature>_<date>.md` from every review. CRITICAL/HIGH rows get a remediation HANDOFF (coding-agent) → targeted re-verification HANDOFF → iterate up to 3 times. After 3 failed cycles → escalation prompt (waive / redesign / defer / change specialist).
8. Document — update ARCHITECTURE.md, API docs, UX_SPEC.md
9. **Runtime validation gate (BLOCKING before merge)** — build → lint/typecheck → start → feature smoke → regression smoke. Produces `docs/reviews/RUNTIME_<feature>_<date>.md`. Verdict must be PASS or the merge aborts. In split features, each sub-component produces its own `RUNTIME_<slug>_<sub-slug>_<date>.md`; the parent merges to `main` only when every sub-component is PASS.
10. Merge — `git-expert` verifies RUNTIME = PASS, FIX_BACKLOG closed (or waivers signed), no open CRITICAL/HIGH review verdicts, then marks the PR ready and squash-merges. Branch deleted after merge.

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

Before advancing any phase or milestone, sdlc-lead runs gate checks in two forms:

**Automated validators (v0.15.0)** — deterministic coverage checks via `scripts/validators/`:

| Phase | Validator chain |
|-------|-----------------|
| `phase-3` | architecture + api-coverage + erd-coverage + sequence-coverage |
| `onboard-deep` | inventory + architecture + erd-coverage + sequence-coverage |
| `security-deep` | owasp + attack-chains |
| `phase-5` release | FIX_BACKLOG closed, all reviews APPROVED, RUNTIME PASS |

Orchestrated via `./scripts/validators/validate-phase-gate.sh <phase>` — exit 0 = clean, 1 = gaps, 2 = validator error. Or call `/gate` for a user-friendly wrapper.

**Post-HANDOFF gates** — after every specialist HANDOFF, `./scripts/validators/run-handoff-gates.sh` runs three gates in order: scope (git writes confined to assigned directory), manifest (required sections + completion phrase), coverage (domain-specific validator). Any failure returns REVISE to the specialist.

**Confidence gates** — used only for artifacts validators cannot check mechanically (narratives, research summaries):
- Score **< 5** on any dimension → automatic fail, surface the gap
- Score **5–6** → revise that dimension (max 3 passes)
- Score **≥ 7** → pass

If a gate fails, the agent tells you exactly what's missing. Use `/sdlc status` to see current gate state.

**Shared protocols** — every specialist reads these canonical files:
- `agents/shared/BOUNDED_TASK_CONTRACT.md` — 5 scope rules (write-scope, no extras, verbatim completion, no expansion, stop-means-stop)
- `agents/shared/HANDOFF_TEMPLATES.md` — canonical HANDOFF block templates
- `agents/shared/FIX_VERIFY_LOOP.md` — review → FIX_BACKLOG → remediate → re-verify pipeline
- `agents/shared/RALPH_WIGGUM_LOOP.md` — inventory-driven deep-verification loop

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
