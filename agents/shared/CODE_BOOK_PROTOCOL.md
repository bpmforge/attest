---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# CODE_BOOK_PROTOCOL.md — book-style code sizing

**The doc book protocol applied to code.** A documentation deliverable over 300 lines becomes a book (`BOOK_PROTOCOL.md`). Likewise, **a source file over the cap becomes a directory** — an index/barrel + chapter modules, one concern each. Enforced by `~/.config/opencode/scripts/validators/validate-file-size.sh`.

**Why (and why it matters most for weak models):** a file a model can't hold in context is a file it edits blind — it re-reads fragments, loses the through-line, and drifts. Frontier models have the context budget to absorb a 1,000-line file; small/local models do not. Capping file size is therefore not a style preference — it is the difference between a non-frontier model converging and drifting.

---

## The rule

| Threshold | Action |
|-----------|--------|
| ≤ cap (default 400 lines) | fine — single file |
| > warn (300) | plan a split now; don't let it reach the cap |
| > cap (400) | **hard fail** — decompose into a directory |

Cap/warn configurable via `FILE_SIZE_CAP` / `FILE_SIZE_WARN`. Max nesting depth 2 (a chapter that itself exceeds the cap becomes its own sub-directory once).

The 400-line cap is the **single** code book-chapter cap (matching the doc book protocol's 400 chapter cap). It **consolidates and supersedes** the old hardcoded 250-line `validate-code-health.sh` H-02 check — there is now one size gate, not two conflicting thresholds. `validate-file-size.sh` is the source of truth, wired into the phase-4 gate.

**Excluded** (legitimately long, not subject to the cap): generated/vendored/build output and anything in `GENERATED_FILES.txt`, lockfiles, `.d.ts`, minified, tests/specs/fixtures, `*/migrations/*`. Hand-maintained exceptions go in a project-root **`.filesizeignore`** (one relative path per line) with a justification comment.

---

## Monoliths accrete — the cap is on the FILE, not on your diff

The dominant failure mode is not one agent writing 2,000 lines. `task-decomposer.md` bounds each node's output at ~300 lines, so that essentially cannot happen. What happens instead: ticket 1 writes 180 lines, ticket 2 appends 150, ticket 7 appends 200 — and every single ticket was individually compliant, individually small, individually reviewed clean. Nobody wrote a monolith. One grew.

So the rule any agent about to touch a file applies is:

> **`wc -l` the target first. The cap applies to `current + your delta`, not to your delta.**

| Projected size after your edit | What you do |
|---|---|
| ≤ 300 | append normally |
| 300–400 | append, and name the concern seam for the next ticket |
| > 400 | **do not append.** Your code goes in a new chapter module beside it; the index/barrel re-exports it |

Adding a chapter instead of appending is **not scope creep and not a refactor** — it is where the code you were assigned belongs. What *would* be out of scope is restructuring the existing file's contents to make room; don't. Leave it and add beside it.

Enforced per-HANDOFF (not just at end-of-phase-4) by `validate-file-size.sh` in the runtime gate of `run-handoff-gates.sh` — so the ticket that pushes a file over the cap is the one that fails, while the split is still a one-file operation.

---

## PLAN-SHAPE — decompose UP FRONT, never refactor a monolith later

The coding micro-loop runs **PLAN-SHAPE before PRODUCE** (`MICRO_LOOP.md`): if the unit you're about to write — **or the file you're about to append to, at its projected size** — would exceed the cap, design the directory first. A monolith refactored after the fact is more error-prone — small models especially botch the extraction — so the split is a *design* step, not cleanup.

Decompose by **concern**, not by line count:
- one chapter per cohesive responsibility (a type cluster, a sub-feature, a pipeline stage);
- the **index/barrel** holds only the public surface (re-exports + the small orchestration that wires chapters);
- chapters do not import each other in cycles — depend via the index or a shared `types` chapter;
- a chapter name says what it does (`auth/session.ts`, `auth/tokens.ts`, `auth/index.ts`), never `auth/part1.ts`.

### Barrel/index per language

| Language | Index file | Pattern |
|----------|------------|---------|
| TS/JS | `index.ts` | `export * from './session.js'` (+ the public composition) |
| Python | `__init__.py` | `from .session import Session` |
| Go | the package itself | one package, multiple `*.go` files (a "chapter" = a file) |
| Rust | `mod.rs` / `lib.rs` | `pub mod session;` |

---

## Recipe (example)

`src/orchestrator.ts` reaches 612 lines. Split:

```
src/orchestrator/
  index.ts        # public API + wiring (barrel)  — ~60 lines
  intake.ts       # parse + validate the request  — ~180
  routing.ts      # decide the handler            — ~140
  dispatch.ts     # invoke + collect results      — ~150
  types.ts        # shared interfaces             — ~40
```

Callers keep importing `./orchestrator` (the directory's index resolves) — no call-site churn. Each chapter is independently holdable in a small context window and independently testable.

---

## Interaction with the rest of the loop

- **CRITERION** (`MICRO_LOOP.md` step 0) includes "every file ≤ cap" — so an oversized file fails the micro-loop's own gate, not just the phase gate.
- **anti-slop** still applies per chapter (R-07 "no single-use helpers" etc.) — splitting by concern, not by arbitrarily extracting one-call helpers, avoids trading a size violation for a slop violation.
- Wired into the phase-4 gate via `validate-file-size.sh`.
