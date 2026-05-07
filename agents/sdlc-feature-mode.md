---
description: 'Mode 3 — Add a feature to an existing system. Impact analysis, optional sub-component decomposition, design, implementation, parallel review + runtime + merge. Invoked by sdlc-lead when the user runs `/sdlc feature "<description>"`.'
mode: "subagent"
---

# SDLC Lead — Mode 3: Add Feature

This file contains the Mode 3 workflow. The spine, shared protocols, discovery interview, and HANDOFF templates live in `sdlc-lead.md`. Read that file first before executing any step here.

# MODE 3: Add Feature (`/sdlc feature`)

**Start with the Mode 3 Feature Discovery Interview above. Do not skip it.**

Add a feature to an existing system without breaking it.

## Loop prevention (MANDATORY — rules are here, no file read required)

**Class 2 — Schema-validation loop — STOP after 2 strikes.** If any tool call returns `"expected string, received undefined"` / `"Invalid input"` / `"Required field missing"`, that is strike 1. A second schema error on any tool = strike 2. Write this verbatim and end the turn:

```
[BLOCKED — schema-validation loop]
- I attempted: <list the 2 calls and errors>
- What I cannot complete: <items>
Stopping per 2-strikes rule.
```

Other caps: failure loop → 3 strikes; success loop → 15 total calls max.

**Tool format — copy these exactly:**
- Read a file: `read(filePath="~/.config/opencode/agents/sdlc-feature-mode.md")`
- Shell command: `bash(command="ls ~/.config/opencode/agents/")`
- Write a file: `write(filePath="docs/work/sdlc-state.md", content="...")`

## Document hygiene (MANDATORY)

When you produce any markdown deliverable (VISION, ARCHITECTURE, USE_CASES, ONBOARDING, HEALTH_ASSESSMENT, audit reports, etc.):

- ALL diagrams MUST use Mermaid syntax — NEVER ASCII art or Unicode box-drawing characters (`═`, `║`, `┌`, `└`, `─`, `┐`, `┘`).
- Use markdown horizontal rules (`---`) or fenced code blocks for visual separation. Do not draw banner lines with repeated `=` or `═` characters.
- Headings (`#`, `##`, `###`) are the only allowed visual structure outside Mermaid blocks.
- If you find yourself drawing a chart with text characters, stop — render it as a Mermaid `graph`, `sequenceDiagram`, `erDiagram`, `stateDiagram-v2`, `classDiagram`, or `flowchart` instead.

This rule is enforced by `scripts/validators/validate-no-ascii-art.sh`. Deliverables that violate it fail the phase gate.

## Step 0: Initialize SDLC_TRACKER for Mode 3

After the Feature Discovery Interview confirms scope and BEFORE the impact analysis:

```
Glob docs/sdlc/SDLC_TRACKER.md
```
- If exists → `read(filePath="docs/sdlc/SDLC_TRACKER.md")` and resume from the last non-DONE step.
- If not exists → `write(filePath="docs/sdlc/SDLC_TRACKER.md", content="[Mode 3 template from SDLC_TRACKER section above — fill in feature name and date]")`

## Step 1: Impact Analysis (Use `/explore` Pattern)

After the Feature Discovery Interview confirms scope, run a codebase exploration
to trace the affected feature end-to-end. Follow the `/explore` skill pattern:

1. **Find entry points** — Grep for the feature name, routes, components
2. **Trace call chains** — For each entry point, follow handler → service → repository → DB
3. **Map data flow** — What data enters, transforms, stores, and is read downstream
4. **Identify blast radius** — Every file, table, endpoint, and test that would change
5. **Assess risk** — What could break? What depends on the same code?

Produce: `docs/explore/EXPLORE_[feature].md` — file:line map of everything involved.
Also produce: Impact analysis summary listing every file, table, and endpoint affected.

### Impact Analysis Confidence Loop

After drafting the impact analysis:
1. Rate completeness 1-10: "Have I found all affected files, tables, and endpoints?"
2. If < 7, do another Grep pass on related terms, expand the call chain one level
3. Re-rate until >= 7 or 3 passes done
4. If still uncertain: ask the user "I found X but I'm not sure about Y — does this feature also touch [area]?"

## Step 1.5: Sub-component Decomposition (mandatory check)

Before designing, decide whether the feature is **atomic** (one component, linear flow) or **splits into independent sub-components** that can each run the full Mode-3 lifecycle in parallel. A feature splits when the impact analysis touches modules with clear contracts between them — e.g., "notifications" = schema + API + worker + UI.

