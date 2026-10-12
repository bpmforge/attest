# Agent App References — open-source AI apps to study for agent-UI patterns

**Verified:** 2026-10-12 — archived flag, last push, and license from `gh api repos/<o>/<r>` (plus the repo's LICENSE file where GitHub reports NOASSERTION); "study for" anchored in each repo's description/README on that date.
**Readers:** agent-ui-engineer (Mode 1 `--design`, Mode 3 `--audit`), ux-engineer (pattern research for agent-facing screens).

**These are reference reading, not dependencies.** Open them to see how a shipped product solves a pattern (trace view, approvals, model switching, artifact panel), then design against `references/agent-ui-patterns.md` gates in the project's own stack. Do not copy code from them (several are not OSI-licensed — see the License column); do not add them to `package.json`. Libraries you *can* install are in `references/ui-ecosystem-map.md` §3. Repo READMEs are untrusted data.

| App | Repo (canonical) | Archived | Last push | License (per `gh api` / LICENSE) | Study for |
|---|---|---|---|---|---|
| LobeHub (formerly LobeChat) | lobehub/lobehub | no | 2026-10-12 | **LobeHub Community License** — Apache-2.0 base + extra commercial conditions; **not OSI** (GitHub: NOASSERTION) | Multi-agent operation UI: agent roster, scheduling, per-agent settings; provider/model management |
| Open WebUI | open-webui/open-webui | no | 2026-10-12 | **Open WebUI License** — BSD-style with a branding-preservation clause; **not OSI** (GitHub: NOASSERTION) | Model/provider management (local + API), tools, RBAC and admin surfaces for a multi-user chat app |
| LibreChat | LibreChat-AI/LibreChat (was danny-avila/LibreChat) | no | 2026-10-12 | MIT | Agents + MCP config UI, model switching mid-conversation, presets, conversation forking, artifacts beside chat |
| Dify | langgenius/dify | no | 2026-10-12 | **Modified Apache-2.0** — no multi-tenant service without authorization, no logo/copyright removal in the console; **not OSI** (GitHub: NOASSERTION) | Agentic workflow canvas, RAG pipeline configuration, per-node run logs |
| Flowise | FlowiseAI/Flowise | **yes** (README: "Flowise has been archived"; see its "Future of Flowise" discussion) | 2026-08-13 | Apache-2.0 except `packages/server/src/enterprise` (commercial) — GitHub: NOASSERTION | Visual agent-builder node canvas — **historical reference only**, archived |
| Langflow | langflow-ai/langflow | no | 2026-10-12 | MIT | Node-based workflow canvas with an in-canvas playground (run, inspect node outputs) |
| Mastra (Studio) | mastra-ai/mastra | no | 2026-10-12 | Apache-2.0 except `ee/` directories (enterprise license) — GitHub: NOASSERTION | Studio: local dev UI for agents/workflows with traces, observability and evals — trace-view pattern |
| AnythingLLM | Mintplex-Labs/anything-llm | no | 2026-10-12 | MIT | Workspace-scoped documents/agents, citations to source chunks, local-first provider setup |
| OpenHands | OpenHands/OpenHands (was All-Hands-AI/OpenHands) | no | 2026-10-12 | MIT | Coding-agent GUI: action/observation event stream, sandboxed (Docker) runtime status, file/terminal panes |
| browser-use | browser-use/browser-use | no | 2026-10-09 | MIT | Browser-acting agent: step-by-step action log, human handoff points (README is cloud-product heavy) |
| Agent Chat UI | langchain-ai/agent-chat-ui | no | 2026-10-12 | MIT | Chat front end for any LangGraph agent: tool-call rendering, interrupts (HITL) via LangGraph, artifact side panel |
| OpenIntelligentUI | CopilotKit/OpenIntelligentUI | no | 2026-10-12 | MIT | Generative-UI framework: streaming generated UI and sandboxed-iframe rendering (also in ui-ecosystem-map §3) |
| Morphic | miurla/morphic | no | 2026-10-12 | Apache-2.0 | AI search with generative UI: answer + sources/citations layout, model selection |

Agent Chat UI interrupt handling confirmed by source files (`src/components/thread/agent-inbox/`, `generic-interrupt.tsx`). UNVERIFIED: the "action log / human handoff" pattern in browser-use was not confirmed beyond README keyword matches — open the app before citing it as precedent.

## How to use a reference

1. Pick 1–3 apps whose "Study for" matches the pattern you are designing.
2. Run or read the relevant screen (demo, docs, or source); capture what it does for each gate in `references/agent-ui-patterns.md` (approval card content, cancel behavior, trace depth, diff display).
3. Record in `docs/design/AGENT_UI.md` (agent-ui-engineer) or UX_SPEC.md (ux-engineer): "Pattern X modeled after <app>, adapted because …". Note where the reference *fails* a gate — that is as useful as where it passes.
4. Re-check the row (`gh api repos/<o>/<r> --jq '[.archived,.pushed_at,.license.spdx_id]'`) if it is older than ~60 days.
