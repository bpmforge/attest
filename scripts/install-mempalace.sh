#!/bin/bash
#
# install-mempalace.sh — Install MemPalace and wire it into OpenCode
#
# Installs the mempalace pip package, runs init for the current project,
# and adds the MCP server entry to ~/.config/opencode/opencode.json.
#
# Usage:
#   ./scripts/install-mempalace.sh              Install for current project
#   ./scripts/install-mempalace.sh --help       Show this help
#

set -euo pipefail

for arg in "$@"; do
  case $arg in
    --help|-h)
      sed -n '3,12p' "$0" | sed 's/^# //'
      exit 0
      ;;
  esac
done

echo ""
echo "MemPalace installer for OpenCode"
echo "================================"
echo ""

# ── Preflight: Python 3.9+ ──────────────────────────────────────────────
if ! command -v python3 &> /dev/null; then
  echo "❌ python3 not found. Install Python 3.9+ first:"
  echo "   macOS:   brew install python"
  echo "   Linux:   apt install python3 python3-pip"
  exit 1
fi

py_version=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
py_major=$(python3 -c 'import sys; print(sys.version_info.major)')
py_minor=$(python3 -c 'import sys; print(sys.version_info.minor)')

if [ "$py_major" -lt 3 ] || { [ "$py_major" -eq 3 ] && [ "$py_minor" -lt 9 ]; }; then
  echo "❌ Python 3.9+ required, found $py_version"
  exit 1
fi
echo "  Python $py_version ✓"

# ── Install MemPalace ───────────────────────────────────────────────────
if python3 -c "import mempalace" 2>/dev/null; then
  installed_version=$(python3 -c "import mempalace; print(getattr(mempalace, '__version__', 'unknown'))" 2>/dev/null || echo "unknown")
  echo "  MemPalace already installed (version: $installed_version)"
else
  echo "  Installing mempalace via pip..."
  if command -v pipx &> /dev/null; then
    pipx install mempalace || { echo "❌ pipx install failed"; exit 1; }
  else
    python3 -m pip install --user mempalace || { echo "❌ pip install failed"; exit 1; }
  fi
  echo "  MemPalace installed ✓"
fi

# ── Verify mempalace CLI is on PATH ─────────────────────────────────────
if ! command -v mempalace &> /dev/null; then
  echo ""
  echo "⚠️  mempalace CLI installed but not on PATH."
  echo "   Add one of these to your shell rc file:"
  echo "     export PATH=\"\$HOME/.local/bin:\$PATH\"       # user pip install"
  echo "     export PATH=\"\$HOME/.pipx/bin:\$PATH\"        # pipx install"
  echo ""
  echo "   Then re-run this script."
  exit 1
fi
echo "  mempalace CLI on PATH ✓"

# ── Initialize MemPalace for current project ────────────────────────────
PROJECT_ROOT="${PWD}"
project_name=$(basename "$PROJECT_ROOT")

echo ""
echo "Initialize MemPalace for this project?"
echo "  Project:  $project_name"
echo "  Path:     $PROJECT_ROOT"
read -r -p "  Proceed? [Y/n] " response
response=${response:-Y}
if [[ "$response" =~ ^[Yy] ]]; then
  mempalace init "$PROJECT_ROOT" || { echo "⚠️  mempalace init failed (may already be initialized)"; }
  echo "  MemPalace initialized ✓"
else
  echo "  Skipped init — run manually: mempalace init $PROJECT_ROOT"
fi

# ── Merge into opencode.json ────────────────────────────────────────────
GLOBAL_CONFIG="$HOME/.config/opencode/opencode.json"
PROJECT_CONFIG="$PROJECT_ROOT/opencode.json"

echo ""
echo "Which OpenCode config should MemPalace be added to?"
echo "  1) Global  — $GLOBAL_CONFIG (all projects)"
echo "  2) Project — $PROJECT_CONFIG (this project only)"
echo "  3) Skip    — I'll add it manually"
read -r -p "  Choice [1/2/3]: " choice

case "$choice" in
  1) CONFIG_FILE="$GLOBAL_CONFIG" ;;
  2) CONFIG_FILE="$PROJECT_CONFIG" ;;
  *) echo "  Skipped. Add this to your opencode.json under 'mcp':"
     echo '    "mempalace": { "type": "local", "command": ["python", "-m", "mempalace.mcp_server"], "enabled": true }'
     exit 0
     ;;
esac

# Need jq for safe JSON merging
if ! command -v jq &> /dev/null; then
  echo ""
  echo "⚠️  jq not installed — cannot safely merge. Install jq first:"
  echo "   brew install jq   (macOS)"
  echo "   apt install jq    (Linux)"
  echo ""
  echo "Or add this manually to $CONFIG_FILE under 'mcp':"
  echo '    "mempalace": { "type": "local", "command": ["python", "-m", "mempalace.mcp_server"], "enabled": true }'
  exit 1
fi

if [ -f "$CONFIG_FILE" ]; then
  if jq -e '.mcp.mempalace' "$CONFIG_FILE" &> /dev/null; then
    echo "  MemPalace MCP already configured in $CONFIG_FILE"
  else
    jq '.mcp = (.mcp // {}) + {"mempalace": {"type": "local", "command": ["python", "-m", "mempalace.mcp_server"], "enabled": true}}' \
      "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
    echo "  Added MemPalace MCP to $CONFIG_FILE ✓"
  fi
else
  mkdir -p "$(dirname "$CONFIG_FILE")"
  cat > "$CONFIG_FILE" <<'JSONEOF'
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "mempalace": {
      "type": "local",
      "command": ["python", "-m", "mempalace.mcp_server"],
      "enabled": true
    }
  }
}
JSONEOF
  echo "  Created $CONFIG_FILE with MemPalace MCP ✓"
fi

# ── Final instructions ──────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║   MemPalace setup complete                        ║"
echo "╠═══════════════════════════════════════════════════╣"
echo "  Restart OpenCode to pick up the new MCP server."
echo ""
echo "  First session commands to try:"
echo "    'What do you know about this project?'"
echo "    'Search for prior decisions about auth'"
echo ""
echo "  To mine existing conversations or code:"
echo "    mempalace mine $PROJECT_ROOT                     (code/docs)"
echo "    mempalace mine ~/chats/ --mode convos            (chat exports)"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "⚠️  Do NOT enable AAAK mode or auto-save hooks yet:"
echo "   - AAAK currently regresses benchmarks (84.2% vs 96.6% raw)"
echo "   - Auto-save hooks have an unfixed shell injection (Issue #110)"
echo ""
