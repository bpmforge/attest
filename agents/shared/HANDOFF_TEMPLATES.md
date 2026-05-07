# HANDOFF_TEMPLATES.md

**Canonical HANDOFF block templates used by sdlc-lead across every mode.**

Single source of truth. Mode files reference these templates by name instead of inlining them. Update once — propagates everywhere.

---

## Rules for every HANDOFF

1. Start with `SDLC-TASK for <agent-name>:` — this triggers the agent's Bounded Task Mode
2. List the exact files to READ for context (name them — do not say "look at the project")
3. Describe the task in 2-4 sentences (what to produce, not which internal mode to run)
4. List the exact files to PRODUCE with a one-line description of each
5. End with the exact completion phrase the agent should print
6. Say "Then stop" — explicitly tell the agent not to continue

Never say "Run --design mode" or "Run --review mode" — describe the TASK, not the agent's internal flags.

Always reference `agents/shared/BOUNDED_TASK_CONTRACT.md` in the CONTEXT block.

---

## Template 1: Standard HANDOFF (most common)

```
---
  HANDOFF -> /<skill> (<agent-name>)
---
Open a new OpenCode conversation and paste this EXACT prompt to /<skill>:

SDLC-TASK for <agent-name>:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the five rules that govern this HANDOFF
- docs/work/context-for-<agent>.md             -- full context packet for this task
- <file 1>                                     -- <what it contains relevant to this task>
- <file 2>                                     -- <what it contains relevant to this task>

WRITE-SCOPE (exclusive):
- <dir 1>/                                     -- may write only here (plus docs/work/**, docs/reviews/**)

YOUR TASK:
<Specific description -- what to do, not which mode to run. 2-4 sentences.>

PRODUCE exactly these files (nothing else):
- <output file 1>                              -- <what it should contain>
- <output file 2>                              -- <what it should contain>

Include a Completion Manifest at <manifest-path> with required sections:
- Files produced
- Decisions
- Known issues / deferred
- Verify result

When all files are written, print exactly:
"<agent> done -- <one sentence describing what was produced>"
Then stop. Do not ask for follow-up. Do not run additional phases.

---
```

## Template 2: Remediation HANDOFF (after a review)

Use this template for fix-after-review cycles. It references a FIX_BACKLOG.

```
---
  HANDOFF -> /code (coding-agent) -- REMEDIATION
---
SDLC-TASK for coding-agent:

CONTEXT:
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the five rules
- agents/shared/FIX_VERIFY_LOOP.md             -- the fix-verify protocol
- docs/reviews/FIX_BACKLOG_<feature>_<date>.md -- the backlog of findings to address
- docs/TECH_STACK.md                           -- MANDATORY constraint: no new libraries

RULES:
- Fix ONLY rows marked CRITICAL or HIGH in the backlog
- Minimum change at the cited file:line
- Stop and report if a fix needs a design change (do not redesign unilaterally)
- MEDIUM/LOW rows stay in backlog as tech debt

PRODUCE:
- Code edits at the cited file:line locations
- docs/reviews/FIX_SUMMARY_<feature>_<iteration>_<date>.md
    -- per-row action: FIXED / DEFERRED / NEEDS-DESIGN
    -- per-row commit hash
    -- test results (pass/fail count)

When done, print exactly:
"coding-agent done -- <N> fixes applied, <M> deferred for design review"
Then stop.

---
```

## Template 3: Re-verification HANDOFF (targeted)

Use this after a remediation cycle. The reviewer does NOT re-scan for new issues — only verifies the backlog.

```
---
  HANDOFF -> /<skill> (<agent-name>) -- TARGETED RE-VERIFICATION
---
SDLC-TASK for <agent-name>:

CONTEXT:
- agents/shared/BOUNDED_TASK_CONTRACT.md
- agents/shared/FIX_VERIFY_LOOP.md
- docs/reviews/FIX_BACKLOG_<feature>_<date>.md
- docs/reviews/FIX_SUMMARY_<feature>_<iteration>_<date>.md

SCOPE:
- Verify ONLY the rows in the backlog. Do NOT scan for new issues.
- For each row, apply the Verify criterion (passing test, metric threshold, grep returning nothing).

PRODUCE:
- docs/reviews/VERIFY_<feature>_<iteration>_<date>.md
    -- per-row verdict: PASS / FAIL / INCONCLUSIVE
    -- evidence for each verdict (test output, grep output, metric reading)

When done, print exactly:
"<agent> done -- <N> PASS, <M> FAIL, <K> INCONCLUSIVE"
Then stop.

---
```

