---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# HANDOFF_TEMPLATES.md

**Canonical HANDOFF block templates used by sdlc-lead across every mode.**

Single source of truth. Mode files reference these templates by name instead of inlining them. Update once — propagates everywhere.

---

## HANDOFF Format Specification (LLM-agnostic)

Every HANDOFF block MUST use the standard delimiter format below. This format works identically regardless of which LLM (Claude, GPT-4, qwen, gemma, or any local model) receives the block.

### Delimiter rules

```
════════════════════════════════════════════════════════════
HANDOFF → [agent-name]   (open /[skill-command] and read this file)
════════════════════════════════════════════════════════════
[HANDOFF BODY — do not modify anything inside these lines]
════════════════════════════════════════════════════════════
END HANDOFF #N
════════════════════════════════════════════════════════════
```

**Why delimiters matter:** Local LLMs (qwen, gemma, etc.) have smaller context windows and sometimes confuse which text is the HANDOFF body vs. the surrounding orchestrator commentary. The `════` border makes the task region in `docs/work/HANDOFF_<agent>.md` unambiguous regardless of the model. Online models (Claude, GPT-4) do fine without it, but the format is cheap and the consistency helps all models.

**sdlc-lead output rule:** Write the delimiter header, HANDOFF body, and delimiter footer to `docs/work/HANDOFF_<agent>.md`. Never add commentary or instructions inside the delimited region. Explanation to the user goes ABOVE the opening delimiter.

**Receiving agent rule:** When your prompt starts with `SDLC-TASK for` — or names a `docs/work/HANDOFF_*.md` path in any wording — you are inside a HANDOFF. Read the file if you were given a pointer, then follow the six rules in `agents/shared/BOUNDED_TASK_CONTRACT.md`. Do not look for or process the delimiter lines, and never re-emit the HANDOFF you received. Full rules: the **HANDOFF intake** block at the top of your agent file.

---

## How a HANDOFF is delivered (interactive — the default)

**The handoff is a DOCUMENT the specialist reads, not a block the user pastes.** For each handoff:

