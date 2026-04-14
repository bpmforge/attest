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
#   ./semgrep-full-audit.sh --offline      Use cached registry packs only (no network)
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
OFFLINE=false
BASELINE=""

for arg in "$@"; do
  case $arg in
    --fast)            MODE="fast" ;;
    --autofix)         AUTOFIX=true ;;
    --autofix-dryrun)  AUTOFIX_DRYRUN=true ;;
    --offline)         OFFLINE=true ;;
    --baseline)        shift; BASELINE="${1:-}"; break ;;
    --help|-h)
      sed -n '3,21p' "$0" | sed 's/^# //'
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

# Registry pack cache — where cache-registry-packs.sh downloads YAML files.
# Used in add_registry_pack() to prefer local files over network requests.
# Override with: export SEMGREP_REGISTRY_CACHE=/your/path
REGISTRY_CACHE="${SEMGREP_REGISTRY_CACHE:-$HOME/.semgrep/registry-cache}"

if [ "$OFFLINE" = "true" ]; then
  if [ ! -d "$REGISTRY_CACHE" ] || [ -z "$(find "$REGISTRY_CACHE" -name '*.yml' -maxdepth 1 2>/dev/null | head -1)" ]; then
    echo "❌ --offline requires cached registry packs, but none found at:"
    echo "   $REGISTRY_CACHE"
    echo ""
    echo "   Run first:  scripts/cache-registry-packs.sh"
    echo "   Then retry:  scripts/semgrep-full-audit.sh --offline"
    exit 1
  fi
  echo "📦 Offline mode — using cached registry packs from $REGISTRY_CACHE"
fi

# ── Helper: resolve a registry pack to a config path ──────────────────
# Checks for a cached local YAML file first. Falls back to the live
# registry reference (p/<name>) unless --offline is set.
#
# Returns the resolved config path on stdout. Returns 1 if unavailable.
resolve_registry_pack() {
  local pack="$1"          # e.g. "p/javascript"
  local name="${pack#p/}"  # strip "p/" prefix → "javascript"
  local cached="$REGISTRY_CACHE/${name}.yml"

  # 1. Check local cache
  if [ -f "$cached" ]; then
    local size
    size=$(wc -c < "$cached" | tr -d ' ')
    if [ "$size" -gt 50 ]; then
      echo "$cached"
      return 0
    fi
    # Cached file exists but is empty/broken — fall through
  fi

  # 2. Offline mode — cache is the ONLY option
  if [ "$OFFLINE" = "true" ]; then
    return 1
  fi

  # 3. Online mode — probe the live registry pack
  echo "$pack"
  return 0
}

# ── Helper: probe a registry pack ─────────────────────────────────────
# Returns 0 (usable) or 1 (unavailable/404) without crashing the script.
# Writes a tiny dry-run against a temp file to test if the pack resolves.
probe_registry_pack() {
  local config="$1"
  # Skip probing for local YAML files — they've already been validated
  # by cache-registry-packs.sh. Only probe live p/ references.
  if [ -f "$config" ]; then
    return 0
  fi
  # semgrep exits 7 on config errors (including HTTP 404).
  local tmpdir
  tmpdir=$(mktemp -d)
  echo "// probe" > "$tmpdir/probe.js"
  semgrep scan --config "$config" --metrics=off --json -o /dev/null "$tmpdir" \
    2>/dev/null
  local rc=$?
  rm -rf "$tmpdir"
  # 0 = no findings, 1 = findings, 2 = findings+errors — all mean "pack loaded OK"
  # 7 = config error (404, YAML parse failure) — pack is unusable
  [ "$rc" -ne 7 ]
}

# ── Helper: add registry pack with cache + probe ──────────────────────
# Resolution order:
#   1. Local cache file (REGISTRY_CACHE/<name>.yml) — preferred, no network
#   2. Live registry reference (p/<name>) — probed, skipped on 404
#   3. --offline mode: only option 1, fail silently if missing
add_registry_pack() {
  local pack="$1"
  local config
  config=$(resolve_registry_pack "$pack") || {
    if [ "$OFFLINE" = "true" ]; then
      echo "  ⚠️  '$pack' not in offline cache — skipping"
    fi
    SKIPPED_PACKS+=("$pack")
    return 0
  }

  if probe_registry_pack "$config"; then
    CONFIGS+=(--config "$config")
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

# ── Language auto-detection (POLYGLOT — detects ALL languages present) ──
#
# DESIGN: Uses individual `if` blocks (NOT elif) so polyglot repos get
# rules for EVERY language present. A .NET backend + React frontend
# gets both p/csharp AND p/javascript rules.
#
# LANGS is an array of all detected languages. Used later for:
#   - Community rule selection (one call per detected language)
#   - Summary display
#   - LANG is set to the "primary" (first detected) for backward compat
#
LANGS=()
LANG=""

# ── JavaScript / TypeScript ────────────────────────────────────────────
if [ -f "$PROJECT_ROOT/package.json" ] || \
   find "$PROJECT_ROOT" -maxdepth 2 \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) -print -quit 2>/dev/null | grep -q .; then
  add_registry_pack "p/javascript"
  [ "$MODE" = "deep" ] && add_registry_pack "p/typescript"
  [ "$MODE" = "deep" ] && add_registry_pack "p/nodejsscan"
  LANGS+=(javascript)
