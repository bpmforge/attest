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
# Usage:
#   scripts/scan/collect.sh --root <project> [--base <ref> --head <ref>] [--out <file.json>]
#                           [--only semgrep,secrets,deps,deadcode,dup,complexity]
# Output: the JSON path on stdout (default docs/work/scan/scan_<date>.json), exit 0
#         unless the script itself cannot run (exit 2). Findings never change the exit code —
#         the caller decides what blocks.

set -uo pipefail

ROOT="."; BASE=""; HEAD=""; OUT=""; ONLY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --head) HEAD="$2"; shift 2 ;;
    --out)  OUT="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "collect.sh: unknown arg $1" >&2; exit 2 ;;
  esac
done
ROOT="$(cd "$ROOT" 2>/dev/null && pwd)" || { echo "collect.sh: bad --root" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "collect.sh: jq is required" >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "collect.sh: node is required" >&2; exit 2; }
cd "$ROOT" || exit 2

DATE="$(date -u +%Y-%m-%d)"
[[ -n "$OUT" ]] || OUT="docs/work/scan/scan_${DATE}.json"
mkdir -p "$(dirname "$OUT")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

want() { [[ -z "$ONLY" ]] || [[ ",$ONLY," == *",$1,"* ]]; }

# Changed-file list (range mode) or empty (whole tree).
FILES_LIST="$TMP/files.txt"
if [[ -n "$BASE" && -n "$HEAD" ]]; then
  git diff --name-only --diff-filter=ACMR "$BASE...$HEAD" 2>/dev/null > "$FILES_LIST" || : > "$FILES_LIST"
  SCOPE="range"
else
  : > "$FILES_LIST"; SCOPE="tree"
fi
mapfile -t CHANGED < "$FILES_LIST"
# Only files that still exist (deleted paths cannot be scanned).
EXISTING=(); for f in "${CHANGED[@]}"; do [[ -f "$f" ]] && EXISTING+=("$f"); done

# Each scanner writes $TMP/<name>.json as {"status": "ok|skipped|error", ...}.
skipped() { jq -n --arg t "$1" --arg hint "$2" '{status:"skipped",tool:$t,install:$hint,findings:[]}' > "$TMP/$3.json"; }

