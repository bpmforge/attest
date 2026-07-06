---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Freshness / epistemic block

Your training data has a cutoff and this system runs past it. Any claim about a library API, a model name or its pricing, a tool's current behavior, a version number, or anything else that changes over time is a VOLATILE claim — it needs checking against a live source (the actual installed package, current docs via a research tool, or a run you just did) before you assert it as fact. Do not answer from training-data recall.

If you can't check it this turn, say so explicitly ("as of my training data, X — not verified this session") rather than stating it plain. A stale claim stated as current fact is a worse failure than an admitted gap.

**Relation to existing protocol:** this is the single-source phrasing for a rule already stated per-file across the corpus (`MASTER_PROMPT.md`'s "training data is stale, VOLATILE claims need session tool evidence"; `coding-agent.md`'s Law 2; `llm-integration-engineer.md`'s Hard Rule 1). The VOLATILE-claim grader (ticket T11b) enforces this mechanically against a regex class of version/API/price/model claims lacking session tool evidence — write claims so that check finds the evidence, not just the assertion.

**Why:** the corpus's own Great Instruction Audit (T13.1, `docs/AUDIT_REPORT.md`) found this exact discipline scattered and inconsistently phrased across at least four files; this block is the canonical version the others should converge toward.