fi

# ── Python ─────────────────────────────────────────────────────────────
if [ -f "$PROJECT_ROOT/requirements.txt" ] || [ -f "$PROJECT_ROOT/pyproject.toml" ] || \
   [ -f "$PROJECT_ROOT/setup.py" ] || [ -f "$PROJECT_ROOT/Pipfile" ] || \
   find "$PROJECT_ROOT" -maxdepth 2 -name '*.py' -print -quit 2>/dev/null | grep -q .; then
  add_registry_pack "p/python"
  [ "$MODE" = "deep" ] && add_registry_pack "p/bandit"
  LANGS+=(python)
fi

# ── Go ─────────────────────────────────────────────────────────────────
if [ -f "$PROJECT_ROOT/go.mod" ] || \
   find "$PROJECT_ROOT" -maxdepth 2 -name '*.go' -print -quit 2>/dev/null | grep -q .; then
  add_registry_pack "p/golang"
  [ "$MODE" = "deep" ] && add_registry_pack "p/gosec"
  LANGS+=(go)
fi

# ── Rust ───────────────────────────────────────────────────────────────
if [ -f "$PROJECT_ROOT/Cargo.toml" ] || \
   find "$PROJECT_ROOT" -maxdepth 2 -name '*.rs' -print -quit 2>/dev/null | grep -q .; then
  add_registry_pack "p/rust"
  LANGS+=(rust)
fi

# ── Java ───────────────────────────────────────────────────────────────
if [ -f "$PROJECT_ROOT/pom.xml" ] || [ -f "$PROJECT_ROOT/build.gradle" ] || \
   find "$PROJECT_ROOT" -maxdepth 3 -name '*.java' -print -quit 2>/dev/null | grep -q .; then
  add_registry_pack "p/java"
  LANGS+=(java)
fi

# ── Kotlin (Android, Spring, multiplatform) ────────────────────────────
if [ -f "$PROJECT_ROOT/build.gradle.kts" ] || \
   find "$PROJECT_ROOT" -maxdepth 3 \( -name '*.kt' -o -name '*.kts' \) -print -quit 2>/dev/null | grep -q .; then
  add_registry_pack "p/kotlin"
  LANGS+=(kotlin)
  # If Java wasn't already detected, Kotlin projects often have Java too
  if ! printf '%s\n' "${LANGS[@]}" | grep -q '^java$'; then
    add_registry_pack "p/java"
    LANGS+=(java)
  fi
fi

# ── C# / .NET ─────────────────────────────────────────────────────────
if find "$PROJECT_ROOT" -maxdepth 3 -name '*.csproj' -print -quit 2>/dev/null | grep -q . || \
   find "$PROJECT_ROOT" -maxdepth 2 -name '*.sln' -print -quit 2>/dev/null | grep -q . || \
   [ -f "$PROJECT_ROOT/global.json" ] || \
   find "$PROJECT_ROOT" -maxdepth 3 -name '*.cs' -print -quit 2>/dev/null | grep -q .; then
  add_registry_pack "p/csharp"
  LANGS+=(csharp)
fi

