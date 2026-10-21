#!/usr/bin/env bash
#
# handoff-emit.sh -- lint a written HANDOFF document and print its pointer.
#
# WHY A SCRIPT. The orchestrator used to TYPE the "NEXT HANDOFF" pointer into
# its reply. In the opencode TUI a reply is rendered as markdown, so a pointer
# typed without a code fence collapses into one paragraph ("Open agent: /code
# (coding-agent) Paste this one line into it: SDLC-TASK for ..."), the indented
# paste line turns into a code block only when a blank line happens to precede
# it, and box-drawing rules become setext headings. Models also tend to echo the
# whole 90-line HANDOFF body to the screen as well as writing it, and on weaker
# models the pointer/body gets re-emitted every turn (the loop). A tool result is
# rendered verbatim, so the pointer is printed from HERE, and the lead's own
# reply shrinks to one line.
#
# It also lints the HANDOFF file the lead just wrote -- the things that have
# actually broken specialists in the field -- and refuses to print a pointer to
# a document that will not work:
#   - file exists and is not empty
#   - a `SDLC-TASK for <agent>` line is present (the intake trigger)
#   - the ════ delimiters open and close the task body
#   - PRODUCE section present; a completion phrase + "Then stop" present
#   - no `USER:` lines inside the delimiters (specialists relay them back)
#   - no template meta-prose copied in ("[Code tasks only]", "YOU RUN THE
#     --baseline PASS YOURSELF", "<agent-name>", "<file 1>" placeholders)
#   - code fences are balanced (an unbalanced ``` breaks the rest of the file)
#   - a size cap (default 220 lines) -- a longer handoff is template leakage
#
# Usage:
#   handoff-emit.sh <agent> [<slug>] [--report <path>] [--skill </skill>] [--root <dir>]
#                   [--max-lines N] [--lint-only]
# Reads  docs/work/HANDOFF_<agent>[-<slug>].md  under --root (default .).
# Exit 0 pointer printed / 1 lint gaps (listed as HANDOFF-LINT: ...) / 2 usage.

set -uo pipefail

AGENT=""; SLUG=""; REPORT=""; SKILL=""; ROOT="."; MAX_LINES=220; LINT_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --report) REPORT="$2"; shift 2 ;;
    --skill) SKILL="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    --max-lines) MAX_LINES="$2"; shift 2 ;;
    --lint-only) LINT_ONLY=1; shift ;;
    -h|--help) sed -n '2,36p' "$0"; exit 0 ;;
    --*) echo "handoff-emit: unknown flag $1" >&2; exit 2 ;;
    *) if [[ -z "$AGENT" ]]; then AGENT="$1"; elif [[ -z "$SLUG" ]]; then SLUG="$1"; else echo "handoff-emit: too many args" >&2; exit 2; fi; shift ;;
  esac
