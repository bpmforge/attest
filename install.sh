#!/bin/bash
set -e

# BPM OpenCode Experts — Installation Script
# Usage:
#   ./install.sh              Install globally to ~/.config/opencode/
#   ./install.sh --project    Install to current project's .opencode/
#   ./install.sh --link       Symlink instead of copy (for development)
#   ./install.sh --semgrep    Also install Semgrep binary + community rules
#   ./install.sh --uninstall  Remove installed files

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GLOBAL_DIR="$HOME/.config/opencode"
PROJECT_DIR=".opencode"
SEMGREP_CACHE="$HOME/.semgrep/rules"

# Platform preflight — supported: macOS, Linux, WSL. NOT supported: native Windows.
case "$(uname -s)" in
  Darwin|Linux) ;;  # supported
  MINGW*|MSYS*|CYGWIN*)
    echo "ERROR: Native Windows (Git Bash / MSYS / Cygwin) is not supported." >&2
    echo "" >&2
    echo "Please install WSL2 and run the installer from inside your WSL shell:" >&2
    echo "  https://learn.microsoft.com/en-us/windows/wsl/install" >&2
    echo "" >&2
    echo "Then from inside WSL:" >&2
    echo "  git clone https://github.com/bpmforge/bpm-opencode-experts.git" >&2
    echo "  cd bpm-opencode-experts && ./install.sh" >&2
    exit 2
    ;;
  *)
    echo "WARNING: unrecognized platform $(uname -s). Proceeding anyway." >&2
    ;;
esac

# WSL detection — informational only
if grep -qi microsoft /proc/version 2>/dev/null; then
  echo "Detected: Windows Subsystem for Linux (WSL). Proceeding."
fi

MODE="global"
METHOD="copy"
INSTALL_SEMGREP=false
INSTALL_PWS=true
INSTALL_PULLMD=false

for arg in "$@"; do
  case $arg in
    --project)              MODE="project" ;;
    --link)                 METHOD="link" ;;
    --uninstall)            MODE="uninstall" ;;
    --semgrep)              INSTALL_SEMGREP=true ;;
    --no-playwright-search) INSTALL_PWS=false ;;
    --pullmd)               INSTALL_PULLMD=true ;;
    --help|-h)
      echo "BPM OpenCode Experts — Installation"
      echo ""
      echo "Usage:"
      echo "  ./install.sh                       Install globally to ~/.config/opencode/"
      echo "  ./install.sh --project             Install to .opencode/ in current directory"
      echo "  ./install.sh --link                Symlink instead of copy (for development)"
      echo "  ./install.sh --semgrep             Also install Semgrep + community rule repos"
      echo "  ./install.sh --no-playwright-search  Skip the playwright-search MCP install"
      echo "  ./install.sh --pullmd              Also clone + start pullmd (URL→markdown fallback) via Docker"
      echo "  ./install.sh --uninstall           Remove installed files"
      exit 0
      ;;
  esac
done

if [ "$MODE" = "uninstall" ]; then
  echo "Removing BPM OpenCode Experts..."
  for dir in agents skills commands references tools hooks scripts .semgrep; do
    rm -rf "$GLOBAL_DIR/$dir"
    rm -rf "$PROJECT_DIR/$dir"
  done
  echo "Done. Removed from both global and project locations."
  echo "Note: ~/.semgrep/rules/ community rule cache was NOT removed."
  echo "      Remove manually if desired:  rm -rf ~/.semgrep/rules/"
  echo "Note: ~/.semgrep/registry-cache/ offline pack cache was NOT removed."
  echo "      Remove manually if desired:  rm -rf ~/.semgrep/registry-cache/"
  exit 0
fi

if [ "$MODE" = "project" ]; then
  DEST="$PROJECT_DIR"
else
  DEST="$GLOBAL_DIR"
fi

mkdir -p "$DEST"

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

