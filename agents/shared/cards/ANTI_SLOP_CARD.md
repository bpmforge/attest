---
description: 'Reference card — the 31 anti-slop rules as one-liners (~2KB). Long form with examples and scoring: agents/shared/ANTI_SLOP_RULES.md.'
disable: true
mode: "all"
---
# Anti-slop — rule card (R-01…R-31)

**Error handling:** R-01 no catch-all swallowing · R-02 no try/catch in tight loops · R-03 no exceptions as control flow · R-04 no serial awaits that could be `Promise.all`.
**Abstraction:** R-05 no single-impl interfaces/factories · R-06 no delegation-only wrappers · R-07 no single-use helpers · R-08 no repository pattern over plain CRUD.
**Defensive bloat:** R-09 no null checks on types you control · R-10 no fallbacks that hide failures · R-11 no unspecified retries · R-12 no flags on unreleased code.
**Comments/style:** R-13 no what-comments · R-14 no step narration blocks · R-15 no stale docstrings · R-16 no emojis in code.
**Structure:** R-17 no speculative generalization · R-18 no cargo-cult patterns · R-19 no duplicated blocks · R-20 one pattern per concern.
**Supply chain:** R-21 no hallucinated packages (verify on the registry) · R-22 no privilege-escalation paths · R-23 no credentials in code/config.
**Structural (AI-era):** R-24 logic-density: code > prose · R-25 no phantom imports · R-26 no disconnected pipelines · R-27 no stubs presented as features · R-28 validate every LLM output before use · R-29 no prose padding.
**Provenance:** R-30 no library-shaped reimplementation (adopt, cite, or justify) · R-31 no unfalsifiable claims — every "verified" names a command and exit code.

Reviewer scoring: CRITICAL = R-21/22/23/26/27/28; HIGH = R-01/10/19/30/31; the rest MEDIUM. Cite file:line or the finding is deleted.
