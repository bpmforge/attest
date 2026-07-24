#!/bin/bash
set -e

# BPM OpenCode Experts — Installation Script
# Usage:
#   ./install.sh              Install globally to ~/.config/opencode/
#   ./install.sh --project    Install to current project's .opencode/
#   ./install.sh --link       Symlink instead of copy (for development)
#   ./install.sh --opengrep   Install the preferred SAST engine (Opengrep, via its
#                             official installer) — see references/semgrep-guide.md.
#   ./install.sh --semgrep    Alias for --opengrep (kept for back-compat). Falls back
#                             to installing Semgrep only if the Opengrep installer
#                             fails/is unreachable. NOTE: Semgrep registry rules are
#                             internal-use-only; client scans use Opengrep + in-house
#                             bpm-rulepacks.
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

# ─── Node version check ───────────────────────────────────────────────────────
# MCPs require Node 20–24 (LTS). Older versions lack required APIs; Node 25+
# are pre-release and may have native module incompatibilities (better-sqlite3).
check_node_version() {
  [ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" --no-use 2>/dev/null || true

  if ! command -v node &>/dev/null; then
    echo ""
    echo "  ⚠️  node not found."
    _offer_nvm_install
    return
  fi

  local version major
  version=$(node --version 2>/dev/null | tr -d 'v')
  major=$(echo "$version" | cut -d. -f1)

  if [ "$major" -ge 20 ] && [ "$major" -le 24 ] 2>/dev/null; then
    echo "  Node $version ✓"
    return
  fi

  echo ""
  if [ "$major" -lt 20 ] 2>/dev/null; then
    echo "  ⚠️  Node $version is too old — MCPs require Node 20+ (better-sqlite3 native bindings)."
  else
    echo "  ⚠️  Node $version is a pre-release/unsupported version — recommend Node 24 LTS for compatibility."
  fi

  _offer_nvm_switch "$major"
}

_offer_nvm_install() {
  if [ ! -t 0 ]; then
    echo "     Install Node 20+ then re-run install.sh."
    return
  fi
  printf "  Install NVM and Node 24 LTS now? [Y/n]: "
  read -r yn </dev/tty
  yn="${yn:-Y}"
  case "$yn" in [Yy]*)
    echo "  Installing NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash 2>&1 | tail -3
    [ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
    nvm install 24 && nvm use 24 && nvm alias default 24
    echo "  Node $(node --version) active via NVM ✓"
    ;;
  *)
    echo "  Skipping — MCPs will be unavailable until Node 20+ is installed."
    ;;
  esac
}

_offer_nvm_switch() {
  local current_major="$1"
  if [ ! -t 0 ]; then
    echo "     Run: nvm install 24 && nvm use 24"
    return
  fi
  printf "  Switch to Node 24 LTS via NVM? [Y/n]: "
  read -r yn </dev/tty
  yn="${yn:-Y}"
  case "$yn" in [Yy]*)
    [ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
    if command -v nvm &>/dev/null; then
      nvm install 24 2>&1 | tail -2
      nvm use 24
      nvm alias default 24
      echo "  Node $(node --version) active via NVM ✓"
    else
      echo "  NVM not found — installing it first..."
      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash 2>&1 | tail -3
      [ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
      nvm install 24 && nvm use 24 && nvm alias default 24
      echo "  Node $(node --version) active via NVM ✓"
    fi
    ;;
  *)
    echo "  Skipping — continuing with Node $current_major (may cause build failures)."
    ;;
  esac
}

echo ""
echo -n "Checking Node version... "
check_node_version
# ─────────────────────────────────────────────────────────────────────────────

# ─── Native build dependency check ────────────────────────────────────────────
# better-sqlite3 and sqlite-vec (used by bpm-memory-mcp / bpm-code-search-mcp)
# compile a native addon via node-gyp, which needs a C/C++ compiler + python3.
# Without these, `npm install` silently produces a binary that mismatches the
# active Node's ABI (NODE_MODULE_VERSION) the next time Node is upgraded —
# surfaces later as `ERR_DLOPEN_FAILED` rather than an install-time error.
check_native_build_deps() {
  local have_cc=false have_python=false
  if command -v cc &>/dev/null || command -v gcc &>/dev/null || command -v clang &>/dev/null; then
    have_cc=true
  fi
  command -v python3 &>/dev/null && have_python=true

  if [ "$have_cc" = true ] && [ "$have_python" = true ]; then
    echo "  Native build tools (C compiler, python3) ✓"
    return
  fi

  echo ""
  echo "  ⚠️  Missing native build tools needed to compile better-sqlite3:"
  [ "$have_cc" = false ] && echo "      - no C/C++ compiler found"
  [ "$have_python" = false ] && echo "      - python3 not found"

  case "$(uname -s)" in
    Darwin)
      echo "     Install with: xcode-select --install"
      if [ -t 0 ]; then
        printf "  Run that now? [Y/n]: "
        read -r yn </dev/tty
        case "${yn:-Y}" in [Yy]*) xcode-select --install 2>&1 || true ;; esac
      fi
      ;;
    Linux)
      if command -v apt-get &>/dev/null; then
        echo "     Install with: sudo apt-get install -y build-essential python3"
        if [ -t 0 ]; then
          printf "  Run that now (requires sudo password)? [Y/n]: "
          read -r yn </dev/tty
          case "${yn:-Y}" in [Yy]*)
            sudo apt-get update && sudo apt-get install -y build-essential python3
            echo "  Native build tools installed ✓"
            ;;
          esac
        fi
      else
        echo "     Install a C compiler + python3 via your distro's package manager"
        echo "     (e.g. dnf: sudo dnf install gcc-c++ python3, apk: sudo apk add build-base python3)"
      fi
      ;;
    *)
      echo "     Install a C/C++ compiler and python3, then re-run install.sh."
      ;;
  esac
}

