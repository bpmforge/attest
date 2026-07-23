---
description: 'Mode 1 phase files — Phases 0-2: Ideation, Planning, Requirements. Loaded on demand by sdlc-init-mode.md dispatcher when entering Phase 0, 1, or 2.'
mode: "subagent"
---

> **Persistence (do not end your turn early):** never end your turn after *announcing* an action — perform it; if you cannot call a tool, print `BLOCKED: <reason>` (never a plan as your final message). Full rule: `agents/shared/PERSISTENCE.md`.


# Mode 1 — Phases 0–2: Ideation, Planning, Requirements

> Load only when sdlc-init-mode.md directs you here. The mandatory rules (loop prevention, document hygiene, delegation) live in sdlc-init-mode.md and apply here too.
>
> **task() → HANDOFF (compact reminder):** Any `task(agent="X", ...)` in this file = emit a HANDOFF block for X using the `════` delimiter format, save state to `docs/work/sdlc-state.md`, wait for user to return. Full rules in `sdlc-init-mode.md` § Delegation Rule.
> **Autonomy:** In `autonomy: auto` (per `agents/shared/AUTONOMY_PROTOCOL.md`) never wait on a paste — Executor C degrades to D (inline) per `EXECUTOR_SELECTION.md`.

## HANDOFF intake (MANDATORY — resolve before any other mode)

Three shapes, all meaning **execute now**: prompt starts with `SDLC-TASK for`; prompt names a
`docs/work/HANDOFF_*.md` path in any wording (read that file first — a pointer to a HANDOFF *is* a
HANDOFF); prompt tells you to open a skill that is you (you already are it — execute). HANDOFF paths
are project-relative: read `docs/work/...`, never `/docs/work/...` (a leading `/` is denied); on a
failed read, retry once relative before reporting.

Never re-emit a HANDOFF you received: don't print the block back, don't rewrite
`docs/work/HANDOFF_<yourself>.md`, don't tell the user to open the skill you are running. `USER:`
lines inside the block are for the human who already delivered it — ignore, never relay. Never end a
turn asking which mode/slug/scope: `YOUR TASK` + `PRODUCE` are the answer; pick the documented
default and say so, or print `BLOCKED: <reason>`. Then follow `BOUNDED_TASK_CONTRACT.md`.

Emitting a HANDOFF is correct only if none was delivered to you. Delegating to a *different* agent is
fine; re-issuing your own task is not.

## Phase 0: Ideation — WHY are we building this?

**First, bootstrap the repo via `task` tool:**
- `task(agent="git-expert", prompt="Run --init mode: git init, language-aware .gitignore, initial commit on main (README + .gitignore only), configure remotes (gitea primary + github mirror by default), install commitlint + lefthook/husky hooks, enforce branch protection on main (require PR review, no direct push, require CI), then create and checkout branch 'sdlc/setup'. All SDLC docs (phases 0-3) will be committed to sdlc/setup — NOT main. Write report to docs/git/INIT_<date>.md", timeout=120)` — Run BEFORE any `docs/` files are written so VISION.md is the first tracked artifact on the `sdlc/setup` branch.

**Initialize the SDLC_TRACKER for Mode 1** (immediately after the repo is bootstrapped):
```
write(filePath="docs/sdlc/SDLC_TRACKER.md", content="[Mode 1 template from SDLC_TRACKER section above — fill in project name and date]")
```
This file lives on `sdlc/setup` alongside the rest of the SDLC docs. It persists across sessions so you can resume without re-running completed phases.

**Deliverables:**
- `docs/VISION.md` — Problem, target users, success metrics
- `docs/COMPETITIVE_ANALYSIS.md` — What exists, gaps, differentiation

**Save state, then HANDOFF to researcher:**
```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 1 / Phase: 0 — Ideation
Last completed: Discovery Interview
Awaiting: researcher — docs/research/RESEARCH_competitive_<date>.md
Next after resume: Research Findings Review, then write VISION.md
Delegation log: docs/work/DELEGATION_LOG.md
")
```

