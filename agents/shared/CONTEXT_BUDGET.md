# Context Budget Protocol

Every agent MUST check its context budget before loading files or running tool loops.
This is mandatory for all local LLM models (32k–60k context windows).

---

## Token estimation rules

| Content | Approx tokens |
|---------|--------------|
| 1 line of markdown | ~15 tokens |
| 100 lines of agent instructions | ~1,500 tokens |
| 1 web search result (3,000 chars) | ~750 tokens |
| Average context packet (400 words) | ~600 tokens |
| Average source file (200 lines) | ~3,000 tokens |

---

## Budget thresholds by model

| Context window | Instruction budget | Working budget | Emergency stop |
|---------------|-------------------|----------------|----------------|
| 32k tokens | 8,000 tokens | 20,000 tokens | 28,000 tokens |
| 60k tokens | 15,000 tokens | 38,000 tokens | 54,000 tokens |
| 100k+ tokens | 25,000 tokens | 65,000 tokens | 90,000 tokens |

**Instruction budget:** What you can spend on agent files + shared references.
**Working budget:** What remains for files you read, tool results, and your output.
**Emergency stop:** If you estimate you've hit this, STOP loading files and synthesize from what you have.

---

## Hard rules (apply to every agent, every session)

**Rule 1 — Check before loading:**
Before reading any file, estimate: "How many tokens have I already loaded?" If the answer is > 40% of your context window, do NOT load more reference files. Use what you have.

**Rule 2 — Write before reading more:**
If you have generated > 500 tokens of content that hasn't been written to disk yet, write it now. Holding large outputs in context while continuing to read input is how context fills up.

**Rule 3 — Compress tool results immediately:**
After every web search / file read that returns > 300 tokens, extract the key facts as 3-7 bullets (≈150 tokens). Do not carry the full raw result forward. The facts are what matter; the raw content is in the cache.

**Rule 4 — Phase isolation for multi-phase work:**
After completing any phase that produces output, write the output to disk. In subsequent phases, reference the file — do not re-read everything from scratch. Load only the specific section you need.

**Rule 5 — Emergency stop:**
If you find yourself thinking "I need to read one more file" after already loading > 60% of your context, STOP. Write what you have, note in the Completion Manifest: "Partial output — context budget reached. Remaining items: [list]."

---

## Context audit (run at session start)

Before doing any work in a new session, estimate your starting budget:

```
Context audit:
  Agent file loaded as system prompt: ~[N] tokens
  Mode file / phase file (if any): ~[N] tokens  
  Files already in conversation: ~[N] tokens
  Estimated starting budget used: [N]%
  Remaining working budget: ~[N] tokens

If starting budget > 40%: load ONLY what is explicitly listed in CONTEXT section.
If starting budget > 60%: skip all optional shared reference files (HANDOFF_TEMPLATES, ANTI_SLOP_RULES, etc.)
```

---

## Per-agent guidance

| Agent | Typical instruction cost | Notes |
|-------|-------------------------|-------|
| sdlc-lead | ~7,700 tokens | Read one mode dispatcher only, not phase files |
| sdlc-init phase file (each) | ~5,000-8,000 tokens | One file at a time |
| security-auditor (shell) | ~5,000 tokens | Don't load OWASP_METHODOLOGY unless --deep |
| security-auditor OWASP | ~18,000 tokens | Only at 60k+ context |
| researcher | ~7,000 tokens | Plus checkpoint files on demand |
| coding-agent | ~4,700 tokens | Lightest specialist |
| code-reviewer | ~12,500 tokens | Self-phases sequentially |
| HANDOFF_QUICK_REF | ~600 tokens | Use instead of full HANDOFF_TEMPLATES (4,500 tokens) |
