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
**What:** Executes the 6-phase new-project pipeline.  
**When to use:** Called automatically by `sdlc-lead` on `/sdlc init`. Do not call directly.  
**Modes:** Phase 0 (ideation) → Phase 1 (planning) → Phase 2 (requirements) → Phase 3 (design) → Phase 4 (implementation) → Phase 5 (release)  
**Output:** Full SDLC document set + working implementation.

### sdlc-onboard-mode
**What:** Understands an existing codebase at three depth levels.  
**When to use:** Called by `sdlc-lead` on `/sdlc onboard`. Do not call directly.  
**Modes:** quick (30min) · default (2-3h) · deep (full audit)  
**Output:** CODEBASE_MAP.md, MODULE_DESIGN.md, gap list, improvement plan.

### sdlc-feature-mode
**What:** Adds a single feature to an existing codebase safely.  
**When to use:** Called by `sdlc-lead` on `/sdlc feature`. Do not call directly.  
**Modes:** 5 steps: discover → design → implement → verify → document  
**Output:** Implemented feature + updated docs + passing tests.

### sdlc-improve-mode
**What:** Parallel specialist audits across UX, code quality, performance, and security.  
**When to use:** Called by `sdlc-lead` on `/sdlc improve`. Can target a single area with `--focus`.  
**Modes:** `/sdlc improve` · `/sdlc improve --focus security` · `/sdlc improve --focus ux`  
**Output:** Ranked finding list + prioritized fix HANDOFFs.

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

### Game-dev cluster (`agents/game/`)
Activated by `/sdlc init "<name>" "<desc>" --game`:
- **game-designer** — GDD, core loop, pillars, vertical-slice scoping
- **gameplay-engineer** — engine-grain implementation (frame budget, timestep, determinism)
- **game-balance-designer** — progression/economy, simulates 1000 sessions before shipping numbers
- **playtest-evaluator** — blind-first playtest, 6 fun heuristics

## Notes

- All specialist agents use the **Ralph Wiggum loop**: 3 iterations max, then escalate.
- All HANDOFFs follow the canonical format in `agents/shared/HANDOFF_TEMPLATES.md`.
- Confidence scores follow the unified 1-10 scale in `references/confidence-scale.md` (to be created — see IMPROVEMENT_BACKLOG.md A5).
- For full agent instructions, read the agent file in `agents/<name>.md`.
