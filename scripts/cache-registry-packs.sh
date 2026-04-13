#!/bin/bash
#
# cache-registry-packs.sh — Download Semgrep registry packs for offline use
#
# Downloads all registry packs used by semgrep-full-audit.sh as local YAML
# files so scans can run fully offline without hitting semgrep.dev.
#
# Each pack is downloaded via:
#   curl -s "https://semgrep.dev/c/p/<pack-name>" > <cache-dir>/<pack-name>.yml
#
# The audit script's add_registry_pack() will automatically prefer cached YAML
# files when they exist (see --offline flag on semgrep-full-audit.sh).
#
# Cache location: ~/.semgrep/registry-cache/ (override with SEMGREP_REGISTRY_CACHE)
#
# Usage:
#   ./cache-registry-packs.sh               Download all packs
#   ./cache-registry-packs.sh --refresh     Re-download all (overwrite existing)
#   ./cache-registry-packs.sh --status      Show cache status (what's cached, age)
#   ./cache-registry-packs.sh --prune       Remove dead/empty cached packs
#   ./cache-registry-packs.sh --help        Show this help
#
# Packs that return HTTP 404 or empty YAML are marked as dead and skipped.
# The script records download metadata in a manifest file for staleness checks.
#
# Portable: works on macOS bash 3.2+ and Linux bash 4+.
#

set -euo pipefail

CACHE_DIR="${SEMGREP_REGISTRY_CACHE:-$HOME/.semgrep/registry-cache}"
MANIFEST="$CACHE_DIR/MANIFEST.txt"
REGISTRY_BASE="https://semgrep.dev/c/p"

MODE="download"
for arg in "$@"; do
  case $arg in
    --refresh)     MODE="refresh" ;;
    --status)      MODE="status" ;;
    --prune)       MODE="prune" ;;
    --help|-h)
      sed -n '3,26p' "$0" | sed 's/^# //'
      exit 0
      ;;
  esac
done

log()  { echo "  $*"; }
warn() { echo "  ⚠️  $*" >&2; }
ok()   { echo "  ✓  $*"; }
err()  { echo "  ❌ $*" >&2; }

# ── Registry packs to cache ──────────────────────────────────────────────
# Organized by category. Keep in sync with semgrep-full-audit.sh.
#
# Category: core security packs (always loaded)
CORE_PACKS=(
  owasp-top-ten
  security-audit
  secrets
  default
)

# Category: language-specific packs (loaded when language detected)
LANG_PACKS=(
  javascript
  typescript
  python
  golang
  java
  kotlin
  csharp
  c
  swift
  ruby
  php
  rust
  scala
)

# Category: framework-specific packs (loaded when framework detected)
FRAMEWORK_PACKS=(
  react
  nodejsscan
  django
  flask
  fastapi
  bandit
  brakeman
  gosec
)

# Category: infrastructure packs (loaded when IaC files detected)
INFRA_PACKS=(
  dockerfile
  terraform
  kubernetes
  github-actions
)

# Known dead packs — skip these entirely. They once existed in the registry
# but now return HTTP 404 or were deprecated. Documented here so we don't
# waste time re-probing them on every run.
#
# Why they're dead:
#   p/cpp      — Removed ~2025. p/c partially covers C++ but is thin.
#   p/express  — Removed ~2026. Rules merged into p/javascript + p/nodejsscan.
#   p/nextjs   — Returns empty YAML (rules: []). No actual rules.
#   p/rails    — Removed. Rules merged into p/ruby + p/brakeman.
#   p/gin      — Removed. Rules merged into p/golang + p/gosec.
#   p/spring   — Removed. Rules merged into p/java.
#   p/ci       — Meta-pack that pulls from other packs at runtime. Not downloadable
#                 as static YAML — downloading it gives an incomplete/stale snapshot.
#                 In offline mode, equivalent coverage is provided by loading
#                 p/default + p/secrets + language packs.
DEAD_PACKS=(cpp express nextjs rails gin spring ci)

# ── Combine all packs into one list ──────────────────────────────────────
ALL_PACKS=("${CORE_PACKS[@]}" "${LANG_PACKS[@]}" "${FRAMEWORK_PACKS[@]}" "${INFRA_PACKS[@]}")