1. **Write** the full HANDOFF body (the `SDLC-TASK for <agent>` block below) to **`docs/work/HANDOFF_<agent>.md`**.
2. **Print a short pointer to the user** — which agent to open, the exact line to paste, and which report they'll submit back:
   ```
   ── NEXT HANDOFF ──────────────────────────────
   Open agent:   /<skill>            (<agent-name>)
   Paste this one line into it:

       SDLC-TASK for <agent-name>: read docs/work/HANDOFF_<agent>.md and execute it.

   It produces:  <docs/reviews/REPORT_*.md>     ← come back when done
   I will read that report and continue. I do NOT run this check myself.
   ──────────────────────────────────────────────
   ```
   **The paste line must start with `SDLC-TASK for`.** That prefix is the trigger every specialist
   matches on to enter Bounded Task Mode. A bare pointer ("open /<skill>, it reads
   docs/work/HANDOFF_<agent>.md") is *not* reliable: smaller models fall through to their default or
   orchestrator mode and hand the task straight back — asking which mode/slug to run, or re-printing
   the handoff and telling the user to open the very skill they are already in. Verified failure on
   `gpt-5-mini` (2026-07); the receiving-side backstop is the **HANDOFF intake** block in every agent.
3. **STOP and wait.** When the user returns with the completion phrase / report path, read the REPORT and continue. Never open the specialist for them, and never do the check yourself.

## Contents of the handoff document

1. Start with `SDLC-TASK for <agent-name>:` — this triggers the agent's Bounded Task Mode
2. List the exact files to READ for context (name them — do not say "look at the project")
3. Describe the task in 2-4 sentences (what to produce, not which internal mode to run)
4. List the exact files to PRODUCE with a one-line description of each
5. End with the exact completion phrase the agent should print
6. Say "Then stop" — explicitly tell the agent not to continue

Never say "Run --design mode" or "Run --review mode" — describe the TASK, not the agent's internal flags.

Always reference `agents/shared/BOUNDED_TASK_CONTRACT.md` in the CONTEXT block.

**Exemplar rule:** every Context Packet points at exactly ONE matching exemplar
from `exemplars/` ("produce output shaped like this"). By pointer, not inline —
the specialist reads it. The exemplar carries the format, so VERIFY/PRODUCE
prose can stay short. Cross-domain only: never attach an exemplar whose example
domain matches the task's domain (small models copy content, not just shape) —
see `exemplars/README.md`.

**Packet layout budget (tier=small):** task packet ≤400 words + memory slice
≤200 tokens + exemplar by pointer + ≤3 files to read = ≤1,200 tokens injected
total. The parts share one budget — do not let them fight.

**Executor rule:** the HANDOFF document is the contract; **autonomy decides who runs it** (`agents/shared/EXECUTOR_SELECTION.md`). In `autonomy=interactive` (the default — incl. the opencode TUI) you **write it to `docs/work/HANDOFF_<agent>.md` and print the pointer above for the user to open the specialist and read the doc** — you never open a Task-tool subagent or subprocess, and you never run the specialist's check yourself. Only in `autonomy=auto` (unattended) is it dispatched programmatically (Task tool when `has_task_tool=true`, else `opencode run` subprocess), still writing the same `HANDOFF_<agent>.md`.

---

## Template 1: Standard HANDOFF (most common)

**Write this block to `docs/work/HANDOFF_<agent>.md`**, then print the NEXT HANDOFF pointer (above) to the user. The block below IS the document the specialist reads — the `════` delimiters frame the task.

```
════════════════════════════════════════════════════════════
HANDOFF → <agent-name>   (open /<skill> and read this file)
════════════════════════════════════════════════════════════
SDLC-TASK for <agent-name>:

ROLE: You are a [domain expert role — e.g. "senior database architect", "professional research analyst"].
Use domain-precise vocabulary throughout your output. Never use vague qualitative descriptions where
a quantitative one exists (e.g. say "P95 < 200ms" not "fast").

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the six rules that govern this HANDOFF
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

VERIFY before completing: Confirm your output explicitly covers:
- <required topic 1>
- <required topic 2>
- <required topic 3>
If any are missing, add them before printing the completion phrase.

[Code tasks only] Runnable verify commands (tests/lint/typecheck) go in the
context packet inside a fenced block whose opening line is "```verify" -- one
command per line, verbatim. Then require:
  bash ~/.config/opencode/scripts/verify-handoff.sh <packet-file> --baseline   (BEFORE first edit)
  bash ~/.config/opencode/scripts/verify-handoff.sh <packet-file>              (loop until ALL GREEN)
The harness runs each command exactly as written, keeps output tails, checks
the pass-count baseline, and writes docs/work/VERIFY_REPORT.md itself -- the
specialist pastes that file into the completion report instead of retyping
outputs (small models relabel errors and truncate summaries when trusted to
transcribe; the harness makes that impossible).

Include a Completion Manifest at <manifest-path> with required sections:
- Files produced (path, content summary, line count) -- every path is
  checked to exist on disk (validate-completion-manifest.sh v2, T27.2);
  backtick-quote each path so the checker can find it
- Decisions made (decision + why)
- Known issues / deferred (issue + which agent should address it)
- Memory written (MEMORY_PRIMER M4) -- you `memory_store` your durable
  decisions/errors/verified-facts and record them here (or "None -- nothing
  durable"); you do NOT recall (the lead gave you a memory slice in this packet)
- Verify result (what you checked, outcome) -- must cite a concrete,
  backtick-quoted artifact path (a test log, VERIFY_*.md, a receipt) that
  exists on disk; a bare claim like "tests pass" with nothing to check it
  against fails the gate

Also include, outside any heading (plain lines anywhere in the manifest):
- `Maker: <name>` -- who produced this artifact
- `Verifier: <name>` -- who independently checked it (MODEL_ADAPTER.md
  maker/verifier split); must differ from Maker or the gate fails --
  self-verification defeats the point of a verify step
- `Tracker updated: <file>` -- where this step was recorded

When all files are written, print exactly:
"<agent> done -- <one sentence describing what was produced>"
Then stop. Do not ask for follow-up. Do not run additional phases.
════════════════════════════════════════════════════════════
END HANDOFF #N
════════════════════════════════════════════════════════════
```

## Template 2: Remediation HANDOFF (after a review)

Use this template for fix-after-review cycles. It references a FIX_BACKLOG.

```
---
  HANDOFF -> /code (coding-agent) -- REMEDIATION
---
SDLC-TASK for coding-agent:

CONTEXT:
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the six rules
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
Write each block to its own `docs/work/HANDOFF_<agent>.md`, then tell the user to open the N agents (`/<skill>` each) and have each read its handoff doc. The docs are read — nothing is pasted.

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

Gates, any failure aborts the rest:

1. **Scope** — `validate-scope.sh` confirms all git writes landed in the assigned directory (plus `docs/work/**` and `docs/reviews/**`)
2. **Manifest** — `validate-completion-manifest.sh` v2 (T27.2) confirms the manifest has the required sections AND that its claims are real: every "Files produced" path exists on disk, "Verify result" cites an artifact that exists, Maker/Verifier identity lines are present and distinct
3. **Coverage** — domain-specific validator (see the mapping below)
4. **Tracker** — `validate-tracker-fresh.sh` (T27.2) confirms tracker-worthy work changed a tracker file (SDLC_TRACKER / PROGRESS / DELEGATION_LOG / CHANGELOG)

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

## Template 10: Design System HANDOFF (Phase 4 Wave 0 — UI-bearing only)

Use BEFORE any feature coding waves start. The design system must exist before coding agents build feature UI.

```
---
  HANDOFF -> /frontend (frontend-design) — DESIGN SYSTEM (Wave 0)
---
Write this block to `docs/work/HANDOFF_frontend-design.md`, then tell the user: open `/frontend` and have it read `docs/work/HANDOFF_frontend-design.md` and follow it. It reads the doc — nothing is pasted.

TASK for frontend-design:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the six rules
- docs/work/context-for-frontend-design.md     -- full context packet
- docs/design/STYLE_GUIDE.md                   -- color tokens, typography, spacing, motion
- docs/design/UX_SPEC.md                       -- component library selection + component inventory
- docs/design/DESIGN_PRINCIPLES.md             -- aesthetic direction and anti-patterns
- docs/TECH_STACK.md                           -- framework version (React/Vue/Svelte/etc.)

WRITE-SCOPE (exclusive):
- src/components/ui/   (or src/components/ if no ui/ subdirectory convention)
- src/styles/          (or src/theme/ — wherever tokens belong in this stack)
- docs/design/DESIGN_SYSTEM.md

YOUR TASK:
Implement the design system from the UX specs. This is Wave 0 — coding agents building
features depend on this existing FIRST. Every component they build will import from what
you create here.

Step 1 — Token file: create or update the design token file (tailwind.config.ts,
tokens.css, theme.ts, or stack-appropriate equivalent). Implement the full color palette
from STYLE_GUIDE.md as named tokens. Implement the typography scale, spacing scale,
and motion tokens. No hardcoded values in components — everything references tokens.

Step 2 — Component library wiring: install and configure the component library selected
in UX_SPEC.md § Component Library. Apply the token layer to it (override default theme
with STYLE_GUIDE tokens where the library supports theming).

Step 3 — Base components: implement every component listed in UX_SPEC.md § Component
Inventory. Each component must:
- Use design tokens only (no hardcoded hex values, px sizes, or font names)
- Be typed (TypeScript interfaces for all props)
- Export from a barrel file (src/components/ui/index.ts)
- Have a brief JSDoc comment explaining its purpose

PRODUCE exactly these:
- Token file at appropriate location (tailwind.config.ts / src/styles/tokens.ts / etc.)
- src/components/ui/[ComponentName].[tsx|jsx|vue] — one file per inventory component
- src/components/ui/index.[ts|js] — barrel export of all components
- docs/design/DESIGN_SYSTEM.md — token inventory (every token name + value), component
  usage examples, naming conventions, "do / don't" examples
- docs/work/MANIFEST_design_system_<date>.md — completion manifest

When done, print exactly:
"frontend done — design system: [N components, token file, library wired: X]"
Then stop. Do not ask for follow-up.

---
```

After "frontend done":
1. Run `./scripts/validators/run-handoff-gates.sh --scope src/components --scope src/styles --scope src/theme --manifest docs/work/MANIFEST_design_system_<date>.md --coverage validate-design-system.sh`
2. All gaps fixed → Wave 0 complete → feature coding waves may begin

---

## Template 7: Module Design HANDOFF (Phase 3 — after TECH_STACK)

Use after TECH_STACK.md is complete. architecture-designer produces MODULE_DESIGN.md (lego structure) and INFRASTRUCTURE.md (deployment topology) in one pass.

```
---
  HANDOFF -> /architect (architecture-designer) — MODULE DESIGN + INFRASTRUCTURE
---
Write this block to `docs/work/HANDOFF_architecture-designer.md`, then tell the user: open `/architect` and have it read `docs/work/HANDOFF_architecture-designer.md` and follow it. It reads the doc — nothing is pasted.

SDLC-TASK for architecture-designer:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the six rules
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
Write this block to `docs/work/HANDOFF_sre-engineer.md`, then tell the user: open `/devops` and have it read `docs/work/HANDOFF_sre-engineer.md` and follow it. It reads the doc — nothing is pasted.

SDLC-TASK for sre-engineer:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the six rules
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
Write this block to `docs/work/HANDOFF_sre-engineer.md`, then tell the user: open `/devops` and have it read `docs/work/HANDOFF_sre-engineer.md` and follow it. It reads the doc — nothing is pasted.

SDLC-TASK for sre-engineer:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the six rules
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
Write this block to `docs/work/HANDOFF_security-auditor.md`, then tell the user: open `/security` and have it read `docs/work/HANDOFF_security-auditor.md` and follow it. It reads the doc — nothing is pasted.

SDLC-TASK for security-auditor:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the six rules
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
Write this block to `docs/work/HANDOFF_test-engineer.md`, then tell the user: open `/test-expert` and have it read `docs/work/HANDOFF_test-engineer.md` and follow it. It reads the doc — nothing is pasted.

SDLC-TASK for test-engineer:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the six rules
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

## Template 11: Requirement Reconciliation HANDOFF (Phase 4 → 5, T29.2)

Use once Phase 4 implementation is otherwise complete, before the Phase 5 release gate runs.
**Mandatory when `docs/USER_STORIES.md` exists and any `plan.json` module declares `stories[]`** —
`validate-requirement-closure.sh` refuses Phase 5 without the resulting matrix (see
`docs/TICKET_SCHEMA.md`'s "Requirement (story) coverage & closure"). The point of this HANDOFF is
that it looks at the actual code, not the ticket board — a module can show `status: "done"` and
the story it claims can still be unimplemented, half-implemented, or claimed by a ticket that
never actually touched it; that gap is exactly what task closure (module status) cannot catch and
requirement closure (this matrix) is built to.

```
---
  HANDOFF -> /code (coding-agent) — REQUIREMENT RECONCILIATION
---
Write this block to `docs/work/HANDOFF_coding-agent.md`, then tell the user: open `/code` and have it read `docs/work/HANDOFF_coding-agent.md` and follow it. It reads the doc — nothing is pasted.

SDLC-TASK for coding-agent:

CONTEXT (read these before starting):
- agents/shared/BOUNDED_TASK_CONTRACT.md       -- the six rules
- docs/work/context-for-coding-agent.md        -- full context packet
- docs/USER_STORIES.md                         -- every story this reconciles against (source of truth)
- docs/work/plan.json                          -- modules[], each module's `stories[]` + `status`
- docs/TRACEABILITY.md                         -- if present, cross-reference FR/UC ids already linked to stories

WRITE-SCOPE (exclusive):
- docs/work/REQUIREMENT_RECONCILIATION.md      -- the only file this HANDOFF produces

YOUR TASK:
For EVERY story heading in docs/USER_STORIES.md (not just the ones a module claims), determine
its real implementation state by reading the actual source/tests it should have produced --
never take a module's `status: "done"` at face value. For each story, record one of:
  - DONE       -- code + tests exist and demonstrably satisfy every acceptance bullet
  - PARTIAL    -- some acceptance bullets are met, some are not (say which); disclosed, not hidden
  - OUTSTANDING -- no code implements this story yet, or the module claiming it doesn't actually
                   cover it (module `stories[]` says it does, but the code says otherwise)
A story with zero modules referencing it in `stories[]` is OUTSTANDING by definition -- do not
upgrade it just because some other module happens to touch related code.

PRODUCE exactly this file:
- docs/work/REQUIREMENT_RECONCILIATION.md -- one markdown table row per story:
  | Story | Title | Verdict | Evidence |
  |-------|-------|---------|----------|
  | US-01 | Checkout | DONE | src/checkout/checkout.test.ts:12-40, all 3 AC bullets pass |
  Evidence must name real files/tests/commits -- "looks done" is not evidence.

VERIFY before completing:
- Every story heading in docs/USER_STORIES.md has exactly one row.
- No row is missing a DONE/PARTIAL/OUTSTANDING verdict.
- Any PARTIAL/OUTSTANDING row states specifically what's missing, not just the label.

Print exactly:
"reconciliation done -- [N DONE, N PARTIAL, N OUTSTANDING of N total stories]"
Then stop. Do not ask for follow-up. Do not run additional phases.

---
```

After "reconciliation done": run
`./scripts/validators/validate-requirement-closure.sh` — it fails Phase 5 on any missing row or
any `OUTSTANDING` verdict (a `PARTIAL` verdict is allowed through; it's a disclosed gap, not a
silently-missing one). An `OUTSTANDING` row is a real signal to go implement that story, or to
explicitly descope it out of `docs/USER_STORIES.md` with the T29.7 scope-cut protocol (never just
delete the row from the matrix to make the gate pass).

---

## Context Packet template

Before every HANDOFF, write a `docs/work/context-for-<agent>.md` with:

```markdown
# Context Packet for <agent-name>

> **Size limit: 400 words / ~600 tokens.** The specialist reads ONE focused packet, then reads the listed files directly. Do NOT paste file contents into the packet — list the file paths instead.

## Project (3 sentences max)
<From DISCOVERY.md or README — what the system is, who uses it, current state>

## Your task (2 sentences max)
<Specific: what to produce, success criteria, line count expectations>

## Files to read (3 files max, priority order)
1. <file> -- <what's relevant for THIS task>
2. <file> -- <what's relevant>
3. <file> -- <what's relevant>

## Exemplar (exactly one, by pointer)
exemplars/<matching-artifact>.md -- produce output shaped like this; copy structure, not domain content

## Memory slice (≤200 tokens, assembled by the orchestrator — see MEMORY_PRIMER M4)
<relevant facts/decisions/errors for THIS task, with citations. Omit section if none.>

## Files to produce
1. <file> -- <expected content, approximate scope>

## Patterns to follow (2 sentences max)
<From existing codebase: naming conventions, file structure, max line counts,
 test patterns, import rules>

## What NOT to do (2 sentences max)
<Scope boundaries: don't refactor X, don't touch Y, don't add dependencies>
```

The specialist reads ONE focused file instead of re-exploring the whole codebase.
