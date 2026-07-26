# Real-world model evaluation — plan

**Question the micro-benchmarks could not answer:** can either model be handed a
real client brief and driven through the actual bpm expert pipeline to working,
reviewed software — and where does it break?

Micro-benchmarks measured capability in 60-second slices. This measures
**process**: whether a model holds a spec across phases, produces artifacts that
pass real gates, writes code that satisfies requirements it saw once, and can
review someone else's work.

## The project

Thornbury Community Tool Library (`BRIEF.md`) — a lending service with 10
precise business rules, a fixed integration contract (`CONTRACT.md`), and a
**hidden acceptance suite** (`.hidden/acceptance.test.mjs`, 25 tests) written
from the brief before either model ran.

Chosen because:

- **Not recallable.** An invented charity with arbitrary rules (£0.50/day capped
  at replacement value, 30-day renewal suspension). No model has seen it.
- **Objectively gradeable.** Every rule maps to assertions. "Did it build the
  right thing" is a number, not an opinion.
- **Exercises the dimensions we care about**: money arithmetic (integer pence —
  where 2-bit quantization should hurt if anywhere), authorization (the
  trustees' hard requirement — a security-review target), date arithmetic, and
  state transitions.
- **Contains a real design flaw.** Rules 5 and 6 interact badly: a reservation
  expires after 3 days, but cannot be collected while the tool is on loan — so
  the reservation check in rule 5 is nearly dead logic. A good requirements
  phase surfaces this. Neither the brief nor the contract points at it.

**Hidden tests are the core of the design.** A model that writes its own tests
proves only that it tested what it built. The hidden suite measures conformance
to a spec the model saw once, in prose, several phases earlier.

## Protocol — identical for both models

Each model gets a clean workcopy containing only `BRIEF.md` + `CONTRACT.md`.

`OPENCODE_AUTONOMY=auto` so gated pauses take documented defaults instead of
waiting for a human. **Fresh session per phase** — this is the documented local
usage (`LOCAL_LLM_GUIDE.md`: "one task per session; local models degrade after
long conversations"), so running it any other way would test something we do not
ship.

| Step | Command | Captures |
|---|---|---|
| P2 Requirements | `/sdlc` → SRS + USER_STORIES | does it surface the R5/R6 flaw? |
| P3 Design | `/sdlc` → ARCHITECTURE, DATABASE, THREAT_MODEL | does authz appear in the threat model? |
| P4 Implement | `/code` against the contract | the artifact |
| Test | `/test-expert` | its own tests (graded separately from hidden ones) |
| Review | `/review-code` + `/security` | self-review quality |
| **Cross-review** | each model reviews **the other's** implementation | reviewing ≠ building |

Cross-review is included deliberately: `MODEL_ADAPTER.md` requires maker ≠
verifier ("a model asked whether its own code is correct consistently
over-reports success"). It also separates two skills the benchmarks conflated.

## Measurements

**A. Product correctness (objective)**
- hidden acceptance tests passed / 25
- does it import and run at all
- per-rule breakdown — which rules survive, which don't

**B. Process fidelity (objective, via `scripts/validators/validate-phase-gate.sh`)**
- gate pass/fail and gap count per phase
- gate **receipts** verified — content-hashed, so a fabricated pass is detectable
- required artifacts present vs claimed present (hallucinated-artifact rate)
- traceability: FR-NNN in SRS referenced in code/tests

**C. Cost**
- wall-clock per phase and total
- tool calls / MCP calls / failed calls per phase
- degradation curve: does phase 4 quality fall off relative to phase 2?

**D. Review quality (cross-review)**
- real defects found (ground truth = hidden-test failures on that code)
- false-positive rate — invented problems
- did it catch the authz flaw if present

## Grading rules

1. **Hidden tests are never shown to a model**, including during review.
2. **Objective first.** Rubric scoring only for what tests cannot capture
   (did it surface the R5/R6 flaw, is the code maintainable by "a volunteer next
   year").
3. **Harness faults are not model scores** — the standing lesson from
   `docs/BENCH_LOCAL_MODEL_COMPARISON.md`. Any run that dies without producing
   output is investigated before it is scored.
4. **Interpretation risk is reported, not hidden.** Two hidden tests encode a
   defensible-but-debatable reading (R5a renewal extends from *due date* not
   today; R10 suspension applies to *existing* loans). If both models fail these
   identically, that is reported as a spec ambiguity, not a model failure.
5. **N≥2 on the implementation phase.** The single hardest lesson of the
   benchmark: N=1 produced confident false conclusions twice.
