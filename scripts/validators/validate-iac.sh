#!/usr/bin/env bash
#
# validate-iac.sh -- validates the Phase 4 IaC scaffolding exists and is
# structurally complete.
#
# Checks:
#   1. infra/ directory exists
#   2. IaC entry point exists (auto-detects Terraform / Helm / CloudFormation / Pulumi)
#   3. Variables/inputs file exists
#   4. Outputs file exists (for Terraform)
#   5. Per-environment configs exist (staging + prod at minimum)
#   6. INFRASTRUCTURE.md is referenced in infra/ README or root README
#   7. `terraform validate` passes if terraform is available (Terraform projects only)
#   8. No hardcoded credentials or secrets in IaC files
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-iac"

ROOT="$(detect_project_root "${1:-}")"

INFRA_DIR="$ROOT/infra"

# -- 1. infra/ directory exists -----------------------------------------------
if [[ ! -d "$INFRA_DIR" ]]; then
  gap "missing-infra-dir" "infra/ directory not found — IaC scaffolding must be in infra/"
  validator_exit
fi
pass "infra/ directory present"

# -- 2. Detect IaC type and check entry point ---------------------------------
IAC_TYPE=""
ENTRY_POINT=""

if find "$INFRA_DIR" -name "main.tf" -maxdepth 3 | grep -q .; then
  IAC_TYPE="terraform"
  ENTRY_POINT="$(find "$INFRA_DIR" -name "main.tf" -maxdepth 3 | head -1)"
  pass "IaC type: Terraform (main.tf found at ${ENTRY_POINT#"$ROOT/"})"
elif find "$INFRA_DIR" -name "Chart.yaml" -maxdepth 3 | grep -q .; then
  IAC_TYPE="helm"
  ENTRY_POINT="$(find "$INFRA_DIR" -name "Chart.yaml" -maxdepth 3 | head -1)"
  pass "IaC type: Helm (Chart.yaml found at ${ENTRY_POINT#"$ROOT/"})"
elif find "$INFRA_DIR" -name "template.yaml" -o -name "template.json" -maxdepth 3 2>/dev/null | grep -q .; then
  IAC_TYPE="cloudformation"
  ENTRY_POINT="$(find "$INFRA_DIR" \( -name "template.yaml" -o -name "template.json" \) -maxdepth 3 | head -1)"
  pass "IaC type: CloudFormation (${ENTRY_POINT#"$ROOT/"})"
elif find "$INFRA_DIR" -name "Pulumi.yaml" -maxdepth 3 | grep -q .; then
  IAC_TYPE="pulumi"
  ENTRY_POINT="$(find "$INFRA_DIR" -name "Pulumi.yaml" -maxdepth 3 | head -1)"
  pass "IaC type: Pulumi (Pulumi.yaml found)"
elif find "$INFRA_DIR" \( -name "*.tf" -o -name "*.yaml" -o -name "*.json" \) -maxdepth 4 | grep -q .; then
  IAC_TYPE="unknown"
  pass "IaC files present (type not auto-detected — manual review recommended)"
else
  gap "empty-infra-dir" "infra/ directory exists but contains no IaC files (*.tf, Chart.yaml, template.yaml, Pulumi.yaml)"
  validator_exit
fi

# -- 3. Variables/inputs file exists (Terraform) ------------------------------
if [[ "$IAC_TYPE" == "terraform" ]]; then
  if ! find "$INFRA_DIR" -name "variables.tf" -maxdepth 4 | grep -q .; then
    gap "missing-variables" "Terraform project missing variables.tf — all configurable inputs must be declared as variables"
  else
    pass "variables.tf present"
  fi

  # -- 4. Outputs file exists -------------------------------------------------
  if ! find "$INFRA_DIR" -name "outputs.tf" -maxdepth 4 | grep -q .; then
    gap "missing-outputs" "Terraform project missing outputs.tf — declare at minimum: endpoint URLs, resource ARNs, connection strings"
  else
    pass "outputs.tf present"
  fi
fi

# -- 5. Per-environment configs -----------------------------------------------
env_dirs=0
for env_name in "staging" "prod" "production" "environments/staging" "environments/prod" "envs/staging" "envs/prod"; do
  if [[ -d "$INFRA_DIR/$env_name" ]] || find "$INFRA_DIR" -type d -name "$env_name" -maxdepth 3 | grep -q .; then
    env_dirs=$((env_dirs + 1))
    pass "Environment config found: $env_name"
  fi
done

if [[ "$env_dirs" -lt 2 ]]; then
  gap "missing-env-configs" "IaC scaffolding missing per-environment configs — need at minimum staging/ and prod/ (or environments/staging + environments/prod)"
fi

# -- 6. INFRASTRUCTURE.md referenced -----------------------------------------
# Check infra/README.md or project README
infra_readme="$INFRA_DIR/README.md"
root_readme="$ROOT/README.md"

referenced=false
for f in "$infra_readme" "$root_readme"; do
  if [[ -f "$f" ]] && grep -qi "INFRASTRUCTURE" "$f" 2>/dev/null; then
    referenced=true
    pass "INFRASTRUCTURE.md referenced in $(basename "$f")"
    break
  fi
done

if [[ "$referenced" == "false" ]]; then
  gap "missing-infra-reference" "Neither infra/README.md nor README.md references docs/INFRASTRUCTURE.md — link the IaC to its topology documentation"
fi

# -- 7. Terraform validate (if terraform available) ---------------------------
if [[ "$IAC_TYPE" == "terraform" ]] && command -v terraform > /dev/null 2>&1; then
  entry_dir="$(dirname "$ENTRY_POINT")"
  note "running terraform validate in $entry_dir"
  set +e
  tf_out=$(cd "$entry_dir" && terraform init -backend=false -input=false 2>&1 && terraform validate 2>&1)
  tf_rc=$?
  set -e

  if [[ "$tf_rc" -eq 0 ]]; then
    pass "terraform validate passed"
  else
    gap "terraform-validate-failed" "terraform validate failed in ${entry_dir#"$ROOT/"} — fix HCL syntax errors before gate can pass"
    printf '%s\n' "$tf_out" | tail -20 >&2
  fi
else
  [[ "$IAC_TYPE" == "terraform" ]] && warn "terraform not in PATH — skipping terraform validate (install terraform to enable this check)"
fi

# -- 8. No hardcoded credentials or secrets ------------------------------------
SECRET_PATTERNS=(
  'password[[:space:]]*=[[:space:]]*"[^$][^{]'
  'secret[[:space:]]*=[[:space:]]*"[^$][^{]'
  'api_key[[:space:]]*=[[:space:]]*"[^$][^{]'
  'access_key[[:space:]]*=[[:space:]]*"[a-zA-Z0-9/+]'
  'AKIA[A-Z0-9]{16}'
)

for pattern in "${SECRET_PATTERNS[@]}"; do
  matches=$(grep -rniE "$pattern" "$INFRA_DIR" 2>/dev/null | grep -v -E '(#.*|//.*|var\.|variables\.|lookup\(|data\.)' | head -5 || true)
  if [[ -n "$matches" ]]; then
    gap "hardcoded-secret" "Possible hardcoded credential in IaC files (pattern: $pattern) — use variables, secrets manager references, or environment variables"
    printf '%s\n' "$matches" >&2
  fi
done

[[ "$GAP_COUNT" -eq 0 ]] && pass "No hardcoded credentials detected"

validator_exit
