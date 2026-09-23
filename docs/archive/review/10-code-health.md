[🏠 Index](README.md)  |  [← Installation Flow](09-installation.md)  |  [Security Findings →](11-security.md)

---

# 10. Code Health Findings

*The following findings are based on automated code health review of all tools, plugin, and scripts.*

### CRITICAL

**C-001: expert-hooks.ts `before` hook reads `output.args` instead of `input.args` — dangerous command blocking never fires**

`plugins/expert-hooks.ts:132-133`:

```typescript
"tool.execute.before": async (input, output) => {
  const command: string = output.args?.command ?? "";
```

The hook signature is `(input, output)`. For `.before`, `output` is the pending result (not yet available). The tool arguments are on `input.args`, not `output.args`. This means `output.args?.command` is always `undefined`, the `?? ""` fallback always wins, and **no bash command is ever checked against DANGEROUS_BASH**. The `.after` hook correctly reads `input.args` (lines 163-164). The security blocklist is completely inoperative.

- **Fix:** Change line 133 to `const command: string = input.args?.command ?? "";`

**C-002: pomodoro.ts uses Deno API in a Node.js runtime — tool is completely broken**

`tools/pomodoro.ts:120,136,146,149` — All state persistence functions call `Deno.readTextFile`, `Deno.writeTextFile`, `Deno.statSync`, `Deno.mkdirSync`. OpenCode runs on Node.js, not Deno. Every invocation of `start`, `stop`, `status`, or `reset` throws `ReferenceError: Deno is not defined`.

- **Fix:** Replace `Deno.*` calls with `fs/promises` (same pattern as `loop-detector.ts`).

**C-003: simplify-file.ts calls `spawn` without importing it — ReferenceError at runtime**

`tools/simplify-file.ts:48-63` — `attemptSimplification` calls `spawn()` but the file only imports `{ tool }` and `fs from "fs/promises"`. Any call throws `ReferenceError: spawn is not defined`.

- **Fix:** Add `import { spawn } from "child_process"` at top.

**C-004: simplify-file.ts description is wrong — `instructions` arg is completely ignored**

The description says the tool simplifies code per `instructions`. The actual implementation ignores `instructions` entirely and runs `sed -i s/  / /g` (whitespace collapse only). The tool description is misleading to the LLM calling it.

### HIGH

**H-001: bash.ts and run.ts are near-identical duplicates**

`tools/bash.ts` (67 lines) and `tools/run.ts` (65 lines) implement the same subprocess execution logic with identical `spawn` patterns, `stdout/stderr` collection, timeout handling, and error reporting. The only difference is the tool description string and the loop-stop return message text.

- `bash.ts:28-65` and `run.ts:28-64` — identical logic
- **Risk:** Bug fixes applied to one tool are not applied to the other. Already diverged in error message phrasing.
- **Fix:** Extract shared spawn logic into `tools/_lib/spawn.ts`, import from both tools.

**H-002: grep-mcp.ts uses `-L` flag incorrectly — wrong semantics for recursive/non-recursive**

`tools/grep-mcp.ts:80-83` — When `recursive: false`, the code pushes `-L` (print files NOT matching) instead of simply omitting `-r`. When `recursive: true`, no `-r` flag is added, so `grep` doesn't recurse into directories. Both cases are wrong.

- **Fix:** When `recursive:true`, push `-r`; when `recursive:false`, push nothing.

**H-003: log-parser.ts filter enum inconsistencies**

`tools/log-parser.ts:10-11` — The filter enum is `["_trace", "debug", "info", "warn", "error", "fatal"]` with `.default("all")`. Two bugs: (1) `"all"` is not in the enum, causing schema validation issues; (2) `"_trace"` has a stray leading underscore — `parseLogLine` produces `"trace"` (no underscore), so the filter never matches.

- **Fix:** Change `"_trace"` to `"trace"`; add `"all"` to the enum or change default to `"info"`.

**H-004: `require()` inside ESM execute functions — 4 tools affected**

`tools/semgrep-scan.ts:28`, `tools/semgrep-rule.ts:28`, `tools/playwright-test.ts:24`, `tools/test-runner.ts:65,68` all use `require()` inside execute functions in a package declared `"type": "module"`. This is non-standard and fragile.

- **Fix:** Move all `require()` calls to top-level ESM `import` statements.

**H-005: deploy.ts has a dead ternary that always selects "docker"**

`tools/deploy.ts:23` — `const toolName = process.platform === "darwin" ? "docker" : "docker"` — both branches are identical. The description says "Docker or Podman" but Podman is never selected.

