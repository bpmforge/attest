# Custom Tools for Local LLM + OpenCode

## Why These Exist

When using local LLMs via LM Studio (or Ollama), some built-in OpenCode tools behave
unreliably — file writes silently fail, shell commands time out inconsistently, and
grep output gets mangled. These custom tools replace or supplement the built-ins.

They auto-load from `~/.config/opencode/tools/` without any config changes needed.

---

## Tool Reference

### Core File Operations (LM Studio Fixes)

| Tool | Purpose | When to use |
|------|---------|-------------|
| `write.ts` | Atomic file write — fixes silent-fail bug in LM Studio | Anytime writing a file with local LLM |
| `append.ts` | Append to existing file with existence check | Adding content without overwriting |
| `update.ts` | Overwrite existing file (errors if missing) | Safer replacement for write when file must exist |
| `file-info.ts` | File metadata (size, lines, extension) without reading content | Before reading large files to avoid token waste |

### Shell & Process Execution

| Tool | Purpose |
|------|---------|
| `bash.ts` | Shell command with stdout/stderr capture and configurable timeout |
| `run.ts` | Alias for bash.ts — same functionality |

### Search & Analysis

| Tool | Purpose |
|------|---------|
| `grep-mcp.ts` | Enhanced grep: regex, case-insensitive, context lines, line numbers, recursive |
| `log-parser.ts` | Parse logs by level/date/pattern; generates error summary + hourly distribution |
| `semgrep-scan.ts` | Full Semgrep security scan with config selection and path filtering (120s timeout) |
| `semgrep-rule.ts` | Write and test individual Semgrep rules against code |

### Testing & Quality

| Tool | Purpose |
|------|---------|
| `test-runner.ts` | Run tests with auto-detected framework (npm/jest/vitest/mocha); captures pass/fail counts |
| `playwright-test.ts` | Run Playwright E2E tests with file/pattern filtering (180s timeout) |
| `playwright-web.ts` | Playwright browser automation with optional URL |

### Deployment

| Tool | Purpose |
|------|---------|
| `deploy.ts` | Build, push, and deploy Docker/Podman container images with env var injection |

### Loop Prevention (Critical for Local LLMs)

Local LLMs are more prone to getting stuck in retry loops (write → verify → fail → write again).
These tools break the cycle:

| Tool | Purpose |
|------|---------|
| `loop-detector.ts` | Track operation attempts; alert after 5+ consecutive identical ops |
| `simplify-file.ts` | Rewrite file with built-in rewrite detection to prevent simplify loops |

**Pre-operation hook** (`hooks/pre-operation.sh`) runs before every write/edit/grep and
automatically blocks the operation if a loop is detected for that file.

### Productivity

| Tool | Purpose |
|------|---------|
| `pomodoro.ts` | Focus timer — 25min work / 5min break intervals with state persistence |
| `task.ts` | Dispatch sub-agent tasks to 12 agent types with timeout protection |

---

## Usage Examples

```typescript
// Write a file (use this instead of built-in write with local LLMs)
write --filePath /path/to/file.ts --content "your content"

// Get file metadata before deciding to read it
file-info --path /large/data.csv
// → 1.2GB, 50000 lines, csv extension

// Enhanced grep with regex and context
grep-mcp --pattern "function.*test" --path ./src --flags "-i -n -C 2"

// Run tests and get a summary
test-runner --command "npm test"
// → 42 passed, 1 failed, 2 skipped

// Check + reset loop detector
loop-detector --action status
loop-detector --action reset

// Deploy container
deploy --type docker --path ./docker --image myapp:latest

// Parse logs for errors
log-parser --path /var/log/app.log --tail 200 --filter "ERROR"
```

---

## Loop Detection Details

The loop detector tracks consecutive identical operations (same tool + same file).

- **Threshold:** 5+ attempts triggers alert
- **State file:** `.opencode-loops/state.json` in your project directory (gitignored)
- **Auto-block:** `hooks/pre-operation.sh` blocks write/edit/grep before they execute
- **Reset:** `loop-detector --action reset`

---

## LM Studio Provider Config

Add this to your `opencode.json` to use LM Studio models:

```json
{
  "provider": {
    "lmstudio": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LM Studio (local)",
      "options": {
        "baseURL": "http://127.0.0.1:1234/v1",
        "apiKey": "lm-studio"
      },
      "models": {
        "qwen/qwen3-coder-next": { "name": "Qwen3 Coder (recommended for code)" },
        "google/gemma-3-27b":    { "name": "Gemma 3 27B (general)" }
      }
    }
  }
}
```

Replace model IDs with whatever models you have loaded in LM Studio.
The `apiKey` value is ignored by LM Studio but required by the OpenAI-compatible spec.

---

## Troubleshooting

**Tools not appearing in the tool list:**
1. Restart OpenCode
2. Verify files exist: `ls ~/.config/opencode/tools/`
3. Check for TypeScript errors: `cd ~/.config/opencode && npx tsc --noEmit`

**Write tool silently failing:**
- Use the custom `write` tool, not the built-in one
- Check that the directory exists before writing

**Loop hook blocking operations unexpectedly:**
- Run `loop-detector --action reset` to clear the counter
- Or delete `.opencode-loops/state.json` manually
