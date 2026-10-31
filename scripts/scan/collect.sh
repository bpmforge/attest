#!/usr/bin/env bash
#
# collect.sh — run every DETERMINISTIC scanner once and emit one JSON file.
#
# TOKEN_OPTIMIZATION_PLAN item B3. The security and code-health coordinators
# used to dispatch one LLM micro-agent per CLI tool — semgrep-runner,
# secrets-scanner, dependency-auditor, dead-code-detector, duplication-detector,
# complexity-analyzer — each a session with a ~35k-token baseline whose actual
# work was "invoke the tool, reformat its output". Six sessions, every audit.
#
# This script does that part with no model at all. The judgement work (OWASP
# web/LLM checks, threat/attack chaining, error-handling and type-safety
# review, synthesis) stays with the model specialists, which now READ this
# file instead of re-running the tools (see security-auditor.md and
# code-reviewer.md dispatch tables, and integration-review.mjs).
#
# Every tool is optional: a missing one is recorded as {"status":"skipped"}
# with the install hint, never a failure. `--base`/`--head` restrict semgrep,
# secrets and complexity to the files changed in that range (the
# per-ticket / per-branch use); without them the whole tree is scanned.
#
# INCREMENTAL MODE (INCREMENTAL_SCAN_PLAN.md WP-A1). Without --base/--head the
# script keeps a ledger (default docs/work/scan/ledger.json, git-ignored) with
# one entry per scanner: {head_sha, tree_hash, tool_version, rules_hash, json,
# scope, date, increments, base_full_sha}. On the next run, per scanner:
#   semgrep / secrets / complexity  (file-level)
#     diff  = files from `git diff --name-only --diff-filter=ACMRD <ledger_sha> HEAD`
#             plus dirty/untracked files (now and at the last run). Only those files
#             are scanned; prior findings for changed-or-deleted paths are dropped,
#             prior findings for every other path are carried forward, new findings
#             are appended. meta.scope="incremental".
#     full  = whole tree, when any of: no ledger entry, tool_version or rules_hash
#             changed (rules_hash = .semgrep/** + $RULEPACKS_DIR content), ledger sha
#             is not an ancestor of HEAD, prior JSON missing, diff > SCAN_DIFF_CAP
#             (default 400), this would be the SCAN_MAX_INCREMENTAL-th (default 20)
#             chained increment (drift guard), trufflehog/radon installed (those
#             always scan the whole tree), or --full / --mode full.
#   deps      skipped as status "cached" (prior findings copied) when the lockfile
#             hash (package-lock.json, pnpm-lock.yaml, yarn.lock, poetry.lock,
#             Cargo.lock, go.sum, requirements*.txt; manifests if no lockfile) is
#             unchanged. Note: new advisories on an unchanged lockfile are only seen
#             by a --full run.
#   deadcode / dup  whole-tree properties: skipped as "cached" only when
#             `git rev-parse HEAD^{tree}` equals the ledger AND the working tree is
#             clean; otherwise run in full.
# Range mode (--base/--head) is unchanged and never reads or writes the ledger.
# The ledger is updated after every successful non-range run.
#
# Usage:
#   scripts/scan/collect.sh --root <project> [--base <ref> --head <ref>] [--out <file.json>]
#                           [--only semgrep,secrets,deps,deadcode,dup,complexity]
#                           [--mode auto|full|diff] [--full] [--ledger <file.json>]
#                           [--expand-importers on|off]
#   --mode auto   (default) diff when safe, else full, per scanner (see above)
#   --mode full   run everything over the whole tree, no caching
#   --mode diff   like auto but ignores the cap and the increment counter; still
#                 falls back to full when no valid ledger entry exists
#   --full        alias for --mode full
#   --ledger F    ledger path (default docs/work/scan/ledger.json, relative to --root)
#   --expand-importers on|off   scan changed files' importers too (INCREMENTAL_SCAN_PLAN
#                 D2). Accepted, default off; "on" is currently a documented NO-OP
#                 (recorded as meta.expand_importers="requested-noop").
# Env: SCAN_DIFF_CAP (400), SCAN_MAX_INCREMENTAL (20).
# Output: the JSON path on stdout (default docs/work/scan/scan_<date>.json), exit 0
#         unless the script itself cannot run (exit 2). Findings never change the exit code —
#         the caller decides what blocks. stderr gets one totals line:
#         `scope=incremental base=<sha7> changed=<n> semgrep=.. secrets=..` (scope=tree / scope=range otherwise).

set -uo pipefail

ROOT="."; BASE=""; HEAD=""; OUT=""; ONLY=""; MODE="auto"; FULL_FLAG=0; LEDGER=""; EXPAND="off"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --head) HEAD="$2"; shift 2 ;;
    --out)  OUT="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    --mode) MODE="${2:-}"; shift 2 ;;
    --full) FULL_FLAG=1; shift ;;
    --ledger) LEDGER="$2"; shift 2 ;;
    --expand-importers)
      if [[ "${2:-}" == "on" || "${2:-}" == "off" ]]; then EXPAND="$2"; shift 2; else EXPAND="on"; shift; fi ;;
    -h|--help) sed -n '2,/^set -uo pipefail/p' "$0" | sed '$d'; exit 0 ;;
    *) echo "collect.sh: unknown arg $1" >&2; exit 2 ;;
  esac
