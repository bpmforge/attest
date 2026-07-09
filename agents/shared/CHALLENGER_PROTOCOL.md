---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# CHALLENGER_PROTOCOL.md

**Canonical veracity-challenge rules for ALL agents.**

The Challenger is the second quality layer after Ralph Wiggum. Ralph checks **coverage** (did we produce an artifact for every row?). The Challenger checks **veracity** (is what we wrote in each artifact actually true?).

---

## The one hard rule

> **Every challenge must cite `file:line`, a URL, or validator output. No challenge may rest on speculation, training-data recall, or "I believe X is wrong." If you cannot produce evidence, the verdict is UNVERIFIABLE — not CONTRADICTED.**

A challenge without a citation is deleted before the report is written.

---

## When Challenger runs

Challenger runs **after** Ralph Wiggum confirms coverage. Do not challenge a half-finished report.

**Mandatory trigger points:**

| Artifact | Triggered by | Trigger condition |
|----------|-------------|-------------------|
| Any finding severity HIGH or CRITICAL | security-auditor, code-reviewer, perf-engineer | Before FIX_BACKLOG is finalized |
| `OWASP_TRACKER.md` + `final-report.md` | security-auditor | After full OWASP scan completes |
| `RESEARCH_*.md` | researcher | After Deep Dive or Fact Check mode completes |
| `MODULE_DESIGN.md` + `INFRASTRUCTURE.md` | architecture-designer | After design phase HANDOFF completes |
| `TECH_STACK.md` | sdlc-lead | Before Gate A (Phase 2 → 3) |
| `THREAT_MODEL.md` + `SECURITY_CONTROLS.md` | security-auditor | After Phase 3 security HANDOFF completes |
| ADR / design doc with `**External rationale (needs verification):**` | architecture-designer, sdlc-lead | Before Phase 3 gate — enforced by `validate-challenger-gate.sh` (T29.5) |
| Gate A checklist items | sdlc-lead | Before presenting Gate A to user |
| Gate B checklist items | sdlc-lead | Before presenting Gate B to user |
| `PERFORMANCE_*.md` with HIGH/CRITICAL regressions | performance-engineer | Before fix backlog is finalized |

**NOT a trigger point:** style observations, medium/low findings, formatting issues, opinion differences. Challenge is reserved for factual claims that affect decisions.

---

## Claim extraction

From the artifact, extract the **major factual claims** — assertions that:
1. Could be verified or refuted by reading source code, documentation, or external evidence
2. Affect a decision (e.g., a finding severity, an architectural recommendation, a security verdict)

**Skip:**
- Subjective quality assessments ("this code is hard to read")
- Process observations ("this file is 800 lines long")
- Claims explicitly marked as opinions ("recommend considering X")

For each claim, record:
```
CLAIM-NN: <verbatim or close paraphrase of the claim>
Source:   <artifact file:line where this claim appears>
```

---

## Evidence gathering (per claim)

For each claim, search for evidence **that could refute it**. You are playing devil's advocate — your job is to find the hole, not validate the claim.

**Tool priority:**

| Step | Tool | What to look for |
|------|------|-----------------|
| 1 | `grep` / `read` | Does the source file actually contain what the claim says it contains? |
| 2 | `code_search` (if available) | Related code in other modules that contradicts the claim |
| 3 | `bash` (validators) | Run the relevant validator script — does it agree with the claim? |
| 4 | `web_research` | For library/framework claims — does current documentation agree? |

**Hard cap: 4 tool calls per claim.** If you have not found refuting evidence in 4 calls, the verdict is UNVERIFIABLE — keep searching only if the claim concerns a CRITICAL finding.

### Research Artifact Challenge Procedure

When the artifact being challenged is a `RESEARCH_*.md` file (not a code file), apply this additional verification step for every cited claim:

**For each CLAIM that includes a citation URL:**

1. Call `web_fetch(citation_url)` to confirm the URL resolves and the page is accessible
2. Check: does the retrieved content actually contain the asserted information?
   - If YES and the content supports the claim: mark `CONFIRMED`
   - If the URL returns 404, redirects to an unrelated page, or the content contradicts the claim: mark `CONTRADICTED` — this is a false citation
   - If the URL returns a paywall, login page, or < 300 chars: mark `UNVERIFIABLE` — note "URL returns access-restricted content, cannot verify"

3. For claims without a citation URL: mark `UNSOURCED` — flag for the researcher to add a source

**Rule:** A research report claim is only `CONFIRMED` when the cited URL resolves and the content at that URL supports it. Plausible-sounding citations that 404 or contradict the claim are failures, not neutral.

---

## Verdicts

Each claim receives exactly one verdict:

| Verdict | Meaning | Required evidence |
|---------|---------|------------------|
| `CONFIRMED` | Evidence **supports** the claim | Citation to file:line, URL, or validator exit 0 |
| `CONTRADICTED` | Evidence **refutes** the claim | Citation to file:line, URL, or validator exit 1 with specific gap |
| `UNVERIFIABLE` | Could not find evidence either way in 4 calls | Note what was searched |

**CONTRADICTED without a citation is not allowed.** If you believe something is wrong but cannot cite evidence, write UNVERIFIABLE with a note: "searched X, Y, Z — no conclusive evidence found."