```
---
  HANDOFF → researcher
---
Write this block to `docs/work/HANDOFF_researcher.md`, then tell the user: open `/research` and have it read `docs/work/HANDOFF_researcher.md` and follow it (it reads the doc — nothing is pasted):

SDLC-TASK for researcher:

CONTEXT (read these before starting):
- docs/DISCOVERY.md — project vision, target users, key assumptions from the discovery interview

YOUR TASK:
Research the competitive landscape for [domain]. Investigate who the main competitors are,
what they offer, their pricing and target customers, what technical gaps or underserved
segments exist, and what differentiates the strongest players.

PRODUCE exactly these files (nothing else):
- docs/research/RESEARCH_competitive_<date>.md — structured findings with sources

Include a Completion Manifest at the end.

When the file is written, print exactly:
"researcher done — competitive analysis: [one sentence summary of key finding]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

**After researcher returns:** Run the **Research Findings Review Protocol** — read the report, cross-reference with DISCOVERY.md, surface any contradicting findings to the user BEFORE writing VISION.md.
**You write:** VISION.md (strategic, not technical) using answers from DISCOVERY.md + any direction changes the user approved in the Research Findings Review.
**Exit:** Clear problem statement, target users identified, competitive gap defined.

**Gate Loop:** VISION.md and COMPETITIVE_ANALYSIS.md are narrative artifacts → use Track 2 (confidence loop) per the Two-Track Gate System section in `sdlc-lead.md`. Minimum score 7 before Phase 1.
**Git checkpoint — commit Phase 0 docs before advancing:**
```
task(agent="git-expert", prompt="Commit all new docs/ files from Phase 0 (VISION.md, COMPETITIVE_ANALYSIS.md, any research files) to the sdlc/setup branch. Conventional commit: 'docs(phase-0): add ideation artifacts — VISION + competitive analysis'. Push sdlc/setup to origin. Do NOT push to main.", timeout=60)
```
**Inter-Phase Check-In:** After the gate passes AND docs are committed, run the Inter-Phase Check-In Protocol. Do NOT auto-advance.
**Autonomy:** If `autonomy: auto` per `agents/shared/AUTONOMY_PROTOCOL.md`: continue to the next step and log to `docs/work/APPROVALS.md` instead of waiting.

## Phase 1: Planning — WHAT are we building?

**Deliverables:**
- `docs/SCOPE.md` — In scope, out of scope, MVP boundary
- `docs/RISKS.md` — Technical, business, timeline risks + mitigations
- `docs/CONSTRAINTS.md` — Budget, timeline, team, tech constraints
- `docs/USER_PERSONAS.md` — Who uses this, goals, pain points

**Save state, then HANDOFF to researcher:**
```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 1 / Phase: 1 — Planning
Last completed: Discovery Interview reviewed
Awaiting: researcher — docs/research/RESEARCH_feasibility_<date>.md
Next after resume: Research Findings Review, then write SCOPE.md, RISKS.md, CONSTRAINTS.md, USER_PERSONAS.md
Delegation log: docs/work/DELEGATION_LOG.md
")
```

```
---
  HANDOFF → researcher
---
Write this block to `docs/work/HANDOFF_researcher.md`, then tell the user: open `/research` and have it read `docs/work/HANDOFF_researcher.md` and follow it (it reads the doc — nothing is pasted):

SDLC-TASK for researcher:

CONTEXT (read these before starting):
- docs/DISCOVERY.md — project constraints, team experience, key technical requirements
- docs/VISION.md — what we're building and why

YOUR TASK:
Research technical feasibility for [domain]. Investigate what libraries and frameworks exist
for [key technical requirement], any licensing constraints affecting commercial use, known
limitations or scale ceilings, and whether open-source alternatives cover the core requirements.

PRODUCE exactly these files (nothing else):
- docs/research/RESEARCH_feasibility_<date>.md — structured findings with sources

Include a Completion Manifest at the end.

