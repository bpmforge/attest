#!/usr/bin/env bash
#
# _lib.sh -- shared utilities for validators
#
# Sourced by every validator in this directory. Provides:
#   - colored logging
#   - gap tracking
#   - JSON output helpers
#   - project-root detection
#
# Contract for validators that source this file:
#   - Call `validator_init "<name>"` at the top of main
#   - Call `gap "<category>" "<detail>"` for every gap found
#   - Call `validator_exit` at the end -- emits JSON to stdout, gap list to
#     stderr, and exits 0 (clean) / 1 (gaps) / 2 (validator error)
#
# Compatible with bash 3.2+ (macOS default) -- no associative arrays, no
# readarray, no <<< here-strings required.

set -euo pipefail

# -- colors (only if stderr is a tty) ---------------------------------------
if [[ -t 2 ]]; then
  _RED=$'\033[31m'
  _YELLOW=$'\033[33m'
  _GREEN=$'\033[32m'
  _CYAN=$'\033[36m'
  _BOLD=$'\033[1m'
  _RESET=$'\033[0m'
else
  _RED="" _YELLOW="" _GREEN="" _CYAN="" _BOLD="" _RESET=""
fi

# -- state ------------------------------------------------------------------
VALIDATOR_NAME=""
GAP_COUNT=0
GAP_FILE=""

# -- project root -----------------------------------------------------------
# Respect caller-provided PROJECT_ROOT; else use first positional arg; else pwd.
detect_project_root() {
  if [[ -n "${PROJECT_ROOT:-}" ]]; then
    printf '%s' "$PROJECT_ROOT"
  elif [[ -n "${1:-}" && -d "${1:-}" ]]; then
    (cd "$1" && pwd)
  else
    pwd
  fi
}

# -- validator lifecycle ----------------------------------------------------
validator_init() {
  VALIDATOR_NAME="$1"
  GAP_COUNT=0
  GAP_FILE="$(mktemp -t "validator.${VALIDATOR_NAME}.XXXXXX")"
  trap 'rm -f "$GAP_FILE"' EXIT
  printf '%s[%s]%s starting\n' "$_CYAN" "$VALIDATOR_NAME" "$_RESET" >&2
}

gap() {
  local category="$1"
  local detail="$2"
  GAP_COUNT=$((GAP_COUNT + 1))
  # Write as tab-separated so we can rebuild JSON later without needing jq
  printf '%s\t%s\n' "$category" "$detail" >> "$GAP_FILE"
  printf '  %s[x]%s %s: %s\n' "$_RED" "$_RESET" "$category" "$detail" >&2
}

note() {
  printf '  %s●%s %s\n' "$_CYAN" "$_RESET" "$1" >&2
}

pass() {
  printf '  %s[ok]%s %s\n' "$_GREEN" "$_RESET" "$1" >&2
}

warn() {
  printf '  %s!%s %s\n' "$_YELLOW" "$_RESET" "$1" >&2
}

fatal() {
  printf '%s[%s] FATAL:%s %s\n' "$_RED" "$VALIDATOR_NAME" "$_RESET" "$1" >&2
  exit 2
}

# -- emit JSON result + exit ------------------------------------------------
# Produces a compact JSON envelope on stdout -- no jq dependency.
validator_exit() {
  local exit_code=0
  [[ "$GAP_COUNT" -gt 0 ]] && exit_code=1

  # Build JSON by hand; escape embedded quotes in details.
  local gaps_json=""
  if [[ -s "$GAP_FILE" ]]; then
    while IFS=$'\t' read -r cat det; do
      det="${det//\\/\\\\}"
      det="${det//\"/\\\"}"
      if [[ -z "$gaps_json" ]]; then
        gaps_json="{\"category\":\"${cat}\",\"detail\":\"${det}\"}"
      else
        gaps_json="${gaps_json},{\"category\":\"${cat}\",\"detail\":\"${det}\"}"
      fi
    done < "$GAP_FILE"
  fi

  printf '{"validator":"%s","gaps":%d,"exit":%d,"items":[%s]}\n' \
    "$VALIDATOR_NAME" "$GAP_COUNT" "$exit_code" "$gaps_json"

  if [[ "$exit_code" -eq 0 ]]; then
    printf '%s[%s]%s clean -- 0 gaps\n' "$_GREEN" "$VALIDATOR_NAME" "$_RESET" >&2
  else
    printf '%s[%s]%s %d gap(s)\n' "$_RED" "$VALIDATOR_NAME" "$_RESET" "$GAP_COUNT" >&2
  fi

  # Telemetry (plan 4.12): one verdict row per validator run — counts only.
  # Lands in the audited project's docs/work/ ($ROOT when the validator set
  # one, else cwd). Disable with EXPERTS_TELEMETRY=0. Never break a gate.
  if [[ "${EXPERTS_TELEMETRY:-1}" != "0" ]]; then
    {
      local _tdir="${ROOT:-.}/docs/work"
      mkdir -p "$_tdir" &&
      printf '{"ts":"%s","source":"validator","validator":"%s","gaps":%d,"exit":%d}\n' \
        "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$VALIDATOR_NAME" "$GAP_COUNT" "$exit_code" \
        >> "$_tdir/telemetry.jsonl"
    } 2>/dev/null || true
  fi

  exit "$exit_code"
}

