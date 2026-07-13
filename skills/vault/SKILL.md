---
name: vault
description: 'Query, ingest into, and lint the agent-brain-vault (compiled project wiki at ~/Code/agent-brain-vault) — teaches any agent the three vault ops so a project question gets answered from compiled, cited pages instead of re-reading raw sources. Also the recommended pre-search fetcher for research units. Backed by @bpm/wiki-compiler (bpm-agent-amplifier).'
---

# Vault — agent-brain-vault ops

The vault (`~/Code/agent-brain-vault`, its own git repo) is the project's compiled
knowledge base: raw material goes in once, gets synthesized into cited pages, and every
later question is answered from those pages — not by re-reading the raw material again.
This skill teaches the three ops any agent needs: **query**, **ingest**, **lint**.

Read `~/Code/agent-brain-vault/SCHEMA.md` before your first write to that vault — it is
the single source of truth for frontmatter fields, wikilink syntax, and the topic→page
routing table. This skill summarizes it; SCHEMA.md is authoritative.

## Layout recap

```
~/Code/agent-brain-vault/
├── sources/     immutable raw inputs (transcripts, folds, MEMORY.md deltas, pulls)
├── wiki/        compiled pages — <slug>.md, cite these, never sources/ directly
├── SCHEMA.md    style guide + routing table (topic → pages to re-synthesize)
└── CONFLICTS.md created by the first ingest that hits a contradiction
```

**Rule of thumb:** an answer that cites `wiki/*.md` is a vault answer. An answer built by
reading `sources/*` directly is NOT — that's exactly the raw-source re-read this skill
exists to avoid. If `wiki/` has nothing on the topic, say so; don't fall back to grepping
`sources/` and presenting the fragments as if they were a synthesized answer.

## Op 1 — Query

**Today (no code required):**
1. `rg -il "<keyword>" ~/Code/agent-brain-vault/wiki/*.md` (exclude `README.md`) to find candidate pages.
2. Read each match, answer the question, and cite `[Page Title](wiki/<slug>.md)` plus its
   frontmatter `provenance` entries.
3. Nothing relevant in `wiki/`? Report the gap — it's a real one, worth an ingest — rather
   than silently reading `sources/` to patch the answer together.

**Once wired into a Node/TS context** (playbook, night-shift, or any package that already
holds a real `VaultMemoryClient`), prefer the ranked hybrid search over grep:

```ts
import { queryVault } from "@bpm/wiki-compiler";
const results = await queryVault(client, "how does the escalation ledger threshold work?", 3);
// → ranked { slug, title, section, relevance, snippet }[] — cite slug + section
```

**Known gap:** `queryVault`'s `client.queryVault()` is meant to hit bpm-memory-mcp's
hybrid RRF engine over a `'wiki-page'`-typed index (T5.5), but that MemoryType value is
still missing from bpm-memory-mcp's enum as of this writing — a `mem`-lane gap, out of
this skill's write scope. Until it lands, `indexVault`/`queryVault` only work against a
test/mock `VaultMemoryClient`; use the grep-based procedure above for real work.

## Op 2 — Ingest

Every page in `wiki/` is written through the same schema, whether a human hand-edits it
or a compiler pass produces it — so nothing has to change once automated adapters land.

1. Every page needs `provenance: string[]` with **at least one** entry — `writePage()`
   throws on an empty list, and a hand-written page should follow the same rule: never
   synthesize a claim you can't point to a source for.
2. Frontmatter: `provenance`, `compiled_at` (ISO-8601), `volatility` (`low|medium|high`),
   `confidence` (0–1), `content_hash` (sha256 of the body), `stale` (bool, lint-owned —
   never set this yourself). Body starts `# Title`, links use `[[Page Title]]` or
   `[[slug|display text]]`.
3. Check SCHEMA.md's routing table: touching a topic re-synthesizes every page listed for
   it (the concept's own page, its index/hub, and any cross-referencing page) — not just
   the one page that looks most relevant.
4. A new claim that contradicts an existing page does **not** overwrite it — append both
   claims with their provenance to `CONFLICTS.md` at the vault root and leave the existing
   page as-is pending resolution.
5. From code: `writePage(vaultRoot, { title, content, provenance, volatility, confidence })`
   (`@bpm/wiki-compiler`). `scaffoldVault(vaultRoot)` bootstraps a fresh vault's
   `sources/`, `wiki/`, and `SCHEMA.md` — idempotent, never overwrites a hand-edited
   `SCHEMA.md`.
6. Run Op 3 (lint) after any ingest, before treating the page as trustworthy.

**Known gap:** automated compile adapters (session transcripts → pages, fold exports →
pages, `MEMORY.md` deltas → pages) are `T5.2`, not yet built. Ingest today is manual or
semi-manual — write pages by hand following the schema above so they're indistinguishable
from what the adapters will produce once they ship.

## Op 3 — Lint

**Today:** `validateLinks(vaultRoot)` (`@bpm/wiki-compiler`) — walks every `[[wikilink]]`
in `wiki/*.md` and reports any that don't resolve to another page's slug or `# Title`.
Treat a broken link as a hard stop before citing the page it came from.

**Forthcoming (T5.4):** a full `lint()` pass — contradiction scan across linked pages,
orphan detection (0 inbound links), and staleness detection (`content_hash` drift or the
volatility window elapsed) — writing `LINT_REPORT.md` and flipping `stale: true` on
affected pages, run as a Night Shift pass. Until it ships, a page with no visible
`stale: true` flag is not a guarantee of freshness — cross-check `compiled_at` against
how volatile the claim is.

## For research units — vault as a fetcher

Before spending web-research budget on a topic, run Op 1 (query) against the vault the
same way `agents/researcher.md`'s Fact Bank step queries prior facts with `fact_query`:
existing, cited knowledge is free; re-deriving it from scratch is the waste this exists to
prevent. Cite the vault page in the report body like any other source (title + `wiki/`
path); the Fact Bank's `sourceType` enum is unchanged by this, so don't invent a `vault`
value there — a vault hit is a starting point for the report, not a `fact_store` call.
Because opencode experts run as Jarvis micro-agents (see `docs/sdlc/IMPLEMENTATION_PLAN.md`
M9), wiring this into `researcher.md` gives every Jarvis research unit the same
`queryVault` fetcher automatically — no separate Jarvis-side change needed.

## Validation

New or edited vault pages: `validateLinks()` (Op 3) must report zero broken links before
you call an ingest done. New or edited files in this repo: run
`scripts/validators/validate-no-ascii-art.sh` and `scripts/validators/validate-file-size.sh`.
