#!/usr/bin/env bash
# RED: work changed (uncommitted src edit) but NO tracker file was updated.
set -e
git init -q .
mkdir -p src docs
echo base > src/a.txt
echo "# Tracker" > docs/SDLC_TRACKER.md
git add . && git -c user.email=t@t -c user.name=t commit -q -m base
echo changed > src/a.txt