# ── Check if a pack is in the dead list ──────────────────────────────────
is_dead_pack() {
  local name="$1"
  for dead in "${DEAD_PACKS[@]}"; do
    [ "$dead" = "$name" ] && return 0
  done
  return 1
}

# ── Download a single pack ───────────────────────────────────────────────
download_pack() {
  local name="$1"
  local outfile="$CACHE_DIR/${name}.yml"
  local url="$REGISTRY_BASE/$name"

  # Skip known dead packs
  if is_dead_pack "$name"; then
    log "SKIP $name (known dead — see DEAD_PACKS list)"
    return 0
  fi

  # Skip if already cached (unless refreshing)
  if [ "$MODE" != "refresh" ] && [ -f "$outfile" ]; then
    local size
    size=$(wc -c < "$outfile" | tr -d ' ')
    if [ "$size" -gt 20 ]; then
      log "CACHED $name ($size bytes) — use --refresh to re-download"
      return 0
    fi
    # File exists but is empty/tiny — re-download
    log "RE-DOWNLOAD $name (cached file only $size bytes)"
  fi

  # Download
  local tmpfile="$CACHE_DIR/.tmp_${name}.yml"
  local http_code
  http_code=$(curl -s -w "%{http_code}" -o "$tmpfile" "$url" 2>/dev/null) || true

  if [ "$http_code" != "200" ]; then
    warn "p/$name returned HTTP $http_code — marking as dead"
    rm -f "$tmpfile"
    echo "# DEAD: p/$name returned HTTP $http_code on $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$outfile.dead"
    return 0
  fi

  # Check if the YAML is empty (just "rules: []" or similar)
  local size
  size=$(wc -c < "$tmpfile" | tr -d ' ')
  if [ "$size" -lt 50 ]; then
    local content
    content=$(cat "$tmpfile")
    if [ "$content" = "rules: []" ] || [ "$size" -lt 20 ]; then
      warn "p/$name has empty rules ($size bytes) — marking as dead"
      rm -f "$tmpfile"
      echo "# EMPTY: p/$name returned empty rules on $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$outfile.dead"
      return 0
    fi
  fi

  # Validate it looks like Semgrep YAML
  if ! head -1 "$tmpfile" | grep -q "^rules:"; then
    warn "p/$name does not start with 'rules:' — not valid Semgrep YAML"
    rm -f "$tmpfile"
    return 1
  fi

  # Count rules
  local rule_count
  rule_count=$(grep -c "^- id:" "$tmpfile" 2>/dev/null || echo "0")

  # Move into place (atomic on same filesystem)
  mv "$tmpfile" "$outfile"

  # Update manifest
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)  $name  ${size}B  ${rule_count} rules  HTTP $http_code" >> "$MANIFEST"

  ok "p/$name — $rule_count rules, $size bytes"
  return 0
}

# ── Mode: download / refresh ─────────────────────────────────────────────
if [ "$MODE" = "download" ] || [ "$MODE" = "refresh" ]; then
  mkdir -p "$CACHE_DIR"

  echo ""
  echo "═══════════════════════════════════════════════════════════"
  if [ "$MODE" = "refresh" ]; then
    echo "  Refreshing ALL Semgrep registry packs (overwrite existing)"
  else
    echo "  Downloading Semgrep registry packs for offline use"
  fi
  echo "  Cache: $CACHE_DIR"
  echo "═══════════════════════════════════════════════════════════"
  echo ""

  # Clear manifest on refresh
  if [ "$MODE" = "refresh" ]; then
    rm -f "$MANIFEST"
  fi

  echo "Core security packs:"
  for pack in "${CORE_PACKS[@]}"; do
    download_pack "$pack"
  done

  echo ""
  echo "Language packs:"
  for pack in "${LANG_PACKS[@]}"; do
    download_pack "$pack"
  done

  echo ""
  echo "Framework packs:"
  for pack in "${FRAMEWORK_PACKS[@]}"; do
    download_pack "$pack"
  done

  echo ""
  echo "Infrastructure packs:"
  for pack in "${INFRA_PACKS[@]}"; do
    download_pack "$pack"
  done

  # Summary
  echo ""
  echo "───────────────────────────────────────────────────────────"
  cached_count=$(find "$CACHE_DIR" -name "*.yml" -size +50c 2>/dev/null | wc -l | tr -d ' ')
  dead_count=$(find "$CACHE_DIR" -name "*.dead" 2>/dev/null | wc -l | tr -d ' ')
  total_size=$(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1)
  echo "  Cached:    $cached_count packs ($total_size)"
  echo "  Dead/empty: $dead_count packs (skipped)"
  echo "  Location:  $CACHE_DIR"
  echo ""
  echo "  To use offline: ./semgrep-full-audit.sh --offline"
  echo "  To refresh:     ./cache-registry-packs.sh --refresh"
  echo "───────────────────────────────────────────────────────────"
  exit 0
