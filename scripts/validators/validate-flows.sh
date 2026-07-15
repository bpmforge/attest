#!/usr/bin/env bash
#
# validate-flows.sh -- validates docs/design/flows.md, the ROOT of the design
# chain (ux-researcher's output). tokens.json (design-system-lead), components.md,
# UX_SPEC.md, and microcopy.md all derive from it -- so a malformed flows.md
# silently corrupts 3+ downstream agents, yet it was the only design-chain root
# with no validator (its siblings have validate-ux-spec.sh / validate-design-
# tokens.sh). This closes that gap.
#
# Checks (structural, offline):
#   1. flows.md exists in docs/design/ and is non-empty -- UNLESS the project
#      declares itself headless in ARCHITECTURE.md (same escape as validate-ux-spec).
#   2. A user-flow section with at least one Mermaid diagram (the flows).
#   3. A screen-inventory section that names screens (the derivation source
#      design-system-lead/components.md and UX_SPEC build from).
#   4. No placeholder text ([TODO], [TBD], PLACEHOLDER).
#
# Usage: validate-flows.sh [project-root]
# Exit 0 clean/skipped / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-flows"

ROOT="$(detect_project_root "${1:-}")"
FLOWS="$ROOT/docs/design/flows.md"
ARCH_MD="$ROOT/docs/ARCHITECTURE.md"

# -- 1. exists (or headless) ---------------------------------------------------
if ! file_exists_nonempty "$FLOWS"; then
  if grep -qiE 'No UI[[:space:]]*(—|--|-)[[:space:]]*UX branch not applicable' "$ARCH_MD" 2>/dev/null; then
    pass "no flows.md, but ARCHITECTURE.md declares 'No UI — UX branch not applicable' — headless project, flow checks skipped"
    validator_exit; exit $?
  fi
  # A project simply not at the design phase yet is not a failure — only flag a
  # missing flows.md when downstream design artifacts exist that should derive
  # from it (tokens.json / components.md / UX_SPEC.md present without a root).
  if file_exists_nonempty "$ROOT/docs/design/tokens.json" || file_exists_nonempty "$ROOT/docs/design/components.md" || file_exists_nonempty "$ROOT/docs/design/UX_SPEC.md"; then
    gap "missing-flows-root" "downstream design artifacts (tokens.json/components.md/UX_SPEC.md) exist but docs/design/flows.md (their derivation root) is missing — run the ux-researcher HANDOFF"
    validator_exit; exit $?
  fi
  note "no docs/design/flows.md and no downstream design artifacts — design phase not reached, nothing to check"
  validator_exit; exit $?
fi
pass "flows.md present"

# -- 2. user flows with a Mermaid diagram -------------------------------------
if grep -qiE '```[[:space:]]*mermaid' "$FLOWS"; then
  pass "flows.md contains at least one Mermaid flow diagram"
else
  gap "no-flow-diagram" "flows.md has no \`\`\`mermaid diagram — user flows must be diagrammed, not just prose (boxes-and-arrows is this agent's whole job)"
fi

# -- 3. screen inventory that names screens -----------------------------------
if grep -qiE 'screen inventory|## screens|screen[[:space:]]+list' "$FLOWS"; then
  pass "flows.md has a screen inventory section"
else
  gap "no-screen-inventory" "flows.md has no screen-inventory section — it is the derivation source design-system-lead (components.md) and ux-engineer (UX_SPEC) build from; without it the downstream design chain has no anchor"
fi

# -- 4. no placeholders --------------------------------------------------------
if grep -qiE '\[TODO\]|\[TBD\]|PLACEHOLDER|<replace>' "$FLOWS"; then
  gap "placeholder-text" "flows.md contains placeholder text ([TODO]/[TBD]/PLACEHOLDER) — the design chain must not derive from an unfinished root"
else
  pass "flows.md has no placeholder text"
fi

validator_exit
