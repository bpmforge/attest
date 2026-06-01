---
description: 'Mode 1 — Phase 4 & 5: Implementation and Release. Parallel coding waves, module branching, runtime gates, PR merges, release. Loaded on demand by sdlc-init-mode.md when entering Phase 4.'
mode: "subagent"
---

# Mode 1 — Phase 4 & 5: Implementation + Release

> Load only when sdlc-init-mode.md directs you here for Phase 4 or Phase 5.
> Mandatory rules (loop prevention, document hygiene, OpenCode delegation) live in sdlc-init-mode.md.
> **task() → HANDOFF reminder:** Any `task(agent="X", ...)` = emit a HANDOFF block, save state, wait for user.

## Phase 4: Implementation — BUILD it

Delegate implementation work via HANDOFF. Supports two execution modes — always ASK THE USER which mode they want before emitting Wave 1 HANDOFFs.

### Execution Mode Selection (Mandatory First Step)

Read `docs/PARALLELIZATION_MAP.md`. Present the **full parallel opportunity map** to the user — not just waves, but every dimension of parallelism available:

```
Phase 4 execution plan (from docs/PARALLELIZATION_MAP.md):

IMPLEMENTATION WAVES (can be S or P per wave):
  Wave 0: Design System [always S — foundation, must complete first if UI-bearing]
  Wave 1: [shared-types or foundation modules] — 1 module [recommend S]
  Wave 2: [module-A, module-B] — N modules, parallel-safe (no mutual deps)
  Wave 3: [module-C, module-D] — N modules, parallel-safe (no mutual deps)
  ...

INFRASTRUCTURE WAVES (parallel-safe alongside Wave N — no code overlap):
  IaC Scaffolding:  can start once ARCHITECTURE.md is frozen (runs alongside Wave N)
  CI/CD Pipeline:   can start once IaC is ready (runs alongside Wave N)

REVIEW ROUNDS (always parallel regardless of wave mode):
  Within every wave, Round 2 reviews fan out in parallel:
  code-reviewer + [security if auth/input touched] + [perf if DB/loops touched] + [ux if UI touched]
  ALL emitted in ONE message. You open N sessions concurrently.

Which execution mode per wave? [S = sequential / P = parallel]
  Wave 1: __ (recommended: S — only 1 module or shared foundation)
  Wave 2: __ (safe to parallelize — modules are independent)
  Wave N: __
  IaC:    S (1 agent, always sequential within itself)
  CI/CD:  S (1 agent, always sequential within itself)

Default if no answer: S for all. You can change per wave.
```

Record choices in `docs/work/sdlc-state.md`:
```
Phase 4 execution plan:
  Wave 1: [S|P] — [modules]
  Wave 2: [S|P] — [modules]
  Infrastructure: IaC runs alongside Wave [N], CI/CD runs alongside Wave [N]
```

---

### Sequential Wave — Round 1/2/3 per module

Sequential mode processes one module at a time, but **each module goes through the same 3-round lifecycle as parallel mode**. The rounds are identical — the only difference is you open one session at a time instead of N concurrently.

**For each module in the wave (one at a time):**

**Round 1 — Code:**
Emit one coding-agent HANDOFF for this module. Wait for completion phrase. Run:
```bash
./scripts/validators/run-handoff-gates.sh \
  --scope src/<module> \
  --manifest docs/reviews/MANIFEST_<module>_<date>.md \
  --runtime
```
If gate fails → return gap to coding-agent with REVISE. Repeat up to 3 times.

**Round 2 — Review (always parallel, even in sequential wave mode):**
Emit ALL triggered review HANDOFFs in ONE message:
```
---
  <MODULE> — ROUND 2: REVIEW (open N sessions concurrently)
---
[code-reviewer HANDOFF — always]
[security-auditor HANDOFF — if auth/input/credentials touched]
[performance-engineer HANDOFF — if DB queries/loops/caching touched]
[ux-engineer HANDOFF — if any UI file touched]
```
Wait for all completion phrases. Synthesize `docs/reviews/FIX_BACKLOG_<module>_<date>.md`. Run Fix-Verify Loop (see `agents/shared/FIX_VERIFY_LOOP.md`) — up to 3 iterations, escalate if still failing.

