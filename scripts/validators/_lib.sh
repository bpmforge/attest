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

  printf '{"validator":"%s","gaps":%d,"exit":%d,"items":[%s]%s}\n' \
    "$VALIDATOR_NAME" "$GAP_COUNT" "$exit_code" "$gaps_json" "$VALIDATOR_EXTRA_JSON"
  [[ -n "$VALIDATOR_CHANGED_FILE" ]] && rm -f "$VALIDATOR_CHANGED_FILE"

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

# -- API contract mode -------------------------------------------------------
# api_contract_mode <root>  -- prints which machine-readable API contract the
# project is held to. Shared by validate-api-coverage.sh and the phase-3 file
# check in validate-phase-gate.sh so the two can never disagree.
#   openapi      docs/api/openapi.yaml exists, OR the JSON-Schema conditions
#                below are not all met (openapi.yaml is then required).
#   json-schema  no openapi.yaml AND docs/API_DESIGN.md exists AND
#                docs/api/schemas/ holds >= 1 *.json AND docs/DESIGN_CONTEXT.md
#                or docs/API_DESIGN.md declares the adaptation with a line
#                matching "no HTTP API" or "JSON Schema contract(s)"
#                (case-insensitive). For systems without an HTTP API: MCP
#                servers, native messaging hosts, CLIs, IPC protocols.
api_contract_mode() {
  local root="$1" f decl=0
  if [[ -s "$root/docs/api/openapi.yaml" ]]; then
    printf 'openapi'; return 0
  fi
  if [[ -s "$root/docs/API_DESIGN.md" && -d "$root/docs/api/schemas" ]] \
     && [[ -n "$(find "$root/docs/api/schemas" -type f -name '*.json' -print -quit 2>/dev/null)" ]]; then
    for f in "$root/docs/DESIGN_CONTEXT.md" "$root/docs/API_DESIGN.md"; do
      if [[ -f "$f" ]] && grep -qiE 'no HTTP API|JSON[- ]Schema contracts?' "$f"; then
        decl=1; break
      fi
    done
    if [[ "$decl" -eq 1 ]]; then
      printf 'json-schema'; return 0
    fi
  fi
  printf 'openapi'
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

# -- incremental scan + result cache (M-A6 / WP-A6) --------------------------
# Common flags, opt-in per validator:
#   --since <ref>   (or VALIDATE_SINCE=<ref>)  per-file validators walk only
#                   files changed since <ref> (merge-base semantics, plus the
#                   dirty + untracked working tree). No flag = whole tree.
#   --no-cache      (or VALIDATE_NO_CACHE=1)   bypass the whole-tree result cache.
#
# Usage at the top of a validator (before validator_init):
#   validator_parse_flags "$@"; set -- ${VALIDATOR_ARGS[@]+"${VALIDATOR_ARGS[@]}"}
#   ROOT="$(detect_project_root "${1:-}")"
#   validator_cache_run "${BASH_SOURCE[0]}" [extra-key-part...]     # whole-tree only
#   validator_init "name"
#   validator_scope_init                                            # per-file only
VALIDATE_SINCE="${VALIDATE_SINCE:-}"
VALIDATE_NO_CACHE="${VALIDATE_NO_CACHE:-}"
VALIDATOR_ARGS=()
VALIDATOR_ORIG_ARGS=()
VALIDATOR_SCOPED=0
VALIDATOR_CHANGED_FILE=""
VALIDATOR_EXTRA_JSON=""

validator_parse_flags() {
  VALIDATOR_ORIG_ARGS=()
  VALIDATOR_ARGS=()
  [[ $# -gt 0 ]] && VALIDATOR_ORIG_ARGS=("$@")
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --since)    VALIDATE_SINCE="${2:-}"; shift; [[ $# -gt 0 ]] && shift ;;
      --since=*)  VALIDATE_SINCE="${1#--since=}"; shift ;;
      --no-cache) VALIDATE_NO_CACHE=1; shift ;;
      *)          VALIDATOR_ARGS+=("$1"); shift ;;
    esac
  done
  return 0
}

_v_sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 | awk '{print $1}'
  else sha256sum | awk '{print $1}'; fi
}

