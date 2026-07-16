#!/bin/bash
#
# update-semgrep-rules.sh — Manage community Semgrep rule sources  [DEV-ONLY]
#
# ⚠ INTERNAL DEVELOPMENT USE ONLY. This clones third-party community rule
#   repos, SOME OF WHICH ARE AGPL-3.0 (e.g. trailofbits) or otherwise
#   license-restricted. These rules must NOT enter a client audit or SaaS
#   scan. The client-safe default path uses in-house bpm-rulepacks only; these
#   community sources are loaded exclusively behind `semgrep-full-audit.sh
#   --dev-registry` for local research/comparison.
#
# Clones, updates, verifies, and tests the community rule repositories used
# only under the deep audit tier's --dev-registry opt-in.
#
# Rules are cloned to ~/.semgrep/rules/<name>/ by default.
# Override with: export SEMGREP_COMMUNITY_CACHE=/your/path
#
# IMPORTANT — HOW COMMUNITY RULES WORK:
#   Community repos contain non-rule YAML files at their root (GitHub workflow
#   files, Makefiles, config files). Pointing semgrep at the repo root causes
#   parse errors. semgrep-full-audit.sh points at LANGUAGE SUBDIRECTORIES, not
#   repo roots. This script clones the full repos; the audit script picks the
#   right subdirs per language.
#
# Usage:
#   ./update-semgrep-rules.sh                Clone any missing sources
#   ./update-semgrep-rules.sh --test         Test each source's working subdirs
#   ./update-semgrep-rules.sh --verify       Verify sources match pinned commits
#   ./update-semgrep-rules.sh --bump         Pull latest + update lock file
#   ./update-semgrep-rules.sh --check-staleness  Warn on stale (> 90 days) sources
#   ./update-semgrep-rules.sh --cache-packs  Download registry packs for offline use
#   ./update-semgrep-rules.sh --help         Show this help
#
# Portable: works on macOS bash 3.2+ and Linux bash 4+.
#

set -euo pipefail

CACHE_DIR="${SEMGREP_COMMUNITY_CACHE:-$HOME/.semgrep/rules}"
LOCK_FILE="${PWD}/.semgrep/community-rules.lock"

# ── Community rule sources ─────────────────────────────────────────────
# Each entry: name, repo URL, notes
# Keep in sync with references/semgrep-community-rules.md
SOURCE_NAMES=(trailofbits elttam gitlab 0xdea)
SOURCE_REPOS=(
  "https://github.com/trailofbits/semgrep-rules"
  "https://github.com/elttam/semgrep-rules"
  "https://gitlab.com/gitlab-org/security-products/sast-rules"
  "https://github.com/0xdea/semgrep-rules"
)
SOURCE_NOTES=(
  "High-signal rules from security research firm — Go, Python, JS/TS, Dockerfile, Solidity"
  "Deep taint-tracking rules for JS/TS, Go, Java, PHP — use rules/ and rules-audit/ subdirs"
  "GitLab's commercial SAST rules — use language subdirs ONLY (javascript/, python/, go/ etc.)"
  "Memory safety rules for C/C++ only — use rules/ subdir"
)

MODE="clone"
for arg in "$@"; do
  case $arg in
    --test)             MODE="test" ;;
    --verify)           MODE="verify" ;;
    --bump)             MODE="bump" ;;
    --check-staleness)  MODE="staleness" ;;
    --cache-packs)      MODE="cache-packs" ;;
    --help|-h)
      sed -n '3,28p' "$0" | sed 's/^# //'
      exit 0
      ;;
  esac
done

mkdir -p "$CACHE_DIR"

log()  { echo "  $*"; }
warn() { echo "⚠️  $*" >&2; }
ok()   { echo "✓  $*"; }
err()  { echo "❌ $*" >&2; }

# ── Mode: clone (default — clone missing sources) ──────────────────────
if [ "$MODE" = "clone" ]; then
  echo ""
  echo "Cloning missing community Semgrep rule sources to $CACHE_DIR"
  echo ""
  i=0
  for name in "${SOURCE_NAMES[@]}"; do
    repo="${SOURCE_REPOS[$i]}"
    note="${SOURCE_NOTES[$i]}"
    target="$CACHE_DIR/$name"
    if [ -d "$target/.git" ]; then
      log "$name already cloned — skipping. Use --bump to pull latest."
    else
      log "Cloning $name from $repo..."
      log "  ($note)"
      if git clone --depth 1 "$repo" "$target" 2>&1 | tail -3; then
        ok "$name cloned to $target"
      else
        err "Failed to clone $name — check network or repo URL"
        i=$((i+1))
        continue
      fi
    fi
    i=$((i+1))
  done
  echo ""
  echo "Community rules ready. Run --test to validate working subdirs."
  echo "The audit script (scripts/semgrep-full-audit.sh) handles subdir"
  echo "selection automatically — do not point semgrep at repo roots."
  exit 0
