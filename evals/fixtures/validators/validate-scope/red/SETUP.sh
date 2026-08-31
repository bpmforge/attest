#!/usr/bin/env bash
# RED: after a clean base commit (fixture harness files included), an
# UNTRACKED write lands OUTSIDE the assigned scope (src/).
set -e
git init -q .
mkdir -p src
echo tracked > src/base.txt
git add -A
git -c user.email=t@t -c user.name=t commit -q -m base
echo "in scope" > src/ok.txt
mkdir -p outside
echo "sneaky" > outside/leak.txt