**H-006: validate-tools.js only checks for string presence, not actual syntax or exports**

`scripts/validate-tools.js` validates tool files by checking if the string `"@opencode-ai/plugin"` and `"export default tool("` exist in the file. It doesn't parse the TypeScript or verify the tool actually exports a valid schema. Tools `pomodoro.ts` and `simplify-file.ts` (both broken at runtime) pass this validation.

- **Fix:** Add TypeScript syntax parsing or at minimum exclude commented-out exports.

### MEDIUM

**M-001: Implicit `any` type for `$` parameter in expert-hooks.ts**

`plugins/expert-hooks.ts:181` — `async function formatFile(filePath: string, ext: string, $: any)` — the `$` shell runner is typed as `any`, defeating TypeScript checking for all hook utilities.

- **Fix:** Import and use the correct type from `@opencode-ai/plugin`.

**M-002: task.ts default timeout (180s) too short for multi-phase agents**

`tools/task.ts:55` — 180s default is too short for security auditor, code reviewer, and other multi-phase agents that need 600-900s.

**M-003: loop-detector.ts mkdir race condition**

`tools/loop-detector.ts:131` — `void fs.mkdir(loopDir, { recursive: true })` fires without awaiting. If `saveLoopState` runs before the directory exists, `writeFile` throws `ENOENT`. State is silently lost on first write in a new directory.

- **Fix:** Await mkdir inside `saveLoopState`, or make `getLoopStateFilePath` async.

**M-004: task.ts always resolves on non-zero exit — errors invisible to caller**

`tools/task.ts:171-187` — Subprocess exits with code ≠ 0 produce `resolve()` not `reject()`, with an `[task: exit N]` string prefix. The calling LLM has no reliable error signal. Inconsistent with `bash.ts`/`run.ts` which reject on failure.

**M-005: test-runner.ts always resolves — test failures invisible to callers**

`tools/test-runner.ts:16-61` — Regardless of exit code, the tool resolves. Test failures are only detectable by parsing the embedded `Exit Code: N` string. Inconsistent with `playwright-test.ts` which rejects on failure.

**M-006: agents/templates/ and agents/shared/ not validated**

`scripts/validate-tools.js` validates only `agents/*.md` (top-level). Files in `agents/templates/`, `agents/shared/`, `agents/security/`, `agents/code-review/`, `agents/performance/` are not checked.

**M-007: pomodoro.ts `status` uses `args.duration` not stored `durationMinutes`**

`tools/pomodoro.ts:35,40-41` — Status calculation uses the current call's `args.duration` argument. If a different duration is passed to `status` than was used at `start`, progress percentage is wrong.

### LOW

**L-001: SKIP_EXTENSIONS missing common binary types**

`expert-hooks.ts:93` — Misses `.db`, `.sqlite`, `.bin`, `.exe`, `.jar`, `.class`, `.wasm`, `.mp4`, `.mp3`, `.pdf`.

**L-002: secretScan reads file via `cat` subprocess instead of `fs.readFile`**

`expert-hooks.ts:248` — Spawning `cat` adds ~5-15ms per write vs `fs.promises.readFile` (~0.1ms).

**L-003: No `tsconfig.json` in project root**

No TypeScript config for the project's own tools. Editor type-checking and `tsc` runs are ad hoc.

**L-004: `file_path` defensive lookup in expert-hooks.ts is dead code**

`expert-hooks.ts:146` — `output.args?.filePath ?? output.args?.file_path` — no tool in the project uses `file_path` (snake_case). The defensive lookup is unnecessary.

**L-005: semgrep-scan.ts path concatenation breaks on paths with spaces**

`tools/semgrep-scan.ts:13-25` — Command built via string concatenation with `shell: true`. Paths containing spaces (e.g., `/my project/src`) cause shell word-splitting failures.

**L-006: log-parser.ts `errorCount()` sort key is always 0**

`tools/log-parser.ts:191-194` — `generateSummary` sorts `errorMessages` by `errorCount()` which returns 0 for any message not matching `(\d+)\s+(errors?|failures?)/i`. Individual error log lines never match, so all sort keys are 0 — output is unordered.

**L-007: validate-tools.js dead filter guard**

`scripts/validate-tools.js:12` — `f !== "CUSTOM_TOOLS_GUIDE.md"` is dead code — the `.endsWith(".ts")` filter already excludes `.md` files.

---

---

[🏠 Index](README.md)  |  [← Installation Flow](09-installation.md)  |  [Security Findings →](11-security.md)
