#!/usr/bin/env bash
#
# validate-autonomy-ledger.sh -- APPROVALS.md rows are well-formed and every
# NEVER-AUTO row is human-signed (T27.5).
#
# validate-autonomy-wiring.sh checks prose (every by-design pause references
# the autonomy protocol). This validator checks the OTHER side: the ledger
# that a real auto-mode run actually produces. It verifies:
#   1. every docs/work/APPROVALS.md row is well-formed (timestamp,
#      pause_site_id, default_taken, signed_by all present)
#   2. every pause_site_id is a real id from AUTONOMY_PROTOCOL.md's G-*/NA-*
#      tables, not a typo or an invented one
#   3. NEVER-AUTO tripwire: any row whose id is NA-* must be signed by an
#      actual human (waive-gate.sh's exact blocklist + normalization) --
#      NEVER-AUTO sites always pause, so if one made it into the ledger at
#      all, "auto" or an agent's own name in signed_by means it was
#      auto-defaulted or self-signed instead of genuinely reviewed.
#
# Non-goals (see AUTONOMY_PROTOCOL.md "Ledger verification"): this checks the
# ledger a session wrote about itself. It cannot prove a NEVER-AUTO action
# happened and was never logged at all -- there is no independent run-journal
# in this repo today. That residual gap is M28 (Conductor) scope, not this
# validator's. It also, like waive-gate.sh's blocklist, is a deterrent
# against a sloppy/eager agent self-signing or auto-defaulting a NEVER-AUTO
# row -- not a security boundary against a determined adversary: a
# fabricated human-sounding name in signed_by (anything not on the blocklist)
# passes cleanly, same as waive-gate.sh's own stated non-goal.
#
# Usage: validate-autonomy-ledger.sh [project-root]
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-autonomy-ledger"

ROOT="$(detect_project_root "${1:-}")"
APPROVALS="$ROOT/docs/work/APPROVALS.md"

if [[ ! -f "$APPROVALS" ]]; then
  note "no docs/work/APPROVALS.md at $ROOT -- nothing to check (interactive-only project, or auto mode never ran)"
  validator_exit
fi

# -- known pause-site ids, cross-referenced from AUTONOMY_PROTOCOL.md -------
PROTOCOL="$ROOT/agents/shared/AUTONOMY_PROTOCOL.md"
KNOWN_IDS=""
if [[ -f "$PROTOCOL" ]]; then
  KNOWN_IDS="$(grep -oE '\| (G-[0-9]+|NA-[0-9]+) \|' "$PROTOCOL" | tr -d '| ' | sort -u || true)"
fi
if [[ -z "$KNOWN_IDS" ]]; then
  warn "AUTONOMY_PROTOCOL.md not found (or no ids) at $ROOT -- skipping pause_site_id cross-reference"
fi

is_known_id() {
  local id="$1"
  [[ -z "$KNOWN_IDS" ]] && return 0
  printf '%s\n' "$KNOWN_IDS" | grep -qxF "$id"
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

row_count=0
while IFS= read -r row; do
  [[ "$row" == *"|"* ]] || continue
  # skip separator rows (|---|---|...)
  [[ "$row" =~ ^[[:space:]]*\|[-:] ]] && continue
  # skip header row
  row_lower="$(printf '%s' "$row" | tr '[:upper:]' '[:lower:]')"
  case "$row_lower" in
    *pause_site_id*) continue ;;
  esac

  IFS='|' read -ra cells <<< "$row"
  # A well-formed row splits into 5 cells (leading blank + the 4 required
  # columns) or 6 (+ the optional description column). Anything else means a
  # literal '|' leaked into a free-text column and shifted every cell after
  # it -- e.g. a NEVER-AUTO row's real signed_by could shift into the
  # description column while an earlier cell's stray text lands in
  # signed_by, silently defeating the tripwire below (found by independent
  # review). Reject instead of guessing which shift happened.
  if [[ "${#cells[@]}" -lt 5 || "${#cells[@]}" -gt 6 ]]; then
    gap "malformed-row" "APPROVALS.md row has ${#cells[@]} cell(s) after splitting on '|' (expected 5 or 6) -- a literal '|' inside a free-text column shifts every column after it: ${row}"
    continue
  fi
  ts="$(trim "${cells[1]:-}")"
  site="$(trim "${cells[2]:-}")"
  default_taken="$(trim "${cells[3]:-}")"
  signed_by="$(trim "${cells[4]:-}")"

  if [[ -z "$ts" || -z "$site" || -z "$default_taken" || -z "$signed_by" ]]; then
    gap "malformed-row" "APPROVALS.md row missing a required column (timestamp/pause_site_id/default_taken/signed_by): ${row}"
    continue
  fi

  row_count=$((row_count + 1))

  if ! is_known_id "$site"; then
    gap "unknown-pause-site" "APPROVALS.md row references pause_site_id '${site}', not found in AUTONOMY_PROTOCOL.md's G-*/NA-* tables -- typo, or the protocol's ids drifted"
    continue
  fi

  case "$site" in
    NA-*)
      signed_norm="$(printf '%s' "$signed_by" | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
      case "$signed_norm" in
        "" | auto | agent | claude | ai | assistant | system | bot | llm | gpt | model | opencode)
          gap "never-auto-not-signed" "APPROVALS.md row for NEVER-AUTO site '${site}' has signed_by='${signed_by}' -- NEVER-AUTO actions must be signed by an actual human, not auto-defaulted or agent-signed [${default_taken}]"
          ;;
      esac
      ;;
  esac
done < "$APPROVALS"

note "checked ${row_count} APPROVALS.md row(s)"
validator_exit
