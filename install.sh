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

DIRS="agents skills commands references tools hooks"

for dir in $DIRS; do
  # Skip tools/hooks for project-level installs (they're global-only)
  if [ "$MODE" = "project" ] && { [ "$dir" = "tools" ] || [ "$dir" = "hooks" ]; }; then
    continue
  fi

  # Clean out existing directory first (fresh install every time)
  if [ -d "$DEST/$dir" ]; then
    rm -rf "$DEST/$dir"
  fi

  if [ "$METHOD" = "link" ]; then
    # Symlink entire directory
    ln -sf "$SCRIPT_DIR/$dir" "$DEST/$dir"
    echo "  Linked $dir/ → $DEST/$dir/"
  else
    # Deep copy (handles nested dirs like skills/<name>/SKILL.md)
    cp -r "$SCRIPT_DIR/$dir" "$DEST/$dir"
    if [ "$dir" = "tools" ] || [ "$dir" = "hooks" ]; then
      count=$(find "$DEST/$dir" -type f | wc -l | tr -d ' ')
    else
      count=$(find "$DEST/$dir" -name "*.md" | wc -l | tr -d ' ')
    fi
    echo "  Copied $dir/ ($count files) → $DEST/$dir/"
  fi
done

# Install package.json for tools (needed for @opencode-ai/plugin)
if [ "$MODE" = "global" ] && [ "$METHOD" != "link" ]; then
  if [ -f "$SCRIPT_DIR/package.json" ] && [ ! -f "$DEST/package.json" ]; then
    cp "$SCRIPT_DIR/package.json" "$DEST/package.json"
    echo "  Copied package.json → $DEST/package.json"
  fi
  # Install tool dependencies if npm is available
  if command -v npm &>/dev/null && [ -f "$DEST/package.json" ]; then
    echo "  Installing tool dependencies (npm install)..."
    (cd "$DEST" && npm install --silent 2>/dev/null) && echo "  Dependencies installed ✓" || echo "  ⚠️ npm install failed — run manually: cd $DEST && npm install"
  fi
fi

echo ""

# --- Context7 MCP Setup ---
echo "Setting up Context7 MCP (live library documentation lookup)..."

# Determine the config file location
if [ "$MODE" = "project" ]; then
  CONFIG_FILE="./opencode.json"
else
  CONFIG_FILE="$GLOBAL_DIR/opencode.json"
fi

# Merge Context7 MCP into existing opencode.json (or create if missing)
if [ -f "$CONFIG_FILE" ]; then
  # Check if jq is available for safe JSON merging
  if command -v jq &>/dev/null; then
    # Check if context7 already configured
    if jq -e '.mcp.context7' "$CONFIG_FILE" &>/dev/null; then
      echo "  Context7 MCP already configured in $CONFIG_FILE — skipping"
    else
      # Merge context7 into existing config, preserving everything else
      jq '.mcp = (.mcp // {}) + {"context7": {"type": "local", "command": ["npx", "-y", "@upstash/context7-mcp@latest"], "enabled": true}}' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
      echo "  Added Context7 MCP to existing $CONFIG_FILE (other settings preserved)"
    fi
  else
    # No jq — check with grep and warn if can't safely merge
    if grep -q "context7" "$CONFIG_FILE" 2>/dev/null; then
      echo "  Context7 MCP already configured in $CONFIG_FILE — skipping"
    else
      echo "  ⚠️  opencode.json exists but jq is not installed — cannot safely merge."
      echo "  Add this manually to your $CONFIG_FILE under \"mcp\":"
      echo ''
      echo '    "context7": {'
      echo '      "type": "local",'
      echo '      "command": ["npx", "-y", "@upstash/context7-mcp@latest"],'
      echo '      "enabled": true'
      echo '    }'
      echo ''
      echo "  Or install jq and re-run:  brew install jq"
    fi
  fi
else
  # No config file — create fresh with Context7
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
  echo "  Created $CONFIG_FILE with Context7 MCP configured"
fi

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
echo "Custom Tools (local LLM support):"
echo "  write, append, update, file-info — file operation fixes for LM Studio"
echo "  bash/run — shell execution with proper timeout"
echo "  grep-mcp — enhanced search with regex and context"
echo "  loop-detector — prevent infinite retry loops"
echo "  test-runner, playwright-test — testing automation"
echo "  semgrep-scan, semgrep-rule — security scanning"
echo "  deploy, log-parser, pomodoro, task — productivity"
echo "  See tools/CUSTOM_TOOLS_GUIDE.md for LM Studio setup"
echo ""
echo "MCP Servers configured:"
echo "  Context7 — Live library documentation lookup (auto-configured)"
echo ""
echo "Optional: Copy AGENTS.md to your project root:"
echo "  cp $SCRIPT_DIR/examples/AGENTS.md ./AGENTS.md"
echo ""
echo "Optional: Get SDLC phase context before starting a session:"
echo "  ./scripts/sdlc-context.sh            Print current phase + blockers"
echo "  ./scripts/sdlc-context.sh --update   Auto-update AGENTS.md with phase context"
echo ""
echo "Optional: Install MemPalace for persistent memory across sessions:"
echo "  ./scripts/install-mempalace.sh       Verbatim conversation recall + KG"
echo "  (96.6% LongMemEval R@5 in raw mode, fully offline — highly recommended"
echo "   for local LLMs which have no memory between sessions)"
echo ""
echo "Optional: Install community Semgrep rule sources for deep security audits:"
echo "  ./scripts/update-semgrep-rules.sh              Clone Trail of Bits, elttam, GitLab, 0xdea rules"
echo "  ./scripts/update-semgrep-rules.sh --bump       Pull latest + write .semgrep/community-rules.lock"
echo "  ./scripts/update-semgrep-rules.sh --verify     Verify cached rules match pinned commits"
echo "  ./scripts/semgrep-full-audit.sh                Run full audit with all community + framework rules"
echo "  ./scripts/semgrep-full-audit.sh --fast         CI-tier scan (< 60s)"
echo "  ./scripts/semgrep-full-audit.sh --autofix      OPT-IN autofix (LOW/WARNING only, refuses HIGH/CRITICAL)"
echo ""
echo "Optional: Get a free Context7 API key for higher rate limits:"
echo "  https://context7.com/dashboard"
