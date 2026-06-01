# BPM OpenCode Experts — Go-Forward Plan

**Date:** 2026-06-01 | **Status:** Approved | **Author:** Brad Matthews + Claude

This document captures the agreed architecture evolution and phased build plan for the bpm-opencode-experts system. It supersedes the current HANDOFF-centric design in favour of a three-layer micro-agent architecture that works reliably on both cloud and local LLMs (including LM Studio).

---

## Architecture Vision

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 1 — Memory & Search                                    │
│  claude-memory MCP  →  cross-session agent memory            │
│  code-search MCP    →  semantic code retrieval on demand      │
│  Agents pull context they need; never load whole files blind  │
└──────────────────────────────────────────────────────────────┘
              ↑  agents query and store
┌──────────────────────────────────────────────────────────────┐
│  Layer 2 — Micro-Agent Specialists                            │
│  One agent = one job = one context window                     │
│  Orchestrators route; specialists execute                     │
│  Context-budget aware; reads what search returns             │
└──────────────────────────────────────────────────────────────┘
              ↑  outputs verified by
┌──────────────────────────────────────────────────────────────┐
│  Layer 3 — Quality Gates                                      │
│  Ralph Wiggum   →  coverage (did we cover every row?)        │
│  Challenger     →  veracity (is what we covered actually true?)│
│  Gate scripts   →  structure (is the artifact well-formed?)  │
└──────────────────────────────────────────────────────────────┘
```

---

## OpenCode Capabilities We Now Leverage

Research confirmed OpenCode SST v1.15.x has capabilities we were not using:

| Capability | How we use it |
|-----------|---------------|
| **Task tool** — spawns sub-agent sessions programmatically | Future: replace manual HANDOFF (Phase 6, gated on testing) |
| **Slash commands `subtask: true`** — auto-runs in a new session | Future: auto-dispatch specialists (Phase 6) |
| **Background subagents** (v1.14.51) — non-blocking parallel agents | Future: parallel specialist dispatch |
| **`file.watcher.updated` plugin hook** — fires on every file change | Code-search incremental re-indexing (Phase 1) |
| **MCP server support** — register custom servers in `opencode.jsonc` | Memory MCP + code-search MCP (Phases 1 & memory) |
| **Skills via `skill` tool** — SKILL.md loaded on demand | Decomposed specialist skills (Phases 3–5) |
| **`experimental.session.compacting`** — replace compaction prompt | Context budget management for local LLMs |

**Note on HANDOFF:** The current manual copy-paste HANDOFF model is preserved until Phase 6. The Task tool has a known bug (#20059) preventing targeting of custom agents. We switch only after integration testing confirms stability.

---

## Configurable Embedding Providers

All embedding-dependent features (code-search MCP, memory MCP) must support the user's choice of backend. LM Studio is the primary local provider for this project.

### Provider tiers (auto-detected in order, all overridable via config)

| Tier | Provider | Endpoint | Notes |
|------|----------|----------|-------|
| 1 | **LM Studio** | `http://localhost:1234/v1/embeddings` | OpenAI-compatible API; primary local provider |
| 2 | **Ollama** | `http://localhost:11434/api/embeddings` | Auto-detect if running |
| 3 | **OpenAI** | `https://api.openai.com/v1/embeddings` | Cloud fallback if API key set |
| 4 | **Transformers.js** | In-process (ONNX/WASM) | No server; ~300MB RAM; 30–300s one-time index |
| 5 | **FTS5 + tree-sitter** | In-process (SQLite) | Zero dependencies; structural + keyword search |

### Configuration (`.opencode/code-search-config.json`)

```json
{
  "embeddings": {
    "provider": "auto",
    "lmstudio": {
      "url": "http://localhost:1234/v1/embeddings",
      "model": "nomic-embed-text-v1.5"
    },
    "ollama": {
      "url": "http://localhost:11434/api/embeddings",
      "model": "nomic-embed-text"
    },
    "openai": {
      "model": "text-embedding-3-small"
    },
    "transformers": {
      "model": "Xenova/all-MiniLM-L6-v2"
    }
  },
  "indexing": {
    "chunkSize": 40,
    "chunkOverlap": 5,
    "languages": ["typescript", "javascript", "python", "go", "rust"],
    "exclude": ["node_modules", ".git", "dist", "build"]
  }
}
```