done
case "$MODE" in auto|full|diff) ;; *) echo "collect.sh: --mode must be auto|full|diff" >&2; exit 2 ;; esac
[[ "$FULL_FLAG" -eq 1 ]] && MODE="full"
ROOT="$(cd "$ROOT" 2>/dev/null && pwd)" || { echo "collect.sh: bad --root" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "collect.sh: jq is required" >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "collect.sh: node is required" >&2; exit 2; }
cd "$ROOT" || exit 2

DATE="$(date -u +%Y-%m-%d)"
[[ -n "$OUT" ]] || OUT="docs/work/scan/scan_${DATE}.json"
mkdir -p "$(dirname "$OUT")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

want() { [[ -z "$ONLY" ]] || [[ ",$ONLY," == *",$1,"* ]]; }

# Changed-file list (range mode) or empty (whole tree / ledger-driven, resolved per scanner below).
FILES_LIST="$TMP/files.txt"
if [[ -n "$BASE" && -n "$HEAD" ]]; then
  git diff --name-only --diff-filter=ACMR "$BASE...$HEAD" 2>/dev/null > "$FILES_LIST" || : > "$FILES_LIST"
  SCOPE="range"
else
  : > "$FILES_LIST"; SCOPE="tree"
fi

# ---- incremental plumbing (ledger, hashes, per-scanner resolution) ----------
DIFF_CAP="${SCAN_DIFF_CAP:-400}"; MAX_INC="${SCAN_MAX_INCREMENTAL:-20}"
relpath() { case "$1" in "$ROOT"/*) printf '%s' "${1#"$ROOT"/}" ;; *) printf '%s' "$1" ;; esac; }
[[ -n "$LEDGER" ]] || LEDGER="docs/work/scan/ledger.json"
OUT_REL="$(relpath "$OUT")"; LEDGER_REL="$(relpath "$LEDGER")"
HEAD_FULL="$(git rev-parse HEAD 2>/dev/null || true)"
# Paths from git are repo-root relative: only trust the ledger when --root IS the repo root.
[[ -z "$(git rev-parse --show-prefix 2>/dev/null)" ]] || HEAD_FULL=""
TREE_HASH=""; [[ -n "$HEAD_FULL" ]] && TREE_HASH="$(git rev-parse 'HEAD^{tree}' 2>/dev/null || true)"

sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }
ver() { timeout 20 "$@" --version 2>&1 | head -n1 | tr -d '\r'; }

# Dirty + untracked paths (scan output and the ledger itself excluded).
DIRTY="$TMP/dirty.txt"; : > "$DIRTY"
if [[ -n "$HEAD_FULL" ]]; then
  {
    skip=0
    git status --porcelain -z -uall 2>/dev/null | while IFS= read -r -d '' rec; do
      if [[ $skip -eq 1 ]]; then printf '%s\n' "$rec"; skip=0; continue; fi
      st="${rec:0:2}"; printf '%s\n' "${rec:3}"
      [[ "$st" == *R* || "$st" == *C* ]] && skip=1
    done
  } | grep -v '^docs/work/scan/' | grep -vxF -e "$OUT_REL" -e "$LEDGER_REL" | LC_ALL=C sort -u > "$DIRTY" || true
fi

rules_hash_semgrep() {
  { for d in .semgrep "${RULEPACKS_DIR:-}"; do
      [[ -n "$d" && -d "$d" ]] || continue
      find "$d" -type f -not -path '*/.git/*' | LC_ALL=C sort | while IFS= read -r f; do printf '%s %s\n' "$f" "$(sha < "$f")"; done
    done; printf 'cfg:auto\n'; } | sha
}
lock_hash() {
  local f any=0; local list=()
  for f in package-lock.json pnpm-lock.yaml yarn.lock poetry.lock Cargo.lock go.sum requirements*.txt; do [[ -f "$f" ]] && list+=("$f"); done
  if [[ ${#list[@]} -eq 0 ]]; then
    for f in package.json pyproject.toml Cargo.toml go.mod; do [[ -f "$f" ]] && list+=("$f"); done
  fi
  [[ ${#list[@]} -gt 0 ]] || { printf ''; return; }
  for f in "${list[@]}"; do printf '%s %s\n' "$f" "$(sha < "$f")"; done | sha
}

# Secrets grep battery (values are never copied into the JSON, only path:line and the pattern name).
PATTERNS=(
  'aws-access-key|AKIA[0-9A-Z]{16}'
  'private-key|BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY'
  'db-url-with-creds|(mongodb(\+srv)?|postgres(ql)?|mysql|redis|amqp)://[^:/ ]+:[^@/ ]+@'
  'github-token|ghp_[A-Za-z0-9]{36}'
  'openai-key|sk-[A-Za-z0-9]{48}'
  'slack-token|xox[bap]-[0-9]{10,}'
  'hardcoded-api-key|(api[_-]?key|apikey|api[_-]?secret)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9_-]{16,}["'"'"']'
  'hardcoded-password|(password|passwd|pwd)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{4,}["'"'"']'
)

# Tool identity (tool_version) and rule identity (rules_hash) per scanner, only for wanted scanners.
ENGINE=""; TRUFFLE=""
TV_semgrep=""; RH_semgrep=""; TV_secrets=""; RH_secrets=""; TV_complexity=""; RH_complexity=""
TV_deps="-"; RH_deps=""; TV_deadcode="none"; RH_deadcode=""; TV_dup="none"; RH_dup=""
if want semgrep; then
  command -v opengrep >/dev/null 2>&1 && ENGINE=opengrep; [[ -n "$ENGINE" ]] || { command -v semgrep >/dev/null 2>&1 && ENGINE=semgrep; }
  if [[ -n "$ENGINE" ]]; then TV_semgrep="$ENGINE $(ver "$ENGINE")"; RH_semgrep="$(rules_hash_semgrep)"; fi
fi
if want secrets; then
  command -v trufflehog >/dev/null 2>&1 && TRUFFLE=1
  if [[ -n "$TRUFFLE" ]]; then TV_secrets="trufflehog $(ver trufflehog)"; else TV_secrets="grep-battery"; fi
  RH_secrets="$(printf '%s\n' "${PATTERNS[@]}" | sha)"
fi
if want complexity; then
  if command -v lizard >/dev/null 2>&1; then TV_complexity="lizard $(ver lizard)"; RH_complexity="ccn15-nloc80"
  elif command -v radon >/dev/null 2>&1 && [[ -f pyproject.toml || -f requirements.txt ]]; then TV_complexity="radon $(ver radon)"; fi
fi
DEPS_KEY=""; want deps && DEPS_KEY="$(lock_hash)"
if want deadcode; then
  if [[ -f package.json ]] && (command -v knip >/dev/null 2>&1 || [[ -x node_modules/.bin/knip ]]); then
    K=knip; [[ -x node_modules/.bin/knip ]] && K=node_modules/.bin/knip; TV_deadcode="knip $(ver "$K")"
  elif { [[ -f pyproject.toml || -f requirements.txt ]]; } && command -v vulture >/dev/null 2>&1; then TV_deadcode="vulture $(ver vulture)"; fi
fi
if want dup; then
  if command -v jscpd >/dev/null 2>&1 || [[ -x node_modules/.bin/jscpd ]]; then
    J=jscpd; [[ -x node_modules/.bin/jscpd ]] && J=node_modules/.bin/jscpd; TV_dup="jscpd $(ver "$J")"
  fi
fi

LEDGER_OK=0
[[ -f "$LEDGER" ]] && jq -e 'type=="object"' "$LEDGER" >/dev/null 2>&1 && LEDGER_OK=1
led() { jq -r --arg s "$1" --arg k "$2" '.[$s][$k] // empty' "$LEDGER" 2>/dev/null; }
led_has() { [[ $LEDGER_OK -eq 1 ]] && [[ "$(jq -r --arg s "$1" '.[$s]|type' "$LEDGER" 2>/dev/null)" == "object" ]]; }
prior_ok() { # json-path scanner head_sha  -> 0 when that JSON still holds this scanner's result for that sha
  [[ -n "$1" && -f "$1" ]] && [[ "$(jq -r --arg s "$2" --arg a "$3" 'if ((.[$s].status=="ok" or .[$s].status=="cached") and .[$s].at_sha==$a) then "y" else "n" end' "$1" 2>/dev/null)" == "y" ]]
}

# Resolve one FILE-LEVEL scanner: sets R_MODE (tree|range|diff), R_REASON, R_BASE, R_INC and
# writes $TMP/changed_<s>.txt (+ $TMP/prior_<s>.json when diff).
resolve_fl() { # name tool_version rules_hash [force-tree-reason]
  local s="$1" tv="$2" rh="$3" force="${4:-}" lsha pj inc n
  R_MODE=tree; R_REASON=""; R_BASE="$HEAD_FULL"; R_INC=0
  : > "$TMP/changed_$s.txt"
  if [[ "$SCOPE" == "range" ]]; then R_MODE=range; R_REASON=range; cp "$FILES_LIST" "$TMP/changed_$s.txt"
  elif [[ "$MODE" == "full" ]]; then R_REASON=forced-full
  elif [[ -z "$HEAD_FULL" ]]; then R_REASON=no-git
  elif [[ -n "$force" ]]; then R_REASON="$force"
  elif ! led_has "$s"; then R_REASON=no-ledger
  else
    lsha="$(led "$s" head_sha)"; pj="$(led "$s" json)"
    if   [[ "$(led "$s" tool_version)" != "$tv" ]]; then R_REASON=tool-changed
    elif [[ "$(led "$s" rules_hash)" != "$rh" ]]; then R_REASON=rules-changed
    elif [[ -z "$lsha" ]] || ! git merge-base --is-ancestor "$lsha" HEAD 2>/dev/null; then R_REASON=not-ancestor
    elif ! prior_ok "$pj" "$s" "$lsha"; then R_REASON=prior-missing
    else
      inc="$(led "$s" increments)"; inc="${inc:-0}"
      if [[ "$MODE" == "auto" && $((inc+1)) -ge $MAX_INC ]]; then R_REASON=max-increments
      else
        { git -c core.quotepath=off diff -z --no-renames --name-only --diff-filter=ACMRD "$lsha" HEAD 2>/dev/null | tr '\0' '\n'
          cat "$DIRTY"
          jq -r --arg s "$s" '.[$s].dirty_files[]?' "$LEDGER" 2>/dev/null; } \
          | grep -v '^$' | grep -v '^docs/work/scan/' | LC_ALL=C sort -u > "$TMP/changed_$s.txt" || true
        n="$(wc -l < "$TMP/changed_$s.txt" | tr -d ' ')"
        if [[ "$MODE" == "auto" && "$n" -gt "$DIFF_CAP" ]]; then R_REASON=cap-exceeded; : > "$TMP/changed_$s.txt"
        else
          R_MODE=diff; R_REASON=diff; R_BASE="$(led "$s" base_full_sha)"; R_BASE="${R_BASE:-$lsha}"; R_INC=$((inc+1))
          cp "$pj" "$TMP/prior_$s.json"
        fi
      fi
    fi
  fi
  printf -v "RES_$s" '%s' "$R_MODE|$R_REASON"; printf -v "BASE_$s" '%s' "$R_BASE"; printf -v "INC_$s" '%s' "$R_INC"
}
load_existing() { # name -> EXISTING[] (changed paths that still exist)
  EXISTING=(); local f
  while IFS= read -r f; do [[ -n "$f" && -f "$f" ]] && EXISTING+=("$f"); done < "$TMP/changed_$1.txt"
  return 0
}
# Diff mode: fold the prior result into the new (changed-files-only) result.
merge_fl() { # name
  local s="$1" f="$TMP/$1.json"
  [[ "$R_MODE" == "diff" ]] || return 0
  [[ "$(jq -r .status "$f" 2>/dev/null)" == "ok" ]] || return 0
  jq --arg s "$s" --arg base "$R_BASE" --slurpfile p "$TMP/prior_$s.json" --rawfile ch "$TMP/changed_$s.txt" '
    ($ch | split("\n") | map(select(length>0)) | map({key:., value:true}) | from_entries) as $set
    | [($p[0][$s].findings // [])[] | select(($set[(.path // "") | ltrimstr("./")]) | not)] as $keep
    | .findings = ($keep + (.findings // []))
    | .scope = "incremental" | .carried_forward = ($keep | length)
    | .base_full_sha = $base | .changed = ($set | length)' "$f" > "$f.m" && mv "$f.m" "$f"
}
# Whole-tree scanner: reuse the prior result when its input hash is unchanged.
cache_hit() { # name input-key tool_version   (returns 0 and writes $TMP/<name>.json on a hit)
  local s="$1" key="$2" tv="$3" field=tree_hash lsha pj
  [[ "$s" == "deps" ]] && field=lockfile_hash
  printf -v "RES_$s" '%s' "tree|run"
  if [[ "$SCOPE" == "range" ]]; then printf -v "RES_$s" '%s' "range|range"; return 1; fi
  if [[ "$MODE" == "full" ]]; then printf -v "RES_$s" '%s' "tree|forced-full"; return 1; fi
  if [[ -z "$HEAD_FULL" || -z "$key" ]]; then printf -v "RES_$s" '%s' "tree|no-git"; return 1; fi
  if ! led_has "$s"; then printf -v "RES_$s" '%s' "tree|no-ledger"; return 1; fi
  [[ "$(led "$s" "$field")" == "$key" ]] || { printf -v "RES_$s" '%s' "tree|inputs-changed"; return 1; }
  [[ "$(led "$s" tool_version)" == "$tv" ]] || { printf -v "RES_$s" '%s' "tree|tool-changed"; return 1; }
  if [[ "$s" != "deps" && -s "$DIRTY" ]]; then printf -v "RES_$s" '%s' "tree|dirty-tree"; return 1; fi
  lsha="$(led "$s" head_sha)"; pj="$(led "$s" json)"
  prior_ok "$pj" "$s" "$lsha" || { printf -v "RES_$s" '%s' "tree|prior-missing"; return 1; }
  jq --arg s "$s" --arg d "$(led "$s" date)" '.[$s] | .status="cached" | .cached_from=(.cached_from // $d)' "$pj" > "$TMP/$s.json" || return 1
  printf -v "RES_$s" '%s' "cache|cached"
  return 0
}

if [[ "$EXPAND" == "on" ]]; then echo "collect.sh: --expand-importers on is accepted but not implemented yet (no-op)" >&2; fi

# Each scanner writes $TMP/<name>.json as {"status": "ok|skipped|error", ...}.
skipped() { jq -n --arg t "$1" --arg hint "$2" '{status:"skipped",tool:$t,install:$hint,findings:[]}' > "$TMP/$3.json"; }

# ---- semgrep / opengrep ------------------------------------------------------
if want semgrep; then
  if [[ -z "$ENGINE" ]]; then skipped semgrep "pipx install semgrep" semgrep
  else
    resolve_fl semgrep "$TV_semgrep" "$RH_semgrep"; SC="$R_MODE"; load_existing semgrep
    CFG=(--config auto); [[ -d .semgrep ]] && CFG+=(--config .semgrep)
    if [[ "$SC" != "tree" && ${#EXISTING[@]} -eq 0 ]]; then
      jq -n --arg sc "$SC" '{status:"ok",tool:"semgrep",scope:$sc,note:"no scannable changed files",findings:[]}' > "$TMP/semgrep.json"
    else
      TARGETS=(.); [[ "$SC" != "tree" ]] && TARGETS=("${EXISTING[@]}")
      timeout 900 "$ENGINE" scan "${CFG[@]}" --json --quiet --metrics=off "${TARGETS[@]}" > "$TMP/semgrep.raw" 2> "$TMP/semgrep.err" || true
      if jq -e . "$TMP/semgrep.raw" >/dev/null 2>&1; then
        jq --arg t "$ENGINE" --arg s "$SC" '{status:"ok",tool:$t,scope:$s,
          findings:[.results[]? | {rule:.check_id, severity:(.extra.severity//"UNKNOWN"), path:.path, line:.start.line,
                                   message:(.extra.message//""), cwe:(.extra.metadata.cwe//null), owasp:(.extra.metadata.owasp//null)}],
          errors:[.errors[]? | .message] }' "$TMP/semgrep.raw" > "$TMP/semgrep.json"
      else
        jq -n --arg t "$ENGINE" --arg e "$(tail -c 2000 "$TMP/semgrep.err")" '{status:"error",tool:$t,error:$e,findings:[]}' > "$TMP/semgrep.json"
      fi
    fi
    merge_fl semgrep
  fi
fi

# ---- secrets (trufflehog, else the same grep battery secrets-scanner.md used) ----
if want secrets; then
  FT=""; [[ -n "$TRUFFLE" ]] && FT="trufflehog-tree-only"
  resolve_fl secrets "$TV_secrets" "$RH_secrets" "$FT"; SC="$R_MODE"; load_existing secrets
  if [[ -n "$TRUFFLE" && "$SC" == "tree" ]]; then
    timeout 900 trufflehog filesystem . --json --no-update 2>/dev/null \
      | jq -s '{status:"ok",tool:"trufflehog",scope:"tree",
               findings:[.[] | {detector:.DetectorName, path:(.SourceMetadata.Data.Filesystem.file//""), line:(.SourceMetadata.Data.Filesystem.line//null), verified:.Verified}]}' \
      > "$TMP/secrets.json" 2>/dev/null || jq -n '{status:"error",tool:"trufflehog",findings:[]}' > "$TMP/secrets.json"
  else
    # grep battery (PATTERNS defined above) — values are never copied into the JSON.
    : > "$TMP/secrets.rows"
    if [[ "$SC" != "tree" ]]; then TARGETS=(${EXISTING[@]+"${EXISTING[@]}"}); else TARGETS=(.); fi
    if [[ ${#TARGETS[@]} -gt 0 ]]; then
      for p in "${PATTERNS[@]}"; do
        name="${p%%|*}"; re="${p#*|}"
        grep -rnHE --binary-files=without-match --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.venv \
             --exclude='*.lock' --exclude='*.min.js' --exclude='telemetry.jsonl' -- "$re" "${TARGETS[@]}" 2>/dev/null \
          | grep -vE 'process\.env|os\.environ|example|dummy|placeholder|\.md:' \
          | cut -d: -f1,2 | sed "s/^\.\///" | awk -v n="$name" -F: '{printf "{\"pattern\":\"%s\",\"path\":\"%s\",\"line\":%s}\n", n, $1, $2}' >> "$TMP/secrets.rows" || true
      done
    fi
    jq -s --arg s "$SC" '{status:"ok",tool:"grep-battery",scope:$s,findings:.}' "$TMP/secrets.rows" > "$TMP/secrets.json"
  fi
  merge_fl secrets
fi

# ---- dependency audit (stack-detected; same commands validate-deps.sh uses) ----
if want deps && ! cache_hit deps "$DEPS_KEY" "$TV_deps"; then
  if   [[ -f package.json ]]; then
    timeout 600 npm audit --audit-level=high --json > "$TMP/deps.raw" 2>/dev/null || true
    jq '{status:"ok",tool:"npm-audit",
         summary:(.metadata.vulnerabilities//{}),
         findings:[(.vulnerabilities//{})[]? | {name:.name, severity:.severity, range:.range, fixAvailable:(.fixAvailable!=false), via:[.via[]? | (if type=="object" then .title else . end)]}]}' \
      "$TMP/deps.raw" > "$TMP/deps.json" 2>/dev/null || jq -n '{status:"error",tool:"npm-audit",findings:[]}' > "$TMP/deps.json"
  elif [[ -f pyproject.toml || -f requirements.txt ]]; then
    if command -v pip-audit >/dev/null 2>&1; then
      timeout 600 pip-audit -f json > "$TMP/deps.raw" 2>/dev/null || true
      jq '{status:"ok",tool:"pip-audit",findings:[.dependencies[]? | select(.vulns|length>0) | {name:.name, version:.version, vulns:[.vulns[] | {id:.id, fix:.fix_versions}]}]}' \
        "$TMP/deps.raw" > "$TMP/deps.json" 2>/dev/null || jq -n '{status:"error",tool:"pip-audit",findings:[]}' > "$TMP/deps.json"
    else skipped pip-audit "pipx install pip-audit" deps; fi
  elif [[ -f Cargo.toml ]]; then
    if command -v cargo-audit >/dev/null 2>&1 || cargo audit --version >/dev/null 2>&1; then
      timeout 600 cargo audit --json > "$TMP/deps.raw" 2>/dev/null || true
      jq '{status:"ok",tool:"cargo-audit",findings:[.vulnerabilities.list[]? | {id:.advisory.id, package:.package.name, title:.advisory.title}]}' \
        "$TMP/deps.raw" > "$TMP/deps.json" 2>/dev/null || jq -n '{status:"error",tool:"cargo-audit",findings:[]}' > "$TMP/deps.json"
    else skipped cargo-audit "cargo install cargo-audit" deps; fi
  elif [[ -f go.mod ]]; then
    if command -v govulncheck >/dev/null 2>&1; then
      timeout 600 govulncheck -json ./... > "$TMP/deps.raw" 2>/dev/null || true
      jq -s '{status:"ok",tool:"govulncheck",findings:[.[] | select(.finding) | .finding | {osv:.osv, trace:(.trace[0].function//null)}]}' \
        "$TMP/deps.raw" > "$TMP/deps.json" 2>/dev/null || jq -n '{status:"error",tool:"govulncheck",findings:[]}' > "$TMP/deps.json"
    else skipped govulncheck "go install golang.org/x/vuln/cmd/govulncheck@latest" deps; fi
  else
    jq -n '{status:"skipped",tool:"deps",reason:"no recognised manifest",findings:[]}' > "$TMP/deps.json"
  fi
fi

# ---- dead code (knip for TS/JS, vulture for Python) -------------------------
if want deadcode && ! cache_hit deadcode "$TREE_HASH" "$TV_deadcode"; then
  if [[ -f package.json ]] && (command -v knip >/dev/null 2>&1 || [[ -x node_modules/.bin/knip ]]); then
    KNIP=knip; [[ -x node_modules/.bin/knip ]] && KNIP=node_modules/.bin/knip
    timeout 600 "$KNIP" --reporter json --no-progress > "$TMP/knip.raw" 2>/dev/null || true
    jq '{status:"ok",tool:"knip",
         findings:{files:(.files//[]), exports:[(.issues//[])[]? | {file:.file, exports:[.exports[]?.name], types:[.types[]?.name], unlisted:[.unlisted[]?.name]}]}}' \
      "$TMP/knip.raw" > "$TMP/deadcode.json" 2>/dev/null || jq -n '{status:"error",tool:"knip",findings:[]}' > "$TMP/deadcode.json"
  elif { [[ -f pyproject.toml || -f requirements.txt ]]; } && command -v vulture >/dev/null 2>&1; then
    timeout 600 vulture . --min-confidence 80 2>/dev/null | sed 's/^\.\///' \
      | awk -F: '{ $1=$1; printf "{\"path\":\"%s\",\"line\":%s,\"message\":\"%s\"}\n", $1, $2, substr($0, index($0,$3)) }' | jq -s '{status:"ok",tool:"vulture",findings:.}' > "$TMP/deadcode.json" 2>/dev/null \
      || jq -n '{status:"error",tool:"vulture",findings:[]}' > "$TMP/deadcode.json"
  else
    skipped "knip|vulture" "npm i -g knip  /  pipx install vulture" deadcode
  fi
fi

# ---- duplication (jscpd) -----------------------------------------------------
if want dup && ! cache_hit dup "$TREE_HASH" "$TV_dup"; then
  if command -v jscpd >/dev/null 2>&1 || [[ -x node_modules/.bin/jscpd ]]; then
    JSCPD=jscpd; [[ -x node_modules/.bin/jscpd ]] && JSCPD=node_modules/.bin/jscpd
    timeout 600 "$JSCPD" . --min-tokens 50 --reporters json --output "$TMP/jscpd" --silent \
      --ignore '**/node_modules/**,**/dist/**,**/.git/**,**/*.min.js,**/docs/**' >/dev/null 2>&1 || true
    if [[ -f "$TMP/jscpd/jscpd-report.json" ]]; then
      jq '{status:"ok",tool:"jscpd",summary:(.statistics.total//{}),
           findings:[.duplicates[]? | {lines:.lines, tokens:.tokens, a:{path:.firstFile.name,start:.firstFile.start}, b:{path:.secondFile.name,start:.secondFile.start}}]}' \
        "$TMP/jscpd/jscpd-report.json" > "$TMP/dup.json" 2>/dev/null || jq -n '{status:"error",tool:"jscpd",findings:[]}' > "$TMP/dup.json"
    else jq -n '{status:"error",tool:"jscpd",error:"no report produced",findings:[]}' > "$TMP/dup.json"; fi
  else skipped jscpd "npm i -g jscpd" dup; fi
fi

# ---- complexity (lizard, multi-language; radon for python) -------------------
if want complexity; then
  if command -v lizard >/dev/null 2>&1; then
    resolve_fl complexity "$TV_complexity" "$RH_complexity"; SC="$R_MODE"; load_existing complexity
    if [[ "$SC" != "tree" ]]; then TARGETS=(${EXISTING[@]+"${EXISTING[@]}"}); else TARGETS=(.); fi
    if [[ ${#TARGETS[@]} -gt 0 ]]; then
      timeout 600 lizard -C 15 -L 80 -w "${TARGETS[@]}" 2>/dev/null \
        | grep -E '^[^ ].*: warning:' \
        | sed -E 's/^(.*):([0-9]+): warning: ([^ ]+) has ([0-9]+) NLOC, ([0-9]+) CCN, [0-9]+ token, ([0-9]+) PARAM.*/{"path":"\1","line":\2,"function":"\3","nloc":\4,"ccn":\5,"params":\6}/' \
        | grep '^{' | jq -s --arg s "$SC" '{status:"ok",tool:"lizard",scope:$s,thresholds:{ccn:15,nloc:80},findings:.}' > "$TMP/complexity.json" 2>/dev/null \
        || jq -n '{status:"error",tool:"lizard",findings:[]}' > "$TMP/complexity.json"
    else jq -n --arg sc "$SC" '{status:"ok",tool:"lizard",scope:$sc,note:"no changed files",findings:[]}' > "$TMP/complexity.json"; fi
    merge_fl complexity
  elif command -v radon >/dev/null 2>&1 && [[ -f pyproject.toml || -f requirements.txt ]]; then
    resolve_fl complexity "$TV_complexity" "" "radon-tree-only"
    timeout 600 radon cc . -j -n C 2>/dev/null \
      | jq '{status:"ok",tool:"radon",findings:[to_entries[] | .key as $p | .value[]? | {path:$p,line:.lineno,function:.name,ccn:.complexity,rank:.rank}]}' \
      > "$TMP/complexity.json" 2>/dev/null || jq -n '{status:"error",tool:"radon",findings:[]}' > "$TMP/complexity.json"
  else skipped "lizard|radon" "pipx install lizard  /  pipx install radon" complexity; fi
fi

# ---- assemble ----------------------------------------------------------------
GIT_HEAD="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
SCANNERS="semgrep secrets deps deadcode dup complexity"
INC_N=0; TREE_N=0; CARRIED=0; BASE_FULL=""; : > "$TMP/inc_changed.txt"
RESJ='{}'
for s in $SCANNERS; do
  [[ -f "$TMP/$s.json" ]] || continue
  # A tool that exits 0 with no output (e.g. npm missing) leaves an empty file; keep the JSON valid and the slurp indices aligned.
  { [[ -s "$TMP/$s.json" ]] && jq -e . "$TMP/$s.json" >/dev/null 2>&1; } || jq -n --arg t "$s" '{status:"error",tool:$t,error:"scanner produced no JSON",findings:[]}' > "$TMP/$s.json"
  rv="RES_$s"; res="${!rv:-}"; mode="${res%%|*}"
  [[ -n "$res" ]] && RESJ="$(jq -c --arg s "$s" --arg r "$res" '.[$s]=$r' <<<"$RESJ")"
  st="$(jq -r '.status' "$TMP/$s.json")"
  # Stamp the sha the findings are valid for (lets the next run verify the ledger's JSON is still this result).
  if [[ "$st" == "ok" && "$SCOPE" != "range" && -n "$HEAD_FULL" ]]; then
    jq --arg a "$HEAD_FULL" '.at_sha=$a' "$TMP/$s.json" > "$TMP/$s.json.m" && mv "$TMP/$s.json.m" "$TMP/$s.json"
  fi
  case "$s" in semgrep|secrets|complexity)
    if [[ "$st" == "ok" ]]; then
      if [[ "$mode" == "diff" ]]; then
        INC_N=$((INC_N+1)); CARRIED=$((CARRIED + $(jq -r '.carried_forward // 0' "$TMP/$s.json")))
        cat "$TMP/changed_$s.txt" >> "$TMP/inc_changed.txt"
        bv="BASE_$s"; [[ -n "$BASE_FULL" ]] || BASE_FULL="${!bv:-}"
      elif [[ "$mode" == "tree" ]]; then TREE_N=$((TREE_N+1)); fi
    fi ;;
  esac
done
OVERALL="$SCOPE"; METAMODE="$MODE"; [[ "$SCOPE" == "range" ]] && METAMODE="range"
if [[ "$SCOPE" != "range" && $INC_N -gt 0 && $TREE_N -eq 0 ]]; then OVERALL="incremental"; fi
if [[ "$OVERALL" == "incremental" ]]; then
  META_FILES="$(LC_ALL=C sort -u "$TMP/inc_changed.txt" | grep -v '^$' | jq -R . | jq -s .)"
else
  META_FILES="$(jq -R . "$FILES_LIST" | jq -s .)"
fi
jq -n --arg root "$ROOT" --arg date "$DATE" --arg scope "$OVERALL" --arg base "$BASE" --arg head "$HEAD" --arg sha "$GIT_HEAD" \
   --argjson files "$META_FILES" --argjson res "$RESJ" --arg mode "$METAMODE" --arg bfs "$BASE_FULL" --argjson carried "$CARRIED" --arg expand "$EXPAND" \
   '{meta:({root:$root,date:$date,scope:$scope,base:$base,head:$head,head_sha:$sha,changed_files:$files,generator:"scripts/scan/collect.sh",mode:$mode,resolution:$res}
          + (if $scope=="incremental" then {base_full_sha:$bfs,carried_forward:$carried} else {} end)
          + (if $expand=="on" then {expand_importers:"requested-noop"} else {} end))}' > "$TMP/meta.json"