# --- Install audit scripts globally ---
# Copy the Semgrep audit scripts so they're usable from ~/.config/opencode/scripts/
# without needing the repo clone on PATH.
if [ "$MODE" = "global" ]; then
  if [ -d "$SCRIPT_DIR/scripts" ]; then
    if [ -d "$DEST/scripts" ]; then
      rm -rf "$DEST/scripts"
    fi
    if [ "$METHOD" = "link" ]; then
      ln -sf "$SCRIPT_DIR/scripts" "$DEST/scripts"
      echo "  Linked scripts/ → $DEST/scripts/"
    else
      cp -r "$SCRIPT_DIR/scripts" "$DEST/scripts"
      chmod +x "$DEST/scripts/"*.sh 2>/dev/null || true
      count=$(find "$DEST/scripts" -type f | wc -l | tr -d ' ')
      echo "  Copied scripts/ ($count files) → $DEST/scripts/"
    fi
  fi
fi

# --- Install Semgrep custom rules ---
# Copy .semgrep/ custom rulesets (cpp-bridge + language gap-fillers) so they're
# available to semgrep-full-audit.sh when run from any project. The audit script
# resolves these relative to its own location: $(dirname SCRIPT_DIR)/.semgrep/
if [ -d "$SCRIPT_DIR/.semgrep" ]; then
  if [ -d "$DEST/.semgrep" ]; then
    rm -rf "$DEST/.semgrep"
  fi
  if [ "$METHOD" = "link" ]; then
    ln -sf "$SCRIPT_DIR/.semgrep" "$DEST/.semgrep"
    echo "  Linked .semgrep/ → $DEST/.semgrep/"
  else
    cp -r "$SCRIPT_DIR/.semgrep" "$DEST/.semgrep"
    rule_count=$(grep -r '^\s*- id:' "$DEST/.semgrep/" 2>/dev/null | wc -l | tr -d ' ')
    file_count=$(find "$DEST/.semgrep" -name '*.yml' | wc -l | tr -d ' ')
    echo "  Copied .semgrep/ ($file_count rulesets, $rule_count rules) → $DEST/.semgrep/"
  fi
fi

# Install package.json + package-lock.json for tools (needed for @opencode-ai/plugin)
if [ "$MODE" = "global" ] && [ "$METHOD" != "link" ]; then
  if [ -f "$SCRIPT_DIR/package.json" ] && [ ! -f "$DEST/package.json" ]; then
    cp "$SCRIPT_DIR/package.json" "$DEST/package.json"
    echo "  Copied package.json → $DEST/package.json"
  fi
  # Copy lockfile to ensure reproducible install
  if [ -f "$SCRIPT_DIR/package-lock.json" ]; then
    cp "$SCRIPT_DIR/package-lock.json" "$DEST/package-lock.json"
  fi
  # Install tool dependencies if npm is available
  if command -v npm &>/dev/null && [ -f "$DEST/package.json" ]; then
    echo "  Installing tool dependencies (npm install)..."
    (cd "$DEST" && npm install --silent 2>/dev/null) && echo "  Dependencies installed ✓" || echo "  ⚠️ npm install failed — run manually: cd $DEST && npm install"
  fi
fi

echo ""

# --- Playwright CLI Setup (for the playwright-web browser-control tool) ---
# Web search + page extraction live in the playwright-search MCP (set up below).
# @playwright/cli is still needed by tools/playwright-web.ts for ad-hoc browser
# automation by agents.
echo "Setting up @playwright/cli for the playwright-web tool..."

if command -v playwright-cli &>/dev/null; then
  PCLI_VER=$(playwright-cli --version 2>/dev/null | head -1)
  echo "  playwright-cli $PCLI_VER — already installed ✓"
elif command -v npm &>/dev/null; then
  echo "  Installing @playwright/cli globally..."
  npm install -g @playwright/cli@latest --silent 2>/dev/null \
    && echo "  @playwright/cli installed ✓" \
    && playwright-cli install-browser chromium 2>/dev/null \
    && echo "  playwright-cli chromium ✓" \
    || echo "  ⚠️ npm install -g @playwright/cli failed — install manually"
else
  echo "  ⚠️ npm not found — install manually: npm install -g @playwright/cli@latest"
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

echo ""

