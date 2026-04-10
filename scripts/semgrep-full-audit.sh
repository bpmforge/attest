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

CACHE_DIR="${SEMGREP_COMMUNITY_CACHE:-$HOME/.cache/semgrep-community}"

# ── Build config list ──────────────────────────────────────────────────
CONFIGS=()

if [ "$MODE" = "fast" ]; then
  # Fast tier — high signal, < 60s on most codebases
  CONFIGS+=(--config p/ci)
  CONFIGS+=(--config p/secrets)
else
  # Deep tier — full coverage
  CONFIGS+=(--config p/owasp-top-ten)
  CONFIGS+=(--config p/security-audit)
  CONFIGS+=(--config p/secrets)
  CONFIGS+=(--config p/default)
fi

# ── Language auto-detection ────────────────────────────────────────────
LANG=""
if [ -f "$PROJECT_ROOT/package.json" ] || ls "$PROJECT_ROOT"/*.{ts,tsx,js,jsx} &>/dev/null; then
  CONFIGS+=(--config p/javascript)
  [ "$MODE" = "deep" ] && CONFIGS+=(--config p/typescript)
  LANG="javascript"
elif [ -f "$PROJECT_ROOT/requirements.txt" ] || [ -f "$PROJECT_ROOT/pyproject.toml" ]; then
  CONFIGS+=(--config p/python)
  [ "$MODE" = "deep" ] && CONFIGS+=(--config p/bandit)
  LANG="python"
elif [ -f "$PROJECT_ROOT/go.mod" ]; then
  CONFIGS+=(--config p/golang)
  [ "$MODE" = "deep" ] && CONFIGS+=(--config p/gosec)
  LANG="go"
elif [ -f "$PROJECT_ROOT/Cargo.toml" ]; then
  CONFIGS+=(--config p/rust)
  LANG="rust"
elif [ -f "$PROJECT_ROOT/pom.xml" ] || [ -f "$PROJECT_ROOT/build.gradle" ]; then
  CONFIGS+=(--config p/java)
  LANG="java"
elif [ -f "$PROJECT_ROOT/Gemfile" ]; then
  CONFIGS+=(--config p/ruby)
  [ "$MODE" = "deep" ] && CONFIGS+=(--config p/brakeman)
  LANG="ruby"
elif [ -f "$PROJECT_ROOT/composer.json" ]; then
  CONFIGS+=(--config p/php)
  LANG="php"
fi

# ── Framework auto-detection (deep mode only) ──────────────────────────
if [ "$MODE" = "deep" ] && [ -f "$PROJECT_ROOT/package.json" ]; then
  if grep -q '"express"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
    CONFIGS+=(--config p/express)
  fi
  if grep -q '"next"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
    CONFIGS+=(--config p/nextjs)
  fi
  if grep -q '"react"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
    CONFIGS+=(--config p/react)
  fi
fi

if [ "$MODE" = "deep" ] && [ -f "$PROJECT_ROOT/requirements.txt" ]; then
  if grep -q -E '^(django|Django)' "$PROJECT_ROOT/requirements.txt" 2>/dev/null; then
    CONFIGS+=(--config p/django)
  fi
  if grep -q -E '^(flask|Flask)' "$PROJECT_ROOT/requirements.txt" 2>/dev/null; then
    CONFIGS+=(--config p/flask)
  fi
fi

# ── IaC auto-detection (deep mode only) ────────────────────────────────
if [ "$MODE" = "deep" ]; then
  if ls "$PROJECT_ROOT"/Dockerfile* &>/dev/null; then
    CONFIGS+=(--config p/dockerfile)
  fi
  if ls "$PROJECT_ROOT"/*.tf "$PROJECT_ROOT"/terraform/*.tf &>/dev/null; then
    CONFIGS+=(--config p/terraform)
  fi
  if [ -d "$PROJECT_ROOT/k8s" ] || [ -d "$PROJECT_ROOT/kubernetes" ] || [ -d "$PROJECT_ROOT/helm" ]; then
    CONFIGS+=(--config p/kubernetes)
  fi
  if [ -d "$PROJECT_ROOT/.github/workflows" ]; then
    CONFIGS+=(--config p/github-actions)
  fi
fi

# ── Community rules (deep mode only) ───────────────────────────────────
if [ "$MODE" = "deep" ]; then
  for src in trailofbits elttam gitlab; do
    if [ -d "$CACHE_DIR/$src" ]; then
      # For gitlab, scope to the detected language subdirectory
      if [ "$src" = "gitlab" ] && [ -n "$LANG" ] && [ -d "$CACHE_DIR/gitlab/$LANG" ]; then
        CONFIGS+=(--config "$CACHE_DIR/gitlab/$LANG")
      elif [ "$src" != "gitlab" ]; then
        CONFIGS+=(--config "$CACHE_DIR/$src")
      fi
    fi
  done

  # 0xdea only for C/C++ projects
  if [ -d "$CACHE_DIR/0xdea" ] && ls "$PROJECT_ROOT"/**/*.{c,cpp,h,hpp} &>/dev/null 2>&1; then
    CONFIGS+=(--config "$CACHE_DIR/0xdea")
  fi

  if [ ${#CONFIGS[@]} -lt 5 ]; then
    echo "⚠️  Community rules not installed. Run hooks/update-semgrep-rules.sh first for deeper coverage."
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
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Run semgrep
semgrep scan "${CONFIGS[@]}" "${FLAGS[@]}" 2>&1 | tee "$LOG_OUT"
EXIT_CODE=${PIPESTATUS[0]}

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  ok_count=$(jq '.results | length' "$JSON_OUT" 2>/dev/null || echo "?")
  echo "✓ Scan complete — $ok_count findings"
  echo ""
  echo "Next steps:"
  echo "  1. Review findings:  jq '.results[] | {file: .path, line: .start.line, rule: .check_id, severity: .extra.severity, message: .extra.message}' $JSON_OUT"
  echo "  2. Group by severity: jq '[.results[].extra.severity] | group_by(.) | map({severity: .[0], count: length})' $JSON_OUT"
  echo "  3. Triage in:        docs/security/TRIAGE.md"
  echo "  4. Full report:      docs/security/SECURITY_AUDIT_$(date +%Y-%m-%d).md"
fi

exit $EXIT_CODE
