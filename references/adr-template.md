# ADR (Architecture Decision Record) Template

Blank template for a hard-to-reverse choice — datastore, auth model, core
framework, vendoring strategy, or any other decision that is expensive to
undo later (the ticket's examples, not an exhaustive list). Copy this file
to `docs/adrs/ADR-NNN-<slug>.md` and fill in every section. See
`exemplars/adr.md` for a filled-in instance (copy its structure, not its
fictional content).

**Why this exists:** a future maintainer reading a design doc needs to tell
the difference between "this was a real analysis with tradeoffs" and "this
was a coin-flip, or worse, an unverified claim about an outside mandate."
The Deciding Factors section below forces that distinction explicitly.

---

```markdown
# ADR-NNN: <short title of the decision>

**Status:** Proposed | Accepted | Deprecated | Superseded — <YYYY-MM-DD>
**Deciders:** <agent(s) or people involved>
**Supersedes:** <ADR-NNN or "none">

## Context
<The forces at play — constraints, requirements, scale, team size. State the
problem, not the solution. Cite SRS/CONSTRAINTS/SCOPE requirement IDs where
they apply.>

## Decision
<The one-sentence decision, stated plainly.>

## Alternatives considered
- **<Alternative A>:** rejected — <the concrete reason it lost>
- **<Alternative B>:** rejected — <the concrete reason it lost>

## Deciding factors
<Every bullet in this section MUST be tagged with exactly one of the three
labels below. This is the load-bearing section — "we picked X" is not a
deciding factor, "we picked X because Y, and Y is true because Z" is.>

- **Internal — rigorous:** <a factor grounded in something checkable —
  a benchmark, a measured constraint, a requirement ID, a documented
  team-size/skill limitation. Cite the evidence (file:line, doc ID,
  measured number).>
- **Internal — soft:** <a factor that is a legitimate but non-rigorous
  reason — stakeholder preference, prior-employer habit, gut feel, "the
  team already knows this tool." Not wrong to have; just must be labeled
  honestly instead of dressed up as an objective analysis.>
- **External rationale (needs verification):** <a claim about an outside
  requirement — compliance (SOC2, HIPAA, PCI-DSS), supply-chain policy,
  legal mandate, vendor contract, licensing constraint — that this decision
  is asserted to satisfy. This label is a FLAG, not a conclusion: it means
  the claim has not yet been independently checked, and the ADR is not
  final until it is. See "Verifying an external rationale" below.>

## Consequences
- (+) <a positive consequence, ideally with a number>
- (−) <a negative consequence, and the condition that would trigger
  revisiting this ADR>
```

---

## Tagging rules

1. **One tag per bullet, no blends.** A factor is either checkable
   (rigorous), an honest preference (soft), or an unverified outside claim
   (external rationale). Don't write a rigorous-sounding sentence around a
   claim that's actually just "I assume compliance requires this."
2. **Soft is not a defect.** "Stakeholder deployment convenience" or "the
   team already runs Postgres everywhere" are fine reasons to include —
   labeling them `Internal — soft` is what makes them honest. What this
   template rejects is a soft reason *dressed up* as rigorous, or an
   external claim *asserted* as settled fact with no tag at all.
3. **Every asserted external mandate gets the marker, verbatim.** Use the
   literal string `**External rationale (needs verification):**` — this
   exact text is what `scripts/validators/validate-challenger-gate.sh`
   scans for. A paraphrase ("this is required externally") will not be
   detected.

## Verifying an external rationale (MANDATORY before the ADR is final)

An `External rationale (needs verification)` bullet is not something the
ADR's author gets to self-certify — that's exactly the failure mode this
template exists to close (a wrong compliance/supply-chain claim silently
locking in an architecture). It must be routed through this program's
existing veracity-check mechanism, per `agents/shared/CHALLENGER_PROTOCOL.md`
— **do not invent a second verification path**. Two ways to get there, both
of which must converge on the same artifact:

1. **Direct challenge.** Dispatch the challenger agent on the ADR itself
   (`HANDOFF to: challenger`, `Artifact: docs/adrs/ADR-NNN-<slug>.md`). The
   challenger extracts the external-rationale bullet as a CLAIM, verifies it
   against a primary source (the actual compliance framework text, the
   actual vendor contract, the actual supply-chain policy doc), and writes
   `docs/reviews/CHALLENGE_REPORT_<slug>_<date>.md` declaring
   `**Artifact:** docs/adrs/ADR-NNN-<slug>.md`.
2. **Researcher FACT CHECK first, then challenge on the ADR.** For claims
   that need real research (e.g. "does SOC2 Type II actually require this"),
   dispatch `researcher` in FACT CHECK mode first. Its own `RESEARCH_*.md`
   output still goes through its own mandatory Challenger Gate — but that
   only verifies the research report, not the ADR. The loop is not closed
   until a challenge report is ALSO produced (or amended) declaring
   `**Artifact:** docs/adrs/ADR-NNN-<slug>.md` — citing the researcher's
   findings as its evidence. **A `RESEARCH_*.md` file or a challenge report
   that only declares the RESEARCH file as its Artifact does NOT satisfy the
   ADR's marker** — the gate correlates per-artifact (T22.20), so the
   challenge report must name the ADR, not just the research report that fed
   it.

Either path ends the same way: a `docs/reviews/CHALLENGE_REPORT_*.md` with
`CONTRADICTED: 0` that declares `**Artifact:**` as this ADR's path (full
path, or a bare filename if unique — see `CHALLENGER_PROTOCOL.md`). Until
that exists, `validate-challenger-gate.sh` reports the ADR as an unresolved
gap (`unverified-external-rationale`), and Phase 3 does not gate clean.

If the challenge CONTRADICTS the claim (the outside mandate turns out not to
apply, or applies differently), revise the ADR's Decision and Alternatives
sections before re-submitting — don't just delete the marker.