# -- misc helpers -----------------------------------------------------------

# file_exists_nonempty <path>  -- returns 0 if file exists and >0 bytes
file_exists_nonempty() {
  [[ -f "$1" && -s "$1" ]]
}

# line_count <path>  -- total line count
line_count() {
  if [[ -f "$1" ]]; then
    wc -l < "$1" | tr -d ' '
  else
    echo 0
  fi
}

# grep_count <pattern> <file>  -- count of matches; 0 if file missing
# Note: avoid $() because the pattern can legitimately contain backticks
# (e.g. matching markdown code fences). Command substitution would try to
# re-evaluate them as nested command expansions. Use a temp file instead.
grep_count() {
  local pattern="$1" file="$2"
  [[ -f "$file" ]] || { echo 0; return; }
  local tmp
  tmp=$(mktemp)
  grep -cE "$pattern" "$file" > "$tmp" 2>/dev/null || echo 0 > "$tmp"
  local c
  read -r c < "$tmp"
  rm -f "$tmp"
  echo "${c:-0}"
}

# has_placeholder <file>  -- exits 0 if file contains PLACEHOLDER / TODO / XXX markers
has_placeholder() {
  [[ -f "$1" ]] || return 1
  grep -qE '\b(PLACEHOLDER|\[TODO\]|\[TBD\]|XXX-FIXME|\[FILL-IN\])\b' "$1"
}

# find_files <root> <pattern>  -- find files matching glob pattern, print list
# (escaped so caller can wrap in $() without word-splitting paths with spaces)
find_files() {
  local root="$1" pattern="$2"
  find "$root" -type f -name "$pattern" 2>/dev/null || true
}

# -- gate receipts (T27.1) ---------------------------------------------------
# A receipt records what actually ran (validator names, exit codes, gap
# counts, an input-tree hash), not just that "something" ran — it raises the
# bar from a bare timestamp file to content that's checked against reality
# (stale docs, a validator set that's grown since). It is NOT cryptographic
# tamper-evidence: the hash algorithm is public and unsalted, so anyone with
# filesystem write access (exactly who this gate polices — an agent running
# in this repo) can hand-craft a "real"-mode receipt that passes every check,
# same as they could always `touch` the old lock file. Independent review
# (2026-07-07) confirmed this by forging one. That's an accepted tradeoff for
# a single-operator local-tooling context (M27's own stated non-goal: "not
# preventing a hostile agent, the threat model is a sloppy/eager agent
# skipping steps") — this closes the SLOPPY-SKIP failure mode (an agent that
# forgets to run the gate, or the gate silently minting a pass from file
# existence), not a DETERMINED-FORGERY one. Cryptographic signing is real
# future scope if the threat model ever changes, not implied here.

# sha256_of_paths <root> <relpath> [relpath...]  -- stable combined hash of
# the given files' contents. A missing file hashes as its own literal
# "MISSING:<path>" marker so appearance/disappearance still changes the
# combined hash (not silently ignored). Sorted so argument order doesn't
# matter. Uses shasum (macOS/Linux built-in) — no external dependency.
sha256_of_paths() {
  local root="$1"
  shift
  local f full
  {
    for f in "$@"; do
      full="$root/$f"
      if [[ -f "$full" ]]; then
        printf '%s:' "$f"
        shasum -a 256 "$full" | awk '{print $1}'
      else
        printf '%s:MISSING\n' "$f"
      fi
    done
  } | sort | shasum -a 256 | awk '{print $1}'
}