echo -n "Checking native build dependencies... "
check_native_build_deps
# ─────────────────────────────────────────────────────────────────────────────

MODE="global"
METHOD="copy"
INSTALL_SEMGREP=false
INSTALL_PWS=true
INSTALL_MEMORY=false
INSTALL_PLAYWRIGHT_MCP=true
INSTALL_CODE_SEARCH=true
INSTALL_GAME=true   # game-dev expert cluster (agents/game/* + game skill) — optional; default on for upgrade compatibility

for arg in "$@"; do
  case $arg in
    --project)              MODE="project" ;;
    --compact)               COMPACT_AGENTS=true ;;
    --tools)                 INSTALL_TOOLS=true ;;
    --link)                 METHOD="link" ;;
    --uninstall)            MODE="uninstall" ;;
    --semgrep)              INSTALL_SEMGREP=true ;;
    --opengrep)             INSTALL_SEMGREP=true ;;  # alias — Opengrep is the preferred engine
    --no-playwright-search) INSTALL_PWS=false ;;
    --no-playwright-mcp)    INSTALL_PLAYWRIGHT_MCP=false ;;
    --no-code-search)       INSTALL_CODE_SEARCH=false ;;
    --memory)               INSTALL_MEMORY=true ;;
    --no-game)              INSTALL_GAME=false ;;
    --game-experts)         INSTALL_GAME=true ;;
    --yes|-y)               : ;;  # non-interactive, accept all current defaults
    --help|-h)
      echo "BPM OpenCode Experts — Installation"
      echo ""
      echo "Usage:"
      echo "  ./install.sh                       Install globally to ~/.config/opencode/"
      echo "  ./install.sh --project             Install to .opencode/ in current directory"
      echo "  ./install.sh --link                Symlink instead of copy (for development)"
      echo "  ./install.sh --opengrep            Also install Opengrep (preferred SAST engine) + community rule repos"
      echo "  ./install.sh --semgrep             Alias for --opengrep; falls back to Semgrep if the Opengrep installer fails"
      echo "  ./install.sh --no-playwright-search  Skip the playwright-search MCP install"
      echo "  ./install.sh --no-playwright-mcp   Skip the playwright-mcp install"
      echo "  ./install.sh --memory              Also install bpm-memory-mcp MCP (cross-session memory)"
      echo "                                     Vector search needs an embedder (ollama or LM Studio) — the"
      echo "                                     installer detects/offers setup; BM25 keyword fallback if absent"
      echo "  ./install.sh --no-game             Skip the game-dev expert cluster (agents/game/*, 9 agents + game skill)"
      echo "  ./install.sh --compact             Overlay compact agent variants (tier=small / 32k local models)"
      echo "  ./install.sh --tools               Also install missing code-analysis tools (knip, vulture, ...)"
      echo "  ./install.sh --no-code-search      Skip bpm-code-search-mcp"
  echo "  ./install.sh --uninstall           Remove installed files"
  echo "  ./install.sh --yes                 Accept all defaults non-interactively"
      exit 0
      ;;
  esac
done

# ─── Interactive prompts (when run with no flags from a terminal) ───
if [ $# -eq 0 ] && [ -t 0 ] && [ "$MODE" != "uninstall" ]; then
  echo ""
  echo "bpm-opencode-experts v1.6.0 — Installation"
  echo "==========================================="
  echo ""
  echo "Core install (always): agents, skills, shared protocols, tools, plugins, scripts, semgrep rules"
  echo ""
  echo "Optional MCPs:"
  echo ""

  prompt_yn() {
    local msg="$1" default="$2" varname="$3"
    local yn
    printf "  %s [%s]: " "$msg" "$default"
    read -r yn </dev/tty
    yn="${yn:-$default}"
    case "$yn" in
      [Yy]*) eval "$varname=true" ;;
      [Nn]*) eval "$varname=false" ;;
      *)     eval "$varname=$( [ "$default" = "Y" ] && echo true || echo false )" ;;
    esac
  }

  prompt_yn "Install bpm-code-search-mcp (semantic code search + symbol index)?" "Y" INSTALL_CODE_SEARCH
  prompt_yn "Install playwright-mcp (browser automation + screenshots)?" "Y" INSTALL_PLAYWRIGHT_MCP
  prompt_yn "Install playwright-search (web research MCP)?" "Y" INSTALL_PWS
  prompt_yn "Install bpm-memory-mcp (cross-session project memory; embedder setup offered next)?" "N" INSTALL_MEMORY
  echo ""
  echo "Optional expert clusters:"
  echo ""
  prompt_yn "Install the game-dev expert cluster (9 agents: design/engineering/balance/playtest/audio/narrative/level/producer/assets)?" "Y" INSTALL_GAME
  echo ""
