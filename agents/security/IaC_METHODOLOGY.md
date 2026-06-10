---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Infrastructure-as-Code Security Methodology

> Load this file when the project contains Terraform, CDK, Pulumi, CloudFormation, or Ansible configs.
> Sources: Checkov docs, KICS (Checkmarx), Trivy IaC, CIS Benchmarks (2025).
> Context cost: ~7k tokens.

---

## Tool Status (2025-2026) — Read Before Running

| Tool | Status | Use for |
|------|--------|---------|
| **Checkov** (Bridgecrew/Prisma) | ✅ Active | Primary: 1,000+ Terraform policies, graph-based cross-resource checks |
| **Trivy** (`trivy config .`) | ✅ Active | tfsec was deprecated 2023-2024; Trivy absorbed tfsec. One binary for IaC + containers + deps |
| **KICS** (Checkmarx) | ✅ Active | Broadest: 2,400+ queries, 22+ IaC platforms (CDK, Pulumi, Helm, etc.) |
| **Terrascan** (Tenable) | ❌ **ARCHIVED Nov 2025** | Do not use. Migrate to Checkov or KICS |
| **TruffleHog** | ✅ Active | Secrets in git history — always run alongside IaC scanners |

**Recommended stack:** Checkov (depth on Terraform) + KICS (breadth if multi-platform IaC) + TruffleHog (git history secrets).

---

## Detection Gate — IaC Presence

```bash
find . -name "*.tf" -not -path "*/node_modules/*" | head -5
find . -name "*.tfvars" -not -path "*/node_modules/*" | head -5
find . -name "cdk.json" -o -name "Pulumi.yaml" -o -name "serverless.yml" 2>/dev/null | head -5
ls -la terraform/ infrastructure/ infra/ iac/ 2>/dev/null
```

If no IaC files found: skip specialist, note "No IaC detected" in coordinator summary.

---

## Phase 1 — Automated Tool Scan

Run all available tools. Never silence errors with `|| true` — a failed scan producing 0 findings is a false clean, not a clean codebase.

```bash
# Checkov — primary Terraform scanner
checkov -d . --output json > docs/security/checkov-results.json 2>&1 || true
checkov -d . --compact --quiet 2>&1 | head -100

# Trivy IaC scan (replaces tfsec)
trivy config . --format json > docs/security/trivy-iac-results.json 2>&1 || true
trivy config . --severity HIGH,CRITICAL 2>&1 | head -100

# KICS — multi-platform breadth
kics scan -p . -o docs/security/ --report-formats json 2>&1 | head -50

# TruffleHog — secrets in git history
trufflehog git file://. --json 2>/dev/null | head -50
```

If a tool is not installed, note it in the report and proceed with available tools.

---

## Phase 2 — Manual Checks (10 Categories)

### IaC-01 — Exposed Credentials in IaC Files

**Severity:** CRITICAL

```bash
grep -rn 'password\s*=\s*"' . --include="*.tf" --include="*.tfvars"
grep -rn 'secret\s*=\s*"' . --include="*.tf" --include="*.tfvars"
grep -rn 'access_key\s*=\s*"AKIA' . --include="*.tf"
grep -rn '"[A-Za-z0-9+/]\{40\}"' . --include="*.tfvars"  # AWS-format secret keys
```

**Indicators:**
- `password = "plaintext"` in `aws_db_instance`, `google_sql_database_instance`
- `token = "ghp_..."` or `api_key = "sk-..."` literals
- `.tfvars` files committed to git with secret values
- Terraform state file (`terraform.tfstate`) in unencrypted/unprotected location

**Preconditions:** read access to repository or CI pipeline
**Yields:** database credentials, API keys, service account secrets
**Remediation:** Use variable references with `var.db_password` marked as `sensitive = true`. Store in AWS Secrets Manager, HashiCorp Vault, or environment-based injection in CI.

---

### IaC-02 — Unencrypted Storage

**Severity:** HIGH

```bash
grep -rn "encrypted\s*=\s*false\|storage_encrypted\s*=\s*false" . --include="*.tf"
grep -A5 "aws_ebs_volume\|aws_rds_cluster\|aws_db_instance\|aws_s3_bucket" . -r --include="*.tf" | \
  grep -v "encrypted\s*=\s*true\|kms_key"
grep -rn "google_compute_disk\|google_sql_database_instance" . --include="*.tf" | head -20
```

**Indicators (AWS):**
- `aws_db_instance` without `storage_encrypted = true`
- `aws_ebs_volume` without `encrypted = true`
- `aws_s3_bucket` without server-side encryption configuration

**Indicators (GCP):**
- `google_compute_disk` without `disk_encryption_key`
- `google_sql_database_instance` without CMEK (check for `encryption_key_name`)

**Preconditions:** physical or cloud-level storage access
**Yields:** raw data access bypassing application-layer access controls
**Remediation:** Enable encryption at rest for all storage. Use KMS customer-managed keys (CMK) for regulated data.

---

### IaC-03 — Overly Permissive IAM (Wildcard Policies)

**Severity:** HIGH

```bash
grep -rn '"Action".*"\*"' . --include="*.tf" --include="*.json"
grep -rn '"Resource".*"\*"' . --include="*.tf" --include="*.json"
grep -rn 'AdministratorAccess\|PowerUserAccess' . --include="*.tf"
grep -rn "roles/owner\|roles/editor" . --include="*.tf"  # GCP
```

