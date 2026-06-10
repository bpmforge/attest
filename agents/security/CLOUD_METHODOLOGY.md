---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Cloud Security Methodology — AWS + GCP

> Load this file when the project deploys to AWS or GCP, or when AWS/GCP SDKs are present.
> Sources: AWS Well-Architected Security Pillar, Google Cloud Security Best Practices (2025).
> Context cost: ~7k tokens.

---

## Detection Gate — Cloud Code Presence

```bash
# Check for cloud SDKs and config
grep -r "aws-sdk\|@aws-sdk\|boto3\|google-cloud\|@google-cloud\|firebase-admin" \
  package.json requirements.txt Cargo.toml go.mod 2>/dev/null | head -5

# Check for cloud config patterns in source
grep -rn "AKIA[0-9A-Z]\|amazonaws.com\|storage.googleapis.com\|\.gserviceaccount\.com" \
  src/ app/ lib/ --include="*.ts" --include="*.js" --include="*.py" 2>/dev/null | head -10
```

Detect: **AWS**, **GCP**, or **both**. Run only the relevant platform sections below.

---

## AWS Security Checks

### AWS-01 — Hardcoded AWS Credentials

**Severity:** CRITICAL

**Pattern:** AWS Access Key IDs match `AKIA[0-9A-Z]{16}`. Secret keys are 40-char alphanumeric.

```bash
# Detection
grep -rn "AKIA[0-9A-Z]\{16\}" src/ --include="*.ts" --include="*.js" --include="*.py" --include="*.env"
grep -rn "aws_access_key_id\s*=\s*['\"]" . --include="*.py" --include="*.cfg"
grep -rn "AWS_SECRET_ACCESS_KEY.*=.*['\"][A-Za-z0-9+/]\{40\}" .
```

**Indicators:**
- `AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"` in any source file
- `credentials.json` or `.aws/credentials` committed to git
- `process.env.AWS_SECRET_ACCESS_KEY || "hardcoded-fallback"` — fallback pattern

**Preconditions:** none (keys in source = already exposed)
**Yields:** AWS credentials for the associated account/role
**Remediation:** Use IAM roles (EC2/ECS/Lambda role assumption) or AWS Secrets Manager. Remove from source and rotate immediately.

---

### AWS-02 — Wildcard IAM Policies

**Severity:** HIGH

```bash
grep -rn '"Action".*"\*"' . --include="*.json" --include="*.tf" --include="*.yaml"
grep -rn '"Resource".*"\*"' . --include="*.json" --include="*.tf" --include="*.yaml"
grep -rn "AdministratorAccess" . --include="*.tf" --include="*.json"
```

**Indicators:**
- `"Action": "*"` or `"Resource": "*"` in IAM policy documents
- Inline `AdministratorAccess` attached to Lambda/EC2 instance profiles
- `iam:*` or `s3:*` permissions without resource scoping

**Preconditions:** AWS credentials for an account or CI/CD role
**Yields:** Full or near-full AWS account access, lateral movement to all services
**Remediation:** Scope to minimum required actions and specific ARNs. Use IAM Access Analyzer.

---

### AWS-03 — Open Security Groups (0.0.0.0/0)

**Severity:** HIGH

```bash
grep -rn "0\.0\.0\.0/0" . --include="*.tf" --include="*.json" --include="*.yaml"
grep -rn "cidr_blocks.*0\.0\.0\.0" . --include="*.tf"
```

**Indicators:**
- `cidr_blocks = ["0.0.0.0/0"]` with port 22 (SSH), 3389 (RDP), 3306 (MySQL), 5432 (Postgres), 6379 (Redis)
- `::/0` (IPv6 wildcard) on sensitive ports
- `ingress { from_port = 0 to_port = 65535 }` — all ports open

**Preconditions:** network access to internet
**Yields:** Direct network access to sensitive service/port
**Remediation:** Restrict to specific CIDR ranges or VPC CIDR. Use VPN/bastion for admin ports.

---

### AWS-04 — Secrets in Environment Variables (source code)

**Severity:** HIGH

```bash
grep -rn "process\.env\.\(SECRET\|PASSWORD\|KEY\|TOKEN\|CREDENTIAL\)" src/ --include="*.ts" --include="*.js"
grep -rn "environment.*variables.*=.*{" . --include="*.tf"  # check Terraform Lambda env
```

**Indicators:**
- Hard-coded fallback: `process.env.DB_PASSWORD || "mysecretpassword"`
- `.env` file committed (check `git log --all --full-history -- '*.env'`)
- Terraform `environment { variables { SECRET = "..."} }` with literal values
- ECS task definition JSON with plaintext env vars

**Preconditions:** read access to source or CI logs
**Yields:** service credentials, database passwords, API keys
**Remediation:** AWS Secrets Manager (`secretsmanager:GetSecretValue`) or SSM Parameter Store (SecureString). Never plaintext in `.env` committed to git.

---

### AWS-05 — Missing CloudTrail / Audit Logging

**Severity:** MEDIUM

```bash
grep -rn "aws_cloudtrail\|cloudtrail" . --include="*.tf" | head -10
grep -rn "enable_log_file_validation\s*=\s*false" . --include="*.tf"
```

**Indicators:**
- No `aws_cloudtrail` resource in Terraform
- `enable_log_file_validation = false` — log tampering not detected
- CloudTrail not enabled for all regions
- No S3 access logging on sensitive buckets