When the file is written, print exactly:
"researcher done — feasibility: [one sentence summary of key finding or showstopper]"
Then stop. Do not ask for follow-up. Do not run additional phases.
---
```

**After researcher returns:** Run the **Research Findings Review Protocol** — if the feasibility research flags a showstopper (unavailable library, licensing conflict, capacity limit), surface it before writing SCOPE.md.
**Exit:** Clear boundaries, risks identified with mitigations.

**Gate Loop:** Rate all 4 deliverables. If RISKS.md scores < 7 (too vague), expand mitigations and re-rate.
**Git checkpoint — commit Phase 1 docs before advancing:**
```
task(agent="git-expert", prompt="Commit all new docs/ files from Phase 1 (SCOPE.md, RISKS.md, CONSTRAINTS.md, USER_PERSONAS.md) to the sdlc/setup branch. Conventional commit: 'docs(phase-1): add planning artifacts — scope, risks, constraints, personas'. Push sdlc/setup to origin. Do NOT push to main.", timeout=60)
```
**Inter-Phase Check-In:** After the gate passes AND docs are committed, run the Inter-Phase Check-In Protocol. Do NOT auto-advance.
**Autonomy:** If `autonomy: auto` per `agents/shared/AUTONOMY_PROTOCOL.md`: continue to the next step and log to `docs/work/APPROVALS.md` instead of waiting.

## Phase 2: Requirements — HOW should it behave?

**Deliverables:**
- `docs/SRS.md` — Requirements specification (see SRS format below)
- `docs/USER_STORIES.md` — Stories with acceptance criteria

**Save state, then hand off to UX for user workflow design:**

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 1
Phase: 2 — Requirements
Last completed: Planning phase gate passed
Awaiting: ux-engineer — docs/design/USER_FLOWS.md
Next after resume: write SRS.md and USER_STORIES.md using the flow diagrams
")
```

```
---
  HANDOFF → ux-engineer
---
Write this block to `docs/work/HANDOFF_ux-engineer.md`, then tell the user: open `/ux` and have it read `docs/work/HANDOFF_ux-engineer.md` and follow it (it reads the doc — nothing is pasted):

SDLC-TASK for ux-engineer:

CONTEXT (read these before starting):
- docs/VISION.md — project purpose and target users
- docs/USER_PERSONAS.md — detailed user profiles and goals

YOUR TASK:
Produce user workflow diagrams for this system. For each primary task a user performs,
create a Mermaid flowchart showing: trigger → steps → success path → error/edge cases.
Cover every persona from USER_PERSONAS.md. Do not design visual style — flows only.

PRODUCE exactly this file:
- docs/design/USER_FLOWS.md — one Mermaid flowchart per primary user task

When the file is written, print exactly:
"ux done — [one sentence: how many flows produced and what they cover]"
Then stop. Do not ask for follow-up. Do not run additional phases.

---
```

After "ux done", run the **Requirements Derivation Pass** before writing any requirements docs.

### Requirements Derivation Pass (MANDATORY — run before writing SRS/USER_STORIES/USE_CASES)

The goal: systematically mine all Phase 0+1 artifacts so no requirements are missed. The agent that "thinks of" use cases only finds what it already knows. The derivation pass finds what the docs imply.

**Step 1 — Build the candidate matrix.** For EACH combination of:
- Every persona in USER_PERSONAS.md
- Every feature/goal in SCOPE.md (in-scope items only)
- Every risk in RISKS.md (as negative use case drivers)
- Every constraint in CONSTRAINTS.md (as use case boundaries)
- Every vision goal in VISION.md

→ Derive 1-3 candidate use cases. Write them to `docs/work/REQUIREMENTS_MATRIX.md`:

```markdown
# Requirements Matrix

## Derivation Sources
| Source Doc | Items Mined |
|------------|-------------|
| USER_PERSONAS.md | [list persona names] |
| SCOPE.md (in-scope) | [list scope items] |
| RISKS.md | [list risk IDs] |
| CONSTRAINTS.md | [list constraint IDs] |
| VISION.md | [list goals] |

## Candidate Use Cases
| ID | Persona | Trigger / Feature Area | Source | Status |
|----|---------|----------------------|--------|--------|
| M-001 | [persona] | [what they need to do] | SC-01, FR-02 | CANDIDATE |
| M-002 | [persona] | [what they need to do] | RISK-03 | CANDIDATE |
...

## Coverage Check
| Persona | # Use Cases | Gaps |
|---------|-------------|------|
| [name] | N | [any feature areas with 0 use cases] |

## Empty Cells (flag these to user)
These persona × feature area combinations have no candidate use cases:
- [persona]: [feature area] — possibly out of scope?
- ...
```

**Step 2 — Present to user.** Print this block and STOP:

```
REQUIREMENTS DERIVATION COMPLETE
docs/work/REQUIREMENTS_MATRIX.md written.

I derived [N] candidate use cases from your Phase 0+1 docs.

Empty cells (no use cases derived yet):
[list any persona × feature area combos with 0 candidates, or "none"]

Questions before I write the requirements docs:
1. Are there any use cases I'm missing from your experience with this domain?
2. Do any of the empty cells represent real requirements I should add?
3. Any of the [N] candidates should be removed or merged?

Please respond, then I'll write SRS.md, USER_STORIES.md, and USE_CASES.md.
```