**Indicators:**
- `"Action": "*"` or `"Action": ["iam:*", "s3:*"]` — overly broad action scope
- `"Resource": "*"` without resource-scoped ARNs
- `AdministratorAccess` policy attached to non-admin resources (CI role, Lambda)
- GCP: `roles/owner` or `roles/editor` on service accounts

**Preconditions:** valid credentials for associated AWS account / GCP project
**Yields:** privilege escalation to full account/project control
**Remediation:** Apply least privilege. Use IAM Access Analyzer to generate minimum policy from access activity. Never use wildcard actions on production roles.

---

### IaC-04 — Open Security Groups / Firewall Rules

**Severity:** HIGH

See CLOUD_METHODOLOGY.md — AWS-03 and GCP-04. IaC scanner provides same checks; cross-reference tool output.

```bash
grep -rn "0\.0\.0\.0/0\|::/0" . --include="*.tf" | grep -v "egress"
```

Note any ingress rules allowing all IPs. Flag port 22, 3389, 3306, 5432, 6379, 27017 as HIGH; all-ports open as CRITICAL.

---

### IaC-05 — Terraform State Exposure

**Severity:** HIGH

```bash
cat .terraform/terraform.tfstate 2>/dev/null | head -20
grep -rn "backend.*s3\|backend.*gcs\|backend.*azurerm" . --include="*.tf"
grep -rn "encrypt\s*=\s*false" . --include="*.tf"  # S3 backend encryption
ls -la *.tfstate *.tfstate.backup 2>/dev/null
```

**Indicators:**
- `terraform.tfstate` committed to git (check: `git log --all --full-history -- '*.tfstate'`)
- S3 backend without `encrypt = true`
- State backend without access logging
- Outputs marked `sensitive = false` exposing secrets in state

**Preconditions:** read access to S3 backend or git repository
**Yields:** all resource secrets, credentials, and configurations in plaintext
**Remediation:** Remote backend with encryption enabled. Never commit state files. Use `sensitive = true` for output blocks containing secrets.

---

### IaC-06 — Missing Logging and Auditing

**Severity:** MEDIUM

```bash
grep -rn "aws_cloudtrail\|enable_log_file_validation" . --include="*.tf"
grep -rn "google_project_iam_audit_config" . --include="*.tf"
grep -rn "flow_logs\|logging_config" . --include="*.tf"
```

**What must be present:**
- AWS: `aws_cloudtrail` resource with `enable_log_file_validation = true`
- AWS: VPC flow logs (`aws_flow_log` resource)
- AWS: S3 access logging on buckets with sensitive data
- GCP: `google_project_iam_audit_config` with `DATA_READ` and `DATA_WRITE`
- GCP: VPC Flow Logs enabled on subnets

---

### IaC-07 — No MFA on Root / Break-Glass Accounts

**Severity:** HIGH

```bash
grep -rn "aws_iam_account_password_policy" . --include="*.tf"
grep -rn "require_uppercase_characters\|minimum_password_length\|max_password_age" . --include="*.tf"
```

**Indicators:**
- No `aws_iam_account_password_policy` resource
- Password policy without `hard_expiry = true` or `max_password_age`
- No MFA enforcement resource (`aws_iam_virtual_mfa_device`)

---

### IaC-08 — Public Compute Instances

**Severity:** MEDIUM-HIGH

```bash
grep -rn "associate_public_ip_address\s*=\s*true" . --include="*.tf"
grep -rn "access_config\s*{" . --include="*.tf"  # GCP: public IP on GCE instance
```

**Indicators:**
- EC2 instances in public subnets with public IP (`associate_public_ip_address = true`)
- GCE instances with `access_config {}` block (assigns ephemeral public IP)
- Load balancer targets with direct internet exposure without WAF

---

### IaC-09 — Insecure Kubernetes Config (EKS/GKE)

**Severity:** HIGH

```bash
grep -rn "enable_private_nodes\|private_cluster_config" . --include="*.tf"
grep -rn "master_authorized_networks_config" . --include="*.tf"
grep -rn "rbac_config\|enable_rbac" . --include="*.tf"
```

**Indicators:**
- GKE cluster without `private_cluster_config { enable_private_nodes = true }`
- GKE without `master_authorized_networks_config` (API server accessible from 0.0.0.0/0)
- EKS without `endpoint_private_access = true`
- RBAC not enforced (`enable_legacy_abac = true`)
- Default service accounts bound to cluster-admin

---

### IaC-10 — Dependency and Module Version Pinning

**Severity:** MEDIUM

```bash
grep -rn "source.*=.*\"hashicorp/" . --include="*.tf" | grep -v "version\s*="
grep -rn "version\s*=\s*\">=" . --include="*.tf"  # unpinned version constraints
```

**Indicators:**
- Terraform modules without `version = "x.y.z"` pin
- Provider version constraints using `>= x.y` without upper bound (unpinned)
- Third-party module sources without hash verification

**Preconditions:** supply chain compromise
**Yields:** malicious IaC code execution during `terraform init` or `terraform apply`
**Remediation:** Pin all providers and modules to exact versions. Use `.terraform.lock.hcl` and commit it.

---

## Output Format

Use `FINDING_SCHEMA.md`. Category: `iac`. Output file: `docs/security/IaC_FINDINGS_<date>.md`.

Include the raw tool output (checkov summary, trivy summary) as an appendix. Mark tool-reported findings as `UNVERIFIED` until manually confirmed; mark manually confirmed findings as `REAL`.
