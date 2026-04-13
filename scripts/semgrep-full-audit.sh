#!/bin/bash
#
# semgrep-full-audit.sh — Deep security audit runner
#
# Executes the two-tier Semgrep audit strategy used by the security-auditor
# agent. Auto-detects project language and framework, composes the right
# rule packs, applies community rules, emits JSON + SARIF output.
#
# Usage:
#   ./semgrep-full-audit.sh                Deep audit (default)
#   ./semgrep-full-audit.sh --fast         Fast CI-tier scan (p/ci + secrets)
#   ./semgrep-full-audit.sh --autofix      Deep audit with AUTOFIX (opt-in, LOW/MEDIUM only)
#   ./semgrep-full-audit.sh --baseline REF Only report findings new since REF (git ref)
#   ./semgrep-full-audit.sh --help         Show this help
#
# AUTOFIX WARNING:
#   Autofix is OPT-IN only. Even with the flag, this script refuses to autofix
#   HIGH/CRITICAL findings — those require human review. Autofix applies only
#   to LOW and WARNING severity rules (unused imports, deprecated API calls,
#   missing types). Run with --autofix-dryrun first to preview changes.
#
# REGISTRY PACK PROBING:
#   Semgrep's registry packs (p/express, p/nextjs, etc.) can return HTTP 404
#   if a pack was renamed, deprecated, or moved behind a login tier. This
#   script probes each non-core registry pack in isolation before adding it
#   to the final config list, so a 404 on one pack never silences all results.
#

set -euo pipefail

MODE="deep"
AUTOFIX=false
AUTOFIX_DRYRUN=false
BASELINE=""

for arg in "$@"; do
  case $arg in
    --fast)            MODE="fast" ;;
    --autofix)         AUTOFIX=true ;;
    --autofix-dryrun)  AUTOFIX_DRYRUN=true ;;
    --baseline)        shift; BASELINE="${1:-}"; break ;;
    --help|-h)
      sed -n '3,20p' "$0" | sed 's/^# //'
      exit 0
      ;;
  esac
done

# ── Preflight ──────────────────────────────────────────────────────────
if ! command -v semgrep &> /dev/null; then
  echo "❌ semgrep not installed."
  echo "   brew install semgrep   (macOS)"
  echo "   pip install semgrep    (any platform)"
  exit 1
fi

PROJECT_ROOT="${PWD}"
OUTPUT_DIR="$PROJECT_ROOT/docs/security"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date '+%Y-%m-%d-%H%M%S')
JSON_OUT="$OUTPUT_DIR/semgrep-results.json"
SARIF_OUT="$OUTPUT_DIR/semgrep-results.sarif"
LOG_OUT="$OUTPUT_DIR/semgrep-scan-$TIMESTAMP.log"

# Community rules cache — canonical path is ~/.semgrep/rules/
# (where update-semgrep-rules.sh clones to by default).
# Override with: export SEMGREP_COMMUNITY_CACHE=/your/path
if [ -n "${SEMGREP_COMMUNITY_CACHE:-}" ]; then
  CACHE_DIR="$SEMGREP_COMMUNITY_CACHE"
elif [ -d "$HOME/.semgrep/rules/trailofbits" ]; then
  CACHE_DIR="$HOME/.semgrep/rules"
elif [ -d "$HOME/.cache/semgrep-community/trailofbits" ]; then
  # Legacy layout from older versions of this toolchain
  CACHE_DIR="$HOME/.cache/semgrep-community"
else
  CACHE_DIR="$HOME/.semgrep/rules"
fi

# ── Helper: probe a registry pack ─────────────────────────────────────
# Returns 0 (usable) or 1 (unavailable/404) without crashing the script.
# Writes a tiny dry-run against a temp file to test if the pack resolves.
probe_registry_pack() {
  local pack="$1"
  # semgrep exits 7 on config errors (including HTTP 404).
  local tmpdir
  tmpdir=$(mktemp -d)
  echo "// probe" > "$tmpdir/probe.js"
  semgrep scan --config "$pack" --metrics=off --json -o /dev/null "$tmpdir" \
    2>/dev/null
  local rc=$?
  rm -rf "$tmpdir"
  # 0 = no findings, 1 = findings, 2 = findings+errors — all mean "pack loaded OK"
  # 7 = config error (404, YAML parse failure) — pack is unusable
  [ "$rc" -ne 7 ]
}

# ── Helper: add registry pack with probe ──────────────────────────────
# Silently skips the pack if it returns a 404/config error.
add_registry_pack() {
  local pack="$1"
  if probe_registry_pack "$pack"; then
    CONFIGS+=(--config "$pack")
  else
    echo "  ⚠️  Registry pack '$pack' unavailable (404 or parse error) — skipping"
    SKIPPED_PACKS+=("$pack")
  fi
}

