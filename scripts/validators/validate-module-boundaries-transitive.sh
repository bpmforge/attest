#!/usr/bin/env bash
#
# validate-module-boundaries-transitive.sh -- design-level dependency-graph
# hygiene that the direct (source-code) boundary validator cannot see.
#
# Parses the MODULE_DESIGN.md "Dependency Rules" allowed-import table and:
#   GAP   deps on modules that have no row in the table (typo or missing
#         declaration — the graph is unenforceable until fixed)
#   GAP   a "(nothing — foundation)" module that also lists dependencies
#         (contradicts itself)
#   WARN  the transitive cone per module — modules a design REACHES through
#         allowed imports but may not import directly. Plain layering
#         (presentation -> application -> domain) makes these normal; the
#         report exists so the architect/challenger confirms each one at
#         Phase 3 instead of discovering coupling at Phase 4.
#
# Exit: 0 = graph well-formed / 1 = undeclared or contradictory rows / 2 = error

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-module-boundaries-transitive"

ROOT="$(detect_project_root "${1:-}")"
MD="$ROOT/docs/MODULE_DESIGN.md"

if ! file_exists_nonempty "$MD"; then
  warn "docs/MODULE_DESIGN.md not found — skipping transitive boundary check (run architecture-designer first)"
  validator_exit
fi

if [[ -z "$(grep -E '^\|\s*Module\s*\|' "$MD" || true)" ]]; then
  warn "No 'Module | May Import From' table found in MODULE_DESIGN.md — check the Dependency Rules section format"
  validator_exit
fi

ANALYSIS=$(python3 - "$MD" <<'PYEOF'
import re, sys

md = open(sys.argv[1], encoding="utf-8").read()

edges, foundations = {}, set()
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
        if not mod:
            continue
        deps = []
        if re.search(r"\(\s*nothing", cells[1], re.I):
            foundations.add(mod)
            # text after "(nothing...)" that still names deps is a contradiction
            rest = re.sub(r"\([^)]*\)", "", cells[1]).strip()
            if rest:
                print(f"GAP\tfoundation module '{mod}' declares '(nothing)' but also lists: {rest}")
        else:
            for d in re.split(r"[,;]", cells[1]):
                d = d.strip().strip("`*[]").lower()
                if d and not d.startswith("("):
                    deps.append(d)
        edges[mod] = deps

declared = set(edges)

for mod in sorted(declared):
    for d in edges[mod]:
        if d not in declared:
            print(f"GAP\t'{mod}' may import '{d}' but '{d}' has no row in the table — typo or undeclared module")

def reachable(start):
    out, todo = set(), list(edges.get(start, []))
    while todo:
        v = todo.pop()
        if v in out or v not in declared:
            continue
        out.add(v)
        todo.extend(edges.get(v, []))
    return out

for mod in sorted(declared):
    allowed = {d for d in edges.get(mod, []) if d in declared}
    indirect = reachable(mod) - allowed - {mod}
    for leak in sorted(indirect):
        via = next((d for d in sorted(allowed) if leak in reachable(d) | {d}), "?")
        print(f"WARN\t'{mod}' transitively reaches '{leak}' (via '{via}') — confirm this coupling is intended")
PYEOF
)

while IFS=$'\t' read -r kind detail; do
  [[ -z "$kind" ]] && continue
  case "$kind" in
    GAP)  gap "dependency-graph" "$detail" ;;
    WARN) warn "$detail" ;;
  esac
done <<< "$ANALYSIS"

validator_exit
