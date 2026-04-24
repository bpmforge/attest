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
===========================================================
  HANDOFF -> /<skill> (<agent-name>)
===========================================================
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

===========================================================
```

## Template 2: Remediation HANDOFF (after a review)

Use this template for fix-after-review cycles. It references a FIX_BACKLOG.

```
===========================================================
  HANDOFF -> /code (coding-agent) -- REMEDIATION
===========================================================
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

===========================================================
```

## Template 3: Re-verification HANDOFF (targeted)

Use this after a remediation cycle. The reviewer does NOT re-scan for new issues — only verifies the backlog.

```
===========================================================
  HANDOFF -> /<skill> (<agent-name>) -- TARGETED RE-VERIFICATION
===========================================================
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

===========================================================
```

## Template 4: Parallel wave HANDOFFs (Phase 4 / Mode 3 split)

Emit N HANDOFF blocks in ONE message -- one per module. User opens N concurrent OpenCode sessions.

```
===========================================================
  PARALLEL WAVE -- ROUND 1 (CODE) -- N concurrent HANDOFFs
===========================================================
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
===========================================================
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