fi

# ── Mode: test (validate each source's working subdirectories) ─────────
if [ "$MODE" = "test" ]; then
  if ! command -v semgrep &>/dev/null; then
    err "semgrep not installed — cannot test. Install: brew install semgrep"
    exit 1
  fi

  TMPDIR=$(mktemp -d)
  # Probe files that exercise multiple language rules
  cat > "$TMPDIR/probe.js" << 'PROBE_EOF'
const db = require('./db');
const { exec } = require('child_process');
const password = "hardcoded_secret_key";
exec(process.env.CMD || "ls");
db.query("SELECT * FROM users WHERE id = " + req.params.id);
PROBE_EOF
  cat > "$TMPDIR/probe.py" << 'PROBE_EOF'
import hashlib, subprocess
hashlib.md5(b"test")
subprocess.call(user_input, shell=True)
SECRET = "hardcoded"
PROBE_EOF
  cat > "$TMPDIR/probe.go" << 'PROBE_EOF'
package main
import "fmt"
func main() { fmt.Println("probe") }
PROBE_EOF
  cat > "$TMPDIR/probe.cs" << 'PROBE_EOF'
using System;
using System.Data.SqlClient;
class Test {
    void Run(string input) {
        var cmd = new SqlCommand("SELECT * FROM users WHERE id = " + input);
        string password = "hardcoded_password";
    }
}
PROBE_EOF
  cat > "$TMPDIR/probe.c" << 'PROBE_EOF'
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
void vulnerable(char *input) {
    char buf[64];
    strcpy(buf, input);
    printf(input);
    sprintf(buf, "%s", input);
}
PROBE_EOF
  cat > "$TMPDIR/probe.java" << 'PROBE_EOF'
import java.sql.*;
public class Test {
    void run(String input) throws Exception {
        Statement stmt = null;
        stmt.executeQuery("SELECT * FROM users WHERE id = " + input);
        String secret = "hardcoded_api_key";
    }
}
PROBE_EOF
  cat > "$TMPDIR/probe.kt" << 'PROBE_EOF'
import java.sql.*
fun run(input: String) {
    val stmt: Statement? = null
    stmt?.executeQuery("SELECT * FROM users WHERE id = $input")
    val secret = "hardcoded_api_key"
}
PROBE_EOF
  cat > "$TMPDIR/probe.swift" << 'PROBE_EOF'
import Foundation
let password = "hardcoded_secret"
let url = URL(string: "http://insecure.example.com")!
PROBE_EOF
  cat > "$TMPDIR/probe.rb" << 'PROBE_EOF'
require 'open-uri'
password = "hardcoded"
system(params[:cmd])
PROBE_EOF
  cat > "$TMPDIR/probe.php" << 'PROBE_EOF'
<?php
$password = "hardcoded";
$query = "SELECT * FROM users WHERE id = " . $_GET['id'];
system($_GET['cmd']);
?>
PROBE_EOF
  cat > "$TMPDIR/probe.scala" << 'PROBE_EOF'
object Test {
  val secret = "hardcoded_key"
  def run(input: String): Unit = {
    val query = s"SELECT * FROM users WHERE id = $input"
  }
}
PROBE_EOF
  cat > "$TMPDIR/probe.rs" << 'PROBE_EOF'