**Preconditions:** attack has already occurred
**Yields:** no forensic trail, incident investigation impossible
**Remediation:** Enable CloudTrail with log file validation in all regions. Enable S3 server access logging.

---

### AWS-06 — Public S3 Buckets

**Severity:** HIGH

```bash
grep -rn 'acl\s*=\s*"public' . --include="*.tf"
grep -rn "aws_s3_bucket_public_access_block" . --include="*.tf"
grep -rn "BlockPublicAcls.*false\|IgnorePublicAcls.*false" . --include="*.json" --include="*.tf"
```

**Indicators:**
- `acl = "public-read"` or `acl = "public-read-write"` on S3 bucket
- Missing `aws_s3_bucket_public_access_block` resource
- `block_public_acls = false` in block public access config

**Preconditions:** network access to internet
**Yields:** read/write access to S3 bucket contents
**Remediation:** Set all four `block_public_access` flags to true. Use presigned URLs or CloudFront for public-facing content.

---

## GCP Security Checks

### GCP-01 — Service Account Key JSON in Source

**Severity:** CRITICAL

```bash
grep -rn '"type".*"service_account"' . --include="*.json"
grep -rn "GOOGLE_APPLICATION_CREDENTIALS" . --include="*.env" --include="*.sh" --include="*.yaml"
find . -name "*.json" -exec grep -l "private_key" {} \; 2>/dev/null
```

**Indicators:**
- `.json` file containing `"type": "service_account"` and `"private_key":`
- `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json` pointing to a committed key file
- Service account key downloaded and stored in repository

**Preconditions:** none (key in source = already exposed)
**Yields:** GCP credentials for associated service account
**Remediation:** Use Workload Identity Federation (GKE, Cloud Run, Cloud Functions) — eliminates key files. If keys required: use Secret Manager, not source.

---

### GCP-02 — Overly Permissive Service Account Roles

**Severity:** HIGH

```bash
grep -rn "roles/owner\|roles/editor" . --include="*.tf" --include="*.yaml"
grep -rn "google_project_iam_binding\|google_project_iam_member" . --include="*.tf"
```

**Indicators:**
- `roles/owner` or `roles/editor` assigned to a service account
- Primitive roles (`roles/owner`, `roles/editor`, `roles/viewer`) on project-level bindings
- `roles/iam.serviceAccountTokenCreator` granted broadly (allows impersonation)

**Preconditions:** GCP credentials for associated project
**Yields:** near-full GCP project access, privilege escalation
**Remediation:** Use predefined roles (e.g., `roles/storage.objectViewer`) scoped to specific resources.

---

### GCP-03 — Public GCS Buckets

**Severity:** HIGH

```bash
grep -rn "allUsers\|allAuthenticatedUsers" . --include="*.tf" --include="*.yaml"
grep -rn 'predefined_acl\s*=\s*"publicRead' . --include="*.tf"
grep -rn "public_access_prevention" . --include="*.tf"
```

**Indicators:**
- `member = "allUsers"` in `google_storage_bucket_iam_binding`
- `predefined_acl = "publicRead"` or `"publicReadWrite"`
- Missing `public_access_prevention = "enforced"` on buckets with sensitive data

**Preconditions:** network access to internet
**Yields:** read/write access to GCS bucket contents
**Remediation:** Set `public_access_prevention = "enforced"`. Use signed URLs for public delivery.

---

### GCP-04 — Open Firewall Rules

**Severity:** HIGH

```bash
grep -rn 'source_ranges.*0\.0\.0\.0/0' . --include="*.tf"
grep -rn '"protocol".*"all"' . --include="*.tf" --include="*.json"
```

**Indicators:**
- `source_ranges = ["0.0.0.0/0"]` with `allow { protocol = "all" }` or on port 22/3389
- `allow { protocol = "tcp" ports = ["0-65535"] }` — all TCP ports open
- Default `allow-internal` rule extended to internet

**Preconditions:** network access to internet
**Yields:** direct access to GCE instances / GKE nodes
**Remediation:** Restrict source_ranges to specific CIDR. Use Identity-Aware Proxy (IAP) for admin access.

---

### GCP-05 — Missing Cloud Audit Logs

**Severity:** MEDIUM

```bash
grep -rn "google_project_iam_audit_config" . --include="*.tf"
grep -rn "DATA_READ\|DATA_WRITE" . --include="*.tf"
```

**Indicators:**
- No `google_project_iam_audit_config` resource in Terraform
- `DATA_READ` and `DATA_WRITE` audit logs not enabled for critical services (GCS, BigQuery, Cloud SQL)
- `exempted_members` list includes service accounts that shouldn't be exempt

**Remediation:** Enable `DATA_READ` and `DATA_WRITE` audit logs for all production services.

---

### GCP-06 — Workload Identity Not Used (SA Keys Instead)

**Severity:** MEDIUM

```bash
grep -rn "workloadIdentityConfig" . --include="*.tf"
grep -rn "google_service_account_key" . --include="*.tf"
```

**Indicators:**
- GKE cluster without `workload_identity_config` block
- `google_service_account_key` resource creates downloaded key files
- Cloud Run service not using service account impersonation via Workload Identity

**Remediation:** Enable Workload Identity on GKE clusters. Bind Kubernetes ServiceAccounts to GCP ServiceAccounts via annotation.

---

## Output Format

Use `FINDING_SCHEMA.md`. Category: `cloud`. Output file: `docs/security/CLOUD_FINDINGS_<date>.md`.

Run relevant platform sections only. Note which platforms were detected and which were skipped.
