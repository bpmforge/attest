---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# RALPH_WIGGUM_LOOP.md

**Canonical universal coverage loop.**

Named for the fictional character who repeats himself until he gets it right. Replaces confidence-score feelings with coverage-percentage facts.

As of v0.20.0, this loop is **universal** — it runs in every mode whenever validators report gaps, not just `--deep`. The orchestrator wrapper is `./scripts/validators/run-coverage-loop.sh <phase>`, which:

1. Runs `validate-phase-gate.sh <phase>`
2. Records iteration result + a gap checksum to `docs/work/COVERAGE_LOOP_<phase>_<date>.md`
3. Exits **0** (clean), **1** (gaps remain — iterate), **2** (cap exhausted — escalate), or **3** (no-progress halt — the gap set is byte-identical to the previous iteration, so iterating again is futile — escalate immediately)

The orchestrator iterates manually: read the gap list, emit one gap-fill HANDOFF per uncovered row, then re-run the script. On exit 2 **or** exit 3 the orchestrator must emit the escalation block (waiver / lower-bar / specialist / manual) — exit 3 just means stop early instead of burning the remaining iterations on the same stuck rows.

Modes that USE the loop:
- `/sdlc init` Phase 3 (design coverage) and Phase 4 (implementation coverage)
- `/sdlc onboard` (default — lightweight) and `/sdlc onboard --deep` (full inventory)
- `/sdlc feature` Step 5 (per-feature coverage)
- `/sdlc improve` (audit-coverage matrix)
- `/security` and `/security --deep` (OWASP coverage)

---

## The loop

```
1. INVENTORY   — enumerate the universe (every row = something that must be covered)
2. DISCOVER    — produce one artifact per inventory row
3. VERIFY      — run validator script; report which rows are uncovered
4. GAP         — re-discover ONLY the uncovered rows
5. REPEAT      — steps 3-4 until coverage = 100% OR 3 iterations (then escalate)
```

Coverage is objective: either every row has an artifact or it does not. No confidence score, no feeling.

---

## Step 1 — INVENTORY

Produce an inventory file that enumerates every unit requiring coverage. Format: markdown table, one row per unit, with:

| Column | Meaning |
|--------|---------|
| `ID` | Stable identifier (R-01, T-01, S-01, F-01, E-01 by category) |
| `Category` | One of: ROUTE, TABLE, SERVICE, FLOW, ENTRY (extend per use case) |
| `Description` | What this row represents (one line) |
| `Artifact` | What must exist for this row to be "covered" |
| `Status` | PENDING / DONE / BLOCKED |

**Inventory file locations (by use case):**

| Use case | Inventory file |
|----------|----------------|
| `/sdlc onboard --deep` | `docs/onboard/INVENTORY.md` |
| `/security --deep` | `docs/security/OWASP_INVENTORY.md` (already the OWASP_TRACKER) |
| `/sdlc init` Phase 3 diagrams | `docs/sdlc/ARCHITECTURE_INVENTORY.md` (part of SDLC_TRACKER) |

**Coverage validators (current catalog as of v0.19.0):**

| Validator | What it covers |
|-----------|----------------|
| `validate-architecture.sh` | All 6 diagram types in ARCHITECTURE.md, real Mermaid fences |
| `validate-api-coverage.sh` | Every route in source has API_DESIGN.md + openapi.yaml entry |
| `validate-erd-coverage.sh` | Every table/model in source has an ERD entry |
| `validate-sequence-coverage.sh` | Every P0 use case has a sequence diagram |
| `validate-c3-coverage.sh` | Every src/ subdir has a C3 component entry |
| `validate-entry-points.sh` | Every server/CLI/worker entry point is documented |
| `validate-use-cases.sh` | Every use case row has all required fields + valid priority |
| `validate-user-stories.sh` | Every story has acceptance criteria; every persona has a story |
| `validate-tech-stack.sh` | Every dependency in package.json / pyproject.toml / Cargo.toml / go.mod is in TECH_STACK.md |
| `validate-tests-mapping.sh` | Every P0/P1 use case has a test referencing it |
| `validate-fix-backlog-closed.sh` | All CRITICAL/HIGH rows are VERIFIED/FIXED/WAIVED |
| `validate-adrs.sh` | Every ADR-NNN reference has a corresponding ADR file with status |
| `validate-migrations.sh` | Every migration file is referenced in DATABASE.md |
| `validate-inventory.sh` | Every INVENTORY.md row has its artifact (deep mode) |
| `validate-owasp.sh` | All 10 OWASP categories ≥ confidence 7, attack-chains.md present |
| `validate-no-ascii-art.sh` | No box-drawing chars or banner separators in deliverables |
| `validate-build.sh` / `validate-tests.sh` / `validate-lint.sh` / `validate-smoke.sh` / `validate-deps.sh` | Operational checks — actually execute build/test/lint/smoke/audit |

