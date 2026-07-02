---
name: phase-routing-protocol
description: Smart routing table for sdlc-lead — maps natural-language user intent to modes, escape hatches for narrow asks, two-track gate system (coverage loop vs confidence loop), and validation gate chain per phase.
metadata:
  type: protocol
---

# Phase Routing Protocol

Loaded by sdlc-lead when routing an ambiguous user request, checking gate status, or deciding between Track 1 and Track 2 validation. Reference — do not inline.

## Smart Routing (Natural Language)

Map user intent to the correct SDLC mode. **Do not freelance audits or scans.** Anything that looks like "evaluate this codebase" routes into a mode and runs the discovery interview first.

| User says | Route to |
|-----------|----------|
| "build a new app" / "start a project" | Mode 1 (`/sdlc init`) |
| "understand this codebase" / "onboard me" / "what does this do" | Mode 2 (`/sdlc onboard`) |
| "add X feature" / "need a new feature" / "build X" | Mode 3 (`/sdlc feature`) |
| "improve X" / "UI looks bad" / "make it better" / "this is slow" | Mode 4 (`/sdlc improve`) |
| "review (the product / code / branch)" / "find gaps" / "what should we fix" / "audit (this / UX / performance / security)" / "evaluate" / "give me an assessment" / "health check" / "where are the problems" / "is there anything wrong with X" | **Mode 4 (`/sdlc improve`)** — never freelance |
| "I'm not sure where to start" | Ask: A) new / B) exists-understand / C) exists-feature / D) exists-improve |

Ask AT MOST one clarifying question. Do not ask more than one.

### Hard Rule — When Routed into Mode 4

1. Acknowledge: "Routing into Mode 4 (`/sdlc improve`) so the analysis goes through the SDLC pipeline."
2. Read `agents/sdlc-improve-mode.md` in full.
3. Run the Improvement Discovery Interview (do not skip — even if the user said "audit everything").
4. Continue Mode 4 from Step 1.

### Escape Hatches — Narrow Asks Bypass Mode 4

- "Review **this function** / **this file**" → recommend `/review-code` directly. Mode 4 is for system-level reviews.
- "Look at PR #N" → recommend `/review-code` (or `/security` if auth-touching).
- "Quick sanity check on X" where X is a single artifact → suggest the matching specialist skill.

The boundary: Mode 4 is for "what should we improve about this **system**". Single-file/single-PR/single-function goes to the specialist directly.

---

## Validation Gate System

Every phase advance calls `scripts/validators/validate-phase-gate.sh <phase>` which chains the relevant validators. Phases are **ordered** — the gate writes a lock file on success and checks for the prior phase's lock before running.

| Phase | Validators run | Gate type |
|-------|---------------|-----------|
| phase-0 | File-existence only | Soft (no prereq) |
| phase-1 | File-existence only | Prereq: phase-0 |
| phase-2 | use-cases + user-stories + traceability | Prereq: phase-1 |
| phase-3 | architecture + api-coverage + sequence-coverage + erd-coverage + c3-coverage + entry-points + tech-stack + adrs + security-controls | Prereq: phase-2 |
| phase-3.5 | validate-test-design (coverage loop / escalation) | Prereq: phase-3 |
| phase-4 | build + lint + tests + tests-mapping + migrations | Prereq: phase-3.5 |
| phase-5 | Release gate: FIX_BACKLOG closed, all reviews APPROVED, RUNTIME PASS | Prereq: phase-4 |
| onboard-deep | inventory + architecture + erd-coverage + sequence-coverage | Standalone |
| security-deep | owasp + attack-chains | Standalone |

If the gate exits non-zero, the phase cannot advance. Fix the gaps then re-run.

---

## Two-Track Gate System

Every artifact falls into one of two tracks. Pick the right one — never mix.

### Track 1 — Coverage Loop (Objective, Default)

For artifacts where coverage IS validatable by a script — architecture diagrams, OWASP tracker, API coverage, ERD, sequence diagrams, C3 components, entry points, use cases, user stories, tech stack, ADRs, migrations, fix-backlog closure, build/test/lint/smoke/deps:

```bash
./scripts/validators/run-coverage-loop.sh <phase>
```

| Exit | Meaning | Action |
|------|---------|--------|
| 0 | Clean | Mark tracker DONE, advance |
| 1 | Gaps remain (iter < 3) | Read `docs/work/COVERAGE_LOOP_<phase>_<date>.md`, emit one gap-fill HANDOFF per uncovered row, re-run |
| 2 | 3 iterations exhausted | Emit escalation block from `agents/shared/RALPH_WIGGUM_LOOP.md` |

Do not second-guess the script. If validators say a row is uncovered, it is.

### Track 2 — Confidence Loop (Subjective, Narrative-Only)

For artifacts where coverage isn't script-validatable — narratives, summaries, research reports, vision statements:

1. Draft the artifact
2. Score 1-10 against grounding criteria (spec completeness, internal consistency, traceability to source)
3. If score < 5 → surface to user immediately
4. If score 5-6 → revise up to 3 passes
5. If score >= 7 → mark tracker row DONE

**Use Track 2 sparingly.** If a structural validator could be written, write the validator instead. Confidence loops are for content judgment (does VISION.md capture the user's vision?), not completeness (does ARCHITECTURE.md include all 6 diagram types? — that's `validate-architecture.sh`).

---

## Inter-Phase Check-In (Mandatory After Every Gate Pass)

After every gate passes:

```
PHASE <N> PASSED (✅)

What's next: <Phase N+1 name>
Deliverables: <one-line per deliverable>
Time estimate: <hours>
Agents needed: <list>

Ready to proceed, or want to review/adjust Phase <N> first?
```

Wait for user confirmation before starting the next phase. Do not auto-continue.
**Autonomy:** If `autonomy: auto` per `agents/shared/AUTONOMY_PROTOCOL.md`: continue to the next step and log to `docs/work/APPROVALS.md` instead of waiting.
