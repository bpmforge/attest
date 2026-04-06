# Expert Guide — How Each Agent Works

This document explains each expert agent's methodology, when to use them, and what they produce.

---

## SDLC Lead (`/sdlc`)

**Role:** Program manager and lead architect. Orchestrates the full software development lifecycle.

**When to use:**
- Starting a new project from scratch
- Understanding an existing codebase you've never seen
- Adding a feature to a running system

**How it thinks:**
- What mode are we in? (New project, existing codebase, feature addition)
- Which expert does this need? (Delegates, never does technical work itself)
- What engineering artifacts exist? What's missing?
- Is the architecture modular?

**Three modes:**
1. **`/sdlc init`** — New project through 6 phases: Ideation → Planning → Requirements → Design → Implementation → Review
2. **`/sdlc onboard`** — Reverse-engineer codebase, produce architecture docs, onboarding guide
3. **`/sdlc feature`** — Impact analysis → Design → Implement → Verify → Document

**Produces:** VISION.md, SCOPE.md, RISKS.md, SRS.md, ARCHITECTURE.md, and more

**Delegates to:** Every other expert as needed

---

## Security Auditor (`/security`)

**Role:** Senior security engineer performing professional security assessments.

**When to use:**
- Before shipping to production
- After adding authentication/authorization code
- When handling user input, file uploads, or external data
- Periodic security audits

**How it thinks:**
- What data is most valuable? (credentials, PII, financial)
- Where does user input enter the system?
- What would a breach cost?
- What's the simplest exploit path?

**Methodology:**
1. Map the attack surface (entry points, trust boundaries)
2. Run dependency audits (`npm audit`, etc.)
3. Grep for vulnerability patterns (SQL injection, XSS, command injection)
4. Systematic OWASP Top 10 review
5. Verify every finding against actual code (no false positives)
6. Report with severity, evidence, and remediation

**Produces:** Security audit report with findings by severity

**Reference docs used:** `owasp-checklist.md`, `severity-matrix.md`, `report-template.md`

---

## Researcher (`/research`)

**Role:** Professional research analyst. Evidence-based investigation with citations.

**When to use:**
- Choosing between technologies or frameworks
- Competitive analysis for a new product
- Understanding a domain before designing
- Evaluating feasibility of an approach

**How it thinks:**
- What decision hangs on this research?
- What would change the recommendation?
- Am I confirming a bias or genuinely exploring alternatives?

**Methodology:**
1. Define specific research questions
2. Search primary sources first (official docs, specs)
3. Cross-reference with expert analysis and community data
4. Evaluate source authority and recency
5. Synthesize findings with confidence levels
6. Produce structured report with citations

**Produces:** Research report with executive summary, findings, recommendations, sources

---

## Test Engineer (`/test-expert`)

**Role:** Senior test engineer covering unit, integration, and e2e testing.

**When to use:**
- Designing test strategy for a new project
- Writing tests for existing code
- Analyzing test coverage gaps
- Setting up Playwright e2e tests

**Methodology:**
1. Understand the codebase and existing test patterns
2. Identify what's tested and what's not (coverage analysis)
3. Design test strategy (unit, integration, e2e boundary)
4. Write tests following existing patterns
5. Verify tests actually catch regressions

**Produces:** Test strategy document, test files, coverage report

**Reference docs used:** `playwright-config.md`

---

## Database Architect (`/dba`)

**Role:** Senior database architect focused on schema design and query optimization.

**When to use:**
- Designing a new database schema
- Creating migrations for schema changes
- Optimizing slow queries
- Reviewing indexing strategy

**How it thinks:**
- How big will this table get?
- What queries run hot?
- Who modifies this data and when?
- What happens on cascade delete?

**Methodology:**
1. Understand existing schema and access patterns
2. Design schema with ERD diagrams
3. Plan indexes based on query patterns
4. Write migrations (always reversible)
5. Verify with EXPLAIN ANALYZE

**Produces:** ERD diagrams, CREATE TABLE DDL, migration files, index recommendations

---

## UX Engineer (`/ux`)

**Role:** Senior UX engineer focused on user workflows and accessibility.

**When to use:**
- Designing user interfaces and workflows
- Reviewing existing UI for usability issues
- Accessibility audits (WCAG 2.2)
- Component architecture decisions

**Methodology:** Nielsen Norman heuristic evaluation, task analysis, accessibility checklist

**Produces:** User flow diagrams, component architecture, accessibility findings

---

## SRE Engineer (`/devops`)

**Role:** Senior Site Reliability Engineer.

**When to use:**
- Setting up CI/CD pipelines
- Designing monitoring and alerting
- Creating operational runbooks
- Incident response planning
- Deployment strategy design

**Produces:** CI/CD configuration, monitoring dashboards, runbooks, deployment docs

---

## Container Expert (`/containers`)

**Role:** Container operations specialist.

**When to use:**
- Building Dockerfiles
- Setting up docker-compose / podman-compose
- Container networking issues
- Image optimization (multi-stage builds, size reduction)
- Container debugging

**Produces:** Dockerfiles, compose files, networking diagrams, optimization recommendations

---

## Code Reviewer (`/review-code`)

**Role:** Code quality expert focused on maintainability.

**When to use:**
- After implementing a feature
- During pull request review
- Tech debt assessment
- Codebase consistency check

**How it thinks:**
- Is this the simplest solution?
- Does it follow established codebase patterns?
- Could a new team member understand this in 30 minutes?
- What happens when requirements change?

**Checks:** Complexity (functions >50 lines), nesting depth (>3), pattern consistency, naming, error handling, dead code, duplication

**Produces:** Review report with findings by severity, specific fix recommendations

---

## Performance Engineer (`/perf`)

**Role:** Performance profiling and optimization expert.

**When to use:**
- Investigating slowness
- Establishing performance baselines
- Optimizing identified bottlenecks
- Verifying performance against NFR targets

**Rule:** Never optimize without measuring first.

**Produces:** Benchmark results, profiling data, optimization recommendations with before/after metrics

---

## API Designer (`/api-design`)

**Role:** API design expert for REST and GraphQL.

**When to use:**
- Designing new API endpoints
- Reviewing API consistency
- Planning API versioning strategy
- Writing API documentation

**Produces:** Endpoint specifications, OpenAPI contracts, versioning strategy, consistency audit

**Reference docs used:** `rest-api-checklist.md`
