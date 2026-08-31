#!/usr/bin/env bash
# GREEN: same base; the only write is INSIDE the assigned scope.
set -e
git init -q .
mkdir -p src
echo tracked > src/base.txt
git add -A
git -c user.email=t@t -c user.name=t commit -q -m base
echo "in scope" > src/ok.txt