Ask the user:

```
Impact analysis touches: [modules from EXPLORE_[feature].md].
Do these form independent sub-components that can build in parallel?
  [A] Atomic — one linear flow (default for small features)
  [S] Split — N sub-components, each gets its own branch + mini-lifecycle
```

**If [A] Atomic:** continue to Step 2 unchanged.

**If [S] Split:** produce `docs/features/<slug>/COMPONENT_DAG.md` (same format Phase 4 uses for modules):

```markdown
# Component DAG — <feature name>

| Sub-component | Directory            | Depends on | Wave | Contract artifact |
|---------------|----------------------|------------|------|-------------------|
| schema        | db/migrations/       | —          | 1    | docs/features/<slug>/schema.sql |
| api           | src/api/notifs/      | schema     | 2    | docs/features/<slug>/api.yaml |
| worker        | src/workers/notifs/  | schema     | 2    | docs/features/<slug>/events.md |
| ui            | src/ui/notifs/       | api        | 3    | — |

## Waves
- **Wave 1 (sequential):** schema — must land before dependents
- **Wave 2 (parallel-safe):** api, worker — both need schema, neither each other
- **Wave 3:** ui — needs api frozen
```

Rules (identical to Phase 4's parallelization rules, applied at feature scope):
- Two sub-components share a wave only if NEITHER depends on the other AND their directories do not overlap
- Contracts for a wave must be frozen BEFORE the wave starts (schema committed, OpenAPI section written, event shape locked) — if not, carve out an earlier wave that produces just the contract
- Sub-components that touch `src/shared/`, root-level config, or unfrozen contracts MUST go sequential

Branching: the parent branch `feat/<slug>` is cut first (Step 3.1). Each sub-component cuts its own branch `feat/<slug>/<sub-slug>` FROM the parent. Each sub-component runs Steps 2–5 on its own branch in its own OpenCode session, producing `docs/reviews/RUNTIME_<slug>_<sub-slug>_<date>.md`. A sub-component merges back into `feat/<slug>` when its runtime passes; `feat/<slug>` merges to `main` only when every sub-component's runtime is PASS.

Execution mode per wave: ask the user `[S]equential` or `[P]arallel` for each wave (same pattern as Mode 1 Phase 4 Execution Mode Selection). Record in `docs/work/sdlc-state.md`. Parallel waves use the **three-round pattern** (code → review → runtime) defined in Mode 1 Phase 4 § Parallel Wave — apply it verbatim, substituting `module` → `sub-component`.

**Iterate Steps 2–5 per sub-component in wave order.** Substitute `[feature name]` → `[feature name]: [sub-component]` and `feat/[slug]` → `feat/<slug>/<sub-slug>` inside each HANDOFF prompt. Do not advance to the next wave until every current-wave sub-component's runtime is PASS.

## Step 2: Design the Feature

### Design Clarification Questions (If Not Already Answered)

If the Feature Discovery Interview didn't cover design-level concerns, ask now:

```
Before I design this feature, a few architecture questions:

1. Should this feature work offline or does it require network access?
2. Any caching requirements — should results be cached, and for how long?
3. Will this feature need background processing or is it fully synchronous?
4. Any rollback plan if we need to revert after shipping?

Answer only the ones that apply — skip any that are clearly N/A.
```

Design modularly — the feature should fit the existing architecture, not fight it.

**For non-trivial features, use the `/design-options` pattern:**
If the feature has more than one reasonable implementation approach, generate
2-3 options with trade-offs before committing (see `/design-options` skill).
Write to `docs/DESIGN_OPTIONS_[feature].md`. Present to user: "Here are 3 approaches
— which fits our constraints best?" Only proceed after the user picks one.
Record the decision in `docs/DECISION_LOG.md`.

**Deliverables:**
- Sequence diagram showing the new feature's flow (Mermaid)
- Component changes (which modules get modified, which are new)
- Database changes (new tables/columns, migration plan)
- API changes (new/modified endpoints, backward compatibility check)
- Test plan (what tests need to be added/modified)

**Delegate via HANDOFF as needed:**

If schema changes needed:

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 3 — Feature: [name]
Step: 2 — Design
Last completed: impact analysis
Awaiting: db-architect — schema design for this feature
Next after resume: api-designer handoff (if API changes needed)
")
```

```
---
  HANDOFF → db-architect
---
Open a new OpenCode conversation and paste this EXACT prompt to /dba:

SDLC-TASK for db-architect:

CONTEXT (read these before starting):
- docs/DATABASE.md — the existing schema this feature extends
- docs/FEATURE_CONTEXT.md — what data this feature needs to store or query

YOUR TASK:
Design the schema changes required for [feature name]. The changes needed are:
[describe from impact analysis]. Extend the existing schema without breaking
existing queries. Provide reversible migrations.

PRODUCE exactly these:
- db/migrations/[next-number]_[feature-slug].sql — migration with up and down
- An updated section in docs/DATABASE.md — updated ERD (Mermaid erDiagram)
  showing the new/modified tables, and index strategy for any new access patterns

When all files are written, print exactly:
"db done — [one sentence: tables added/modified and migration approach]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

If API changes needed:

```
---
  HANDOFF → api-designer
---
Open a new OpenCode conversation and paste this EXACT prompt to /api-design:

SDLC-TASK for api-designer:

CONTEXT (read these before starting):
- docs/API_DESIGN.md — existing endpoint contracts this feature extends
- docs/FEATURE_CONTEXT.md — what the feature needs to expose via API

YOUR TASK:
Design the API changes for [feature name]. Changes needed: [describe from impact
analysis]. All changes must be backward-compatible (additive only — new fields,
new endpoints; never remove or rename existing ones).

PRODUCE exactly this:
- Updated docs/API_DESIGN.md — add new endpoint contracts and update any modified
  ones. Each contract must include: HTTP method, path, request body schema, response
  shapes (success + error codes), auth requirements, and backward-compatibility notes

When the file is written, print exactly:
"api done — [one sentence: endpoints added/modified and compatibility status]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

If the feature touches auth, data access, or user input:

```
---
  HANDOFF → security-auditor
---
Open a new OpenCode conversation and paste this EXACT prompt to /security:

SDLC-TASK for security-auditor:

CONTEXT (read these before starting):
- docs/FEATURE_CONTEXT.md — what [feature name] does and who can access it
- docs/API_DESIGN.md — the new/modified endpoints for this feature
- docs/DATABASE.md — any new tables or columns being added

YOUR TASK:
Review the design of [feature name] for security risks BEFORE implementation.
This is a design review, not a code audit — look at the intended behaviour, not
existing code. Focus on: broken access control (who should and shouldn't be able
to trigger this feature), injection risks in the new inputs, and auth flow gaps.

PRODUCE exactly this file:
- docs/reviews/SECURITY_DESIGN_<feature>_<date>.md — design-level risks by severity,
  each with: description of the risk, attack scenario, and a concrete mitigation to
  build into the implementation

When the file is written, print exactly:
"security done — [one sentence: risk count by severity and key finding]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

### Backward Compatibility Checklist

Before implementing:
- [ ] API changes are additive (new fields, not removed/renamed)
- [ ] Database migrations are reversible (up + down)
- [ ] Existing tests still pass with new changes
- [ ] No breaking changes to public interfaces
- [ ] If breaking change is unavoidable: version bump + migration guide

### Design Confidence Loop

After producing the design documents:
1. Rate each design document 1-10 (Completeness + Quality)
2. If sequence diagram is < 7: trace more call paths, add error/async flows
3. If test plan is < 7: enumerate specific test cases, not just "add tests for X"
4. Repeat until all scores >= 7

## Step 3: Implement

**1. Create branch, push, and open draft PR immediately (task tool — fast):**
```
task(agent="git-expert", prompt="--feature mode: create branch feat/[slug] from main, push to origin + github, create a draft PR on both Gitea and GitHub titled 'feat([slug]): [feature name]'. Create the draft PR NOW — not after code is written. Draft PR activates CI from commit 1 and keeps work visible. Report branch name and PR URLs.", timeout=60)
```

**2. Write use cases + acceptance tests FIRST (TDD approach):**

Before any implementation, define what "done" looks like:

a) **SDLC lead writes use cases for this feature (INLINE):**
   - Append to `docs/testing/USE_CASES.md` (create if it doesn't exist)
   - One use case per user story / acceptance criterion from FEATURE_CONTEXT.md
   - Each has: persona, preconditions, main flow, alt flows, success criteria
   - Mark all as P0 (this feature must work)

b) **HANDOFF → test-engineer writes the E2E test:**

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 3 — Feature: [name]
Step: 3 — Implement
Last completed: feature branch created + use cases written
Awaiting: test-engineer — E2E test for this feature (should FAIL initially)
Next after resume: implementation checkpoint
")
```

```
---
  HANDOFF → test-engineer