## Template 4: Parallel wave HANDOFFs (Phase 4 / Mode 3 split)

Emit N HANDOFF blocks in ONE message -- one per module. User opens N concurrent OpenCode sessions.

```
---
  PARALLEL WAVE -- ROUND 1 (CODE) -- N concurrent HANDOFFs
---
Open N OpenCode sessions concurrently. Paste each block into one session.

--- HANDOFF #1 (<module-A>) -> /code ---
SDLC-TASK for coding-agent:

CONTEXT:
- agents/shared/BOUNDED_TASK_CONTRACT.md
- docs/ARCHITECTURE.md (module <module-A> section)
- docs/PARALLELIZATION_MAP.md (wave assignment)

WRITE-SCOPE (exclusive):
- src/<module-A>/                              -- peer modules run in parallel; DO NOT touch other dirs

YOUR TASK:
<module-A specific task>

PRODUCE:
- src/<module-A>/**                            -- implementation
- docs/reviews/MANIFEST_<module-A>_<date>.md   -- completion manifest

Print: "coding-agent done -- <module-A> implementation complete"
Then stop.

--- HANDOFF #2 (<module-B>) -> /code ---
<same shape, different module>

... (N total) ...
---
```

The orchestrator waits for every HANDOFF to print its completion phrase, then runs the three-gate check per module via `run-handoff-gates.sh` (see below), then proceeds to Round 2 (REVIEW) and Round 3 (RUNTIME).

---

## Post-HANDOFF gate (automated)

After EVERY HANDOFF returns, before accepting the work, the orchestrator runs:

```bash
./scripts/validators/run-handoff-gates.sh \
  --scope <assigned-dir> [--scope <dir2> ...] \
  --manifest <manifest-path> \
  [--coverage <validate-<name>.sh>]
```

Three gates, any failure aborts the rest:

1. **Scope** — `validate-scope.sh` confirms all git writes landed in the assigned directory (plus `docs/work/**` and `docs/reviews/**`)
2. **Manifest** — `validate-completion-manifest.sh` confirms the manifest has: Files produced, Decisions, Known issues, Verify result, and a completion phrase
3. **Coverage** — domain-specific validator (see the mapping below)

| HANDOFF type | `--coverage` arg |
|--------------|------------------|
| api-designer | `validate-api-coverage.sh` |
| db-architect | `validate-erd-coverage.sh` |
| architecture synthesis | `validate-architecture.sh` |
| security-auditor --deep | `validate-owasp.sh` |
| onboard --deep | `validate-inventory.sh` |
| code/refactor | omit |

Exit 0 = all gates pass. Exit 1 = one or more gates failed; read JSON gap list, send the specific gap back to the specialist with REVISE status.

No orchestrator judgment required. No manual manifest review. The validators decide.

---

## Template 7: Module Design HANDOFF (Phase 3 — after TECH_STACK)

Use after TECH_STACK.md is complete. architecture-designer produces MODULE_DESIGN.md (lego structure) and INFRASTRUCTURE.md (deployment topology) in one pass.

