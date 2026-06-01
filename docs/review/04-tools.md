[🏠 Index](README.md)  |  [← Plugin Hook System](03-plugin-hooks.md)  |  [Agent System →](05-agents.md)

---

# 4. Tool System

### 4.1 Tool Catalog

| Tool | File | Lines | Purpose |
|------|------|-------|---------|
| `bash` | `bash.ts` | 67 | Execute arbitrary shell commands with timeout |
| `run` | `run.ts` | 65 | Alias of bash — execute shell commands |
| `semgrep-scan` | `semgrep-scan.ts` | 65 | Run Semgrep security scans on codebase |
| `task` | `task.ts` | 238 | Delegate to specialist agents via `opencode run --agent` |
| `loop-detector` | `loop-detector.ts` | 176 | Detect and break infinite loops in agent behavior |
| `log-parser` | `log-parser.ts` | 183 | Parse and structure log output from tools |
| `playwright-web` | `playwright-web.ts` | 106 | Browser automation for web research |
| `playwright-test` | `playwright-test.ts` | 63 | Run Playwright E2E tests |
| `deploy` | `deploy.ts` | 102 | Execute deployment operations |
| `grep-mcp` | `grep-mcp.ts` | 115 | Search file contents with regex |
| `pomodoro` | `pomodoro.ts` | 168 | Time-box tasks with Pomodoro timer |
| `write` | `write.ts` | 22 | Write content to a file |
| `append` | `append.ts` | 30 | Append content to a file |
| `update` | `update.ts` | 22 | Update/replace file content |
| `file-info` | `file-info.ts` | 42 | Get file metadata |
| `simplify-file` | `simplify-file.ts` | 81 | Simplify/compress a file's content |
| `semgrep-rule` | `semgrep-rule.ts` | 67 | Create custom Semgrep rules |
| `test-runner` | `test-runner.ts` | 183 | Run test suites and parse results |

### 4.2 Shell Command Execution Flow

Both `bash.ts` and `run.ts` follow the same pattern:

```mermaid
sequenceDiagram
    participant LLM as LLM
    participant BT as bash.ts / run.ts
    participant Guard as Expert Hook (before)
    participant OS as OS Process

    LLM->>Guard: bash({command: "ls -la", workdir?, timeout?})
    Guard->>Guard: Check DANGEROUS_BASH patterns
    
    alt command is safe
        Guard->>BT: execute(args, context)
        BT->>BT: Validate args.command present
        
        alt args.command missing
            BT-->>LLM: "[LOOP STOP] bash called without command..."
        end
        
        BT->>OS: spawn(command, {cwd, shell:true})
        
        par stdout collection
            OS-->>BT: data chunks -> output string
        and stderr collection
            OS-->>BT: stderr chunks -> errorOutput
        and timeout
            BT->>BT: setTimeout(timeout*1000)
        end
        
        alt process completes (exit 0)
            BT-->>LLM: output string
        else non-zero exit
            BT-->>LLM: Error("exit code N: stderr")
        else timeout
            BT->>OS: proc.kill("SIGTERM")
            BT-->>LLM: Error("timed out after Ns")
        end
    else command blocked
        Guard-->>LLM: Error("BLOCKED: reason")
    end
```

### 4.3 Task Delegation Flow (task.ts)

The `task.ts` tool spawns a sub-agent by running `opencode run --agent <type>`.

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead (LLM)
    participant TT as task.ts
    participant OC as opencode subprocess
    participant SA as Specialist Agent

    LEAD->>TT: task({agent, prompt, timeout})
    TT->>TT: context.metadata({title: "task: agent — starting..."})
    TT->>OC: spawn("opencode run --agent agent --format json prompt")
    
    loop Every 5 seconds (heartbeat)
        TT->>TT: update metadata title with elapsed time + last snippet
    end
    
    loop stdout data events
        OC-->>TT: JSON event lines
        TT->>TT: processLine() — parse assistant messages
        TT->>TT: extract lastSnippet for real-time progress
    end
    
    OC->>SA: Load agent prompt file from ~/.config/opencode/agents/
    SA->>SA: Execute multi-phase workflow
    SA-->>OC: JSON event stream (messages, tool calls, results)
    OC-->>TT: exit 0 or non-zero
    
    alt exit 0
        TT->>TT: extractText(raw) — parse assistant content from JSON stream
        TT-->>LEAD: Plain text summary of findings
    else timeout
        TT->>OC: proc.kill("SIGTERM")
        TT-->>LEAD: "[task: TIMEOUT] Partial output: ..."
    else spawn error
        TT-->>LEAD: "[task: spawn error] Could not start opencode: ..."
    end
```

> **Note:** `task.ts` is available as a tool, but the SDLC lead's prompt explicitly instructs it NOT to use `task()` because it was found to timeout in production for multi-phase agents. Delegation instead uses HANDOFF blocks — see Section 7.

---

---

[🏠 Index](README.md)  |  [← Plugin Hook System](03-plugin-hooks.md)  |  [Agent System →](05-agents.md)
