---
name: agent-ui
description: 'Agent and generative UI — human-in-the-loop approvals, tool-call and trace views, streaming/cancel/retry states, persistent editable artifacts, runtime-generated UI from a typed component catalog (catalog → JSON spec → validate → render), sandboxing. Selects and grounds CopilotKit / AG-UI / assistant-ui / json-render. NOT prompts/evals (llm-integration-engineer), NOT LLM security audit (owasp-llm-checker).'
---

# Agent UI

Load and follow the instructions in the `agent-ui-engineer` agent.

**Usage:**
- `/agent-ui --design "<feature>"` — action classification, output→surface map, catalog, state matrix, trust boundaries → `docs/design/AGENT_UI.md` (+ ADR)
- `/agent-ui --implement "<feature>"` — build approvals → streaming states → trace → validated generative renderer, with deterministic stubbed-stream tests
- `/agent-ui --audit "<url>"` — approve/reject/timeout, tool failure, cancel, malicious output, keyboard → `docs/reviews/AGENT_UI_AUDIT_<slug>_<date>.md`
- `/agent-ui` (no flag) — audit if an agent UI runs, otherwise design

**Looks things up:** this ecosystem renames, archives, and shuts down projects monthly — every framework is re-verified on the day it is recommended (`references/ui-ecosystem-map.md` lookup recipes, Context7, `/api-ground`).

**Gates:** `references/agent-ui-patterns.md` — the UI (not the prompt) decides what needs approval, no model HTML in the app origin, Stop aborts the request, approvals time out to rejected.
