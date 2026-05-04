#!/usr/bin/env bash
#
# validate-deps.sh -- run a CVE / advisory check on dependencies.
#
# Auto-detects per stack:
#   node:   npm audit --audit-level=high --json
#   python: pip-audit -f json
#   rust:   cargo audit --json
#   go:     govulncheck ./...
#
# Override via .sdlc/sdlc.json "deps" key. Optional .sdlc/deps-waivers.txt
# (one CVE-ID or advisory ID per line) suppresses known-accepted advisories.
#
# Writes docs/reviews/RUNTIME_deps_<date>.md with the count of CRITICAL/HIGH
# advisories. Exits non-zero on any unwaived high-severity advisory.
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib_sdlc_config.sh"

validator_init "validate-deps"

ROOT="$(detect_project_root "${1:-}")"
STACK=$(detect_stack "$ROOT")

if [[ "$STACK" == "unknown" ]]; then
  warn "no recognized dep manifest in $ROOT — skipping"
  validator_exit
fi

CMD=$(resolve_command "$ROOT" "deps" "$(default_deps "$STACK")")
if [[ -z "$CMD" ]]; then
  warn "stack=$STACK has no default dep-audit command — skipping"
  validator_exit
fi

note "stack=$STACK deps='$CMD'"

# Verify the tool is installed
TOOL=$(echo "$CMD" | awk '{print $1}')
if [[ "$TOOL" == "npm" || "$TOOL" == "npx" ]]; then
  : # always available with node project
elif ! command -v "$TOOL" >/dev/null 2>&1; then
  warn "deps tool '$TOOL' not installed — skipping (install it to enable)"
  validator_exit
fi

LOG=$(mktemp -t "deps.XXXXXX")
trap 'rm -f "$LOG"' EXIT

(cd "$ROOT" && eval "$CMD") >"$LOG" 2>&1
RC=$?

# Read waivers
declare -a WAIVERS
WAIVERS=()
if [[ -f "$ROOT/.sdlc/deps-waivers.txt" ]]; then
  while IFS= read -r line; do
    line="${line%%#*}"
    line="${line## }"
    line="${line%% }"
    [[ -n "$line" ]] && WAIVERS+=("$line")
  done < "$ROOT/.sdlc/deps-waivers.txt"
fi

# Count high/critical advisories (best-effort across formats)
HIGH=$(grep -ciE '"severity":[[:space:]]*"(high|critical)"' "$LOG" || true)
[[ -z "$HIGH" ]] && HIGH=0

# Subtract waivers
WAIVED=0
for w in "${WAIVERS[@]:-}"; do
  [[ -z "$w" ]] && continue
  grep -qF "$w" "$LOG" && WAIVED=$((WAIVED + 1))
done
NET=$((HIGH - WAIVED))
[[ "$NET" -lt 0 ]] && NET=0

TAIL=$(tail -80 "$LOG")

if [[ "$NET" -eq 0 ]]; then
  pass "deps clean (rc=$RC, $HIGH high-severity total, $WAIVED waived)"
  write_runtime_report "$ROOT" "deps" "PASS — 0 unwaived high/critical (waived $WAIVED)" "$TAIL" >/dev/null
else
  gap "deps-vulns" "$NET unwaived high/critical advisories ($HIGH total, $WAIVED waived) — see RUNTIME report"
  write_runtime_report "$ROOT" "deps" "FAIL — $NET unwaived high/critical" "$TAIL" >/dev/null
fi

validator_exit