```
---
  HANDOFF -> /arch (architecture-designer) — MODULE DESIGN + INFRASTRUCTURE
---
Open a new OpenCode conversation and paste this EXACT prompt to /arch:

SDLC-TASK for architecture-designer:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the five rules
- docs/work/context-for-architecture-designer.md -- full context packet
- docs/DESIGN_CONTEXT.md                       -- deployment, scale, constraints, patterns to enforce
- docs/TECH_STACK.md                           -- language, framework, libraries (defines interface syntax)
- docs/SRS.md                                  -- functional requirements (source of bounded contexts)
- docs/USER_STORIES.md                         -- feature capabilities (derive module responsibilities)
- docs/SCOPE.md                                -- what is in/out of scope
- docs/CONSTRAINTS.md                          -- technical and business constraints

WRITE-SCOPE (exclusive):
- docs/                                        -- MODULE_DESIGN.md and INFRASTRUCTURE.md only

YOUR TASK:
Produce the structural blueprint for [project]. Derive modules from business domains in SRS.md
and USER_STORIES.md — NOT from technical layers. Choose and justify an architecture pattern
based on DESIGN_CONTEXT.md. Define public interface contracts in the project's actual language
(from TECH_STACK.md). Document plugin/extension points for every external dependency.
Write the new-feature addition recipe. Generate actual linter enforcement config.
Then produce INFRASTRUCTURE.md — the deployment topology (no IaC code, topology only).

PRODUCE exactly these files:
- docs/MODULE_DESIGN.md   — module inventory, public interfaces, plugin points, dep rules,
  feature recipe, enforcement config
- docs/INFRASTRUCTURE.md  — environment matrix, compute, data, networking diagram, ops concerns,
  IaC note (topology only — no Terraform/Helm/CloudFormation code)
- docs/reviews/MANIFEST_architecture_design_<date>.md -- completion manifest

When all files are written, print exactly:
"architecture-designer done — [N modules, pattern: X, N plugin points, infra: Y compute + Z data stores]"
Then stop. Do not ask for follow-up. Do not run additional phases.

---
```

After "architecture-designer done":
1. Run `./scripts/validators/run-handoff-gates.sh --scope docs --manifest docs/reviews/MANIFEST_architecture_design_<date>.md --coverage validate-module-design.sh`
2. If gaps remain, return specific gaps to architecture-designer for REVISE
3. After gate passes, db-architect and api-designer may start (they both read MODULE_DESIGN.md)

---

## Template 8: Infrastructure Topology HANDOFF (Phase 3 — after security reconciliation)

Use after security controls are applied to DATABASE.md and API_DESIGN.md. Confirms and expands INFRASTRUCTURE.md with final security-aware topology details.

```
---
  HANDOFF -> /devops (sre-engineer) — INFRASTRUCTURE TOPOLOGY REVIEW
---
Open a new OpenCode conversation and paste this EXACT prompt to /devops:

SDLC-TASK for sre-engineer:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the five rules
- docs/work/context-for-sre-engineer.md        -- full context packet
- docs/INFRASTRUCTURE.md                       -- initial topology from architecture-designer (review + expand)
- docs/DESIGN_CONTEXT.md                       -- scale targets, compliance requirements, provider preferences
- docs/SECURITY_CONTROLS.md                    -- security controls that affect infrastructure (encryption, network isolation)
- docs/DATABASE.md                             -- data stores to provision
- docs/TECH_STACK.md                           -- runtimes and versions to use in infra

WRITE-SCOPE (exclusive):
- docs/INFRASTRUCTURE.md                       -- update in place (or replace if substantially different)
- docs/reviews/**                              -- manifest

YOUR TASK:
Review and expand docs/INFRASTRUCTURE.md. The architecture-designer produced an initial
topology — your job is to validate it against scale targets and compliance requirements in
DESIGN_CONTEXT.md, incorporate any infrastructure-level security controls from
SECURITY_CONTROLS.md (network isolation, encryption in transit, secrets management), and
add operational specifics the architecture-designer left as TBD. Do NOT add IaC code —
this document is topology documentation only (IaC is Phase 4).

PRODUCE:
- Updated docs/INFRASTRUCTURE.md (all required sections complete, no TBD/placeholder text,
  Mermaid deployment diagram present)
- docs/reviews/MANIFEST_infrastructure_<date>.md

When done, print exactly:
"sre done — infrastructure topology: [N environments, compute summary, compliance notes]"
Then stop.

---
```

After "sre done": run `./scripts/validators/run-handoff-gates.sh --scope docs/INFRASTRUCTURE.md --manifest docs/reviews/MANIFEST_infrastructure_<date>.md --coverage validate-infrastructure.sh`

---

## Template 9: IaC Scaffolding HANDOFF (Phase 4)

Use after container config is complete. IaC scaffolding is its own wave — parallel-safe with other non-infrastructure Phase 4 work.

