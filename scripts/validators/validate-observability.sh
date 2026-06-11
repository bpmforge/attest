#!/usr/bin/env bash
#
# validate-observability.sh -- the observability spec must be concrete at
# Phase 3, not "we'll add monitoring later."
#
# validate-infrastructure.sh checks that the Operational Concerns SECTION
# exists; this validator checks the observability CONTENT inside
# INFRASTRUCTURE.md (or a dedicated docs/OBSERVABILITY.md if present):
#
#   logging    — a stated strategy (structured/centralized + retention)
#   metrics    — a named methodology (RED, USE, or four golden signals)
#                or explicit metric names
#   tracing    — distributed tracing position (required for multi-service
#                topologies; "N/A — single service" is acceptable)
#   alerting   — what triggers an alert (thresholds/conditions, not just
#                a tool name)
#   dashboards — what is on the primary dashboard
#
# Exit: 0 = spec complete / 1 = gaps / 2 = invocation error

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-observability"

ROOT="$(detect_project_root "${1:-}")"

DOC="$ROOT/docs/OBSERVABILITY.md"
if ! file_exists_nonempty "$DOC"; then
  DOC="$ROOT/docs/INFRASTRUCTURE.md"
fi

if ! file_exists_nonempty "$DOC"; then
  warn "Neither docs/OBSERVABILITY.md nor docs/INFRASTRUCTURE.md found — skipping (run the infrastructure HANDOFF first)"
  validator_exit
fi
note "Checking: ${DOC#"$ROOT/"}"

CONTENT="$(cat "$DOC")"

has() { grep -qiE "$1" <<< "$CONTENT"; }

# 1. Logging strategy — structure + retention, not just a tool name
if ! has 'logg?ing'; then
  gap "no-logging" "${DOC#"$ROOT/"}: no logging strategy — state format (structured/JSON?), centralization target, and retention"
elif ! has '(structur|json|centraliz|aggregat|retention|rotate|days|loki|elk|cloudwatch|stackdriver|datadog|splunk)'; then
  gap "thin-logging" "${DOC#"$ROOT/"}: logging is mentioned but has no strategy — add structure (JSON?), centralization target, and retention period"
fi

# 2. Metrics methodology — RED / USE / golden signals or named metrics
if ! has '(RED method|USE method|golden signal|latency|throughput|error rate|saturation|p9[59]|metrics?)'; then
  gap "no-metrics" "${DOC#"$ROOT/"}: no metrics spec — name the methodology (RED / USE / four golden signals) or list the concrete metrics with targets"
elif ! has '(RED|USE|golden signal|p9[59]|error rate|saturation)'; then
  gap "thin-metrics" "${DOC#"$ROOT/"}: metrics mentioned without a methodology — pick RED / USE / golden signals so coverage is systematic, not ad-hoc"
fi

# 3. Distributed tracing — required position (N/A is fine if stated)
if ! has '(trac(e|ing)|otel|opentelemetry|jaeger|zipkin|x-ray|span)'; then
  gap "no-tracing" "${DOC#"$ROOT/"}: no distributed-tracing position — adopt one (OpenTelemetry/Jaeger/X-Ray) or state 'N/A — single service' explicitly"
fi

# 4. Alerting — conditions, not just a pager tool
if ! has 'alert'; then
  gap "no-alerting" "${DOC#"$ROOT/"}: no alerting spec — define what conditions page a human"
elif ! has '(threshold|trigger|when |if .*(exceed|above|below|>|%)|condition|SLO|burn rate|error budget)'; then
  gap "thin-alerting" "${DOC#"$ROOT/"}: alerting names a tool but no conditions — state the thresholds/SLOs that actually fire alerts"
fi

# 5. Dashboards — what the primary view shows
if ! has '(dashboard|grafana|kibana|datadog)'; then
  gap "no-dashboards" "${DOC#"$ROOT/"}: no dashboard spec — state what the primary operational dashboard shows"
fi

validator_exit
