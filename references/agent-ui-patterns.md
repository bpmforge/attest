# Agent UI Patterns — interfaces where an AI agent acts, streams, and generates UI

**Verified:** 2026-10-12. Library facts live in `references/ui-ecosystem-map.md` §3 — this file is patterns and gates, deliberately library-neutral.
**Readers:** agent-ui-engineer (all modes), llm-integration-engineer (contract side), owasp-llm-checker (LLM05 Improper Output Handling, LLM06 Excessive Agency).

The goal is not a prettier chatbot. It is an interface where the user can **see what the agent is doing, approve what matters, edit what it produced, and recover when it fails**. Chat is one input surface, not the product.

## 1. Choose the architecture (record the choice as an ADR)

| Situation | Pattern | Typical stack |
|---|---|---|
| Agent must read/change app state (forms, filters, records) | **Shared state + rendered actions** | CopilotKit over AG-UI |
| Conversation is the product; you want full visual control | **Composable thread primitives** | assistant-ui (main repo registry components) |
| Agent should *compose a screen* (dashboard, report, form) | **Catalog → JSON spec → validate → render** | json-render (+ `@json-render/shadcn`) |
| Agent is remote / another org's / crosses a trust boundary, or clients are non-web (mobile, Angular, Lit) | **Declarative UI intent rendered by the client's own catalog** | A2UI (protocol v0.9.1 stable; renderers `@a2ui/react`, `@a2ui/lit`, `@a2ui/angular`) |
| UI must appear progressively while tokens stream, token budget matters | **Compact streaming UI language; system prompt generated from your component library** | OpenUI (`@openuidev/react-lang` + `@openuidev/lang-core`; Vue/Svelte/Angular runtimes) |
| Agent output is a durable thing the user keeps editing | **Persistent artifact beside the conversation** | your editor + versioned JSON; Open Canvas as a (archived) reference |
| You ship an MCP server and its tool results need UI inside foreign MCP hosts (Claude, ChatGPT, …) | **MCP Apps: `ui://` HTML resource rendered by the host in a double iframe on a distinct sandbox origin** | `@modelcontextprotocol/ext-apps` (spec 2026-01-26) — see note below |
| Agent must run arbitrary generated HTML/JS | **Sandboxed iframe** — last resort | OpenIntelligentUI as reference |

Prefer the row highest in the table that satisfies the need: structured specs over generated code, generated code only inside a sandbox.

**A2UI and OpenUI are still catalog-bound specs** — the client renders only components it registered, so §2's gates apply unchanged. **MCP Apps is HTML** that the server author writes (or generates): the spec (2026-01-26, "Sandbox proxy") requires web hosts to load it through a sandbox proxy on a *different origin* from the host, with `allow-scripts allow-same-origin` scoped to that sandbox origin, a restrictive default CSP (`default-src 'none'`, `connect-src 'none'` unless declared in `ui.csp`), and lets the host block or require user approval for `tools/call` messages from the view. That is consistent with §3 (never `allow-same-origin` on the app's own origin). If you are the host, apply §3 + §4 to every view; if you are the server, keep the UI declarative where you can and declare the minimum CSP domains.

## 2. Generative UI — the catalog contract

The model never emits JSX/HTML that runs in your origin. It emits a spec against a typed catalog.

**Gates:**
- [ ] A **catalog file** lists every component the model may use, with a props schema (zod/JSON Schema), allowed children, and allowed actions.
- [ ] Every generated spec is **validated before render**; invalid nodes render a visible fallback and are logged — never `dangerouslySetInnerHTML`, never `eval`.
- [ ] **Data bindings** reference named, server-authorized data sources — a spec cannot name an arbitrary URL or query.
- [ ] **Actions** in a spec map to an allow-list; each action declares whether it needs approval (§4).
- [ ] Specs are **persisted and versioned** (same JSON rules as `references/interaction-patterns.md` §2) so the user can reopen, edit, and undo them.
- [ ] Users can **edit the result directly** (Puck/dnd-kit on the same JSON) — AI edits and human edits share one source of truth.
- [ ] Catalog components are the **same components** the hand-built UI uses — no parallel "AI-only" design system.

## 3. Sandboxing generated code (only if §2 cannot work)

- [ ] Rendered in an `<iframe sandbox="allow-scripts">` — **never** together with `allow-same-origin` on the same origin as the app.
- [ ] Served from a separate origin or `srcdoc`, with a CSP that blocks network by default (`connect-src 'none'` unless a stated need).
- [ ] Communication only via `postMessage` with origin checks and a message schema.
- [ ] No credentials, tokens, or user PII injected into the frame.
- [ ] Size/time limits; a runaway frame can be killed from the parent UI.

## 4. Human-in-the-loop approvals

- [ ] Every tool/action is classified: **read** (auto) / **reversible write** (auto + undo) / **irreversible or external** (approve first). The classification lives in code, not in the prompt.
- [ ] Approval card shows **what will happen in concrete terms** (recipient, amount, file, diff) — not "The agent wants to use send_email".
- [ ] Approve / Edit-then-approve / Reject are all available; reject feeds a reason back to the agent.
- [ ] Approvals time out to *rejected*, never to approved.
- [ ] Approval UI is keyboard-reachable and announced (WCAG 4.1.3).

## 5. Streaming, cancel, retry

| State | Required UI |
|---|---|
| Thinking / queued | Specific status ("Searching 3 sources"), not a generic spinner, once it lasts > 1 s |
| Streaming text | Incremental render without layout jumps; auto-scroll that stops when the user scrolls up |
| Tool running | Tool name, human label, elapsed time, cancel |
| Tool failed | Error in plain words, input kept, retry and "continue without" options |
| Cancelled | Partial output kept and labeled partial |
| Rate-limited / model down | Stated, with when to retry; never an infinite spinner |

- [ ] **Stop** is always visible during generation and actually aborts the request (AbortController/server cancel), not just hides it.
- [ ] Regenerate keeps the previous version reachable (versions, not overwrite).

## 6. Observability as UX

Users and operators should be able to answer: what ran, which tools, how long, what changed, what it cost, what needs me.

- [ ] Each agent turn has an expandable **trace**: steps, tool calls with inputs/outputs (redacted), durations, model used.
- [ ] **Changes are shown as diffs** (records, files, layout JSON), with per-change undo where possible.
- [ ] Multi-agent runs render as a graph or timeline (React Flow for structure, a timeline for sequence) with per-node status and the ability to intervene at a node.
- [ ] Citations/evidence link to the source the agent actually used.
- [ ] No fake progress — a "thinking" animation never stands in for missing state.

## 7. Trust and safety in the UI

- [ ] Model output is **rendered as text/markdown with sanitization** (no raw HTML) unless it passed §2/§3.
- [ ] Links in model output show their real destination; external links open with `rel="noopener noreferrer"`.
- [ ] Content fetched from the web or files is visually marked as external; instructions inside it are never executed as UI actions (prompt-injection surface — flag to owasp-llm-checker).
- [ ] Destructive actions cannot be triggered by model text alone — only through §4.

## Audit severity

| Severity | Examples |
|---|---|
| P0 | Model-generated HTML/JS rendered in-origin; irreversible action without approval; approval auto-accepts on timeout |
| P1 | Stop button doesn't abort; failed tool shows endless spinner; approval card hides the concrete effect |
| P2 | No trace view; regenerate overwrites without history; no diff for agent changes |
| P3 | Generic "thinking…" where specific status is available |

Cite the gate (`§4.2`), the screen/element, and evidence (screenshot, trace, file:line).
