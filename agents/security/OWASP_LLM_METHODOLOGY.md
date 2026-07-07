---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# OWASP LLM Top 10 Methodology

> Load this file when running `/security --llm` or when the project uses LLM/AI APIs.
> Source: OWASP Top 10 for LLM Applications 2025 — https://genai.owasp.org/llm-top-10/
> LLM08b/08c checks adapted (rewritten, not copied) from the Apache-2.0 `mukul975/Anthropic-Cybersecurity-Skills` `assessing-vector-and-embedding-weaknesses` skill.
> **If the project also exposes or consumes MCP servers** (grep `@modelcontextprotocol`, `mcp.json`, `FastMCP`, `mcp.server`), also load `MCP_METHODOLOGY.md` — MCP tool poisoning is a distinct surface (OWASP MCP Top 10), not part of the LLM Top 10.
> Context cost: ~8k tokens.

---

## Detection Gate — LLM Code Presence

Before loading this file in full, check if the project uses LLM integrations:

```bash
grep -r "openai\|anthropic\|langchain\|llm\|chatgpt\|claude\|gemini\|ollama\|litellm\|huggingface" \
  package.json requirements.txt Cargo.toml go.mod pyproject.toml 2>/dev/null | head -5
grep -r "createCompletion\|chat.completions\|generateContent\|invoke_model\|AnthropicClient\|OpenAI(" \
  src/ app/ lib/ 2>/dev/null | head -10
```

If no matches: skip this specialist, note "No LLM integration detected" in the coordinator summary.
If matches: proceed with all 10 categories below.

---

## LLM01 — Prompt Injection

**Risk:** Attacker manipulates LLM via crafted input to override instructions, leak data, or trigger unintended actions. Two variants: **direct** (user → LLM) and **indirect** (external document/tool output → LLM).

**Code indicators:**
```
# VULNERABLE: string concatenation, no plane separation
prompt = system_prompt + "\nUser says: " + user_input
messages = [{"role": "system", "content": SYSTEM_PROMPT + user_data}]

# VULNERABLE: indirect injection — external content injected without sandboxing
doc_content = fetch_document(url)
prompt = f"Summarize: {doc_content}"   # doc may contain injections

# SAFER: structural separation
messages = [
  {"role": "system", "content": SYSTEM_PROMPT},
  {"role": "user", "content": user_input}   # separate plane
]
```

**What to check:**
- Any concatenation of system instructions + user input into a single string
- RAG chunks, tool outputs, API responses, emails, or documents injected directly into prompt context
- No input filtering before LLM call
- `tool_choice` or `function_call` responses not validated before execution

**Severity:** CRITICAL if user input reaches system prompt plane; HIGH otherwise.

#### LLM01b — Indirect Prompt Injection via Retrieved Content

**Pattern:** LLM agent fetches external content (web pages, files, API responses, database records) and processes it without an explicit "untrusted data" boundary. Injected instructions in fetched content can redirect the agent.

**Code indicators:**
```bash
grep -rn "fetch\|web_research\|retrieve\|load_document\|read_url\|requests.get\|httpx\|aiohttp" \
  src/ app/ lib/ --include="*.ts" --include="*.py" --include="*.js" | head -20
grep -rn "messages.*content.*fetch\|prompt.*url\|context.*fetch\|insert.*retrieved" \
  src/ app/ lib/ --include="*.ts" --include="*.py" --include="*.js" | head -20
grep -rn "RAG\|retrieval\|vector_store\|web_search\|tool_result" \
  src/ app/ lib/ --include="*.ts" --include="*.py" --include="*.js" | head -20
```

**What to look for:**
- Retrieved content inserted directly into a prompt or message array with no sanitization boundary
- No "content is untrusted data" marker in system prompt or tool-use instructions
- LLM given tools (bash, file write, HTTP requests) in the same session that fetches untrusted content — means injected instructions can be executed
- RAG pipelines where document chunks are inserted verbatim into the system message

**Severity:** CRITICAL when the agent also has tool access (bash, file write, network calls). HIGH when output only.

**Finding format:** Note file:line where retrieved content joins the prompt, note which tools the agent has access to, describe the exploitation chain.

---

## LLM02 — Sensitive Information Disclosure

**Risk:** Model outputs PII, credentials, training data, or proprietary system configuration it should not reveal.

**Code indicators:**
```
# VULNERABLE: no output filtering, returns raw LLM response to user
return llm.complete(prompt)

# VULNERABLE: secrets embedded in system prompt
SYSTEM_PROMPT = f"You have access to DB_PASSWORD={os.getenv('DB_PASSWORD')}"

# VULNERABLE: no PII scrubbing before logging
logger.info(f"LLM response: {response.content}")

# SAFER: output filter before returning
response = llm.complete(prompt)
return pii_scrubber.clean(response)
```

