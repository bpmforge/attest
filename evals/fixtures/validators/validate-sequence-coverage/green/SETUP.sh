#!/usr/bin/env bash
# GREEN (pipefail regression, 3.13.3): 14 P0 use cases, each with a
# sequenceDiagram under a "### Sequence UC-NN" heading, in an ARCHITECTURE.md
# deliberately larger than one pipe buffer (> 64 KB). The 3.13.2 validator
# piped awk/grep output into `grep -q` under `set -o pipefail`; on a file this
# size the producer took SIGPIPE, the pipeline returned 141, and all 14 use
# cases were reported missing. Generated here (not checked in) to keep the
# fixture small in git.
set -e
mkdir -p docs/testing
{
  printf '# Use Cases\n\n| ID | Name | Priority |\n|----|------|----------|\n'
  for i in 01 02 03 04 05 06 07 08 09 10 11 12 13 14; do
    printf '| UC-%s | Flow %s | P0 |\n' "$i" "$i"
  done
} > docs/testing/USE_CASES.md
{
  printf '# Architecture\n\n'
  for i in 01 02 03 04 05 06 07 08 09 10 11 12 13 14; do
    printf '### Sequence UC-%s: flow %s (FR-0%s)\n\n```mermaid\nsequenceDiagram\n' "$i" "$i" "$i"
    j=0
    while [ "$j" -lt 40 ]; do
      printf '    participant P%d as Participant %d with a deliberately long descriptive label\n' "$j" "$j"
      j=$((j + 1))
    done
    j=0
    while [ "$j" -lt 30 ]; do
      printf '    P%d->>P%d: request %d carrying a payload description long enough to add bulk\n' "$j" "$((j + 1))" "$j"
      j=$((j + 1))
    done
    printf '```\n\nThis flow is described in prose after the diagram so the file keeps growing.\n\n'
  done
} > docs/ARCHITECTURE.md
size=$(wc -c < docs/ARCHITECTURE.md | tr -d ' ')
if [ "$size" -le 65536 ]; then
  echo "fixture ARCHITECTURE.md is only $size bytes -- must exceed 64 KB to exercise the pipefail regression" >&2
  exit 1
fi
