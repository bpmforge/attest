# Agent Quick Reference

One-page summary per agent. For full docs, read the agent file directly.

---

## Orchestrators

### guide
**What:** Expert-system concierge / front door.  
**When to use:** When you don't know which command fits — describe any goal in plain English.  
**Modes:** `/guide`  
**Output:** Routes to the right expert, drives the workflow, always offers the fix path.

### task-decomposer
**What:** Turns any request into a typed DAG (`plan.json`) of bounded leaf tasks.  
**When to use:** Big/vague/multi-file work, or whenever the executing model is tier=small.  
**Output:** `docs/work/plan/plan.json` — run it with `scripts/run-plan.mjs`.

### sdlc-lead
**What:** Program manager and lead architect. Routes all SDLC work.  
**When to use:** Entry point for everything — new project, onboarding, adding a feature, or improving an existing system.  
**Modes:** `/sdlc init` · `/sdlc onboard` · `/sdlc feature` · `/sdlc improve`  
**Output:** Delegates to mode agents; produces phase plan and HANDOFF chains.

### sdlc-init-mode
**What:** Executes the new-project pipeline (Phases 0–5, plus 3.5 Test Design).  
**When to use:** Called automatically by `sdlc-lead` on `/sdlc init`. Do not call directly.  
**Modes:** Phase 0 (ideation) → 1 (planning) → 2 (requirements) → Gate A → 3 (design) → 3.5 (test design) → Gate B → 4 (implementation) → 5 (review + release)  
**Output:** Full SDLC document set, working implementation, signed release tag. Diagrams: [flows/new-project.md](flows/new-project.md).

### sdlc-onboard-mode
**What:** Understands an existing codebase at three depth levels.  
**When to use:** Called by `sdlc-lead` on `/sdlc onboard`. Do not call directly.  
**Modes:** `--quick` (~15–20 min) · default, + ROUTE/TABLE inventory (~30–40 min) · `--deep`, full Ralph Wiggum inventory (~45–90 min)  
**Output:** LANDSCAPE.md, entry-point + sequence diagrams, ERD, C2/C3, PATTERNS.md, HEALTH_ASSESSMENT.md, ARCHITECTURE.md, ONBOARDING.md, DECISION_LOG.md. Diagrams: [flows/onboard.md](flows/onboard.md).

### sdlc-feature-mode
**What:** Adds a single feature to an existing codebase safely.  
**When to use:** Called by `sdlc-lead` on `/sdlc feature`. Do not call directly.  
**Modes:** interview → impact analysis (app-cartographer) → atomic/split → design → test-first implement + review + fix-verify → verify → document + runtime gate → merge  
**Output:** Implemented feature on `feat/<slug>`, FIX_BACKLOG closed, RUNTIME PASS, squash-merged PR. Diagram: [flows/feature-improve.md](flows/feature-improve.md).

### sdlc-improve-mode
**What:** Audit-driven improvement: specialist audits (UX, code quality, performance, security, database + on-demand) → sized backlog → user-approved execution, each item re-verified by the auditor who found it.  
**When to use:** Called by `sdlc-lead` on `/sdlc improve`, optionally with a focus.  
**Modes:** `/sdlc improve` · `/sdlc improve "security"` · `/sdlc improve "ux"`  
**Output:** `docs/improve/*_AUDIT.md`, `IMPROVEMENT_BACKLOG.md`, `EXECUTION_PLAN.md`, `VERIFY_ITEM_n.md`, `IMPROVEMENT_SUMMARY.md`, PR. Diagram: [flows/feature-improve.md](flows/feature-improve.md).

---

## Core Implementation

### coding-agent
**What:** Senior implementation engineer. Doc-driven — reads specs before writing code.  
**When to use:** After design docs exist (ARCHITECTURE.md, API spec, DB schema). Not for exploratory work.  
**Key rules:** Verifies all APIs via Context7 · no TODO stubs · no hallucinated libraries · anti-slop enforced  
**Output:** Working code + tsc clean + tests passing.

### git-expert
**What:** Git lifecycle specialist across 6 operating modes.  
**When to use:** Any git operation — feature branch setup, release tagging, recovering lost work, syncing forks.  
**Modes:** init · feature · release · recover · inspect · sync  
**Output:** Git operations executed + history clean + branch strategy documented.

### researcher
**What:** Professional research with citations and source evaluation.  
**When to use:** When you need verified facts, competitive analysis, or technical decision support. Not for code questions.  
**Modes:** quick (single source) · standard (3-5 sources) · deep (comprehensive, fact-banked)  
**Output:** Structured report with citations, confidence levels, and contradictions flagged.

---

## Architecture & Design

### architecture-designer
**What:** System architecture with module boundaries and domain-driven design.  
**When to use:** Phase 3 (design) of `/sdlc init`, or when MODULE_DESIGN.md needs updating.  
**Key rules:** Enforces circular-dependency detection · no god modules · interface-first  
**Output:** ARCHITECTURE.md + MODULE_DESIGN.md + C3 diagrams.

