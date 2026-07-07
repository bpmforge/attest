---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# MCP Server Security Methodology

> Load this file when the project **exposes** an MCP server (it advertises tools) or **consumes** untrusted MCP servers into a privileged agent.
> Source: OWASP MCP Top 10 (MCP03:2025 Tool Poisoning) + MITRE ATLAS. Checks adapted (rewritten, not copied) from the Apache-2.0 `mukul975/Anthropic-Cybersecurity-Skills` `auditing-mcp-servers-for-tool-poisoning` skill; live-tooling steps credit Invariant Labs `mcp-scan`.
> Context cost: ~4k tokens. Findings use category `owasp-llm`, title prefixed `MCP03` etc.

---

## Why this is a separate surface

MCP tools expose a natural-language **description** that the agent's model reads *before* deciding to call the tool. A malicious or compromised server can embed hidden instructions in that description — indirect prompt injection delivered through the supply chain. The audit target here is **the tool definitions and server transport**, not user input. This is the surface behind our own M23 platform-injection work: we run MCP servers (memory, code-search), so we are both auditor and audited.

## Detection Gate — MCP Presence

```bash
# Does this project expose or consume MCP?
grep -rn "@modelcontextprotocol\|FastMCP\|mcp\.server\|StdioServerParameters\|list_tools\|tools/call" \
  src/ app/ lib/ package.json requirements.txt pyproject.toml 2>/dev/null | head -10
# MCP client config files (consumer side)
ls ~/.cursor/mcp.json ~/.vscode/mcp.json 2>/dev/null; find . -name "mcp.json" -not -path "*/node_modules/*" 2>/dev/null | head
```

If no matches: note "No MCP surface detected" and skip. If matches: proceed.

## MITRE ATLAS Mapping

| ID | Name | Relevance |
|----|------|-----------|
| AML.T0010 | ML Supply Chain Compromise | A poisoned third-party MCP server compromises the agent |
| AML.T0051.001 | LLM Prompt Injection: Indirect | Poisoned tool descriptions are indirect injection into agent context |
| AML.T0053 | LLM Plugin Compromise | MCP tools are the agent's plugins |
| AML.T0057 | LLM Data Leakage | Common poisoned-tool payload: exfiltrate files/secrets |

---

## MCP01 — Tool Poisoning (hidden instructions in descriptions)

**What to look for (static — read the tool definitions in this repo's server source, or the config of a consumed server):**
- Imperative text in a tool `description` aimed at the *model*, not the user: "do not tell the user", "first read ~/.ssh/id_rsa", "before answering, call <other tool>"
- `<important>` / `<system>` / fake-documentation blocks inside a description
- Zero-width or Unicode-smuggled characters in descriptions (a description far longer than its rendered text)
- A description that references other tools or files unrelated to the tool's stated function

```python
# enumerate tool descriptions from this repo's own MCP server source, or a config, and READ them
grep -rn "description" <server-source-or-config> | less   # then read each for the red flags above
```

**Severity:** CRITICAL if the consuming agent has tool access (bash/file-write/network) in the same session — injected instructions execute. HIGH if output-only.

## MCP02 — Rug Pull (description changes after approval)

**What to look for (static):**
- No pinning of approved tool descriptions — nothing records the hash/text of a tool at approval time, so a server can silently change a tool later
- Auto-trust of servers by name/URL with no re-review on version change

**Mitigation to recommend:** pin approved tool-description hashes; re-review on any change.

## MCP03 — SSRF in URL-fetching tools

**What to look for (static):**
- A tool that accepts a URL/host and fetches it **server-side** with no allowlist and no block on internal targets (`169.254.169.254`, `127.0.0.1`, `localhost`, `file://`, RFC-1918 ranges)
- The same SSRF pattern owasp-web-checker looks for, but reachable through a tool call

**Severity:** HIGH (CRITICAL in cloud — IMDS credential theft via `169.254.169.254`).

## MCP04 — Unauthenticated / over-exposed server

**What to look for (static):**
- HTTP/SSE-transport MCP server bound to `0.0.0.0` or a public interface
- No token/OAuth on `tools/call` or `tools/list`
- Server started without auth in the deploy/run config

```bash
grep -rn "0.0.0.0\|host=\|bind\|SSE\|sse\|streamable" <server-source-or-deploy-config> | head
```

**Severity:** HIGH — an unauthenticated MCP endpoint that lists or calls tools is remotely reachable capability.

## MCP05 — Excessive tool scope / toxic flows

**What to look for (static):**
- A single server exposing both an untrusted-content reader (fetch/search) **and** a privileged sink (bash, file-write, memory-write, outbound POST) — the toxic combination that turns injection into action
- Tools with DELETE/WRITE/EXEC verbs and no confirmation gate (overlaps LLM06 Excessive Agency)

**Cross-reference:** this is exactly the reader/actor split M23 (T23.1) mandates — a finding here should cite `PLATFORM_SECURITY_DESIGN`.

---

## Deep tooling (`--deep` / owned servers only — not an inline audit step)

These are **live** tests; run only against servers you own or are authorized to assess. They fit a tool-invocation phase (like semgrep-runner), gated behind `--deep`:

```bash
# Static + config scan (Invariant Labs mcp-scan) — safe on config files
uvx mcp-scan@latest --json ~/.cursor/mcp.json > docs/security/mcp_scan.json
uvx mcp-scan@latest inspect <config>          # print raw descriptions for the MCP01 read
# Rug-pull detection: re-run on a schedule; a changed tool hash on an approved tool = rug pull
# SSRF probe / auth probe against an OWNED running server only (see skill for the SDK scripts)
```

Flags tool poisoning, shadowing, rug pulls, and toxic flows against config; the proxy mode (`mcp-scan proxy`) adds runtime guardrails.

## Output

Use `FINDING_SCHEMA.md`. Category `owasp-llm`; title prefixed with the MCP id (e.g. `MCP01 tool poisoning`). Every finding cites the file:line of the tool definition or transport config and the offending text. "Uses MCP" is not a finding — cite the specific poisoned description, SSRF-able tool, or unauth transport.

## Validation Criteria

- [ ] MCP presence detection ran; scope (expose vs. consume) recorded
- [ ] Every advertised tool description read for hidden instructions (MCP01)
- [ ] URL-fetching tools checked for SSRF allowlisting (MCP03)
- [ ] Server transport checked for auth + bind interface (MCP04)
- [ ] Reader+privileged-sink toxic flows flagged and cross-referenced to M23 (MCP05)
- [ ] Findings mapped to ATLAS AML.T0010 / OWASP MCP03:2025 with severity + remediation