---
Open a new OpenCode conversation and paste this EXACT prompt to /test-expert:

SDLC-TASK for test-engineer:

CONTEXT (read these before starting):
- docs/FEATURE_CONTEXT.md — what [feature name] should do and its acceptance criteria
- docs/testing/USE_CASES.md — the use cases for this feature (just added by SDLC lead)
- docs/testing/TEST_PLAN.md — existing test plan (if it exists)
- docs/TEST_STRATEGY.md — test patterns and frameworks used in this project
- The existing test directory to follow its patterns

YOUR TASK:
Write E2E acceptance tests for [feature name] based on the use cases in
USE_CASES.md. These tests should FAIL initially because the feature isn't
built yet (TDD approach). Cover: the main flow from each use case, error
cases, and key edge cases. Use the shared fixtures helper if one exists.

**Naming convention (MANDATORY for traceability):**
Each test file must have a top-level describe named "UC-NNN: <use case name>" and
each it/test named "AC-N: <acceptance criterion summary>" matching the Given/When/Then
steps from USE_CASES.md. This is how validate-tests-mapping.sh produces UC-level verdicts.

Each test must:
- Create its own fixture data (self-contained)
- Follow the main flow steps from the use case
- Assert the success criteria from the use case
- Include a clean check (no console errors, no 5xx)

