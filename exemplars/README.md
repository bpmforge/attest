# Exemplar Library

One gold-standard instance of every artifact type the system produces. Few-shot
examples in context outperform added prose instructions — and the effect is much
stronger for small models. A HANDOFF that points at the matching exemplar can
*shrink* its instructions, because the exemplar carries the format.

## Index

| Artifact type | Exemplar | Produced by |
|---------------|----------|-------------|
| ERD + table specs | `erd.md` | db-architect |
| Sequence diagram (with error path) | `sequence-diagram.md` | entry-point-tracer, architecture-designer |
| Security finding (preconditions/yields) | `security-finding.md` | all security specialists |
| Completion manifest | `completion-manifest.md` | every HANDOFF recipient |
| ADR (architecture decision record) | `adr.md` | architecture-designer, sdlc-lead |
| Gap report (coverage-loop REVISE) | `gap-report.md` | orchestrator after a failed gate |

## Rules

**1. One exemplar per HANDOFF, by pointer.** The orchestrator adds exactly one
matching exemplar to the Context Packet's `Exemplar` line. The executor inlines
it only if node instructions + exemplar fit the tier's instruction budget
(see Packet layout below); otherwise the specialist reads the file itself.

**2. Cross-domain only.** Small models copy exemplar *content*, not just shape —
an ERD exemplar from an e-commerce domain used for an e-commerce task will leak
entities into the output. Every exemplar here uses a fictional **community
tool-lending library** domain (members, tools, loans). If the actual task IS a
lending/inventory domain, do not attach the colliding exemplar — describe the
format in prose instead.

**3. Copy the structure, never the content.** Each exemplar opens with this
instruction. Section order, field names, diagram conventions, and granularity
transfer; entity names, numbers, and findings do not.

**4. Maintain like code.** When a session produces a better instance of an
artifact type, replace the exemplar (keeping rule 2 — re-domain it). One
exemplar per type, no galleries.

## Packet layout budget (tier=small)

A HANDOFF packet carries task + memory slice + exemplar pointer + file list
inside one budget. Parts must not fight:

| Part | Cap |
|------|-----|
| Task packet | ≤400 words |
| Memory slice | ≤200 tokens |
| Exemplar | by pointer (inline only if instructions + exemplar fit the tier's instruction budget) |
| Files to read | ≤3 |
| **Total injected** | **≤1,200 tokens on tier=small** |

On tier=medium/large the caps relax, but the pointer-first rule stays — an
exemplar read on demand costs nothing when the format is already known.