# --- playwright-search MCP Setup ---
if [ "$INSTALL_PWS" = true ]; then
  echo "Setting up playwright-search MCP (multi-engine web research + page extraction)..."

  PWS_DIR="${PLAYWRIGHT_SEARCH_DIR:-$HOME/.local/share/playwright-search}"
  PWS_REPO="https://github.com/bpmforge/playwright-search.git"

  if ! command -v node &>/dev/null; then
    echo "  ⚠️  node not found — skipping playwright-search MCP install"
    echo "     Install Node 20+ then re-run, or pass --no-playwright-search to silence this"
  else
    if [ -d "$PWS_DIR/.git" ]; then
      echo "  playwright-search already cloned at $PWS_DIR"
      (cd "$PWS_DIR" && git pull --ff-only --quiet) 2>/dev/null \
        && echo "    pulled latest" \
        || echo "    skipped pull (uncommitted changes or not on main branch)"
    else
      echo "  Cloning $PWS_REPO -> $PWS_DIR ..."
      mkdir -p "$(dirname "$PWS_DIR")"
      git clone --quiet --depth 1 "$PWS_REPO" "$PWS_DIR" \
        && echo "    cloned ✓" \
        || { echo "    ⚠️  clone failed — check network / repo URL"; INSTALL_PWS=false; }
    fi

    if [ "$INSTALL_PWS" = true ]; then
      if [ ! -f "$PWS_DIR/dist/mcp.js" ] || [ "$PWS_DIR/src/mcp.ts" -nt "$PWS_DIR/dist/mcp.js" ]; then
        echo "  Building playwright-search (this also installs Chromium ~170MB the first time)..."
        (cd "$PWS_DIR" && npm install --silent && npm run build --silent) 2>&1 | tail -3
        if [ -f "$PWS_DIR/dist/mcp.js" ]; then
          echo "    build ✓"
        else
          echo "    ⚠️  build failed — run manually: cd $PWS_DIR && npm install && npm run build"
          INSTALL_PWS=false
        fi
      else
        echo "  Build is current"
      fi
    fi

    if [ "$INSTALL_PWS" = true ] && [ -f "$CONFIG_FILE" ]; then
      if command -v jq &>/dev/null; then
        PWS_CFG="$(jq -nc --arg path "$PWS_DIR/dist/mcp.js" \
          '{type: "local", command: ["node", $path], enabled: true}')"
        if jq -e '.mcp."playwright-search"' "$CONFIG_FILE" &>/dev/null; then
          jq --argjson cfg "$PWS_CFG" '.mcp."playwright-search" = $cfg' \
            "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
          echo "  Updated playwright-search MCP path in $CONFIG_FILE"
        else
          jq --argjson cfg "$PWS_CFG" '.mcp = (.mcp // {}) + {"playwright-search": $cfg}' \
            "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
          echo "  Added playwright-search MCP to $CONFIG_FILE"
        fi
      else
        echo "  ⚠️  jq not installed — add this manually to $CONFIG_FILE under \"mcp\":"
        echo ''
        echo '    "playwright-search": {'
        echo '      "type": "local",'
        echo "      \"command\": [\"node\", \"$PWS_DIR/dist/mcp.js\"],"
        echo '      "enabled": true'
        echo '    }'
        echo ''
      fi
    fi
  fi
else
  echo "Skipping playwright-search MCP (--no-playwright-search set)"
fi

echo ""