fn main() {
    let secret = "hardcoded_secret";
    unsafe {
        let ptr: *const i32 = std::ptr::null();
        let _val = *ptr;
    }
}
PROBE_EOF

  echo ""
  echo "Testing community Semgrep rule sources"
  echo "Semgrep version: $(semgrep --version)"
  echo ""

  probe_dir() {
    local dir="$1"
    [ -d "$dir" ] || { echo "MISSING"; return; }
    result=$(semgrep scan --config "$dir" --metrics=off --json "$TMPDIR" 2>/dev/null)
    rc=$?
    count=$(echo "$result" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(len(d.get('results',[])))" \
      2>/dev/null || echo "?")
    case $rc in
      0|1) echo "✓ ($count findings)" ;;
      2)   echo "✓ with warnings ($count findings — some rules had parse errors, scan ran)" ;;
      7)   echo "❌ PARSE ERROR (exit 7 — config invalid, scan did not run)" ;;
      *)   echo "❌ exit $rc" ;;
    esac
  }

  echo "=== trailofbits ($CACHE_DIR/trailofbits) ==="
  if [ -d "$CACHE_DIR/trailofbits" ]; then
    for d in "$CACHE_DIR/trailofbits"/*/; do
      name=$(basename "$d")
      [[ "$name" == ".github" ]] && continue
      [[ "$name" =~ \.(md|py|txt)$ ]] && continue
      [ -f "$d" ] && continue  # skip files, only dirs
      r=$(probe_dir "$d")
      echo "  $name: $r"
    done
  else
    warn "trailofbits not cloned. Run without flags to clone."
  fi

  echo ""
  echo "=== elttam ($CACHE_DIR/elttam) ==="
  if [ -d "$CACHE_DIR/elttam" ]; then
    echo "  rules/ subdirs:"
    if [ -d "$CACHE_DIR/elttam/rules" ]; then
      for d in "$CACHE_DIR/elttam/rules"/*/; do
        [ -d "$d" ] || continue
        name=$(basename "$d")
        r=$(probe_dir "$d")
        echo "    $name: $r"
      done
    fi
    echo "  rules-audit/ subdirs:"
    if [ -d "$CACHE_DIR/elttam/rules-audit" ]; then
      for d in "$CACHE_DIR/elttam/rules-audit"/*/; do
        [ -d "$d" ] || continue
        name=$(basename "$d")
        r=$(probe_dir "$d")
        echo "    $name: $r"
      done
    fi
  else
    warn "elttam not cloned. Run without flags to clone."
  fi

  echo ""
  echo "=== gitlab ($CACHE_DIR/gitlab) ==="
  if [ -d "$CACHE_DIR/gitlab" ]; then
    # Only test directories that look like language names
    for d in "$CACHE_DIR/gitlab"/*/; do
      [ -d "$d" ] || continue
      name=$(basename "$d")
      r=$(probe_dir "$d")
      echo "  $name: $r"
    done
  else
    warn "gitlab not cloned. Run without flags to clone."
  fi

  echo ""
  echo "=== 0xdea ($CACHE_DIR/0xdea) ==="
  if [ -d "$CACHE_DIR/0xdea" ]; then
    if [ -d "$CACHE_DIR/0xdea/rules" ]; then
      r=$(probe_dir "$CACHE_DIR/0xdea/rules")
      echo "  rules/: $r"
    fi
  else
    warn "0xdea not cloned. Run without flags to clone."
  fi

  rm -rf "$TMPDIR"
  echo ""
  echo "Legend:"
  echo "  ✓              = works cleanly"
  echo "  ✓ with warnings = scan ran, some individual rules had parse errors (still useful)"
  echo "  ❌ PARSE ERROR  = config entirely broken, scan did NOT run — exclude this dir"
  echo ""
  echo "semgrep-full-audit.sh uses only ✓ and ✓-with-warnings directories."
  exit 0
fi

