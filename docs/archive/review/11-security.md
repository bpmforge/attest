[🏠 Index](README.md)  |  [← Code Health Findings](10-code-health.md)  |  [Performance Findings →](12-performance.md)

---

# 11. Security Findings

*Based on automated security audit across plugin, tools, and install scripts.*

### CRITICAL

**S-CRIT-1: `tool.execute.before` only checks `bash` and `run` — 6 other shell-exec tools bypass all blocklist checks (OWASP A01, A03)**

`plugins/expert-hooks.ts:131-134` — The dangerous command check fires only when `input.tool === "bash" || input.tool === "run"`. Six other tools spawn shell commands with `shell: true` and are never intercepted:

| Tool | Shell command construction | Injection vector |
|------|--------------------------|-----------------|
| `semgrep-scan.ts` | `cmd = command + config + paths.join(" ")` | Any of `command`, `config`, `paths` |
| `semgrep-rule.ts` | String interpolation: `semgrep -e "${expression}"` | Close quote, inject second command |
| `playwright-web.ts` | `playwright-cli ${args.command.trim()}` | Any shell metachar in command |
| `playwright-test.ts` | `spawn(cmd + " " + paths, {shell:true})` | Both user-controlled |
| `grep-mcp.ts` | `grep ... <pattern> <path>` via `exec(cmd)` | Pattern with `$(cmd)` or metachar path |

Example: calling `semgrep-rule` with an expression payload that closes the double-quote and appends an injected command executes arbitrary shell code.

- **Fix:** Route ALL tool calls through DANGEROUS_BASH check regardless of tool name, or better: eliminate `shell: true` from all tools except `bash`/`run`.

**S-CRIT-2: `append.ts` and `update.ts` are not in `WRITE_TOOLS` — `.env`/credential file protection is bypassable (OWASP A01)**

`plugins/expert-hooks.ts:117` — `WRITE_TOOLS = new Set(["write", "edit"])`. The `append` and `update` tools write arbitrary file paths via `fs.appendFile`/`fs.writeFile` with no path check. An LLM can append to `~/.ssh/authorized_keys`, `~/.bashrc`, or any `.env` file using these tools with no hook intervention. `bash`/`run` with redirect operators also bypass the file pattern check entirely.

- **Fix:** Add `"append"` and `"update"` to `WRITE_TOOLS`. Add redirect-operator detection to the bash/run command check.

### HIGH

**S-H01: `rm -rf / --no-preserve-root` passes the rm regex (OWASP A05)**

`plugins/expert-hooks.ts:26` — The regex anchor is `\/\s*$` (end of string). Adding any trailing argument — the most destructive form being `--no-preserve-root` — breaks the anchor match. GNU `rm` requires `--no-preserve-root` to actually wipe `/`; the blocklist blocks the harmless form and permits the destructive one. Also unblocked: `rm -rf /*`, `rm -rf ~`, `rm -rf $HOME`.

- **Fix:** Drop the `$` anchor; add `~/` and `$HOME` as dangerous target patterns.

**S-H02: Only `| bash` is blocked — `| sh`, `| python`, `| node` are not (OWASP A05)**

`plugins/expert-hooks.ts:46` — Pattern only matches `| bash`. Unblocked: pipe to `sh`, `zsh`, `python3`, `node`, `perl`. Also unblocked: download-then-execute sequences (download script to `/tmp` then execute separately).

- **Fix:** Extend the pipe-to-interpreter pattern to cover all common shells and interpreters.

**S-H03: No path containment in write/append/update/grep tools (OWASP A01)**

`tools/write.ts`, `tools/append.ts`, `tools/update.ts`, `tools/grep-mcp.ts` — all accept absolute paths with no restriction to the project sandbox. `grep-mcp` can read any filesystem path. `write.ts`/`append.ts` can write to SSH authorized_keys for persistence.

- **Fix:** Validate that `filePath` is within `context.directory` using `path.resolve()` and prefix check.

**S-H04: Command injection in `semgrep-rule.ts` via unquoted expression interpolation (OWASP A03)**

`tools/semgrep-rule.ts` — The Semgrep expression argument is interpolated directly into a shell string. A crafted expression value can close the quote boundary and inject a second shell command.

- **Fix:** Use argv array with `shell: false`: `spawn("semgrep", ["-e", args.expression, "--lang", args.language, ...paths])`.

### MEDIUM

**S-M01: Secret scanner is post-write, advisory-only, misses modern token formats (OWASP A09)**

`plugins/expert-hooks.ts` — `secretScan` runs after the file is already written (`.after` hook), emits `console.warn` only (no blocking), and misses: GitHub PATs (`ghp_`, `gho_`, `ghs_`), OpenAI keys (`sk-` 51-char), Stripe keys (`sk_live_`, `sk_test_`), Slack tokens (`xoxb-`, `xoxp-`), GCP service accounts, JWT tokens (`eyJ` prefix), bare env assignments without surrounding quotes.

- **Fix:** Move critical patterns (PEM keys, AWS AKIA) to `tool.execute.before` with blocking. Expand patterns for modern token formats.

**S-M02: Repo-local eslint/tsc/prettier execute `eslint.config.js` from malicious cloned repos (OWASP A05)**

`tool.execute.after` auto-invokes `eslint`, `tsc`, and `prettier` using project-local configs. A malicious repo's `eslint.config.js` can `require()` arbitrary Node modules. Writing any file in a malicious cloned project triggers code execution via the post-write toolchain.

**S-M03: `grep-mcp.ts` unquoted pattern/path in `exec(cmd)` (OWASP A03)**

`tools/grep-mcp.ts` — pattern and path are appended with `.join(" ")` and passed to `exec()` (shell-interpreted). A pattern containing shell command substitution executes arbitrary code.

- **Fix:** Switch to `spawn("grep", argsArray, {shell: false})` with each element as a separate argv entry.

### LOW / INFO

**S-L01: `chmod 777` on pullmd data directory in install.sh (OWASP A05)**

`install.sh:~507` — World-writable data directory for SQLite containing conversation history. Should be `chmod 700`.

**S-L02: Semgrep community rule repos not pinned to commit hashes (OWASP A08)**

`install.sh` clones external repos at HEAD with no commit pin. `update-semgrep-rules.sh --bump` provides opt-in pinning but is not enforced at install time.

**S-L03: LaunchAgent/systemd unit installed without confirmation prompt (OWASP A05)**

The `--pullmd` flag installs a macOS LaunchAgent or systemd service without a `[Y/n]` prompt before creating the persistence mechanism.

**S-L04: Log injection via ANSI escape sequences in console.warn (OWASP A09)**

`lintFile` and `typeCheckFile` write up to 2000 characters of raw tool stdout to `console.warn` without stripping ANSI escape codes.

---

---

[🏠 Index](README.md)  |  [← Code Health Findings](10-code-health.md)  |  [Performance Findings →](12-performance.md)
