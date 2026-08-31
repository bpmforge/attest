#!/usr/bin/env bash
# GREEN: the same work change WITH a tracker update alongside.
set -e
git init -q .
mkdir -p src docs
echo base > src/a.txt
echo "# Tracker" > docs/SDLC_TRACKER.md
git add . && git -c user.email=t@t -c user.name=t commit -q -m base
echo changed > src/a.txt
echo "- did the work" >> docs/SDLC_TRACKER.md
