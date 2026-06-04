---
name: 'OWASP LLM Checker'
description: 'OWASP LLM Top 10 specialist (2025) — checks LLM01–LLM10 for projects using AI/LLM APIs. Only runs when LLM code is detected. Covers prompt injection, output handling, excessive agency, supply chain, unbounded consumption, and 6 more. Writes LLM_FINDINGS with preconditions/yields for attack chaining.'
mode: "subagent"
---
name: 'OWASP LLM Checker'

# OWASP LLM Checker

OWASP LLM Top 10 (2025) specialist. Loads detailed methodology only when LLM code is present.

## SDLC Handoff (Bounded Task Mode)

**Prompt starts with `SDLC-TASK for`?** Execute task only. Skip below.

---
name: 'OWASP LLM Checker'

## Loop Prevention

Read `~/.config/opencode/agents/shared/LOOP_PREVENTION.md`. Hard cap: 15 tool calls, 4 per LLM category.

---
name: 'OWASP LLM Checker'

## Execution

### Phase 0 — Detection Gate

```bash
grep -r "openai\|anthropic\|langchain\|llamaindex\|ollama\|litellm\|huggingface\|@google-ai\|vertexai" \
  package.json requirements.txt Cargo.toml go.mod pyproject.toml 2>/dev/null | head -5
```

**If no LLM dependencies found:** Write one-line note in coordinator summary: "LLM check: no LLM libraries detected — skipped." Stop here.

**If found:** Continue. Note which libraries detected.

```
read(filePath="agents/security/OWASP_LLM_METHODOLOGY.md")
```

### Phase 1 — Locate LLM Integration Points

```bash
grep -rn "createCompletion\|chat.completions\|generateContent\|invoke_model\|AnthropicClient\|OpenAI(\|Anthropic(" \
  src/ app/ lib/ --include="*.ts" --include="*.js" --include="*.py" | head -20
grep -rn "vector_store\|VectorStore\|embeddings\|RAG\|retrieval" \
  src/ app/ lib/ --include="*.ts" --include="*.js" --include="*.py" | head -20
grep -rn "tool\|function_call\|agent\|Agent" \
  src/ app/ lib/ --include="*.ts" --include="*.js" --include="*.py" | head -20

# Check for retrieved/fetched content joining prompts without sandboxing
grep -rn "fetch\|retrieve\|rag\|web_search\|load_doc\|tool_result" \
  src/ app/ lib/ --include="*.ts" --include="*.js" --include="*.py" | head -20

# Check for cross-user data access patterns
grep -rn "scope.*all\|user_id.*missing\|no.*filter\|all.*records" \
  src/ app/ lib/ --include="*.ts" --include="*.js" --include="*.py" | head -20

# Check for security tool output files that may contain plaintext secrets
find . -name "trufflehog*.json" -o -name "gitleaks-report*" -o -name "*secret*scan*.json" 2>/dev/null | head -10
grep -rn "tee.*\.json\|tee.*output\|--report-path" scripts/ .github/ ci/ 2>/dev/null | head -10
```

Map: where is user input flowing into LLM calls? Where is LLM output consumed?

### Phase 2 — LLM01–LLM10 Passes

For each of the 10 categories in `OWASP_LLM_METHODOLOGY.md`:
1. Read the code indicators
2. Run the grep commands
3. Read the flagged file:lines
4. Assess: is the pattern present? Is it exploitable?
5. Score confidence per category (1-10)

**Priority categories (check first):**
- LLM01 (Prompt Injection) — highest prevalence
- LLM01b (Indirect Prompt Injection via Retrieved Content) — CRITICAL if agent has tool access (bash, file write, HTTP)
- LLM05 (Improper Output Handling) — CRITICAL if exec/eval on LLM output
- LLM06 (Excessive Agency) — HIGH if agent with destructive tools
- LLM06b (Confused Deputy / Scope Creep) — HIGH if multi-user or agent has filesystem/DB access beyond user scope
- LLM02b (Sensitive Data Written by Security Tools) — HIGH if security tooling output is unmasked and unignored

### Phase 3 — Write Findings

Write `docs/security/LLM_FINDINGS_<date>.md` following `FINDING_SCHEMA.md`. Category: `owasp-llm`.

### Pre-Completion Gate

- [ ] Detection gate ran — either confirmed LLM code or skipped with note
- [ ] All 10 LLM categories assessed with confidence score
- [ ] Every finding cites file:line and shows the vulnerable code pattern
- [ ] LLM05 (Improper Output Handling) checked for eval/exec — always CRITICAL if found
- [ ] LLM01b checked — does any agent fetch external content and insert it into prompts without an untrusted-data boundary?
- [ ] LLM06b checked — is agent tool scope bounded to the current user's authorized data? Or can it access cross-user data?
- [ ] LLM02b checked — do security scanning tools write unmasked secret output to committed files?
- [ ] Output file written