`"provider": "auto"` runs the detection waterfall. Any tier can be forced by setting `"provider": "lmstudio"` etc.

---

## Phase 1 — Code-Search MCP (Foundation)

**Package:** `opencode-code-search-mcp` (separate repo, registered in `opencode.jsonc`)

**Why separate:** The tiered engine has its own complex test surface. Independent versioning. Usable outside the expert system.

**What it does:**
- Indexes the project codebase into a local `.opencode/code-index/` SQLite database
- Chunks code by function/class via tree-sitter (structural) + sliding window (fallback)
- Embeds chunks via configured provider
- Exposes two MCP tools to agents:
  - `code_search(query, topK=10)` → ranked code chunks with file:line
  - `code_index(path?)` → force re-index of a path (or whole project)
- Listens to `file.watcher.updated` hook → incremental re-index on save (hash-gated, only re-embeds changed content)

**Agents updated:** All specialist agents add a Phase 0 step: `code_search()` to pull relevant context before loading any files. Replaces "read these 5 files" with "give me the 8 most relevant chunks."

**Tests required:**
- Tier detection (LM Studio up/down, Ollama up/down, no server)
- Hash-based staleness (file changes → re-index fires; unchanged file → no re-index)
- FTS5 fallback returns results when no embedding server available
- Query relevance smoke test per tier

---

## Phase 2 — Challenger Protocol (Quality Layer)

**New files:**
- `agents/shared/CHALLENGER_PROTOCOL.md` — canonical challenger rules
- `agents/challenger.md` — the challenger agent

**What Challenger does:**
- Receives an artifact (report, design doc, research finding)
- For each major claim, searches for counter-evidence via `code_search()`, file reads, or web research
- Can only surface a challenge if it cites `file:line`, URL, or validator output — no speculation
- Verdict per claim: `CONFIRMED / CONTRADICTED / UNVERIFIABLE`
- Produces `docs/reviews/CHALLENGE_REPORT_<slug>_<date>.md`

**Relationship to Ralph Wiggum:**
- Ralph Wiggum → did we cover every row in the matrix?
- Challenger → is what we wrote in each row actually correct?
- Both run; Challenger runs after Ralph confirms coverage

**Trigger points (Challenger is mandatory at these gates):**

| Artifact | Gate |
|----------|------|
| Any finding severity HIGH or CRITICAL | Before FIX_BACKLOG is finalized |
| `OWASP_TRACKER.md` + `final-report.md` | After security-auditor completes |
| `RESEARCH_*.md` | After researcher completes |
| `MODULE_DESIGN.md` + `INFRASTRUCTURE.md` | After architecture-designer completes |
| `TECH_STACK.md` | Before Gate A (Phase 2 → 3) |
| `THREAT_MODEL.md` + `SECURITY_CONTROLS.md` | After security HANDOFF in Phase 3 |
| Gate A decisions (Phase 2 requirements) | Before design phase begins |
| Gate B decisions (Phase 3 design) | Before implementation begins |

---

## Phase 3 — Security Agent Decomposition

Current `security-auditor.md` (393 lines) does 4 independent jobs. Split:

| New agent | Job | Invoked when |
|-----------|-----|--------------|
| `semgrep-runner.md` | Run semgrep rules, triage REAL/FP/UNVERIFIED | Always, Phase 1 of any security scan |
| `owasp-checker.md` | Manual OWASP Top 10 per category, one session per category | After semgrep results available |
| `attack-chainer.md` | Chain verified findings into multi-step exploits | `--deep` only, after OWASP complete |
| `security-auditor.md` (thin) | Coordinate the three above, synthesize final report | Orchestrator only |

**Decomposition principle:** If `owasp-checker` runs out of context halfway through, `semgrep-runner` results are not lost. Each micro-agent writes its own output file before returning.

---

## Phase 4 — SDLC Orchestration Decomposition

Current `sdlc-lead.md` (683 lines) does 5 jobs. Extract as skills:

| New skill | Job | File |
|-----------|-----|------|
| `state-detector` | Run `detect-sdlc-state.sh`, write `sdlc-state.md` | `skills/state-detector.md` |
| `gate-scorer` | Score returning HANDOFFs 1-10, update `DELEGATION_LOG.md` | `skills/gate-scorer.md` |
| `phase-router` | Decide next action from current SDLC state | `skills/phase-router.md` |

`sdlc-lead.md` reduces to: read state → route to mode → manage human approval gates. All scoring and logging delegated to skills.

Same pattern applied to `sdlc-onboard-mode.md` (1089 lines):

| New agent | Job |
|-----------|-----|
| `landscape-mapper.md` | Step 1: README + globs + LANDSCAPE.md |
| `entry-point-tracer.md` | Step 2: routes + call chains + sequence diagrams |
| `component-mapper.md` | Step 4: C2 + C3 diagrams |
| `health-coordinator.md` | Step 6: fan-out to specialists, synthesize HEALTH_ASSESSMENT.md |

---

## Phase 5 — Remaining Agent Decomposition

After the pattern is proven in Phases 3 and 4, apply to remaining fat agents. Priority order based on size and pain:

1. `sdlc-init-phases-3-4.md` (1661 lines) — split per phase, each loaded on demand
2. `sdlc-onboard-mode.md` — complete decomposition per Phase 4 plan
3. `test-engineer.md` (774 lines) — split: `playwright-infra.md` vs `test-writer.md`
4. `sdlc-init-phase-4.md` (809 lines) — wave orchestration vs implementation

---

## Phase 6 — HANDOFF → Auto-Dispatch (Gated on Testing)

**Do not start until:** Integration tests confirm OpenCode Task tool + `subtask: true` slash commands work reliably with our agent types.

**Known blocker:** Bug #20059 — Task tool cannot target custom user-defined agents. Workaround under test: slash commands with `agent:` + `subtask: true`.

**Test plan (before migration):**
1. Create test slash command for `security-auditor` with `subtask: true` and `agent: security-auditor`
2. Confirm sub-agent loads the correct system prompt
3. Confirm sub-agent output is accessible to parent session
4. Confirm background subagent (non-blocking) works end-to-end
5. Confirm MCP tools (code-search, memory) are accessible in subagent context (currently bugged — issue #16491)
6. Only after all 5 pass: migrate orchestrators to slash-command dispatch

---

## Memory Integration (Cross-Phase)

`claude-memory` MCP is already built (Jarvis project). Wire into bpm-opencode-experts:

- Add to `install.sh`: configure claude-memory MCP in `opencode.jsonc`
- Add to `agents/shared/SESSION_PRIMER.md`: session startup calls `memory_recall({ query: "project decisions constraints" })`
- Add to specialist agents: `memory_store` after completing deliverables (decisions, findings, patterns)
- Fallback if server not running: write to `docs/work/agent-memory.md` (human-readable flat file)

Embedding provider for memory: same config as code-search (`code-search-config.json`). One config, both systems.

---

## What This Does NOT Change (Yet)

- **HANDOFF format** — preserved until Phase 6 testing passes
- **Gate validator scripts** — not touched; Challenger runs alongside them
- **Book protocol** — unchanged; applies to all deliverables
- **Mermaid rules** — unchanged; `validate-mermaid.sh` continues to run
- **Dual-repo sync** — all changes apply to both `bpm-opencode-experts` and `claude-experts`

---

## Success Criteria

| Phase | Done when |
|-------|-----------|
| 1 | `code_search("find auth flow")` returns relevant chunks in all 5 tiers; file.watcher re-indexes on save |
| 2 | Challenger catches at least one CONTRADICTED finding in a test security audit |
| 3 | Security scan of a real project runs 3 parallel micro-agents, each writing its own output file |
| 4 | `sdlc-lead.md` is under 300 lines; gate-scorer and state-detector operate as independent skills |
| 5 | All agents over 500 lines decomposed; no single agent over 400 lines |
| 6 | End-to-end test: orchestrator dispatches 3 specialists via subtask, results return without user copy-paste |