# Generated outputs that validators themselves write; they must never count as
# "dirty inputs" or the second run would always miss.
_v_dirty_exclude='^(docs/work/\.validator-cache/|docs/work/telemetry\.jsonl$|docs/work/COVERAGE_LOOP_|docs/work/gates/|docs/reviews/RUNTIME_|node_modules(/|$)|\.git/)'

# _v_dirty_files -- tracked-modified + untracked paths relative to $ROOT, sorted.
_v_dirty_files() {
  local root="${ROOT:-.}"
  {
    git -C "$root" diff --name-only --relative HEAD 2>/dev/null || true
    git -C "$root" ls-files --others --exclude-standard 2>/dev/null || true
  } | grep -vE "$_v_dirty_exclude" | sort -u || true
}

# validator_changed_files [--since <ref>]
# Prints changed + dirty files (relative to $ROOT), one per line.
# Return 0 = scoped (output may legitimately be EMPTY: nothing changed);
# return 3 = no scope (no ref given, not a git repo, or ref unresolvable) --
# callers treat that as "all files".
validator_changed_files() {
  local ref="${VALIDATE_SINCE:-}" root="${ROOT:-.}"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --since) ref="${2:-}"; shift; [[ $# -gt 0 ]] && shift ;;
      *) shift ;;
    esac
  done
  [[ -z "$ref" ]] && return 3
  if ! git -C "$root" rev-parse --verify --quiet "${ref}^{commit}" >/dev/null 2>&1; then
    warn "--since ref '${ref}' does not resolve -- scanning ALL files" 2>/dev/null || true
    return 3
  fi
  {
    git -C "$root" diff --name-only --relative --diff-filter=ACMR "${ref}...HEAD" 2>/dev/null || true
    git -C "$root" diff --name-only --relative --diff-filter=ACMR HEAD 2>/dev/null || true
    git -C "$root" ls-files --others --exclude-standard 2>/dev/null || true
  } | grep -vE "$_v_dirty_exclude" | sort -u || true
  return 0
}

# validator_scope_init -- sets VALIDATOR_SCOPED=1 and VALIDATOR_CHANGED_FILE when
# a usable --since/VALIDATE_SINCE is in effect.
validator_scope_init() {
  VALIDATOR_SCOPED=0
  [[ -z "${VALIDATE_SINCE:-}" ]] && return 0
  local tmp rc=0
  tmp="$(mktemp -t "validator.changed.XXXXXX")"
  validator_changed_files > "$tmp" || rc=$?
  if [[ $rc -eq 0 ]]; then
    VALIDATOR_SCOPED=1
    VALIDATOR_CHANGED_FILE="$tmp"
    note "scoped to $(wc -l < "$tmp" | tr -d ' ') file(s) changed since ${VALIDATE_SINCE}"
  else
    rm -f "$tmp"
  fi
  return 0
}

