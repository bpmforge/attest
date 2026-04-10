#!/bin/bash
#
# sdlc-context.sh — Print current project SDLC phase and open blockers
#
# Run this before starting an OpenCode session to get the project state
# to paste into AGENTS.md or reference at the start of your conversation.
#
# Usage:
#   ./scripts/sdlc-context.sh              Print state to stdout
#   ./scripts/sdlc-context.sh --update     Update AGENTS.md in-place (if it exists)
#   ./scripts/sdlc-context.sh --help       Show this help
#

set -euo pipefail

UPDATE_MODE=false
for arg in "$@"; do
  case $arg in
    --update) UPDATE_MODE=true ;;
    --help|-h)
      sed -n '3,10p' "$0" | sed 's/^# //'
      exit 0
      ;;
  esac
done

# Resolve project root (where this script is run from or where AGENTS.md lives)
PROJECT_ROOT="${PWD}"

# ── Detect project name ─────────────────────────────────────────────────────
project_name=""

# Try package.json first (most reliable)
if [ -f "$PROJECT_ROOT/package.json" ]; then
  project_name=$(python3 -c "import json; d=json.load(open('$PROJECT_ROOT/package.json')); print(d.get('name',''))" 2>/dev/null || true)
fi

# Try h1 from AGENTS.md or CLAUDE.md (skip if it looks like a filename)
if [ -z "$project_name" ]; then
  for candidate in "AGENTS.md" "CLAUDE.md"; do
    if [ -f "$PROJECT_ROOT/$candidate" ]; then
      h1=$(grep -m1 '^# ' "$PROJECT_ROOT/$candidate" 2>/dev/null | sed 's/^# //' || true)
      # Skip if h1 is the filename itself (common boilerplate pattern like "# CLAUDE.md")
      if [ -n "$h1" ] && [[ "$h1" != *.md ]] && [[ "$h1" != *.json ]]; then
        project_name="$h1"
        break
      fi
    fi
  done
fi

# Fall back to directory name
[ -z "$project_name" ] && project_name=$(basename "$PROJECT_ROOT")

# ── Detect SDLC phase ────────────────────────────────────────────────────────
# Check both docs/ and docs/sdlc/ layouts (different conventions)
DOCS="$PROJECT_ROOT/docs"
phase="None — /sdlc not initialized"
gate_passed=""

if [ -d "$DOCS" ]; then
  if [ -f "$DOCS/DISCOVERY.md" ]; then
    phase="Phase 0 (Ideation) — Discovery complete"
    gate_passed="Discovery Interview"
  fi
  # VISION.md — flat or nested layout
  if [ -f "$DOCS/VISION.md" ] || [ -f "$DOCS/sdlc/phase-0-ideation/VISION.md" ] || \
     find "$DOCS" -name "VISION.md" -maxdepth 3 2>/dev/null | grep -q .; then
    phase="Phase 0 (Ideation)"
    gate_passed="Phase 0"
  fi
  # Planning docs
  if [ -f "$DOCS/SCOPE.md" ] || [ -f "$DOCS/sdlc/phase-1-planning/SCOPE.md" ] || \
     find "$DOCS" -name "SCOPE.md" -maxdepth 3 2>/dev/null | grep -q .; then
    phase="Phase 1 (Planning)"
    gate_passed="Phase 1"
  fi
  # Requirements docs
  if [ -f "$DOCS/SRS.md" ] || [ -f "$DOCS/sdlc/phase-2-requirements/SRS.md" ] || \
     find "$DOCS" -name "SRS.md" -maxdepth 3 2>/dev/null | grep -q .; then
    phase="Phase 2 (Requirements)"
    gate_passed="Phase 2"
  fi
  if [ -f "$DOCS/DESIGN_CONTEXT.md" ]; then
    phase="Phase 3 (Design) — Design Clarification complete"
  fi
  # Architecture / design docs
  if [ -f "$DOCS/ARCHITECTURE.md" ] || [ -f "$DOCS/sdlc/phase-3-design/ARCHITECTURE.md" ] || \
     find "$DOCS" -name "ARCHITECTURE.md" -maxdepth 3 2>/dev/null | grep -q . || \
     [ -d "$DOCS/architecture" ]; then
    phase="Phase 3 (Design)"
    gate_passed="Phase 3"
  fi
  # Check for significant implementation files (only in dirs that exist)
  src_dirs=""
  for d in src app lib; do
    [ -d "$PROJECT_ROOT/$d" ] && src_dirs="$src_dirs $PROJECT_ROOT/$d"
  done
  if [ -n "$src_dirs" ]; then
    # shellcheck disable=SC2086
    src_count=$(find $src_dirs \( -name "*.ts" -o -name "*.go" -o -name "*.py" -o -name "*.rs" \) 2>/dev/null | wc -l | tr -d ' ')
    if [ "${src_count:-0}" -gt 5 ]; then
      phase="Phase 4 (Implementation) — ~${src_count} source files"
      [ -z "$gate_passed" ] && gate_passed="Phase 3"
    fi
  fi
