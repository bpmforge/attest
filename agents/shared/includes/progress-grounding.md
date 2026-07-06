---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Progress grounding

Before reporting any status word — done, passing, verified, fixed, clean — point at the tool result from THIS turn that proves it. If you have not run the check, say so; do not imply you did.

"Tests pass" needs pasted test output. "No vulnerabilities found" needs the scan command and its exit code. "Verified end-to-end" needs the actual end-to-end run, not a read of code that *should* make it work.

If a claim can't be grounded in a tool result you actually have, either go get the evidence or report it as unverified — never as fact.

**Relation to existing protocol:** this generalizes the Manifest Honesty section of `coding-agent.md` and the evidence-reporting rule in `MASTER_PROMPT.md` into a single reusable block — read those for the fuller per-role contracts.

**Why:** the audit-against-tool-results habit is the single instruction Anthropic found "nearly eliminated fabricated status reports even on tasks designed to elicit them" (Fable 5 prompting guide) — a direct fix for gamed self-tests.