# --- pullmd MCP Setup (optional) ---
if [ "$INSTALL_PULLMD" = true ]; then
  echo "Setting up pullmd (URL→markdown fallback via Docker)..."

  PULLMD_DIR="${PULLMD_DIR:-$HOME/.local/share/pullmd}"
  PULLMD_REPO="https://github.com/AeternaLabsHQ/pullmd.git"

  if ! command -v docker &>/dev/null; then
    echo "  ⚠️  docker not found — skipping pullmd install"
    echo "     Install Docker Desktop or podman-docker shim, then re-run with --pullmd"
  else
    if [ -d "$PULLMD_DIR/.git" ]; then
      echo "  pullmd already cloned at $PULLMD_DIR"
      (cd "$PULLMD_DIR" && git pull --ff-only --quiet) 2>/dev/null \
        && echo "    pulled latest" \
        || echo "    skipped pull (uncommitted changes or not on main branch)"
    else
      echo "  Cloning $PULLMD_REPO -> $PULLMD_DIR ..."
      mkdir -p "$(dirname "$PULLMD_DIR")"
      git clone --quiet --depth 1 "$PULLMD_REPO" "$PULLMD_DIR" \
        && echo "    cloned ✓" \
        || { echo "    ⚠️  clone failed — check network / repo URL"; INSTALL_PULLMD=false; }
    fi

    if [ "$INSTALL_PULLMD" = true ]; then
      echo "  Bringing up pullmd container (this may pull ~500MB on first run)..."
      (cd "$PULLMD_DIR" && docker compose up -d 2>&1) | tail -3
      # Health check — give it a few seconds to bind
      sleep 3
      if curl -sf http://localhost:3000/api/config >/dev/null 2>&1; then
        echo "    pullmd up ✓ (http://localhost:3000)"
      else
        echo "    ⚠️  pullmd container started but /api/config did not respond yet"
        echo "       Check: cd $PULLMD_DIR && docker compose logs pullmd"
      fi
    fi

    if [ "$INSTALL_PULLMD" = true ] && [ -f "$CONFIG_FILE" ]; then
      # Container is up — safe to flip enabled:true (or insert the block enabled).
      if command -v jq &>/dev/null; then
        PULLMD_CFG='{"type": "remote", "url": "http://localhost:3000/mcp", "enabled": true}'
        if jq -e '.mcp."pullmd"' "$CONFIG_FILE" &>/dev/null; then
          jq --argjson cfg "$PULLMD_CFG" '.mcp."pullmd" = $cfg' \
            "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
          echo "  Updated pullmd MCP entry in $CONFIG_FILE (enabled)"
        else
          jq --argjson cfg "$PULLMD_CFG" '.mcp = (.mcp // {}) + {"pullmd": $cfg}' \
            "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
          echo "  Added pullmd MCP to $CONFIG_FILE (enabled)"
        fi
      else
        echo "  ⚠️  jq not installed — add this manually to $CONFIG_FILE under \"mcp\":"
        echo ''
        echo '    "pullmd": {'
        echo '      "type": "remote",'
        echo '      "url": "http://localhost:3000/mcp",'
        echo '      "enabled": true'
        echo '    }'
        echo ''
      fi
    fi
  fi
else
  echo "Skipping pullmd MCP (pass --pullmd to install)"
fi

echo ""

# --- Semgrep Setup ---
echo "Checking for Semgrep (security scanning)..."

SEMGREP_OK=false
SEMGREP_VERSION=""

if command -v semgrep &>/dev/null; then
  SEMGREP_VERSION=$(semgrep --version 2>/dev/null | head -1)
  echo "  Semgrep $SEMGREP_VERSION — installed ✓"
  SEMGREP_OK=true
