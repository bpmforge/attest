# Observability Checklist

Reference used by the `analytics-architect` agent in every invocation. Read this file at the start of every run — methodology definitions, metric-design checklist, taxonomy rules, dashboard patterns, alert rules, and anti-patterns.

**Not in scope here:** deploying collectors/dashboards (→ `sre-engineer`), ingest pricing (→ `cost-engineer`), performance fixes (→ `performance-engineer`).

---

## Methodologies — pick one per service, by traffic shape

| Methodology | Signals | Applies to |
|---|---|---|
| **RED** | Rate, Errors, Duration (per endpoint/operation) | Request-driven services — APIs, RPC handlers, queue consumers |
| **USE** | Utilization, Saturation, Errors (per resource) | Resources/infrastructure — hosts, disks, pools, queues, GPUs |
| **Four golden signals** | Latency, Traffic, Errors, Saturation | User-facing systems end-to-end — RED + saturation; the SRE-book default |

Rules of thumb: a service that answers requests gets RED; a thing with finite capacity gets USE; the user-visible whole gets golden signals. Most systems need RED on services AND USE on the resources underneath — that is two methodologies applied deliberately, not ad-hoc metric soup.

---

## Metric-design checklist (every metric, no exceptions)

- [ ] **Owner-question** — "what decision does this number drive?" stated next to the metric; no answer → cut it
- [ ] **Type** — counter / gauge / histogram chosen correctly (latency is ALWAYS a histogram, never a gauge of averages)
- [ ] **Unit in the name** — `_seconds`, `_bytes`, `_total`; no naked numbers
- [ ] **Label set enumerated** — every label listed with its expected value count; series estimate = product of counts
- [ ] **No unbounded labels** — user-id, session-id, request-id, raw URL, error-message strings: all forbidden as labels (they belong in logs/traces)
- [ ] **SLO linkage** — feeds an SLO, a capacity decision, or a debugging question; stated which
- [ ] **Percentiles, not averages** — p50/p95/p99 for anything latency-shaped; an average hides the user who left

---

## Event-taxonomy rules (product analytics)

1. **Naming:** `object_action`, past tense — `invoice_created`, `signup_completed`, `export_failed`. Never `CreateInvoiceSuccess`, never per-team dialects.
2. **One taxonomy** for the whole product; a single owned registry file, additions by review.
3. **Versioned schemas** — each event carries `schema_version`; breaking property changes bump the version, never mutate silently.
4. **Required properties enumerated** per event (actor, object id, context); optional ones explicitly marked.
5. **Tiered:** Tier 1 = business-critical (revenue/activation funnels — alerting on absence), Tier 2 = product insight, Tier 3 = debug (sampled).
6. **PII policy stated per property** — what is hashed, dropped, or allowed.

---

## Dashboard layout patterns

- **One question per row** — each row labeled with the question it answers ("Is the API healthy?", "Where is latency coming from?", "Is the queue keeping up?").
- **Top-left rule** — the single most important signal (SLO compliance / error rate) goes top-left; detail flows down and right.
- **Per-audience dashboards** — on-call (golden signals + saturation, <10 panels), product (funnels, Tier-1 events), exec (SLO attainment, unit trends). Never one dashboard for all three.
- **Drill-down chain** — overview row → per-service row → per-endpoint row; every panel links one level deeper.
- **A panel nobody has used in 90 days gets deleted.**

---

## SLO definition basics

- **SLI first** — a measured ratio of good events to total events (e.g., requests under 500ms / all requests), from data you actually collect.
- **SLO** — target over a window: "99.5% of requests <500ms over 30 days." Window and target both stated; no window, no SLO.
- **Error budget** — 100% minus the SLO target; the spend-it-or-bank-it currency that makes alerting and release decisions mechanical.
- **Start with 2-4 SLOs per user-facing service** — availability + latency cover most; add freshness/durability only where users feel them.
- **Targets come from user tolerance, not current performance** — a system at 99.99% with users happy at 99.9% has budget to spend on velocity.

---

## Alert-design rules

| Decision | Rule |
|---|---|
| Page vs. ticket | Page = user-impacting NOW and needs a human in minutes; everything else is a ticket. A page someone can sleep through should not be a page. |
| Source | Alerts derive from SLOs — define the SLO, alert on error-budget burn; never raw resource thresholds as pages |
| Burn-rate pairs | Fast burn: 14.4x budget burn over 1h → page. Slow burn: 3x over 6h (confirmed at 30m) → ticket. (Google SRE multiwindow pattern) |
| Actionability | Every alert names the runbook/first action; an alert without a next step is noise |
| Symptom over cause | Alert on user-visible symptoms (error rate, latency); causes (CPU, disk) are dashboard/ticket material |
| Review | Any alert that fired 3+ times without action gets retuned or deleted |

---

## Anti-patterns

1. **Vanity metrics** — counts that only go up (total signups ever, total requests served) driving no decision; fails the owner-question test.
2. **Average latency** — the average is the one latency nobody experienced; p95/p99 histograms or nothing.
3. **Alert storms** — 40 cause-level alerts firing for one outage; alert on the symptom, annotate with causes.
4. **Unbounded cardinality** — user-id as a metric label melts the TSDB and the budget; high-cardinality detail lives in traces/logs.
5. **Dashboard sprawl** — 30 unowned dashboards nobody trusts; per-audience, question-labeled rows, delete-on-disuse.
6. **Tool-first specs** — "we use Datadog" is not a strategy; methodology, metrics, SLOs, and conditions are; the tool comes last.
7. **Measure-everything** — collecting all the things "just in case" buries the signal and triples ingest cost; every metric earns its place via the owner-question.
8. **Folklore thresholds** — "CPU > 80%" pages inherited from an old wiki; derive alerts from SLOs that reflect users.
