# Field Report — Process & Design Improvements from a Live Mode-1 SDLC Run

**Filed:** 2026-07-08
**Source:** Live observation across a multi-week Mode-1 (new-project) SDLC orchestration engagement —
a regulated (audit/compliance-heavy) full-stack platform, Phase 4→5, with an external dev team joining
mid-flight and stress-testing the system's decisions and artifacts.
**Severity:** High — every finding is systemic (reproduces across projects using the SDLC orchestrator),
not project-specific.
**Status:** Open — proposals for `IMPROVEMENT_BACKLOG.md` intake.
**Desensitization note:** all client, product, personnel, ticket-ID, and vendor specifics have been
removed. Concrete instances are abstracted to their pattern (e.g. "requirement-stories," "the
component-library package," "the canvas library"). Nothing below identifies the engagement.

---

## Why this report exists

This engagement was unusually informative because an **external development team joined after the build
was largely underway** and did exactly what a good reviewer does: they challenged the tech-stack
decisions, read the actual code against the design docs, and found real gaps. Their scrutiny — plus the
lead-orchestrator's own audits — surfaced a cluster of **systemic weaknesses in how the expert system
tracks work, keeps documents honest, handles first-run/empty states, and defends its own decisions.**
Several were caught only because "verify-don't-trust" was applied; several were near-misses. This report
distills the generalizable lessons so the expert system itself improves.

The findings split into three buckets:
- **A. Process / orchestration gaps** (how work is tracked, gated, merged — including how the work-item
  hierarchy itself is modeled in the tracker)
- **B. Design / architecture blind spots** (classes of defect the agents don't proactively hunt)
- **C. Artifact-accuracy discipline** (keeping docs/trackers/published pages true over a long run)

Plus **D. What worked** — patterns to preserve and reinforce, so the improvements don't regress them.

### Coverage map — every concrete issue the joining developers raised → the finding it drives

This report is pattern-level, but it must account for each specific thing the external reviewers flagged.
The mapping (issues abstracted, no specifics):

| Developer-raised issue (this engagement) | Finding(s) |
|------------------------------------------|-----------|
| "Why this datastore? A document/NoSQL model fits — the core aggregate is self-contained, almost nothing shared" | **A-5** (decision made on thin rationale; audit requirement satisfiable either way; never weighed on record) |
| "The vendored components aren't the real library — missing variants/sizes, different template; this is reinventing the lib" | **B-2** (library-shaped reimplementation drifting into a silent fork) |
| "What supply-chain issue with this library? Why restyle some components?" | **A-5** (the doc's supply-chain rationale cited the *wrong* library; real reason was distribution-model + habit) + **B-2** |
| "Can't access the app or create the first project on an empty DB without disabling checks or manual SQL" | **B-1** (first-run/bootstrap deadlock — an un-hunted class) |
| "A user should be able to hold multiple roles" | **B-3** (enforcement collapsed multi-role to highest-role-wins) |
| "Don't lockfile/package-lock to an external repo" (stakeholder instinct) | **A-5** (a prior-employer habit promoted into a design rationale without being pressure-tested for fit) |
| Roles were deferred out of MVP off a passing comment, then found to be launch-critical | **A-2** (bulk scope-cut over-applied) |

Every developer concern traces to a finding; the two that had no dedicated home before this revision
(the **datastore choice** and the **supply-chain-rationale miss**) are why **A-5** was added.

---

## A. Process / orchestration gaps

### A-1. The "tracking-layer gap": module/task completion silently diverges from requirement completion
**Symptom.** During implementation, the orchestrator closed the *module/wave task* layer (the build
units) as each shipped, and the phase/status rollups read as "implementation complete." But the
*requirement-story* layer (the actual features traced to the SRS) had **never been transitioned** — a
large fraction of requirements were still genuinely unbuilt. The board and the status docs said ~100%
where reality was ~50%. This was only discovered when a fresh audit reconciled code↔stories.

**Root cause.** The orchestrator tracks two layers (build-wave tasks + requirement stories) but only
had a discipline for closing one of them. "Wave complete" was allowed to imply "requirements complete."

**Proposed improvement.**
- Add a **two-layer completion invariant** to the SDLC orchestrator: a phase may not be reported
  "complete" while requirement-stories tied to it remain open. The phase-gate validator should compare
  *requirement* closure, not *task* closure.
- Add a periodic **code↔requirement reconciliation** step (the audit that found this) as a first-class
  gate at Phase 4→5, not an ad-hoc rescue. A test-engineer or reviewer HANDOFF that greps the codebase
  against the requirement list and emits DONE/PARTIAL/OUTSTANDING per requirement.
- The status/rollup artifacts must derive their "% done" from the **requirement** layer with the label
  math shown, never from the task layer.

### A-2. Scope-deferral decisions get over-applied without a per-item re-check
**Symptom.** A stakeholder said, in effect, "defer X-related work to a later version." The orchestrator
then moved *everything transitively touching X* out of MVP — including items that were genuinely
MVP-critical and had only an incidental relationship to X. One deferred item was later found to be an
outright launch blocker.

**Root cause.** A broad verbal deferral was applied as a bulk label operation without a per-item "does
this specific thing actually belong out of scope?" check. The orchestrator optimized for executing the
instruction over pressure-testing it.

**Proposed improvement.**
- When a deferral/scope-cut instruction is broad ("defer all the X stuff"), the orchestrator should
  **enumerate the affected items and get per-item (or per-cluster) confirmation** before relabeling,
  explicitly flagging any that look load-bearing for MVP. This is the same "present the list, confirm
  the classification" discipline already used for discovery — extend it to scope cuts.
- Add to the orchestrator's decision-handling: **a bulk scope change is a HANDOFF-worthy analysis, not a
  one-line label sweep.**

### A-3. Git-hygiene slip: feature code rode to `main` inside a docs-only PR
**Symptom.** Uncommitted feature-branch changes present in the working tree were carried into a
*different* (docs) PR when the orchestrator branched for the docs while the feature work was still in
the tree. Net effect: reviewed code reached `main` **before its own review records formally landed** and
outside its own gate-merge PR. Outcome was verified sound (byte-identical to the reviewed branch, main
green), but the *process* was violated.

**Root cause.** Branching for a new unit of work without first confirming the working tree is clean
relative to the *previous* unit. The orchestrator's own branch-per-ticket rule wasn't self-enforced at
the moment of context-switching between tickets.

**Proposed improvement.**
- Add a **clean-tree precondition** to the orchestrator's "start a new work unit" step: before
  `git checkout -b`, assert `git status` is clean (or the only changes belong to the unit being
  started). A dirty tree from a *prior* unit must be committed/stashed to its own branch first.
- Add a **post-merge attribution check**: after any PR merges, if it touched files outside its declared
  scope (docs PR that changed `src/`), flag it. This is cheap (`git show --stat`) and catches the slip.
- Reinforce in the SDLC-lead spine: "one work unit = one branch = one PR" includes *not* letting a
  second unit's changes leak into the first's PR.

### A-4. The copy-paste HANDOFF tax is real and compounds over a long engagement
**Symptom.** (Corroborates the existing `issues/eliminate-copy-paste-handoff-theater.md`.) Over a
multi-week run with dozens of specialist HANDOFFs (code, security, perf, review, per ticket), the manual
copy-paste relay dominated wall-clock time. Most round-trips were mechanical (dispatch, score, merge);
only genuine decisions (scope, DB engine, risk acceptance) needed the human.

**Root cause.** Executor-C (manual paste) was pinned for this environment due to Task-tool timeouts.
Correct for reliability, but the system has no "batch the mechanical, surface only the decisions" mode.

**Proposed improvement.**
- Prioritize the already-filed handoff-theater work. Specifically: a **decision-only checkpoint mode**
  where the orchestrator runs the mechanical relay (dispatch→score→gate→merge) and pauses *only* at
  genuine human-judgment forks (flagged explicitly: scope, irreversible arch, risk acceptance, gate
  A/B). Everything else proceeds and is logged.

### A-5. Major architecture decisions were made on thin/unrecorded rationale and only pressure-tested when an external reviewer arrived
**Symptom.** Two of the most consequential technology choices were the ones the joining developers
challenged hardest — and in both cases the *recorded* rationale turned out to be thin, incidental, or
inaccurate:
- The **primary datastore** (a relational engine) was chosen substantially because a stakeholder's
  deployment/"golden-image" convenience already used it and because "the compliance/audit requirement
  needs it" — but on scrutiny the audit requirement was satisfiable by *either* a relational or a
  document engine, and the design doc presented the choice as settled without a trade-off record. The
  developers' counter-proposal (a document model, since the core aggregate is self-contained) was
  technically reasonable and had never been weighed on the record.
- A **UI approach** ("vendor the component library, restyle a few components") was justified in the
  docs with a **supply-chain rationale that did not actually apply** (the cited supply-chain incident
  was about a *different* library); the real reasons were the library's own distribution model plus a
  stakeholder's prior-employer habit ("don't lockfile to an external repo") — a legitimate instinct,
  but not the reason the doc claimed, and not pressure-tested for whether it fit this stack.

**Root cause.** The system captured *what* was decided but not a disciplined *why* — no lightweight
Architecture Decision Record (ADR) with the alternatives considered and the actual deciding factors.
Rationale that was really "a stakeholder already does it this way" or "muscle memory from a prior job"
got promoted into design docs as settled engineering rationale, and sometimes an *incorrect* rationale
(the supply-chain framing) was asserted with confidence. Nothing forced the trade-off to be written
down or the claim to be verified, so the decisions went unexamined until an outside reviewer arrived and
did the pressure-testing the process should have.

**Proposed improvement.**
- For any **load-bearing / hard-to-reverse** technology choice (datastore, auth model, core framework,
  vendoring strategy), require a short **ADR** in Phase 3: the alternatives considered, the actual
  deciding factors, and — critically — an explicit note when a factor is *"stakeholder/deployment
  preference"* or *"prior-art habit"* rather than an engineering constraint. Labeling a soft reason as
  soft is the whole point; it flags what a future reviewer should re-examine.
- **Verify asserted rationales before they enter a design doc.** A claim like "we do X for supply-chain
  reasons" or "the compliance requirement forces engine Y" must be checked against the actual
  advisory/requirement (this is a researcher/security-auditor HANDOFF), not asserted from association.
  The system already has a Challenger/veracity capability for high-stakes claims — **route
  architecture-decision rationales through it**, not just findings.
- When a decision is **stakeholder-driven for deployment convenience** (e.g. a shared golden build
  image), record it as such and flag that it may not be the best *engineering* fit — so it can be
  revisited deliberately (with the right people in the room) rather than discovered as a surprise. The
  orchestrator correctly *parked* the datastore question for such a session once challenged; the lesson
  is to reach that "let's decide this properly, on the record" point **before** build, not after.

### A-6. Work-item modeling in the tracker was never designed — the hierarchy, linkage, and labels drifted, and had to be reverse-engineered and reconciled mid-flight *(in-depth)*

This is the deepest process finding of the engagement. The SDLC orchestrator generated a large backlog
in the issue tracker (one epic, phase-level items, ~200 requirement-stories, plus build/wave tasks) but
**never established a deliberate model for how those layers relate**. The structure that emerged
"worked" for day-to-day claiming but was quietly incoherent for reporting, scope math, and traceability
— and a mid-flight audit had to reverse-engineer it, reconcile it, link it, and clean it. Five distinct
sub-problems, all one root cause:

**A-6.1 — Phases were modeled as tracking-*stories* under a single umbrella epic, with no parent/child
link to their work.** There were no per-phase epics. The phase items (Phase 0…N) and every
requirement-story were **siblings** — all epic-linked to the one project epic — with **nothing
connecting a phase to the stories that belong to it.** The tracker's own field for a
parent/child relationship (the epic-link) was single-valued and already spent on the umbrella epic, so
"which stories are Phase 4?" was answerable only by label convention, never by structure.

**A-6.2 — No structural phase→story linkage meant no native rollups.** "What % of Phase 4 is done?"
could not be answered by the tracker natively; it required either eyeballing labels or an external
query. The fix built this session was to add an explicit **parent/child link type** (non-destructively,
leaving the single-epic model intact) from each phase item to its ~150 requirement-stories, which
finally made "list/`% done` for this phase" a first-class query from any board/dashboard. That this had
to be *retrofitted* — 150+ links created by a script mid-project — is the finding.

**A-6.3 — The completion layers diverged (the reconciliation).** Because there was no structural tie
between the build-task layer and the requirement-story layer, closing tasks left requirements untouched
and the status rolled up as "done" while half the requirements were open (this is the consequence
documented in **A-1**; A-6 is its structural cause). A code↔requirement audit had to be run to rebuild
truth.

**A-6.4 — Labels were load-bearing but unenforced, so scope math silently undercounted.** Because scope
("is this MVP?", "which area?") lived entirely in labels rather than structure, any story created
*without* the right labels became **invisible to every scope query.** A batch of follow-up stories
minted late shipped unlabeled; several were genuinely in-scope, so the "MVP remaining" count was wrong
until an audit caught and relabeled them. When labels are the only source of truth for scope, a missing
label is a silent data-integrity bug, not a cosmetic one.

**A-6.5 — Template/scaffolding strays polluted counts.** Sample tickets from tracker setup ("Example
Epic / Example Story / Sub-task," plus a "TEMP" and a "VOID" item) sat in the project skewing totals and
— worse — presenting a *second* epic that muddied the "one project epic" model. They had to be tagged
out of scope math (and a deliberate decision recorded to *keep* them as proof the board was scaffolded
correctly, rather than delete them).

**Root cause (shared).** The orchestrator treats the issue tracker as a place to *emit* work items, not
as a **data model to design**. It never decided, up front: what is an epic vs a story vs a task here;
how does a phase relate to its stories (structure vs label vs nothing); what is the single source of
truth for scope and completion; and what invariants keep that true over hundreds of items and many
sessions. So the hierarchy, the linkage, and the label discipline each drifted, and the drift only
surfaced when an external reviewer and a fresh audit went looking.

**Proposed improvement (this is a first-class design step, not a cleanup chore).**
- Add a **"Tracker Data Model" design step** to the SDLC orchestrator, run once when the backlog is
  generated (Phase 2→3 boundary). It must decide and record, as a short spec:
  - **The layer map:** what maps to epic / story / task / sub-task in *this* tracker, and why. (If phases
    aren't epics, say so and pick the linkage mechanism deliberately.)
  - **Phase→work linkage:** structural (parent/child link or epic-per-phase) is strongly preferred over
    label-only, precisely so rollups are native and completion can't silently diverge (A-6.1/6.2/6.3).
    If the tracker's native parent field is already spent (single-valued epic link), choose the explicit
    link type up front — don't retrofit 150 links later.
  - **Single source of truth for scope + completion:** name it. If it's labels, the generator must apply
    them on *every* item and a validator must fail on any unlabeled work item (closes A-6.4).
  - **Strays:** the backlog generator should not leave sample/template items in the project; if kept
    intentionally, tag them out of all scope math from the start (closes A-6.5).
- Add a **tracker-integrity validator** (runnable any session, and at each phase gate): every work item
  has the required scope labels; every requirement-story is linked to its phase; no orphan/stray items
  in scope math; the epic/story/task layering matches the recorded model. This is the check that would
  have caught 6.3/6.4/6.5 the day they happened instead of an audit weeks later.
- Make the **phase→story link idempotent and continuous:** a small step that links each newly-minted
  story to its phase on creation (and a re-runnable sweep to catch stragglers) — so the structure stays
  true as the backlog grows, rather than being a one-time retrofit.
- **Reconciliation is a gate, not a rescue** (ties to A-1): a scheduled code↔requirement +
  structure-integrity reconciliation at Phase 4→5, owned by a specialist HANDOFF.

**Why this matters beyond this project.** Every Mode-1 engagement generates a tracker backlog. If the
system doesn't *design* the work-item model, it will drift the same way every time — incoherent rollups,
label-invisible scope, diverging completion layers, and a mid-project archaeology exercise to rebuild
trust. Designing it once, up front, and validating it continuously converts all of that from "found it
because someone audited" into "the tracker was never allowed to lie."

---

## B. Design / architecture blind spots (classes of defect to hunt proactively)

### B-1. First-run / empty-state / bootstrap deadlocks are a recurring, un-hunted class
**Symptom.** The system built an RBAC model where every action (including creating the first project)
required a role that could only be granted by someone who already had one — a chicken-and-egg that made
the app **unusable on a fresh database** without manual DB surgery or disabling the auth check. It shipped
undetected through design + build + review; a joining developer hit it immediately on first deploy. A
proactive sweep then found a *second* related empty-state gap (a role-gated field unsettable when no user
held that role) and confirmed several others were clean.

**Root cause.** Designers and reviewers reason about the *steady state* (data exists, roles assigned).
Nobody's job was to reason about **t=0: empty DB, no users, no roles, first run.** There's no agent
checklist for it.

**Proposed improvement (high value).**
- Add a **"Bootstrap & Empty-State" checklist** to the architecture-designer and security-auditor
  references. Mandatory questions: How does the *first* privileged user come to exist? Can the app be
  used on an empty DB with zero seed? What's gated on state that only that gate can create? What does a
  zero-role / zero-project / zero-data user *see* (graceful vs dead-end)? Is there a seed, and does it
  cover the bootstrap identity?
- Make it a **Phase-3 design gate item** and a **Phase-5 pre-launch check** ("fresh-deploy dry run: can
  a brand-new environment reach a usable state with no manual SQL?").
- Add the pattern to the security-auditor's threat catalog as a standard elevation/availability check:
  *bootstrap-authority* and *self-referential permission gates*.

### B-2. AI-generated "based-on-a-library" components drift from the upstream and quietly become a fork
**Symptom.** The design specified using a well-known copy-in component library "as source." What was
actually built were components *informed by* the library's structure but hand-/AI-written — renamed
variants, dropped variants/sizes, an older template, missing affordances. A reviewing developer
correctly identified this as "reinventing the component lib" rather than using it. The divergence was
invisible because the docs *claimed* it was the standard library.

**Root cause.** When an agent is told "use library X (copy-paste style)," it may generate
library-X-flavored code from memory instead of pulling the actual upstream artifacts, then the design
doc's claim ("we use X") masks the drift. No step verifies "is this actually X, or X-shaped?"

**Proposed improvement.**
- coding-agent / frontend-design rule: when a library is "vendored/copied" rather than a runtime dep,
  **generate it from the library's real tool/CLI/registry**, not from memory — and record the source
  version. If generated from memory, say so and flag the divergence explicitly.
- Add a reviewer check: for any "we use library X" claim, **spot-diff a sample against upstream**;
  flag drift as a finding (fork risk / maintenance debt), distinct from bugs.
- Tie to the anti-slop rules: "library-shaped reimplementation presented as the library" is a named
  anti-pattern (adjacent to phantom/hallucinated-dependency checks).

> Related: the *rationale* half of this issue — the design doc justifying the vendoring choice with a
> supply-chain reason that didn't actually apply — is covered in **A-5** (unexamined/incorrect decision
> rationale). B-2 is about the code drifting from upstream; A-5 is about the stated *why* being wrong.

### B-3. "Highest-role-wins" quietly breaks genuine multi-role RBAC
**Symptom.** The data model allowed a user to hold multiple roles, but enforcement collapsed to a single
highest-precedence role. A user holding two roles could not exercise the permissions of the lower-
precedence one — silently wrong for real multi-role authorization.

**Root cause.** RBAC was modeled as "the user's role" (singular) at the enforcement seam even though the
schema supported a set. The data/enforcement mismatch was never reconciled.

**Proposed improvement.**
- security-auditor / architecture-designer RBAC checklist: **reconcile the data model's role cardinality
  with the enforcement function's cardinality.** If the schema allows N roles per principal, enforcement
  must be **union-of-grants** ("allowed if any held role grants it"), not "highest role wins."
- Add "role cardinality mismatch" to the security threat checklist.

---

## C. Artifact-accuracy discipline (keeping docs honest over a long run)

### C-1. Status/rollup artifacts drift toward optimism ("all phases done") and mislead stakeholders
**Symptom.** A published status page showed all phases green / "ready for QA" while MVP was ~half built
(see A-1). A landing page's status table was stale in the *other* direction (understated progress from
months prior). Both misrepresented reality to stakeholders.

**Root cause.** Status artifacts were written once and not re-derived from live data; "phase built"
(platform/scaffolding) was conflated with "phase done" (features complete).

**Proposed improvement.**
- Status/dashboard artifacts must **lead with the requirement-completion metric** (derived live from the
  work tracker), and visually distinguish **"platform/foundation built" from "features complete."**
- Any phase-progress visual must not paint a phase "done/green" while its requirement-stories are open.
- Add a **doc-freshness check** to the steward/publish flow: a status artifact older than the last work
  event, or whose numbers don't match a live query, is flagged stale.

### C-2. Published-artifact rendering silently breaks (diagrams, tables) and needs a verification gate
**Symptom.** On the published documentation mirror, one diagram silently failed to render (a syntax
edge-case in a node label) and fell back to raw text; separately, a large table rendered as "half table,
half raw text" because a blank line split one table into an orphan fragment with no header row. Both
shipped unnoticed until a human glanced at the page.

**Root cause.** The publish pipeline had no post-publish render-health verification. "It committed" was
treated as "it rendered."

**Proposed improvement.**
- Add a **render-health check** to the publish/steward flow: after publishing, verify each diagram
  produced an image (not a raw code block) and each source table rendered as a real table (no orphaned
  pipe-text). This was built ad-hoc during the engagement and is trivially generalizable.
- Add a **markdown table linter** (orphan-fragment detector: a data row preceded by a blank line with no
  header/separator) and a **diagram-syntax linter** (unsafe characters in node labels — e.g. backticks,
  the exact bug hit here) to the doc-hygiene validators.

### C-3. Long-lived trackers accumulate malformed structure from append-only edits
**Symptom.** The main tracker's log tables became corrupted over many sessions of appending — blank
lines splitting tables, rows filed under the wrong table (delegation rows under a tickets table).

**Root cause.** Append-only editing across many sessions with no structural validation of the file.

**Proposed improvement.**
- Trackers with append-only sections should be validated on write (the orphan-table linter from C-2).
- Prefer **structured logs** (a canonical row format enforced) over free-form markdown tables for
  high-churn append targets, or a small helper that appends a validated row rather than raw text.

---

## D. What worked — reinforce, don't regress

These patterns caught real defects and should be **strengthened**, and the improvements above must not
undermine them:

- **D-1. Verify-don't-trust caught real bugs, repeatedly.** Independently re-running a returning
  specialist's tests and reading findings against source (not trusting the manifest) caught: an
  imprecise "no route exists" claim, a vendored-library default-value trap (a rounding arg silently
  defaulting to a nonzero value), and confirmed several security invariants were genuine controls rather
  than happy-paths. **This is the single highest-value discipline in the system.** Keep it mandatory;
  consider making "re-ran the tests myself: <counts>" a required field in every gate score.
- **D-2. The specialist reviewers earned their keep.** The performance reviewer caught a debounce/
  event-stream defect that the coding agent and code reviewer both missed; the security reviewer
  independently re-ran the suite + a SAST scan and verified each invariant. Multi-lens review on
  security-/perf-sensitive changes is worth the HANDOFF cost.
- **D-3. Honest deferral + tracking.** Findings that weren't in-scope were consistently filed as tracked
  tickets with evidence rather than silently dropped or silently fixed. Preserve the "file it, don't
  freelance it" norm — especially the discipline of **not editing frozen compliance artifacts without
  explicit direction** (the agents correctly refused to freelance a control-catalog entry; a human
  approved it before it was added).
- **D-4. Grounding claims in source over paraphrase.** When a HANDOFF's shorthand ("no PATCH route")
  was imprecise, the reconciliation used the actual code, not the paraphrase. Keep "cite file:line, not
  recollection" as law.
- **D-5. Distinguishing "the platform is built" from "the product is done"** — once surfaced, this
  framing made every downstream status artifact honest. Bake it into the vocabulary.

---

## Suggested `IMPROVEMENT_BACKLOG.md` intake

> **Actioned 2026-07-08:** these have been promoted into `IMPROVEMENT_BACKLOG.md` as **Group H
> (H1–H9)** with files-to-touch, acceptance criteria, and sequencing, and distilled into
> `docs/work/LESSONS.md` as do-this-next-time rules for `/steward` to fold into the canonical agents.
> The table below is the original intake; the backlog Group H is the authoritative, detailed version.
> Mapping: A-1→**H1**, A-2→**H2**, A-3→**H3**, A-5→**H4**, A-6→**H5**, B-1→**H6**, B-2→(H5/B-2 note),
> B-3→(RBAC cardinality, tracked under B-3), C-1→**H7**, C-2/C-3→**H8**, D-1→**H9**.

| ID | Group | Title | Priority | Why |
|----|-------|-------|----------|-----|
| (new) | Process | Two-layer completion invariant + code↔requirement reconciliation gate | High | Prevents "wave done" masking "requirements unbuilt" (A-1) |
| (new) | Process | Bulk scope-cut = enumerate + per-item confirm, not a label sweep | High | Prevents deferring launch-blockers (A-2) |
| (new) | Process | Clean-tree precondition on new work unit + post-merge scope-attribution check | Med | Prevents code riding in on a docs PR (A-3) |
| (new) | Process | ADR for load-bearing tech choices + verify asserted rationale (route through Challenger) + flag stakeholder/habit reasons as soft | High | Datastore + vendoring chosen on thin/incorrect rationale, unexamined until an outside reviewer arrived (A-5) |
| (new) | Process | **Tracker Data Model design step (Phase 2→3) + tracker-integrity validator + continuous phase→story linking** | **High** | Work-item hierarchy/linkage/labels drifted; had to reverse-engineer, link 150+ stories, reconcile completion, relabel invisible scope, and de-stray counts mid-flight (A-6) |
| (new) | Design | Bootstrap & Empty-State checklist (arch-designer + security-auditor + Phase-3/5 gates) | High | First-run deadlocks ship undetected (B-1) |
| (new) | Design | "Library-shaped reimplementation presented as the library" anti-pattern + upstream spot-diff | Med | Silent forks / maintenance debt (B-2) |
| (new) | Design | RBAC role-cardinality reconciliation (union-of-grants when schema allows N roles) | Med | Multi-role silently broken (B-3) |
| (new) | Artifact | Status artifacts derive % live + "built vs done" distinction + freshness check | High | Stakeholder-facing misinformation (C-1) |
| (new) | Artifact | Publish render-health gate + markdown-table + diagram-syntax linters | Med | Silent render breakage (C-2, C-3) |
| (reinforce) | Quality | Make "re-ran tests myself: <counts>" a required gate-score field | High | Codifies the highest-value discipline (D-1) |

---

## One-line takeaway

The system's **verification instincts are excellent** (D-1..D-5) — nearly every serious defect this
engagement surfaced was caught by verify-don't-trust or a specialist review. The gaps are almost all in
**breadth of what gets proactively checked** (empty-state/bootstrap, requirement-vs-task completion,
library-drift, doc-freshness, render-health) and in **self-enforcing the process the system already
prescribes** (clean-tree branching, per-item scope confirmation). Closing those turns "caught it because
someone looked" into "caught it because the system always looks."
