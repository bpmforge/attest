# Cloud Cost Checklist

Reference used by the `cost-engineer` agent in every invocation. Read this file at the start of every run — per-category checks, how to measure on each major cloud, and typical-saving ranges.

**Not in scope here:** making things faster (→ `performance-engineer`), deploying changes (→ `sre-engineer`). Cost flags the waste; siblings fix the system.

---

## Category checks

### 1. Compute right-sizing
- **Check:** p95 CPU + memory utilization over ≥2 weeks vs. provisioned shape. Anything under 40% p95 on both axes is a resize candidate.
- **Measure:** AWS — Compute Optimizer or `aws cloudwatch get-metric-statistics` (CPUUtilization, p95); GCP — Recommender (`gcloud recommender recommendations list --recommender=google.compute.instance.MachineTypeRecommender`); Azure — Advisor cost recommendations.
- **Typical saving:** 20-40% of compute line.

### 2. Storage lifecycle / tiering
- **Check:** objects untouched >30/90 days still in hot tier; no lifecycle policies; orphaned snapshots and old AMIs/images.
- **Measure:** AWS — S3 Storage Lens + Storage Class Analysis; GCP — `gsutil ls -L` + Storage Insights; Azure — Blob inventory + lifecycle management policy report.
- **Typical saving:** 30-60% of storage line via Infrequent Access / Archive tiers + snapshot cleanup.

### 3. Egress / data transfer
- **Check:** cross-AZ and cross-region traffic between chatty services; NAT gateway processing charges; public egress that could ride a CDN.
- **Measure:** AWS — Cost Explorer filtered to "Data Transfer" usage types + VPC Flow Logs; GCP — billing export to BigQuery grouped by SKU `Network`; Azure — Cost analysis filtered to Bandwidth meters.
- **Typical saving:** 10-30% of network line (co-locate chatty services, CDN in front of public assets).

### 4. Idle / orphaned resources
- **Check:** unattached volumes/disks, unassociated elastic/static IPs, idle load balancers, stopped-but-billed instances, forgotten dev clusters.
- **Measure:** AWS — `aws ec2 describe-volumes --filters Name=status,Values=available`, Trusted Advisor; GCP — `gcloud compute disks list --filter="-users:*"`, Idle VM recommender; Azure — Advisor "unused resources" + `az disk list --query "[?managedBy==null]"`.
- **Typical saving:** 5-15% of total bill — pure waste, zero risk.

### 5. Over-provisioned databases
- **Check:** instance class vs. p95 connections/CPU/IOPS; Multi-AZ or replicas on non-prod; provisioned IOPS never reached; storage autogrowth headroom paid but unused.
- **Measure:** AWS — RDS Performance Insights + CloudWatch (DatabaseConnections, ReadIOPS p95); GCP — Cloud SQL insights + Recommender; Azure — SQL Database advisor + Query Performance Insight.
- **Typical saving:** 25-50% of database line (downsize, single-AZ non-prod, serverless tiers for spiky loads).

### 6. LLM / API token spend
- **Check:** per-call token actuals vs. max_tokens budgets; expensive models on tasks a smaller model passes evals for; missing prompt caching (stable prefixes); retries multiplying cost silently.
- **Measure:** provider usage dashboards/exports (Anthropic Console usage, OpenAI usage API); per-call logging of model + input/output tokens; verify current per-token pricing via research tools — it changes.
- **Typical saving:** 30-70% of LLM line (routing, caching, output-length discipline).

### 7. Logging / observability ingest
- **Check:** debug-level logs shipped to paid ingest; retention defaults (30-90 days) on logs nobody queries past 7; high-cardinality custom metrics; duplicate pipelines (CloudWatch AND Datadog).
- **Measure:** AWS — CloudWatch Logs `IncomingBytes` per log group; Datadog — usage attribution page; GCP — Logs-based billing in billing export; Azure — Log Analytics usage table (`Usage | summarize sum(Quantity) by DataType`).
- **Typical saving:** 40-70% of observability line (sampling, retention tiers, drop-filters at the agent).

### 8. Dev-environment sprawl
- **Check:** prod-sized non-prod; environments running nights/weekends; per-developer clusters that outlived their feature; CI runners idling on-demand.
- **Measure:** tag/label coverage first (untagged spend = unattributable spend), then Cost Explorer / billing export grouped by `environment` tag; instance scheduler audit.
- **Typical saving:** 50-75% of non-prod line (auto-stop schedules: 168h/week → ~50h/week).

---

## Commitment readiness (reserved / savings plans / CUDs)

Only after ≥3 months of stable baseline (Hard rule 4):

- [ ] Baseline = the floor usage that survived the last 3 months, not the average
- [ ] Right-sizing done FIRST — never commit to the wrong shape
- [ ] Coverage target 60-80% of baseline, never 100% (leave headroom for change)
- [ ] Break-even months calculated and < expected workload lifetime
- **Measure:** AWS — Cost Explorer RI/SP purchase recommendations; GCP — CUD recommendations; Azure — Reservation recommendations in Advisor.
- **Typical saving:** 25-45% on committed portion.

---

## Audit order (work the bill top-down)

1. Export the bill (Cost Explorer / billing-export-to-BigQuery / Cost analysis) grouped by service, last 3 months.
2. Rank line items by absolute $ — the top 10 usually carry 80%+ of spend.
3. For each top item, pull utilization evidence (category checks above) BEFORE judging it.
4. Sweep idle/orphaned (category 4) regardless of rank — zero-risk wins build trust for the bigger calls.
5. Build unit economics (cost per user/request/job at current, 2x, 10x volume).
6. Only then: right-size → schedule → tier → commit, in that order.

---

## Anti-patterns

1. **Committing before baseline** — buying reserved capacity in month one locks in today's guess; right-size first, commit after 3 stable months.
2. **Optimizing small line items first** — a week spent shaving $40/month of Lambda while a $4,000/month idle GPU box hums along. Always rank by absolute $; start at the top of the bill.
3. **Average-based sizing** — averages hide the p95 peak that actually sizes the box; a 30% average with 95% spikes is NOT oversized. Size from p95 or don't size.
4. **Percent-only claims** — "30% cheaper" without a dollar base is unverifiable; every claim carries $/month at current volume.
5. **Totals without unit economics** — a rising bill on faster-rising usage is improvement; cost per user/request/job is the real signal.
6. **One-time cleanup, no observability** — without budgets, alerts, and tag discipline, the same waste regrows in two quarters.