ASSEMBLE='{"meta": .[0].meta}'
INPUTS=("$TMP/meta.json")
for s in $SCANNERS; do
  if [[ -f "$TMP/$s.json" ]]; then
    INPUTS+=("$TMP/$s.json"); ASSEMBLE="$ASSEMBLE + {\"$s\": .[${#INPUTS[@]}-1]}"
  fi
done
jq -s "$ASSEMBLE" "${INPUTS[@]}" > "$OUT"

# ---- ledger: updated after every successful (ok / cached) non-range run -------
if [[ "$SCOPE" != "range" && -n "$HEAD_FULL" ]]; then
  mkdir -p "$(dirname "$LEDGER")"
  if [[ $LEDGER_OK -eq 1 ]]; then cp "$LEDGER" "$TMP/ledger.new"; else echo '{}' > "$TMP/ledger.new"; fi
  for s in $SCANNERS; do
    [[ -f "$TMP/$s.json" ]] || continue
    st="$(jq -r '.status' "$TMP/$s.json")"
    if [[ "$st" == "cached" ]]; then
      jq --arg s "$s" --arg o "$OUT_REL" '.[$s].json=$o' "$TMP/ledger.new" > "$TMP/ledger.m" && mv "$TMP/ledger.m" "$TMP/ledger.new"
    elif [[ "$st" == "ok" ]]; then
      tvn="TV_$s"; rhn="RH_$s"; rv="RES_$s"; bv="BASE_$s"; iv="INC_$s"
      mode="${!rv%%|*}"; esc=tree; [[ "$mode" == "diff" ]] && esc=incremental
      th="$TREE_HASH"; if [[ ( "$s" == "deadcode" || "$s" == "dup" ) && -s "$DIRTY" ]]; then th=""; fi
      jq --arg s "$s" --arg sha "$HEAD_FULL" --arg tree "$th" --arg tv "${!tvn:-}" --arg rh "${!rhn:-}" --arg out "$OUT_REL" \
         --arg sc "$esc" --arg date "$DATE" --argjson inc "${!iv:-0}" --arg base "${!bv:-$HEAD_FULL}" --arg lock "$DEPS_KEY" --rawfile dirty "$DIRTY" '
         .[$s] = ({head_sha:$sha,tree_hash:$tree,tool_version:$tv,rules_hash:$rh,json:$out,scope:$sc,date:$date,increments:$inc,base_full_sha:$base}
                  + (if $s=="deps" then {lockfile_hash:$lock} else {} end)
                  + (if ($s=="semgrep" or $s=="secrets" or $s=="complexity") then {dirty_files:($dirty|split("\n")|map(select(length>0)))} else {} end))' \
         "$TMP/ledger.new" > "$TMP/ledger.m" && mv "$TMP/ledger.m" "$TMP/ledger.new"
    fi
  done
  cp "$TMP/ledger.new" "$LEDGER" 2>/dev/null || echo "collect.sh: could not write ledger $LEDGER" >&2
fi

# Totals line for humans and for the caller's log.
jq -r '[ "scope=\(.meta.scope)",
         (if .meta.scope=="incremental" then "base=\(.meta.base_full_sha[0:7]) changed=\(.meta.changed_files|length)" else empty end),
         "semgrep=\(.semgrep.findings|length? // "skipped")",
         "secrets=\(.secrets.findings|length? // "skipped")",
         "deps=\(.deps.findings|length? // "skipped")",
         "deadcode=\(if .deadcode.findings|type=="object" then (.deadcode.findings.files|length) + (.deadcode.findings.exports|length) else (.deadcode.findings|length? // "skipped") end)",
         "dup=\(.dup.findings|length? // "skipped")",
         "complexity=\(.complexity.findings|length? // "skipped")" ] | join(" ")' "$OUT" >&2
echo "$OUT"