# ── Mode: verify (check sources match pinned commits) ──────────────────
if [ "$MODE" = "verify" ]; then
  echo ""
  echo "Verifying community rules against pinned commits..."
  echo ""
  if [ ! -f "$LOCK_FILE" ]; then
    warn "No $LOCK_FILE found — nothing to verify."
    echo "   Run with --bump to create a lock file from current state."
    exit 1
  fi

  fail=0
  for name in "${SOURCE_NAMES[@]}"; do
    target="$CACHE_DIR/$name"
    if [ ! -d "$target/.git" ]; then
      err "$name not cloned. Run without flags to clone."
      fail=1
      continue
    fi

    pinned=$(awk -v n="$name" '
      $0 ~ "^  "n":" { in_block=1; next }
      in_block && $0 ~ "^  [a-z0-9]" && $0 !~ "^  "n":" { in_block=0 }
      in_block && $1 == "commit:" { print $2; exit }
    ' "$LOCK_FILE")

    current=$(git -C "$target" rev-parse HEAD 2>/dev/null)

    if [ -z "$pinned" ]; then
      warn "$name: no pinned commit in lock file"
      continue
    fi

    if [ "$pinned" = "$current" ]; then
      ok "$name: $current (matches pin)"
    else
      err "$name: current=$current, pinned=$pinned"
      echo "     Run --bump to update lock, or 'git -C $target checkout $pinned' to match pin"
      fail=1
    fi
  done

  echo ""
  [ $fail -eq 0 ] && { ok "All sources verified."; exit 0; }
  exit 1
fi

# ── Mode: bump (pull latest, update lock file) ─────────────────────────
if [ "$MODE" = "bump" ]; then
  echo ""
  echo "Pulling latest community rules and updating $LOCK_FILE..."
  echo ""
  mkdir -p "$(dirname "$LOCK_FILE")"

  today=$(date '+%Y-%m-%d')
  {
    echo "# Semgrep community rule pinning"
    echo "# Last bumped: $today"
    echo "# Generated by scripts/update-semgrep-rules.sh --bump"
    echo "#"
    echo "# NOTE: Semgrep must be pointed at LANGUAGE SUBDIRS, not repo roots."
    echo "# See scripts/semgrep-full-audit.sh for the correct --config paths."
    echo ""
    echo "sources:"
  } > "$LOCK_FILE.new"

  i=0
  for name in "${SOURCE_NAMES[@]}"; do
    repo="${SOURCE_REPOS[$i]}"
    target="$CACHE_DIR/$name"

    if [ ! -d "$target/.git" ]; then
      log "$name not cloned yet — cloning..."
      git clone --depth 1 "$repo" "$target" 2>&1 | tail -2 || { err "Failed to clone $name"; i=$((i+1)); continue; }
    else
      log "Pulling latest for $name..."
      git -C "$target" fetch --depth 1 origin 2>&1 | tail -2 || { err "Fetch failed for $name"; i=$((i+1)); continue; }
      git -C "$target" reset --hard origin/HEAD 2>&1 | tail -2 || { err "Reset failed for $name"; i=$((i+1)); continue; }
    fi

    commit=$(git -C "$target" rev-parse HEAD)
    last_upstream=$(git -C "$target" log -1 --format=%cd --date=short HEAD)

    {
      echo "  $name:"
      echo "    repo: $repo"
      echo "    commit: $commit"
      echo "    pinned_at: $today"
      echo "    upstream_last_commit: $last_upstream"
    } >> "$LOCK_FILE.new"

    ok "$name: $commit (upstream $last_upstream)"
    i=$((i+1))
  done

  mv "$LOCK_FILE.new" "$LOCK_FILE"
  echo ""
  ok "Lock file updated: $LOCK_FILE"
  echo ""
  echo "Next: run --test to verify working subdirectories, then run a full"
  echo "security audit and compare finding count against the prior audit."
  echo "Triage any new findings in docs/security/TRIAGE.md."
  exit 0
fi

# ── Mode: check-staleness ──────────────────────────────────────────────
if [ "$MODE" = "staleness" ]; then
  echo ""
  echo "Checking staleness of community rule sources..."
  echo "  WARN threshold:  90 days since upstream commit"
  echo "  FAIL threshold:  180 days since upstream commit"
  echo ""

  fail=0
  for name in "${SOURCE_NAMES[@]}"; do
    target="$CACHE_DIR/$name"
    if [ ! -d "$target/.git" ]; then
      warn "$name not cloned — skipping"
      continue
    fi

    git -C "$target" fetch --depth 1 origin 2>/dev/null || { warn "$name: fetch failed"; continue; }

    last_commit_epoch=$(git -C "$target" log -1 --format=%ct origin/HEAD 2>/dev/null || echo 0)
    now_epoch=$(date +%s)
    days_stale=$(( (now_epoch - last_commit_epoch) / 86400 ))
    last_date=$(git -C "$target" log -1 --format=%cd --date=short origin/HEAD 2>/dev/null)

    if [ "$days_stale" -gt 180 ]; then
      err "$name: $days_stale days stale (last commit $last_date) — ABANDONED? Consider removing."
      fail=1
    elif [ "$days_stale" -gt 90 ]; then
      warn "$name: $days_stale days stale (last commit $last_date) — consider bumping soon"
    else
      ok "$name: $days_stale days since last upstream commit ($last_date)"
    fi
  done

  echo ""
  [ $fail -eq 0 ] && { ok "No sources past FAIL threshold."; exit 0; }
  err "Some sources past FAIL threshold."
  exit 1
fi

# ── Mode: cache-packs (download registry packs for offline use) ────────
if [ "$MODE" = "cache-packs" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  CACHE_SCRIPT="$SCRIPT_DIR/cache-registry-packs.sh"
  if [ ! -f "$CACHE_SCRIPT" ]; then
    err "cache-registry-packs.sh not found at $CACHE_SCRIPT"
    exit 1
  fi
  echo ""
  echo "Delegating to cache-registry-packs.sh..."
  echo "(Run scripts/cache-registry-packs.sh --help for advanced options)"
  echo ""
  exec "$CACHE_SCRIPT" "$@"
fi
