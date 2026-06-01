# OWASP LLM Top 10 Methodology

> Load this file when running `/security --llm` or when the project uses LLM/AI APIs.
> Source: OWASP Top 10 for LLM Applications 2025 — https://genai.owasp.org/llm-top-10/
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