### api-designer
**What:** REST/GraphQL API contracts with OpenAPI generation.  
**When to use:** After architecture design, before implementation. When adding new endpoints.  
**Modes:** design · review · version · deprecate  
**Output:** OpenAPI 3.1 spec + contract tests + versioning strategy.

### db-architect
**What:** Database schema design, migrations, and query optimization.  
**When to use:** When defining data models, planning migrations, or diagnosing slow queries.  
**Key rules:** Every migration is reversible · indexes explained · no N+1 queries  
**Output:** DATABASE.md + migration files + query analysis.

---

## Quality Assurance

### code-reviewer
**What:** 8-dimension code health audit (correctness, performance, security, maintainability, tests, docs, style, architecture).  
**When to use:** Before merging, after major refactors, periodic debt reviews.  
**Modes:** review · debt · consolidate · patterns  
**Output:** Scored findings (1-10 per dimension) + prioritized fix list.

### security-auditor
**What:** OWASP Top 10 audit, threat modeling, Semgrep scanning, dependency CVE check.  
**When to use:** Before production deploys, after auth changes, new user-input handling, third-party integrations.  
**Modes:** standard · deep (full STRIDE + attack chains)  
**Output:** SECURITY_CONTROLS.md + finding list (HIGH/MEDIUM/LOW) + remediation steps.

### test-engineer
**What:** Test strategy, Playwright E2E, unit/integration tests, coverage analysis.  
**When to use:** When implementing tests, reviewing test coverage, or designing a test strategy from scratch.  
**Modes:** strategy · implement · review · coverage  
**Output:** Test files + coverage report + gap analysis against USE_CASES.md.

### performance-engineer
**What:** Profiling, static analysis, benchmarking, bottleneck optimization.  
**When to use:** When response times are slow, memory is high, or before a load-sensitive release.  
**Modes:** profile · analyze · benchmark · optimize  
**Output:** Performance report + hotspot list + optimization PRs.

### ux-engineer
**What:** UX design review, user flow analysis, WCAG 2.2 accessibility audit.  
**When to use:** After wireframes exist, before frontend implementation, or when user complaints arise.  
**Key rules:** Every flow tested against real user paths · accessibility non-negotiable  
**Output:** UX_SPEC.md + annotated screenshots + accessibility findings.

---

## Operational

### sre-engineer
**What:** CI/CD pipeline design, runbooks, monitoring, incident response.  
**When to use:** Setting up deployment pipelines, writing runbooks, planning observability, post-incident review.  
**Modes:** pipeline · runbook · monitor · incident  
**Output:** CI/CD config + runbook docs + monitoring spec + alert rules.

### container-ops
**What:** Docker/Podman container design, layer optimization, image security.  
**When to use:** When containerizing services, optimizing image sizes, or diagnosing container issues.  
**Key rules:** Multi-stage builds enforced · no secrets in layers · image CVE scan required  
**Output:** Dockerfiles + compose configs + security scan results.

### frontend-design
**What:** Design tokens, component architecture, visual polish, design system governance.  
**When to use:** When establishing a design system, implementing UI from spec, or auditing visual consistency.  
**Key rules:** Uses project's component library · no raw HTML in design-system projects  
**Output:** Design token definitions + component specs + visual audit findings.

---

## Newer specialists

### end-user-simulator
**What:** Persona-driven UAT — walks the live app as a first-time user with zero spec knowledge.  
**When to use:** After a UI is built/changed; produces friction logs + task-completion verdicts.