```
---
  HANDOFF -> /devops (sre-engineer) — IaC SCAFFOLDING
---
Open a new OpenCode conversation and paste this EXACT prompt to /devops:

SDLC-TASK for sre-engineer:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the five rules
- docs/work/context-for-sre-engineer.md        -- full context packet
- docs/INFRASTRUCTURE.md                       -- topology to provision (source of truth)
- docs/TECH_STACK.md                           -- runtime versions, build tooling
- docs/ARCHITECTURE.md                         -- service names, port assignments, container topology

WRITE-SCOPE (exclusive):
- infra/                                       -- all IaC files here

YOUR TASK:
Produce Infrastructure-as-Code scaffolding for [project] that provisions everything
documented in docs/INFRASTRUCTURE.md. Auto-detect the right IaC tool: Terraform preferred;
Helm if Kubernetes is the primary target; CloudFormation if AWS-only and stated in
DESIGN_CONTEXT.md. Produce REAL files — not stubs. Variables must be typed and documented.
Outputs must include all endpoint URLs, resource identifiers, and connection strings.
Staging and prod configs must differ appropriately (HA for prod). `terraform validate` or
equivalent must pass. No hardcoded secrets.

PRODUCE:
- infra/main.[tf|yaml|json]      — root module / chart declaring all resources
- infra/variables.[tf|yaml]      — all inputs with type, description, default (where safe)
- infra/outputs.[tf|yaml]        — all outputs downstream systems need
- infra/envs/staging/            — staging variable values
- infra/envs/prod/               — production variable values (HA, multi-AZ)
- infra/README.md                — what this provisions, how to run, references INFRASTRUCTURE.md
- docs/reviews/MANIFEST_iac_<date>.md

When done, print exactly:
"sre done — IaC scaffolding: [tool, N resources, staging + prod configs]"
Then stop.

---
```

After "sre done": run `./scripts/validators/run-handoff-gates.sh --scope infra --manifest docs/reviews/MANIFEST_iac_<date>.md --coverage validate-iac.sh`

---

## Template 5: Security Controls HANDOFF (Phase 3 — after threat model)

Use after THREAT_MODEL.md is complete. Produces SECURITY_CONTROLS.md and issues update requests back to db-architect and api-designer.

```
---
  HANDOFF -> /security (security-auditor) — SECURITY CONTROLS
---
Open a new OpenCode conversation and paste this EXACT prompt to /security:

SDLC-TASK for security-auditor:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the five rules
- docs/work/context-for-security-auditor.md    -- full context packet
- docs/THREAT_MODEL.md                         -- threats identified, with severity ratings
- docs/DATABASE.md                             -- current schema (needs security additions)
- docs/API_DESIGN.md                           -- current API contracts (needs security additions)
- docs/ARCHITECTURE.md                         -- system components

WRITE-SCOPE (exclusive):
- docs/SECURITY_CONTROLS.md                   -- new file to produce
- docs/reviews/**                              -- manifest

YOUR TASK:
For every HIGH and CRITICAL threat in THREAT_MODEL.md, produce a concrete security
control. For each control: describe the mitigation, the implementation approach,
which document needs updating (DATABASE.md, API_DESIGN.md, and/or ARCHITECTURE.md),
and the specific change needed. Produce a security change request block for each
document that needs updating — formatted so the db-architect and api-designer can
apply the changes as targeted HANDOFFs.

PRODUCE exactly these files:
- docs/SECURITY_CONTROLS.md                   -- control catalogue: one entry per HIGH/CRITICAL
  threat with mitigation, implementation notes, and document change requests
- docs/reviews/MANIFEST_security_controls_<date>.md -- completion manifest

When all files are written, print exactly:
"security done -- security controls: [N controls for N HIGH/CRITICAL threats, key mitigations listed]"
Then stop. Do not ask for follow-up. Do not run additional phases.

---
```

After "security done":
1. Run `./scripts/validators/run-handoff-gates.sh --scope docs --manifest docs/reviews/MANIFEST_security_controls_<date>.md --coverage validate-security-controls.sh`
2. If gate passes, issue update HANDOFFs to db-architect and api-designer (use standard Template 1, scope = their respective docs + source dirs)
3. After both update HANDOFFs return and pass, synthesize final ARCHITECTURE.md

