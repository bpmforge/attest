#!/usr/bin/env bash
#
# waive-gate.sh -- explicit, human-signed waiver for a phase gate (T27.1).
#
# The ONLY way to make a phase gate "pass" without a real
# validate-phase-gate.sh run actually completing clean. Writes a receipt with
# mode "waiver" -- check_phase_prereq() in validate-phase-gate.sh accepts it,
# but only if --signed-by names an actual person (not "agent"/"claude"/"ai"/
# "system"/"bot"/"llm" etc).
#
# This exists so existing-project adoption (a phase's docs predate this
# tooling, or a phase genuinely doesn't apply) has a real path forward that
# ISN'T silent retroactive minting -- detect-sdlc-state.sh used to create
# fake "passed" locks just because a phase's files existed; that was the
# exact mechanism behind the 2026-07-07 ticket-hygiene incident. A waiver is
# the opposite of that: a distinct, visible, deliberately-named action that
# shows up in shell history and this script's own stderr banner, not
# something that happens as a side effect of routine scanning.
#
# Usage:
#   scripts/waive-gate.sh <phase> "<reason>" --signed-by <name> [project-root]
#
# Example:
#   scripts/waive-gate.sh phase-2 "requirements docs predate SDLC tooling adoption, reconstructed from git history" --signed-by user

set -euo pipefail

PHASE="${1:-}"
REASON="${2:-}"
SIGNED_BY=""
PROJECT_ROOT_ARG=""

shift 2 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --signed-by)
      SIGNED_BY="${2:-}"
      shift 2
      ;;
    *)
      PROJECT_ROOT_ARG="$1"
      shift
      ;;
  esac
done

if [[ -z "$PHASE" || -z "$REASON" ]]; then
  echo "Usage: waive-gate.sh <phase> \"<reason>\" --signed-by <name> [project-root]" >&2
  exit 2
fi

# Independent review (2026-07-07) found the original case-sensitive blocklist
# trivially bypassed by casing alone (AGENT/CLAUDE/aGeNt all slipped through,
# same for leading/trailing whitespace) — confirmed live, not theoretical.
# Normalize (trim + lowercase, POSIX tr/sed — bash 3.2 has no ${var,,}) before
# matching. This is a deterrent against a sloppy/eager agent signing its own
# waiver by accident (this program's actual threat model — see M27's stated
# non-goal: "not preventing a hostile agent"), not a security boundary against
# a determined adversary who could always invent an unlisted name; a
# comprehensive "is this really human" check is a different, harder problem.
SIGNED_BY_NORM="$(printf '%s' "$SIGNED_BY" | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
case "$SIGNED_BY_NORM" in
  "" | agent | claude | ai | assistant | system | bot | llm | gpt | model | opencode)
    echo "ERROR: --signed-by must name an actual person, not \"${SIGNED_BY:-<empty>}\". Waivers must be explicitly signed by a human." >&2
    exit 2
    ;;
esac

if [[ ${#REASON} -lt 10 ]]; then
  echo "ERROR: reason is too short (${#REASON} chars) — explain why this phase's gate is being waived, not just restated." >&2
  exit 2
fi

if [[ -n "$PROJECT_ROOT_ARG" && -d "$PROJECT_ROOT_ARG" ]]; then
  ROOT="$(cd "$PROJECT_ROOT_ARG" && pwd)"
else
  ROOT="${PROJECT_ROOT:-$(pwd)}"
fi

GATES_DIR="$ROOT/docs/work/gates"
mkdir -p "$GATES_DIR"
RECEIPT_FILE="$GATES_DIR/${PHASE}-receipt.json"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Escape embedded quotes/backslashes in the reason for safe JSON embedding.
ESCAPED_REASON="${REASON//\\/\\\\}"
ESCAPED_REASON="${ESCAPED_REASON//\"/\\\"}"

printf '{"phase":"%s","timestamp":"%s","mode":"waiver","signedBy":"%s","reason":"%s"}\n' \
  "$PHASE" "$TIMESTAMP" "$SIGNED_BY" "$ESCAPED_REASON" \
  > "$RECEIPT_FILE"

printf '\033[1;33m⚠ WAIVER\033[0m %s gate waived by %s: %s\n' "$PHASE" "$SIGNED_BY" "$REASON" >&2
printf '  Receipt: %s\n' "$RECEIPT_FILE" >&2
printf '  This bypasses real gate verification for this phase — visible in the receipt and in git history if committed.\n' >&2
