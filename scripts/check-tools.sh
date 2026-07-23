#!/usr/bin/env bash
#
# check-tools.sh -- detect (and optionally install) the external code-analysis
# tools the expert agents use. The agents all degrade to grep when a tool is
# missing, so none of these is required — but each one upgrades a specialist
# from heuristic to deterministic.
#
#   check-tools.sh            report what's present / missing (exit 0 always)
#   check-tools.sh --install  attempt to install the missing easy ones
#                             (npm -g and pipx; never sudo, never a pkg manager)
#
# Used by install.sh (report) and doctor.sh (presence check).
#
# ── Never-sudo contract ───────────────────────────────────────────────────────
# This script NEVER runs sudo and never invokes apt/dnf/pacman/brew. When a
# system prerequisite is genuinely missing it PRINTS the exact command for the
# detected OS and moves on. Escalation is the user's decision, not ours.
#
# ── Bare-Linux lessons (2026-07, Ubuntu 24.04 noble, field report) ────────────
# A fresh non-root Linux box failed every auto-install with a bare "FAILED <tool>"
# and no reason, so the cause had to be reverse-engineered by hand. Fixed here:
#   1. Errors are no longer swallowed — the real stderr tail is printed. This is
#      the single highest-value change; `>/dev/null 2>&1` caused the whole
#      troubleshooting session.
#   2. `npm i -g` hits EACCES when the global prefix is root-owned (nodesource
#      and distro node packages both do this). We retry scoped into
#      ~/.npm-global via `--prefix` — which does NOT rewrite the user's npmrc —
#      and then tell them to add its bin/ to PATH.
#   3. pipx is absent and noble is PEP 668 (externally-managed), so
#      `pip install --user pipx` fails too. We do not try to be clever: we print
#      the one accurate distro command.
#   4. mmdc is NOT auto-installed. @mermaid-js/mermaid-cli pulls puppeteer, which
#      downloads Chromium and needs `unzip` plus browser libs; worse,
#      PUPPETEER_SKIP_DOWNLOAD leaves a *broken* renderer — strictly worse than
#      absent, because validate-mermaid.sh cleanly skips a missing mmdc but a
#      present-and-broken one fails at runtime. A partly-extracted
#      ~/.cache/puppeteer dir also poisons every retry until it is removed.
# Verified in a bare ubuntu:24.04 container as a non-root user, not in CI —
# GitHub's ubuntu-latest has a writable npm prefix and unzip, so it reproduces
# none of this.

set -u
INSTALL=false
[[ "${1:-}" == "--install" ]] && INSTALL=true

have() { command -v "$1" >/dev/null 2>&1; }
ok()   { printf '  \033[32m✓\033[0m %-13s %s\n' "$1" "$2"; }
miss() { printf '  \033[33m○\033[0m %-13s missing — %s\n' "$1" "$2"; }
note() { printf '    %s\n' "$1"; }

NPM_USER_PREFIX="$HOME/.npm-global"

# Where a freshly-installed tool actually lands, even when that bin is not on the
# CURRENT shell's PATH (the case a bare-Linux run hits: pipx → ~/.local/bin, npm
# -g → the npm prefix bin, often ~/.npm-global/bin from a user-set prefix). We
# must check these directly — `command -v` alone reports a just-installed tool as
# missing and the old success check then printed "FAILED" for tools that
# installed fine (observed live on a zsh dev box, 2026-07).
tool_bins() {
  printf '%s\n' \
    "$HOME/.local/bin" \
    "$NPM_USER_PREFIX/bin" \
    "$(npm config get prefix 2>/dev/null)/bin" \
    "$HOME/go/bin"
}

# Resolve a tool to a path via PATH first, then the known install bins. Prints the
# path (empty if genuinely absent).
tool_path() {
  local t="$1" p
  p="$(command -v "$t" 2>/dev/null)" && { printf '%s\n' "$p"; return 0; }
  local d
  while IFS= read -r d; do
    [[ -n "$d" && -x "$d/$t" ]] && { printf '%s\n' "$d/$t"; return 0; }
  done < <(tool_bins)
  return 1
}

# The rc file the user's LOGIN shell reads — so a PATH hint names the right file.
# The user's login shell, NOT the shell this script runs under (it runs under
# bash even on a zsh box), so detect from the passwd entry / $SHELL.
login_profile() {
  local sh
  sh="$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f7)"
  [[ -z "$sh" ]] && sh="${SHELL:-}"
  case "$sh" in
    */zsh)  printf '%s\n' "$HOME/.zshrc" ;;
    */bash) printf '%s\n' "$HOME/.bashrc" ;;
    *)      printf '%s\n' "${ENV:-$HOME/.profile}" ;;
  esac
}

# ── OS-correct install hints ──────────────────────────────────────────────────
# The old script hard-coded `brew install trufflehog`, which is wrong on every
# Linux box. Resolve the hint per platform instead.
case "$(uname -s)" in
  Darwin) OS="macos" ;;
  Linux)  OS="linux" ;;
  *)      OS="other" ;;
esac