# ── C / C++ ────────────────────────────────────────────────────────────
if [ -f "$PROJECT_ROOT/CMakeLists.txt" ] || \
   [ -f "$PROJECT_ROOT/Makefile" ] || [ -f "$PROJECT_ROOT/configure.ac" ] || \
   [ -f "$PROJECT_ROOT/meson.build" ] || \
   find "$PROJECT_ROOT" -maxdepth 3 \( -name '*.c' -o -name '*.cpp' -o -name '*.cc' -o -name '*.cxx' -o -name '*.h' -o -name '*.hpp' \) -print -quit 2>/dev/null | grep -q .; then
  add_registry_pack "p/c"
  # Note: p/cpp is dead (HTTP 404 as of 2026-04-13). p/c covers both C and C++ files
  # but has only 2 rules. The cpp-bridge rules below fill the critical gap.
  #
  # Load cpp-bridge rules — high-signal custom rules for buffer overflow, format
  # string, memory safety, command injection, and crypto weakness in C/C++ code.
  # These target languages: [c, cpp] and fire on both .c and .cpp files.
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  CPP_BRIDGE_DIR="$(dirname "$SCRIPT_DIR")/.semgrep/cpp-bridge-rules"
  if [ -d "$CPP_BRIDGE_DIR" ]; then
    add_community_dir "cpp-bridge" "$CPP_BRIDGE_DIR"
  fi
  LANGS+=(c)
fi

# ── Swift (iOS, macOS, server-side Swift) ──────────────────────────────
if [ -f "$PROJECT_ROOT/Package.swift" ] || \
   find "$PROJECT_ROOT" -maxdepth 2 -name '*.xcodeproj' -print -quit 2>/dev/null | grep -q . || \
   find "$PROJECT_ROOT" -maxdepth 2 -name '*.xcworkspace' -print -quit 2>/dev/null | grep -q . || \
   [ -f "$PROJECT_ROOT/Podfile" ] || \
   find "$PROJECT_ROOT" -maxdepth 3 -name '*.swift' -print -quit 2>/dev/null | grep -q .; then
  add_registry_pack "p/swift"
  LANGS+=(swift)
fi

# ── Ruby ───────────────────────────────────────────────────────────────
if [ -f "$PROJECT_ROOT/Gemfile" ] || \
   find "$PROJECT_ROOT" -maxdepth 2 -name '*.rb' -print -quit 2>/dev/null | grep -q .; then
  add_registry_pack "p/ruby"
  [ "$MODE" = "deep" ] && add_registry_pack "p/brakeman"
  LANGS+=(ruby)
fi

# ── PHP ────────────────────────────────────────────────────────────────
if [ -f "$PROJECT_ROOT/composer.json" ] || \
   find "$PROJECT_ROOT" -maxdepth 2 -name '*.php' -print -quit 2>/dev/null | grep -q .; then
  add_registry_pack "p/php"
  LANGS+=(php)
fi

# ── Scala ──────────────────────────────────────────────────────────────
if [ -f "$PROJECT_ROOT/build.sbt" ] || \
   find "$PROJECT_ROOT" -maxdepth 3 -name '*.scala' -print -quit 2>/dev/null | grep -q .; then
  add_registry_pack "p/scala"
  LANGS+=(scala)
fi

