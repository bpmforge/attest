#!/usr/bin/env bash
#
# figma.sh — thin wrapper over scripts/figma/figma.mjs (the Figma design-source
# adapter). All logic lives in figma.mjs; this locates node + the script and
# forwards args. Figma → docs/design/tokens.json is one-way; tokens.json (owned
# by design-system-lead) stays the source of truth for the build. When Figma is
# not configured the design pipeline authors tokens.json from prose as before.
#
# Config (env):
#   FIGMA_TOKEN     personal access token   (unset → adapter disabled)
#   FIGMA_FILE_KEY  the file key from the Figma URL (…/file/<KEY>/…)
#
# Usage: figma.sh <pull|derive-tokens|doctor>
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$HERE/figma.mjs" "$@"