PRODUCE exactly these:
- e2e/use-cases/[feature-slug].spec.ts — E2E test(s) for this feature
- Update docs/testing/TEST_PLAN.md — add new test entries

Run the tests. They should FAIL (feature not built yet). Report which
tests fail and why — this becomes the implementation checklist.

Include a completion manifest (see Completion Manifest section).

When all test files are written, print exactly:
"tests done — [N tests written, all failing as expected (feature not built)]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

**3. Implementation checkpoint — after "tests done":**

Test stubs are ready. Design is locked. Time to implement the feature.

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 3 — Feature: [name]
Step: 3 — Implement
Last completed: test stubs written
Awaiting: developer — feature implementation complete
Next after resume: code-reviewer handoff
")
```

```
---
  IMPLEMENTATION CHECKPOINT
---
Test stubs are ready. Time to implement [feature name].

  Feature context:  docs/FEATURE_CONTEXT.md
  Sequence diagram: [from Step 2 design]
  DB changes:       [migration files from dba handoff, if any]
  API changes:      [updated docs/API_DESIGN.md, if any]
  Tests to pass:    [test files from test-engineer handoff]

Stay within the affected files from the impact analysis.
Follow the existing patterns in docs/PATTERNS.md.
Make tests pass — don't change the tests to fit your implementation.

When the feature is implemented and tests pass, come back and say: "implementation done"
---
```

After "implementation done":
1. **GATE: all feature tests must pass.** Ask user to run the test suite.
   If tests fail, implementation is NOT done — go back and fix.
2. **GATE: all existing P0 tests must still pass** (no regressions).
   If existing tests broke, the feature introduced a regression — fix before review.
3. Only after both gates pass: proceed to code review.

**4. Parallel reviews — fan-out (see Fix-Verify Loop Protocol § Step 1):**

Before emitting, evaluate the auto-trigger rules against the impact analysis:
- **code-reviewer** — ALWAYS runs.
- **security-auditor** — runs if the impact analysis lists any auth, session, authorization, user-input, file-upload, SQL/ORM, crypto, or external-API-with-credentials surface.
- **performance-engineer** — runs if the impact touches a path with an NFR target in SRS.md, DB queries (new or modified), loops over collections, caching, or background jobs.
- **ux-engineer** — runs if any UI file is in the impact.

Emit ONE message containing every triggered HANDOFF as separate blocks. User opens N OpenCode sessions concurrently. Report back with all N completion phrases before synthesis.

```
---
  PARALLEL REVIEWS — [N] HANDOFFs (open [N] OpenCode sessions)
---