# Set LANG to first detected language for backward compatibility
if [ ${#LANGS[@]} -gt 0 ]; then
  LANG="${LANGS[0]}"
fi

# ── Framework auto-detection (deep mode only) ──────────────────────────
# Runs for ALL detected languages, not just the primary.

if [ "$MODE" = "deep" ]; then

  # JavaScript / Node.js frameworks
  if [ -f "$PROJECT_ROOT/package.json" ]; then
    if grep -q '"express"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
      add_registry_pack "p/express"
    fi
    if grep -q '"next"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
      add_registry_pack "p/nextjs"
    fi
    if grep -q '"react"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
      add_registry_pack "p/react"
    fi
    if grep -q '"fastify"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
      add_registry_pack "p/nodejsscan"  # nodejsscan covers fastify too
    fi
  fi

  # Python frameworks
  for pyreqs in "$PROJECT_ROOT/requirements.txt" "$PROJECT_ROOT/pyproject.toml" "$PROJECT_ROOT/Pipfile"; do
    if [ -f "$pyreqs" ]; then
      if grep -qi 'django' "$pyreqs" 2>/dev/null; then
        add_registry_pack "p/django"
      fi
      if grep -qi 'flask' "$pyreqs" 2>/dev/null; then
        add_registry_pack "p/flask"
      fi
      if grep -qi 'fastapi' "$pyreqs" 2>/dev/null; then
        add_registry_pack "p/fastapi"
      fi
    fi
  done

  # Ruby frameworks
  if [ -f "$PROJECT_ROOT/Gemfile" ]; then
    if grep -q 'rails' "$PROJECT_ROOT/Gemfile" 2>/dev/null; then
      add_registry_pack "p/rails"
    fi
  fi

  # Go frameworks
  if [ -f "$PROJECT_ROOT/go.mod" ]; then
    if grep -q 'gin-gonic/gin' "$PROJECT_ROOT/go.mod" 2>/dev/null; then
      add_registry_pack "p/gin"
    fi
  fi

  # Java / Kotlin frameworks
  for buildfile in "$PROJECT_ROOT/pom.xml" "$PROJECT_ROOT/build.gradle" "$PROJECT_ROOT/build.gradle.kts"; do
    if [ -f "$buildfile" ]; then
      if grep -qi 'spring' "$buildfile" 2>/dev/null; then
        add_registry_pack "p/spring"
      fi
    fi
  done

  # .NET / C# frameworks (ASP.NET, Blazor, etc.)
  # Semgrep's p/csharp covers most .NET patterns; framework-specific packs
  # are added here if they exist in the registry.
  if printf '%s\n' "${LANGS[@]}" 2>/dev/null | grep -q '^csharp$'; then
    # Check for ASP.NET (web framework) markers
    if find "$PROJECT_ROOT" -maxdepth 3 -name 'Startup.cs' -o -name 'Program.cs' -print -quit 2>/dev/null | grep -q .; then
      # p/csharp already loaded; ASP.NET-specific packs would go here if registry adds them
      true
    fi
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

# Track which community rule dirs we've already added to avoid duplicates
COMMUNITY_DIRS_ADDED=()

community_dir_already_added() {
  local dir="$1"
  for d in "${COMMUNITY_DIRS_ADDED[@]+"${COMMUNITY_DIRS_ADDED[@]}"}"; do
    [ "$d" = "$dir" ] && return 0
  done
  return 1
}

add_community_rules_for_lang() {
  local lang="$1"

  # trailofbits language subdir (each language dir is self-contained)
  if ! community_dir_already_added "trailofbits/$lang"; then
    add_community_dir "trailofbits/$lang" "$CACHE_DIR/trailofbits/$lang"
    COMMUNITY_DIRS_ADDED+=("trailofbits/$lang")
  fi

  # trailofbits/generic — language-agnostic rules (add once, not per language)
  if ! community_dir_already_added "trailofbits/generic"; then
    add_community_dir "trailofbits/generic" "$CACHE_DIR/trailofbits/generic"
    COMMUNITY_DIRS_ADDED+=("trailofbits/generic")
  fi

  # elttam has two rule collections; add both for the detected language
  # Language name mapping: some community repos use different names
  local elttam_lang="$lang"
  case "$lang" in
    # elttam uses "c" not "cpp" — C/C++ rules are under c/
    c) elttam_lang="c" ;;
  esac

  if ! community_dir_already_added "elttam/rules/$elttam_lang"; then
    add_community_dir "elttam/rules/$elttam_lang"       "$CACHE_DIR/elttam/rules/$elttam_lang"
    COMMUNITY_DIRS_ADDED+=("elttam/rules/$elttam_lang")
  fi
  if ! community_dir_already_added "elttam/rules-audit/$elttam_lang"; then
    add_community_dir "elttam/rules-audit/$elttam_lang" "$CACHE_DIR/elttam/rules-audit/$elttam_lang"
    COMMUNITY_DIRS_ADDED+=("elttam/rules-audit/$elttam_lang")
  fi

  # gitlab language subdir — only well-known working subdirs
  local gitlab_lang="$lang"
  case "$lang" in
    javascript|python|go|java|c|csharp|scala)
      if ! community_dir_already_added "gitlab/$gitlab_lang"; then
        add_community_dir "gitlab/$gitlab_lang" "$CACHE_DIR/gitlab/$gitlab_lang"
        COMMUNITY_DIRS_ADDED+=("gitlab/$gitlab_lang")
      fi
      ;;
  esac
}

if [ "$MODE" = "deep" ]; then
  if [ -d "$CACHE_DIR/trailofbits" ] || [ -d "$CACHE_DIR/elttam" ] || [ -d "$CACHE_DIR/gitlab" ]; then
    # Add community rules for EVERY detected language (polyglot support)
    for detected_lang in "${LANGS[@]+"${LANGS[@]}"}"; do
      add_community_rules_for_lang "$detected_lang"

      # Kotlin shares many patterns with Java — add Java community rules too
      if [ "$detected_lang" = "kotlin" ]; then
        add_community_rules_for_lang "java"
        # elttam has kotlin-specific rules
        if ! community_dir_already_added "elttam/rules-audit/kotlin"; then
          add_community_dir "elttam/rules-audit/kotlin" "$CACHE_DIR/elttam/rules-audit/kotlin"
          COMMUNITY_DIRS_ADDED+=("elttam/rules-audit/kotlin")
        fi
      fi

      # Swift — trailofbits has swift-specific rules
      if [ "$detected_lang" = "swift" ]; then
        if ! community_dir_already_added "trailofbits/swift"; then
          add_community_dir "trailofbits/swift" "$CACHE_DIR/trailofbits/swift"
          COMMUNITY_DIRS_ADDED+=("trailofbits/swift")
        fi
      fi
    done

    # 0xdea: C/C++ memory safety rules — add if C/C++ detected
    if [ -d "$CACHE_DIR/0xdea/rules" ]; then
      if printf '%s\n' "${LANGS[@]+"${LANGS[@]}"}" | grep -q '^c$'; then
        if ! community_dir_already_added "0xdea/rules"; then
          add_community_dir "0xdea/rules" "$CACHE_DIR/0xdea/rules"
          COMMUNITY_DIRS_ADDED+=("0xdea/rules")
        fi
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

