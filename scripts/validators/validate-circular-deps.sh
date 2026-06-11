#!/usr/bin/env bash
#
# validate-circular-deps.sh -- detects cycles in the MODULE_DESIGN.md
# dependency graph at DESIGN time (Phase 3), before any code exists.
#
# Parses the "Dependency Rules" allowed-import table:
#   | Module | May Import From |
# builds the digraph, and reports every cycle (A -> B -> A, including
# longer loops). Catching a cycle at Phase 3 costs one table edit;
# catching it at Phase 4 costs a refactor.
#
# Exit: 0 = acyclic / 1 = cycles found / 2 = invocation error

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-circular-deps"

ROOT="$(detect_project_root "${1:-}")"
MD="$ROOT/docs/MODULE_DESIGN.md"

if ! file_exists_nonempty "$MD"; then
  warn "docs/MODULE_DESIGN.md not found — skipping circular-dependency check (run architecture-designer first)"
  validator_exit
fi

CYCLES=$(python3 - "$MD" <<'PYEOF'
import re, sys

md = open(sys.argv[1], encoding="utf-8").read()

# Parse "| module | may import from |" rows after a header mentioning both
# Module and Import. Cell values like "(nothing — foundation)" mean no deps.
edges = {}
in_table = False
for line in md.splitlines():
    if re.match(r"^\|\s*Module\s*\|\s*May Import", line, re.I):
        in_table = True
        continue
    if in_table:
        if not line.startswith("|"):
            in_table = False
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 2 or set(cells[0]) <= {"-", " ", ":"}:
            continue
        mod = cells[0].strip("`*").lower()
        deps = []
        if not re.search(r"\(\s*nothing", cells[1], re.I):
            for d in re.split(r"[,;]", cells[1]):
                d = d.strip().strip("`*[]").lower()
                if d and not d.startswith("("):
                    deps.append(d)
        if mod:
            edges[mod] = deps

# DFS cycle detection, reporting each distinct cycle once.
WHITE, GRAY, BLACK = 0, 1, 2
color = {m: WHITE for m in edges}
stack, cycles, seen = [], [], set()

def dfs(u):
    color[u] = GRAY
    stack.append(u)
    for v in edges.get(u, []):
        if v not in edges:
            continue  # dep on undeclared module — boundary validator's job
        if color.get(v) == GRAY:
            cyc = stack[stack.index(v):] + [v]
            key = frozenset(cyc)
            if key not in seen:
                seen.add(key)
                cycles.append(" -> ".join(cyc))
        elif color.get(v) == WHITE:
            dfs(v)
    stack.pop()
    color[u] = BLACK

for m in list(edges):
    if color[m] == WHITE:
        dfs(m)

for c in cycles:
    print(c)
PYEOF
)

if [[ -z "$(grep -E '^\|\s*Module\s*\|' "$MD" || true)" ]]; then
  warn "No 'Module | May Import From' table found in MODULE_DESIGN.md — check the Dependency Rules section format"
  validator_exit
fi

while IFS= read -r cyc; do
  [[ -z "$cyc" ]] && continue
  gap "circular-dependency" "cycle in MODULE_DESIGN.md allowed-import graph: $cyc"
done <<< "$CYCLES"

validator_exit