# validator_filter_scope -- stdin: file paths (absolute or $ROOT-relative);
# stdout: only those in the changed set (everything when not scoped).
validator_filter_scope() {
  if [[ "$VALIDATOR_SCOPED" -ne 1 ]]; then cat; return 0; fi
  [[ -s "$VALIDATOR_CHANGED_FILE" ]] || { cat >/dev/null; return 0; }
  awk -v root="${ROOT:-.}/" 'NR==FNR{c[$0]=1;next}
    {p=$0; if(index(p,root)==1)p=substr(p,length(root)+1); sub(/^\.\//,"",p); if(p in c)print $0}' \
    "$VALIDATOR_CHANGED_FILE" -
}

# validator_scope_json -- fills VALIDATOR_EXTRA_JSON with a "scope" object that
# validator_exit appends to the envelope. Args: the files actually examined.
validator_scope_json() {
  local f list="" esc
  for f in "$@"; do
    esc="${f//\\/\\\\}"; esc="${esc//\"/\\\"}"
    list="${list:+$list,}\"$esc\""
  done
  VALIDATOR_EXTRA_JSON=",\"scope\":{\"since\":\"${VALIDATE_SINCE}\",\"files\":[${list}]}"
}

validator_cache_dir() { printf '%s/docs/work/.validator-cache' "${ROOT:-.}"; }

# validator_cache_key <extra...> -- sha256 of HEAD^{tree} + every dirty file's
# hash + this validator script + _lib.sh + args. Non-zero when $ROOT is not a
# git work tree (callers then skip caching).
validator_cache_key() {
  local root="${ROOT:-.}" script="${VALIDATOR_SCRIPT:-${BASH_SOURCE[1]:-}}" tree f
  # Only cache when $ROOT is itself a git work-tree top level: a fixture dir
  # nested inside some outer repo must neither share that repo's tree hash nor
  # get a cache dir written into it.
  [[ "$(git -C "$root" rev-parse --show-toplevel 2>/dev/null)" == "$(cd "$root" 2>/dev/null && pwd -P)" ]] || return 1
  tree="$(git -C "$root" rev-parse 'HEAD^{tree}' 2>/dev/null || echo none)"
  {
    printf 'tree:%s\n' "$tree"
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      if [[ -f "$root/$f" && ! -L "$root/$f" ]]; then
        printf 'dirty:%s:%s\n' "$f" "$(_v_sha256 < "$root/$f")"
      else
        printf 'dirty:%s:NONFILE\n' "$f"
      fi
    done < <(_v_dirty_files)
    [[ -f "$script" ]] && printf 'script:%s\n' "$(_v_sha256 < "$script")"
    printf 'lib:%s\n' "$(_v_sha256 < "${BASH_SOURCE[0]}")"
    printf 'args:%s\n' "$*"
  } | _v_sha256
}

# validator_cached_result <key> -- on a hit prints the stored JSON/stdout, sets
# VALIDATOR_CACHED_EXIT, returns 0. Miss: returns 1.
VALIDATOR_CACHED_EXIT=0
validator_cached_result() {
  local f; f="$(validator_cache_dir)/$1.out"
  [[ -f "$f" ]] || return 1
  VALIDATOR_CACHED_EXIT="$(head -n 1 "$f")"
  tail -n +2 "$f"
  return 0
}

# validator_store_result <key> <exit> <json>
validator_store_result() {
  local d tmp; d="$(validator_cache_dir)"
  mkdir -p "$d" 2>/dev/null || return 0
  tmp="$d/.tmp.$$"
  { printf '%s\n' "$2"; printf '%s\n' "$3"; } > "$tmp" 2>/dev/null && mv "$tmp" "$d/$1.out" 2>/dev/null || rm -f "$tmp"
  find "$d" -name '*.out' -mtime +14 -delete 2>/dev/null || true
  return 0
}

# validator_cache_run <script> [extra-key-part...]
# Whole-tree wrapper. Hit: replay stored stdout + exit code, note
# `cached: true (key ...)` on stderr, exit. Miss: re-run the script once (inner
# mode, same args), print its stdout, store {exit, stdout}, exit with its code.
# Returns 0 immediately (caller runs normally) when bypassed or not in git.
validator_cache_run() {
  local script="$1" key out rc=0 stored
  shift
  [[ "${VALIDATOR_CACHE_INNER:-}" == "1" ]] && return 0
  [[ -n "${VALIDATE_NO_CACHE:-}" && "${VALIDATE_NO_CACHE}" != "0" ]] && return 0
  key="$(VALIDATOR_SCRIPT="$script" validator_cache_key "$@")" || return 0
  if stored="$(validator_cached_result "$key")"; then
    printf 'cached: true (key %s)\n' "${key:0:16}" >&2
    printf '%s\n' "$stored"
    exit "$(head -n 1 "$(validator_cache_dir)/$key.out")"
  fi
  out="$(VALIDATOR_CACHE_INNER=1 bash "$script" ${VALIDATOR_ORIG_ARGS[@]+"${VALIDATOR_ORIG_ARGS[@]}"})" || rc=$?
  printf '%s\n' "$out"
  [[ "$rc" -le 1 ]] && validator_store_result "$key" "$rc" "$out"
  exit "$rc"
}