fi

if [ "$MODE" = "uninstall" ]; then
  echo "Removing BPM OpenCode Experts..."
  for dir in agents skills commands references exemplars tools hooks plugins scripts .semgrep; do
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

DIRS="agents skills commands references exemplars tools hooks plugins"

for dir in $DIRS; do
  # Skip global-only directories during project-level installs
  if [ "$MODE" = "project" ] && { [ "$dir" = "tools" ] || [ "$dir" = "hooks" ] || [ "$dir" = "plugins" ]; }; then
    continue
  fi

  # Skip directories that don't exist in the source repo
  if [ ! -d "$SCRIPT_DIR/$dir" ]; then
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
    if [ "$dir" = "tools" ] || [ "$dir" = "hooks" ] || [ "$dir" = "plugins" ]; then
      count=$(find "$DEST/$dir" -type f | wc -l | tr -d ' ')
    else
      count=$(find "$DEST/$dir" -name "*.md" | wc -l | tr -d ' ')
    fi
    echo "  Copied $dir/ ($count files) → $DEST/$dir/"
  fi
done

# --- Optional game-dev expert cluster (agents/game/* + game skill) ---
if [ "$INSTALL_GAME" = false ]; then
  if [ "$METHOD" = "link" ]; then
    # NEVER delete through a symlink — that would remove files from the source repo.
    echo "  ⚠️  --no-game ignored in --link mode (agents/ is a symlink to the repo; removing game/ would delete source files)"
  else
    removed=0
    if [ -d "$DEST/agents/game" ]; then
      removed=$(find "$DEST/agents/game" -name "*.md" | wc -l | tr -d ' ')
      rm -rf "$DEST/agents/game"
    fi
    [ -d "$DEST/skills/game-asset-pipeline" ] && rm -rf "$DEST/skills/game-asset-pipeline"
    echo "  Skipped game-dev expert cluster ($removed agents + game-asset-pipeline skill) — re-run with --game-experts to add it"
  fi
fi