done
[[ -n "$AGENT" ]] || { echo "usage: handoff-emit.sh <agent> [<slug>] [--report <path>] [--skill </skill>]" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="docs/work/HANDOFF_${AGENT}${SLUG:+-$SLUG}.md"
ABS="$ROOT/$FILE"
LEDGER="docs/work/TASKS_${AGENT}-${SLUG:-task}.md"

gaps=()
gap() { gaps+=("$1"); }

if [[ ! -s "$ABS" ]]; then
  gap "file missing or empty: $FILE -- write the HANDOFF body there first (HANDOFF_TEMPLATES.md Template 1), then re-run"
else
  body="$(cat "$ABS")"
  lines=$(wc -l < "$ABS" | tr -d ' ')
  grep -qE "^[[:space:]]*SDLC-TASK for ${AGENT}\b" "$ABS" || gap "no 'SDLC-TASK for ${AGENT}:' line -- that prefix is the only thing that puts the specialist into Bounded Task Mode"
  delims=$(grep -c '^════' "$ABS" || true)
  [[ "$delims" -ge 2 ]] || gap "════ delimiters missing or unpaired ($delims found; need an opening pair and a closing pair around the task body)"
  grep -qiE '^(PRODUCE|PRODUCE exactly|## PRODUCE|Produce:)' "$ABS" || gap "no PRODUCE section -- the gate checks for exactly the files PRODUCE names"
  grep -qiE 'print exactly|completion phrase|Complete:' "$ABS" || gap "no completion phrase -- the orchestrator resumes on it"
  grep -qiE 'then stop' "$ABS" || gap "missing 'Then stop' -- without it the specialist continues into its default mode"
  # USER: lines inside the delimiters (the field failure the intake test pins)
  # The body sits between the delimiter that CLOSES the header (2nd of 4) and
  # the one that OPENS the footer (3rd); with a bare pair it is between 1 and 2.
  d=0; ln=0
  while IFS= read -r line; do
    ln=$((ln+1))
    if [[ "$line" == ════* ]]; then d=$((d+1)); continue; fi
    if [[ "$delims" -ge 4 ]]; then inside=$(( d == 2 ? 1 : 0 )); else inside=$(( d == 1 ? 1 : 0 )); fi
    if [[ $inside -eq 1 && "$line" =~ ^[[:space:]]*USER: ]]; then gap "line $ln: a USER:-addressed line sits INSIDE the delimiters -- the specialist reads it as its task and relays it back; move delivery notes above the opening ════"; fi
  done < "$ABS"
  # template leakage: orchestrator-facing prose and unfilled placeholders
  for pat in '[Code tasks only]' 'YOU RUN THE --baseline PASS YOURSELF' '<agent-name>' '<file 1>' '<dir 1>' '<output file 1>' '<required topic 1>' '<one sentence describing' 'END HANDOFF #N'; do
    if grep -qF -- "$pat" "$ABS"; then gap "template leakage: '$pat' -- that text is for the orchestrator (or an unfilled placeholder), not for the specialist; delete or fill it"; fi
  done
  fences=$(grep -cE '^[[:space:]]{0,3}```' "$ABS" || true)
  if (( fences % 2 == 1 )); then gap "unbalanced code fence (${fences} lines start with \`\`\`) -- everything after the odd fence renders as code / is read as literal text"; fi
  if [[ "$lines" -gt "$MAX_LINES" ]]; then gap "$lines lines (cap $MAX_LINES) -- a HANDOFF this long is almost always the template's explanatory prose copied in; the specialist reads the context packet for detail"; fi
fi

if [[ ${#gaps[@]} -gt 0 ]]; then
  echo "HANDOFF-LINT: ${#gaps[@]} gap(s) in $FILE -- fix the file, then re-run this command (do NOT paste the HANDOFF into the chat)"
  for g in "${gaps[@]}"; do echo "  - $g"; done
  exit 1
fi
[[ $LINT_ONLY -eq 1 ]] && { echo "HANDOFF-LINT: clean -- $FILE"; exit 0; }

# Resolve the /skill that loads this agent, unless given.
if [[ -z "$SKILL" ]]; then
  for sd in "$SCRIPT_DIR/../skills" "$ROOT/.opencode/skills" "$HOME/.config/opencode/skills"; do
    [[ -d "$sd" ]] || continue
    hit=$(grep -lE "in the \`${AGENT}\` agent" "$sd"/*/SKILL.md 2>/dev/null | head -1)
    if [[ -n "$hit" ]]; then SKILL="/$(basename "$(dirname "$hit")")"; break; fi
  done
fi
[[ -n "$SKILL" ]] || SKILL="/${AGENT}"
if [[ -z "$REPORT" ]]; then
  REPORT=$(grep -oE 'docs/reviews/[A-Za-z0-9_<>.*-]+\.md' "$ABS" | head -1)
  [[ -n "$REPORT" ]] || REPORT="(the PRODUCE files named in $FILE)"
fi
ledger_note=""
[[ -f "$ROOT/$LEDGER" ]] || ledger_note="   (ledger $LEDGER not written yet -- write it: one '- [ ] <step>' per HANDOFF step)"

# The TUI COLLAPSES tool output (field capture 2026-10-21: the lead ran this
# script, replied "paste the line above", and the user had to ask "what to
# paste?"). So this output is a TEMPLATE for the lead's reply, not the thing
# the user sees. The reply is five short lines with the paste line inside a
# fenced block -- fences are the one construct the TUI renders verbatim, and a
# reply this size cannot hit a model's output cap (the other field symptom:
# a ~600-token "gate verdict + next step + pointer" reply was cut at the cap
# and regenerated from the top, eight times in a row).
FENCE='```'
cat <<EOF
HANDOFF-LINT: clean -- $FILE${ledger_note:+
$ledger_note}

REPLY TO THE USER WITH EXACTLY THE FOLLOWING (copy it verbatim; add nothing before or after --
gate verdicts and progress notes belong in DELEGATION_LOG.md / STATE.md, not in this reply):
----8<----
Open ${SKILL} (${AGENT}) and paste:
${FENCE}text
SDLC-TASK for ${AGENT}: read ${FILE} and execute it.
${FENCE}
It produces ${REPORT}. Reply here with "${AGENT} done" when it finishes.
----8<----
EOF
exit 0