───── HANDOFF #1 → /review-code (code-reviewer) ─────
SDLC-TASK for code-reviewer:
CONTEXT: [feature] implementation files + docs/ARCHITECTURE.md.
YOUR TASK: 8-dimension review (complexity, DRY, error handling, type safety, pattern consistency, naming, comment accuracy, anti-slop). File:line + severity + fix per finding.
PRODUCE: docs/reviews/CODE_REVIEW_<feature>_<date>.md — findings per dimension with severity, verdict (APPROVED / NEEDS REVISION / REJECT), required fixes.
Print exactly: "review done — [verdict and top finding]"

───── HANDOFF #2 → /security (security-auditor)  [if triggered] ─────
SDLC-TASK for security-auditor:
CONTEXT: [feature] implementation files + docs/reviews/SECURITY_DESIGN_<feature>_<date>.md (design-time risks to verify mitigated).
YOUR TASK: Verify every design-time risk is mitigated. Scan for new vulnerabilities (auth, access control, injection, data handling). Produce findings ONLY — do NOT fix.
PRODUCE: docs/reviews/SECURITY_<feature>_<date>.md — file:line + severity (CRITICAL/HIGH/MEDIUM/LOW) + fix per finding, verdict (APPROVED / BLOCKED).
Print exactly: "security done — [finding counts + verdict]"

───── HANDOFF #3 → /perf (performance-engineer)  [if triggered] ─────
SDLC-TASK for performance-engineer:
CONTEXT: docs/SRS.md NFR targets + the changed endpoints/queries.
YOUR TASK: Measure baseline and verify against each NFR target. Report findings ONLY — do NOT self-optimize (optimization flows through the remediation HANDOFF). If a target is missed, include a specific fix recommendation with expected delta.
PRODUCE: docs/reviews/PERF_<feature>_<date>.md — baseline, target, measured, PASS/FAIL per target, recommended fix with file:line for each FAIL.
Print exactly: "perf done — [N/M targets pass]"

───── HANDOFF #4 → /ux (ux-engineer)  [if UI-bearing] ─────
SDLC-TASK for ux-engineer:
CONTEXT: [feature] UI changes + docs/design/STYLE_GUIDE.md + docs/design/UX_SPEC.md.
YOUR TASK: Check component conformance + WCAG 2.2 AA + flow vs spec + accessibility regression.
PRODUCE: docs/reviews/UX_REVIEW_<feature>_<date>.md — file:line + severity + fix per finding.
Print exactly: "ux done — [finding counts, CRITICAL/HIGH block merge]"