# Package-manager command for a system package, or "" when we can't tell.
sys_pkg_cmd() {
  pkg="$1"
  if [[ "$OS" == "macos" ]]; then
    if have brew; then echo "brew install $pkg"
    else echo "install Homebrew (https://brew.sh), then: brew install $pkg"; fi
  elif have apt-get; then echo "sudo apt update && sudo apt install -y $pkg"
  elif have dnf;     then echo "sudo dnf install -y $pkg"
  elif have pacman;  then echo "sudo pacman -S --noconfirm $pkg"
  elif have zypper;  then echo "sudo zypper install -y $pkg"
  elif have apk;     then echo "sudo apk add $pkg"
  else echo ""
  fi
}

trufflehog_hint() {
  if [[ "$OS" == "macos" ]]; then
    echo "brew install trufflehog"
  else
    echo "see https://github.com/trufflesecurity/trufflehog#installation (official installer script)"
  fi
}

mmdc_hint() {
  # Deliberately multi-part: a bare `npm i -g @mermaid-js/mermaid-cli` is exactly
  # what fails on a bare box, so naming only that is the unhelpful hint we fixed.
  if [[ "$OS" == "macos" ]]; then
    echo "npm i -g @mermaid-js/mermaid-cli   (downloads Chromium; optional)"
  else
    echo "needs 'unzip' + Chromium libs first — see 'System prerequisites' below"
  fi
}

# tool | feeds which specialist | how to install (manual hint) | auto-install cmd ('' = no auto)
#
# staticcheck (go), trufflehog (installer script), and mmdc (Chromium download)
# are intentionally manual — none is installable safely without sudo or a large
# opaque download that can half-fail and poison retries.
TOOLS="
semgrep|security-auditor (SAST)|pipx install semgrep|pipx install semgrep
knip|dead-code-detector (TS/JS unused)|npm i -g knip|npm i -g knip
ts-prune|dead-code-detector (TS unused exports)|npm i -g ts-prune|npm i -g ts-prune
jscpd|duplication-detector|npm i -g jscpd|npm i -g jscpd
vulture|dead-code-detector (Python)|pipx install vulture|pipx install vulture
radon|complexity-analyzer (Python)|pipx install radon|pipx install radon
lizard|complexity-analyzer (multi-lang)|pipx install lizard|pipx install lizard
staticcheck|dead-code-detector (Go)|go install honnef.co/go/tools/cmd/staticcheck@latest|
trufflehog|secrets-scanner|__TRUFFLEHOG_HINT__|
mmdc|validate-mermaid (authoritative render)|__MMDC_HINT__|
"

echo "Code-analysis tools (all optional — agents fall back to grep):"
echo ""

missing_auto=()
off_path_bins=()
need_pipx=false
need_npm=false
while IFS='|' read -r tool feeds hint auto; do
  [[ -z "$tool" ]] && continue
  case "$hint" in
    __TRUFFLEHOG_HINT__) hint="$(trufflehog_hint)" ;;
    __MMDC_HINT__)       hint="$(mmdc_hint)" ;;
  esac
  if tp="$(tool_path "$tool")"; then
    ver=$("$tp" --version 2>/dev/null | head -1 | tr -d '\n')
    if have "$tool"; then
      ok "$tool" "$feeds${ver:+  ($ver)}"
    else
      # Installed, but its bin is not on this shell's PATH (e.g. ~/.npm-global/bin).
      ok "$tool" "$feeds${ver:+  ($ver)}  [installed at $tp — add its dir to PATH]"
      off_path_bins+=("$(dirname "$tp")")
    fi
  else
    miss "$tool" "$feeds  →  $hint"
    if [[ -n "$auto" ]]; then
      missing_auto+=("$tool|$auto")
      case "$auto" in
        pipx*) have pipx || need_pipx=true ;;
        npm*)  have npm  || need_npm=true  ;;
      esac
    fi
  fi
done <<< "$TOOLS"

# ── Install pass ──────────────────────────────────────────────────────────────
# Failures print the real reason. npm EACCES retries into a user-owned prefix.
npm_prefix_note=false

# "Installed" means the binary is now RESOLVABLE (PATH or a known install bin) —
# not that the command exited 0. Two real cases the exit code gets wrong, both
# seen live: pipx exits NON-zero on "already installed" (the tool is present), and
# `npm i -g` exits 0 but lands in a prefix bin that is not on the current PATH.
# Judge by the artifact, not the return code.
try_install() {
  tool="$1"; cmd="$2"
  echo "  → $cmd"
  out=$(eval "$cmd" 2>&1); rc=$?
  local p
  if p="$(tool_path "$tool")"; then
    on_path="$(command -v "$tool" 2>/dev/null || true)"
    if [[ -n "$on_path" ]]; then
      echo "    installed $tool"
    else
      echo "    installed $tool → $p (not on this shell's PATH)"
      npm_prefix_note=true
    fi
    return 0
  fi

  # npm global-prefix permission failure: retry scoped to a user-owned prefix
  # instead of `npm config set prefix`, which would silently rewrite ~/.npmrc.
  if [[ "$cmd" == npm* ]] && printf '%s' "$out" | grep -qiE 'EACCES|permission denied|EPERM'; then
    note "global prefix not writable ($(npm config get prefix 2>/dev/null)) — retrying into $NPM_USER_PREFIX"
    scoped="${cmd/npm i -g/npm i -g --prefix \"$NPM_USER_PREFIX\"}"
    echo "  → $scoped"
    out=$(eval "$scoped" 2>&1); rc=$?
    if [[ -x "$NPM_USER_PREFIX/bin/$tool" ]]; then
      echo "    installed $tool → $NPM_USER_PREFIX/bin/$tool (not on this shell's PATH)"
      npm_prefix_note=true
      return 0
    fi
  fi

  echo "    FAILED $tool"
  # The reason, not just the verdict — this is what was missing before.
  printf '%s\n' "$out" | grep -vE '^[[:space:]]*$' | tail -3 | sed 's/^/      /'
  note "run manually: $cmd"
  return 1
}