**What to check:**
- System prompts containing credentials, connection strings, internal endpoints, or business rules
- LLM responses returned to users without output filtering
- Full LLM prompt/response logged to files or monitoring systems
- No rate-limiting on enumeration probes (user can extract training data via repeated queries)

#### LLM02b — Sensitive Data Written to Disk / Logged by Security Tools

**Pattern:** Security scanning tools (secret scanners, SAST tools) write their full output — including discovered plaintext secrets — to files that may be committed or shipped.

**Code indicators:**
```bash
grep -rn "tee\|\.json\|\.log\|\.txt\|writeFile\|open.*w" \
  scripts/ tools/ ci/ .github/ --include="*.sh" --include="*.py" --include="*.yml" | grep -i "trufflehog\|gitleaks\|secret\|scan" | head -20
grep -rn "tee.*security\|tee.*output\|tee.*findings" \
  . --include="*.sh" --include="*.yml" | head -10
```

**What to look for:**
- `trufflehog --json | tee output.json` — TruffleHog JSON includes `Raw` and `RawV2` fields with plaintext secrets
- `gitleaks detect --report-path` — report includes plaintext secrets unless `--redact` flag is used
- `semgrep --json > findings.json` — if rule matches include secret patterns, output may include secret values
- These output files in project tree, not in `.gitignore`

**Severity:** HIGH if output file is not gitignored. CRITICAL if file was already committed.

**Mitigation:** Pipe through masking: `trufflehog … --json | jq 'del(.Raw, .RawV2)'`. Add `gitleaks --redact`. Add output files to `.gitignore`.

---

## LLM03 — Supply Chain

**Risk:** Compromised models, fine-tuning datasets, LoRA adapters, third-party plugins, or ML dependencies introduce backdoors or malicious behavior.

**Code indicators:**
```
# VULNERABLE: unpinned model version
client.chat.completions.create(model="gpt-4")   # no version pin

# VULNERABLE: unauthenticated model download
model = AutoModel.from_pretrained("some-user/some-model")   # no hash check

# VULNERABLE: third-party plugin used without review
tools = [load_plugin("untrusted-vendor/data-tool")]

# SAFER: pinned and verified
model = AutoModel.from_pretrained("trusted/model", revision="sha256:abc123")
```

**What to check:**
- Model names without version or commit hash pins
- `from_pretrained()` calls without `revision=` or hash verification
- Third-party plugin/tool integrations without security review documentation
- ML dependency lockfile missing (`requirements.txt` without hashes, no `poetry.lock`)
- Fine-tuning dataset sources not documented or validated

---

## LLM04 — Data and Model Poisoning

**Risk:** Tampered training/fine-tuning data or RAG sources corrupt model behavior, causing biased, false, or attacker-controlled outputs.

**Code indicators:**
```
# VULNERABLE: RAG source writable by untrusted parties
vector_store.add(docs_from_user_upload)   # user controls what goes in

# VULNERABLE: no validation of retrieved chunks
chunks = vector_store.search(query)
prompt = f"Based on this context: {chunks}\n\nAnswer: {question}"

# VULNERABLE: fine-tuning data from unvalidated source
dataset = load_dataset("crawled_web_data")   # provenance unknown
```