else
  echo "  Semgrep not found."
  if [ "$INSTALL_SEMGREP" = true ]; then
    # --semgrep flag: auto-install without prompting
    echo "  Installing Semgrep (--semgrep flag set)..."
    if command -v brew &>/dev/null; then
      brew install semgrep && SEMGREP_OK=true && SEMGREP_VERSION=$(semgrep --version 2>/dev/null | head -1) \
        && echo "  Semgrep $SEMGREP_VERSION — installed ✓" \
        || echo "  ⚠️ brew install semgrep failed — install manually"
    elif command -v pip3 &>/dev/null; then
      pip3 install semgrep && SEMGREP_OK=true && SEMGREP_VERSION=$(semgrep --version 2>/dev/null | head -1) \
        && echo "  Semgrep $SEMGREP_VERSION — installed ✓" \
        || echo "  ⚠️ pip3 install semgrep failed — install manually"
    elif command -v pip &>/dev/null; then
      pip install semgrep && SEMGREP_OK=true && SEMGREP_VERSION=$(semgrep --version 2>/dev/null | head -1) \
        && echo "  Semgrep $SEMGREP_VERSION — installed ✓" \
        || echo "  ⚠️ pip install semgrep failed — install manually"
    else
      echo "  ⚠️ Neither brew nor pip found. Install manually:"
      echo "       brew install semgrep    (macOS)"
      echo "       pip install semgrep     (any platform)"
    fi
  else
    # No flag — detect if interactive TTY and prompt
    if [ -t 0 ] && [ -t 1 ]; then
      echo ""
      echo "  The /security agent requires Semgrep for automated scanning."
      printf "  Install Semgrep now? [Y/n] "
      read -r semgrep_confirm </dev/tty
      if [[ ! "$semgrep_confirm" =~ ^[Nn] ]]; then
        if command -v brew &>/dev/null; then
          echo "  Running: brew install semgrep"
          brew install semgrep && SEMGREP_OK=true && SEMGREP_VERSION=$(semgrep --version 2>/dev/null | head -1) \
            && echo "  Semgrep $SEMGREP_VERSION — installed ✓" \
            || echo "  ⚠️ brew install failed — install manually: brew install semgrep"
        elif command -v pip3 &>/dev/null; then
          echo "  Running: pip3 install semgrep"
          pip3 install semgrep && SEMGREP_OK=true && SEMGREP_VERSION=$(semgrep --version 2>/dev/null | head -1) \
            && echo "  Semgrep $SEMGREP_VERSION — installed ✓" \
            || echo "  ⚠️ pip3 install failed — install manually: pip3 install semgrep"
        else
          echo "  ⚠️ Neither brew nor pip found. Install manually:"
          echo "       brew install semgrep    (macOS)"
          echo "       pip install semgrep     (any platform)"
        fi
      else
        echo "  Skipped. Install later: brew install semgrep"
      fi
    else
      # Non-interactive (piped install) — print instructions, don't prompt
      echo "  ⚠️ Semgrep not installed. The /security agent works best with Semgrep."
      echo "     Install: brew install semgrep  (macOS)"
      echo "              pip install semgrep   (any platform)"
      echo "     Or re-run: ./install.sh --semgrep  (auto-installs)"
    fi
  fi
fi

# --- Semgrep community rules setup ---
echo ""
echo "Checking Semgrep community rules (~/.semgrep/rules/)..."

# Ensure the cache directory exists (primes the path even if rules not cloned yet)
mkdir -p "$SEMGREP_CACHE"

COMMUNITY_STATUS=""
COMMUNITY_SOURCES=(trailofbits elttam gitlab 0xdea)
missing_sources=()
found_sources=()

for src in "${COMMUNITY_SOURCES[@]}"; do
  if [ -d "$SEMGREP_CACHE/$src/.git" ]; then
    commit=$(git -C "$SEMGREP_CACHE/$src" rev-parse --short HEAD 2>/dev/null || echo "unknown")
    found_sources+=("$src ($commit)")
  else
    missing_sources+=("$src")
  fi
done

