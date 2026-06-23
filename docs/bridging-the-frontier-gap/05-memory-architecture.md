# 05 — Memory Architecture: what we have, what to continue

[🏠 Index](README.md) · [← local playbook](03-local-model-and-runtime-playbook.md) · [next: economics & eval →](06-economics-evaluation-distillation.md)

Grounded in a direct read of `bpm-memory-mcp` (schema v9, 275+ tests). **Rule 9 paid off here:** the system is *much* more mature than "vec + SQLite" — so the real upgrade is **activating dormant capability**, not building a graph from scratch.

---

## 1. What `bpm-memory-mcp` already has (mature)

| Capability | Reality today | Maturity |
|---|---|---|
| Store | SQLite (better-sqlite3), `memories` table w/ `embedding` BLOB, `type`, `confidence`, `citation`, `content_hash`, soft-delete | 9/10 |
| **Knowledge graph** | `entities` (file/function/type/decision/error) + `relations` (implements/depends_on/satisfies/calls/contradicts/supersedes) + `memory_entity_links` | schema 9/10, **population 5/10** |
| **Zettelkasten links** | `memory_links` (relates_to / contradicts / supports / extends / derived_from, strength 0–1, bidirectional); auto-link on store at ≥0.75 | 7/10 |
| **Hybrid retrieval** | vector (cosine) + BM25 (FTS5) + **link-traversal (depth-2, distance decay)** → **RRF fusion (35/35/30)** → rerank (recency/confidence/type/diversity), ~300–800ms | 8/10 |
| Versioning | `supersedes_id` / `superseded_by` / `superseded_at` | 7/10 |
| Fact store | `fact_store`/`fact_query` w/ `source_url`, `direct_quote`, `domain_tags`, `stale_after_days`, `last_verified` | 7/10 |
| Core memory | MemGPT-style 4 blocks (persona/human/goals/project) | 8/10 |
| Consolidation | dedup (≥0.85 merge) + confidence decay + cluster ID — **manual trigger** | 6/10 |
| Embeddings | LM Studio/Ollama `nomic-embed-text-v1.5` (384d), graceful BM25 fallback on outage | 9/10 |
| Tools | 18 MCP tools, all implemented; Zod-validated | 8/10 |
| Taxonomy | `fact / pattern / decision / error / preference / goal / checkpoint` with type-specific decay | 8/10 |

**Headline:** the substrate the research prescribes (graph + hybrid retrieval + link layer + typed taxonomy + supersession) already exists and is tested. We are not building Zep/Graphiti — we are *finishing* the parts of it that are dormant.

---

## 2. The actual gaps (the real B1)

1. **Bi-temporal model is dormant (2/10).** `entities`/`relations` carry `valid_from`/`valid_to` but they're sparse and unused. Missing: formal **ADD / UPDATE / DELETE / NOOP** write ops with temporal semantics; **retroactive invalidation** ("fact X was false as of date Y" → prior uses flagged); **time-travel queries** ("what was true on 2026-02-01?"). The schema is ~50% ready — this is *activation*, not new tables.
2. **No sleep-time consolidation (6/10, manual).** Consolidation only dedups + decays. Missing: **episodic→semantic distillation** (50 similar decisions → one `pattern` memory *with a provenance edge to its sources*, rollback-able if wrong) and a **background scheduler** to run it on idle (Letta's "sleep-time compute" pattern).
3. **Population & auto-resolution thin.** KG population is regex/heuristic (no NER); contradictions are *detected* (`findContradictions`) but not **auto-linked + confidence-adjusted** on store; staleness is detected but not auto-retired; recall/extraction are manual (no proactive layer).

---

## 3. Reframed B1 plan (activate, don't rebuild)

| Sub-item | What | Effort |
|---|---|---|
| **B1a — activate bi-temporal** | Make `memory_update`/`fact_store` use `valid_from`/`valid_to` properly: UPDATE = close old (`valid_to=now`) + insert new (`valid_from=now`); add `as-of <date>` filter to recall. Record **supersession, never overwrite**. | S–M (schema mostly ready) |
| **B1b — sleep-time consolidation** | A background MCP job (cron/idle) that distills clusters into `pattern`/semantic memories with `derived_from` provenance edges; extends the existing `memory_consolidate`. | M |
| **B1c — auto-resolve contradictions** | On store, if a contradicting memory exists: auto-create a `contradicts` link + lower the older one's confidence (today it only warns). | S |
| **B1d — better population** | Improve auto-extraction beyond regex (LLM-assisted entity/relation extraction at idle), feeding the existing graph. | M |

**Why this order helps weak/local models** (chapter 01, honestly scoped): a richer, temporally-correct, *consolidated* graph means a small model **retrieves a tiny high-signal subgraph instead of holding history in context** — the token-efficiency win (Zep: ~70× fewer tokens) that keeps a local model inside its budget. It is a *bounded-task* coherence + cost win, **not** a path to frontier long-horizon reliability.

---

## 4. Governance (don't skip)

An always-on memory the agents both read and write is **corruptible** (silent memory pollution / poisoning — arXiv 2603.11768). Before B1b/B1d auto-write at scale: add **provenance** on every node (already partly present via `citation`/`extracted_by`), a **contradiction/confidence check on write**, and keep `memory_feedback('wrong')` → temporal invalidation in the loop. Consolidation must be **rollback-able** (provenance edges enable this).

---

[🏠 Index](README.md)
