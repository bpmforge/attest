[🏠 Index](README.md)  |  [← Performance Findings](12-performance.md)  |  [Appendices →](A-appendices.md)

---

# 13. Improvement Recommendations

### Priority 0 — Regressions (fix immediately — existing features are broken)

| ID | File | Fix | Effort |
|----|------|-----|--------|
| R-1 | `plugins/expert-hooks.ts:133` | Change `output.args?.command` → `input.args?.command` — dangerous command blocking never fires | 1 line |
| R-2 | `tools/pomodoro.ts` | Replace all `Deno.*` calls with `fs/promises` equivalents — tool crashes on every invocation | 30 min |
| R-3 | `tools/simplify-file.ts` | Add `import { spawn } from "child_process"` — tool crashes on every invocation | 1 line |

### Priority 1 — Critical Security (fix before exposing to untrusted content)

| ID | Action | Impact |
|----|--------|--------|
| S-1 | Extend `tool.execute.before` to check ALL tools, not just `bash`/`run` | Closes 6 shell-exec bypass routes |
| S-2 | Add `"append"` and `"update"` to `WRITE_TOOLS` | `.env`/credential protection now covers all write paths |
| S-3 | Broaden rm regex: drop `$` anchor, add `~/` and `$HOME` patterns | Blocks `rm -rf / --no-preserve-root` and home-dir wipes |
| S-4 | Extend pipe-to-interpreter pattern to cover `sh`, `python`, `node`, `perl` | Blocks non-bash interpreter injection |
| S-5 | Rewrite `semgrep-rule.ts` and `grep-mcp.ts` to use argv arrays with `shell: false` | Eliminates injection in most critical tools |

### Priority 2 — Performance (high user-visible impact)

| ID | Action | Impact |
|----|--------|--------|
| P-1 | Drop `await` from `tool.execute.after` — make fire-and-forget | Removes 800ms–3s block on every write |
| P-2 | Add 5s timeout to each hook check via `Promise.race` | Prevents infinite hangs on stuck linters |
| P-3 | Replace `cat` subprocess in `secretScan` with `fs.readFile` + file-size guard | ~30-50ms savings per write; prevents OOM |
| P-4 | Fix `validate-phase-gate.sh` to run each sub-validator once | 2× validator speed |
| P-5 | Fix `validate-code-health.sh` to call `find_source_files` once | 9× find reduction |

### Priority 3 — Code Health (1-4 hours each)

| ID | Action | Impact |
|----|--------|--------|
| C-1 | Fix `grep-mcp.ts` recursion flags: `recursive:true` → push `-r`; false → push nothing | Correct grep semantics |
| C-2 | Fix `log-parser.ts` enum: `"_trace"` → `"trace"`, add `"all"` | Correct filter behavior |
| C-3 | Add ESM imports to `semgrep-scan.ts`, `semgrep-rule.ts`, `playwright-test.ts`, `test-runner.ts` | Fix CJS/ESM inconsistency |
| C-4 | Fix `loop-detector.ts` mkdir race — await inside `saveLoopState` | Prevents first-write data loss |
| C-5 | Extract shared spawn logic from `bash.ts` + `run.ts` into shared helper | Eliminates duplication |
| C-6 | Add `tsconfig.json` to project root | Proper TypeScript tooling for contributors |
| C-7 | Add max-output-bytes guard to `bash.ts`, `run.ts`, `task.ts` | Prevents OOM from runaway output |

### Priority 4 — Security Hardening (days)

| ID | Action | Impact |
|----|--------|--------|
| SH-1 | Add path containment check to all file-touching tools | Prevents arbitrary filesystem r/w |
| SH-2 | Add modern token patterns (GitHub PAT, OpenAI, Stripe, Slack, JWT) to `SECRET_PATTERNS` | Better secret coverage |
| SH-3 | Move PEM/AKIA patterns to `tool.execute.before` with blocking (not just warn) | Pre-write secret interception |
| SH-4 | Pin semgrep community rule repos to commit hashes in `install.sh` | Supply chain hardening |
| SH-5 | Fix `chmod 777` on pullmd data directory → `chmod 700` | Multi-user security |
| SH-6 | Write integration tests for blocklist patterns (including bypass attempts) | Regression-free maintenance |

---

---

[🏠 Index](README.md)  |  [← Performance Findings](12-performance.md)  |  [Appendices →](A-appendices.md)
