---
name: simplify
description: 'Quick code review of recent changes — spot reuse opportunities, quality gaps, over-engineering. Use on git diff after any edit. Faster than /review-code — scoped to what just changed.'
---

# Simplify

Quick, scoped review of recently changed code. This is the lightweight version
of `/review-code` — use it after any edit to catch issues before they accumulate.

**What to check:**

1. **Reuse** — Is there existing code that does the same thing? Search for utilities, helpers, shared functions that could replace new code.
2. **Quality** — Does the code follow established patterns? Is it consistent with the rest of the codebase? Check CLAUDE.md / AGENTS.md for project conventions.
3. **Simplification** — Are there unnecessary abstractions, duplicate logic, or over-engineering? Three similar lines is better than a premature abstraction.
4. **File size** — Does the changed file exceed the project's line limits? (check CLAUDE.md for limits)

**Workflow:**
1. Run `git diff --stat` to see what changed
2. For each changed file: read the full file in context (not just the diff)
3. `Grep` the codebase for functions similar to what was just added — suggest reuse
4. Report findings with file:line references and specific fixes
5. Verdict: CLEAN (nothing to simplify) | SUGGESTIONS (optional improvements) | NEEDS WORK (blocking issues)

**Rules:**
- Only suggest changes that make the code genuinely simpler
- Don't add complexity in the name of "best practices"
- If the code is already clean, say so — don't manufacture findings
- Scope to what just changed — don't audit the whole codebase