---

## Report format

Output file: `docs/reviews/CHALLENGE_REPORT_<slug>_<date>.md`

```markdown
# Challenge Report — <artifact name>
**Date:** <YYYY-MM-DD> | **Artifact:** <path> | **Challenger:** challenger agent

> **Artifact field is load-bearing (T22.20):** `scripts/validators/validate-challenger-gate.sh`
> parses this field to correlate a challenge report back to the specific
> source report it challenges. Always set `<path>` to the actual
> ROOT-relative path of the artifact being challenged (e.g.
> `docs/security/final-report.md`), as plain text — no markdown link
> syntax (`[text](path)`), no surrounding brackets. A bare filename with
> no directory (e.g. just `final-report.md`) is accepted ONLY when that
> filename is unique across all of this run's source reports; if two
> source reports share a filename in different directories, a bare
> declaration is ambiguous and satisfies neither, so declare the full
> path in that case. A report missing this field, or declaring the wrong
> path, does not satisfy the gate for its intended source — even if the
> report itself is otherwise clean (`CONTRADICTED: 0`).

## Summary
- Claims reviewed: N
- CONFIRMED: N
- CONTRADICTED: N  
- UNVERIFIABLE: N
- Action required: YES / NO

## Findings

### CLAIM-01 — [CONFIRMED / CONTRADICTED / UNVERIFIABLE]
**Claim:** <verbatim claim>
**Source:** <artifact:line>
**Evidence:** <file:line or URL or validator output>
**Verdict:** CONFIRMED — the claim is supported by <evidence>.

### CLAIM-02 — [CONTRADICTED]
**Claim:** <verbatim claim>
**Source:** <artifact:line>
**Evidence:** `src/auth/middleware.ts:47` — token validation is absent; only expiry is checked.
**Verdict:** CONTRADICTED — the claim states "all tokens are validated" but line 47 shows only expiry check, no signature verification.
**Recommended action:** Revise finding severity to CRITICAL; update FIX_BACKLOG.

### CLAIM-03 — [UNVERIFIABLE]
**Claim:** <verbatim claim>
**Source:** <artifact:line>
**Searched:** grep for "bcrypt" in src/ (0 results), web_research for bcrypt Node.js (no contradicting docs found)
**Verdict:** UNVERIFIABLE — could not find evidence to confirm or refute within tool budget.
```

---

## What happens to CONTRADICTED findings

The agent that produced the original artifact **must** receive a revision HANDOFF for every CONTRADICTED claim. The sdlc-lead (or orchestrator) is responsible for issuing that HANDOFF.

- If a finding severity was wrong → revise the FIX_BACKLOG row
- If a design recommendation was wrong → revise the design doc and re-gate
- If a research claim was wrong → add a correction to the RESEARCH file with citation

A challenge report is not the end — it is a ticket back to the original agent.

---

## Relationship to Ralph Wiggum

```
Ralph Wiggum:  "Did we produce an artifact for every row?"  →  COVERAGE check
Challenger:    "Is each artifact factually accurate?"        →  VERACITY check

Order:  Ralph Wiggum runs first → gaps filled → Challenger runs on completed artifacts.
```

Never run Challenger on a partial or draft report. Ralph Wiggum must first confirm all rows are covered.

---

## Invoking challenger

From an orchestrator or another agent, emit a HANDOFF:

```
HANDOFF to: challenger
Artifact:   docs/security/final-report.md
Context:    Security audit of <project> — contains 3 HIGH and 1 CRITICAL finding.
Trigger:    HIGH/CRITICAL findings present — Challenger Gate mandatory.
Produce:    docs/reviews/CHALLENGE_REPORT_security_<date>.md
Complete:   "challenge done — <slug>"
```

From sdlc-lead at Gate A/B: challenger runs on the gate checklist items before the human approval block is presented.

### External rationale in an ADR (T29.5)

`references/adr-template.md` tags an asserted outside mandate (compliance,
supply-chain, legal, vendor) with the literal marker
`**External rationale (needs verification):**`. `validate-challenger-gate.sh`
treats any ADR or design doc carrying that marker as a source requiring a
challenge report, exactly like a HIGH/CRITICAL finding — same correlation
mechanism (T22.20 per-source `**Artifact:**` matching), not a second gate.

```
HANDOFF to: challenger
Artifact:   docs/adrs/ADR-<NNN>-<slug>.md
Context:    ADR asserts an external rationale ("<quote the marker's claim>")
            that has not been independently verified.
Trigger:    "**External rationale (needs verification):**" marker present —
            Challenger Gate mandatory (validate-challenger-gate.sh, T29.5).
Produce:    docs/reviews/CHALLENGE_REPORT_<slug>_<date>.md
Complete:   "challenge done — <slug>"
```

If the claim needs real research first (e.g. "does this framework actually
require X"), dispatch `researcher` in FACT CHECK mode before challenger — but
the loop only closes when a challenge report declares
`**Artifact:** docs/adrs/ADR-<NNN>-<slug>.md` (the ADR itself). A challenge
report whose Artifact field names only the researcher's `RESEARCH_*.md`
output does not correlate to the ADR and leaves it gapped.