if [ ${#found_sources[@]} -gt 0 ]; then
  echo "  Cached: ${found_sources[*]}"
fi

if [ ${#missing_sources[@]} -gt 0 ]; then
  echo "  Missing: ${missing_sources[*]}"
fi

if [ ${#missing_sources[@]} -gt 0 ]; then
  if [ "$INSTALL_SEMGREP" = true ] && [ "$SEMGREP_OK" = true ]; then
    # --semgrep flag + semgrep is installed: clone missing sources automatically
    echo "  Cloning missing community rule sources (--semgrep flag set)..."
    if [ -f "$DEST/scripts/update-semgrep-rules.sh" ]; then
      bash "$DEST/scripts/update-semgrep-rules.sh" \
        && echo "  Community rules cloned ✓" \
        || echo "  ⚠️ Some community rule sources failed — check output above"
    elif [ -f "$SCRIPT_DIR/scripts/update-semgrep-rules.sh" ]; then
      bash "$SCRIPT_DIR/scripts/update-semgrep-rules.sh" \
        && echo "  Community rules cloned ✓" \
        || echo "  ⚠️ Some community rule sources failed — check output above"
    else
      echo "  ⚠️ update-semgrep-rules.sh not found — clone manually:"
      echo "     git clone --depth 1 https://github.com/trailofbits/semgrep-rules $SEMGREP_CACHE/trailofbits"
      echo "     git clone --depth 1 https://github.com/elttam/semgrep-rules       $SEMGREP_CACHE/elttam"
      echo "     git clone --depth 1 https://gitlab.com/gitlab-org/security-products/sast-rules $SEMGREP_CACHE/gitlab"
      echo "     git clone --depth 1 https://github.com/0xdea/semgrep-rules        $SEMGREP_CACHE/0xdea"
    fi
  elif [ -t 0 ] && [ -t 1 ] && [ "$SEMGREP_OK" = true ]; then
    # Interactive + semgrep installed: prompt
    echo ""
    echo "  Community rules (Trail of Bits, elttam, GitLab, 0xdea) give the"
    echo "  /security agent highest-signal coverage. Each repo is ~10-50 MB."
    printf "  Clone missing community rule sources now? [Y/n] "
    read -r rules_confirm </dev/tty
    if [[ ! "$rules_confirm" =~ ^[Nn] ]]; then
      if [ -f "$DEST/scripts/update-semgrep-rules.sh" ]; then
        bash "$DEST/scripts/update-semgrep-rules.sh" \
          && echo "  Community rules cloned ✓" \
          || echo "  ⚠️ Some community rule sources failed — check output above"
      elif [ -f "$SCRIPT_DIR/scripts/update-semgrep-rules.sh" ]; then
        bash "$SCRIPT_DIR/scripts/update-semgrep-rules.sh" \
          && echo "  Community rules cloned ✓" \
          || echo "  ⚠️ Some community rule sources failed — check output above"
      fi
    else
      echo "  Skipped. Run later:  $DEST/scripts/update-semgrep-rules.sh"
    fi
  else
    # Non-interactive or semgrep not installed: print instructions
    if [ "$SEMGREP_OK" = false ]; then
      echo "  ℹ️  Install Semgrep first, then run:  $DEST/scripts/update-semgrep-rules.sh"
    else
      echo "  ℹ️  Run later:  $DEST/scripts/update-semgrep-rules.sh"
      echo "      Or re-run:  ./install.sh --semgrep  (auto-clones everything)"
    fi
  fi
else
  echo "  All 4 community rule sources present ✓"
fi

echo ""
echo "Installation complete!"
echo ""

# --- Status summary ---
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Agents / skills / commands
agent_count=$(find "$DEST/agents" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
skill_count=$(find "$DEST/skills" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
echo "  ✓  Agents:  $agent_count installed → $DEST/agents/"
echo "  ✓  Skills:  $skill_count installed → $DEST/skills/"

# Scripts
if [ -d "$DEST/scripts" ]; then
  script_count=$(find "$DEST/scripts" -type f | wc -l | tr -d ' ')
  echo "  ✓  Scripts: $script_count installed → $DEST/scripts/"
else
  echo "  ⚠️  Scripts: not installed (project-mode only)"
fi

# npm tools
if [ -d "$DEST/node_modules" ]; then
  echo "  ✓  npm tools: node_modules present"
else
  echo "  ⚠️  npm tools: run 'cd $DEST && npm install'"
fi

# Playwright
if [ "$PLAYWRIGHT_CLI_OK" = true ] && [ "$PLAYWRIGHT_NPM_OK" = true ]; then
  echo "  ✓  Playwright: playwright-cli + npm package installed (web_search, web_fetch ready)"
elif [ "$PLAYWRIGHT_CLI_OK" = true ]; then
  echo "  ⚠️  Playwright: playwright-cli OK but npm package missing — run: cd $DEST && npm install playwright && npx playwright install chromium"
elif [ "$PLAYWRIGHT_NPM_OK" = true ]; then
  echo "  ⚠️  Playwright: npm package OK but playwright-cli missing — run: npm install -g @playwright/cli@latest && playwright-cli install-browser chromium"
else
  echo "  ⚠️  Playwright: not installed — web_search and web_fetch tools will not work"
  echo "       Fix: npm install -g @playwright/cli@latest && playwright-cli install-browser chromium"
  echo "            cd $DEST && npm install playwright && npx playwright install chromium"
fi

# MCP
if [ -f "$GLOBAL_DIR/opencode.json" ] && grep -q "context7" "$GLOBAL_DIR/opencode.json" 2>/dev/null; then
  echo "  ✓  MCP: Context7 configured"
else
  echo "  ⚠️  MCP: Context7 not configured — check $GLOBAL_DIR/opencode.json"
fi

# Semgrep binary
if [ "$SEMGREP_OK" = true ]; then
  echo "  ✓  Semgrep: $SEMGREP_VERSION"
else
  echo "  ⚠️  Semgrep: not installed — run: brew install semgrep"
fi

# Community rules
total_sources=${#COMMUNITY_SOURCES[@]}
cached_sources=$(( total_sources - ${#missing_sources[@]} ))
if [ ${#missing_sources[@]} -eq 0 ]; then
  echo "  ✓  Community rules: all $total_sources sources cached (~/.semgrep/rules/)"
elif [ $cached_sources -gt 0 ]; then
  echo "  ⚠️  Community rules: $cached_sources/$total_sources sources cached — run: $DEST/scripts/update-semgrep-rules.sh"
else
  echo "  ⚠️  Community rules: none cached — run: $DEST/scripts/update-semgrep-rules.sh"
fi

# Custom gap-filler rules
if [ -d "$DEST/.semgrep" ]; then
  custom_count=$(grep -r '^\s*- id:' "$DEST/.semgrep/" 2>/dev/null | wc -l | tr -d ' ')
  custom_files=$(find "$DEST/.semgrep" -name '*.yml' | wc -l | tr -d ' ')
  echo "  ✓  Custom rules: $custom_count rules in $custom_files rulesets ($DEST/.semgrep/)"
else
  echo "  ⚠️  Custom rules: not installed — re-run install.sh"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Available commands:"
echo "  /sdlc init <name> \"<desc>\"  — Start new project"
echo "  /sdlc onboard               — Understand existing codebase"
echo "  /sdlc feature \"<desc>\"      — Add feature to existing system"
echo "  /sdlc improve [\"scope\"]     — Audit and improve existing system"
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
echo "  /frontend                    — Visual design & polish"
echo "  /explore                     — Trace a feature end-to-end (codebase archaeology)"
echo "  /design-options              — Generate architecture alternatives with trade-offs"
echo "  /simplify                    — Quick simplification pass on recent changes"
echo "  /steward                     — Audit project docs, capture session learnings"
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
echo "Semgrep audit scripts (installed to $DEST/scripts/):"
echo "  update-semgrep-rules.sh              Clone/update community rule repos"
echo "  update-semgrep-rules.sh --bump       Pull latest + write lock file"
echo "  update-semgrep-rules.sh --test       Verify working subdirs per source"
echo "  update-semgrep-rules.sh --cache-packs  Download registry packs for offline use"
echo "  cache-registry-packs.sh              Manage offline registry pack cache"
echo "  semgrep-full-audit.sh                Deep audit (all community + framework rules)"
echo "  semgrep-full-audit.sh --fast         CI-tier scan (< 60s)"
echo "  semgrep-full-audit.sh --offline      Air-gapped scan (cached packs only)"
echo "  semgrep-full-audit.sh --autofix      OPT-IN autofix (LOW/WARNING only)"
echo "  Custom gap-filler rules: $DEST/.semgrep/ (186 rules, 11 languages)"
echo "  Community rules cache:   ~/.semgrep/rules/"
echo ""
echo "Optional: Copy AGENTS.md to your project root:"
echo "  cp $SCRIPT_DIR/examples/AGENTS.md ./AGENTS.md"
echo ""
echo "Optional: Get SDLC phase context before starting a session:"
echo "  $DEST/scripts/sdlc-context.sh            Print current phase + blockers"
echo "  $DEST/scripts/sdlc-context.sh --update   Auto-update AGENTS.md with phase context"
echo ""
echo "Optional: Install MemPalace for persistent memory across sessions:"
echo "  $DEST/scripts/install-mempalace.sh       Verbatim conversation recall + KG"
echo "  (96.6% LongMemEval R@5 in raw mode, fully offline — highly recommended"
echo "   for local LLMs which have no memory between sessions)"
echo ""
echo "Optional: Get a free Context7 API key for higher rate limits:"
echo "  https://context7.com/dashboard"
