# Unattended Phase 4 — the conductor

_How `scripts/conductor/conductor.mjs` works a `plan.json` board without a human in the loop._

Source of truth: `scripts/conductor/conductor.mjs`, `scripts/conductor/supervise.sh`, `scripts/conductor/resume.mjs`, `scripts/lib/review-triggers.mjs`. The operator guide is [../UNATTENDED_EXECUTION.md](../UNATTENDED_EXECUTION.md).

Planning stays interactive. The board comes from Phases 0–3 and `task-decomposer`; the conductor only executes it.

## Startup gates, then the ticket loop

```mermaid
flowchart TD
    SV["supervise.sh: relaunch loop, max 30"] --> P["Prereqs + plan.json load - exit 1"]
    P --> G6["G6: manifest outside docs/work or docs/reviews - exit 2"]
    G6 --> G5["G5: board is gitignored - exit 2"]
    G5 --> CL["Working tree not clean - exit 1"]
    CL --> SY["Sync main from remotes - exit 5; config topology changed - exit 6"]
    SY --> LI["Board lint + write-scope collisions - exit 2"]
    LI --> G4["G4: coder model equals reviewer model - exit 2"]
    G4 --> G4b["G4b: a configured model does not resolve - exit 2"]
    G4b --> G7["G7: baseline verify fails on main - exit 4"]
    G7 --> RS["resume.mjs: board vs receipts vs disk drift - exit 3"]
    RS --> LOOP{"STOP file or nothing claimable?"}
    LOOP -->|no| CLM["Claim ticket, worktree off main"]
    CLM --> R1["Round 1 code: coder model, then scope + manifest gates"]
    R1 --> R2["Round 2 review: reviewer model, triggered reviewers, fix loop up to 3"]
    R2 --> R3["Round 3 runtime verify, one bounded repair"]
    R3 --> CLS{"Ticket verify passes?"}
    CLS -->|yes| MG["Accept + merge --no-ff, next ticket"]
    MG --> LOOP
    CLS -->|"no, attempts exhausted"| REL["Release to ready, evidence in docs/work/.conductor-evidence"]
    REL --> LOOP
    LOOP -->|yes| END["conductor.end, CONDUCTOR_HALT.md"]
```

Every gate before the loop fires before the first model call.

## Which reviewers run

`scripts/lib/review-triggers.mjs` reads the ticket's diff:

| Reviewer | Added when the diff touches |
|----------|-----------------------------|
| code-reviewer | always |
| security-auditor | auth, tokens, secrets, `exec` or `spawn` |
| performance-engineer | SQL, ORM calls, loops |
| ux-engineer | `.tsx`, `.vue` or `.css` files, or `components/`, `pages/` or `views/` paths |

A ticket's own `reviews` list adds reviewers on top of these triggers. The review always runs on a **different model** from the coder: G4 refuses to start otherwise.

## Supervisor and resume

- **`supervise.sh`** stops for good on exits 2–6, because those are deterministic refusals that a retry won't fix. It restarts on any other non-zero exit, waiting 30 seconds between tries, up to 30 times. It never deletes worktrees, so `resume.mjs` can reconcile them.
- **`resume.mjs`** runs at every startup. It checks `plan.json` against the ticket receipts and against git. A mismatch refuses the run with exit 3. A safe orphan (work that finished but was never recorded) is re-verified rather than re-run.
- **`--no-merge`** pushes the branch for PR review and leaves the ticket In Progress.
- **A merge conflict** aborts the merge. The ticket stays `in_review` and its branch is kept.