if [[ "$INSTALL" == true && "${#missing_auto[@]}" -gt 0 ]]; then
  echo ""
  echo "Installing the auto-installable missing tools..."
  for entry in "${missing_auto[@]}"; do
    tool="${entry%%|*}"; cmd="${entry#*|}"
    pm="${cmd%% *}"
    if have "$pm"; then
      try_install "$tool" "$cmd" || true
    else
      echo "  skip $tool — needs '$pm' (not installed; see 'System prerequisites' below)"
    fi
  done

  if [[ "$npm_prefix_note" == true ]]; then
    off_path_bins+=("$NPM_USER_PREFIX/bin")
  fi
elif [[ "${#missing_auto[@]}" -gt 0 ]]; then
  echo ""
  echo "Install the easy ones automatically:  $(dirname "$0")/check-tools.sh --install"
  echo "(npm -g and pipx only — never sudo; staticcheck/trufflehog/mmdc stay manual)"
fi

# ── System prerequisites (printed, never executed) ────────────────────────────
prereqs=()

if [[ "$need_pipx" == true ]]; then
  c="$(sys_pkg_cmd pipx)"
  if [[ -n "$c" ]]; then
    prereqs+=("pipx — required for semgrep/vulture/radon/lizard:|$c && pipx ensurepath")
  else
    prereqs+=("pipx — required for semgrep/vulture/radon/lizard:|install pipx via your OS package manager, then: pipx ensurepath")
  fi
  # Say why the obvious workaround does not work, so nobody burns time on it.
  if [[ "$OS" == "linux" ]] && ls /usr/lib/python3*/EXTERNALLY-MANAGED >/dev/null 2>&1; then
    prereqs+=("  (PEP 668 externally-managed Python here — 'pip install --user pipx' will refuse; use the command above)|")
  fi
fi

if [[ "$need_npm" == true ]]; then
  c="$(sys_pkg_cmd nodejs)"
  prereqs+=("node/npm — required for knip/ts-prune/jscpd:|${c:-install Node.js from https://nodejs.org}")
fi

# mmdc prerequisites, only worth printing when mmdc is actually absent.
if ! have mmdc && [[ "$OS" == "linux" ]]; then
  c="$(sys_pkg_cmd unzip)"
  prereqs+=("mmdc (optional — authoritative Mermaid render; static Mermaid checks run without it):|${c:-install unzip}")
  prereqs+=("  then:|npm i -g @mermaid-js/mermaid-cli")
  prereqs+=("  headless Chrome libs, only if rendering then fails:|sudo apt install -y libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2t64")
  # The trap that makes a retry fail *differently* than the first attempt.
  if [[ -d "$HOME/.cache/puppeteer" ]]; then
    prereqs+=("  a previous attempt left a partial Chromium download that breaks every retry — clear it first:|rm -rf ~/.cache/puppeteer")
  fi
fi

if [[ "${#prereqs[@]}" -gt 0 ]]; then
  echo ""
  echo "System prerequisites (need sudo — this script never runs it for you):"
  for p in "${prereqs[@]}"; do
    label="${p%%|*}"; cmd="${p#*|}"
    echo "  $label"
    [[ -n "$cmd" ]] && echo "      $cmd"
  done
fi

# ── PATH hint (shell-correct) ─────────────────────────────────────────────────
# Some tools are installed but in a bin the current shell's PATH does not include
# (npm user prefix, pipx ~/.local/bin). Name the LOGIN shell's rc file, not a
# hardcoded ~/.bashrc — the box may be zsh.
if [[ "${#off_path_bins[@]}" -gt 0 ]]; then
  # unique dirs
  uniq_bins="$(printf '%s\n' "${off_path_bins[@]}" | awk '!seen[$0]++')"
  prof="$(login_profile)"
  echo ""
  echo "PATH: some tools installed to a dir not on your shell's PATH. Add it so the agents (and you) find them:"
  while IFS= read -r d; do
    [[ -z "$d" ]] && continue
    printf '      echo '\''export PATH="%s:$PATH"'\'' >> %s\n' "$d" "$prof"
  done <<< "$uniq_bins"
  echo "    then: source $prof   (or open a new shell)"
fi

exit 0