**Round 3 — Runtime:**
Emit one runtime-validation HANDOFF scoped to this module. Produces `docs/reviews/RUNTIME_<module>_<date>.md`. Completion phrase: `"runtime done — <module>: [PASS or FAIL]"`.
If FAIL → fix module → re-run. RUNTIME PASS is required before moving to the next module.

**Module gate (before next module):**
1. RUNTIME_<module>.md shows PASS
2. FIX_BACKLOG_<module>.md has 0 open CRITICAL/HIGH (or signed waivers)
3. run-handoff-gates.sh scope check clean
→ Only then emit Round 1 for the next module in the wave.

### Parallel Wave (opt-in) — each module runs its own full mini-lifecycle

When the user selects parallel mode `[P]` for a wave, load the full protocol:

```
read(filePath="~/.config/opencode/agents/sdlc/PARALLEL_WAVE_PROTOCOL.md")
```

The protocol defines: Round 1 (N parallel code HANDOFFs), Round 2 (N parallel review HANDOFFs + Fix-Verify Loop per module), Round 3 (N parallel runtime-validation HANDOFFs), wave gate, and when to refuse parallel and force sequential.

**Quick rule (memorize — don't need to re-load):** Save state → emit ONE message per round with all N module HANDOFFs → wait for ALL completion phrases before advancing to next round → wave gate before Wave N+1.

Delegate implementation work via HANDOFF — one specialist at a time within a sequential wave, or three rounds of N HANDOFFs in a parallel wave.

**0. Design system — Wave 0 (UI-bearing projects only, BEFORE any feature coding):**

If the project is UI-bearing (docs/design/UX_SPEC.md exists), Wave 0 must complete before any coding waves start. Coding agents building feature UI need the design system to exist so they import from it rather than inventing their own tokens and components.

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 1 / Phase: 4 — Wave 0 (Design System)
Last completed: Phase 3.5 gate passed, Human Approval Gate B confirmed
Awaiting: frontend-design — design system implementation
Next after resume: run handoff gates (validate-design-system), then test strategy
")
```

Use **Template 10** from `~/.config/opencode/agents/shared/HANDOFF_TEMPLATES.md` for this HANDOFF.

→ After "frontend done": run `./scripts/validators/run-handoff-gates.sh --scope src/components --scope src/styles --scope src/theme --manifest <manifest> --coverage validate-design-system.sh` → mark DONE

**Wave 0 must pass before Wave 1 coding begins.** The design system is the foundation for all feature UI — no exceptions.

**1. Test strategy confirmation — before any code:**

TEST_DESIGN.md from Phase 3.5 already defines what to test and how. Phase 4 begins with test-engineer confirming the framework setup and tooling choices so coding agents write tests in the right format from day one.

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 1 / Phase: 4 — Implementation
Last completed: Phase 3.5 gate passed, Human Approval Gate B confirmed
Awaiting: test-engineer — docs/TEST_STRATEGY.md (framework setup confirmation)
Next after resume: db-architect migrations handoff
")
```

```
---
  HANDOFF → test-engineer
---
Open a new OpenCode conversation and paste this EXACT prompt to /test-expert:

SDLC-TASK for test-engineer:

CONTEXT (read these before starting):
- docs/testing/TEST_DESIGN.md — detailed test cases already defined (unit/integration/e2e/security)
- docs/ARCHITECTURE.md — module structure and critical paths
- docs/TECH_STACK.md — tech stack to select test frameworks from

YOUR TASK:
TEST_DESIGN.md already defines what to test. Your task is to produce a test strategy
AND the E2E test infrastructure config files so coding agents write tests in the
right format from day one. Do NOT re-derive what to test — focus on HOW.

**For Playwright projects (most web apps), PRODUCE ALL of these files:**
- docs/TEST_STRATEGY.md — framework choices, coverage targets, naming conventions,
  UC-ID naming rule (describe: "UC-NNN: <name>", it: "AC-N: <criterion>")
- playwright.config.ts — with JSON reporter (test-results.json), retries, screenshot,
  baseURL, globalSetup, storageState auth project (see test-engineer.md Playwright section)
- e2e/auth.setup.ts — saves storageState to e2e/.auth/user.json
- e2e/fixtures.ts — test.extend() with api helper for test data setup/teardown
- e2e/global-setup.ts — DB reset + seed before test run
- e2e/pages/BasePage.ts — Page Object Model base class
- .github/workflows/e2e.yml (or .gitea/workflows/e2e.yml) — CI pipeline that runs
  playwright, uploads playwright-report/ and test-results.json artifacts
- Update docs/testing/TEST_DESIGN.md § Test Infrastructure — fill in framework choice,
  JSON reporter path (test-results.json), auth fixture approach

**For non-Playwright projects (backend/CLI/library), PRODUCE:**
- docs/TEST_STRATEGY.md with the above framework and scaffold information
- jest.config.ts or vitest.config.ts with --json output to test-results.json
- CI workflow with test step

Refer to test-engineer.md § Playwright Infrastructure for canonical templates.
These files are checked by validate-e2e-setup.sh at the Phase 4 gate.

When all files are written, print exactly:
"test-strategy done — [frameworks chosen, E2E infrastructure configured, CI pipeline defined]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

**2. Implementation — after "test-strategy done":**

Branch on the execution mode the user chose during Execution Mode Selection (read `docs/work/sdlc-state.md` to confirm per-wave choice).

### Sequential mode (one wave at a time, one agent at a time within a wave)

Use the IMPLEMENTATION CHECKPOINT block below as-is for the whole codebase, OR iterate through `docs/PARALLELIZATION_MAP.md` emitting ONE coding-agent HANDOFF per module, waiting for "done" + verification ≥ 7 before the next. Either works in sequential mode — pick whichever the user preferred.

### Parallel mode (opt-in per wave)

**Do NOT use the single-shot IMPLEMENTATION CHECKPOINT block below in parallel mode.** Instead, for each wave marked `[P]` in `docs/PARALLELIZATION_MAP.md`:

1. Save state:
   ```
   write(filePath="docs/work/sdlc-state.md", content="
   Mode: 1 / Phase: 4 — Wave [N] (parallel)
   Last completed: Wave [N-1] verified
   Awaiting: coding-agent × [M modules] — see HANDOFFs below
   Next after resume: verify each, gate wave, advance to Wave [N+1]
   ")
   ```

2. Emit ONE message containing every module's HANDOFF to `coding-agent` — one block per module. Each HANDOFF MUST:
   - Name the module's directory as the exclusive write-scope (e.g. "Write-scope: `src/auth/` ONLY — do NOT edit files outside this directory")
   - List the frozen contracts the module must conform to (OpenAPI section, interface file, event schema)
   - Tell the agent other wave-peers are running concurrently — cross-module edits MUST be flagged as deferred, never edited
   - Use the standard "PRODUCE exactly these files" + "print exactly [phrase]. Then stop." structure
   - Use a unique completion phrase per module (e.g. `"coding-agent done — auth module: [summary]"`) so you can match them on return

3. Wave gate (before advancing to Wave N+1):
   - Every agent in the wave has printed its completion phrase
   - Run the "Resuming after a HANDOFF" protocol on each output individually — score ≥ 7 on each
   - Write-scope collision check: `git status` — no two agents touched the same file (if yes, surface to user, resolve before advancing)
   - Update DELEGATION_LOG with one row per module
   - Update PARALLELIZATION_MAP.md to mark the wave DONE

4. Only AFTER all wave gates pass, advance to Step 2b (E2E tests). Waves 1..N must all be verified before E2E, not just the last one.

### IMPLEMENTATION CHECKPOINT — Sequential mode only

The test plan is ready. The design docs are complete. Time to build.

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 1 / Phase: 4
Last completed: docs/TEST_STRATEGY.md
Awaiting: developer — implementation complete
Next after resume: DB migrations, then expert reviews
")
```

```
---
  IMPLEMENTATION CHECKPOINT
---
Time to implement. Your design documents are the spec:

  Tech stack:      docs/TECH_STACK.md    (language, framework, libraries — MANDATORY constraint)
  Architecture:    docs/ARCHITECTURE.md  (structure, patterns, DI)
  Requirements:    docs/SRS.md + docs/USER_STORIES.md
  API contracts:   docs/API_DESIGN.md    (endpoints, shapes, auth)
  DB schema:       docs/DATABASE.md      (tables, migrations, indexes)
  Test plan:       docs/TEST_STRATEGY.md (write tests alongside code)

Tech stack constraint: use ONLY the libraries and frameworks listed in TECH_STACK.md.
Do not introduce unlisted dependencies — flag deviations instead of silently adopting them.

Build rule: feature-sliced structure, interfaces before implementations,
no god functions (keep under 50 lines per function).
Write tests alongside each module — not after.

When implementation is complete, come back and say: "implementation done"
---
```

After "implementation done":
1. Verify the codebase directory structure matches ARCHITECTURE.md § Implementation View
2. Verify test files exist alongside the implementation (not zero test files)
3. Proceed to E2E test writing and discovery audit below

**2b. E2E test writing — MANDATORY before expert reviews:**

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 1 / Phase: 4
Last completed: implementation
Awaiting: test-engineer — E2E test specs for P0 use cases
Next after resume: discovery audit, then expert reviews
")
```

```
---
  HANDOFF → test-engineer
---
Open a new OpenCode conversation and paste this EXACT prompt to /test-expert:

SDLC-TASK for test-engineer:

CONTEXT (read these before starting):
- docs/testing/USE_CASES.md — all use cases with personas and flows
- docs/testing/TEST_DESIGN.md — E2E scenarios section (Phase 3.5 output — use these as spec)
- docs/TEST_STRATEGY.md — framework choices, test scaffold, naming conventions
- docs/API_DESIGN.md — endpoint contracts for API-level tests

YOUR TASK:
Write E2E test specs for ALL P0 use cases defined in TEST_DESIGN.md § E2E Scenarios. For each P0:
create a Playwright (or framework from TEST_STRATEGY.md) test file that
exercises the main flow end-to-end. Use a shared fixtures helper for
login, data creation, and cleanup.

**Naming convention (MANDATORY for traceability):**
- Top-level describe block:  — exact UC-ID from USE_CASES.md
- Each it/test:  — maps to a specific
  Given/When/Then step from the use case acceptance criteria

Example:
```ts
describe("UC-003: User Login", () => {
  it("AC-1: redirects to dashboard on valid credentials", async () => { ... })
  it("AC-2: shows error on invalid password", async () => { ... })
})
```

Each test must:
- Create its own fixture data (self-contained, no shared state between tests)
- Exercise the exact flow steps from the use case main flow
- Assert the success criteria from the use case
- Include a clean check (no console errors, no 5xx responses)
- Clean up after itself

After all tests are written and run, produce the UC verification summary:
```
UC VERIFICATION SUMMARY
UC-001: [N tests] — PASS / FAIL — [failing test names if any]
UC-002: [N tests] — PASS / FAIL
...
Overall: M/N use cases fully verified
```

PRODUCE exactly these files:
- e2e/use-cases/_fixtures.ts (or equivalent) — shared helpers for login,
  API calls, model creation, clean check
- e2e/use-cases/*.spec.ts — one per P0 use case, describe named "UC-NNN: <name>"
- Update docs/testing/TEST_PLAN.md — mark each P0 with its test file path and PASS/FAIL
- Run:  (or pytest equivalent) so the
  validate-tests-mapping.sh gate can produce UC-level pass/fail verdicts

When all files are written and tests have been run, print exactly:
"e2e-tests done — [N tests written, M/N use cases verified, key failures listed]"
Then stop. Do not ask for follow-up. Do not run additional phases.

---
```

→ After "e2e-tests done":
1. Read the pass/fail report
2. If < 80% passing: surface failures to user, ask whether to fix before proceeding
3. If >= 80% passing: proceed to discovery audit

**2c. Discovery audit — find what's broken before reviews (HANDOFF):**

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 1 / Phase: 4
Last completed: E2E tests written
Awaiting: test-engineer (or ux-engineer if UI-bearing) — discovery audit
Next after resume: DB migrations, then expert reviews
")
```

```
---
  HANDOFF → test-engineer   [or /ux if UI-bearing]
---
Open a new OpenCode conversation and paste this EXACT prompt:

SDLC-TASK for test-engineer:

CONTEXT (read these before starting):
- docs/testing/USE_CASES.md — routes and flows to visit
- docs/ARCHITECTURE.md — services and their ports
- A running instance of the app (dev or prod) — the user will provide the URL

YOUR TASK:
Run a discovery audit on the running application. Navigate every page/route
the app exposes. For each route, check for console errors, 4xx/5xx responses,
visible error text, and slow loads (>3s). This is ground truth before expert
reviews — do not fix anything, just record findings.

PRODUCE exactly this file:
- docs/audits/discovery-<YYYY-MM-DD>.md — one section per route with:
  HTTP status, console errors observed, visible error text, load time, severity
  (CRITICAL if 5xx or page doesn't render / HIGH if 4xx or visible error /
  MEDIUM if console warnings / LOW if slow load only). End with a summary table.

When the file is written, print exactly:
"discovery done — [one sentence: N routes checked, M critical, K high]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

→ After "discovery done":
- If any CRITICAL findings: surface to user, fix via coding-agent HANDOFF before proceeding to reviews
- If only MEDIUM/LOW: note and proceed
- Do NOT navigate the app yourself — the specialist owns this

**GATE: E2E tests + discovery must both be clean before expert reviews start.**

**3. DB migrations:**

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 1 / Phase: 4
Last completed: implementation + tests
Awaiting: db-architect — migration files
Next after resume: api-designer contract verification
")
```

```
---
  HANDOFF → db-architect
---
Open a new OpenCode conversation and paste this EXACT prompt to /dba:

SDLC-TASK for db-architect:

CONTEXT (read these before starting):
- docs/DATABASE.md — complete schema with all tables, columns, and relationships

YOUR TASK:
Generate migration files for every table defined in docs/DATABASE.md. Each
migration must have both an up (create/alter) and a down (rollback). Verify
the migrations would run cleanly in order with no dependency issues.

PRODUCE exactly these:
- db/migrations/ — one migration file per table/change, numbered sequentially
  (e.g. 001_create_users.sql, 002_create_orders.sql)
- docs/reviews/DB_MIGRATION_<date>.md — verification report confirming each
  migration runs cleanly, with any issues found and how they were resolved

When all files are written, print exactly:
"db done — [one sentence: how many migrations generated and any notable issues]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

**3. API contract verification:**

```
---
  HANDOFF → api-designer
---
Open a new OpenCode conversation and paste this EXACT prompt to /api-design:

SDLC-TASK for api-designer:

CONTEXT (read these before starting):
- docs/API_DESIGN.md — the agreed API contracts
- The implemented route/handler files in the codebase (search src/ for route definitions)

YOUR TASK:
Verify that every endpoint in the implemented codebase matches its contract in
docs/API_DESIGN.md. For each endpoint, check: HTTP method, path, request body
schema, response shapes, and auth requirements. Flag any drift.

PRODUCE exactly this file:
- docs/reviews/API_CONTRACT_REVIEW_<date>.md — for each endpoint: MATCH or DRIFT,
  with specific differences noted (e.g. "POST /users returns 200 but contract says 201"),
  and a summary table of all endpoints with pass/fail status

When the file is written, print exactly:
"api done — [one sentence: how many endpoints checked, how many drifted]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

**4. Container config:**

```
---
  HANDOFF → container-ops
---
Open a new OpenCode conversation and paste this EXACT prompt to /containers:

SDLC-TASK for container-ops:

CONTEXT (read these before starting):
- docs/ARCHITECTURE.md — all services, their ports, and dependencies
- docs/TECH_STACK.md — language, runtime, and framework versions

YOUR TASK:
Write production-ready container configuration for [project]. Use multi-stage
builds to minimize image size. Include health checks for every service. Use the
exact runtime versions from docs/TECH_STACK.md.

PRODUCE exactly these files:
- Dockerfile — multi-stage build (build stage + minimal runtime stage)
- docker-compose.yml — all services from ARCHITECTURE.md with correct ports,
  volumes, environment variables, health checks, and service dependencies
- .dockerignore — exclude node_modules, build artifacts, .env files, docs

When all files are written, print exactly:
"containers done — [one sentence: services configured and final image size estimate]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

**5. IaC scaffolding + CI/CD — Infrastructure Wave (parallel-safe with last coding wave):**

IaC and CI/CD have no write-scope overlap with application code modules. They can run alongside the LAST coding wave in the PARALLELIZATION_MAP, not after it. Emit both HANDOFFs in ONE message alongside Wave N coding HANDOFFs.

```
---
  INFRASTRUCTURE WAVE — runs in parallel with coding Wave [N]
---
Open 2 additional sessions alongside your Wave [N] coding sessions:

[IaC HANDOFF — sre-engineer, Template 9]
[CI/CD HANDOFF — sre-engineer, Template below]
```

Wait for both `"sre done — IaC..."` and `"devops done — ..."` completion phrases. The infrastructure wave does NOT block coding Wave N — they run concurrently.

**IaC scaffolding (HANDOFF — own wave, parallel-safe with other infrastructure-only work):**

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 1 / Phase: 4
Last completed: container config
Awaiting: sre-engineer — IaC scaffolding in infra/
Next after resume: CI/CD pipeline
")
```

```
---
  HANDOFF → sre-engineer
---
Open a new OpenCode conversation and paste this EXACT prompt to /devops:

SDLC-TASK for sre-engineer:

CONTEXT (read these before starting):
- docs/INFRASTRUCTURE.md — the topology to provision (environments, compute, data, networking)
- docs/TECH_STACK.md — runtime versions and build tooling
- docs/ARCHITECTURE.md — service names and port assignments

YOUR TASK:
Produce Infrastructure-as-Code scaffolding for [project] based on docs/INFRASTRUCTURE.md.
Auto-detect the appropriate IaC tool (Terraform preferred; Helm if Kubernetes is the
target; CloudFormation if AWS-only and no Terraform preference stated in DESIGN_CONTEXT.md).

PRODUCE exactly these:
- infra/ — IaC directory structure:
  - infra/main.[tf|yaml|json] — root entry point declaring all resources
  - infra/variables.[tf|yaml] — all configurable inputs with descriptions and types
  - infra/outputs.[tf|yaml] — all outputs (URLs, ARNs, connection strings)
  - infra/envs/staging/ — staging-specific variable values
  - infra/envs/prod/ — production-specific variable values
  - infra/README.md — what this IaC provisions, how to run it, references docs/INFRASTRUCTURE.md
- docs/reviews/MANIFEST_iac_<date>.md — completion manifest

Requirements:
- No hardcoded credentials — all secrets via variables + secrets manager references
- All resources tagged with environment and project name
- Staging and prod configs MUST differ (prod gets HA/multi-AZ where applicable)
- `terraform validate` (or equivalent) must pass before printing completion phrase

When all files are written, print exactly:
"sre done — IaC scaffolding: [tool used, N resources, staging + prod configs]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

→ After "sre done": run `./scripts/validators/run-handoff-gates.sh --scope infra --manifest docs/reviews/MANIFEST_iac_<date>.md --coverage validate-iac.sh` → mark DONE

**6. CI/CD pipeline:**

```
---
  HANDOFF → sre-engineer
---
Open a new OpenCode conversation and paste this EXACT prompt to /devops:

SDLC-TASK for sre-engineer:

CONTEXT (read these before starting):
- docs/TECH_STACK.md — language, package manager, test command, build command
- docs/ARCHITECTURE.md — deployment targets and infrastructure

YOUR TASK:
Write a CI/CD pipeline for [project]. The pipeline must run on every PR and
main branch push. Include stages in this order: lint → test → build →
security scan → deploy. Use the commands from docs/TECH_STACK.md. Target
the deployment environment described in docs/ARCHITECTURE.md.

PRODUCE exactly these files:
- .github/workflows/ci.yml OR .gitea/workflows/ci.yml — the complete pipeline
  with all stages, correct triggers (push to main, pull_request), and environment
  variables (referenced as secrets, not hardcoded)

When the file is written, print exactly:
"devops done — [one sentence: pipeline stages included and deploy target]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

**6. Security audit (after each significant feature):**

```
---
  HANDOFF → security-auditor
---
Open a new OpenCode conversation and paste this EXACT prompt to /security:

SDLC-TASK for security-auditor:

CONTEXT (read these before starting):
- The implemented [feature/module] files (listed in the impact analysis)
- docs/API_DESIGN.md — endpoint auth requirements for this feature
- docs/THREAT_MODEL.md — known threats this feature should guard against

YOUR TASK:
Audit [feature/module] for OWASP Top 10 vulnerabilities. Focus on: auth and
access control (A01), injection vectors in user inputs (A03), and any
authentication failures (A07). For each finding include a verbatim code quote
with file:line, a severity rating, and a specific fix recommendation.

PRODUCE exactly this file:
- docs/reviews/SECURITY_<feature>_<date>.md — findings sorted by severity
  (CRITICAL first), each with: description, file:line code quote, severity,
  and concrete fix. Plus a summary table of all findings.

When the file is written, print exactly:
"security done — [one sentence: findings count by severity]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

**7. Code review (after each feature):**

**PRE-REVIEW GATE:** Before handing off to code-reviewer, verify:
- All P0 E2E tests pass (from step 2b)
- Discovery audit has no critical findings (from step 2c)
- If either fails, fix first — don't waste reviewer time on broken code

```
---
  HANDOFF → code-reviewer
---
Open a new OpenCode conversation and paste this EXACT prompt to /review-code:

SDLC-TASK for code-reviewer:

CONTEXT (read these before starting):
- The [feature/module] source files (from the impact analysis)
- docs/ARCHITECTURE.md — patterns and structure this code should follow

YOUR TASK:
Run an 8-dimension code health review on [feature/module]. The 8 dimensions are:
complexity, duplication/DRY, error handling (silent failures), type safety,
pattern consistency, naming quality, comment accuracy, and anti-slop (AI code hygiene). For each finding
include the file:line and a specific fix.

PRODUCE exactly this file:
- docs/reviews/CODE_REVIEW_<feature>_<date>.md — findings per dimension with
  file:line references, severity (CRITICAL/HIGH/MEDIUM/LOW), and a verdict:
  APPROVED / APPROVED WITH SUGGESTIONS / NEEDS REVISION / REJECT

When the file is written, print exactly:
"review done — [one sentence: verdict and most critical finding]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

**8. Git — three explicit steps, in order:**

**8a. Create branch + push + draft PR immediately (before code is written):**
```
task(agent="git-expert", prompt="--feature mode: cut branch feat/<project-slug>/<module-slug> from main, push to origin + github, create draft PR titled 'feat(<module>): implement <module name>' on both Gitea and GitHub. Do NOT wait for code — draft PR activates CI from the first commit and keeps work visible. Report the branch name and PR URLs.", timeout=60)
```

**8b. Commit atomically as work completes (after coding-agent HANDOFF returns):**
```
task(agent="git-expert", prompt="--feature mode (commit phase): analyze the diff for feat/<project-slug>/<module-slug>. Split into atomic conventional commits — one per logical unit (e.g., 'feat(<module>): add data model and migration', 'test(<module>): cover <module> edge cases'). Use git add -p for partial staging if needed. Each commit must leave tests green. Push after committing.", timeout=120)
```

**8c. Mark PR ready + merge (only after RUNTIME PASS + reviews APPROVED + CI green):**
```
task(agent="git-expert", prompt="--feature mode (merge phase): verify docs/reviews/RUNTIME_<module>_<date>.md shows PASS, FIX_BACKLOG_<module>_<date>.md has no open merge-blocking rows, CODE_REVIEW_<module>_<date>.md is APPROVED, and CI checks are green on the PR. If all conditions met: mark the draft PR as ready, merge with squash merge, delete the branch. If any condition fails: report which gate is blocking and stop.", timeout=120)
```

**9. Performance (only if NFRs flag perf requirements):**

```
---
  HANDOFF → performance-engineer
---
Open a new OpenCode conversation and paste this EXACT prompt to /perf:

SDLC-TASK for performance-engineer:

CONTEXT (read these before starting):
- docs/SRS.md — NFR performance targets (response time, throughput, etc.)
- The [specific endpoint/query] implementation files

YOUR TASK:
Profile [specific endpoint/query] and verify it meets the NFR targets in
docs/SRS.md. Measure the current baseline first — do not optimize without
measuring. If it misses a target, optimize and re-measure to show the
before/after delta.

PRODUCE exactly this file:
- docs/reviews/PERF_<date>.md — baseline measurements, NFR targets from SRS.md,
  pass/fail per target, any optimizations applied with before/after numbers

When the file is written, print exactly:
"perf done — [one sentence: which NFR targets passed/failed]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

**Your role:**
- Track components: implemented vs pending
- Ensure modular structure matches ARCHITECTURE.md
- Ensure tests written alongside code (not after)
- Verify each module has: interface, implementation, tests
- Gate PRs: code review + security check before merge

### Phase 4 Pre-Gate Checklist (run before validate-phase-gate.sh phase-4)

Before running the Phase 4 gate, verify all waves and infrastructure work are complete:

```
PHASE 4 PRE-GATE CHECK

Implementation waves (from docs/PARALLELIZATION_MAP.md):
  Wave 1 [modules]: ✓/✗ DONE
  Wave 2 [modules]: ✓/✗ DONE
  ...
  Wave N [modules]: ✓/✗ DONE

Per-wave verification:
  Every module has RUNTIME_<module>_<date>.md with PASS verdict: ✓/✗
  Every module FIX_BACKLOG has 0 open CRITICAL/HIGH: ✓/✗
  Every module PR has CI checks green (gh pr checks / tea pr view): ✓/✗

Infrastructure wave:
  IaC scaffolding: ✓/✗ DONE (infra/ exists, validate-iac.sh passes)
  CI/CD pipeline:  ✓/✗ DONE (.github/workflows/ci.yml or .gitea/workflows/ci.yml exists)

Design system (if UI-bearing):
  Wave 0 DESIGN_SYSTEM.md: ✓/✗ DONE (validate-design-system.sh passes)

ALL ✓ → run: ./scripts/validators/run-coverage-loop.sh phase-4
ANY ✗ → fix the gap before running the gate
```

The coverage loop (`run-coverage-loop.sh phase-4`) chains: validate-build, validate-lint, validate-tests, validate-tests-mapping, validate-migrations, validate-iac, validate-module-boundaries, and (if UI-bearing) validate-design-system.

**Exit:** All waves DONE, all RUNTIME PASS, all FIX_BACKLOGs clean, IaC and CI/CD in place, module boundaries respected
