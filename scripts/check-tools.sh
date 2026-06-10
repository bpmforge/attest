#!/usr/bin/env bash
#
# check-tools.sh -- detect (and optionally install) the external code-analysis
# tools the expert agents use. The agents all degrade to grep when a tool is
# missing, so none of these is required — but each one upgrades a specialist
# from heuristic to deterministic.
#
#   check-tools.sh            report what's present / missing (exit 0 always)
#   check-tools.sh --install  attempt to install the missing easy ones
#                             (npm -g and pipx/pip; never sudo, never go/brew)
#
# Used by install.sh (report) and doctor.sh (presence check).

set -u
INSTALL=false
[[ "${1:-}" == "--install" ]] && INSTALL=true

have() { command -v "$1" >/dev/null 2>&1; }
ok()   { printf '  \033[32m✓\033[0m %-13s %s\n' "$1" "$2"; }
miss() { printf '  \033[33m○\033[0m %-13s missing — %s\n' "$1" "$2"; }

# tool | feeds which specialist | how to install (manual hint) | auto-install cmd ('' = no auto)
TOOLS="
semgrep|security-auditor (SAST)|pipx install semgrep|pipx install semgrep
knip|dead-code-detector (TS/JS unused)|npm i -g knip|npm i -g knip
ts-prune|dead-code-detector (TS unused exports)|npm i -g ts-prune|npm i -g ts-prune
jscpd|duplication-detector|npm i -g jscpd|npm i -g jscpd
vulture|dead-code-detector (Python)|pipx install vulture|pipx install vulture
radon|complexity-analyzer (Python)|pipx install radon|pipx install radon
lizard|complexity-analyzer (multi-lang)|pipx install lizard|pipx install lizard
staticcheck|dead-code-detector (Go)|go install honnef.co/go/tools/cmd/staticcheck@latest|
trufflehog|secrets-scanner|brew install trufflehog|
mmdc|validate-mermaid (authoritative render)|npm i -g @mermaid-js/mermaid-cli|npm i -g @mermaid-js/mermaid-cli
"

echo "Code-analysis tools (all optional — agents fall back to grep):"
echo ""

missing_auto=()
while IFS='|' read -r tool feeds hint auto; do
  [[ -z "$tool" ]] && continue
  if have "$tool"; then
    ver=$("$tool" --version 2>/dev/null | head -1 | tr -d '\n')
    ok "$tool" "$feeds${ver:+  ($ver)}"
  else
    miss "$tool" "$feeds  →  $hint"
    [[ -n "$auto" ]] && missing_auto+=("$tool|$auto")
  fi
done <<< "$TOOLS"

if [[ "$INSTALL" == true && "${#missing_auto[@]}" -gt 0 ]]; then
  echo ""
  echo "Installing the auto-installable missing tools..."
  for entry in "${missing_auto[@]}"; do
    tool="${entry%%|*}"; cmd="${entry#*|}"
    # only run if the package manager the cmd needs is present
    pm="${cmd%% *}"
    if have "$pm"; then
      echo "  → $cmd"
      eval "$cmd" >/dev/null 2>&1 && echo "    installed $tool" || echo "    FAILED $tool (run manually: $cmd)"
    else
      echo "  skip $tool — needs '$pm' (not installed)"
    fi
  done
elif [[ "${#missing_auto[@]}" -gt 0 ]]; then
  echo ""
  echo "Install the easy ones automatically:  $(dirname "$0")/check-tools.sh --install"
  echo "(installs only via npm -g and pipx/pip — never sudo; staticcheck/trufflehog stay manual)"
fi

exit 0
