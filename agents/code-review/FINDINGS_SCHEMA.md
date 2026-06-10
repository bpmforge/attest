---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# FINDINGS_SCHEMA.md — Code Review Cluster

**Shared finding schema for all code-review specialists.**

Every specialist writes findings in this format. The code-health-synthesizer
compounds findings by `module` — when 3+ specialists hit the same module, the
finding set escalates to a compound risk. The module key is the chaining
mechanism (the code-review equivalent of security's preconditions/yields).

---

## JSON Schema

```json
{
  "id": "string",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW",
  "dimension": "complexity | duplication | error-handling | type-safety | pattern-consistency | anti-slop | dead-code",
  "title": "string",
  "file": "string (path:line — always specific, never a directory)",
  "module": "string (logical module key — see Module Key below)",
  "tool": "string (lizard | radon | jscpd | tsc | manual | etc)",
  "evidence": "string (file:line citation, metric value, or tool output snippet)",
  "confidence": "HIGH | MEDIUM | LOW",
  "fix": "string (one-line concrete remediation)",
  "effort": "S | M | L"
}
```

## Field Definitions

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Stable identifier: `<DIM>-<NNN>` e.g. `CPLX-003`, `DUP-012`, `ERR-007`, `TYPE-002`, `PAT-005`, `SLOP-014`, `DEAD-009` |
| `severity` | Yes | Per calibration table below |
| `dimension` | Yes | Which specialist found it — used by synthesizer to count distinct dimensions per module |
| `title` | Yes | One line: problem + location + consequence ("listUsers is CC 27 — untestable branch explosion") |
| `file` | Yes | `src/services/user.service.ts:88` — exact line of the worst instance |
| `module` | Yes | Module key for compounding — see below |
| `tool` | Yes | What measured it. `manual` if found by reading, not tooling |
| `evidence` | Yes | The metric or snippet that proves it: "CC=27 (lizard)", "94-line duplicate of payment.service.ts:40-134 (jscpd)" |
| `confidence` | Yes | HIGH = tool-measured or directly observed; MEDIUM = inferred from pattern; LOW = suspected, needs human check |
| `fix` | Yes | Concrete one-liner: "Extract validation branches into a rules table" |
| `effort` | Yes | S (<1h), M (half day), L (multi-day / needs design) |

## Module Key (chaining mechanism)

`module` = the second-level source path: `src/services`, `src/api/routes`,
`app/components`. Rules:

- Strip the filename: `src/services/user.service.ts` → `src/services`
- Monorepo packages keep the package: `packages/auth/src/jwt.ts` → `packages/auth`
- Use the SAME key the other specialists will derive — never invent logical names

The synthesizer groups by exact `module` string match. A wrong key silently
excludes the finding from compound-risk detection.

## Severity Calibration

| Severity | Criteria |
|----------|---------|
| **CRITICAL** | Will cause production incidents: swallowed errors on money/auth paths, type coercion on external input, duplicated divergent business rules |
| **HIGH** | Blocks safe modification: CC > 20, >50-line duplicates, empty catch on I/O, `any` on public API surface |
| **MEDIUM** | Slows the team: CC 10–20, repeated 10–50-line blocks, inconsistent patterns across sibling files |
| **LOW** | Hygiene: naming, stale comments, minor nesting, style drift |

## Compounding Rules (synthesizer contract)

- 3+ distinct `dimension` values on one `module` → **compound risk**; the module entry's severity = max(individual) + 1 level (HIGH set → CRITICAL)
- Same `file:line` flagged by 2+ specialists → merge into one finding, keep both dimension tags, keep the higher severity
- A CRITICAL on a module that any other specialist also flagged → always lead the report with it

## Markdown Report Format (per specialist)

```markdown
# <Dimension> Findings — <project> — <date>
**Specialist:** <agent-name> | **Status:** complete | **Findings:** N total (N CRITICAL / N HIGH / N MEDIUM / N LOW)

## Summary Table

| ID | Sev | Title | File | Module | Confidence |
|----|-----|-------|------|--------|------------|
| CPLX-001 | HIGH | processOrder CC=24, nesting depth 6 | src/services/order.service.ts:112 | src/services | HIGH |

## CPLX-001 — HIGH — processOrder CC=24, nesting depth 6

**File:** `src/services/order.service.ts:112`
**Module:** `src/services`
**Tool:** lizard
**Evidence:** CC=24, NLOC=143, nesting=6 (lizard output)
**Confidence:** HIGH
**Fix:** Extract the 4 payment-type branches into strategy functions; early-return the validation guards.
**Effort:** M
```
