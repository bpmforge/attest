#!/usr/bin/env bash
#
# migrate-remove-pullmd.sh — v2.2.1 upgrade migration.
#
# pullmd (the external AeternaLabsHQ Docker service) was removed in v2.2.0 and replaced by our
# own in-house pull (bpm-pull, shipped inside playwright-search). This script HEALS an install
# that previously ran `./install.sh --pullmd`, which the v2.2.0 installer no longer touches:
#
#   1. Removes the stale `mcp.pullmd` entry from opencode.json. Left in place, opencode tries to
#      reach http://localhost:33000/mcp on startup and throws MCP errors, because nothing manages
#      that container anymore.
#   2. Stops + removes the pullmd Docker/Podman containers (pullmd, pullmd-trafilatura,
#      pullmd-playwright).
#   3. Leaves the clone (~/.local/share/pullmd) in place unless you pass --purge.
#
# Idempotent and best-effort: safe to run any number of times, and a no-op (exit 0) when there was
# no prior pullmd install. install.sh calls it automatically on every install/upgrade; you can also
# run it standalone.
#
# Usage: migrate-remove-pullmd.sh [--purge] [--config <path>]
#   --purge          also delete the clone dir (~/.local/share/pullmd)
#   --config <path>  target a specific opencode.json (default: $HOME/.config/opencode/opencode.json)

set -u

PURGE=false
GLOBAL_DIR="${GLOBAL_DIR:-$HOME/.config/opencode}"
CONFIG_FILE="$GLOBAL_DIR/opencode.json"
PULLMD_DIR="${PULLMD_DIR:-$HOME/.local/share/pullmd}"

while [ $# -gt 0 ]; do
  case "$1" in
    --purge)  PURGE=true ;;
    --config) CONFIG_FILE="${2:-}"; shift ;;
    *) ;;
  esac
  shift
done

did=0

# 1. opencode.json — drop the stale pullmd MCP entry ------------------------------------------
if [ -f "$CONFIG_FILE" ]; then
  if command -v jq >/dev/null 2>&1; then
    if jq -e '.mcp.pullmd' "$CONFIG_FILE" >/dev/null 2>&1; then
      cp "$CONFIG_FILE" "${CONFIG_FILE}.pre-pullmd-removal.bak"
      if jq 'del(.mcp.pullmd)' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" 2>/dev/null; then
        mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
        echo "  ✓ removed stale pullmd MCP entry from $CONFIG_FILE"
        echo "    (backup: ${CONFIG_FILE}.pre-pullmd-removal.bak)"
        did=1
      else
        rm -f "${CONFIG_FILE}.tmp"
        echo "  ⚠️  could not rewrite $CONFIG_FILE — remove the \"pullmd\": { ... } block under \"mcp\" by hand."
      fi
    fi
  elif grep -q '"pullmd"' "$CONFIG_FILE" 2>/dev/null; then
    echo "  ⚠️  $CONFIG_FILE has a pullmd MCP entry but jq is not installed."
    echo "     Remove the \"pullmd\": { ... } block under \"mcp\" manually, or 'brew install jq' and re-run."
  fi
fi

# 2. Containers — stop + remove (best-effort; docker then podman) -----------------------------
for engine in docker podman; do
  command -v "$engine" >/dev/null 2>&1 || continue
  names="$("$engine" ps -a --filter name=pullmd --format '{{.Names}}' 2>/dev/null)"
  [ -z "$names" ] && continue
  if [ -f "$PULLMD_DIR/docker-compose.yml" ]; then
    ( cd "$PULLMD_DIR" && "$engine" compose down >/dev/null 2>&1 ) || true
  fi
  # remove any remaining pullmd-named containers directly
  printf '%s\n' "$names" | while IFS= read -r n; do
    [ -n "$n" ] && "$engine" rm -f "$n" >/dev/null 2>&1
  done
  echo "  ✓ stopped + removed pullmd $engine container(s)"
  did=1
done

# 3. Clone dir --------------------------------------------------------------------------------
if [ -d "$PULLMD_DIR" ]; then
  if [ "$PURGE" = true ]; then
    rm -rf "$PULLMD_DIR" && { echo "  ✓ removed pullmd clone $PULLMD_DIR"; did=1; }
  else
    echo "  •  pullmd clone still at $PULLMD_DIR — re-run with --purge to delete it (left in place by default)."
  fi
fi

if [ "$did" -eq 0 ]; then
  echo "  ✓ no prior pullmd install detected — nothing to clean."
else
  echo "  pullmd cleanup complete. Web research now uses the in-house pull inside playwright-search."
fi
exit 0