---

## Template 6: Test Design HANDOFF (Phase 3.5)

Use after Phase 3 gate passes and Human Approval Gate A is confirmed. Produces TEST_DESIGN.md reading all Phase 2+3 artifacts.

```
---
  HANDOFF -> /test-expert (test-engineer) — TEST DESIGN
---
Open a new OpenCode conversation and paste this EXACT prompt to /test-expert:

SDLC-TASK for test-engineer:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the five rules
- docs/work/context-for-test-engineer.md       -- full context packet
- docs/testing/USE_CASES.md                    -- P0/P1/P2 use cases with acceptance criteria
- docs/USER_STORIES.md                         -- stories with acceptance criteria
- docs/SRS.md                                  -- functional + non-functional requirements
- docs/ARCHITECTURE.md                         -- C3 component diagrams (unit test targets)
- docs/api/openapi.yaml                        -- endpoints (integration test targets)
- docs/THREAT_MODEL.md                         -- HIGH/CRITICAL threats (security test targets)
- docs/SECURITY_CONTROLS.md                    -- mitigations to verify
- docs/DATABASE.md                             -- schema (data-layer test targets)
- docs/TECH_STACK.md                           -- frameworks to select test tooling from

WRITE-SCOPE (exclusive):
- docs/testing/                                -- may write only here (plus docs/work/**, docs/reviews/**)

YOUR TASK:
Produce a detailed test design document that maps every testable artifact from Phase 2+3
to concrete test cases. Read ALL context files listed above. For each artifact:
- C3 components → unit test targets (what to test, what to mock, coverage target per component)
- openapi.yaml endpoints → integration test cases (request/response assertions, auth paths, error cases)
- P0 use cases → E2E scenarios (complete happy path + key error paths, fixture strategy)
- HIGH/CRITICAL threats from THREAT_MODEL.md → security test cases (injection, auth bypass, etc.)
- NFRs from SRS.md with metrics → performance benchmark targets

PRODUCE exactly this file:
- docs/testing/TEST_DESIGN.md — structured test design with:
  ## Unit Tests — one subsection per C3 component, listing functions/classes to test, mocking strategy, coverage target
  ## Integration Tests — one row per endpoint from openapi.yaml with test assertions
  ## E2E Scenarios — one scenario per P0 use case with actor, steps, assertions, fixture
  ## Security Tests — one case per HIGH/CRITICAL threat, describing attack input and expected defense
  ## Performance Benchmarks — one row per NFR metric with baseline target and measurement approach
  ## Coverage Matrix — table mapping source artifact → test case ID(s)

Include a Completion Manifest at docs/reviews/MANIFEST_test_design_<date>.md.

When the file is written, print exactly:
"test-design done -- [N unit targets, N integration targets, N E2E scenarios, N security cases]"
Then stop. Do not ask for follow-up. Do not run additional phases.

---
```

After "test-design done":
1. Run `./scripts/validators/run-handoff-gates.sh --scope docs/testing --manifest docs/reviews/MANIFEST_test_design_<date>.md --coverage validate-test-design.sh`
2. If gaps remain, iterate via coverage loop (max 3 times, then escalation)
3. After gate passes, emit **Human Approval Gate B** and wait for user confirmation before Phase 4

---

## Context Packet template

Before every HANDOFF, write a `docs/work/context-for-<agent>.md` with:

```markdown
# Context Packet for <agent-name>

## Project (3 sentences)
<From DISCOVERY.md or README — what the system is, who uses it, current state>

## Your task
<Specific: what to produce, success criteria, line count expectations>

## Files to read (priority order)
1. <file> -- <what's relevant for THIS task>
2. <file> -- <what's relevant>

## Files to produce
1. <file> -- <expected content, approximate scope>

## Patterns to follow
<From existing codebase: naming conventions, file structure, max line counts,
 test patterns, import rules>

## What NOT to do
<Scope boundaries: don't refactor X, don't touch Y, don't add dependencies>
```

The specialist reads ONE focused file instead of re-exploring the whole codebase.