**Wait for user response.** Incorporate additions into the matrix.
**Autonomy:** NEVER-AUTO (this is user input — no default exists; pauses even in `autonomy: auto` per `agents/shared/AUTONOMY_PROTOCOL.md`).

**Step 3 — Write requirements docs.** Now write SRS.md following the format below.

### SRS Format (IEEE 830 based)

Every requirement MUST be: concise, complete, unambiguous, verifiable, traceable.

```markdown
# Software Requirements Specification

## 1. Introduction
### 1.1 Purpose
### 1.2 Scope
### 1.3 Definitions & Acronyms

## 2. Product Overview
### 2.1 Product Perspective (context in larger ecosystem)
### 2.2 Product Features (high-level list)
### 2.3 User Classes
### 2.4 Operating Environment
### 2.5 Constraints
### 2.6 Assumptions

## 3. Functional Requirements
For each requirement:
| Field | Value |
|-------|-------|
| ID | FR-001 |
| Title | User can create an account |
| Description | The system shall allow... |
| Priority | Must-have / Should-have / Nice-to-have |
| Acceptance Criteria | Given..., When..., Then... |
| Dependencies | FR-003 (email service) |

## 4. Non-Functional Requirements
| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-001 | Performance | Page load time | < 2s at P95 |
| NFR-002 | Security | Password hashing | bcrypt, cost 12 |
| NFR-003 | Availability | Uptime | 99.9% monthly |

## 5. Interface Requirements
### 5.1 User Interfaces (wireframes/flows)
### 5.2 API Interfaces (endpoint contracts)
### 5.3 Data Interfaces (database, external feeds)

## 6. Traceability Matrix
| Requirement | Design | Code | Test |
|-------------|--------|------|------|
| FR-001 | ARCH-2.3 | src/auth/ | test/auth.test.ts |
```

**Exit:** Every FR has acceptance criteria, every NFR has a measurable metric

**After SRS.md + USER_STORIES.md, produce the use case catalog (INLINE — do this yourself):**

Write `docs/testing/USE_CASES.md` — derive one use case per user story:
- For each user story in USER_STORIES.md:
  - Which persona from USER_PERSONAS.md does this?
  - What are the preconditions?
  - What triggers the flow?
  - Main flow (numbered steps: user does X → system does Y)
  - Alternate flows (error, empty state, permission denied)
  - Success criteria (observable outcome)
- Index table at top: UC number, name, persona, priority (P0/P1/P2)
- P0 = demo-blocking critical paths, P1 = should work, P2 = nice-to-have

**Gate Loop:** Rate SRS.md, USER_STORIES.md, and USE_CASES.md. Key quality checks:
- Every FR has a `Given/When/Then` acceptance criterion (not just a description)
- Every NFR has a measurable metric (not "should be fast" — "< 200ms at P95")
- Every user story has a corresponding use case in USE_CASES.md
- Every use case has a `Source:` field tracing back to a FR-NN, SC-NN, RK-NN, or persona ID
- REQUIREMENTS_MATRIX.md has no unexplored blank cells (all resolved with user)
- If any FR/NFR is vague, revise before advancing

**Note:** TEST_DESIGN.md (detailed test case design per component/endpoint/threat) is produced in Phase 3.5 after architecture and security controls are complete. Phase 2 only produces requirements artifacts.

**Git checkpoint — commit Phase 2 docs before advancing:**
```
task(agent="git-expert", prompt="Commit all new docs/ files from Phase 2 (SRS.md, USER_STORIES.md, docs/design/USER_FLOWS.md, docs/testing/USE_CASES.md, docs/work/REQUIREMENTS_MATRIX.md) to the sdlc/setup branch. Conventional commit: 'docs(phase-2): add requirements — SRS, user stories, use cases, requirements matrix'. Push sdlc/setup to origin. Do NOT push to main.", timeout=60)
```
**Inter-Phase Check-In:** After the gate passes AND docs are committed, run the Inter-Phase Check-In Protocol. Do NOT auto-advance.
**Autonomy:** If `autonomy: auto` per `agents/shared/AUTONOMY_PROTOCOL.md`: continue to the next step and log to `docs/work/APPROVALS.md` instead of waiting.

**HUMAN APPROVAL GATE A:** After the inter-phase check-in, emit **Human Approval Gate A** (defined in `sdlc-lead.md` § Human approval gates). Wait for explicit "yes" before any Phase 3 work.