# ── Language-specific custom gap-filler rules ──────────────────────────
#
# These fill OWASP Top 10 coverage gaps in registry packs with thin coverage.
# Each file targets one language and contains rules that the registry pack lacks:
#   kotlin-security.yml  — 16 rules (p/kotlin only has 10, all crypto)
#   swift-security.yml   — 17 rules (p/swift only has 2)
#   rust-security.yml    — 15 rules (p/rust only has 11, SSL/unsafe focused)
#   php-security.yml     — 15 rules (p/php missing upload, unserialize, LFI)
#   csharp-security.yml  — 20 rules (p/csharp missing cmd injection, SSRF, XSS)
#
# C/C++ gap-filler rules are loaded separately above (cpp-bridge-rules/).
# Custom gap-filler rules for all supported languages
CUSTOM_RULES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CUSTOM_RULES_DIR="$(dirname "$CUSTOM_RULES_DIR")/.semgrep/custom-rules"
CUSTOM_RULES_LOADED=0

if [ -d "$CUSTOM_RULES_DIR" ]; then
  # Map LANGS array values → custom rule filenames
  for lang in "${LANGS[@]+"${LANGS[@]}"}"; do
    custom_file=""
    case "$lang" in
      javascript|typescript) custom_file="$CUSTOM_RULES_DIR/javascript-security.yml" ;;
      python)  custom_file="$CUSTOM_RULES_DIR/python-security.yml" ;;
      go)      custom_file="$CUSTOM_RULES_DIR/go-security.yml" ;;
      java)    custom_file="$CUSTOM_RULES_DIR/java-security.yml" ;;
      kotlin)  custom_file="$CUSTOM_RULES_DIR/kotlin-security.yml" ;;
      swift)   custom_file="$CUSTOM_RULES_DIR/swift-security.yml" ;;
      rust)    custom_file="$CUSTOM_RULES_DIR/rust-security.yml" ;;
      php)     custom_file="$CUSTOM_RULES_DIR/php-security.yml" ;;
      csharp)  custom_file="$CUSTOM_RULES_DIR/csharp-security.yml" ;;
      ruby)    custom_file="$CUSTOM_RULES_DIR/ruby-security.yml" ;;
    esac
    if [ -n "$custom_file" ] && [ -f "$custom_file" ]; then
      CONFIGS+=(--config "$custom_file")
      CUSTOM_RULES_LOADED=$((CUSTOM_RULES_LOADED + 1))
    fi
  done
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
if [ ${#LANGS[@]} -gt 0 ]; then
  echo "  Languages: ${LANGS[*]}"
else
  echo "  Languages: unknown (no language markers detected)"
fi
echo "  Configs:   ${#CONFIGS[@]} rule sources"
if [ "$OFFLINE" = "true" ]; then
  echo "  Mode:      OFFLINE (cached packs from $REGISTRY_CACHE)"
elif [ -d "$REGISTRY_CACHE" ] && [ -n "$(find "$REGISTRY_CACHE" -name '*.yml' -maxdepth 1 2>/dev/null | head -1)" ]; then
  # Count how many configs are using cached files vs live packs
  cached_used=0
  for cfg in "${CONFIGS[@]}"; do
    if [ "$cfg" = "--config" ]; then continue; fi
    case "$cfg" in
      "$REGISTRY_CACHE"*) cached_used=$((cached_used + 1)) ;;
    esac
  done
  if [ "$cached_used" -gt 0 ]; then
    echo "  Cache:     $cached_used packs loaded from local cache"
  fi
fi
if [ "$CUSTOM_RULES_LOADED" -gt 0 ]; then
  echo "  Custom:    $CUSTOM_RULES_LOADED language gap-filler ruleset(s) loaded"
fi
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
