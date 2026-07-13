#!/usr/bin/env bash
#
# validate-model-pins.sh -- G3 config-pin lint (T30.1, M30 model-tier guard).
#
# "pin roles, not models" -- routing lives in models.json's tiers (and, once
# T28.2 lands, its roles map). A frontier-tier model id hardcoded in repo
# config or agent frontmatter is a hard gap: the exact 2026-07-08 opus-4.8
# misconfig class -- a repo carried a raw frontier pin, nothing gated it,
# nothing surfaced it, model resolution had no receipt and no tier policy.
# Any other raw `model:`/"model" pin found outside models.json is a warn --
# it works today but bypasses the tier registry, so a routing change won't
# reach it.
#
# Usage: validate-model-pins.sh [project-root] [models.json path]
# Exit 0 clean (warns allowed) / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-model-pins"

ROOT="$(detect_project_root "${1:-}")"
LIB="$(dirname "${BASH_SOURCE[0]}")/../lib/model-tiers.mjs"

if ! command -v node >/dev/null 2>&1; then
  note "node not found -- cannot lint model pins"
  validator_exit; exit $?
fi
if [[ ! -f "$LIB" ]]; then
  note "model-tiers.mjs helper not found at $LIB -- nothing to check"
  validator_exit; exit $?
fi

# Resolve the tier registry to check against: an explicit arg, else the
# target root's own models.json, else this validator's own repo root's
# models.json (so a fixture/target with no models.json of its own still gets
# checked against the program's real tier definitions, rather than silently
# skipping).
MODELS_JSON="${2:-}"
if [[ -z "$MODELS_JSON" ]]; then
  if [[ -f "$ROOT/models.json" ]]; then
    MODELS_JSON="$ROOT/models.json"
  else
    MODELS_JSON="$(dirname "${BASH_SOURCE[0]}")/../../models.json"
  fi
fi

if [[ ! -f "$MODELS_JSON" ]]; then
  note "no models.json tier registry found -- nothing to check"
  validator_exit; exit $?
fi

while IFS= read -r line; do
  case "$line" in
    *"[GAP]"*) gap "frontier-pin" "${line#*\[GAP\] }" ;;
    *"[WARN]"*) warn "${line#*\[WARN\] }" ;;
  esac
done < <(node "$LIB" scan "$ROOT" "$MODELS_JSON" 2>&1)

note "scanned $ROOT for hardcoded model pins against $(basename "$MODELS_JSON")"
validator_exit
