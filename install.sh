#!/bin/bash
set -e

# BPM OpenCode Experts — Installation Script
# Usage:
#   ./install.sh              Install globally to ~/.config/opencode/
#   ./install.sh --project    Install to current project's .opencode/
#   ./install.sh --link       Symlink instead of copy (for development)
#   ./install.sh --uninstall  Remove installed files

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GLOBAL_DIR="$HOME/.config/opencode"
PROJECT_DIR=".opencode"

MODE="global"
METHOD="copy"

for arg in "$@"; do
  case $arg in
    --project)  MODE="project" ;;
    --link)     METHOD="link" ;;
    --uninstall) MODE="uninstall" ;;
    --help|-h)
      echo "BPM OpenCode Experts — Installation"
      echo ""
      echo "Usage:"
      echo "  ./install.sh              Install globally to ~/.config/opencode/"
      echo "  ./install.sh --project    Install to .opencode/ in current directory"
      echo "  ./install.sh --link       Symlink instead of copy (for development)"
      echo "  ./install.sh --uninstall  Remove installed files"
      exit 0
      ;;
  esac
done

if [ "$MODE" = "uninstall" ]; then
  echo "Removing BPM OpenCode Experts..."
  for dir in agents skills commands references; do
    rm -rf "$GLOBAL_DIR/$dir"
    rm -rf "$PROJECT_DIR/$dir"
  done
  echo "Done. Removed from both global and project locations."
  exit 0
fi

if [ "$MODE" = "project" ]; then
  DEST="$PROJECT_DIR"
else
  DEST="$GLOBAL_DIR"
fi

echo "Installing BPM OpenCode Experts to $DEST/"
echo "Method: $METHOD"
echo ""

DIRS="agents skills commands references"

for dir in $DIRS; do
  # Clean out existing directory first (fresh install every time)
  if [ -d "$DEST/$dir" ]; then
    rm -rf "$DEST/$dir"
  fi
  mkdir -p "$DEST/$dir"

  if [ "$METHOD" = "link" ]; then
    # Remove and symlink
    rm -rf "$DEST/$dir"
    ln -sf "$SCRIPT_DIR/$dir" "$DEST/$dir"
    echo "  Linked $dir/ → $DEST/$dir/"
  else
    # Copy files
    cp -r "$SCRIPT_DIR/$dir/"* "$DEST/$dir/" 2>/dev/null || true
    count=$(ls -1 "$SCRIPT_DIR/$dir/"*.md 2>/dev/null | wc -l | tr -d ' ')
    echo "  Copied $dir/ ($count files) → $DEST/$dir/"
  fi
done

echo ""

# --- Context7 MCP Setup ---
echo "Setting up Context7 MCP (live library documentation lookup)..."

# Determine the config file location
if [ "$MODE" = "project" ]; then
  CONFIG_FILE="./opencode.json"
else
  CONFIG_FILE="$GLOBAL_DIR/opencode.json"
fi

# Always write fresh opencode.json with Context7 MCP
cat > "$CONFIG_FILE" << 'CONFIGEOF'
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "context7": {
      "type": "local",
      "command": ["npx", "-y", "@upstash/context7-mcp@latest"],
      "enabled": true
    }
  }
}
CONFIGEOF
echo "  Written $CONFIG_FILE with Context7 MCP configured"

# --- Semgrep Check ---
echo ""
echo "Checking for Semgrep (security scanning)..."
if command -v semgrep &>/dev/null; then
  echo "  Semgrep $(semgrep --version 2>/dev/null | head -1) — installed ✓"
else
  echo "  Semgrep not installed. The /security agent works best with Semgrep."
  echo "  Install with:  brew install semgrep  (macOS)"
  echo "             or:  pip install semgrep   (any platform)"
  echo "  The agent will offer to install it when you run /security."
fi

echo ""
echo "Installation complete!"
echo ""
echo "Available commands:"
echo "  /sdlc init <name> \"<desc>\"  — Start new project"
echo "  /sdlc onboard               — Understand existing codebase"
echo "  /sdlc feature \"<desc>\"      — Add feature to existing system"
echo "  /security                    — OWASP security audit (with Semgrep)"
echo "  /research \"<topic>\"          — Deep research"
echo "  /dba                         — Database architecture"
echo "  /test-expert                 — Test strategy & coverage"
echo "  /ux                          — UX/accessibility review"
echo "  /devops                      — CI/CD & infrastructure"
echo "  /containers                  — Docker/Podman operations"
echo "  /review-code                 — Code quality review"
echo "  /perf                        — Performance profiling"
echo "  /api-design                  — API design review"
echo "  /review                      — Multi-pass code review"
echo "  /gate                        — SDLC gate check"
echo ""
echo "MCP Servers configured:"
echo "  Context7 — Live library documentation lookup (auto-configured)"
echo ""
echo "Optional: Copy AGENTS.md to your project root:"
echo "  cp $SCRIPT_DIR/examples/AGENTS.md ./AGENTS.md"
echo ""
echo "Optional: Get a free Context7 API key for higher rate limits:"
echo "  https://context7.com/dashboard"
