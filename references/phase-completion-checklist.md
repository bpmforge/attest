# Phase Completion Checklists

What "done" means per SDLC phase: the validator gate (automated — run
`scripts/validators/validate-phase-gate.sh <phase>`) plus the human-judgment
checks no script can make. Advance only when BOTH columns are satisfied.
The gate proves the documents are complete; the judgment items prove they
are TRUE.

## Phase 0 — Ideation

Automated: none (no gate).
Judgment:
- [ ] VISION.md answers "why would anyone switch to this?" in one paragraph
- [ ] The non-goal list exists and contains something real you decided NOT to build
- [ ] Competitive analysis names actual products, not categories
- [ ] You can state who user #1 is, specifically

## Phase 1 — Planning

Automated: `validate-phase-gate.sh phase-1` (SCOPE, RISKS, CONSTRAINTS, PERSONAS present + sections).
Judgment:
- [ ] Every scope item traces to the vision; everything else is explicitly out
- [ ] Top 3 risks have a mitigation OR an explicit "accepted" decision — not silence
- [ ] Constraints are testable statements ("must run on a 32GB host"), not vibes ("should be fast")
- [ ] Personas are decision tools: each one settles at least one open design question

## Phase 2 — Requirements

Automated: `validate-phase-gate.sh phase-2` (SRS + user stories + requirements matrix).
Judgment:
- [ ] Every SRS "shall" is verifiable — you can name the test that would prove it
- [ ] Acceptance criteria written as outcomes, not implementation ("user sees X", not "API returns X")
- [ ] NFRs have numbers (P95 latency, uptime %, max dataset size) — every one
- [ ] You read the stories aloud as a user journey and no step is missing
- [ ] Someone asked "what happens on failure?" for each P0 story — the answer is in the criteria

## Phase 3 — Design

Automated: `validate-phase-gate.sh phase-3` (module design, circular deps, transitive
boundaries, infrastructure, observability, architecture, API/ERD/sequence coverage,
Mermaid, tech stack, ADRs, security controls).
Judgment:
- [ ] Modules came from business domains, not technical layers ("billing", not "controllers")
- [ ] You can describe adding the NEXT likely feature using only the feature recipe — no new module needed
- [ ] Every external dependency has a plugin point or adapter — name the swap story for each
- [ ] The DB schema survives the question "what do we wish we'd indexed?" asked 12 months from now
- [ ] Every HIGH/CRITICAL threat has a control that names a file/mechanism, not an intention
- [ ] Challenger pass ran and FATAL/MAJOR findings are resolved, not argued with
- [ ] Human Approval Gate A: the user actually read ARCHITECTURE.md (ask them something from it)

## Phase 3.5 — Test Design

Automated: `validate-phase-gate.sh phase-3.5` (TEST_DESIGN coverage matrix).
Judgment:
- [ ] The coverage matrix has no empty rows you silently accepted
- [ ] E2E scenarios cover the error paths, not just happy paths
- [ ] Performance benchmarks restate the Phase 2 NFR numbers exactly (no drift)
- [ ] Human Approval Gate B confirmed before any implementation HANDOFF

## Phase 4 — Implementation

Automated: `validate-phase-gate.sh phase-4` per wave (scope, manifests, module
boundaries, dead code, design system if UI) + project test suite green.
Judgment:
- [ ] Each wave's Completion Manifests were read, not skimmed — "Known issues" items triaged
- [ ] New code reads like the existing code (pattern consistency, not just lint-clean)
- [ ] The riskiest module got a human review, not only the automated one
- [ ] Test count went UP with each wave and nobody weakened an assertion to pass
- [ ] You ran the app and used the feature like a user at least once

## Phase 5 — Release

Automated: `validate-phase-gate.sh phase-5` + release-manager checklist
(quality gates, evals if present, version-site grep, doc-count audit, both remotes).
Judgment:
- [ ] CHANGELOG tells the truth a stranger could act on
- [ ] Rollback procedure stated BEFORE the deploy ran
- [ ] Someone can answer "how do we know it's healthy in prod?" with a dashboard/command, not a feeling
- [ ] Deferred debt got written into the backlog, not into folklore

## Using this list

Run the gate first — it's cheap. Walk the judgment items second, honestly;
they exist precisely because validators can't catch a document that is
complete and wrong. If a judgment item fails, fix the artifact and re-run the
gate — do not advance "provisionally." Provisional advancement is how Phase 4
inherits Phase 2's ambiguity at 10x the repair cost.