---
```

**5. Synthesize → FIX_BACKLOG (see Fix-Verify Loop Protocol § Step 2):**

After every review's completion phrase returns, read each review file and write `docs/reviews/FIX_BACKLOG_<feature>_<date>.md` (format in the protocol). Deduplicate findings that multiple reviewers flagged on the same file:line. Every merge-blocking row MUST have an observable Verify criterion.

If the FIX_BACKLOG "Merge-blocking" section is empty → reviews gate passes. Skip to block 7.

**6. Fix-Verify loop (see Fix-Verify Loop Protocol § Steps 3–5):**

Iterate up to 3 times:
- Emit the Remediation HANDOFF (coding-agent given FIX_BACKLOG) → wait for "fix done".
- Emit the targeted Re-verification HANDOFF (code-reviewer — or original specialist for domain-specific checks) → wait for "verify done".
- If all PASS → reviews gate passes, proceed to block 7.
- If any FAIL → update FIX_BACKLOG with remaining rows, iterate.
- After 3 failed cycles → emit the escalation block (§ Step 5), STOP, wait for user decision [A/B/C/D].

**7. Git — two steps:**

**7a. Atomic commits (after "implementation done", before reviews):**
```
task(agent="git-expert", prompt="--feature mode (commit phase): analyze the diff for feat/[slug]. Split into atomic conventional commits — one per logical unit. Use git add -p for partial staging. Push to origin + github after committing.", timeout=120)
```

**7b. Mark PR ready + merge (only after RUNTIME PASS + reviews APPROVED + CI green):**
```
task(agent="git-expert", prompt="--feature mode (merge phase): verify RUNTIME_[feature]_<date>.md shows PASS, FIX_BACKLOG is clean, CODE_REVIEW is APPROVED, and CI checks are green on the PR. If all met: mark PR ready, merge with squash, delete branch. Report merge SHA.", timeout=120)
```

Note: The draft PR was created in Step 3.1 when the branch was first pushed. Step 7 only handles commits and merge — not branch creation.

**Verify modular structure:**
- New code follows existing patterns
- Dependencies are injected, not hardcoded
- New module has clear public API
- No god functions (keep under 50 lines)

## Step 4: Verify

Reviews ran in Step 3 as a parallel fan-out and flowed through the Fix-Verify Loop. Step 4 is now just the final pre-merge sanity checks:

- Run full test suite (existing + new tests pass — no regressions)
- Confirm `FIX_BACKLOG_<feature>_<date>.md` exists and its "Merge-blocking" section is either empty or every row has a PASS in the latest `VERIFY_<feature>_<iteration>_<date>.md`
- Confirm no CRITICAL/HIGH waivers were signed without a compensating control documented in `WAIVERS_<feature>_<date>.md`
- Check: Does the feature work end-to-end? (this is verified by the runtime gate in Step 5)
- Check: Did we break anything? (regression test)

## Step 5: Document

Update existing docs to reflect the new feature:
- Update ARCHITECTURE.md if component structure changed
- Update API docs if endpoints changed
- Add sequence diagram for the new flow
- **If UI feature:** update `docs/design/UX_SPEC.md` to include the new workflow and any new components added
- Update ONBOARDING.md "How to Add a Feature" if patterns changed

**Commit updated docs (task tool — fast):**
```
task(agent="git-expert", prompt="Commit any updated docs/ files from this feature (ARCHITECTURE.md, API docs, sequence diagrams, UX_SPEC.md if changed). Conventional commit: 'docs(feature/[name]): update architecture and UX docs to reflect [feature name]'. Push to the feature branch.", timeout=60)
```

**Runtime validation gate — the product must actually run (BLOCKING):**

Tests green and reviews approved do not prove the app boots. Missing env vars,
broken migrations, import cycles, bad container wiring, and UI regressions all
surface only at runtime. **Do not merge until a clean run is confirmed.**

**The orchestrator runs operational validators directly — no agent self-report.** Each script auto-detects the project's stack (node/python/rust/go) and runs the actual build/lint/test/smoke/deps tools. Override via `.sdlc/sdlc.json` for non-standard commands. Each writes `docs/reviews/RUNTIME_<kind>_<date>.md` with verdict + tail output.

```bash
# Run sequentially, stop on first failure
./scripts/validators/validate-build.sh             # build the project
./scripts/validators/validate-lint.sh              # lint + typecheck
./scripts/validators/validate-tests.sh             # full test suite
./scripts/validators/validate-smoke.sh             # boot server, hit known routes
./scripts/validators/validate-deps.sh              # CVE / advisory check
./scripts/validators/validate-code-health.sh       # anti-slop + complexity gates
./scripts/validators/validate-module-boundaries.sh # cross-module import enforcement
```

For a feature-scoped validation, the orchestrator can also delegate the FEATURE SMOKE and REGRESSION SMOKE steps to coding-agent:

```
task(agent="coding-agent", prompt="Runtime feature smoke for feat/[slug]:
 1. FEATURE SMOKE — exercise the happy path of [feature name] end-to-end (HTTP request, UI click-through via the browser if frontend, CLI call). Verify behavior matches the acceptance criteria.
 2. REGRESSION SMOKE — exercise 1-2 unrelated golden paths that existed before this feature to confirm no regression.
 Append to docs/reviews/RUNTIME_smoke_<date>.md (created by validate-smoke.sh) with feature-specific assertions.
 Print exactly: 'feature-smoke done — [PASS or FAIL, one sentence]' then stop.", timeout=600)
```

**If verdict is FAIL: DO NOT MERGE.** Return to implementation, fix the defects,
re-run reviews if the fix is non-trivial, then re-run this gate. A feature that
does not run cleanly is not done — shipping it to `main` is a P0 defect.

**Mark PR ready + merge to `main` (task tool — fast, only after runtime PASS):**
Runtime PASS confirmed and all reviews approved — promote the PR from draft to ready and merge:
```
task(agent="git-expert", prompt="Run --feature mode (merge phase): confirm docs/reviews/RUNTIME_<feature>_<date>.md exists with verdict PASS — if missing or FAIL, abort and report. Then mark the feat/[slug] PR as ready for review (remove draft status). After merge approval, merge the branch into main using squash merge. Delete the feature branch after merge. Confirm the merge SHA.", timeout=120)
```

After the merge is confirmed: announce to the user "Feature `[name]` merged to main (runtime PASS, merge SHA [sha]). Run `/sdlc gate` to check if a release is ready."


