---
name: product-shape-protocol
description: Canonical orchestration role names (GOAL / ORCHESTRATOR / BOTS / REVIEW PANEL / HONESTY LOOPS) + the two-stack rule, the feature-map planning artifact (tickets grouped by the stories they serve, seams as directed connections, gaps reported in both directions), and feature-grouped landing (one merge per feature, parks are durable, blocked holds the whole feature). Load with PARALLEL_WAVE_PROTOCOL.md for any board-driven Phase 4, and at decomposition time when emitting modules[].
metadata:
  type: protocol
---

# Product Shape Protocol

Ported from the Dokima P6 architecture wave (roles table + two-stack rule,
feature-grouped landing, product map) and its Challenger verdict. Three
doctrines, one theme: **a flat ticket list is not a plan, and a stream of
per-ticket merges is not a product landing.** The plan must state the
product's shape before work starts, and the landing must respect that shape
when work finishes.

---

## 1. Canonical roles — name the moving parts the same way everywhere

Orchestrated builds accumulate names across waves of work ("the runner",
"the loop", "the reviewers"). This table is the canonical mapping — when a
design conversation, a plan, or a generated project says "the orchestrator"
or "the bots", it means these, and nothing else:

| Role              | What it is here                                                                                                                                             | Exit / authority                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GOAL**          | The outermost loop that decides whether the PRODUCT is done (`/goal`, the product/outer loop)                                                               | The only exit is a predicate over evidence: every SRS-derived requirement closed by an existing proving test (`requirement-ledger.json`), every seam's assembly proven, verify green on main. **A drained board proves nothing** — "no tickets left" is not the exit condition. |
| **ORCHESTRATOR**  | The dispatcher that claims, scopes, gates, and lands one ticket at a time (the conductor, or sdlc-lead running HANDOFFs)                                     | Owns the attempt ladder and the parking lot. Decides _sequence_, never _doneness_ — doneness belongs to GOAL's predicate and the deterministic gates.                                                              |
| **BOTS**          | The workers that do the work (coding-agent sessions, berth/executor sessions)                                                                                | Untrusted by construction: every durable state change goes through validated verbs/receipts (`verify-receipt.mjs`), never through a bot's own claim of success.                                                    |
| **REVIEW PANEL**  | Concurrent multi-reviewer integration review (`/wave` Level-2 gate, GAUNTLET_LOOP.md reviewer sets)                                                          | **Advisory:** a reviewer can hold a landing only through a deterministic check it demands (resolvable citations, a validator), never by prose (`GATE_SCORING_PROTOCOL.md`, "Who holds the gate").                  |
| **HONESTY LOOPS** | **Wiggum** (coverage: the requirement ledger IS the inventory, re-derived from the SRS every iteration — `RALPH_WIGGUM_LOOP.md`) + **Challenger** (veracity: adversarial re-check, maker ≠ verifier — `CHALLENGER_PROTOCOL.md`) | Neither authors work; both exist to make "done" falsifiable.                                                                                                                                                       |

Generated projects and plans MUST use these five role names. A plan that
invents a sixth role, or lets one component hold two of these authorities
(e.g. an orchestrator that also decides doneness), is flagged at review.

**The two-stack rule.** When a project runs two execution stacks — a
bootstrap harness (the scaffolding the repo uses to build itself) and the
product's own engine — they are not peers: **new pipeline capability lands
in the product first, or the ticket that adds it to the bootstrap names the
follow-up ticket that ports it.** A capability that exists only in the
scaffolding is a capability the product's users never get (dogfood
symmetry). The GOAL loop honors this by being engine-agnostic: it drives
either stack through the same injected port, so the bootstrap can retire
without the goal layer noticing.

---

## 2. The feature map — the plan artifact that gives tickets a shape

Decomposition that stops at tickets-with-lanes-and-dependencies has emitted
work but no statement of how the product hangs together. After user stories
and tickets exist, the plan MUST also include a **feature map**
(`docs/work/PRODUCT_MAP.md` rendered from the plan), built by these rules —
deterministic, no model judgment anywhere:

1. **A ticket's cited stories** are the `US-`/`FR-` ids appearing in its
   title or acceptance text — extracted with the SAME id extractor the
   requirement ledger uses (one regex, one truth), restricted to the
   SRS-derived denominator.
2. **Tickets sharing any cited story are the same feature** (union-find
   over story citations). A feature records its stories, tickets, and seams.
3. **A seam whose producer and consumer tickets land in different features
   creates a directed `connects_to` edge with a stated reason** — it does
   NOT merge them: a connection is not an identity.
4. **Gaps are reported in BOTH directions:** every ticket citing no story
   (work serving nothing), and every story no feature picked up (a
   requirement with no work). Neither list may be empty by omission.
5. **Storyless tickets land in an explicit `F-unmapped` feature that the
   rendered map SHOUTS about** ("WARNING: TICKETS SERVING NO STORY —
   either the ticket is unnecessary, or the story it serves is missing from
   the SRS. Resolve before building."). Unmapped work is reported, never
   silently dropped — and never quietly absorbed into a neighboring feature.

The feature map is what makes feature-grouped landing (§3) possible: the
landing unit is the feature the map declared, not a grouping invented at
merge time.

---

## 3. Feature-grouped landing — one merge per feature, never one PR per ticket

The measured failure this fixes: an SDLC that merges per ticket produces "a
bunch of PRs" — dozens of first-parent commits, none of which is a
reviewable product increment. In feature-grouped landing:

- **A done ticket PARKS its branch instead of merging.** Parked-done is a
  durable board status, not a merge.
- **A feature lands as EXACTLY ONE merge**, when EVERY one of its tickets
  is parked-done: compose the feature's parked branches onto one synthetic
  branch → run the full verify gate + seam checks on the synthetic head →
  ONE `--no-ff` merge of the synthetic branch onto main. A member that
  moved after the feature's wave gate passed refuses the landing; a
  conflicting member fails the whole feature — **no conflict is ever
  hand-resolved on the synthetic branch**.
- **A blocked member holds the whole feature.** `blocked` is NOT `done` and
  MUST NOT be counted as closed when computing feature completeness — a
  feature with a blocked member landing without that member's work is
  exactly the half-feature this protocol forswears. The feature WAITS until
  a human unblocks or re-scopes the member.
- **A feature never lands in pieces.** Half a feature on main is the
  "kinda-working surprise" the GOAL loop exists to prevent.

### Lessons from the adversarial (Challenger) pass — do not relearn these

The first implementation of this doctrine survived a fresh-agent Challenger
review with two CRITICALs. The fixes are part of the protocol:

- **Park state is durable, at the root board, committed.** A park recorded
  only in a worktree or a session's memory means `done` never reaches the
  board the orchestrator reads — no feature could EVER land (a silent
  deadlock, not an error). Write `parked` as a durable status at the root
  board and commit it; a restart must see parked tickets as NOT claimable,
  or it will re-claim and rebuild already-reviewed work.
- **A park is not a landing.** Progress reporting must distinguish
  processed / parked / landed — announcing a park as "landed" hides that
  nothing reached main.
- **Blocked is not closed** (restated because it was the finding most
  likely to ship: the completeness check quietly treated `blocked` as
  terminal).
- **Test through the real state-writer.** A test that fabricates board rows
  in the shape the test author expects can pass forever while the
  production writer never emits that shape — the deadlock above was
  invisible to exactly such tests. At least one test must drive the real
  park/claim/land path end to end.
- **Intra-feature `depends_on` chains deadlock under per-feature parking**
  (the dependency's code is not on main when the dependent claims). Either
  stack the dependent's branch on the dependency's parked branch, or keep
  landing per-ticket until branch-stacking exists — do not turn the mode on
  and discover this in production.

**Default honestly.** If the tooling in use cannot yet satisfy the
durability + stacking requirements above, the landing mode stays
per-ticket, with the gap named — a doctrine adopted in prose but violated
in mechanics is worse than the per-ticket status quo.