The inventory is produced by one focused HANDOFF. The agent discovers the units from the actual codebase (or spec, or rule set) -- NOT from memory or guessing.

### Refuse-to-loop gate (every row needs a checkable "done")

**Loop-engineering rule (Osmani's "loopmaxxing" failure mode):** a loop with no binary pass/fail has no stopping condition — it just converts budget into burn. So **every inventory row's `Artifact` must name a checkable success criterion** — a validator script, a test, a file-existence check, a runtime smoke. Before DISCOVER:

- If a row has a validator/scriptable check → it enters the loop normally.
- If a row's "done" is **subjective** (e.g. "improve the UX", "make the copy punchier") with no script and no measurable target → **do not loop on it.** Flag it `BLOCKED: no checkable success` and route it to a human or an interactive session. Looping cannot converge on a goal it cannot evaluate.

The validator catalog below is the menu of checkable criteria; a row that maps to none of them, and to no project test, is a refuse-to-loop row.

**Enforced, not advisory:** run `scripts/validators/validate-loop-readiness.sh [project-root]` on the inventory **before DISCOVER**. It parses the Artifact column and exits 1 with a gap list for every row whose artifact is not objectively checkable ("improve the UX", "make it nicer"). Fix those rows (give them a validator/test/measurable target) or mark them `BLOCKED: no checkable success` and route to a human — do not enter the loop with them.

---

## Step 2 — DISCOVER

For every row in the inventory, emit a focused HANDOFF that produces the artifact.

**One row = one HANDOFF.** Multiple rows can be emitted in parallel (batch per wave). Each HANDOFF is scoped to that one row -- it does not "also explore adjacent rows while you're there." That drift is what makes exhaustive verification turn into hand-wavy overview.

The HANDOFF writes the artifact and flips the row's Status from PENDING to DONE in the inventory.

---

## Step 3 — VERIFY

Run the corresponding validator script:

| Use case | Validator |
|----------|-----------|
| onboard-deep | `scripts/validators/validate-inventory.sh` |
| security-deep | `scripts/validators/validate-owasp.sh` |
| architecture | `scripts/validators/validate-architecture.sh` |

The validator returns:
- Exit 0 -- all rows covered, loop closed
- Exit 1 -- gap list (which rows uncovered, which artifacts missing)
- Exit 2 -- validator itself errored (investigate before continuing)

**Do not proceed on orchestrator feeling.** If the validator says a row is uncovered, it is uncovered. Run it.

---

## Step 4 — GAP

For every row the validator flagged, emit a FOCUSED gap-fill HANDOFF. The HANDOFF mentions:
- The specific row ID and description
- The exact gap reported by the validator
- The ONE artifact to produce

Do NOT re-run the whole DISCOVER phase. Re-discover only the uncovered rows. This is the efficiency that makes Ralph Wiggum practical -- you don't regenerate work that's already done.

---

## Step 5 — REPEAT

Go back to Step 3. Run the validator again.

**Hard cap: 3 iterations.** If iteration 3 still has gaps:

```
---
  RALPH WIGGUM LOOP EXHAUSTED (3 iterations, gaps remain)
---
Inventory file:  docs/onboard/INVENTORY.md
Uncovered rows:
  - <row ID> (<category>): <description>
  - <row ID> (<category>): <description>

Choose one:
  (A) Sign a waiver -- mark these rows as out-of-scope with justification
  (B) Lower the bar -- change the inventory itself (drop rows that are
      genuinely not worth covering)
  (C) Escalate to specialist -- these rows need a different agent or
      deeper investigation
  (D) Manual fill -- produce the artifact yourself and mark the row DONE

No 4th iteration without explicit user direction.
---
```

Record the escalation in `docs/work/DELEGATION_LOG.md`.

---

## Why this works better than confidence scores

**Confidence score loop:** agent produces output, rates itself 7/10, orchestrator accepts. Three iterations later the orchestrator asks "is this good?" -- still a feeling. No external check.

**Ralph Wiggum loop:** agent produces output, validator checks `for row in inventory { exists(artifact[row]) }`. Pass or fail. No interpretation. The inventory is the contract; the validator is the judge.

Result: faster convergence to actual completeness. Agents that would have stopped at 7/10 because "this feels comprehensive" keep going until every row has evidence.

---

## Budget & pacing

A full Ralph Wiggum loop is more expensive than a one-pass discovery. Expect:

| Use case | Quick pass | Deep (Ralph Wiggum) |
|----------|-----------|---------------------|
| onboard | ~15 min | ~45-90 min |
| security | ~10 min | ~45-90 min |

The deep mode is opt-in via `--deep`. It is NOT the default. Reach for it when you need defensible coverage: onboarding a codebase before a contract bid, security audit before a production release, diligence before a compliance check.

---

## Adoption checklist (for mode authors)

If you're adding Ralph Wiggum to a new use case:

- [x] Define the inventory schema (what columns? what categories?)
- [x] Write the inventory-producer HANDOFF (step 1)
- [x] Write the per-row discover HANDOFF (step 2)
- [x] Build or pick a validator script (step 3; see `scripts/validators/`)
- [x] Write the gap-fill HANDOFF (step 4) -- focused, one row
- [x] Wire the 3-iteration cap and escalation block (step 5) — exit code 2 triggers escalation
- [x] Update the relevant mode file to invoke the loop under `--deep`

---

## Hard cap: 3 iterations — what happens when you hit it

**The 3-iteration cap is enforced by `run-coverage-loop.sh`** via exit code 2. When iteration 3
completes and gaps remain, the orchestrator MUST NOT attempt a 4th pass. Instead:

```
RALPH WIGGUM LOOP EXHAUSTED — 3 iterations, gaps remain

Remaining gaps:
  [list from final validator output]

Escalation options (pick one):
  A. WAIVER    — record gap in WAIVERS.md with justification, proceed
  B. LOWER BAR — reduce acceptance threshold, re-run validate (document why)
  C. SPECIALIST HANDOFF → [domain-expert agent] to fill gap
  D. MANUAL    — flag for human review, do not block phase gate

Emit the chosen option as your next HANDOFF. Do not loop again.
```

**Why the cap exists:** unbounded loops mask broken validators and waste context. Three passes is
enough to detect systemic gaps. If gaps persist after three passes, the problem is structural —
fix the inventory, the validator, or the gap-fill strategy, not iterate again.

**Agent behaviour at cap (or on exit-3 no-progress halt):**
- Record the gap list to `docs/work/COVERAGE_LOOP_<phase>_<date>.md`
- **Capture the lesson** so the same stall is not repeated next week (Cherny's "write it down, don't re-prompt"):
  ```
  node scripts/loop-learn.mjs \
    --symptom "<phase> stuck: <which rows, what gap>" \
    --cause   "<why the gap-fill HANDOFFs didn't close it>" \
    --rule    "<what to do differently — fix inventory / validator / strategy>" \
    --source  "ralph-wiggum:<phase>" --claude
  ```
  Pass the printed `memory_store` payload to the memory MCP. `/steward` later distills `docs/work/LESSONS.md` into the canonical docs.
- Emit the escalation block above as the assistant's next message
- Await human input or proceed with option A/B/C/D as appropriate to the project's autonomy level