**What to check:**
- Vector store write access — who can add documents?
- Retrieved chunks injected into prompts without content validation
- Fine-tuning dataset sources (is provenance documented?)
- No chunk-level access control (user A's data visible to user B via RAG)

---

## LLM05 — Improper Output Handling

**Risk:** LLM output passed directly to downstream systems (code execution, SQL, shell, HTML rendering) without validation — effectively LLM-as-injection-source.

**Code indicators:**
```
# CRITICAL: eval/exec on LLM output
exec(llm.generate_code(user_request))
eval(llm_response)

# CRITICAL: SQL built from LLM output
query = llm.generate_sql(user_question)
db.execute(query)   # no parameterization

# CRITICAL: LLM output rendered as raw HTML
return render_template_string(llm_response)

# HIGH: shell command from LLM
subprocess.run(llm.generate_command(task), shell=True)

# SAFER: schema validation on structured outputs
response = llm.complete(prompt, response_format={"type": "json_object"})
validated = MySchema.model_validate_json(response.content)
```

**What to check:**
- Any `eval()`, `exec()`, `subprocess`, `os.system()` called with LLM output
- SQL queries assembled from LLM strings (not parameterized)
- LLM responses rendered as HTML/template strings
- `function_call` / tool results used to construct further commands without validation
- JSON/schema validation absent on structured LLM outputs

**Severity:** Always CRITICAL if code execution path exists; HIGH for SQL/HTML injection.

---

## LLM06 — Excessive Agency

**Risk:** LLM agents granted permissions beyond what's needed; can take unintended side-effecting actions.

**Code indicators:**
```
# VULNERABLE: agent with write/delete without approval gate
tools = [
  delete_file_tool,      # no confirmation required
  send_email_tool,       # can send to anyone
  execute_sql_tool,      # write access
]
agent.run(user_task)   # fully autonomous

# VULNERABLE: broad tool scope
tool_def = {
  "name": "manage_database",
  "description": "Can read, write, or delete any database record"
}

# SAFER: minimal scope + human gate
tools = [read_only_db_tool]   # read only
# Destructive actions require: tools with explicit confirmation step
```

**What to check:**
- Tool/function definitions with DELETE, UPDATE, SEND, EXECUTE verbs without confirmation gate
- Agent can write to filesystem, send external messages, or modify production data autonomously
- Tool scopes not following principle of least privilege
- No human-in-the-loop for destructive or irreversible actions
- `agent.run()` without output validation or action logging

#### LLM06b — Confused Deputy / Scope Creep via LLM Tool Access

**Pattern:** The LLM is given tools that access data or perform actions beyond the scope the end user authorized. The LLM acts as a deputy that can access more than the user can directly.

**Code indicators:**
```bash
grep -rn "readFile\|fs\.read\|glob\|\*\*\/\*\|listdir\|os\.walk" \
  src/ app/ lib/ --include="*.ts" --include="*.py" --include="*.js" | head -20
grep -rn "memory.*recall\|vector.*search\|db\.query\|sql.*select" \
  src/ app/ lib/ --include="*.ts" --include="*.py" --include="*.js" | head -20
grep -rn "scope.*all\|cross.*user\|all.*memories\|global.*context" \
  src/ app/ lib/ --include="*.ts" --include="*.py" --include="*.js" | head -20
```

**What to look for:**
- Agent can read files outside the user's project/workspace scope (e.g., `~/.ssh/`, `/etc/`, env files)
- Memory/vector store recall with `scope='all'` or no user-scoping — LLM can surface another user's stored data
- Agent retrieves records from a shared database without a user-ID filter — LLM synthesizes and presents data the user shouldn't see
- Agent has write access to shared state (memory, DB, files) that other users can read

**Severity:** HIGH when multi-user system. MEDIUM in single-user but agent has OS-level file access.

---

## LLM07 — System Prompt Leakage

**Risk:** Sensitive instructions embedded in system prompts are exposed via prompt injection, verbose errors, or direct extraction.

**Code indicators:**
```
# VULNERABLE: credentials in system prompt
SYSTEM_PROMPT = """
You are a helpful assistant.
Internal API key: sk-prod-abc123
Database: postgresql://admin:password@db.internal/prod
"""

# VULNERABLE: system prompt in error response
except LLMError as e:
    return {"error": str(e), "prompt": system_prompt}   # leaks prompt

# VULNERABLE: system prompt logged
logger.debug(f"Sending prompt: {system_prompt}")
```

**What to check:**
- Credentials, API keys, internal hostnames, or business rules in system prompts
- System prompts returned in error responses or debug output
- System prompts in client-side JavaScript (fully visible to anyone)
- No guardrails against "repeat your instructions" / "what is your system prompt?" attacks
- System prompt content in application logs

---

## LLM08 — Vector and Embedding Weaknesses

**Risk:** RAG vector stores vulnerable to poisoning (malicious documents embedded) or inference attacks (reconstructing training data from embeddings).

**Code indicators:**
```
# VULNERABLE: open write access to vector store
@app.route("/upload", methods=["POST"])
def upload():
    content = request.get_data()
    vector_store.upsert(content)   # no auth, no validation

# VULNERABLE: cross-user data in same namespace
vector_store.search(query)   # no tenant isolation — user A can retrieve user B data

# VULNERABLE: embedding of sensitive data without access control
embed_and_store(medical_records)   # no row-level permissions on retrieval
```

**What to check:**
- No authentication required to add documents to vector store
- Tenant isolation absent (all users share same namespace)
- Sensitive data embedded without retrieval-time access control
- No rate limiting on embedding API (inference attack surface)
- Embeddings stored alongside raw content (content reconstruction risk)

**ATLAS mappings:** poisoning `AML.T0020`; model inversion `AML.T0024.001`; membership inference `AML.T0024.000`; indirect injection via retrieved chunk `AML.T0051.001`.

#### LLM08b — Tenant Isolation Enforced Server-Side (not client-side)

**Pattern:** The most common RAG multi-tenant bug: the tenant/user filter is applied *after* an unscoped similarity search returns, in application code — so a filter bug, or a direct call to the store, leaks another tenant's chunks. Isolation must be enforced by the vector store's own query filter, not by post-fetch code.

**What to look for (static):**
- A `search()` / `query()` call whose filter (tenant_id, user_id, namespace) is passed to the **vector store**, vs. results filtered in a list-comprehension / `.filter()` after an unscoped fetch
- Per-tenant separation by namespace/collection vs. one shared collection relying on a metadata field
- The retrieval call and the authorization check living in different layers (retrieval can be reached without the check)

```
# VULNERABLE: unscoped fetch, isolation only in app code (bypassable)
hits = store.search(query_vec, top_k=20)
mine = [h for h in hits if h.metadata["tenant"] == current_tenant]   # client-side

# SAFER: filter pushed into the store's query (server-enforced)
hits = store.search(query_vec, top_k=20,
                    filter=FieldCondition(key="tenant", match=current_tenant))
```

**Severity:** HIGH (CRITICAL if the corpus holds regulated data — PHI/PII/financial).

#### LLM08c — Embeddings Are Not One-Way

**Pattern:** Raw embedding vectors returned to clients or stored next to plaintext are an exfiltration surface — inversion and membership-inference attacks reconstruct substantial source text from vectors alone.

**What to look for (static):**
- An API endpoint or tool that returns raw embedding vectors to the caller
- Embeddings persisted alongside the plaintext they encode with the same access scope
- No rate limit on the embed / similarity endpoint (enables inversion hill-climbing and membership probing)

**Deep drill (`--deep` / memory-MCP leakage drill only, not an inline audit step):** stand up an owned instance and run (a) embedding-inversion hill-climb — encode a known secret, iteratively search candidate text by cosine similarity; (b) membership inference — compare retrieval scores for in-corpus quotes vs. control sentences; (c) knowledge-base poisoning — upsert a marker chunk crafted to match unrelated queries and measure retrieval dominance; (d) regex-scan retrieved chunks for `ignore (all|previous|the above) instructions` / `system prompt` before they reach the LLM. These are live tests — run them only against systems you own (this maps directly to bpm-memory-mcp fleet-scope leakage and quarantine drills).

---

## LLM09 — Misinformation

**Risk:** Model produces credible-sounding but false content (hallucinations), leading to decisions based on incorrect information.

**Code indicators:**
```
# VULNERABLE: LLM output treated as authoritative without grounding
diagnosis = llm.generate("Patient symptoms: {symptoms}. What is the diagnosis?")
treatment_plan = build_plan(diagnosis)   # no human review gate

# VULNERABLE: no citation requirement
legal_advice = llm.complete("Is this contract clause enforceable?")
return legal_advice   # no "consult a lawyer" caveat, no source citations
```

**What to check:**
- High-stakes outputs (medical, legal, financial, security decisions) acted on without human review
- LLM outputs in user-facing UI without "AI-generated, may be incorrect" disclosure
- No factual grounding or citation requirement for factual claims
- RAG pipeline without source attribution in responses
- Model confidence scores not surfaced to users

**Note:** This is an architectural/design finding, not a code bug. Flag it and recommend human review gates for high-stakes outputs.

---

## LLM10 — Unbounded Consumption

**Risk:** Uncontrolled resource usage enabling DoS, financial abuse ("denial of wallet"), or model extraction via repeated queries.

**Code indicators:**
```
# VULNERABLE: no rate limiting
@app.route("/chat", methods=["POST"])
def chat():
    response = openai.chat.completions.create(
        model="gpt-4",
        messages=messages,
        max_tokens=None   # unbounded
    )
    return response

# VULNERABLE: no per-user quotas
# VULNERABLE: streaming without timeout
# VULNERABLE: no cost alerting or budget cap
```

**What to check:**
- No per-user request rate limiting (express-rate-limit, nginx limit_req, etc.)
- No `max_tokens` cap on API calls
- Streaming responses without `timeout` or `AbortController`
- No cost monitoring or budget cap in LLM API client configuration
- Model extraction possible via systematic probing (no similarity detection)

---

## Output Format

Use `FINDING_SCHEMA.md`. Category field must be `owasp-llm`. Output file: `docs/security/LLM_FINDINGS_<date>.md`.

Every finding must include the specific file:line and the vulnerable code snippet as evidence. "The application uses OpenAI" is NOT a finding — cite where the specific vulnerability exists in code.

Write a findings summary at the top (N per category, highest severity first), then the full detail sections.
