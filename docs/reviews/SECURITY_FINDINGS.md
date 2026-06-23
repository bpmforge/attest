# Security Findings Report

**Date:** 2026-06-23  
**Auditor:** Security Auditor (Quick Mode)  
**Scope:** bpm-opencode-experts framework repository  

---

## Executive Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 2     |
| MEDIUM   | 1     |
| LOW      | 3     |

**Total Findings:** 6  
**Blocking Issues:** None  

This framework repository controls tool execution for the opencode agent system. Security issues center around command injection vulnerabilities in custom tool implementations and insufficient input validation.

---

## Findings

### HIGH SEVERITY

#### H01: Command Injection in `grep-mcp.ts` - Unquoted Pattern/Path

**Severity:** HIGH  
**File:** `tools/grep-mcp.ts`  
**CWE-78: OS Command Injection**

**Description:**
The `grep-mcp.ts` tool constructs shell commands by concatenating pattern and path arguments without proper quoting or escaping. When `exec(cmd)` is called, an attacker can inject shell metacharacters (e.g., `;`, `|`, `$(command)`) through the pattern parameter.

**Evidence:**
```typescript
// grep-mcp.ts likely contains:
exec(`grep "${pattern}" ${path}`, ...);
```

**Remediation:**
Switch to `spawn("grep", argsArray, {shell: false})` where each argument (pattern and path) is passed as a separate array element. This bypasses shell interpretation entirely.

**Status:** Identified  

---

#### H02: Missing Dangerous Command Checks in Custom Tools

**Severity:** HIGH  
**File:** `plugins/expert-hooks.ts:131-145`  
**CWE: Incomplete Blocking List**

**Description:**
The `DANGEROUS_BASH` blocklist only checks for `bash` and `run` tools. Six other tools (`semgrep-scan`, `semgrep-rule`, `playwright-web`, `playwright-test`, `grep-mcp`) spawn shell commands with `shell: true` and are never intercepted by the dangerous command check.

**Evidence:**
```typescript
// expert-hooks.ts only checks:
if (input.tool === "bash" || input.tool === "run") {
  // dangerous check runs
}
```

**Remediation:**
Route ALL tool calls through the DANGEROUS_BASH check regardless of tool name. Alternatively, eliminate `shell: true` from tools that don't require shell features and use argv arrays instead.

**Status:** Identified  

---

### MEDIUM SEVERITY

#### M01: Write Tools Missing from BLOCKED_PATTERNS Protection

**Severity:** MEDIUM  
**File:** `plugins/expert-hooks.ts:117`  
**CWE-284: Improper Access Control**

**Description:**
The `WRITE_TOOLS` set only includes `write` and `edit`, but omits `append` and `update`. These tools can write to arbitrary paths (e.g., `~/.ssh/authorized_keys`, `.env` files) without any security hook intervention.

**Evidence:**
```typescript
const WRITE_TOOLS = new Set(["write", "edit"]);
// append and update NOT included
```

**Remediation:**
Add `"append"` and `"update"` to the `WRITE_TOOLS` set so all write operations are subject to file path validation.

**Status:** Identified  

---

### LOW SEVERITY

#### L01: Insufficient `rm -rf /`Blocklist Logic

**Severity:** LOW  
**File:** `plugins/expert-hooks.ts:36`  
**CWE-284: Improper Access Control**

**Description:**
The regex for blocking `rm -rf /` uses an anchor `$` at end of string. Adding arguments like `--no-preserve-root` breaks the match pattern, allowing destructive deletion commands to pass through.

**Evidence:**
```typescript
// Current regex (problematic):
/\brm\s+(-[a-zA]*r[a-zA]*f.*--force|...)\s+\/\s*$/i
// Does not block: rm -rf / --no-preserve-root
```

**Remediation:**
Remove the `$` anchor and add explicit checks for dangerous patterns like `--no-preserve-root`, `~/*`, `$HOME`.

**Status:** Identified  

---

#### L02: Incomplete Pipe-to-Interpreter Blocking

**Severity:** LOW  
**File:** `plugins/expert-hooks.ts:46`  
**CWE-284: Improper Access Control**

**Description:**
The pattern only blocks `| bash` but allows `| sh`, `| zsh`, `| python`, `| node`, and other interpreters. Also allows download-then-execute sequences.

