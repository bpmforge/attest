#!/usr/bin/env bash
#
# validate-rules.sh -- lint the `rules/` primitive (P-A3, T1-03).
#
# A rule file under <project-root>/rules/ must carry parseable frontmatter:
# non-empty `description`, explicit boolean `alwaysApply`, and -- unless
# alwaysApply is true -- at least one `globs` entry (a rule with neither can
# never load, which is worse than not existing: it reads as coverage the
# rule set lacks). The actual parsing lives in scripts/lib/rules.mjs (the
# same loader selectRules() uses), so the validator and the runtime can
# never disagree about what "malformed" means.
#
# Self-skips (note, not gap) when the target project has no rules/ dir.
#
# Usage: validate-rules.sh [project-root]
# Exit 0 clean / 1 gaps / 2 error.

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
usage: validate-rules.sh [project-root]

Lints every rule file under <project-root>/rules/ via scripts/lib/rules.mjs:
  - frontmatter block present and parseable
  - non-empty `description`
  - explicit boolean `alwaysApply`
  - `globs` present unless alwaysApply: true

Exit codes: 0 clean (or no rules/ dir -- self-skip) / 1 gaps / 2 error.
EOF
  exit 0
fi

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-rules"

ROOT="$(detect_project_root "${1:-}")"
RULES_DIR="$ROOT/rules"
LIB="$(dirname "${BASH_SOURCE[0]}")/../lib/rules.mjs"

if [[ ! -d "$RULES_DIR" ]]; then
  note "no rules/ directory at $ROOT -- nothing to check"
  validator_exit; exit $?
fi

if ! command -v node >/dev/null 2>&1; then
  note "node not found -- cannot lint rules frontmatter"
  validator_exit; exit $?
fi
if [[ ! -f "$LIB" ]]; then
  gap "missing-lib" "rules loader not found at $LIB"
  validator_exit; exit $?
fi

while IFS= read -r line; do
  case "$line" in
    *"[GAP]"*) gap "rule-frontmatter" "${line#*\[GAP\] }" ;;
  esac
done < <(node "$LIB" lint "$RULES_DIR" 2>&1 || true)

if [[ "$GAP_COUNT" -eq 0 ]]; then
  RULE_COUNT="$(find "$RULES_DIR" -maxdepth 1 -name '*.md' ! -name 'README.md' | wc -l | tr -d ' ')"
  pass "$RULE_COUNT rule file(s) carry valid description/globs/alwaysApply frontmatter"
fi

validator_exit