# ── Helper: add a community rule directory ────────────────────────────
# Community repos have non-rule YAML files (GitHub Actions workflows, Makefiles,
# config files) that cause semgrep parse errors when scanning the repo root.
# ALWAYS pass a specific language subdirectory — never the repo root.
#
# Exit codes from semgrep:
#   0 = clean (no findings)
#   1 = findings (normal — not an error)
#   2 = findings + rule parse errors (some rules broken, scan still ran — USABLE)
#   7 = config error (YAML invalid, scan did NOT run — skip this dir)
#
# We treat 0, 1, 2 as usable. Only 7 is a hard skip.
add_community_dir() {
  local label="$1"
  local dir="$2"
  [ -d "$dir" ] || return 0   # dir doesn't exist — silent skip
  local tmpdir
  tmpdir=$(mktemp -d)
  echo "// probe" > "$tmpdir/probe.js"
  semgrep scan --config "$dir" --metrics=off --json -o /dev/null "$tmpdir" 2>/dev/null
  local rc=$?
  rm -rf "$tmpdir"
  if [ "$rc" -eq 7 ]; then
    echo "  ⚠️  Community dir '$label' entirely broken (exit 7, YAML parse failure) — skipping"
    SKIPPED_PACKS+=("$label ($dir)")
  else
    # rc 0, 1, or 2 — all mean the scan ran successfully
    CONFIGS+=(--config "$dir")
  fi
}

# ── Build config list ──────────────────────────────────────────────────
CONFIGS=()
SKIPPED_PACKS=()

if [ "$MODE" = "fast" ]; then
  # Fast tier — high signal, < 60s on most codebases.
  # Core packs (p/ci, p/secrets) are stable — probe anyway for safety.
  add_registry_pack "p/ci"
  add_registry_pack "p/secrets"
else
  # Deep tier — full coverage.
  # Core security packs: stable, but still probe to detect breakage early.
  for core_pack in p/owasp-top-ten p/security-audit p/secrets p/default; do
    add_registry_pack "$core_pack"
  done
fi

