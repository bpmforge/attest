[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← API Designer](10-api-designer.md)  |  [UX Engineer →](12-ux-engineer.md)

---

# 5.11 Researcher

**File:** `agents/researcher.md` | **Skill:** `/research`

Professional research analyst. Investigates and synthesizes findings with citations using a tiered tool escalation strategy. Strictly scoped to research — redirects any code, schema, or audit request to the appropriate specialist.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant RES as researcher
    participant T1 as web_search_pullmd
    participant T2 as web_research_pullmd
    participant T3 as web_research
    participant FS as File System

    LEAD->>RES: HANDOFF (research topic + mode)
    RES->>RES: Select mode (Quick, Comparison, Deep Dive, Fact Check)
    RES->>RES: Step 1 - Define 3-5 focused sub-questions

    loop Step 2 - Per sub-question
        RES->>T1: web_search_pullmd (tier 1 - always start here)
        T1-->>RES: Triage results
        alt < 2 useful sources
            RES->>T2: web_research_pullmd (tier 2 - full content)
            T2-->>RES: Full page content
            alt Still < 2 useful sources
                RES->>T3: web_research (tier 3 - escalation only)
            end
        end
        RES->>FS: Write full source content to checkpoint file
        RES->>RES: Extract facts, update confidence (1-10)
        alt Confidence >= 8 or 3 calls with no new facts
            RES->>FS: Mark question DONE
        else Confidence < 5 after pass 2
            RES-->>LEAD: RESEARCH BLOCKED - surface to user
        end
    end

    RES->>RES: Step 2.5 - Gate: all questions must be DONE before synthesis
    RES->>RES: Step 3 - Cross-reference key claims across 2+ sources
    RES->>FS: Step 4 - Read ALL checkpoint files before synthesis
    RES->>FS: Step 5 - Write research report

    alt Report > 300 lines
        RES->>FS: Split into multi-chapter book directory
        RES->>FS: validate-book-structure.sh
    end

    RES-->>LEAD: Completion phrase + manifest
```

## Research Modes

| Mode | Passes | Output |
|------|--------|--------|
| Quick Lookup | 1, 1-3 sources | Brief answer with citations |
| Comparison | Per criterion | Comparison table |
| Deep Dive | Up to 4 per question | Full report with exec summary |
| Fact Check | 1-2, 2-4 sources | CONFIRMED / CONTRADICTED / UNVERIFIABLE verdict |

## Tool Escalation Tiers

| Tier | Tool | When |
|------|------|------|
| 1 | `web_search_pullmd` | Always start here |
| 2 | `web_research_pullmd` | Fewer than 2 useful tier-1 results |
| 3 | `web_research` | Fewer than 2 useful tier-2 results |
| 4 | `web_fetch` | Known specific URL |

3-strikes rule: if 3 consecutive calls return no results or the same error → emit RESEARCH BLOCKED and stop.

## Deliverables

- `docs/research/RESEARCH_topic_date.md` — exec summary, per-question findings, sources with credibility ratings, confidence level, limitations
- `docs/work/research/YYYY-MM-DD/question-slug.md` — per-question checkpoints (written after every tool call)
- Multi-chapter book directory if report exceeds 300 lines

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← API Designer](10-api-designer.md)  |  [UX Engineer →](12-ux-engineer.md)
