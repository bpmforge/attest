#!/bin/bash
set -e

echo "Removing attest..."

GLOBAL_DIR="$HOME/.config/opencode"
PROJECT_DIR=".opencode"

# Same list as `install.sh --uninstall` — this file used to miss exemplars/ and
# plugins/, so a standalone uninstall left the resume-anchor plugin loading.
for dir in agents skills commands references exemplars tools hooks plugins scripts .semgrep; do
  if [ -d "$GLOBAL_DIR/$dir" ]; then
    rm -rf "${GLOBAL_DIR:?}/$dir"
    echo "  Removed $GLOBAL_DIR/$dir/"
  fi
  if [ -d "$PROJECT_DIR/$dir" ]; then
    rm -rf "${PROJECT_DIR:?}/$dir"
    echo "  Removed $PROJECT_DIR/$dir/"
  fi
done
# The version stamp would otherwise keep claiming an install that is gone.
for stamp in "$GLOBAL_DIR/experts-version" "$PROJECT_DIR/experts-version"; do
  if [ -f "$stamp" ]; then
    rm -f "$stamp"
    echo "  Removed $stamp"
  fi
done

echo ""
echo "Done. attest has been removed."
echo "Note: Your AGENTS.md file was not touched. Remove it manually if desired."
echo "Note: ~/.semgrep/rules/ community rule cache was NOT removed."
echo "      Remove manually if desired:  rm -rf ~/.semgrep/rules/"
echo "Note: ~/.semgrep/registry-cache/ offline pack cache was NOT removed."
echo "      Remove manually if desired:  rm -rf ~/.semgrep/registry-cache/"