fi

# ── Collect open blockers ────────────────────────────────────────────────────
blockers=""
for risks_file in "$DOCS/RISKS.md" "$DOCS/sdlc/phase-1-planning/RISKS.md"; do
  if [ -f "$risks_file" ]; then
    blockers=$(grep -i "TODO\|BLOCKED\|⚠️\|open risk\|\[ \]" "$risks_file" 2>/dev/null | grep -v "^#" | head -5 | sed 's/^[[:space:]]*/  - /' || true)
    [ -n "$blockers" ] && break
  fi
done

# ── Build output ─────────────────────────────────────────────────────────────
OUTPUT="## SDLC Context (auto-generated $(date '+%Y-%m-%d'))

**Project:** ${project_name}
**Current phase:** ${phase}
**Last gate passed:** ${gate_passed:-none}
**Open blockers:**
${blockers:-  (none found in RISKS.md)}"

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║   SDLC Project Context                            ║"
echo "╠═══════════════════════════════════════════════════╣"
echo "  Project:      $project_name"
echo "  Phase:        $phase"
echo "  Gate passed:  ${gate_passed:-none}"
if [ -n "$blockers" ]; then
  echo "  Blockers:"
  echo "$blockers"
else
  echo "  Blockers:     (none found)"
fi
echo "╚═══════════════════════════════════════════════════╝"
echo ""

if [ "$UPDATE_MODE" = true ]; then
  AGENTS_FILE="$PROJECT_ROOT/AGENTS.md"
  if [ ! -f "$AGENTS_FILE" ]; then
    echo "⚠️  AGENTS.md not found at $PROJECT_ROOT — run with no flags to print context instead."
    exit 1
  fi

  # Replace existing SDLC Context block or append at end
  if grep -q "^## SDLC Context" "$AGENTS_FILE" 2>/dev/null; then
    # Replace the existing block (from header to next ## or end of file)
    python3 - "$AGENTS_FILE" "$OUTPUT" << 'PYEOF'
import sys, re
path, replacement = sys.argv[1], sys.argv[2]
with open(path) as f:
    content = f.read()
# Replace from "## SDLC Context" to the next "##" section or end
updated = re.sub(
    r'## SDLC Context.*?(?=\n## |\Z)',
    replacement + '\n',
    content,
    count=1,
    flags=re.DOTALL
)
with open(path, 'w') as f:
    f.write(updated)
print(f"Updated SDLC Context block in {path}")
PYEOF
  else
    echo "" >> "$AGENTS_FILE"
    echo "$OUTPUT" >> "$AGENTS_FILE"
    echo "Appended SDLC Context to $AGENTS_FILE"
  fi
else
  echo "To update AGENTS.md automatically, run:"
  echo "  $0 --update"
  echo ""
  echo "Or paste the context below into your AGENTS.md:"
  echo "───────────────────────────────────────────────────"
  echo "$OUTPUT"
  echo "───────────────────────────────────────────────────"
fi