fi

# ── Mode: status ─────────────────────────────────────────────────────────
if [ "$MODE" = "status" ]; then
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  Semgrep Registry Pack Cache Status"
  echo "  Location: $CACHE_DIR"
  echo "═══════════════════════════════════════════════════════════"
  echo ""

  if [ ! -d "$CACHE_DIR" ]; then
    err "Cache directory does not exist. Run: ./cache-registry-packs.sh"
    exit 1
  fi

  printf "  %-20s %10s %8s %s\n" "PACK" "SIZE" "RULES" "AGE"
  printf "  %-20s %10s %8s %s\n" "────────────────────" "──────────" "────────" "────────────"

  for yml in "$CACHE_DIR"/*.yml; do
    [ -f "$yml" ] || continue
    name=$(basename "$yml" .yml)
    size=$(wc -c < "$yml" | tr -d ' ')
    rules=$(grep -c "^- id:" "$yml" 2>/dev/null || echo "0")

    # Calculate age
    if [ "$(uname)" = "Darwin" ]; then
      mod_epoch=$(stat -f %m "$yml")
    else
      mod_epoch=$(stat -c %Y "$yml")
    fi
    now_epoch=$(date +%s)
    age_days=$(( (now_epoch - mod_epoch) / 86400 ))

    if [ "$age_days" -gt 30 ]; then
      age_str="${age_days}d ⚠️ STALE"
    else
      age_str="${age_days}d"
    fi

    printf "  %-20s %8s B %6s  %s\n" "$name" "$size" "$rules" "$age_str"
  done

  # Show dead packs
  dead_files=$(find "$CACHE_DIR" -name "*.dead" 2>/dev/null)
  if [ -n "$dead_files" ]; then
    echo ""
    echo "  Dead/empty packs (not usable):"
    for dead in "$CACHE_DIR"/*.dead; do
      [ -f "$dead" ] || continue
      name=$(basename "$dead" .yml.dead)
      reason=$(head -1 "$dead")
      echo "    ✗ $name — $reason"
    done
  fi

  echo ""
  total=$(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1)
  echo "  Total cache size: $total"
  echo ""
  exit 0
fi

# ── Mode: prune ──────────────────────────────────────────────────────────
if [ "$MODE" = "prune" ]; then
  echo ""
  echo "Pruning dead/empty packs from $CACHE_DIR"
  echo ""

  if [ ! -d "$CACHE_DIR" ]; then
    err "Cache directory does not exist."
    exit 1
  fi

  pruned=0

  # Remove .dead marker files
  for dead in "$CACHE_DIR"/*.dead; do
    [ -f "$dead" ] || continue
    name=$(basename "$dead")
    rm -f "$dead"
    ok "Removed $name"
    pruned=$((pruned + 1))
  done

  # Remove tiny/empty .yml files (< 50 bytes)
  for yml in "$CACHE_DIR"/*.yml; do
    [ -f "$yml" ] || continue
    size=$(wc -c < "$yml" | tr -d ' ')
    if [ "$size" -lt 50 ]; then
      name=$(basename "$yml")
      rm -f "$yml"
      ok "Removed $name ($size bytes — empty/broken)"
      pruned=$((pruned + 1))
    fi
  done

  echo ""
  echo "  Pruned $pruned files."
  exit 0
fi

echo "Unknown mode. Use --help for usage."
exit 1
