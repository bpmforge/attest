---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# FINDINGS_SCHEMA.md — Performance Cluster

**Shared finding schema for all performance specialists.**

Every specialist writes findings in this format. The perf-synthesizer compounds
findings by `hot_path` — multiple findings on the same hot path multiply, they
don't add (an N+1 inside an O(n²) loop is n³, not two separate problems). The
hot_path key is the chaining mechanism (the performance equivalent of
security's preconditions/yields).

---

## JSON Schema

```json
{
  "id": "string",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW",
  "dimension": "static | db-query | concurrency | profiler | bundle",
  "title": "string",
  "file": "string (path:line — always specific)",
  "hot_path": "string (entry point this code executes under — see Hot Path Key below)",
  "impact": "string (dimension + magnitude: 'latency +800ms p95' | 'memory 2GB spike' | 'bundle +340KB')",
  "scale_factor": "string (what makes it worse: 'linear in users' | 'quadratic in order items' | 'per request')",
  "tool": "string (manual | profiler | EXPLAIN | bundle-analyzer | etc)",
  "evidence": "string (measurement, EXPLAIN output, profile sample, or code citation)",
  "measured": "true | false",
  "fix": "string (one-line concrete remediation)"
}
```

## Field Definitions

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Stable identifier: `<DIM>-<NNN>` e.g. `STAT-003`, `DBQ-012`, `CONC-007`, `PROF-002`, `BNDL-005` |
| `severity` | Yes | Per calibration table below — severity follows *user-felt impact on a hot path*, not code ugliness |
| `dimension` | Yes | Which specialist found it |
| `title` | Yes | One line: pattern + location + cost ("N+1 user lookups in order list — 1+N queries per page") |
| `file` | Yes | `src/api/orders.ts:47` |
| `hot_path` | Yes | Hot path key for compounding — see below |
| `impact` | Yes | The dimension hit + best estimate of magnitude. Mark estimates `~`: "latency ~+500ms" |
| `scale_factor` | Yes | What the cost scales with — this is what turns MEDIUM today into CRITICAL at 10x users |
| `tool` | Yes | `manual` for static reading; name the tool for measured findings |
| `evidence` | Yes | EXPLAIN plan, profile sample %, benchmark delta, or the code itself with file:line |
| `measured` | Yes | `true` only if a real measurement backs `impact`; `false` for static estimates. Synthesizer leads with measured findings |
| `fix` | Yes | Concrete one-liner: "Batch with `WHERE id IN (...)` — one query, then map" |

## Hot Path Key (chaining mechanism)

`hot_path` = the route, command, or job under which this code executes:

- HTTP: `GET /api/orders`, `POST /api/search`
- Jobs/queues: `job:nightly-report`, `consumer:order-events`
- CLI/batch: `cli:import`, `startup`
- Unknown/shared (utils called everywhere): `shared:<module>` — synthesizer treats shared findings as multipliers on EVERY hot path that imports them

Use the route string exactly as the router declares it. The synthesizer groups
by exact `hot_path` match; a finding with the wrong key escapes compounding.

## Severity Calibration

| Severity | Criteria |
|----------|---------|
| **CRITICAL** | User-facing hot path measurably degraded now: p95 > 2s, OOM risk, runaway query, event-loop block > 100ms |
| **HIGH** | Hot-path cost that scales badly (N+1, O(n²) on unbounded input, unbounded Promise.all, missing index on growing table) |
| **MEDIUM** | Real cost off the hot path, or hot-path cost bounded by small n; bundle bloat 100–500KB |
| **LOW** | Micro-inefficiency, allocation churn, best-practice gaps with no current path to user impact |

## Compounding Rules (synthesizer contract)

- 2+ findings on one `hot_path` → **compound slowdown**: costs multiply along the call chain; report the chain as one entry with combined impact, severity = max(individual) + 1 level
- `shared:` findings join every hot path whose chain imports that module
- `measured: true` findings rank above estimates at equal severity; never let an estimate displace a measurement in the top-5 fix list
- Fix list ordering = (severity, measured-first, smallest-effort-first within a tier)

## Markdown Report Format (per specialist)

```markdown
# <Dimension> Perf Findings — <project> — <date>
**Specialist:** <agent-name> | **Status:** complete | **Findings:** N total (N CRITICAL / N HIGH / N MEDIUM / N LOW) | **Measured:** N of N

## Summary Table

| ID | Sev | Title | File | Hot Path | Impact | Measured |
|----|-----|-------|------|----------|--------|----------|
| DBQ-001 | HIGH | N+1 user lookups in order list | src/api/orders.ts:47 | GET /api/orders | latency ~+40ms × items | false |

## DBQ-001 — HIGH — N+1 user lookups in order list

**File:** `src/api/orders.ts:47`
**Hot path:** `GET /api/orders`
**Impact:** latency ~+40ms per order item (1+N queries per page)
**Scale factor:** linear in page size × order count
**Tool:** manual
**Evidence:** `src/api/orders.ts:47` — `for (const o of orders) { o.user = await db.user.findUnique(...) }`
**Measured:** false
**Fix:** Batch with `db.user.findMany({ where: { id: { in: userIds } } })`, then map by id.
```
