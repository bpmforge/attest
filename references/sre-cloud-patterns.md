# Multi-Cloud SRE Patterns

Per-cloud equivalents for the operational concerns the sre-engineer designs.
The PATTERN is constant across clouds; only the service names change. Pick the
column for the project's cloud (DESIGN_CONTEXT.md / TECH_STACK.md) — never
default to AWS names on a GCP project.

## Service equivalence table

| Concern | AWS | GCP | Azure | On-prem / self-hosted |
|---------|-----|-----|-------|----------------------|
| CI/CD | CodePipeline/CodeBuild | Cloud Build | Azure DevOps Pipelines | Gitea Actions / Jenkins / Woodpecker |
| Container runtime | ECS / EKS | Cloud Run / GKE | Container Apps / AKS | Podman / k3s / Docker Compose |
| Secrets | Secrets Manager / SSM Parameter Store | Secret Manager | Key Vault | Vault / SOPS + age |
| Log centralization | CloudWatch Logs | Cloud Logging | Monitor Logs (Log Analytics) | Loki / ELK |
| Metrics | CloudWatch Metrics | Cloud Monitoring | Azure Monitor | Prometheus + Grafana |
| Tracing | X-Ray | Cloud Trace | Application Insights | OpenTelemetry → Jaeger/Tempo |
| Alerting/paging | CloudWatch Alarms → SNS | Alerting policies | Monitor alerts → Action Groups | Alertmanager → ntfy/PagerDuty |
| Object storage | S3 | GCS | Blob Storage | MinIO |
| Managed Postgres | RDS / Aurora | Cloud SQL / AlloyDB | Database for PostgreSQL | Patroni / plain pg + pgBackRest |
| Queue / events | SQS / EventBridge | Pub/Sub | Service Bus / Event Grid | NATS / RabbitMQ / Redis Streams |
| CDN / edge | CloudFront | Cloud CDN | Front Door | Cloudflare (any origin) |
| IAM for workloads | IAM roles (IRSA on EKS) | Workload Identity | Managed Identity | Vault AppRole / mTLS |
| Cost visibility | Cost Explorer + budgets | Billing reports + budgets | Cost Management | (instance count × invoice) |

## Patterns that do NOT change per cloud

- **Secrets never in env files or images.** Inject at runtime from the
  platform's secret store; the table row is the only thing that varies.
- **Logs are structured JSON at the source.** Centralization target varies;
  the format contract does not.
- **One alert = one human action.** If no one would act on it, it's a
  dashboard panel, not an alert. Page on SLO burn rate, not raw CPU.
- **Runbook structure** (constant): trigger → impact → diagnosis commands
  (copy-pasteable) → remediation steps → escalation path → "how to verify
  recovery." One runbook per alert.
- **Deploys are rollback-first.** Define the rollback command before the
  deploy command. Blue/green or migrate-then-swap on every platform.
- **Backups are restore-tested.** A backup that has never been restored is
  a hope, not a backup — schedule a quarterly restore drill on every cloud.

## On-prem / homelab divergences worth designing for

- No managed IAM: workload identity becomes mTLS or Vault — plan cert/token
  rotation explicitly (it is the #1 silent-failure source).
- No platform load balancer: nginx/Caddy/Traefik config IS infrastructure —
  it belongs in the repo and the topology diagram, not on the box.
- Single-node reality: if HA is impossible, state the recovery-time target
  honestly (e.g. "restore from backup, RTO 2h") instead of pretending.

## Choosing when the project is multi-cloud or undecided

1. Design against the PATTERN column headers, not a provider.
2. Put provider choices in one adapter layer / one Terraform module set.
3. Name the single highest-lock-in service in INFRASTRUCTURE.md (usually the
   queue or the identity system) — that is the real migration cost, not compute.
