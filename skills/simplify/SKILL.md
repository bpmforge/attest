---
name: simplify
description: 'Quick code review of recent changes — spot reuse opportunities, quality gaps, over-engineering. Use on git diff after any edit. Faster than /review-code — scoped to what just changed.'
---

# Simplify

Review recently changed code and look for opportunities to:

1. **Reuse** — Is there existing code that does the same thing? Check for utilities, helpers, shared functions.
2. **Quality** — Does the code follow established patterns? Is it consistent with the rest of the codebase?
3. **Efficiency** — Can the code be simplified? Are there unnecessary abstractions, duplicate logic, or over-engineering?

**Workflow:**
1. Check `git diff` for recent changes
2. Read the changed files in context
3. Search for existing utilities that could replace new code
4. Report findings with specific suggestions

**Rule:** Only suggest changes that make the code genuinely simpler. Don't add complexity in the name of "best practices."