# ---- semgrep / opengrep ------------------------------------------------------
if want semgrep; then
  ENGINE=""; command -v opengrep >/dev/null 2>&1 && ENGINE=opengrep; [[ -n "$ENGINE" ]] || { command -v semgrep >/dev/null 2>&1 && ENGINE=semgrep; }
  if [[ -z "$ENGINE" ]]; then skipped semgrep "pipx install semgrep" semgrep
  else
    CFG=(--config auto); [[ -d .semgrep ]] && CFG+=(--config .semgrep)
    if [[ "$SCOPE" == "range" && ${#EXISTING[@]} -eq 0 ]]; then
      jq -n '{status:"ok",tool:"semgrep",scope:"range",note:"no scannable changed files",findings:[]}' > "$TMP/semgrep.json"
    else
      TARGETS=(.); [[ "$SCOPE" == "range" ]] && TARGETS=("${EXISTING[@]}")
      timeout 900 "$ENGINE" scan "${CFG[@]}" --json --quiet --metrics=off "${TARGETS[@]}" > "$TMP/semgrep.raw" 2> "$TMP/semgrep.err" || true
      if jq -e . "$TMP/semgrep.raw" >/dev/null 2>&1; then
        jq --arg t "$ENGINE" --arg s "$SCOPE" '{status:"ok",tool:$t,scope:$s,
          findings:[.results[]? | {rule:.check_id, severity:(.extra.severity//"UNKNOWN"), path:.path, line:.start.line,
                                   message:(.extra.message//""), cwe:(.extra.metadata.cwe//null), owasp:(.extra.metadata.owasp//null)}],
          errors:[.errors[]? | .message] }' "$TMP/semgrep.raw" > "$TMP/semgrep.json"
      else
        jq -n --arg t "$ENGINE" --arg e "$(tail -c 2000 "$TMP/semgrep.err")" '{status:"error",tool:$t,error:$e,findings:[]}' > "$TMP/semgrep.json"
      fi
    fi
  fi
fi

# ---- secrets (trufflehog, else the same grep battery secrets-scanner.md used) ----
if want secrets; then
  if command -v trufflehog >/dev/null 2>&1 && [[ "$SCOPE" == "tree" ]]; then
    timeout 900 trufflehog filesystem . --json --no-update 2>/dev/null \
      | jq -s '{status:"ok",tool:"trufflehog",scope:"tree",
               findings:[.[] | {detector:.DetectorName, path:(.SourceMetadata.Data.Filesystem.file//""), line:(.SourceMetadata.Data.Filesystem.line//null), verified:.Verified}]}' \
      > "$TMP/secrets.json" 2>/dev/null || jq -n '{status:"error",tool:"trufflehog",findings:[]}' > "$TMP/secrets.json"
  else
    # grep battery — values are never copied into the JSON, only path:line and the pattern name.
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
    : > "$TMP/secrets.rows"
    if [[ "$SCOPE" == "range" ]]; then TARGETS=("${EXISTING[@]}"); else TARGETS=(.); fi
    if [[ ${#TARGETS[@]} -gt 0 ]]; then
      for p in "${PATTERNS[@]}"; do
        name="${p%%|*}"; re="${p#*|}"
        grep -rnHE --binary-files=without-match --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.venv \
             --exclude='*.lock' --exclude='*.min.js' --exclude='telemetry.jsonl' -- "$re" "${TARGETS[@]}" 2>/dev/null \
          | grep -vE 'process\.env|os\.environ|example|dummy|placeholder|\.md:' \
          | cut -d: -f1,2 | sed "s/^\.\///" | awk -v n="$name" -F: '{printf "{\"pattern\":\"%s\",\"path\":\"%s\",\"line\":%s}\n", n, $1, $2}' >> "$TMP/secrets.rows" || true
      done
    fi
    jq -s --arg s "$SCOPE" '{status:"ok",tool:"grep-battery",scope:$s,findings:.}' "$TMP/secrets.rows" > "$TMP/secrets.json"
  fi
fi

# ---- dependency audit (stack-detected; same commands validate-deps.sh uses) ----
if want deps; then
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
if want deadcode; then
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
if want dup; then
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
    if [[ "$SCOPE" == "range" ]]; then TARGETS=("${EXISTING[@]}"); else TARGETS=(.); fi
    if [[ ${#TARGETS[@]} -gt 0 ]]; then
      timeout 600 lizard -C 15 -L 80 -w "${TARGETS[@]}" 2>/dev/null \
        | grep -E '^[^ ].*: warning:' \
        | sed -E 's/^(.*):([0-9]+): warning: ([^ ]+) has ([0-9]+) NLOC, ([0-9]+) CCN, [0-9]+ token, ([0-9]+) PARAM.*/{"path":"\1","line":\2,"function":"\3","nloc":\4,"ccn":\5,"params":\6}/' \
        | grep '^{' | jq -s --arg s "$SCOPE" '{status:"ok",tool:"lizard",scope:$s,thresholds:{ccn:15,nloc:80},findings:.}' > "$TMP/complexity.json" 2>/dev/null \
        || jq -n '{status:"error",tool:"lizard",findings:[]}' > "$TMP/complexity.json"
    else jq -n '{status:"ok",tool:"lizard",scope:"range",note:"no changed files",findings:[]}' > "$TMP/complexity.json"; fi
  elif command -v radon >/dev/null 2>&1 && [[ -f pyproject.toml || -f requirements.txt ]]; then
    timeout 600 radon cc . -j -n C 2>/dev/null \
      | jq '{status:"ok",tool:"radon",findings:[to_entries[] | .key as $p | .value[]? | {path:$p,line:.lineno,function:.name,ccn:.complexity,rank:.rank}]}' \
      > "$TMP/complexity.json" 2>/dev/null || jq -n '{status:"error",tool:"radon",findings:[]}' > "$TMP/complexity.json"
  else skipped "lizard|radon" "pipx install lizard  /  pipx install radon" complexity; fi
fi

# ---- assemble ----------------------------------------------------------------
GIT_HEAD="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
jq -n --arg root "$ROOT" --arg date "$DATE" --arg scope "$SCOPE" --arg base "$BASE" --arg head "$HEAD" --arg sha "$GIT_HEAD" \
   --argjson files "$(jq -R . "$FILES_LIST" | jq -s .)" \
   --slurpfile semgrep "$( [[ -f "$TMP/semgrep.json" ]] && echo "$TMP/semgrep.json" || echo /dev/null )" \
   '{meta:{root:$root,date:$date,scope:$scope,base:$base,head:$head,head_sha:$sha,changed_files:$files,generator:"scripts/scan/collect.sh"}}' > "$TMP/meta.json"
ASSEMBLE='{"meta": .[0].meta}'
INPUTS=("$TMP/meta.json")
for s in semgrep secrets deps deadcode dup complexity; do
  if [[ -f "$TMP/$s.json" ]]; then
    INPUTS+=("$TMP/$s.json"); ASSEMBLE="$ASSEMBLE + {\"$s\": .[${#INPUTS[@]}-1]}"
  fi
done
jq -s "$ASSEMBLE" "${INPUTS[@]}" > "$OUT"

# Totals line for humans and for the caller's log.
jq -r '[ .meta.scope,
         "semgrep=\(.semgrep.findings|length? // "skipped")",
         "secrets=\(.secrets.findings|length? // "skipped")",
         "deps=\(.deps.findings|length? // "skipped")",
         "deadcode=\(if .deadcode.findings|type=="object" then (.deadcode.findings.files|length) + (.deadcode.findings.exports|length) else (.deadcode.findings|length? // "skipped") end)",
         "dup=\(.dup.findings|length? // "skipped")",
         "complexity=\(.complexity.findings|length? // "skipped")" ] | join(" ")' "$OUT" >&2
echo "$OUT"