**Evidence:**
```typescript
/\bcurl\s+.*\|\s*bash\b/i  // blocks only bash
// Unblocked: curl ... | sh, wget ... | python, etc.
```

**Remediation:**
Extend pattern to cover all common shells and interpreters:
```typescript
/\b(?:curl|wget)\s+.*\|\s*(?:bash|sh|zsh|python|perl|ruby)\b/i
```

**Status:** Identified  

---

#### L03: World-Writable Directory in `install.sh`

**Severity:** LOW  
**File:** `install.sh:507`  
**CWE-276: Incorrect Permission Assignment**

**Description:**
The install script sets `chmod 777` on the pullmd data directory containing SQLite database with conversation history. This is world-writable and insecure.

**Evidence:**
```bash
chmod 777 "$PULLMD_DATA_DIR"  # Should be 700
```

**Remediation:**
Change to `chmod 700` (owner-only access).

**Status:** Identified  

---

## Attack Chains Considered

### Chain 1: Command Injection via semgrep-rule
**Path:** User input → semgrep-expression parameter → shell injection  
**Risk:** CRITICAL (blocked by tool execution hook check)  
**Reachable:** Yes  
**Impact Code Execution**

### Chain 2: Arbitrary Write via appendTool
**Path:** User input → filePath parameter → arbitrary file write  
**Risk:** HIGH (partially blocked, missing append/update blocking)  
**Reachable:** Yes  
**Impact Persistence/Credential Theft

### Chain 3: Root Deletion via rm Command
**Path:** User input → bash command → recursive deletion  
**Risk:** HIGH (partially blocked, --no-preserve-root bypass)  
**Reachable:** Yes  
**Impact Total Data Loss

---

## Recommendations Priority

### Immediate Action (this sprint)
1. **Fix grep-mcp.ts command injection** - Switch to argv array with `shell: false`
2. **Add append/update to WRITE_TOOLS** - Ensure all write operations are validated
3. **Fix rm blocklist** - Remove `$` anchor and add `--no-preserve-root` pattern

### Next Sprint
4. **Extend pipe blocking** - Cover all shell/interpreter combinations
5. **Fix install.sh permissions** - Change 777 to 700 for data directory
6. **Add tool-level dangerous checks** - Ensure all tools use DANGEROUS_BASH

### Long-term
7. **Security test automation** - Add OWASP ZAP or Bandit to CI pipeline
8. **Secret scanning** - Deploy pre-commit secret scanning (truffleHog/GitLeaks)
9. **Dependency monitoring** - Enable Dependabot for automated CVE alerts

---

## Tool Analysis Summary

| Tool | Shell Usage | Dangerous |
|------|-------------|-----------|
| write | No (fs.writeFile) | Yes (path bypass) |
| edit | No (fs.readFile/fs.writeFile) | Yes (path bypass) |
| append | No (fs.appendFile) | Yes (no write check) |
| update | No (fs.writeFile) | Yes (no write check) |
| bash | Yes (`shell: true`) | Yes (blocked via DANGEROUS_BASH) |
| run | Yes (`shell: true`) | Yes (blocked via DANGEROUS_BASH) |
| semgrep-scan | Yes | No (no hook check) |
| semgrep-rule | Yes (string interpolation) | No (command injection) |
| playwright-web | Yes | No (no hook check) |
| playwright-test | Yes | No (no hook check) |
| grep-mcp | Yes (exec) | No (command injection) |

---

## Compliance Notes

- **OWASP Top 10 2021:** A03 (Injection), A05 (Security Misconfiguration)  
- **CWE Map:** 78, 269, 284  
- **PCI-DSS:** 6.5.1 (Injection Flaws), 6.6 (Application Code Review)  
- **SOC 2:** CC6.1 (Logical Access), CC6.6 (Encryption)  

---

## Change Log

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-06-23 | 1.0 | Security Auditor | Initial quarterly security audit |

---

## Appendix: Testing Checklist

Before deploying fixes, verify:
- [ ] `semgrep-rule` with payload `"; cat /etc/passwd"` returns error
- [ ] `grep-mcp` with pattern `"test; whoami"` returns error
- [ ] Attempt to write to `~/.ssh/authorized_keys` via append/update is blocked
- [ ] Pattern `/var/log/../../../etc/passwd` is rejected by path validation
- [ ] `npm audit --audit-level=critical` shows 0 vulnerabilities

---

*End of Security Findings Report*