# ── Language auto-detection ────────────────────────────────────────────
LANG=""
if [ -f "$PROJECT_ROOT/package.json" ] || ls "$PROJECT_ROOT"/*.{ts,tsx,js,jsx} &>/dev/null 2>&1; then
  add_registry_pack "p/javascript"
  [ "$MODE" = "deep" ] && add_registry_pack "p/typescript"
  [ "$MODE" = "deep" ] && add_registry_pack "p/nodejsscan"
  LANG="javascript"
elif [ -f "$PROJECT_ROOT/requirements.txt" ] || [ -f "$PROJECT_ROOT/pyproject.toml" ]; then
  add_registry_pack "p/python"
  [ "$MODE" = "deep" ] && add_registry_pack "p/bandit"
  LANG="python"
elif [ -f "$PROJECT_ROOT/go.mod" ]; then
  add_registry_pack "p/golang"
  [ "$MODE" = "deep" ] && add_registry_pack "p/gosec"
  LANG="go"
elif [ -f "$PROJECT_ROOT/Cargo.toml" ]; then
  add_registry_pack "p/rust"
  LANG="rust"
elif [ -f "$PROJECT_ROOT/pom.xml" ] || [ -f "$PROJECT_ROOT/build.gradle" ]; then
  add_registry_pack "p/java"
  LANG="java"
elif [ -f "$PROJECT_ROOT/Gemfile" ]; then
  add_registry_pack "p/ruby"
  [ "$MODE" = "deep" ] && add_registry_pack "p/brakeman"
  LANG="ruby"
elif [ -f "$PROJECT_ROOT/composer.json" ]; then
  add_registry_pack "p/php"
  LANG="php"
fi

# ── Framework auto-detection (deep mode only) ──────────────────────────
if [ "$MODE" = "deep" ] && [ -f "$PROJECT_ROOT/package.json" ]; then
  if grep -q '"express"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
    add_registry_pack "p/express"
  fi
  if grep -q '"next"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
    add_registry_pack "p/nextjs"
  fi
  if grep -q '"react"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
    add_registry_pack "p/react"
  fi
fi

if [ "$MODE" = "deep" ] && [ -f "$PROJECT_ROOT/requirements.txt" ]; then
  if grep -q -E '^(django|Django)' "$PROJECT_ROOT/requirements.txt" 2>/dev/null; then
    add_registry_pack "p/django"
  fi
  if grep -q -E '^(flask|Flask)' "$PROJECT_ROOT/requirements.txt" 2>/dev/null; then
    add_registry_pack "p/flask"
  fi
fi

# ── IaC auto-detection (deep mode only) ────────────────────────────────
if [ "$MODE" = "deep" ]; then
  if ls "$PROJECT_ROOT"/Dockerfile* &>/dev/null 2>&1; then
    add_registry_pack "p/dockerfile"
  fi
  if ls "$PROJECT_ROOT"/*.tf "$PROJECT_ROOT"/terraform/*.tf &>/dev/null 2>&1; then
    add_registry_pack "p/terraform"
  fi
  if [ -d "$PROJECT_ROOT/k8s" ] || [ -d "$PROJECT_ROOT/kubernetes" ] || [ -d "$PROJECT_ROOT/helm" ]; then
    add_registry_pack "p/kubernetes"
  fi
  if [ -d "$PROJECT_ROOT/.github/workflows" ]; then
    add_registry_pack "p/github-actions"
  fi
fi

# ── Community rules (deep mode only) ───────────────────────────────────
#
# IMPORTANT: community repos have non-rule YAML at their root (.github/,
# Makefile, config files). Pointing --config at the repo root causes exit 7
# parse errors. We point at LANGUAGE SUBDIRECTORIES only.
#
# Tested working paths (verified against Semgrep 1.159.0):
#
#   trailofbits/<lang>  — use language subdirs (javascript, python, go, ruby, swift, etc.)
#   elttam/rules/<lang> — generic, go, php, yaml (java works but has one broken rule)
#   elttam/rules-audit/<lang> — javascript, python, go, java, c, csharp, kotlin
#   gitlab/<lang>       — javascript, python, go, java, c, csharp, scala ONLY
#                         DO NOT use: gitlab/ci, gitlab/mappings, gitlab/qa,
#                                     gitlab/rules, gitlab/scripts, gitlab/spec
#   0xdea/rules         — C/C++ only
#
# Run scripts/update-semgrep-rules.sh --test to re-validate after a bump.
#
add_community_rules_for_lang() {
  local lang="$1"

  # trailofbits language subdir (each language dir is self-contained)
  add_community_dir "trailofbits/$lang" "$CACHE_DIR/trailofbits/$lang"

  # trailofbits/generic — language-agnostic rules (always add if present)
  if [ "$lang" != "generic" ]; then
    add_community_dir "trailofbits/generic" "$CACHE_DIR/trailofbits/generic"
  fi

  # elttam has two rule collections; add both for the detected language
  add_community_dir "elttam/rules/$lang"       "$CACHE_DIR/elttam/rules/$lang"
  add_community_dir "elttam/rules-audit/$lang" "$CACHE_DIR/elttam/rules-audit/$lang"

  # gitlab language subdir — only well-known working subdirs
  case "$lang" in
    javascript|python|go|java|c|csharp|scala)
      add_community_dir "gitlab/$lang" "$CACHE_DIR/gitlab/$lang"
      ;;
  esac
}

if [ "$MODE" = "deep" ]; then
  if [ -d "$CACHE_DIR/trailofbits" ] || [ -d "$CACHE_DIR/elttam" ] || [ -d "$CACHE_DIR/gitlab" ]; then
    # Add rules for detected language
    if [ -n "$LANG" ]; then
      add_community_rules_for_lang "$LANG"
      # typescript shares rules with javascript in all community repos
      if [ "$LANG" = "typescript" ]; then
        add_community_rules_for_lang "javascript"
      fi
    fi

    # 0xdea: C/C++ memory safety rules — only add if project has C/C++ files
    if [ -d "$CACHE_DIR/0xdea/rules" ]; then
      if find "$PROJECT_ROOT" -name '*.c' -o -name '*.cpp' -o -name '*.h' \
           2>/dev/null | grep -q .; then
        add_community_dir "0xdea/rules" "$CACHE_DIR/0xdea/rules"
      fi
    fi
  else
    echo ""
    echo "⚠️  Community rules not installed. Run to get highest-signal rules:"
    echo "     scripts/update-semgrep-rules.sh"
    echo "   Then verify with:"
    echo "     scripts/update-semgrep-rules.sh --test"
    echo ""
  fi
fi

# ── Project-specific custom rules ──────────────────────────────────────
if [ -d "$PROJECT_ROOT/.semgrep/project-rules" ]; then
  CONFIGS+=(--config "$PROJECT_ROOT/.semgrep/project-rules")
fi

# ── Build flag list ────────────────────────────────────────────────────
FLAGS=()
FLAGS+=(--json -o "$JSON_OUT")
FLAGS+=(--sarif-output "$SARIF_OUT")
FLAGS+=(--metrics=off)  # don't phone home

# Respect .semgrepignore automatically; also add sensible defaults if none exists
if [ ! -f "$PROJECT_ROOT/.semgrepignore" ]; then
  FLAGS+=(--exclude 'node_modules/' --exclude 'vendor/' --exclude 'dist/')
  FLAGS+=(--exclude 'build/' --exclude '*.min.js' --exclude 'coverage/')
  FLAGS+=(--exclude '**/__generated__/**' --exclude '**/*_pb.py' --exclude '**/*_pb2.py')
fi

# Baseline scanning — only new findings since a git ref
if [ -n "$BASELINE" ]; then
  FLAGS+=(--baseline-ref "$BASELINE")
fi

# Autofix handling — strict gating
if [ "$AUTOFIX" = true ]; then
  echo ""
  echo "⚠️  AUTOFIX MODE ENABLED"
  echo "   Autofix will apply ONLY to LOW and WARNING severity findings."
  echo "   HIGH and CRITICAL findings will NOT be autofixed — human review required."
  echo ""
  read -r -p "   Continue with autofix? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy] ]]; then
    echo "   Aborted by user."
    exit 0
  fi
  # Semgrep's --autofix applies fixes; we filter by severity via --severity
  FLAGS+=(--autofix --severity=WARNING --severity=INFO)
elif [ "$AUTOFIX_DRYRUN" = true ]; then
  echo ""
  echo "AUTOFIX DRY RUN — showing what would be changed without applying:"
  echo ""
  FLAGS+=(--autofix --dryrun --severity=WARNING --severity=INFO)
fi

# ── Guard: bail early if no configs resolved ──────────────────────────
if [ ${#CONFIGS[@]} -eq 0 ]; then
  echo ""
  echo "❌ No rule sources resolved. Cannot run scan."
  echo "   All registry packs returned HTTP 404 and no community rules are cached."
  echo ""
  echo "   Immediate fallback: run the safe baseline scan:"
  echo "     semgrep scan --config auto --json -o docs/security/semgrep-results.json ."
  echo ""
  echo "   For community rules: scripts/update-semgrep-rules.sh"
  exit 1
fi

# ── Execute ────────────────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║   Semgrep Audit — ${MODE} tier                      "
echo "╠═══════════════════════════════════════════════════╣"
echo "  Project:   $(basename "$PROJECT_ROOT")"
echo "  Language:  ${LANG:-unknown}"
echo "  Configs:   ${#CONFIGS[@]} rule sources"
echo "  Output:    $JSON_OUT"
echo "  SARIF:     $SARIF_OUT"
[ -n "$BASELINE" ] && echo "  Baseline:  $BASELINE"
if [ ${#SKIPPED_PACKS[@]} -gt 0 ]; then
  echo "  Skipped (unavailable): ${SKIPPED_PACKS[*]}"
fi
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Run semgrep — all probed configs are known to work, no || true needed.
# If semgrep returns exit 1 (findings exist) or 0 (no findings), both are fine.
# Exit 7 (config error) should not happen here since configs were pre-probed.
semgrep scan "${CONFIGS[@]}" "${FLAGS[@]}" 2>&1 | tee "$LOG_OUT"
EXIT_CODE=${PIPESTATUS[0]}

echo ""
if [ "$EXIT_CODE" -eq 0 ] || [ "$EXIT_CODE" -eq 1 ]; then
  # 0 = clean, 1 = findings found — both are normal exits for semgrep
  ok_count=$(jq '.results | length' "$JSON_OUT" 2>/dev/null || echo "?")
  echo "✓ Scan complete — $ok_count findings"
  echo ""
  echo "Next steps:"
  echo "  1. Generate report skeleton:"
  echo "     python3 scripts/semgrep-to-report-skeleton.py --project '$(basename "$PROJECT_ROOT")'"
  echo "  2. Review findings:  jq '.results[] | {file: .path, line: .start.line, rule: .check_id, severity: .extra.severity, message: .extra.message}' $JSON_OUT"
  echo "  3. Group by severity: jq '[.results[].extra.severity] | group_by(.) | map({severity: .[0], count: length})' $JSON_OUT"
  echo "  4. Triage in:        docs/security/TRIAGE.md"
  exit 0
elif [ "$EXIT_CODE" -eq 7 ]; then
  echo "❌ Semgrep config error (exit 7) — a rule source that passed probing failed at scan time."
  echo "   This is unexpected. Check $LOG_OUT for details."
  echo "   Try removing suspect community dirs from: $CACHE_DIR"
  exit 7
else
  echo "❌ Semgrep exited with code $EXIT_CODE — check $LOG_OUT for details."
  exit "$EXIT_CODE"
fi