### llm-integration-engineer
**What:** Design-side LLM-feature expert — prompts, evals, model routing, structured output, RAG.  
**When to use:** Adding or changing LLM-powered functionality (not security — that's owasp-llm-checker).

### release-manager
**What:** Release coordinator — version, changelog, tag, deploy-gate checklist, doc-count audit.  
**When to use:** Cutting a release; prevents version-metadata drift.

### cost-engineer
**What:** Cloud + LLM spend analysis — right-sizing from observed p95, commitments, unit economics. Every recommendation in $/month.
**When to use:** Before scaling decisions, after bill shock, or when cost-per-user is unknown. `/cost`

### analytics-architect
**What:** Telemetry design — RED/USE/golden signals, event taxonomy, OBSERVABILITY.md, dashboards from SLOs.
**When to use:** Phase 3 design, or when nobody can answer "is it working in prod?" `/analytics`

### a11y-compliance
**What:** WCAG 2.2 AA/AAA audit — axe/Lighthouse plus the manual checklist; every finding cites criterion + file:line. EAA/508 applicability.
**When to use:** After UX design (audit the spec) and after implementation (audit the DOM). `/a11y`

### data-steward
**What:** PII classification, GDPR/CCPA/PIPEDA obligations, retention schedules, erasure paths, processor inventory.
**When to use:** Phase 3 (classify the schema before it ships) and any feature touching personal data. `/data-governance`

### reliability-engineer
**What:** Load testing + resilience — failure-mode matrix, k6/Locust plans from NFR numbers, retry budgets, circuit breakers, chaos scenarios.
**When to use:** Phase 3 resilience design and before launch/scaling events. `/reliability`

### Game-dev cluster (`agents/game/`)
Activated by `/sdlc init "<name>" "<desc>" --game`:
- **game-designer** — GDD, core loop, pillars, vertical-slice scoping
- **gameplay-engineer** — engine-grain implementation (frame budget, timestep, determinism)
- **game-balance-designer** — progression/economy, simulates 1000 sessions before shipping numbers
- **level-designer** — player flow, encounters, greybox blockout, pacing beat charts
- **narrative-designer** — story through systems: branching, quests, barks, dialogue data formats
- **game-audio-designer** — sonic direction, SFX/music/VO plan, middleware choice, mix rules
- **game-producer** — build-based lifecycle gates (prototype → slice → alpha → beta → cert → gold), scope control, indie go-to-market
- **playtest-evaluator** — blind-first playtest, 6 fun heuristics
- **game-asset-pipeline** — sprite batch: gen → pixel-snap/transparency cleanup (deterministic scripts) → sprite-sheet pack → portable atlas manifest

---

## Verification & quality gates

### challenger
**What:** Veracity challenger — checks factual claims in high-stakes artifacts with evidence-only verdicts: CONFIRMED / CONTRADICTED / UNVERIFIABLE.  
**When to use:** Automatic on HIGH/CRITICAL findings, onboard Step 6b, and Gates A/B. `/challenge`

### gauntlet-lead
**What:** Gauntlet-loop orchestrator — sets a real reference bar, splits the goal into gradeable units, sends builders (clean context) and blind per-round critics until every unit beats the bar. Never builds, never grades.  
**When to use:** "Make this as good as <named real thing>". `/gauntlet`

### ui-verifier
**What:** Live browser verification with playwright-mcp — screenshots, accessibility snapshots, flows checked against use cases or UX specs. No vision model needed.  
**When to use:** After implementation or for regression checks. `/ui-verify`

### qa-vnv-engineer
**What:** QA / V&V owner — automated, evidence-producing validation of the rendered app: layout-defect detection, visual regression, resilient journey automation.  
**When to use:** Phase 5 Round 1 on UI-bearing projects; whenever "it looks broken" needs proof.

### design-iterator
**What:** Render → screenshot → critique → fix → re-verify loop until a running UI matches its design system (cap 3 iterations); `--sync` extracts a token baseline, `--real` audits logged-in browsers.  
**When to use:** Phase 4 Round 3b, or any UI that drifted from its tokens. `/design-iterate`

---

## Design loop (Phase 3.5 design chain)

These exist as agents, but sdlc-lead does not dispatch them as a phase — they are reached through the ux-engineer HANDOFF's `--auto` note or invoked directly. See [flows/new-project.md](flows/new-project.md).

### ux-researcher
**What:** Turns personas and user stories into user-flow diagrams (`docs/design/flows.md`) and a screen inventory before any wireframe or token work.

### design-system-lead
**What:** Pre-code token spec (`docs/design/tokens.json`) and component inventory (`docs/design/components.md`) that mockups and implementation build from.

### content-designer
**What:** Writes the actual UI text — labels, empty states, errors, confirmations, onboarding copy — as a reviewable spec before implementation.

---

## Documentation & release

### documentation-gap-finder
**What:** Scans source exports against docs — undocumented public functions/classes/endpoints, stale references, coverage percentage.  
**When to use:** Before a public release or contributor onboarding. `/documentation-gap-finder`

### changelog-writer
**What:** Reads a git log range, classifies commits, writes Keep-a-Changelog entries.  
**When to use:** Before any version bump or release tag.

### migration-planner
**What:** Compares two schema states and produces ordered migration steps with a rollback per step.  
**When to use:** Before any schema change touching existing tables; dispatched by Mode 3 Step 2. `/migration-planner`

### End-user guide pipeline (M21)
Runs in order:
- **app-cartographer** — page-graph state inventory + per-state interactive-element inventory of the running app (`APP_MAP.md`, `STORIES.md`); the denominator every guide artifact is graded against. Also Mode 3 Step 1 impact analysis (`/explore`).
- **guide-scribe** — turns STORIES.md into replayable step specs, executes them, captures gated annotated screenshots, triages errors.
- **manual-writer** — assembles the Diátaxis-shaped user manual; never invents a step without a spec + screenshot behind it.

## Notes

- Deep modes (`/sdlc onboard --deep`, `/security --deep`) use the **Ralph Wiggum loop**: 3 iterations max, then escalate. Fix loops (`FIX_VERIFY_LOOP.md`) share the same 3-cycle cap.
- All HANDOFFs follow the canonical format in `agents/shared/HANDOFF_TEMPLATES.md`.
- Confidence scores follow the 1–10 scale in `agents/shared/GATE_SCORING_PROTOCOL.md` (≥7 pass, 5–6 revise, <5 fail).
- For full agent instructions, read the agent file in `agents/<name>.md`.
