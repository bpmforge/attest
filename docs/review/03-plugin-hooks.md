[🏠 Index](README.md)  |  [← Component Architecture](02-architecture.md)  |  [Tool System →](04-tools.md)

---

# 3. Plugin Hook System

The `plugins/expert-hooks.ts` file is the runtime safety net. It intercepts every tool call OpenCode makes, before and after execution.

### 3.1 Before-Execution Hook

Runs before every `bash`, `run`, `write`, or `edit` tool call.

```mermaid
sequenceDiagram
    participant LLM as LLM (any model)
    participant OC as OpenCode Runtime
    participant HB as expert-hooks.ts<br/>tool.execute.before
    participant T as Tool (bash/run/write/edit)

    LLM->>OC: Call tool(name, args)
    OC->>HB: before(input, output)
    
    alt tool is "bash" or "run"
        HB->>HB: Check DANGEROUS_BASH patterns<br/>(8 regex rules)
        alt pattern matches
            HB-->>OC: throw Error("BLOCKED: ...")
            OC-->>LLM: Tool error — blocked
        end
    end
    
    alt tool is "write" or "edit"
        HB->>HB: Extract filePath from args
        HB->>HB: Check BLOCKED_FILE_PATTERNS<br/>(.env, .key, .pem, credentials.json, SSH keys)
        alt pattern matches
            HB-->>OC: throw Error("BLOCKED: ...")
            OC-->>LLM: Tool error — blocked
        end
    end
    
    HB-->>OC: (no throw = pass through)
    OC->>T: Execute tool(args)
    T-->>OC: result
    OC-->>LLM: tool result
```

### 3.2 After-Execution Hook (Write/Edit quality checks)

Runs after every `write` or `edit` call completes, in parallel.

```mermaid
sequenceDiagram
    participant OC as OpenCode Runtime
    participant HA as expert-hooks.ts<br/>tool.execute.after
    participant FMT as Formatter<br/>(prettier/black/gofmt/rustfmt)
    participant LINT as Linter<br/>(eslint/ruff)
    participant TSC as Type Checker<br/>(tsc --noEmit)
    participant SS as Secret Scanner<br/>(8 regex patterns)

    OC->>HA: after(input, _output)
    HA->>HA: Check: is write/edit tool?
    HA->>HA: Extract filePath
    HA->>HA: Check SKIP_EXTENSIONS<br/>(images, binaries, lock files)
    
    alt extension not skipped
        HA->>HA: Promise.allSettled([...])
        
        par Format
            HA->>FMT: format(filePath, ext)
            Note over FMT: Best-effort, failure = console.warn
        and Lint
            HA->>LINT: lint(filePath, ext)
            Note over LINT: eslint for TS/JS, ruff for Python
        and Type Check
            HA->>TSC: tsc --noEmit (TS/TSX only)
        and Secret Scan
            HA->>SS: cat filePath -> test 8 patterns
            Note over SS: AWS keys, API keys, passwords,<br/>bearer tokens, DB connection strings,<br/>PEM keys, auth tokens
        end
        
        Note over HA: All run concurrently,<br/>failures logged, never blocking
    end
    
    HA-->>OC: (hook complete)
```

### 3.3 Blocklist Reference

**Dangerous Bash Commands:**

| Pattern | Blocks |
|---------|--------|
| `rm -rf /` variants | Filesystem wipe |
| `DROP TABLE` | Database destruction |
| `DELETE FROM` without `WHERE` | Mass row deletion |
| `git push --force` | Remote history rewrite |
| `git reset --hard` | Uncommitted work loss |
| `npm publish` | Unintended registry publish |
| `curl/wget \| bash` | Remote code execution |

**Blocked File Paths:**

| Pattern | Blocks |
|---------|--------|
| `.env`, `.env.*` | Environment secrets |
| `credentials.json`, `secrets.json` | Credential files |
| `*.key`, `*.pem`, `*.p12`, `*.pfx` | Private keys |
| `id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa` | SSH private keys |

**Secret Patterns Detected:**

| Pattern | Detects |
|---------|---------|
| `api[_-]?key\s*[:=]\s*["'][A-Za-z0-9_-]{16,}` | API keys |
| `AKIA[0-9A-Z]{16}` | AWS Access Key IDs |
| `aws[_-]?secret[_-]?access[_-]?key` | AWS Secret Access Keys |
| `-----BEGIN ... PRIVATE KEY-----` | PEM private keys |
| `password\s*[:=]\s*["'][^"']{4,}` | Hardcoded passwords |
| `bearer\|token\s*[:=]\s*["'][A-Za-z0-9_-.]{20,}` | Bearer/auth tokens |
| `postgres://user:pass@host` | DB connection strings |
| `SECRET\|TOKEN\|PRIVATE_KEY\s*=\s*["'][A-Za-z0-9]{16,}` | Generic secrets |

---

---

[🏠 Index](README.md)  |  [← Component Architecture](02-architecture.md)  |  [Tool System →](04-tools.md)