# --- Compact agent overlay (tier=small installs) ---
if [ "${COMPACT_AGENTS:-false}" = "true" ]; then
  if [ -d "$SCRIPT_DIR/dist/compact-agents" ]; then
    overlaid=0
    for f in "$SCRIPT_DIR"/dist/compact-agents/*.md; do
      cp "$f" "$DEST/agents/$(basename "$f")"
      overlaid=$((overlaid + 1))
    done
    echo "  Overlaid $overlaid compact agent variants (tier=small) → $DEST/agents/"
  else
    echo "  WARNING: --compact requested but dist/compact-agents/ missing — run: node scripts/build-agents.mjs --compact"
  fi
fi

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

  # Stamp the installed version so runtime components (resume-anchor) can
  # self-identify it — every field trace then answers "which version was
  # this box running?" without a trip to the machine.
  if [ -f "$SCRIPT_DIR/package.json" ]; then
    EXPERTS_VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SCRIPT_DIR/package.json" | head -n 1)
    if [ -n "$EXPERTS_VERSION" ]; then
      printf '%s\n' "$EXPERTS_VERSION" > "$DEST/experts-version"
      echo "  Stamped version: v$EXPERTS_VERSION → $DEST/experts-version"
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

# --- npm tool dependencies + Playwright setup ---
# Tools in tools/ depend on @opencode-ai/plugin and playwright.
# Playwright also needs its Chromium binary installed separately after npm install.
echo "Setting up npm tool dependencies and Playwright..."

NPM_OK=false
PLAYWRIGHT_NPM_OK=false
PLAYWRIGHT_CLI_OK=false

if ! command -v npm &>/dev/null; then
  echo "  ⚠️  npm not found — skipping tool dependencies."
  echo "     Install Node 20+ from https://nodejs.org then re-run install.sh"
else
  # ── Step A: Copy package.json and run npm install ──────────────────
  if [ "$MODE" = "global" ] && [ "$METHOD" != "link" ]; then
    if [ -f "$SCRIPT_DIR/package.json" ] && [ ! -f "$DEST/package.json" ]; then
      cp "$SCRIPT_DIR/package.json" "$DEST/package.json"
    fi
    [ -f "$SCRIPT_DIR/package-lock.json" ] && cp "$SCRIPT_DIR/package-lock.json" "$DEST/package-lock.json"
  fi

  if [ -f "$DEST/package.json" ]; then
    echo "  Running npm install in $DEST ..."
    if (cd "$DEST" && npm install 2>&1 | tail -5); then
      echo "  npm install ✓"
      NPM_OK=true
    else
      echo "  ⚠️  npm install failed. Try manually:"
      echo "       cd $DEST && npm install"
    fi
  fi

  # ── Step B: Install Chromium for the local playwright package ──────
  # playwright (npm package) needs its own browser binary separate from
  # the global @playwright/cli install. 'npx playwright install chromium'
  # puts the binary in ~/.cache/ms-playwright/ and is safe to re-run.
  if [ "$NPM_OK" = true ] && [ -d "$DEST/node_modules/playwright" ]; then
    echo "  Installing Chromium for playwright npm package..."
    if (cd "$DEST" && npx playwright install chromium 2>&1 | tail -5); then
      echo "  Playwright Chromium (npm) ✓"
      PLAYWRIGHT_NPM_OK=true
    else
      echo "  ⚠️  Chromium install for npm playwright failed. Try manually:"
      echo "       cd $DEST && npx playwright install chromium"
    fi
  fi

  # ── Step C: Install @playwright/cli globally ───────────────────────
  # Needed by tools/playwright-web.ts for ad-hoc browser automation.
  # playwright-search MCP handles web research separately.
  if command -v playwright-cli &>/dev/null; then
    PCLI_VER=$(playwright-cli --version 2>/dev/null | head -1)
    echo "  @playwright/cli $PCLI_VER — already installed ✓"
    PLAYWRIGHT_CLI_OK=true
  else
    echo "  Installing @playwright/cli globally..."
    if npm install -g @playwright/cli@latest 2>&1 | tail -3; then
      echo "  @playwright/cli installed ✓"
      PLAYWRIGHT_CLI_OK=true
    else
      echo "  ⚠️  npm install -g @playwright/cli failed. Try manually:"
      echo "       npm install -g @playwright/cli@latest"
    fi
  fi

  # ── Step D: Install Chromium for the global playwright-cli ─────────
  if [ "$PLAYWRIGHT_CLI_OK" = true ]; then
    if playwright-cli install-browser chromium 2>&1 | tail -3; then
      echo "  Chromium browser (playwright-cli) ✓"
    else
      echo "  ⚠️  playwright-cli install-browser chromium failed. Try manually:"
      echo "       playwright-cli install-browser chromium"
    fi
  fi
fi

echo ""

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

# Merge external_directory permission so agents can read shared protocol files
# from the install dir during `opencode run` (non-interactive runs auto-reject
# permission asks — without this, every agents/shared/* read fails).
PERM_PATTERN="$GLOBAL_DIR/**"
if command -v jq &>/dev/null && [ -f "$CONFIG_FILE" ]; then
  if jq -e --arg p "$PERM_PATTERN" '.permission.external_directory[$p]' "$CONFIG_FILE" &>/dev/null; then
    echo "  external_directory permission already configured — skipping"
  else
    jq --arg p "$PERM_PATTERN" '.permission = (.permission // {}) | .permission.external_directory = (.permission.external_directory // {}) + {($p): "allow"}' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
    echo "  Added external_directory allow for $GLOBAL_DIR/** (protocol reads in opencode run)"
  fi
elif [ -f "$CONFIG_FILE" ]; then
  if grep -q "external_directory" "$CONFIG_FILE" 2>/dev/null; then
    echo "  external_directory permission appears configured — skipping"
  else
    echo "  ⚠️  Add this manually to $CONFIG_FILE so agents can read shared protocols:"
    echo '    "permission": { "external_directory": { "'"$PERM_PATTERN"'": "allow" } }'
  fi
fi

echo ""

# --- pullmd removal migration (v2.2.1) ---
# pullmd (the external AeternaLabsHQ Docker service) was removed in v2.2.0 and replaced by our
# own in-house pull (bpm-pull, inside playwright-search). Heal any prior `./install.sh --pullmd`
# install: drop the now-stale pullmd MCP entry from opencode.json (else opencode errors trying to
# reach the dead localhost:33000 service) and stop/remove the pullmd containers. No-op otherwise.
if [ -f "$SCRIPT_DIR/scripts/migrate-remove-pullmd.sh" ]; then
  echo "Checking for a prior external pullmd install to clean up..."
  GLOBAL_DIR="$GLOBAL_DIR" bash "$SCRIPT_DIR/scripts/migrate-remove-pullmd.sh" --config "$CONFIG_FILE" || true
  echo ""
fi

# --- playwright-search MCP Setup ---
if [ "$INSTALL_PWS" = true ]; then
  echo "Setting up playwright-search MCP (multi-engine web research + page extraction)..."

  PWS_DIR="${PLAYWRIGHT_SEARCH_DIR:-$HOME/.local/share/playwright-search}"
  PWS_REPO="https://github.com/bpmforge/quarry.git"

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


echo ""

# --- Opengrep Setup (preferred SAST engine — LGPL, client-safe) ---
echo "Checking for Opengrep (preferred SAST engine)..."

OPENGREP_OK=false
OPENGREP_VERSION=""
OPENGREP_INSTALL_URL="https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh"
OPENGREP_INSTALL_CMD="curl -fsSL $OPENGREP_INSTALL_URL | bash"

install_opengrep() {
  echo "  Running official installer: $OPENGREP_INSTALL_CMD"
  if curl -fsSL "$OPENGREP_INSTALL_URL" | bash; then
    export PATH="$HOME/.local/bin:$PATH"
    if command -v opengrep &>/dev/null; then
      OPENGREP_VERSION=$(opengrep --version 2>/dev/null | head -1)
      OPENGREP_OK=true
      echo "  Opengrep $OPENGREP_VERSION — installed ✓"
    elif [ -x "$HOME/.opengrep/cli/latest/opengrep" ]; then
      OPENGREP_VERSION=$("$HOME/.opengrep/cli/latest/opengrep" --version 2>/dev/null | head -1)
      OPENGREP_OK=true
      echo "  Opengrep $OPENGREP_VERSION — installed ✓ (add \$HOME/.opengrep/cli/latest to PATH)"
    else
      echo "  ⚠️ Opengrep installer ran but the binary wasn't found on PATH — check output above."
    fi
  else
    echo "  ⚠️ Opengrep installer failed (network unreachable, or install script changed)."
    echo "     Install manually — see https://github.com/opengrep/opengrep (INSTALL.md), or retry:"
    echo "       $OPENGREP_INSTALL_CMD"
  fi
}

if command -v opengrep &>/dev/null; then
  OPENGREP_VERSION=$(opengrep --version 2>/dev/null | head -1)
  echo "  Opengrep $OPENGREP_VERSION — installed ✓"
  OPENGREP_OK=true
else
  echo "  Opengrep not found."
  if [ "$INSTALL_SEMGREP" = true ]; then
    # --opengrep / --semgrep flag: auto-install without prompting
    echo "  Installing Opengrep (--opengrep/--semgrep flag set)..."
    install_opengrep
  elif [ -t 0 ] && [ -t 1 ]; then
    # No flag, interactive TTY — prompt
    echo ""
    echo "  The /security agent prefers Opengrep (LGPL fork of Semgrep, client-safe)."
    echo "  Semgrep's registry rules are internal-use-only — see references/semgrep-guide.md."
    printf "  Install Opengrep now? [Y/n] "
    read -r opengrep_confirm </dev/tty
    if [[ ! "$opengrep_confirm" =~ ^[Nn] ]]; then
      install_opengrep
    else
      echo "  Skipped. Install later: $OPENGREP_INSTALL_CMD"
    fi
  else
    # Non-interactive (piped install), no flag — print instructions, don't install
    echo "  ℹ️  Opengrep not installed. The /security agent works best with Opengrep."
    echo "     Install: $OPENGREP_INSTALL_CMD"
    echo "     Repo:    https://github.com/opengrep/opengrep"
    echo "     Or re-run: ./install.sh --opengrep  (auto-installs)"
  fi
fi

# --- Semgrep Setup (documented fallback — see references/semgrep-guide.md) ---
echo ""
echo "Checking for Semgrep (SAST fallback if Opengrep is unavailable)..."

SEMGREP_OK=false
SEMGREP_VERSION=""

if command -v semgrep &>/dev/null; then
  SEMGREP_VERSION=$(semgrep --version 2>/dev/null | head -1)
  echo "  Semgrep $SEMGREP_VERSION — installed ✓"
  SEMGREP_OK=true
else
  echo "  Semgrep not found."
  if [ "$OPENGREP_OK" = true ]; then
    echo "  Opengrep is installed (preferred engine) — skipping Semgrep auto-install."
    echo "  Semgrep remains a documented fallback; install later if needed: brew install semgrep"
  elif [ "$INSTALL_SEMGREP" = true ]; then
    # --semgrep/--opengrep flag, but the Opengrep installer failed/was unreachable above:
    # fall back to installing Semgrep so users who only have this path still get a SAST engine.
    echo "  Installing Semgrep (--semgrep flag set, Opengrep unavailable)..."
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
    # No flag, Opengrep unavailable — detect if interactive TTY and prompt
    if [ -t 0 ] && [ -t 1 ]; then
      echo ""
      echo "  The /security agent needs a SAST engine. Opengrep is preferred (re-run with"
      echo "  --opengrep) but Semgrep works as a fallback for automated scanning."
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
      echo "  ⚠️ No SAST engine installed. Opengrep is preferred; Semgrep is a fallback."
      echo "     Install Opengrep: ./install.sh --opengrep  (auto-installs, recommended)"
      echo "     Install Semgrep:  brew install semgrep  (macOS) / pip install semgrep"
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
  # Opengrep is a drop-in reader of these Semgrep-format rule YAMLs, so either
  # engine being present is enough to make use of the community rule cache.
  SAST_ENGINE_OK=false
  { [ "$OPENGREP_OK" = true ] || [ "$SEMGREP_OK" = true ]; } && SAST_ENGINE_OK=true
  if [ "$INSTALL_SEMGREP" = true ] && [ "$SAST_ENGINE_OK" = true ]; then
    # --opengrep/--semgrep flag + a SAST engine is installed: clone missing sources automatically
    echo "  Cloning missing community rule sources (--opengrep/--semgrep flag set)..."
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
  elif [ -t 0 ] && [ -t 1 ] && [ "$SAST_ENGINE_OK" = true ]; then
    # Interactive + a SAST engine installed: prompt
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
    # Non-interactive or no SAST engine installed: print instructions
    if [ "$SAST_ENGINE_OK" = false ]; then
      echo "  ℹ️  Install Opengrep or Semgrep first, then run:  $DEST/scripts/update-semgrep-rules.sh"
    else
      echo "  ℹ️  Run later:  $DEST/scripts/update-semgrep-rules.sh"
      echo "      Or re-run:  ./install.sh --opengrep  (auto-clones everything)"
    fi
  fi
else
  echo "  All 4 community rule sources present ✓"
fi

# --- bpm-memory-mcp MCP Setup (optional, --memory flag) ---
if [ "$INSTALL_MEMORY" = true ]; then
  echo ""
  echo "Setting up bpm-memory-mcp MCP (cross-session project memory)..."

  MEMORY_DIR="${CLAUDE_MEMORY_DIR:-$HOME/Code/bpm-memory-mcp}"
  MEMORY_SERVER="${CLAUDE_MEMORY_PATH:-$MEMORY_DIR/mcp/memory-server/dist/index.js}"
  MEMORY_REPO="https://github.com/bpmforge/bpm-memory-mcp.git"

  if ! command -v node &>/dev/null; then
    echo "  ⚠️  node not found — skipping bpm-memory-mcp"
  else
    if [ ! -d "$MEMORY_DIR/.git" ]; then
      echo "  Cloning bpm-memory-mcp → $MEMORY_DIR ..."
      mkdir -p "$(dirname "$MEMORY_DIR")"
      if git clone --quiet --depth 1 "$MEMORY_REPO" "$MEMORY_DIR"; then
        echo "    cloned ✓"
      else
        echo "    ⚠️  clone failed — skipping memory MCP"
        MEMORY_SERVER=""
      fi
    else
      (cd "$MEMORY_DIR" && git pull --ff-only --quiet 2>/dev/null) || true
      echo "  bpm-memory-mcp up to date"
    fi

    if [ -n "${MEMORY_SERVER:-}" ] && { [ ! -f "$MEMORY_SERVER" ] || [ "$MEMORY_DIR/mcp/memory-server/src/index.ts" -nt "$MEMORY_SERVER" ]; }; then
      echo "  Building bpm-memory-mcp..."
      if (cd "$MEMORY_DIR" && npm install --silent && npm run build --silent) 2>&1 | tail -3; then
        [ -f "$MEMORY_SERVER" ] && echo "    build ✓" || { echo "    ⚠️  build failed"; MEMORY_SERVER=""; }
      fi
    fi

    if [ -n "${MEMORY_SERVER:-}" ] && [ -f "$MEMORY_SERVER" ] && [ -f "$CONFIG_FILE" ]; then
      if command -v jq &>/dev/null; then
        MEM_CFG="$(jq -nc --arg path "$MEMORY_SERVER" \
          '{type: "local", command: ["node", $path], enabled: true}')"
        if jq -e '.mcp.memory' "$CONFIG_FILE" &>/dev/null; then
          jq --argjson cfg "$MEM_CFG" '.mcp.memory = $cfg' \
            "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
          echo "  Updated memory MCP path in $CONFIG_FILE"
        else
          jq --argjson cfg "$MEM_CFG" '.mcp = (.mcp // {}) + {"memory": $cfg}' \
            "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
          echo "  Added memory MCP to $CONFIG_FILE"
        fi
      else
        echo "  ⚠️  jq not installed — add this to $CONFIG_FILE under \"mcp\":"
        echo '    "memory": {"type":"local","command":["node","'"$MEMORY_SERVER"'"],"enabled":true}'
      fi
    fi

    # Also register with Claude Code, if installed (separate config from OpenCode's $CONFIG_FILE)
    if [ -n "${MEMORY_SERVER:-}" ] && [ -f "$MEMORY_SERVER" ]; then
      if command -v claude &>/dev/null; then
        if claude mcp list 2>/dev/null | grep -q "^memory"; then
          echo "  bpm-memory-mcp MCP already registered with Claude Code"
        else
          claude mcp add memory node "$MEMORY_SERVER" 2>&1 | head -3
          echo "  Registered bpm-memory-mcp MCP with Claude Code (user-level)"
        fi
      fi
    fi

    # --- Embedding-provider setup (semantic recall needs an embedder) --------
    # Without one, memory silently degrades to keyword-only BM25 — recall works
    # but misses paraphrased matches. The server self-heals (retries the
    # provider periodically), so setting it up later also works.
    echo ""
    echo "  Memory embedder check (semantic vector recall):"
    EMBEDDER_OK=false
    if curl -sf --max-time 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
      if curl -sf --max-time 2 http://localhost:11434/api/tags | grep -q "nomic-embed-text"; then
        echo "    ✓ ollama detected with nomic-embed-text — vector recall active"
        EMBEDDER_OK=true
      else
        echo "    ollama detected but nomic-embed-text model missing"
        if [ -t 0 ]; then
          printf "    Pull it now (~270MB)? [Y/n]: "; read -r yn </dev/tty
          case "${yn:-Y}" in [Yy]*)
            ollama pull nomic-embed-text && EMBEDDER_OK=true || echo "    ⚠️  pull failed — run: ollama pull nomic-embed-text" ;;
          esac
        else
          echo "    → run: ollama pull nomic-embed-text"
        fi
      fi
    elif curl -sf --max-time 2 http://localhost:1234/v1/models >/dev/null 2>&1; then
      if curl -sf --max-time 2 http://localhost:1234/v1/models | grep -qi "embed"; then
        echo "    ✓ LM Studio detected with an embedding model — vector recall active"
        EMBEDDER_OK=true
      else
        echo "    LM Studio detected but no embedding model loaded"
        echo "    → in LM Studio, load: text-embedding-nomic-embed-text-v1.5"
      fi
    fi
    if [ "$EMBEDDER_OK" = false ]; then
      echo "    No embedder active — memory works now in keyword-only (BM25) mode."
      echo "    To enable semantic recall later (server picks it up automatically):"
      echo "      option A: install ollama (https://ollama.com) then: ollama pull nomic-embed-text"
      echo "      option B: run LM Studio with text-embedding-nomic-embed-text-v1.5 on port 1234"
    fi
  fi
fi

# --- bpm-code-search-mcp Setup ---
if [ "$INSTALL_CODE_SEARCH" = true ]; then
echo ""
echo "Setting up bpm-code-search-mcp (semantic code search + symbol index)..."

CODE_SEARCH_DIR="${BPM_CODE_SEARCH_DIR:-$HOME/Code/bpm-code-search-mcp}"
CODE_SEARCH_BIN="$CODE_SEARCH_DIR/dist/index.js"
CODE_SEARCH_REPO="https://github.com/bpmforge/bpm-code-search-mcp.git"

if ! command -v node &>/dev/null; then
  echo "  ⚠️  node not found — skipping bpm-code-search-mcp"
else
  if [ ! -d "$CODE_SEARCH_DIR/.git" ]; then
    echo "  Cloning bpm-code-search-mcp → $CODE_SEARCH_DIR ..."
    mkdir -p "$(dirname "$CODE_SEARCH_DIR")"
    if git clone --quiet --depth 1 "$CODE_SEARCH_REPO" "$CODE_SEARCH_DIR"; then
      echo "    cloned ✓"
    else
      echo "    ⚠️  clone failed — skipping code-search MCP"
      CODE_SEARCH_BIN=""
    fi
  else
    (cd "$CODE_SEARCH_DIR" && git pull --ff-only --quiet 2>/dev/null) || true
    echo "  bpm-code-search-mcp up to date"
  fi

  if [ -n "${CODE_SEARCH_BIN:-}" ] && { [ ! -f "$CODE_SEARCH_BIN" ] || [ "$CODE_SEARCH_DIR/src/index.ts" -nt "$CODE_SEARCH_BIN" ]; }; then
    echo "  Building bpm-code-search-mcp..."
    if (cd "$CODE_SEARCH_DIR" && npm install --silent && npm run build --silent) 2>&1 | tail -3; then
      [ -f "$CODE_SEARCH_BIN" ] && echo "    build ✓" || { echo "    ⚠️  build failed"; CODE_SEARCH_BIN=""; }
    fi
  fi

  if [ -n "${CODE_SEARCH_BIN:-}" ] && [ -f "$CODE_SEARCH_BIN" ] && [ -f "$CONFIG_FILE" ]; then
    if command -v jq &>/dev/null; then
      CS_CFG="$(jq -nc --arg path "$CODE_SEARCH_BIN" \
        '{type: "local", command: ["node", $path], enabled: true}')"
      if jq -e '.mcp."code-search"' "$CONFIG_FILE" &>/dev/null; then
        jq --argjson cfg "$CS_CFG" '.mcp."code-search" = $cfg' \
          "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
        echo "  Updated code-search MCP path in $CONFIG_FILE"
      else
        jq --argjson cfg "$CS_CFG" '.mcp = (.mcp // {}) + {"code-search": $cfg}' \
          "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
        echo "  Added code-search MCP to $CONFIG_FILE"
      fi
    else
      echo "  ⚠️  jq not installed — add this manually to $CONFIG_FILE under \"mcp\":"
      echo '    "code-search": {'
      echo '      "type": "local",'
      echo "      \"command\": [\"node\", \"$CODE_SEARCH_BIN\"],"
      echo '      "enabled": true'
      echo '    }'
    fi
  fi

  # Also register with Claude Code, if installed (separate config from OpenCode's $CONFIG_FILE)
  if [ -n "${CODE_SEARCH_BIN:-}" ] && [ -f "$CODE_SEARCH_BIN" ]; then
    if command -v claude &>/dev/null; then
      if claude mcp list 2>/dev/null | grep -q "^code-search"; then
        echo "  bpm-code-search-mcp already registered with Claude Code"
      else
        claude mcp add code-search node "$CODE_SEARCH_BIN" 2>&1 | head -3
        echo "  Registered bpm-code-search-mcp with Claude Code (user-level)"
      fi
    fi
  fi
fi
fi  # INSTALL_CODE_SEARCH

# --- playwright-mcp Setup (LLM-agnostic browser automation) ---
echo ""
echo "Setting up playwright-mcp (browser automation, screenshots, E2E testing)..."

INSTALL_PLAYWRIGHT_MCP=true
for arg in "$@"; do
  [ "$arg" = "--no-playwright-mcp" ] && INSTALL_PLAYWRIGHT_MCP=false
done

if [ "$INSTALL_PLAYWRIGHT_MCP" = true ]; then
  if ! command -v node &>/dev/null; then
    echo "  ⚠️  node not found — skipping playwright-mcp"
  elif [ -f "$CONFIG_FILE" ] && command -v jq &>/dev/null; then
    PMCP_CFG='{"type":"local","command":["npx","-y","@playwright/mcp@latest"],"enabled":true}'
    if jq -e '.mcp."playwright-mcp"' "$CONFIG_FILE" &>/dev/null; then
      echo "  playwright-mcp already in $CONFIG_FILE"
    else
      jq --argjson cfg "$PMCP_CFG" '.mcp = (.mcp // {}) + {"playwright-mcp": $cfg}' \
        "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
      echo "  Added playwright-mcp to $CONFIG_FILE"
      echo "  First use will auto-install Chromium (~170MB). To pre-install:"
      echo "    npx playwright install chromium"
    fi
  else
    echo "  ⚠️  jq not installed or config missing — add this to $CONFIG_FILE under \"mcp\":"
    echo '    "playwright-mcp": {'
    echo '      "type": "local",'
    echo '      "command": ["npx", "-y", "@playwright/mcp@latest"],'
    echo '      "enabled": true'
    echo '    }'
  fi
else
  echo "  Skipping playwright-mcp (--no-playwright-mcp set)"
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
if [ "$NPM_OK" = true ]; then
  echo "  ✓  npm tools: installed ($DEST/node_modules)"
elif [ -d "$DEST/node_modules" ]; then
  echo "  ✓  npm tools: node_modules present (from prior install)"
else
  echo "  ⚠️  npm tools: not installed — run: cd $DEST && npm install"
fi

# Playwright
if [ "$PLAYWRIGHT_CLI_OK" = true ] && [ "$PLAYWRIGHT_NPM_OK" = true ]; then
  echo "  ✓  Playwright: @playwright/cli + npm package + Chromium all ready"
elif [ "$PLAYWRIGHT_CLI_OK" = true ]; then
  echo "  ⚠️  Playwright: @playwright/cli OK but npm Chromium missing"
  echo "       Fix: cd $DEST && npx playwright install chromium"
elif [ "$PLAYWRIGHT_NPM_OK" = true ]; then
  echo "  ⚠️  Playwright: npm Chromium OK but @playwright/cli missing"
  echo "       Fix: npm install -g @playwright/cli@latest && playwright-cli install-browser chromium"
else
  echo "  ⚠️  Playwright: not fully installed — playwright-web tool won't work"
  echo "       Fix (npm package + Chromium): cd $DEST && npm install && npx playwright install chromium"
  echo "       Fix (global CLI):             npm install -g @playwright/cli@latest && playwright-cli install-browser chromium"
fi

# MCP — Context7
if [ -f "$GLOBAL_DIR/opencode.json" ] && grep -q "context7" "$GLOBAL_DIR/opencode.json" 2>/dev/null; then
  echo "  ✓  MCP: Context7 configured"
else
  echo "  ⚠️  MCP: Context7 not configured — check $GLOBAL_DIR/opencode.json"
fi


# Opengrep binary (preferred SAST engine)
if [ "$OPENGREP_OK" = true ]; then
  echo "  ✓  Opengrep: $OPENGREP_VERSION"
else
  echo "  ⚠️  Opengrep: not installed — run: ./install.sh --opengrep"
fi

# Semgrep binary (documented fallback)
if [ "$SEMGREP_OK" = true ]; then
  echo "  ✓  Semgrep: $SEMGREP_VERSION"
elif [ "$OPENGREP_OK" = true ]; then
  echo "  ℹ️  Semgrep: not installed (Opengrep covers SAST scanning)"
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
echo "  loop-detector — prevent infinite retry loops"
echo "  test-runner, playwright-test — testing automation"
echo "  semgrep-scan, semgrep-rule — security scanning"
echo "  deploy, log-parser, pomodoro, task — productivity"
echo "  See tools/CUSTOM_TOOLS_GUIDE.md for LM Studio setup"
echo ""
echo "MCP Servers configured:"
echo "  Context7          — Live library docs lookup (always installed)"
echo "  playwright-search — Multi-engine web research + paragraph-ranked extraction"
echo ""
echo "Optional: mirror the ticket lifecycle to Jira (plan.json stays source of truth):"
echo "  export JIRA_BASE_URL=https://jira.company.com   # unset = disabled (no-op)"
echo "  export JIRA_TOKEN=<personal-access-token>       # Data Center: sent as Bearer"
echo "  export JIRA_PROJECT=PROJ"
echo "  # Cloud instead: export JIRA_FLAVOR=cloud JIRA_EMAIL=you@co.com JIRA_TOKEN=<api-token>"
echo "  $DEST/scripts/jira/jira.sh doctor     # verify config + connectivity"
echo "  $DEST/scripts/jira/jira.sh sync-plan  # create Jira epics/stories/links once"
echo "  See references/jira-adapter.md for the full verb reference + hygiene mapping."
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
if [ "${INSTALL_TOOLS:-false}" = true ]; then
  bash "$SCRIPT_DIR/scripts/check-tools.sh" --install
else
  bash "$SCRIPT_DIR/scripts/check-tools.sh"
fi
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
