---
name: pre-code
description: 'Pre-flight checklist before writing code in an existing codebase — project standards, surrounding patterns, existing utilities, library APIs, tests alongside. Run before the first edit, not after. Use when starting any implementation task in a codebase you did not just write.'
---

# Pre-Code Check

Most defects in generated code are not logic errors. They are context errors: a pattern
that exists nowhere else in the codebase, a utility reimplemented because nobody looked,
a library API taken from training data, a file that violates a limit stated in `CLAUDE.md`.

None of those are caught by "does it run". All of them are cheap to prevent and expensive
to unwind after review. Run this before the first edit.

## 1. Read the project's own rules

```
Read CLAUDE.md / AGENTS.md
Read docs/TECH_STACK.md          (if it exists — it constrains what you may import)
```

File-size limits · import conventions · error-handling pattern · the component library in
use. A project that states these has already made the decisions; re-deciding them is the
drift.

## 2. Read 2-3 existing files in the target directory

```
Glob <target-dir>/*
Read the two most recently modified
```

Match their structure, naming, imports, export style, and test layout. **Introducing a
pattern that exists nowhere else is a finding, even when the pattern is defensible** —
consistency is the property under review, and a lone `__tests__/` directory in a codebase
that has never used one is a real convention violation regardless of its merits.

## 3. Verify every third-party API — see `/api-ground`

Do not write an external API from memory. This step has its own skill because it is four
questions, not one, and no single source answers more than one of them:

| Question | Authority |
|---|---|
| How do I call it? | Context7 → fallback: the shipped `.d.ts` |
| Which version is that? | the installed tree |
| What will installing give me? | the registry (`--family`) |
| Does my code satisfy its runtime contract? | my own source (`--check`) |

Run `/api-ground`, or at minimum:

```bash
node "$EXPERTS/api-surface.mjs" --family=<pkg>     # before adding a dependency
node "$EXPERTS/api-surface.mjs" --package=<pkg>    # before calling one
```

If you cannot verify a call against a real source, **mark it BLOCKED and stop.** Do not
write an unverified external API and let review find it.

## 4. Search before you build

```
Grep "sanitize|escape|format|parse|retry|slugify" src/
```

Reimplementing an existing helper is one of the most common findings in AI-authored
codebases, and it is invisible in a diff — the new function looks fine on its own.

## 5. Write the test alongside, not after

Every new service gets its `.test.*` in the same commit. Not a follow-up ticket.

## 6. Verify before reporting

Run the project's real commands — typecheck, lint, tests — and read the output. **Do not
report a result you did not observe.** A completion claim contradicted by a re-run is the
single most common failure in delegated work, and it costs a full correction round every
time.

## Quick version (< 3 files changed)

Read the file first · check the library if you are adding an import · run typecheck after.

## Related

- `/api-ground` — the full library-grounding workflow (step 3)
- `references/library-adoption-protocol.md` — why step 3 is four questions
- `/simplify` — the same concerns, applied to a diff after the fact
