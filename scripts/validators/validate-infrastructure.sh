#!/usr/bin/env bash
#
# validate-infrastructure.sh -- validates docs/INFRASTRUCTURE.md for
# completeness and separation-of-concerns (no IaC code in the topology doc).
#
# Checks:
#   1. INFRASTRUCTURE.md exists and is non-empty
#   2. Environment matrix (dev/staging/prod)
#   3. Compute layer section
#   4. Data layer section
#   5. Networking section with Mermaid diagram
#   6. Operational concerns section
#   7. IaC note (explicit reference to Phase 4 deliverable)
#   8. NO IaC code patterns in the document (separation of concerns)
#   9. ARCHITECTURE.md references INFRASTRUCTURE.md
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-infrastructure"

ROOT="$(detect_project_root "${1:-}")"

INFRA="$ROOT/docs/INFRASTRUCTURE.md"

# -- 1. File existence ---------------------------------------------------------
if ! file_exists_nonempty "$INFRA"; then
  gap "missing-infrastructure" "docs/INFRASTRUCTURE.md not found or empty — run sre-engineer infrastructure HANDOFF"
  validator_exit
fi
pass "INFRASTRUCTURE.md present"

# -- 2. Environment matrix -----------------------------------------------------
if ! grep -qiE '(Environment[[:space:]]+Matrix|## Environment|dev.*stag.*prod|staging|development)' "$INFRA" 2>/dev/null; then
  gap "missing-env-matrix" "INFRASTRUCTURE.md missing Environment Matrix section (dev/staging/prod)"
else
  pass "Environment matrix present"
  # Check for the three standard environments
  for env in "development\|dev\b" "staging" "production\|prod\b"; do
    if ! grep -qiE "$env" "$INFRA" 2>/dev/null; then
      gap "missing-environment" "INFRASTRUCTURE.md missing environment: $env"
    fi
  done
fi

# -- 3. Compute layer ----------------------------------------------------------
if ! grep -qiE '^## Compute' "$INFRA" 2>/dev/null; then
  gap "missing-compute-section" "INFRASTRUCTURE.md missing '## Compute Layer' section"
else
  pass "Compute layer section present"
fi

# -- 4. Data layer -------------------------------------------------------------
if ! grep -qiE '^## Data' "$INFRA" 2>/dev/null; then
  gap "missing-data-section" "INFRASTRUCTURE.md missing '## Data Layer' section"
else
  pass "Data layer section present"
fi

# -- 5. Networking + Mermaid diagram ------------------------------------------
if ! grep -qiE '^## Networking' "$INFRA" 2>/dev/null; then
  gap "missing-networking-section" "INFRASTRUCTURE.md missing '## Networking' section"
else
  pass "Networking section present"
fi

if ! grep -qE '```mermaid' "$INFRA" 2>/dev/null; then
  gap "missing-topology-diagram" "INFRASTRUCTURE.md has no Mermaid diagram — add a deployment/topology diagram showing how components connect"
else
  pass "Mermaid topology diagram present"
fi

# -- 6. Operational concerns ---------------------------------------------------
if ! grep -qiE '^## Operational' "$INFRA" 2>/dev/null; then
  gap "missing-operational-section" "INFRASTRUCTURE.md missing '## Operational Concerns' section (monitoring, logging, backups, secrets)"
else
  pass "Operational concerns section present"
  # Check for key operational topics
  for topic in "monitor" "log" "backup\|back up" "secret\|credential"; do
    if ! grep -qiE "$topic" "$INFRA" 2>/dev/null; then
      gap "missing-operational-topic" "Operational Concerns section missing topic: $topic"
    fi
  done
fi

# -- 7. IaC note ---------------------------------------------------------------
if ! grep -qiE '(IaC|Infrastructure.as.Code|Terraform|Phase 4)' "$INFRA" 2>/dev/null; then
  gap "missing-iac-note" "INFRASTRUCTURE.md should note that IaC scaffolding is a Phase 4 deliverable — add an 'IaC Note' section"
else
  pass "IaC/Phase 4 note present"
fi

# -- 8. No IaC code patterns (separation of concerns) -------------------------
# HCL (Terraform) patterns
if grep -qE '^resource[[:space:]]+"[a-z_]+"[[:space:]]+"' "$INFRA" 2>/dev/null; then
  gap "iac-code-in-topology-doc" "INFRASTRUCTURE.md contains Terraform resource blocks — IaC code belongs in infra/ (Phase 4 deliverable), not in the topology document"
fi

# Kubernetes YAML patterns
if grep -qE '^apiVersion:[[:space:]]' "$INFRA" 2>/dev/null; then
  gap "iac-code-in-topology-doc" "INFRASTRUCTURE.md contains Kubernetes YAML — IaC manifests belong in infra/ (Phase 4 deliverable)"
fi

# CloudFormation patterns
if grep -qE '^(AWSTemplateFormatVersion|Resources:|Type:[[:space:]]+AWS::)' "$INFRA" 2>/dev/null; then
  gap "iac-code-in-topology-doc" "INFRASTRUCTURE.md contains CloudFormation — IaC templates belong in infra/ (Phase 4 deliverable)"
fi

# Pulumi/CDK patterns
if grep -qE '(new aws\.|pulumi\.|cdk\.)' "$INFRA" 2>/dev/null; then
  gap "iac-code-in-topology-doc" "INFRASTRUCTURE.md contains Pulumi/CDK code — IaC code belongs in infra/ (Phase 4 deliverable)"
fi

[[ "$GAP_COUNT" -eq 0 ]] && pass "No IaC code found in topology document (correct separation of concerns)"

# -- 9. ARCHITECTURE.md references INFRASTRUCTURE.md -------------------------
ARCH="$ROOT/docs/ARCHITECTURE.md"
if file_exists_nonempty "$ARCH"; then
  if ! grep -qi "INFRASTRUCTURE" "$ARCH" 2>/dev/null; then
    gap "arch-missing-infra-ref" "docs/ARCHITECTURE.md does not reference INFRASTRUCTURE.md — architecture synthesis must link to the infrastructure topology"
  else
    pass "ARCHITECTURE.md references INFRASTRUCTURE.md"
  fi
fi

validator_exit
